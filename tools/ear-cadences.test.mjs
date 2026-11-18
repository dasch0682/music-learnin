// Cadences by ear, every level: the chords match the roman numerals and the cadence type (perfect, half, plagal, deceptive, jazz...),
// register, buttons per level; one wrong then right answers (log), reveal after the 2nd miss, next level after a clean streak,
// settings persistence, smoke (themes, languages, overflow).
// Usage: PORT=5220 [FAST=1] node tools/ear-cadences.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, answerChoice, levelUpCheck, pcs } from './lib/shared-a.mjs';
const SLUG = 'ear-cadences';
const url = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker(), { check, errors } = C;
const browser = await launch();
await smoke({ browser, url, check });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
const FOUR = ['parfaite', 'demi', 'plagale', 'rompue'];
const TYPES = { 1: ['parfaite', 'demi'], 2: ['parfaite', 'demi'], 3: ['parfaite', 'demi', 'plagale'], 4: FOUR, 5: FOUR, 6: ['iiVI', 'tritone', 'backdoor', 'picarde', 'andalouse'] };
// theory: [semitones above the tonic, chord pitch classes above its root]
const TRI = { maj: [0, 4, 7], min: [0, 3, 7] };
const ROMAN = { I: [0, 'maj'], ii: [2, 'min'], IV: [5, 'maj'], V: [7, 'maj'], V7: [7, [0, 4, 7, 10]], vi: [9, 'min'], i: [0, 'min'], iv: [5, 'min'], bVI: [8, 'maj'], bVII: [10, 'maj'],
  ii7: [2, [0, 3, 7, 10]], Imaj7: [0, [0, 4, 7, 11]], bII7: [1, [0, 4, 7, 10]], iv7: [5, [0, 3, 7, 10]], bVII7: [10, [0, 4, 7, 10]] };
const steps = (r) => (Array.isArray(ROMAN[r][1]) ? ROMAN[r][1] : TRI[ROMAN[r][1]]);
const R = (t) => `.cd-choices button[data-type="${t}"]`;
const checkCadence = (s, tag) => {
  const r = s.romans, n = r.length, a = r[n - 2], b = r[n - 1];
  const t = s.type;
  if (t === 'parfaite') check(a.startsWith('V') && /^(I|i)$/.test(b), `${tag}: perfect cadence is ${r}`);
  else if (t === 'demi') check(b === 'V', `${tag}: half cadence ends on ${b}`);
  else if (t === 'plagale') check(/^(IV|iv)$/.test(a) && /^(I|i)$/.test(b) || (a === 'IV' && b === 'I'), `${tag}: plagal cadence is ${r}`);
  else if (t === 'rompue') check(a === 'V7' && /^(vi|bVI)$/.test(b), `${tag}: deceptive cadence is ${r}`);
  else if (t === 'iiVI') check(r.join() === 'ii7,V7,Imaj7', `${tag}: ii-V-I is ${r}`);
  else if (t === 'tritone') check(r.join() === 'ii7,bII7,Imaj7', `${tag}: tritone is ${r}`);
  else if (t === 'backdoor') check(r.join() === 'iv7,bVII7,Imaj7', `${tag}: backdoor is ${r}`);
  else if (t === 'picarde') check(r.join() === 'i,iv,V7,I', `${tag}: picardy is ${r}`);
  else if (t === 'andalouse') check(r.join() === 'i,bVII,bVI,V', `${tag}: andalusian is ${r}`);
};
const checkChords = (s, tag) => {
  check(s.chords.length === s.romans.length, `${tag}: ${s.chords.length} chords for ${s.romans}`);
  // the tonic comes from the first chord (bass pc minus its roman offset)
  const tonic = (((s.chords[0][0] - ROMAN[s.romans[0]][0]) % 12) + 12) % 12;
  s.chords.forEach((c, i) => {
    const [off] = ROMAN[s.romans[i]];
    const root = (tonic + off) % 12;
    const exp = pcs(steps(s.romans[i]).map((x) => root + x)).join();
    check(c.length >= 4 && c.every((m) => m >= 43 && m < 69), `${tag}: chord ${i} out of range ${c}`);
    check(c[0] % 12 === root, `${tag}: chord ${i} (${s.romans[i]}) bass ${c[0] % 12} != root ${root}`);
    check(pcs(c).join() === exp, `${tag}: chord ${i} (${s.romans[i]}) notes ${c} are not ${exp}`);
  });
  // the last chord is the tonic of the key for closed cadences
  if (['parfaite', 'plagale', 'iiVI', 'tritone', 'backdoor', 'picarde'].includes(s.type)) check(s.chords[s.chords.length - 1][0] % 12 === tonic, `${tag}: last chord is not the tonic`);
  // minor items carry ':m' and begin on a minor tonic chord
  const minor = s.item.endsWith(':m');
  if (s.level === 5) check(minor === s.romans[0].startsWith('i') && s.item.split(':')[0] === s.type, `${tag}: item ${s.item} vs ${s.romans}`);
  else if (s.level < 6) check(!minor && s.item === s.type, `${tag}: item ${s.item}`);
};
const open = async (level) => {
  await page.evaluate((l) => localStorage.setItem('ml:settings:ear-cadences', JSON.stringify({ level: l, tempo: 110 })), level);
  await page.reload();
  await page.click('.ml-start');
  await page.waitForFunction(() => window.__test?.state()?.type);
};
await page.goto(url);
for (const level of levels(6)) {
  await open(level);
  let s = await page.evaluate(() => window.__test.state());
  const seen = [];
  for (let round = 0; round < rounds(24, 4); round++) {
    const tag = `L${level} r${round} ${s.item}`;
    seen.push(s.item);
    check(s.level === level && TYPES[level].includes(s.type), `${tag}: type ${s.type}`);
    checkCadence(s, tag);
    checkChords(s, tag);
    const btn = await page.$$eval('.cd-choices button', (bs) => bs.map((b) => b.dataset.type));
    check(JSON.stringify(btn) === JSON.stringify(TYPES[level]), `${tag}: buttons ${btn}`);
    if (round === 0 && dir && level % 2) await page.screenshot({ path: `${dir}/cd-${level}.png` });
    const wrongs = TYPES[level].filter((t) => t !== s.type).map(R);
    const mode = round === 0 ? 'wrong1' : round === 1 && wrongs.length > 1 ? 'wrong2' : 'right';
    s = await answerChoice({ page, slug: SLUG, level, skill: skillOf(SLUG, level), check, tag, s, mode, rightSel: R(s.type), wrongSels: wrongs });
  }
  // core pickWeak only forbids an immediate repeat for pools of more than 4 items (levels 5: 8 items, 6: 5 items)
  if (level >= 5) check(!seen.some((x, i) => i && x === seen[i - 1]), `L${level}: same item twice in a row ${seen}`);
  if (!FAST && TYPES[level].length <= 4) check(TYPES[level].every((t) => seen.some((x) => x.split(':')[0] === t)), `L${level}: not every cadence came up in ${seen.length} questions (${[...new Set(seen)]})`);
  if (!FAST || level === 1 || level === 6) await levelUpCheck({ page, slug: SLUG, level, check, rightSelOf: (st) => R(st.type), nextSel: '.cd-next', last: level === 6, celebrate: true });
  check(!(await overflows(page)), `L${level}: overflow`);
  console.log(`L${level}`, [...new Set(seen)].join(' '));
}
await open(1);
await persistCheck({ page, url, slug: SLUG, fields: [[0, 'level', 5], [1, 'tempo', 90]], check, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); return s.level === 5 ? '' : `level ${s.level}`; } });
check(!errors.length, 'console: ' + errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
