// Intervals by ear, every level, in keyboard mode and in naming mode: the two notes match the interval (semitones, direction,
// keyboard range), the choices per level; one wrong then right answers (log: skill, level, item, mode), reveal after the 2nd miss,
// next level after a clean streak, settings (level and answer mode) persistence, smoke.
// Usage: PORT=5220 [FAST=1] node tools/ear-intervals.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, answerChoice, levelUpCheck, readAttempts } from './lib/shared-a.mjs';
const SLUG = 'ear-intervals';
const url = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const shots = process.argv[2];
const C = makeChecker(), { check, errors } = C;
const browser = await launch();
await smoke({ browser, url, check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
// Independent theory table (semitones).
const SEMI = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const ALL = Object.keys(SEMI);
const LEVELS = {
  1: { ids: ['M2', 'M3', 'P5', 'P8'], dirs: ['+'] },
  2: { ids: ['M2', 'm3', 'M3', 'P4', 'P5', 'P8'], dirs: ['+', '-'] },
  3: { ids: ALL, dirs: ['+'] },
  4: { ids: ALL, dirs: ['+', '-'] },
  5: { ids: ALL, dirs: ['h'] },
};
// Tap a key like a finger would (pointerdown on the key element).
const tapKey = (sel) => page.evaluate((s) => document.querySelector(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })), sel);
const key = (m) => `.ei-kb [data-midi="${m}"]`;
const open = async (level, mode) => {
  await page.evaluate(([l, a]) => localStorage.setItem('ml:settings:ear-intervals', JSON.stringify({ level: l, answer: a })), [level, mode]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
};
await page.goto(url);
for (const mode of ['play', 'name']) {
  for (const level of levels(5)) {
    const cfg = LEVELS[level], skill = skillOf(SLUG, level);
    await open(level, mode);
    let s = await page.evaluate(() => window.__test.state());
    const seen = [];
    for (let round = 0; round < rounds(mode === 'play' ? 14 : 10, 3); round++) {
      const tag = `${mode} L${level} r${round} ${s.item}`;
      seen.push(s.item);
      const dir = s.item.slice(2);
      check(s.level === level && cfg.ids.includes(s.id) && cfg.dirs.includes(dir) && s.item === s.id + dir, `${tag}: item not in level`);
      const sign = dir === '-' ? -1 : 1;
      check(s.second - s.first === SEMI[s.id] * sign, `${tag}: notes ${s.first} -> ${s.second}`);
      check(Math.min(s.first, s.second) >= 60 && Math.max(s.first, s.second) <= 79, `${tag}: out of keyboard`);
      check(s.mode === mode && JSON.stringify(s.ids) === JSON.stringify(cfg.ids), `${tag}: mode ${s.mode} / choices ${s.ids}`);
      if (round === 0 && shots && level % 2) await page.screenshot({ path: `${shots}/ei-${mode}-${level}.png` });
      let o;
      if (mode === 'play') {
        // two wrong keys: neither the given note nor the answer
        const wr = [];
        for (const d of [1, -1, 2, -2, 3, -3]) { const m = s.second + d; if (m >= 60 && m <= 79 && m !== s.first && !wr.includes(m)) wr.push(m); }
        o = { rightSel: key(s.second), wrongSels: wr.slice(0, 2).map(key), click: tapKey, wrongClass: null, revealClass: 'ml-hint' };
      } else {
        const btn = (id) => `.ei-names button >> nth=${s.ids.indexOf(id)}`;
        o = { rightSel: btn(s.id), wrongSels: s.ids.filter((i) => i !== s.id).slice(0, 2).map(btn), revealClass: 'ml-reveal' };
      }
      // name mode: nth selectors cannot take a class suffix, so use an attribute-free CSS form
      if (mode === 'name') { const css = (id) => `.ei-names button:nth-child(${s.ids.indexOf(id) + 1})`; o.rightSel = css(s.id); o.wrongSels = s.ids.filter((i) => i !== s.id).slice(0, 2).map(css); }
      const m = round === 0 ? 'wrong1' : round === 1 ? 'wrong2' : 'right';
      s = await answerChoice({ page, slug: SLUG, level, skill, check, tag, s, mode: m, ...o });
      const a = (await readAttempts(page, SLUG)).at(-1);
      check(a.detail?.mode === mode, `${tag}: logged mode ${JSON.stringify(a.detail)}`);
    }
    // 12+ items: no immediate repeat (core pickWeak); level 1 has only 4 items
    if (level > 1) check(!seen.some((x, i) => i && x === seen[i - 1]), `${mode} L${level}: same item twice in a row ${seen}`);
    if (!FAST || (mode === 'play' && (level === 1 || level === 5)) || (mode === 'name' && level === 1)) {
      const sel = (st) => (mode === 'play' ? key(st.second) : `.ei-names button:nth-child(${st.ids.indexOf(st.id) + 1})`);
      await levelUpCheck({ page, slug: SLUG, level, check, rightSelOf: sel, nextSel: '.ei-next', last: level === 5, celebrate: true, click: mode === 'play' ? tapKey : undefined });
    }
    check(!(await overflows(page)), `${mode} L${level}: overflow`);
    console.log(mode, `L${level}`, [...new Set(seen)].join(' '));
  }
}
await open(1, 'play');
await persistCheck({ page, url, slug: SLUG, fields: [[0, 'level', 4], [1, 'answer', 'name']], check, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); const nm = await p.$('.ei-names button'); return s.level === 4 && s.mode === 'name' && nm ? '' : `level ${s.level} mode ${s.mode}`; } });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
