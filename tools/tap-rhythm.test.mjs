// Plays the 9 levels of Tap the rhythm: a wrong run (last note missing), then a right one, with taps at the expected times.
// Level 9 is also checked pattern by pattern (5/8, 7/8, 5/4) and levels 8 -> 9 through the "next level" button.
// Usage: npx vite --port 5304 --strictPort &   then   PORT=5304 node tools/tap-rhythm.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5304}/tap-rhythm/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => ({ ...window.__test }));
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'tap-rhythm').sort((x, y) => x.t - y.t)); }; }));

// ---- expected onsets, recomputed from the item id (independent of the app's code) ----
const CELLS = {
  q: [[1]], h: [[2]], w: [[4]], ee: [[0.5], [0.5]], r: [[1, 1]], xe: [[0.5, 1], [0.5]], ex: [[0.5], [0.5, 1]],
  ssss: [[0.25], [0.25], [0.25], [0.25]], ess: [[0.5], [0.25], [0.25]], sse: [[0.25], [0.25], [0.5]],
  'q.e': [[1.5], [0.5]], eqe: [[0.5], [1], [0.5]], 'e.s': [[0.75], [0.25]], t: [[1 / 3], [1 / 3], [1 / 3]],
  'q.': [[1.5]], eee: [[0.5], [0.5], [0.5]], qe: [[1], [0.5]], 'h.': [[3]],
};
const PULSE = { '4/4': 1, '6/8': 1.5, '5/8': 1.25, '7/8': 1.25, '5/4': 1 };
function expectedFor(s) {
  const m = /^(?:(\d\/\d):([\d+]+):)?(sw:)?(.+)$/.exec(s.item);
  const meter = m[1] || (s.level === 8 ? '6/8' : '4/4');
  if (s.level === 1) return Array.from({ length: 8 }, (_, i) => Math.round((i * 60000) / s.bpm));
  const q = 60 / s.bpm / PULSE[meter];
  const swing = !!m[3];
  const out = [];
  let pos = 0;
  for (const bar of m[4].split('|')) for (const id of bar.split('-')) {
    let p = pos;
    CELLS[id].forEach((e, i) => {
      if (!e[1]) out.push(Math.round((swing && id === 'ee' && i ? p + 1 / 6 : p) * q * 1000));
      p += e[0];
    });
    pos += CELLS[id].reduce((a, e) => a + e[0], 0);
  }
  return out;
}
/** Odd meters: the grouping must add up to the meter and no cell may cross a group boundary. */
function checkOdd(s, tag) {
  const m = /^(\d)\/(\d):([\d+]+):(.+)$/.exec(s.item);
  check(!!m, `${tag}: odd item format ${s.item}`);
  if (!m) return;
  const groups = m[3].split('+').map(Number), unit = m[2] === '8' ? 0.5 : 1;
  check(groups.reduce((a, b) => a + b, 0) === +m[1], `${tag}: groups do not add up ${s.item}`);
  check(s.meter === `${m[1]}/${m[2]}` && s.groups?.join('+') === m[3], `${tag}: __test meter/groups ${s.meter} ${s.groups}`);
  const bars = m[4].split('|');
  check(bars.length === (m[2] === '4' ? 1 : 2), `${tag}: bars count ${s.item}`);
  const bounds = new Set();
  let a = 0;
  for (const g of groups) { a += g * unit; bounds.add(a); }
  for (const bar of bars) {
    let pos = 0;
    for (const id of bar.split('-')) { pos += CELLS[id].reduce((x, e) => x + e[0], 0); }
    check(Math.abs(pos - a) < 1e-6, `${tag}: bar length ${pos} != ${a} (${s.item})`);
    pos = 0;
    for (const id of bar.split('-')) {
      const before = pos;
      pos += CELLS[id].reduce((x, e) => x + e[0], 0);
      // a cell may only end on a group boundary or stay inside its group
      const start = [...bounds].filter((b) => b <= before + 1e-6).pop() ?? 0;
      const inside = [...bounds].every((b) => b <= start + 1e-6 || b >= pos - 1e-6);
      check(inside, `${tag}: cell ${id} crosses a group (${s.item})`);
    }
  }
}

/** Wait for a run to be set up (turnStart known), then tap at the expected times. skipLast = leave the last note out. */
async function playRun(skipLast, extraLateMs = 0) {
  const n0 = (await state()).result?.run ?? 0;
  let s;
  for (let i = 0; i < 400; i++) { s = await state(); if (s.turnStart != null && s.phase !== 'feedback') break; await page.waitForTimeout(25); }
  if (s.turnStart == null) throw new Error('no run started');
  await page.evaluate(async ({ skipLast, extraLateMs }) => {
    const pad = document.querySelector('.tr-pad');
    const exp = window.__test.expected.slice(0, skipLast ? -1 : undefined);
    for (const e of exp) {
      while (performance.now() < window.__test.turnStart + e + extraLateMs) await new Promise((r) => setTimeout(r, 2));
      pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    }
  }, { skipLast, extraLateMs });
  for (let i = 0; i < 400; i++) { const r = (await state()).result; if (r && r.run > n0 && (await state()).phase === 'feedback') return r; await page.waitForTimeout(25); }
  throw new Error('no result');
}
async function startIfIdle() {
  const s = await state();
  if (s.phase === 'idle') await page.evaluate(() => document.querySelector('.tr-pad').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
}
async function load(level, extra = {}) {
  await page.evaluate((o) => localStorage.setItem('ml:settings:tap-rhythm', JSON.stringify(o)), { level, tempo: 100, tolerance: 'normal', latency: 0, ...extra });
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test && window.__test.item);
}
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

