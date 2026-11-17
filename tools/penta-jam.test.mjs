// Plays every level of Five-note jam: one wrong phrase, then right ones. Taps are timed on the backing clock.
// Usage: npx vite --port 5407 --strictPort &   then   PORT=5407 node tools/penta-jam.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5407}/penta-jam/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // taps are timed against the real clock
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'penta-jam').sort((x, y) => x.t - y.t)); }; }));
const mod = (a, n) => ((a % n) + n) % n;
const CH = { C: [0, 4, 7], F: [5, 9, 0], G: [7, 11, 2] };

// In-page helpers: tap(beat, pick) waits for the backing clock, then presses the pad chosen by pick(notes).
await page.addInitScript(() => {
  let id = 100;
  window.__wait = (beat) => new Promise((res) => { const f = () => (window.__test.pos() >= beat ? res() : setTimeout(f, 4)); f(); });
  window.__tap = async (beat, midi, hold = 120, outside = false) => {
    await window.__wait(beat);
    const i = window.__test.notes.indexOf(midi);
    if (i < 0) throw new Error('no pad for ' + midi + ' in ' + window.__test.notes);
    const el = document.querySelectorAll('.ml-pad')[i];
    const pid = ++id;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: pid }));
    await new Promise((r) => setTimeout(r, hold));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: pid }));
  };
  window.__hold = (on) => document.querySelector('.pj-hold').dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: 1 }));
});
const tap = (beat, midi, hold) => page.evaluate(([b, m, h]) => window.__tap(b, m, h), [beat, midi, hold]);
const hold = (on) => page.evaluate((o) => window.__hold(o), on);
const clickSet = (i) => page.evaluate((k) => document.querySelectorAll('.ml-seg button')[k].click(), i);

const pcOf = (m) => mod(m, 12);
const pickNot = (pads, tones) => pads.find((m) => !tones.includes(pcOf(m)));
const tonesOf = (b) => b.pads.filter((m) => b.tones.includes(pcOf(m)))[0];

// Each plan returns the list of [beat, midi] taps (or runs its own actions) for a phrase; ok = right or wrong.
const plans = {
  1: async (s, ok) => { for (let k = 0; k < (ok ? 5 : 1); k++) await tap(s.start + 0.5 + k, s.bars[0].pads[k % 3]); },
  2: async (s, ok) => {
    const pads = s.bars[0].pads, tgt = pads.find((m) => pcOf(m) === s.target), other = pads.find((m) => pcOf(m) !== s.target);
    const ans = [other, pads[2], ok ? tgt : other];
    for (let k = 0; k < 3; k++) await tap(s.start + 8.6 + 2.2 * k, ans[k]);
  },
  5: async (s, ok) => {
    for (let i = 0; i < 4; i++) {
      const B = s.start + 4 * i + 0.1;
      if (!ok) { await tap(B, s.bars[i].pads[0]); continue; }
      if (s.tens.includes(i)) await tap(B, s.xm);
      else if (s.res.includes(i)) await tap(B, s.resMidis[0]);
    }
  },
  6: async (s, ok) => {
    const pads = s.bars[0].pads, blue = pads.find((m) => pcOf(m) === 3);
    for (const i of s.changes) {
      const B = s.start + 4 * i + 0.1, b = s.bars[i];
      await tap(B, ok ? tonesOf(b) : pickNot(b.pads, b.tones));
      if (ok && i === s.changes[0]) { await tap(B + 1, blue, 60); await tap(B + 1.7, pads[0]); }
    }
  },
  7: async (s, ok) => {
    const nSets = ok ? 2 : 1;
    for (let k = 0; k < nSets; k++) {
      await clickSet(k);
      const pads = await page.evaluate(() => window.__test.notes);
      await tap(s.start + 1 + 4 * k, pads[0]);
      if (ok) await tap(s.start + 2.5 + 4 * k, pads[1]);
    }
  },
  9: async (s, ok) => {
    const pads = s.bars[0].pads;
    if (ok) {
      await page.evaluate((b) => window.__wait(b), s.start + 1);
      await hold(true);
      await tap(s.start + 2, pads[0]); await tap(s.start + 3, pads[1]);
      await hold(false);
      const d = pads.find((m) => [2, 5, 9, 0].includes(pcOf(m)));
      await tap(s.start + 5, d);
    } else await tap(s.start + 2, pads.find((m) => !CH_DM7.includes(pcOf(m))));
  },
};
const CH_DM7 = [2, 5, 9, 0];
// Levels 3, 4, 8: land on chord tones at each bar start (wrong: on other pads).
const chordPlan = async (s, ok) => {
  for (let i = 0; i < 4; i++) { const b = s.bars[i]; await tap(s.start + 4 * i + 0.1, ok ? tonesOf(b) : pickNot(b.pads, b.tones)); }
};
plans[3] = plans[4] = plans[8] = chordPlan;

