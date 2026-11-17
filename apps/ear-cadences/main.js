// Cadences by ear: does the phrase land or stay in the air? Then the names, then minor keys,
// then jazz and modal endings. Feeling first, vocabulary later.
import { createGame } from '@core/shell.js';
import { playChord } from '@core/audio.js';
import { chordNotes, mod, pick, rand } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const game = createGame({
  id: 'ear-cadences',
  title: L('Guess the ending', 'Devine la fin'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    settled: L('Settled', 'Posé'),
    hanging: L('Hanging', 'Suspendu'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Settled or hanging', '1 · Posé ou suspendu') },
      { value: 2, label: L('2 · Perfect or half cadence', '2 · Cadence parfaite ou demi-cadence') },
      { value: 3, label: L('3 · Plus the plagal cadence', '3 · Avec la cadence plagale') },
      { value: 4, label: L('4 · Plus the deceptive cadence', '4 · Avec la cadence rompue') },
      { value: 5, label: L('5 · Four cadences, major and minor', '5 · Quatre cadences, en majeur et en mineur') },
      { value: 6, label: L('6 · Jazz and modal endings', '6 · Fins jazz et modales') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 110, step: 5, default: 70 },
  ],
});

// Roman numeral → [semitones above the tonic, chord type].
const ROMAN = {
  I: [0, 'maj'], ii: [2, 'min'], IV: [5, 'maj'], V: [7, 'maj'], V7: [7, 'dom7'], vi: [9, 'min'],
  i: [0, 'min'], iv: [5, 'min'], bVI: [8, 'maj'], bVII: [10, 'maj'],
  ii7: [2, 'min7'], Imaj7: [0, 'maj7'], bII7: [1, 'dom7'], iv7: [5, 'min7'], bVII7: [10, 'dom7'],
};
// Each cadence: a name and several ways to reach it (one is picked at random).
const CADENCES = {
  parfaite: { name: L('Perfect', 'Parfaite'), maj: [['I', 'IV', 'V7', 'I'], ['I', 'ii', 'V7', 'I'], ['I', 'vi', 'IV', 'V7', 'I']], min: [['i', 'iv', 'V7', 'i'], ['i', 'bVI', 'iv', 'V7', 'i']] },
  demi: { name: L('Half', 'Demi-cadence'), maj: [['I', 'IV', 'V'], ['I', 'vi', 'ii', 'V'], ['I', 'IV', 'I', 'V']], min: [['i', 'iv', 'V'], ['i', 'bVI', 'iv', 'V']] },
  plagale: { name: L('Plagal', 'Plagale'), maj: [['I', 'vi', 'IV', 'I'], ['I', 'V', 'IV', 'I']], min: [['i', 'bVI', 'iv', 'i'], ['i', 'V', 'iv', 'i']] },
  rompue: { name: L('Deceptive', 'Rompue'), maj: [['I', 'IV', 'V7', 'vi'], ['I', 'ii', 'V7', 'vi']], min: [['i', 'iv', 'V7', 'bVI']] },
  iiVI: { name: L('ii–V–I', 'ii–V–I'), maj: [['ii7', 'V7', 'Imaj7']] },
  tritone: { name: L('Tritone substitution', 'Substitution tritonique'), maj: [['ii7', 'bII7', 'Imaj7']] },
  backdoor: { name: L('Backdoor', 'Backdoor'), maj: [['iv7', 'bVII7', 'Imaj7']] },
  picarde: { name: L('Picardy third', 'Tierce picarde'), maj: [['i', 'iv', 'V7', 'I']] },
  andalouse: { name: L('Andalusian', 'Andalouse'), maj: [['i', 'bVII', 'bVI', 'V']] },
};
const FOUR = ['parfaite', 'demi', 'plagale', 'rompue'];
const LEVELS = {
  1: { skill: 'listen.cadence.feel', types: ['parfaite', 'demi'], icons: true },
  2: { skill: 'listen.cadence.basic', types: ['parfaite', 'demi'] },
  3: { skill: 'listen.cadence.basic', types: ['parfaite', 'demi', 'plagale'] },
  4: { skill: 'listen.cadence.all', types: FOUR },
  5: { skill: 'listen.cadence.all', types: FOUR, minor: true },
  6: { skill: 'listen.cadence.advanced', types: ['iiVI', 'tritone', 'backdoor', 'picarde', 'andalouse'] },
};

// A ball resting on the ground, or a ball left in the air.
const SETTLED = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52h48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="38" r="12" fill="currentColor"/></svg>';
const HANGING = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52h48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 36v8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/></svg>';
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';

/** Bass note plus the chord tones, all kept in the same narrow register so the voices move smoothly. */
function voice(key, roman) {
  const [root, type] = ROMAN[roman];
  const tones = chordNotes(key + root, type).map((m) => 57 + mod(m - 57, 12));
  return [43 + mod(key + root - 43, 12), ...tones];
}

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0;
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const choices = game.h('div', { className: 'cd-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary cd-next' });
replay.onclick = () => play();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play() {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return; // already sounding
  const beat = 60 / (+game.settings.tempo || 70);
  q.chords.forEach((notes, i) => {
    const end = i === q.chords.length - 1;
    playChord(notes, { when: i * beat, dur: (end ? 2.2 : 0.95) * beat, gain: 0.36 });
  });
  quietUntil = now + (q.chords.length + 1.2) * beat * 1000;
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  choices.replaceChildren(...q.types.map((type) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (q.icons) {
      b.classList.add('cd-icon');
      b.innerHTML = type === 'parfaite' ? SETTLED : HANGING;
      b.setAttribute('aria-label', game.t(type === 'parfaite' ? 'settled' : 'hanging'));
    } else b.textContent = game.tr(CADENCES[type].name);
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
  const items = cfg.minor ? cfg.types.flatMap((t) => [t, t + ':m']) : cfg.types;
  const item = pickWeak(items, stats, { avoid: last });
  last = item;
  const [type, mode] = item.split(':');
  const key = 48 + rand(12);
  const romans = pick(CADENCES[type][mode ? 'min' : 'maj']);
  q = { level, skill: cfg.skill, item, type, types: cfg.types, icons: !!cfg.icons, romans, chords: romans.map((r) => voice(key, r)) };
  missed = false;
  locked = false;
  render();
  quietUntil = 0;
  play();
  started = performance.now();
}

async function answer(type, button) {
  if (locked || button.disabled) return;
  const ok = type === q.type;
  const rec = { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : type };
  clearTimeout(timer);
  if (ok) {
    locked = true;
    button.classList.add('ml-right');
    if (missed) game.flash(true); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= 10) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('cd-show');
        else if (streak === 10) game.say(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 900);
  } else {
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('cd-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    timer = setTimeout(() => { quietUntil = 0; play(); }, 700); // hear it again, then retry
  }
}

window.__test = { state: () => ({ level: q?.level, item: q?.item, type: q?.type, romans: q?.romans, chords: q?.chords }) };

game.ready().then(() => {
  game.stage.replaceChildren(replay, choices, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('cd-show'); next(); });
  game.on('lang', render);
  next();
});
