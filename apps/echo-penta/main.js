// Echo: the app plays a short pentatonic tune on coloured pads, the player plays it back.
import { createGame } from '@core/shell.js';
import { createPads } from '@core/keyboard.js';
import { playNote, wait } from '@core/audio.js';
import { scaleNotes, mod, rand, pick } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'echo-penta',
  title: L('Repeat the tune', 'Répète l’air'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    nextLevel: L('Level {n} →', 'Niveau {n} →'),
    levelUp: L('Well done! Ready for the next level?', 'Bravo ! On passe au niveau suivant ?'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · 2–3 notes, lit pads', '1 · 2–3 notes, touches allumées') },
      { value: 2, label: L('2 · 3–4 notes, leaps', '2 · 3–4 notes, avec sauts') },
      { value: 3, label: L('3 · By ear only', '3 · À l’oreille seulement') },
      { value: 4, label: L('4 · Six pads, 4–6 notes', '4 · Six touches, 4–6 notes') },
      { value: 5, label: L('5 · Minor, changing key', '5 · Mineur, tonalité changeante') },
      { value: 6, label: L('6 · Blues, 5–7 notes', '6 · Blues, 5–7 notes') },
    ] },
    { key: 'growing', label: L('Growing tune', 'Air qui s’allonge'), type: 'toggle', default: false },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 40, max: 140, step: 5, default: 70 },
  ],
});

// span = highest pad above the root (semitones). step/rep = chance of a neighbour move / a repeated note.
// maxLeap in pads. rhythm: 0 even, 1 a few short notes, 2 long and short mixed.
const LEVELS = {
  1: { skill: 'listen.penta.echo', scale: 'pentaMajor', span: 9, len: [2, 3], visual: true, step: 0.85, rep: 0.1, maxLeap: 2, rhythm: 0 },
  2: { skill: 'listen.penta.echo', scale: 'pentaMajor', span: 9, len: [3, 4], visual: true, step: 0.5, rep: 0.1, maxLeap: 4, rhythm: 0 },
  3: { skill: 'listen.penta.echo', scale: 'pentaMajor', span: 9, len: [3, 4], hint: true, step: 0.6, rep: 0.1, maxLeap: 3, rhythm: 0 },
  4: { skill: 'listen.penta.long', scale: 'pentaMajor', span: 12, len: [4, 5, 6], step: 0.6, rep: 0.1, maxLeap: 3, rhythm: 1 },
  5: { skill: 'listen.penta.long', scale: 'pentaMinor', span: 12, len: [4, 5, 6], roots: true, step: 0.6, rep: 0.1, maxLeap: 3, rhythm: 1 },
  6: { skill: 'listen.penta.long', scale: 'blues', span: 12, len: [5, 6, 7], roots: true, step: 0.65, rep: 0.1, maxLeap: 3, rhythm: 2 },
};
const MAX_GROW = 12;
const STREAK = 8;
const levelNow = () => LEVELS[+game.settings.level] ? +game.settings.level : 1;

// ---- Tune writing ----
function nextIndex(cur, n, cfg, prev) {
  for (let i = 0; i < 30; i++) {
    const r = Math.random();
    let d;
    if (r < cfg.step) d = pick([-1, 1]);
    else if (r < cfg.step + cfg.rep) d = 0;
    else d = (2 + rand(Math.max(1, cfg.maxLeap - 1))) * pick([-1, 1]);
    const nx = cur + d;
    if (nx < 0 || nx >= n) continue;
    if (d === 0 && prev === cur) continue; // never three times the same note
    return nx;
  }
  return cur > 0 ? cur - 1 : cur + 1;
}

function makeBeats(n, cfg) {
  const beats = Array(n).fill(1);
  if (cfg.rhythm === 1 && n >= 4 && Math.random() < 0.6) {
    const i = rand(n - 2);
    beats[i] = beats[i + 1] = 0.5;
  } else if (cfg.rhythm === 2) {
    for (let i = 0; i < n - 1; i++) beats[i] = Math.random() < 0.5 ? 0.5 : 1;
    if (beats.slice(0, -1).every((b) => b === beats[0])) beats[rand(n - 1)] = beats[0] === 1 ? 0.5 : 1;
  }
  beats[n - 1] = 2;
  return beats;
}

