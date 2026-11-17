// Plays every level of Write the tune: a wrong tune (twice at round 1), then the right one. Recomputes the music rules.
// Usage: npx vite --port 5302 --strictPort &   then   PORT=5302 node tools/melody-dictation.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, recordAudio, playedNotes, waitPlayed, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5302}/melody-dictation/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => readAttempts(page, 'melody-dictation');
const newAttemptsOf = async (before) => { const t0 = Date.now(); for (;;) { const a = (await attempts()).slice(before); if (a.length || Date.now() - t0 > 6000) return a; await new Promise((r) => setTimeout(r, 80)); } };
const state = () => page.evaluate(() => window.__test.state());

const pc = (m) => ((m % 12) + 12) % 12;
const TONIC = { C: 0, G: 7, F: 5, D: 2, Bb: 10, Am: 9, Em: 4, Dm: 2, Gm: 7 };
const SIG = { C: 0, G: 1, F: -1, D: 2, Bb: -2, Am: 0, Em: 1, Dm: -1, Gm: -2 };
const MAJ = [0, 2, 4, 5, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11], PENTA = [0, 2, 4, 7, 9];
const NAT = [0, 2, 4, 5, 7, 9, 11];
const isMinor = (k) => k.endsWith('m');
const scalePcs = (k, ivs) => new Set(ivs.map((i) => pc(TONIC[k] + i)));
const ROUNDS = { 1: 6, 2: 6, 3: 6, 4: 6, 5: 8, 6: 12 };
const NOTES = { 1: [3], 2: [4], 3: [5], 4: [6], 5: [6, 7], 6: [8] };

function rules(level, s) {
  const { key, melody: m, n } = s;
  const where = `L${level} ${key} [${m}]`;
  check(NOTES[level].includes(n) && m.length === n && s.item === String(n), `${where}: length/item ${n} ${s.item}`);
  const ends = [TONIC[key], pc(TONIC[key] + 7)];
  check(ends.includes(pc(m[n - 1])), `${where}: must end on tonic or fifth`);
  check(m.every((x, i) => i === 0 || x !== m[i - 1]) || level >= 4, `${where}: repeated note`);
  const ivs = m.slice(1).map((x, i) => Math.abs(x - m[i]));
  check(Math.max(...ivs) <= 7, `${where}: leap too big`);
  // Spelling: letter + accidental must give the MIDI pitch class.
  s.spelling.forEach(([l, a], i) => check(pc(NAT[l] + a) === pc(m[i]), `${where}: spelling of note ${i}`));
  if (level === 1) {
    check(!(key !== 'C'), where);
    check(m.every((x) => x >= 60 && x <= 69 && scalePcs('C', PENTA).has(pc(x))), `${where}: not C pentatonic C4-A4`);
    const list = [60, 62, 64, 67, 69];
    check(m.slice(1).every((x, i) => Math.abs(list.indexOf(x) - list.indexOf(m[i])) === 1), `${where}: not steps`);
  }
  if (level === 2) check(key === 'C' && m.every((x) => x >= 60 && x <= 72 && scalePcs('C', MAJ).has(pc(x))) && ivs.every((d) => d >= 1 && d <= 4), `${where}: steps and thirds in C`);
  if (level === 3) check(key === 'C' && m.every((x) => scalePcs('C', MAJ).has(pc(x))) && ivs.every((d) => d <= 7) && ivs.filter((d) => d >= 5).length <= 1, `${where}: leaps`);
  if (level === 4) check(['G', 'F', 'D', 'Bb'].includes(key) && s.sig === SIG[key] && m.every((x) => scalePcs(key, MAJ).has(pc(x))), `${where}: key signature level`);
  if (level === 5) {
    const lead = pc(TONIC[key] + 11);
    check(isMinor(key) && s.sig === SIG[key] && m.every((x) => scalePcs(key, HARM).has(pc(x))) && m.some((x) => pc(x) === lead), `${where}: minor with raised seventh`);
  }
  if (level === 6) {
    check(['C', 'G', 'F'].includes(key) && s.sig === SIG[key], `${where}: key`);
    const out = m.map((x, i) => (scalePcs(key, MAJ).has(pc(x)) ? -1 : i)).filter((i) => i >= 0);
    check(out.length >= 1 && out.length <= 2, `${where}: ${out.length} chromatic notes`);
    for (const i of out) check(i > 0 && i < n - 1 && Math.abs(m[i + 1] - m[i - 1]) === 2 && (m[i] - m[i - 1]) * (m[i + 1] - m[i]) > 0 && Math.abs(m[i] - m[i - 1]) === 1, `${where}: passing note ${i}`);
    const [lo, hi] = s.clef === 'bass' ? [43, 60] : [60, 76];
    check(m.every((x) => x >= lo && x <= hi), `${where}: range for ${s.clef}`);
  }
  if (level < 6) check(s.clef === 'treble', `${where}: clef`);
}

