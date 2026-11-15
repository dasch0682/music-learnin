// Usage: node tools/shot.mjs <url-path> <out.png> [light|dark] [js-to-run-before-shot]
// Needs `npx vite preview --port 4173` (or dev server) running. PORT env overrides the port.
import { chromium } from 'playwright-core';
const [path = '/', out = 'shot.png', scheme = 'dark', js] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: scheme, locale: process.env.LOCALE || 'fr-FR' });
const errors = [];
page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:${process.env.PORT || 4173}${path}`);
await page.waitForTimeout(600);
if (js) console.log('eval:', JSON.stringify(await page.evaluate(js)));
await page.waitForTimeout(400);
await page.screenshot({ path: out });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
await browser.close();
