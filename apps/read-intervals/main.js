// Read the interval: two notes on the staff. First the shape (same, step, skip), then the number, then the quality.
import { createGame } from '@core/shell.js';
import { renderStaff, CLEFS } from '@core/staff.js';
import { pick, rand } from '@core/music.js';
import { playNote } from '@core/audio.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const SKILL = 'read.intervals';
const MAX_LEVEL = 6;
const game = createGame({
  id: 'read-intervals',
  title: L('Read the interval', 'Lis l’intervalle'),
  strings: {
    same: L('Same note', 'Même note'),
    step: L('Step', 'Pas'),
    skip: L('Skip', 'Saut'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, sharp eyes!', 'Bravo, quel coup d’œil !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Same, step or skip', '1 · Pareil, pas ou saut') },
      { value: 2, label: L('2 · Second to fifth', '2 · De la seconde à la quinte') },
      { value: 3, label: L('3 · Up to the octave, treble and bass clefs', '3 · Jusqu’à l’octave, clés de sol et de fa') },
      { value: 4, label: L('4 · Major or minor: seconds and thirds', '4 · Majeure ou mineure : secondes et tierces') },
      { value: 5, label: L('5 · All the common intervals', '5 · Tous les intervalles courants') },
      { value: 6, label: L('6 · Key signatures, stacked notes, four clefs', '6 · Armures, notes superposées, quatre clés') },
    ] },
    { key: 'sound', label: L('Play the interval', 'Jouer l’intervalle'), type: 'toggle', default: true },
  ],
});

const NUMBERS = {
  2: L('Second', 'Seconde'), 3: L('Third', 'Tierce'), 4: L('Fourth', 'Quarte'), 5: L('Fifth', 'Quinte'),
  6: L('Sixth', 'Sixte'), 7: L('Seventh', 'Septième'), 8: L('Octave', 'Octave'),
};
const NAMES = {
  m2: L('Minor second', 'Seconde mineure'), M2: L('Major second', 'Seconde majeure'),
  m3: L('Minor third', 'Tierce mineure'), M3: L('Major third', 'Tierce majeure'),
  P4: L('Perfect fourth', 'Quarte juste'), A4: L('Augmented fourth', 'Quarte augmentée'),
  d5: L('Diminished fifth', 'Quinte diminuée'), P5: L('Perfect fifth', 'Quinte juste'),
  m6: L('Minor sixth', 'Sixte mineure'), M6: L('Major sixth', 'Sixte majeure'),
  m7: L('Minor seventh', 'Septième mineure'), M7: L('Major seventh', 'Septième majeure'),
  P8: L('Perfect octave', 'Octave juste'),
};
const ALL = Object.keys(NAMES); // ordered from the smallest to the largest

// kind: what is asked. show: number of buttons (the right answer and its near neighbours).
const LEVELS = {
  1: { kind: 'shape', items: ['same', 'step', 'skip'], clefs: ['treble'] },
  2: { kind: 'number', items: ['2', '3', '4', '5'], clefs: ['treble'] },
  3: { kind: 'number', items: ['2', '3', '4', '5', '6', '7', '8'], clefs: ['treble', 'bass'], show: 5 },
  4: { kind: 'quality', items: ['m2', 'M2', 'm3', 'M3'], clefs: ['treble', 'bass'], accs: true },
  5: { kind: 'quality', items: ALL, clefs: ['treble', 'bass'], accs: true, show: 6 },
  6: { kind: 'quality', items: ALL, clefs: ['treble', 'bass', 'alto', 'tenor'], keys: true, harmonic: true, show: 6 },
};

// ---- Notes are spelled: letter (0 = C), accidental, octave. step = diatonic index (C4 = 28).
const PC = [0, 2, 4, 5, 7, 9, 11];
const note = (step, acc = 0) => {
  const letter = step % 7, octave = Math.floor(step / 7);
  return { step, letter, octave, acc, midi: (octave + 1) * 12 + PC[letter] + acc };
};
// No E♯, B♯, C♭, F♭.
const common = (n) => n.acc === 0 || (n.acc === 1 && n.letter !== 2 && n.letter !== 6) || (n.acc === -1 && n.letter !== 0 && n.letter !== 3);
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3];
const keyAcc = (key, letter) => (key > 0 && SHARPS.indexOf(letter) < key ? 1 : key < 0 && FLATS.indexOf(letter) < -key ? -1 : 0);

const BASE = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
/** Interval between two spelled notes: number from the letters, quality from the semitones. */
function interval(lo, hi) {
  const num = hi.step - lo.step + 1;
  const d = hi.midi - lo.midi - BASE[num];
  const q = [1, 4, 5, 8].includes(num) ? { 0: 'P', 1: 'A', '-1': 'd' }[d] : { 0: 'M', '-1': 'm', 1: 'A', '-2': 'd' }[d];
  return { num, id: q ? q + num : null };
}
const itemOf = (kind, iv) => (kind === 'shape' ? ['same', 'step', 'skip'][iv.num - 1] : kind === 'number' ? String(iv.num) : iv.id);

