// Plays every level of Build the scale with real pointer events on the keys: a wrong set first, then the right one.
// Expected notes are recomputed here from music theory (semitone patterns), not read from the app.
// Usage: npx vite --port 5307 --strictPort &   then   PORT=5307 node tools/build-scales.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf as taxSkill, makeChecker, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, isShown } from './lib/shared-a.mjs';
const SLUG = 'build-scales';
const base = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const check = C.check;
const attempts = () => readAttempts(page, SLUG);
const state = () => page.evaluate(() => window.__test?.state()).catch(() => null);
const until = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await page.waitForTimeout(60); } return null; };

// ---- theory, written independently of the app: semitones above the tonic ----
const T = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
  pentaMajor: [0, 2, 4, 7, 9], pentaMinor: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
};
const pcs = (tonic, steps) => steps.map((s) => (tonic + s) % 12).sort((a, b) => a - b);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Degree of the major scale on which each mode starts (2nd, 3rd, 4th, 5th, 6th note).
const DEGREE = { dorian: 1, phrygian: 2, lydian: 3, mixolydian: 4, aeolian: 5 };
const BASE6 = { lydian: 'major', mixolydian: 'major', pentaMajor: 'major', dorian: 'minor', phrygian: 'minor', blues: 'pentaMinor' };

const press = async (pc, base = 60) => {
  const k = page.locator(`.ml-key[data-midi="${base + pc}"]`);
  const b = await k.boundingBox();
  const black = (await k.getAttribute('class')).includes('ml-black');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * (black ? 0.25 : 0.85));
};
const tapSet = async (from, to, base) => {
  for (const pc of from) if (!to.includes(pc)) await press(pc, base);
  for (const pc of to) if (!from.includes(pc)) await press(pc, base);
};
const allowed = {
  1: { kinds: ['major'], tonics: [0] }, 2: { kinds: ['major'], tonics: [7, 5] }, 3: { kinds: ['major'], tonics: [...Array(12).keys()] },
  4: { kinds: ['minor', 'harmonicMinor', 'relative'], tonics: [...Array(12).keys()] },
  5: { kinds: Object.keys(DEGREE), tonics: [...Array(12).keys()] },
  6: { kinds: Object.keys(BASE6), tonics: [...Array(12).keys()] },
};
const skillOf = (l) => taxSkill(SLUG, l);

/** Checks the question against theory and returns [wrong action, right action] on the keys. */
function plan(s) {
  const L = s.level, a = allowed[L];
  check(a.kinds.includes(s.kind) && a.tonics.includes(s.tonic), `L${L}: unexpected question ${s.item}`);
  check(s.item === `${s.kind}:${s.tonic}`, `L${L}: item ${s.item}`);
  const t = s.tonic;
  if (L === 5) {
    const parent = (t - T.major[DEGREE[s.kind]] + 12) % 12; // the major scale this mode borrows its notes from
    check(eq(s.lit, pcs(parent, T.major)) && eq(s.expected, [t]) && s.home === parent, `L5 ${s.item}: lit ${s.lit} expected ${s.expected} home ${s.home}`);
    check(eq(s.played.map((m) => m - 60), [...T[s.kind].map((x) => x + t), t + 12]), `L5 ${s.item}: played ${s.played}`);
    const [wrongPc, wrongPc2] = s.lit.filter((p) => p !== t);
    return { wrong: () => press(wrongPc), wrong2: () => press(wrongPc2), right: () => press(t), steps: T[s.kind] };
  }
  if (s.kind === 'relative') {
    const major = (t + 3) % 12; // A minor shares the notes of C major: the minor home is a minor third below
    check(eq(s.lit, pcs(major, T.major)) && eq(s.expected, [t]) && s.home === major, `L4 ${s.item}: lit ${s.lit} home ${s.home}`);
    check(eq(s.played.map((m) => m - 60), [...T.minor.map((x) => x + t), t + 12]), `L4 ${s.item}: played`);
    return { wrong: () => press(major), wrong2: () => press((major + 7) % 12), right: () => press(t), steps: T.minor };
  }
  const steps = T[s.kind];
  const exp = pcs(t, steps);
  check(eq(s.expected, exp), `L${L} ${s.item}: expected ${s.expected} vs theory ${exp}`);
  check(eq(s.played.map((m) => m - 60), [...steps.map((x) => x + t), t + 12]), `L${L} ${s.item}: played ${s.played}`);
  const start = L === 6 ? pcs(t, T[BASE6[s.kind]]) : [];
  check(eq(s.start, start), `L${L} ${s.item}: start ${s.start} vs ${start}`);
  if (L === 6) check(s.kind === 'pentaMajor' ? start.length - exp.length === 2 : s.kind === 'blues' ? exp.length - start.length === 1 : start.filter((p) => !exp.includes(p)).length === 1 && exp.filter((p) => !start.includes(p)).length === 1, `L6 ${s.item}: not a small change`);
  // A wrong set of the same size: swap one note of the scale for a note that does not belong (one of the start notes when there is one).
  const x = exp.find((p) => p !== t && (L !== 6 || start.includes(p)));
  const y = [...Array(12).keys()].find((p) => !exp.includes(p) && start.includes(p)) ?? [...Array(12).keys()].find((p) => !exp.includes(p) && !start.includes(p));
  const wrongSet = [...exp.filter((p) => p !== x), y].sort((m, n) => m - n);
  check(!eq(wrongSet, start) && !eq(wrongSet, exp), `L${L} ${s.item}: bad wrong set`);
  return { wrong: () => tapSet(start, wrongSet), right: () => tapSet(start, exp), steps };
}

