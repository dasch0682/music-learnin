// High or low, every level: content of the generated questions (notes vs contour, range, gaps, options), one wrong then right answers
// (log: game, skill, level, item), error feedback and reveal after the 2nd miss, clean streak -> next level, settings persistence, smoke.
// Usage: PORT=5220 [FAST=1] node tools/high-low.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, answerChoice, levelUpCheck } from './lib/shared-a.mjs';
const SLUG = 'high-low';
const url = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker(), { check, errors } = C;
const browser = await launch();
await smoke({ browser, url, check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const GAPS = { 1: [7, 16], 2: [2, 4], 3: [1, 2], 4: [0, 3] };
const R = (v) => `.hl-answers button[data-value="${v}"]`;
await page.goto(url);
const open = async (level) => {
  await page.evaluate((l) => localStorage.setItem('ml:settings:high-low', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
};
for (const level of levels(6)) {
  await open(level);
  let s = await page.evaluate(() => window.__test.state());
  const seen = [];
  for (let round = 0; round < rounds(16, 4); round++) {
    const tag = `L${level} r${round}`;
    seen.push(s.item);
    const n = s.notes, steps = n.slice(1).map((m, i) => m - n[i]);
    check(s.level === level && s.skill === skillOf(SLUG, level), `${tag}: state level/skill ${s.level} ${s.skill}`);
    check(n.every((m) => m >= 52 && m <= 84), `${tag}: note out of range ${n}`);
    if (level <= 4) {
      const d = steps[0], exp = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      check(s.answer === exp && n.length === 2, `${tag}: answer ${s.answer} vs notes ${n}`);
      check(level === 4 || d !== 0, `${tag}: unison`);
      check(Math.abs(d) >= GAPS[level][0] && Math.abs(d) <= GAPS[level][1], `${tag}: gap ${d}`);
      check(s.item === (d > 0 ? '+' : d < 0 ? '-' : '') + Math.abs(d), `${tag}: item ${s.item} vs gap ${d}`);
      check(JSON.stringify(s.options) === JSON.stringify(level === 4 ? ['up', 'same', 'down'] : ['up', 'down']), `${tag}: options ${s.options}`);
    } else {
      const word = steps.map((d) => (d > 0 ? 'u' : 'd')).join('');
      check(s.answer === word && s.item === word && n.length === level - 2, `${tag}: contour ${word} vs ${s.answer}, ${n.length} notes`);
      check(steps.every((d) => Math.abs(d) >= 2 && Math.abs(d) <= 4), `${tag}: step sizes ${steps}`);
      check(s.options.includes(s.answer) && new Set(s.options).size === s.options.length && s.options.length === 4, `${tag}: options ${s.options}`);
    }
    const wrongs = s.options.filter((o) => o !== s.answer).map(R);
    if (round === 0 && dir && level % 2) await page.screenshot({ path: `${dir}/hl-${level}.png` });
    const mode = round === 0 ? 'wrong1' : round === 1 && wrongs.length > 1 ? 'wrong2' : 'right';
    s = await answerChoice({ page, slug: SLUG, level, skill: skillOf(SLUG, level), check, tag, s, mode, rightSel: R(s.answer), wrongSels: wrongs });
  }
  // the app allows repeats only for pools of 4 items or fewer (levels 3 and 5)
  if (![3, 5].includes(level)) check(!seen.some((x, i) => i && x === seen[i - 1]), `L${level}: same item twice in a row ${seen}`);
  if (!FAST || level === 1 || level === 6) await levelUpCheck({ page, slug: SLUG, level, check, rightSelOf: (st) => R(st.answer), nextSel: '.hl-next', last: level === 6, celebrate: true });
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...new Set(seen)].join(' '));
}
// settings: the level chosen in the dialog is applied and kept after a reload
await open(1);
await persistCheck({ page, url, slug: SLUG, fields: [[0, 'level', 5]], check, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); return s.level === 5 && s.shapes ? '' : `level ${s.level}`; } });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
