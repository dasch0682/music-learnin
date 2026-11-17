// Plays every level of Read the interval: one wrong answer, then the right one.
// The expected answer is recomputed here from the notes shown (letters and semitones), not taken from the game.
// Usage: npx vite --port 5306 --strictPort &   then   PORT=5306 node tools/read-intervals.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts, newAttempts, recordAudio, playedNotes } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5306}/read-intervals/`;
const dir = process.argv[2];
const browser = await launch();
const errors = [];
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };

const PC = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]; // semitones of the major or perfect interval of each number
function expected(kind, notes) {
  const [lo, hi] = [...notes].sort((a, b) => a.octave * 7 + a.letter - (b.octave * 7 + b.letter));
  const num = hi.octave * 7 + hi.letter - (lo.octave * 7 + lo.letter) + 1;
  const semi = (hi.octave * 12 + PC[hi.letter] + hi.acc) - (lo.octave * 12 + PC[lo.letter] + lo.acc);
  if (kind === 'shape') return ['same', 'step', 'skip'][num - 1];
  if (kind === 'number') return String(num);
  const d = semi - MAJOR[num - 1];
  const q = [1, 4, 5, 8].includes(num) ? { 0: 'P', 1: 'A', '-1': 'd' }[d] : { 0: 'M', '-1': 'm', 1: 'A', '-2': 'd' }[d];
  return q + num;
}
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3];
const keyAcc = (key, letter) => (key > 0 && SHARPS.indexOf(letter) < key ? 1 : key < 0 && FLATS.indexOf(letter) < -key ? -1 : 0);
const KINDS = { 1: 'shape', 2: 'number', 3: 'number', 4: 'quality', 5: 'quality', 6: 'quality' };
const ROUNDS = { 1: 8, 2: 8, 3: 12, 4: 10, 5: 22, 6: 22 };

