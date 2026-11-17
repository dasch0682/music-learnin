// Write the tune: hear a short melody, the first note is written, play the others on the keyboard and see them on the staff.
import { createGame } from '@core/shell.js';
import { renderStaff } from '@core/staff.js';
import { createKeyboard } from '@core/keyboard.js';
import { playNote, audioTime } from '@core/audio.js';
import { spell, mod, pick, rand } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const SKILL = 'listen.dictation', MAX_LEVEL = 6, CLEAN = 6;
const game = createGame({
  id: 'melody-dictation',
  title: L('Write the tune', 'Écris la mélodie'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    undo: L('Undo', 'Annuler'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Three notes, five-note scale', '1 · Trois notes, gamme de cinq notes') },
      { value: 2, label: L('2 · Four notes, steps and thirds', '2 · Quatre notes, degrés et tierces') },
      { value: 3, label: L('3 · Five notes, leaps', '3 · Cinq notes, sauts') },
      { value: 4, label: L('4 · Six notes, key signatures', '4 · Six notes, armures') },
      { value: 5, label: L('5 · Minor keys', '5 · Tons mineurs') },
      { value: 6, label: L('6 · Eight notes, chromatic, two clefs', '6 · Huit notes, chromatisme, deux clés') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 120, step: 5, default: 80 },
  ],
});

// ---------- keys and scales ----------
const NAT = [0, 2, 4, 5, 7, 9, 11]; // pitch class of C D E F G A B
const MAJOR = [0, 2, 4, 5, 7, 9, 11], HARMONIC = [0, 2, 3, 5, 7, 8, 11], PENTA = [0, 2, 4, 7, 9];
// letter: 0 = C … 6 = B. sig: key signature (flats negative). Minor keys use the harmonic scale (raised seventh).
const KEYS = {
  C: { tonic: 0, letter: 0, sig: 0 }, G: { tonic: 7, letter: 4, sig: 1 }, F: { tonic: 5, letter: 3, sig: -1 },
  D: { tonic: 2, letter: 1, sig: 2 }, Bb: { tonic: 10, letter: 6, sig: -2 },
  Am: { tonic: 9, letter: 5, sig: 0, minor: true }, Em: { tonic: 4, letter: 2, sig: 1, minor: true },
  Dm: { tonic: 2, letter: 1, sig: -1, minor: true }, Gm: { tonic: 7, letter: 4, sig: -2, minor: true },
};
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const keyAcc = (sig, letter) => (sig > 0 && SHARP_ORDER.indexOf(letter) < sig ? 1 : sig < 0 && FLAT_ORDER.indexOf(letter) < -sig ? -1 : 0);

/** Pitch class → { letter, acc } for the 7 degrees of the key. */
function scaleSpelling(key) {
  const out = new Map();
  (key.minor ? HARMONIC : MAJOR).forEach((iv, k) => {
    const letter = (key.letter + k) % 7, pc = mod(key.tonic + iv, 12);
    out.set(pc, { letter, acc: mod(pc - NAT[letter] + 6, 12) - 6 });
  });
  return out;
}
/** Staff note for a MIDI value with a given spelling. The accidental is hidden when the key signature already gives it. */
function headOf(midi, letter, acc, sig, color) {
  const oct = Math.floor((midi - acc) / 12) - 1;
  const note = { midi, spell: [{ step: oct * 7 + letter, acc }] };
  const ka = keyAcc(sig, letter);
  if (acc === ka) note.acc = false;
  else if (acc === 0) note.acc = 'natural';
  if (color) note.color = color;
  return note;
}

// ---------- levels ----------
// moves: weighted interval sizes in scale steps. n: possible lengths. keys: tonalities. range: keyboard and staff range.
const TREBLE = [60, 76], BASS = [43, 60];
const LEVELS = {
  1: { n: [3], keys: ['C'], scale: PENTA, range: [60, 69], moves: [[1, 1]], clef: 'treble' },
  2: { n: [4], keys: ['C'], scale: MAJOR, range: [60, 72], moves: [[1, 3], [2, 2]], clef: 'treble' },
  3: { n: [5], keys: ['C'], scale: MAJOR, range: TREBLE, moves: [[1, 3], [2, 2], [3, 1], [4, 1]], leaps: 1, clef: 'treble' },
  4: { n: [6], keys: ['G', 'F', 'D', 'Bb'], range: TREBLE, moves: [[0, 1], [1, 4], [2, 2], [3, 1], [4, 1]], leaps: 1, clef: 'treble' },
  5: { n: [6, 7], keys: ['Am', 'Em', 'Dm', 'Gm'], range: TREBLE, moves: [[0, 1], [1, 4], [2, 2], [3, 1], [4, 1]], leaps: 1, clef: 'treble', raised: true },
  6: { n: [8], keys: ['C', 'G', 'F'], range: null, moves: [[1, 4], [2, 2], [3, 1]], leaps: 1, chromatic: true },
};

const wsum = (arr) => arr.reduce((a, [, w]) => a + w, 0);
function weighted(arr) {
  let r = Math.random() * wsum(arr);
  for (const [v, w] of arr) { r -= w; if (r <= 0) return v; }
  return arr[arr.length - 1][0];
}

/** One melody as a list of { midi, letter, acc } (null spelling = decided by direction), or null if this try was not musical. */
function tryMelody(cfg, key, clef, range, n) {
  const spelling = scaleSpelling(key);
  const scale = cfg.scale || (key.minor ? HARMONIC : MAJOR);
  const pcs = new Set(scale.map((iv) => mod(key.tonic + iv, 12)));
  const pool = [];
  for (let m = range[0]; m <= range[1]; m++) if (pcs.has(mod(m, 12))) pool.push(m);
  const leadPc = mod(key.tonic + 11, 12);
  const ends = pool.map((m, i) => [m, i]).filter(([m]) => mod(m - key.tonic, 12) === 0 || mod(m - key.tonic, 12) === 7).map(([, i]) => i);
  if (!ends.length) return null;
  const extra = cfg.chromatic ? 1 + rand(2) : 0; // chromatic passing notes added between whole-tone steps
  const len = n - extra;
  const idx = new Array(len);
  idx[len - 1] = pick(ends);
  let leaps = 0, lastLeap = false;
  for (let i = len - 2; i >= 0; i--) {
    const size = weighted(cfg.moves);
    const leap = size >= 3;
    if (leap && (leaps >= (cfg.leaps ?? 0) || lastLeap)) return null;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const j = idx[i + 1] + dir * size;
    if (j < 0 || j >= pool.length) return null;
    if (leap) leaps++;
    lastLeap = leap;
    idx[i] = j;
  }
  if (cfg.moves.every(([s]) => s !== 0) && idx.some((v, i) => i && v === idx[i - 1])) return null;
  if (new Set(idx).size < Math.min(3, len - 1)) return null;
  const midis = idx.map((i) => pool[i]);
  if (cfg.raised) { // the raised seventh must lead to the tonic, and appear at least once
    const lead = midis.map((m, i) => (mod(m, 12) === leadPc ? i : -1)).filter((i) => i >= 0);
    if (!lead.length) return null;
    if (!lead.every((i) => [midis[i - 1], midis[i + 1]].some((m) => m != null && mod(m - key.tonic, 12) === 0))) return null;
    if (midis.some((m, i) => i && Math.abs(m - midis[i - 1]) === 3 && Math.abs(idx[i] - idx[i - 1]) === 1)) return null; // no augmented second
  }
  const notes = midis.map((m) => ({ midi: m, ...spelling.get(mod(m, 12)) }));
  if (extra) {
    const gaps = [];
    for (let i = 1; i < len; i++) if (Math.abs(idx[i] - idx[i - 1]) === 1 && Math.abs(midis[i] - midis[i - 1]) === 2) gaps.push(i);
    if (gaps.length < extra) return null;
    const chosen = gaps.sort(() => Math.random() - 0.5).slice(0, extra).sort((a, b) => b - a);
    for (const i of chosen) {
      const m = (midis[i] + midis[i - 1]) / 2;
      const sp = spell(m, midis[i] > midis[i - 1] ? 'sharp' : 'flat');
      notes.splice(i, 0, { midi: m, letter: sp.letter, acc: sp.acc });
    }
  }
  return notes;
}
function makeMelody(level) {
  const cfg = LEVELS[level];
  for (let t = 0; t < 400; t++) {
    const key = KEYS[pick(cfg.keys)];
    const clef = cfg.clef || pick(['treble', 'bass']);
    const range = cfg.range || (clef === 'bass' ? BASS : TREBLE);
    const n = pick(cfg.n);
    const notes = tryMelody(cfg, key, clef, range, n);
    if (notes) return { key, clef, range, n, notes };
  }
  throw new Error('no melody');
}

// ---------- screen ----------
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const UNDO = '<svg viewBox="0 0 64 64" width="28" height="28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 14 8 28l14 14"/><path d="M8 28h30a16 16 0 0 1 0 32H24"/></svg>';
const staffBox = game.h('div', { className: 'md-staff' });
const dots = game.h('div', { className: 'md-dots' });
const kbBox = game.h('div', { className: 'md-kb' });
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const undo = game.h('button', { className: 'md-undo', innerHTML: UNDO });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary md-next' });
replay.onclick = () => play();
undo.onclick = () => back();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

let q = null, entered = [], marks = null, started = 0, streak = 0, missed = false, locked = true, seq = 0, timer = 0, quietUntil = 0, kb = null, kbKey = '';

/** Spelling of a key pressed at position i: the melody's own spelling if it is the right note, else the key's, else by direction. */
function headFor(midi, i, color) {
  const target = q.notes[i + 1];
  const sig = q.key.sig;
  if (target && target.midi === midi) return headOf(midi, target.letter, target.acc, sig, color);
  const sc = scaleSpelling(q.key).get(mod(midi, 12));
  if (sc) return headOf(midi, sc.letter, sc.acc, sig, color);
  const prev = i === 0 ? q.notes[0].midi : entered[i - 1];
  const sp = spell(midi, midi > prev ? 'sharp' : 'flat');
  return headOf(midi, sp.letter, sp.acc, sig, color);
}
function drawStaff() {
  if (!q) return;
  const first = q.notes[0];
  const heads = [headOf(first.midi, first.letter, first.acc, q.key.sig), ...entered.map((m, i) => headFor(m, i, marks ? (marks[i] ? 'var(--good)' : 'var(--bad)') : undefined))];
  renderStaff(staffBox, { clef: q.clef, keySig: q.key.sig, notes: heads, width: 340, gap: 12 });
  dots.replaceChildren(...q.notes.slice(1).map((_, i) => game.h('span', { className: 'md-dot' + (i < entered.length ? (marks ? (marks[i] ? ' md-ok' : ' md-bad') : ' md-on') : '') })));
  undo.disabled = !entered.length || locked;
}
function drawKeyboard() {
  const key = [q.range, game.lang].join();
  if (key === kbKey) return;
  kbKey = key;
  kb = createKeyboard(kbBox, { from: q.range[0], to: q.range[1], onDown: press });
}
function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  undo.setAttribute('aria-label', game.t('undo'));
  nextBtn.textContent = game.t('next');
  drawKeyboard();
  drawStaff();
}

