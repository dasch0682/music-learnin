// Tap the rhythm: keep the beat, echo a rhythm, then read rhythms and tap them.
import { createGame } from '@core/shell.js';
import { audio, audioTime, click, tap, playNote } from '@core/audio.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import { poolFor, pulsePattern, timing, judge, ODD } from './patterns.js';
import { createScore } from './notation.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'tap-rhythm',
  title: L('Tap the rhythm', 'Frappe le rythme'),
  strings: {
    pad: L('Tap here', 'Frappe ici'),
    listen: L('Listen', 'Écouter'),
    nextLevel: L('Level {n} →', 'Niveau {n} →'),
    levelUp: L('Well done! Ready for the next level?', 'Bravo ! On passe au niveau suivant ?'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Keep the beat', '1 · Garder la pulsation') },
      { value: 2, label: L('2 · Echo: long and short', '2 · Écho : longues et brèves') },
      { value: 3, label: L('3 · Read: quarter, half, eighths', '3 · Lire : noires, blanches, croches') },
      { value: 4, label: L('4 · Rests', '4 · Silences : soupir, demi-soupir') },
      { value: 5, label: L('5 · Sixteenth notes', '5 · Doubles croches') },
      { value: 6, label: L('6 · Dotted notes, syncopation', '6 · Notes pointées, syncopes') },
      { value: 7, label: L('7 · Triplets and swing', '7 · Triolets et swing') },
      { value: 8, label: L('8 · Compound time 6/8', '8 · Mesure composée 6/8') },
      { value: 9, label: L('9 · Odd meters 5/8, 7/8, 5/4', '9 · Mesures asymétriques 5/8, 7/8, 5/4') },
    ] },
    { key: 'tempo', label: L('Tempo (bpm)', 'Tempo (bpm)'), type: 'range', min: 50, max: 140, step: 2, default: 72 },
    { key: 'tolerance', label: L('Tolerance', 'Tolérance'), type: 'select', default: 'normal', options: [
      { value: 'easy', label: L('Easy', 'Facile') },
      { value: 'normal', label: L('Normal', 'Normale') },
      { value: 'strict', label: L('Strict', 'Stricte') },
    ] },
    { key: 'latency', label: L('Latency (ms)', 'Latence (ms)'), type: 'range', min: -150, max: 150, step: 5, default: 0 },
  ],
});

const SKILLS = {
  1: 'rhythm.pulse', 2: 'rhythm.echo.basic', 3: 'rhythm.read.basic', 4: 'rhythm.rests',
  5: 'rhythm.sixteenths', 6: 'rhythm.syncopation', 7: 'rhythm.triplets', 8: 'rhythm.compound', 9: 'rhythm.odd',
};
const MAX_LEVEL = 9;
const WINDOWS = { easy: 0.16, normal: 0.11, strict: 0.07 }; // seconds at 72 bpm
const BUCKETS = [{ id: 'slow', mult: 0.8 }, { id: 'medium', mult: 1 }, { id: 'fast', mult: 1.25 }];
const STREAK = 8;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

await game.ready();

// ---- screen ----
const scoreBox = game.h('div', { className: 'tr-score' });
const listenBtn = game.h('button', { className: 'ml-round tr-listen', textContent: '♪' });
const levelBtn = game.h('button', { className: 'ml-btn ml-primary', hidden: true });
const controls = game.h('div', { className: 'tr-controls' }, listenBtn, levelBtn);
const pad = game.h('div', { className: 'tr-pad', tabIndex: 0 });
pad.setAttribute('role', 'button');
game.stage.classList.add('tr-stage');
game.stage.replaceChildren(scoreBox, controls, pad);
const score = createScore(scoreBox);

// ---- state ----
let ch = null;          // current challenge
let run = null;         // what is playing now
let phase = 'idle';     // idle | count | listen | turn | feedback
let offset = 0;         // audio clock − performance clock (s)
let streak = 0, lastItem = null, failedOnce = false, gen = 0, lockUntil = 0, pending = 0, idleRuns = 0;
let lastResult = null, runs = 0;

const level = () => +game.settings.level;
const auto = () => level() <= 2; // nothing to read: challenges chain by themselves

