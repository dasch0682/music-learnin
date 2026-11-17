// Plays every level of Five-note jam: one wrong phrase, then right ones. Taps are timed on the backing clock.
// Usage: npx vite --port 5407 --strictPort &   then   PORT=5407 node tools/penta-jam.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos, CORE } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5407}/penta-jam/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // taps are timed against the real clock
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => readAttempts(page, 'penta-jam');
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

await smoke({ browser, url: base, check });

// ---- Musical content of every level, over many generated phrases (no playing: spec() of far-away phrases).
const CHORDS = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] };
const ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const chordOf = (sym) => { const m = /^([A-G])(♭?)(.*)$/.exec(sym); const r = mod(ROOT[m[1]] - (m[2] ? 1 : 0), 12); return { root: r, pcs: CHORDS[m[3]].map((x) => mod(r + x, 12)), third: mod(r + CHORDS[m[3]][1], 12), seventh: CHORDS[m[3]][3] == null ? null : mod(r + CHORDS[m[3]][3], 12) }; };
const PENT = { C: [0, 2, 4, 7, 9], Am: [9, 0, 2, 4, 7], G: [7, 9, 11, 2, 4], Dm: [2, 5, 7, 9, 0], F: [5, 7, 9, 0, 2], Em: [4, 7, 9, 11, 2], Gp: [7, 9, 11, 2, 4] };
const SYMS = {
  1: [['C', 'C']], 2: [['C', 'C', 'C', 'C']], 3: [['C', 'F', 'G', 'C']],
  4: [['Am', 'F', 'C', 'G'], ['G', 'C', 'D', 'G'], ['Dm', 'B♭', 'F', 'C'], ['F', 'B♭', 'C', 'F']],
  5: [['C', 'G', 'C', 'G'], ['C', 'F', 'G', 'C']],
  6: [['A7', 'A7', 'A7', 'A7'], ['D7', 'D7', 'A7', 'A7'], ['E7', 'D7', 'A7', 'E7']],
  7: [['Dm7', 'G7', 'Dm7', 'G7']], 8: [['Dm7', 'G7', 'Cmaj7', 'Cmaj7']], 9: [['Dm7', 'Dm7', 'Dm7', 'Dm7']],
};
function content(level, s) {
  const tag = `L${level} ${s.item}`;
  const symRow = SYMS[level].find((r) => r.join() === s.bars.map((b) => b.sym).join());
  check(!!symRow, `${tag}: chords ${s.bars.map((b) => b.sym)}`);
  check(s.bars.length === (level === 1 ? 2 : 4) && s.end - s.start === s.bars.length * 4, `${tag}: bars ${s.bars.length} span ${s.end - s.start}`);
  s.bars.forEach((b, i) => {
    const pcs = [...new Set(b.pads.map(pcOf))];
    check(b.pads.every((m, k) => k === 0 || m > b.pads[k - 1]) && b.pads[0] >= 52 && b.pads.at(-1) <= 77, `${tag}: pads ${b.pads}`);
    const c = chordOf(b.sym);
    check(JSON.stringify(b.tones) === JSON.stringify(c.pcs.filter((x) => pcs.includes(x))) || [...b.tones].sort().join() === c.pcs.filter((x) => pcs.includes(x)).sort().join(), `${tag}: tones ${b.tones} of ${b.sym} on ${pcs}`);
    check(b.tones.length >= 2, `${tag}: few tones`);
    check(b.guides.every((g) => (g === c.third || g === c.seventh) && b.tones.includes(g)), `${tag}: guides ${b.guides} of ${b.sym}`);
    // the pads are a pentatonic scale (5 pitch classes), plus one extra pad (level 5) or the blue note (level 6)
    const extra = level === 5 ? 1 : level === 6 ? 1 : 0;
    check(pcs.length === 5 + extra, `${tag}: ${pcs.length} pitch classes on the pads`);
    if (level === 6) check(pcs.includes(3) && [9, 0, 2, 4, 7].every((x) => pcs.includes(x)), `${tag}: A minor pentatonic + E♭`);
    if (level === 5) check([0, 2, 4, 7, 9].every((x) => pcs.includes(x)) && pcs.includes(pcOf(s.xm)), `${tag}: C pentatonic + extra`);
    if (level <= 3) check([0, 2, 4, 7, 9].every((x) => pcs.includes(x)), `${tag}: C major pentatonic`);
    if (level === 4) { const key = s.item.split(':')[0]; check(PENT[key].every((x) => pcs.includes(x)) && pcs.length === 5, `${tag}: pentatonic of ${key}`); }
    if (level === 7 || level === 9) check(PENT.Dm.every((x) => pcs.includes(x)), `${tag}: D minor pentatonic`);
    if (level === 8) check((PENT[i === 0 ? 'Dm' : 'Em']).every((x) => pcs.includes(x)), `${tag}: pentatonic of bar ${i}`);
  });
  if (level === 2) check((s.item === 'home' && s.target === 0) || (s.item === 'open' && s.target === 7), `${tag}: target ${s.target}`);
  if (level === 4) check(['Am', 'G', 'Dm', 'F'].includes(s.item.split(':')[0]) && s.item.includes(':'), `${tag}: item`);
  if (level === 5) {
    check(s.item.startsWith('4th') ? s.xm === 65 : s.xm === 71, `${tag}: extra pad ${s.xm}`);
    check(s.item.split(':')[1] === (s.bars[1].sym === 'G' ? 'I-V-I-V' : 'I-IV-V-I'), `${tag}: item vs chords`);
  }
  if (level === 6) check(['line1', 'line2', 'line3'].includes(s.item) && s.changes.every((i, k) => i === 0 || s.bars[i].sym !== s.bars[i - 1].sym) && s.changes.length >= 1, `${tag}: changes ${s.changes}`);
}
{
  const p0 = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'en-US' });
  await p0.goto(base);
  for (const level of levels(9)) {
    await p0.evaluate((l) => localStorage.setItem('ml:settings:penta-jam', JSON.stringify({ level: l, tempo: 50 })), level);
    await p0.reload();
    await p0.click('.ml-start');
    await p0.waitForFunction(() => window.__test?.running);
    const items = new Set();
    for (let i = 0; i < rounds(40, 8); i++) { const s = await p0.evaluate((k) => window.__test.spec(k), 500 + i); items.add(s.item); content(level, s); }
    if (level === 4 && !FAST) check(items.size >= 3, `L4: only ${[...items]}`);
    if (level === 6 && !FAST) check(items.size === 3, `L6: only ${[...items]}`);
  }
  await p0.close();
}

