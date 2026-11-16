// Sight-singing: a melody is written on the staff. The app plays the first note only; the player sings the rest.
// Pitch tracking works as in second-voice: a note is held ~0.6 s, in any octave. The app never listens while it plays.
import { createGame } from '@core/shell.js';
import { playNote, playSeq, wait } from '@core/audio.js';
import { startMic, micSupported } from '@core/pitch.js';
import { mod, pick, rand } from '@core/music.js';
import { renderStaff } from '@core/staff.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const game = createGame({
  id: 'sight-sing',
  title: L('Sing the score', 'Chante la partition'),
  strings: {
    noMic: L('The microphone is not available. Allow it, then try again.', 'Le micro n’est pas disponible. Autorise-le, puis réessaie.'),
    retry: L('Try again', 'Réessayer'),
    skip: L('Skip', 'Passer'),
    first: L('First note again', 'Première note encore'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
    listen: L('Listen…', 'Écoute…'),
    sing: L('Sing!', 'Chante !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Two or three notes by step', '1 · Deux ou trois notes par degrés') },
      { value: 2, label: L('2 · Five-note scale', '2 · Gamme de cinq notes') },
      { value: 3, label: L('3 · Steps, thirds, tonic triad', '3 · Degrés, tierces, accord parfait') },
      { value: 4, label: L('4 · Leaps up to a fifth', '4 · Sauts jusqu’à la quinte') },
      { value: 5, label: L('5 · Other keys', '5 · Autres tonalités') },
      { value: 6, label: L('6 · Minor keys, one accidental', '6 · Tons mineurs, une altération') },
    ] },
    { key: 'voice', label: L('Voice', 'Voix'), type: 'select', default: 'child', options: [
      { value: 'child', label: L('Child', 'Enfant') },
      { value: 'high', label: L('High', 'Aiguë') },
      { value: 'medium', label: L('Medium', 'Moyenne') },
      { value: 'low', label: L('Low', 'Grave') },
    ] },
    { key: 'tolerance', label: L('Accuracy', 'Justesse'), type: 'select', default: 50, options: [
      { value: 65, label: L('Easy', 'Facile') },
      { value: 50, label: L('Normal', 'Normale') },
      { value: 30, label: L('Precise', 'Précise') },
    ] },
  ],
});
const { h } = game;

const VOICES = { child: [60, 69], high: [57, 74], medium: [48, 62], low: [43, 57] };
const SKILL = 'sing.sight';
const PC = [0, 2, 4, 5, 7, 9, 11]; // natural letters C D E F G A B
const SEMI = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
// tonic: midi of the tonic, ts: diatonic step of its letter (C4 = 28), sig: key signature (flats < 0).
const MAJORS = { C: { mode: 'major', midi: 60, ts: 28, sig: 0 }, G: { mode: 'major', midi: 67, ts: 32, sig: 1 }, F: { mode: 'major', midi: 65, ts: 31, sig: -1 }, D: { mode: 'major', midi: 62, ts: 29, sig: 2 }, Bb: { mode: 'major', midi: 70, ts: 34, sig: -2 } };
const MINORS = { Am: { mode: 'minor', midi: 69, ts: 33, sig: 0 }, Em: { mode: 'minor', midi: 64, ts: 30, sig: 1 }, Dm: { mode: 'minor', midi: 62, ts: 29, sig: -1 }, Gm: { mode: 'minor', midi: 67, ts: 32, sig: -2 } };
const PENT = [0, 1, 2, 4, 5, 7]; // C D E G A C, as degrees of the major scale
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B, as letter indexes (C = 0)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const sigAcc = (sig, letter) => (sig > 0 && SHARP_ORDER.slice(0, sig).includes(letter) ? 1 : sig < 0 && FLAT_ORDER.slice(0, -sig).includes(letter) ? -1 : 0);

const HOLD_MS = 600; // in-tune singing needed on each note
const WRONG_MS = 2000; // steady wrong note before it counts as a mistake
const GAP_MS = 250; // dropouts shorter than this are ignored
const GRACE_MS = 350; // after a note is sung, the voice may still be on it
const STREAK_UP = 6;

const near = (a, b) => mod(a - b + 6, 12) - 6; // signed distance, any octave

