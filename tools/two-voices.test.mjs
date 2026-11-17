// Plays every level of Two voices: a wrong answer (twice at round 1), then the right one. Recomputes the music rules from the MIDI notes.
// Usage: npx vite --port 5404 --strictPort &   then   PORT=5404 node tools/two-voices.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts, newAttempts, recordAudio, playedNotes, waitPlayed } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5404}/two-voices/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => readAttempts(page, 'two-voices');
const state = () => page.evaluate(() => window.__test.state());

const pc = (m) => ((m % 12) + 12) % 12;
const TONIC = { C: 0, G: 7, F: 5, Am: 9, Em: 4, Dm: 2 };
const SIG = { C: 0, G: 1, F: -1, Am: 0, Em: 1, Dm: -1 };
const MAJ = [0, 2, 4, 5, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11];
const NAT = [0, 2, 4, 5, 7, 9, 11];
const isMinor = (k) => k.endsWith('m');
const scale = (k) => (isMinor(k) ? HARM : MAJ).map((i) => pc(TONIC[k] + i));
const ROUNDS = { 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 8 };
const TEXTURES = { 1: ['drone', 'drone-top'], 2: ['tonic-fifth', 'oblique-fifth'], 3: ['thirds', 'sixths'], 4: ['contrary', 'oblique'], 5: ['cadence', 'two-to-one'], 6: ['suspension', 'minor-cadence'] };
const CONS = [0, 3, 4, 7, 8, 9];

