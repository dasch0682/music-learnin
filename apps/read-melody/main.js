// Read and play: a short melody is written on a staff. After a count-in, play it on the keyboard, in time with a click.
import { createGame } from '@core/shell.js';
import { audio, audioTime, click, playNote } from '@core/audio.js';
import { createKeyboard } from '@core/keyboard.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import { createScore } from './notation.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'read-melody',
  title: L('Read and play', 'Lis et joue'),
  strings: {
    play: L('Play', 'Jouer'),
    listen: L('Listen', 'Écouter'),
    nextLevel: L('Level {n} →', 'Niveau {n} →'),
    levelUp: L('Well done! Ready for the next level?', 'Bravo ! On passe au niveau suivant ?'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Quarters and halves, by step', '1 · Noires et blanches, par degrés') },
      { value: 2, label: L('2 · Pairs of eighths', '2 · Croches par deux') },
      { value: 3, label: L('3 · Thirds and a rest', '3 · Tierces et un soupir') },
      { value: 4, label: L('4 · G and F major, dotted rhythm', '4 · Sol et Fa majeur, rythme pointé') },
      { value: 5, label: L('5 · 3/4 and 6/8, leaps to a fifth', '5 · 3/4 et 6/8, sauts de quinte') },
      { value: 6, label: L('6 · Minor, sixteenths, bass clef', '6 · Mineur, doubles croches, clé de fa') },
    ] },
    { key: 'tempo', label: L('Tempo (bpm)', 'Tempo (bpm)'), type: 'range', min: 40, max: 120, step: 2, default: 66 },
    { key: 'tolerance', label: L('Tolerance', 'Tolérance'), type: 'select', default: 'normal', options: [
      { value: 'easy', label: L('Easy', 'Facile') },
      { value: 'normal', label: L('Normal', 'Normale') },
      { value: 'strict', label: L('Strict', 'Stricte') },
    ] },
    { key: 'latency', label: L('Latency (ms)', 'Latence (ms)'), type: 'range', min: -150, max: 150, step: 5, default: 0 },
    { key: 'labels', label: L('Note names on keys', 'Nom des notes sur les touches'), type: 'toggle', default: false },
  ],
});

const SKILL = 'read.melody';
const MAX_LEVEL = 6;
const STREAK = 6;
const WINDOWS = { easy: 0.16, normal: 0.11, strict: 0.07 }; // seconds at 72 bpm
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];

// ---- music data ----
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3]; // letters (0 = C) in order of key signatures
const letterOf = (s) => ((s % 7) + 7) % 7;
const keyAcc = (f, letter) => (f > 0 ? (SHARPS.slice(0, f).includes(letter) ? 1 : 0) : f < 0 ? (FLATS.slice(0, -f).includes(letter) ? -1 : 0) : 0);
const midiOf = (step, acc) => (Math.floor(step / 7) + 1) * 12 + LETTER_PC[letterOf(step)] + acc;
const natMidi = (step) => midiOf(step, 0);

const TOK = { q: 1, h: 2, e: 0.5, s: 0.25, 'q.': 1.5, 'h.': 3, r: 1 };
const BAR = { '4/4': 4, '3/4': 3, '6/8': 3 };
const PULSE = { '4/4': 1, '3/4': 1, '6/8': 1.5 };
const parseBar = (str) => str.split(' ').map((t) => ({ d: TOK[t], rest: t === 'r' }));

