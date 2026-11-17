// Tunes you know: the app plays a phrase of a traditional tune, the player plays it back on the keyboard.
import { createGame } from '@core/shell.js';
import { createKeyboard } from '@core/keyboard.js';
import { playNote, wait } from '@core/audio.js';
import { isNatural, rand, pick } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import { TUNES, span } from './tunes.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const SKILL = 'play.tunes';
const game = createGame({
  id: 'known-tunes',
  title: L('Tunes you know', 'Airs connus'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    nextLevel: L('Level {n} →', 'Niveau {n} →'),
    levelUp: L('Well done! Ready for the next level?', 'Bravo ! On passe au niveau suivant ?'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Openings, 3–5 notes', '1 · Débuts de 3 à 5 notes') },
      { value: 2, label: L('2 · First phrases', '2 · Premières phrases') },
      { value: 3, label: L('3 · Whole tunes', '3 · Airs entiers') },
      { value: 4, label: L('4 · In G or F', '4 · En sol ou en fa') },
      { value: 5, label: L('5 · Wider tunes', '5 · Airs plus étendus') },
      { value: 6, label: L('6 · Start from any key', '6 · Départ sur n’importe quelle touche') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 130, step: 5, default: 84 },
  ],
});

const STREAK = 6;
const levelNow = () => (+game.settings.level >= 1 && +game.settings.level <= 6 ? +game.settings.level : 1);

let kb = null, tune = null, shift = 0, win = [60, 72];
let phraseIdx = 0, expected = [], beats = [], pos = 0, failed = false, startedAt = 0;
let state = 'idle', streak = 0, last = null, nameShown = false;
let gen = 0, running = false, forced = null;

const replay = game.h('button', { className: 'ml-round tn-replay', textContent: '▶' });
const dots = game.h('div', { className: 'tn-dots' });
const nameEl = game.h('p', { className: 'tn-name' });
const top = game.h('div', { className: 'tn-top' }, replay, dots, nameEl);
const kbBox = game.h('div', { className: 'tn-kb' });
const nextBox = game.h('div', { className: 'tn-next' });

function expose() {
  window.__test = { state: () => ({
    level: levelNow(), tune: tune?.id, phrase: phraseIdx, phrases: tune?.phrases.length, shift, expected: [...expected], pos, win: [...win],
    state, failed, streak, nameShown, name: nameEl.textContent,
    startMarked: [...kbBox.querySelectorAll('.tn-start')].map((k) => +k.dataset.midi),
  }), force: (id) => { forced = id || null; restart(); } };
}
function setState(s) { state = s; replay.disabled = s !== 'answer'; expose(); }
function renderDots() {
  dots.replaceChildren(...expected.map((_, i) => game.h('span', { className: 'tn-dot' + (i < pos ? ' tn-on' : '') })));
  expose();
}
function renderTexts() {
  replay.setAttribute('aria-label', game.t('replay'));
  const lv = levelNow();
  if (streak >= STREAK && lv < 6) {
    const b = game.h('button', { className: 'ml-btn ml-primary', textContent: game.t('nextLevel', { n: lv + 1 }) });
    b.onclick = () => game.set('level', lv + 1);
    nextBox.replaceChildren(b);
  } else nextBox.replaceChildren();
  if (nameShown && tune) nameEl.textContent = game.tr(tune.name);
}

function windowFor(t, sh) {
  const all = t.phrases.flatMap((p) => p.n).map((m) => m + sh);
  let lo = Math.min(...all), hi = Math.max(...all);
  while (!isNatural(lo)) lo--;
  while (!isNatural(hi)) hi++;
  const whites = () => { let c = 0; for (let m = lo; m <= hi; m++) if (isNatural(m)) c++; return c; };
  while (whites() < 8) hi++;
  while (!isNatural(hi)) hi++;
  return [lo, hi];
}

// Transposition (semitones from C) for a level.
function pickShift(lv, t) {
  if (lv <= 3) return 0;
  const centre = (x) => { const a = t.phrases.flatMap((p) => p.n); return (Math.min(...a) + Math.max(...a)) / 2 + x; };
  const near = (opts) => opts.reduce((b, x) => (Math.abs(centre(x) - 66) < Math.abs(centre(b) - 66) ? x : b));
  const G = near([7, -5]), F = near([5, -7]);
  if (lv === 4) return pick([G, F]);
  if (lv === 5) return pick([0, G, F]);
  return pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);
}