function rules(level, s) {
  const { key, top: T, bottom: B, n } = s;
  const where = `L${level} ${key} T[${T}] B[${B}]`;
  const rel = (m) => pc(m - TONIC[key]);
  const tx = s.texture;
  check(TEXTURES[level].includes(tx) && s.item === tx, `${where}: texture ${tx} item ${s.item}`);
  check(T.length === n && B.length === n && n >= 3 && n <= 5, `${where}: lengths`);
  check(s.sig === SIG[key], `${where}: key signature`);
  check(T.every((m) => m >= 60 && m <= 79) && B.every((m) => m >= 43 && m <= 62), `${where}: ranges`);
  check(T.every((m) => scale(key).includes(pc(m))) && B.every((m) => scale(key).includes(pc(m))), `${where}: notes outside the key`);
  s.spellTop.forEach(([l, a], i) => check(pc(NAT[l] + a) === pc(T[i]), `${where}: spelling top ${i}`));
  s.spellBottom.forEach(([l, a], i) => check(pc(NAT[l] + a) === pc(B[i]), `${where}: spelling bottom ${i}`));
  check(T.every((m, i) => m - B[i] >= 3), `${where}: voices too close`);
  for (let i = 1; i < n; i++) { // no parallel fifths or octaves
    const a = pc(T[i - 1] - B[i - 1]), b = pc(T[i] - B[i]);
    const same = Math.sign(T[i] - T[i - 1]) === Math.sign(B[i] - B[i - 1]) && T[i] !== T[i - 1];
    check(!((a === 0 || a === 7) && a === b && same), `${where}: parallel perfect at ${i}`);
  }
  const vert = (i) => pc(T[i] - B[i]);
  const diat = (m) => { const k = scale(key).indexOf(pc(m)); return 7 * Math.floor((m - TONIC[key] - (isMinor(key) ? 0 : 0) + 12 * 5) / 12) + k; };
  const stepDeg = (a, lo, hi) => a.every((m, i) => !i || (Math.abs(diat(m) - diat(a[i - 1])) >= lo && Math.abs(diat(m) - diat(a[i - 1])) <= hi));
  const inChord = (m, c) => c.includes(rel(m));
  if (tx === 'drone') {
    check(key === 'C' && n === 3 && B.every((m) => m === B[0] && pc(m) === 0), `${where}: drone`);
    check([0, 7].includes(rel(T[2])) && T.slice(1).every((m, i) => Math.abs(m - T[i]) >= 1 && Math.abs(m - T[i]) <= 4), `${where}: melody`);
  }
  if (tx === 'drone-top') {
    check(key === 'C' && n === 3 && T.every((m) => m === T[0]) && [0, 4, 7].includes(rel(T[0])), `${where}: held top`);
    check(new Set(B).size >= 2 && stepDeg(B, 1, 2) && rel(B[2]) === 0, `${where}: bass walk`);
  }
  if (tx === 'tonic-fifth') {
    check(n === 3 || n === 5, `${where}: n`);
    B.forEach((m, i) => check(rel(m) === (i % 2 ? 7 : 0), `${where}: bass ${i}`));
    T.forEach((m, i) => check((i % 2 ? [7, 11, 2] : [0, 4, 7]).includes(rel(m)), `${where}: melody ${i} not a chord tone`));
    check(rel(T[n - 1]) === 0, `${where}: end`);
    check(T.slice(1).every((m, i) => Math.abs(m - T[i]) >= 1 && Math.abs(m - T[i]) <= 4), `${where}: leaps`);
  }
  if (tx === 'oblique-fifth') {
    check(n === 3 || n === 5, `${where}: n`);
    B.forEach((m, i) => check(rel(m) === (i % 2 ? 7 : 0), `${where}: bass ${i}`));
    check(T.slice(0, n - 1).every((m) => m === T[0]) && rel(T[0]) === 7, `${where}: held common tone`);
    check(rel(T[n - 1]) === 4 && diat(T[n - 1]) === diat(T[0]) - 2, `${where}: top ends a third lower`);
  }
  if (tx === 'thirds' || tx === 'sixths') {
    check(n === 4 || n === 5, `${where}: n`);
    const gaps = T.map((m, i) => diat(m) - diat(B[i]));
    check(gaps.every((g) => g === gaps[0]) && gaps[0] === (tx === 'thirds' ? 2 : 5), `${where}: not parallel ${tx} ${gaps}`);
    check(T.every((m, i) => (tx === 'thirds' ? [3, 4] : [8, 9]).includes(m - B[i])), `${where}: interval size`);
    check(s.tag === tx, `${where}: tag ${s.tag}`);
    check(stepDeg(T, 1, 1), `${where}: not by step`);
  }
  if (tx === 'contrary') {
    check(n === 4 || n === 5, `${where}: n`);
    for (let i = 1; i < n; i++) check(Math.sign(T[i] - T[i - 1]) * Math.sign(B[i] - B[i - 1]) === -1, `${where}: not contrary at ${i}`);
    check(T.every((m, i) => CONS.includes(vert(i))), `${where}: dissonant interval`);
    check(rel(B[n - 1]) === 0, `${where}: bass must end on tonic`);
  }
  if (tx === 'oblique') {
    check(n === 4 || n === 5, `${where}: n`);
    let tm = 0, bm = 0;
    for (let i = 1; i < n; i++) { const a = T[i] !== T[i - 1], b = B[i] !== B[i - 1]; check(a !== b, `${where}: not oblique at ${i}`); tm += a; bm += b; }
    check(tm > 0 && bm > 0, `${where}: both voices must move`);
    check(stepDeg(T, 0, 2) && stepDeg(B, 0, 2), `${where}: steps`);
    check(T.every((m, i) => CONS.includes(vert(i))), `${where}: dissonant interval`);
    check(rel(B[n - 1]) === 0 && [0, 4, 3].includes(rel(T[n - 1])), `${where}: ending`);
  }
  if (tx === 'cadence') {
    check(n === 4 && B.map(rel).join() === '0,5,7,0', `${where}: bass I IV V I ${B.map(rel)}`);
    const chords = [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]];
    T.forEach((m, i) => check(chords[i].includes(rel(m)), `${where}: melody ${i} not in chord ${i}`));
    check(rel(T[3]) === 0, `${where}: end on tonic`);
    if (rel(T[2]) === 11) check(T[3] === T[2] + 1, `${where}: leading tone does not rise`);
    check(T.slice(1).every((m, i) => Math.abs(m - T[i]) <= 4), `${where}: leaps`);
  }
  if (tx === 'two-to-one') {
    check(n === 5 && B.map(rel).join() === '0,0,7,7,0', `${where}: bass ${B.map(rel)}`);
    check(inChord(T[0], [0, 4, 7]) && inChord(T[2], [7, 11, 2]) && rel(T[4]) === 0, `${where}: strong beats are chord tones`);
    check(stepDeg(T, 1, 2) && new Set(T).size >= 4, `${where}: melody`);
    [0, 2, 4].forEach((i) => check(CONS.includes(vert(i)), `${where}: strong beat dissonant ${i}`));
    T.forEach((m, i) => { if (rel(m) === 11) check(i === 3 && T[4] === m + 1, `${where}: leading tone ${i}`); });
  }
  if (tx === 'suspension') {
    check(isMinor(key) && n === 5, `${where}: minor, 5 notes`);
    check(T[1] === T[2] && B[2] === B[3] && B[1] !== B[2], `${where}: suspension shape`);
    check([1, 2].includes(T[2] - T[3]), `${where}: no resolution down by step`);
    check(CONS.includes(vert(1)), `${where}: preparation dissonant`);
    check([5, 10].includes(vert(2)), `${where}: suspension is not a 4th or 7th ${vert(2)}`);
    check([3, 4, 8, 9].includes(vert(3)), `${where}: resolution is not a 3rd or 6th`);
    check(s.tag === (vert(2) === 5 ? 'four-three' : 'seven-six'), `${where}: tag ${s.tag}`);
    check(rel(B[4]) === 0 && rel(T[4]) === 0, `${where}: final tonic`);
    if (s.tag === 'four-three') check(rel(T[3]) === 11, `${where}: raised leading tone`);
  }
  if (tx === 'minor-cadence') {
    check(isMinor(key) && n === 4 && B.map(rel).join() === '0,5,7,0', `${where}: bass i iv V i ${B.map(rel)}`);
    const chords = [[0, 3, 7], [5, 8, 0], [7, 11, 2], [0, 3, 7]];
    T.forEach((m, i) => check(chords[i].includes(rel(m)), `${where}: melody ${i} not in chord ${i}`));
    check(rel(T[3]) === 0, `${where}: end on tonic`);
    if (rel(T[2]) === 11) check(T[3] === T[2] + 1, `${where}: leading tone does not rise`);
    check(T.slice(1).every((m, i) => Math.abs(m - T[i]) <= 4 && Math.abs(m - T[i]) !== 3 || Math.abs(m - T[i]) === 3 && ![8, 11].includes(rel(m)) ), `${where}: leaps or augmented second`);
  }
}

