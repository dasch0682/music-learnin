// Play the note: a note is written on the staff, play it on the keyboard or on a real instrument.
import { createGame } from '@core/shell.js';
import { renderStaff } from '@core/staff.js';
import { createKeyboard } from '@core/keyboard.js';
import { playNote } from '@core/audio.js';
import { startMic, micSupported } from '@core/pitch.js';
import { noteName, isNatural, mod } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'play-the-note',
  quiet: (ms) => sound(ms), // the shell tells us when it makes a sound: the microphone stays shut
  title: L('Play the note', 'Joue la note'),
  strings: {
    noMic: L('The microphone is not available. Use the keyboard, or allow it and try again.', 'Le micro n’est pas disponible. Joue sur le clavier, ou autorise-le puis réessaie.'),
    retry: L('Try again', 'Réessayer'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Treble clef, C to G', '1 · Clé de sol, de do à sol') },
      { value: 2, label: L('2 · Treble clef, one octave', '2 · Clé de sol, une octave') },
      { value: 3, label: L('3 · Treble clef, ledger lines', '3 · Clé de sol, lignes supplémentaires') },
      { value: 4, label: L('4 · Treble clef, sharps and flats', '4 · Clé de sol, dièses et bémols') },
      { value: 5, label: L('5 · Bass clef, one octave', '5 · Clé de fa, une octave') },
      { value: 6, label: L('6 · Bass clef, wide, sharps and flats', '6 · Clé de fa, étendue, dièses et bémols') },
    ] },
    { key: 'input', label: L('Play with', 'Jouer avec'), type: 'select', default: 'keyboard', options: [
      { value: 'keyboard', label: L('On-screen keyboard', 'Clavier à l’écran') },
      { value: 'mic', label: L('My instrument (microphone)', 'Mon instrument (micro)') },
    ] },
    { key: 'instrument', label: L('Instrument in', 'Instrument en'), type: 'select', default: 'C', options: [
      { value: 'C', label: L('C (concert pitch)', 'Do (ut)') },
      { value: 'Bb', label: L('B♭', 'Si♭') },
      { value: 'Eb', label: L('E♭', 'Mi♭') },
      { value: 'F', label: L('F', 'Fa') },
    ] },
    { key: 'labels', label: L('Note names on keys', 'Nom des notes sur les touches'), type: 'toggle', default: false },
    { key: 'hear', label: L('Hear the note', 'Entendre la note'), type: 'toggle', default: true },
  ],
});
const { h } = game;

const SKILL = 'play.note';
// Sounding note = written note + this many semitones (any octave is accepted with the microphone).
const TRANSPOSE = { C: 0, Bb: -2, Eb: -9, F: -7 };
const LEVELS = {
  1: { clef: 'treble', lo: 60, hi: 67 }, // C4–G4
  2: { clef: 'treble', lo: 60, hi: 72 }, // C4–C5
  3: { clef: 'treble', lo: 57, hi: 79 }, // A3–G5
  4: { clef: 'treble', lo: 60, hi: 72, acc: true },
  5: { clef: 'bass', lo: 48, hi: 60 }, // C3–C4
  6: { clef: 'bass', lo: 40, hi: 64, acc: true }, // E2–E4
};
const TOL = 0.4; // semitones
const HOLD_MS = 400, WRONG_MS = 1000, GAP_MS = 200, STREAK_UP = 10, MAX_WHITES = 11;

function pool(level) {
  const { clef, lo, hi, acc } = LEVELS[level];
  const out = [];
  for (let m = lo; m <= hi; m++) {
    if (isNatural(m)) out.push({ clef, midi: m, pref: 'sharp' });
    else if (acc) out.push({ clef, midi: m, pref: 'sharp' }, { clef, midi: m, pref: 'flat' });
  }
  return out;
}
const itemOf = (q) => `${q.clef}:${noteName(q.midi, { pref: q.pref, octave: true })}`;

/** Keyboard windows of a level: one if it fits on a phone, else two overlapping ones. */
function windows(level) {
  const { lo, hi } = LEVELS[level];
  const whites = [];
  for (let m = lo; m <= hi; m++) if (isNatural(m)) whites.push(m);
  if (whites.length <= MAX_WHITES + 1) return [[lo, hi]];
  return [[whites[0], whites[MAX_WHITES - 1]], [whites[whites.length - MAX_WHITES], whites[whites.length - 1]]];
}

