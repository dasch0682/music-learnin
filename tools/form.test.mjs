// Plays every level of Phrases and form: a wrong answer, then right ones. Recomputes forms and phrase relations from the notes.
// Usage: PORT=5405 node tools/form.test.mjs [screenshot-dir]
import { chromium } from 'playwright-core';
const base = `http://localhost:${process.env.PORT || 5405}/form/`;
const dir = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'form').sort((x, y) => x.t - y.t)); }; }));
const LEVELS = {
  1: ['same', 'different'], 2: ['question', 'answer'], 3: ['AAB', 'ABA', 'AABA', 'ABAB'], 4: ["AA'B", "ABA'", "AA'BA", "ABAA'", "AA'BA'"],
  5: ['binary', 'ternary', 'rondo', 'variations'], 6: ['bars-4', 'bars-6', 'bars-8', 'modulation'],
};
const J = JSON.stringify;
const notesOf = (p) => J(p.notes.map((n) => [n.m, n.d]));
const rhythmOf = (p) => J(p.notes.map((n) => n.d));
const beats = (p) => p.notes.reduce((a, n) => a + n.d, 0);
/** Letters by first appearance, from the notes only (identical phrases share a letter). */
function labels(phrases) {
  const keys = [];
  return phrases.map((p) => { const k = notesOf(p); let i = keys.indexOf(k); if (i < 0) { keys.push(k); i = keys.length - 1; } return 'ABCDE'[i]; }).join('');
}
const diff = (a, b) => a.notes.filter((n, i) => n.m !== b.notes[i].m).length;
const pc = (m, root) => (((m - root) % 12) + 12) % 12;

function verify(level, s) {
  const tag = `L${level} ${s.item}`, ph = s.phrases;
  for (const p of ph) {
    check(p.notes.every((n) => n.m >= 50 && n.m <= 90) && p.bass.every((b) => b >= 36 && b < 48), `${tag}: range`);
    check(beats(p) === p.bars * 4, `${tag}: ${beats(p)} beats for ${p.bars} bars`);
    check(p.bass.length === p.bars, `${tag}: bass`);
  }
  if (level === 1) {
    check(ph.length === 2 && ph.every((p) => p.bars === 2), `${tag}: two 2-bar phrases`);
    if (s.item === 'same') check(notesOf(ph[0]) === notesOf(ph[1]), `${tag}: not identical`);
    else check(notesOf(ph[0]) !== notesOf(ph[1]) && rhythmOf(ph[0]) !== rhythmOf(ph[1]), `${tag}: too alike`);
  } else if (level === 2) {
    const p = ph[0], last = p.notes.at(-1).m, root = p.root, lb = p.bass.at(-1);
    if (s.item === 'answer') check(pc(last, root) === 0 && pc(lb, root) === 0, `${tag}: should end on the tonic`);
    else check([2, 7].includes(pc(last, root)) && pc(lb, root) === 7, `${tag}: should hang (${pc(last, root)}, bass ${pc(lb, root)})`);
  } else if (level === 3 || level === 4) {
    const codes = s.item.match(/[A-C]'?/g);
    check(s.seq.join('') === s.item && ph.length === codes.length, `${tag}: seq`);
    codes.forEach((c, i) => codes.forEach((d, j) => {
      if (j <= i) return;
      const same = c === d, eq = notesOf(ph[i]) === notesOf(ph[j]);
      if (same) check(eq, `${tag}: ${c} at ${i},${j} should be identical`);
      else if (c[0] !== d[0]) check(!eq && rhythmOf(ph[i]) !== rhythmOf(ph[j]), `${tag}: ${c},${d} too alike`);
      else { // A and A'
        const n = diff(ph[i], ph[j]);
        check(rhythmOf(ph[i]) === rhythmOf(ph[j]) && n >= 1 && n <= 2 && ph[i].notes.at(-1).m === ph[j].notes.at(-1).m && ph[i].notes[0].m === ph[j].notes[0].m, `${tag}: bad A' (${n} notes differ)`);
      }
    }));
    if (level === 3) check(labels(ph) === s.item, `${tag}: labels ${labels(ph)}`);
  } else if (level === 5) {
    const lab = labels(ph);
    const expect = { binary: ['AB', 'AABB'], ternary: ['ABA'], rondo: ['ABACA'], variations: ['ABC'] }[s.item];
    if (s.item === 'variations') {
      check(ph.length === 3 && ph.every((p) => rhythmOf(p) === rhythmOf(ph[0])) && lab === 'ABC' && diff(ph[0], ph[1]) <= 2 && diff(ph[0], ph[2]) >= 1, `${tag}: not a theme with variations`);
    } else check(expect.includes(lab), `${tag}: shape ${lab}`);
    if (s.item === 'rondo') check(ph.length === 5 && notesOf(ph[0]) === notesOf(ph[2]) && notesOf(ph[0]) === notesOf(ph[4]), `${tag}: refrain`);
  } else if (s.item.startsWith('bars-')) {
    const n = +s.item.slice(5);
    check(ph.length === 1 && ph[0].bars === n && beats(ph[0]) === 4 * n && s.answer === String(n), `${tag}: bars`);
  } else {
    const m = +s.answer;
    check(ph.length === 4 && m >= 1 && m <= 3 && s.modAt === m, `${tag}: m=${m}`);
    ph.forEach((p, i) => {
      check(pc(p.notes[0].m, ph[0].root) === (ph[0].notes[0].m - ph[0].root + (i >= m ? 7 : 0)) % 12, `${tag}: phrase ${i} key`);
      check(p.degs.join() === ph[0].degs.join() && p.root === ph[0].root + (i >= m ? 7 : 0), `${tag}: phrase ${i} root`);
      check(p.notes.at(-1).m % 12 === (p.root % 12), `${tag}: phrase ${i} should end on its tonic`);
    });
    check(ph[0].degs.includes(3) && ph[0].scaleId === 'major', `${tag}: needs the 4th degree so that the new key is audible`);
  }
}

await page.goto(base);
for (let level = 1; level <= 6; level++) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:form', JSON.stringify({ level: l, tempo: 200 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(300);
  const items = LEVELS[level], seen = new Set();
  const rounds = items.length + 2;
  for (let round = 0; round < rounds; round++) {
    const s = await page.evaluate(() => window.__test.state());
    seen.add(s.item);
    check(s.level === level, `L${level}: level ${s.level}`);
    verify(level, s);
    await page.evaluate((i) => window.__test.force(i), items[(round + 1) % items.length]);
    const before = (await attempts()).length;
    const sel = (id) => (level === 6 && s.kind === 'mod' ? `.fm-row button[data-id="${id}"]` : level === 3 || level === 4 ? `.fm-pal button[data-id="${id}"]` : `.fm-choices button[data-id="${id}"]`);
    if (round === 0) {
      if (dir) await page.screenshot({ path: `${dir}/fm-${level}.png` });
      const expected = s.kind === 'fill' ? s.seq[1] : s.answer;
      const wrong = s.ids.find((id) => id !== expected);
      await page.click(sel(wrong));
      await page.waitForTimeout(150);
    }
    if (s.kind === 'fill') for (const c of s.seq.slice(1)) await page.click(sel(c));
    else await page.click(sel(s.answer));
    await page.waitForTimeout(level === 5 ? 2300 : 1400);
    const mine = (await attempts()).slice(before);
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === 'listen.form', `L${level} round ${round}: ${J(mine.map((a) => [a.ok, a.item]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  console.log(`L${level}`, [...seen].join(' '));
}
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