const T = (meter, ...bars) => ({ meter, bars });
const C0 = { fifths: 0, mode: 'major', tonic: 28 };
const LEVELS = {
  1: { kind: 'quarters-halves', clef: 'treble', keys: [C0], abs: [28, 32], deltas: [-1, 1],
    tpl: [T('4/4', 'q q h'), T('4/4', 'h q q'), T('4/4', 'q h q')] },
  2: { kind: 'eighths', clef: 'treble', keys: [C0], abs: [28, 35], deltas: [-1, 0, 1],
    tpl: ['h e e q', 'q e e h', 'e e q h', 'q e e q q', 'e e e e h', 'q q e e q', 'e e q q q'].map((b) => T('4/4', b)) },
  3: { kind: 'thirds', clef: 'treble', keys: [C0], abs: [28, 35], deltas: [-2, -1, 1, 2],
    need: (seq) => new Set(seq).size >= 3 && seq.some((s, i) => i && Math.abs(s - seq[i - 1]) === 2),
    tpl: ['q q r q', 'q r q q', 'q e e r q', 'h e e r', 'e e q r q', 'q q q r'].map((b) => T('4/4', b)) },
  4: { kind: 'dotted', clef: 'treble', keys: [{ fifths: 1, mode: 'major', tonic: 32 }, { fifths: -1, mode: 'major', tonic: 31 }], rel: [-3, 4], deltas: [-2, -1, 1, 2],
    tpl: ['q. e q q', 'q q q. e', 'q. e h', 'h q. e', 'q. e q. e'].map((b) => T('4/4', b)) },
  5: { kind: '', clef: 'treble', keys: [C0, { fifths: 1, mode: 'major', tonic: 32 }, { fifths: -1, mode: 'major', tonic: 31 }], rel: [0, 8], deltas: [-4, -3, -2, -1, 1, 2, 3, 4],
    need: (seq) => seq.some((s, i) => i && Math.abs(s - seq[i - 1]) >= 3),
    tpl: [] },
  6: { kind: 'minor-sixteenths', clef: 'bass', keys: [{ fifths: 0, mode: 'minor', tonic: 19 }, { fifths: -1, mode: 'minor', tonic: 22 }], rel: [-1, 6], deltas: [-2, -1, 1, 2],
    tpl: ['q s s s s h', 's s s s q h', 'e s s q h', 'q e s s h', 'h s s s s q', 's s s s e e h', 'e s s e e h'].map((b) => T('4/4', b)) },
};
for (const m of [['3/4', ['q q q', 'q. e q', 'h q', 'q h', 'q e e q'], ['h.', 'q h'], '34'], ['6/8', ['q. q.', 'q e q e', 'q. e e e', 'e e e q.', 'e e e e e e'], ['h.', 'q. q.'], '68']]) {
  for (const a of m[1]) for (const b of m[2]) LEVELS[5].tpl.push({ meter: m[0], bars: [a, b], kind: m[3] });
}
for (const lv of Object.values(LEVELS)) {
  for (const t of lv.tpl) {
    t.kind ||= lv.kind;
    t.ev = t.bars.map(parseBar);
    t.n = t.ev.flat().filter((e) => !e.rest).length;
    t.item = `${t.kind}:${t.n}`;
    t.ev.forEach((b) => { if (Math.abs(b.reduce((x, e) => x + e.d, 0) - BAR[t.meter]) > 1e-6) throw new Error('bar length ' + t.bars); });
  }
}
const rangeOf = (cfg, key) => cfg.abs || [key.tonic + cfg.rel[0], key.tonic + cfg.rel[1]];

function pickWeighted(opts, wf) {
  const w = opts.map(wf);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
  return opts[opts.length - 1];
}
const DW = { 0: 2, 1: 5, 2: 3, 3: 1.5, 4: 1.5 };

/** Random walk on scale steps inside the range; prefers a melody that starts on the tonic triad, ends on the tonic. */
function walk(n, key, cfg) {
  const [lo, hi] = rangeOf(cfg, key);
  const starts = [];
  for (let s = lo; s <= hi; s++) if ([0, 2, 4].includes((((s - key.tonic) % 7) + 7) % 7)) starts.push(s);
  let good = null, any = null;
  for (let tries = 0; tries < 120; tries++) {
    let s = pick(starts);
    const seq = [s];
    for (let i = 1; i < n; i++) {
      const opts = cfg.deltas.filter((d) => s + d >= lo && s + d <= hi);
      s += pickWeighted(opts, (d) => DW[Math.abs(d)]);
      seq.push(s);
    }
    any = seq;
    if (cfg.need && !cfg.need(seq)) continue;
    good ||= seq;
    if (letterOf(seq[n - 1]) === letterOf(key.tonic)) return seq;
  }
  return good || any;
}