function play() {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return; // already sounding
  const beat = 60 / (+game.settings.tempo || 80);
  q.notes.forEach((nt, i) => playNote(nt.midi, { when: 0.05 + i * beat, dur: (i === q.notes.length - 1 ? 1.8 : 0.9) * beat, gain: 0.3 }));
  quietUntil = now + (q.notes.length + 1.2) * beat * 1000;
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  locked = true;
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const item = pickWeak(cfg.n.map(String), stats);
  const m = makeMelody(level);
  // The weak item decides the length when the level has several.
  const want = +item;
  let melody = m;
  if (m.n !== want) for (let t = 0; t < 50 && melody.n !== want; t++) melody = makeMelody(level);
  q = { level, item: String(melody.n), ...melody };
  entered = [];
  marks = null;
  missed = false;
  locked = false;
  render();
  quietUntil = 0;
  play();
  started = performance.now();
}

function press(midi) {
  if (!q || locked) return;
  clearTimeout(timer);
  if (marks) { entered = entered.slice(0, marks.indexOf(false)); marks = null; } // keep what was right before the first mistake
  if (entered.length >= q.n - 1) return;
  entered.push(midi);
  drawStaff();
  if (entered.length === q.n - 1) {
    locked = true;
    undo.disabled = true;
    const cur = q;
    timer = setTimeout(() => cur === q && check(), 500);
  }
}

