// Plays every level of Sing it with injected pitches: leak ignored, wrong note counted once, right notes in another octave, skip.
// Usage: npx vite --port 5409 --strictPort &   then   PORT=5409 node tools/sing-match.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
import { smoke, skillOf, setField, closeSettings, persistCheck, readAttempts } from './lib/shared-b.mjs';
const base = `http://localhost:${process.env.PORT || 5409}/sing-match/`;
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
const listening = async () => { for (let i = 0; i < 300; i++) { const s = await state(); if (s.listening && s.item != null) return s; await feed(null, 80); } throw new Error('never listening'); };
const attempts = () => readAttempts(page, 'sing-match');

// Theory, recomputed here.
const VOICES = {
  child: { lo: 60, hi: 69, easy: [60, 67], tonic: 60 }, high: { lo: 57, hi: 74, easy: [60, 69], tonic: 60 },
  medium: { lo: 48, hi: 62, easy: [52, 60], tonic: 48 }, low: { lo: 43, hi: 57, easy: [45, 55], tonic: 48 },
};
const SEMI = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NAT = [0, 2, 4, 5, 7, 9, 11], PENTA = [0, 2, 4, 7, 9];
const checkRound = (level, voice, s, tag) => {
  const v = VOICES[voice];
  const inV = (m) => m >= v.lo && m <= v.hi;
  if (level === 1) check(s.targets.length === 1 && s.targets[0] >= v.easy[0] && s.targets[0] <= v.easy[1] && NAT.includes(s.targets[0] % 12), `${tag}: L1 target ${s.targets}`);
  if (level === 2) check(s.targets.length === 1 && inV(s.targets[0]), `${tag}: L2 target ${s.targets}`);
  if (level === 3) {
    check(s.targets.length === +s.item && [2, 3].includes(s.targets.length), `${tag}: L3 length ${s.item}`);
    check(s.targets.every((m) => inV(m) && PENTA.includes(m % 12)), `${tag}: L3 not C pentatonic in range ${s.targets}`);
    const scale = []; for (let m = v.lo; m <= v.hi; m++) if (PENTA.includes(m % 12)) scale.push(m);
    check(s.targets.every((m, i) => i === 0 || [1, 2].includes(Math.abs(scale.indexOf(m) - scale.indexOf(s.targets[i - 1])))), `${tag}: L3 leap ${s.targets}`);
  }
  if (level === 4) {
    check(s.item in SEMI && Math.abs(s.targets[0] - s.base) === SEMI[s.item], `${tag}: L4 ${s.item} base ${s.base} target ${s.targets[0]}`);
  }
  if (level === 5) check(['1', '2', '3', '4', '5', '6', '7'].includes(s.item) && s.targets[0] === v.tonic + MAJOR[+s.item - 1], `${tag}: L5 degree ${s.item} -> ${s.targets}`);
};
const sung = async (s, shift) => {
  for (let i = 0; i < s.targets.length; i++) {
    const cur = await listening();
    check(cur.idx === i, `expected step ${i}, got ${cur.idx}`);
    await feed(s.targets[i] + shift + 0.2, 1000);
    await feed(null, 400);
  }
};
const open = async (level, voice) => {
  await page.evaluate(([l, v]) => localStorage.setItem('ml:settings:sing-match', JSON.stringify({ level: l, voice: v, tolerance: 40 })), [level, voice]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test);
  await page.evaluate(() => window.__test.feed(null));
};

