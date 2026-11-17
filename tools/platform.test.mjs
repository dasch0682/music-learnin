// Platform checks: ?level=, profiles, guided path, compare, rewards, update toast.
// Usage: npx vite --port 5401 --strictPort &   then   PORT=5401 node tools/platform.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos, openGame, readAttempts, waitAttempts, waitIdle, scaled, sleep } from './lib/harness.mjs';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const port = process.env.PORT || 5401;
const base = `http://localhost:${port}/`;
const dir = process.argv[2];
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const idb = () => readAttempts(page, null); // waits for the app's own database (a bare indexedDB.open before the app would create it without stores)
const until = async (fn, ms = 10000) => { const end = Date.now() + scaled(ms); while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; };
const gameLoaded = () => page.waitForFunction(() => document.querySelector('.ml-title')?.textContent, null, { timeout: scaled(15000) });
const ls = (k) => page.evaluate((k) => localStorage.getItem(k), k);
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
const day = 86400000;
// Run a snippet inside the page with a core module as `m` (and an argument `arg`).
const core = (mod, body, arg = null) => page.evaluate(`(async (arg) => { const m = await import('/@fs${ROOT}/packages/core/${mod}.js'); ${body} })(${JSON.stringify(arg)})`);
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
await gameLoaded();
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
await gameLoaded();
await page.evaluate(() => document.querySelectorAll('.ml-choices .ml-btn').forEach((b) => b.click()));
await until(async () => (await idb()).length > 0);
let rows = await idb();
check(rows.length > 0 && rows.every((r) => r.who === first), 'attempts carry who=first');
// old attempt without who belongs to the first profile
await seed([mk('read.treble.staff', true, Date.now() - day, { who: undefined })]);
await page.goto(base);
await page.waitForSelector('.hub-tile');
await page.click('#ml-profile');
await page.fill('#ml-profiles .ml-padd input', 'Zoé');
await page.click('#ml-profiles .ml-padd .ml-btn');
await until(async () => JSON.parse((await ls('ml:profiles')) || '[]').length === 2);
const profiles1 = JSON.parse(await ls('ml:profiles'));
check(profiles1.length === 2 && profiles1[1].name === 'Zoé', 'profile added');
const second = profiles1[1].id;
check((await ls('ml:profile')) === second, 'new profile is active');
check(await page.evaluate(() => document.querySelector('#ml-profile').textContent === 'Z'), 'chip shows initial');
await page.keyboard.press('Escape');
// second profile: no attempts of the first one, settings separate
const visible = await core('storage', 'return [(await m.getAttempts()).length, (await m.getAttempts({ who: "*" })).length];');
check(Array.isArray(visible) && visible[0] === 0 && visible[1] >= 2, 'getAttempts is per profile: ' + JSON.stringify(visible));
await page.goto(base + 'play-the-note/');
await gameLoaded();
check((await ls('ml:settings:play-the-note')) && JSON.parse(await ls('ml:settings:play-the-note')).level === 3, 'first profile settings untouched');
check((await ls(`ml:psettings:${second}:play-the-note`)) == null, 'second profile has its own (empty) settings');
await page.goto(base + 'play-the-note/?level=2');
check(JSON.parse(await ls(`ml:psettings:${second}:play-the-note`)).level === 2, 'level saved under second profile');
check(JSON.parse(await ls('ml:settings:play-the-note')).level === 3, 'legacy key still first profile');
await page.goto(base + 'find-a-note/');
await gameLoaded();
await page.evaluate(() => document.querySelectorAll('.ml-choices .ml-btn').forEach((b) => b.click()));
await until(async () => (await idb()).some((r) => r.who === second));
rows = await idb();
check(rows.some((r) => r.who === second), 'attempt carries who=second');
// export: keeps who and name
const ex = await core('transfer', 'return m.buildResults();');
check(ex.profile && ex.profile.name === 'Zoé' && ex.attempts.length > 0 && ex.attempts.every((r) => r.who === ex.profile.id), 'export keeps who and profile name');
const exAll = await core('transfer', 'return m.buildResults(null, { who: "*" });');
check(exAll.profiles.length === 2 && exAll.attempts.every((r) => r.who), 'export of all profiles');
// switch back, delete with confirmation
await page.goto(base);
await page.waitForSelector('.hub-tile');
await page.click('#ml-profile');
await page.click('#ml-profiles .ml-profiles .ml-prow:nth-child(1) .ml-chip');
await until(async () => (await ls('ml:profile')) === first);
check((await ls('ml:profile')) === first, 'switch back');
await page.click('#ml-profiles .ml-profiles .ml-prow:nth-child(2) .ml-del');
check(JSON.parse(await ls('ml:profiles')).length === 2, 'delete needs confirmation');
await page.click('#ml-profiles .ml-confirm .ml-btn:first-of-type');
await until(async () => JSON.parse((await ls('ml:profiles')) || '[]').length === 1);
check(JSON.parse(await ls('ml:profiles')).length === 1, 'profile deleted after confirmation');
rows = await idb();
check(!rows.some((r) => r.who === second), 'deleted profile attempts erased');
check((await ls(`ml:psettings:${second}:play-the-note`)) == null, 'deleted profile settings erased');
check(!(await overflow()), 'profile dialog overflow');
await page.keyboard.press('Escape');


