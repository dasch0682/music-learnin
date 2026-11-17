// Scales by ear, every level: the notes played match the scale (steps, tonic range, up or up-and-down), choices per level, labels (mode names);
// one wrong then right answers (log), reveal after the 2nd miss, next level after a clean streak, settings (level, speed) persistence, smoke.
// Usage: PORT=5220 [FAST=1] node tools/ear-scales.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, answerChoice, levelUpCheck } from './lib/shared-a.mjs';
const SLUG = 'ear-scales';
const url = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker(), { check, errors } = C;
const browser = await launch();
await smoke({ browser, url, check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
// Independent reference: semitones above the tonic.
const STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11], melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  pentaMajor: [0, 2, 4, 7, 9], pentaMinor: [0, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], locrian: [0, 1, 3, 5, 6, 8, 10], wholeTone: [0, 2, 4, 6, 8, 10], blues: [0, 3, 5, 6, 7, 10],
};
const ALLOWED = {
  1: ['major', 'minor'], 2: ['major', 'minor', 'pentaMajor', 'pentaMinor'], 3: ['minor', 'harmonicMinor', 'melodicMinor'],
  4: ['major', 'dorian', 'mixolydian', 'minor'], 5: ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'],
  6: Object.keys(STEPS).filter((k) => !['pentaMajor', 'pentaMinor', 'melodicMinor'].includes(k)),
};
const R = (t) => `.sc-choices button[data-type="${t}"]`;
const open = async (level, p = page) => {
  await p.evaluate((l) => localStorage.setItem('ml:settings:ear-scales', JSON.stringify({ level: l, tempo: 320 })), level);
  await p.reload();
  await p.click('.ml-start');
  await p.waitForFunction(() => window.__test?.state()?.item);
};
await page.goto(url);
for (const level of levels(6)) {
  await open(level);
  let s = await page.evaluate(() => window.__test.state());
  const seen = [];
  for (let round = 0; round < rounds(24, 4); round++) {
    const tag = `L${level} r${round} ${s.item}`;
    seen.push(s.item);
    const up = [...STEPS[s.item], 12].map((x) => s.tonic + x);
    check(s.level === level && ALLOWED[level].includes(s.item), `${tag}: item not allowed`);
    check(s.types.includes(s.item) && s.types.every((t) => ALLOWED[level].includes(t)) && new Set(s.types).size === s.types.length, `${tag}: bad choices ${s.types}`);
    check(s.tonic >= 55 && s.tonic < 67, `${tag}: tonic ${s.tonic}`);
    const expected = level >= 3 ? [...up, ...up.slice(0, -1).reverse()] : up;
    check(JSON.stringify(s.notes) === JSON.stringify(expected), `${tag}: notes ${s.notes} vs ${expected}`);
    // the answer is the only choice with these steps
    const others = s.types.filter((t) => t !== s.item && STEPS[t].join() === STEPS[s.item].join());
    check(!others.length, `${tag}: ambiguous with ${others}`);
    if (level === 6) check(s.types.length === 6, `${tag}: ${s.types.length} choices`);
    if (level <= 2) check(s.types.length === ALLOWED[level].length, `${tag}: choices ${s.types}`);
    if (round === 0 && dir && [1, 4].includes(level)) await page.screenshot({ path: `${dir}/sc-${level}.png` });
    const wrongs = s.types.filter((t) => t !== s.item).map(R);
    const mode = round === 0 ? 'wrong1' : round === 1 && wrongs.length > 1 ? 'wrong2' : 'right';
    s = await answerChoice({ page, slug: SLUG, level, skill: skillOf(SLUG, level), check, tag, s, mode, rightSel: R(s.item), wrongSels: wrongs });
  }
  // core pickWeak: no immediate repeat when the pool has more than 4 items (levels 5 and 6)
  if (level >= 5) check(!seen.some((x, i) => i && x === seen[i - 1]), `L${level}: same item twice in a row ${seen}`);
  if (!FAST && ALLOWED[level].length <= 4) check(ALLOWED[level].every((t) => seen.includes(t)), `L${level}: not every scale came up (${[...new Set(seen)]})`);
  if (!FAST || level === 1 || level === 6) await levelUpCheck({ page, slug: SLUG, level, check, rightSelOf: (st) => R(st.item), nextSel: '.sc-next', max: 16, last: level === 6, celebrate: true });
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...new Set(seen)].join(' '));
}
// Level 4 shows the mode names in French.
await open(4);
const texts = await page.$$eval('.sc-choices button', (bs) => bs.map((b) => b.textContent));
check(texts.includes('Ionien (majeur)') && texts.includes('Éolien (mineur)') && texts.includes('Dorien'), 'L4 French labels: ' + texts);
await open(1);
await persistCheck({ page, url, slug: SLUG, fields: [[0, 'level', 3], [1, 'tempo', 240]], check, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); return s.level === 3 && s.notes.length > 8 ? '' : `level ${s.level} notes ${s.notes?.length}`; } });
await page.close();
// English, dark, hardest level.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
C.watch(en);
await en.goto(url);
await open(6, en);
check(!(await overflows(en)), 'EN L6: overflow');
const enTexts = await en.$$eval('.sc-choices button', (bs) => bs.map((b) => b.textContent));
check(enTexts.every((t) => /^[A-Z]/.test(t)) && !enTexts.includes('Dorien'), 'EN labels: ' + enTexts);
if (dir) await en.screenshot({ path: `${dir}/sc-en-dark.png` });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
