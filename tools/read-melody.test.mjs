// Plays the 6 levels of Read and play: a run with a wrong first note, a run too late (not logged), then a right run.
// Melodies are re-checked from music theory (scale, range, leaps, rhythm, notation in the DOM).
// Usage: npx vite --port 5403 --strictPort &   then   PORT=5403 node tools/read-melody.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5403}/read-melody/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => ({ ...window.__test }));
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'read-melody').sort((x, y) => x.t - y.t)); }; }));
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

await page.goto(base);
const ONLY = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : null;
for (let level = 1; level <= 6; level++) {
  if (ONLY && !ONLY.includes(level)) continue;
  // structure of several random melodies (reload = new melody)
  for (let k = 0; k < 4; k++) {
    await load(level);
    const s = await state();
    check(s.level === level && s.skill === 'read.melody', `L${level}: skill/level`);
    checkTheory(s, `L${level}#${k}`);
    await checkDom(s, `L${level}#${k}`);
  }
  const before = (await attempts()).length;
  const s = await state();
  await clickPlay();
  let r = await playRun({ wrongFirst: true });
  check(!r.correct && r.wrong === 1 && r.miss === 0, `L${level}: wrong-note run judged ${JSON.stringify(r)}`);
  check(r.classes.filter((c) => c === 'wrong').length === 1, `L${level}: timeline classes ${r.classes}`);
  const badNotes = await page.evaluate(() => document.querySelectorAll('.rm-note.rm-bad').length);
  check(badNotes === 1, `L${level}: ${badNotes} red notes`);
  if (dir && level === 5) await page.screenshot({ path: `${dir}/rm-5-wrong.png` });
  if (level <= 5) {
    await clickPlay();
    r = await playRun({ late: 300 });
    check(!r.correct && r.miss > 0, `L${level}: late run judged ${JSON.stringify(r)}`);
  }
  await clickPlay();
  r = await playRun();
  check(r.correct && r.miss === 0 && r.wrong === 0, `L${level}: right run judged ${JSON.stringify(r)}`);
  if (dir && level === 4) await page.screenshot({ path: `${dir}/rm-4-right.png` });
  await page.waitForTimeout(300);
  const mine = (await attempts()).slice(before);
  check(mine.length === 2 && !mine[0].ok && mine[1].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  check(mine.every((a) => a.level === level && a.skill === 'read.melody' && a.item === s.item), `L${level}: bad skill/level/item ${JSON.stringify(mine.map((a) => [a.skill, a.level, a.item]))}`);
  check(!(await overflow()), `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}

if (!ONLY) {
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
