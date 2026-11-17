// Plays every level of Play the note, on the keyboard (wrong key, then right) and with injected microphone pitches
// (steady wrong note, then the right one in another octave, with transposing instruments).
// Usage: npx vite --port 5409 --strictPort &   then   PORT=5409 node tools/play-the-note.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5409}/play-the-note/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // microphone test: pitches are fed in real time (accelerated timers made it hang when run next to other microphone tests)
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => window.__test.state());
const attempts = () => readAttempts(page, 'play-the-note');
const feed = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await page.evaluate((m) => window.__test.feed(m), midi); await page.waitForTimeout(40); } };
const ready = async (mic) => { for (let i = 0; i < 300; i++) { const s = await state(); if (!s.locked && s.item && (!mic || s.listening)) return s; if (mic) await feed(null, 80); else await page.waitForTimeout(80); } throw new Error('not ready'); };

// Theory, recomputed here.
const LEVELS = {
  1: { clef: 'treble', lo: 60, hi: 67, acc: false }, 2: { clef: 'treble', lo: 60, hi: 72, acc: false },
  3: { clef: 'treble', lo: 57, hi: 79, acc: false }, 4: { clef: 'treble', lo: 60, hi: 72, acc: true },
  5: { clef: 'bass', lo: 48, hi: 60, acc: false }, 6: { clef: 'bass', lo: 40, hi: 64, acc: true },
};
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const TRANSPOSE = { C: 0, Bb: -2, Eb: -9, F: -7 };
const NAT = [0, 2, 4, 5, 7, 9, 11];
const nameOf = (m, flat) => (flat ? FLAT : SHARP)[m % 12] + (Math.floor(m / 12) - 1);
const checkItem = (level, s, tag) => {
  const L = LEVELS[level];
  const [clef, nm] = s.item.split(':');
  const isNat = NAT.includes(s.midi % 12);
  check(clef === L.clef && s.midi >= L.lo && s.midi <= L.hi, `${tag}: ${s.item} outside level`);
  check(nm === nameOf(s.midi, false) || nm === nameOf(s.midi, true), `${tag}: item name ${s.item} does not match midi ${s.midi}`);
  check(L.acc || isNat, `${tag}: accidental in a natural-only level`);
};
const open = async (level, input, instrument) => {
  await page.evaluate(([l, i, ins]) => localStorage.setItem('ml:settings:play-the-note', JSON.stringify({ level: l, input: i, instrument: ins, hear: false, labels: false })), [level, input, instrument]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test);
};

