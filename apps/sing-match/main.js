// Sing it: the app plays, the player sings back. A dot shows the sung pitch against the target line.
import { createGame } from '@core/shell.js';
import { playNote, playSeq, startDrone, wait } from '@core/audio.js';
import { startMic, micSupported } from '@core/pitch.js';
import { INTERVALS, LETTERS, noteName, scaleNotes, isNatural, mod, pick, rand } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'sing-match',
  title: L('Sing it', 'Chante-la'),
  strings: {
    noMic: L('The microphone is not available. Allow it, then try again.', 'Le micro n’est pas disponible. Autorise-le, puis réessaie.'),
    retry: L('Try again', 'Réessayer'),
    skip: L('Skip', 'Passer'),
    replay: L('Listen again', 'Réécouter'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Sing one note', '1 · Chanter une note') },
      { value: 2, label: L('2 · One note, heard once', '2 · Une note, entendue une seule fois') },
      { value: 3, label: L('3 · Short five-note tune', '3 · Petit air sur cinq notes') },
      { value: 4, label: L('4 · Intervals', '4 · Intervalles') },
      { value: 5, label: L('5 · Scale degrees', '5 · Degrés de la gamme') },
    ] },
    { key: 'voice', label: L('Voice', 'Voix'), type: 'select', default: 'child', options: [
      { value: 'child', label: L('Child', 'Enfant') },
      { value: 'high', label: L('High', 'Aiguë') },
      { value: 'medium', label: L('Medium', 'Moyenne') },
      { value: 'low', label: L('Low', 'Grave') },
    ] },
    { key: 'tolerance', label: L('Accuracy', 'Justesse'), type: 'select', default: 40, options: [
      { value: 60, label: L('Easy', 'Facile') },
      { value: 40, label: L('Normal', 'Normale') },
      { value: 25, label: L('Precise', 'Précise') },
    ] },
  ],
});
const { h } = game;

// Comfortable ranges (MIDI). easy = narrow middle part used by level 1. tonic = C used by level 5.
const VOICES = {
  child: { lo: 60, hi: 69, easy: [60, 67], tonic: 60 }, // C4–A4
  high: { lo: 57, hi: 74, easy: [60, 69], tonic: 60 }, // A3–D5
  medium: { lo: 48, hi: 62, easy: [52, 60], tonic: 48 }, // C3–D4
  low: { lo: 43, hi: 57, easy: [45, 55], tonic: 48 }, // G2–A3
};
const SKILL = { 1: 'sing.match', 2: 'sing.match', 3: 'sing.penta', 4: 'sing.intervals', 5: 'sing.scale' };
const INTERVAL_STAGES = [['M2', 'M3', 'P5', 'P8'], ['m3', 'P4', 'M6'], ['m2', 'm6', 'm7', 'M7', 'TT']];
const DEGREE_STAGES = [['1', '3', '5'], ['2', '4'], ['6', '7']];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const HOLD_MS = 700; // in-tune singing needed
const WRONG_MS = 1500; // steady wrong note before it counts as a mistake
const GAP_MS = 250; // dropouts shorter than this are ignored
const STREAK_UP = 8;

// A stage opens when every item of the stages before it is known well enough.
function staged(stages, stats) {
  const out = [];
  for (const st of stages) {
    out.push(...st);
    if (!st.every((k) => (stats.get(k)?.score ?? 0) >= 0.5)) break;
  }
  return out;
}

// ---------- screen ----------
const promptBox = h('div', { className: 'sm-prompt' });
const band = h('div', { className: 'sm-band' });
const C = 2 * Math.PI * 21;
const dot = h('div', { className: 'sm-dot' });
dot.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/></svg><i></i>';
const ring = dot.querySelector('circle');
const meter = h('div', { className: 'sm-meter' }, band, dot);
const replayBtn = h('button', { className: 'ml-round', textContent: '▶' });
const skipBtn = h('button', { className: 'ml-btn sm-skip' });
const controls = h('div', { className: 'sm-controls' }, replayBtn, skipBtn);
const offerBtn = h('button', { className: 'ml-btn ml-primary sm-offer sm-off' });

let started = false; // after the first tap
let view = 'start'; // 'start' | 'game' | 'error'
let mic = null;
let manual = false; // tests feed pitches by hand: the real microphone is then ignored
let gen = 0; // changes whenever the current round is abandoned
let round = null;
let streak = 0, last = null;
let quietAt = 0; // the app makes sound until then: the microphone is ignored
let stopDrone = null;