const key = (midi) => `.md-kb [data-midi="${midi}"]`;
async function enter(list) { for (const m of list) await page.click(key(m)); }
async function settle() { await page.waitForFunction(() => window.__test.state().marks); }
/** A white key of the range that is not `not`. */
const other = (s, not) => { const w = []; for (let m = s.range[0]; m <= s.range[1]; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(pc(m)) && m !== not) w.push(m); return w[(not * 7) % w.length]; };

await smoke({ browser, url: base, check });
await recordAudio(page);
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:melody-dictation', JSON.stringify({ level: l, tempo: 120 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const seen = new Set(), clefs = new Set(), lens = new Set();
  for (let round = 0; round < rounds(ROUNDS[level], 3); round++) {
    const s = await state();
    seen.add(s.key); clefs.add(s.clef); lens.add(s.n);
    rules(level, s);
    const m = s.melody;
    // Display: first note on the staff, key signature symbols, at most 12 white keys.
    check(await page.$$eval('.ml-note', (e) => e.length) === 1, `L${level}: only the first note is written at the start`);
    check(await page.$$eval('.ml-keysig', (e) => e.length) === Math.abs(s.sig), `L${level}: key signature symbols`);
    check(await page.$$eval('.md-kb .ml-white', (e) => e.length) <= 12, `L${level}: too many keys`);
    check(await page.$$eval('.md-dot', (e) => e.length) === s.n - 1, `L${level}: progress dots`);
    const before = (await attempts()).length;
    const w = m.length - 1; // index of the last note
    if (round === 0 || round === 1) {
      const at = round === 0 ? w : 1; // a mistake at the end, or at the first typed note
      const bad = other(s, m[at]);
      await enter([...m.slice(1, at), bad, ...m.slice(at + 1)]);
      check((await page.$$eval('.ml-note', (e) => e.length)) === m.length, `L${level}: notes on the staff`);
      await settle();
      let st = await state();
      check(st.marks.length === m.length - 1 && st.marks.every((ok, i) => ok === (i + 1 !== at)), `L${level}: marks ${JSON.stringify(st.marks)}`);
      const colours = await page.$$eval('.ml-note', (e) => e.map((g) => g.style.color));
      check(colours.slice(1).every((c, i) => c === (st.marks[i] ? 'var(--good)' : 'var(--bad)')), `L${level}: colours ${JSON.stringify(colours)}`);
      if (dir && round === 0 && level === 4) await page.screenshot({ path: `${dir}/md-4-wrong.png` });
      if (round === 1) { // a second mistake is not logged again
        await enter([bad, ...m.slice(2)]);
        await settle();
        st = await state();
        check(st.marks[0] === false, `L${level}: second mistake marked`);
      }
      // Correct it: the next key keeps what came before the first mistake.
      await enter(m.slice(round === 0 ? at : 1));
    } else {
      await enter(m.slice(1));
    }
    await settle();
    const done = await state();
    check(done.marks.every(Boolean) && done.entered.join() === m.slice(1).join(), `L${level} round ${round}: final ${JSON.stringify(done.entered)} vs ${m}`);
    if (dir && round === 2 && level === 6) await page.screenshot({ path: `${dir}/md-6-${s.clef}.png` });
    const mine = await newAttemptsOf(before);
    await page.waitForFunction(() => { const t = window.__test.state(); return t.marks === null && t.locked === false; }, null, { timeout: 8000 });
    check(mine.length === 1 && mine[0].ok === (round > 1) && mine[0].level === level && mine[0].item === String(s.n) && mine[0].skill === skillOf('melody-dictation', level), `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  // Many more generated tunes without playing them: changing a setting draws a new question.
  for (let i = 0; i < rounds(60, 12); i++) {
    await setField(page, 1, 60 + (i % 2) * 5);
    await page.waitForFunction((k) => window.__test.state().melody && window.__test.state().locked === false, null, { timeout: 5000 }).catch(() => {});
    const t = await state();
    rules(level, t);
    seen.add(t.key); clefs.add(t.clef); lens.add(t.n);
  }
  await closeSettings(page);
  if (level === 6) check(clefs.has('treble') && clefs.has('bass'), 'L6: both clefs should appear (sampled)');
  if (level === 5 && !FAST) check(lens.has(6) && lens.has(7), 'L5: lengths 6 and 7 both appear');
  if (level === 4 && !FAST) check(seen.size >= 3, `L4: keys ${[...seen]}`);
  if (level === 6) check(clefs.has('treble') && clefs.has('bass'), 'L6: both clefs should appear');
  if (level === 5) check(lens.size >= 1, 'L5 lengths');
  console.log(`L${level}`, [...seen].join(' '), [...clefs].join('/'), [...lens].join(','));
}
// Playback = the melody, spaced by the tempo setting; the setting is saved and still applied after a reload.
await page.evaluate(() => localStorage.setItem('ml:settings:melody-dictation', JSON.stringify({ level: 3, tempo: 120 })));
await page.reload();
await page.click('.ml-start');
{
  let p = await waitPlayed(page, 5);
  let st = await state();
  check(p.length >= st.n && p.slice(0, st.n).every((x, i) => x.midi === st.melody[i]), `playback ${JSON.stringify(p.map((x) => x.midi))} vs ${st.melody}`);
  check(Math.abs(p[1].when - p[0].when - 0.5) < 0.02, `tempo 120: spacing ${p[1].when - p[0].when}`);
  await persistCheck({ page, url: base, slug: 'melody-dictation', fields: [[1, 'tempo', 60]], check });
  p = await waitPlayed(page, 5);
  check(p.length >= 2 && Math.abs(p[1].when - p[0].when - 1) < 0.02, `tempo 60 after reload: spacing ${p.length > 1 && p[1].when - p[0].when}`);
  await persistCheck({ page, url: base, slug: 'melody-dictation', fields: [[0, 'level', 5]], check, applied: async (pg) => ((await pg.evaluate(() => window.__test.state().level)) === 5 ? '' : 'level not applied') });
}
// Undo, then next-level button after a clean streak.
await page.evaluate(() => localStorage.setItem('ml:settings:melody-dictation', JSON.stringify({ level: 2, tempo: 120 })));
await page.reload();
await page.click('.ml-start');
await page.waitForTimeout(300);
let s = await state();
await page.click(key(s.melody[1]));
check((await state()).entered.length === 1, 'key adds a note');
await page.click('.md-undo');
check((await state()).entered.length === 0 && (await page.$$eval('.ml-note', (e) => e.length)) === 1, 'undo removes the note');
for (let i = 0; i < 6; i++) {
  s = await state();
  const before = JSON.stringify(s.melody);
  await enter(s.melody.slice(1));
  await page.waitForFunction((b) => { const t = window.__test.state(); return t.entered.length === 0 && !t.locked && JSON.stringify(t.melody) !== b; }, before, { timeout: 8000 });
}
check(await page.$eval('.md-next', (e) => e.classList.contains('md-show')), 'next-level button after a clean streak');
await page.waitForSelector('.md-next.md-show');
await page.click('.md-next');
await page.waitForTimeout(400);
check((await state()).level === 3, 'next level click');
// English, dark, bass clef at level 6.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:melody-dictation', JSON.stringify({ level: 5, tempo: 120 })));
await en.reload();
await en.click('.ml-start');
await en.waitForTimeout(400);
const es = await en.evaluate(() => window.__test.state());
for (const m of es.melody.slice(1, 4)) await en.click(key(m));
if (dir) await en.screenshot({ path: `${dir}/md-5-en-dark.png` });
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN L5 overflow');
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