function makeMelody(tpl, key, cfg) {
  const seq = walk(tpl.n, key, cfg);
  const raise = key.mode === 'minor' && tpl.n > 1 && letterOf(seq[tpl.n - 1]) === letterOf(key.tonic) && seq[tpl.n - 2] === seq[tpl.n - 1] - 1 && Math.random() < 0.5;
  const notes = [];
  let t = 0, p = 0;
  const barStarts = [];
  tpl.ev.forEach((bar) => {
    barStarts.push(t);
    const state = new Map(); // accidentals already written in this bar
    for (const e of bar) {
      const n = { t, d: e.d, rest: e.rest };
      if (!e.rest) {
        const step = seq[p++];
        const acc = keyAcc(key.fifths, letterOf(step)) + (raise && p === tpl.n - 1 ? 1 : 0);
        const eff = state.has(step) ? state.get(step) : keyAcc(key.fifths, letterOf(step));
        n.step = step; n.acc = acc; n.midi = midiOf(step, acc);
        n.show = acc === eff ? null : acc === 0 ? 'natural' : acc > 0 ? 'sharp' : 'flat';
        state.set(step, acc);
      }
      notes.push(n);
      t += e.d;
    }
  });
  return { notes, barStarts, total: t };
}

// ---- screen ----
await game.ready();
const scoreBox = game.h('div', { className: 'rm-score' });
const listenBtn = game.h('button', { className: 'ml-round rm-listen', textContent: '♪' });
const playBtn = game.h('button', { className: 'ml-round rm-play', textContent: '▶' });
const levelBtn = game.h('button', { className: 'ml-btn ml-primary', hidden: true });
const controls = game.h('div', { className: 'rm-controls' }, listenBtn, playBtn, levelBtn);
const keysBox = game.h('div', { className: 'rm-keys' });
game.stage.classList.add('rm-stage');
game.stage.replaceChildren(scoreBox, controls, keysBox);
const score = createScore(scoreBox);
let kb = null;

// ---- state ----
let ch = null, run = null, phase = 'idle', offset = 0;
let streak = 0, lastItem = null, failedOnce = false, gen = 0, lockUntil = 0, pending = 0, lastResult = null, runs = 0, lastTs = 0;
const level = () => +game.settings.level;

function setPhase(p, label) {
  phase = p;
  if (playBtn.dataset.phase !== p) playBtn.dataset.phase = p;
  if (label !== undefined && playBtn.textContent !== label) playBtn.textContent = label;
  publish();
}
function labels() {
  playBtn.setAttribute('aria-label', game.t('play'));
  listenBtn.setAttribute('aria-label', game.t('listen'));
  levelBtn.textContent = game.t('nextLevel', { n: level() + 1 });
}

// ---- challenge ----
function build(lv, tpl) {
  const cfg = LEVELS[lv];
  const key = pick(cfg.keys);
  const mel = makeMelody(tpl, key, cfg);
  const bpm = +game.settings.tempo;
  const pulse = PULSE[tpl.meter];
  const q = 60 / bpm / pulse;
  const real = mel.notes.filter((n) => !n.rest);
  const onsets = real.map((n) => n.t * q);
  let gap = 60 / bpm;
  for (let i = 1; i < onsets.length; i++) gap = Math.min(gap, onsets[i] - onsets[i - 1]);
  const win = WINDOWS[game.settings.tolerance] ?? WINDOWS.normal;
  const tol = Math.min(win * clamp(Math.sqrt(72 / bpm), 0.8, 1.2), 0.45 * gap);
  const [lo, hi] = rangeOf(cfg, key);
  return {
    level: lv, item: tpl.item, key, clef: cfg.clef, meter: tpl.meter, bpm, q, P: 60 / bpm, pulse,
    notes: mel.notes, real, barStarts: mel.barStarts, total: mel.total, len: mel.total * q,
    onsets, tol, pitches: real.map((n) => n.midi), kb: [natMidi(lo), natMidi(hi)],
  };
}

