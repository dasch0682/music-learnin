// Plays every level of Second voice with simulated pitches: success, wrong note, app-voice leak.
// Usage: npx vite --port 5220 --strictPort &   then   PORT=5220 node tools/second-voice.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5220}/second-voice/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => window.__test.state());
const feed = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await page.evaluate((m) => window.__test.feed(m), midi); await page.waitForTimeout(40); } };
const listening = async () => { for (let i = 0; i < 200; i++) { const s = await state(); if (s.listening && !s.done) return s; await feed(null, 80); } throw new Error('never listening'); };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'second-voice').sort((x, y) => x.t - y.t)); }; }));

await page.goto(base);
for (let level = 1; level <= 10; level++) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:second-voice', JSON.stringify({ level: l, voice: 'child', tolerance: 50, phones: false })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.evaluate(() => window.__test.feed(null));
  const before = (await attempts()).length;
  let s = await listening();
  const item = s.item;
  if (dir && [7, 9].includes(level)) await page.screenshot({ path: `${dir}/sv-${level}.png` });
  // 1. The app's own note must not count as a wrong note (speaker leak).
  await feed(s.steps[0].other[0], 2600);
  s = await state();
  check(!s.wrongLogged && s.idx === 0, `L${level}: leak counted`);
  // 2. A steady wrong note counts once and restarts the challenge.
  const all = s.steps[0].targets.concat(s.steps[0].other);
  let bad = s.steps[0].targets[0] + 1;
  while (all.some((t) => Math.abs(((bad - t + 6) % 12 + 12) % 12 - 6) < 1)) bad++;
  await feed(bad, 2600);
  s = await state();
  check(s.wrongLogged, `L${level}: wrong note not logged`);
  // 3. Sing every step, one octave lower than asked on odd levels.
  s = await listening();
  check(s.item === item && s.idx === 0, `L${level}: challenge did not restart`);
  for (let i = 0; i < s.steps.length; i++) {
    const cur = await listening();
    check(cur.idx === i, `L${level}: expected step ${i}, got ${cur.idx}`);
    const t = cur.steps[i].targets[cur.steps[i].targets.length - 1] - (level % 2 ? 12 : 0);
    await feed(t + 0.2, 900);
    await feed(null, 500);
  }
  await feed(null, 1200);
  const mine = (await attempts()).slice(before);
  check(mine.length === 2 && !mine[0].ok && mine[1].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  check(mine.every((a) => a.level === level && a.skill.startsWith('sing.voice.')), `L${level}: bad skill or level`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
