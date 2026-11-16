// Play the scale: play a scale note by note on the on-screen keyboard. Dots show the progress.
import { createGame } from '@core/shell.js';
import { createKeyboard } from '@core/keyboard.js';
import { playSeq } from '@core/audio.js';
import { noteName, isNatural, SCALES } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'play-scales',
  title: L('Play the scale', 'Joue la gamme'),
  strings: {
    listen: L('Hear the scale', 'Écouter la gamme'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · C major, five notes up', '1 · Do majeur, cinq notes en montant') },
      { value: 2, label: L('2 · C major, up and down', '2 · Do majeur, montée et descente') },
      { value: 3, label: L('3 · G, F and D major', '3 · Sol, Fa et Ré majeur') },
      { value: 4, label: L('4 · Any major key', '4 · Toutes les gammes majeures') },
      { value: 5, label: L('5 · Natural and harmonic minor', '5 · Mineure naturelle et harmonique') },
      { value: 6, label: L('6 · Modes, pentatonic and blues', '6 · Modes, pentatoniques et blues') },
    ] },
    { key: 'model', label: L('Hear the scale first (levels 1–3)', 'Entendre la gamme d’abord (niveaux 1 à 3)'), type: 'toggle', default: true },
    { key: 'labels', label: L('Note names on keys', 'Nom des notes sur les touches'), type: 'toggle', default: false },
  ],
});
const { h } = game;

const SKILL = 'play.scales';
const MAX_LEVEL = 6, STREAK_UP = 4, BPM = 150;
const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const LEVELS = {
  1: { pool: [['major', [0]]], n: 5, down: false, hint: true, model: true },
  2: { pool: [['major', [0]]], down: true, model: true },
  3: { pool: [['major', [7, 5, 2]]], down: true, name: true, model: true },
  4: { pool: [['major', ALL]], down: true, name: true },
  5: { pool: [['minor', ALL], ['harmonicMinor', ALL]], down: true, name: true },
  6: { pool: [['dorian', ALL], ['mixolydian', ALL], ['pentaMajor', ALL], ['pentaMinor', ALL], ['blues', ALL]], down: true, name: true },
};
// Flat or sharp spelling of a tonic, for its name on screen.
const FLAT_TONICS = { major: [5, 10, 3, 8, 1], minor: [0, 5, 10, 3, 7, 2], harmonicMinor: [0, 5, 10, 3, 7, 2] };
const prefOf = (scale, pc) => ((FLAT_TONICS[scale] || [3, 8, 10, 5]).includes(pc) ? 'flat' : 'sharp');

const pool = (level) => LEVELS[level].pool.flatMap(([scale, tonics]) => tonics.map((tonic) => ({ scale, tonic })));
const itemOf = (q) => `${q.scale}:${q.tonic}`;
/** The notes the player must play, in order. */
function sequence(q, level) {
  const cfg = LEVELS[level];
  const up = [...SCALES[q.scale].steps, 12].map((s) => 60 + q.tonic + s);
  let seq = cfg.n ? up.slice(0, cfg.n) : up;
  if (cfg.down) seq = [...up, ...up.slice(0, -1).reverse()];
  return seq;
}
/** Keyboard from the white key at or under the lowest note to the white key at or over the highest. */
function windowOf(seq) {
  let lo = Math.min(...seq), hi = Math.max(...seq);
  while (!isNatural(lo)) lo--;
  while (!isNatural(hi)) hi++;
  return [lo, hi];
}
const levelNow = () => (LEVELS[+game.settings.level] ? +game.settings.level : 1);

// ---------- screen ----------
const nameEl = h('p', { className: 'ml-hint ps-name' });
const dotsEl = h('div', { className: 'ps-dots' });
const listenBtn = h('button', { className: 'ps-listen', textContent: '▶' });
const kbBox = h('div', { className: 'ps-kb' });
const offerBtn = h('button', { className: 'ml-btn ml-primary ps-offer ps-off' });

let started = false, gen = 0;
let current = null, seq = [], idx = 0, locked = true, wrongLogged = false, t0 = 0;
let streak = 0, last = null, win = null, kb = null, kbKey = '';