function showGame() {
  view = 'game';
  game.stage.replaceChildren(promptBox, meter, controls, offerBtn);
  renderTexts();
}
function showError() {
  view = 'error';
  const b = h('button', { className: 'ml-btn ml-primary', textContent: game.t('retry') });
  b.onclick = () => begin();
  game.stage.replaceChildren(h('p', { className: 'ml-prompt', textContent: game.t('noMic') }), b);
}
function renderTexts() {
  skipBtn.textContent = game.t('skip');
  replayBtn.setAttribute('aria-label', game.t('replay'));
  offerBtn.textContent = game.t('nextLevel');
  renderPrompt();
}
function renderPrompt() {
  if (!round) return promptBox.replaceChildren();
  const lang = game.lang;
  if (round.level === 3) {
    promptBox.replaceChildren(h('div', { className: 'sm-dots' }, ...round.targets.map((_, i) =>
      h('span', { className: i < round.idx ? 'sm-done' : i === round.idx ? 'sm-now' : '' }))));
  } else if (round.level === 4) {
    promptBox.replaceChildren(
      h('span', { className: 'sm-big', textContent: round.dir > 0 ? '↑' : '↓' }),
      h('p', { className: 'ml-prompt', textContent: round.interval[lang] }));
  } else if (round.level === 5) {
    promptBox.replaceChildren(
      h('span', { className: 'sm-big', textContent: round.item }),
      h('p', { className: 'ml-prompt', textContent: LETTERS[lang][+round.item - 1] }));
  } else promptBox.replaceChildren();
  replayBtn.classList.toggle('sm-off', round.level === 2 && !round.wrongLogged);
  offerBtn.classList.toggle('sm-off', !(streak >= STREAK_UP && round.level < 5));
}

// ---------- pitch tracking ----------
let recent = [], hold = 0, gap = 0, wrong = 0, anchor = null, lastT = 0;
function resetTrack() { recent = []; hold = 0; gap = 0; wrong = 0; anchor = null; }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** d = distance to the target in semitones (-6..6, any octave), null = nothing heard. */
function draw(d, inBand = false) {
  const half = meter.clientHeight / 2 - 28;
  const perSemi = half / 6;
  band.style.height = Math.max(6, (2 * +game.settings.tolerance / 100) * perSemi) + 'px';
  dot.classList.toggle('sm-on', d != null);
  dot.classList.toggle('sm-in', d != null && inBand);
  if (d != null) dot.style.transform = `translateY(${(-Math.max(-6, Math.min(6, d)) * perSemi).toFixed(1)}px)`;
  ring.style.strokeDasharray = `${(Math.min(1, hold / HOLD_MS) * C).toFixed(1)} ${C}`;
  ring.style.opacity = hold > 0 ? 1 : 0;
  meter.classList.toggle('sm-live', !!round?.listening && performance.now() >= quietAt);
}

/** Every microphone reading goes through here (and the test hook too). p = { freq, midi } */
function hear(p) {
  const now = performance.now();
  const dt = Math.min(120, now - lastT);
  lastT = now;
  if (!round || !round.listening || now < quietAt) { resetTrack(); draw(null); return; }
  if (p.freq == null) {
    gap += dt;
    if (gap > GAP_MS) { resetTrack(); draw(null); }
    return;
  }
  gap = 0;
  recent.push(p.midi);
  if (recent.length > 5) recent.shift();
  if (recent.length < 3) return; // wait for a stable start
  const m = median(recent);
  const target = round.targets[round.idx];
  const d = mod(m - target + 6, 12) - 6;
  const tol = +game.settings.tolerance / 100;
  const inBand = Math.abs(d) <= tol;
  if (inBand) { hold += dt; wrong = 0; anchor = null; }
  else {
    hold = Math.max(0, hold - dt); // mostly in tune is enough
    if (Math.abs(d) >= Math.max(1, tol + 0.5)) {
      if (anchor == null || Math.abs(m - anchor) > 0.75) { anchor = m; wrong = 0; }
      else wrong += dt;
    } else { wrong = 0; anchor = null; }
  }
  draw(d, inBand);
  if (hold >= HOLD_MS) hit();
  else if (wrong >= WRONG_MS) miss();
}

// ---------- rounds ----------
/** Mark the next `ms` as noisy (the app is playing): the mic is ignored until 150 ms after. */
const sound = (ms) => { quietAt = Math.max(quietAt, performance.now() + ms + 150); };
const sing = (midi, dur = 0.9, when = 0) => { playNote(midi, { timbre: 'voice', dur, when, gain: 0.3 }); sound((when + dur + 0.15) * 1000); };
function endDrone() { if (stopDrone) { stopDrone(); stopDrone = null; sound(500); } }

