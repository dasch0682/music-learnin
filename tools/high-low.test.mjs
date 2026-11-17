// Plays every level of High or low: one wrong answer, then the right one. Checks the notes against the contour.
// Usage: npx vite --port 5408 --strictPort &   then   PORT=5408 node tools/high-low.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5408}/high-low/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'high-low').sort((x, y) => x.t - y.t)); }; }));
const SKILL = { 1: 'listen.highlow', 2: 'listen.highlow', 3: 'listen.highlow', 4: 'listen.highlow', 5: 'listen.contour', 6: 'listen.contour' };
const GAPS = { 1: [7, 16], 2: [2, 4], 3: [1, 2], 4: [0, 3] };
const wait = (ms) => page.waitForTimeout(ms);
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:high-low', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
  const seen = new Set();
  for (let round = 0; round < rounds(8, 2); round++) {
    await page.waitForFunction(() => window.__test?.state());
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item);
    const n = s.notes;
    check(n.every((m) => m >= 52 && m <= 84), `L${level}: note out of range ${n}`);
    // recompute the answer from the notes
    const steps = n.slice(1).map((m, i) => m - n[i]);
    if (level <= 4) {
      const d = steps[0];
      const exp = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      check(s.answer === exp && n.length === 2, `L${level}: answer ${s.answer} vs notes ${n}`);
      check(level < 4 ? d !== 0 : true, `L${level}: unison`);
      const [lo, hi] = GAPS[level];
      check(Math.abs(d) >= lo && Math.abs(d) <= hi, `L${level}: gap ${d}`);
      check(s.options.length === (level === 4 ? 3 : 2), `L${level}: options ${s.options}`);
    } else {
      const word = steps.map((d) => (d > 0 ? 'u' : 'd')).join('');
      check(s.answer === word && s.item === word && n.length === level - 3 + 1 + (level === 5 ? 0 : 0) , `L${level}: contour ${word} vs ${s.answer}, ${n.length} notes`);
      check(steps.every((d) => Math.abs(d) >= 2 && Math.abs(d) <= 4), `L${level}: step sizes ${steps}`);
      check(s.options.includes(s.answer), `L${level}: answer not among options`);
    }
    const wrong = s.options.find((o) => o !== s.answer);
    const before = (await attempts()).length;
    if (round === 0) {
      if (dir) await page.screenshot({ path: `${dir}/hl-${level}.png` });
      await page.click(`.hl-answers button[data-value="${wrong}"]`);
      await wait(150);
    }
    await page.click(`.hl-answers button[data-value="${s.answer}"]`);
    await wait(1000);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === SKILL[level], `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.skill, a.ok, a.item]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
