// Key signatures: first play the note the signature asks for, later name the key, at the end pick the signature.
import { createGame } from '@core/shell.js';
import { renderStaff } from '@core/staff.js';
import { createKeyboard } from '@core/keyboard.js';
import { playSeq } from '@core/audio.js';
import { LETTERS, naturalMidi, mod, rand, pick, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'key-signatures',
  title: L('Key signatures', 'Armures'),
  strings: {
    nextLevel: L('Next level →', 'Niveau suivant →'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Play the note: up to 2 sharps or flats', '1 · Joue la note : jusqu’à 2 dièses ou bémols') },
      { value: 2, label: L('2 · Play the note: up to 4 sharps or flats', '2 · Joue la note : jusqu’à 4 dièses ou bémols') },
      { value: 3, label: L('3 · Major keys, up to 4 sharps or flats', '3 · Tonalités majeures, jusqu’à 4 altérations') },
      { value: 4, label: L('4 · Major keys, all signatures', '4 · Tonalités majeures, toutes les armures') },
      { value: 5, label: L('5 · Relative minor keys', '5 · Relatifs mineurs') },
      { value: 6, label: L('6 · All clefs, major and minor, find the signature', '6 · Toutes les clés, majeur et mineur, trouver l’armure') },
    ] },
    { key: 'sound', label: L('Play the scale', 'Jouer la gamme'), type: 'toggle', default: true },
  ],
});
const { h } = game;

const SKILL = 'read.keysig';
const MAX_LEVEL = 6, STREAK_UP = 8;
// Letters are indexes in C D E F G A B.
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F
const FIFTHS = [3, 0, 4, 1, 5, 2, 6]; // line of fifths: F C G D A E B, then the same with one more sharp
const ACC = { '-1': '♭', 0: '', 1: '♯' };

/** Letters changed by a signature of n accidentals (n < 0: flats). */
const altered = (n) => (n > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(n));
const altOf = (letter, n) => (altered(n).includes(letter) ? Math.sign(n) : 0);
/** Tonic of the major key (or of its relative minor) of a signature. */
function tonic(n, minor) {
  const f = n + (minor ? 3 : 0) + 1;
  return { letter: FIFTHS[mod(f, 7)], acc: Math.floor(f / 7) };
}
const keyName = (n, minor, lang = game.lang) => {
  const tn = tonic(n, minor);
  return `${LETTERS[lang][tn.letter]}${ACC[tn.acc]} ${(minor ? L('minor', 'mineur') : L('major', 'majeur'))[lang]}`;
};
const sigStr = (n) => (n > 0 ? '+' + n : String(n));
const keyId = (n, minor) => sigStr(n) + (minor ? ':m' : '');
const span = (max) => Array.from({ length: 2 * max + 1 }, (_, i) => i - max);

/** One octave of the scale, starting near middle C. */
function scale(n, minor) {
  const tn = tonic(n, minor);
  const pc = mod(naturalMidi(tn.letter, 4) + tn.acc, 12);
  const root = pc <= 6 ? 60 + pc : 48 + pc;
  return (minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12]).map((s) => root + s);
}

// ---------- questions ----------
// kind: 'note' (play the note), 'name' (signature → key), 'sig' (key → signature)
function pool(level) {
  if (level <= 2) return span(level === 1 ? 2 : 4).map((n) => ({ n, kind: 'note', item: sigStr(n) + ':n' }));
  if (level === 3) return span(4).map((n) => ({ n, minor: false, item: keyId(n, false) }));
  if (level === 4) return span(7).map((n) => ({ n, minor: false, item: keyId(n, false) }));
  if (level === 5) return span(7).map((n) => ({ n, minor: true, item: keyId(n, true) }));
  return span(7).flatMap((n) => [false, true].map((minor) => ({ n, minor, item: keyId(n, minor) })));
}
const NOTE_LO = 28, NOTE_HI = 37; // C4 to E5 (diatonic steps, C4 = 28)
let lastStep = null;

function makeQuestion(level, stats, last) {
  const base = pickWeak(pool(level), stats, { keyOf: (x) => x.item, avoid: last });
  const q = { ...base, level, clef: 'treble', max: level === 1 ? 2 : level === 2 || level === 3 ? 4 : 7 };
  if (q.kind === 'note') {
    const steps = [];
    for (let st = NOTE_LO; st <= NOTE_HI; st++) if (st !== lastStep) steps.push(st);
    const alt = steps.filter((st) => altOf(st % 7, q.n));
    q.step = alt.length && Math.random() < 0.7 ? pick(alt) : pick(steps);
    lastStep = q.step;
    q.acc = altOf(q.step % 7, q.n);
    q.midi = naturalMidi(q.step % 7, Math.floor(q.step / 7)) + q.acc;
    return q;
  }
  if (level === 6) {
    q.clef = pick(['treble', 'bass', 'alto', 'tenor']);
    q.kind = Math.random() < 0.4 ? 'sig' : 'name';
  } else q.kind = 'name';
  // Wrong choices: the neighbours and the mirror (same number, sharps for flats).
  const near = [-q.n, q.n + 1, q.n - 1, q.n + 2, q.n - 2].filter((x, i, a) => x !== q.n && Math.abs(x) <= q.max && a.indexOf(x) === i);
  const far = shuffle(span(q.max).filter((x) => x !== q.n && !near.includes(x)));
  q.options = shuffle([q.n, ...[...shuffle(near), ...far].slice(0, 3)]);
  return q;
}

// ---------- screen ----------
const prompt = h('p', { className: 'ml-prompt ks-prompt' });
const staffBox = h('div', { className: 'ks-staff' });
const answerBox = h('div', { className: 'ks-answer' });
const kbBox = h('div', { style: 'width:100%' });
const offerBtn = h('button', { className: 'ml-btn ml-primary ks-offer ks-off' });
game.stage.append(prompt, staffBox, answerBox, offerBtn);

