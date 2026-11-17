// Plays every level of Build the chord with real pointer events on the keys (and taps on the answer buttons):
// a wrong answer first, then the right one. Expected notes are recomputed here from theory, not read from the app.
// Usage: npx vite --port 5307 --strictPort &   then   PORT=5307 node tools/build-chords.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf as taxSkill, makeChecker, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, isShown } from './lib/shared-a.mjs';
const SLUG = 'build-chords';
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- theory, written independently of the app ----
const SEMI = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const NUMBER = { m2: 2, M2: 2, m3: 3, M3: 3, P4: 4, P5: 5, P8: 8 };
// Chords as stacked thirds (and seconds/fourths for sus): the gaps between neighbouring notes, in half steps.
const GAPS = {
  maj: [4, 3], min: [3, 4], dim: [3, 3], aug: [4, 4], sus4: [5, 2],
  maj7: [4, 3, 4], dom7: [4, 3, 3], min7: [3, 4, 3], m7b5: [3, 3, 4], dim7: [3, 3, 3],
  maj9: [4, 3, 4, 3], dom9: [4, 3, 3, 4], min9: [3, 4, 3, 4],
};
const SYMBOL = { maj: '', min: 'm', dim: '°', aug: '+', sus4: 'sus4', maj7: 'maj7', dom7: '7', min7: 'm7', m7b5: 'm7♭5', dim7: '°7', maj9: 'maj9', dom9: '9', min9: 'm9' };
const chordNotes = (root, id, inv) => {
  let notes = [root];
  for (const g of GAPS[id]) notes.push(notes[notes.length - 1] + g);
  for (let i = 0; i < inv; i++) notes = [...notes.slice(1), notes[0] + 12]; // each inversion puts the lowest note an octave higher
  return notes;
};
const isWhite = (m) => [0, 2, 4, 5, 7, 9, 11].includes(m % 12);

const press = async (midi) => {
  const k = page.locator(`.ml-key[data-midi="${midi}"]`);
  const b = await k.boundingBox();
  const black = (await k.getAttribute('class')).includes('ml-black');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height * (black ? 0.25 : 0.85));
};
const hasKey = (m) => page.locator(`.ml-key[data-midi="${m}"]`).count().then((n) => n > 0);
const skillOf = (l) => taxSkill(SLUG, l);

const ALLCHOICES = { 4: null, 5: ['maj', 'min', 'dim', 'aug', 'sus4'], 6: ['maj7', 'dom7', 'min7', 'm7b5', 'dim7', 'maj9', 'dom9', 'min9'] };
const queues = {
  1: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'].map((i) => `${i}@tap`),
  2: ['m2', 'M2', 'm3', 'M3'].flatMap((i) => [`${i}@tap`, `${i}@name`]),
  3: Object.keys(SEMI).map((i, k) => `${i}${k % 2 ? ':dn' : ''}@${['tap', 'tapname', 'name'][k % 3]}`)
    .concat(Object.keys(SEMI).map((i, k) => `${i}${k % 2 ? '' : ':dn'}@${['name', 'tap', 'tapname'][k % 3]}`)),
  4: ['maj', 'min', 'min', 'maj'].map((i) => `${i}@build`),
  5: ['dim', 'aug', 'sus4', 'maj', 'min'].flatMap((i) => [`${i}@build`, `${i}@name`])
    .concat(['maj:inv1', 'maj:inv2', 'min:inv1', 'min:inv2', 'dim:inv1', 'dim:inv2', 'sus4:inv1'].map((i, k) => `${i}@${k % 2 ? 'name' : 'build'}`)),
  6: ['maj7', 'dom7', 'min7', 'm7b5', 'dim7', 'maj9', 'dom9', 'min9'].flatMap((i) => [`${i}@build`, `${i}@name`]),
};