async function build(level) {
  const v = VOICES[game.settings.voice] || VOICES.child;
  const skill = SKILL[level];
  const stats = await loadItemMastery(skill);
  const r = { level, skill, idx: 0, wrongLogged: false, listening: false, t0: 0, done: false };
  if (level <= 2) {
    const notes = [];
    const [lo, hi] = level === 1 ? v.easy : [v.lo, v.hi];
    for (let m = lo; m <= hi; m++) if (level === 2 || isNatural(m)) notes.push(m);
    const midi = pickWeak(notes, stats, { keyOf: (m) => noteName(m, { octave: true }), avoid: last });
    Object.assign(r, { item: noteName(midi, { octave: true }), targets: [midi], ref: [midi] });
  } else if (level === 3) {
    const len = pickWeak([2, 3], stats, { keyOf: String });
    const scale = scaleNotes(0, 'pentaMajor', v.lo, v.hi);
    let i = rand(scale.length);
    const notes = [scale[i]];
    while (notes.length < len) {
      i = pick([-2, -1, 1, 2].map((s) => i + s).filter((j) => j >= 0 && j < scale.length));
      notes.push(scale[i]);
    }
    Object.assign(r, { item: String(len), targets: notes, ref: notes });
  } else if (level === 4) {
    const id = pickWeak(staged(INTERVAL_STAGES, stats), stats, { avoid: last });
    const interval = INTERVALS.find((x) => x.id === id);
    let cands = [];
    for (let b = v.lo; b <= v.hi; b++) for (const dir of [1, -1]) {
      const o = b + dir * interval.semi;
      if (o >= v.lo && o <= v.hi) cands.push([b, dir]);
    }
    // Too wide for this voice: any octave is accepted anyway.
    if (!cands.length) for (let b = v.easy[0]; b <= v.easy[1]; b++) cands.push([b, b - v.lo < v.hi - b ? 1 : -1]);
    const [base, dir] = pick(cands);
    Object.assign(r, { item: id, interval, dir, base, targets: [base + dir * interval.semi], ref: [base] });
  } else {
    const deg = pickWeak(staged(DEGREE_STAGES, stats), stats, { avoid: last });
    Object.assign(r, { item: deg, tonic: v.tonic, targets: [v.tonic + MAJOR[+deg - 1]], ref: [] });
  }
  return r;
}

async function next() {
  const my = ++gen;
  endDrone();
  if (round) round.listening = false;
  const r = await build(+game.settings.level || 1);
  if (my !== gen) return;
  round = r;
  last = r.item;
  resetTrack();
  renderPrompt();
  present(my);
}

/** Play the reference, then listen. */
async function present(my = gen) {
  const r = round;
  if (!r || r.done || r.playing) return;
  r.playing = true;
  r.listening = false;
  r.idx = 0;
  resetTrack();
  renderPrompt();
  draw(null);
  replayBtn.classList.add('sm-busy');
  await wait(Math.max(0, quietAt - performance.now())); // let earlier sounds finish
  if (my === gen) {
    if (r.level === 5) {
      // The tonic sounds first, then stops: a drone left on would be heard by the microphone.
      stopDrone = startDrone([r.tonic, r.tonic - 12], { gain: 0.16 });
      sound(1700);
      await wait(1600);
      if (my === gen) endDrone();
    } else if (r.ref.length === 1) sing(r.ref[0], 1);
    else { sound(r.ref.length * 800); await playSeq(r.ref, { bpm: 75, timbre: 'voice', gain: 0.3 }); }
    await wait(Math.max(0, quietAt - performance.now()));
  }
  r.playing = false;
  if (my !== gen) return;
  replayBtn.classList.remove('sm-busy');
  if (!r.t0) r.t0 = performance.now();
  r.listening = true;
  draw(null);
}

async function log(r, correct) {
  sound(450); // feedback sound
  await game.attempt({ skill: r.skill, correct, ms: Math.round(performance.now() - r.t0), level: r.level, item: r.item });
}

async function hit() {
  const r = round, my = gen;
  resetTrack();
  if (r.idx < r.targets.length - 1) { r.idx++; renderPrompt(); draw(null); return; }
  r.listening = false;
  r.done = true;
  r.idx = r.targets.length;
  if (!r.wrongLogged) streak++;
  renderPrompt();
  draw(null);
  await log(r, true);
  await wait(550);
  if (my !== gen) return;
  if (r.level === 4) { sing(r.base, 0.6); sing(r.targets[0], 0.9, 0.65); await wait(1750); } // hear both notes
  else if (r.level === 5) { sing(r.targets[0], 0.7); await wait(900); }
  if (my === gen) next();
}

/** A clearly wrong note was held: counts once, then the player tries again. */
async function miss() {
  const r = round, my = gen;
  r.listening = false;
  resetTrack();
  draw(null);
  streak = 0;
  if (r.wrongLogged) { sound(450); game.flash(false); }
  else { r.wrongLogged = true; await log(r, false); }
  await wait(600);
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

replayBtn.onclick = () => present();
skipBtn.onclick = skip;
offerBtn.onclick = () => { if (+game.settings.level < 5) game.set('level', +game.settings.level + 1); };

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
    endDrone();
    if (round) round.listening = false;
    round = null;
    stopMic();
  } else if (!mic) begin();
});
game.on('settings', () => { if (view === 'game') { streak = 0; next(); } });
game.on('lang', () => { if (view === 'game') renderTexts(); else if (view === 'error') showError(); });

// Test hook: feed(midi | null) pushes a reading into the same handler as the microphone.
window.__test = {
  feed(midi) { manual = true; hear(midi == null ? { freq: null, midi: null } : { freq: 440 * 2 ** ((midi - 69) / 12), midi }); },
  state: () => ({ view, level: round?.level, item: round?.item, targets: round?.targets, idx: round?.idx, base: round?.base, listening: !!round?.listening && performance.now() >= quietAt, hold, wrong, streak, wrongLogged: round?.wrongLogged }),
};

game.ready().then(() => { started = true; begin(); });
