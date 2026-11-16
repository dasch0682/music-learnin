// Plays every level of Intervals by ear, in keyboard mode and in naming mode: a wrong answer, then the right one.
// Usage: npx vite --port 5408 --strictPort &   then   PORT=5408 node tools/ear-intervals.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5408}/ear-intervals/`;
const shots = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'ear-intervals').sort((x, y) => x.t - y.t)); }; }));
const wait = (ms) => page.waitForTimeout(ms);
// Independent theory table (semitones).
const SEMI = { m2: 1, M2: 2, m3: 3, M3: 4, P4: 5, TT: 6, P5: 7, m6: 8, M6: 9, m7: 10, M7: 11, P8: 12 };
const ALL = Object.keys(SEMI);
const LEVELS = {
  1: { skill: 'listen.intervals.basic', ids: ['M2', 'M3', 'P5', 'P8'], dirs: ['+'] },
  2: { skill: 'listen.intervals.basic', ids: ['M2', 'm3', 'M3', 'P4', 'P5', 'P8'], dirs: ['+', '-'] },
  3: { skill: 'listen.intervals.all', ids: ALL, dirs: ['+'] },
  4: { skill: 'listen.intervals.all', ids: ALL, dirs: ['+', '-'] },
  5: { skill: 'listen.intervals.harmonic', ids: ALL, dirs: ['h'] },
};
// Tap a key like a finger would (pointerdown on the key element).
const tapKey = (midi) => page.evaluate((m) => document.querySelector(`.ei-kb [data-midi="${m}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })), midi);
await page.goto(base);
for (const mode of ['play', 'name']) {
  for (let level = 1; level <= 5; level++) {
    const cfg = LEVELS[level];
    await page.evaluate(([l, a]) => localStorage.setItem('ml:settings:ear-intervals', JSON.stringify({ level: l, answer: a })), [level, mode]);
    await page.reload();
    await page.click('.ml-start');
    await page.waitForFunction(() => window.__test?.state());
    const seen = new Set();
    const rounds = mode === 'play' ? 8 : 5;
    for (let round = 0; round < rounds; round++) {
      await page.waitForFunction(() => window.__test?.state());
      const s = await page.evaluate(() => window.__test.state());
      const tag = `${mode} L${level} r${round} ${s.item}`;
      seen.add(s.item);
      const dir = s.item.slice(2);
      check(cfg.ids.includes(s.id) && cfg.dirs.includes(dir) && s.item === s.id + dir, `${tag}: item not in level`);
      const sign = dir === '-' ? -1 : 1;
      check(s.second - s.first === SEMI[s.id] * sign, `${tag}: notes ${s.first} -> ${s.second}`);
      check(Math.min(s.first, s.second) >= 60 && Math.max(s.first, s.second) <= 79, `${tag}: out of keyboard`);
      check(s.mode === mode, `${tag}: mode ${s.mode}`);
      check(JSON.stringify(s.ids) === JSON.stringify(cfg.ids), `${tag}: choices`);
      const before = (await attempts()).length;
      if (round === 0) {
        if (shots) await page.screenshot({ path: `${shots}/ei-${mode}-${level}.png` });
        if (mode === 'play') {
          let wrong = s.second + 1; if (wrong > 79 || wrong === s.first) wrong = s.second - 1;
          if (wrong === s.first) wrong = s.second + 2 <= 79 ? s.second + 2 : s.second - 2;
          await tapKey(wrong);
        } else {
          const w = s.ids.findIndex((id) => id !== s.id);
          await page.click(`.ei-names button >> nth=${w}`);
        }
        await wait(150);
      }
      if (mode === 'play') await tapKey(s.second);
      else await page.click(`.ei-names button >> nth=${s.ids.indexOf(s.id)}`);
      await wait(1100);
      const mine = (await attempts()).slice(before);
      const a = mine[0];
      check(mine.length === 1 && a.ok === (round !== 0) && a.level === level && a.item === s.item && a.skill === cfg.skill && a.detail?.mode === mode, `${tag}: ${JSON.stringify(mine.map((x) => [x.skill, x.ok, x.level, x.item, x.detail]))}`);
    }
    check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${mode} L${level}: overflow`);
    console.log(mode, `L${level}`, [...seen].join(' '));
  }
}

check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
