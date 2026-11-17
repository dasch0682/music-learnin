// Find the note, every level: staff note name recomputed from the MIDI number (clef, range, accidentals spelling, choices in the language),
// logged skill (taxonomy; in-staff notes of the ledger levels log the staff skill), every tap logged (wrong then right), reveal after the 2nd miss,
// 20 clean answers celebrate, sound option (notes played or not), level and sound persistence, smoke, English labels.
// Usage: PORT=5220 [FAST=1] node tools/find-a-note.test.mjs [screenshot-dir]
import { launch, FAST, rounds, levels } from './lib/harness.mjs';
import { skillOf, makeChecker, overflows, smoke, persistCheck, readAttempts, newAttempts, fbLog, fbSince, recordAudio, playedNotes } from './lib/shared-a.mjs';
const SLUG = 'find-a-note';
const base = `http://localhost:${process.env.PORT || 5220}/${SLUG}/`;
const dir = process.argv[2];
const C = makeChecker(), { check } = C;
const browser = await launch();
await smoke({ browser, url: base, check, startSel: '.ml-title' });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(page);
// Theory, recomputed here. Diatonic step of a natural MIDI note: C4 = 28.
const FR = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const PC_LETTER = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
const NAT_PC = [0, 2, 4, 5, 7, 9, 11];
const spell = (midi, pref) => {
  const pc = ((midi % 12) + 12) % 12;
  if (pc in PC_LETTER) return { letter: PC_LETTER[pc], acc: 0 };
  return pref === 'flat' ? { letter: PC_LETTER[pc + 1], acc: -1 } : { letter: PC_LETTER[pc - 1], acc: 1 };
};
const step = (midi) => 7 * (Math.floor(midi / 12) - 1) + PC_LETTER[((midi % 12) + 12) % 12];
const BOTTOM = { treble: 30, bass: 18, alto: 24, tenor: 22 };
const inStaff = (clef, midi) => step(midi) >= BOTTOM[clef] - 1 && step(midi) <= BOTTOM[clef] + 9;
const label = (m, p) => { const s = spell(m, p); return FR[s.letter] + (s.acc > 0 ? '♯' : s.acc < 0 ? '♭' : ''); };
const LEVELS = [
  null,
  { clefs: ['treble'], acc: false, skills: ['read.treble.staff'], lo: 1, hi: 1 },
  { clefs: ['treble'], acc: false, skills: ['read.treble.staff', 'read.treble.ledger'], lo: 5, hi: 5 },
  { clefs: ['bass'], acc: false, skills: ['read.bass.staff'], lo: 1, hi: 1 },
  { clefs: ['bass'], acc: false, skills: ['read.bass.staff', 'read.bass.ledger'], lo: 5, hi: 5 },
  { clefs: ['treble', 'bass'], acc: true, skills: ['read.accidentals'], lo: 2, hi: 2 },
  { clefs: ['treble', 'bass'], acc: false, skills: ['read.grand'], lo: 4, hi: 4 },
  { clefs: ['alto', 'tenor'], acc: false, skills: ['read.cclefs'], lo: 2, hi: 2 },
];

