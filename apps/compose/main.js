// Make a tune: a calm sandbox, 16 steps by 6 rows, no wrong note, nothing is judged or logged.
import { createGame } from '@core/shell.js';
import { playNote, playChord, wait } from '@core/audio.js';
import { scaleNotes } from '@core/music.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'compose',
  title: L('Make a tune', 'Invente un air'),
  strings: {
    play: L('Play', 'Jouer'), stop: L('Stop', 'Arrêter'), clear: L('Clear', 'Effacer'),
    export: L('Save file', 'Enregistrer'), import: L('Open file', 'Ouvrir'),
    slot: L('Tune {n}', 'Air {n}'), badFile: L('This file is not a tune.', 'Ce fichier n’est pas un air.'),
    imported: L('Tune opened', 'Air ouvert'),
  },
  settings: [
    { key: 'scale', label: L('Scale', 'Gamme'), type: 'select', default: 'pentaMajor', options: [
      { value: 'pentaMajor', label: L('Major pentatonic', 'Pentatonique majeure') },
      { value: 'pentaMinor', label: L('Minor pentatonic', 'Pentatonique mineure') },
      { value: 'major', label: L('Major', 'Majeure') },
      { value: 'minor', label: L('Minor', 'Mineure') },
      { value: 'blues', label: L('Blues', 'Blues') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 200, step: 5, default: 100 },
    { key: 'chords', label: L('Chords', 'Accords'), type: 'toggle', default: false },
  ],
});

const STEPS = 16, ROWS = 6, ROOT = 60;
const SCALES = ['pentaMajor', 'pentaMinor', 'major', 'minor', 'blues'];
// Chord blocks: offset from the root (semitones) and triad steps.
const CHORDS = { I: [0, 4, 7], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16] };
const CHORD_IDS = Object.keys(CHORDS);
const KEY = 'ml:compose:slot';
const blank = () => ({ cells: Array.from({ length: STEPS }, () => []), chords: ['I', 'vi', 'IV', 'V'] });

let slot = 1, tune = blank();
let quiet = false;
let playing = false, step = -1, run = 0, played = [];
const store = (n) => KEY + n;
const rowsFor = (scale) => scaleNotes(ROOT, SCALES.includes(scale) ? scale : 'pentaMajor', ROOT, ROOT + 24).slice(0, ROWS);
let rows = rowsFor(game.settings.scale);

function load(n) {
  try {
    const d = JSON.parse(localStorage.getItem(store(n)));
    const t = sanitize(d);
    if (t) { if (d.scale && SCALES.includes(d.scale)) { quiet = true; game.set('scale', d.scale); quiet = false; } return t; }
  } catch { /* empty slot or storage unavailable */ }
  return blank();
}
function sanitize(d) {
  if (!d || !Array.isArray(d.cells) || d.cells.length !== STEPS) return null;
  const cells = d.cells.map((c) => [...new Set((Array.isArray(c) ? c : []).filter((r) => Number.isInteger(r) && r >= 0 && r < ROWS))]);
  const chords = Array.isArray(d.chords) && d.chords.length === 4 && d.chords.every((c) => CHORDS[c]) ? d.chords : blank().chords;
  return { cells, chords };
}
function payload() { return { cells: tune.cells, chords: tune.chords, scale: game.settings.scale, tempo: +game.settings.tempo, chordsOn: !!game.settings.chords }; }
function save() { try { localStorage.setItem(store(slot), JSON.stringify(payload())); localStorage.setItem('ml:compose:current', String(slot)); } catch { /* storage unavailable */ } }

// ---- screen ----
const h = game.h;
const gridEl = h('div', { className: 'cp-grid' });
const chordEl = h('div', { className: 'cp-chords' });
const slotEl = h('div', { className: 'cp-slots' });
const playBtn = h('button', { className: 'ml-btn ml-primary cp-play' });
const clearBtn = h('button', { className: 'ml-btn' });
const expBtn = h('button', { className: 'ml-btn' });
const impBtn = h('button', { className: 'ml-btn' });
const file = h('input', { type: 'file', accept: '.json,application/json', className: 'cp-file', tabIndex: -1 });
const tools = h('div', { className: 'cp-tools' }, clearBtn, expBtn, impBtn, file);