const key = (voice, midi) => `.tv-kb [data-midi="${midi}"]`;
async function select(v) { await page.click(`.tv-staff[data-voice="${v}"]`); }
async function enter(v, list) { await select(v); for (const m of list) await page.click(key(v, m)); }
async function settle() { await page.waitForFunction(() => { const t = window.__test.state(); return t.marks && (!t.locked || [...t.marks.top, ...t.marks.bottom].every(Boolean)); }); }
const other = (s, v, not) => { const w = []; for (let m = s.ranges[v][0]; m <= s.ranges[v][1]; m++) if (NAT.includes(pc(m)) && m !== not) w.push(m); return w[(not * 7) % w.length]; };

await smoke({ browser, url: base, check });
await recordAudio(page);
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:two-voices', JSON.stringify({ level: l, tempo: 100 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state().texture);
  await page.waitForTimeout(300);
  const seen = new Set(), lens = new Set(), tags = new Set();
  for (let round = 0; round < rounds(ROUNDS[level], 3); round++) {
    const s = await state();
    seen.add(s.key); lens.add(s.n); tags.add(s.tag);
    rules(level, s);
    const T = s.top, B = s.bottom;
    check(await page.$$eval('.tv-staff[data-voice="top"] .ml-note', (e) => e.length) === 1 && await page.$$eval('.tv-staff[data-voice="bottom"] .ml-note', (e) => e.length) === 1, `L${level}: only the first notes are written`);
    check(await page.$$eval('.ml-keysig', (e) => e.length) === 2 * Math.abs(s.sig), `L${level}: key signature on both staves`);
    check(await page.$$eval('.tv-kb .ml-white', (e) => e.length) <= 12, `L${level}: too many keys`);
    check(await page.$$eval('.tv-dot', (e) => e.length) === 2 * (s.n - 1), `L${level}: progress dots`);
    const before = (await attempts()).length;
    if (round === 0) { // wrong last note of the melody
      const bad = other(s, 'top', T[n(s)]);
      await enter('top', [...T.slice(1, -1), bad]);
      await enter('bottom', B.slice(1));
      await settle();
      let st = await state();
      check(st.marks.top.every((ok, i) => ok === (i !== s.n - 2)) && st.marks.bottom.every(Boolean), `L${level}: marks ${JSON.stringify(st.marks)}`);
      const colours = await page.$$eval('.tv-staff[data-voice="top"] .ml-note', (e) => e.map((g) => g.style.color));
      check(colours[colours.length - 1] === 'var(--bad)' && colours[1] === (s.n > 2 ? 'var(--good)' : colours[1]), `L${level}: colours ${JSON.stringify(colours)}`);
      check(await page.$('.ml-stage.ml-bad'), `L${level}: no wrong-answer feedback on the stage`);
      if (dir && level === 4) await page.screenshot({ path: `${dir}/tv-4-wrong.png` });
      await enter('top', [T[s.n - 1]]);
    } else if (round === 1) { // wrong first bass note, twice
      const bad = other(s, 'bottom', B[1]);
      await enter('top', T.slice(1));
      await enter('bottom', [bad, ...B.slice(2)]);
      await settle();
      let st = await state();
      check(st.marks.bottom[0] === false && st.marks.top.every(Boolean), `L${level}: bass marks ${JSON.stringify(st.marks)}`);
      await enter('bottom', [bad, ...B.slice(2)]);
      await settle();
      st = await state();
      check(st.marks.bottom[0] === false, `L${level}: second mistake marked`);
      await enter('bottom', B.slice(1));
    } else {
      await enter('top', T.slice(1));
      await enter('bottom', B.slice(1));
    }
    await settle();
    const fin = await state();
    check(fin.marks.top.every(Boolean) && fin.marks.bottom.every(Boolean) && fin.entered.top.join() === T.slice(1).join() && fin.entered.bottom.join() === B.slice(1).join(), `L${level} round ${round}: final ${JSON.stringify(fin.entered)}`);
    if (dir && round === 2 && level === 6) await page.screenshot({ path: `${dir}/tv-6-fr.png` });
    const mine = await newAttempts(page, 'two-voices', before);
    await page.waitForFunction(() => { const t = window.__test.state(); return t.marks === null && !t.locked; }, null, { timeout: 8000 });
    check(mine.length === 1 && mine[0].ok === (round > 1) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skillOf('two-voices', level), `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  // Many generated questions: rules on all of them, at least two textures, every key of the level, G major thirds.
  const smp = await page.evaluate(([l, k]) => window.__test.sample(l, k), [level, rounds(level === 3 ? 600 : 300, level === 3 ? 300 : 150)]);
  const byTex = {}, byKey = {};
  for (const x of smp) { rules(level, x); byTex[x.texture] = (byTex[x.texture] || 0) + 1; byKey[x.key + '/' + x.texture] = 1; }
  check(Object.keys(byTex).length >= 2 && TEXTURES[level].every((t) => byTex[t]), `L${level}: textures seen ${JSON.stringify(byTex)}`);
  check(new Set(smp.map((x) => x.key)).size === { 1: 1, 2: 2 }[level] || level > 2, `L${level}: keys`);
  for (const t of TEXTURES[level]) { // each texture must be possible in each key of the level
    const keys = await page.evaluate(([l, t2, c]) => [...new Set(window.__test.sample(l, c, t2).map((x) => x.key))], [level, t, rounds(60, 40)]);
    const want = { 1: ['C'], 2: ['C', 'G'], 3: ['C', 'G', 'F'], 4: ['C', 'G', 'F'], 5: ['C', 'G', 'F'], 6: ['Am', 'Em', 'Dm'] }[level];
    check(want.every((k) => keys.includes(k)), `L${level} ${t}: keys ${keys}`);
  }
  if (level === 3) {
    const g3 = smp.filter((x) => x.key === 'G' && x.texture === 'thirds');
    check(g3.length > 0, 'G major: no parallel thirds');
    check(g3.some((x) => [...x.top, ...x.bottom].some((m) => m % 12 === 6)), 'G major thirds: no F sharp seen');
    check(g3.every((x) => [...x.spellTop, ...x.spellBottom].every(([l, a]) => (l === 3 ? a === 1 : a === 0))), 'G major thirds: wrong spelling (F must be F sharp)');
    console.log('L3 G thirds', g3.length, 'of', smp.length);
  }
  console.log(`L${level}`, [...seen].join(' '), [...lens].join(','), [...tags].join(','), JSON.stringify(byTex));
}
function n(s) { return s.n - 1; }
// Playback = both voices as written (the bass timbre sounds an octave below its note), spaced by the tempo; the tempo is saved.
await page.evaluate(() => localStorage.setItem('ml:settings:two-voices', JSON.stringify({ level: 3, tempo: 100 })));
await page.reload();
await page.click('.ml-start');
{
  let st = await state();
  let p = await waitPlayed(page, 4);
  const n0 = st.n;
  const stNow = await state();
  check(p.length >= stNow.n && p.slice(0, stNow.n).every((x, i) => x.midi === stNow.bottom[i] - 12), `playback ${JSON.stringify(p.map((x) => x.midi))} vs bass ${stNow.bottom}`);
  check(Math.abs(p[1].when - p[0].when - 0.6) < 0.02, `tempo 100: spacing ${p[1].when - p[0].when}`);
  await persistCheck({ page, url: base, slug: 'two-voices', fields: [[1, 'tempo', 50]], check });
  p = await waitPlayed(page, 3);
  check(p.length >= 2 && Math.abs(p[1].when - p[0].when - 1.2) < 0.02, `tempo 50 after reload: spacing ${p.length > 1 && p[1].when - p[0].when}`);
}
// Undo, then next-level button after a clean streak.
await page.evaluate(() => localStorage.setItem('ml:settings:two-voices', JSON.stringify({ level: 2, tempo: 100 })));
await page.reload();
await page.click('.ml-start');
await page.waitForFunction(() => window.__test?.state().texture);
await page.waitForTimeout(300);
let s = await state();
await enter('top', [s.top[1]]);
check((await state()).entered.top.length === 1, 'key adds a note');
await page.click('.tv-undo');
check((await state()).entered.top.length === 0 && (await page.$$eval('.tv-staff[data-voice="top"] .ml-note', (e) => e.length)) === 1, 'undo removes the note');
for (let i = 0; i < 6; i++) {
  s = await state();
  await enter('top', s.top.slice(1));
  await enter('bottom', s.bottom.slice(1));
  await page.waitForFunction(() => { const t = window.__test.state(); return t.marks === null && !t.locked && !t.entered.top.length; }, null, { timeout: 10000 });
}
check(await page.$eval('.tv-next', (e) => e.classList.contains('tv-show')), 'next-level button after a clean streak');
await page.click('.tv-next');
await page.waitForTimeout(400);
check((await state()).level === 3, 'next level click');
// English, dark, level 6.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:two-voices', JSON.stringify({ level: 3, tempo: 100 })));
await en.reload();
await en.click('.ml-start');
await en.waitForFunction(() => window.__test?.state().texture);
await en.waitForTimeout(400);
const es = await en.evaluate(() => window.__test.state());
await en.click('.tv-staff[data-voice="top"]');
for (const m of es.top.slice(1, 3)) await en.click(`.tv-kb [data-midi="${m}"]`);
if (dir) await en.screenshot({ path: `${dir}/tv-3-en-dark.png` });
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN overflow');
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
