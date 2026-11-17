// Plays every level of Circle of fifths: one wrong answer, then the right one. Expected answers are recomputed from theory.
// Usage: npx vite --port 5308 --strictPort &   then   PORT=5308 node tools/circle-of-fifths.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, isShown } from './lib/shared-a.mjs';
const SLUG = 'circle-of-fifths';
const base = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const check = C.check;
const attempts = () => readAttempts(page, SLUG);

// --- theory, independent of the app ---
const mod = (n, m) => ((n % m) + m) % m;
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (id) => mod(PC[id[0]] + (id[1] === '#' ? 1 : id[1] === 'b' ? -1 : 0), 12);
const posOfPc = (pc) => mod(pc * 7, 12); // the circle goes up by fifths: 7 * 7 = 49 = 1 (mod 12)
const KEYS_BY_FIFTHS = (n) => mod(7 * n, 12); // tonic pitch class with n sharps (negative: flats)
function expected(item, state) {
  const [kind, arg] = item.split(':');
  if (kind === 'next' || kind === 'place') return [[posOfPc(pcOf(arg)) + ':M']];
  if (kind === 'sig') {
    const n = +arg;
    return state.mode === 'toKey' ? [[posOfPc(KEYS_BY_FIFTHS(n)) + ':M']] : null;
  }
  if (kind === 'rel') {
    const major = posOfPc(mod(pcOf(arg) + 3, 12)); // the relative major is a minor third above the minor tonic
    return [[major + (state.mode === 'toMinor' ? ':m' : ':M')]];
  }
  const pc = pcOf(arg);
  const at = (d) => [posOfPc(mod(pc + d, 12)) + ':M'];
  if (kind === 'IV') return [at(5)];
  if (kind === 'V') return [at(7)];
  if (kind === 'tritone') return [at(6)];
  if (kind === 'iiVI') return [at(2), at(7), at(0)];
  return undefined;
}
const sameSteps = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const triad = (pc, minor) => [pc, mod(pc + (minor ? 3 : 4), 12), mod(pc + 7, 12)].sort((a, b) => a - b).join();
function chordOk(chord, pos, ring) {
  const root = mod(7 * pos + (ring === 'm' ? 9 : 0), 12);
  return chord && mod(chord[0], 12) === root && triad(root, ring === 'm') === [...new Set(chord.map((m) => mod(m, 12)))].sort((a, b) => a - b).join();
}

const st = () => page.evaluate(() => window.__test.state());
const hit = (pos, ring) => `g[data-pos="${pos}"][data-ring="${ring}"] .cf-hit`;
async function tapKey(key) {
  const [p, ring] = key.split(':');
  await page.click(hit(p, ring));
  await page.waitForTimeout(40);
  const s = await st();
  check(chordOk(s.chord, +p, ring), `chord of ${key}: ${JSON.stringify(s.chord)}`);
}