/** Returns { notes: [midi], beats: [beats], root, pads: [midi] }. Stepwise most of the time, usually ends on the tonic or the fifth. */
function makeTune(n, cfg, root, padNotes) {
  const homes = padNotes.map((m, i) => (mod(m - root, 12) === 0 || mod(m - root, 12) === 7 ? i : -1)).filter((i) => i >= 0);
  const wantHome = Math.random() < 0.8;
  let idx;
  for (let t = 0; t < 60; t++) {
    idx = [Math.random() < 0.6 ? pick(homes) : rand(padNotes.length)];
    while (idx.length < n) idx.push(nextIndex(idx.at(-1), padNotes.length, cfg, idx.at(-2)));
    if (new Set(idx).size > 1 && (!wantHome || homes.includes(idx.at(-1)))) break;
  }
  return { notes: idx.map((i) => padNotes[i]), beats: makeBeats(n, cfg), root, pads: padNotes };
}

function growTune(tn, cfg) {
  const i = tn.pads.indexOf(tn.notes.at(-1));
  const p = tn.pads.indexOf(tn.notes.at(-2));
  tn.notes.push(tn.pads[nextIndex(i, tn.pads.length, cfg, p)]);
  tn.beats[tn.beats.length - 1] = cfg.rhythm === 2 && Math.random() < 0.5 ? 0.5 : 1;
  tn.beats.push(2);
}

// ---- State ----
let cfg = LEVELS[1], pads = null, tune = null;
let state = 'idle'; // 'playing' | 'answer' | 'done'
let pos = 0, failed = false, streak = 0, lastLen = null, startedAt = 0;
let gen = 0;      // changes when the game restarts (settings): stops every pending step
let playId = 0;   // changes at each playback
let running = false;

const replay = game.h('button', { className: 'ml-round echo-replay', textContent: '▶' });
const dots = game.h('div', { className: 'echo-dots' });
const top = game.h('div', { className: 'echo-top' }, replay, dots);
const padBox = game.h('div', { className: 'echo-pads' });
const nextBox = game.h('div', { className: 'echo-next' });

function expose() {
  window.__test = { tune: tune ? [...tune.notes] : [], pads: tune ? [...tune.pads] : [], state, pos, streak, level: levelNow() };
}
function setState(s) {
  state = s;
  replay.disabled = s !== 'answer';
  expose();
}
function renderDots() {
  const n = tune ? tune.notes.length : 0;
  dots.replaceChildren(...Array.from({ length: n }, (_, i) => game.h('span', { className: 'echo-dot' + (i < pos ? ' echo-on' : '') })));
  expose();
}
function renderTexts() {
  replay.setAttribute('aria-label', game.t('replay'));
  const lv = levelNow();
  if (streak >= STREAK && LEVELS[lv + 1]) {
    const b = game.h('button', { className: 'ml-btn ml-primary', textContent: game.t('nextLevel', { n: lv + 1 }) });
    b.onclick = () => game.set('level', lv + 1);
    nextBox.replaceChildren(b);
  } else nextBox.replaceChildren();
}

function buildPads(root) {
  const notes = scaleNotes(root, cfg.scale, root, root + cfg.span);
  padBox.style.setProperty('--n', notes.length);
  pads = createPads(padBox, { notes, onDown: onPad });
  pads.setEnabled(false);
  return notes;
}

