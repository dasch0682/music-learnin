// Plays every level of Sing it with injected pitches: leak ignored, wrong note counted once, right notes in another octave, skip.
// Usage: npx vite --port 5409 --strictPort &   then   PORT=5409 node tools/sing-match.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5409}/sing-match/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const state = () => page.evaluate(() => window.__test.state());
const feed = async (midi, ms) => { for (let t = 0; t < ms; t += 40) { await page.evaluate((m) => window.__test.feed(m), midi); await page.waitForTimeout(40); } };
const listening = async () => { for (let i = 0; i < 300; i++) { const s = await state(); if (s.listening && s.item != null) return s; await feed(null, 80); } throw new Error('never listening'); };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'sing-match').sort((x, y) => x.t - y.t)); }; }));

// Theory, recomputed here.
const VOICES = {
  child: { lo: 60, hi: 69, easy: [60, 67], tonic: 60 }, high: { lo: 57, hi: 74, easy: [60, 69], tonic: 60 },
  medium: { lo: 48, hi: 62, easy: [52, 60], tonic: 48 }, low: { lo: 43, hi: 57, easy: [45, 55], tonic: 48 },
};
const SEMI = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NAT = [0, 2, 4, 5, 7, 9, 11], PENTA = [0, 2, 4, 7, 9];
const SKILL = { 1: 'sing.match', 2: 'sing.match', 3: 'sing.penta', 4: 'sing.intervals', 5: 'sing.scale' };
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

await page.goto(base);
const voices = ['child', 'high', 'medium', 'low'];
for (let level = 1; level <= 5; level++) {
  for (const pass of [0, 1]) {
    const voice = voices[(level + pass * 2) % 4];
    const tag = `L${level}/${voice}`;
    await open(level, voice);
    const before = (await attempts()).length;
    let s = await listening();
    check(s.level === level && s.view === 'game', `${tag}: state ${JSON.stringify(s)}`);
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
    check(mine.every((a) => a.level === level && a.skill === SKILL[level] && a.item === item), `${tag}: bad skill, level or item ${JSON.stringify(mine)}`);
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${tag}: overflow`);
    console.log(tag, mine.map((a) => `${a.skill} ${a.item} ${a.ok}`).join(' | '));
  }
}
// Skip: logged once as a miss, then a new round.
await open(1, 'child');
{
  const before = (await attempts()).length;
  await listening();
  await page.click('.sm-skip');
  await page.waitForTimeout(600);
  let mine = (await attempts()).slice(before);
  check(mine.length === 1 && !mine[0].ok && mine[0].skill === 'sing.match' && mine[0].level === 1, `skip: ${JSON.stringify(mine)}`);
  await listening();
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