/** Checks the question against theory; returns the wrong and right actions. */
async function plan(s) {
  const L = s.level;
  const [id, flag] = s.item.split(':');
  check(s.id === id, `L${L}: id ${s.id} vs item ${s.item}`);
  check(s.notes.every((m) => m >= 55 && m <= 84) && Math.min(...s.notes) <= 72, `L${L} ${s.item}: notes out of range ${s.notes}`);
  const [w0, w1] = s.window;
  check(s.notes.every((m) => m >= w0 && m <= w1) && isWhite(w0) && isWhite(w1), `L${L} ${s.item}: notes outside the keyboard window ${s.window}`);
  const whites = await page.locator('.ml-white').count();
  check(whites === 11, `L${L}: ${whites} white keys`);
  if (L <= 3) {
    const dir = flag === 'dn' ? -1 : 1;
    check(s.dir === dir && s.target === s.root + dir * SEMI[id], `L${L} ${s.item}: target ${s.target} for root ${s.root}`);
    if (L === 1) check(isWhite(s.root) && isWhite(s.target) && s.dir === 1, `L1 ${s.item}: white keys only`);
    if (s.mode === 'name') {
      check(eq(s.lit, [s.root, s.target]) && s.choices.includes(id) && new Set(s.choices).size === s.choices.length, `L${L} ${s.item}: lit ${s.lit} choices ${s.choices}`);
      if (L === 2) check(eq([...s.choices].sort(), ['M2', 'M3', 'm2', 'm3']), `L2: choices ${s.choices}`);
      if (L === 3) check(s.choices.length === 6, `L3: ${s.choices.length} choices`);
      const [wrong, wrong2] = s.choices.filter((c) => c !== id);
      return { wrong: () => page.click(`.bc-choice[data-id="${wrong}"]`), wrong2: () => page.click(`.bc-choice[data-id="${wrong2}"]`), right: () => page.click(`.bc-choice[data-id="${id}"]`), units: SEMI[id] };
    }
    check(eq(s.lit, [s.root]), `L${L} ${s.item}: lit ${s.lit}`);
    let bad = [s.target + 2, s.target - 2, s.target + 1, s.target - 1].find((m) => m !== s.root && m !== s.target && m >= w0 && m <= w1);
    if (L === 1 && !(await hasKey(bad))) bad = s.root + (s.dir > 0 ? 1 : -1);
    return { wrong: () => press(bad), right: () => press(s.target), units: SEMI[id] };
  }
  const inv = flag ? +flag.replace('inv', '') : 0;
  check(s.inv === inv, `L${L} ${s.item}: inv ${s.inv}`);
  const want = chordNotes(s.root, id, inv);
  check(eq(s.notes, want), `L${L} ${s.item}: notes ${s.notes} vs theory ${want}`);
  // The pitch classes of an inversion are those of the root position.
  check(eq([...new Set(s.notes.map((m) => m % 12))].sort((a, b) => a - b), [...new Set(chordNotes(s.root, id, 0).map((m) => m % 12))].sort((a, b) => a - b)), `L${L} ${s.item}: pitch classes`);
  check(s.given === want[0], `L${L} ${s.item}: given ${s.given}`);
  const gaps = want.slice(1).map((m, i) => m - want[i]);
  if (s.mode === 'name') {
    check(eq(s.lit, want) && eq([...s.choices].sort(), [...ALLCHOICES[L]].sort()) && s.choices.includes(id), `L${L} ${s.item}: lit ${s.lit} choices ${s.choices}`);
    const [wrong, wrong2] = s.choices.filter((c) => c !== id);
    return { wrong: () => page.click(`.bc-choice[data-id="${wrong}"]`), wrong2: () => page.click(`.bc-choice[data-id="${wrong2}"]`), right: () => page.click(`.bc-choice[data-id="${id}"]`), gaps };
  }
  check(eq(s.latched, [want[0]]) && s.lit.length === 0, `L${L} ${s.item}: start state ${s.latched}`);
  const others = want.slice(1);
  const stray = [...Array(40).keys()].map((i) => w0 + i).find((m) => m <= w1 && !want.includes(m) && m !== want[0]);
  const wrongSet = [...others.slice(1), stray]; // same size, one note wrong
  return {
    wrong: async () => { for (const m of wrongSet) await press(m); },
    right: async () => { for (const m of others) await press(m); },
    gaps,
  };
}

