// Catalog checks: taxonomy.js (GAMES, SKILLS) against the files of every game. Mostly pure; one page checks the runtime.
//  - each game has apps/<slug>/index.html (a copy of the find-a-note one, only <title> differs), main.js and tools/<slug>.test.mjs; no orphan app folder
//  - titles: taxonomy = createGame title (en, fr) = index.html <title> (en), at most 22 characters, no duplicates
//  - levels: every entry is a known skill id, the length equals the number of level options of main.js, each skill belongs to that game
//  - every skill is reachable by some game
//  - page: the home page lists every game with its title (fr and en); each game page shows the same title and the same number of level options
// Usage: PORT=5260 node tools/catalog.test.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, openGame, scaled } from './lib/harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const { GAMES, SKILLS, DOMAINS } = await import(pathToFileURL(ROOT + '/packages/core/taxonomy.js').href);
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');
const NOT_GAMES = ['mastery-map']; // pages of apps/ that are not games (no tile in GAMES)
const MAX_TITLE = 22;

// ---------- static reading of main.js ----------
// A quoted string literal whose opening quote is capture group `g` (value in group g + 1).
const str = (g) => '([\'"`])((?:\\\\.|(?!\\' + g + ')[^\\\\])*)\\' + g;
const unescape = (s) => s.replace(/\\(['"`\\])/g, '$1').replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
function titleOf(src) {
  const body = src.slice(src.indexOf('createGame('));
  const m = new RegExp(String.raw`title:\s*L\(\s*${str(1)}\s*,\s*${str(3)}\s*\)`).exec(body)
    || new RegExp(String.raw`title:\s*\{\s*en:\s*${str(1)}\s*,\s*fr:\s*${str(3)}`).exec(body);
  return m ? { en: unescape(m[2]), fr: unescape(m[4]) } : null;
}
/** Number of options of the `level` select, counted in the settings block of createGame. null = not static. */
function levelCount(src) {
  const i = src.indexOf("key: 'level'");
  if (i < 0) return 0;
  const j = src.indexOf('options:', i);
  if (j < 0) return null;
  const k = src.indexOf('] }', j);
  const n = (src.slice(j, k).match(/\{\s*value:/g) || []).length;
  return n || null;
}

// ---------- pure checks ----------
const ids = GAMES.map((g) => g.id);
check(new Set(ids).size === ids.length, 'duplicate game ids');
check(GAMES.length >= 30, `only ${GAMES.length} games in taxonomy`);
const skillIds = new Set(SKILLS.map((k) => k.id));
check(skillIds.size === SKILLS.length, 'duplicate skill ids');
const domainIds = new Set(DOMAINS.map((d) => d.id));
const reference = read('apps/find-a-note/index.html');
const norm = (h) => h.replace(/<title>.*?<\/title>/s, '<title></title>').replace(/\r/g, '').trim();
const titles = new Map(); // lower-case title -> game
const staticLevels = {};
const reachable = new Set();

for (const g of GAMES) {
  const w = g.id;
  check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(w), `${w}: odd slug`);
  check(domainIds.has(g.domain), `${w}: unknown domain ${g.domain}`);
  check(g.icon && g.icon.trim().length > 0, `${w}: no icon`);
  const html = existsSync(`${ROOT}/apps/${w}/index.html`), js = existsSync(`${ROOT}/apps/${w}/main.js`), tst = existsSync(`${ROOT}/tools/${w}.test.mjs`);
  check(html, `${w}: apps/${w}/index.html missing`);
  check(js, `${w}: apps/${w}/main.js missing`);
  check(tst, `${w}: tools/${w}.test.mjs missing`);
  // titles
  check(g.en && g.fr && g.en.length <= MAX_TITLE && g.fr.length <= MAX_TITLE, `${w}: title too long (${g.en.length}/${g.fr.length} > ${MAX_TITLE}): "${g.en}" / "${g.fr}"`);
  for (const [lang, t] of [['en', g.en], ['fr', g.fr]]) {
    const key = lang + ':' + t.trim().toLowerCase();
    check(!titles.has(key), `${w}: ${lang} title "${t}" already used by ${titles.get(key)}`);
    titles.set(key, w);
  }
  if (html) {
    const src = read(`apps/${w}/index.html`);
    const m = /<title>(.*?)<\/title>/s.exec(src);
    check(m && m[1].trim() === g.en, `${w}: index.html <title> "${m && m[1]}" should be "${g.en}"`);
    check(norm(src) === norm(reference), `${w}: index.html differs from the find-a-note one beyond <title>`);
  }
  if (js) {
    const src = read(`apps/${w}/main.js`);
    check(new RegExp(`createGame\\(\\{\\s*id:\\s*['"]${w}['"]`).test(src), `${w}: createGame id is not "${w}"`);
    const t = titleOf(src);
    check(!!t, `${w}: cannot read config.title in main.js`);
    if (t) check(t.en === g.en && t.fr === g.fr, `${w}: main.js title "${t.en}" / "${t.fr}" differs from taxonomy "${g.en}" / "${g.fr}"`);
    const n = levelCount(src);
    staticLevels[w] = n;
    if (g.levels) {
      check(n !== null, `${w}: level options not countable in main.js`);
      if (n !== null) check(n === g.levels.length, `${w}: taxonomy has ${g.levels.length} levels, main.js has ${n} level options`);
    } else {
      check(!n, `${w}: main.js has ${n} level options but taxonomy has no "levels"`);
    }
  }
  // levels / skills
  for (const [i, id] of (g.levels || []).entries()) {
    check(skillIds.has(id), `${w}: level ${i + 1} uses unknown skill "${id}"`);
    const k = SKILLS.find((x) => x.id === id);
    if (k) { check(k.game === w, `${w}: level ${i + 1} skill "${id}" belongs to "${k.game}"`); reachable.add(id); }
  }
}
for (const k of SKILLS) {
  check(k.game && ids.includes(k.game), `skill ${k.id}: game "${k.game}" is not in GAMES`);
  const g = GAMES.find((x) => x.id === k.game);
  if (g && g.levels) check(g.levels.includes(k.id), `skill ${k.id}: not reachable, absent from the levels of ${k.game}`);
  else if (g) reachable.add(k.id); // a game without levels trains all its skills
  check(domainIds.has(k.domain), `skill ${k.id}: unknown domain`);
  check(k.en && k.fr, `skill ${k.id}: missing name`);
}
const unreachable = SKILLS.filter((k) => !reachable.has(k.id));
check(!unreachable.length, `skills no game reaches: ${unreachable.map((k) => k.id).join(', ')}`);
// folders of apps/ without a tile
for (const d of readdirSync(`${ROOT}/apps`, { withFileTypes: true })) {
  if (d.isDirectory() && existsSync(`${ROOT}/apps/${d.name}/index.html`)) check(ids.includes(d.name) || NOT_GAMES.includes(d.name), `apps/${d.name}: not in taxonomy GAMES`);
}
for (const f of readdirSync(`${ROOT}/tools`)) {
  const m = /^(.+)\.test\.mjs$/.exec(f);
  if (m) check(ids.includes(m[1]) || ['platform', 'feedback', 'midi', 'catalog'].includes(m[1]), `tools/${f}: no such game`);
}

// ---------- one page: home page tiles, then every game's title and level options at run time ----------
const browser = await launch();
const home = `http://localhost:${process.env.PORT || 5220}/`;
for (const lang of ['fr', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, locale: lang === 'en' ? 'en-US' : 'fr-FR' });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.addInitScript((l) => { try { localStorage.setItem('ml:lang', l); } catch {} }, lang);
  await p.goto(home);
  await p.waitForSelector('.hub-tile', { timeout: scaled(15000) });
  const tiles = await p.$$eval('.hub-tile:not(.hub-step)', (a) => a.map((x) => [x.getAttribute('href'), x.querySelector('.hub-name')?.textContent]));
  check(tiles.length === GAMES.length, `home (${lang}): ${tiles.length} tiles for ${GAMES.length} games`);
  for (const g of GAMES) {
    const t = tiles.find(([h]) => h === `./${g.id}/`);
    check(t && t[1] === g[lang], `home (${lang}): tile of ${g.id} reads "${t && t[1]}", taxonomy says "${g[lang]}"`);
  }
  check(!errors.length, `home (${lang}) errors: ${errors.join(' | ')}`);
  await ctx.close();
}
{
  const page = await openGame(browser, 'find-a-note', { lang: 'fr' });
  for (const g of GAMES) {
    await page.goto(home + g.id + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.ml-title')?.textContent && document.title, null, { timeout: scaled(15000) }).catch(() => {});
    const r = await page.evaluate(() => {
      [...document.querySelectorAll('.ml-bar button')].find((b) => b.textContent === '⚙')?.click();
      const field = [...document.querySelectorAll('dialog.ml-settings .ml-field')].find((f) => /^(Niveau|Level)$/.test(f.firstChild?.textContent || ''));
      const sel = field?.querySelector('select');
      return { title: document.title, bar: document.querySelector('.ml-title')?.textContent, options: sel ? sel.options.length : 0 };
    });
    check(r.title === g.fr && r.bar === g.fr, `${g.id} page: title "${r.title}" / "${r.bar}", taxonomy "${g.fr}"`);
    const want = g.levels ? g.levels.length : 0;
    check(r.options === want, `${g.id} page: ${r.options} level options on the page, ${want} in taxonomy`);
  }
  check(!page.errors.length, 'game pages errors: ' + page.errors.slice(0, 3).join(' | '));
}
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