await smoke({ browser, url: base, check, startSel: null });
for (const [scheme, locale] of combos([['light', 'fr-FR'], ['dark', 'en-US']])) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: scheme, locale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const attempts = () => readAttempts(page, 'read-intervals');
  await recordAudio(page);
  await page.goto(base);
  for (const level of levels(6)) {
    await page.evaluate((l) => localStorage.setItem('ml:settings:read-intervals', JSON.stringify({ level: l, sound: true })), level);
    await page.reload();
    await page.waitForFunction(() => window.__test?.state());
    const seen = new Set();
    for (let round = 0; round < rounds(ROUNDS[level], 2); round++) {
      const s = await page.evaluate(() => window.__test.state());
      const tag = `${scheme} L${level} round ${round}`;
      const want = expected(KINDS[level], s.notes);
      seen.add(want);
      check(s.level === level && s.item === want, `${tag}: game says ${s.item}, notes say ${want} ${JSON.stringify(s.notes)}`);
      check(s.choices.length <= 6 && s.choices.includes(want), `${tag}: choices ${s.choices}`);
      check(s.notes.every((n) => Math.abs(n.acc) <= 1 && !(n.acc === 1 && [2, 6].includes(n.letter)) && !(n.acc === -1 && [0, 3].includes(n.letter))), `${tag}: rare spelling`);
      if (level < 4) check(s.notes.every((n) => n.acc === 0), `${tag}: accidental at a natural level`);
      if (level === 6) check(s.keySig !== 0 && s.harmonic && s.notes.every((n) => n.acc === keyAcc(s.keySig, n.letter)), `${tag}: notes outside the key`);
      // What is drawn: two heads, the key signature, and one accidental per altered note (none under a key signature).
      const drawn = await page.evaluate(() => ({
        heads: document.querySelectorAll('.ri-staff .ml-note ellipse').length,
        groups: document.querySelectorAll('.ri-staff .ml-note').length,
        accs: [...document.querySelectorAll('.ri-staff .ml-note text')].map((t) => t.textContent).join(''),
        sig: document.querySelectorAll('.ri-staff .ml-keysig').length,
        buttons: [...document.querySelectorAll('.ri-choices button')].map((b) => b.dataset.id),
        small: [...document.querySelectorAll('.ri-choices button')].some((b) => b.offsetHeight < 56 || b.offsetWidth < 100),
      }));
      const accs = s.keySig ? '' : s.notes.filter((n) => n.acc).map((n) => (n.acc > 0 ? '♯' : '♭')).sort().join('');
      check(drawn.heads === 2 && drawn.groups === (s.harmonic ? 1 : 2), `${tag}: heads ${JSON.stringify(drawn)}`);
      check([...drawn.accs].sort().join('') === accs && drawn.sig === Math.abs(s.keySig), `${tag}: accidentals drawn "${drawn.accs}", wanted "${accs}", signature ${drawn.sig}`);
      check(drawn.buttons.join() === s.choices.join() && !drawn.small, `${tag}: buttons ${JSON.stringify(drawn)}`);
      const before = (await attempts()).length;
      if (round === 0) {
        if (dir) await page.screenshot({ path: `${dir}/ri-${level}-${scheme}.png` });
        await page.click(`.ri-choices button:not([data-id="${want}"])`);
        await page.waitForTimeout(150);
        check(await page.evaluate(() => document.querySelectorAll('.ri-choices .ml-wrong:disabled').length === 1), `${tag}: wrong button not marked`);
      }
      if (round === 0 && level > 1) { // a second miss shows the answer and is not logged again
        const wrong2 = await page.evaluate((w) => [...document.querySelectorAll('.ri-choices button:not(:disabled)')].map((b) => b.dataset.id).find((i) => i !== w), want);
        if (wrong2) { await page.click(`.ri-choices button[data-id="${wrong2}"]`); check(await page.$(`.ri-choices button[data-id="${want}"].ml-reveal`), `${tag}: answer not revealed after two misses`); }
      }
      check(await page.$('.ml-stage.ml-bad') || round !== 0, `${tag}: no wrong-answer feedback on the stage`);
      await page.click(`.ri-choices button[data-id="${want}"]`);
      const mine = await newAttempts(page, 'read-intervals', before);
      await page.waitForFunction(() => !document.querySelector('.ri-choices .ml-right'), null, { timeout: 8000 });
      check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === want && mine[0].skill === skillOf('read-intervals', level), `${tag}: attempts ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
    }
    const nextShown = await page.evaluate(() => document.querySelector('.ri-next').classList.contains('ri-show')); // read before sampling: a settings change resets the streak
    // Many more generated questions (a settings change draws a new one without answering): the notes decide the answer.
    {
      const LO = { treble: 28, bass: 16, alto: 22, tenor: 20 }; // one ledger line under the staff, up to one above (diatonic steps, C4 = 28)
      const items = new Set();
      for (let k = 0; k < rounds(60, 8); k++) {
        await page.evaluate(() => document.querySelector('.ri-choices button')?.setAttribute('data-old', '1')); // a new question redraws the buttons
        await setField(page, 1, k % 2 === 0 ? 0 : 1);
        await page.waitForFunction(() => !document.querySelector('.ri-choices button[data-old]'), null, { timeout: 8000 }).catch(() => check(false, `${scheme} L${level}: no new question after a settings change`));
        const t = await page.evaluate(() => window.__test.state());
        const want = expected(KINDS[level], t.notes);
        const tag = `${scheme} L${level}~${k}`;
        items.add(want);
        check(t.item === want && t.choices.includes(want) && t.choices.length <= 6, `${tag}: game says ${t.item}, notes say ${want}, choices ${t.choices}`);
        check(t.notes.length === 2 && t.notes.every((n) => Math.abs(n.acc) <= 1 && !(n.acc === 1 && [2, 6].includes(n.letter)) && !(n.acc === -1 && [0, 3].includes(n.letter))), `${tag}: rare spelling`);
        if (level < 4) check(t.notes.every((n) => n.acc === 0), `${tag}: accidental at a natural level`);
        if (level === 6) check(t.keySig !== 0 && t.harmonic && t.notes.every((n) => n.acc === keyAcc(t.keySig, n.letter)), `${tag}: notes outside the key`);
        else check(!t.keySig && !t.harmonic, `${tag}: key signature / stacked notes below level 6`);
        const steps = t.notes.map((n) => n.octave * 7 + n.letter);
        check(steps.every((x) => x >= LO[t.clef] && x <= LO[t.clef] + 12), `${tag}: notes outside the ${t.clef} staff and one ledger line ${steps}`);
        check(level < 3 ? t.clef === 'treble' : level < 6 ? ['treble', 'bass'].includes(t.clef) : true, `${tag}: clef ${t.clef}`);
        if (level === 1) check(t.choices.join() === 'same,step,skip', `${tag}: choices ${t.choices}`);
        if (level === 2) check(t.choices.join() === '2,3,4,5', `${tag}: choices ${t.choices}`);
      }
      await closeSettings(page);
      if (!FAST) check(items.size >= { 1: 3, 2: 4, 3: 7, 4: 4, 5: 9, 6: 9 }[level], `${scheme} L${level}: only ${[...items]} after sampling`);
    }
    if (!FAST) check(nextShown === (level < 6 && ROUNDS[level] > 8), `${scheme} L${level}: next level button ${nextShown}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${scheme} L${level}: overflow`);
    check(!(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)), `${scheme} L${level}: taller than the screen`);
    if (dir && level === 3) await page.screenshot({ path: `${dir}/ri-${level}-${scheme}-next.png` });
    console.log(`${scheme} ${locale} L${level}`, [...seen].join(' '));
  }
  // The next level button moves one level up.
  await page.evaluate(() => localStorage.setItem('ml:settings:read-intervals', JSON.stringify({ level: 1, sound: false })));
  await page.reload();
  await page.waitForFunction(() => window.__test?.state());
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__test.state());
    await page.click(`.ri-choices button[data-id="${s.item}"]`);
    await page.waitForFunction(() => !document.querySelector('.ri-choices .ml-right'), null, { timeout: 8000 });
  }
  await page.click('.ri-next.ri-show');
  await page.waitForFunction(() => window.__test.state()?.level === 2, null, { timeout: 5000 }).catch(() => {});
  check((await page.evaluate(() => window.__test.state().level)) === 2, `${scheme}: next level button does not work`);
  // Settings: the sound toggle is saved and applied (the interval is played after an answer only when it is on).
  await page.evaluate(() => localStorage.setItem('ml:settings:read-intervals', JSON.stringify({ level: 1, sound: true })));
  await page.reload();
  await page.waitForFunction(() => window.__test?.state());
  await playedNotes(page);
  {
    const s = await page.evaluate(() => window.__test.state());
    await page.click(`.ri-choices button[data-id="${s.item}"]`);
    const heard = await playedNotes(page);
    check(heard.length >= 2 && heard.slice(0, 2).every((x, i) => x.midi === s.notes[i].midi), `${scheme}: sound on: played ${JSON.stringify(heard.map((x) => x.midi))} for ${JSON.stringify(s.notes.map((n) => n.midi))}`);
  }
  await persistCheck({ page, url: base, slug: 'read-intervals', fields: [[1, 'sound', false]], check, start: false });
  await playedNotes(page);
  {
    const s = await page.evaluate(() => window.__test.state());
    await page.click(`.ri-choices button[data-id="${s.item}"]`);
    await page.waitForFunction(() => document.querySelector('.ri-choices .ml-right'));
    const heard = await playedNotes(page); // (the feedback sound of the shell is allowed, the interval is not)
    check(!heard.some((x, i) => x.midi === s.notes[0].midi && heard[i + 1]?.midi === s.notes[1].midi), `${scheme}: sound off but the interval was played`);
  }
  await ctx.close();
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
