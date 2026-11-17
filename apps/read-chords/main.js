// Read the chord: a chord stacked on the staff. First the root, then the quality, then the inversion, then the full name.
import { createGame } from '@core/shell.js';
import { renderStaff, CLEFS } from '@core/staff.js';
import { CHORDS, LETTERS, ACC_GLYPH, pick, rand, shuffle } from '@core/music.js';
import { playChord } from '@core/audio.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const SKILL = 'read.chords';
const MAX_LEVEL = 6;
const game = createGame({
  id: 'read-chords',
  title: L('Read the chord', 'Lis l’accord'),
  strings: {
    root: L('Root?', 'Fondamentale ?'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, sharp eyes!', 'Bravo, quel coup d’œil !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · The root of a triad', '1 · La fondamentale d’un accord') },
      { value: 2, label: L('2 · Major or minor', '2 · Majeur ou mineur') },
      { value: 3, label: L('3 · Four kinds of triads, with sharps and flats', '3 · Quatre sortes d’accords, avec dièses et bémols') },
      { value: 4, label: L('4 · Inversions, then the root', '4 · Renversements, puis la fondamentale') },
      { value: 5, label: L('5 · Seventh chords', '5 · Accords de septième') },
      { value: 6, label: L('6 · Full name, key signatures, two clefs', '6 · Nom complet, armures, deux clés') },
    ] },
    { key: 'sound', label: L('Play the chord', 'Jouer l’accord'), type: 'toggle', default: true },
  ],
});

const WORDS = {
  maj: L('Major', 'Majeur'), min: L('Minor', 'Mineur'), dim: L('Diminished', 'Diminué'), aug: L('Augmented', 'Augmenté'),
  maj7: L('Major 7th', 'Septième majeure'), dom7: L('Dominant 7th', 'Septième de dominante'),
  min7: L('Minor 7th', 'Septième mineure'), m7b5: L('Half-diminished', 'Demi-diminué'),
};
const SYMBOL = { maj: 'maj', min: 'min', dim: 'dim', aug: 'aug', maj7: 'maj7', dom7: '7', min7: 'min7', m7b5: 'm7♭5' };
const INV = [L('Root position', 'Position fondamentale'), L('First inversion', 'Premier renversement'), L('Second inversion', 'Second renversement')];
const SEVENTHS = ['maj7', 'dom7', 'min7', 'm7b5'];
const TRIADS = ['maj', 'min', 'dim', 'aug'];
const DIATONIC = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']; // the triad built on each white key
const L6TYPES = ['maj', 'min', 'dim', ...SEVENTHS];

// ---- Notes are spelled: letter (0 = C), accidental, octave. step = diatonic index (C4 = 28).
const PC = [0, 2, 4, 5, 7, 9, 11];
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3];
const keyAcc = (key, letter) => (key > 0 && SHARPS.indexOf(letter) < key ? 1 : key < 0 && FLATS.indexOf(letter) < -key ? -1 : 0);
// No E♯, B♯, C♭, F♭, no double accidentals.
const rare = (letter, acc) => Math.abs(acc) > 1 || (acc === 1 && (letter === 2 || letter === 6)) || (acc === -1 && (letter === 0 || letter === 3));
const nameOf = (letter, acc, lang) => LETTERS[lang][letter] + ACC_GLYPH[acc];

/** The tones of a chord stacked in thirds from a spelled root; the `inv` lowest ones moved up an octave. Sorted from the bass. */
function build(type, step, acc, inv) {
  const rootMidi = (Math.floor(step / 7) + 1) * 12 + PC[step % 7] + acc;
  const tones = CHORDS[type].steps.map((semi, i) => {
    const s = step + 2 * i, letter = s % 7, octave = Math.floor(s / 7), midi = rootMidi + semi;
    return { step: s, letter, octave, midi, acc: midi - ((octave + 1) * 12 + PC[letter]) };
  });
  for (let k = 0; k < inv; k++) { tones[k].step += 7; tones[k].octave += 1; tones[k].midi += 12; }
  return tones.sort((a, b) => a.step - b.step);
}

const LEVELS = { 1: ['root'], 2: ['maj', 'min'], 3: TRIADS, 4: ['inv0', 'inv1', 'inv2'], 5: SEVENTHS, 6: ['full'] };

