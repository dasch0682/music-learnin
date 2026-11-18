// Runs the game tests (tools/<slug>.test.mjs) against a dev server, in parallel, and prints a short summary.
//   PORT=5220 node tools/test-all.mjs [options]   (starts a dev server on PORT if none answers)
// Options:  --fast          fast mode (FAST=1: first/middle/last level, few rounds, accelerated timers)
//           --jobs N        tests run at the same time (default: the number of CPUs, at least 2; at least 4 with --fast)
//           --only a,b      only these slugs            --changed   only the tests concerned by the git diff (see tools/README.md)
//           --retry N       rerun a failing test up to N times; if it then passes it is reported as flaky
//           --repeat N      run each selected test N times and report the pass count per test (measures flakiness; implies --verbose-free compact output)
//           --verbose       one line per test          --no-share  one Chrome per test instead of one shared Chrome
// Full logs: tools/.logs/<slug>.log. Output by default: one summary line + the last 15 lines of each failure.
import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync, createWriteStream } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { cpus } from 'node:os';
import { chromium } from 'playwright-core';
import { CHROME, ARGS } from './lib/harness.mjs';

const dir = new URL('.', import.meta.url).pathname;
const root = new URL('..', import.meta.url).pathname;
const logs = dir + '.logs/';
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const fast = flag('fast'), verbose = flag('verbose');
// Most of a test is waiting (audio, real-time taps), so more tests than CPUs run at once (fast: at least 4; full: at least 2).
const jobs = Math.max(1, Number(opt('jobs', Math.max(fast ? 4 : 2, cpus().length))));
// Fast-mode budget (see tools/README.md): the whole suite within 300 s on 2 CPUs, a single test within 30 s.
// Tests on real timers (taps, microphone fed in real time) are paced by the clock, so they get twice the per-test budget.
const BUDGET_TOTAL = 300, BUDGET_TEST = 30;
const retry = Number(opt('retry', 0));
const repeat = Math.max(1, Number(opt('repeat', 1)) || 1);
const port = process.env.PORT || '5220';
const all = readdirSync(dir).filter((x) => x.endsWith('.test.mjs')).map((f) => f.replace('.test.mjs', '')).sort();

