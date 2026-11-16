// Plays every level of Find the note: one wrong name, then the right one. Recomputes the name from the MIDI number.
// Usage: npx vite --port 5409 --strictPort &   then   PORT=5409 node tools/find-a-note.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5409}/find-a-note/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'find-a-note').sort((x, y) => x.t - y.t)); }; }));

// Theory, recomputed here. Diatonic step of a natural MIDI note: C4 = 28.
const FR = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const PC_LETTER = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const NAT_PC = [0, 2, 4, 5, 7, 9, 11];
const spell = (midi, pref) => {
  const pc = ((midi % 12) + 12) % 12;
  if (pc in PC_LETTER) return { letter: PC_LETTER[pc], acc: 0 };
  return pref === 'flat' ? { letter: PC_LETTER[pc + 1], acc: -1 } : { letter: PC_LETTER[pc - 1], acc: 1 };
};
const step = (midi) => 7 * (Math.floor(midi / 12) - 1) + PC_LETTER[((midi % 12) + 12) % 12];
const BOTTOM = { treble: 30, bass: 18, alto: 24, tenor: 22 };
const inStaff = (clef, midi) => step(midi) >= BOTTOM[clef] - 1 && step(midi) <= BOTTOM[clef] + 9;
const label = (m, p) => { const s = spell(m, p); return FR[s.letter] + (s.acc > 0 ? '♯' : s.acc < 0 ? '♭' : ''); };
const LEVELS = [
  null,
  { clefs: ['treble'], acc: false, skills: ['read.treble.staff'], lo: 1, hi: 1 },
  { clefs: ['treble'], acc: false, skills: ['read.treble.staff', 'read.treble.ledger'], lo: 5, hi: 5 },
  { clefs: ['bass'], acc: false, skills: ['read.bass.staff'], lo: 1, hi: 1 },
  { clefs: ['bass'], acc: false, skills: ['read.bass.staff', 'read.bass.ledger'], lo: 5, hi: 5 },
  { clefs: ['treble', 'bass'], acc: true, skills: ['read.accidentals'], lo: 2, hi: 2 },
  { clefs: ['treble', 'bass'], acc: false, skills: ['read.grand'], lo: 4, hi: 4 },
  { clefs: ['alto', 'tenor'], acc: false, skills: ['read.cclefs'], lo: 2, hi: 2 },
];

await page.goto(base);
for (let level = 1; level <= 7; level++) {
  const spec = LEVELS[level];
  await page.evaluate((l) => localStorage.setItem('ml:settings:find-a-note', JSON.stringify({ level: l, sound: false })), level);
  await page.reload();
  await page.waitForSelector('.ml-choices button');
  const seen = new Set(), clefs = new Set();
  for (let round = 0; round < 14; round++) {
    await page.waitForFunction(() => window.__test.state() && !window.__test.state().locked && document.querySelector('.ml-choices button:not([disabled])'));
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item); clefs.add(s.clef);
    const want = s.pref && level === 5 ? label(s.midi, s.pref) : FR[spell(s.midi, s.pref).letter];
    check(s.level === level && spec.clefs.includes(s.clef), `L${level}: clef ${s.clef}`);
    check(spec.skills.includes(s.skill), `L${level}: skill ${s.skill}`);
    const expSkill = level === 5 ? 'read.accidentals' : level === 6 || level === 7 ? spec.skills[0] : (inStaff(s.clef, s.midi) ? spec.skills[0] : spec.skills[1] || spec.skills[0]);
    check(s.skill === expSkill, `L${level}: skill ${s.skill} expected ${expSkill} for ${s.item}`);
    const isNat = NAT_PC.includes(((s.midi % 12) + 12) % 12);
    check(spec.acc ? !isNat : isNat, `L${level}: accidental mismatch ${s.item}`);
    if (level === 1) check(step(s.midi) >= 29 && step(s.midi) <= 39, `L${level}: out of range ${s.item}`);
    if (level === 3) check(step(s.midi) >= 17 && step(s.midi) <= 27, `L${level}: out of range ${s.item}`);
    const texts = await page.$$eval('.ml-choices button', (bs) => bs.map((b) => b.textContent));
    check(texts.includes(want), `L${level}: right name ${want} missing from ${texts}`);
    if (level === 5) check(texts.length === 4 && new Set(texts).size === 4, `L${level}: choices ${texts}`);
    else check(texts.length === 7 && texts.join() === FR.join(), `L${level}: choices ${texts}`);
    const before = (await attempts()).length;
    if (round === 0) {
      if (dir && level % 3 === 1) await page.screenshot({ path: `${dir}/fn-${level}.png` });
      const wrong = texts.find((t) => t !== want);
      await page.click(`.ml-choices button:text-is("${wrong}")`);
      await page.waitForTimeout(150);
      check((await page.evaluate(() => window.__test.state())).item === s.item, `L${level}: note changed after a wrong answer`);
    }
    await page.click(`.ml-choices button:text-is("${want}")`);
    await page.waitForTimeout(700);
    const mine = (await attempts()).slice(before);
    const exp = round === 0 ? [false, true] : [true];
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(exp) && mine.every((a) => a.level === level && a.item === s.item && a.skill === s.skill), `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
  }
  if (level >= 6) check(clefs.size === spec.clefs.length || level === 6 && clefs.size >= 1, `L${level}: clefs ${[...clefs]}`);
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