await smoke({ browser, url: base, check });
let sawLevel = false;
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await until(() => state());
  // One question of each kind at the level, after the first random one.
  const kinds = allowed[level].kinds;
  const queue = kinds.map((k, i) => `${k}:${[...allowed[level].tonics][(i * 5 + level) % allowed[level].tonics.length]}`);
  const nRounds = rounds(Math.max(8, queue.length + 2), 3);
  while (queue.length < nRounds - 1) queue.push(`${kinds[queue.length % kinds.length]}:${allowed[level].tonics[(queue.length * 7 + 3) % allowed[level].tonics.length]}`);
  await page.evaluate((q) => window.__test.force(q), queue);
  const seen = new Set();
  for (let round = 0; round < nRounds; round++) {
    const s = await until(async () => { const x = await state(); return x && !x.locked ? x : null; });
    check(!!s, `L${level} round ${round}: no question`);
    if (!s) break;
    seen.add(s.kind);
    const p = plan(s);
    const before = (await attempts()).length;
    const n = s.n;
    if (round === 0) {
      if (dir && level === 3) await page.screenshot({ path: `${dir}/bs-${level}-fr-light.png` });
      const fb0 = (await fbLog(page)).length;
      await p.wrong();
      check((await fbSince(page, fb0, 1))[0] === 'bad', `L${level} ${s.item}: wrong answer gave no error feedback`);
      await newAttempts(page, SLUG, before, 1);
      const mid = await state();
      check(mid.missed && (await attempts()).length === before + 1, `L${level} ${s.item}: wrong answer not logged once`);
      await until(async () => !(await state()).locked); // the keys come back to the start state
      const again = await state();
      const revealed = () => page.$$eval('.ml-key.ml-reveal', (ks) => ks.map((k) => +k.dataset.midi));
      check((await revealed()).length === 0, `L${level} ${s.item}: key revealed after the first miss`);
      check(eq(again.latched, again.start) && again.n === n, `L${level} ${s.item}: no retry state ${again.latched}`);
      // second miss on the same question: feedback again, not logged again.
      await (p.wrong2 || p.wrong)();
      check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', `L${level} ${s.item}: second wrong answer gave no error feedback`);
      if (s.mode === 'pick') check(eq(await revealed(), [s.base + s.expected[0]]), `L${level} ${s.item}: reveal after the second miss: ${await revealed()}`);
      else check((await revealed()).length === 0, `L${level} ${s.item}: unexpected reveal in build mode`);
      await until(async () => !(await state()).locked);
      check((await attempts()).length === before + 1 && (await state()).n === n, `L${level} ${s.item}: second miss logged again or question changed`);
    }
    await p.right();
    const done = await until(async () => { const x = await state(); return x && (x.locked || x.n !== n) ? x : null; }, 5000);
    check(!!done, `L${level} ${s.item}: not judged`);
    // The strip of wide and narrow blocks matches the pattern.
    const blocks = await page.$$eval('.bs-g', (els) => els.map((e) => e.className.match(/bs-g(\d)/)[1] * 1));
    const gaps = p.steps.map((x, i) => (i + 1 < p.steps.length ? p.steps[i + 1] : 12) - x);
    check(eq(blocks, gaps), `L${level} ${s.item}: strip ${blocks} vs ${gaps}`);
    if (round === 1 && level === 1) check((await page.$$eval('.bs-g', (e) => e.map((x) => x.textContent))).join('|') === '1 ton|1 ton|½ ton|1 ton|1 ton|1 ton|½ ton', 'L1: strip labels');
    const moved = await until(async () => (await state()).n !== n, 12000);
    if ((await fbLog(page)).includes('level')) sawLevel = true;
    check(!!moved, `L${level} ${s.item}: next question never came`);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skillOf(level), `L${level} ${s.item}: ${JSON.stringify(mine.map((a) => [a.ok, a.level, a.item, a.skill]))}`);
    if (round === 7 && level < 6) check((await state()).nextShown, `L${level}: next-level button missing after a clean streak`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  }
  if (level === 6 && !FAST) check(sawLevel, 'L6: no celebration after a clean streak on the last level');
  console.log(`L${level}`, [...seen].join(' '));
}

