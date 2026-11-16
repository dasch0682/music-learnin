// Plays every level of Build the scale with real pointer events on the keys: a wrong set first, then the right one.
// Expected notes are recomputed here from music theory (semitone patterns), not read from the app.
// Usage: npx vite --port 5307 --strictPort &   then   PORT=5307 node tools/build-scales.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5307}/build-scales/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'build-scales').sort((x, y) => x.t - y.t)); }; }));
const state = () => page.evaluate(() => window.__test.state());
const until = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await page.waitForTimeout(60); } return null; };

// ---- theory, written independently of the app: semitones above the tonic ----
const T = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  pentaMajor: [0, 2, 4, 7, 9], pentaMinor: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
};
const pcs = (tonic, steps) => steps.map((s) => (tonic + s) % 12).sort((a, b) => a - b);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Degree of the major scale on which each mode starts (2nd, 3rd, 4th, 5th, 6th note).
const DEGREE = { dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, aeolian: 5 };
const BASE6 = { lydian: 'major', mixolydian: 'major', pentaMajor: 'major', dorian: 'minor', phrygian: 'minor', blues: 'pentaMinor' };

const press = async (pc, base = 60) => {
  const k = page.locator(`.ml-key[data-midi="${base + pc}"]`);
  const b = await k.boundingBox();
  const black = (await k.getAttribute('class')).includes('ml-black');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * (black ? 0.25 : 0.85));
};
const tapSet = async (from, to, base) => {
  for (const pc of from) if (!to.includes(pc)) await press(pc, base);
  for (const pc of to) if (!from.includes(pc)) await press(pc, base);
};
const allowed = {
  1: { kinds: ['major'], tonics: [0] }, 2: { kinds: ['major'], tonics: [7, 5] }, 3: { kinds: ['major'], tonics: [...Array(12).keys()] },
  4: { kinds: ['minor', 'harmonicMinor', 'relative'], tonics: [...Array(12).keys()] },
  5: { kinds: Object.keys(DEGREE), tonics: [...Array(12).keys()] },
  6: { kinds: Object.keys(BASE6), tonics: [...Array(12).keys()] },
};
const skillOf = (l) => (l <= 4 ? 'theory.scales' : 'theory.modes');

/** Checks the question against theory and returns [wrong action, right action] on the keys. */
function plan(s) {
  const L = s.level, a = allowed[L];
  check(a.kinds.includes(s.kind) && a.tonics.includes(s.tonic), `L${L}: unexpected question ${s.item}`);
  check(s.item === `${s.kind}:${s.tonic}`, `L${L}: item ${s.item}`);
  const t = s.tonic;
  if (L === 5) {
    const parent = (t - T.major[DEGREE[s.kind]] + 12) % 12; // the major scale this mode borrows its notes from
    check(eq(s.lit, pcs(parent, T.major)) && eq(s.expected, [t]) && s.home === parent, `L5 ${s.item}: lit ${s.lit} expected ${s.expected} home ${s.home}`);
    check(eq(s.played.map((m) => m - 60), [...T[s.kind].map((x) => x + t), t + 12]), `L5 ${s.item}: played ${s.played}`);
    const wrongPc = s.lit.find((p) => p !== t);
    return { wrong: () => press(wrongPc), right: () => press(t), steps: T[s.kind] };
  }
  if (s.kind === 'relative') {
    const major = (t + 3) % 12; // A minor shares the notes of C major: the minor home is a minor third below
    check(eq(s.lit, pcs(major, T.major)) && eq(s.expected, [t]) && s.home === major, `L4 ${s.item}: lit ${s.lit} home ${s.home}`);
    check(eq(s.played.map((m) => m - 60), [...T.minor.map((x) => x + t), t + 12]), `L4 ${s.item}: played`);
    return { wrong: () => press(major), right: () => press(t), steps: T.minor };
  }
  const steps = T[s.kind];
  const exp = pcs(t, steps);
  check(eq(s.expected, exp), `L${L} ${s.item}: expected ${s.expected} vs theory ${exp}`);
  check(eq(s.played.map((m) => m - 60), [...steps.map((x) => x + t), t + 12]), `L${L} ${s.item}: played ${s.played}`);
  const start = L === 6 ? pcs(t, T[BASE6[s.kind]]) : [];
  check(eq(s.start, start), `L${L} ${s.item}: start ${s.start} vs ${start}`);
  if (L === 6) check(s.kind === 'pentaMajor' ? start.length - exp.length === 2 : s.kind === 'blues' ? exp.length - start.length === 1 : start.filter((p) => !exp.includes(p)).length === 1 && exp.filter((p) => !start.includes(p)).length === 1, `L6 ${s.item}: not a small change`);
  // A wrong set of the same size: swap one note of the scale for a note that does not belong (one of the start notes when there is one).
  const x = exp.find((p) => p !== t && (L !== 6 || start.includes(p)));
  const y = [...Array(12).keys()].find((p) => !exp.includes(p) && start.includes(p)) ?? [...Array(12).keys()].find((p) => !exp.includes(p) && !start.includes(p));
  const wrongSet = [...exp.filter((p) => p !== x), y].sort((m, n) => m - n);
  check(!eq(wrongSet, start) && !eq(wrongSet, exp), `L${L} ${s.item}: bad wrong set`);
  return { wrong: () => tapSet(start, wrongSet), right: () => tapSet(start, exp), steps };
}

