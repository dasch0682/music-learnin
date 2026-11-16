// Platform checks: ?level=, profiles, guided path, compare, rewards, update toast.
// Usage: npx vite --port 5401 --strictPort &   then   PORT=5401 node tools/platform.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const port = process.env.PORT || 5401;
const base = `http://localhost:${port}/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const idb = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result); }; }));
const ls = (k) => page.evaluate((k) => localStorage.getItem(k), k);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const day = 86400000;
// Put attempts straight into IndexedDB (the app opens the same database).
const seed = (rows) => page.evaluate((rows) => new Promise((res) => {
  const r = indexedDB.open('music-learnin', 1);
  r.onupgradeneeded = () => { const s = r.result.createObjectStore('attempts', { keyPath: 'id' }); s.createIndex('game', 'game'); s.createIndex('skill', 'skill'); };
  r.onsuccess = () => { const tx = r.result.transaction('attempts', 'readwrite'); rows.forEach((x) => tx.objectStore('attempts').put(x)); tx.oncomplete = () => res(true); };
}), rows);
let n = 0;
const mk = (skill, ok, t, extra = {}) => ({ id: 'seed' + (n++), t, dev: 'test', game: extra.game || 'find-a-note', skill, ok, ms: 900, level: 1, item: extra.item || 'x' + (n % 5), ...extra });

// ---- 1. ?level=N
await page.goto(base + 'play-the-note/?level=3');
await page.waitForTimeout(400);
let s = JSON.parse((await ls('ml:settings:play-the-note')) || '{}');
check(s.level === 3, 'level=3 saved: ' + JSON.stringify(s));
check(!page.url().includes('level='), 'level param removed from URL');
await page.goto(base + 'play-the-note/?level=99');
s = JSON.parse((await ls('ml:settings:play-the-note')) || '{}');
check(s.level === 3, 'invalid level ignored: ' + JSON.stringify(s));
await page.goto(base + 'play-the-note/?level=abc');
await page.goto(base + 'play-the-note/');
s = JSON.parse((await ls('ml:settings:play-the-note')) || '{}');
check(s.level === 3, 'level kept after reload');

// ---- 2. profiles
await page.goto(base);
await page.waitForSelector('.hub-tile');
const profiles0 = JSON.parse(await ls('ml:profiles'));
check(profiles0.length === 1, 'one default profile');
const first = profiles0[0].id;
check((await ls('ml:profile:first')) === first, 'first profile owns legacy data');
// a game answer carries who
await page.goto(base + 'find-a-note/');
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('.ml-choices .ml-btn').forEach((b) => b.click()));
await page.waitForTimeout(500);
let rows = await idb();
check(rows.length > 0 && rows.every((r) => r.who === first), 'attempts carry who=first');
// old attempt without who belongs to the first profile
await seed([mk('read.treble.staff', true, Date.now() - day, { who: undefined })]);
await page.goto(base);
await page.waitForSelector('.hub-tile');
await page.click('#ml-profile');
await page.fill('#ml-profiles .ml-padd input', 'Zoé');
await page.click('#ml-profiles .ml-padd .ml-btn');
await page.waitForTimeout(200);
const profiles1 = JSON.parse(await ls('ml:profiles'));
check(profiles1.length === 2 && profiles1[1].name === 'Zoé', 'profile added');
const second = profiles1[1].id;
check((await ls('ml:profile')) === second, 'new profile is active');
check(await page.evaluate(() => document.querySelector('#ml-profile').textContent === 'Z'), 'chip shows initial');
await page.keyboard.press('Escape');
// second profile: no attempts of the first one, settings separate
const visible = await page.evaluate(async (id) => { const m = await import('/@fs/' + '/home/claude/music-learnin/packages/core/storage.js'); return [(await m.getAttempts()).length, (await m.getAttempts({ who: '*' })).length]; }, first).catch((e) => String(e));
check(Array.isArray(visible) && visible[0] === 0 && visible[1] >= 2, 'getAttempts is per profile: ' + JSON.stringify(visible));
await page.goto(base + 'play-the-note/');
await page.waitForTimeout(300);
check((await ls('ml:settings:play-the-note')) && JSON.parse(await ls('ml:settings:play-the-note')).level === 3, 'first profile settings untouched');
check((await ls(`ml:psettings:${second}:play-the-note`)) == null, 'second profile has its own (empty) settings');
await page.goto(base + 'play-the-note/?level=2');
check(JSON.parse(await ls(`ml:psettings:${second}:play-the-note`)).level === 2, 'level saved under second profile');
check(JSON.parse(await ls('ml:settings:play-the-note')).level === 3, 'legacy key still first profile');
await page.goto(base + 'find-a-note/');
await page.waitForTimeout(300);
await page.evaluate(() => document.querySelectorAll('.ml-choices .ml-btn').forEach((b) => b.click()));
await page.waitForTimeout(500);
rows = await idb();
check(rows.some((r) => r.who === second), 'attempt carries who=second');
// export: keeps who and name
const ex = await page.evaluate(async () => { const m = await import('/@fs/' + '/home/claude/music-learnin/packages/core/transfer.js'); return m.buildResults(); });
check(ex.profile && ex.profile.name === 'Zoé' && ex.attempts.length > 0 && ex.attempts.every((r) => r.who === ex.profile.id), 'export keeps who and profile name');
const exAll = await page.evaluate(async () => { const m = await import('/@fs/' + '/home/claude/music-learnin/packages/core/transfer.js'); return m.buildResults(null, { who: '*' }); });
check(exAll.profiles.length === 2 && exAll.attempts.every((r) => r.who), 'export of all profiles');
// switch back, delete with confirmation
await page.goto(base);
await page.waitForSelector('.hub-tile');
await page.click('#ml-profile');
await page.click('#ml-profiles .ml-profiles .ml-prow:nth-child(1) .ml-chip');
await page.waitForTimeout(200);
check((await ls('ml:profile')) === first, 'switch back');
await page.click('#ml-profiles .ml-profiles .ml-prow:nth-child(2) .ml-del');
check(JSON.parse(await ls('ml:profiles')).length === 2, 'delete needs confirmation');
await page.click('#ml-profiles .ml-confirm .ml-btn:first-of-type');
await page.waitForTimeout(300);
check(JSON.parse(await ls('ml:profiles')).length === 1, 'profile deleted after confirmation');
rows = await idb();
check(!rows.some((r) => r.who === second), 'deleted profile attempts erased');
check((await ls(`ml:psettings:${second}:play-the-note`)) == null, 'deleted profile settings erased');
check(!(await overflow()), 'profile dialog overflow');
await page.keyboard.press('Escape');

//@@MORE@@
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
