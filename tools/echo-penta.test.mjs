// Plays every level of Echo: a wrong pad, then the tune. Checks pads and tune against the scale and the attempts in IndexedDB.
// Usage: npx vite --port 5408 --strictPort &   then   PORT=5408 node tools/echo-penta.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5408}/echo-penta/`;
const shots = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'echo-penta').sort((x, y) => x.t - y.t)); }; }));
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
for (const level of levels(6)) {
  const cfg = LEVELS[level];
  await setup(level, false);
  const lens = new Set();
  for (let round = 0; round < rounds(4, 2); round++) {
    const t = await get();
    const tag = `L${level} r${round}`;
    lens.add(t.tune.length);
    check(cfg.len.includes(t.tune.length), `${tag}: length ${t.tune.length}`);
    check(t.level === level, `${tag}: level ${t.level}`);
    checkTune(t, level, tag);
    const before = (await attempts()).length;
    if (round === 0) {
      if (shots && level % 2) await page.screenshot({ path: `${shots}/ep-${level}.png` });
      const wrong = t.pads.find((m) => m !== t.tune[0]);
      await tapPad(wrong);
      await wait(100);
      check((await get()).pos === 0, `${tag}: wrong pad moved on`);
      await ready(); // the same tune is played again
      const t2 = await get();
      check(JSON.stringify(t2.tune) === JSON.stringify(t.tune), `${tag}: tune changed after a mistake`);
    }
    for (const m of t.tune) await tapPad(m);
    await page.waitForFunction(() => window.__test.state === 'done');
    await wait(200);
    const mine = (await attempts()).slice(before);
    const want = round === 0 ? [false, true] : [true];
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(want) && mine.every((a) => a.level === level && a.item === t.tune.length && a.skill === cfg.skill && a.detail?.growing === false), `${tag}: ${JSON.stringify(mine.map((a) => [a.skill, a.ok, a.level, a.item, a.detail]))}`);
    if (round === 0) check(mine[1]?.detail?.retry === true && mine[0]?.detail?.retry === false, `${tag}: retry flag`);
    if (round < rounds(4, 2) - 1) await ready();
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level} lengths`, [...lens].join(' '));
}
// Growing tune: each success adds a note, a mistake ends it.
await setup(2, true);
{
  let t = await get();
  const first = t.tune.length;
  check(first === 3, `growing: starts with ${first} notes`);
  for (let k = 1; k <= 2; k++) {
    for (const m of t.tune) await tapPad(m);
    await page.waitForFunction(() => window.__test.state === 'done');
    await ready();
    const t2 = await get();
    check(t2.tune.length === t.tune.length + 1 && t.tune.every((m, i) => t2.tune[i] === m), `growing step ${k}: ${t.tune} -> ${t2.tune}`);
    check(t2.tune.every((m) => t2.pads.includes(m)), 'growing: off the pads');
    t = t2;
  }
  const wrong = t.pads.find((m) => m !== t.tune[0]);
  await tapPad(wrong);
  await page.waitForFunction(() => window.__test.state === 'done');
  await ready();
  const t3 = await get();
  check(t3.tune.length === 3, `growing: a mistake should restart at 3, got ${t3.tune.length}`);
  const mine = (await attempts()).slice(-1)[0];
  check(mine.ok === false && mine.detail.growing === true, 'growing: mistake log');
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
