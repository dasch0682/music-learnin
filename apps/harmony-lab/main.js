// Harmony lab: chords are blocks. Hear them, place them, first by colour and shape (rest, movement, tension),
// then with the names (tonic, subdominant, dominant), then melodies, families, minor keys, and jazz.
import { createGame } from '@core/shell.js';
import { playChord, playNote } from '@core/audio.js';
import { CHORDS, LETTERS, SCALES, mod, pick, rand, shuffle } from '@core/music.js';
import { renderStaff } from '@core/staff.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 8;
const skillOf = (level) => (level <= 5 ? 'theory.harmony' : 'theory.jazz');
const game = createGame({
  id: 'harmony-lab',
  title: L('Harmony lab', 'Atelier d’harmonie'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    ok: L('Check', 'Valider'),
    settled: L('Settled', 'Posé'),
    hanging: L('Hanging', 'Suspendu'),
    rest: L('rest', 'repos'),
    move: L('movement', 'mouvement'),
    tension: L('tension', 'tension'),
    tonic: L('tonic', 'tonique'),
    sub: L('subdominant', 'sous-dominante'),
    dom: L('dominant', 'dominante'),
    pull: L('Dominant of the next chord', 'Dominante du suivant'),
    tri: L('Tritone substitute of {c}', 'Substitut tritonique de {c}'),
    back: L('Backdoor', 'Backdoor'),
    five: L('Five-note scale', 'Gamme à cinq notes'),
    major: L('major', 'majeure'),
    minor: L('minor', 'mineure'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what a harmonist!', 'Bravo, quelle harmonie !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Rest, movement, tension', '1 · Repos, mouvement, tension') },
      { value: 2, label: L('2 · Tonic, subdominant, dominant', '2 · Tonique, sous-dominante, dominante') },
      { value: 3, label: L('3 · Harmonise a melody', '3 · Harmonise une mélodie') },
      { value: 4, label: L('4 · Chord families', '4 · Familles d’accords') },
      { value: 5, label: L('5 · Minor keys, secondary dominants', '5 · Mineur, dominantes secondaires') },
      { value: 6, label: L('6 · Build a ii–V–I', '6 · Construis un ii–V–I') },
      { value: 7, label: L('7 · Substitutions and scales', '7 · Substitutions et gammes') },
      { value: 8, label: L('8 · Turnarounds and labels', '8 · Turnarounds et étiquettes') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 110, step: 5, default: 70 },
  ],
});
const { h } = game;

// ---------- theory ----------
// id → [semitones above the tonic, diatonic steps above the tonic, chord type, family]
const TABLE = {
  I: [0, 0, 'maj', 'rest'], ii: [2, 1, 'min', 'move'], iii: [4, 2, 'min', 'rest'], IV: [5, 3, 'maj', 'move'],
  V: [7, 4, 'maj', 'tension'], V7: [7, 4, 'dom7', 'tension'], vi: [9, 5, 'min', 'rest'],
  i: [0, 0, 'min', 'rest'], iv: [5, 3, 'min', 'move'], bVI: [8, 5, 'maj', 'move'],
  'V7/V': [2, 1, 'dom7', 'tension'], 'V7/ii': [9, 5, 'dom7', 'tension'],
  ii7: [2, 1, 'min7', 'move'], Imaj7: [0, 0, 'maj7', 'rest'], iii7: [4, 2, 'min7', 'rest'], vi7: [9, 5, 'min7', 'rest'],
  IVmaj7: [5, 3, 'maj7', 'move'], bII7: [1, 1, 'dom7', 'tension'], iv7: [5, 3, 'min7', 'move'],
  bVII7: [10, 6, 'dom7', 'tension'], VI7: [9, 5, 'dom7', 'tension'],
};
const ROMAN = { bVI: '♭VI', bII7: '♭II7', bVII7: '♭VII7' };
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
// Keys with at most three accidentals; letter = index of the tonic letter (C = 0).
const MAJ_KEYS = [
  { id: 'C', pc: 0, letter: 0, sig: 0 }, { id: 'G', pc: 7, letter: 4, sig: 1 }, { id: 'D', pc: 2, letter: 1, sig: 2 },
  { id: 'A', pc: 9, letter: 5, sig: 3 }, { id: 'F', pc: 5, letter: 3, sig: -1 }, { id: 'Bb', pc: 10, letter: 6, sig: -2 },
  { id: 'Eb', pc: 3, letter: 2, sig: -3 },
];
const MIN_KEYS = [
  { id: 'A', pc: 9, letter: 5, minor: true }, { id: 'E', pc: 4, letter: 2, minor: true }, { id: 'B', pc: 11, letter: 6, minor: true },
  { id: 'F#', pc: 6, letter: 3, minor: true }, { id: 'D', pc: 2, letter: 1, minor: true }, { id: 'G', pc: 7, letter: 4, minor: true },
  { id: 'C', pc: 0, letter: 0, minor: true },
];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const GLYPH = ['♭♭', '♭', '', '♯', '♯♯'];
const spellRoot = (pc, letter) => LETTERS.en[letter] + GLYPH[mod(pc - LETTER_PC[letter] + 6, 12) - 6 + 2];
const frName = (en) => LETTERS.fr[LETTERS.en.indexOf(en[0])] + en.slice(1);
const nm = (en) => (game.lang === 'fr' ? frName(en) : en);

/** Bass note plus chord tones kept in a narrow register, so the voices move smoothly. */
function voicing(rootPc, type) {
  return [43 + mod(rootPc - 43, 12), ...CHORDS[type].steps.map((s) => 57 + mod(rootPc + s - 57, 12))];
}
function chordIn(id, key) {
  const [semis, steps, type, fam] = TABLE[id];
  const letter = mod(key.letter + steps, 7);
  const rootPc = mod(key.pc + semis, 12);
  return { id, type, fam, rootPc, pcs: CHORDS[type].steps.map((s) => mod(rootPc + s, 12)), midis: voicing(rootPc, type), rootEn: spellRoot(rootPc, letter), roman: ROMAN[id] || id };
}
const symbol = (c) => nm(c.rootEn) + CHORDS[c.type].symbol;
const chordBlock = (c) => ({ kind: 'chord', id: c.id, chord: c });

// ---------- drawings ----------
const SHAPES = {
  rest: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="21" fill="currentColor"/></svg>',
  move: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 7L57 33L32 59L7 33Z" fill="currentColor"/></svg>',
  tension: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 8L59 56H5Z" fill="currentColor"/></svg>',
};
const GOALS = {
  settled: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52h48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="38" r="12" fill="currentColor"/></svg>',
  hanging: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52h48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 36v8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/></svg>',
};
const PLAY = '<svg viewBox="0 0 64 64" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';

// ---------- the screen ----------
let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0, qid = 0;
const test = { last: null };
const prompt = h('p', { className: 'ml-prompt hl-prompt' });
const staffBox = h('div', { className: 'hl-staff' });
const row = h('div', { className: 'hl-row' });
const tray = h('div', { className: 'hl-tray' });
const bar = h('div', { className: 'hl-bar' });
const replay = h('button', { className: 'ml-btn hl-play', innerHTML: PLAY });
const okBtn = h('button', { className: 'ml-btn ml-primary hl-ok', textContent: '✓' });
const nextBtn = h('button', { className: 'ml-btn ml-primary hl-next' });
bar.append(replay, okBtn);
replay.onclick = () => hear();
okBtn.onclick = () => confirm();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

const beat = () => 60 / (+game.settings.tempo || 70);

function chordOfSlot(s) { return s.given || (s.placed?.kind === 'chord' ? s.placed.chord : null); }
function hear() {
  if (!q || q.mode === 'scale') { if (q?.mode === 'scale') soundScale(null); return; }
  const now = performance.now();
  if (now < quietUntil - 150) return;
  const b = beat();
  q.slots.forEach((s, i) => {
    const c = chordOfSlot(s);
    if (c) playChord(c.midis, { when: i * b, dur: (i === q.slots.length - 1 ? 2.2 : 0.95) * b, gain: 0.34 });
    if (s.note != null) playNote(s.note, { when: i * b, dur: 0.9 * b, gain: 0.3, timbre: 'pluck' });
  });
  quietUntil = now + (q.slots.length + 1.2) * b * 1000;
}
function soundBlock(b) {
  if (b.kind === 'chord') {
    const slot = q.mode === 'place' ? activeSlot() : null;
    playChord(b.chord.midis, { dur: 1.4, gain: 0.36 });
    if (slot?.note != null) playNote(slot.note, { dur: 1.2, gain: 0.3, timbre: 'pluck' });
    test.last = { chord: b.chord.midis, notes: [] };
  } else if (b.kind === 'scale') soundScale(b);
}
function soundScale(b) {
  const chord = q.slots[0].given;
  playChord(chord.midis, { dur: 3.2, gain: 0.26 });
  test.last = { chord: chord.midis, notes: [] };
  if (!b) return;
  b.midis.forEach((m, i) => playNote(m, { when: 0.1 + i * 0.4, dur: 0.5, gain: 0.3, timbre: 'pluck' }));
  test.last.notes = b.midis;
}

const activeSlot = () => (q.slots[q.active] && !q.slots[q.active].given ? q.slots[q.active] : null);
function firstOpen() { return q.slots.findIndex((s) => !s.given && !s.placed && s.status !== 'locked'); }

// Text under a block or in a slot, by level.
function textOf(c) {
  const st = q.style;
  if (st === 'word') return h('span', { className: 'hl-txt' }, game.t({ rest: 'tonic', move: 'sub', tension: 'dom' }[c.fam]));
  if (st === 'roman') return h('span', { className: 'hl-txt hl-big' }, c.roman);
  if (st === 'rs') return h('span', { className: 'hl-txt' }, h('b', {}, c.roman), h('small', {}, symbol(c)));
  if (st === 'sym') return h('span', { className: 'hl-txt hl-big' }, symbol(c));
  return null;
}
function shapeOf(fam) { return h('span', { className: 'hl-shape hl-' + fam, innerHTML: SHAPES[fam] }); }
function faceOf(b) {
  if (b.kind === 'chord') return [q.shapes ? shapeOf(b.chord.fam) : null, textOf(b.chord)].filter(Boolean);
  if (b.kind === 'scale') return [h('span', { className: 'hl-txt hl-big' }, nm(FLAT_NAMES[b.root])), h('small', { className: 'hl-txt' }, game.t(b.minor ? 'minor' : 'major'))];
  return [shapeOf(b.fam), h('small', { className: 'hl-txt' }, game.t(b.fam === 'rest' ? 'rest' : b.fam === 'move' ? 'move' : 'tension'))];
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  okBtn.setAttribute('aria-label', game.t('ok'));
  nextBtn.textContent = game.t('next');
  const p = q.prompt();
  prompt.textContent = p;
  prompt.style.display = p ? '' : 'none';
  staffBox.style.display = q.melody ? '' : 'none';
  if (q.melody) renderStaff(staffBox, { clef: 'treble', keySig: q.key.sig || 0, notes: q.melody.map((m) => ({ midi: m, pref: (q.key.sig || 0) < 0 ? 'flat' : 'sharp', acc: false })), width: 300, gap: 9 });
  row.replaceChildren(...q.slots.map((s, i) => {
    const b = h('button', { className: 'ml-btn hl-slot' });
    b.dataset.slot = i;
    const face = s.given ? faceOf(chordBlock(s.given)) : s.placed ? faceOf(s.placed) : [];
    if (s.given) b.classList.add('hl-given');
    else if (!s.placed) b.classList.add('hl-empty');
    if (i === q.active && !s.given && s.status !== 'locked') b.classList.add('hl-active');
    if (s.status) b.classList.add('hl-' + s.status);
    if (q.mode === 'label' && i === q.step) b.classList.add('hl-active');
    if (q.mode === 'label') {
      // The chord is named by its symbol; the label appears once found.
      b.replaceChildren(h('span', { className: 'hl-txt hl-big' }, symbol(s.given)), s.labelled ? shapeOf(s.given.fam) : h('span', { className: 'hl-shape' }));
    } else b.replaceChildren(...face);
    b.onclick = () => tapSlot(i);
    return b;
  }), ...(q.goal ? [h('span', { className: 'hl-goal', innerHTML: GOALS[q.goal], title: game.t(q.goal) })] : []));
  tray.replaceChildren(...q.blocks.map((b) => {
    const el = h('button', { className: 'ml-btn hl-block' }, ...faceOf(b));
    el.dataset.id = b.id;
    el.onclick = () => tapBlock(b);
    return el;
  }));
  okBtn.style.display = q.mode === 'label' ? 'none' : '';
  okBtn.disabled = locked || q.mode !== 'place' && q.mode !== 'scale' || q.slots.some((s) => !s.given && s.status !== 'locked' && !s.placed);
}

// ---------- question generators ----------
const goalOfLast = (id) => (TABLE[id][3] === 'rest' ? 'settled' : TABLE[id][3] === 'tension' ? 'hanging' : null);
function phraseSlots(ids, key, emptyAt, valid) {
  return ids.map((id, i) => (i === emptyAt ? { given: null, valid: new Set(valid), placed: null, note: null, status: null } : { given: chordIn(id, key), valid: null, placed: null, note: null, status: null }));
}
const base = (level, extra) => ({ level, mode: 'place', active: 0, step: 0, shapes: true, style: 'none', goal: null, melody: null, prompt: () => '', blocks: [], slots: [], ...extra });

function genGoal(level, item) {
  const key = pick(MAJ_KEYS);
  const goal = item.slice(5);
  const V = level === 1 ? 'V7' : 'V';
  const T = {
    settled: [['I', 'IV', V], ['I', 'I', V], ['IV', 'IV', V], ['I', 'vi', V]],
    hanging: [['I', 'IV', 'I'], ['I', 'I', 'IV'], ['I', 'V', 'IV'], ['I', 'IV', 'IV']],
  };
  const tpl = pick(T[goal].filter((t) => level === 1 || !t.includes('vi')));
  const last = goal === 'settled' ? 'I' : V;
  const ids = [...tpl.map((x) => (x === 'V' ? V : x)), '_'];
  const slots = phraseSlots(ids, key, 3, [last]);
  return base(level, { key, goal, slots, active: 3, style: level === 1 ? 'none' : 'word', blocks: ['I', 'IV', V].map((id) => chordBlock(chordIn(id, key))) });
}

const DEG = [0, 2, 4, 5, 7, 9, 11];
function genMelody(level) {
  const key = pick(MAJ_KEYS.filter((k) => ['C', 'G', 'F'].includes(k.id)));
  const goal = pick(['settled', 'hanging']);
  const first = [0, 2, 4], end = goal === 'settled' ? [0, 2, 4, 7] : [4, 6, 1];
  let d;
  for (let tries = 0; tries < 200; tries++) {
    d = [pick(first), rand(8), rand(8), pick(end)];
    if (d.every((x, i) => i === 0 || Math.abs(x - d[i - 1]) <= 4)) break;
  }
  const tonic = 60 + key.pc;
  const melody = d.map((x) => tonic + DEG[x % 7] + (x >= 7 ? 12 : 0));
  const blocks = ['I', 'IV', 'V'].map((id) => chordBlock(chordIn(id, key)));
  const lastId = goal === 'settled' ? 'I' : 'V';
  const slots = [
    { given: chordIn('I', key), valid: null, placed: null, note: melody[0], status: null },
    ...[1, 2, 3].map((i) => ({
      given: null, placed: null, status: null, note: melody[i],
      valid: new Set(['I', 'IV', 'V'].filter((id) => blocks.find((b) => b.id === id).chord.pcs.includes(mod(melody[i], 12)) && (i < 3 || id === lastId))),
    })),
  ];
  return base(level, { key, goal, slots, melody, active: 1, style: 'roman', blocks });
}

const FAM_BLOCKS = ['I', 'ii', 'iii', 'IV', 'V', 'vi'];
const FAM_TPL = [
  [['I', null, 'IV', 'V'], 'rest'], [['I', null, 'ii', 'V'], 'rest'], [['I', 'vi', null, 'V'], 'move'], [['I', 'iii', null, 'V'], 'move'],
  [['I', 'IV', null, 'I'], 'tension'], [['I', 'ii', null, 'I'], 'tension'], [['I', 'vi', 'ii', null], 'tension'],
];
function genFamily(level) {
  const key = pick(MAJ_KEYS);
  const [tpl, fam] = pick(FAM_TPL);
  const at = tpl.indexOf(null);
  const blocks = FAM_BLOCKS.map((id) => chordBlock(chordIn(id, key)));
  const valid = blocks.filter((b) => b.chord.fam === fam).map((b) => b.id);
  const slots = phraseSlots(tpl.map((x) => x || '_'), key, at, valid);
  const lastId = tpl[3] || 'V';
  return base(level, { key, fam, slots, active: at, style: 'rs', goal: goalOfLast(lastId), blocks });
}

function genMinor(level) {
  const key = pick(MIN_KEYS);
  const T = [[['i', 'iv', null, 'i'], ['V7']], [['i', null, 'V7', 'i'], ['iv', 'bVI']], [['i', 'bVI', null, 'V7'], ['iv']]];
  const [tpl, valid] = pick(T);
  const at = tpl.indexOf(null);
  const blocks = ['i', 'iv', 'bVI', 'V7'].map((id) => chordBlock(chordIn(id, key)));
  return base(level, { key, slots: phraseSlots(tpl.map((x) => x || '_'), key, at, valid), active: at, style: 'rs', goal: goalOfLast(tpl[3]), blocks });
}
function genSecdom(level) {
  const key = pick(MAJ_KEYS);
  const T = [[['I', null, 'V', 'I'], 'V7/V', ['ii', 'IV', 'vi', 'V7/V']], [['I', null, 'ii', 'V'], 'V7/ii', ['IV', 'vi', 'V7/ii', 'V7/V']]];
  const [tpl, answer, ids] = pick(T);
  const at = tpl.indexOf(null);
  return base(level, { key, slots: phraseSlots(tpl.map((x) => x || '_'), key, at, [answer]), active: at, style: 'rs', shapes: false, prompt: () => game.t('pull'), blocks: ids.map((id) => chordBlock(chordIn(id, key))) });
}

function genIiVI(level, item) {
  const key = MAJ_KEYS.find((k) => k.id === item.slice(5));
  const right = ['ii7', 'V7', 'Imaj7'];
  const others = shuffle(['iii7', 'vi7', 'IVmaj7', 'bII7', 'iv7', 'bVII7']).slice(0, 3);
  const slots = right.map((id) => ({ given: null, valid: new Set([id]), placed: null, note: null, status: null }));
  return base(level, { key, slots, style: 'sym', shapes: false, prompt: () => nm(spellRoot(key.pc, key.letter)), blocks: [...right, ...others].map((id) => chordBlock(chordIn(id, key))) });
}

// Five-note scales that fit a chord: every note belongs to the mode of the chord, minus the notes
// a half step above a chord tone (avoid notes), and the scale contains the third.
const MODE = { maj7: SCALES.major.steps, min7: SCALES.dorian.steps, dom7: SCALES.mixolydian.steps };
function scaleFits(chord, root, minor) {
  const pcs = SCALES[minor ? 'pentaMinor' : 'pentaMajor'].steps.map((s) => mod(root + s, 12));
  const tones = chord.pcs;
  const avail = MODE[chord.type].map((s) => mod(chord.rootPc + s, 12)).filter((p) => tones.includes(p) || !tones.includes(mod(p - 1, 12)));
  return pcs.every((p) => avail.includes(p)) && pcs.includes(tones[1]);
}
function genScale(level) {
  const type = pick(['maj7', 'min7', 'dom7']);
  const rootPc = rand(12);
  const chord = { id: type, type, fam: type === 'dom7' ? 'tension' : type === 'maj7' ? 'rest' : 'move', rootPc, pcs: CHORDS[type].steps.map((s) => mod(rootPc + s, 12)), midis: voicing(rootPc, type), rootEn: FLAT_NAMES[rootPc], roman: type };
  const all = [];
  for (let root = 0; root < 12; root++) for (const minor of [false, true]) {
    const pcs = SCALES[minor ? 'pentaMinor' : 'pentaMajor'].steps.map((s) => mod(root + s, 12));
    all.push({ kind: 'scale', id: `${FLAT_NAMES[root]}${minor ? 'm' : 'M'}`, root, minor, pcs, key: [...pcs].sort((a, b) => a - b).join(), fit: scaleFits(chord, root, minor), midis: pcs.map((p, i) => 60 + root + SCALES[minor ? 'pentaMinor' : 'pentaMajor'].steps[i]) });
  }
  const good = pick(all.filter((s) => s.fit));
  const opts = [good];
  for (const s of shuffle(all.filter((x) => !x.fit))) if (opts.length < 4 && !opts.some((o) => o.key === s.key)) opts.push(s);
  const slots = [{ given: chord, valid: null, placed: null, note: null, status: null }, { given: null, valid: new Set(opts.filter((s) => s.fit).map((s) => s.id)), placed: null, note: null, status: null }];
  return base(level, { mode: 'scale', key: { pc: 0, letter: 0 }, slots, active: 1, style: 'sym', shapes: false, prompt: () => game.t('five'), blocks: shuffle(opts) });
}
function genSub(level, item) {
  const key = pick(MAJ_KEYS);
  const tri = item === 'tritone';
  const ids = tri ? ['ii7', null, 'Imaj7'] : ['iv7', null, 'Imaj7'];
  const ans = tri ? 'bII7' : 'bVII7';
  const blocks = (tri ? ['bII7', 'V7', 'bVII7', 'VI7'] : ['bVII7', 'V7', 'bII7', 'VI7']).map((id) => chordBlock(chordIn(id, key)));
  const v7 = chordIn('V7', key);
  return base(level, { key, slots: phraseSlots(ids.map((x) => x || '_'), key, 1, [ans]), active: 1, style: 'sym', shapes: false, prompt: () => (tri ? game.t('tri', { c: symbol(v7) }) : game.t('back')), blocks });
}

const TURN = [['Imaj7', 'vi7', 'ii7', 'V7'], ['iii7', 'vi7', 'ii7', 'V7'], ['Imaj7', 'VI7', 'ii7', 'V7'], ['Imaj7', 'vi7', 'ii7', 'bII7']];
function genTurn(level) {
  const key = pick(MAJ_KEYS);
  const v = pick(TURN);
  const at = rand(4);
  const valid = [...new Set(TURN.filter((t) => t.every((id, i) => i === at || id === v[i])).map((t) => t[at]))];
  const pool = ['Imaj7', 'iii7', 'vi7', 'ii7', 'V7', 'VI7', 'IVmaj7', 'bII7', 'iv7'];
  const blocks = [...valid, ...shuffle(pool.filter((id) => !valid.includes(id))).slice(0, 4 - valid.length + (valid.length === 1 ? 1 : 0))];
  return base(level, { key, goal: null, slots: phraseSlots(v.map((x, i) => (i === at ? '_' : x)), key, at, valid), active: at, style: 'sym', shapes: false, blocks: shuffle(blocks).map((id) => chordBlock(chordIn(id, key))) });
}
const LABELS = [['ii7', 'V7', 'Imaj7'], ['iv7', 'bVII7', 'Imaj7'], ['ii7', 'bII7', 'Imaj7'], ['Imaj7', 'vi7', 'ii7', 'V7'], ['iii7', 'VI7', 'ii7', 'V7'], ['Imaj7', 'VI7', 'ii7', 'V7']];
function genLabel(level) {
  const key = pick(MAJ_KEYS);
  const slots = pick(LABELS).map((id) => ({ given: chordIn(id, key), valid: null, placed: null, note: null, status: null, labelled: false }));
  return base(level, { mode: 'label', key, slots, active: 0, style: 'sym', blocks: ['rest', 'move', 'tension'].map((fam) => ({ kind: 'label', id: fam, fam })) });
}

const GEN = {
  1: (l, it) => genGoal(l, it), 2: (l, it) => genGoal(l, it), 3: (l) => genMelody(l), 4: (l) => genFamily(l),
  5: (l, it) => (it === 'minor' ? genMinor(l) : genSecdom(l)), 6: (l, it) => genIiVI(l, it),
  7: (l, it) => (it === 'scale' ? genScale(l) : genSub(l, it)), 8: (l, it) => (it === 'label' ? genLabel(l) : genTurn(l)),
};
const ITEMS = {
  1: () => ['goal:settled', 'goal:hanging'], 2: () => ['goal:settled', 'goal:hanging'], 3: () => ['melody'], 4: () => ['family'],
  5: () => ['minor', 'secdom'], 6: () => MAJ_KEYS.map((k) => 'iiVI:' + k.id), 7: () => ['tritone', 'backdoor', 'scale'], 8: () => ['turnaround', 'label'],
};

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const stats = await loadItemMastery(skillOf(level));
  if (id !== seq) return;
  const items = ITEMS[level]();
  const item = pickWeak(items, stats, { avoid: last });
  last = item;
  q = GEN[level](level, item);
  q.item = item;
  q.skill = skillOf(level);
  q.qid = ++qid;
  q.blocks = shuffle(q.blocks);
  missed = false;
  locked = false;
  render();
  quietUntil = 0;
  if (q.mode === 'scale') soundScale(null);
  else hear();
  started = performance.now();
}