await page.goto(base);
for (const L of FAST ? [1, 5, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, '5b']) {
  const level = parseInt(L);
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(String(L))) continue;
  if (L === '5b') { await page.reload(); await page.click('.ml-start'); await page.waitForFunction(() => window.__test?.running); }
  if (L === '5b') await page.evaluate(async (CORE) => { // later stages: mark the first items as mastered (through the core's own logger)
    const { logAttempt } = await import(CORE + '/storage.js');
    for (const item of ['4th:I-V-I-V', '7th:I-V-I-V']) for (let k = 0; k < 6; k++) await logAttempt({ game: 'penta-jam', skill: 'play.tension', item, correct: true, level: 5, ms: 1 });
  }, CORE);
  await page.evaluate((l) => localStorage.setItem('ml:settings:penta-jam', JSON.stringify({ level: l, tempo: 140, names: false })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.running);
  const before = (await attempts()).length;
  const lv = await page.evaluate(() => window.__test.level);
  check(lv === level, `L${level}: level is ${lv}`);
  const phrases = level === 1 ? rounds(6, 2) : rounds(level === 5 ? 4 : 3, 2);
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
    check(a.level === level && a.item === expected[k][1] && a.skill === skillOf('penta-jam', level), `L${level}: attempt ${JSON.stringify(a)}`);
  });
  // Wrong phrase is logged as wrong with its detail; progression: five clean phrases in a row offer the next level.
  if (level === 1) check(mine[0]?.detail?.notes === 1 && mine[1]?.detail?.notes >= 4, `L1: details ${JSON.stringify(mine.map((a) => a.detail))}`);
  if (level === 1) {
    const up = await page.evaluate(() => window.__test.canLevelUp);
    check(up === !FAST, `L1: canLevelUp=${up} after ${phrases} phrases`); // full mode: 1 wrong + 5 right; fast mode (2 phrases) must not offer it
    if (!FAST) {
      check(await page.$eval('.pj-controls .ml-primary', (e) => !e.hidden), 'L1: next-level button visible');
      await page.click('.pj-controls .ml-primary');
      await page.waitForFunction(() => window.__test.level === 2, null, { timeout: 5000 }).catch(() => check(false, 'L1: next-level click'));
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}
// ---- Timing tolerance (level 3, tempo 140): a chord tone is accepted from `a` beats before to `b` beats after the beat, not outside.
{
  await page.evaluate(() => localStorage.setItem('ml:settings:penta-jam', JSON.stringify({ level: 3, tempo: 140, names: false })));
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.running);
  const before = (await attempts()).length;
  const spb = await page.evaluate(() => window.__test.spb);
  const a = Math.max(0.3, 0.15 / spb), b = Math.max(0.45, 0.22 / spb);
  const s = await page.evaluate(() => window.__test.spec(0));
  const offs = [-a - 0.3, -a + 0.12, b - 0.12, b + 0.3];
  for (let i = 0; i < 4; i++) await tap(s.start + 4 * i + offs[i], tonesOf(s.bars[i]), 60);
  await page.waitForFunction((n) => window.__test.results.length >= n, 1, { timeout: 30000 });
  const [r] = (await attempts()).slice(before);
  check(r && JSON.stringify(r.detail.hits) === '[0,1,1,0]' && r.ok === false, `timing: hits ${JSON.stringify(r?.detail)} for offsets ${offs.map((x) => x.toFixed(2))}`);
}
// ---- Settings: level, tempo and note names take effect, are saved, and survive a reload.
{
  await setField(page, 0, 4);
  await page.waitForFunction(() => window.__test.level === 4, null, { timeout: 5000 }).catch(() => check(false, 'level setting not applied live'));
  await closeSettings(page);
  await persistCheck({
    page, url: base, slug: 'penta-jam', fields: [[1, 'tempo', 100], [2, 'names', true]], check,
    applied: async (pg) => {
      const spb = await pg.evaluate(() => window.__test.spb), lvl = await pg.evaluate(() => window.__test.level);
      const labels = await pg.$$eval('.ml-pad', (e) => e.map((x) => x.textContent));
      return Math.abs(spb - 0.6) > 0.001 ? `spb ${spb}` : lvl !== 4 ? `level ${lvl}` : labels.some((l) => !l) ? `pad labels ${labels}` : '';
    },
  });
  await setField(page, 2, false);
  await page.waitForFunction(() => [...document.querySelectorAll('.ml-pad')].every((e) => !e.textContent), null, { timeout: 3000 }).catch(() => check(false, 'names off not applied'));
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'overflow with settings dialog');
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