// ---------- screen ----------
const staffBox = h('div', { className: 'pn-staff' });
const inputBox = h('div', { className: 'pn-input' });
const band = h('div', { className: 'pn-band' });
const dot = h('div', { className: 'pn-dot' });
const meter = h('div', { className: 'pn-meter' }, band, dot);
const kbBox = h('div', { style: 'width:100%' });
const offerBtn = h('button', { className: 'ml-btn ml-primary pn-offer pn-off' });

let started = false;
let mic = null, micFailed = false, manual = false;
let gen = 0;
let current = null, locked = true, wrongLogged = false, t0 = 0;
let streak = 0, last = null;
let kb = null, win = null, kbKey = '';
let quietAt = 0;
const micMode = () => game.settings.input === 'mic' && !micFailed;

function renderStaffNow(color) {
  if (!current) return;
  renderStaff(staffBox, { clef: current.clef, notes: [{ midi: current.midi, pref: current.pref, color }], width: 260 });
}
function renderInput(force = false) {
  offerBtn.textContent = game.t('nextLevel');
  offerBtn.classList.toggle('pn-off', !(streak >= STREAK_UP && +game.settings.level < 6));
  if (micMode()) { kbKey = ''; kb = null; inputBox.replaceChildren(meter); return; }
  const key = [win, game.settings.labels, game.settings.hear, game.lang, micFailed].join('|');
  if (key === kbKey && !force) return;
  kbKey = key;
  kb = createKeyboard(kbBox, { from: win[0], to: win[1], labels: !!game.settings.labels, sound: !!game.settings.hear, onDown: onKey });
  const kids = [kbBox];
  if (game.settings.input === 'mic' && micFailed) {
    const b = h('button', { className: 'ml-btn', textContent: game.t('retry') });
    b.onclick = () => restart();
    kids.unshift(h('div', { className: 'pn-msg' }, h('p', { className: 'ml-hint', textContent: game.t('noMic') }), b));
  }
  inputBox.replaceChildren(...kids);
}

// ---------- rounds ----------
async function next() {
  const my = ++gen;
  locked = true;
  const level = LEVELS[+game.settings.level] ? +game.settings.level : 1;
  const stats = await loadItemMastery(SKILL);
  if (my !== gen) return;
  current = pickWeak(pool(level), stats, { keyOf: itemOf, avoid: last });
  last = itemOf(current);
  wrongLogged = false;
  const ws = windows(level);
  const fits = (w) => w && current.midi >= w[0] && current.midi <= w[1];
  if (!ws.some((w) => String(w) === String(win)) || !fits(win)) win = ws.find(fits);
  renderStaffNow();
  renderInput();
  resetTrack();
  drawMic(null);
  t0 = performance.now();
  locked = false;
}

const sound = (ms) => { quietAt = Math.max(quietAt, performance.now() + ms + 150); };

async function right(keyMidi) {
  if (locked) return;
  locked = true;
  const my = gen;
  if (!wrongLogged) streak++;
  renderStaffNow('var(--good)');
  kb?.flash(keyMidi, 'ml-good', 450);
  const viaMic = keyMidi == null;
  const hearIt = !!game.settings.hear;
  if (viaMic && hearIt) { playNote(current.midi + (TRANSPOSE[game.settings.instrument] || 0), { dur: 0.5 }); sound(750); }
  await game.attempt({ skill: SKILL, correct: true, ms: Math.round(performance.now() - t0), level: +game.settings.level, item: itemOf(current), silent: hearIt });
  setTimeout(() => { if (my === gen) next(); }, viaMic && hearIt ? 800 : 500);
}

/** Wrong key or wrong note: counted once per note, then the player tries again. */
async function wrongAnswer(keyMidi) {
  if (locked) return;
  streak = 0;
  kb?.flash(keyMidi, 'ml-bad', 400);
  const silent = keyMidi != null && !!game.settings.hear; // the key already made its sound
  if (wrongLogged) return game.flash(false, { silent });
  wrongLogged = true;
  offerBtn.classList.add('pn-off');
  await game.attempt({ skill: SKILL, correct: false, ms: Math.round(performance.now() - t0), level: +game.settings.level, item: itemOf(current), silent });
}

