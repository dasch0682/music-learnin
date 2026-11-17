// Chords by ear: bright or dark first (major / minor), then the names, then more chord colours.
import { createGame } from '@core/shell.js';
import { playNote, playChord } from '@core/audio.js';
import { CHORDS, chordNotes, rand } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'ear-chords',
  title: L('Guess the chord', 'Devine l’accord'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    arpeggio: L('Note by note', 'Note par note'),
    bright: L('Bright', 'Clair'),
    dark: L('Dark', 'Sombre'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Bright or dark', '1 · Clair ou sombre') },
      { value: 2, label: L('2 · Major or minor', '2 · Majeur ou mineur') },
      { value: 3, label: L('3 · Four triads', '3 · Quatre accords de trois sons') },
      { value: 4, label: L('4 · Three seventh chords', '4 · Trois accords de septième') },
      { value: 5, label: L('5 · Five seventh chords', '5 · Cinq accords de septième') },
    ] },
  ],
});
const MAX_LEVEL = 5;

// inv: random inversions; arp: the question is sometimes played note by note.
const LEVELS = {
  1: { skill: 'listen.chords.triads', types: ['maj', 'min'], icons: true },
  2: { skill: 'listen.chords.triads', types: ['maj', 'min'], inv: true, arp: true },
  3: { skill: 'listen.chords.triads4', types: ['maj', 'min', 'dim', 'aug'], arp: true },
  4: { skill: 'listen.chords.sevenths', types: ['maj7', 'dom7', 'min7'] },
  5: { skill: 'listen.chords.sevenths', types: ['maj7', 'dom7', 'min7', 'm7b5', 'dim7'] },
};

const SUN = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="13" fill="currentColor"/><g stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M32 5v7M32 52v7M5 32h7M52 32h7M13 13l5 5M46 46l5 5M13 51l5-5M46 18l5-5"/></g></svg>';
const MOON = '<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M41 8a25 25 0 1 0 15 33A21 21 0 0 1 41 8z"/></svg>';
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const STEPS = '<svg viewBox="0 0 64 64" width="36" height="36" fill="currentColor" aria-hidden="true"><circle cx="12" cy="48" r="9"/><circle cx="32" cy="32" r="9"/><circle cx="52" cy="16" r="9"/></svg>';

function build(level, type) {
  const cfg = LEVELS[level];
  const root = (level === 1 ? 55 : 50) + rand(level === 1 ? 8 : 13);
  const notes = chordNotes(root, type);
  if (cfg.inv) for (let k = rand(notes.length); k > 0; k--) notes.push(notes.shift() + 12);
  return { level, skill: cfg.skill, item: type, types: cfg.types, icons: !!cfg.icons, notes, arp: !!cfg.arp && rand(3) === 0 };
}

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0;

const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const arpBtn = game.h('button', { className: 'ec-arp', innerHTML: STEPS });
const choices = game.h('div', { className: 'ec-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary ec-next' });
replay.onclick = () => play(q?.arp);
arpBtn.onclick = () => play(true);
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play(arp) {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return; // already sounding
  if (arp) {
    const step = 0.38, n = q.notes.length;
    q.notes.forEach((m, i) => playNote(m, { when: i * step, dur: (n - i) * step + 0.5, gain: 0.16 }));
    quietUntil = now + (n * step + 0.5) * 1000;
  } else {
    playChord(q.notes, { dur: 1.5, gain: 0.36 });
    quietUntil = now + 1500;
  }
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  arpBtn.setAttribute('aria-label', game.t('arpeggio'));
  nextBtn.textContent = game.t('next');
  choices.replaceChildren(...q.types.map((type) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (q.icons) {
      b.classList.add('ec-icon', type === 'maj' ? 'ec-bright' : 'ec-dark');
      b.innerHTML = type === 'maj' ? SUN : MOON;
      b.setAttribute('aria-label', game.t(type === 'maj' ? 'bright' : 'dark'));
    } else b.textContent = CHORDS[type][game.lang];
    b.dataset.type = type;
    b.onclick = () => answer(type, b);
    return b;
  }));
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(cfg.skill);
  if (id !== seq) return;
  // With very few chord types, forbidding a repeat would make the answer predictable.
  const type = pickWeak(cfg.types, stats, { avoid: cfg.types.length > 4 ? last : undefined });
  last = type;
  q = build(level, type);
  missed = false;
  locked = false;
  render();
  quietUntil = 0;
  play(q.arp);
  started = performance.now();
}

async function answer(type, button) {
  if (locked || button.disabled) return;
  const ok = type === q.item;
  const rec = { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : type };
  clearTimeout(timer);
  if (ok) {
    locked = true;
    button.classList.add('ml-right');
    if (missed) game.flash(true); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= 10) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('ec-show');
        else if (streak === 10) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 800);
  } else {
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('ec-show');
    if (missed) { choices.querySelector(`[data-type="${q.item}"]`)?.classList.add('ml-reveal'); game.flash(false); } // 2nd miss: show the answer
    else { missed = true; await game.attempt(rec); }
    timer = setTimeout(() => play(q.arp), 650); // hear it again, then retry
  }
}

window.__test = { state: () => (q ? { ...q, notes: [...q.notes], types: [...q.types] } : null) };

game.ready().then(() => {
  game.stage.replaceChildren(game.h('div', { className: 'ec-top' }, replay, arpBtn), choices, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('ec-show'); next(); });
  game.on('lang', render);
  next();
});
