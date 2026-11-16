// Plays every level of Scales by ear: one wrong answer, then the right one. Checks the notes against music theory.
// Usage: npx vite --port 5301 --strictPort &   then   PORT=5301 node tools/ear-scales.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5301}/ear-scales/`;
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
// Independent reference: semitones above the tonic.
const STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11], melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  pentaMajor: [0, 2, 4, 7, 9], pentaMinor: [0, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], locrian: [0, 1, 3, 5, 6, 8, 10], wholeTone: [0, 2, 4, 6, 8, 10], blues: [0, 3, 5, 6, 7, 10],
};
const ALLOWED = {
  1: ['major', 'minor'], 2: ['major', 'minor', 'pentaMajor', 'pentaMinor'], 3: ['minor', 'harmonicMinor', 'melodicMinor'],
  4: ['major', 'dorian', 'mixolydian', 'minor'], 5: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'],
  6: Object.keys(STEPS).filter((k) => !['pentaMajor', 'pentaMinor', 'melodicMinor'].includes(k)),
};
const attempts = (page) => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'ear-scales').sort((x, y) => x.t - y.t)); }; }));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const start = async (page, level) => {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-scales', JSON.stringify({ level: l, tempo: 320 })), level);
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
    const ref = STEPS[s.item];
    const up = [...ref, 12].map((x) => s.tonic + x);
    check(s.level === level && ALLOWED[level].includes(s.item), `L${level}: item ${s.item} not allowed`);
    check(s.types.includes(s.item) && s.types.every((t) => ALLOWED[level].includes(t)), `L${level}: bad choices ${s.types}`);
    check(s.tonic >= 55 && s.tonic < 67, `L${level}: tonic ${s.tonic}`);
    const expected = level >= 3 ? [...up, ...up.slice(0, -1).reverse()] : up;
    check(JSON.stringify(s.notes) === JSON.stringify(expected), `L${level} ${s.item}: notes ${s.notes} vs ${expected}`);
    if (level === 6) check(s.types.length === 6, `L6: ${s.types.length} choices`);
    if (level <= 2) check(s.types.length === ALLOWED[level].length, `L${level}: choices ${s.types}`);
    const before = (await attempts(page)).length;
    if (round === 0) {
      if (dir && [1, 4].includes(level)) await page.screenshot({ path: `${dir}/sc-${level}.png` });
      await page.click(`.sc-choices button:not([data-type="${s.item}"])`);
      await page.waitForTimeout(150);
    }
    await page.click(`.sc-choices button[data-type="${s.item}"]`);
    await page.waitForTimeout(1100);
    const mine = (await attempts(page)).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'listen.scales',
      `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.skill, a.ok, a.level, a.item]))}`);
  }
  const next = await page.evaluate(() => { const b = document.querySelector('.sc-next'); return getComputedStyle(b).visibility; });
  check(next === (level < 6 ? 'visible' : 'hidden'), `L${level}: next button ${next}`);
  check(!(await overflow(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
// Level 4 shows the mode names in French.
await start(page, 4);
const texts = await page.$$eval('.sc-choices button', (bs) => bs.map((b) => b.textContent));
check(texts.includes('Ionien (majeur)') && texts.includes('Éolien (mineur)') && texts.includes('Dorien'), 'L4 French labels: ' + texts);
// Next-level button moves up one level.
await page.evaluate(() => localStorage.setItem('ml:settings:ear-scales', JSON.stringify({ level: 1, tempo: 320 })));
await page.reload(); await page.click('.ml-start'); await page.waitForTimeout(300);
for (let i = 0; i < 8; i++) { const s = await page.evaluate(() => window.__test.state()); await page.click(`.sc-choices button[data-type="${s.item}"]`); await page.waitForTimeout(1100); }
await page.click('.sc-next'); await page.waitForTimeout(400);
check((await page.evaluate(() => window.__test.state().level)) === 2, 'next-level button did not go to level 2');
await page.close();

// English, dark, hardest level.
const en = await newPage('en-US', 'dark');
await en.goto(base);
await start(en, 6);
check(!(await overflow(en)), 'EN L6: overflow');
const enTexts = await en.$$eval('.sc-choices button', (bs) => bs.map((b) => b.textContent));
check(enTexts.every((t) => /^[A-Z]/.test(t)) && !enTexts.includes('Dorien'), 'EN labels: ' + enTexts);
if (dir) await en.screenshot({ path: `${dir}/sc-en-dark.png` });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
