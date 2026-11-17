// Scales by ear: bright or dark first, then the names, the three minors, the modes and a few special scales.
import { createGame } from '@core/shell.js';
import { playNote, audioTime } from '@core/audio.js';
import { SCALES, rand, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6, SKILL = 'listen.scales', CLEAN = 8;
const game = createGame({
  id: 'ear-scales',
  title: L('Guess the scale', 'Devine la gamme'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    bright: L('Bright', 'Clair'),
    dark: L('Dark', 'Sombre'),
    ionian: L('Ionian (major)', 'Ionien (majeur)'),
    aeolian: L('Aeolian (minor)', 'Éolien (mineur)'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Bright or dark', '1 · Clair ou sombre') },
      { value: 2, label: L('2 · Major, minor and pentatonics', '2 · Majeure, mineure et pentatoniques') },
      { value: 3, label: L('3 · The three minor scales', '3 · Les trois gammes mineures') },
      { value: 4, label: L('4 · Four modes', '4 · Quatre modes') },
      { value: 5, label: L('5 · The seven modes', '5 · Les sept modes') },
      { value: 6, label: L('6 · Modes, whole tone, blues…', '6 · Modes, gamme par tons, blues…') },
    ] },
    { key: 'tempo', label: L('Speed', 'Vitesse'), type: 'range', min: 120, max: 320, step: 20, default: 200 },
  ],
});

const MODES = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'minor', 'locrian'];
// down: the scale goes up then down. modes: major and minor carry their mode names. show: choices per question.
const LEVELS = {
  1: { types: ['major', 'minor'], icons: true },
  2: { types: ['major', 'minor', 'pentaMajor', 'pentaMinor'] },
  3: { types: ['minor', 'harmonicMinor', 'melodicMinor'], down: true },
  4: { types: ['major', 'dorian', 'mixolydian', 'minor'], down: true, modes: true },
  5: { types: MODES, down: true, modes: true },
  6: { types: [...MODES, 'harmonicMinor', 'wholeTone', 'blues'], down: true, modes: true, show: 6 },
};

const SUN = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="13" fill="currentColor"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M32 5v7M32 52v7M5 32h7M52 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5"/></g></svg>';
const MOON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M41 8a25 25 0 1 0 15 33A21 21 0 0 1 41 8z"/></svg>';
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';

const upOf = (tonic, id) => [...SCALES[id].steps, 12].map((s) => tonic + s);
const lineOf = (tonic, id, down) => { const up = upOf(tonic, id); return down ? [...up, ...up.slice(0, -1).reverse()] : up; };

// Timers wake up just before each event and schedule it on the audio clock: tight rhythm, and it can be cancelled.
let timers = [];
function stop() { timers.forEach(clearTimeout); timers = []; mark(null); }
function run(events) {
  stop();
  const t0 = audioTime() + 0.06;
  for (const e of events) timers.push(setTimeout(() => e.fn(Math.max(0, t0 + e.t - audioTime())), Math.max(0, e.t * 1000 - 40)));
}
let marked = null;
function mark(el) { marked?.classList.remove('sc-playing'); marked = el; el?.classList.add('sc-playing'); }

/** Events for one or several lines of notes, each announced by highlighting an element. Returns the events. */
function lines(parts) {
  const step = 60 / (+game.settings.tempo || 200);
  const ev = [];
  let t = 0;
  for (const { notes, el } of parts) {
    ev.push({ t, fn: () => mark(el) });
    notes.forEach((m, i) => {
      const end = i === notes.length - 1;
      ev.push({ t, fn: (when) => playNote(m, { when, dur: step * (end ? 2.4 : 1.05), gain: 0.24 }) });
      t += step * (end ? 4 : 1);
    });
  }
  ev.push({ t: t - step, fn: () => mark(null) });
  return ev;
}

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, timer = 0;
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const choices = game.h('div', { className: 'sc-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary sc-next' });
replay.onclick = () => play();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play() { if (q) run(lines([{ notes: q.notes, el: null }])); }

const label = (id) => (q.modes && id === 'major' ? game.t('ionian') : q.modes && id === 'minor' ? game.t('aeolian') : SCALES[id][game.lang]);

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  const old = new Map([...choices.children].map((b) => [b.dataset.type, b]));
  choices.replaceChildren(...q.types.map((type) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (q.icons) {
      b.classList.add('sc-icon', type === 'major' ? 'sc-bright' : 'sc-dark');
      b.innerHTML = type === 'major' ? SUN : MOON;
      b.setAttribute('aria-label', game.t(type === 'major' ? 'bright' : 'dark'));
    } else b.textContent = label(type);
    b.dataset.type = type;
    b.onclick = () => answer(type, b);
    const was = old.get(type); // a language change keeps the marks of the current question
    if (was && q.keep) { b.className = was.className; b.disabled = was.disabled; }
    return b;
  }));
  q.keep = true;
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  stop();
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const item = pickWeak(cfg.types, stats, { avoid: cfg.types.length > 4 ? last : undefined });
  last = item;
  let types = cfg.types;
  if (cfg.show && cfg.show < types.length) {
    const keep = new Set([item, ...shuffle(types.filter((x) => x !== item)).slice(0, cfg.show - 1)]);
    types = types.filter((x) => keep.has(x));
  }
  const tonic = 55 + rand(12);
  q = { level, item, tonic, types, icons: !!cfg.icons, modes: !!cfg.modes, down: !!cfg.down, notes: lineOf(tonic, item, cfg.down) };
  missed = false;
  locked = false;
  render();
  play();
  started = performance.now();
}

async function answer(type, button) {
  if (locked || button.disabled) return;
  const ok = type === q.item;
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : type };
  clearTimeout(timer);
  stop();
  if (ok) {
    locked = true;
    button.classList.add('ml-right');
    if (missed) game.flash(true); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= CLEAN) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('sc-show');
        else if (streak === CLEAN) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 900);
  } else {
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('sc-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    // Compare: the scale that was chosen, then the question again, both going up from the same tonic.
    const cur = q;
    timer = setTimeout(() => {
      if (cur !== q) return;
      run(lines([{ notes: upOf(q.tonic, type), el: button }, { notes: upOf(q.tonic, q.item), el: replay }]));
    }, 650);
  }
}

window.__test = { state: () => ({ level: q?.level, item: q?.item, tonic: q?.tonic, notes: q?.notes, types: q?.types }) };

game.ready().then(() => {
  game.stage.replaceChildren(replay, choices, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('sc-show'); next(); });
  game.on('lang', render);
  next();
});