await smoke({ browser, url: base, check });
let sawLevel = false;
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:build-chords', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await until(() => state());
  const queue = FAST ? queues[level].slice(0, 2) : queues[level];
  await page.evaluate((q) => window.__test.force(q), queue);
  const rounds = queue.length + 1; // the first question is random
  const seen = new Set();
  for (let round = 0; round < rounds; round++) {
    const s = await until(async () => { const x = await state(); return x && !x.locked && !x.done ? x : null; });
    check(!!s, `L${level} round ${round}: no question`);
    if (!s) break;
    seen.add(s.item + '@' + s.mode);
    if (process.env.DEBUG) console.log('round', level, round, s.item, s.mode);
    if (round > 0) check(s.item + '@' + s.mode === queue[round - 1], `L${level}: asked ${s.item}@${s.mode}, forced ${queue[round - 1]}`);
    const p = await plan(s);
    const before = (await attempts()).length;
    const n = s.n;
    if (round === 0 || (round === 3 && rounds >= 12)) {
      if (dir && level === 4 && round === 2) await page.screenshot({ path: `${dir}/bc-${level}-fr-light.png` });
      const fb0 = (await fbLog(page)).length;
      await p.wrong();
      check((await fbSince(page, fb0, 1))[0] === 'bad', `L${level} ${s.item}: wrong answer gave no error feedback`);
      await newAttempts(page, SLUG, before, 1);
      const mid = await state();
      check(mid.missed && (await attempts()).length === before + 1, `L${level} ${s.item}: wrong answer not logged once`);
      await until(async () => !(await state()).locked);
      const again = await state();
      check(again.n === n && !again.done, `L${level} ${s.item}: no retry state`);
      if (s.mode === 'build') check(eq(again.latched, [s.given]), `L${level} ${s.item}: keys not reset ${again.latched}`);
      // second miss on the same question: feedback again, not logged again. NOTE: the answer is not revealed after it (no .ml-reveal in this game): reported.
      await (p.wrong2 || p.wrong)();
      check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', `L${level} ${s.item}: second wrong answer gave no error feedback`);
      await until(async () => !(await state()).locked);
      check((await attempts()).length === before + 1 && (await state()).n === n, `L${level} ${s.item}: second miss logged again or question changed`);
    }
    await p.right();
    const fin = await until(async () => { const x = await state(); return x && x.n === n && x.done ? x : null; }, 5000) || await state();
    check(fin.n === n && fin.done, `L${level} ${s.item}: not judged right`);
    // The strip after the answer: half-step blocks for intervals (from level 2), gaps for chords.
    if (s.level >= 4) {
      const digits = await page.$$eval('.bc-stripbox .bc-g', (e) => e.map((x) => +x.textContent));
      check(eq(digits, p.gaps), `L${level} ${s.item}: strip ${digits} vs ${p.gaps}`);
    } else if (s.level >= 2) {
      const units = await page.$$eval('.bc-stripbox .bc-u', (e) => e.length);
      check(units === p.units, `L${level} ${s.item}: strip ${units} blocks vs ${p.units}`);
    } else {
      check((await page.$$eval('.bc-stripbox .bc-u', (e) => e.length)) === 0 && /^\d · /.test(fin.title) && fin.title.startsWith(String(NUMBER[s.id])), `L1 ${s.item}: number name "${fin.title}"`);
    }
    if (s.level >= 4 && s.mode === 'build') {
      // Recipe strip before the answer was the root-position pattern; the title after is the chord symbol.
      check(fin.title.includes(SYMBOL[s.id]), `L${level} ${s.item}: title "${fin.title}"`);
    }
    const moved = await until(async () => (await state()).n !== n, 12000);
    if ((await fbLog(page)).includes('level')) sawLevel = true;
    check(!!moved, `L${level} ${s.item}: next question never came`);
    const mine = (await attempts()).slice(before);
    const wrongRound = round === 0 || (round === 3 && rounds >= 12);
    check(mine.length === 1 && mine[0].ok === !wrongRound && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skillOf(level), `L${level} ${s.item}: ${JSON.stringify(mine.map((a) => [a.ok, a.level, a.item, a.skill]))}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
    if (round === rounds - 1 && level < 6) {
      const tail = rounds - 1 - (rounds >= 12 ? 3 : 0); // clean answers since the last wrong one
      check((await state()).nextShown === (tail >= 6), `L${level}: next-level button ${tail >= 6 ? 'missing after' : 'shown without'} a clean streak`);
    }
  }
  if (level === 6 && !FAST) check(sawLevel, 'L6: no celebration after a clean streak on the last level');
  console.log(`L${level}`, [...seen].join(' '));
}

// Natural questions (nothing forced) at level 1: never the same item twice in a row (7 items), clean streak of 6 offers the next level.
await page.evaluate(() => localStorage.setItem('ml:settings:build-chords', JSON.stringify({ level: 1 })));
await page.reload();
await page.click('.ml-start');
await until(() => state());
const order = [];
for (let r = 0; r < rounds(14, 7); r++) {
  const s = await until(async () => { const x = await state(); return x && !x.locked && !x.done ? x : null; });
  order.push(s.item);
  await press(s.target);
  await until(async () => (await state()).n !== s.n, 12000);
}
check(!order.some((x, i) => i && x === order[i - 1]), `L1: same item twice in a row ${order}`);
check(await isShown(page, '.bc-next'), 'L1: no next-level button after a clean streak');
await page.click('.bc-next');
await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 8000 }).catch(() => {});
check((await state()).level === 2, 'L1: next-level button did not move to level 2');
// English, dark theme.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
C.watch(en);
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:build-chords', JSON.stringify({ level: 6, labels: true })));
await en.reload();
await en.click('.ml-start');
await en.waitForFunction(() => window.__test?.state());
const st = await en.evaluate(() => window.__test.state());
check(st.level === 6 && (st.mode === 'name' || (await en.textContent('.bc-title')).length > 0), 'EN: no title');
check((await en.$$eval('.ml-key', (ks) => ks.some((k) => k.textContent.trim().length > 0))), 'EN: key labels not shown with the labels setting');
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN: overflow');
if (dir) await en.screenshot({ path: `${dir}/bc-6-en-dark.png` });
await en.close();
// settings persist: level and key labels (labels off by default: no text on the keys)
await page.evaluate(() => localStorage.setItem('ml:settings:build-chords', JSON.stringify({ level: 1 })));
await page.reload();
await page.click('.ml-start');
await page.waitForFunction(() => window.__test?.state());
check(!(await page.$$eval('.ml-key', (ks) => ks.some((k) => k.textContent.trim().length > 0))), 'labels shown by default');
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 4], [1, 'labels', true]], check, applied: async (p) => { const x = await p.evaluate(() => window.__test.state()); const lab = await p.$$eval('.ml-key', (ks) => ks.some((k) => k.textContent.trim().length > 0)); return x.level === 4 && ['maj', 'min'].includes(x.id) && lab ? '' : `level ${x.level} id ${x.id} labels ${lab}`; } });
check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
