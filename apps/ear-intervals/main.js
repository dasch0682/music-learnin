// Intervals by ear: hear two notes, find the second one on the keyboard (or name the interval).
import { createGame } from '@core/shell.js';
import { playNote, playChord } from '@core/audio.js';
import { INTERVALS, rand } from '@core/music.js';
import { createKeyboard } from '@core/keyboard.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'ear-intervals',
  title: L('Guess the interval', 'Devine l’intervalle'),
  strings: {
    find: L('Find the second note', 'Trouve la deuxième note'),
    findTop: L('Find the top note', 'Trouve la note du haut'),
    replay: L('Listen again', 'Réécouter'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · 2nd, 3rd, 5th, octave, going up', '1 · Seconde, tierce, quinte, octave, en montant') },
      { value: 2, label: L('2 · Plus minor 3rd and 4th, up and down', '2 · Avec tierce mineure et quarte, en montant et en descendant') },
      { value: 3, label: L('3 · All intervals, going up', '3 · Tous les intervalles, en montant') },
      { value: 4, label: L('4 · All intervals, up and down', '4 · Tous les intervalles, en montant et en descendant') },
      { value: 5, label: L('5 · Two notes together', '5 · Deux notes ensemble') },
    ] },
    { key: 'answer', label: L('Answer', 'Réponse'), type: 'select', default: 'play', options: [
      { value: 'play', label: L('Play it on the keyboard', 'Jouer sur le clavier') },
      { value: 'name', label: L('Name the interval', 'Nommer l’intervalle') },
    ] },
  ],
});
const MAX_LEVEL = 5;
const KB_FROM = 60, KB_TO = 79; // C4..G5: wide enough for an octave, keys still large on a phone

const BY_ID = Object.fromEntries(INTERVALS.map((i) => [i.id, i]));
const ALL = INTERVALS.filter((i) => i.semi > 0).map((i) => i.id);
const LEVELS = {
  1: { skill: 'listen.intervals.basic', ids: ['M2', 'M3', 'P5', 'P8'], dirs: ['+'] },
  2: { skill: 'listen.intervals.basic', ids: ['M2', 'm3', 'M3', 'P4', 'P5', 'P8'], dirs: ['+', '-'] },
  3: { skill: 'listen.intervals.all', ids: ALL, dirs: ['+'] },
  4: { skill: 'listen.intervals.all', ids: ALL, dirs: ['+', '-'] },
  5: { skill: 'listen.intervals.harmonic', ids: ALL, dirs: ['h'] },
};
const itemsOf = (cfg) => cfg.ids.flatMap((id) => cfg.dirs.map((d) => id + d));

function build(level, item) {
  const cfg = LEVELS[level];
  const id = item.slice(0, 2), dir = item.slice(2);
  const delta = BY_ID[id].semi * (dir === '-' ? -1 : 1);
  const lo = KB_FROM - Math.min(0, delta), hi = KB_TO - Math.max(0, delta);
  const first = lo + rand(hi - lo + 1);
  return { level, skill: cfg.skill, item, id, dir, first, second: first + delta, ids: cfg.ids };
}

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0;
const playMode = () => game.settings.answer !== 'name';

const replay = game.h('button', { className: 'ml-round', innerHTML: '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>' });
const hint = game.h('p', { className: 'ml-hint' });
const kbBox = game.h('div', { className: 'ei-kb' });
const names = game.h('div', { className: 'ml-choices ei-names' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary ei-next' });
const kb = createKeyboard(kbBox, { from: KB_FROM, to: KB_TO, onDown: onKey });
const keyEl = (midi) => kb.el.querySelector(`[data-midi="${midi}"]`);
replay.onclick = () => play();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play() {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return; // already sounding
  if (q.dir === 'h') {
    playChord([q.first, q.second], { dur: 1.5, gain: 0.34 });
    quietUntil = now + 1500;
  } else {
    playNote(q.first, { dur: 0.75, gain: 0.28 });
    playNote(q.second, { dur: 0.9, when: 0.8, gain: 0.28 });
    quietUntil = now + 1600;
  }
}

function render() {
  if (!q) return;
  const byKeys = playMode();
  kbBox.hidden = !byKeys;
  hint.hidden = !byKeys;
  names.hidden = byKeys;
  hint.textContent = game.t(q.dir === 'h' ? 'findTop' : 'find');
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  kb.el.querySelectorAll('.ei-first, .ml-good').forEach((k) => k.classList.remove('ei-first', 'ml-good'));
  if (byKeys) keyEl(q.first)?.classList.add('ei-first');
  names.classList.toggle('ei-few', q.ids.length <= 6);
  names.replaceChildren(...(byKeys ? [] : q.ids.map((id) => {
    const b = game.h('button', { className: 'ml-btn', textContent: BY_ID[id][game.lang] });
    b.onclick = () => answer(id === q.id, id, b);
    return b;
  })));
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(cfg.skill);
  if (id !== seq) return;
  const item = pickWeak(itemsOf(cfg), stats, { avoid: last });
  last = item;
  q = build(level, item);
  missed = false;
  locked = false;
  render();
  quietUntil = 0;
  play();
  started = performance.now();
}

function onKey(midi) {
  if (!q || locked || !playMode()) return;
  clearTimeout(timer);
  if (midi === q.first) return; // the given note: just listen to it
  answer(midi === q.second, midi, null);
}

/** given: the key tapped (play mode) or the interval id chosen (name mode). */
async function answer(ok, given, button) {
  if (locked || button?.disabled) return;
  const byKeys = playMode();
  const rec = { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item,
    detail: { mode: byKeys ? 'play' : 'name', given: ok ? null : given }, silent: byKeys }; // in play mode the tapped note is the sound feedback
  clearTimeout(timer);
  if (ok) {
    locked = true;
    if (button) button.classList.add('ml-right'); else keyEl(given)?.classList.add('ml-good');
    if (missed) game.flash(true, { silent: byKeys }); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= 10) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('ei-show');
        else if (streak === 10) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, byKeys ? 900 : 750);
  } else {
    if (button) { button.classList.add('ml-wrong'); button.disabled = true; } else kb.flash(given, 'ml-bad', 500);
    streak = 0;
    nextBtn.classList.remove('ei-show');
    if (missed) game.flash(false, { silent: byKeys });
    else { missed = true; await game.attempt(rec); }
    timer = setTimeout(play, byKeys ? 900 : 650); // hear it again, then retry
  }
}

window.__test = { state: () => (q ? { ...q, ids: [...q.ids], mode: playMode() ? 'play' : 'name' } : null) };

game.ready().then(() => {
  game.stage.replaceChildren(replay, hint, kbBox, names, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('ei-show'); next(); });
  game.on('lang', render);
  next();
});
