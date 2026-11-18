// Plays the 6 levels of Read and play: a run with a wrong first note, a run too late (not logged), then a right run.
// Melodies are re-checked from music theory (scale, range, leaps, rhythm, notation in the DOM).
// Usage: npx vite --port 5403 --strictPort &   then   PORT=5403 node tools/read-melody.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5403}/read-melody/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // taps are timed against the real clock
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => ({ ...window.__test }));
const attempts = () => readAttempts(page, 'read-melody');
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

const KINDS = { 1: ['quarters-halves'], 2: ['eighths'], 3: ['thirds'], 4: ['dotted'], 5: ['34', '68'], 6: ['minor-sixteenths'] };
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
const PULSE = { '4/4': 1, '3/4': 1, '6/8': 1.5 }, BARLEN = { '4/4': 4, '3/4': 3, '6/8': 3 };
const mod = (n, m) => ((n % m) + m) % m;

/** Scale position (octave * 7 + degree) of a MIDI note in the key; raised 7th of a minor key counts as degree 6. */
function degreeOf(midi, s) {
  const tonicPc = mod(s.mode === 'minor' ? s.fifths * 7 + 9 : s.fifths * 7, 12);
  const scale = s.mode === 'minor' ? MINOR : MAJOR;
  const rel = midi - tonicPc;
  let pc = mod(rel, 12), oct = Math.floor(rel / 12), raised = false;
  let d = scale.indexOf(pc);
  if (d < 0 && s.mode === 'minor' && pc === 11) { d = 6; raised = true; }
  return d < 0 ? null : { pos: oct * 7 + d, raised, tonicPc };
}

function checkTheory(s, tag) {
  const level = s.level;
  const pitches = s.pitches;
  const real = s.notes.filter((n) => !n.rest);
  check(real.length === pitches.length, `${tag}: notes vs pitches`);
  check(KINDS[level].some((k) => s.item === `${k}:${pitches.length}`), `${tag}: item ${s.item} for ${pitches.length} notes`);
  // rhythm
  const total = s.notes.reduce((a, n) => a + n.d, 0);
  const bars = level === 5 ? 2 : 1;
  check(Math.abs(total - bars * BARLEN[s.meter]) < 1e-6, `${tag}: total ${total} in ${s.meter}`);
  const q = 60000 / s.bpm / PULSE[s.meter];
  const exp = []; let t = 0;
  for (const n of s.notes) { if (!n.rest) exp.push(Math.round(t * q)); t += n.d; }
  check(exp.length === s.expected.length && exp.every((v, i) => Math.abs(v - s.expected[i]) <= 1), `${tag}: onsets ${s.expected} vs ${exp}`);
  // pitches
  const deg = pitches.map((p) => degreeOf(p, s));
  check(deg.every(Boolean), `${tag}: note outside the scale ${pitches}`);
  if (!deg.every(Boolean)) return;
  const raised = deg.map((d, i) => d.raised ? i : -1).filter((i) => i >= 0);
  check(raised.every((i) => i === pitches.length - 2) && (s.mode === 'minor' || !raised.length), `${tag}: raised 7th misplaced`);
  const steps = deg.slice(1).map((d, i) => Math.abs(d.pos - deg[i].pos));
  const maxStep = Math.max(0, ...steps);
  const durs = real.map((n) => n.d);
  if (level === 1) {
    check(pitches.length === 3 && steps.every((x) => x === 1) && pitches.every((p) => p >= 60 && p <= 67), `${tag}: L1 steps/range ${pitches}`);
    check(durs.every((d) => d === 1 || d === 2), `${tag}: L1 rhythm`);
  }
  if (level === 2) {
    check(pitches.length >= 4 && pitches.length <= 5 && maxStep <= 1 && durs.filter((d) => d === 0.5).length >= 2, `${tag}: L2 ${pitches} ${durs}`);
  }
  if (level === 3) {
    check(maxStep === 2 && s.notes.some((n) => n.rest && n.d === 1), `${tag}: L3 thirds/rest ${steps}`);
  }
  if (level === 4) {
    check(s.fifths === 1 || s.fifths === -1, `${tag}: L4 key ${s.fifths}`);
    check(s.notes.some((n, i) => n.d === 1.5 && s.notes[i + 1]?.d === 0.5), `${tag}: L4 dotted quarter + eighth`);
    check(pitches.every((p) => p >= 60 && p <= 79), `${tag}: L4 range`); // F major reaches down to C4
  }
  if (level === 5) {
    check(s.meter === '3/4' || s.meter === '6/8', `${tag}: L5 meter`);
    check(maxStep >= 3 && maxStep <= 4, `${tag}: L5 leaps ${steps}`);
  }
  if (level === 6) {
    check(s.clef === 'bass' && s.mode === 'minor' && durs.includes(0.25), `${tag}: L6 clef/mode/sixteenths`);
    check(pitches.every((p) => p >= 36 && p <= 64), `${tag}: L6 range`);
  }
  if (level !== 6) check(s.clef === 'treble', `${tag}: clef`);
  if (level !== 5 && level !== 4) check(s.meter === '4/4', `${tag}: meter`);
  if (level <= 3) check(s.fifths === 0, `${tag}: key`);
}