function nameText() {
  if (!current || !LEVELS[levelNow()].name) return '';
  const s = SCALES[current.scale];
  const nm = noteName(60 + current.tonic, { lang: game.lang, pref: prefOf(current.scale, current.tonic) });
  return `${nm} ${game.tr(s).toLowerCase()}`;
}
function paint() {
  const lv = levelNow();
  nameEl.textContent = nameText();
  listenBtn.title = game.t('listen'); listenBtn.setAttribute('aria-label', game.t('listen'));
  offerBtn.textContent = game.t('nextLevel');
  offerBtn.classList.toggle('ps-off', !(streak >= STREAK_UP && lv < MAX_LEVEL));
  const lo = Math.min(...seq), hi = Math.max(...seq);
  dotsEl.replaceChildren(...seq.map((m, i) => {
    const d = h('span', { className: 'ps-dot' + (i < idx ? ' ps-done' : i === idx ? ' ps-cur' : '') });
    d.style.setProperty('--y', hi === lo ? 0.5 : (m - lo) / (hi - lo));
    return d;
  }));
  if (!kb) return;
  kb.el.querySelectorAll('.ps-start').forEach((k) => k.classList.remove('ps-start'));
  kb.el.querySelectorAll('.ml-hint').forEach((k) => k.classList.remove('ml-hint'));
  if (LEVELS[lv].name) kb.el.querySelector(`[data-midi="${seq[0]}"]`)?.classList.add('ps-start');
  if (LEVELS[lv].hint && idx < seq.length) kb.el.querySelector(`[data-midi="${seq[idx]}"]`)?.classList.add('ml-hint');
}
function buildKeyboard() {
  const key = [win, game.settings.labels, game.lang].join('|');
  if (key === kbKey) return;
  kbKey = key;
  kb = createKeyboard(kbBox, { from: win[0], to: win[1], labels: !!game.settings.labels, sound: true, onDown: onKey });
}

// ---------- rounds ----------
async function model() {
  const my = gen;
  locked = true;
  idx = 0;
  paint();
  const ms = 60000 / BPM;
  seq.forEach((m, i) => setTimeout(() => { if (my === gen) kb?.flash(m, 'ml-hit', ms * 0.8); }, i * ms));
  await playSeq(seq, { bpm: BPM, timbre: 'piano' });
  if (my !== gen) return;
  locked = false;
  t0 = performance.now();
}

async function next() {
  const my = ++gen;
  locked = true;
  const level = levelNow();
  const stats = await loadItemMastery(SKILL);
  if (my !== gen) return;
  current = pickWeak(pool(level), stats, { keyOf: itemOf, avoid: last });
  last = itemOf(current);
  seq = sequence(current, level);
  idx = 0;
  wrongLogged = false;
  win = windowOf(seq);
  buildKeyboard();
  paint();
  if (game.settings.model && LEVELS[level].model) await model();
  else { locked = false; t0 = performance.now(); }
}

async function onKey(midi) {
  if (locked || !current) return;
  if (midi === seq[idx]) {
    idx++;
    if (idx < seq.length) { paint(); return; }
    locked = true;
    const my = gen;
    if (!wrongLogged) streak++;
    paint();
    kb.flash(midi, 'ml-good', 450);
    await game.attempt({ skill: SKILL, correct: true, ms: Math.round(performance.now() - t0), level: levelNow(), item: itemOf(current), silent: true });
    setTimeout(() => { if (my === gen) next(); }, 900);
    return;
  }
  // Wrong note: counted once per scale, then the player goes on from the same note.
  streak = 0;
  kb.flash(midi, 'ml-bad', 400);
  offerBtn.classList.add('ps-off');
  if (wrongLogged) return game.flash(false, { silent: true });
  wrongLogged = true;
  await game.attempt({ skill: SKILL, correct: false, ms: Math.round(performance.now() - t0), level: levelNow(), item: itemOf(current), silent: true });
}

listenBtn.onclick = () => { if (started && current && (!locked || idx < seq.length)) { gen++; model(); } };
offerBtn.onclick = () => { if (levelNow() < MAX_LEVEL) game.set('level', levelNow() + 1); };
game.on('settings', () => { if (started) { streak = 0; kbKey = ''; next(); } });
game.on('lang', () => { if (started) { kbKey = ''; buildKeyboard(); paint(); } });

window.__test = {
  state: () => ({ level: levelNow(), item: current && itemOf(current), scale: current?.scale, tonic: current?.tonic, expected: seq, idx, win, locked, streak, wrongLogged }),
  steps: (id) => SCALES[id].steps,
};

game.ready().then(() => {
  started = true;
  game.stage.replaceChildren(nameEl, h('div', { className: 'ps-top' }, dotsEl, listenBtn), h('div', { className: 'ps-input' }, kbBox), offerBtn);
  next();
});
