// Plays every level of Jazz colours: one wrong answer, then the right one. Checks the chord tones against music theory.
// Usage: npx vite --port 5301 --strictPort &   then   PORT=5301 node tools/ear-jazz.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5301}/ear-jazz/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const newPage = async (locale, colorScheme) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme, locale });
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return p;
};
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
// Independent reference: pitch classes of each chord (degrees as semitones above the root, mod 12).
// 9 = 2, 11 = 5, 13 = 9, b9 = 1, #9 = 3, #11 = 6, b13 = 8.
const PCS = {
  '7': [0, 4, 7, 10], '9': [0, 2, 4, 7, 10], '13': [0, 2, 4, 9, 10], '7sus4': [0, 5, 7, 10],
  'maj7': [0, 4, 7, 11], 'maj9': [0, 2, 4, 7, 11], '69': [0, 2, 4, 7, 9], 'maj7#11': [0, 4, 6, 7, 11],
  '7b9': [0, 1, 4, 7, 10], '7#9': [0, 3, 4, 7, 10], '7#11': [0, 4, 6, 7, 10], '7b13': [0, 2, 4, 8, 10],
  'm7': [0, 3, 7, 10], 'm9': [0, 2, 3, 7, 10], 'm11': [0, 3, 5, 7, 10], 'm6': [0, 3, 7, 9], 'mMaj7': [0, 3, 7, 11],
};
// Characteristic note that must be present, and notes that must be absent (the colour is what the player hears).
const MUST = { '9': 2, 'maj9': 2, 'm9': 2, '13': 9, '7sus4': 5, '69': 9, 'maj7#11': 6, '7b9': 1, '7#9': 3, '7#11': 6, '7b13': 8, 'm11': 5, 'm6': 9, 'mMaj7': 11, '7': 10, 'maj7': 11, 'm7': 10 };
const FAM = { 2: ['7', '9', '13', '7sus4'], 3: ['maj7', 'maj9', '69', 'maj7#11'], 4: ['7b9', '7#9', '7#11', '7b13'], 5: ['m7', 'm9', 'm11', 'm6', 'mMaj7'] };
const ALLOWED = { 1: ['7', '9', 'maj7', 'maj9', 'm7', 'm9'], ...FAM, 6: Object.keys(PCS) };
const COLOURED = ['9', 'maj9', 'm9'];
const mod = (n) => ((n % 12) + 12) % 12;
const attempts = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'ear-jazz').sort((x, y) => x.t - y.t)); }; }));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const start = async (page, level) => {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-jazz', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
};

const page = await newPage('fr-FR', 'light');
await page.goto(base);
for (let level = 1; level <= 6; level++) {
  await start(page, level);
  const seen = new Set();
  for (let round = 0; round < 9; round++) {
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item);
    check(s.level === level && ALLOWED[level].includes(s.item), `L${level}: item ${s.item} not allowed`);
    check(s.bass >= 40 && s.bass < 52 && s.notes[0] === s.bass, `L${level}: bass ${s.bass}`);
    const pcs = new Set(s.notes.map((m) => mod(m - s.bass)));
    const want = new Set(PCS[s.item]);
    check(pcs.size === want.size && [...want].every((x) => pcs.has(x)), `L${level} ${s.item}: pitch classes ${[...pcs].sort((a, b) => a - b)} vs ${[...want].sort((a, b) => a - b)}`);
    check(pcs.has(MUST[s.item]), `L${level} ${s.item}: missing colour note`);
    check(s.notes.slice(1).every((m, i, a) => m > s.bass && (i === 0 || m >= a[i - 1])) && s.notes.at(-1) <= 84 && s.notes[1] >= 48, `L${level} ${s.item}: voicing ${s.notes}`);
    if (level === 1) check(s.types.join() === 'plain,colour' && s.answer === (COLOURED.includes(s.item) ? 'colour' : 'plain'), `L1: answer ${s.answer} for ${s.item}`);
    else if (level <= 5) check(s.answer === s.item && s.types.join() === FAM[level].join(), `L${level}: choices ${s.types}`);
    else check(s.types.length === 6 && s.types.includes(s.item), `L6: choices ${s.types}`);
    const before = (await attempts(page)).length;
    if (round === 0) {
      if (dir && [1, 4].includes(level)) await page.screenshot({ path: `${dir}/jz-${level}.png` });
      await page.click(`.jz-choices button:not([data-type="${s.answer}"])`);
      await page.waitForTimeout(150);
    }
    await page.click(`.jz-choices button[data-type="${s.answer}"]`);
    await page.waitForTimeout(1100);
    const mine = (await attempts(page)).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'listen.jazz',
      `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.skill, a.ok, a.level, a.item]))}`);
  }
  const next = await page.evaluate(() => getComputedStyle(document.querySelector('.jz-next')).visibility);
  check(next === (level < 6 ? 'visible' : 'hidden'), `L${level}: next button ${next}`);
  check(!(await overflow(page)), `L${level}: overflow`);
  // The note-by-note button must not throw or change the question.
  await page.click('.jz-arp');
  console.log(`L${level}`, [...seen].join(' '));
}
// Next-level button moves up one level.
await start(page, 1);
for (let i = 0; i < 8; i++) { const s = await page.evaluate(() => window.__test.state()); await page.click(`.jz-choices button[data-type="${s.answer}"]`); await page.waitForTimeout(1100); }
await page.click('.jz-next'); await page.waitForTimeout(400);
check((await page.evaluate(() => window.__test.state().level)) === 2, 'next-level button did not go to level 2');
await page.close();

// English, dark, hardest level.
const en = await newPage('en-US', 'dark');
await en.goto(base);
await start(en, 6);
check(!(await overflow(en)), 'EN L6: overflow');
if (dir) await en.screenshot({ path: `${dir}/jz-en-dark.png` });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