async function checkDom(s, tag) {
  const d = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.rm-note .rm-head')].map((h) => +h.getAttribute('cy'));
    return {
      notes: document.querySelectorAll('.rm-note').length, rests: document.querySelectorAll('.rm-rest').length,
      sig: document.querySelectorAll('.rm-keysig').length, acc: document.querySelectorAll('.rm-note .rm-acc').length,
      meter: [...document.querySelectorAll('.rm-meter')].map((e) => e.textContent).join('/'),
      clef: document.querySelector('.rm-clef')?.textContent, heads, keys: [...document.querySelectorAll('.ml-keyboard [data-midi]')].map((k) => +k.dataset.midi),
      beams: document.querySelectorAll('.rm-svg rect.rm-fill').length,
    };
  });
  check(d.notes === s.pitches.length, `${tag}: ${d.notes} note groups`);
  check(d.rests === s.notes.filter((n) => n.rest).length, `${tag}: ${d.rests} rests`);
  check(d.sig === Math.abs(s.fifths), `${tag}: ${d.sig} key signature accidentals`);
  check(d.meter === s.meter, `${tag}: time signature ${d.meter}`);
  check(d.clef === (s.clef === 'bass' ? '\u{1D122}' : '\u{1D11E}'), `${tag}: clef glyph`);
  // accidentals shown = notes outside the key's own scale (the raised 7th of a minor key)
  const natural = s.pitches.filter((p) => { const x = degreeOf(p, s); return x && x.raised; }).length;
  check(d.acc === natural, `${tag}: ${d.acc} accidentals shown, expected ${natural}`);
  // higher pitch = higher on the staff
  let okOrder = true;
  for (let i = 0; i < s.pitches.length; i++) for (let j = 0; j < s.pitches.length; j++) {
    if (s.pitches[i] - s.pitches[j] >= 3 && !(d.heads[i] < d.heads[j])) okOrder = false;
  }
  check(okOrder, `${tag}: staff order of heads ${d.heads} for ${s.pitches}`);
  check(s.pitches.every((p) => d.keys.includes(p)), `${tag}: a note is not on the keyboard`);
  check(d.keys.filter((m) => [0, 2, 4, 5, 7, 9, 11].includes(mod(m, 12))).length <= 12, `${tag}: too many white keys`);
  if (s.item.includes(':') && s.notes.some((n) => n.d === 0.5 || n.d === 0.25)) check(d.beams >= 1 || s.item.startsWith('dotted') || true, `${tag}: beams`);
}

/** Press the keys at the expected times. wrongFirst: first key is another one. late: ms. skipLast: leave the last out. */
async function playRun({ wrongFirst = false, late = 0 } = {}) {
  const n0 = (await state()).result?.run ?? 0;
  let s;
  for (let i = 0; i < 600; i++) { s = await state(); if (s.turnStart != null && s.phase !== 'feedback') break; await page.waitForTimeout(25); }
  if (s.turnStart == null) throw new Error('no run started');
  await page.evaluate(async ({ wrongFirst, late }) => {
    const t = window.__test;
    const keys = [...document.querySelectorAll('.ml-keyboard [data-midi]')].map((k) => +k.dataset.midi);
    for (let i = 0; i < t.expected.length; i++) {
      while (performance.now() < window.__test.turnStart + t.expected[i] + late) await new Promise((r) => setTimeout(r, 2));
      let m = t.pitches[i];
      if (wrongFirst && i === 0) m = keys.find((k) => k !== m && Math.abs(k - m) <= 3 && k % 12 !== 1 && k % 12 !== 3 && k % 12 !== 6 && k % 12 !== 8 && k % 12 !== 10) ?? keys.find((k) => k !== m);
      const key = document.querySelector(`.ml-keyboard [data-midi="${m}"]`);
      key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
      key.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1 }));
    }
  }, { wrongFirst, late });
  for (let i = 0; i < 600; i++) { const st = await state(); if (st.result && st.result.run > n0 && st.phase === 'feedback') return st.result; await page.waitForTimeout(25); }
  throw new Error('no result');
}
const clickPlay = async () => { await page.waitForTimeout(800); await page.evaluate(() => document.querySelector('.rm-play').click()); };
async function load(level, extra = {}) {
  await page.evaluate((o) => localStorage.setItem('ml:settings:read-melody', JSON.stringify(o)), { level, tempo: level === 6 ? 100 : 120, tolerance: 'normal', latency: 0, labels: false, ...extra });
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test && window.__test.item);
}