// Level 1: a clean streak of 6 offers the next level and the button works.
await page.evaluate(() => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: 1 })));
await page.reload();
await page.click('.ml-start');
await until(() => state());
for (let r = 0; r < 6; r++) {
  const s = await until(async () => { const x = await state(); return x && !x.locked ? x : null; });
  await tapSet(s.start, s.expected, s.base);
  await until(async () => (await state()).n !== s.n, 12000);
}
check(await isShown(page, '.bs-next'), 'L1: no next-level button after a clean streak');
await page.click('.bs-next');
await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 8000 }).catch(() => {});
check((await state()).level === 2, 'L1: next-level button did not move to level 2');
// Natural questions at level 2 (2 items: pools of 4 or fewer may repeat) and level 3 (12 items): never the same scale twice in a row at level 3.
await page.evaluate(() => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: 3 })));
await page.reload();
await page.click('.ml-start');
await until(() => state());
const order = [];
for (let r = 0; r < rounds(12, 5); r++) {
  const s = await until(async () => { const x = await state(); return x && !x.locked ? x : null; });
  order.push(s.item);
  await tapSet(s.start, s.expected, s.base);
  await until(async () => (await state()).n !== s.n, 12000);
}
check(!order.some((x, i) => i && x === order[i - 1]), `L3: same scale twice in a row ${order}`);
// English, dark theme: names on keys, labels in English.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
C.watch(en);
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: 3, labels: true })));
await en.reload();
await en.click('.ml-start');
await en.waitForFunction(() => window.__test?.state());
const title = await en.textContent('.bs-title');
check(/[A-G]/.test(title) && !/[éèà]/.test(title), `EN title: ${title}`);
check(await en.$$eval('.ml-key', (ks) => ks.some((k) => k.textContent.trim().length > 0)), 'EN: key labels not shown with the labels setting');
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN: overflow');
if (dir) await en.screenshot({ path: `${dir}/bs-6-en-dark.png` });
await en.close();
// settings persist: level and key labels
await page.evaluate(() => localStorage.setItem('ml:settings:build-scales', JSON.stringify({ level: 1 })));
await page.reload();
await page.click('.ml-start');
await page.waitForFunction(() => window.__test?.state());
check(!(await page.$$eval('.ml-key', (ks) => ks.some((k) => k.textContent.trim().length > 0))), 'labels shown by default');
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 5], [1, 'labels', true]], check, applied: async (p) => { const x = await p.evaluate(() => window.__test.state()); const lab = await p.$$eval('.ml-key', (ks) => ks.some((k) => k.textContent.trim().length > 0)); return x.level === 5 && x.mode === 'pick' && lab ? '' : `level ${x.level} mode ${x.mode} labels ${lab}`; } });
check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
