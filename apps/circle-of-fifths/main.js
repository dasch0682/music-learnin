// Circle of fifths: hear a step round the circle, place the keys, read signatures, find relatives and neighbours.
// Position p on the circle (0 = C at the top, clockwise) is the key whose tonic is 7p semitones above C.
import { createGame } from '@core/shell.js';
import { playChord } from '@core/audio.js';
import { LETTERS, mod, pick, rand, shuffle } from '@core/music.js';
import { renderStaff } from '@core/staff.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const SKILL = 'theory.keys';
const game = createGame({
  id: 'circle-of-fifths',
  title: L('Place the keys', 'Place les tonalités'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    tapNext: L('Tap the next one', 'Touche la suivante'),
    relMinor: L('Relative minor', 'Relatif mineur'),
    relMajor: L('Relative major', 'Relatif majeur'),
    ivOf: L('IV of {k}', 'IV de {k}'),
    vOf: L('V of {k}', 'V de {k}'),
    iiviOf: L('ii–V–I of {k}', 'ii–V–I de {k}'),
    triOf: L('Tritone of {k}', 'Triton de {k}'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, you know the circle!', 'Bravo, tu connais le cycle !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · One step round', '1 · Un pas sur le cycle') },
      { value: 2, label: L('2 · Place the sharp keys', '2 · Place les tonalités à dièses') },
      { value: 3, label: L('3 · Place the flat keys', '3 · Place les tonalités à bémols') },
      { value: 4, label: L('4 · Key signatures', '4 · Armures') },
      { value: 5, label: L('5 · Relative minors', '5 · Relatifs mineurs') },
      { value: 6, label: L('6 · Neighbours and ii–V–I', '6 · Voisines et ii–V–I') },
    ] },
  ],
});
const { h } = game;

// Position p → names. Position 6 is the meeting point of the sharp and the flat side.
const MAJ = [['C'], ['G'], ['D'], ['A'], ['E'], ['B'], ['F♯', 'G♭'], ['D♭'], ['A♭'], ['E♭'], ['B♭'], ['F']];
const MIN = [['A'], ['E'], ['B'], ['F♯'], ['C♯'], ['G♯'], ['D♯', 'E♭'], ['B♭'], ['F'], ['C'], ['G'], ['D']];
const ID_M = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const ID_m = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'Bb', 'F', 'C', 'G', 'D'];
const SHARP_SIDE = [1, 2, 3, 4, 5, 6];
const FLAT_SIDE = [11, 10, 9, 8, 7, 6];

const frName = (en) => LETTERS.fr[LETTERS.en.indexOf(en[0])] + en.slice(1);
const nm = (en) => (game.lang === 'fr' ? frName(en) : en);
const label = (arr, minor) => arr.map(nm).join('/') + (minor ? (game.lang === 'fr' ? ' m' : 'm') : '');
const sigText = (n) => (n === 0 ? '0' : `${Math.abs(n)}${n > 0 ? '♯' : '♭'}`);
const sigItem = (n) => (n > 0 ? '+' + n : String(n));

/** Tonic chord of the key at position p (major outside, minor inside): bass and a close triad. */
function chordOf(p, ring) {
  const r = mod(7 * p + (ring === 'm' ? 9 : 0), 12);
  return [48 + r, 60 + r, 60 + r + (ring === 'm' ? 3 : 4), 60 + r + 7];
}

// --- the circle (SVG) ---
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}, text) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};
const C0 = 160;
const pt = (r, deg) => [C0 + r * Math.sin((deg * Math.PI) / 180), C0 - r * Math.cos((deg * Math.PI) / 180)];
function sector(r1, r2, p) {
  const a = p * 30 - 14.6, b = p * 30 + 14.6;
  const [x1, y1] = pt(r2, a), [x2, y2] = pt(r2, b), [x3, y3] = pt(r1, b), [x4, y4] = pt(r1, a);
  return `M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`;
}
const RINGS = { M: { r1: 105, r2: 152, rl: 128, hit: 19 }, m: { r1: 58, r2: 101, rl: 80, hit: 17 } };
const segs = new Map(); // 'p:M' → <g>
function buildCircle(withInner) {
  const svg = svgEl('svg', { viewBox: '0 0 320 320', class: 'cf-circle', role: 'group' });
  segs.clear();
  for (const ring of withInner ? ['M', 'm'] : ['M']) {
    const R = RINGS[ring];
    for (let p = 0; p < 12; p++) {
      const g = svgEl('g', { class: 'cf-seg cf-' + ring, 'data-pos': p, 'data-ring': ring });
      const [lx, ly] = pt(R.rl, p * 30);
      const names = (ring === 'M' ? MAJ : MIN)[p];
      g.append(svgEl('path', { d: sector(R.r1, R.r2, p) }));
      g.append(svgEl('text', { x: lx, y: ly, class: 'cf-label' + (names.length > 1 ? ' cf-two' : '') }, ''));
      g.append(svgEl('circle', { cx: lx, cy: ly, r: R.hit, class: 'cf-hit' }));
      g.addEventListener('click', () => tap(p, ring));
      svg.append(g);
      segs.set(p + ':' + ring, g);
    }
  }
  return svg;
}
function setLabel(key, text) {
  const g = segs.get(key);
  g.querySelector('.cf-label').textContent = text;
  g.classList.add('cf-named');
}
function allLabels(ring) {
  for (let p = 0; p < 12; p++) setLabel(p + ':' + ring, label(ring === 'M' ? MAJ[p] : MIN[p], ring === 'm'));
}
function nameOfKey(key) {
  const [p, ring] = key.split(':');
  return label(ring === 'M' ? MAJ[p] : MIN[p], ring === 'm');
}

