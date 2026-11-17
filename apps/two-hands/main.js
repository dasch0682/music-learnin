// Two hands: left and right pads, each with its own sound. Alternate, then play two rhythms against each other.
import { createGame } from '@core/shell.js';
import { audio, audioTime, click, tap } from '@core/audio.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import { poolFor, judge, MAX_LEVEL } from './patterns.js';
import { createLanes } from './lanes.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'two-hands',
  title: L('Tap with two hands', 'Frappe à deux mains'),
  strings: {
    left: L('Left hand', 'Main gauche'),
    right: L('Right hand', 'Main droite'),
    listen: L('Listen', 'Écouter'),
    nextLevel: L('Level {n} →', 'Niveau {n} →'),
    levelUp: L('Well done! Ready for the next level?', 'Bravo ! On passe au niveau suivant ?'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Left, right, left, right', '1 · Gauche, droite, gauche, droite') },
      { value: 2, label: L('2 · One hand twice as fast', '2 · Une main deux fois plus vite') },
      { value: 3, label: L('3 · The beat and a short rhythm', '3 · La pulsation et un petit rythme') },
      { value: 4, label: L('4 · 3 against 2', '4 · 3 contre 2') },
      { value: 5, label: L('5 · 2 against 3, 4 against 3', '5 · 2 contre 3, 4 contre 3') },
      { value: 6, label: L('6 · 3 against 4, 5 against 4', '6 · 3 contre 4, 5 contre 4') },
    ] },
    { key: 'tempo', label: L('Tempo (bpm)', 'Tempo (bpm)'), type: 'range', min: 40, max: 120, step: 2, default: 66 },
    { key: 'tolerance', label: L('Tolerance', 'Tolérance'), type: 'select', default: 'normal', options: [
      { value: 'easy', label: L('Easy', 'Facile') },
      { value: 'normal', label: L('Normal', 'Normale') },
      { value: 'strict', label: L('Strict', 'Stricte') },
    ] },
    { key: 'latency', label: L('Latency (ms)', 'Latence (ms)'), type: 'range', min: -150, max: 150, step: 5, default: 0 },
  ],
});