function mark() {
  kbBox.querySelectorAll('.tn-start').forEach((k) => k.classList.remove('tn-start'));
  if (levelNow() <= 4 && pos === 0) kbBox.querySelector(`[data-midi="${expected[0]}"]`)?.classList.add('tn-start');
}

function setPhrase(idx) {
  const lv = levelNow();
  phraseIdx = idx;
  const ph = tune.phrases[idx];
  let n = ph.n.length;
  if (lv === 1) n = 3 + rand(Math.min(5, ph.n.length) - 2);
  expected = ph.n.slice(0, n).map((m) => m + shift);
  beats = ph.b.slice(0, n);
  pos = 0; failed = false;
  renderDots();
  mark();
}

async function playPhrase(g) {
  setState('playing');
  kb.setEnabled(false);
  await wait(350);
  if (g !== gen) return;
  const beat = 60000 / (+game.settings.tempo || 84);
  for (let i = 0; i < expected.length; i++) {
    playNote(expected[i], { dur: (beats[i] * beat * 0.9) / 1000 });
    kb.flash(expected[i], 'ml-hit', Math.min(beats[i], 1) * beat * 0.7);
    await wait(Math.min(beats[i], 2) * beat);
    if (g !== gen) return;
  }
  kb.setEnabled(true);
  startedAt = performance.now();
  setState('answer');
}

async function newTune() {
  const g = gen, lv = levelNow();
  let pool = TUNES.filter((t) => (t.from || 1) <= lv);
  if (lv === 5) pool = pool.filter((t) => span(t) >= 9);
  if (forced) pool = TUNES.filter((t) => t.id === forced);
  let stats = null;
  try { stats = await loadItemMastery(SKILL); } catch { /* storage unavailable */ }
  if (g !== gen) return;
  tune = pickWeak(pool, stats, { keyOf: (t) => t.id, avoid: last });
  last = tune.id;
  shift = pickShift(lv, tune);
  win = windowFor(tune, shift);
  nameShown = false;
  nameEl.textContent = '';
  kb = createKeyboard(kbBox, { from: win[0], to: win[1], onDown: onKey });
  kb.setEnabled(false);
  setPhrase(0);
  playPhrase(g);
}

async function log(correct) {
  return game.attempt({
    skill: SKILL, correct, level: levelNow(), item: tune.id, ms: Math.round(performance.now() - startedAt),
    detail: { phrase: phraseIdx, shift, retry: failed },
  });
}

async function onKey(midi) {
  if (state !== 'answer') return;
  const g = gen;
  if (midi === expected[pos]) {
    pos++;
    renderDots();
    mark();
    if (pos < expected.length) return;
    setState('done');
    kb.setEnabled(false);
    kb.flash(midi, 'ml-good', 500);
    if (!failed) streak++;
    const lv = levelNow();
    await log(true);
    if (g !== gen) return;
    if (streak === STREAK && lv < 6) game.say(game.t('levelUp'));
    const lastPhrase = lv <= 2 || phraseIdx === tune.phrases.length - 1;
    if (lastPhrase && lv <= 2) { nameShown = true; }
    renderTexts();
    expose();
    await wait(lastPhrase && lv <= 2 ? 1500 : 800);
    if (g !== gen) return;
    if (!lastPhrase) { setPhrase(phraseIdx + 1); playPhrase(g); }
    else newTune();
  } else {
    setState('done');
    kb.setEnabled(false);
    kb.flash(midi, 'ml-bad', 600);
    streak = 0;
    renderTexts();
    if (!failed) { const l = log(false); failed = true; await l; } else game.flash(false);
    if (g !== gen) return;
    pos = 0;
    renderDots();
    await wait(800);
    if (g !== gen) return;
    mark();
    playPhrase(g);
  }
}

replay.onclick = () => { if (state === 'answer') { pos = 0; renderDots(); mark(); playPhrase(gen); } };

function restart() {
  if (!running) return;
  const g = ++gen;
  streak = 0; last = null;
  setState('idle');
  renderTexts();
  const dlg = document.querySelector('dialog.ml-settings');
  if (dlg?.open) dlg.addEventListener('close', () => { if (g === gen) newTune(); }, { once: true });
  else newTune();
}
game.on('settings', restart);
game.on('lang', renderTexts);
expose();

game.ready().then(() => {
  game.stage.replaceChildren(top, kbBox, nextBox);
  running = true;
  renderTexts();
  newTune();
});
