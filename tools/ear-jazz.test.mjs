// Jazz colours, every level: chord tones against the theory (pitch classes, colour note, voicing, bass), choices per level (family, mix at
// level 6); one wrong then right answers (log), reveal after the 2nd miss, next level after a clean streak, settings persistence, smoke.
// Usage: PORT=5220 [FAST=1] node tools/ear-jazz.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, answerChoice, levelUpCheck } from './lib/shared-a.mjs';
const SLUG = 'ear-jazz';
const url = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker(), { check, errors } = C;
const browser = await launch();
await smoke({ browser, url, check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
// Independent reference: pitch classes of each chord (degrees as semitones above the root, mod 12).
// 9 = 2, 11 = 5, 13 = 9, b9 = 1, #9 = 3, #11 = 6, b13 = 8.
const PCS = {
  '7': [0, 4, 7, 10], '9': [0, 2, 4, 7, 10], '13': [0, 2, 4, 9, 10], '7sus4': [0, 5, 7, 10],
  'maj7': [0, 4, 7, 11], 'maj9': [0, 2, 4, 7, 11], '69': [0, 2, 4, 7, 9], 'maj7#11': [0, 4, 6, 7, 11],
  '7b9': [0, 1, 4, 7, 10], '7#9': [0, 3, 4, 7, 10], '7#11': [0, 4, 6, 7, 10], '7b13': [0, 2, 4, 8, 10],
  'm7': [0, 3, 7, 10], 'm9': [0, 2, 3, 7, 10], 'm11': [0, 3, 5, 7, 10], 'm6': [0, 3, 7, 9], 'mMaj7': [0, 3, 7, 11],
};
// Characteristic note that must be present, and notes that must be absent (the colour is what the player hears).
const MUST = { '9': 2, 'maj9': 2, 'm9': 2, '13': 9, '7sus4': 5, '69': 9, 'maj7#11': 6, '7b9': 1, '7#9': 3, '7#11': 6, '7b13': 8, 'm11': 5, 'm6': 9, 'mMaj7': 11, '7': 10, 'maj7': 11, 'm7': 10 };
const FAM = { 2: ['7', '9', '13', '7sus4'], 3: ['maj7', 'maj9', '69', 'maj7#11'], 4: ['7b9', '7#9', '7#11', '7b13'], 5: ['m7', 'm9', 'm11', 'm6', 'mMaj7'] };
const ALLOWED = { 1: ['7', '9', 'maj7', 'maj9', 'm7', 'm9'], ...FAM, 6: Object.keys(PCS) };
const COLOURED = ['9', 'maj9', 'm9'];
const mod = (n) => ((n % 12) + 12) % 12;
const R = (t) => `.jz-choices button[data-type="${t}"]`;
const open = async (level) => {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-jazz', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state()?.item);
};
await page.goto(url);
for (const level of levels(6)) {
  await open(level);
  let s = await page.evaluate(() => window.__test.state());
  const seen = [];
  for (let round = 0; round < rounds(24, 4); round++) {
    const tag = `L${level} r${round} ${s.item}`;
    seen.push(s.item);
    check(s.level === level && ALLOWED[level].includes(s.item), `${tag}: item not allowed`);
    check(s.bass >= 40 && s.bass < 52 && s.notes[0] === s.bass, `${tag}: bass ${s.bass}`);
    const pcs = new Set(s.notes.map((m) => mod(m - s.bass)));
    const want = new Set(PCS[s.item]);
    check(pcs.size === want.size && [...want].every((x) => pcs.has(x)), `${tag}: pitch classes ${[...pcs].sort((a, b) => a - b)} vs ${[...want].sort((a, b) => a - b)}`);
    check(pcs.has(MUST[s.item]), `${tag}: missing colour note`);
    check(s.notes.slice(1).every((m, i, a) => m > s.bass && (i === 0 || m >= a[i - 1])) && s.notes.at(-1) <= 84 && s.notes[1] >= 48, `${tag}: voicing ${s.notes}`);
    if (level === 1) check(s.types.join() === 'plain,colour' && s.answer === (COLOURED.includes(s.item) ? 'colour' : 'plain'), `${tag}: answer ${s.answer}`);
    else if (level <= 5) check(s.answer === s.item && s.types.join() === FAM[level].join(), `${tag}: choices ${s.types}`);
    else {
      const fam = Object.values(FAM).find((f) => f.includes(s.item));
      check(s.types.length === 6 && s.types.includes(s.item) && new Set(s.types).size === 6, `${tag}: choices ${s.types}`);
      check(s.types.filter((x) => fam.includes(x)).length >= 2, `${tag}: no look-alike in the choices ${s.types}`);
    }
    const btn = await page.$$eval('.jz-choices button', (bs) => bs.map((b) => b.dataset.type));
    check(JSON.stringify(btn) === JSON.stringify(s.types), `${tag}: buttons ${btn}`);
    if (round === 0 && dir && [1, 4].includes(level)) await page.screenshot({ path: `${dir}/jz-${level}.png` });
    const wrongs = s.types.filter((t) => t !== s.answer).map(R);
    const mode = round === 0 ? 'wrong1' : round === 1 && wrongs.length > 1 ? 'wrong2' : 'right';
    s = await answerChoice({ page, slug: SLUG, level, skill: skillOf(SLUG, level), check, tag, s, mode, rightSel: R(s.answer), wrongSels: wrongs });
  }
  // core pickWeak: no immediate repeat when the pool has more than 4 items (the app passes avoid then): levels 5 and 6
  if (level >= 5) check(!seen.some((x, i) => i && x === seen[i - 1]), `L${level}: same item twice in a row ${seen}`);
  if (!FAST && ALLOWED[level].length <= 4) check(ALLOWED[level].every((c) => seen.includes(c)), `L${level}: not every chord came up (${[...new Set(seen)]})`);
  await page.click('.jz-arp'); // the note-by-note button must not throw or change the question
  if (!FAST || level === 1 || level === 6) await levelUpCheck({ page, slug: SLUG, level, check, rightSelOf: (st) => R(st.answer), nextSel: '.jz-next', max: 16, last: level === 6, celebrate: true });
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...new Set(seen)].join(' '));
}
await open(1);
await persistCheck({ page, url, slug: SLUG, fields: [[0, 'level', 4]], check, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); return s.level === 4 && FAM[4].includes(s.item) ? '' : `level ${s.level} ${s.item}`; } });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