function changedSlugs() {
  const sh = (c) => { try { return execSync(c, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); } catch { return []; } };
  const base = sh('git rev-parse --verify -q origin/main').length ? 'origin/main' : 'HEAD';
  const files = new Set(process.env.CHANGED_FILES ? process.env.CHANGED_FILES.split(',') : [...sh(`git diff --name-only ${base}`), ...sh('git ls-files --others --exclude-standard')]); // CHANGED_FILES=a,b: for trying the mapping
  const out = new Set();
  for (const f of files) {
    let m;
    if (/^packages\/core\//.test(f) || /^vite\.config\./.test(f) || /^tools\/(lib\/|test-all\.mjs)/.test(f) || f === 'package.json') return all;
    else if ((m = /^apps\/([^/]+)\//.exec(f)) && all.includes(m[1])) out.add(m[1]);
    else if ((m = /^tools\/([^/]+)\.test\.mjs$/.exec(f)) && all.includes(m[1])) out.add(m[1]);
    else if (/^apps\/[^/]+$/.test(f) || /^public\//.test(f)) out.add('platform'); // home page and shared assets
  }
  return [...out].filter((s) => all.includes(s)).sort();
}

let list = all;
if (opt('only')) {
  list = opt('only').split(',').map((s) => s.trim().replace(/\.test\.mjs$/, '')).filter(Boolean);
  const bad = list.filter((s) => !all.includes(s));
  if (bad.length) { console.log('unknown test(s): ' + bad.join(', ') + '. Known: ' + all.join(' ')); process.exit(2); }
}
if (flag('changed')) { const c = changedSlugs(); list = list.filter((s) => c.includes(s)); }
const label = fast ? 'fast' : 'full';
// Tests on real timers (launch({ speed: 1 }): taps against the clock, microphone fed in real time) are the ones that fail when the CPUs are
// busy, so at most half the CPUs run them at the same time (the other jobs are the tests that mostly wait on accelerated timers).
const realtime = new Set(all.filter((s) => { try { return /speed:\s*1\b/.test(readFileSync(dir + s + '.test.mjs', 'utf8')); } catch { return false; } }));
// Fast mode runs them as many as CPUs (they mostly sleep and are short); full mode half as many.
const rtMax = Math.max(1, Number(opt('rt', Math.floor(cpus().length / (fast ? 1 : 2)))));
if (!list.length) { console.log(`${label}: no test concerned`); process.exit(0); }

mkdirSync(logs, { recursive: true });
let times = {};
try { times = JSON.parse(readFileSync(logs + 'times.json', 'utf8')); } catch {}
list = [...list].sort((a, b) => (times[`${label}:${b}`] || 60) - (times[`${label}:${a}`] || 60)); // longest first: best packing

// No dev server on PORT: start one for the run (and stop it at the end).
let vite = null;
const up = () => fetch(`http://localhost:${port}/`).then((r) => r.ok, () => false);
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) { console.log(`cannot start a dev server on port ${port}`); vite.kill(); process.exit(2); }
}
let server = null;
if (!flag('no-share')) {
  server = await chromium.launchServer({ executablePath: CHROME, args: ARGS });
}
const env = { ...process.env, PORT: port, TEST_JOBS: String(jobs), FAST: fast ? '1' : '', ...(server ? { PW_WS: server.wsEndpoint() } : {}) };

function runOnce(slug, attempt, append = false) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const log = createWriteStream(logs + slug + '.log', { flags: attempt || append ? 'a' : 'w' });
    log.write(`--- ${label} ${slug} attempt ${attempt + 1} ---\n`);
    const p = spawn('node', [dir + slug + '.test.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const take = (d) => { out += d; log.write(d); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    const limit = setTimeout(() => { take('\nTIMEOUT: killed\n'); p.kill('SIGKILL'); }, (fast ? 300 : 1500) * 1000);
    p.on('close', (code) => { clearTimeout(limit); log.end(); resolve({ ok: code === 0, s: Math.round((Date.now() - t0) / 1000), out }); });
  });
}

const t0 = Date.now();
const results = [];
const running = new Set();
// --repeat N: every selected test is queued N times (round by round, so the same test never runs against itself).
const queue = Array.from({ length: repeat }, (_, k) => list.map((slug) => ({ slug, k }))).flat();
let rtRunning = 0;
const pending = [...queue];
async function worker() {
  while (pending.length) {
    // first queued run that may start now (a real-time test waits for a free slot; the same test never runs twice at once)
    const i = pending.findIndex((q) => (!realtime.has(q.slug) || rtRunning < rtMax) && !running.has(q.slug));
    if (i < 0) { await new Promise((r) => setTimeout(r, 200)); continue; }
    const { slug, k } = pending.splice(i, 1)[0];
    const rt = realtime.has(slug);
    if (rt) rtRunning++;
    running.add(slug);
    let r = await runOnce(slug, 0, k > 0), tries = 0, flaky = false;
    while (!r.ok && tries < retry) { tries++; r = await runOnce(slug, tries); if (r.ok) flaky = true; }
    if (rt) rtRunning--;
    running.delete(slug);
    if (!k) times[`${label}:${slug}`] = r.s;
    results.push({ slug, ...r, flaky });
    if (verbose) console.log(`${r.ok ? (flaky ? 'flaky' : 'ok   ') : 'FAIL '} ${slug} (${r.s} s)`);
  }
}
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, worker));
if (server) await server.close();
if (vite) vite.kill();
try { writeFileSync(logs + 'times.json', JSON.stringify(times)); } catch {}

const bad = results.filter((r) => !r.ok), flaky = results.filter((r) => r.flaky);
if (repeat > 1) {
  // compact per-test table: passes/runs and the slowest run
  const rows = list.map((slug) => { const rs = results.filter((r) => r.slug === slug); return { slug, pass: rs.filter((r) => r.ok).length, n: rs.length, max: Math.max(...rs.map((r) => r.s)) }; });
  console.log(rows.map((r) => `${r.pass === r.n ? 'ok  ' : 'FAIL'} ${r.slug} ${r.pass}/${r.n} (max ${r.max} s)`).join('\n'));
}
const shown = new Set();
for (const r of bad) { if (shown.has(r.slug)) continue; shown.add(r.slug); console.log(`FAIL ${r.slug} (log: tools/.logs/${r.slug}.log)\n` + r.out.trimEnd().split('\n').slice(-15).join('\n')); }
if (flaky.length) console.log('flaky: ' + flaky.map((r) => r.slug).join(', '));
// Budget warnings (fast mode, plain runs only): a new or changed test must keep the fast suite within budget.
if (fast && repeat === 1) {
  for (const r of results.filter((x) => x.s > BUDGET_TEST * (realtime.has(x.slug) ? 2 : 1)).sort((a, b) => b.s - a.s)) console.log(`WARN slow fast test: ${r.slug} took ${r.s} s (budget ${BUDGET_TEST * (realtime.has(r.slug) ? 2 : 1)} s per test)`);
  const total = Math.round((Date.now() - t0) / 1000);
  if (total > BUDGET_TOTAL && list.length === all.length) console.log(`WARN fast suite took ${total} s (budget ${BUDGET_TOTAL} s on 2 CPUs)`);
}
console.log(`${label}${repeat > 1 ? ' x' + repeat : ''}: ${results.length - bad.length - flaky.length} ok, ${bad.length} fail, ${flaky.length} flaky (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(bad.length ? 1 : 0);