await page.goto(base);
for (const L of FAST ? [1, 5, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, '5b']) {
  const level = parseInt(L);
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(L))) continue;
  if (L === '5b') { await page.reload(); await page.click('.ml-start'); await page.waitForFunction(() => window.__test?.running); }
  if (L === '5b') await page.evaluate(async () => { // later stages: mark the first items as mastered (through the core's own logger)
    const { logAttempt } = await import('/@fs/home/claude/music-learnin/packages/core/storage.js');
    for (const item of ['4th:I-V-I-V', '7th:I-V-I-V']) for (let k = 0; k < 6; k++) await logAttempt({ game: 'penta-jam', skill: 'play.tension', item, correct: true, level: 5, ms: 1 });
  });
  await page.evaluate((l) => localStorage.setItem('ml:settings:penta-jam', JSON.stringify({ level: l, tempo: 140, names: false })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.running);
  const before = (await attempts()).length;
  const lv = await page.evaluate(() => window.__test.level);
  check(lv === level, `L${level}: level is ${lv}`);
  const phrases = rounds(level === 5 ? 4 : 3, 2);
  const expected = [];
  for (let p = 0; p < phrases; p++) {
    const s = await page.evaluate((i) => window.__test.spec(i), p);
    const ok = p > 0;
    // Theory: tones = chord tones among the pads.
    if ([3, 4, 5, 8].includes(level)) for (const b of s.bars) {
      const root = { C: 0, F: 5, G: 7, D: 2, A: 9, B: 11, E: 4 }[b.sym[0]];
      const five = level === 5 ? b.pads.filter((m) => m !== s.xm) : b.pads;
      if (level !== 8) { const want = [...new Set(five.map(pcOf))].filter((x) => mod(x - root, 12) === 0 || mod(x - root, 12) === 4 || mod(x - root, 12) === 7 || (b.sym.includes('m') && mod(x - root, 12) === 3)); b.tones.every((t) => want.includes(t)) || check(false, `L${level}: tones ${b.tones} for ${b.sym}`); }
    }
    if (level === 5) {
      check(s.xm === 65 || s.xm === 71, `L5: extra pad ${s.xm}`);
      check(s.bars.every((b) => b.pads.length === 7 && b.pads.includes(s.xm) && !b.tones.includes(pcOf(s.xm))), 'L5: pads / tones');
      check(JSON.stringify(s.bars.map((b) => b.sym)) === JSON.stringify(s.item.endsWith('I-V-I-V') ? ['C', 'G', 'C', 'G'] : ['C', 'F', 'G', 'C']), `L5: chords ${s.bars.map((b) => b.sym)}`);
      check(s.tens.every((i) => s.bars[i].sym === 'G') && s.res.every((i) => s.bars[i].sym === 'C' && s.bars[i - 1].sym === 'G'), 'L5: tension on V, release on I');
      const pads = s.bars[0].pads, i = pads.indexOf(s.xm);
      check(s.resMidis.length > 0 && s.resMidis.every((m) => Math.abs(pads.indexOf(m) - i) === 1 && CH.C.includes(pcOf(m))), `L5: release pads ${s.resMidis}`);
      check(s.xm === (s.item.startsWith('4th') ? 65 : 71), 'L5: item / pad');
    }
    if (level === 3 || level === 4) check(s.bars.every((b) => b.tones.length >= 2), `L${level}: tones`);
    if (dir && p === 1 && [5].includes(level)) await page.waitForFunction((st) => window.__test.pos() > st + 1, s.start);
    if (dir && p === 1 && level === 5) await page.screenshot({ path: `${dir}/pj-5.png` });
    await plans[level](s, ok);
    const n = before + p + 1;
    await page.waitForFunction((n0) => window.__test.results.length >= n0, p + 1, { timeout: 30000 }).catch(() => {});
    expected.push([ok, s.item]);
  }
  await page.waitForTimeout(300);
  const mine = (await attempts()).slice(before);
  check(mine.length === phrases, `L${level}: attempts ${mine.length}/${phrases}`);
  mine.forEach((a, k) => {
    check(a.ok === expected[k][0], `L${level}: phrase ${k} ok=${a.ok}, expected ${expected[k][0]}`);
    check(a.level === level && a.item === expected[k][1] && a.skill === ({ 1: 'play.penta.free', 2: 'play.penta.callresponse', 3: 'play.penta.harmony', 4: 'play.penta.harmony', 5: 'play.tension', 6: 'play.penta.blues', 7: 'play.penta.modal', 8: 'play.penta.jazz', 9: 'play.penta.outside' })[level], `L${level}: attempt ${JSON.stringify(a)}`);
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
