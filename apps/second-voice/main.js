// Second voice: the app sings or plays one voice, the player sings another one at the same time.
// Thread of the game: holding a note against a moving voice, then tension and release,
// parallel thirds, voice leading over chords, jazz guide tones, free improvisation.
import { createGame } from '@core/shell.js';
import { playNote, startDrone, wait } from '@core/audio.js';
import { startMic, micSupported } from '@core/pitch.js';
import { noteName, mod, pick } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 10;
const game = createGame({
  id: 'second-voice',
  title: L('Second voice', 'Deuxième voix'),
  strings: {
    noMic: L('The microphone is not available. Allow it, then try again.', 'Le micro n’est pas disponible. Autorise-le, puis réessaie.'),
    retry: L('Try again', 'Réessayer'),
    skip: L('Skip', 'Passer'),
    replay: L('Start again', 'Recommencer'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
    tension: L('tension', 'tension'),
    rest: L('release', 'détente'),
    phonesTip: L('Easier with headphones', 'Plus facile avec un casque'),
    parfaite: L('Perfect cadence', 'Cadence parfaite'),
    plagale: L('Plagal cadence', 'Cadence plagale'),
    rompue: L('Deceptive cadence', 'Cadence rompue'),
    demi: L('Half cadence', 'Demi-cadence'),
    cycle: L('Cycle of fifths', 'Cycle des quintes'),
    tritone: L('Tritone substitution', 'Substitution tritonique'),
    cliche: L('Line cliché', 'Ligne cliché'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Hold your note while the tune moves', '1 · Tiens ta note pendant que l’air bouge') },
      { value: 2, label: L('2 · Hold another note', '2 · Tiens une autre note') },
      { value: 3, label: L('3 · Tension, then release', '3 · Tension, puis détente') },
      { value: 4, label: L('4 · Find the release by ear', '4 · Trouve la détente à l’oreille') },
      { value: 5, label: L('5 · Sing a third above', '5 · Chante à la tierce') },
      { value: 6, label: L('6 · Follow three chords', '6 · Suis trois accords') },
      { value: 7, label: L('7 · Sing through the cadences', '7 · Traverse les cadences') },
      { value: 8, label: L('8 · Guide tones on ii–V–I', '8 · Notes guides sur ii–V–I') },
      { value: 9, label: L('9 · Advanced patterns', '9 · Motifs avancés') },
      { value: 10, label: L('10 · Improvise a second voice', '10 · Improvise une deuxième voix') },
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
    { key: 'phones', label: L('I use headphones', 'J’ai un casque'), type: 'toggle', default: false },
  ],
});
const { h } = game;

const VOICES = { child: [60, 69], high: [57, 74], medium: [48, 62], low: [43, 57] };
const SKILL = { 1: 'sing.voice.hold', 2: 'sing.voice.hold', 3: 'sing.voice.tension', 4: 'sing.voice.tension', 5: 'sing.voice.thirds', 6: 'sing.voice.leading', 7: 'sing.voice.cadence', 8: 'sing.voice.guide', 9: 'sing.voice.patterns', 10: 'sing.voice.free' };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9, 12];
const CONSONANT = [0, 3, 4, 7, 8, 9]; // against the bass, as pitch classes
// Tension → release pairs, in semitones above the held bass note.
const PAIRS = { '2-3': [2, 4], '4-3': [5, 4], '7-8': [11, 12], '6-5': [9, 7], '2-1': [2, 0] };
const PAIR_STAGES = [['2-3', '4-3'], ['7-8', '6-5', '2-1']];
const CH = {
  I: { root: 0, tones: [0, 4, 7], sym: '' }, IV: { root: 5, tones: [5, 9, 0], sym: '' },
  V: { root: 7, tones: [7, 11, 2], sym: '' }, V7: { root: 7, tones: [7, 11, 2, 5], sym: '7' },
  vi: { root: 9, tones: [9, 0, 4], sym: 'm' }, ii7: { root: 2, tones: [2, 5, 9, 0], sym: 'm7' },
  Imaj7: { root: 0, tones: [0, 4, 7, 11], sym: 'maj7' }, vi7: { root: 9, tones: [9, 0, 4, 7], sym: 'm7' },
  IVmaj7: { root: 5, tones: [5, 9, 0, 4], sym: 'maj7' },
  iii7: { root: 4, tones: [4, 7, 11, 2], sym: 'm7' }, VI7: { root: 9, tones: [9, 1, 4, 7], sym: '7' },
  bII7: { root: 1, tones: [1, 5, 8, 11], sym: '7', flat: true },
  im: { root: 0, tones: [0, 3, 7], sym: 'm' }, imM7: { root: 0, tones: [0, 3, 7, 11], sym: 'm(maj7)' },
  im7: { root: 0, tones: [0, 3, 7, 10], sym: 'm7' }, im6: { root: 0, tones: [0, 3, 7, 9], sym: 'm6' },
};
// One sung line over chords. tense = indexes of the steps that ask to be resolved.
const LINES = {
  6: {
    '8-8-7-8': { chords: ['I', 'IV', 'V7', 'I'], line: [0, 0, -1, 0], tense: [2] },
    '3-4-4-3': { chords: ['I', 'IV', 'V7', 'I'], line: [4, 5, 5, 4], tense: [2] },
    '5-6-5-5': { chords: ['I', 'IV', 'V', 'I'], line: [7, 9, 7, 7], tense: [] },
  },
  // Cadences: the same two voices (leading tone up, seventh down) meet different endings.
  7: {
    'parfaite:7-8': { name: 'parfaite', chords: ['IV', 'V7', 'I'], line: [0, -1, 0], tense: [1] },
    'parfaite:4-3': { name: 'parfaite', chords: ['IV', 'V7', 'I'], line: [5, 5, 4], tense: [1] },
    'plagale:6-5': { name: 'plagale', chords: ['I', 'IV', 'I'], line: [7, 9, 7], tense: [] },
    'plagale:4-3': { name: 'plagale', chords: ['I', 'IV', 'I'], line: [4, 5, 4], tense: [] },
    'rompue:7-8': { name: 'rompue', chords: ['IV', 'V7', 'vi'], line: [0, -1, 0], tense: [1] },
    'demi:8-7': { name: 'demi', chords: ['I', 'IV', 'V'], line: [0, 0, -1], tense: [2] },
  },
  8: {
    '3-7-3': { chords: ['ii7', 'V7', 'Imaj7'], line: [5, 5, 4], tense: [1] },
    '7-3-7': { chords: ['ii7', 'V7', 'Imaj7'], line: [0, -1, -1], tense: [0] },
  },
  9: {
    'cycle:3-7': { name: 'cycle', chords: ['iii7', 'VI7', 'ii7', 'V7', 'Imaj7'], line: [7, 7, 5, 5, 4], tense: [1, 3] },
    'cycle:7-3': { name: 'cycle', chords: ['iii7', 'VI7', 'ii7', 'V7', 'Imaj7'], line: [2, 1, 0, -1, -1], tense: [0, 2] },
    'tritone:3-7': { name: 'tritone', chords: ['ii7', 'bII7', 'Imaj7'], line: [5, 5, 4], tense: [1] },
    'tritone:7-3': { name: 'tritone', chords: ['ii7', 'bII7', 'Imaj7'], line: [0, -1, -1], tense: [0] },
    cliche: { name: 'cliche', chords: ['im', 'imM7', 'im7', 'im6'], line: [0, -1, -2, -3], tense: [1, 2] },
  },
};
const PROGS = { 'I-vi-IV-V': ['Imaj7', 'vi7', 'IVmaj7', 'V7'], 'ii-V-I': ['ii7', 'V7', 'Imaj7'] };

const HOLD_MS = 700; // in-tune singing needed on each step
const WRONG_MS = 2000; // steady wrong note before it counts as a mistake
const GAP_MS = 250; // dropouts shorter than this are ignored
const MIN_STEP_MS = 1300; // the other voice is heard at least this long
const STREAK_UP = 6;
const SPAN = 7; // semitones shown above and below the centre

function staged(stages, stats, key = (k) => k) {
  const out = [];
  for (const st of stages) {
    out.push(...st);
    if (!st.every((k) => (stats.get(key(k))?.score ?? 0) >= 0.5)) break;
  }
  return out;
}
// The app never sounds the note the singer has to find: the singer completes the chord.
// (It also keeps the microphone from taking the app's voice for the singer's.)
const chordOther = (c, sung) => [...new Set([c.root - 12, ...c.tones.map((x) => x - 12)])].filter((x) => mod(x - sung, 12) !== 0);
function place(notes) { let n = notes; while (Math.min(...n) < 41) n = n.map((x) => x + 12); return n; }
const near = (a, b) => mod(a - b + 6, 12) - 6; // signed distance, any octave

// ---------- screen ----------
const dots = h('div', { className: 'sv-dots' });
const hint = h('p', { className: 'ml-hint' });
const band = h('div', { className: 'sv-band' });
const others = h('div', { className: 'sv-others' });
const C = 2 * Math.PI * 21;
const dot = h('div', { className: 'sv-dot' });
dot.innerHTML = '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/></svg><i></i>';
const ring = dot.querySelector('circle');
const meter = h('div', { className: 'sv-meter' }, others, band, dot);
const replayBtn = h('button', { className: 'ml-round', textContent: '↺' });
const skipBtn = h('button', { className: 'ml-btn sv-skip' });
const controls = h('div', { className: 'sv-controls' }, replayBtn, skipBtn);
const offerBtn = h('button', { className: 'ml-btn ml-primary sv-offer sv-off' });

let started = false, view = 'start', mic = null, manual = false;
let gen = 0, round = null, streak = 0, last = null, quietAt = 0, stopOtherFn = null;

function showGame() {
  view = 'game';
  game.stage.replaceChildren(dots, hint, meter, controls, offerBtn);
  render();
}
function showError() {
  view = 'error';
  const b = h('button', { className: 'ml-btn ml-primary', textContent: game.t('retry') });
  b.onclick = () => begin();
  game.stage.replaceChildren(h('p', { className: 'ml-prompt', textContent: game.t('noMic') }), b);
}
const perSemi = () => (meter.clientHeight / 2 - 28) / SPAN;
const yOf = (midi) => -Math.max(-SPAN, Math.min(SPAN, near(midi, round.center))) * perSemi();

function render() {
  skipBtn.textContent = game.t('skip');
  replayBtn.setAttribute('aria-label', game.t('replay'));
  offerBtn.textContent = game.t('nextLevel');
  if (!round) { dots.replaceChildren(); hint.textContent = ''; return; }
  const r = round, st = r.steps[Math.min(r.idx, r.steps.length - 1)];
  dots.replaceChildren(...r.steps.map((s, i) => h('span', { className: (i < r.idx ? 'sv-done' : i === r.idx ? 'sv-now' : '') + (s.kind === 'tension' ? ' sv-t' : '') })));
  // Names appear with the levels: nothing at first, then tension / release, then the chords.
  const parts = [];
  if (r.name) parts.push(game.t(r.name));
  if (r.level >= 6 && st.chord) parts.push(noteName(r.tonic + st.chord.root, { lang: game.lang, pref: st.chord.flat ? 'flat' : r.pref }) + st.chord.sym);
  if (r.level >= 3 && r.level <= 9) parts.push(game.t(st.kind));
  hint.textContent = parts.join(' · ');
  band.classList.toggle('sv-tension', st.kind === 'tension');
  band.classList.toggle('sv-hidden', !st.show || r.done);
  band.style.height = Math.max(8, (2 * +game.settings.tolerance / 100) * perSemi()) + 'px';
  band.style.transform = `translateY(calc(-50% + ${yOf(st.targets[0]).toFixed(1)}px))`;
  others.replaceChildren(...(r.sounding || []).map((m) => {
    const line = h('i', {});
    line.style.transform = `translateY(${yOf(m).toFixed(1)}px)`;
    return line;
  }));
  offerBtn.classList.toggle('sv-off', !(streak >= STREAK_UP && r.level < MAX_LEVEL));
}

// ---------- pitch tracking ----------
let recent = [], hold = 0, gap = 0, wrong = 0, anchor = null, lastT = 0;
function resetTrack() { recent = []; hold = 0; gap = 0; wrong = 0; anchor = null; }
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function draw(midi, inBand = false) {
  dot.classList.toggle('sv-on', midi != null);
  dot.classList.toggle('sv-in', midi != null && inBand);
  if (midi != null && round) dot.style.transform = `translateY(${yOf(midi).toFixed(1)}px)`;
  ring.style.strokeDasharray = `${(Math.min(1, hold / HOLD_MS) * C).toFixed(1)} ${C}`;
  ring.style.opacity = hold > 0 ? 1 : 0;
  meter.classList.toggle('sv-live', !!round?.listening && performance.now() >= quietAt);
}

/** Every microphone reading goes through here (and the test hook too). p = { freq, midi } */
function hear(p) {
  const now = performance.now();
  const dt = Math.min(120, now - lastT);
  lastT = now;
  if (!round || !round.listening || now < quietAt) { resetTrack(); draw(null); return; }
  const st = round.steps[round.idx];
  const tol = +game.settings.tolerance / 100;
  let midi = p.freq == null ? null : p.midi;
  // Without headphones the microphone also hears the app's own voice: a reading on one of
  // its notes says nothing about the singer, unless that note is also the one to sing.
  if (midi != null && !game.settings.phones
    && !st.targets.some((t) => Math.abs(near(midi, t)) <= tol)
    && round.sounding.some((o) => Math.abs(near(midi, o)) < 0.4)) midi = null;
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
  const d = Math.min(...st.targets.map((t) => Math.abs(near(m, t))));
  const inBand = d <= tol;
  if (inBand) { hold += dt; wrong = 0; anchor = null; }
  else {
    hold = Math.max(0, hold - dt);
    if (d >= Math.max(1, tol + 0.5)) {
      if (anchor == null || Math.abs(m - anchor) > 0.75) { anchor = m; wrong = 0; }
      else wrong += dt;
    } else { wrong = 0; anchor = null; }
  }
  draw(m, inBand);
  if (hold >= HOLD_MS) hit();
  else if (wrong >= WRONG_MS) miss();
}

// ---------- sound ----------
const sound = (ms) => { quietAt = Math.max(quietAt, performance.now() + ms + 150); };
const sing = (midi, dur = 0.9) => { playNote(midi, { timbre: 'voice', dur, gain: 0.3 }); sound((dur + 0.15) * 1000); };
function stopOther() { if (stopOtherFn) { stopOtherFn(); stopOtherFn = null; } if (round) round.sounding = []; }
function setOther(i) {
  if (stopOtherFn) stopOtherFn();
  round.sounding = round.steps[i].other;
  stopOtherFn = startDrone(round.sounding, { gain: 0.13 });
}

// ---------- rounds ----------
async function build(level) {
  const [lo, hi] = VOICES[game.settings.voice] || VOICES.child;
  const skill = SKILL[level];
  const stats = await loadItemMastery(skill);
  const step = (other, targets, o = {}) => ({ other, targets: [].concat(targets), kind: o.kind || 'rest', show: o.show !== false, chord: o.chord || null });
  let item, steps, name = null, demo = 'first';
  if (level <= 2) {
    item = level === 1 ? 'tonic' : pickWeak(['fifth', 'third'], stats, { avoid: last });
    const mine = { tonic: 0, fifth: 7, third: 4 }[item];
    const tune = PENTA.filter((x) => mod(x - mine, 12) !== 0); // the moving voice never lands on the held note
    let i = pick([0, 1, 2]);
    steps = [];
    for (let k = 0; k < 4; k++) {
      steps.push(step([12 + tune[i]], mine));
      i = pick([i - 1, i + 1].filter((j) => j >= 0 && j < tune.length));
    }
  } else if (level <= 4) {
    const pre = level === 4 ? 'ear:' : '';
    const id = pickWeak(staged(PAIR_STAGES, stats, (k) => pre + k), stats, { keyOf: (k) => pre + k, avoid: last?.replace('ear:', '') });
    const [a, b] = PAIRS[id];
    item = pre + id;
    // Level 4: any note one step away that sounds at rest against the bass is a good release.
    const releases = [a - 2, a - 1, a + 1, a + 2].filter((c) => CONSONANT.includes(mod(c, 12)));
    steps = [step([-12], a, { kind: 'tension' }), level === 3 ? step([-12], b) : step([-12], releases, { show: false })];
    if (level === 3) demo = 'all';
  } else if (level === 5) {
    const len = pickWeak([3, 4], stats, { keyOf: String });
    item = String(len);
    let d = pick([0, 1, 2]);
    steps = [];
    for (let k = 0; k < len; k++) {
      steps.push(step([MAJOR[d]], MAJOR[d + 2]));
      d = pick([d - 1, d + 1].filter((j) => j >= 0 && j <= 3));
    }
  } else if (level <= 9) {
    item = pickWeak(Object.keys(LINES[level]), stats, { avoid: last });
    const def = LINES[level][item];
    name = def.name || null;
    steps = def.chords.map((c, i) => step(chordOther(CH[c], def.line[i]), def.line[i], { kind: def.tense.includes(i) ? 'tension' : 'rest', chord: CH[c] }));
  } else {
    item = pickWeak(Object.keys(PROGS), stats, { avoid: last });
    // The app plays root and fifth. The colour notes (third, seventh) are left to the singer.
    // With headphones every chord tone is accepted.
    steps = PROGS[item].map((c) => {
      const [root, third, fifth, seventh] = CH[c].tones;
      return step([root - 12, fifth - 12], game.settings.phones ? CH[c].tones : [third, seventh], { show: false, chord: CH[c] });
    });
    demo = 'none';
  }
  // Choose a key that puts the sung line inside the voice.
  const shown = steps.flatMap((s) => (s.show ? s.targets : []));
  const offs = shown.length ? shown : [0, 7];
  const min = Math.min(...offs), max = Math.max(...offs);
  const keys = [];
  for (let t = lo - min; t <= hi - max; t++) keys.push(t);
  const tonic = keys.length ? pick(keys) : Math.round((lo + hi) / 2 - (min + max) / 2);
  for (const s of steps) { s.targets = s.targets.map((x) => tonic + x); s.other = place(s.other.map((x) => tonic + x)); }
  return {
    level, skill, item, name, steps, demo, tonic, center: tonic + (min + max) / 2,
    pref: [1, 3, 5, 8, 10].includes(mod(tonic, 12)) ? 'flat' : 'sharp',
    idx: 0, sounding: [], wrongLogged: false, listening: false, playing: false, done: false, t0: 0, stepAt: 0,
  };
}

async function next() {
  const my = ++gen;
  stopOther();
  if (round) round.listening = false;
  const r = await build(+game.settings.level || 1);
  if (my !== gen) return;
  round = r;
  last = r.item;
  resetTrack();
  render();
  present(my);
}

/** Start the other voice, give the starting note, then listen. */
async function present(my = gen) {
  const r = round;
  if (!r || r.done || r.playing) return;
  r.playing = true;
  r.listening = false;
  r.idx = 0;
  resetTrack();
  stopOther();
  render();
  draw(null);
  replayBtn.classList.add('sv-busy');
  await wait(Math.max(0, quietAt - performance.now()) + 250);
  if (my === gen) {
    setOther(0);
    render();
    await wait(700);
    const model = r.demo === 'all' ? r.steps.map((s) => s.targets[0]) : r.demo === 'first' ? [r.steps[0].targets[0]] : [];
    for (let i = 0; i < model.length && my === gen; i++) {
      r.idx = i;
      render();
      sing(model[i], 0.9);
      await wait(1000);
    }
    if (my === gen) { r.idx = 0; render(); }
    await wait(Math.max(0, quietAt - performance.now()));
  }
  r.playing = false;
  if (my !== gen) return;
  replayBtn.classList.remove('sv-busy');
  if (!r.t0) r.t0 = performance.now();
  r.stepAt = performance.now();
  r.listening = true;
  draw(null);
}

async function log(r, correct) {
  sound(450);
  await game.attempt({ skill: r.skill, correct, ms: Math.round(performance.now() - r.t0), level: r.level, item: r.item });
}

async function hit() {
  const r = round, my = gen;
  r.listening = false;
  resetTrack();
  draw(null);
  await wait(Math.max(0, MIN_STEP_MS - (performance.now() - r.stepAt)));
  if (my !== gen) return;
  if (r.idx < r.steps.length - 1) {
    r.idx++;
    setOther(r.idx);
    r.stepAt = performance.now();
    render();
    r.listening = true;
    return;
  }
  r.done = true;
  r.idx = r.steps.length;
  if (!r.wrongLogged) streak++;
  render();
  await wait(500);
  stopOther();
  render();
  await log(r, true);
  await wait(900);
  if (my === gen) next();
}

/** A clearly wrong note was held: counts once, then the same challenge starts again. */
async function miss() {
  const r = round, my = gen;
  r.listening = false;
  resetTrack();
  draw(null);
  stopOther();
  render();
  streak = 0;
  if (r.wrongLogged) { sound(450); game.flash(false); }
  else { r.wrongLogged = true; await log(r, false); }
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
  stopOther();
  if (!r.wrongLogged) await log(r, false);
  next();
}

replayBtn.onclick = () => { if (round && !round.done && !round.playing) { round.listening = false; present(); } };
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
    stopOther();
    round = null;
    showError();
    return;
  }
  if (document.hidden) return stopMic();
  showGame();
  if (!game.settings.phones) game.say(game.t('phonesTip'));
  next();
}

document.addEventListener('visibilitychange', () => {
  if (!started) return;
  if (document.hidden) {
    gen++;
    stopOther();
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
  state: () => ({ view, level: round?.level, item: round?.item, idx: round?.idx, steps: round?.steps.map((s) => ({ targets: s.targets, other: s.other, kind: s.kind, show: s.show })), listening: !!round?.listening && performance.now() >= quietAt, done: round?.done, streak, wrongLogged: round?.wrongLogged }),
};

game.ready().then(() => { started = true; begin(); });