// Every question of a level, grouped by item.
const cache = {};
function questions(level) {
  if (cache[level]) return cache[level];
  const cfg = LEVELS[level];
  const by = new Map(cfg.items.map((it) => [it, []]));
  const keys = cfg.keys ? [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5] : [0];
  const accs = (key, step) => (cfg.keys ? [keyAcc(key, step % 7)] : cfg.accs ? [-1, 0, 1] : [0]);
  for (const clef of cfg.clefs) for (const keySig of keys) {
    const from = CLEFS[clef].bottom - 2, to = CLEFS[clef].bottom + 10; // one ledger line on each side
    for (let s = from; s <= to; s++) for (let num = 1; num <= 8 && s + num - 1 <= to; num++) {
      for (const a of accs(keySig, s)) for (const b of accs(keySig, s + num - 1)) {
        const lo = note(s, a), hi = note(s + num - 1, b);
        if (!common(lo) || !common(hi) || a * b < 0) continue;
        const item = itemOf(cfg.kind, interval(lo, hi));
        if (by.has(item)) by.get(item).push({ clef, keySig, lo, hi });
      }
    }
  }
  return (cache[level] = by);
}

/** The buttons of a question: all the items, or a window of `show` neighbours around the right one. */
function window_(cfg, item) {
  if (!cfg.show || cfg.show >= cfg.items.length) return cfg.items;
  const i = cfg.items.indexOf(item);
  const start = Math.max(0, Math.min(cfg.items.length - cfg.show, i - rand(cfg.show)));
  return cfg.items.slice(start, start + cfg.show);
}

// Small drawings for the first level: two dots level, a stair, a jump.
const svg = (inner) => `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="7" fill="currentColor" stroke="none"/>`;
const ICONS = {
  same: svg(`<path d="M8 44h48"/>${dot(20, 33)}${dot(44, 33)}`),
  step: svg(`<path d="M6 52h26V36h26"/>${dot(19, 41)}${dot(45, 25)}`),
  skip: svg(`<path d="M6 56h14M44 26h14"/><path d="M17 36C20 12 36 6 42 12" stroke-dasharray="2 8"/>${dot(13, 45)}${dot(51, 15)}`),
};

let q = null, started = 0, streak = 0, last = null, lastKey = null, missed = false, locked = false, seq = 0, timer = 0;
const staffBox = game.h('div', { className: 'ri-staff' });
const choices = game.h('div', { className: 'ri-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary ri-next' });
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));
game.stage.append(staffBox, choices, nextBtn);

function play() {
  if (!game.settings.sound || !q) return;
  if (q.harmonic) q.notes.forEach((n) => playNote(n.midi, { dur: 1.1, gain: 0.2 }));
  else q.notes.forEach((n, i) => playNote(n.midi, { when: i * 0.42, dur: 0.6 }));
}

function draw() {
  const head = (n) => ({ step: n.step, acc: q.keySig ? 0 : n.acc }); // the key signature already carries the accidentals
  const notes = q.harmonic
    ? [{ midi: q.notes.map((n) => n.midi), spell: q.notes.map(head) }]
    : q.notes.map((n) => ({ midi: n.midi, spell: [head(n)] }));
  renderStaff(staffBox, { clef: q.clef, keySig: q.keySig, notes, width: 260 });
}

function render() {
  if (!q) return;
  nextBtn.textContent = game.t('next');
  choices.classList.toggle('ri-three', q.kind === 'shape' || q.choices.length === 5);
  choices.replaceChildren(...q.choices.map((id) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (q.kind === 'shape') {
      b.classList.add('ri-icon');
      b.innerHTML = ICONS[id];
      b.setAttribute('aria-label', game.t(id));
    } else if (q.kind === 'number') {
      b.classList.add('ri-num');
      b.append(game.h('b', { textContent: id }), game.h('span', { textContent: game.tr(NUMBERS[id]) }));
    } else b.textContent = game.tr(NAMES[id]);
    b.dataset.id = id;
    if (q.tried.has(id)) { b.classList.add('ml-wrong'); b.disabled = true; }
    b.onclick = () => answer(id, b);
    return b;
  }));
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const by = questions(level);
  // With very few answers, forbidding a repeat would make the answer predictable.
  const item = pickWeak(cfg.items, stats, { avoid: cfg.items.length > 4 ? last : undefined });
  last = item;
  const keyOf = (c) => `${c.clef}${c.keySig}:${c.lo.midi}:${c.hi.midi}`;
  const pool = by.get(item).filter((c) => keyOf(c) !== lastKey);
  const c = pick(pool.length ? pool : by.get(item));
  lastKey = keyOf(c);
  const pair = [c.lo, c.hi];
  q = {
    level, kind: cfg.kind, item, clef: c.clef, keySig: c.keySig, harmonic: !!cfg.harmonic,
    notes: cfg.harmonic || rand(2) ? pair : pair.reverse(), // side by side: going up or going down
    choices: window_(cfg, item), tried: new Set(),
  };
  missed = false;
  locked = false;
  draw();
  render();
  started = performance.now();
}

async function answer(id, button) {
  if (locked || button.disabled) return;
  const ok = id === q.item;
  const sound = !!game.settings.sound;
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : id, silent: sound };
  clearTimeout(timer);
  play(); // the eye and the ear together
  if (ok) {
    locked = true;
    button.classList.add('ml-right');
    if (missed) game.flash(true, { silent: sound }); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= 8) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('ri-show');
        else if (streak === 8) game.say(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, sound ? 1200 : 600);
  } else {
    q.tried.add(id);
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('ri-show');
    if (missed) game.flash(false, { silent: sound });
    else { missed = true; await game.attempt(rec); }
  }
}

window.__test = {
  state: () => q && ({
    level: q.level, kind: q.kind, item: q.item, clef: q.clef, keySig: q.keySig, harmonic: q.harmonic, choices: q.choices,
    notes: q.notes.map(({ letter, acc, octave, midi }) => ({ letter, acc, octave, midi })),
  }),
};

game.on('settings', () => { streak = 0; nextBtn.classList.remove('ri-show'); next(); });
game.on('lang', render);
next();