// --- the screen ---
let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0;
let circleEl = null;
const replay = h('button', { className: 'ml-round', innerHTML: '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>' });
const prompt = h('p', { className: 'ml-prompt cf-prompt' });
const staffBox = h('div', { className: 'cf-staff' });
const circleBox = h('div', { className: 'cf-circlebox' });
const choices = h('div', { className: 'cf-choices' });
const nextBtn = h('button', { className: 'ml-btn ml-primary cf-next' });
replay.onclick = () => hear();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

const test = { chord: null };
window.__test = { state: () => (q ? { level: q.level, item: q.item, mode: q.mode, steps: q.steps, idx: q.idx, n: q.n, choices: q.choices, answer: q.answer, chord: test.chord, hear: q.hear } : {}) };

function sound(midis, when = 0, dur = 1.1) {
  test.chord = midis;
  playChord(midis, { when, dur, gain: 0.34 });
}
function hear() {
  if (!q?.hear) return;
  const now = performance.now();
  if (now < quietUntil - 150) return;
  q.hear.forEach((c, i) => playChord(c, { when: i * 0.9, dur: 1.2, gain: 0.34 }));
  quietUntil = now + q.hear.length * 900 + 600;
}

function draw() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  replay.style.display = q.hear ? '' : 'none';
  prompt.textContent = q.prompt();
  prompt.style.display = q.prompt() ? '' : 'none';
  staffBox.style.display = q.mode === 'toKey' ? '' : 'none';
  if (q.mode === 'toKey') renderStaff(staffBox, { clef: 'treble', keySig: q.n, notes: [], width: 230, gap: 9 });
  // labels follow the language
  for (const [key, g] of segs) if (g.classList.contains('cf-named')) g.querySelector('.cf-label').textContent = q.names?.[key] ? q.names[key]() : nameOfKey(key);
  if (q.choices) {
    choices.replaceChildren(...q.choices.map((n) => {
      const b = h('button', { className: 'ml-btn', textContent: sigText(n) });
      b.dataset.v = n;
      b.onclick = () => answerChoice(n, b);
      return b;
    }));
  } else choices.replaceChildren();
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const mastery = (items) => pickWeak(items, stats, { avoid: last });
  let item;
  q = { level, steps: [], idx: 0, names: {}, hear: null, choices: null, mode: 'tap', n: 0, prompt: () => '' };
  circleEl = buildCircle(level === 5);
  circleBox.replaceChildren(circleEl);
  circleBox.style.display = '';
  const reveal = {};
  if (level === 1) {
    item = mastery(ID_M.map((k) => 'next:' + k));
    const t = ID_M.indexOf(item.slice(5)), p = mod(t - 2, 12);
    q.steps = [[t + ':M']];
    q.hear = [chordOf(p, 'M'), chordOf(mod(p + 1, 12), 'M')];
    segs.get(p + ':M').classList.add('cf-given');
    segs.get(mod(p + 1, 12) + ':M').classList.add('cf-given');
    q.prompt = () => game.t('tapNext');
  } else if (level === 2 || level === 3) {
    const pool = (level === 2 ? SHARP_SIDE : FLAT_SIDE);
    // Flat names at position 6 are asked as G♭.
    const ids = pool.map((p) => (level === 3 && p === 6 ? 'Gb' : ID_M[p]));
    item = mastery(ids.map((k) => 'place:' + k));
    const id = item.slice(6), p = id === 'Gb' ? 6 : ID_M.indexOf(id);
    const en = id === 'Gb' ? 'G♭' : MAJ[p][0];
    q.steps = [[p + ':M']];
    q.prompt = () => nm(en);
    q.names[p + ':M'] = () => nm(en);
    reveal.fixed = { '0:M': true };
  } else if (level === 4) {
    item = mastery(Array.from({ length: 13 }, (_, i) => 'sig:' + sigItem(i - 6)));
    const n = +item.slice(4);
    q.n = n;
    if (rand(2)) {
      q.mode = 'toKey';
      q.steps = [[mod(n, 12) + ':M']];
      q.names = {};
      circleBox.style.display = '';
      reveal.all = 'M';
    } else {
      q.mode = 'toSig';
      const others = shuffle([-3, -2, -1, 1, 2, 3].map((d) => n + d).filter((v) => v >= -6 && v <= 6)).slice(0, 3);
      q.choices = [n, ...others].sort((a, b) => a - b);
      q.answer = n;
      circleBox.style.display = 'none';
      const en = n === 6 ? 'F♯' : n === -6 ? 'G♭' : MAJ[mod(n, 12)][0];
      q.prompt = () => nm(en);
    }
  } else if (level === 5) {
    item = mastery(ID_m.map((k) => 'rel:' + k));
    const p = ID_m.indexOf(item.slice(4));
    if (rand(2)) {
      q.mode = 'toMinor';
      q.steps = [[p + ':m']];
      q.prompt = () => game.t('relMinor');
      segs.get(p + ':M').classList.add('cf-given');
      reveal.fixed = { [p + ':M']: true };
    } else {
      q.mode = 'toMajor';
      q.steps = [[p + ':M']];
      q.prompt = () => game.t('relMajor');
      segs.get(p + ':m').classList.add('cf-given');
      reveal.fixed = { [p + ':m']: true };
    }
  } else {
    const types = ['IV', 'V', 'iiVI', 'tritone'];
    item = mastery(types.flatMap((t) => ID_M.map((k) => t + ':' + k)));
    const [type, id] = item.split(':');
    const p = ID_M.indexOf(id);
    q.mode = type;
    const key = (d) => mod(p + d, 12) + ':M';
    q.steps = type === 'IV' ? [[key(-1)]] : type === 'V' ? [[key(1)]] : type === 'tritone' ? [[key(6)]] : [[key(2)], [key(1)], [key(0)]];
    const en = MAJ[p][0];
    q.prompt = () => game.t({ IV: 'ivOf', V: 'vOf', iiVI: 'iiviOf', tritone: 'triOf' }[type], { k: nm(en) });
    q.names[p + ':M'] = () => nm(en);
    reveal.fixed = { [p + ':M']: true };
    segs.get(p + ':M').classList.add('cf-given');
  }
  q.item = item;
  last = item;
  if (reveal.all) allLabels(reveal.all);
  if (reveal.fixed) for (const k of Object.keys(reveal.fixed)) setLabel(k, q.names[k] ? q.names[k]() : nameOfKey(k));
  q.reveal = reveal;
  missed = false;
  locked = false;
  draw();
  quietUntil = 0;
  hear();
  started = performance.now();
}

