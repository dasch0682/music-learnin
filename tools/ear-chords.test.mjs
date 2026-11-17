// Plays every level of Chords by ear: a wrong answer, then the right one. Checks the notes of the chord against the theory.
// Usage: npx vite --port 5408 --strictPort &   then   PORT=5408 node tools/ear-chords.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5408}/ear-chords/`;
const shots = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'ear-chords').sort((x, y) => x.t - y.t)); }; }));
const wait = (ms) => page.waitForTimeout(ms);
const STEPS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9] };
const LEVELS = {
  1: { skill: 'listen.chords.triads', types: ['maj', 'min'], inv: false },
  2: { skill: 'listen.chords.triads', types: ['maj', 'min'], inv: true },
  3: { skill: 'listen.chords.triads4', types: ['maj', 'min', 'dim', 'aug'], inv: false },
  4: { skill: 'listen.chords.sevenths', types: ['maj7', 'dom7', 'min7'], inv: false },
  5: { skill: 'listen.chords.sevenths', types: ['maj7', 'dom7', 'min7', 'm7b5', 'dim7'], inv: false },
};
const pcs = (a) => [...new Set(a.map((m) => ((m % 12) + 12) % 12))].sort((x, y) => x - y).join();
await page.goto(base);
for (const level of levels(5)) {
  const cfg = LEVELS[level];
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-chords', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
  const seen = new Set();
  for (let round = 0; round < rounds(10, 2); round++) {
    await page.waitForFunction(() => window.__test?.state());
    const s = await page.evaluate(() => window.__test.state());
    const tag = `L${level} r${round} ${s.item}`;
    seen.add(s.item);
    check(cfg.types.includes(s.item) && JSON.stringify(s.types) === JSON.stringify(cfg.types), `${tag}: types ${s.types}`);
    check(s.notes.length === STEPS[s.item].length && new Set(s.notes).size === s.notes.length, `${tag}: note count ${s.notes}`);
    // some root gives exactly this chord (inversions allowed from level 2 only)
    const okRoot = [...Array(12).keys()].some((r) => pcs(STEPS[s.item].map((x) => r + x)) === pcs(s.notes));
    check(okRoot, `${tag}: notes ${s.notes} are not a ${s.item}`);
    if (!cfg.inv) check(s.notes.every((m, i) => i === 0 || m - s.notes[0] === STEPS[s.item][i]), `${tag}: root position expected ${s.notes}`);
    else check(s.notes[s.notes.length - 1] - s.notes[0] < 24 && s.notes.every((m) => m >= 50 && m <= 50 + 12 + 12 + 12), `${tag}: voicing ${s.notes}`);
    check(s.notes.every((m) => m >= 50 && m <= 80), `${tag}: range ${s.notes}`);
    check(s.icons === (level === 1), `${tag}: icons`);
    const btn = await page.$$eval('.ec-choices button', (bs) => bs.map((b) => b.dataset.type));
    check(JSON.stringify(btn) === JSON.stringify(cfg.types), `${tag}: buttons ${btn}`);
    const wrong = cfg.types.find((t) => t !== s.item);
    const before = (await attempts()).length;
    if (round === 0) {
      if (shots && level % 2) await page.screenshot({ path: `${shots}/ec-${level}.png` });
      await page.click(`.ec-choices button[data-type="${wrong}"]`);
      await wait(150);
    }
    await page.click(`.ec-choices button[data-type="${s.item}"]`);
    await wait(1100);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === cfg.skill, `${tag}: ${JSON.stringify(mine.map((a) => [a.skill, a.ok, a.level, a.item]))}`);
    if (round === 0) check(true);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
