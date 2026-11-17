// Plays every level of Chord paths: a wrong sequence, then the right one. Checks voicing, pads, names and the log.
// Usage: npx vite --port 5302 --strictPort &   then   PORT=5302 node tools/ear-progressions.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5302}/ear-progressions/`;
const dir = process.argv[2];
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'ear-progressions').sort((x, y) => x.t - y.t)); }; }));

// Independent theory: roman numeral → [semitones above tonic, chord intervals].
const T = {
  I: [0, [0, 4, 7]], ii: [2, [0, 3, 7]], iii: [4, [0, 3, 7]], IV: [5, [0, 4, 7]], V: [7, [0, 4, 7]], V7: [7, [0, 4, 7, 10]], vi: [9, [0, 3, 7]],
  i: [0, [0, 3, 7]], iv: [5, [0, 3, 7]], VI: [8, [0, 4, 7]],
  Imaj7: [0, [0, 4, 7, 11]], ii7: [2, [0, 3, 7, 10]], vi7: [9, [0, 3, 7, 10]],
  'V7/V': [2, [0, 4, 7, 10]], 'V7/ii': [9, [0, 4, 7, 10]], bII7: [1, [0, 4, 7, 10]],
};
const pcs = (a) => [...new Set(a.map((m) => ((m % 12) + 12) % 12))].sort((x, y) => x - y);
const expectedChord = (key, r) => {
  const [root, iv] = T[r];
  return { bass: (key + root) % 12, pcs: pcs(iv.map((i) => key + root + i)) };
};
const MIN_SETS = { 5: ['i', 'iv', 'V', 'VI'] };
const NEED = { 1: 2, 2: 3, 3: 3, 4: 5, 5: 7, 6: 5 };

