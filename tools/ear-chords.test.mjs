// Chords by ear, every level: chord notes against the theory (type, root position or inversion, range, no other listed type fits),
// buttons per level; one wrong then right answers (log), reveal after the 2nd miss, next level after a clean streak,
// settings persistence, smoke (themes, languages, overflow).
// Usage: PORT=5220 [FAST=1] node tools/ear-chords.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, answerChoice, levelUpCheck, pcs } from './lib/shared-a.mjs';
const SLUG = 'ear-chords';
const url = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker(), { check, errors } = C;
const browser = await launch();
await smoke({ browser, url, check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const STEPS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], maj7: [0, 4, 7, 11], dom7: [0, 4, 7, 10], min7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9] };
const LEVELS = {
  1: { types: ['maj', 'min'], inv: false },
  2: { types: ['maj', 'min'], inv: true },
  3: { types: ['maj', 'min', 'dim', 'aug'], inv: false },
  4: { types: ['maj7', 'dom7', 'min7'], inv: false },
  5: { types: ['maj7', 'dom7', 'min7', 'm7b5', 'dim7'], inv: false },
};
const fits = (type, notes) => [...Array(12).keys()].some((r) => pcs(STEPS[type].map((x) => r + x)).join() === pcs(notes).join());
const R = (t) => `.ec-choices button[data-type="${t}"]`;
const open = async (level) => {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-chords', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
};
await page.goto(url);
for (const level of levels(5)) {
  const cfg = LEVELS[level];
  await open(level);
  let s = await page.evaluate(() => window.__test.state());
  const seen = [];
  for (let round = 0; round < rounds(24, 4); round++) {
    const tag = `L${level} r${round} ${s.item}`;
    seen.push(s.item);
    check(s.level === level && cfg.types.includes(s.item) && JSON.stringify(s.types) === JSON.stringify(cfg.types), `${tag}: types ${s.types}`);
    check(s.notes.length === STEPS[s.item].length && new Set(s.notes).size === s.notes.length, `${tag}: note count ${s.notes}`);
    check(fits(s.item, s.notes), `${tag}: notes ${s.notes} are not a ${s.item}`);
    check(cfg.types.every((t) => t === s.item || !fits(t, s.notes)), `${tag}: notes ${s.notes} also fit another listed type`);
    if (!cfg.inv) check(s.notes.every((m, i) => m - s.notes[0] === STEPS[s.item][i]), `${tag}: root position expected ${s.notes}`);
    else check(s.notes[s.notes.length - 1] - s.notes[0] < 24 && s.notes.every((m, i) => i === 0 || m > s.notes[i - 1]), `${tag}: voicing ${s.notes}`);
    check(s.notes.every((m) => m >= (level === 1 ? 55 : 50) && m <= 90), `${tag}: range ${s.notes}`);
    check(s.icons === (level === 1), `${tag}: icons`);
    check(s.arp === false || level >= 2, `${tag}: arpeggio at level 1`);
    const btn = await page.$$eval('.ec-choices button', (bs) => bs.map((b) => b.dataset.type));
    check(JSON.stringify(btn) === JSON.stringify(cfg.types), `${tag}: buttons ${btn}`);
    if (round === 0 && dir && level % 2) await page.screenshot({ path: `${dir}/ec-${level}.png` });
    const wrongs = cfg.types.filter((t) => t !== s.item).map(R);
    const mode = round === 0 ? 'wrong1' : round === 1 && wrongs.length > 1 ? 'wrong2' : 'right';
    s = await answerChoice({ page, slug: SLUG, level, skill: skillOf(SLUG, level), check, tag, s, mode, rightSel: R(s.item), wrongSels: wrongs });
  }
  // core pickWeak (4 items or fewer may repeat): the app passes avoid only when there are more than 4 types, i.e. level 5
  if (level === 5) check(!seen.some((x, i) => i && x === seen[i - 1]), `L${level}: same item twice in a row ${seen}`);
  if (!FAST && cfg.types.length <= 4) check(cfg.types.every((t) => seen.includes(t)), `L${level}: not every chord came up (${[...new Set(seen)]})`);
  if (!FAST || level === 1 || level === 5) await levelUpCheck({ page, slug: SLUG, level, check, rightSelOf: (st) => R(st.item), nextSel: '.ec-next', last: level === 5, celebrate: true });
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...new Set(seen)].join(' '));
}
await open(1);
await persistCheck({ page, url, slug: SLUG, fields: [[0, 'level', 4]], check, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); return s.level === 4 && s.item.includes('7') ? '' : `level ${s.level} ${s.item}`; } });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