await page.goto(base);
const ONLY = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : null;
for (let level = 1; level <= 9; level++) {
  if (ONLY && !ONLY.includes(level)) continue;
  await load(level);
  const before = (await attempts()).length;
  await startIfIdle();
  let s = await state();
  const item = s.item;
  check(s.level === level && s.skill === (['rhythm.pulse', 'rhythm.echo.basic', 'rhythm.read.basic', 'rhythm.rests', 'rhythm.sixteenths', 'rhythm.syncopation', 'rhythm.triplets', 'rhythm.compound', 'rhythm.odd'][level - 1]), `L${level}: skill ${s.skill}`);
  if (level === 9) checkOdd(s, 'L9');
  const exp = expectedFor(s);
  check(JSON.stringify(exp) === JSON.stringify(s.expected) || exp.every((v, i) => Math.abs(v - s.expected[i]) <= 1) && exp.length === s.expected.length, `L${level}: expected onsets ${JSON.stringify(s.expected)} vs ${JSON.stringify(exp)}`);
  let r = await playRun(true);
  check(!r.correct && r.miss === 1, `L${level}: wrong run judged ${JSON.stringify(r)}`);
  if (dir && level === 9) await page.screenshot({ path: `${dir}/tr-9-wrong.png` });
  await page.waitForTimeout(800); // the pad is locked for 700 ms after a result
  const s2 = await state();
  if (s2.phase === 'feedback' && level >= 3) await page.evaluate(() => document.querySelector('.tr-pad').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
  r = await playRun(false);
  check(r.correct && r.miss === 0, `L${level}: right run judged ${JSON.stringify(r)}`);
  await page.waitForTimeout(300);
  const mine = (await attempts()).slice(before);
  check(mine.length === 2 && !mine[0].ok && mine[1].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  check(mine.every((a) => a.level === level && a.skill === s.skill && a.item === item), `L${level}: bad skill/level/item ${JSON.stringify(mine.map((a) => [a.skill, a.level, a.item]))}`);
  check(!(await overflow()), `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}

if (ONLY) { await browser.close(); console.log(failed ? `${failed} failure(s)` : 'all good'); process.exit(failed ? 1 : 0); }

// Level 9, one hand-picked pattern per meter and grouping.
await load(9);
for (const id of ['5/8:3+2:eee-q|qe-ee', '5/8:2+3:ee-q.|q-eee', '7/8:2+2+3:q-ee-qe|ee-q-q.', '7/8:3+2+2:q.-q-ee|eee-ee-q', '7/8:2+3:x'.replace(':2+3:x', ':2+3+2:ee-qe-q|q-q.-ee'), '5/4:3+2:q-ee-q-h', '5/4:2+3:h-h.']) {
  const before = (await attempts()).length;
  await page.evaluate((i) => window.__show(i), id);
  let s = await state();
  check(s.item === id, `show ${id}: item ${s.item}`);
  checkOdd(s, id);
  check(JSON.stringify(expectedFor(s)) === JSON.stringify(s.expected), `${id}: onsets ${JSON.stringify(s.expected)} vs ${JSON.stringify(expectedFor(s))}`);
  await startIfIdle();
  const r = await playRun(false);
  check(r.correct, `${id}: ${JSON.stringify(r)}`);
  await page.waitForTimeout(200);
  const mine = (await attempts()).slice(before);
  check(mine.length === 1 && mine[0].ok && mine[0].item === id && mine[0].level === 9 && mine[0].skill === 'rhythm.odd', `${id}: attempt ${JSON.stringify(mine.map((a) => [a.item, a.ok]))}`);
  console.log('odd', id, r.correct);
  if (dir && id === '7/8:2+3+2:ee-qe-q|q-q.-ee') await page.screenshot({ path: `${dir}/tr-9-78.png` });
  await page.waitForTimeout(1500);
}
// A tap clearly late (more than the window) must fail.
await page.evaluate(() => window.__show('5/8:3+2:eee-q|qe-ee'));
await startIfIdle();
const late = await playRun(false, 250);
check(!late.correct, 'late taps judged correct');

// Level 8 offers level 9 after a clean streak.
await load(8, { tempo: 140, tolerance: 'easy' });
await startIfIdle();
let up = false;
for (let k = 0; k < 10 && !up; k++) {
  const r = await playRun(false);
  check(r.correct, `L8 streak run ${k}`);
  up = (await state()).levelUp;
  if (!up) { await page.waitForFunction(() => window.__test.phase === 'idle' || window.__test.phase === 'count', null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1500); await startIfIdle(); }
}
check(up, 'level 8 never offered level 9');
if (up) {
  await page.click('.tr-controls .ml-primary');
  await page.waitForFunction(() => window.__test.level === 9, null, { timeout: 5000 }).catch(() => {});
  const s = await state();
  check(s.level === 9 && s.skill === 'rhythm.odd', `next level -> ${s.level}`);
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