const SKILL = 'rhythm.poly';
const WINDOWS = { easy: 0.16, normal: 0.11, strict: 0.07 }; // seconds at 72 bpm
const PITCH = { L: 150, R: 420 };
const STREAK = 6;
const HANDS = ['L', 'R'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

await game.ready();

// ---- screen ----
const view = game.h('div', { className: 'th-view' });
const listenBtn = game.h('button', { className: 'ml-round th-listen', textContent: '♪' });
const levelBtn = game.h('button', { className: 'ml-btn ml-primary', hidden: true });
const controls = game.h('div', { className: 'th-controls' }, listenBtn, levelBtn);
const pads = { L: game.h('div', { className: 'th-pad', tabIndex: 0 }), R: game.h('div', { className: 'th-pad', tabIndex: 0 }) };
const padBox = game.h('div', { className: 'th-pads' }, pads.L, pads.R);
for (const hd of HANDS) { pads[hd].setAttribute('role', 'button'); pads[hd].dataset.hand = hd; }
game.stage.classList.add('th-stage');
game.stage.replaceChildren(view, controls, padBox);
const lanes = createLanes(view);

// ---- state ----
let ch = null, run = null, phase = 'idle', offset = 0;
let streak = 0, lastItem = null, failedOnce = false, demoDone = false, gen = 0, lockUntil = 0, pending = 0;
let lastResult = null;

const level = () => +game.settings.level;

function setPhase(p, label) {
  phase = p;
  if (padBox.dataset.phase !== p) padBox.dataset.phase = p;
  if (label !== undefined) for (const hd of HANDS) if (pads[hd].textContent !== label) pads[hd].textContent = label;
  publish();
}

function labels() {
  pads.L.setAttribute('aria-label', game.t('left'));
  pads.R.setAttribute('aria-label', game.t('right'));
  listenBtn.setAttribute('aria-label', game.t('listen'));
  levelBtn.textContent = game.t('nextLevel', { n: level() + 1 });
}

// ---- challenge ----
function build(lv, p) {
  const bpm = clamp(Math.round(+game.settings.tempo * (p.mult || 1)), 40, 160);
  const q = 60 / bpm; // seconds per beat
  const total = p.beats * p.cycles;
  const rep = (list) => Array.from({ length: p.cycles }, (_, c) => list.map((t) => t + c * p.beats)).flat();
  const beatsOf = { L: rep(p.L), R: rep(p.R) };
  const win = WINDOWS[game.settings.tolerance] ?? WINDOWS.normal;
  const base = win * clamp(Math.sqrt(72 / bpm), 0.8, 1.2);
  const onsets = {}, tol = {};
  for (const hd of HANDS) {
    onsets[hd] = beatsOf[hd].map((b) => b * q);
    let gap = Infinity;
    for (let i = 1; i < onsets[hd].length; i++) gap = Math.min(gap, onsets[hd][i] - onsets[hd][i - 1]);
    tol[hd] = Math.min(base, 0.45 * gap);
  }
  return { level: lv, item: p.id, p, bpm, q, total, beatsOf, onsets, tol, len: total * q };
}

function drawLanes() { lanes.draw({ total: ch.total, beats: ch.p.beats, L: ch.beatsOf.L, R: ch.beatsOf.R }); }

async function newChallenge() {
  const my = ++gen;
  stop();
  const lv = level();
  let stats = null;
  try { stats = await loadItemMastery(SKILL); } catch { /* no stats: plain random */ }
  if (my !== gen) return;
  const item = pickWeak(poolFor(lv), stats, { keyOf: (p) => p.id, avoid: lastItem });
  lastItem = item.id;
  failedOnce = false;
  demoDone = false;
  ch = build(lv, item);
  drawLanes();
  labels();
  padBox.classList.remove('th-done');
  for (const hd of HANDS) pads[hd].classList.remove('th-ok', 'th-ko');
  setPhase('idle', '▶');
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
  lanes.cursor(null);
}

function begin(mode) {
  stop();
  audio();
  offset = -Infinity;
  syncClock();
  const { q, p, total, len } = ch;
  const r = { mode, sched: [], taps: { L: [], R: [] }, countAt: null, countN: p.count, listenAt: null, turnAt: null };
  const add = (at, fn) => r.sched.push({ at, fn });
  const clicks = (from, n, gain, strongEvery) => {
    for (let i = 0; i < n; i++) add(from + i * q, (when) => click({ when, gain, accent: strongEvery ? i % strongEvery === 0 : false }));
  };
  const hits = (from) => HANDS.forEach((hd) => ch.beatsOf[hd].forEach((b) => add(from + b * q, (when) => tap({ when, pitch: PITCH[hd] }))));
  let t = audioTime() + 0.35;
  const model = () => { r.listenAt = t; clicks(t, total, 0.08, p.beats); hits(t); t += len; };
  if (mode === 'listen') model();
  else {
    if (p.always || (p.demo && !demoDone)) { model(); t += 0.3; }
    r.countAt = t;
    clicks(t, p.count, 0.3, p.count);
    t += p.count * q;
    r.turnAt = t;
    clicks(t, total, 0.08, p.beats);
    t += len + 0.15;
  }
  r.end = t;
  r.sched.sort((a, b) => a.at - b.at);
  run = r;
  lanes.clearTaps();
  for (const hd of HANDS) pads[hd].classList.remove('th-ok', 'th-ko');
  r.timer = setInterval(pump, 30);
  pump();
  frame();
}

function frame() {
  if (!run) return;
  pump();
  const now = audioTime();
  const { q, len } = ch;
  if (run.turnAt == null || now < run.turnAt) syncClock();
  if (now >= run.end) { finish(); return; }
  if (run.turnAt != null && now >= run.turnAt) {
    setPhase('turn', '');
    lanes.cursor((now - run.turnAt) / q);
  } else if (run.countAt != null && now >= run.countAt) {
    setPhase('count', String(clamp(Math.floor((now - run.countAt) / q) + 1, 1, run.countN)));
    lanes.cursor(null);
  } else if (run.listenAt != null && now >= run.listenAt && now < run.listenAt + len) {
    setPhase('listen', '♪');
    lanes.cursor((now - run.listenAt) / q);
  } else {
    setPhase('listen', '♪');
    lanes.cursor(null);
  }
  run.raf = requestAnimationFrame(frame);
}

async function finish() {
  const r = run;
  stop();
  if (r.mode === 'listen') { setPhase('idle', '▶'); return; }
  demoDone = true;
  const res = {};
  for (const hd of HANDS) res[hd] = judge(ch.onsets[hd], ch.tol[hd], r.taps[hd]);
  const correct = res.L.ok && res.R.ok;
  const nTaps = r.taps.L.length + r.taps.R.length;
  const errs = HANDS.map((hd) => res[hd].err).filter((e) => e != null);
  lastResult = {
    correct, item: ch.item, level: ch.level, taps: nTaps,
    L: { ok: res.L.ok, miss: res.L.miss, extra: res.L.extra }, R: { ok: res.R.ok, miss: res.R.miss, extra: res.R.extra },
  };
  lockUntil = performance.now() + 700;
  if (!nTaps) { setPhase('idle', '▶'); return; } // nobody played: no log
  lanes.result(res, (s) => s / ch.q);
  for (const hd of HANDS) pads[hd].classList.add(res[hd].ok ? 'th-ok' : 'th-ko');
  setPhase('feedback', correct ? '' : '▶');
  const my = gen;
  if (correct || !failedOnce) {
    await game.attempt({
      skill: SKILL, correct, ms: Math.round(ch.len * 1000), level: ch.level, item: ch.item,
      detail: {
        bpm: ch.bpm, err: errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : null,
        miss: { L: res.L.miss, R: res.R.miss }, extra: { L: res.L.extra, R: res.R.extra }, retry: failedOnce,
        tol: Math.round(ch.tol.L * 1000),
      },
    });
  } else game.flash(false);
  if (my !== gen) return;
  if (correct) {
    streak = failedOnce ? 0 : streak + 1;
    if (streak >= STREAK && ch.level < MAX_LEVEL && levelBtn.hidden) {
      levelBtn.hidden = false;
      labels();
      game.celebrate(game.t('levelUp'));
    }
    pending = setTimeout(newChallenge, 1300);
  } else {
    streak = 0;
    failedOnce = true;
  }
  publish();
}

// ---- input ----
function onTap(hand, e) {
  if (document.querySelector('dialog[open]') || !ch) return;
  tap({ pitch: PITCH[hand] });
  pads[hand].classList.add('th-hit');
  setTimeout(() => pads[hand].classList.remove('th-hit'), 90);
  const nowMs = performance.now();
  const ts = e && e.timeStamp > 0 && Math.abs(nowMs - e.timeStamp) < 250 ? e.timeStamp : nowMs;
  if (!run) {
    if (nowMs < lockUntil) return;
    if (phase === 'idle' || (phase === 'feedback' && failedOnce)) begin('play');
    return;
  }
  if (run.mode !== 'play' || run.turnAt == null) return;
  const at = ts / 1000 + offset - (+game.settings.latency || 0) / 1000 - run.turnAt;
  if (at < -0.45 * ch.q) return; // still the count-in (or the model)
  run.taps[hand].push(at);
  lanes.addTap(hand, at / ch.q);
}

for (const hd of HANDS) {
  pads[hd].addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(hd, e); });
  pads[hd].addEventListener('contextmenu', (e) => e.preventDefault());
}
document.addEventListener('keydown', (e) => {
  const hand = e.code === 'KeyF' ? 'L' : e.code === 'KeyJ' ? 'R' : null;
  if (!hand || e.repeat) return;
  if (e.target.closest?.('button, select, input, a, dialog')) return;
  e.preventDefault();
  onTap(hand, e);
});
listenBtn.onclick = () => {
  if (!ch) return;
  if (run?.mode === 'listen') { stop(); setPhase('idle', '▶'); return; }
  begin('listen');
};
levelBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, level() + 1));

// ---- test hook ----
function publish() {
  const ms = (list) => list.map((s) => Math.round(s * 1000));
  window.__test = {
    phase, level: ch?.level, skill: SKILL, item: ch?.item, bpm: ch?.bpm, streak, demo: !!(ch && (ch.p.always || (ch.p.demo && !demoDone))),
    tol: ch ? Math.round(ch.tol.L * 1000) : null,
    expected: ch ? { L: ms(ch.onsets.L), R: ms(ch.onsets.R) } : { L: [], R: [] },
    turnStart: run && run.turnAt != null ? (run.turnAt - offset) * 1000 + (+game.settings.latency || 0) : null,
    result: lastResult, levelUp: !levelBtn.hidden, label: pads.L.textContent,
    beats: ch?.p.beats, cycles: ch?.p.cycles, len: ch ? Math.round(ch.len * 1000) : null,
  };
}

game.on('settings', () => { streak = 0; levelBtn.hidden = true; lastResult = null; newChallenge(); });
game.on('lang', labels);
newChallenge();
