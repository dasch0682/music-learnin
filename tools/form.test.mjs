// Phrases and form, every level: forms and phrase relations recomputed from the notes (ranges, beats, ending, bass, modulation); one wrong, a second
// wrong (answer revealed), then right answers (log: skill from taxonomy), error feedback, next level after 8 clean answers, settings persistence, smoke.
// Plays every level of Phrases and form: a wrong answer, then right ones. Recomputes forms and phrase relations from the notes.
// Usage: PORT=5405 node tools/form.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, nextQuestion, isShown } from './lib/shared-a.mjs';
const SLUG = 'form';
const base = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker();
const browser = await launch();
await smoke({ browser, url: base, check: C.check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const check = C.check;
const attempts = () => readAttempts(page, SLUG);
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
const open = async (level, tempo = 200) => {
  await page.evaluate(([l, t]) => localStorage.setItem('ml:settings:form', JSON.stringify({ level: l, tempo: t })), [level, tempo]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state()?.item);
};
const selOf = (level, s) => (id) => (s.kind === 'mod' ? `.fm-row button[data-id="${id}"]` : s.kind === 'fill' ? `.fm-pal button[data-id="${id}"]` : `.fm-choices button[data-id="${id}"]`);
const state = () => page.evaluate(() => window.__test.state());
for (const level of levels(6)) {
  await open(level);
  const items = LEVELS[level], seen = [];
  const nRounds = rounds(items.length + 3, 3);
  for (let round = 0; round < nRounds; round++) {
    const s = await state();
    const tag = `L${level} r${round} ${s.item}`;
    seen.push(s.item);
    check(s.level === level && items.includes(s.item), `${tag}: level/item`);
    verify(level, s);
    await page.evaluate((i) => window.__test.force(i), items[(round + 1) % items.length]);
    const before = (await attempts()).length;
    const fb0 = (await fbLog(page)).length;
    const sel = selOf(level, s);
    const fill = s.kind === 'fill';
    const expected = fill ? s.seq[s.pos] : s.answer;
    const wrongIds = s.ids.filter((id) => id !== expected);
    const nWrong = round === 0 ? 1 : round === 1 && (fill || wrongIds.length > 1) ? 2 : 0;
    if (round === 0 && dir) await page.screenshot({ path: `${dir}/fm-${level}.png` });
    for (let i = 0; i < nWrong; i++) {
      const w = wrongIds[i % wrongIds.length];
      await page.click(sel(w));
      check((await fbSince(page, fb0 + i, 1))[0] === 'bad', `${tag}: wrong answer ${i + 1} gave no error feedback`);
      if (!fill) check(await page.$eval(sel(w), (b) => b.classList.contains('ml-wrong') && b.disabled), `${tag}: wrong button not marked`);
      check(!(await page.$('.ml-reveal')) || i === 1, `${tag}: answer revealed too early`);
    }
    if (nWrong === 2) {
      await page.waitForSelector(`${sel(expected)}.ml-reveal`, { timeout: 3000 }).catch(() => {});
      check(!!(await page.$(`${sel(expected)}.ml-reveal`)), `${tag}: right answer not revealed after the second miss`);
      check((await page.$$('.ml-reveal')).length === 1, `${tag}: more than one revealed element`);
    }
    if (fill) for (const c of s.seq.slice(s.pos)) await page.click(sel(c));
    else await page.click(sel(s.answer));
    const mine = await newAttempts(page, SLUG, before, 1);
    check(mine.length === 1 && mine[0].ok === (nWrong === 0) && mine[0].game === SLUG && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skillOf(SLUG, level), `${tag}: ${J(mine.map((a) => [a.ok, a.item, a.skill]))}`);
    const k = (await fbLog(page)).slice(fb0);
    check(k.filter((x) => x === 'bad').length === nWrong, `${tag}: feedback ${k}`);
    await page.waitForFunction((it) => { const t = window.__test.state(); return t && (t.item !== it.item || JSON.stringify(t.phrases) !== it.ph); }, { item: s.item, ph: J(s.phrases) }, { timeout: 12000 }).catch(() => {});
  }
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...new Set(seen)].join(' '));
}
// Natural questions at level 4 (5 items: the app avoids the previous one): never the same form twice in a row.
await open(4);
{
  const order = [];
  for (let r = 0; r < rounds(10, 5); r++) {
    const s = await state();
    order.push(s.item);
    for (const c of s.seq.slice(s.pos)) await page.click(`.fm-pal button[data-id="${c}"]`);
    await page.waitForFunction((it) => { const t = window.__test.state(); return t && JSON.stringify(t.phrases) !== it; }, J(s.phrases), { timeout: 12000 }).catch(() => {});
  }
  check(!order.some((x, i) => i && x === order[i - 1]), `L4: same form twice in a row ${order}`);
}
// A clean streak of 8 offers the next level (level 1); on the last level it celebrates and offers nothing.
for (const level of FAST ? [1, 6] : [1, 2, 6]) {
  await open(level);
  for (let r = 0; r < 8; r++) {
    const s = await state();
    if (level === 6) await page.evaluate(() => window.__test.force('bars-4'));
    if (s.kind === 'fill') for (const c of s.seq.slice(s.pos)) await page.click(`.fm-pal button[data-id="${c}"]`);
    else await page.click(selOf(level, s)(s.answer));
    await page.waitForFunction((it) => { const t = window.__test.state(); return t && JSON.stringify(t.phrases) !== it; }, J(s.phrases), { timeout: 12000 }).catch(() => {});
  }
  if (level < 6) {
    check(await isShown(page, '.fm-next'), `L${level}: no next-level button after 8 clean answers`);
    if (level === 1) { await page.click('.fm-next'); await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 8000 }).catch(() => {}); check((await state()).level === 2, 'L1: next-level button did not change the level'); }
  } else {
    check(!(await isShown(page, '.fm-next')), 'L6: next-level offered on the last level');
    check((await fbLog(page)).includes('level'), 'L6: no celebration after 8 clean answers');
  }
}
// settings persist: level and tempo
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 5], [1, 'tempo', 120]], check, applied: async (p) => { const x = await p.evaluate(() => window.__test.state()); return x.level === 5 && ['binary', 'ternary', 'rondo', 'variations'].includes(x.item) ? '' : `level ${x.level} item ${x.item}`; } });
check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
