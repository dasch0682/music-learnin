// Harmony lab, every level: valid answers recomputed from theory (pitch classes), sounds of the blocks, wrong then second wrong then right answers
// (marks, clears, log: skill from taxonomy, error feedback), next level after 8 clean questions, no repeat in the 7-item pool, persistence, smoke.
// Plays every level of Harmony lab: a wrong answer, then the right one. Valid answers are recomputed from theory
// (pitch classes of the chords), never read back from the app's own tables.
// Usage: npx vite --port 5308 --strictPort &   then   PORT=5308 node tools/harmony-lab.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf as taxSkill, makeChecker, overflows, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, isShown } from './lib/shared-a.mjs';
const SLUG = 'harmony-lab';
const base = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker();
const browser = await launch({ speed: 3 }); // marks and clears are checked a few hundred ms apart
await smoke({ browser, url: base, check: C.check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const check = C.check;
const attempts = () => readAttempts(page, SLUG);
const st = () => page.evaluate(() => window.__test.state());

// ---------- theory ----------
const mod = (n, m) => ((n % m) + m) % m;
const STEPS = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10] };
const pcsOf = (root, type) => STEPS[type].map((s) => mod(root + s, 12)).sort((a, b) => a - b).join();
const setOf = (a) => [...new Set(a.map((m) => mod(m, 12)))].sort((a, b) => a - b).join();
const off = (c, key) => mod(c.rootPc - key.pc, 12); // semitones above the tonic
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MODE = { maj7: [0, 2, 4, 5, 7, 9, 11], min7: [0, 2, 3, 5, 7, 9, 10], dom7: [0, 2, 4, 5, 7, 9, 10] };
const FAMILY_OFFSETS = { rest: [0, 9, 4], move: [5, 2], tension: [7] };
const familyOf = (offset) => Object.keys(FAMILY_OFFSETS).find((f) => FAMILY_OFFSETS[f].includes(offset));
function blockOk(b) { return b.pcs.join() === pcsOf(b.rootPc, b.type) || [...b.pcs].sort((a, b2) => a - b2).join() === pcsOf(b.rootPc, b.type); }