// ---- 3. guided path (pure function, then the home page)
const path = await core('path', `
  const now = Date.now(), D = 86400000, out = {};
  const mk = (skill, ok, t, level = 1) => ({ skill, ok, t, level, game: 'x' });
  const names = (a) => a.map((x) => x.skill + ':' + x.reason + ':' + x.level);
  out.fresh = m.nextSteps([], { now });
  const A = []; for (let i = 0; i < 5; i++) A.push(mk('read.treble.staff', true, now - 20 * D + i));
  out.review = m.nextSteps(A, { now, count: 4 });
  // a learner who plays only reading level 1: nothing in 'read' above level 3
  const B = []; for (let i = 0; i < 12; i++) B.push(mk('read.treble.staff', true, now - i * 1000));
  out.capped = m.nextSteps(B, { now, count: 5 });
  const C = [];
  for (const sk of ['read.treble.staff', 'read.treble.ledger', 'read.bass.staff', 'read.bass.ledger']) for (let i = 0; i < 12; i++) C.push(mk(sk, true, now - i * 1000, 1));
  out.advanced = m.nextSteps(C, { now, count: 5 }).filter((x) => x.domain === 'read');
  out.count3 = m.nextSteps([], { now, count: 3 }).length;
  return out;`);
const domains = (a) => a.map((x) => x.domain);
check(path.fresh.length >= 3 && path.fresh.length <= 5, 'fresh learner gets 3-5 steps: ' + path.fresh.length);
check(new Set(domains(path.fresh)).size === path.fresh.length, 'one step per domain');
check(path.fresh.every((x) => x.reason === 'new' && x.level >= 1 || !x.level), 'fresh steps are new');
check(!path.fresh.some((x) => x.domain === 'theory'), 'no theory for a fresh learner (practice first)');
check(path.review.some((x) => x.reason === 'review' && x.skill === 'read.treble.staff'), 'faded skill comes back as review: ' + JSON.stringify(path.review.map((x) => x.skill + x.reason)));
check(path.capped.every((x) => x.domain !== 'read' || x.skill !== 'read.score'), 'no skill far above the learner');
check(path.advanced.every((x) => x.skill !== 'read.cclefs' && x.skill !== 'read.score'), 'cap: two levels above the median at most: ' + JSON.stringify(path.advanced));
check(path.count3 === 3, 'count option');
// home page
await seed([mk('read.treble.staff', true, Date.now() - 2 * day), mk('read.treble.staff', true, Date.now() - day), mk('read.treble.staff', true, Date.now() - 1000)]);
await page.goto(base);
await page.waitForSelector('.hub-step');
const steps = await page.$$eval('.hub-step', (a) => a.map((x) => x.getAttribute('href')));
check(steps.length >= 3 && steps.length <= 5 && new Set(steps.map((h) => h.split('/')[1])).size === steps.length, 'Today tiles: ' + steps.join(' '));
check(steps.some((h) => h.includes('?level=')), 'Today tile links carry a level');
check((await page.textContent('.hub-today h2 span')) === 'Aujourd’hui', 'Today heading (fr)');
check((await page.textContent('.hub-streak b')) === '3', 'day streak = 3');
check((await page.$$('.hub-streak i.on')).length === 3, 'streak week dots');
check(!(await overflow()), 'home overflow');
if (dir) await page.screenshot({ path: dir + '/home-fr-light.png' });
// first tile: the click opens the game at that level
const target = await page.$eval('.hub-step[href*="level="]', (a) => a.getAttribute('href'));
await page.click(`.hub-step[href="${target}"]`);
await until(async () => JSON.parse((await ls('ml:settings:' + target.split('/')[1])) || '{}').level === +target.split('level=')[1]);
const gid = target.split('/')[1], lvl = +target.split('level=')[1];
check(JSON.parse((await ls('ml:settings:' + gid)) || '{}').level === lvl, `tile opens ${gid} at level ${lvl}`);