// ---------- play ----------
function tapSlot(i) {
  const s = q.slots[i];
  if (locked) return;
  if (s.given) { playChord(s.given.midis, { dur: 1.2, gain: 0.34 }); test.last = { chord: s.given.midis, notes: [] }; return; }
  if (q.mode === 'label' || s.status === 'locked') return;
  if (s.placed) s.placed = null;
  q.active = i;
  render();
}
function tapBlock(b) {
  if (locked) return;
  if (q.mode === 'label') return tapLabel(b);
  soundBlock(b);
  let i = q.active;
  if (!q.slots[i] || q.slots[i].given || q.slots[i].status === 'locked') i = firstOpen();
  if (i < 0) return;
  q.slots[i].placed = b;
  q.active = i;
  const n = q.slots.findIndex((s, k) => k > i && !s.given && !s.placed && s.status !== 'locked');
  q.active = n >= 0 ? n : i;
  render();
}
const log = (correct, detail) => game.attempt({ skill: q.skill, correct, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail });
function succeed(delay) {
  locked = true;
  if (!missed) {
    streak++;
    if (streak >= 8) {
      if (q.level < MAX_LEVEL) nextBtn.classList.add('hl-show');
      else if (streak === 8) game.say(game.t('top'));
    }
    log(true, null);
  } else game.flash(true);
  render();
  timer = setTimeout(next, delay);
}
function fail(detail) {
  streak = 0;
  nextBtn.classList.remove('hl-show');
  if (missed) game.flash(false);
  else { missed = true; log(false, detail); }
}
function confirm() {
  if (locked || !q || okBtn.disabled) return;
  const open = q.slots.filter((s) => !s.given && s.status !== 'locked');
  const bad = open.filter((s) => !s.valid.has(s.placed.id));
  open.forEach((s) => { s.status = s.valid.has(s.placed.id) ? 'locked' : 'wrong'; });
  if (!bad.length) {
    render();
    if (q.mode === 'place') { quietUntil = 0; hear(); }
    succeed(q.mode === 'scale' ? 1300 : (q.slots.length + 1.5) * beat() * 1000);
    return;
  }
  fail(bad.map((s) => s.placed.id).join(','));
  render();
  timer = setTimeout(() => {
    bad.forEach((s) => { s.placed = null; s.status = null; });
    q.active = q.slots.indexOf(bad[0]);
    render();
  }, 800);
}
function tapLabel(b) {
  const s = q.slots[q.step];
  playChord(s.given.midis, { dur: 0.8, gain: 0.2 });
  if (b.fam === s.given.fam) {
    s.labelled = true;
    q.step++;
    if (q.step >= q.slots.length) { quietUntil = 0; hear(); return succeed((q.slots.length + 1.5) * beat() * 1000); }
    render();
  } else {
    fail(b.fam);
    s.status = 'wrong';
    render();
    timer = setTimeout(() => { s.status = null; render(); }, 600);
  }
}

window.__test = {
  state: () => q && {
    qid: q.qid, level: q.level, item: q.item, mode: q.mode, goal: q.goal, fam: q.fam, step: q.step, key: q.key, melody: q.melody, last: test.last,
    slots: q.slots.map((s) => ({ given: s.given && { id: s.given.id, rootPc: s.given.rootPc, pcs: s.given.pcs, type: s.given.type }, valid: s.valid ? [...s.valid] : null, placed: s.placed?.id ?? null, note: s.note, status: s.status })),
    blocks: q.blocks.map((b) => ({ id: b.id, kind: b.kind, rootPc: b.chord?.rootPc ?? b.root, pcs: b.chord?.pcs ?? b.pcs, type: b.chord?.type, fam: b.fam ?? b.chord?.fam })),
  },
};

game.ready().then(() => {
  game.stage.replaceChildren(prompt, staffBox, row, bar, tray, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('hl-show'); next(); });
  game.on('lang', render);
  next();
});
