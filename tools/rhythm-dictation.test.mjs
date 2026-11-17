// Plays every level of Write the rhythm: a wrong bar (twice at round 1), then the right one. Recomputes the rules from the item id.
// Usage: npx vite --port 5404 --strictPort &   then   PORT=5404 node tools/rhythm-dictation.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5404}/rhythm-dictation/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'rhythm-dictation').sort((x, y) => x.t - y.t)); }; }));
const state = () => page.evaluate(() => window.__test.state());

// Own copy of the music facts: length in quarters and note/rest events of each cell.
const CELL = {
  q: [[1]], h: [[2]], ee: [[0.5], [0.5]], r: [[1, 1]], ssss: [[0.25], [0.25], [0.25], [0.25]], ess: [[0.5], [0.25], [0.25]],
  'q.e': [[1.5], [0.5]], eqe: [[0.5], [1], [0.5]], t: [[1 / 3], [1 / 3], [1 / 3]], 'q.': [[1.5]], eee: [[0.5], [0.5], [0.5]], qe: [[1], [0.5]], 'h.': [[3]],
};
const len = (id) => CELL[id].reduce((a, e) => a + e[0], 0);
const PAL = { 1: ['q', 'ee', 'h'], 2: ['q', 'ee', 'h', 'r'], 3: ['q', 'ee', 'h', 'r', 'ssss', 'ess'], 4: ['q', 'ee', 'h', 'r', 'q.e', 'eqe'], 5: ['q', 'ee', 'h', 'r', 't'], 6: ['q.', 'eee', 'qe', 'h.'] };
const FEATURE = { 1: ['ee', 'h'], 2: ['r'], 3: ['ssss', 'ess'], 4: ['q.e', 'eqe'], 5: ['t'], 6: ['eee', 'qe'] };
const ROUNDS = { 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 8 };
const places = (cells) => { let p = 0; return cells.map((id) => { const s = p; p += len(id); return `${id}@${s}`; }); };

function rules(level, s) {
  const where = `L${level} ${s.item}`;
  const bars = s.item.split('|').map((b) => b.split('-'));
  const barLen = level === 6 ? 3 : 4;
  check(bars.length === (level === 6 ? 2 : 1), `${where}: number of bars`);
  check(s.meter === (level === 6 ? '6/8' : '4/4') && s.barLen === barLen, `${where}: meter`);
  for (const b of bars) {
    check(Math.abs(b.reduce((a, id) => a + len(id), 0) - barLen) < 1e-6, `${where}: bar does not add up`);
    let p = 0;
    for (const id of b) { // a cell of 2 quarters or more starts on its own multiple; nothing crosses a beat group
      if (len(id) >= 2) check(Math.abs(p % len(id)) < 1e-6, `${where}: ${id} off the beat`);
      p += len(id);
    }
  }
  const all = bars.flat();
  check(all.every((id) => PAL[level].includes(id)), `${where}: cell outside the level`);
  check(all.some((id) => FEATURE[level].includes(id)), `${where}: level feature missing`);
  check(s.cells.join('-') === bars.flat().join('-'), `${where}: cells vs item`);
  check(JSON.stringify(s.palette) === JSON.stringify(PAL[level]), `${where}: palette`);
  if (level === 5) check(all.filter((id) => id === 't').length <= 2, `${where}: triplets`);
}

/** A wrong answer: swap one cell for another of the same length, else replace a long cell by quarters. */
function wrongOf(cells, level) {
  const alt = PAL[level];
  for (let i = 0; i < cells.length; i++) {
    const c = alt.find((x) => x !== cells[i] && Math.abs(len(x) - len(cells[i])) < 1e-6);
    if (c) { const w = [...cells]; w[i] = c; return w; }
  }
  const i = cells.findIndex((id) => len(id) === 2);
  const w = [...cells]; w.splice(i, 1, 'q', 'q'); return w;
}

const btn = (id) => `.rd-pbtn[data-cell="${id}"]`;
async function enter(list) { for (const id of list) await page.click(btn(id)); }
async function settle() { await page.waitForFunction(() => window.__test.state().marks); }

await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:rhythm-dictation', JSON.stringify({ level: l, tempo: 120 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const seen = new Set();
  for (let round = 0; round < rounds(ROUNDS[level], 3); round++) {
    const s = await state();
    seen.add(s.item); if (process.env.V) console.log(level, round, s.item);
    rules(level, s);
    check(await page.$$eval('.rd-pbtn', (e) => e.length) === PAL[level].length, `L${level}: palette buttons`);
    check(await page.$$eval('.rd-slot', (e) => e.length) === 4, `L${level}: four empty slots`);
    const before = (await attempts()).length;
    if (round < 2) {
      const wrong = wrongOf(s.cells, level);
      await enter(wrong);
      await settle();
      let st = await state();
      const want = new Set(places(s.cells));
      const exp = places(wrong).map((p) => want.has(p));
      check(JSON.stringify(st.marks) === JSON.stringify(exp) && exp.includes(false), `L${level}: marks ${JSON.stringify(st.marks)} vs ${JSON.stringify(exp)}`);
      check((await page.$$eval('.rd-bad', (e) => e.length)) >= 1, `L${level}: wrong cells not in the bad colour`);
      if (dir && round === 0 && level === 4) await page.screenshot({ path: `${dir}/rd-4-wrong.png` });
      const keep = exp.indexOf(false);
      if (round === 1) { // a second mistake is not logged again
        await enter(wrong.slice(keep));
        await settle();
        st = await state();
        check(st.marks[keep] === false || st.marks.includes(false), `L${level}: second mistake`);
        await enter(s.cells.slice(0, 0));
        const k2 = st.marks.indexOf(false);
        await enter(s.cells.slice(k2));
      } else await enter(s.cells.slice(keep));
    } else await enter(s.cells);
    await settle();
    const done = await state();
    check(done.marks.every(Boolean) && done.entered.join('-') === s.cells.join('-'), `L${level} round ${round}: final ${done.entered} vs ${s.cells}`);
    if (dir && round === 2 && level === 6) await page.screenshot({ path: `${dir}/rd-6-fr.png` });
    await page.waitForTimeout(1700);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round > 1) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'rhythm.dictation', `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, seen.size, 'patterns');
}
// Undo, a cell that does not fit is disabled, next-level button after a clean streak.
await page.evaluate(() => localStorage.setItem('ml:settings:rhythm-dictation', JSON.stringify({ level: 1, tempo: 120 })));
await page.reload();
await page.click('.ml-start');
await page.waitForTimeout(300);
await page.click(btn('q'));
check(await page.$eval(btn('h'), (e) => e.disabled), 'a half note cannot start on beat 2');
check((await state()).entered.length === 1, 'cell adds');
await page.click('.rd-undo');
check((await state()).entered.length === 0, 'undo removes the cell');
for (let i = 0; i < 6; i++) {
  const s = await state();
  await enter(s.cells);
  await page.waitForTimeout(2700);
}
check(await page.$eval('.rd-next', (e) => e.classList.contains('rd-show')), 'next-level button after a clean streak');
await page.click('.rd-next');
await page.waitForTimeout(400);
check((await state()).level === 2, 'next level click');
// English, dark, level 5 (triplets).
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:rhythm-dictation', JSON.stringify({ level: 5, tempo: 120 })));
await en.reload();
await en.click('.ml-start');
await en.waitForTimeout(400);
const es = await en.evaluate(() => window.__test.state());
for (const id of es.cells.slice(0, 3)) await en.click(btn(id));
if (dir) await en.screenshot({ path: `${dir}/rd-5-en-dark.png` });
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN L5 overflow');
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