await smoke({ browser, url: base, check });
await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:circle-of-fifths', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test.state().item);
  const seen = new Set(), items = [];
  const nRounds = rounds(level === 6 ? 14 : level === 4 ? 12 : 8, 2);
  for (let round = 0; round < nRounds; round++) {
    const s = await st();
    seen.add(s.item.split(':')[0] + (s.mode && s.mode !== 'tap' ? '/' + s.mode : ''));
    items.push(s.item);
    check(s.level === level, `L${level}: level ${s.level}`);
    const before = (await attempts()).length;
    const fb0 = (await fbLog(page)).length;
    if (level === 1) {
      const [a, b] = s.hear.map((c) => mod(c[0], 12));
      check(s.hear.length === 2 && mod(b - a, 12) === 7, `L1: heard chords are not a fifth apart ${JSON.stringify(s.hear)}`);
      check(sameSteps(s.steps, [[posOfPc(mod(a + 14, 12)) + ':M']]), `L1: target ${JSON.stringify(s.steps)} for ${a}`);
    }
    const steps = expected(s.item, s) || null;
    if (steps) check(sameSteps(s.steps, steps), `L${level}: ${s.item} (${s.mode}) steps ${JSON.stringify(s.steps)} expected ${JSON.stringify(steps)}`);
    if (level === 4 && s.mode === 'toSig') {
      const n = +s.item.slice(4);
      check(s.answer === n && s.choices.includes(n) && new Set(s.choices).size === s.choices.length && s.choices.length >= 3, `L4 choices ${JSON.stringify(s.choices)} for ${n}`);
      // The key with n sharps has its tonic at 7n semitones: the signature is the number of steps from C.
      check(posOfPc(KEYS_BY_FIFTHS(n)) === mod(n, 12), `L4: ${n} steps from C`);
      if (round === 0 && dir) await page.screenshot({ path: `${dir}/cf-${level}.png` });
      if (round === 0) {
        const [w1, w2] = s.choices.filter((c) => c !== n);
        await page.click(`.cf-choices button[data-v="${w1}"]`);
        check((await fbSince(page, fb0, 1))[0] === 'bad', `L4: wrong signature gave no error feedback`);
        // second miss: feedback again, logged once. NOTE: the right choice is not revealed after it (reported).
        await page.click(`.cf-choices button[data-v="${w2}"]`);
        check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', `L4: second wrong signature gave no error feedback`);
        check((await attempts()).length === before + 1, `L4: second miss logged again`);
      }
      await page.click(`.cf-choices button[data-v="${n}"]`);
    } else {
      if (level === 4) check(await page.evaluate(() => !!document.querySelector('.cf-staff .ml-keysig') || window.__test.state().n === 0), 'L4: signature drawn');
      if (level === 4) check((await page.locator('.cf-staff .ml-keysig').count()) === Math.abs(s.n), `L4: ${s.n} accidentals on the staff`);
      if (round === 0 && dir && level !== 4) await page.screenshot({ path: `${dir}/cf-${level}.png` });
      if (round === 0) {
        const all = s.steps.flat();
        const bad = [];
        for (const ring of level === 5 ? ['M', 'm'] : ['M']) for (let p = 0; p < 12; p++) if (!all.includes(`${p}:${ring}`)) bad.push(`${p}:${ring}`);
        if (s.steps.length > 1) await tapKey(s.steps[0][0]);
        await tapKey(bad[bad.length - 1]);
        check((await fbSince(page, fb0, 1))[0] === 'bad', `L${level}: wrong tap gave no error feedback`);
        await page.waitForFunction(() => window.__test.state().idx === 0, null, { timeout: 5000 }).catch(() => {});
        check((await st()).idx === 0, 'a wrong tap restarts the sequence');
        // second miss: feedback again, logged once. NOTE: no reveal of the answer after it (reported).
        await tapKey(bad[0]);
        check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', `L${level}: second wrong tap gave no error feedback`);
        await page.waitForFunction(() => window.__test.state().idx === 0, null, { timeout: 5000 }).catch(() => {});
        check((await attempts()).length === before + 1, `L${level}: second miss logged again`);
      }
      for (const step of s.steps) await tapKey(step[0]);
    }
    const mine = await newAttempts(page, SLUG, before, 1);
    await page.waitForFunction((it) => window.__test.state().item !== it, s.item, { timeout: 8000 }).catch(() => {});
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].game === SLUG && mine[0].level === level && mine[0].skill === skillOf(SLUG, level) && mine[0].item === s.item, `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `L${level}: overflow`);
  const box = await page.evaluate(() => { const r = document.querySelector('.cf-circle')?.getBoundingClientRect(); return r && [r.left, r.right]; });
  check(!box || (box[0] >= 0 && box[1] <= 390), `L${level}: circle outside the screen`);
  check(!items.some((x, i) => i && x === items[i - 1]), `L${level}: same question twice in a row ${items}`);
  console.log(`L${level}`, [...seen].join(' '));
}

// A clean streak of 8 offers the next level (levels 1..5) or celebrates (level 6, no button).
for (const level of FAST ? [1, 6] : [1, 2, 3, 4, 5, 6]) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:circle-of-fifths', JSON.stringify({ level: l })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test.state().item);
  for (let r = 0; r < 8; r++) {
    const s = await st();
    if (s.mode === 'toSig') await page.click(`.cf-choices button[data-v="${s.answer}"]`);
    else for (const step of s.steps) await tapKey(step[0]);
    await page.waitForFunction((it) => window.__test.state().item !== it, s.item, { timeout: 8000 }).catch(() => {});
  }
  if (level < 6) {
    check(await isShown(page, '.cf-next'), `L${level}: no next-level button after 8 clean answers`);
    if (level === 1) { await page.click('.cf-next'); await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 8000 }).catch(() => {}); check((await st()).level === 2, 'L1: next-level button did not change the level'); }
  } else {
    check(!(await isShown(page, '.cf-next')), 'L6: next-level button on the last level');
    check((await fbLog(page)).includes('level'), 'L6: no celebration after 8 clean answers');
  }
}
// settings persist: level
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 4]], check, applied: async (p) => { const x = await p.evaluate(() => window.__test.state()); return x.level === 4 && ['toKey', 'toSig'].includes(x.mode) ? '' : `level ${x.level} mode ${x.mode}`; } });
// English labels: a found key shows its name.
await page.evaluate(() => localStorage.setItem('ml:settings:circle-of-fifths', JSON.stringify({ level: 2 })));
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
const p2 = await ctx2.newPage();
C.watch(p2);
await p2.goto(base);
await p2.evaluate(() => localStorage.setItem('ml:settings:circle-of-fifths', JSON.stringify({ level: 3 })));
await p2.reload();
await p2.click('.ml-start');
await p2.waitForTimeout(300);
const s2 = await p2.evaluate(() => window.__test.state());
const [pp] = s2.steps[0][0].split(':');
await p2.click(`g[data-pos="${pp}"][data-ring="M"] .cf-hit`);
// one read for both texts: the next question may replace the prompt a moment after the answer
const { shown, prompt } = await p2.evaluate((sel) => ({ shown: document.querySelector(sel + ' .cf-label').textContent, prompt: document.querySelector('.cf-prompt').textContent }), `g[data-pos="${pp}"][data-ring="M"]`);
check(shown.replace(/\/.*/, '') === prompt || shown.includes(prompt), `EN label ${shown} vs prompt ${prompt}`);
check(/^[A-G][♭♯]?$/.test(prompt), `EN prompt ${prompt}`);
if (dir) await p2.screenshot({ path: `${dir}/cf-en-dark.png` });
await ctx2.close();

check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