await smoke({ browser, url: base, check });
await page.goto(base);
// ---- keyboard ----
for (const level of levels(6)) {
  await open(level, 'keyboard', 'C');
  const seen = new Set();
  for (let round = 0; round < rounds(8, 2); round++) {
    const s = await ready(false);
    seen.add(s.item);
    checkItem(level, s, `kb L${level}`);
    check(s.win && s.midi >= s.win[0] && s.midi <= s.win[1], `kb L${level}: note not on the keyboard ${s.midi} ${s.win}`);
    const whites = await page.$$eval('.ml-white', (ks) => ks.length);
    check(whites <= 12, `kb L${level}: ${whites} white keys`);
    const before = (await attempts()).length;
    if (round === 0) {
      if (dir && [1, 6].includes(level)) await page.screenshot({ path: `${dir}/ptn-${level}.png` });
      const bad = await page.$$eval('.ml-white', (ks, m) => ks.map((k) => +k.dataset.midi).find((x) => x !== m), s.midi);
      await page.click(`.ml-white[data-midi="${bad}"]`);
      await page.waitForTimeout(150);
      check((await state()).item === s.item, `kb L${level}: note changed after a wrong key`);
      await page.click(`.ml-white[data-midi="${bad}"]`); // a second wrong key is not logged again
      await page.waitForTimeout(150);
    }
    await page.click(`.ml-key[data-midi="${s.midi}"]`);
    await page.waitForTimeout(700);
    const mine = (await attempts()).slice(before);
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(round === 0 ? [false, true] : [true]) && mine.every((a) => a.level === level && a.skill === skillOf('play-the-note', level) && a.item === s.item), `kb L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
  }
  // Many more generated notes: a settings change (labels) draws a new one.
  const names = new Set(), prefs = new Set();
  for (let i = 0; i < rounds(60, 8); i++) {
    await page.evaluate(() => document.querySelector('.pn-staff svg')?.setAttribute('data-old', '1')); // a new question redraws the staff
    await setField(page, 3, i % 2 === 0);
    await page.waitForFunction(() => !document.querySelector('.pn-staff svg[data-old]') && !window.__test.state().locked, null, { timeout: 8000 }).catch(() => check(false, `kb L${level}: no new note after a settings change`));
    const t = await state();
    checkItem(level, t, `kb L${level} sample`);
    check(t.win && t.midi >= t.win[0] && t.midi <= t.win[1], `kb L${level}: note ${t.midi} not on the keyboard ${t.win}`);
    names.add(t.item);
    if (t.item.includes('♭')) prefs.add('flat'); if (t.item.includes('♯')) prefs.add('sharp');
  }
  await closeSettings(page);
  if (!FAST) {
    const L = LEVELS[level];
    const nat = []; for (let m = L.lo; m <= L.hi; m++) if (NAT.includes(m % 12)) nat.push(m);
    check(names.size >= Math.min(nat.length, 10), `kb L${level}: only ${names.size} different notes`);
    if (L.acc) check(prefs.has('flat') && prefs.has('sharp'), `kb L${level}: accidentals seen ${[...prefs]}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `kb L${level}: overflow`);
  console.log(`kb L${level}`, [...seen].join(' '));
}
// ---- microphone with injected pitches ----
const instruments = ['C', 'Bb', 'Eb', 'F', 'C', 'Bb'];
for (const level of levels(6)) {
  const ins = instruments[level - 1];
  await open(level, 'mic', ins);
  let s = await ready(true);
  check(s.micMode && !s.micFailed, `mic L${level}: mic mode not active ${JSON.stringify(s)}`);
  for (let round = 0; round < rounds(3, 2); round++) {
    s = await ready(true);
    checkItem(level, s, `mic L${level}`);
    const target = s.midi + TRANSPOSE[ins];
    const before = (await attempts()).length;
    if (round === 0) {
      // Silence is not an answer.
      await feed(null, 1400);
      check(!(await state()).wrongLogged && (await attempts()).length === before, `mic L${level}: silence counted as an answer`);
      // A short wrong note (under 1 s) is ignored; a steady one counts once.
      await feed(target + 3, 500);
      await feed(null, 400);
      check(!(await state()).wrongLogged, `mic L${level}: short wrong note counted`);
      for (let k = 0; k < 100 && !(await state()).wrongLogged; k++) await feed(target + 3, 40);
      s = await state();
      check(s.wrongLogged, `mic L${level}: steady wrong note not logged`);
      if (level === 1) { // the feedback sound of a wrong answer shuts the microphone (quiet), then it listens again
        const fb = await page.evaluate(() => (window.__fb || []).at(-1));
        if (fb?.sound) {
          check((await state()).listening === false, 'mic: still listening during the feedback sound');
          await feed(target, 120);
          check((await state()).hold === 0, 'mic: heard the feedback sound as a note');
          await page.waitForFunction(() => window.__test.state().listening, null, { timeout: 4000 }).catch(() => check(false, 'mic: never listens again after the feedback sound'));
        }
      }
      await feed(target + 3, 1300);
      await feed(null, 300);
      s = await ready(true);
    }
    // Right note, in another octave, slightly sharp (within tolerance).
    await feed(target + (round % 2 ? 12 : -12) + 0.2, 900);
    await feed(null, 300);
    await page.waitForTimeout(700);
    const mine = (await attempts()).slice(before);
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(round === 0 ? [false, true] : [true]) && mine.every((a) => a.level === level && a.skill === skillOf('play-the-note', level) && a.item === s.item), `mic L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `mic L${level}: overflow`);
  console.log(`mic L${level} (${ins}) ok`);
}
// Settings: instrument, labels and hear are saved and applied after a reload (keyboard mode).
await open(2, 'keyboard', 'C');
await persistCheck({
  page, url: base, slug: 'play-the-note', fields: [[2, 'instrument', 'Eb'], [3, 'labels', true], [4, 'hear', false]], check,
  applied: async (pg) => ((await pg.$$eval('.ml-white', (e) => e.length && e.every((x) => x.textContent.trim()))) ? '' : 'no key labels'),
});
await open(2, 'mic', 'Eb'); // a transposing instrument saved in the settings changes the pitch the microphone waits for
{
  const s = await ready(true);
  await feed(s.midi - 9 + 12, 900);
  await feed(null, 300);
  await page.waitForFunction(() => window.__test.state().streak >= 1, null, { timeout: 4000 }).catch(() => check(false, 'E♭ instrument: concert pitch -9 not accepted'));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
