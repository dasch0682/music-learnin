// Plays every level of Read the chord: one wrong answer, then the right one.
// The expected answer is recomputed here from the notes shown (letters and semitones), not taken from the game.
// Usage: npx vite --port 5306 --strictPort &   then   PORT=5306 node tools/read-chords.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5306}/read-chords/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };

const PC = [0, 2, 4, 5, 7, 9, 11];
const QUALITY = { '0,4,7': 'maj', '0,3,7': 'min', '0,3,6': 'dim', '0,4,8': 'aug', '0,4,7,11': 'maj7', '0,4,7,10': 'dom7', '0,3,7,10': 'min7', '0,3,6,10': 'm7b5' };
const stepOf = (n) => n.octave * 7 + n.letter;
const semiOf = (n) => n.octave * 12 + PC[n.letter] + n.acc;
/** Read a chord from its notes: find the note from which the others pile up in thirds (letters), then the quality from the semitones. */
function read(notes) {
  const s = [...notes].sort((a, b) => stepOf(a) - stepOf(b));
  for (let i = 0; i < s.length; i++) {
    const stack = [...s.slice(i), ...s.slice(0, i).map((n) => ({ ...n, octave: n.octave + 1 }))];
    if (!stack.every((n, k) => k === 0 || stepOf(n) - stepOf(stack[k - 1]) === 2)) continue;
    const quality = QUALITY[stack.map((n) => semiOf(n) - semiOf(stack[0])).join()];
    return { root: stack[0], quality, inv: (s.length - i) % s.length };
  }
  return null;
}
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3];
const keyAcc = (key, letter) => (key > 0 && SHARPS.indexOf(letter) < key ? 1 : key < 0 && FLATS.indexOf(letter) < -key ? -1 : 0);
const BOTTOM = { treble: 30, bass: 18 };
const TYPES = { 1: ['maj', 'min', 'dim'], 2: ['maj', 'min'], 3: ['maj', 'min', 'dim', 'aug'], 4: ['maj', 'min'], 5: ['maj7', 'dom7', 'min7', 'm7b5'], 6: ['maj', 'min', 'dim', 'maj7', 'dom7', 'min7', 'm7b5'] };
const expectedOf = (ask, c) => (ask === 'root' ? `${c.root.letter}:${c.root.acc}` : ask === 'inv' ? `inv${c.inv}` : ask === 'type' ? c.quality : `${c.root.letter}:${c.root.acc}:${c.quality}`);
const ASKS = { 1: ['root'], 2: ['type'], 3: ['type'], 4: ['inv', 'root'], 5: ['type'], 6: ['full'] };
const ROUNDS = { 1: 10, 2: 10, 3: 12, 4: 7, 5: 12, 6: 22 };

