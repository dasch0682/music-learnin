// Plays every level of Tunes you know with real pointer events: a wrong key, then the right ones.
// Usage: npx vite --port 5406 --strictPort &   then   PORT=5406 node tools/known-tunes.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { TUNES } from '../apps/known-tunes/tunes.js';
const ID = 'known-tunes';
const base = `http://localhost:${process.env.PORT || 5406}/${ID}/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR', hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate((id) => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === id).sort((x, y) => x.t - y.t)); }; }), ID);
const state = () => page.evaluate(() => window.__test.state());

// Scale degrees written by hand (major scale; "-" = octave below, "'" = octave above), independent from the app's MIDI lists.
const DEG = {
  'frere-jacques': ['1 2 3 1', '3 4 5', '5 6 5 4 3 1', '1 5- 1'],
  'au-clair': ['1 1 1 2 3 2', '1 3 2 2 1'],
  'ah-vous-dirai-je': ['1 1 5 5 6 6 5', '4 4 3 3 2 2 1', '5 5 4 4 3 3 2'],
  'ode-to-joy': ['3 3 4 5 5 4 3 2', '1 1 2 3 3 2 2', '3 3 4 5 5 4 3 2', '1 1 2 3 2 1 1'],
  'mary-lamb': ['3 2 1 2 3 3 3', '2 2 2', '3 5 5', '3 2 1 2 3 3 3 3', '2 2 3 2 1'],
  'london-bridge': ['5 6 5 4 3 4 5', '2 3 4', '3 4 5', '5 6 5 4 3 4 5', '2 5 3 1'],
  'susanna': ['1 2 3 5 5 6 5 3', '1 2 3 3 2 1 2'],
  'saints': ['1 3 4 5', '1 3 4 5', '1 3 4 5 3 1 3 2'],
  'amazing-grace': ['5- 1 3 1 3 2', '1 6- 5- 5-', '1 3 1 3 2 5'],
  'pont-avignon': ['1 1 1 2 2 2', '3 4 5 1 7- 1 2 5-', '1 1 1 2 2 2', '3 4 5 1 2 7- 1'],
  'bon-tabac': ['1 2 3 1 2 2 3', '4 4 3 3', '1 2 3 1 2 2 3', '4 5 1'],
  'alouette': ['1 2 3 3', '2 1 2 3 1 5-', '1 2 3 3', '2 1 2 3 1'],
  // A minor, tonic A4: natural minor degrees, '#' raises (G sharp leading note).
  'greensleeves': ['1 3 4 5 6 5 4 2', '7- 1 2 3 1', '1 7#- 1 2 7#- 5-'],
};
// Total beats (quarter = 1) of each new tune, bar by bar with its upbeat: checks the rhythms add up to whole bars.
const BEATS = { 'amazing-grace': 1 + 7 * 3, 'pont-avignon': 8 * 2, 'bon-tabac': 8 * 2, 'alouette': 4 * 2, 'greensleeves': 1 + 7 * 3 + 2 };
const FROM = { greensleeves: 3 };
const MINOR = { greensleeves: 69 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11], NAT_MINOR = [0, 2, 3, 5, 7, 8, 10];
const midiOf = (tok, shift, id) => {
  const [, d, acc, oct] = tok.match(/^(\d)([#b]?)([-']?)$/);
  const o = oct === '-' ? -1 : oct === "'" ? 1 : 0, a = acc === '#' ? 1 : acc === 'b' ? -1 : 0;
  return (MINOR[id] ? MINOR[id] + NAT_MINOR[d - 1] : 60 + MAJOR[d - 1]) + shift + a + 12 * o;
};
const phraseMidis = (id, p, shift) => DEG[id][p].split(' ').map((t) => midiOf(t, shift, id));

// Static checks of the data: every tune has its hand-written degrees, beats match notes, new tunes fill whole bars.
for (const t of TUNES) {
  check(!!DEG[t.id], `data: no degrees for ${t.id}`);
  if (!DEG[t.id]) continue;
  check(t.phrases.length === DEG[t.id].length && t.phrases.every((ph, p) => JSON.stringify(ph.n) === JSON.stringify(phraseMidis(t.id, p, 0)) && ph.b.length === ph.n.length), `data: ${t.id} notes differ from degrees`);
  if (BEATS[t.id]) check(t.phrases.flatMap((ph) => ph.b).reduce((a, b) => a + b, 0) === BEATS[t.id], `data: ${t.id} beats`);
  check((t.from || 1) === (FROM[t.id] || 1), `data: ${t.id} from level ${t.from}`);
  if (t.penta) check(t.phrases.every((ph) => ph.n.every((m) => [0, 2, 4, 7, 9].includes(m % 12))), `data: ${t.id} not pentatonic`);
}
check(TUNES.find((t) => t.id === 'amazing-grace')?.penta, 'data: amazing-grace not marked penta');
const spanOf = (id) => { const a = DEG[id].flatMap((_, p) => phraseMidis(id, p, 0)); return Math.max(...a) - Math.min(...a); };
const SHIFTS = { 1: [0], 2: [0], 3: [0], 4: [7, -5, 5, -7], 5: [0, 7, -5, 5, -7], 6: [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6] };

async function tapKey(midi) {
  const box = await page.locator(`.ml-keyboard [data-midi="${midi}"]`).boundingBox();
  if (!box) throw new Error('no key ' + midi);
  const black = box.height < (await page.locator('.ml-keyboard').boundingBox()).height * 0.8;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * (black ? 0.4 : 0.9));
}
async function setup(level, lang, theme) {
  await page.evaluate(([id, l, lg, th]) => { localStorage.setItem('ml:settings:' + id, JSON.stringify({ level: l, tempo: 130 })); localStorage.setItem('ml:lang', lg); localStorage.setItem('ml:theme', th); }, [ID, level, lang, theme]);
  await page.reload();
  await page.click('.ml-start');
}
const waitAnswer = (cond) => page.waitForFunction((c) => { const s = window.__test.state(); return s.state === 'answer' && (!c || (s.tune !== c.tune || s.phrase !== c.phrase)); }, cond || null, { timeout: 20000 });

await page.goto(base);
for (const level of levels(6)) {
  await setup(level, 'fr', 'light');
  await waitAnswer();
  const seen = new Set();
  for (let t = 0; t < rounds(2, 1); t++) {
    let s = await state();
    const id = s.tune;
    seen.add(id);
    check(!!DEG[id], `L${level}: unknown tune ${id}`);
    check(SHIFTS[level].includes(s.shift), `L${level}: shift ${s.shift}`);
    if (level === 5) check(spanOf(id) >= 9, `L5: ${id} too narrow`);
    check((FROM[id] || 1) <= level, `L${level}: ${id} appears before level ${FROM[id]}`);
    check(s.phrases === DEG[id].length, `L${level} ${id}: ${s.phrases} phrases`);
    const nPhrases = level <= 2 ? 1 : DEG[id].length;
    for (let p = 0; p < nPhrases; p++) {
      s = await state();
      check(s.phrase === p, `L${level} ${id}: phrase ${s.phrase} want ${p}`);
      const full = phraseMidis(id, p, s.shift);
      if (level === 1) {
        check(s.expected.length >= 3 && s.expected.length <= Math.min(5, full.length) && JSON.stringify(full.slice(0, s.expected.length)) === JSON.stringify(s.expected), `L1 ${id}: opening ${s.expected} of ${full}`);
      } else check(JSON.stringify(full) === JSON.stringify(s.expected), `L${level} ${id} p${p}: expected ${s.expected} want ${full}`);
      const whites = await page.$$eval('.ml-keyboard .ml-white', (e) => e.length);
      check(whites <= 12, `L${level}: ${whites} white keys`);
      check(s.expected.every((m) => m >= s.win[0] && m <= s.win[1]), `L${level}: notes out of keyboard`);
      check(JSON.stringify(s.startMarked) === JSON.stringify(level <= 4 ? [s.expected[0]] : []), `L${level}: start key ${s.startMarked}`);
      check(s.name === '', `L${level}: name before success "${s.name}"`);
      if (t === 0 && p === 0 && dir && level === 1) await page.screenshot({ path: `${dir}/kt-${level}.png` });
      const before = (await attempts()).length;
      for (let i = 0; i < s.expected.length; i++) {
        if (t === 0 && p === 0 && i === 1) {
          const wrong = [s.expected[1] + 1, s.expected[1] - 1].find((m) => m >= s.win[0] && m <= s.win[1] && m !== s.expected[1]);
          await tapKey(wrong);
          const bad = await page.$$eval('.ml-keyboard .ml-bad', (e) => e.length);
          check(bad === 1, `L${level}: wrong key did not flash`);
          await waitAnswer();
          const st = await state();
          check(st.pos === 0 && st.phrase === 0, `L${level}: after wrong key pos ${st.pos}`);
          for (let j = 0; j < 2; j++) await tapKey(s.expected[j]);
          continue;
        }
        await tapKey(s.expected[i]);
      }
      await page.waitForTimeout(250);
      const mine = (await attempts()).slice(before);
      const exp = t === 0 && p === 0 ? [false, true] : [true];
      check(mine.map((a) => a.ok).join() === exp.join() && mine.every((a) => a.skill === 'play.tunes' && a.level === level && a.item === id && a.detail.phrase === p), `L${level} ${id} p${p}: ${JSON.stringify(mine.map((a) => [a.ok, a.skill, a.level, a.item, a.detail?.phrase]))}`);
      const after = await state();
      if (level <= 2) check(after.nameShown && after.name.length > 3, `L${level}: name not shown after success`);
      else check(after.name === '', `L${level}: name shown "${after.name}"`);
      if (level <= 2 && t === 0 && dir && level === 2) await page.screenshot({ path: `${dir}/kt-${level}-name.png` });
      await waitAnswer({ tune: id, phrase: p });
    }
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}

// Each new tune, forced through the test hook at level 3 (whole tune, no transposition): every phrase, then a wrong key.
await setup(3, 'en', 'light');
await waitAnswer();
for (const id of rounds(["amazing-grace", "pont-avignon", "bon-tabac", "alouette", "greensleeves"], ["amazing-grace", "greensleeves"])) {
  await page.evaluate((x) => window.__test.force(x), id);
  await page.waitForFunction((x) => { const s = window.__test.state(); return s.state === 'answer' && s.tune === x && s.phrase === 0; }, id, { timeout: 20000 });
  for (let p = 0; p < DEG[id].length; p++) {
    const s = await state();
    const full = phraseMidis(id, p, 0);
    check(s.tune === id && s.phrase === p && s.shift === 0 && JSON.stringify(s.expected) === JSON.stringify(full), `new ${id} p${p}: ${s.expected} want ${full}`);
    check(s.expected.every((m) => m >= s.win[0] && m <= s.win[1]), `new ${id}: notes out of keyboard`);
    const before = (await attempts()).length;
    if (p === 0) {
      const wrong = [s.expected[0] + 1, s.expected[0] - 1].find((m) => m >= s.win[0] && m <= s.win[1]);
      await tapKey(wrong);
      await waitAnswer();
    }
    for (const m of s.expected) await tapKey(m);
    await page.waitForTimeout(250);
    const mine = (await attempts()).slice(before);
    check(mine.map((a) => a.ok).join() === (p === 0 ? 'false,true' : 'true') && mine.every((a) => a.item === id && a.level === 3 && a.detail.phrase === p), `new ${id} p${p}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.detail?.phrase]))}`);
    if (p < DEG[id].length - 1) await waitAnswer({ tune: id, phrase: p });
  }
  console.log('new', id, 'ok');
}
await page.evaluate(() => window.__test.force(null));

// Clean streak offers the next level with one tap (English, dark).
await setup(1, 'en', 'dark');
await waitAnswer();
for (let r = 0; r < 6; r++) {
  const s = await state();
  for (const m of s.expected) await tapKey(m);
  await page.waitForTimeout(200);
  await waitAnswer({ tune: s.tune, phrase: s.phrase });
}
if (dir) await page.screenshot({ path: `${dir}/kt-en-dark.png` });
check(await page.isVisible('.tn-next button'), 'next level button not shown after a clean streak');
await page.click('.tn-next button');
await waitAnswer();
check((await state()).level === 2, 'next level button did not change the level');
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