async function playTune({ intro = false } = {}) {
  const g = gen, p = ++playId;
  const alive = () => g === gen && p === playId;
  setState('playing');
  pads.setEnabled(false);
  pos = 0;
  renderDots();
  const beat = 60000 / (+game.settings.tempo || 70);
  await wait(400);
  if (!alive()) return;
  if (intro) { // new key: let the pads introduce themselves, low to high
    for (const m of tune.pads) {
      playNote(m, { dur: 0.22, gain: 0.18 });
      pads.flash(m, 'ml-hit', 180);
      await wait(Math.min(260, beat / 2));
      if (!alive()) return;
    }
    await wait(beat);
    if (!alive()) return;
  }
  for (let i = 0; i < tune.notes.length; i++) {
    const b = tune.beats[i], m = tune.notes[i];
    playNote(m, { dur: (b * beat * 0.9) / 1000 });
    if (cfg.visual) pads.flash(m, 'ml-hit', Math.min(b, 1) * beat * 0.7);
    await wait(Math.min(b, 1.25) * beat);
    if (!alive()) return;
  }
  pads.setEnabled(true);
  if (cfg.hint) pads.flash(tune.notes[0], 'ml-hint', 1500);
  startedAt = performance.now();
  setState('answer');
}

async function newRound() {
  const g = gen;
  const lv = levelNow();
  cfg = LEVELS[lv];
  let n = cfg.len[0];
  if (!game.settings.growing) {
    let stats = null;
    try { stats = await loadItemMastery(cfg.skill); } catch { /* storage unavailable: plain random */ }
    if (g !== gen) return;
    n = pickWeak(cfg.len, stats, { avoid: cfg.len.length > 2 ? lastLen : undefined });
  }
  lastLen = n;
  const root = cfg.roots ? 55 + rand(10) : 60;
  const padNotes = buildPads(root);
  tune = makeTune(n, cfg, root, padNotes);
  failed = false;
  playTune({ intro: !!cfg.roots });
}

function log(correct) {
  return game.attempt({
    skill: cfg.skill, correct, level: levelNow(), item: tune.notes.length,
    ms: Math.round(performance.now() - startedAt),
    detail: { growing: !!game.settings.growing, retry: failed, at: pos },
  });
}

async function onPad(midi) {
  if (state !== 'answer') return;
  const g = gen;
  if (midi === tune.notes[pos]) {
    pos++;
    renderDots();
    if (pos < tune.notes.length) return;
    // whole tune right
    setState('done');
    pads.setEnabled(false);
    pads.flash(midi, 'ml-good', 600);
    const firstTry = !failed;
    await log(true);
    if (g !== gen) return;
    if (firstTry) {
      streak++;
      if (streak === STREAK && LEVELS[levelNow() + 1]) game.say(game.t('levelUp'));
    }
    renderTexts();
    expose();
    await wait(900);
    if (g !== gen) return;
    if (game.settings.growing && tune.notes.length < MAX_GROW) {
      growTune(tune, cfg);
      failed = false;
      playTune();
    } else newRound();
  } else {
    setState('done');
    pads.setEnabled(false);
    pads.flash(midi, 'ml-bad', 700);
    streak = 0;
    renderTexts();
    if (!failed) { await log(false); failed = true; } else game.flash(false);
    if (g !== gen) return;
    await wait(900);
    if (g !== gen) return;
    if (game.settings.growing) newRound(); // like Simon: a mistake ends the growing tune
    else playTune();                       // hear it again, try the same tune again
  }
}

replay.onclick = () => { if (state === 'answer') playTune(); };

function restart() {
  if (!running) return;
  const g = ++gen;
  playId++;
  streak = 0;
  lastLen = null;
  setState('idle');
  renderTexts();
  pads?.setEnabled(false);
  // Do not play behind the settings dialog: wait until it is closed.
  const dlg = document.querySelector('dialog.ml-settings');
  if (dlg?.open) dlg.addEventListener('close', () => { if (g === gen) newRound(); }, { once: true });
  else newRound();
}

game.on('settings', restart);
game.on('lang', renderTexts);

game.ready().then(() => {
  game.stage.replaceChildren(top, padBox, nextBox);
  running = true;
  renderTexts();
  newRound();
});