await smoke({ browser, url: base, check });
await page.goto(base);
const voices = ['child', 'high', 'medium', 'low'];
// fast: level 1 only (each costs about 17 s of real-time microphone feeding); the generator sampling below keeps three levels
for (const level of levels(5, [1])) {
  for (const pass of rounds([0, 1], [0])) {
    const voice = voices[(level + pass * 2) % 4];
    const tag = `L${level}/${voice}`;
    await open(level, voice);
    const before = (await attempts()).length;
    // The microphone is shut while the app plays its reference: the right pitch fed now gives no progress.
    await page.waitForFunction(() => window.__test.state().targets, null, { timeout: 10000 });
    { const s0 = await state(); if (!s0.listening) { await feed(s0.targets[0], 600); const s1 = await state(); check(s1.idx === 0 && s1.hold === 0, `${tag}: heard the app's own reference`); } }
    let s = await listening();
    check(s.level === level && s.view === 'game', `${tag}: state ${JSON.stringify(s)}`);
    // Silence is not an answer, not even a wrong one.
    await feed(null, 2000);
    check(!(await state()).wrongLogged && (await state()).idx === 0 && (await attempts()).length === before, `${tag}: silence counted as an answer`);
    checkRound(level, voice, s, tag);
    if (pass === 0) {
      if (dir && [3, 5].includes(level)) await page.screenshot({ path: `${dir}/sm-${level}.png` });
      if (level === 2) check(await page.$eval('.ml-round', (b) => b.classList.contains('sm-off')), `${tag}: replay shown before a mistake`);
      const item = s.item;
      // 1. A wrong steady note counts once and the challenge restarts on the same item.
      const bad = s.targets[0] + 3;
      await feed(bad, 2600);
      s = await state();
      check(s.wrongLogged, `${tag}: wrong note not logged`);
      s = await listening();
      check(s.item === item && s.idx === 0, `${tag}: challenge did not restart`);
      if (level === 2) check(!(await page.$eval('.ml-round', (b) => b.classList.contains('sm-off'))), `${tag}: replay hidden after a mistake`);
      // 2. A second steady wrong note is not logged again.
      await feed(bad, 2600);
      s = await listening();
    }
    const item = s.item;
    await sung(s, pass ? 12 : -12);
    await feed(null, 800);
    const mine = (await attempts()).slice(before);
    const exp = pass ? [true] : [false, true];
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(exp), `${tag}: attempts ${JSON.stringify(mine.map((a) => [a.ok, a.item]))}`);
    check(mine.every((a) => a.level === level && a.skill === skillOf('sing-match', level) && a.item === item), `${tag}: bad skill, level or item ${JSON.stringify(mine)}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${tag}: overflow`);
    console.log(tag, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
  }
}
// Many more generated rounds, in each voice: a settings change draws a new round without logging anything.
for (const level of levels(5)) {
  await open(level, 'child');
  await page.waitForFunction(() => window.__test.state().targets, null, { timeout: 10000 });
  const seenItems = new Set();
  for (const voice of rounds(voices, ['child', 'low'])) {
    await setField(page, 1, voice);
    for (let k = 0; k < rounds(14, 4); k++) {
      const prev = JSON.stringify((await state()).targets);
      await setField(page, 2, k % 2 ? 40 : 25);
      for (let w = 0; w < 20; w++) { const t = await state(); if (t.targets && JSON.stringify(t.targets) !== prev) break; await page.waitForTimeout(50); }
      await page.waitForTimeout(80);
      const t = await state();
      if (t.targets) { checkRound(level, voice, t, `sample L${level}/${voice}`); seenItems.add(t.item); }
    }
  }
  await closeSettings(page);
  if (!FAST && level >= 4) check(seenItems.size >= 3, `L${level}: only ${[...seenItems]} after sampling`);
}
// Settings: voice and accuracy are saved, applied after a reload, and change the behaviour.
await open(1, 'child');
await persistCheck({
  page, url: base, slug: 'sing-match', fields: [[1, 'voice', 'low'], [2, 'tolerance', 25]], check,
  applied: async (pg) => { for (let i = 0; i < 50 && !(await pg.evaluate(() => window.__test.state().targets)); i++) await pg.waitForTimeout(100); const t = await pg.evaluate(() => window.__test.state()); return t.targets[0] >= 45 && t.targets[0] <= 55 ? '' : `target ${t.targets} for the low voice`; },
});
{
  let s = await listening();
  await feed(s.targets[0] + 0.45, 1500); // Precise (25): 0.45 semitone off is out of tune
  check((await state()).idx === 0 && !(await state()).wrongLogged, 'precise tolerance accepted a note 0.45 semitone off');
  await feed(null, 400);
  await setField(page, 2, 60);
  await closeSettings(page);
  s = await listening();
  await feed(s.targets[0] + 0.45, 1000); // Easy (60): in tune
  await page.waitForFunction(() => window.__test.state().done || window.__test.state().streak >= 1, null, { timeout: 4000 }).catch(() => check(false, 'easy tolerance rejected a note 0.45 semitone off'));
}
if (!FAST) { // a clean streak of 8 offers the next level (full only: eight complete real-time rounds take about a minute)
  await open(1, 'child');
  for (let k = 0; k < 8; k++) {
    const n0 = (await attempts()).length;
    const s = await listening();
    await feed(s.targets[0] + 0.1, 1000);
    for (let w = 0; w < 100 && (await attempts()).length === n0; w++) await feed(null, 100);
  }
  await page.waitForFunction(() => document.querySelector('.sm-offer:not(.sm-off)'), null, { timeout: 8000 }).catch(() => check(false, 'next-level button not offered after 8 clean rounds'));
  await page.click('.sm-offer').catch(() => {});
  await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 5000 }).catch(() => check(false, 'next-level click did not reach level 2'));
}
// Skip: logged once as a miss, then a new round.
await open(1, 'child');
{
  const before = (await attempts()).length;
  await listening();
  await page.click('.sm-skip');
  await page.waitForTimeout(600);
  let mine = (await attempts()).slice(before);
  check(mine.length === 1 && !mine[0].ok && mine[0].skill === skillOf('sing-match', 1) && mine[0].level === 1, `skip: ${JSON.stringify(mine)}`);
  await listening();
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