function back() {
  if (!q || locked) return;
  clearTimeout(timer);
  if (marks) { entered = entered.slice(0, marks.indexOf(false)); marks = null; } else entered.pop();
  drawStaff();
}

async function check() {
  marks = entered.map((m, i) => m === q.notes[i + 1].midi);
  const ok = marks.every(Boolean);
  drawStaff();
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : entered.join(',') };
  const cur = q;
  if (ok) {
    kb?.flash(entered[entered.length - 1], 'ml-good', 400);
    if (missed) game.flash(true);
    else {
      streak++;
      if (streak >= CLEAN) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('md-show');
        else if (streak === CLEAN) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 1300);
  } else {
    streak = 0;
    nextBtn.classList.remove('md-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    if (cur !== q) return;
    locked = false;
    undo.disabled = false;
    timer = setTimeout(() => { if (cur === q) { quietUntil = 0; play(); } }, 900); // hear it again, then correct
  }
}

window.__test = { state: () => ({ level: q?.level, item: q?.item, n: q?.n, key: q && Object.keys(KEYS).find((k) => KEYS[k] === q.key), sig: q?.key.sig, clef: q?.clef, range: q?.range, melody: q?.notes.map((n) => n.midi), spelling: q?.notes.map((n) => [n.letter, n.acc]), entered: [...entered], marks, locked }) };

game.ready().then(() => {
  game.stage.replaceChildren(staffBox, dots, kbBox, game.h('div', { className: 'md-row' }, replay, undo), nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('md-show'); next(); });
  game.on('lang', () => { kbKey = ''; render(); });
  next();
});