function log(correct, detail) {
  return game.attempt({ skill: SKILL, correct, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: detail ?? (q.mode === 'tap' ? null : q.mode) });
}
function won() {
  locked = true;
  clearTimeout(timer);
  const rec = !missed;
  if (rec) {
    streak++;
    if (streak >= 8) {
      if (q.level < MAX_LEVEL) nextBtn.classList.add('cf-show');
      else if (streak === 8) game.celebrate(game.t('top'));
    }
    log(true);
  } else game.flash(true);
  timer = setTimeout(next, 1100);
}
async function wrong(detail) {
  streak = 0;
  nextBtn.classList.remove('cf-show');
  if (missed) game.flash(false);
  else { missed = true; await log(false, detail); }
}

function tap(p, ring) {
  sound(chordOf(p, ring));
  if (!q || locked || q.mode === 'toSig') return;
  const key = p + ':' + ring, g = segs.get(key);
  if (g.classList.contains('cf-wrong') || g.classList.contains('cf-found')) return;
  if (q.steps[q.idx].includes(key)) {
    g.classList.add('cf-found');
    setLabel(key, nameOfKey(key));
    q.names[key] = null;
    q.idx++;
    if (q.idx === q.steps.length) won();
  } else {
    g.classList.add('cf-wrong');
    wrong(key);
    if (q.steps.length > 1 && q.idx > 0) {
      // A sequence starts again from the beginning.
      const marked = [...segs.values()].filter((s) => s.classList.contains('cf-found') || s.classList.contains('cf-wrong'));
      timer = setTimeout(() => { marked.forEach((s) => { s.classList.remove('cf-found', 'cf-wrong'); }); q.idx = 0; }, 600);
    } else if (q.steps.length > 1) timer = setTimeout(() => g.classList.remove('cf-wrong'), 600);
  }
}

function answerChoice(n, button) {
  if (locked || button.disabled) return;
  if (n === q.answer) {
    button.classList.add('ml-right');
    won();
  } else {
    button.classList.add('ml-wrong');
    button.disabled = true;
    wrong(sigItem(n));
  }
}

game.ready().then(() => {
  game.stage.replaceChildren(replay, prompt, staffBox, circleBox, choices, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('cf-show'); next(); });
  game.on('lang', draw);
  next();
});
