// Plays every level of Sight-singing with injected pitches: wrong note, then the melody sung in tune.
// Also checks the written melodies against music theory (key, intervals, accidentals) and the voice setting.
// Usage: npx vite --port 5309 --strictPort &   then   PORT=5309 node tools/sight-sing.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5309}/sight-sing/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // microphone test: pitches are fed in real time (accelerated timers made it hang when run next to other microphone tests)
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => window.__test.state());
const feed = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await page.evaluate((m) => window.__test.feed(m), midi); await page.waitForTimeout(40); } };
const listening = async () => { for (let i = 0; i < 200; i++) { const s = await state(); if (s.listening && !s.done) return s; await feed(null, 80); } throw new Error('never listening'); };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'sight-sing').sort((x, y) => x.t - y.t)); }; }));
const setup = async (level, voice = 'child') => {
  await page.evaluate(([l, v]) => localStorage.setItem('ml:settings:sight-sing', JSON.stringify({ level: l, voice: v, tolerance: 50 })), [level, voice]);
  await page.reload();
  await page.click('.ml-start');
  await page.evaluate(() => window.__test.feed(null));
};

const mod = (n, m) => ((n % m) + m) % m;
const NAT = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11], HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const VOICES = { child: [60, 69], high: [57, 74], medium: [48, 62], low: [43, 57] };

/** Theory check of one written melody. */
function theory(s, level, voice) {
  const tag = `L${level}`;
  const n = s.notes, m = n.map((x) => x.midi);
  const majorTonic = mod(s.keySig * 7, 12);
  const tonic = level === 6 ? mod(majorTonic + 9, 12) : majorTonic;
  const pcs = (level === 6 ? HARMONIC : MAJOR).map((x) => mod(tonic + x, 12));
  check(m.every((x) => pcs.includes(mod(x, 12))), `${tag}: note outside the key ${JSON.stringify(m)} sig ${s.keySig}`);
  check(m.every((x, i) => !i || x !== m[i - 1]), `${tag}: repeated note`);
  // spelling: the letter of the step and the accidental give the midi number
  for (const x of n) check(12 * (Math.floor(x.step / 7) + 1) + NAT[mod(x.step, 7)] + x.acc === x.midi, `${tag}: spelling of ${x.midi}`);
  const steps = n.map((x) => x.step);
  const range = Math.max(...steps) - Math.min(...steps) + 1;
  check(s.item === `${n.length}:${range}`, `${tag}: item ${s.item} vs ${n.length}:${range}`);
  const maxLeap = Math.max(...steps.slice(1).map((v, i) => Math.abs(v - steps[i])));
  const [lo, hi] = VOICES[voice];
  const mid = (Math.min(...m) + Math.max(...m)) / 2;
  check(Math.abs(mid - (lo + hi) / 2) <= 6, `${tag}: melody not in the ${voice} voice (centre ${mid})`);
  const mean = m.reduce((x, y) => x + y, 0) / m.length; // the game picks the clef from the average pitch
  check((s.clef === 'bass') === (mean < 57), `${tag}: clef ${s.clef} for average ${mean}`);
  if (level <= 2) {
    check(m.every((x) => [0, 2, 4, 7, 9].includes(mod(x, 12))) && s.keySig === 0, `${tag}: not the C pentatonic scale`);
    check(m.every((x, i) => !i || Math.abs(x - m[i - 1]) <= 3), `${tag}: leap bigger than a pentatonic step`);
  }
  if (level === 1) check(n.length >= 2 && n.length <= 3 && mod(m[0], 12) === 0, `${tag}: must be 2-3 notes from the tonic`);
  if (level === 2) check(n.length >= 3 && n.length <= 4, `${tag}: must be 3-4 notes`);
  if (level === 3) check(n.length >= 3 && n.length <= 4 && s.keySig === 0 && maxLeap <= 2, `${tag}: steps and thirds in C (${n.length} notes, leap ${maxLeap})`);
  if (level === 4) {
    check(n.length === 5 && s.keySig === 0, `${tag}: 5 notes in C`);
    check(steps.some((v, i) => i && Math.abs(v - steps[i - 1]) === 4), `${tag}: no leap to a fifth`);
  }
  if (level === 5) check(n.length === 5 && [1, -1, 2, -2].includes(s.keySig), `${tag}: 5 notes in G, F, D or Bb`);
  if (level === 6) {
    const raised = m.filter((x) => mod(x, 12) === mod(tonic - 1, 12));
    check(n.length === 6 && raised.length === 1 && mod(m[5], 12) === tonic, `${tag}: minor, 6 notes, raised seventh once, ends on tonic (${m})`);
    check(m[4] === raised[0] && m[5] - m[4] === 1, `${tag}: leading tone should lead to the tonic`);
    check(s.keySig !== 0 || n[4].acc === 1, `${tag}: raised seventh not written with an accidental`);
  }
}