// ---- 5. rewards: stars on tiles and map
await seed(Array.from({ length: 10 }, (_, i) => mk('read.treble.staff', true, Date.now() - i * 1000)));
await page.goto(base);
await page.waitForSelector('.hub-tile');
const star = await page.$$eval('.hub-tile', (a) => a.filter((x) => x.getAttribute('href') === './find-a-note/').map((x) => x.querySelector('.hub-stars').textContent));
check(star[0] && star[0].startsWith('★'), 'stars on the find-a-note tile: ' + star);
const rewards = await core('rewards', `
  const day = new Date(2026, 5, 10, 12).getTime(), D = 86400000;
  const at = (back) => ({ t: day - back * D });
  return [m.dayStreak([], day).streak, m.dayStreak([at(0), at(1), at(2), at(4)], day).streak, m.dayStreak([at(1), at(2)], day).streak, m.dayStreak([at(2)], day).streak, m.starsOf('learning'), m.starsOf('good'), m.starsOf('mastered'), m.starsOf('new')];`);
check(JSON.stringify(rewards) === '[0,3,2,0,1,2,3,0]', 'streak and stars rules: ' + JSON.stringify(rewards));
await page.goto(base + 'mastery-map/');
await page.waitForSelector('.map-skill');
check((await page.$$('.map-stars')).length > 0, 'stars on the map');
check(!(await page.$('#map-compare')), 'no compare selector with one profile');

// ---- 4. import a file made by another profile, then compare
const tmp = dir || mkdtempSync(tmpdir() + '/pf-');
const other = (id, name, n0) => ({ app: 'music-learnin', kind: 'results', format: 1, device: 'zz', exported: Date.now(), game: null, profile: { id, name, hue: 200 },
  profiles: [{ id, name, hue: 200 }], attempts: Array.from({ length: 6 }, (_, i) => ({ id: 'o' + n0 + i, t: Date.now() - i * 1000, dev: 'zz', who: id, game: 'find-a-note', skill: 'read.treble.staff', ok: i % 2 === 0, ms: 800, level: 1, item: 'C4', detail: null })) });
writeFileSync(tmp + '/leo.json', JSON.stringify(other('leo123', 'Léo', 'a')));
writeFileSync(tmp + '/mia.json', JSON.stringify(other('mia456', 'Mia', 'b')));
const importFile = async (file, answer) => {
  const n0 = (await idb()).length;
  await page.click('.ml-icon:last-of-type');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.ml-settings .ml-data button:nth-child(4)')]);
  await fc.setFiles(file);
  await page.waitForSelector('.ml-ask');
  const labels = await page.$$eval('.ml-ask .ml-btn', (b) => b.map((x) => x.textContent));
  await page.click(`.ml-ask .ml-btn:nth-of-type(${answer})`);
  await page.waitForSelector('.ml-ask', { state: 'detached' });
  await until(async () => (await idb()).length > n0);
  if (await page.$('.ml-settings[open]:not(.ml-ask)')) await page.keyboard.press('Escape');
  return labels;
};
await page.goto(base);
await page.waitForSelector('.hub-tile');
const before = (await idb()).length;
const labels = await importFile(tmp + '/leo.json', 1);
check(labels.length === 3 && labels[0].includes('nouveau profil') && labels[1].includes('Fusionner'), 'ask dialog (fr): ' + labels.join(' | '));
let plist = JSON.parse(await ls('ml:profiles'));
check(plist.some((p) => p.id === 'leo123' && p.name === 'Léo'), 'file profile added with its name');
check((await ls('ml:profile')) === 'leo123', 'new profile active after import');
check((await idb()).length === before + 6 && (await idb()).filter((r) => r.who === 'leo123').length === 6, 'imported attempts keep who');
// a second file, merged into the active profile instead
await page.goto(base);
await page.waitForSelector('.hub-tile');
await importFile(tmp + '/mia.json', 2);
plist = JSON.parse(await ls('ml:profiles'));
check(!plist.some((p) => p.id === 'mia456'), 'merge does not add a profile');
check((await idb()).filter((r) => r.who === 'leo123').length === 12, 'merge puts attempts in the active profile');
// again the same file: nothing new, no question (profile known after merge? it is not: question again, cancel)
// compare
await page.goto(base + 'mastery-map/');
await page.waitForSelector('#map-compare');
await page.selectOption('#map-compare', first);
await page.waitForSelector('.map-bars');
check((await page.$$('.map-bars')).length > 0 && !!(await page.$('.map-who')), 'compare shows two bars per skill');
check(!(await overflow()), 'map compare overflow');
if (dir) await page.screenshot({ path: dir + '/map-compare-fr-light.png' });