await page.goto(base);
for (const level of levels(6)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-progressions', JSON.stringify({ level: l, tempo: 110 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const seen = new Set();
  const tapRoman = (r) => page.click(`.pg-pads button[data-roman="${r}"]`);
  for (let round = 0; round < rounds(8, 3); round++) {
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item);
    const n = s.romans.length;
    check(n >= (level === 1 ? 3 : 3) && n <= 4, `L${level}: ${n} chords`);
    if (level <= 2) check(n === 3 || level === 2, `L1 must have 3 chords`);
    if (level >= 3) check(n === 4, `L${level}: expected 4 chords, got ${n}`);
    if (level === 1) check(s.romans[0] === 'I' && s.romans.every((r) => r === 'I' || r === 'V'), `L1 item ${s.item}`);
    if (level === 2) check(s.romans.every((r) => ['I', 'IV', 'V'].includes(r)), `L2 item ${s.item}`);
    if (level === 4) check(s.romans.every((r) => ['I', 'ii', 'IV', 'V', 'vi'].includes(r)) && s.romans.some((r) => r === 'ii' || r === 'vi'), `L4 item ${s.item}`);
    if (level === 5) check(s.minor ? s.romans.every((r) => MIN_SETS[5].includes(r)) : s.romans.some((r) => r === 'iii' || r === 'V7'), `L5 item ${s.item}`);
    if (level === 6) check(s.romans.every((r) => ['Imaj7', 'ii7', 'V7', 'vi7', 'V7/V', 'V7/ii', 'bII7'].includes(r)) && s.romans.filter((r) => ['V7/V', 'V7/ii', 'bII7'].includes(r)).length <= 1, `L6 item ${s.item}`);
    check(s.item === s.romans.join('-'), `item ${s.item} vs ${s.romans}`);
    // Voicing: bass + chord tones, from theory, in range.
    s.chords.forEach((c, i) => {
      const e = expectedChord(s.key, s.romans[i]);
      check(c[0] % 12 === e.bass, `L${level} ${s.romans[i]}: bass ${c[0]} key ${s.key}`);
      check(JSON.stringify(pcs(c.slice(1))) === JSON.stringify(e.pcs), `L${level} ${s.romans[i]}: tones ${c} key ${s.key}`);
      check(c.every((m) => m >= 43 && m < 69) && c[0] < 55 && c.slice(1).every((m) => m >= 57), `L${level}: out of range ${c}`);
    });
    // Pads: the right set, unique, every progression chord has a pad.
    const pads = await page.$$eval('.pg-pads button', (bs) => bs.map((b) => ({ r: b.dataset.roman, text: b.textContent })));
    check(pads.length === new Set(pads.map((p) => p.r)).size, `L${level}: duplicate pads`);
    check(s.romans.every((r) => pads.some((p) => p.r === r)), `L${level}: missing pad for ${s.item}`);
    check(pads.length === s.pads.length && pads.length >= 2, `L${level}: pads ${pads.length}`);
    if (level <= 2) check(pads.every((p) => p.text === ''), `L${level}: pads must have no text`);
    else check(pads.every((p) => p.text.length > 2), `L${level}: pads need names`);
    if (level === 3 && round === 0) {
      const I = pads.find((p) => p.r === 'I').text;
      check(/I/.test(I) && /(do|ré|mi|fa|sol|la|si)/i.test(I), `L3 French name: ${I}`);
    }
    const before = (await attempts()).length;
    const wrongs = pads.map((p) => p.r).filter((r) => r !== s.romans[0]);
    if (round === 0 || round === 1) {
      if (dir && round === 0) await page.screenshot({ path: `${dir}/ep-${level}-a.png` });
      await tapRoman(wrongs[0]);
      for (let i = 1; i < n; i++) await tapRoman(s.romans[i]);
      await page.waitForTimeout(900);
      let st = await page.evaluate(() => window.__test.state());
      check(st.marks && st.marks[0] === false && st.marks.slice(1).every(Boolean), `L${level}: marks ${JSON.stringify(st.marks)}`);
      check(await page.$eval('.pg-slot:nth-child(1)', (e) => e.classList.contains('pg-bad')), `L${level}: bad slot not marked`);
      if (dir && round === 0 && level === 3) await page.screenshot({ path: `${dir}/ep-${level}-b.png` });
      if (round === 1) { // a second wrong try is not logged again
        await tapRoman(wrongs[wrongs.length - 1]);
        await page.waitForTimeout(900);
      }
      // undo while marked clears the wrong ones only
      await page.click('.pg-undo');
      st = await page.evaluate(() => window.__test.state());
      check(st.built[0] === null && st.built.slice(1).every((r, i) => r === s.romans[i + 1]), `L${level}: undo after check ${JSON.stringify(st.built)}`);
      await tapRoman(s.romans[0]);
    } else {
      for (const r of s.romans) await tapRoman(r);
    }
    await page.waitForTimeout(1700);
    const mine = (await attempts()).slice(before);
    const wantOk = round > 1;
    check(mine.length === 1 && mine[0].ok === wantOk && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'listen.progressions', `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
// Undo plain, and next-level button after a clean streak.
await page.evaluate(() => localStorage.setItem('ml:settings:ear-progressions', JSON.stringify({ level: 2, tempo: 110 })));
await page.reload();
await page.click('.ml-start');
await page.waitForTimeout(300);
let s = await page.evaluate(() => window.__test.state());
await page.click(`.pg-pads button[data-roman="${s.romans[0]}"]`);
check((await page.evaluate(() => window.__test.state())).built[0] === s.romans[0], 'tap fills slot 0');
await page.click('.pg-undo');
check((await page.evaluate(() => window.__test.state())).built.every((r) => r === null), 'undo empties');
for (let i = 0; i < 6; i++) {
  s = await page.evaluate(() => window.__test.state());
  for (const r of s.romans) await page.click(`.pg-pads button[data-roman="${r}"]`);
  await page.waitForTimeout(1700);
}
check(await page.$eval('.pg-next', (e) => e.classList.contains('pg-show')), 'next-level button after a clean streak');
await page.click('.pg-next');
await page.waitForTimeout(400);
check((await page.evaluate(() => window.__test.state())).level === 3, 'next level click');
// English, dark.
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
await en.goto(base);
await en.evaluate(() => localStorage.setItem('ml:settings:ear-progressions', JSON.stringify({ level: 6, tempo: 110 })));
await en.reload();
await en.click('.ml-start');
await en.waitForTimeout(400);
if (dir) await en.screenshot({ path: `${dir}/ep-6-en-dark.png` });
check(!(await en.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'EN L6 overflow');
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