/** Ids of the blocks that are right for each empty slot, from theory only. Returns [slotIndex, ids[]][]. */
function expected(s) {
  const key = s.key;
  const open = s.slots.map((x, i) => [x, i]).filter(([x]) => !x.given);
  const idsWhere = (fn) => s.blocks.filter(fn).map((b) => b.id);
  const out = [];
  s.blocks.forEach((b) => { if (b.kind === 'chord') check(blockOk(b), `block ${b.id} pcs ${b.pcs} vs ${b.rootPc} ${b.type}`); });
  const L = s.level;
  if (L === 1 || L === 2) {
    const [x, i] = open[0];
    check(open.length === 1 && i === 3 && s.blocks.length === 3, `L${L} shape of the phrase`);
    const roots = s.blocks.map((b) => off(b, key)).sort((a, b) => a - b);
    check(same(roots, [0, 5, 7]), `L${L}: blocks are I IV V ${roots}`);
    const dom = s.slots[2].given;
    const settled = s.goal === 'settled';
    // A phrase that is to settle has already reached the dominant; one that hangs has not.
    check((off(dom, key) === 7) === settled, `L${L}: penultimate chord ${off(dom, key)} for goal ${s.goal}`);
    const wantRoot = settled ? 0 : 7;
    out.push([i, idsWhere((b) => off(b, key) === wantRoot)]);
    if (L === 1) check(s.blocks.find((b) => off(b, key) === 7).type === 'dom7', 'L1: the tension block is a seventh chord');
  } else if (L === 3) {
    check(s.melody.length === 4 && s.melody.every((m) => MAJOR.includes(mod(m - key.pc, 12))), 'L3: melody is diatonic');
    check(s.slots[0].given && off(s.slots[0].given, key) === 0 && s.slots[0].given.pcs.includes(mod(s.melody[0], 12)), 'L3: starts on I with the first note inside');
    check(same(s.blocks.map((b) => off(b, key)).map(String), ['0', '5', '7']) && s.blocks.every((b) => b.type === 'maj'), 'L3: blocks I IV V');
    for (let i = 1; i < 4; i++) {
      const note = mod(s.melody[i], 12);
      check(s.slots[i].note === s.melody[i], 'L3: slot note');
      out.push([i, idsWhere((b) => b.pcs.includes(note) && (i < 3 || off(b, key) === (s.goal === 'settled' ? 0 : 7)))]);
    }
    for (const [i, ids] of out) check(ids.length >= 1, `L3: slot ${i} has an answer`);
  } else if (L === 4) {
    const [x, i] = open[0];
    const seqFam = s.slots.map((sl, k) => (k === i ? s.fam : familyOf(off(sl.given, key))));
    check(s.fam && seqFam.every((f, k) => k === 0 || !(seqFam[k - 1] === 'tension' && f === 'move')), `L4: legal function order ${seqFam}`);
    check(same(s.blocks.map((b) => off(b, key)).map(String), ['0', '2', '4', '5', '7', '9']), 'L4: six degrees');
    out.push([i, idsWhere((b) => FAMILY_OFFSETS[s.fam].includes(off(b, key)))]);
  } else if (L === 5 && s.item === 'minor') {
    const [x, i] = open[0];
    const prev = s.slots[i - 1]?.given, nextc = s.slots[i + 1]?.given;
    const isDom = (c) => c && off(c, key) === 7 && c.type === 'dom7';
    const isTonic = (c) => c && off(c, key) === 0 && c.type === 'min';
    let ids;
    if (isTonic(nextc) && prev && off(prev, key) === 5) ids = idsWhere((b) => off(b, key) === 7 && b.type === 'dom7'); // predominant, then the dominant
    else if (isDom(nextc)) ids = idsWhere((b) => ((off(b, key) === 5 && b.type === 'min') || (off(b, key) === 8 && b.type === 'maj')) && !(prev && off(prev, key) === off(b, key)));
    check(!!ids, `L5: unknown minor phrase`);
    check(s.blocks.every((b) => [[0, 'min'], [5, 'min'], [8, 'maj'], [7, 'dom7']].some(([o, t]) => off(b, key) === o && b.type === t)), 'L5: minor blocks');
    out.push([i, ids || []]);
  } else if (L === 5) {
    const [x, i] = open[0];
    const nextc = s.slots[i + 1].given;
    // A secondary dominant is the dominant seventh of the next chord: its root a fifth above.
    out.push([i, idsWhere((b) => b.type === 'dom7' && b.rootPc === mod(nextc.rootPc + 7, 12))]);
  } else if (L === 6) {
    const want = [[2, 'min7'], [7, 'dom7'], [0, 'maj7']];
    check(s.blocks.length === 6 && open.length === 3, 'L6: six blocks, three slots');
    want.forEach(([o, t], i) => out.push([i, idsWhere((b) => off(b, key) === o && b.type === t)]));
  } else if (L === 7 && s.item !== 'scale') {
    const [x, i] = open[0];
    if (s.item === 'tritone') {
      check(off(s.slots[0].given, key) === 2 && off(s.slots[2].given, key) === 0, 'L7: ii _ I');
      out.push([i, idsWhere((b) => b.type === 'dom7' && off(b, key) === mod(7 + 6, 12))]); // a tritone away from V7
    } else {
      check(off(s.slots[0].given, key) === 5 && s.slots[0].given.type === 'min7', 'L7: iv7 _ I');
      out.push([i, idsWhere((b) => b.type === 'dom7' && off(b, key) === 10)]); // the dominant a whole tone below the tonic
    }
  } else if (L === 7) {
    const c = s.slots[0].given;
    const third = mod(c.rootPc + (c.type === 'min7' ? 3 : 4), 12);
    const tones = c.pcs;
    const avail = MODE[c.type].map((o) => mod(c.rootPc + o, 12)).filter((p) => tones.includes(p) || !tones.includes(mod(p - 1, 12)));
    check(s.blocks.length === 4 && new Set(s.blocks.map((b) => [...b.pcs].sort((a, b2) => a - b2).join())).size === 4, 'L7: four different scales');
    s.blocks.forEach((b) => {
      check(b.pcs.length === 5, 'L7: five notes');
    });
    out.push([1, idsWhere((b) => b.pcs.every((p) => avail.includes(p)) && b.pcs.includes(third))]);
    check(out[0][1].length >= 1, 'L7: a scale fits');
  } else if (L === 8 && s.mode === 'place') {
    const TURN = [[[0, 'maj7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']], [[4, 'min7'], [9, 'min7'], [2, 'min7'], [7, 'dom7']], [[0, 'maj7'], [9, 'dom7'], [2, 'min7'], [7, 'dom7']], [[0, 'maj7'], [9, 'min7'], [2, 'min7'], [1, 'dom7']]];
    const [x, i] = open[0];
    const fits = TURN.filter((t) => t.every(([o, ty], k) => k === i || (off(s.slots[k].given, key) === o && s.slots[k].given.type === ty)));
    check(fits.length >= 1, 'L8: the given chords belong to a turnaround');
    out.push([i, idsWhere((b) => fits.some((t) => off(b, key) === t[i][0] && b.type === t[i][1]))]);
  }
  return out;
}

