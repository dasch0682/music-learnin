// Plays every level of Cadences by ear: one wrong answer, then the right one. Checks the chords too.
// Usage: npx vite --port 5220 --strictPort &   then   PORT=5220 node tools/ear-cadences.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5220}/ear-cadences/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'ear-cadences').sort((x, y) => x.t - y.t)); }; }));
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-cadences', JSON.stringify({ level: l, tempo: 110 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const seen = new Set();
  for (let round = 0; round < rounds(8, 2); round++) {
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item);
    check(s.chords.every((c) => c.length >= 4 && c.every((m) => m >= 43 && m < 69)), `L${level}: chord out of range ${JSON.stringify(s.chords)}`);
    const before = (await attempts()).length;
    if (round === 0) {
      if (dir) await page.screenshot({ path: `${dir}/cd-${level}.png` });
      await page.click(`.cd-choices button:not([data-type="${s.type}"])`);
      await page.waitForTimeout(150);
    }
    await page.click(`.cd-choices button[data-type="${s.type}"]`);
    await page.waitForTimeout(1100);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item, `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