function buildGrid() {
  const cells = [];
  for (const half of [0, 1]) {
    const box = h('div', { className: 'cp-half' });
    for (let r = ROWS - 1; r >= 0; r--) {
      const line = h('div', { className: 'cp-line' });
      for (let c = 0; c < 8; c++) {
        const s = half * 8 + c;
        const b = h('button', { className: 'cp-cell' + (s % 4 === 0 ? ' cp-bar' : ''), type: 'button' });
        b.dataset.step = s; b.dataset.row = r;
        b.style.setProperty('--r', r / (ROWS - 1));
        line.append(b);
      }
      box.append(line);
    }
    cells.push(box);
  }
  gridEl.replaceChildren(...cells);
}
function paint() {
  for (const b of gridEl.querySelectorAll('.cp-cell')) {
    const s = +b.dataset.step, r = +b.dataset.row;
    const on = tune.cells[s].includes(r);
    b.classList.toggle('cp-on', on);
    b.classList.toggle('cp-now', s === step);
    b.setAttribute('aria-pressed', on);
  }
  chordEl.hidden = !game.settings.chords;
  chordEl.replaceChildren(...tune.chords.map((c, i) => {
    const b = h('button', { className: 'cp-chord' + (playing && Math.floor(step / 4) === i ? ' cp-now' : ''), textContent: c, type: 'button' });
    b.dataset.bar = i;
    b.onclick = () => { tune.chords[i] = CHORD_IDS[(CHORD_IDS.indexOf(c) + 1) % CHORD_IDS.length]; save(); paint(); if (!playing) playChord(CHORDS[tune.chords[i]].map((o) => ROOT - 12 + o), { dur: 0.9, timbre: 'pad', gain: 0.18 }); };
    return b;
  }));
  slotEl.replaceChildren(...[1, 2, 3].map((n) => {
    const b = h('button', { className: 'ml-btn cp-slot' + (n === slot ? ' ml-primary' : ''), textContent: game.t('slot', { n }), type: 'button' });
    b.dataset.slot = n;
    b.onclick = () => { stop(); save(); slot = n; tune = load(n); rows = rowsFor(game.settings.scale); paint(); save(); };
    return b;
  }));
  playBtn.textContent = (playing ? '■ ' : '▶ ') + game.t(playing ? 'stop' : 'play');
  clearBtn.textContent = game.t('clear'); expBtn.textContent = game.t('export'); impBtn.textContent = game.t('import');
  window.__test = {
    state: () => ({ cells: tune.cells.map((c) => [...c]), chords: [...tune.chords], rows: [...rows], scale: game.settings.scale, tempo: +game.settings.tempo,
      chordsOn: !!game.settings.chords, playing, step, slot, played: played.map((p) => ({ ...p })) }),
  };
}

gridEl.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.cp-cell');
  if (!b) return;
  e.preventDefault();
  const s = +b.dataset.step, r = +b.dataset.row;
  const i = tune.cells[s].indexOf(r);
  if (i >= 0) tune.cells[s].splice(i, 1);
  else { tune.cells[s].push(r); playNote(rows[r], { dur: 0.35 }); }
  save(); paint();
});

// ---- playback: one step = one beat, a bar = 4 steps ----
async function start() {
  if (playing) return;
  playing = true;
  const my = ++run;
  played = [];
  let next = performance.now();
  for (let s = 0; playing && my === run; s = (s + 1) % STEPS) {
    step = s;
    const beat = 60000 / (+game.settings.tempo || 100);
    const midis = tune.cells[s].slice().sort((a, b) => a - b).map((r) => rows[r]);
    let chord = null;
    if (game.settings.chords && s % 4 === 0) chord = CHORDS[tune.chords[s / 4]].map((o) => ROOT - 12 + o);
    midis.forEach((m) => playNote(m, { dur: (beat * 0.9) / 1000 }));
    if (chord) playChord(chord, { dur: (beat * 3.6) / 1000, timbre: 'pad', gain: 0.18 });
    played.push({ step: s, notes: midis, chord });
    if (played.length > 64) played.shift();
    paint();
    next += beat;
    await wait(Math.max(0, next - performance.now()));
  }
}
function stop() { if (!playing) return; playing = false; run++; step = -1; paint(); }

playBtn.onclick = () => (playing ? stop() : start());
clearBtn.onclick = () => { tune.cells = blank().cells; save(); paint(); };
expBtn.onclick = () => {
  const data = { app: 'music-learnin', kind: 'tune', format: 1, exported: Date.now(), tune: payload() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `music-learnin-tune-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
impBtn.onclick = () => file.click();
file.onchange = async () => {
  try {
    const d = JSON.parse(await file.files[0].text());
    const t = d?.app === 'music-learnin' && d.kind === 'tune' ? sanitize(d.tune) : null;
    if (!t) throw new Error('bad-file');
    stop();
    tune = t;
    quiet = true;
    if (SCALES.includes(d.tune.scale)) game.set('scale', d.tune.scale);
    if (Number.isFinite(d.tune.tempo)) game.set('tempo', Math.max(50, Math.min(200, d.tune.tempo)));
    if (typeof d.tune.chordsOn === 'boolean') game.set('chords', d.tune.chordsOn);
    quiet = false;
    rows = rowsFor(game.settings.scale);
    save(); paint();
    game.say(game.t('imported'));
  } catch { game.say(game.t('badFile')); }
  file.value = '';
};

game.on('settings', () => { rows = rowsFor(game.settings.scale); if (!quiet) save(); paint(); });
game.on('lang', paint);

game.ready().then(() => {
  try { slot = Math.min(3, Math.max(1, +localStorage.getItem('ml:compose:current') || 1)); } catch { slot = 1; }
  tune = load(slot);
  rows = rowsFor(game.settings.scale);
  buildGrid();
  game.stage.replaceChildren(slotEl, gridEl, chordEl, playBtn, tools);
  paint();
});