// ---- 6. update toast
await core('update', 'm._showUpdateToast();');
const toast = await page.$eval('.ml-update', (b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, inView: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
check(toast.text === 'Nouvelle version · recharger' && toast.inView, 'update toast: ' + JSON.stringify(toast));
check(!(await overflow()), 'toast overflow');

check(!(await page.evaluate(() => document.body.innerText.includes('null'))) , 'no stray "null" text on the map');
// English labels of the import question and the update toast
{
  const en = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
  const p2 = await en.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(base);
  await p2.waitForSelector('.hub-step');
  check((await p2.textContent('.hub-today h2 span')) === 'Today', 'Today heading (en)');
  check(!(await p2.evaluate(() => document.body.innerText.includes('null'))), 'no stray null text on home');
  if (dir) await p2.screenshot({ path: dir + '/home-en-dark.png' });
  await en.close();
}
// ======================= second part: each block runs in its own fresh context (no shared state with the part above) =======================
const coreOn = (pg, mod, body, arg = null) => pg.evaluate(`(async (arg) => { const m = await import('/@fs${ROOT}/packages/core/${mod}.js'); ${body} })(${JSON.stringify(arg)})`);
const fresh = async (opts = {}) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', acceptDownloads: true, ...opts });
  const pg = await c.newPage();
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto(base);
  await pg.waitForSelector('.hub-tile', { timeout: scaled(15000) });
  await readAttempts(pg, null); // the home page has opened its database: from here IndexedDB can be read and written
  return pg;
};
const resultsFile = (id, name, n, tag, extra = {}) => ({ app: 'music-learnin', kind: 'results', format: 1, device: 'zz', exported: Date.now(), game: null,
  ...(id ? { profile: { id, name, hue: 120 }, profiles: [{ id, name, hue: 120 }] } : {}),
  attempts: Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, t: Date.now() - i * 1000, dev: 'zz', ...(id ? { who: id } : {}), game: 'find-a-note', skill: 'read.treble.staff', ok: i % 2 === 0, ms: 700, level: 1, item: 'C4', detail: null })), ...extra });

