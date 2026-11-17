// Chord paths: hear a short chord progression, rebuild it with the pads. Colours first, numerals and names later.
import { createGame } from '@core/shell.js';
import { playChord, audioTime } from '@core/audio.js';
import { CHORDS, chordNotes, noteName, mod, rand, pick } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6, SKILL = 'listen.progressions', CLEAN = 6;
const game = createGame({
  id: 'ear-progressions',
  title: L('Find the chords', 'Retrouve les accords'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    undo: L('Undo', 'Annuler'),
    chord: L('Chord {n}', 'Accord {n}'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Two chords, by colour', '1 · Deux accords, par couleur') },
      { value: 2, label: L('2 · Three chords, by colour', '2 · Trois accords, par couleur') },
      { value: 3, label: L('3 · I, IV, V with their names', '3 · I, IV, V avec leurs noms') },
      { value: 4, label: L('4 · Plus vi and ii', '4 · Avec vi et ii') },
      { value: 5, label: L('5 · Plus iii, V7 and minor keys', '5 · Avec iii, V7 et le mode mineur') },
      { value: 6, label: L('6 · Jazz: ii–V–I and its detours', '6 · Jazz : ii–V–I et ses détours') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 110, step: 5, default: 70 },
  ],
});

// Roman numeral → [semitones above the tonic, chord type, pad colour (0 = blue … 1 = orange, then red and pink)].
const ROMAN = {
  I: [0, 'maj', 0], ii: [2, 'min', 0.22], iii: [4, 'min', 0.36], IV: [5, 'maj', 0.52], V: [7, 'maj', 0.84], V7: [7, 'dom7', 0.98], vi: [9, 'min', 1.2],
  i: [0, 'min', 0], iv: [5, 'min', 0.52], VI: [8, 'maj', 1.2],
  Imaj7: [0, 'maj7', 0], ii7: [2, 'min7', 0.22], vi7: [9, 'min7', 1.2],
  'V7/V': [2, 'dom7', 1.5], 'V7/ii': [9, 'dom7', 1.5], bII7: [1, 'dom7', 1.5],
};
const P = (s) => s.split(' ');
const JAZZ = ['Imaj7', 'bII7', 'ii7', 'V7/V', 'V7', 'vi7', 'V7/ii']; // pad order
const SPECIAL = ['V7/V', 'V7/ii', 'bII7'];
const LEVELS = {
  1: { pads: P('I V'), progs: P('I-V-I I-I-V I-V-V') },
  2: { pads: P('I IV V'), progs: P('I-IV-V I-IV-I I-V-IV IV-V-I I-IV-V-I I-V-IV-I I-IV-I-V I-I-IV-V IV-I-V-I') },
  3: { pads: P('I IV V'), names: true, progs: P('I-IV-V-I I-V-IV-I I-IV-I-V I-I-IV-V IV-I-V-I I-V-I-IV I-IV-V-IV IV-V-IV-I V-IV-I-I IV-IV-V-I') },
  4: { pads: P('I ii IV V vi'), names: true, progs: P('I-vi-IV-V I-V-vi-IV vi-IV-I-V I-vi-ii-V ii-V-I-vi I-IV-ii-V I-ii-V-I vi-ii-V-I I-IV-vi-V IV-V-vi-I') },
  5: { pads: P('I ii iii IV V V7 vi'), minPads: P('i iv V VI'), names: true,
    progs: P('I-iii-IV-V7 I-iii-vi-IV I-vi-ii-V7 iii-vi-ii-V7 I-IV-V7-I I-V7-vi-IV IV-V-iii-vi I-iii-ii-V'),
    minProgs: P('i-iv-V-i i-VI-iv-V i-iv-i-V i-VI-V-i VI-iv-V-i i-V-VI-iv') },
  6: { jazz: true, names: true, progs: P('Imaj7-vi7-ii7-V7 ii7-V7-Imaj7-vi7 vi7-ii7-V7-Imaj7 Imaj7-vi7-V7/V-V7 Imaj7-V7/V-ii7-V7 vi7-V7/V-V7-Imaj7 Imaj7-V7/ii-ii7-V7 V7/ii-ii7-V7-Imaj7 ii7-bII7-Imaj7-vi7 Imaj7-vi7-ii7-bII7 vi7-ii7-bII7-Imaj7') },
};

const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const UNDO = '<svg viewBox="0 0 64 64" width="28" height="28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 14 8 28l14 14"/><path d="M8 28h30a16 16 0 0 1 0 32H24"/></svg>';

/** Bass note plus the chord tones, all kept in the same narrow register so the voices move smoothly. */
function voice(key, roman) {
  const [root, type] = ROMAN[roman];
  const tones = chordNotes(key + root, type).map((m) => 57 + mod(m - 57, 12));
  return [43 + mod(key + root - 43, 12), ...tones];
}
const romanText = (r) => r.replace('b', '♭');
// Keys with flats: D♭, E♭, F, A♭, B♭ (a minor key follows its relative major).
const FLAT_KEYS = new Set([1, 3, 5, 8, 10]);
function chordName(roman) {
  const [root, type] = ROMAN[roman];
  const flat = roman[0] === 'b' || FLAT_KEYS.has(mod(q.key + (q.minor ? 3 : 0), 12));
  const name = noteName(q.key + root, { lang: game.lang, pref: flat ? 'flat' : 'sharp' });
  const symbol = CHORDS[type].symbol;
  return name + (game.lang === 'fr' && symbol ? ' ' : '') + symbol;
}

// Timers wake up just before each event and schedule it on the audio clock, so a sequence can be cancelled.
let timers = [];
function stop() { timers.forEach(clearTimeout); timers = []; now(-1); }
function run(events) {
  stop();
  const t0 = audioTime() + 0.06;
  for (const e of events) timers.push(setTimeout(() => e.fn(Math.max(0, t0 + e.t - audioTime())), Math.max(0, e.t * 1000 - 40)));
}

// built: what the player has put in each slot (null = empty). marks: result of the last check, until the next tap.
let q = null, built = [], marks = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, timer = 0;
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const slots = game.h('div', { className: 'pg-slots' });
const undo = game.h('button', { className: 'pg-undo', innerHTML: UNDO });
const pads = game.h('div', { className: 'pg-pads' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary pg-next' });
replay.onclick = () => play();
undo.onclick = () => back();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function now(i) { [...slots.children].forEach((s, k) => s.classList.toggle('pg-now', k === i)); }

/** Play the progression; the slot of the chord that sounds is outlined. */
function play() {
  if (!q) return;
  const beat = 60 / (+game.settings.tempo || 70);
  const n = q.chords.length;
  run([
    ...q.chords.flatMap((notes, i) => [
      { t: i * beat, fn: () => now(i) },
      { t: i * beat, fn: (when) => playChord(notes, { when, dur: (i === n - 1 ? 2 : 0.95) * beat, gain: 0.36 }) },
    ]),
    { t: (n + 0.6) * beat, fn: () => now(-1) },
  ]);
}

function renderSlots() {
  slots.replaceChildren(...built.map((r, i) => {
    const s = game.h('div', { className: 'pg-slot' });
    s.setAttribute('aria-label', game.t('chord', { n: i + 1 }));
    if (r) {
      s.classList.add('pg-full');
      s.style.setProperty('--h', ROMAN[r][2]);
      s.dataset.roman = r;
      if (q.names) s.textContent = romanText(r);
      if (marks) s.classList.add(marks[i] ? 'pg-ok' : 'pg-bad');
    }
    return s;
  }));
  undo.disabled = !built.some(Boolean);
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  undo.setAttribute('aria-label', game.t('undo'));
  nextBtn.textContent = game.t('next');
  const n = q.pads.length;
  pads.style.setProperty('--cols', n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4);
  pads.classList.toggle('pg-big', n <= 3);
  pads.replaceChildren(...q.pads.map((r, i) => {
    const b = game.h('button', { className: 'ml-pad' });
    b.style.setProperty('--h', ROMAN[r][2]);
    b.dataset.roman = r;
    if (q.names) b.append(game.h('span', { className: 'pg-roman', textContent: romanText(r) }), game.h('span', { className: 'pg-name', textContent: chordName(r) }));
    else b.setAttribute('aria-label', game.t('chord', { n: i + 1 }));
    b.onclick = () => tap(r);
    return b;
  }));
  renderSlots();
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  stop();
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const item = pickWeak([...cfg.progs, ...(cfg.minProgs || [])], stats, { avoid: last });
  last = item;
  const romans = item.split('-');
  const minor = !!cfg.minProgs?.includes(item);
  let padList = minor ? cfg.minPads : cfg.pads;
  if (cfg.jazz) { // the four chords of the key plus one visitor: the one of this progression, or any
    const visitor = romans.find((r) => SPECIAL.includes(r)) || pick(SPECIAL);
    padList = JAZZ.filter((r) => r === visitor || !SPECIAL.includes(r));
  }
  const key = 48 + rand(12);
  q = { level, item, romans, minor, key, names: !!cfg.names, pads: padList, chords: romans.map((r) => voice(key, r)) };
  built = romans.map(() => null);
  marks = null;
  missed = false;
  locked = false;
  render();
  play();
  started = performance.now();
}

/** A pad was tapped: hear its chord and put it in the first free slot. */
function tap(roman) {
  if (!q || locked) return;
  stop();
  clearTimeout(timer); // a pending replay must not start under the player's hands
  playChord(voice(q.key, roman), { dur: 0.9, gain: 0.36 });
  if (marks) { built = built.map((r, i) => (marks[i] ? r : null)); marks = null; } // keep what was right
  const i = built.indexOf(null);
  if (i < 0) return;
  built[i] = roman;
  renderSlots();
  if (!built.includes(null)) { locked = true; clearTimeout(timer); const cur = q; timer = setTimeout(() => cur === q && check(), 550); }
}

function back() {
  if (!q || locked) return;
  if (marks) { built = built.map((r, i) => (marks[i] ? r : null)); marks = null; }
  else { const i = built.findLastIndex(Boolean); if (i >= 0) built[i] = null; }
  renderSlots();
}

async function check() {
  marks = built.map((r, i) => r === q.romans[i]);
  const ok = marks.every(Boolean);
  renderSlots();
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : built.join('-') };
  const cur = q;
  if (ok) {
    if (missed) game.flash(true); // one attempt per progression
    else {
      streak++;
      if (streak >= CLEAN) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('pg-show');
        else if (streak === CLEAN) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 1000);
  } else {
    streak = 0;
    nextBtn.classList.remove('pg-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    if (cur !== q) return;
    locked = false;
    timer = setTimeout(() => cur === q && play(), 700); // hear it again, then retry
  }
}

window.__test = { state: () => ({ level: q?.level, item: q?.item, romans: q?.romans, minor: q?.minor, key: q?.key, pads: q?.pads, chords: q?.chords, built: [...built], marks, locked }) };

game.ready().then(() => {
  game.stage.replaceChildren(replay, game.h('div', { className: 'pg-row' }, slots, undo), pads, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('pg-show'); next(); });
  game.on('lang', render);
  next();
});
