// Write the rhythm: hear a bar over a click, rebuild it with beat-sized cells.
import { createGame } from '@core/shell.js';
import { audio, click, playNote } from '@core/audio.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import { CELLS, PALETTE, poolFor, meterOf, barLenOf, pulseOf, fits } from './patterns.js';
import { drawBars, drawCell } from './notation.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const SKILL = 'rhythm.dictation', MAX_LEVEL = 6, CLEAN = 6;
const game = createGame({
  id: 'rhythm-dictation',
  title: L('Write the rhythm', 'Écris le rythme'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    undo: L('Undo', 'Annuler'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
    cell: L('Rhythm cell', 'Cellule rythmique'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Quarter, eighths, half', '1 · Noire, croches, blanche') },
      { value: 2, label: L('2 · Quarter rest', '2 · Le soupir') },
      { value: 3, label: L('3 · Sixteenth notes', '3 · Doubles croches') },
      { value: 4, label: L('4 · Dotted notes, syncopation', '4 · Notes pointées, syncope') },
      { value: 5, label: L('5 · Triplets', '5 · Triolets') },
      { value: 6, label: L('6 · Two bars in 6/8', '6 · Deux mesures à 6/8') },
    ] },
    { key: 'tempo', label: L('Tempo (bpm)', 'Tempo (bpm)'), type: 'range', min: 50, max: 120, step: 5, default: 76 },
  ],
});

const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const UNDO = '<svg viewBox="0 0 64 64" width="28" height="28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 14 8 28l14 14"/><path d="M8 28h30a16 16 0 0 1 0 32H24"/></svg>';
const scoreBox = game.h('div', { className: 'rd-score' });
const palBox = game.h('div', { className: 'rd-pal' });
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const undo = game.h('button', { className: 'rd-undo', innerHTML: UNDO });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary rd-next' });
replay.onclick = () => playModel();
undo.onclick = () => back();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

let q = null, entered = [], marks = null, started = 0, streak = 0, missed = false, locked = true, seq = 0, timer = 0, quietUntil = 0, palLevel = 0, lastItem = null;

const posOf = () => entered.reduce((s, id) => s + CELLS[id].len, 0);
const secPerQuarter = () => 60 / (+game.settings.tempo || 76) / pulseOf(q.level);

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  undo.setAttribute('aria-label', game.t('undo'));
  nextBtn.textContent = game.t('next');
  drawBars(scoreBox, { cells: entered, CELLS, total: q.total, barLen: q.barLen, pulse: q.pulse, meter: q.meter, marks });
  if (palLevel !== q.level) {
    palLevel = q.level;
    palBox.replaceChildren(...PALETTE[q.level].map((id) => {
      const b = game.h('button', { className: 'rd-pbtn' });
      b.dataset.cell = id;
      b.setAttribute('aria-label', game.t('cell'));
      b.onclick = () => press(id);
      drawCell(b, id, CELLS);
      return b;
    }));
  }
  const pos = posOf();
  for (const b of palBox.children) b.disabled = locked || !fits(b.dataset.cell, pos, q.barLen) || pos >= q.total - 1e-6;
  undo.disabled = locked || !entered.length;
}

/** Schedule a list of cells starting at `at` seconds from now. */
function sound(ids, at, perQ) {
  let t = at;
  for (const id of ids) for (const e of CELLS[id].ev) {
    if (!e.rest) playNote(74, { when: t, dur: Math.max(0.05, e.d * perQ * 0.82 - 0.04), gain: 0.3, timbre: 'bass' });
    t += e.d * perQ;
  }
}
function playModel() {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return;
  audio();
  const perQ = secPerQuarter(), P = perQ * q.pulse, perBar = Math.round(q.barLen / q.pulse);
  const start = 0.1 + perBar * P; // one bar of count-in
  for (let i = 0; i < perBar; i++) click({ when: 0.1 + i * P, gain: 0.3, accent: i === 0 });
  for (let i = 0; i < q.total / q.pulse; i++) click({ when: start + i * P, gain: 0.1, accent: i % perBar === 0 });
  sound(q.cells, start, perQ);
  quietUntil = now + (start + q.total * perQ + 0.3) * 1000;
}
function hear(id) {
  audio();
  const perQ = secPerQuarter();
  sound([id], 0.02, perQ);
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  locked = true;
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  let stats = null;
  try { stats = await loadItemMastery(SKILL); } catch { /* plain random */ }
  if (id !== seq) return;
  const p = pickWeak(poolFor(level), stats, { keyOf: (x) => x.id, avoid: lastItem });
  lastItem = p.id;
  const cells = p.bars.flat();
  q = { level, item: p.id, cells, meter: meterOf(level), barLen: barLenOf(level), pulse: pulseOf(level), total: p.bars.length * barLenOf(level) };
  entered = []; marks = null; missed = false; locked = false;
  render();
  quietUntil = 0;
  playModel();
  started = performance.now();
}

function trim() { if (marks) { entered = entered.slice(0, marks.indexOf(false)); marks = null; } }
function press(id) {
  if (!q || locked) return;
  clearTimeout(timer);
  trim();
  if (!fits(id, posOf(), q.barLen) || posOf() >= q.total - 1e-6) { render(); return; }
  hear(id);
  entered.push(id);
  if (posOf() >= q.total - 1e-6) {
    locked = true;
    const cur = q;
    timer = setTimeout(() => cur === q && check(), 500);
  }
  render();
}
function back() {
  if (!q || locked) return;
  clearTimeout(timer);
  if (marks) trim(); else entered.pop();
  render();
}

async function check() {
  // A cell is right when it is the same as the model's at the same place (cells are in order and have the same lengths, so index = place until the first difference).
  const place = (list) => { let p = 0; return list.map((id) => { const s = p; p += CELLS[id].len; return `${id}@${s}`; }); };
  const want = new Set(place(q.cells));
  marks = place(entered).map((s) => want.has(s));
  const ok = marks.every(Boolean) && entered.length === q.cells.length;
  render();
  const cur = q;
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : entered.join('-') };
  if (ok) {
    if (missed) game.flash(true);
    else {
      streak++;
      if (streak >= CLEAN) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('rd-show');
        else if (streak === CLEAN) game.say(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 1400);
  } else {
    streak = 0;
    nextBtn.classList.remove('rd-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    if (cur !== q) return;
    locked = false;
    render();
    timer = setTimeout(() => { if (cur === q) { quietUntil = 0; playModel(); } }, 900);
  }
}

window.__test = { state: () => ({ level: q?.level, item: q?.item, cells: q && [...q.cells], meter: q?.meter, barLen: q?.barLen, total: q?.total, palette: q && PALETTE[q.level], entered: [...entered], marks, locked }) };

game.ready().then(() => {
  game.stage.replaceChildren(scoreBox, palBox, game.h('div', { className: 'rd-row' }, replay, undo), nextBtn);
  game.on('settings', () => { streak = 0; palLevel = 0; nextBtn.classList.remove('rd-show'); next(); });
  game.on('lang', render);
  next();
});