function onKey(midi) {
  if (locked || !current) return;
  if (midi === current.midi) right(midi); else wrongAnswer(midi);
}

// ---------- microphone ----------
let recent = [], hold = 0, gap = 0, wrong = 0, anchor = null, lastT = 0;
function resetTrack() { recent = []; hold = 0; gap = 0; wrong = 0; anchor = null; }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const listening = () => micMode() && !locked && !!current && performance.now() >= quietAt;

function drawMic(d, inBand = false) {
  const perSemi = 42 / 6;
  dot.classList.toggle('pn-on', d != null);
  dot.classList.toggle('pn-in', d != null && inBand);
  if (d != null) dot.style.transform = `translateY(${(-Math.max(-6, Math.min(6, d)) * perSemi).toFixed(1)}px)`;
  dot.style.setProperty('--p', Math.min(1, hold / HOLD_MS).toFixed(2));
  meter.classList.toggle('pn-live', listening());
}

/** Every microphone reading goes through here (and the test hook too). */
function hear(p) {
  const now = performance.now();
  const dt = Math.min(120, now - lastT);
  lastT = now;
  if (!listening()) { resetTrack(); drawMic(null); return; }
  if (p.freq == null) {
    gap += dt;
    if (gap > GAP_MS) { resetTrack(); drawMic(null); }
    return;
  }
  gap = 0;
  recent.push(p.midi);
  if (recent.length > 5) recent.shift();
  if (recent.length < 3) return;
  const m = median(recent);
  const target = current.midi + (TRANSPOSE[game.settings.instrument] || 0);
  const d = mod(m - target + 6, 12) - 6; // any octave
  const inBand = Math.abs(d) <= TOL;
  if (inBand) { hold += dt; wrong = 0; anchor = null; }
  else {
    hold = Math.max(0, hold - dt);
    if (Math.abs(d) >= 0.7) {
      if (anchor == null || Math.abs(m - anchor) > 0.6) { anchor = m; wrong = 0; }
      else wrong += dt;
    } else { wrong = 0; anchor = null; }
  }
  drawMic(d, inBand);
  if (hold >= HOLD_MS) { resetTrack(); right(null); }
  else if (wrong >= WRONG_MS) { resetTrack(); drawMic(null); wrongAnswer(null); }
}

function stopMic() { mic?.stop(); mic = null; }
/** Start or stop the microphone to match the settings. A refusal falls back to the keyboard. */
async function syncMic() {
  if (game.settings.input !== 'mic' || document.hidden) { stopMic(); if (game.settings.input !== 'mic') micFailed = false; return; }
  if (mic) return;
  try {
    if (!micSupported()) throw new Error('no microphone');
    const m = await startMic({ onPitch: (p) => { if (!manual) hear(p); } });
    if (mic || game.settings.input !== 'mic' || document.hidden) m.stop(); else mic = m;
    micFailed = false;
  } catch { mic = null; micFailed = true; }
}
async function restart() {
  gen++;
  locked = true;
  await syncMic();
  kbKey = '';
  next();
}

document.addEventListener('visibilitychange', async () => {
  if (!started) return;
  if (document.hidden) stopMic();
  else if (game.settings.input === 'mic' && !mic) { await syncMic(); resetTrack(); renderInput(true); }
});
game.on('settings', () => { if (started) { streak = 0; restart(); } });
game.on('lang', () => { if (started) renderInput(true); });
offerBtn.onclick = () => { if (+game.settings.level < 6) game.set('level', +game.settings.level + 1); };

// Test hook: feed(midi | null) pushes a reading into the same handler as the microphone.
window.__test = {
  feed(midi) { manual = true; hear(midi == null ? { freq: null, midi: null } : { freq: 440 * 2 ** ((midi - 69) / 12), midi }); },
  state: () => ({ item: current && itemOf(current), midi: current?.midi, win, micMode: micMode(), micFailed, micOn: !!mic, listening: listening(), locked, streak, wrongLogged, hold }),
};

game.ready().then(() => {
  started = true;
  game.stage.replaceChildren(staffBox, inputBox, offerBtn);
  restart();
});