for (const [scheme, locale] of [['light', 'fr-FR'], ['dark', 'en-US']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: scheme, locale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'read-chords').sort((x, y) => x.t - y.t)); }; }));
  await page.goto(base);
  for (let level = 1; level <= 6; level++) {
    await page.evaluate((l) => localStorage.setItem('ml:settings:read-chords', JSON.stringify({ level: l, sound: true })), level);
    await page.reload();
    await page.waitForFunction(() => window.__test?.state());
    const seen = new Set();
    for (let round = 0; round < ROUNDS[level]; round++) {
      for (const [phaseNo, ask] of ASKS[level].entries()) {
        const s = await page.evaluate(() => window.__test.state());
        const tag = `${scheme} L${level} round ${round} ${ask}`;
        const c = read(s.notes);
        check(c && c.quality, `${tag}: not a chord ${JSON.stringify(s.notes)}`);
        if (!c || !c.quality) { console.log("stopping"); process.exit(1); }
        const want = expectedOf(ask, c);
        seen.add(`${c.quality}${c.inv ? '/' + c.inv : ''}`);
        check(s.level === level && s.ask === ask && s.answer === want, `${tag}: game says ${s.answer} (${s.ask}), notes say ${want} ${JSON.stringify(s.notes)}`);
        check(s.choices.includes(want) && new Set(s.choices).size === s.choices.length, `${tag}: choices ${s.choices}`);
        check(TYPES[level].includes(c.quality), `${tag}: unexpected quality ${c.quality}`);
        const notes = s.notes;
        check(notes.every((n) => Math.abs(n.acc) <= 1 && !(n.acc === 1 && [2, 6].includes(n.letter)) && !(n.acc === -1 && [0, 3].includes(n.letter))), `${tag}: rare spelling`);
        const steps = notes.map(stepOf);
        check(Math.min(...steps) >= BOTTOM[s.clef] - 2 && Math.max(...steps) <= BOTTOM[s.clef] + 10, `${tag}: out of the staff`);
        check(notes.every((n) => n.midi === semiOf(n) + 12), `${tag}: midi does not match the spelling`);
        if (level === 1) check(notes.every((n) => n.acc === 0) && c.inv === 0, `${tag}: L1 not naturals`);
        if (level === 2) check(notes.every((n) => n.acc === 0) && c.inv === 0, `${tag}: L2 not naturals`);
        if (level === 3 || level === 5) check(c.inv === 0, `${tag}: inverted`);
        if (level === 4) check(c.inv >= 0 && c.inv <= 2, `${tag}: inversion`);
        if (s.clef !== 'treble') check(level === 6, `${tag}: clef`);
        if (s.keySig) check(level === 6 && notes.every((n) => n.acc === keyAcc(s.keySig, n.letter)), `${tag}: notes outside the key`);
        // What is drawn: one head per note, the key signature, one accidental per altered note (none under a key signature).
        const drawn = await page.evaluate(() => ({
          heads: document.querySelectorAll('.rc-staff .ml-note ellipse').length,
          groups: document.querySelectorAll('.rc-staff .ml-note').length,
          accs: [...document.querySelectorAll('.rc-staff .ml-note text')].map((t) => t.textContent).join(''),
          sig: document.querySelectorAll('.rc-staff .ml-keysig').length,
          buttons: [...document.querySelectorAll('.rc-choices button')].map((b) => b.dataset.id),
          small: [...document.querySelectorAll('.rc-choices button')].some((b) => b.offsetHeight < 56 || b.offsetWidth < 70),
          text: [...document.querySelectorAll('.rc-choices button')].map((b) => b.textContent),
        }));
        const accs = s.keySig ? '' : notes.filter((n) => n.acc).map((n) => (n.acc > 0 ? '♯' : '♭')).sort().join('');
        check(drawn.heads === notes.length && drawn.groups === 1, `${tag}: heads ${JSON.stringify(drawn)}`);
        check([...drawn.accs].sort().join('') === accs && drawn.sig === Math.abs(s.keySig), `${tag}: accidentals drawn "${drawn.accs}", wanted "${accs}", signature ${drawn.sig}`);
        check(drawn.buttons.join() === s.choices.join() && !drawn.small && drawn.text.every((t) => t.length > 0), `${tag}: buttons ${JSON.stringify(drawn)}`);
        // The label of a root or full-name button must match its id (in the language of the page).
        if (ask === 'root' || ask === 'full') {
          const names = locale === 'fr-FR' ? ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'] : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
          const sym = { maj: 'maj', min: 'min', dim: 'dim', maj7: 'maj7', dom7: '7', min7: 'min7', m7b5: 'm7♭5' };
          drawn.buttons.forEach((id, i) => {
            const [l, a, t] = id.split(':');
            const label = names[l] + (a === '1' ? '♯' : a === '-1' ? '♭' : '') + (t ? ' ' + sym[t] : '');
            check(drawn.text[i] === label, `${tag}: button "${drawn.text[i]}" for ${id}, wanted "${label}"`);
          });
        }
        const before = (await attempts()).length;
        const wrongFirst = round === 0 && phaseNo === 0 || (level === 4 && round === 1 && phaseNo === 1);
        if (wrongFirst) {
          if (dir && round === 0 && phaseNo === 0) await page.screenshot({ path: `${dir}/rc-${level}-${scheme}.png` });
          await page.click(`.rc-choices button:not([data-id="${want}"])`);
          await page.waitForTimeout(150);
          check(await page.evaluate(() => document.querySelectorAll('.rc-choices .ml-wrong:disabled').length === 1), `${tag}: wrong button not marked`);
        }
        await page.click(`.rc-choices button[data-id="${want}"]`);
        await page.waitForTimeout(1350);
        const mine = (await attempts()).slice(before);
        const item = ask === 'root' ? 'root' : ask === 'full' ? 'full' : ask === 'inv' ? want : want;
        check(mine.length === 1 && mine[0].ok === !wrongFirst && mine[0].level === level && mine[0].item === item && mine[0].skill === 'read.chords', `${tag}: attempts ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
      }
    }
    const nextShown = await page.evaluate(() => document.querySelector('.rc-next').classList.contains('rc-show'));
    check(nextShown === (level < 6), `${scheme} L${level}: next level button ${nextShown}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${scheme} L${level}: overflow`);
    check(!(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1)), `${scheme} L${level}: taller than the screen`);
    console.log(`${scheme} ${locale} L${level}`, [...seen].join(' '));
  }
  // The next level button moves one level up.
  await page.evaluate(() => localStorage.setItem('ml:settings:read-chords', JSON.stringify({ level: 2, sound: false })));
  await page.reload();
  await page.waitForFunction(() => window.__test?.state());
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => window.__test.state());
    await page.click(`.rc-choices button[data-id="${s.answer}"]`);
    await page.waitForTimeout(750);
  }
  await page.click('.rc-next.rc-show');
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__test.state().level)) === 3, `${scheme}: next level button does not work`);
  await ctx.close();
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