// ---- 7. import modes: keep / new / merge / cancel, and the export round trip
{
  const pg = await fresh();
  const me = await coreOn(pg, 'profiles', 'return m.activeId();');
  const owners = async () => { const rows = await readAttempts(pg, null); const o = {}; rows.forEach((r) => { const w = r.who ?? 'none'; o[w] = (o[w] || 0) + 1; }); return o; };
  // keep, profile already known here: no question, attempts keep their owner, a second import adds nothing
  const ana = await coreOn(pg, 'profiles', `return m.addProfile('Ana', { hue: 40 });`);
  const fKnown = resultsFile(ana.id, 'Ana', 4, 'k');
  check(await coreOn(pg, 'transfer', 'return m.inspectResults(arg).needsChoice;', fKnown) === false, 'import: known profile needs no question');
  let r = await coreOn(pg, 'transfer', `const r = await m.applyPayload(arg); return { added: r.added, skipped: r.skipped };`, fKnown);
  check(r.added === 4 && r.skipped === 0, 'import keep: added 4 ' + JSON.stringify(r));
  r = await coreOn(pg, 'transfer', `const r = await m.applyPayload(arg); return { added: r.added, skipped: r.skipped };`, fKnown);
  check(r.added === 0 && r.skipped === 4, 'import keep twice: duplicates skipped ' + JSON.stringify(r));
  check((await owners())[ana.id] === 4 && (await coreOn(pg, 'profiles', 'return m.activeId();')) === me, 'import keep: owner kept, active profile unchanged');
  // keep, unknown profile in the file: the profile is added with its name, nobody is switched
  const fUnknown = resultsFile('zed999', 'Zed', 3, 'u');
  check(await coreOn(pg, 'transfer', 'return m.inspectResults(arg).needsChoice;', fUnknown) === true, 'import: unknown profile asks');
  await coreOn(pg, 'transfer', 'await m.applyPayload(arg, { mode: "keep" });', fUnknown);
  check(JSON.parse(await pg.evaluate(() => localStorage.getItem('ml:profiles'))).some((x) => x.id === 'zed999' && x.name === 'Zed') && (await coreOn(pg, 'profiles', 'return m.activeId();')) === me, 'import keep (unknown): profile added, active unchanged');
  // new: an old file without profile while another profile is active -> asks; "new" creates a profile, switches to it and gives it the attempts
  await coreOn(pg, 'profiles', `m.setActive(arg);`, ana.id);
  const old = resultsFile(null, '', 2, 'o');
  const insp = await coreOn(pg, 'transfer', 'return m.inspectResults(arg);', old);
  check(insp.needsChoice && insp.ambiguous, 'import: old file with another profile active asks ' + JSON.stringify(insp));
  await coreOn(pg, 'transfer', 'await m.applyPayload(arg, { mode: "new" });', old);
  const after = await coreOn(pg, 'profiles', 'return [m.activeId(), m.listProfiles().length];');
  check(after[0] !== ana.id && after[0] !== me && (await owners())[after[0]] === 2, 'import new: attempts belong to the added profile, which is now active ' + JSON.stringify(after));
  // merge: everything goes to the active profile, no profile added
  const nProf = (await coreOn(pg, 'profiles', 'return m.listProfiles().length;'));
  await coreOn(pg, 'transfer', 'await m.applyPayload(arg, { mode: "merge" });', resultsFile('mia777', 'Mia', 5, 'm'));
  check((await coreOn(pg, 'profiles', 'return m.listProfiles().length;')) === nProf && (await owners())[after[0]] === 7, 'import merge: 5 more attempts for the active profile, no new profile');
  // wrong files are refused
  const bad = await coreOn(pg, 'transfer', `try { await m.applyPayload({ app: 'other', kind: 'results', format: 1 }); return 'accepted'; } catch (e) { return e.message; }`);
  check(bad === 'bad-file', 'import: foreign file refused: ' + bad);
  const newer = await coreOn(pg, 'transfer', `try { await m.applyPayload({ app: 'music-learnin', kind: 'results', format: 999, attempts: [] }); return 'accepted'; } catch (e) { return e.message; }`);
  check(newer === 'bad-file', 'import: file from a newer format refused: ' + newer);
  // the dialog: three buttons, the third one cancels and changes nothing
  await coreOn(pg, 'profiles', `m.setActive(arg);`, me);
  const tmp2 = mkdtempSync(tmpdir() + '/pf2-');
  writeFileSync(tmp2 + '/cancel.json', JSON.stringify(resultsFile('cancel1', 'Nina', 3, 'c')));
  await pg.goto(base);
  await pg.waitForSelector('.hub-tile');
  const nBefore = (await readAttempts(pg, null)).length;
  await pg.click('.ml-icon:last-of-type');
  const [fc] = await Promise.all([pg.waitForEvent('filechooser'), pg.click('.ml-settings .ml-data button:nth-child(4)')]);
  await fc.setFiles(tmp2 + '/cancel.json');
  await pg.waitForSelector('.ml-ask');
  const labs = await pg.$$eval('.ml-ask .ml-btn', (b) => b.map((x) => x.textContent));
  check(labs.length === 3 && /Annuler/.test(labs[2]), 'import dialog: cancel button ' + labs);
  await pg.click('.ml-ask .ml-btn:nth-of-type(3)');
  await pg.waitForSelector('.ml-ask', { state: 'detached' });
  check((await readAttempts(pg, null)).length === nBefore && !JSON.parse(await pg.evaluate(() => localStorage.getItem('ml:profiles'))).some((x) => x.id === 'cancel1'), 'import cancel: nothing imported, no profile added');
  // export: the download holds the active profile only; re-importing it adds nothing
  await pg.keyboard.press('Escape');
  await pg.click('.ml-icon:last-of-type');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.ml-settings .ml-data button:nth-child(3)')]);
  const saved = tmp2 + '/export.json';
  await dl.saveAs(saved); // a shared (remote) Chrome has no local path
  const exported = JSON.parse(readFileSync(saved, 'utf8'));
  const mine = (await readAttempts(pg, null)).filter((x) => (x.who ?? me) === me).length;
  check(exported.app === 'music-learnin' && exported.kind === 'results' && exported.attempts.length === mine && exported.attempts.every((x) => x.who === me), `export: ${exported.attempts.length} attempts, expected ${mine}, all of the active profile`);
  check(/^music-learnin-results-all/.test(dl.suggestedFilename()), 'export file name ' + dl.suggestedFilename());
  r = await coreOn(pg, 'transfer', `const r = await m.applyPayload(arg); return { added: r.added };`, exported);
  check(r.added === 0, 'export then import: nothing added');
  await pg.context().close();
}