// ---------- melodies ----------
/** pos = positions in the level's scale (diatonic degrees, or the five-note scale). Returns notes with midi, step, acc. */
function notesOf(key, degs) {
  return degs.map(({ d, up }) => {
    const semi = SEMI[key.mode][mod(d, 7)] + (up ? 1 : 0) + 12 * Math.floor(d / 7);
    return { midi: key.midi + semi, step: key.ts + d, up: !!up };
  });
}
function rangeOf(notes) { return Math.max(...notes.map((n) => n.step)) - Math.min(...notes.map((n) => n.step)) + 1; }
function walk(len, start, deltas, lo, hi) {
  const out = [start];
  while (out.length < len) {
    const ok = deltas.map((d) => out[out.length - 1] + d).filter((p) => p >= lo && p <= hi);
    if (!ok.length) return null;
    out.push(pick(ok));
  }
  return out;
}
const dg = (arr, map = (x) => x) => arr.map((p) => ({ d: map(p) }));

function candidate(level) {
  if (level === 1) {
    const w = walk(2 + rand(2), 0, [-1, 1], 0, 4);
    return w && { key: MAJORS.C, degs: dg(w, (p) => PENT[p]), pent: true };
  }
  if (level === 2) {
    const w = walk(3 + rand(2), rand(6), [-1, 1], 0, 5);
    return w && { key: MAJORS.C, degs: dg(w, (p) => PENT[p]), pent: true };
  }
  if (level === 3) {
    if (Math.random() < 0.3) return { key: MAJORS.C, degs: dg(pick([[0, 2, 4], [4, 2, 0], [0, 2, 4, 2], [2, 0, 2, 4]])), pent: false };
    const w = walk(3 + rand(2), pick([0, 2, 4]), [-2, -1, 1, 2], 0, 7);
    return w && { key: MAJORS.C, degs: dg(w), pent: false };
  }
  if (level === 4 || level === 5) {
    const key = level === 4 ? MAJORS.C : MAJORS[pick(['G', 'F', 'D', 'Bb'])];
    const w = walk(5, pick([0, 4]), level === 4 ? [-4, -2, -1, -1, 1, 1, 2, 4] : [-2, -1, -1, 1, 1, 2, 4, -4], 0, 7);
    if (!w || ![0, 4, 7].includes(w[4])) return null;
    if (level === 4 && !w.some((p, i) => i && Math.abs(p - w[i - 1]) === 4)) return null;
    return { key, degs: dg(w), pent: false };
  }
  // Level 6: minor, six notes, the raised seventh (leading tone) once, then the tonic.
  const w = walk(4, pick([0, 2, 4]), [-2, -1, 1, 2], 0, 7);
  // The natural seventh is left out: only the raised one appears, as the single accidental.
  if (!w || ![4, 5, 7].includes(w[3]) || w.includes(6)) return null;
  return { key: MINORS[pick(Object.keys(MINORS))], degs: [...dg(w), { d: 6, up: true }, { d: 7 }], pent: false };
}

async function build(level) {
  const stats = await loadItemMastery(SKILL);
  const pool = new Map();
  for (let i = 0; i < 600 && pool.size < 12; i++) {
    const c = candidate(level);
    if (!c) continue;
    c.notes = notesOf(c.key, c.degs);
    c.item = c.notes.length + ':' + rangeOf(c.notes);
    if (!pool.has(c.item)) pool.set(c.item, []);
    pool.get(c.item).push(c);
  }
  const item = pickWeak([...pool.keys()], stats, { avoid: last });
  const c = pick(pool.get(item));
  // The voice setting moves the melody by octaves so that it sits in the voice.
  const [lo, hi] = VOICES[game.settings.voice] || VOICES.child;
  const mids = c.notes.map((n) => n.midi);
  const mid = (Math.min(...mids) + Math.max(...mids)) / 2;
  let k = 0, best = 1e9;
  for (let o = -3; o <= 2; o++) if (Math.abs(mid + 12 * o - (lo + hi) / 2) < best) { best = Math.abs(mid + 12 * o - (lo + hi) / 2); k = o; }
  const notes = c.notes.map((n) => {
    const step = n.step + 7 * k, midi = n.midi + 12 * k;
    const letter = mod(step, 7), actual = midi - (12 * (Math.floor(step / 7) + 1) + PC[letter]);
    const sig = sigAcc(c.key.sig, letter);
    return { midi, step, acc: actual, show: actual === sig ? false : actual === 0 ? 'natural' : undefined };
  });
  const center = notes.reduce((s, n) => s + n.midi, 0) / notes.length;
  return {
    level, item, notes, keySig: c.key.sig, clef: center < 57 ? 'bass' : 'treble', pent: c.pent,
    idx: 0, wrongLogged: false, listening: false, playing: false, done: false, t0: 0,
  };
}