await page.goto(base);
for (let level = 1; level <= 6; level++) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await until(() => state());
  // One question of each kind at the level, after the first random one.
  const kinds = allowed[level].kinds;
  const queue = kinds.map((k, i) => `${k}:${[...allowed[level].tonics][(i * 5 + level) % allowed[level].tonics.length]}`);
  const rounds = Math.max(8, queue.length + 2);
  while (queue.length < rounds - 1) queue.push(`${kinds[queue.length % kinds.length]}:${allowed[level].tonics[(queue.length * 7 + 3) % allowed[level].tonics.length]}`);
  await page.evaluate((q) => window.__test.force(q), queue);
  const seen = new Set();
  for (let round = 0; round < rounds; round++) {
    const s = await until(async () => { const x = await state(); return x && !x.locked ? x : null; });
    check(!!s, `L${level} round ${round}: no question`);
    if (!s) break;
    seen.add(s.kind);
    const p = plan(s);
    const before = (await attempts()).length;
    const n = s.n;
    if (round === 0) {
      if (dir && level === 3) await page.screenshot({ path: `${dir}/bs-${level}-fr-light.png` });
      await p.wrong();
      await page.waitForTimeout(250);
      const mid = await state();
      check(mid.missed && (await attempts()).length === before + 1, `L${level} ${s.item}: wrong answer not logged once`);
      await until(async () => !(await state()).locked); // the keys come back to the start state
      const again = await state();
      check(eq(again.latched, again.start) && again.n === n, `L${level} ${s.item}: no retry state ${again.latched}`);
    }
    await p.right();
    await page.waitForTimeout(150);
    const done = await state();
    check(done.locked || done.n !== n, `L${level} ${s.item}: not judged`);
    // The strip of wide and narrow blocks matches the pattern.
    const blocks = await page.$$eval('.bs-g', (els) => els.map((e) => e.className.match(/bs-g(\d)/)[1] * 1));
    const gaps = p.steps.map((x, i) => (i + 1 < p.steps.length ? p.steps[i + 1] : 12) - x);
    check(eq(blocks, gaps), `L${level} ${s.item}: strip ${blocks} vs ${gaps}`);
    if (round === 1 && level === 1) check((await page.$$eval('.bs-g', (e) => e.map((x) => x.textContent))).join('|') === '1 ton|1 ton|½ ton|1 ton|1 ton|1 ton|½ ton', 'L1: strip labels');
    const moved = await until(async () => (await state()).n !== n, 12000);
    check(!!moved, `L${level} ${s.item}: next question never came`);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skillOf(level), `L${level} ${s.item}: ${JSON.stringify(mine.map((a) => [a.ok, a.level, a.item, a.skill]))}`);
    if (round === 7 && level < 6) check((await state()).nextShown, `L${level}: next-level button missing after a clean streak`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  }
  console.log(`L${level}`, [...seen].join(' '));
  if (level === 1) {
    await page.click('.bs-next');
    await page.waitForTimeout(400);
    check((await state()).level === 2, 'L1: next-level button did not move to level 2');
  }
}

// English, dark theme: names on keys, labels in English.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
en.on('pageerror', (e) => errors.push(String(e)));
en.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: 6, labels: true })));
await en.reload();
await en.click('.ml-start');
await en.waitForTimeout(600);
const title = await en.textContent('.bs-title');
check(/[A-G]/.test(title) && !/[éèà]/.test(title), `EN title: ${title}`);
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN: overflow');
if (dir) await en.screenshot({ path: `${dir}/bs-6-en-dark.png` });

check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