function setPhase(p, label) {
  phase = p;
  if (pad.dataset.phase !== p) pad.dataset.phase = p;
  if (label !== undefined && pad.textContent !== label) pad.textContent = label;
  publish();
}

function labels() {
  pad.setAttribute('aria-label', game.t('pad'));
  listenBtn.setAttribute('aria-label', game.t('listen'));
  levelBtn.textContent = game.t('nextLevel', { n: level() + 1 });
}

function layout() {
  const reading = level() >= 3;
  listenBtn.hidden = !reading;
  controls.classList.toggle('tr-none', !reading && levelBtn.hidden);
}

// ---- challenge ----
function build(lv, item) {
  const base = +game.settings.tempo;
  const bpm = lv === 1 ? clamp(Math.round(base * item.mult), 44, 160) : base;
  const tm = timing(lv === 1 ? pulsePattern(8) : item);
  const q = 60 / bpm / tm.pulse; // seconds per quarter note (the tempo is the pulse)
  const onsets = tm.onsets.map((t) => t * q);
  let gap = tm.pulse * q;
  for (let i = 1; i < onsets.length; i++) gap = Math.min(gap, onsets[i] - onsets[i - 1]);
  const win = WINDOWS[game.settings.tolerance] ?? WINDOWS.normal;
  const tol = Math.min(win * clamp(Math.sqrt(72 / bpm), 0.8, 1.2), 0.45 * gap);
  // Level 1 has no click to lean on: the window widens a little with each beat (drift).
  const tols = onsets.map((_, i) => (lv === 1 ? Math.min(tol * (1 + 0.15 * i), 0.45 * gap) : tol));
  return { level: lv, skill: SKILLS[lv], item: item.id, bpm, q, tm, onsets, tol, tols, P: tm.pulse * q, len: tm.total * q };
}

function drawScore() {
  score.draw({
    events: ch.tm.events, total: ch.tm.total, pulse: ch.tm.pulse, barStarts: ch.tm.barStarts, meter: ch.tm.meter,
    swing: ch.tm.swing, notes: ch.level >= 3, marks: ch.level === 2 ? [] : ch.tm.onsets,
    beats: ch.tm.beats, beamStarts: ch.tm.unit === 0.5 ? ch.tm.groupStarts : null,
  });
}

async function newChallenge(start) {
  const my = ++gen;
  stop();
  const lv = level();
  const pool = lv === 1 ? BUCKETS : poolFor(lv);
  let stats = null;
  try { stats = await loadItemMastery(SKILLS[lv]); } catch { /* no stats: plain random */ }
  if (my !== gen) return;
  const item = pickWeak(pool, stats, { keyOf: (p) => p.id, avoid: lastItem });
  lastItem = item.id;
  failedOnce = false;
  ch = build(lv, item);
  drawScore();
  labels();
  layout();
  pad.classList.remove('tr-ok', 'tr-ko');
  setPhase('idle', '▶');
  if (start) begin('play');
}

// ---- audio scheduling (short look-ahead, so a run can be cancelled) ----
function pump() {
  if (!run) return;
  const now = audioTime();
  while (run.sched.length && run.sched[0].at < now + 0.2) {
    const ev = run.sched.shift();
    ev.fn(Math.max(0, ev.at - now));
  }
}
function syncClock() { offset = Math.max(offset, audioTime() - performance.now() / 1000); }

function stop() {
  clearTimeout(pending);
  pending = 0;
  if (run) { clearInterval(run.timer); cancelAnimationFrame(run.raf); run = null; }
  score.cursor(null);
}