/** What to draw for a level and item: the chord type, root letter, accidental, inversion, clef and key. */
function params(level, item) {
  const acc3 = () => pick([-1, 0, 1]);
  switch (level) {
    case 1: { const letter = rand(7); return { type: DIATONIC[letter], letter, acc: 0, inv: 0, clef: 'treble', keySig: 0 }; }
    case 2: return { type: item, letter: pick(item === 'maj' ? [0, 3, 4] : [1, 2, 5]), acc: 0, inv: 0, clef: 'treble', keySig: 0 };
    case 3: return { type: item, letter: rand(7), acc: acc3(), inv: 0, clef: 'treble', keySig: 0 };
    case 4: return { type: pick(['maj', 'min']), letter: rand(7), acc: acc3(), inv: +item[3], clef: 'treble', keySig: 0 };
    case 5: return { type: item, letter: rand(7), acc: acc3(), inv: 0, clef: 'treble', keySig: 0 };
    default: {
      const keySig = pick([0, 0, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5]), type = pick(L6TYPES), letter = rand(7);
      return { type, letter, acc: keySig ? keyAcc(keySig, letter) : pick([-1, 0, 0, 1]), inv: rand(CHORDS[type].steps.length), clef: pick(['treble', 'bass']), keySig };
    }
  }
}

let lastKey = null;
function makeChord(level, item) {
  for (let n = 0; n < 2000; n++) {
    const p = params(level, item);
    const lo = CLEFS[p.clef].bottom - 2, hi = CLEFS[p.clef].bottom + 10; // one ledger line on each side
    const steps = [];
    for (let s = lo; s <= hi; s++) if (s % 7 === p.letter) steps.push(s);
    const tones = build(p.type, pick(steps), p.acc, p.inv);
    if (tones[0].step < lo || tones[tones.length - 1].step > hi) continue;
    if (!tones.every((t) => (p.keySig ? t.acc === keyAcc(p.keySig, t.letter) : !rare(t.letter, t.acc)))) continue;
    const key = `${p.clef}${p.keySig}${p.type}${p.inv}:${tones[0].midi}`;
    if (key === lastKey && n < 1000) continue;
    lastKey = key;
    return { ...p, tones };
  }
  throw new Error('no chord');
}

// ---- Answer buttons
const rid = (letter, acc) => `${letter}:${acc}`;
function rootChoices(c) {
  const root = rid(c.letter, c.acc);
  const ids = new Map([[root, 1]]);
  for (const t of shuffle(c.tones.slice())) if (!rare(t.letter, t.acc)) ids.set(rid(t.letter, t.acc), 1); // the other tones (the bass first of all) are the tempting answers
  while (ids.size < 4) { const l = rand(7), a = pick([-1, 0, 0, 1]); if (!rare(l, a)) ids.set(rid(l, a), 1); }
  return shuffle([root, ...[...ids.keys()].filter((k) => k !== root).slice(0, 3)]);
}
function fullChoices(c) {
  const fam = SEVENTHS.includes(c.type) ? SEVENTHS : ['maj', 'min', 'dim'];
  const id = (l, a, t) => `${l}:${a}:${t}`;
  const ok = id(c.letter, c.acc, c.type);
  const sameRoot = fam.filter((t) => t !== c.type).map((t) => id(c.letter, c.acc, t));
  const otherRoot = c.tones.filter((t) => t.letter !== c.letter && !rare(t.letter, t.acc)).map((t) => id(t.letter, t.acc, c.type));
  const out = new Set([ok, pick(sameRoot)]);
  if (otherRoot.length) out.add(pick(otherRoot));
  const rest = shuffle([...sameRoot, ...otherRoot]);
  for (const k of rest) if (out.size < 4) out.add(k);
  while (out.size < 4) { const l = rand(7), a = pick([-1, 0, 0, 1]); if (!rare(l, a)) out.add(id(l, a, c.type)); }
  return shuffle([...out]);
}

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, timer = 0;
const hint = game.h('div', { className: 'ml-hint rc-hint' });
const staffBox = game.h('div', { className: 'rc-staff' });
const choices = game.h('div', { className: 'rc-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary rc-next' });
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));
game.stage.append(staffBox, hint, choices, nextBtn);

