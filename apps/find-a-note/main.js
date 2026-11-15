// Find the note: a note appears on the staff, pick its name.
import { createGame } from '@core/shell.js';
import { renderStaff, CLEFS } from '@core/staff.js';
import { LETTERS, noteName, spell, naturalMidi, shuffle, pick } from '@core/music.js';
import { playNote } from '@core/audio.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'find-a-note',
  title: L('Find the note', 'Trouve la note'),
  strings: {
    levelUp: L('Well done. Try the next level in the settings.', 'Bravo. Essaie le niveau suivant dans les réglages.'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Treble clef, on the staff', '1 · Clé de sol, dans la portée') },
      { value: 2, label: L('2 · Treble clef, ledger lines', '2 · Clé de sol, lignes supplémentaires') },
      { value: 3, label: L('3 · Bass clef, on the staff', '3 · Clé de fa, dans la portée') },
      { value: 4, label: L('4 · Bass clef, ledger lines', '4 · Clé de fa, lignes supplémentaires') },
      { value: 5, label: L('5 · Sharps and flats', '5 · Dièses et bémols') },
      { value: 6, label: L('6 · Both clefs', '6 · Les deux clés') },
      { value: 7, label: L('7 · Alto and tenor clefs', '7 · Clés d’ut') },
    ] },
    { key: 'sound', label: L('Play the note', 'Jouer la note'), type: 'toggle', default: true },
  ],
});

// Natural notes from `below` steps under the bottom line to `above` steps over the top line.
function range(clef, below, above) {
  const { bottom } = CLEFS[clef];
  const out = [];
  for (let st = bottom - below; st <= bottom + 8 + above; st++) out.push(naturalMidi(st % 7, Math.floor(st / 7)));
  return out;
}
const inStaff = (clef, midi) => { const st = spell(midi).step, b = CLEFS[clef].bottom; return st >= b - 1 && st <= b + 9; };

// Every question: { clef, midi, pref, skill }
function pool(level) {
  const q = (clef, skillIn, skillOut, below, above) => range(clef, below, above)
    .map((midi) => ({ clef, midi, pref: 'sharp', skill: inStaff(clef, midi) ? skillIn : skillOut }));
  if (level === 1) return q('treble', 'read.treble.staff', 'read.treble.staff', 1, 1);
  if (level === 2) return q('treble', 'read.treble.staff', 'read.treble.ledger', 5, 5);
  if (level === 3) return q('bass', 'read.bass.staff', 'read.bass.staff', 1, 1);
  if (level === 4) return q('bass', 'read.bass.staff', 'read.bass.ledger', 5, 5);
  if (level === 5) return ['treble', 'bass'].flatMap((clef) => range(clef, 2, 2).flatMap((m) => [
    { clef, midi: m + 1, pref: 'sharp', skill: 'read.accidentals' },
    { clef, midi: m - 1, pref: 'flat', skill: 'read.accidentals' },
  ])).filter((x) => spell(x.midi, x.pref).acc !== 0);
  if (level === 6) return [...q('treble', 'read.grand', 'read.grand', 4, 4), ...q('bass', 'read.grand', 'read.grand', 4, 4)];
  return [...q('alto', 'read.cclefs', 'read.cclefs', 2, 2), ...q('tenor', 'read.cclefs', 'read.cclefs', 2, 2)];
}
const itemOf = (q) => `${q.clef}:${noteName(q.midi, { pref: q.pref, octave: true })}`;

let current = null, started = 0, streak = 0, last = null, locked = false;
const staffBox = game.h('div', { style: 'width:100%' });
const choices = game.h('div', { className: 'ml-choices' });
game.stage.append(staffBox, choices);

async function next() {
  const level = +game.settings.level;
  const questions = pool(level);
  const skills = [...new Set(questions.map((x) => x.skill))];
  const stats = new Map();
  for (const sk of skills) for (const [k, v] of await loadItemMastery(sk)) stats.set(k, v);
  current = pickWeak(questions, stats, { keyOf: itemOf, avoid: last });
  last = itemOf(current);
  locked = false;
  renderStaff(staffBox, { clef: current.clef, notes: [{ midi: current.midi, pref: current.pref }], width: 260 });
  renderChoices();
  started = performance.now();
}

function renderChoices() {
  const lang = game.lang;
  let options;
  if (+game.settings.level === 5) {
    // Four names: the right one and three close neighbours.
    const sp = spell(current.midi, current.pref);
    const label = (letter, acc) => LETTERS[lang][letter] + (acc > 0 ? '♯' : acc < 0 ? '♭' : '');
    const wrong = shuffle([[sp.letter, 0], [sp.letter, -sp.acc], [(sp.letter + 1) % 7, sp.acc], [(sp.letter + 6) % 7, sp.acc], [(sp.letter + 1) % 7, 0]]).slice(0, 3);
    options = shuffle([[sp.letter, sp.acc], ...wrong]).map(([l, a]) => ({ text: label(l, a), ok: l === sp.letter && a === sp.acc }));
  } else {
    const letter = spell(current.midi).letter;
    options = LETTERS[lang].map((text, i) => ({ text, ok: i === letter }));
  }
  choices.replaceChildren(...options.map((o) => {
    const b = game.h('button', { className: 'ml-btn', textContent: o.text });
    b.onclick = () => answer(o, b);
    return b;
  }));
}

async function answer(option, button) {
  if (locked) return;
  const ms = Math.round(performance.now() - started);
  if (game.settings.sound) playNote(current.midi, { dur: 0.5 });
  button.classList.add(option.ok ? 'ml-right' : 'ml-wrong');
  await game.attempt({ skill: current.skill, correct: option.ok, ms, level: +game.settings.level, item: itemOf(current), silent: game.settings.sound });
  if (!option.ok) { streak = 0; button.disabled = true; return; } // try again on the same note
  locked = true;
  streak++;
  if (streak === 20) game.say(game.t('levelUp'));
  setTimeout(next, 450);
}

game.on('settings', () => { streak = 0; next(); });
game.on('lang', renderChoices);
next();