function drawScreen() {
  score.draw({
    clef: ch.clef, fifths: ch.key.fifths, meter: ch.meter, total: ch.total, barStarts: ch.barStarts,
    pulse: ch.pulse, unit: ch.pulse, notes: ch.notes,
  });
  kb = createKeyboard(keysBox, { from: ch.kb[0], to: ch.kb[1], labels: !!game.settings.labels, onDown: onKey });
  kb.el.addEventListener('pointerdown', (e) => { lastTs = e.timeStamp; }, true);
}

async function newChallenge() {
  const my = ++gen;
  stop();
  const lv = level();
  const tpls = LEVELS[lv].tpl;
  let stats = null;
  try { stats = await loadItemMastery(SKILL); } catch { /* plain random */ }
  if (my !== gen) return;
  const ids = [...new Set(tpls.map((t) => t.item))];
  const id = pickWeak(ids, stats, { avoid: lastItem });
  lastItem = id;
  failedOnce = false;
  ch = build(lv, pick(tpls.filter((t) => t.item === id)));
  drawScreen();
  labels();
  playBtn.classList.remove('rm-ok', 'rm-ko');
  setPhase('idle', '▶');
}

// ---- audio scheduling ----
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
  const { q, P, len } = ch;
  const r = { mode, sched: [], presses: [], countAt: null, countN: 0, listenAt: null, turnAt: null };
  const add = (at, fn) => r.sched.push({ at, fn });
  const pulses = Math.round(ch.total / ch.pulse), perBar = Math.round((BAR[ch.meter]) / ch.pulse);
  const clicks = (from, n, gain, accentEvery) => {
    for (let i = 0; i < n; i++) add(from + i * P, (when) => click({ when, gain, accent: accentEvery ? i % accentEvery === 0 : false }));
  };
  const soft = (from, bars, gain) => { if (ch.meter === '6/8') for (let i = 0; i < bars * 6; i++) if (i % 3) add(from + (i * P) / 3, (when) => click({ when, gain })); };
  const notes = (from) => ch.real.forEach((n) =>
    add(from + n.t * q, (when) => playNote(n.midi, { when, dur: Math.max(0.05, n.d * q * 0.9), gain: 0.3, timbre: 'piano' })));
  let t = audioTime() + 0.35;
  if (mode === 'listen') {
    r.listenAt = t;
    clicks(t, pulses, 0.1, perBar);
    notes(t);
    t += len;
  } else {
    r.countAt = t; r.countN = perBar;
    clicks(t, perBar, 0.3, perBar);
    soft(t, 1, 0.07);
    t += perBar * P;
    r.turnAt = t;
    clicks(t, pulses, 0.1, perBar);
    t += len;
  }
  r.end = t + 0.2;
  r.sched.sort((a, b) => a.at - b.at);
  run = r;
  score.clearPresses();
  playBtn.classList.remove('rm-ok', 'rm-ko');
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
    setPhase('count', String(clamp(Math.floor((now - run.countAt) / P) + 1, 1, run.countN)));
    score.cursor(null);
  } else setPhase(run.mode === 'listen' ? 'listen' : 'count', run.mode === 'listen' ? '♪' : '');
  run.raf = requestAnimationFrame(frame);
}

/** Pair presses with notes by time (within the tolerance), then check the pitch of each pair. */
function judgeMelody(onsets, pitches, tol, presses) {
  const pairs = [];
  onsets.forEach((o, i) => presses.forEach((p, j) => { const d = p.t - o; if (Math.abs(d) <= tol) pairs.push({ i, j, d }); }));
  pairs.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
  const hit = new Map(), used = new Map();
  for (const pr of pairs) if (!hit.has(pr.i) && !used.has(pr.j)) { hit.set(pr.i, pr); used.set(pr.j, pr); }
  let err = 0, wrong = 0;
  const out = presses.map((p, j) => {
    const pr = used.get(j);
    if (pr) {
      err += Math.abs(pr.d);
      if (p.midi !== pitches[pr.i]) { wrong++; return { t: p.t, d: pr.d, cls: 'wrong' }; }
      return { t: p.t, d: pr.d, cls: Math.abs(pr.d) <= tol * 0.5 ? 'good' : pr.d < 0 ? 'early' : 'late' };
    }
    let near = false;
    onsets.forEach((o, i) => { if (!hit.has(i) && Math.abs(p.t - o) <= tol * 2.2) near = true; });
    return { t: p.t, d: null, cls: near ? 'off' : 'extra' };
  });
  const notes = onsets.map((_, i) => ({ ok: hit.has(i) && presses[hit.get(i).j].midi === pitches[i] }));
  const miss = onsets.length - hit.size, extra = presses.length - used.size;
  return { correct: miss === 0 && wrong === 0 && extra === 0, notes, presses: out, miss, wrong, extra, err: used.size ? Math.round((err / used.size) * 1000) : null };
}