const tray = (id) => `.hl-tray [data-id="${id}"]`;
const waitNew = async (qid) => { for (let k = 0; k < 120; k++) { const s = await st(); if (s && s.qid !== qid) return s; await page.waitForTimeout(100); } return null; };
async function clickBlock(s, id) {
  await page.click(tray(id));
  await page.waitForTimeout(30);
  const now = await st();
  const b = s.blocks.find((x) => x.id === id);
  const last = now.last;
  if (b.kind === 'chord') check(last && setOf(last.chord) === [...b.pcs].sort((a, b2) => a - b2).join() && mod(last.chord[0], 12) === b.rootPc, `sound of ${id}: ${JSON.stringify(last)}`);
  else check(last && last.notes.length === 5 && setOf(last.notes) === [...b.pcs].sort((a, b2) => a - b2).join() && mod(last.notes[0], 12) === b.rootPc, `scale sound of ${id}`);
}

/** Answers a question correctly (no mistake). */
async function solve(s) {
  if (s.mode === 'label') {
    for (let k = 0; k < s.slots.length; k++) {
      const c = s.slots[k].given;
      await page.click(tray(c.type === 'dom7' ? 'tension' : familyOf(off(c, s.key))));
      await page.waitForTimeout(60);
    }
    return;
  }
  const exp = expected(s);
  for (const [, ids] of exp) await page.click(tray(ids[0]));
  await page.click('.hl-ok');
}
const open = async (level, tempo = 110) => {
  await page.evaluate(([l, t]) => localStorage.setItem('ml:settings:harmony-lab', JSON.stringify({ level: l, tempo: t })), [level, tempo]);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state());
};
const nextBtnShown = () => isShown(page, '.hl-next');
await page.goto(base);
for (const level of levels(8, [1, 8])) {
  await open(level);
  const seen = new Set();
  const nRounds = rounds(level >= 7 ? 9 : level === 5 ? 8 : 6, 3);
  for (let round = 0; round < nRounds; round++) {
    const s = await st();
    seen.add(s.item.split(':')[0]);
    check(s.level === level, `L${level}: level ${s.level}`);
    const before = (await attempts()).length;
    const fb0 = (await fbLog(page)).length;
    if (s.mode === 'label') {
      const key = s.key;
      for (let k = 0; k < s.slots.length; k++) {
        const c = s.slots[k].given;
        const o = off(c, key);
        const fam = c.type === 'dom7' ? 'tension' : familyOf(o);
        check(!!fam, `L8 label: unknown family`);
        const cur = await st();
        check(cur.step === k, `L8 label: step ${cur.step} vs ${k}`);
        if (round === 0 && k === 1) {
          const wrong = ['rest', 'move', 'tension'].find((f) => f !== fam);
          await page.click(tray(wrong));
          await page.waitForTimeout(100);
          check((await st()).step === k, 'L8: a wrong label does not advance');
          check((await fbSince(page, fb0, 1))[0] === 'bad', 'L8: wrong label gave no error feedback');
          await page.waitForFunction(() => !window.__test.state().slots.some((x) => x.status === 'wrong'), null, { timeout: 5000 }).catch(() => {});
          // second miss: feedback again, logged once
          check((await page.$$('.hl-block.ml-reveal')).length === 0, 'L8: label revealed after the first miss');
          const wrong2 = ['rest', 'move', 'tension'].filter((f) => f !== fam && f !== wrong)[0] || wrong;
          await page.click(tray(wrong2));
          check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', 'L8: second wrong label gave no error feedback');
          check((await attempts()).length === before + 1, 'L8: second wrong label logged again');
          const rl = await page.$$eval('.hl-block.ml-reveal', (b) => b.map((x) => x.dataset.id));
          check(rl.length === 1 && rl[0] === fam, `L8: reveal after the second miss ${rl} vs ${fam}`);
          await page.waitForFunction(() => !window.__test.state().slots.some((x) => x.status === 'wrong'), null, { timeout: 5000 }).catch(() => {});
        }
        await page.click(tray(fam));
        await page.waitForTimeout(60);
      }
    } else {
      const exp = expected(s);
      for (const [i, ids] of exp) check(same(ids, s.slots[i].valid), `L${level} ${s.item} slot ${i}: app ${JSON.stringify(s.slots[i].valid)} theory ${JSON.stringify(ids)}`);
      check(exp.length >= 1 && exp.every(([, ids]) => ids.length >= 1 && ids.length < s.blocks.length), `L${level}: valid sets ${JSON.stringify(exp)}`);
      if (dir && round === 0 && [3, 7].includes(level)) await page.screenshot({ path: `${dir}/hl-${level}.png` });
      if (round === 0) {
        // Wrong first: one wrong block in the last empty slot, the others right.
        for (let k = 0; k < exp.length; k++) {
          const [i, ids] = exp[k];
          const wrong = k === exp.length - 1 ? s.blocks.find((b) => !ids.includes(b.id)).id : ids[0];
          await clickBlock(s, wrong);
        }
        check(!(await page.locator('.hl-ok').isDisabled()), `L${level}: confirm enabled when all slots are filled`);
        await page.click('.hl-ok');
        const after = await st();
        check(after.slots.some((x) => x.status === 'wrong'), `L${level}: wrong slot marked`);
        check((await fbSince(page, fb0, 1))[0] === 'bad', `L${level}: wrong answer gave no error feedback`);
        await page.waitForFunction(() => window.__test.state().slots.filter((x) => !x.given && !x.placed).length === 1, null, { timeout: 8000 }).catch(() => {});
        const cleared = await st();
        check(cleared.slots.filter((x) => !x.given && !x.placed).length === 1 && cleared.qid === s.qid, `L${level}: only the wrong slot is cleared`);
        const [i, ids] = exp[exp.length - 1];
        check((await page.$$('.hl-block.ml-reveal')).length === 0, `L${level}: right block revealed after the first miss`);
        // second miss on the same question: feedback again, logged once.
        await clickBlock(s, s.blocks.find((b) => !ids.includes(b.id)).id);
        await page.click('.hl-ok');
        check((await fbSince(page, fb0 + 1, 1))[0] === 'bad', `L${level}: second wrong answer gave no error feedback`);
        check((await attempts()).length === before + 1, `L${level}: second miss logged again`);
        const rb = await page.$$eval('.hl-block.ml-reveal', (b) => b.map((x) => x.dataset.id).sort());
        check(same(rb, [...ids].sort()), `L${level}: reveal after the second miss ${rb} vs ${ids}`);
        await page.waitForFunction(() => window.__test.state().slots.filter((x) => !x.given && !x.placed).length === 1, null, { timeout: 8000 }).catch(() => {});
        await clickBlock(s, ids[0]);
      } else {
        check(await page.locator('.hl-ok').isDisabled(), `L${level}: confirm disabled while a slot is empty`);
        for (const [i, ids] of exp) await clickBlock(s, pick(ids));
      }
      await page.click('.hl-ok');
    }
    const nxt = await waitNew(s.qid);
    check(!!nxt, `L${level} round ${round}: no next question`);
    const mine = await newAttempts(page, SLUG, before, 1);
    const skill = taxSkill(SLUG, level);
    check(mine.length === 1 && mine[0].game === SLUG && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skill, `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  check(!(await overflows(page)), `L${level}: overflow`);
  check(await page.evaluate(() => [...document.querySelectorAll('.hl-row, .hl-tray, .hl-slot, .hl-block')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= 390.5; })), `L${level}: block outside the screen`);
  console.log(`L${level}`, [...seen].join(' '));
}

// Level 6 has 7 items: natural questions never repeat the previous one. Level 1 and the last level: a clean streak of 8.
await open(6);
{
  const order = [];
  for (let r = 0; r < rounds(10, 3); r++) {
    const x = await st();
    order.push(x.item);
    await solve(x);
    await waitNew(x.qid);
  }
  check(!order.some((x, i) => i && x === order[i - 1]), `L6: same question twice in a row ${order}`);
}
// fast: level 1 only (the last level's "nothing offered, celebration" check is full-only: 8 more solved questions)
for (const level of FAST ? [1] : [1, 2, 3, 4, 5, 6, 7, 8]) {
  await open(level);
  for (let r = 0; r < 8; r++) {
    const x = await st();
    await solve(x);
    await waitNew(x.qid);
  }
  if (level < 8) {
    check(await nextBtnShown(), `L${level}: no next-level button after 8 clean questions`);
    if (level === 1) { await page.click('.hl-next'); await page.waitForFunction(() => window.__test.state().level === 2, null, { timeout: 8000 }).catch(() => {}); check((await st()).level === 2, 'L1: next-level button did not change the level'); }
  } else {
    check(!(await nextBtnShown()), 'L8: next-level offered on the last level');
    check((await fbLog(page)).includes('level'), 'L8: no celebration after 8 clean questions');
  }
}
// settings persist: level and tempo
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 6], [1, 'tempo', 90]], check, applied: async (p) => { const x = await p.evaluate(() => window.__test.state()); return x.level === 6 && x.item.startsWith('iiVI:') ? '' : `level ${x.level} item ${x.item}`; } });
// English, dark: the words of level 2.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
const p2 = await ctx2.newPage();
C.watch(p2);
await p2.goto(base);
await p2.evaluate(() => localStorage.setItem('ml:settings:harmony-lab', JSON.stringify({ level: 2, tempo: 110 })));
await p2.reload();
await p2.click('.ml-start');
await p2.waitForFunction(() => window.__test?.state());
const words = await p2.locator('.hl-tray .hl-txt').allTextContents();
check(same(words, ['tonic', 'subdominant', 'dominant']), `EN words ${words}`);
if (dir) await p2.screenshot({ path: `${dir}/hl-en-dark.png` });
await ctx2.close();

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