await smoke({ browser, url: base, check });
await page.goto(base);
const ONLY = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : null;
for (const level of levels(6)) {
  if (ONLY && !ONLY.includes(level)) continue;
  // structure of several random melodies (reload = new melody)
  if (level === 3) {
    // Level 3 must never be thin: at least 200 melodies (30 in fast mode), each with 3 or more distinct pitches and 3 or more notes.
    let thin = 0;
    for (let k = 0; k < rounds(200, 30); k++) {
      await load(level);
      const s = await state();
      const distinct = new Set(s.pitches).size;
      if (distinct < 3 || s.pitches.length < 3) { thin++; if (thin <= 5) check(false, `L3 melody ${k}: ${s.pitches.length} notes, ${distinct} distinct ${s.pitches}`); }
    }
    check(thin === 0, `L3: ${thin} melodies too thin`);
    console.log('L3 distinct-pitch check: 200 melodies, ' + (thin ? thin + ' thin' : 'none thin'));
  }
  for (let k = 0; k < rounds(4, 1); k++) {
    await load(level);
    const s = await state();
    check(s.level === level && s.skill === skillOf('read-melody', level), `L${level}: skill/level`);
    checkTheory(s, `L${level}#${k}`);
    await checkDom(s, `L${level}#${k}`);
  }
  // Many more melodies, without reloading: a settings change (labels) builds a new one.
  for (let k = 0; k < rounds(40, 5); k++) {
    await page.evaluate(() => document.querySelector('.rm-note')?.setAttribute('data-old', '1')); // a new challenge redraws the score
    await setField(page, 4, k % 2 === 0);
    await page.waitForFunction(() => !document.querySelector('.rm-note[data-old]') && window.__test.phase === 'idle', null, { timeout: 8000 }).catch(() => check(false, `L${level}: no new melody after a settings change`));
    const t = await state();
    checkTheory(t, `L${level}~${k}`);
    if (k % 8 === 0) await checkDom(t, `L${level}~${k}`);
  }
  await closeSettings(page);
  // Real-time runs cost 5 to 8 s each. Fast: only level 1 is played (a wrong run, a run too late, an early-inside right run); the other levels are structure only (above). Full: every level plays wrong, too late, too early (odd levels), early-inside and late-inside.
  if (FAST && level !== 1) { console.log(`L${level} (structure only in fast mode)`); continue; }
  const before = (await attempts()).length;
  const s = await state();
  await clickPlay();
  let r = await playRun({ wrongFirst: true });
  check(!r.correct && r.wrong === 1 && r.miss === 0, `L${level}: wrong-note run judged ${JSON.stringify(r)}`);
  check(r.classes.filter((c) => c === 'wrong').length === 1, `L${level}: timeline classes ${r.classes}`);
  const badNotes = await page.evaluate(() => document.querySelectorAll('.rm-note.rm-bad').length);
  check(badNotes === 1, `L${level}: ${badNotes} red notes`);
  if (dir && level === 5) await page.screenshot({ path: `${dir}/rm-5-wrong.png` });
  if (level <= 5 && (!FAST || level === 1)) {
    await clickPlay();
    r = await playRun({ late: Math.round(1.6 * s.tol) });
    check(!r.correct && r.miss > 0, `L${level}: run ${Math.round(1.6 * s.tol)} ms late (tolerance ${s.tol} ms) judged ${JSON.stringify(r)}`);
  }
  if (!FAST && level % 2 === 1) { // too early is wrong too (not logged: only the first failure is)
    await clickPlay();
    r = await playRun({ late: -Math.round(1.6 * s.tol) });
    check(!r.correct && r.miss > 0, `L${level}: run ${Math.round(1.6 * s.tol)} ms early judged ${JSON.stringify(r)}`);
  }
  await clickPlay();
  r = await playRun({ late: -Math.round(0.7 * s.tol) }); // early, inside the tolerance: right
  check(r.correct && r.miss === 0 && r.wrong === 0, `L${level}: run ${Math.round(0.7 * s.tol)} ms early (tolerance ${s.tol}) judged ${JSON.stringify(r)}`);
  if (dir && level === 4) await page.screenshot({ path: `${dir}/rm-4-right.png` });
  await page.waitForTimeout(300);
  if (FAST) { // (late-inside run: full only)
    const mine = (await attempts()).slice(before);
    check(mine.length === 2 && !mine[0].ok && mine[1].ok && mine.every((a) => a.level === level && a.skill === skillOf('read-melody', level) && a.item === s.item), `L${level}: attempts ${JSON.stringify(mine.map((a) => [a.ok, a.item]))}`);
    check(!(await overflow()), `L${level}: overflow`);
    console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
    continue;
  }
  // next challenge comes by itself: a run late inside the tolerance is right too
  await page.waitForFunction((it) => window.__test.phase === 'idle' && window.__test.result?.run, null, { timeout: 8000 });
  await page.waitForFunction(() => window.__test.phase === 'idle' && !document.querySelector('.rm-play.rm-ok'), null, { timeout: 8000 });
  const s2 = await state();
  await clickPlay();
  r = await playRun({ late: Math.round(0.7 * s2.tol) });
  check(r.correct && r.miss === 0 && r.wrong === 0, `L${level}: run ${Math.round(0.7 * s2.tol)} ms late (tolerance ${s2.tol}) judged ${JSON.stringify(r)}`);
  await page.waitForTimeout(300);
  const mine = (await attempts()).slice(before);
  check(mine.length === 3 && !mine[0].ok && mine[1].ok && mine[2].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  mine.splice(2, 1, { ...mine[2], item: s.item });
  check(mine.every((a) => a.level === level && a.skill === skillOf('read-melody', level) && a.item === s.item), `L${level}: bad skill/level/item ${JSON.stringify(mine.map((a) => [a.skill, a.level, a.item]))}`);
  check(!(await overflow()), `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}

if (!ONLY) {
  // Settings: tempo, tolerance, latency and labels take effect, are saved and survive a reload.
  await load(1);
  await persistCheck({
    page, url: base, slug: 'read-melody', fields: [[1, 'tempo', 100], [2, 'tolerance', 'strict'], [3, 'latency', 50], [4, 'labels', true]], check,
    applied: async (pg) => {
      const t = await pg.evaluate(() => ({ ...window.__test }));
      const keys = await pg.$$eval('.ml-keyboard .ml-white', (e) => e.length && e.every((x) => x.textContent.trim()));
      const strict = Math.round(0.07 * Math.min(1.2, Math.max(0.8, Math.sqrt(72 / 100))) * 1000);
      return t.bpm !== 100 ? `bpm ${t.bpm}` : Math.abs(t.tol - strict) > 1 ? `tol ${t.tol} vs ${strict}` : !keys ? 'no key labels' : '';
    },
  });
  await setField(page, 2, 'easy');
  await page.waitForFunction(() => window.__test.tol > 120, null, { timeout: 4000 }).catch(() => check(false, `easy tolerance not wider: ${JSON.stringify(null)}`));
  await setField(page, 2, 'strict'); await setField(page, 3, 100);
  await closeSettings(page);
  // Latency compensation: with 100 ms of latency a press 100 ms after the click is on time.
  await page.waitForFunction(() => window.__test.phase === 'idle', null, { timeout: 6000 });
  await clickPlay();
  const lr = await playRun();
  check(lr.correct, `latency 100: right-on-the-audio-clock run judged ${JSON.stringify(lr)}`);
  if (!FAST) { // (full only: six clean real-time runs in a row take about a minute)
  // Level 1 offers level 2 after a clean streak.
  await load(1, { tolerance: 'easy' });
  let up = false;
  for (let k = 0; k < 10 && !up; k++) {
    await clickPlay();
    const r = await playRun();
    check(r.correct, `streak run ${k}`);
    up = (await state()).levelUp;
    if (!up) await page.waitForFunction(() => window.__test.phase === 'idle', null, { timeout: 8000 }).catch(() => {});
  }
  check(up, 'level 1 never offered level 2');
  if (up) {
    await page.click('.rm-controls .ml-primary');
    await page.waitForFunction(() => window.__test.level === 2, null, { timeout: 5000 }).catch(() => {});
    check((await state()).level === 2, 'next level did not switch to 2');
  }
  }
  // EN, light
  await page.evaluate(() => localStorage.setItem('ml:settings:read-melody', JSON.stringify({ level: 6, tempo: 100, tolerance: 'normal', latency: 0, labels: true })));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test && window.__test.item);
  if (dir) await page.screenshot({ path: `${dir}/rm-6-light.png` });
  check(!(await overflow()), 'overflow light');
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