// ---- 8. guided path "Aujourd'hui": each tile links to the game level that trains the skill
{
  const pg = await fresh();
  const now = Date.now();
  const skills = [['play.scales', 'play-scales', 4], ['read.treble.staff', 'find-a-note', 1], ['sing.match', 'sing-match', 2], ['rhythm.pulse', 'tap-rhythm', 1], ['listen.intervals.basic', 'ear-intervals', 2]];
  const rows = [];
  skills.forEach(([skill, game, level], k) => { for (let i = 0; i < 8; i++) rows.push({ id: `gp${k}_${i}`, t: now - (k * 3 + i) * 3600000, dev: 'zz', who: undefined, game, skill, ok: i % 3 !== 0, ms: 900, level, item: 'x' + (i % 4), detail: null }); });
  await coreOn(pg, 'transfer', `await m.applyPayload(arg);`, { app: 'music-learnin', kind: 'results', format: 1, attempts: rows });
  await pg.reload();
  await pg.waitForSelector('.hub-step');
  const tiles = await pg.$$eval('.hub-step', (a) => a.map((x) => ({ href: x.getAttribute('href'), why: x.querySelector('.hub-why')?.textContent })));
  const want = await coreOn(pg, 'path', `const s = await import('/@fs${ROOT}/packages/core/storage.js'); return m.nextSteps(await s.getAttempts(), { count: 4 });`);
  const gamesDef = await coreOn(pg, 'taxonomy', 'return m.GAMES.map((g) => [g.id, g.levels || null]);');
  const lv = Object.fromEntries(gamesDef);
  check(tiles.length === want.length && tiles.length >= 3, `path: ${tiles.length} tiles for ${want.length} steps`);
  want.forEach((st, i) => {
    const t = tiles[i];
    check(t && t.href === `./${st.game}/${st.level ? '?level=' + st.level : ''}`, `path tile ${i}: href ${t && t.href} for ${st.game} level ${st.level}`);
    if (st.level) {
      check(lv[st.game] && lv[st.game][st.level - 1] === st.skill, `path tile ${i}: level ${st.level} of ${st.game} trains ${lv[st.game] && lv[st.game][st.level - 1]}, not ${st.skill}`);
      check(t && new RegExp(`niveau ${st.level}$`, 'i').test(t.why), `path tile ${i}: label "${t && t.why}" shows level ${st.level}`);
    } else check(!lv[st.game] || !lv[st.game].includes(st.skill), `path tile ${i}: ${st.game} has a level for ${st.skill} but the link has none`);
  });
  // one tile per game and per domain, and the click saves that level for the active profile
  check(new Set(tiles.map((t) => t.href.split('/')[1])).size === tiles.length, 'path: a game twice');
  const first = tiles.find((t) => t.href.includes('?level='));
  if (first) {
    await pg.click(`.hub-step[href="${first.href}"]`);
    await pg.waitForFunction(() => window.__test || document.querySelector('.ml-title'), null, { timeout: scaled(15000) });
    const [g, l] = [first.href.split('/')[1], +first.href.split('level=')[1]];
    check(JSON.parse(await pg.evaluate((g) => localStorage.getItem('ml:settings:' + g), g) || '{}').level === l, `path click: ${g} saved at level ${l}`);
  }
  // English heading and wording
  await pg.context().close();
}