function play() {
  if (game.settings.sound && q) playChord(q.chord.tones.map((t) => t.midi), { dur: 1.5, gain: 0.3 });
}

function draw() {
  const { tones, keySig, clef } = q.chord;
  // Under a key signature, every accidental of the chord is already in the signature.
  renderStaff(staffBox, { clef, keySig, notes: [{ midi: tones.map((t) => t.midi), acc: keySig ? false : undefined, spell: tones.map((t) => ({ step: t.step, acc: t.acc })) }], width: 260 });
}

function label(id) {
  const [a, b, c] = id.split(':');
  if (q.ask === 'root') return nameOf(+a, +b, game.lang);
  if (q.ask === 'full') return `${nameOf(+a, +b, game.lang)} ${SYMBOL[c]}`;
  return null;
}

function render() {
  if (!q) return;
  nextBtn.textContent = game.t('next');
  hint.textContent = q.ask === 'root' ? game.t('root') : '';
  choices.className = 'rc-choices rc-' + (q.ask === 'root' && q.level === 1 ? 'seven' : q.ask === 'inv' ? 'column' : 'two');
  choices.replaceChildren(...q.choices.map((id) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (q.ask === 'inv') b.textContent = game.tr(INV[+id[3]]);
    else if (q.ask === 'type') {
      if (q.level === 5) { b.classList.add('rc-sym'); b.append(game.h('b', { textContent: SYMBOL[id] }), game.h('span', { textContent: game.tr(WORDS[id]) })); }
      else b.textContent = game.tr(WORDS[id]);
    } else b.textContent = label(id);
    b.dataset.id = id;
    if (q.tried.has(id)) { b.classList.add('ml-wrong'); b.disabled = true; }
    b.onclick = () => answer(id, b);
    return b;
  }));
}

/** Set the question asked about the current chord. */
function ask(kind) {
  const c = q.chord;
  q.ask = kind;
  q.tried = new Set();
  if (kind === 'root') { q.item = 'root'; q.answer = rid(c.letter, c.acc); q.choices = q.level === 1 ? [0, 1, 2, 3, 4, 5, 6].map((i) => rid(i, 0)) : rootChoices(c); }
  else if (kind === 'inv') { q.item = 'inv' + c.inv; q.answer = q.item; q.choices = ['inv0', 'inv1', 'inv2']; }
  else if (kind === 'type') { q.item = c.type; q.answer = c.type; q.choices = LEVELS[q.level]; }
  else { q.item = 'full'; q.answer = `${c.letter}:${c.acc}:${c.type}`; q.choices = fullChoices(c); }
  missed = false;
  locked = false;
  render();
  started = performance.now();
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const items = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const item = pickWeak(items, stats, { avoid: items.length > 2 ? last : undefined });
  last = item;
  const chord = makeChord(level, item);
  q = { level, chord };
  draw();
  ask(level === 1 ? 'root' : level === 4 ? 'inv' : level === 6 ? 'full' : 'type');
}

async function answer(id, button) {
  if (locked || button.disabled) return;
  const ok = id === q.answer;
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
        if (q.level < MAX_LEVEL) nextBtn.classList.add('rc-show');
        else if (streak === 8) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    const again = q.level === 4 && q.ask === 'inv'; // then the root of the same chord
    timer = setTimeout(again ? () => ask('root') : next, sound ? 1200 : 600);
  } else {
    q.tried.add(id);
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('rc-show');
    if (missed) { choices.querySelector(`[data-id="${q.answer}"]`)?.classList.add('ml-reveal'); game.flash(false, { silent: sound }); } // 2nd miss: show the answer
    else { missed = true; await game.attempt(rec); }
  }
}

window.__test = {
  state: () => q && ({
    level: q.level, ask: q.ask, item: q.item, answer: q.answer, choices: q.choices, clef: q.chord.clef, keySig: q.chord.keySig,
    notes: q.chord.tones.map(({ letter, acc, octave, midi }) => ({ letter, acc, octave, midi })),
  }),
};

game.on('settings', () => { streak = 0; nextBtn.classList.remove('rc-show'); next(); });
game.on('lang', render);
next();