function begin(mode) {
  stop();
  audio();
  offset = -Infinity;
  syncClock();
  const { q, P, tm, len } = ch;
  const r = { mode, sched: [], taps: [], countAt: null, countN: 0, listenAt: null, turnAt: null };
  const add = (at, fn) => r.sched.push({ at, fn });
  const pulses = Math.round(tm.total / tm.pulse), perBar = Math.round(tm.barLen / tm.pulse);
  const clicks = (from, n, gain, accentEvery) => {
    for (let i = 0; i < n; i++) add(from + i * P, (when) => click({ when, gain, accent: accentEvery ? i % accentEvery === 0 : false }));
  };
  // Odd meters: clicks on the grid of counts. gains = [inside a group, group start, bar start] (0 = silent).
  // A group start is accented; the bar start is stronger still (two clicks at once).
  const gridClicks = (from, list, gains) => list.forEach((g) => {
    if (!gains[g.s]) return;
    add(from + g.t * q, (when) => {
      click({ when, gain: gains[g.s], accent: g.s > 0 });
      if (g.s === 2) click({ when, gain: gains[2] * 0.6 });
    });
  });
  const softGrid = (from) => gridClicks(from, tm.grid, [tm.unit === 1 ? 0.05 : 0, 0.08, 0.1]);
  const notes = (from) => tm.events.filter((e) => !e.rest).forEach((e) =>
    add(from + e.tt * q, (when) => playNote(74, { when, dur: Math.max(0.05, e.td * q * 0.82 - 0.04), gain: 0.3, timbre: 'bass' })));
  let t = audioTime() + 0.35;
  if (mode === 'listen') {
    r.listenAt = t;
    if (tm.grid) softGrid(t); else clicks(t, pulses, 0.1, perBar);
    notes(t);
    t += len;
  } else {
    if (ch.level === 1) { // 4 clicks, then silence
      r.countAt = t; r.countN = 4;
      clicks(t, 4, 0.3, 4);
      t += 4 * P;
    } else if (ch.level === 2) { // 2 clicks, the model, then the echo
      r.countAt = t; r.countN = 2;
      clicks(t, 2, 0.3, 0);
      t += 2 * P;
      r.listenAt = t;
      clicks(t, pulses, 0.12, perBar);
      notes(t);
      t += len;
    } else if (tm.grid) { // one bar of count-in that follows the grouping
      r.countAt = t; r.countTimes = tm.counts.map((c) => c * q); r.countN = r.countTimes.length;
      gridClicks(t, tm.grid.filter((g) => g.t < tm.barLen - 1e-6), [tm.unit === 1 ? 0.13 : 0.07, 0.24, 0.32]);
      t += tm.barLen * q;
    } else { // one bar of count-in
      r.countAt = t; r.countN = perBar;
      clicks(t, perBar, 0.3, perBar);
      if (tm.meter === '6/8') for (let i = 0; i < perBar * 3; i++) if (i % 3) add(t + (i * P) / 3, (when) => click({ when, gain: 0.07 }));
      t += perBar * P;
    }
    r.turnAt = t;
    if (tm.grid) softGrid(t); else if (ch.level !== 1) clicks(t, pulses, 0.1, perBar);
    t += len;
  }
  r.end = t;
  r.sched.sort((a, b) => a.at - b.at);
  run = r;
  score.clearTaps();
  pad.classList.remove('tr-ok', 'tr-ko');
  r.timer = setInterval(pump, 30);
  pump();
  frame();
}

function frame() {
  if (!run) return;
  pump();
  const now = audioTime();
  const { q, P, len } = ch;
  if (run.turnAt == null || now < run.turnAt) syncClock();
  if (now >= run.end) { finish(); return; }
  if (run.turnAt != null && now >= run.turnAt) {
    setPhase('turn', '');
    score.cursor((now - run.turnAt) / q);
  } else if (run.listenAt != null && now >= run.listenAt && now < run.listenAt + len) {
    setPhase('listen', '♪');
    score.cursor((now - run.listenAt) / q);
  } else if (run.countAt != null && now >= run.countAt) {
    const k = run.countTimes ? run.countTimes.filter((c) => c <= now - run.countAt + 1e-3).length : Math.floor((now - run.countAt) / P) + 1;
    setPhase('count', String(clamp(k, 1, run.countN)));
    score.cursor(null);
  } else setPhase(run.mode === 'listen' ? 'listen' : 'count', run.mode === 'listen' ? '♪' : '');
  run.raf = requestAnimationFrame(frame);
}

