// Plays the 6 levels of Two hands: a wrong run (one hit missing), then a right one, with pointerdown events at the expected times.
// Expected hits are recomputed from the item id. Also checks the F/J keys, late taps, and the "next level" button.
// Usage: npx vite --port 5304 --strictPort &   then   PORT=5304 node tools/two-hands.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5304}/two-hands/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // taps are timed against the real clock
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
let TEMPO = 120;
const state = () => page.evaluate(() => ({ ...window.__test }));
const attempts = () => readAttempts(page, 'two-hands');

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

const ITEMS = { 1: ['alt', 'alt-r'], 2: ['2:1'], 4: ['3:2'], 5: ['2:3', '4:3'], 6: ['3:4', '5:4', '3:2:fast'] };
await smoke({ browser, url: base, check });
await page.goto(base);
for (const level of levels(6)) {
  await load(level);
  const before = (await attempts()).length;
  let s = await state();
  const item = s.item;
  check(s.level === level && s.skill === skillOf('two-hands', level), `L${level}: skill/level ${s.skill} ${s.level}`);
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
  check(mine.every((a) => a.level === level && a.skill === skillOf('two-hands', level) && a.item === item), `L${level}: bad skill/level/item ${JSON.stringify(mine.map((a) => [a.skill, a.level, a.item]))}`);
  // Many more generated patterns (a tempo change draws a new one without playing): the expected hits follow from the item.
  const seen = new Set();
  for (let k = 0; k < rounds(30, 5); k++) {
    TEMPO = 120 - (k % 2) * 2;
    await page.evaluate(() => document.querySelector('.th-view > *')?.setAttribute('data-old', '1')); // a new challenge redraws the lanes
    await setField(page, 1, TEMPO);
    await page.waitForFunction(() => !document.querySelector('.th-view [data-old], .th-view[data-old]') && window.__test.phase === 'idle', null, { timeout: 8000 }).catch(() => check(false, `L${level}: no new pattern after a settings change`));
    const t = await state();
    const e = expectedFor(t);
    check(t.bpm === e.bpm && near(t.expected.L, e.L) && near(t.expected.R, e.R), `L${level}~${k} ${t.item}: expected ${JSON.stringify(t.expected)} vs ${JSON.stringify(e)}`);
    check(level === 3 ? /^beat\+(q|ee)-(q|ee)-(q|ee)-q$/.test(t.item) && t.beats === 4 : ITEMS[level].includes(t.item), `L${level}: item ${t.item}`);
    check(t.expected.L.length > 0 && t.expected.R.length > 0 && t.expected.L.every((x, i) => i === 0 || x > t.expected.L[i - 1]) && t.expected.R.every((x, i) => i === 0 || x > t.expected.R[i - 1]), `L${level} ${t.item}: onsets not ordered`);
    check(t.len > 0 && t.expected.L.at(-1) < t.len && t.expected.R.at(-1) < t.len, `L${level} ${t.item}: hit after the end of the turn`);
    seen.add(t.item);
  }
  await closeSettings(page);
  TEMPO = 120;
  if (!FAST) check(seen.size >= (level === 3 ? 6 : ITEMS[level].length), `L${level}: only ${[...seen]} after sampling`);
  check(!(await overflow()), `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}

// Tap timing tolerance: early or late inside the tolerance is right, outside it is wrong (both hands shifted).
for (const level of rounds([3, 5, 6], [3])) {
  await load(level);
  await tapPad();
  let s = await state();
  const t = s.tol;
  for (const [label, shift, ok] of [['early inside', -Math.round(0.65 * t), true], ['late inside', Math.round(0.65 * t), true], ['late outside', Math.round(1.7 * t), false], ['early outside', -Math.round(1.7 * t), false]]) {
    const r = await playRun(null, { lateMs: shift });
    check(r.correct === ok, `L${level}: all taps ${label} (${shift} ms, tolerance ${t} ms) judged ${JSON.stringify(r)}`);
    await page.waitForFunction(() => { const x = window.__test; return x.phase === 'idle' || (x.phase === 'feedback' && !x.result.correct); }, null, { timeout: 8000 });
    await page.waitForTimeout(800);
    await tapPad();
    await page.waitForFunction(() => window.__test.turnStart != null || window.__test.phase === 'count', null, { timeout: 8000 });
  }
}
// Silence is not an answer: a run without a single tap logs nothing.
await load(3);
{
  const before = (await attempts()).length;
  await tapPad();
  await page.waitForFunction(() => window.__test.phase === 'count' || window.__test.phase === 'turn', null, { timeout: 5000 });
  await page.waitForFunction(() => window.__test.phase === 'idle' && window.__test.result?.run !== undefined, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  check((await attempts()).length === before, 'a run with no tap was logged');
}
// Settings: tempo, tolerance and latency take effect, are saved and survive a reload; the latency is compensated.
await load(3);
TEMPO = 80;
await persistCheck({
  page, url: base, slug: 'two-hands', fields: [[1, 'tempo', 80], [2, 'tolerance', 'strict'], [3, 'latency', 40]], check,
  applied: async (pg) => {
    const t = await pg.evaluate(() => ({ ...window.__test }));
    return t.bpm !== 80 ? `bpm ${t.bpm}` : t.tol > Math.round(0.07 * Math.min(1.2, Math.max(0.8, Math.sqrt(72 / 80))) * 1000) + 1 ? `tol ${t.tol}` : '';
  },
});
await tapPad();
{
  const r = await playRun(null); // turnStart already holds the latency: on time once compensated
  check(r.correct, `latency 40: run judged ${JSON.stringify(r)}`);
}
TEMPO = 120;

// Late taps (more than the window) fail; the hands are judged apart (right hand only wrong here would need a swap, so all late).
await load(3, { tolerance: 'strict' });
await tapPad();
const late = await playRun(null, { lateMs: 250 });
check(!late.correct, 'late taps judged correct');

// Keys F and J, and the next-level button after a clean streak (not in fast mode: 8 real-time runs).
await load(3, { tolerance: 'easy' });
let up = false;
for (let k = 0; k < rounds(8, 0) && !up; k++) {
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
