// Plays every level of Harmony lab: a wrong answer, then the right one. Valid answers are recomputed from theory
// (pitch classes of the chords), never read back from the app's own tables.
// Usage: npx vite --port 5308 --strictPort &   then   PORT=5308 node tools/harmony-lab.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels, combos } from './lib/harness.mjs';
const base = `http://localhost:${process.env.PORT || 5308}/harmony-lab/`;
const dir = process.argv[2];
const browser = await launch({ speed: 3 }); // marks and clears are checked a few hundred ms apart
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('FAIL', msg); } };
const attempts = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('music-learnin'); r.onsuccess = () => { const q = r.result.transaction('attempts').objectStore('attempts').getAll(); q.onsuccess = () => res(q.result.filter((a) => a.game === 'harmony-lab').sort((x, y) => x.t - y.t)); }; }));
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

await page.goto(base);
for (const level of levels(8)) {
  await page.evaluate((l) => localStorage.setItem('ml:settings:harmony-lab', JSON.stringify({ level: l, tempo: 110 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForTimeout(400);
  const seen = new Set();
  const nRounds = rounds(level >= 7 ? 9 : level === 5 ? 8 : 6, 2);
  for (let round = 0; round < nRounds; round++) {
    const s = await st();
    seen.add(s.item.split(':')[0]);
    check(s.level === level, `L${level}: level ${s.level}`);
    const before = (await attempts()).length;
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
          await page.waitForTimeout(700);
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
        await page.waitForTimeout(200);
        const after = await st();
        check(after.slots.some((x) => x.status === 'wrong'), `L${level}: wrong slot marked`);
        await page.waitForTimeout(900);
        const cleared = await st();
        check(cleared.slots.filter((x) => !x.given && !x.placed).length === 1 && cleared.qid === s.qid, `L${level}: only the wrong slot is cleared`);
        const [i, ids] = exp[exp.length - 1];
        await clickBlock(s, ids[0]);
      } else {
        check(await page.locator('.hl-ok').isDisabled(), `L${level}: confirm disabled while a slot is empty`);
        for (const [i, ids] of exp) await clickBlock(s, pick(ids));
      }
      await page.click('.hl-ok');
    }
    const nxt = await waitNew(s.qid);
    check(!!nxt, `L${level} round ${round}: no next question`);
    const mine = (await attempts()).slice(before);
    const skill = level <= 5 ? 'theory.harmony' : 'theory.jazz';
    check(mine.length === 1 && mine[0].ok === (round !== 0) && mine[0].level === level && mine[0].item === s.item && mine[0].skill === skill, `L${level} round ${round}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.level, a.skill]))}`);
  }
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `L${level}: overflow`);
  check(await page.evaluate(() => [...document.querySelectorAll('.hl-row, .hl-tray, .hl-slot, .hl-block')].every((e) => { const r = e.getBoundingClientRect(); return r.left >= -0.5 && r.right <= 390.5; })), `L${level}: block outside the screen`);
  console.log(`L${level}`, [...seen].join(' '));
}

// English, dark: the words of level 2.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(String(e)));
p2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await p2.goto(base);
await p2.evaluate(() => localStorage.setItem('ml:settings:harmony-lab', JSON.stringify({ level: 2, tempo: 110 })));
await p2.reload();
await p2.click('.ml-start');
await p2.waitForTimeout(400);
const words = await p2.locator('.hl-tray .hl-txt').allTextContents();
check(same(words, ['tonic', 'subdominant', 'dominant']), `EN words ${words}`);
if (dir) await p2.screenshot({ path: `${dir}/hl-en-dark.png` });
await ctx2.close();

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(failed ? `${failed} failure(s)` : 'all good');
process.exit(failed ? 1 : 0);