const open = async (level, p = page, sound = false) => {
  await p.evaluate(([l, s]) => localStorage.setItem('ml:settings:find-a-note', JSON.stringify({ level: l, sound: s })), [level, sound]);
  await p.reload();
  await p.waitForSelector('.ml-choices button');
  await p.waitForFunction(() => window.__test.state() && !window.__test.state().locked);
};
const ready = () => page.waitForFunction(() => window.__test.state() && !window.__test.state().locked && document.querySelector('.ml-choices button:not([disabled])'));
const nextItem = (item) => page.waitForFunction((i) => window.__test.state().item !== i && !window.__test.state().locked, item, { timeout: 8000 });
const wantOf = (s, level) => (level === 5 ? label(s.midi, s.pref) : FR[spell(s.midi, s.pref).letter]);
const btn = (t) => `.ml-choices button:text-is("${t}")`;
await page.goto(base);
for (const level of levels(7)) {
  const spec = LEVELS[level];
  await open(level);
  const seen = [], clefs = new Set();
  for (let round = 0; round < rounds(14, 3); round++) {
    await ready();
    const s = await page.evaluate(() => window.__test.state());
    const tag = `L${level} r${round} ${s.item}`;
    seen.push(s.item); clefs.add(s.clef);
    const want = wantOf(s, level);
    check(s.level === level && spec.clefs.includes(s.clef), `${tag}: clef ${s.clef}`);
    const expSkill = level === 5 ? 'read.accidentals' : level === 6 || level === 7 ? spec.skills[0] : (inStaff(s.clef, s.midi) ? spec.skills[0] : spec.skills[1] || spec.skills[0]);
    check(s.skill === expSkill, `${tag}: skill ${s.skill} expected ${expSkill}`);
    // taxonomy: the level's skill, or the staff skill for a note inside the staff on a ledger-line level
    check(s.skill === skillOf(SLUG, level) || (s.skill === skillOf(SLUG, level - 1)) , `${tag}: skill ${s.skill} vs taxonomy ${skillOf(SLUG, level)}`);
    const isNat = NAT_PC.includes(((s.midi % 12) + 12) % 12);
    check(spec.acc ? !isNat : isNat, `${tag}: accidental mismatch`);
    if (spec.acc) check((s.pref === 'flat') === /♭/.test(want) && (s.pref === 'sharp') === /♯/.test(want), `${tag}: spelling ${want} for pref ${s.pref}`);
    if (level === 1) check(step(s.midi) >= 29 && step(s.midi) <= 39, `${tag}: out of range`);
    if (level === 3) check(step(s.midi) >= 17 && step(s.midi) <= 27, `${tag}: out of range`);
    if (level === 2) check(step(s.midi) >= 25 && step(s.midi) <= 43, `${tag}: out of range`);
    if (level === 4) check(step(s.midi) >= 13 && step(s.midi) <= 31, `${tag}: out of range`);
    const texts = await page.$$eval('.ml-choices button', (bs) => bs.map((b) => b.textContent));
    check(texts.includes(want) && texts.filter((t) => t === want).length === 1, `${tag}: right name ${want} missing from ${texts}`);
    if (level === 5) check(texts.length === 4 && new Set(texts).size === 4, `${tag}: choices ${texts}`);
    else check(texts.length === 7 && texts.join() === FR.join(), `${tag}: choices ${texts}`);
    const before = (await readAttempts(page, SLUG)).length;
    const fb0 = (await fbLog(page)).length;
    const wrongs = texts.filter((t) => t !== want);
    const nWrong = round === 0 ? 1 : round === 1 ? 2 : 0;
    for (let i = 0; i < nWrong; i++) {
      if (dir && round === 0 && level % 3 === 1) await page.screenshot({ path: `${dir}/fn-${level}.png` });
      await page.click(btn(wrongs[i]));
      check((await fbSince(page, fb0 + i, 1))[0] === 'bad', `${tag}: wrong name ${i + 1} gave no error feedback`);
      check(await page.$eval(btn(wrongs[i]), (b) => b.classList.contains('ml-wrong') && b.disabled), `${tag}: wrong button not marked/disabled`);
      check((await page.evaluate(() => window.__test.state())).item === s.item, `${tag}: note changed after a wrong answer`);
      check(i === 1 ? !!(await page.$('.ml-btn.ml-reveal[data-ok]')) : !(await page.$('.ml-reveal')), `${tag}: reveal state after miss ${i + 1}`);
    }
    await page.click(btn(want));
    const mine = await newAttempts(page, SLUG, before, nWrong + 1);
    const exp = Array(nWrong).fill(false).concat([true]);
    check(JSON.stringify(mine.map((a) => a.ok)) === JSON.stringify(exp) && mine.every((a) => a.game === SLUG && a.level === level && a.item === s.item && a.skill === s.skill), `${tag}: ${JSON.stringify(mine.map((a) => [a.ok, a.item, a.skill]))}`);
    await nextItem(s.item);
  }
  // large pools: never the same note twice in a row
  check(!seen.some((x, i) => i && x === seen[i - 1]), `L${level}: same note twice in a row ${seen}`);
  if (level >= 6 && !FAST) check(clefs.size === spec.clefs.length || level === 6 && clefs.size >= 1, `L${level}: clefs ${[...clefs]}`);
  check(!(await overflows(page)), `L${level}: overflow`);
  // 20 clean answers in a row celebrate (toast: feedback kind level)
  if (!FAST || level === 1) {
    const f0 = (await fbLog(page)).length;
    for (let k = 0; k < 21; k++) {
      await ready();
      const s = await page.evaluate(() => window.__test.state());
      await page.click(btn(wantOf(s, level)));
      await nextItem(s.item);
      if ((await fbLog(page)).slice(f0).includes('level')) break;
    }
    check((await fbLog(page)).slice(f0).includes('level'), `L${level}: no celebration after 20 right answers`);
  }
  console.log(`L${level}`, [...new Set(seen)].length, 'notes');
}
// English labels (letters), then settings persistence (level and sound)
const en = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'dark', locale: 'en-US' });
C.watch(en);
await en.goto(base);
await open(1, en);
check((await en.$$eval('.ml-choices button', (bs) => bs.map((b) => b.textContent))).join() === 'C,D,E,F,G,A,B', 'EN letters');
await en.close();
await open(1);
await persistCheck({ page, url: base, slug: SLUG, fields: [[0, 'level', 7], [1, 'sound', true]], check, start: false, applied: async (p) => { const s = await p.evaluate(() => window.__test.state()); return s.level === 7 && ['alto', 'tenor'].includes(s.clef) ? '' : `level ${s.level} clef ${s.clef}`; } });
// sound option: the note is played with sound on, nothing with sound off
const snd = await browser.newPage({ viewport: { width: 390, height: 780 }, colorScheme: 'light', locale: 'fr-FR' });
C.watch(snd);
await recordAudio(snd);
await snd.goto(base);
for (const sound of [true, false]) {
  await open(1, snd, sound);
  await playedNotes(snd);
  const s = await snd.evaluate(() => window.__test.state());
  const w = wantOf(s, 1);
  await snd.click(btn(w));
  await snd.waitForFunction(() => window.__fb?.length);
  const played = (await playedNotes(snd)).map((n) => n.midi);
  const cue = await snd.evaluate(() => window.__fb.at(-1).sound); // the shell cue is silent when the note itself is played
  check(sound ? played.includes(s.midi) && cue === null : !!cue, `sound ${sound}: played ${played} for midi ${s.midi}, cue ${cue}`);
}
check(!C.errors.length, 'console: ' + C.errors.join(' | '));
await browser.close();
console.log(C.failed ? `${C.failed} failure(s)` : 'all good');
process.exit(C.failed ? 1 : 0);
