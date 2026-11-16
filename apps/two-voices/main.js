// Two voices: hear a melody over a bass, the first note of each is written, enter the others on the keyboard.
import { createGame } from '@core/shell.js';
import { renderStaff } from '@core/staff.js';
import { createKeyboard } from '@core/keyboard.js';
import { playNote } from '@core/audio.js';
import { spell, mod, pick, rand } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const SKILL = 'listen.twovoices', MAX_LEVEL = 6, CLEAN = 6;
const game = createGame({
  id: 'two-voices',
  title: L('Two voices', 'Deux voix'),
  strings: {
    both: L('Both voices', 'Les deux voix'),
    topOnly: L('Top voice only', 'Voix du haut seule'),
    bottomOnly: L('Bass only', 'Basse seule'),
    undo: L('Undo', 'Annuler'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
    staffTop: L('Treble staff', 'Portée du haut'),
    staffBottom: L('Bass staff', 'Portée de la basse'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · A held bass note', '1 · Une basse tenue') },
      { value: 2, label: L('2 · Bass: tonic and fifth', '2 · Basse : tonique et quinte') },
      { value: 3, label: L('3 · Parallel thirds and sixths', '3 · Tierces et sixtes parallèles') },
      { value: 4, label: L('4 · Contrary motion', '4 · Mouvement contraire') },
      { value: 5, label: L('5 · I–IV–V–I bass', '5 · Basse I–IV–V–I') },
      { value: 6, label: L('6 · Minor, a suspension', '6 · Mineur, un retard') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 100, step: 5, default: 70 },
  ],
});

// ---------- keys ----------
const NAT = [0, 2, 4, 5, 7, 9, 11];
const MAJOR = [0, 2, 4, 5, 7, 9, 11], HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const KEYS = {
  C: { tonic: 0, letter: 0, sig: 0 }, G: { tonic: 7, letter: 4, sig: 1 }, F: { tonic: 5, letter: 3, sig: -1 },
  Am: { tonic: 9, letter: 5, sig: 0, minor: true }, Em: { tonic: 4, letter: 2, sig: 1, minor: true }, Dm: { tonic: 2, letter: 1, sig: -1, minor: true },
};
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6], FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const keyAcc = (sig, letter) => (sig > 0 && SHARP_ORDER.indexOf(letter) < sig ? 1 : sig < 0 && FLAT_ORDER.indexOf(letter) < -sig ? -1 : 0);
const scaleOf = (key) => (key.minor ? HARMONIC : MAJOR);
/** Pitch class → { letter, acc } for the degrees of the key. */
function scaleSpelling(key) {
  const out = new Map();
  scaleOf(key).forEach((iv, k) => {
    const letter = (key.letter + k) % 7, pc = mod(key.tonic + iv, 12);
    out.set(pc, { letter, acc: mod(pc - NAT[letter] + 6, 12) - 6 });
  });
  return out;
}
function headOf(midi, letter, acc, sig, color) {
  const oct = Math.floor((midi - acc) / 12) - 1;
  const note = { midi, spell: [{ step: oct * 7 + letter, acc }] };
  const ka = keyAcc(sig, letter);
  if (acc === ka) note.acc = false;
  else if (acc === 0) note.acc = 'natural';
  if (color) note.color = color;
  return note;
}

// ---------- ranges and degrees ----------
const RANGE = { top: [60, 79], bottom: [43, 62] };
/** Degree d (0 = tonic just above A3, 7 = the octave above…) of a key as MIDI. */
const tonicOf = (key) => 57 + mod(key.tonic - 57, 12);
const degMidi = (key, d) => tonicOf(key) + 12 * Math.floor(d / 7) + scaleOf(key)[mod(d, 7)];
const inRange = (voice, m) => m >= RANGE[voice][0] && m <= RANGE[voice][1];
const CONS = [0, 3, 4, 7, 8, 9];
const perfect = (s) => mod(s, 12) === 0 || mod(s, 12) === 7;

/** Common checks on two lines of degrees: ranges, top above bottom, consonant verticals (except where allowed), no parallel perfects. */
function sound(key, top, bottom, free = []) {
  const T = top.map((d) => degMidi(key, d)), B = bottom.map((d) => degMidi(key, d));
  if (!T.every((m) => inRange('top', m)) || !B.every((m) => inRange('bottom', m))) return null;
  for (let i = 0; i < T.length; i++) {
    const s = T[i] - B[i];
    if (s < 3) return null;
    if (!free.includes(i) && !CONS.includes(mod(s, 12))) return null;
    if (i && perfect(s) && perfect(T[i - 1] - B[i - 1]) && mod(s, 12) === mod(T[i - 1] - B[i - 1], 12) && T[i] !== T[i - 1] && B[i] !== B[i - 1]
      && Math.sign(T[i] - T[i - 1]) === Math.sign(B[i] - B[i - 1])) return null;
  }
  return { T, B };
}
const cls = (d) => mod(d, 7);
const steps = (a) => a.every((d, i) => !i || (Math.abs(d - a[i - 1]) >= 1 && Math.abs(d - a[i - 1]) <= 2));

// ---------- textures ----------
const KEYSETS = { 1: ['C'], 2: ['C', 'G'], 3: ['C', 'G', 'F'], 4: ['C', 'G', 'F'], 5: ['C', 'G', 'F'], 6: ['Am', 'Em', 'Dm'] };
const TEXTURE = { 1: 'drone', 2: 'tonic-fifth', 3: 'parallel', 4: 'contrary', 5: 'cadence', 6: 'suspension' };
const CHORD = { I: [0, 2, 4], IV: [3, 5, 0], V: [4, 6, 1] };

function attempt(level, key) {
  const walk = (start, n, ok) => { const a = [start]; for (let i = 1; i < n; i++) a.push(a[i - 1] + pick([-2, -1, 1, 2])); return ok(a) ? a : null; };
  if (level === 1) {
    const n = 3;
    const top = walk(rand(8), n, (a) => steps(a) && a.every((d) => d >= 0 && d <= 8) && [0, 4, 7].includes(a[n - 1]) && new Set(a).size === n);
    return top && { n, top, bottom: Array(n).fill(-7), tag: 'drone' };
  }
  if (level === 2) {
    const n = pick([3, 5]);
    const bottom = Array.from({ length: n }, (_, i) => (i % 2 ? -3 : -7));
    const top = [];
    for (let i = 0; i < n; i++) top.push(pick(CHORD[i % 2 ? 'V' : 'I'].flatMap((c) => [c, c + 7])));
    if (!steps(top) || top.some((d) => d < 0 || d > 9) || cls(top[n - 1]) !== 0) return null;
    return { n, top, bottom, tag: 'tonic-fifth' };
  }
  if (level === 3) {
    const n = pick([4, 5]), gap = pick([2, 5]);
    const top = walk(rand(10), n, (a) => a.every((d, i) => !i || Math.abs(d - a[i - 1]) === 1) && [0, 2, 4].includes(cls(a[n - 1])));
    return top && { n, top, bottom: top.map((d) => d - gap), tag: gap === 2 ? 'thirds' : 'sixths' };
  }
  if (level === 4) {
    const n = pick([4, 5]);
    const top = [rand(10)], bottom = [-7 - 1 + rand(4)];
    for (let i = 1; i < n; i++) {
      const dir = pick([-1, 1]), a = pick([1, 2]), b = pick([1, 2]);
      top.push(top[i - 1] + dir * a); bottom.push(bottom[i - 1] - dir * b);
    }
    if (cls(bottom[n - 1]) !== 0 || ![0, 2].includes(cls(top[n - 1])) || new Set(top).size < 3) return null;
    return { n, top, bottom, tag: 'contrary' };
  }
  if (level === 5) {
    const bottom = [-7, -4, -3, -7], chords = ['I', 'IV', 'V', 'I'];
    const top = chords.map((c) => pick(CHORD[c].flatMap((x) => [x, x + 7])));
    if (!steps(top) || cls(top[3]) !== 0 || top.some((d) => d < 0 || d > 9)) return null;
    if (cls(top[2]) === 6 && top[3] !== top[2] + 1) return null;
    if (new Set(top).size < 3) return null;
    return { n: 4, top, bottom, tag: 'cadence' };
  }
  // 6: minor, five notes, one suspension (4-3 or 7-6)
  const kind = pick(['43', '76']);
  const b0 = (kind === '43' ? -6 : -4) + rand(5), m0 = kind === '43' ? 3 + rand(6) : 8 + rand(5);
  const top = kind === '43' ? [m0, 7, 7, 6, 7] : [m0, 10, 10, 9, 7];
  const bottom = kind === '43' ? [b0, -4, -3, -3, -7] : [b0, -2, -3, -3, -7];
  if (Math.abs(top[1] - m0) > 2 || Math.abs(bottom[1] - b0) > 2 || m0 === top[1] || cls(m0) === 6 || cls(b0) === 6) return null;
  return { n: 5, top, bottom, tag: kind === '43' ? 'four-three' : 'seven-six', free: [2] };
}

function makeQuestion(level) {
  for (let t = 0; t < 20000; t++) {
    const key = KEYS[pick(KEYSETS[level])];
    const c = attempt(level, key);
    if (!c) continue;
    const ok = sound(key, c.top, c.bottom, c.free || []);
    if (!ok) continue;
    const sp = scaleSpelling(key);
    const note = (m) => ({ midi: m, ...sp.get(mod(m, 12)) });
    return { key, level, item: TEXTURE[level], tag: c.tag, n: c.n, top: ok.T.map(note), bottom: ok.B.map(note) };
  }
  throw new Error('no question');
}

// ---------- screen ----------
const ICON = (top, bottom) => `<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true">${[14, 28, 42].map((x) => `<circle cx="${x}" cy="20" r="5" opacity="${top ? 1 : 0.25}"/>`).join('')}${[14, 28, 42].map((x) => `<circle cx="${x}" cy="44" r="5" opacity="${bottom ? 1 : 0.25}"/>`).join('')}<path d="M50 24v16l10-8z" opacity="0.9"/></svg>`;
const UNDO = '<svg viewBox="0 0 64 64" width="28" height="28" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 14 8 28l14 14"/><path d="M8 28h30a16 16 0 0 1 0 32H24"/></svg>';
const mkStaff = (voice) => { const b = game.h('div', { className: 'tv-staff', tabIndex: 0 }); b.dataset.voice = voice; b.setAttribute('role', 'button'); b.onclick = () => select(voice); return b; };
const staffEl = { top: mkStaff('top'), bottom: mkStaff('bottom') };
const staffSvg = { top: game.h('div', { className: 'tv-svg' }), bottom: game.h('div', { className: 'tv-svg' }) };
const dotsEl = { top: game.h('div', { className: 'tv-dots' }), bottom: game.h('div', { className: 'tv-dots' }) };
for (const v of ['top', 'bottom']) staffEl[v].append(staffSvg[v], dotsEl[v]);
const kbBox = game.h('div', { className: 'tv-kb' });
const btnBoth = game.h('button', { className: 'ml-round', innerHTML: ICON(1, 1) });
const btnTop = game.h('button', { className: 'ml-round', innerHTML: ICON(1, 0) });
const btnBottom = game.h('button', { className: 'ml-round', innerHTML: ICON(0, 1) });
const undo = game.h('button', { className: 'tv-undo', innerHTML: UNDO });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary tv-next' });
btnBoth.onclick = () => play('both'); btnTop.onclick = () => play('top'); btnBottom.onclick = () => play('bottom');
undo.onclick = () => back();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

let q = null, entered = { top: [], bottom: [] }, marks = null, active = 'top', started = 0, streak = 0, missed = false, locked = true, seq = 0, timer = 0, quietUntil = 0, kb = null, kbKey = '';
const done = (v) => entered[v].length >= q.n - 1;

function headFor(v, midi, i, color) {
  const target = q[v][i + 1], sig = q.key.sig;
  if (target && target.midi === midi) return headOf(midi, target.letter, target.acc, sig, color);
  const sc = scaleSpelling(q.key).get(mod(midi, 12));
  if (sc) return headOf(midi, sc.letter, sc.acc, sig, color);
  const prev = i === 0 ? q[v][0].midi : entered[v][i - 1];
  const sp = spell(midi, midi > prev ? 'sharp' : 'flat');
  return headOf(midi, sp.letter, sp.acc, sig, color);
}
function drawStaff(v) {
  const first = q[v][0];
  const colour = (i) => (marks ? (marks[v][i] ? 'var(--good)' : 'var(--bad)') : undefined);
  const heads = [headOf(first.midi, first.letter, first.acc, q.key.sig), ...entered[v].map((m, i) => headFor(v, m, i, colour(i)))];
  const real = heads.length;
  // Invisible heads keep both staves aligned and the spacing steady while the notes are entered.
  while (heads.length < q.n) heads.push({ midi: v === 'top' ? 71 : 50, color: 'transparent' });
  const svg = renderStaff(staffSvg[v], { clef: v === 'top' ? 'treble' : 'bass', keySig: q.key.sig, notes: heads, width: 340, gap: 10 });
  svg.querySelectorAll('.ml-note').forEach((g) => { if (+g.dataset.index >= real) g.remove(); });
  dotsEl[v].replaceChildren(...q[v].slice(1).map((_, i) => game.h('span', { className: 'tv-dot' + (i < entered[v].length ? (marks ? (marks[v][i] ? ' tv-ok' : ' tv-bad') : ' tv-on') : '') })));
  staffEl[v].classList.toggle('tv-active', active === v);
  staffEl[v].setAttribute('aria-label', game.t(v === 'top' ? 'staffTop' : 'staffBottom'));
}
function drawKeyboard() {
  const key = [active, game.lang].join();
  if (key === kbKey) return;
  kbKey = key;
  kb = createKeyboard(kbBox, { from: RANGE[active][0], to: RANGE[active][1], onDown: press });
}
function render() {
  if (!q) return;
  btnBoth.setAttribute('aria-label', game.t('both'));
  btnTop.setAttribute('aria-label', game.t('topOnly'));
  btnBottom.setAttribute('aria-label', game.t('bottomOnly'));
  undo.setAttribute('aria-label', game.t('undo'));
  nextBtn.textContent = game.t('next');
  drawKeyboard();
  drawStaff('top'); drawStaff('bottom');
  undo.disabled = locked || !(entered.top.length + entered.bottom.length);
}

function play(which) {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return;
  const beat = 60 / (+game.settings.tempo || 70);
  const last = q.n - 1;
  for (const v of ['top', 'bottom']) {
    if (which !== 'both' && which !== v) continue;
    q[v].forEach((nt, i) => playNote(nt.midi, { when: 0.05 + i * beat, dur: (i === last ? 1.8 : 0.95) * beat, gain: v === 'top' ? 0.3 : 0.34, timbre: v === 'top' ? 'piano' : 'bass' }));
  }
  quietUntil = now + (q.n + 1.2) * beat * 1000;
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  locked = true;
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  let stats = null;
  try { stats = await loadItemMastery(SKILL); } catch { /* plain random */ }
  if (id !== seq) return;
  const item = pickWeak([TEXTURE[level]], stats);
  q = makeQuestion(level);
  q.item = item;
  entered = { top: [], bottom: [] }; marks = null; missed = false; locked = false; active = 'top';
  render();
  quietUntil = 0;
  play('both');
  started = performance.now();
}

function select(v) {
  if (!q || locked || v === active) return;
  active = v;
  render();
}
function trim() {
  if (!marks) return;
  for (const v of ['top', 'bottom']) { const k = marks[v].indexOf(false); if (k >= 0) { entered[v] = entered[v].slice(0, k); active = v; } }
  marks = null;
}
function press(midi) {
  if (!q || locked) return;
  clearTimeout(timer);
  trim();
  if (done(active)) { render(); return; }
  entered[active].push(midi);
  if (done(active) && !done(active === 'top' ? 'bottom' : 'top')) active = active === 'top' ? 'bottom' : 'top';
  if (done('top') && done('bottom')) {
    locked = true;
    const cur = q;
    timer = setTimeout(() => cur === q && check(), 500);
  }
  render();
}
function back() {
  if (!q || locked) return;
  clearTimeout(timer);
  if (marks) trim(); else {
    if (!entered[active].length) active = active === 'top' ? 'bottom' : 'top';
    entered[active].pop();
  }
  render();
}

async function check() {
  marks = { top: entered.top.map((m, i) => m === q.top[i + 1].midi), bottom: entered.bottom.map((m, i) => m === q.bottom[i + 1].midi) };
  const ok = [...marks.top, ...marks.bottom].every(Boolean);
  const cur = q;
  render();
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : { top: entered.top, bottom: entered.bottom } };
  if (ok) {
    if (missed) game.flash(true);
    else {
      streak++;
      if (streak >= CLEAN) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('tv-show');
        else if (streak === CLEAN) game.say(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 1400);
  } else {
    streak = 0;
    nextBtn.classList.remove('tv-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    if (cur !== q) return;
    locked = false;
    active = marks.top.includes(false) ? 'top' : 'bottom';
    render();
    timer = setTimeout(() => { if (cur === q) { quietUntil = 0; play('both'); } }, 900);
  }
}

window.__test = { sample: (level, k) => Array.from({ length: k }, () => { const x = makeQuestion(level); return x.tag + ':' + Object.keys(KEYS).find((n) => KEYS[n] === x.key); }), state: () => ({
  level: q?.level, item: q?.item, tag: q?.tag, n: q?.n, key: q && Object.keys(KEYS).find((k) => KEYS[k] === q.key), sig: q?.key.sig,
  top: q?.top.map((n) => n.midi), bottom: q?.bottom.map((n) => n.midi), spellTop: q?.top.map((n) => [n.letter, n.acc]), spellBottom: q?.bottom.map((n) => [n.letter, n.acc]),
  entered: { top: [...entered.top], bottom: [...entered.bottom] }, marks, active, locked, ranges: RANGE,
}) };

game.ready().then(() => {
  game.stage.replaceChildren(staffEl.top, staffEl.bottom, kbBox, game.h('div', { className: 'tv-row' }, btnBoth, btnTop, btnBottom, undo), nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('tv-show'); next(); });
  game.on('lang', () => { kbKey = ''; render(); });
  next();
});