async function finish() {
  const r = run;
  stop();
  if (r.mode === 'listen') { setPhase('idle', '▶'); return; }
  const res = judge(ch.onsets, ch.tols, r.taps);
  lastResult = { correct: res.correct, miss: res.miss, extra: res.extra, err: res.err, taps: r.taps.length, item: ch.item, level: ch.level, run: ++runs };
  lockUntil = performance.now() + 700;
  if (!r.taps.length) { // nobody played: no log
    idleRuns++;
    setPhase('idle', '▶');
    if (auto() && idleRuns < 2) pending = setTimeout(() => begin('play'), 1500);
    return;
  }
  idleRuns = 0;
  score.result(res, (s) => s / ch.q);
  pad.classList.add(res.correct ? 'tr-ok' : 'tr-ko');
  setPhase('feedback', res.correct ? '' : '▶');
  const my = gen;
  if (res.correct || !failedOnce) {
    await game.attempt({
      skill: ch.skill, correct: res.correct, ms: Math.round(ch.len * 1000), level: ch.level, item: ch.item,
      detail: { bpm: ch.bpm, err: res.err, miss: res.miss, extra: res.extra, tol: Math.round(ch.tol * 1000), retry: failedOnce },
    });
  } else game.flash(false);
  if (my !== gen) return;
  if (res.correct) {
    streak = failedOnce ? 0 : streak + 1;
    if (streak >= STREAK && ch.level < MAX_LEVEL && levelBtn.hidden) {
      levelBtn.hidden = false;
      labels(); layout();
      game.celebrate(game.t('levelUp'));
    }
    pending = setTimeout(() => newChallenge(auto()), 1300);
  } else {
    streak = 0;
    failedOnce = true;
    if (auto()) pending = setTimeout(() => begin('play'), 2000);
  }
  publish();
}

// ---- input ----
function onTap(e) {
  if (document.querySelector('dialog[open]') || !ch) return;
  tap();
  pad.classList.add('tr-hit');
  setTimeout(() => pad.classList.remove('tr-hit'), 90);
  const nowMs = performance.now();
  const ts = e && e.timeStamp > 0 && Math.abs(nowMs - e.timeStamp) < 250 ? e.timeStamp : nowMs;
  if (!run) {
    if (nowMs < lockUntil) return;
    if (phase === 'idle' || (phase === 'feedback' && failedOnce)) begin('play');
    return;
  }
  if (run.mode !== 'play') return;
  const at = ts / 1000 + offset - (+game.settings.latency || 0) / 1000 - run.turnAt;
  if (at < -0.45 * ch.P) return; // still the count-in
  run.taps.push(at);
  score.addTap(at / ch.q);
}

pad.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(e); });
pad.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if ((e.code !== 'Space' && e.code !== 'Enter') || e.repeat) return;
  if (e.target.closest?.('button, select, input, a, dialog')) return;
  e.preventDefault();
  onTap(e);
});
listenBtn.onclick = () => {
  if (!ch || ch.level < 3) return;
  if (run?.mode === 'listen') { stop(); setPhase('idle', '▶'); return; }
  begin('listen');
};
levelBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, level() + 1));

// ---- test hook ----
function publish() {
  window.__test = {
    phase, level: ch?.level, skill: ch?.skill, item: ch?.item, bpm: ch?.bpm, streak,
    tol: ch ? Math.round(ch.tol * 1000) : null,
    expected: ch ? ch.onsets.map((s) => Math.round(s * 1000)) : [],
    turnStart: run && run.turnAt != null ? (run.turnAt - offset) * 1000 + (+game.settings.latency || 0) : null,
    result: lastResult, levelUp: !levelBtn.hidden, label: pad.textContent,
    meter: ch?.tm.meter, groups: ch?.tm.groups || null, len: ch ? Math.round(ch.len * 1000) : null,
  };
}

/** Test hook: show one pattern of the current level by id. */
window.__show = (id) => {
  const swing = id.startsWith('sw:');
  const odd = /^(\d\/\d):([\d+]+):(.+)$/.exec(id);
  const bars = (odd ? odd[3] : id.replace('sw:', '')).split('|').map((b) => b.split('-'));
  const item = odd
    ? { id, bars, meter: odd[1], groups: odd[2].split('+').map(Number), unit: ODD[odd[1]].unit }
    : { id, bars, swing, meter: level() === 8 ? '6/8' : '4/4' };
  stop(); gen++; lastItem = id; failedOnce = false;
  ch = build(level(), item);
  drawScore(); setPhase('idle', '▶');
  return true;
};

game.on('settings', () => { streak = 0; idleRuns = 0; levelBtn.hidden = true; lastResult = null; newChallenge(false); });
game.on('lang', labels);
newChallenge(auto());