async function finish() {
  const r = run;
  stop();
  if (r.mode === 'listen') { setPhase('idle', '▶'); return; }
  lockUntil = performance.now() + 700;
  if (!r.presses.length) { setPhase('idle', '▶'); return; }
  const res = judgeMelody(ch.onsets, ch.pitches, ch.tol, r.presses);
  lastResult = { correct: res.correct, miss: res.miss, wrong: res.wrong, extra: res.extra, err: res.err, presses: r.presses.length, item: ch.item, level: ch.level, run: ++runs, classes: res.presses.map((p) => p.cls) };
  score.result(res, (s) => s / ch.q);
  playBtn.classList.add(res.correct ? 'rm-ok' : 'rm-ko');
  setPhase('feedback', '▶');
  const my = gen;
  if (res.correct || !failedOnce) {
    await game.attempt({
      skill: SKILL, correct: res.correct, ms: Math.round(ch.len * 1000), level: ch.level, item: ch.item,
      detail: { bpm: ch.bpm, err: res.err, miss: res.miss, wrong: res.wrong, extra: res.extra, tol: Math.round(ch.tol * 1000), retry: failedOnce },
    });
  } else game.flash(false);
  if (my !== gen) return;
  if (res.correct) {
    streak = failedOnce ? 0 : streak + 1;
    if (streak >= STREAK && ch.level < MAX_LEVEL && levelBtn.hidden) {
      levelBtn.hidden = false;
      labels();
      game.say(game.t('levelUp'));
    }
    pending = setTimeout(() => newChallenge(), 1400);
  } else {
    streak = 0;
    failedOnce = true;
  }
  publish();
}

// ---- input ----
function onKey(midi) {
  if (!run || run.mode !== 'play' || run.turnAt == null) return;
  const nowMs = performance.now();
  const ts = lastTs > 0 && Math.abs(nowMs - lastTs) < 250 ? lastTs : nowMs;
  const at = ts / 1000 + offset - (+game.settings.latency || 0) / 1000 - run.turnAt;
  if (at < -0.45 * ch.P) return; // still the count-in
  run.presses.push({ t: at, midi });
  score.addPress(at / ch.q);
}
playBtn.onclick = () => {
  if (!ch || run || performance.now() < lockUntil) return;
  begin('play');
};
listenBtn.onclick = () => {
  if (!ch) return;
  if (run?.mode === 'listen') { stop(); setPhase('idle', '▶'); return; }
  if (run) return;
  begin('listen');
};
levelBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, level() + 1));

// ---- test hook ----
function publish() {
  window.__test = {
    phase, level: ch?.level, skill: SKILL, item: ch?.item, bpm: ch?.bpm, streak,
    tol: ch ? Math.round(ch.tol * 1000) : null,
    expected: ch ? ch.onsets.map((s) => Math.round(s * 1000)) : [],
    pitches: ch ? ch.pitches : [],
    notes: ch ? ch.notes.map((n) => ({ d: n.d, rest: n.rest, midi: n.midi ?? null })) : [],
    meter: ch?.meter, clef: ch?.clef, fifths: ch?.key.fifths, mode: ch?.key.mode, kb: ch?.kb,
    turnStart: run && run.turnAt != null ? (run.turnAt - offset) * 1000 + (+game.settings.latency || 0) : null,
    result: lastResult, levelUp: !levelBtn.hidden,
  };
}

game.on('settings', () => { streak = 0; levelBtn.hidden = true; lastResult = null; newChallenge(); });
game.on('lang', labels);
newChallenge();