// ---- 9. settings and feedback mode per profile, through the settings dialog of a game
{
  const pg = await openGame(browser, 'play-the-note', { level: 3, lang: 'fr' });
  const lsGet = (k) => pg.evaluate((k) => localStorage.getItem(k), k);
  const first = await coreOn(pg, 'profiles', 'return m.activeId();');
  const second = await coreOn(pg, 'profiles', `return m.addProfile('Bea', { activate: true }).id;`);
  await pg.reload();
  await waitIdle(pg).catch(() => {});
  await pg.waitForFunction(() => document.querySelector('.ml-title')?.textContent, null, { timeout: scaled(15000) });
  const openSettings = async () => { await pg.click('.ml-bar button:has-text("⚙")'); await pg.waitForSelector('dialog.ml-settings[open]'); };
  await openSettings();
  const levelSel = pg.locator('dialog.ml-settings .ml-field:has(> span:text-matches("^(Niveau|Level)$")) select');
  check((await levelSel.inputValue()) === '1', 'second profile starts at level 1 (default), not at the first profile level: ' + (await levelSel.inputValue()));
  await levelSel.selectOption('2');
  check(JSON.parse(await lsGet(`ml:psettings:${second}:play-the-note`)).level === 2, 'dialog: level saved under the second profile');
  check(JSON.parse(await lsGet('ml:settings:play-the-note')).level === 3, 'dialog: first profile level untouched');
  await pg.selectOption('.ml-fb-mode select', 'silent');
  check(JSON.parse(await lsGet(`ml:psettings:${second}:_feedback`)).mode === 'silent' && (await lsGet('ml:settings:_feedback')) === null, 'dialog: feedback mode saved for the second profile only');
  check((await pg.evaluate(() => document.documentElement.dataset.fb)) === 'silent', 'dialog: mode applied at once');
  await pg.keyboard.press('Escape');
  // back to the first profile: its own level and the default mode
  await coreOn(pg, 'profiles', 'm.setActive(arg);', first);
  await pg.reload();
  await pg.waitForFunction(() => document.querySelector('.ml-title')?.textContent, null, { timeout: scaled(15000) });
  check((await pg.evaluate(() => document.documentElement.dataset.fb)) === 'normal', 'first profile: feedback mode normal');
  await openSettings();
  check((await pg.locator('dialog.ml-settings .ml-field:has(> span:text-matches("^(Niveau|Level)$")) select').inputValue()) === '3', 'first profile: level 3 back');
  await pg.keyboard.press('Escape');
  // and the second one again
  await coreOn(pg, 'profiles', 'm.setActive(arg);', second);
  await pg.reload();
  await pg.waitForFunction(() => document.querySelector('.ml-title')?.textContent, null, { timeout: scaled(15000) });
  check((await pg.evaluate(() => document.documentElement.dataset.fb)) === 'silent', 'second profile: feedback mode silent after reload');
  // a query level applies to the active profile only
  await pg.goto(base + 'play-the-note/?level=4');
  check(JSON.parse(await lsGet(`ml:psettings:${second}:play-the-note`)).level === 4 && JSON.parse(await lsGet('ml:settings:play-the-note')).level === 3, '?level= goes to the active profile');
  check(pg.errors.length === 0, 'settings per profile: console ' + pg.errors.join(' | '));
  await pg.context().close();
}

// ---- 10. update toast (English), once, accessible, reloads on click
{
  const pg = await fresh({ locale: 'en-US' });
  await coreOn(pg, 'update', 'm._showUpdateToast(); m._showUpdateToast();');
  check((await pg.locator('.ml-update').count()) === 1, 'update toast: shown once');
  check((await pg.textContent('.ml-update')) === 'New version · reload' && (await pg.getAttribute('.ml-update', 'role')) === 'status', 'update toast: text/role');
  const box = await pg.$eval('.ml-update', (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height, r.left >= 0 && r.right <= innerWidth]; });
  check(box[1] >= 32 && box[2], 'update toast: tap target and inside the screen ' + box);
  await Promise.all([pg.waitForEvent('load'), pg.click('.ml-update')]);
  await pg.waitForSelector('.hub-tile');
  check((await pg.locator('.ml-update').count()) === 0, 'update toast: gone after the reload');
  await pg.context().close();
}

check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