// ---------- screen ----------
const staffBox = h('div', { className: 'ss-staff' });
const hint = h('p', { className: 'ml-hint' });
const arrow = h('div', { className: 'ss-arrow' });
const barFill = h('i', {});
const live = h('div', { className: 'ss-live' }, arrow, h('div', { className: 'ss-bar' }, barFill));
const firstBtn = h('button', { className: 'ml-round', textContent: '♪' });
const skipBtn = h('button', { className: 'ml-btn ss-skip' });
const controls = h('div', { className: 'ss-controls' }, firstBtn, skipBtn);
const offerBtn = h('button', { className: 'ml-btn ml-primary ss-offer ss-off' });

let started = false, view = 'start', mic = null, manual = false;
let gen = 0, round = null, streak = 0, last = null, quietAt = 0;

function showGame() {
  view = 'game';
  game.stage.replaceChildren(hint, staffBox, live, controls, offerBtn);
  render();
}
function showError() {
  view = 'error';
  const b = h('button', { className: 'ml-btn ml-primary', textContent: game.t('retry') });
  b.onclick = () => begin();
  game.stage.replaceChildren(h('p', { className: 'ml-prompt', textContent: game.t('noMic') }), b);
}

function render() {
  skipBtn.textContent = game.t('skip');
  firstBtn.setAttribute('aria-label', game.t('first'));
  offerBtn.textContent = game.t('nextLevel');
  if (!round) { staffBox.replaceChildren(); hint.textContent = ''; return; }
  const r = round;
  renderStaff(staffBox, {
    clef: r.clef, keySig: r.keySig, width: 340, gap: 12,
    notes: r.notes.map((n, i) => ({
      midi: n.midi, spell: [{ step: n.step, acc: n.acc }], acc: n.show,
      color: i < r.idx ? 'var(--good)' : i === r.idx && !r.done ? 'var(--accent)' : undefined,
    })),
  });
  hint.textContent = r.done ? '' : game.t(r.listening ? 'sing' : 'listen');
  offerBtn.classList.toggle('ss-off', !(streak >= STREAK_UP && r.level < MAX_LEVEL));
}

// ---------- pitch tracking ----------
let recent = [], hold = 0, gap = 0, wrong = 0, anchor = null, lastT = 0, graceUntil = 0;
function resetTrack() { recent = []; hold = 0; gap = 0; wrong = 0; anchor = null; }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** dir: +1 sing higher, -1 sing lower, 0 in tune, null nothing heard */
function draw(dir) {
  arrow.classList.toggle('ss-on', dir != null);
  arrow.classList.toggle('ss-in', dir === 0);
  arrow.textContent = dir === 0 ? '●' : dir > 0 ? '↑' : dir < 0 ? '↓' : '';
  barFill.style.width = (Math.min(1, hold / HOLD_MS) * 100).toFixed(0) + '%';
}

/** Every microphone reading goes through here (and the test hook too). p = { freq, midi } */
function hear(p) {
  const now = performance.now();
  const dt = Math.min(120, now - lastT);
  lastT = now;
  if (!round || !round.listening || now < quietAt || now < graceUntil) { resetTrack(); draw(null); return; }
  const target = round.notes[round.idx].midi;
  const tol = +game.settings.tolerance / 100;
  const midi = p.freq == null ? null : p.midi;
  if (midi == null) {
    gap += dt;
    if (gap > GAP_MS) { resetTrack(); draw(null); }
    return;
  }
  gap = 0;
  recent.push(midi);
  if (recent.length > 5) recent.shift();
  if (recent.length < 3) return;
  const m = median(recent);
  const off = near(m, target); // > 0: the voice is above the note
  const d = Math.abs(off);
  if (d <= tol) { hold += dt; wrong = 0; anchor = null; }
  else {
    hold = Math.max(0, hold - dt);
    if (d >= Math.max(1, tol + 0.5)) {
      if (anchor == null || Math.abs(m - anchor) > 0.75) { anchor = m; wrong = 0; }
      else wrong += dt;
    } else { wrong = 0; anchor = null; }
  }
  draw(d <= tol ? 0 : off > 0 ? -1 : 1);
  if (hold >= HOLD_MS) hit();
  else if (wrong >= WRONG_MS) miss();
}

// ---------- sound ----------
const sound = (ms) => { quietAt = Math.max(quietAt, performance.now() + ms + 150); };
const sing = (midi, dur = 1) => { playNote(midi, { timbre: 'voice', dur, gain: 0.3 }); sound((dur + 0.15) * 1000); };

// ---------- rounds ----------
async function next() {
  const my = ++gen;
  if (round) round.listening = false;
  const r = await build(+game.settings.level || 1);
  if (my !== gen) return;
  round = r;
  last = r.item;
  resetTrack();
  present(my);
}

