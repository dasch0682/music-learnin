// Plays the 6 levels of Two hands: a wrong run (one hit missing), then a right one, with pointerdown events at the expected times.
// Expected hits are recomputed from the item id. Also checks the F/J keys, late taps, and the "next level" button.
// Usage: npx vite --port 5304 --strictPort &   then   PORT=5304 node tools/two-hands.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5304}/two-hands/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // taps are timed against the real clock
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const TEMPO = 120;
const state = () => page.evaluate(() => ({ ...window.__test }));
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'two-hands').sort((x, y) => x.t - y.t)); }; }));

/** Expected hits in ms from the start of the turn, from the item id alone. */
function expectedFor(s) {
  const id = s.item;
  const even = (n, beats) => Array.from({ length: n }, (_, i) => (i * beats) / n);
  let beats, cycles, L, R, mult = 1;
  if (id === 'alt' || id === 'alt-r') { beats = 4; cycles = 2; [L, R] = id === 'alt' ? [[0, 2], [1, 3]] : [[1, 3], [0, 2]]; }
  else if (id === '2:1') { beats = 4; cycles = 1; L = even(4, 4); R = even(8, 4); }
  else if (id.startsWith('beat+')) {
    const cells = id.slice(5).split('-');
    beats = cells.length; cycles = 1; L = even(beats, beats); R = [];
    cells.forEach((c, i) => { R.push(i); if (c === 'ee') R.push(i + 0.5); });
  } else {
    const m = /^(\d):(\d)(:fast)?$/.exec(id);
    const a = +m[1], b = +m[2];
    beats = Math.min(a, b); cycles = 2; L = even(b, beats); R = even(a, beats); if (m[3]) mult = 1.4;
  }
  const bpm = Math.min(160, Math.max(40, Math.round(TEMPO * mult))); // the game keeps the tempo between 40 and 160
  const q = 60000 / bpm;
  const rep = (l) => Array.from({ length: cycles }, (_, c) => l.map((t) => Math.round((t + c * beats) * q))).flat();
  return { bpm, L: rep(L), R: rep(R) };
}
const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1);

/** Wait for a run, then tap at the expected times. skip = 'L' or 'R': leave out the last hit of that hand. */
async function playRun(skip, { lateMs = 0, keys = false } = {}) {
  const prev = (await state()).result;
  let s;
  for (let i = 0; i < 800; i++) { s = await state(); if (s.turnStart != null && s.phase !== 'feedback') break; await page.waitForTimeout(25); }
  if (s.turnStart == null) throw new Error('no run started');
  await page.evaluate(async ({ skip, lateMs, keys }) => {
    const ex = window.__test.expected;
    const ev = [];
    for (const hd of ['L', 'R']) ex[hd].forEach((t, i) => { if (!(skip === hd && i === ex[hd].length - 1)) ev.push({ hd, t }); });
    ev.sort((a, b) => a.t - b.t);
    for (const { hd, t } of ev) {
      while (performance.now() < window.__test.turnStart + t + lateMs) await new Promise((r) => setTimeout(r, 2));
      if (keys) document.dispatchEvent(new KeyboardEvent('keydown', { code: hd === 'L' ? 'KeyF' : 'KeyJ', bubbles: true, cancelable: true }));
      else document.querySelector(`.th-pad[data-hand="${hd}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    }
  }, { skip, lateMs, keys });
  for (let i = 0; i < 400; i++) { const t = await state(); if (t.result && t.result !== prev && t.phase === 'feedback') return t.result; await page.waitForTimeout(25); }
  throw new Error('no result');
}
const tapPad = () => page.evaluate(() => document.querySelector('.th-pad[data-hand="L"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
async function load(level, extra = {}) {
  await page.evaluate((o) => localStorage.setItem('ml:settings:two-hands', JSON.stringify(o)), { level, tempo: TEMPO, tolerance: 'normal', latency: 0, ...extra });
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test && window.__test.item);
}
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

await page.goto(base);
for (const level of levels(6)) {
  await load(level);
  const before = (await attempts()).length;
  let s = await state();
  const item = s.item;
  check(s.level === level && s.skill === 'rhythm.poly', `L${level}: skill/level ${s.skill} ${s.level}`);
  const ex = expectedFor(s);
  check(s.bpm === ex.bpm && near(s.expected.L, ex.L) && near(s.expected.R, ex.R), `L${level} ${item}: expected ${JSON.stringify(s.expected)} vs ${JSON.stringify(ex)}`);
  if ([1, 2, 4].includes(level)) check(s.demo, `L${level}: model not played first`);
  if (dir && level === 4) await page.screenshot({ path: `${dir}/th-4-idle.png` });
  await tapPad();
  let r = await playRun(level % 2 ? 'R' : 'L');
  check(!r.correct && ((level % 2 ? r.R : r.L).miss === 1) && (level % 2 ? r.L : r.R).ok, `L${level}: wrong run judged ${JSON.stringify(r)}`);
  if (dir && level === 6) await page.screenshot({ path: `${dir}/th-6-wrong.png` });
  await page.waitForTimeout(800); // the pads are locked for 700 ms after a result
  await tapPad();
  r = await playRun(null);
  check(r.correct && r.L.ok && r.R.ok, `L${level}: right run judged ${JSON.stringify(r)}`);
  await page.waitForTimeout(300);
  const mine = (await attempts()).slice(before);
  check(mine.length === 2 && !mine[0].ok && mine[1].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  check(mine.every((a) => a.level === level && a.skill === 'rhythm.poly' && a.item === item), `L${level}: bad skill/level/item ${JSON.stringify(mine.map((a) => [a.skill, a.level, a.item]))}`);
  check(!(await overflow()), `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}

// Late taps (more than the window) fail; the hands are judged apart (right hand only wrong here would need a swap, so all late).
await load(3, { tolerance: 'strict' });
await tapPad();
const late = await playRun(null, { lateMs: 250 });
check(!late.correct, 'late taps judged correct');

// Keys F and J, and the next-level button after a clean streak (not in fast mode: 8 real-time runs).
await load(3, { tolerance: 'easy' });
let up = false;
for (let k = 0; k < rounds(8, 1) && !up; k++) {
  await tapPad();
  const r = await playRun(null, { keys: true });
  check(r.correct, `streak run ${k}: ${JSON.stringify(r)}`);
  up = (await state()).levelUp;
  if (!up) await page.waitForTimeout(1600);
}
if (!FAST) check(up, 'next level never offered');
if (up) {
  await page.click('.th-controls .ml-primary');
  await page.waitForFunction(() => window.__test.level === 4, null, { timeout: 5000 }).catch(() => {});
  const s = await state();
  check(s.level === 4 && s.item === '3:2', `next level -> ${s.level} ${s.item}`);
}
// English, dark: the title of the level select is bilingual.
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
