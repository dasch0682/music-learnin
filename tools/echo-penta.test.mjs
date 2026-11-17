// Plays every level of Echo: a wrong pad, then the tune. Checks pads and tune against the scale and the attempts in IndexedDB.
// Usage: npx vite --port 5408 --strictPort &   then   PORT=5408 node tools/echo-penta.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, levelCount, makeChecker, overflows, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, isShown } from './lib/shared-a.mjs';
const SLUG = 'echo-penta';
const base = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const shots = process.argv[2];
const C = makeChecker(), { check } = C;
const browser = await launch();
await smoke({ browser, url: base, check: (ok, m) => check(ok, m), prep: async (p) => { await p.waitForFunction(() => window.__test?.state === 'answer', null, { timeout: 20000 }); } });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const attempts = () => readAttempts(page, SLUG);
const wait = (ms) => page.waitForTimeout(ms);
const PENTA = [0, 2, 4, 7, 9], MINOR = [0, 3, 5, 7, 10], BLUES = [0, 3, 5, 6, 7, 10];
const LEVELS = {
  1: { skill: 'listen.penta.echo', steps: [...PENTA], len: [2, 3], maxLeap: 2 },
  2: { skill: 'listen.penta.echo', steps: [...PENTA], len: [3, 4], maxLeap: 4 },
  3: { skill: 'listen.penta.echo', steps: [...PENTA], len: [3, 4], maxLeap: 3 },
  4: { skill: 'listen.penta.long', steps: [...PENTA, 12], len: [4, 5, 6], maxLeap: 3 },
  5: { skill: 'listen.penta.long', steps: [...MINOR, 12], len: [4, 5, 6], maxLeap: 3, roots: true },
  6: { skill: 'listen.penta.long', steps: [...BLUES, 12], len: [5, 6, 7], maxLeap: 3, roots: true },
};
const tapPad = (midi) => page.evaluate((m) => document.querySelector(`.echo-pads [data-midi="${m}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })), midi);
const ready = () => page.waitForFunction(() => window.__test?.state === 'answer', null, { timeout: 15000 });
const get = () => page.evaluate(() => window.__test);
async function setup(level, growing) {
  await page.evaluate(([l, g]) => localStorage.setItem('ml:settings:echo-penta', JSON.stringify({ level: l, growing: g, tempo: 140 })), [level, growing]);
  await page.reload();
  await page.click('.ml-start');
  await ready();
}
function checkTune(t, level, tag) {
  const cfg = LEVELS[level];
  const root = t.pads[0];
  check(t.pads.length === cfg.steps.length && t.pads.every((m, i) => m - root === cfg.steps[i]), `${tag}: pads ${t.pads}`);
  if (cfg.roots) check(root >= 55 && root <= 64, `${tag}: root ${root}`); else check(root === 60, `${tag}: root ${root}`);
  check(t.tune.every((m) => t.pads.includes(m)), `${tag}: tune off the pads ${t.tune}`);
  const idx = t.tune.map((m) => t.pads.indexOf(m));
  check(idx.slice(1).every((v, i) => Math.abs(v - idx[i]) <= cfg.maxLeap), `${tag}: leap too big ${idx}`);
  check(new Set(idx).size > 1, `${tag}: one note only`);
  check(idx.every((v, i) => i < 2 || !(v === idx[i - 1] && v === idx[i - 2])), `${tag}: three equal notes ${idx}`);
}
page.setDefaultTimeout(15000);
await page.goto(base);
const oneLevelSkill = (l) => skillOf(SLUG, l);
for (const level of levels(6)) {
  const cfg = LEVELS[level];
  await setup(level, false);
  const lens = [];
  for (let round = 0; round < rounds(6, 3); round++) {
    const t = await get();
    const tag = `L${level} r${round}`;
    lens.push(t.tune.length);
    check(cfg.len.includes(t.tune.length), `${tag}: length ${t.tune.length}`);
    check(t.level === level, `${tag}: level ${t.level}`);
    checkTune(t, level, tag);
    const before = (await attempts()).length;
    const fb0 = (await fbLog(page)).length;
    if (round <= 1) {
      if (shots && round === 0 && level % 2) await page.screenshot({ path: `${shots}/ep-${level}.png` });
      const wrong = t.pads.find((m) => m !== t.tune[0]);
      await tapPad(wrong);
      check((await fbSince(page, fb0, 1))[0] === 'bad', `${tag}: wrong pad gave no error feedback`);
      check((await get()).pos === 0, `${tag}: wrong pad moved on`);
      await ready(); // the same tune is played again
      const t2 = await get();
      check(JSON.stringify(t2.tune) === JSON.stringify(t.tune), `${tag}: tune changed after a mistake`);
      if (round === 1) { // second miss on the same tune: feedback again, not logged again
        await tapPad(wrong);
        check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', `${tag}: second miss gave no feedback`);
        await ready();
        check((await attempts()).length === before + 1, `${tag}: second miss logged again`);
      }
    }
    for (const m of t.tune) await tapPad(m);
    // (done state is short-lived under load: the log below is the signal)
    const want = round <= 1 ? [false, true] : [true];
    const mine = await newAttempts(page, SLUG, before, want.length, 20000);
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(want) && mine.every((a) => a.game === SLUG && a.level === level && a.item === t.tune.length && a.skill === skillOf(SLUG, level) && a.skill === cfg.skill && a.detail?.growing === false), `${tag}: ${JSON.stringify(mine.map((a) => [a.skill, a.ok, a.level, a.item, a.detail]))}`);
    if (round <= 1) check(mine[1]?.detail?.retry === true && mine[0]?.detail?.retry === false, `${tag}: retry flag`);
    const fb = (await fbLog(page)).slice(fb0);
    check(round <= 1 ? fb.filter((k) => k === 'bad').length >= round + 1 : !fb.includes('bad'), `${tag}: feedback ${fb}`);
    if (round < rounds(6, 3) - 1) await ready();
  }
  // lengths: pools of 3 lengths may repeat (core pickWeak only forbids an immediate repeat for pools of more than 4), so only the set is checked
  if (!FAST && cfg.len.length > 2) check(lens.every((x) => cfg.len.includes(x)), `L${level}: lengths ${lens}`);
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level} lengths`, [...new Set(lens)].join(' '));
  // a clean streak of 8 first-try tunes offers the next level (and celebrates on the last)
  if (!FAST || level === 1 || level === levelCount(SLUG)) {
    await setup(level, false);
    const last = level === levelCount(SLUG);
    for (let k = 0; k < 9 && !(await isShown(page, '.echo-next button')); k++) {
      const t = await get();
      const n0 = (await attempts()).length;
      for (const m of t.tune) await tapPad(m);
      await newAttempts(page, SLUG, n0, 1);
      if (k < 8) await ready().catch(() => {});
    }
    if (last) { check(!(await isShown(page, '.echo-next button')), `L${level}: next button on the last level`); check((await fbLog(page)).filter((x) => x === 'level').length === 0, `L${level}: celebration on the last level`); }
    else {
      check(await isShown(page, '.echo-next button'), `L${level}: no next-level button after 8 clean tunes`);
      check((await fbLog(page)).includes('level'), `L${level}: no celebration after 8 clean tunes`);
      await page.click('.echo-next button');
      await page.waitForFunction((l) => window.__test?.level === l, level + 1, { timeout: 15000 }).catch(() => {});
      check((await get()).level === level + 1, `L${level}: next-level button did not change level`);
    }
  }
}
// Growing tune: each success adds a note, a mistake ends it.
await setup(2, true);
{
  let t = await get();
  const first = t.tune.length;
  check(first === 3, `growing: starts with ${first} notes`);
  for (let k = 1; k <= 2; k++) {
    const n0 = (await attempts()).length;
    for (const m of t.tune) await tapPad(m);
    await newAttempts(page, SLUG, n0, 1);
    await ready();
    const t2 = await get();
    check(t2.tune.length === t.tune.length + 1 && t.tune.every((m, i) => t2.tune[i] === m), `growing step ${k}: ${t.tune} -> ${t2.tune}`);
    check(t2.tune.every((m) => t2.pads.includes(m)), 'growing: off the pads');
    t = t2;
  }
  const wrong = t.pads.find((m) => m !== t.tune[0]);
  const n1 = (await attempts()).length;
  await tapPad(wrong);
  await newAttempts(page, SLUG, n1, 1);
  await ready();
  const t3 = await get();
  check(t3.tune.length === 3, `growing: a mistake should restart at 3, got ${t3.tune.length}`);
  const mine = (await attempts()).slice(-1)[0];
  check(mine.ok === false && mine.detail.growing === true, 'growing: mistake log');
}
// settings persist: level, growing tune, tempo
await setup(1, false);
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 4], [1, 'growing', true], [2, 'tempo', 100]], check, start: true, applied: async (p) => { await p.waitForFunction(() => window.__test?.state === 'answer', null, { timeout: 20000 }); const t = await p.evaluate(() => window.__test); return t.level === 4 && t.pads.length === 6 ? '' : `level ${t.level} pads ${t.pads.length}`; } });
check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
