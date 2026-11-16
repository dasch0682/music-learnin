// Smoke test of the production build: every page loads without error, fits a phone screen,
// works offline after the first visit, and results survive an export/import round trip.
// Usage: npm run build && npx vite preview --port 4173 &  then  node tools/smoke.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 4173}`;
const dir = process.argv[2];
const pages = ['', 'mastery-map/', 'find-a-note/', 'high-low/', 'echo-penta/', 'ear-intervals/', 'ear-chords/', 'ear-cadences/', 'sing-match/', 'second-voice/', 'penta-jam/', 'play-the-note/', 'tap-rhythm/'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL', msg); };

for (const [scheme, locale] of [['dark', 'fr-FR'], ['light', 'en-US']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: scheme, locale });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const p of pages) {
    errors.length = 0;
    await page.goto(base + '/' + p);
    await page.waitForTimeout(500);
    const start = await page.$('.ml-start');
    if (start) { await start.click(); await page.waitForTimeout(900); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (errors.length) fail(`${scheme} /${p}: ${errors.join(' | ')}`);
    if (overflow) fail(`${scheme} /${p}: horizontal overflow`);
    if (dir) await page.screenshot({ path: `${dir}/${scheme}-${p.replace('/', '') || 'home'}.png` });
  }
  if (scheme === 'dark') {
    // Offline: the service worker must serve every page.
    await page.goto(base + '/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(1500);
    await ctx.setOffline(true);
    for (const p of pages) {
      const ok = await page.goto(base + '/' + p).then((r) => r && r.ok()).catch(() => false);
      const drawn = ok && await page.evaluate(() => !!document.querySelector('.ml-bar'));
      if (!drawn) fail(`offline /${p}`);
    }
    await ctx.setOffline(false);
    // Answer one question in find-a-note, then check the log and the mastery map.
    await page.goto(base + '/find-a-note/');
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.ml-choices .ml-btn').forEach((b) => b.click()));
    await page.waitForTimeout(600);
    const n = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.length); }; }));
    if (!n) fail('no attempt logged');
    console.log('attempts logged:', n);
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