let q = null, gen = 0, locked = true, missed = false, wrongs = 0, t0 = 0, streak = 0, last = null, kb = null;

/** Small staff, cut close to the lines. */
function smallStaff(box, opts, from = 2.5, to = 12.5) {
  const gap = 12;
  const svg = renderStaff(box, { ...opts, gap });
  svg.setAttribute('viewBox', `0 ${gap * from} ${opts.width} ${gap * (to - from)}`);
  return svg;
}

function drawStaff(color) {
  if (q.kind === 'sig') { staffBox.replaceChildren(); return; }
  const notes = q.kind === 'note' ? [{ midi: q.midi, spell: [{ step: q.step, acc: q.acc }], acc: false, color }] : [];
  const svg = renderStaff(staffBox, { clef: q.clef, keySig: q.n, notes, width: q.kind === 'note' ? 250 : 220 });
  // After a mistake, the accidental of the signature that changes this note is marked.
  if (q.kind === 'note' && wrongs && q.acc) svg.querySelectorAll('.ml-keysig')[altered(q.n).indexOf(q.step % 7)]?.classList.add('ks-mark');
}

function render() {
  if (!q) return;
  offerBtn.textContent = game.t('nextLevel');
  offerBtn.classList.toggle('ks-off', !(streak >= STREAK_UP && q.level < MAX_LEVEL));
  prompt.textContent = q.kind === 'sig' ? keyName(q.n, q.minor) : '';
  prompt.hidden = q.kind !== 'sig';
  staffBox.hidden = q.kind === 'sig';
  drawStaff();
  if (q.kind === 'note') {
    if (!kb) kb = createKeyboard(kbBox, { from: 60, to: 76, onDown: onKey });
    if (answerBox.firstChild !== kbBox) answerBox.replaceChildren(kbBox);
    return;
  }
  const grid = h('div', { className: 'ks-choices' + (q.kind === 'sig' ? ' ks-sigs' : '') }, ...q.options.map((n) => {
    const b = h('button', { className: 'ml-btn' });
    b.dataset.sig = sigStr(n);
    if (q.kind === 'name') b.textContent = keyName(n, q.minor);
    else { smallStaff(b, { clef: q.clef, keySig: n, width: 170 }); b.setAttribute('aria-label', sigStr(n)); }
    b.onclick = () => answer(n === q.n, b);
    return b;
  }));
  answerBox.replaceChildren(grid);
}

// ---------- rounds ----------
async function next() {
  const my = ++gen;
  locked = true;
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const stats = await loadItemMastery(SKILL);
  if (my !== gen) return;
  q = makeQuestion(level, stats, last);
  last = q.item;
  missed = false;
  wrongs = 0;
  render();
  t0 = performance.now();
  locked = false;
}

/** Only the first answer of a question is logged. A wrong answer is followed by a retry. */
async function judge(ok, silent) {
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - t0), level: q.level, item: q.item, silent };
  if (ok) {
    locked = true;
    if (missed) return game.flash(true, { silent });
    streak++;
    offerBtn.classList.toggle('ks-off', !(streak >= STREAK_UP && q.level < MAX_LEVEL));
    return game.attempt(rec);
  }
  streak = 0;
  wrongs++;
  offerBtn.classList.add('ks-off');
  if (missed) return game.flash(false, { silent });
  missed = true;
  return game.attempt(rec);
}

async function onKey(midi) {
  if (locked || !q || q.kind !== 'note') return;
  const my = gen;
  if (midi === q.midi) {
    kb.flash(midi, 'ml-good', 450);
    drawStaff('var(--good)');
    await judge(true, true); // the key already made its sound
    setTimeout(() => { if (my === gen) next(); }, 550);
  } else {
    kb.flash(midi, 'ml-bad', 400);
    await judge(false, true);
    if (my !== gen) return;
    drawStaff();
    if (wrongs >= 2) kb.flash(q.midi, 'ml-hint', 900);
  }
}

async function answer(ok, button) {
  if (locked || button.disabled) return;
  const my = gen;
  if (!ok) {
    button.classList.add('ml-wrong');
    button.disabled = true;
    return judge(false);
  }
  button.classList.add('ml-right');
  const sound = !!game.settings.sound;
  await judge(true, sound);
  if (sound) await playSeq(scale(q.n, q.minor), { bpm: 300 });
  else await new Promise((r) => setTimeout(r, 600));
  if (my === gen) next();
}

game.on('settings', () => { streak = 0; next(); });
game.on('lang', render);
offerBtn.onclick = () => { if (+game.settings.level < MAX_LEVEL) game.set('level', +game.settings.level + 1); };

window.__test = {
  state: () => q && ({ level: q.level, item: q.item, kind: q.kind, sig: q.n, minor: !!q.minor, clef: q.clef, step: q.step, midi: q.midi, answer: sigStr(q.n), options: q.options?.map(sigStr), locked, streak }),
  theory: () => ({
    sharps: SHARP_ORDER.map((l) => LETTERS.en[l]).join(' '), flats: FLAT_ORDER.map((l) => LETTERS.en[l]).join(' '),
    keys: span(7).map((n) => ({ sig: sigStr(n), major: { en: keyName(n, false, 'en'), fr: keyName(n, false, 'fr') }, minor: { en: keyName(n, true, 'en'), fr: keyName(n, true, 'fr') }, altered: altered(n).map((l) => LETTERS.en[l]).join(' '), scaleMajor: scale(n, false), scaleMinor: scale(n, true) })),
  }),
};

next();