await page.goto(base);
for (const level of levels(6)) {
  await setup(level);
  // The first note is played by the app: nothing sung into the microphone counts meanwhile.
  let s0 = await state();
  for (let i = 0; i < 50 && !s0.notes; i++) { await page.waitForTimeout(100); s0 = await state(); }
  // (read the log only once the app is up: opening IndexedDB before the app creates its stores leaves an empty database and hangs under load)
  const before = (await attempts()).length;
  if (!s0.listening) {
    await feed(s0.notes[0].midi + 3, 800);
    s0 = await state();
    check(!s0.wrongLogged && s0.idx === 0 && !s0.done, `L${level}: reading counted while the app plays`);
  }
  let s = await listening();
  const item = s.item;
  theory(s, level, 'child');
  const staff = await page.evaluate(() => ({ notes: document.querySelectorAll('.ml-note').length, sig: document.querySelectorAll('.ml-keysig').length, clef: document.querySelectorAll('.ml-clef').length }));
  check(staff.notes === s.notes.length && staff.sig === Math.abs(s.keySig) && staff.clef === 1, `L${level}: staff drawing ${JSON.stringify(staff)}`);
  if (dir && [3, 6].includes(level)) await page.screenshot({ path: `${dir}/ss-${level}.png` });
  // 1. A steady wrong note counts once and restarts from the first note.
  let wrongNote = s.notes[0].midi + 1;
  while (Math.abs(mod(wrongNote - s.notes[0].midi + 6, 12) - 6) < 1.2) wrongNote++;
  await feed(wrongNote, 2600);
  s = await state();
  check(s.wrongLogged, `L${level}: wrong note not logged`);
  // 2. Sing the melody: one octave lower on odd levels.
  s = await listening();
  check(s.item === item && s.idx === 0, `L${level}: did not restart from the first note`);
  for (let i = 0; i < s.notes.length; i++) {
    const cur = await listening();
    check(cur.idx === i, `L${level}: expected note ${i}, got ${cur.idx}`);
    await feed(cur.notes[i].midi - (level % 2 ? 12 : 0) + 0.2, 900);
    await feed(null, 500);
  }
  await feed(null, 800);
  const mine = (await attempts()).slice(before);
  check(mine.length === 2 && !mine[0].ok && mine[1].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  check(mine.every((a) => a.level === level && a.skill === 'sing.sight' && a.item === item), `L${level}: bad skill, level or item`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
  // 3. Sample other melodies of the level (Skip logs a miss and draws the next one).
  for (let k = 0; k < rounds(14, 4); k++) {
    await page.click('.ss-skip');
    await page.waitForTimeout(150);
    const t = await state();
    if (t.notes) theory(t, level, 'child');
  }
}
// Voice setting: the melody moves by octaves, the clef follows.
for (const voice of rounds(["low", "medium", "high"], ["low"])) {
  await setup(3, voice);
  await listening();
  for (let k = 0; k < 6; k++) {
    const t = await state();
    if (t.notes) theory(t, 3, voice);
    await page.click('.ss-skip');
    await page.waitForTimeout(200);
  }
  if (dir && voice === 'low') await page.screenshot({ path: `${dir}/ss-low.png` });
  console.log('voice', voice, (await state()).clef);
}
// Refused microphone: message and retry.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: 'en-US', colorScheme: 'light' });
const p2 = await ctx2.newPage();
await p2.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')); });
await p2.goto(base);
await p2.click('.ml-start');
await p2.waitForSelector('.ml-prompt');
check((await p2.locator('.ml-btn.ml-primary').count()) === 1, 'no retry button when the microphone is refused');
if (dir) await p2.screenshot({ path: `${dir}/ss-nomic.png` });
await ctx2.close();
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
