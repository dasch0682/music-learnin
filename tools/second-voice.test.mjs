// Plays every level of Second voice with simulated pitches: success, wrong note, app-voice leak.
// Usage: npx vite --port 5220 --strictPort &   then   PORT=5220 node tools/second-voice.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5220}/second-voice/`;
const dir = process.argv[2];
const browser = await launch({ speed: 1 }); // microphone test: pitches are fed in real time (accelerated timers made it hang when run next to other microphone tests)
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => window.__test.state());
const feed = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await page.evaluate((m) => window.__test.feed(m), midi); await page.waitForTimeout(40); } };
const listening = async () => { for (let i = 0; i < 200; i++) { const s = await state(); if (s.listening && !s.done) return s; await feed(null, 80); } throw new Error('never listening'); };
const attempts = () => readAttempts(page, 'second-voice');

await smoke({ browser, url: base, check, startSel: '.ml-start' });
await page.goto(base);
await page.waitForFunction(() => window.__test);
// Musical content of the sampled rounds (steps: { targets, other, kind }), per level and voice setting.
const VOICES = { child: [60, 69], high: [57, 74], medium: [48, 62], low: [43, 57] };
const m12 = (x) => ((x % 12) + 12) % 12;
const CONSONANT = [0, 3, 4, 7, 8, 9];
function content(level, voice, steps, tag) {
  const [lo, hi] = VOICES[voice];
  const kinds = steps.map((s) => s.kind);
  check(kinds.every((k) => k === 'rest' || k === 'tension'), `${tag}: kinds ${kinds}`);
  steps.forEach((s, i) => {
    const shown = level !== 11 && !(level === 4 && i === 1);
    if (shown) check(s.targets[0] >= lo && s.targets[0] <= hi, `${tag}: sung note ${s.targets[0]} outside the ${voice} voice ${lo}-${hi} (step ${i})`);
    check(s.targets.length >= 1 && s.other.every((o) => Number.isInteger(o) && o >= 36), `${tag}: other voice ${JSON.stringify(s.other)}`);
  });
  const t = steps.map((s) => s.targets[0]);
  if (level <= 2) {
    check(steps.length === 4 && t.every((x) => x === t[0]), `${tag}: held note changes ${t}`);
    check(steps.every((s) => s.other.length === 1 && m12(s.other[0]) !== m12(s.targets[0]) && s.other[0] >= 41), `${tag}: moving voice lands on the held note or too low`);
    check(steps.every((s, i) => i === 0 || Math.abs(s.other[0] - steps[i - 1].other[0]) <= 5 && s.other[0] !== steps[i - 1].other[0]), `${tag}: moving voice jumps ${steps.map((x) => x.other)}`);
  }
  if (level === 3 || level === 4) {
    check(steps.length === 2 && kinds[0] === 'tension' && kinds[1] === 'rest', `${tag}: shape ${kinds}`);
    const a = m12(t[0] - steps[0].other[0]);
    check([2, 5, 11, 9].includes(a), `${tag}: tension interval ${a}`);
    // The bass is held (the release step always has one: see the bass check below).
    check(steps[1].other.length > 0, `${tag}: silent release`);
    if (steps[1].other.length) check(m12(steps[0].other[0]) === m12(steps[1].other[0]), `${tag}: bass moved`);
    const bass = steps[0].other[0];
    for (const r of steps[1].targets) {
      check(Math.abs(r - t[0]) >= 1 && Math.abs(r - t[0]) <= 2 && CONSONANT.includes(m12(r - bass)), `${tag}: release ${r} after ${t[0]} over ${bass}`);
    }
    if (level === 3) check(steps[1].targets.length === 1 && [0, 4, 7].includes(m12(t[1] - bass)), `${tag}: release interval`);
  }
  if (level === 5) {
    check(steps.length === 3 || steps.length === 4, `${tag}: ${steps.length} steps`);
    check(steps.every((s) => s.other.length === 1 && [3, 4].includes(m12(s.targets[0] - s.other[0]))), `${tag}: not a third above the bass`);
    check(t.every((x, i) => i === 0 || (Math.abs(x - t[i - 1]) >= 1 && Math.abs(x - t[i - 1]) <= 2)), `${tag}: moves ${t}`);
  }
  if (level === 6) check(steps.length === 4, `${tag}: ${steps.length} chords`);
  if (level === 7 || level === 8) check(steps.length === 3, `${tag}: ${steps.length} chords`);
  if (level === 9) check(steps.length === 3 || steps.length === 4 || steps.length === 5, `${tag}: ${steps.length} chords`);
  if (level === 10) check((steps.length === 5 || steps.length === 7) && kinds.every((k, i) => k === (i > 0 && i % 2 === 1 ? 'tension' : 'rest')), `${tag}: chain ${kinds}`);
  if (level === 11) check((steps.length === 3 || steps.length === 4) && steps.every((x) => x.targets.length === 2), `${tag}: progression`);
}
// 0. Bass: in every voice setting and level, each bass note is at least C2 (36) and sounds strictly below
// the lowest sung note of its step. An empty bass is a silent step, allowed only off the release and last steps.
// Levels 1-2 are not bass levels: the app sings a moving voice above the held note there, by design.
const N = rounds(150, 40);
for (const voice of rounds(['child', 'high', 'medium', 'low'], ['child', 'low'])) {
  for (const level of rounds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [1, 3, 4, 5, 7, 10, 11])) {
    const samples = await page.evaluate(([l, v, n]) => window.__test.sample(l, v, n), [level, voice, N]);
    let bad = 0, example = null;
    samples.forEach((steps, k) => content(level, voice, steps, `${voice} L${level} #${k}`));
    for (const steps of samples) for (const st of steps) {
      const top = Math.min(...st.targets);
      if (level > 2 && !st.other.every((b) => b >= 36 && b < top)) { bad++; example ??= JSON.stringify(st); }
    }
    // The release step (after a tension) and the last step carry the resolution: always a bass note, >= C2, below the sung note.
    if (level > 2) samples.forEach((steps, k) => steps.forEach((st, i) => {
      if (i !== steps.length - 1 && steps[i - 1]?.kind !== 'tension') return;
      const top = Math.min(...st.targets);
      check(st.other.length > 0 && st.other.every((b) => b >= 36 && b < top), `${voice} L${level} #${k}: release step ${i} bass ${JSON.stringify(st.other)} sung ${JSON.stringify(st.targets)}`);
    }));
    check(samples.length === N && bad === 0, `bass ${voice} L${level}: ${bad} step(s) with a bass note not below the sung note, e.g. ${example}`);
  }
}
// fast: level 1 only (each level costs about 17 s of real-time microphone feeding); the generators above sample every level
for (const level of levels(11, [1])) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:second-voice', JSON.stringify({ level: l, voice: 'child', tolerance: 50, phones: false })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.evaluate(() => window.__test.feed(null));
  const before = (await attempts()).length;
  // The microphone is shut while the app sings its model note: the right pitch fed now gives no progress.
  await page.waitForFunction(() => window.__test.state().steps, null, { timeout: 10000 });
  { const s0 = await state(); if (!s0.listening) { await feed(s0.steps[0].targets[0], 600); check((await state()).idx === 0, `L${level}: heard the app's own model note`); } }
  let s = await listening();
  const item = s.item;
  // Silence is not an answer, not even a wrong one.
  await feed(null, 2600);
  check(!(await state()).wrongLogged && (await state()).idx === 0 && (await attempts()).length === before, `L${level}: silence counted as an answer`);
  if (dir && [7, 9].includes(level)) await page.screenshot({ path: `${dir}/sv-${level}.png` });
  if (level === 10) { // chain: bass steps down at each tension, singer holds then steps down
    const [kind, links] = item.split(':');
    const [rest, tens] = kind === '7-6' ? [[8, 9], [10, 11]] : [[3, 4], [5, 6]];
    const m12 = (x) => ((x % 12) + 12) % 12;
    check(s.steps.length === 1 + 2 * +links, `L10: step count ${s.steps.length}`);
    s.steps.forEach((st, i) => {
      const iv = m12(st.targets[0] - st.other[0]);
      const t = i > 0 && i % 2 === 1;
      check(st.kind === (t ? 'tension' : 'rest') && (t ? tens : rest).includes(iv), `L10: step ${i} kind ${st.kind} interval ${iv}`);
      if (i > 0) {
        const p = s.steps[i - 1], db = p.other[0] - st.other[0], du = p.targets[0] - st.targets[0];
        if (t) check(du === 0 && (db === 1 || db === 2), `L10: tension ${i} bass ${db} voice ${du}`);
        else check(db === 0 && (du === 1 || du === 2), `L10: release ${i} bass ${db} voice ${du}`);
      }
    });
  }
  // 1. The app's own note must not count as a wrong note (speaker leak).
  await feed(s.steps[0].other[0], 2600);
  s = await state();
  check(!s.wrongLogged && s.idx === 0, `L${level}: leak counted`);
  // 2. A steady wrong note counts once and restarts the challenge.
  const all = s.steps[0].targets.concat(s.steps[0].other);
  let bad = s.steps[0].targets[0] + 1;
  while (all.some((t) => Math.abs(((bad - t + 6) % 12 + 12) % 12 - 6) < 1)) bad++;
  await feed(bad, 2600);
  s = await state();
  check(s.wrongLogged, `L${level}: wrong note not logged`);
  // 3. Sing every step, one octave lower than asked on odd levels.
  s = await listening();
  check(s.item === item && s.idx === 0, `L${level}: challenge did not restart`);
  for (let i = 0; i < s.steps.length; i++) {
    const cur = await listening();
    check(cur.idx === i, `L${level}: expected step ${i}, got ${cur.idx}`);
    const t = cur.steps[i].targets[cur.steps[i].targets.length - 1] - (level % 2 ? 12 : 0);
    await feed(t + 0.2, 900);
    await feed(null, 500);
  }
  await feed(null, 1200);
  const mine = (await attempts()).slice(before);
  check(mine.length === 2 && !mine[0].ok && mine[1].ok, `L${level}: attempts ${JSON.stringify(mine.map((a) => a.ok))}`);
  check(mine.every((a) => a.level === level && a.skill === skillOf('second-voice', level)), `L${level}: bad skill or level`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!overflow, `L${level}: overflow`);
  console.log(`L${level}`, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
}
// Settings: voice, accuracy and headphones are saved, applied after a reload, and change the behaviour.
await page.evaluate(() => localStorage.setItem('ml:settings:second-voice', JSON.stringify({ level: 1, voice: 'child', tolerance: 50, phones: false })));
await page.reload();
await page.click('.ml-start');
await persistCheck({
  page, url: base, slug: 'second-voice', fields: [[1, 'voice', 'low'], [2, 'tolerance', 30], [3, 'phones', true]], check,
  applied: async (pg) => { const st = await pg.evaluate(() => window.__test.state()); return st.steps.every((x) => x.targets[0] >= 43 && x.targets[0] <= 57) ? '' : `low voice targets ${JSON.stringify(st.steps.map((x) => x.targets))}`; },
});
{
  // Headphones on: the app's own note is no longer filtered out, so singing it counts (here as a wrong note).
  let s = await listening();
  check(s.steps[0].other[0] != null, 'phones: no app note');
  await feed(s.steps[0].other[0], 2600);
  check((await state()).wrongLogged, 'phones: the app note should count as the singer note with headphones');
  // Precise (30): 0.45 semitone off is out of tune; Easy (65): the same note is in tune.
  s = await listening();
  check(s.idx === 0, 'precise: restart');
  await feed(s.steps[0].targets[0] + 0.45, 1500);
  check((await state()).idx === 0, 'precise tolerance accepted a note 0.45 semitone off');
  await feed(null, 400);
  await setField(page, 2, 65);
  await closeSettings(page);
  s = await listening();
  await feed(s.steps[0].targets[0] + 0.45, 1000);
  await page.waitForFunction(() => window.__test.state().idx >= 1, null, { timeout: 4000 }).catch(() => check(false, 'easy tolerance rejected a note 0.45 semitone off'));
}
if (!FAST) { // a clean streak of 6 offers the next level (full only: six complete real-time rounds take about a minute)
  await page.evaluate(() => localStorage.setItem('ml:settings:second-voice', JSON.stringify({ level: 1, voice: 'child', tolerance: 65, phones: false })));
  await page.reload();
  await page.click('.ml-start');
  for (let k = 0; k < 6; k++) {
    const n0 = (await attempts()).length;
    let st = await listening();
    for (let i = 0; i < st.steps.length; i++) {
      const cur = await listening();
      await feed(cur.steps[i].targets[0], 900);
      await feed(null, 400);
    }
    for (let w = 0; w < 100 && (await attempts()).length === n0; w++) await feed(null, 100);
  }
  await page.waitForFunction(() => document.querySelector('.sv-offer:not(.sv-off)'), null, { timeout: 5000 }).catch(() => check(false, 'next-level button not offered after 6 clean rounds'));
  await page.click('.sv-offer').catch(() => {});
  await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 5000 }).catch(() => check(false, 'next-level click did not reach level 2'));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