/** Give the first note, then listen from the first note. */
async function present(my = gen) {
  const r = round;
  if (!r || r.done || r.playing) return;
  r.playing = true;
  r.listening = false;
  r.idx = 0;
  resetTrack();
  render();
  draw(null);
  firstBtn.classList.add('ss-busy');
  await wait(Math.max(0, quietAt - performance.now()) + 250);
  if (my === gen) {
    sing(r.notes[0].midi, 1);
    await wait(1100);
    await wait(Math.max(0, quietAt - performance.now()));
  }
  r.playing = false;
  if (my !== gen) return;
  firstBtn.classList.remove('ss-busy');
  if (!r.t0) r.t0 = performance.now();
  r.listening = true;
  render();
  draw(null);
}

/** The first note again, without losing the notes already sung. */
async function firstAgain() {
  const r = round, my = gen;
  if (!r || r.done || r.playing) return;
  r.playing = true;
  r.listening = false;
  resetTrack();
  render();
  draw(null);
  firstBtn.classList.add('ss-busy');
  sing(r.notes[0].midi, 1);
  await wait(1100);
  await wait(Math.max(0, quietAt - performance.now()));
  r.playing = false;
  firstBtn.classList.remove('ss-busy');
  if (my !== gen) return;
  graceUntil = performance.now() + GRACE_MS;
  r.listening = true;
  render();
}

async function log(r, correct) {
  await game.attempt({ skill: SKILL, correct, ms: Math.round(performance.now() - r.t0), level: r.level, item: r.item });
}

async function hit() {
  const r = round, my = gen;
  resetTrack();
  draw(null);
  graceUntil = performance.now() + GRACE_MS;
  if (r.idx < r.notes.length - 1) { r.idx++; render(); return; }
  r.listening = false;
  r.done = true;
  r.idx = r.notes.length;
  if (!r.wrongLogged) streak++;
  render();
  sound(r.notes.length * 600 + 300);
  await log(r, true);
  await wait(300);
  if (my !== gen) return;
  await playSeq(r.notes.map((n) => n.midi), { bpm: 100, timbre: 'voice', gain: 0.3 });
  await wait(300);
  if (my === gen) next();
}

/** A clearly wrong note was held: counts once, then the melody starts again from its first note. */
async function miss() {
  const r = round, my = gen;
  r.listening = false;
  resetTrack();
  draw(null);
  streak = 0;
  render();
  if (r.wrongLogged) { sound(450); game.flash(false); }
  else { r.wrongLogged = true; sound(450); await log(r, false); }
  await wait(700);
  if (my === gen) present(my);
}

async function skip() {
  const r = round;
  if (!r || r.done) return;
  r.done = true;
  r.listening = false;
  gen++;
  streak = 0;
  if (!r.wrongLogged) await log(r, false);
  next();
}

firstBtn.onclick = firstAgain;
skipBtn.onclick = skip;
offerBtn.onclick = () => { if (+game.settings.level < MAX_LEVEL) game.set('level', +game.settings.level + 1); };

// ---------- microphone ----------
function stopMic() { mic?.stop(); mic = null; }
async function begin() {
  stopMic();
  try {
    if (!micSupported()) throw new Error('no microphone');
    mic = await startMic({ onPitch: (p) => { if (!manual) hear(p); } });
  } catch {
    mic = null;
    gen++;
    round = null;
    showError();
    return;
  }
  if (document.hidden) return stopMic();
  showGame();
  next();
}

document.addEventListener('visibilitychange', () => {
  if (!started) return;
  if (document.hidden) {
    gen++;
    if (round) round.listening = false;
    round = null;
    stopMic();
  } else if (!mic) begin();
});
game.on('settings', () => { if (view === 'game') { streak = 0; next(); } });
game.on('lang', () => { if (view === 'game') render(); else if (view === 'error') showError(); });

// Test hook: feed(midi | null) pushes a reading into the same handler as the microphone.
window.__test = {
  feed(midi) { manual = true; hear(midi == null ? { freq: null, midi: null } : { freq: 440 * 2 ** ((midi - 69) / 12), midi }); },
  state: () => ({
    view, level: round?.level, item: round?.item, idx: round?.idx, keySig: round?.keySig, clef: round?.clef,
    notes: round?.notes.map((n) => ({ midi: n.midi, step: n.step, acc: n.acc })),
    listening: !!round?.listening && performance.now() >= quietAt, done: round?.done, streak, wrongLogged: round?.wrongLogged,
  }),
};

game.ready().then(() => { started = true; begin(); });
