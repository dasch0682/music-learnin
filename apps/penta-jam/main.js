// Five-note jam: improvise on pentatonic pads over a generated backing track.
// The same five notes come back at every level, from free play to jazz and "outside" playing.
import { createGame } from '@core/shell.js';
import { audio, playNote } from '@core/audio.js';
import { noteName, mod, pick, CHORDS } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import { createBacking } from './engine.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'penta-jam',
  title: L('Play with 5 notes', 'Joue avec 5 notes'),
  strings: {
    h1: L('Play! Every note sounds good.', 'Joue ! Toutes les notes sonnent bien.'),
    listen: L('Listen…', 'Écoute…'),
    home: L('Your turn. Finish on the dot.', 'À toi. Finis sur le point.'),
    open: L('Your turn. Finish on the ring.', 'À toi. Finis sur l’anneau.'),
    h3: L('On beat one, play a glowing pad.', 'Sur le premier temps, joue une touche qui brille.'),
    ht: L('Striped pad on the tense chord. When home returns, step next to it.', 'Touche rayée sur l’accord tendu. Au retour du premier accord, joue la touche voisine.'),
    h5: L('New chord: glowing pad. Round pad: just passing.', 'Nouvel accord : touche qui brille. Touche ronde : en passant.'),
    h6: L('Play with one colour, then another.', 'Joue avec une couleur, puis une autre.'),
    h7: L('Beat one: land on a glowing pad.', 'Premier temps : arrive sur une touche qui brille.'),
    h8: L('Hold the button to step outside, then come back.', 'Maintiens le bouton pour sortir, puis reviens.'),
    hold: L('Outside', 'Dehors'),
    next: L('Next level →', 'Niveau suivant →'),
    play: L('Play', 'Jouer'),
    pause: L('Pause', 'Pause'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Free play', '1 · Jeu libre') },
      { value: 2, label: L('2 · Question and answer', '2 · Question et réponse') },
      { value: 3, label: L('3 · Three chords', '3 · Trois accords') },
      { value: 4, label: L('4 · Other keys, minor colour', '4 · Autres tonalités, couleur mineure') },
      { value: 5, label: L('5 · Tension and release', '5 · Tension et détente') },
      { value: 6, label: L('6 · Blues', '6 · Blues') },
      { value: 7, label: L('7 · Modal colours', '7 · Couleurs modales') },
      { value: 8, label: L('8 · Jazz: ii–V–I', '8 · Jazz : ii–V–I') },
      { value: 9, label: L('9 · Playing outside', '9 · Jouer « outside »') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 50, max: 140, step: 5, default: 80 },
    { key: 'names', label: L('Note names on pads', 'Nom des notes sur les touches'), type: 'toggle', default: false },
  ],
});
const h = game.h;
const MAX_LEVEL = 9;

// ---------- Music data ----------
const PCS = { C: 0, D: 2, 'E♭': 3, E: 4, F: 5, G: 7, A: 9, 'B♭': 10, B: 11 };
const fold = (m, lo) => lo + mod(m - lo, 12);
const pc = (m) => mod(m, 12);
function chord(name, type, voicing) {
  const root = PCS[name];
  const steps = CHORDS[type].steps;
  return {
    sym: name + CHORDS[type].symbol,
    pcs: steps.map((s) => mod(root + s, 12)),
    bass: fold(root, 36),
    voicing: voicing || steps.map((s) => fold(root + s, 52)).sort((a, b) => a - b),
  };
}
/** One bar: chord, pads, chord tones that exist on the pads, guide tones (3rd / 7th). */
function bar(ch, pads, { guides = [], name = null, walk = null } = {}) {
  const padPcs = pads.map(pc);
  return { ch, pads, tones: ch.pcs.filter((p) => padPcs.includes(p)), guides, name, walk };
}
const PADS = {
  C: [60, 62, 64, 67, 69, 72],        // C major pentatonic
  Am: [57, 60, 62, 64, 67, 69],       // same notes from A = A minor pentatonic
  G: [55, 57, 59, 62, 64, 67],
  F: [53, 55, 57, 60, 62, 65],
  Dm: [62, 65, 67, 69, 72, 74],
  Em: [64, 67, 69, 71, 74, 76],
  blues: [57, 60, 62, 63, 64, 67, 69], // A minor pentatonic + E♭
  GfromD: [62, 64, 67, 69, 71, 74],    // G major / E minor pentatonic laid out from D
};
const SETS = [
  { id: 'Dm', pads: PADS.Dm, label: L('D minor', 'Ré mineur') },
  { id: 'Em', pads: PADS.Em, label: L('E minor', 'Mi mineur') },
  { id: 'Am', pads: PADS.Am, label: L('A minor', 'La mineur') },
];
const NAMES = {
  Dm: L('D minor pentatonic', 'Pentatonique mineure de ré'),
  Ebm: L('E♭ minor pentatonic', 'Pentatonique mineure de mi♭'),
  G: L('G major pentatonic', 'Pentatonique majeure de sol'),
  Em: L('E minor pentatonic', 'Pentatonique mineure de mi'),
};
const prog = (names, pads) => names.map(([n, t]) => bar(chord(n, t), pads));
const PROGS4 = [
  { item: 'Am:i-VI-III-VII', bars: prog([['A', 'min'], ['F', 'maj'], ['C', 'maj'], ['G', 'maj']], PADS.Am) },
  { item: 'G:I-IV-V-I', bars: prog([['G', 'maj'], ['C', 'maj'], ['D', 'maj'], ['G', 'maj']], PADS.G) },
  { item: 'Dm:i-VI-III-VII', bars: prog([['D', 'min'], ['B♭', 'maj'], ['F', 'maj'], ['C', 'maj']], PADS.Dm) },
  { item: 'F:I-IV-V-I', bars: prog([['F', 'maj'], ['B♭', 'maj'], ['C', 'maj'], ['F', 'maj']], PADS.F) },
];
const BLUES = [
  { item: 'line1', names: ['A', 'A', 'A', 'A'], changes: [0] },
  { item: 'line2', names: ['D', 'D', 'A', 'A'], changes: [0, 2] },
  { item: 'line3', names: ['E', 'D', 'A', 'E'], changes: [0, 1, 2, 3] },
].map((l) => ({ ...l, bars: prog(l.names.map((n) => [n, 'dom7']), PADS.blues) }));
const JAZZ = [
  bar(chord('D', 'min7', [53, 60, 64]), PADS.Dm, { guides: [5, 0], name: NAMES.Dm, walk: [38, 41, 45, 44] }),
  bar(chord('G', 'dom7', [53, 59, 64]), PADS.GfromD, { guides: [11], name: NAMES.G, walk: [43, 47, 50, 49] }),
  bar(chord('C', 'maj7', [52, 59, 62]), PADS.GfromD, { guides: [4, 11], name: NAMES.Em, walk: [48, 52, 55, 57] }),
  bar(chord('C', 'maj7', [52, 59, 62]), PADS.GfromD, { guides: [4, 11], name: NAMES.Em, walk: [48, 47, 45, 39] }),
];
const DM7 = chord('D', 'min7', [53, 57, 60, 64]);
const G7 = chord('G', 'dom7', [53, 55, 59, 62]);
const C = chord('C', 'maj');
// Tension and release: one extra pad (the fourth, then the seventh) outside the five notes.
const EXTRA = { '4th': 65, '7th': 71 };
const TENSION_STAGES = [['4th:I-V-I-V'], ['7th:I-V-I-V'], ['4th:I-IV-V-I', '7th:I-IV-V-I']];
const TENSION_BARS = { 'I-V-I-V': [['C', 'maj'], ['G', 'maj'], ['C', 'maj'], ['G', 'maj']], 'I-IV-V-I': [['C', 'maj'], ['F', 'maj'], ['G', 'maj'], ['C', 'maj']] };
const TENSION_GOAL = { 'I-V-I-V': { tens: [1, 3], res: [2] }, 'I-IV-V-I': { tens: [2], res: [3] } };
function tensionSpec(item) {
  const [x, form] = item.split(':');
  const xm = EXTRA[x];
  const pads = [...PADS.C, xm].sort((a, b) => a - b);
  const i = pads.indexOf(xm);
  // Release: a neighbouring pad that belongs to the home chord.
  const resMidis = [pads[i - 1], pads[i + 1]].filter((m) => m != null && [0, 4, 7].includes(pc(m)));
  // tones come from the five notes only: the extra pad never glows.
  const bars = TENSION_BARS[form].map(([n, t]) => ({ ...bar(chord(n, t), PADS.C), pads, extra: pc(xm) }));
  return { item, xm, resMidis, ...TENSION_GOAL[form], bars };
}
const rep = (n, x) => Array.from({ length: n }, () => x);

// ---------- State ----------
const st = {
  running: false, paused: false, level: 0, tempo: 0, lv: null, ctx: null, bus: null, timer: 0,
  t0: 0, spb: 1, step: 0, ui: [], pending: [], specs: new Map(), taps: [],
  cur: null, shown: null, notes: [], set: 'Dm', outside: false, phase: '', lastTap: 0,
  recent: [], homeWins: 0, stats: new Map(), lastItem: null, canLevelUp: false, results: [],
};
const lat = () => Math.min(0.25, st.ctx?.outputLatency || st.ctx?.baseLatency || 0);
/** Position of "now" in beats since bar 0, as the player hears it. */
const posNow = () => (st.running ? (st.ctx.currentTime - lat() - st.t0) / st.spb : 0);

// ---------- Judging helpers ----------
const win = () => ({ a: Math.max(0.3, 0.15 / st.spb), b: Math.max(0.45, 0.22 / st.spb) });
const tapsIn = (a, b) => st.taps.filter((x) => x.p >= a && x.p < b);
/** A note of `pcs` played on beat B (within tolerance), or held across it. */
const landed = (B, pcs) => landedBy(B, (x) => pcs.includes(pc(x.midi)));
function landedBy(B, test) {
  const { a, b } = win();
  return st.taps.some((x) => test(x) && !x.outside
    && ((x.p >= B - a && x.p <= B + b) || (x.p < B - a && (x.up == null || x.up > B))));
}
const dots = (n, on) => Array.from({ length: n }, (_, i) => ({ kind: 'dot', on: i < on }));
function evalBars(spec) {
  const hits = spec.bars.map((b, i) => landed(spec.start + 4 * i, b.tones));
  const guides = spec.bars.filter((b, i) => b.guides.length && landed(spec.start + 4 * i, b.guides)).length;
  const n = hits.filter(Boolean).length;
  return { n: tapsIn(spec.start - 0.5, spec.end - 0.5).length, ok: n >= 3, chips: hits.map((on) => ({ kind: 'dot', on })), detail: { hits: hits.map(Number), guides } };
}

// ---------- Levels ----------
const QUESTION_RHYTHMS = [[0, 2, 4, 6, 8], [0, 2, 3, 4, 8], [0, 1, 2, 4, 6, 8], [0, 3, 4, 6, 8], [0, 2, 4, 5, 6, 8]];
function makeQuestion(open) {
  const steps = pick(QUESTION_RHYTHMS);
  let i = pick([0, 2, 3]);
  const idx = steps.map(() => { const c = i; i = Math.max(0, Math.min(5, i + pick([-2, -1, -1, 1, 1, 2]))); return c; });
  idx[idx.length - 1] = pick(open ? [1, 4] : [1, 3, 4]); // a question never ends on the target
  return steps.map((step, j) => ({ step, i: idx[j], len: (steps[j + 1] ?? step + 4) - step }));
}

const LEVELS = {
  1: {
    skill: 'play.penta.free', bars: 2, style: 'drone', hint: 'h1',
    spec: () => ({ item: 'free', bars: rep(2, bar(C, PADS.C)) }),
    eval(spec) {
      const n = tapsIn(spec.start, spec.end + 0.5).length;
      return { n, ok: n >= 4, chips: dots(4, n), detail: { notes: n } };
    },
  },
  2: {
    skill: 'play.penta.callresponse', bars: 4, style: 'drone',
    spec(idx) {
      const open = st.homeWins >= 3 && idx % 3 === 2;
      return { item: open ? 'open' : 'home', target: open ? 7 : 0, question: makeQuestion(open), bars: rep(4, bar(C, PADS.C)) };
    },
    eval(spec) {
      const ans = tapsIn(spec.start + 7.5, spec.end + 0.5);
      const last = ans[ans.length - 1];
      const end = !!last && pc(last.midi) === spec.target;
      return { n: ans.length, ok: ans.length >= 3 && end, chips: [...dots(3, ans.length), { kind: spec.item, on: end }], detail: { notes: ans.length, end } };
    },
    after(spec, r) { if (spec.item === 'home' && r.ok) st.homeWins++; },
  },
  3: {
    skill: 'play.penta.harmony', bars: 4, style: 'pop', hint: 'h3', symbols: true, glow: true,
    spec: () => ({ item: 'C:I-IV-V-I', bars: prog([['C', 'maj'], ['F', 'maj'], ['G', 'maj'], ['C', 'maj']], PADS.C) }),
    eval: evalBars,
  },
  4: {
    skill: 'play.penta.harmony', bars: 4, style: 'pop', hint: 'h3', symbols: true, glow: true,
    spec: (idx) => ({ ...PROGS4[(idx >> 1) % PROGS4.length] }),
    eval: evalBars,
  },
  5: {
    skill: 'play.tension', bars: 4, style: 'pop', hint: 'ht', symbols: true, glow: true,
    spec() {
      let stages = [];
      for (const g of TENSION_STAGES) {
        stages = stages.concat(g);
        if (!g.every((k) => (st.stats.get(k)?.score ?? 0) >= 0.5)) break;
      }
      const item = pickWeak(stages, st.stats, { avoid: st.lastItem });
      st.lastItem = item;
      return tensionSpec(item);
    },
    eval(spec) {
      const ev = [...spec.tens.map((i) => ({ i, t: 1 })), ...spec.res.map((i) => ({ i, t: 0 }))].sort((a, b) => a.i - b.i);
      const on = ev.map((e) => landedBy(spec.start + 4 * e.i, e.t ? (x) => x.midi === spec.xm : (x) => spec.resMidis.includes(x.midi)));
      const got = (t) => ev.filter((e, k) => e.t === t && on[k]).length;
      const ok = got(0) === spec.res.length && got(1) >= spec.tens.length - (spec.tens.length > 1 ? 1 : 0);
      return { n: tapsIn(spec.start - 0.5, spec.end - 0.5).length, ok, chips: ev.map((e, k) => ({ kind: e.t ? 'blue' : 'dot', on: on[k] })), detail: { tension: got(1), release: got(0) } };
    },
  },
  6: {
    skill: 'play.penta.blues', bars: 4, style: 'shuffle', swing: true, hint: 'h5', symbols: true, glow: true, blue: 3,
    spec: (idx) => ({ ...BLUES[idx % 3] }),
    eval(spec) {
      const hits = spec.changes.map((i) => landed(spec.start + 4 * i, spec.bars[i].tones));
      const now = posNow();
      const all = tapsIn(spec.start - 0.5, spec.end + 0.5);
      // Blue note used in passing: short, and followed by another note.
      const blue = all.some((x) => pc(x.midi) === 3 && (x.up ?? now) - x.p < 1
        && all.some((y) => y.p > x.p && y.p <= x.p + 2 && pc(y.midi) !== 3));
      const n = hits.filter(Boolean).length;
      return { n: tapsIn(spec.start - 0.5, spec.end - 0.5).length, ok: n >= Math.ceil(hits.length / 2) && blue, chips: [...hits.map((on) => ({ kind: 'dot', on })), { kind: 'blue', on: blue }], detail: { hits: hits.map(Number), blue } };
    },
  },
  7: {
    skill: 'play.penta.modal', bars: 4, style: 'vamp', hint: 'h6', symbols: true, sets: true,
    spec: () => ({ item: 'two-colours', bars: [DM7, G7, DM7, G7].map((ch) => bar(ch, PADS.Dm)) }),
    eval(spec) {
      const all = tapsIn(spec.start, spec.end + 0.5);
      const count = Object.fromEntries(SETS.map((s) => [s.id, all.filter((x) => x.set === s.id).length]));
      const chips = SETS.map((s) => ({ kind: 'dot', on: count[s.id] >= 2 }));
      return { n: all.length, ok: chips.filter((c) => c.on).length >= 2, chips, detail: count };
    },
  },
  8: {
    skill: 'play.penta.jazz', bars: 4, style: 'swing', swing: true, hint: 'h7', symbols: true, glow: true,
    spec: () => ({ item: 'ii-V-I', bars: JAZZ }),
    eval: evalBars,
  },
  9: {
    skill: 'play.penta.outside', bars: 4, style: 'vamp', hint: 'h8', symbols: true, glow: true, hold: true,
    spec: () => ({ item: 'side-slip', bars: rep(4, bar(DM7, PADS.Dm)) }),
    eval(spec) {
      const all = tapsIn(spec.start, spec.end + 0.5);
      const out = all.filter((x) => x.outside).length;
      const last = all[all.length - 1];
      const back = out >= 2 && !!last && !last.outside && DM7.pcs.includes(pc(last.midi));
      return { n: all.length, ok: back, chips: [{ kind: 'blue', on: out >= 2 }, { kind: 'home', on: back }], detail: { outside: out, back } };
    },
  },
};

// ---------- Backing patterns (k = eighth-note step 0-7 in the bar, t = audio time) ----------
const STYLES = {
  drone(b, k, t) {
    if (k === 0) { st.bus.pad([48, 55], t, st.spb * 4.2, 0.17, 0.4); st.bus.bass(36, t, st.spb * 2, 0.12); }
    if (k % 2 === 0) st.bus.hat(t, k === 0 ? 0.09 : 0.05);
  },
  pop(b, k, t) {
    if (k === 0) { st.bus.pad(b.ch.voicing, t, st.spb * 3.8, 0.17); st.bus.bass(b.ch.bass, t, st.spb * 1.6, 0.26); st.bus.kick(t, 0.2); }
    if (k === 4) { st.bus.bass(b.ch.bass + 7, t, st.spb * 1.2, 0.2); st.bus.kick(t, 0.14); }
    if (k === 7) st.bus.bass(b.ch.bass, t, st.spb * 0.4, 0.15);
    st.bus.hat(t, k % 2 ? 0.03 : 0.06);
  },
  shuffle(b, k, t) {
    if (k % 2 === 0) st.bus.bass(b.ch.bass + [0, 4, 7, 9][k / 2], t, st.spb * 0.8, 0.26);
    if (k === 2 || k === 6) st.bus.pad(b.ch.voicing, t, st.spb * 0.35, 0.2, 0.01);
    if (k === 0 || k === 4) st.bus.kick(t, 0.16);
    st.bus.hat(t, k % 2 ? 0.045 : 0.07);
  },
  vamp(b, k, t) {
    if (k === 0) { st.bus.pad(b.ch.voicing, t, st.spb * 3.7, 0.16); st.bus.bass(b.ch.bass, t, st.spb * 1.3, 0.26); st.bus.kick(t, 0.2); }
    if (k === 3) st.bus.bass(b.ch.bass, t, st.spb * 0.45, 0.2);
    if (k === 5) st.bus.kick(t, 0.13);
    if (k === 6) st.bus.bass(b.ch.bass + 7, t, st.spb * 0.45, 0.2);
    if (k === 7) st.bus.bass(b.ch.bass + 10, t, st.spb * 0.4, 0.17);
    st.bus.hat(t, k % 2 ? 0.035 : 0.06);
  },
  swing(b, k, t) {
    if (k % 2 === 0) st.bus.bass(b.walk[k / 2], t, st.spb * 0.9, 0.27);
    if (k === 0) st.bus.pad(b.ch.voicing, t, st.spb * 1.2, 0.17, 0.02);
    if (k === 3) st.bus.pad(b.ch.voicing, t, st.spb * 0.5, 0.15, 0.02);
    if ([0, 2, 3, 4, 6, 7].includes(k)) st.bus.hat(t, k === 2 || k === 6 ? 0.085 : 0.05);
  },
};

// ---------- Screen ----------
let chordEl, scaleEl, beatsEl, playEl, transport, chipsEl, hintEl, padsEl, controls, segEl, holdEl, nextEl;
const held = new Map();

function build() {
  chordEl = h('span', { className: 'pj-chord' });
  scaleEl = h('span', { className: 'pj-scale' });
  beatsEl = h('span', { className: 'pj-beats' });
  playEl = h('span', { className: 'ml-round pj-play', textContent: '▶' });
  transport = h('button', { className: 'pj-transport' }, chordEl, scaleEl, beatsEl, playEl);
  transport.onclick = () => (st.paused ? start() : pause());
  chipsEl = h('div', { className: 'pj-chips' });
  hintEl = h('p', { className: 'ml-hint' });
  padsEl = h('div', { className: 'ml-pads pj-pads' });
  controls = h('div', { className: 'pj-controls' });
  game.stage.classList.add('pj');
  game.stage.replaceChildren(transport, chipsEl, hintEl, padsEl, controls);

  padsEl.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('.ml-pad');
    if (!el) return;
    e.preventDefault();
    audio();
    const midi = st.notes[+el.dataset.i] + (st.outside ? 1 : 0);
    playNote(midi, { timbre: 'piano', gain: 0.32, dur: 0.7 });
    el.classList.add('ml-down');
    const tap = { p: posNow(), midi, up: null, set: st.set, outside: st.outside };
    held.set(e.pointerId, { el, tap });
    st.lastTap = performance.now();
    if (st.running) { st.taps.push(tap); refreshChips(); }
  });
  const release = (e) => {
    const x = held.get(e.pointerId);
    if (!x) return;
    held.delete(e.pointerId);
    x.el.classList.remove('ml-down');
    x.tap.up = posNow();
  };
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) padsEl.addEventListener(ev, release);
  padsEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function buildControls() {
  const lv = st.lv;
  segEl = holdEl = null;
  const kids = [];
  if (lv.sets) {
    segEl = h('div', { className: 'ml-seg' }, ...SETS.map((s) => {
      const b = h('button', { textContent: game.tr(s.label) });
      b.dataset.set = s.id;
      b.onclick = () => { st.set = s.id; setPads(s.pads); decorate(); };
      return b;
    }));
    kids.push(segEl);
  }
  if (lv.hold) {
    holdEl = h('button', { className: 'ml-btn pj-hold', textContent: game.t('hold') });
    const set = (on) => { st.outside = on; holdEl.classList.toggle('pj-held', on); decorate(); };
    holdEl.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) holdEl.addEventListener(ev, () => set(false));
    holdEl.addEventListener('contextmenu', (e) => e.preventDefault());
    kids.push(holdEl);
  }
  nextEl = h('button', { className: 'ml-btn ml-primary', textContent: game.t('next'), hidden: !st.canLevelUp });
  nextEl.onclick = () => game.set('level', st.level + 1);
  kids.push(nextEl);
  controls.replaceChildren(...kids);
}

function setPads(notes) {
  if (padsEl.children.length !== notes.length) {
    padsEl.replaceChildren(...notes.map((_, i) => {
      const k = h('button', { className: 'ml-pad' });
      k.dataset.i = i;
      k.style.setProperty('--h', i / (notes.length - 1));
      return k;
    }));
    padsEl.classList.toggle('pj-n7', notes.length === 7);
  }
  st.notes = notes;
}

/** Labels, glow, marks: everything that depends on the current bar and options. */
function decorate() {
  const lv = st.lv, b = st.cur;
  if (!lv || !b) return;
  const lang = game.lang;
  [...padsEl.children].forEach((el, i) => {
    const midi = st.notes[i] + (st.outside ? 1 : 0), p = pc(midi);
    const tone = !!lv.glow && !st.outside && b.tones.includes(p);
    el.textContent = game.settings.names ? noteName(midi, { lang, pref: 'flat' }) : '';
    el.classList.toggle('pj-tone', tone);
    el.classList.toggle('pj-guide', tone && b.guides.includes(p));
    const extra = b.extra === p;
    el.classList.toggle('pj-x', extra);
    el.classList.toggle('pj-dim', !!lv.glow && !st.outside && !tone && !extra);
    el.classList.toggle('pj-blue', lv.blue === p);
    const mark = st.shown?.target === p ? st.shown.item : null;
    if (mark) el.dataset.mark = mark; else delete el.dataset.mark;
  });
  padsEl.classList.toggle('pj-out', st.outside);
  padsEl.classList.toggle('pj-listen', st.phase === 'listen');
  chordEl.textContent = lv.symbols ? b.ch.sym : '';
  scaleEl.textContent = lv.hold ? game.tr(st.outside ? NAMES.Ebm : NAMES.Dm) : b.name ? game.tr(b.name) : '';
  segEl?.querySelectorAll('button').forEach((x) => x.classList.toggle('ml-on', x.dataset.set === st.set));
  hintEl.textContent = game.t(lv.hint || (st.phase === 'answer' ? st.shown?.item || 'home' : 'listen'));
  transport.setAttribute('aria-label', game.t(st.paused ? 'play' : 'pause'));
  transport.classList.toggle('pj-paused', st.paused);
}

function renderBeats(bars) {
  beatsEl.replaceChildren(...Array.from({ length: bars }, () => h('span', {}, h('i'), h('i'), h('i'), h('i'))));
}
function showBeat(bi, beat) {
  const n = bi * 4 + beat;
  beatsEl.querySelectorAll('i').forEach((el, i) => { el.classList.toggle('pj-on', i === n); el.classList.toggle('pj-past', i < n); });
  refreshChips();
}
function refreshChips() {
  if (!st.shown) return;
  const chips = st.lv.eval(st.shown).chips;
  if (chipsEl.children.length !== chips.length) chipsEl.replaceChildren(...chips.map(() => h('i')));
  chips.forEach((c, i) => { chipsEl.children[i].className = `pj-chip pj-k-${c.kind}${c.on ? ' pj-lit' : ''}`; });
}
function showBar(spec, bi) {
  st.cur = spec.bars[bi];
  if (!st.lv.sets) setPads(st.cur.pads);
  decorate();
}

// ---------- Engine ----------
const stepTime = (s) => st.t0 + (Math.floor(s / 2) + (mod(s, 2) ? (st.lv.swing ? 2 / 3 : 0.5) : 0)) * st.spb;
const uiAt = (t, fn) => st.ui.push({ t, fn });

function getSpec(idx) {
  if (!st.specs.has(idx)) {
    const len = st.lv.bars * 4;
    st.specs.set(idx, { idx, start: idx * len, end: (idx + 1) * len, ...st.lv.spec(idx) });
  }
  return st.specs.get(idx);
}

function scheduleStep(s) {
  const lv = st.lv, bus = st.bus;
  const t = stepTime(s), k = mod(s, 8), barNo = Math.floor(s / 8);
  const late = t < st.ctx.currentTime - 0.3; // after a stall: catch up silently
  if (barNo < 0) { // count-in bar
    if (!late && k % 2 === 0) bus.hat(t, 0.09);
    if (!late && k === 0 && lv.style === 'drone') bus.pad([48, 55], t, st.spb * 4.2, 0.17, 0.4);
    return;
  }
  const spec = getSpec(Math.floor(barNo / lv.bars)), bi = barNo % lv.bars, b = spec.bars[bi];
  if (k === 0) {
    if (bi === 0) {
      st.pending.push(spec);
      uiAt(t, () => { st.shown = spec; st.phase = spec.question ? 'listen' : ''; if (beatsEl.querySelectorAll('span').length !== lv.bars) renderBeats(lv.bars); decorate(); refreshChips(); });
    }
    uiAt(t - 0.5 * st.spb, () => showBar(spec, bi)); // a little early, like reading ahead
    if (spec.question && bi === 2) uiAt(t - 0.5 * st.spb, () => { st.phase = 'answer'; decorate(); });
  }
  if (k % 2 === 0) uiAt(t, () => showBeat(bi, k / 2));
  if (late) return;
  STYLES[lv.style](b, k, t);
  const q = spec.question?.find((n) => n.step === bi * 8 + k);
  if (q) {
    bus.lead(b.pads[q.i], t, q.len * st.spb * 0.45);
    uiAt(t, () => { const el = padsEl.children[q.i]; el?.classList.add('ml-hit'); setTimeout(() => el?.classList.remove('ml-hit'), 220); });
  }
}

function tick() {
  if (!st.running) return;
  const now = st.ctx.currentTime;
  while (stepTime(st.step) < now + 0.18) scheduleStep(st.step++);
  const heard = now - lat();
  const due = st.ui.filter((e) => e.t <= heard).sort((a, b) => a.t - b.t);
  if (due.length) { st.ui = st.ui.filter((e) => e.t > heard); due.forEach((e) => e.fn()); }
  const pos = (heard - st.t0) / st.spb;
  while (st.pending.length && pos >= st.pending[0].end + 0.5) judge(st.pending.shift());
}

function judge(spec) {
  const lv = st.lv, r = lv.eval(spec);
  st.specs.delete(spec.idx);
  st.taps = st.taps.filter((x) => x.p > spec.end - 8);
  if (!r.n) { // nobody played: say nothing, and stop the band after a while
    if (performance.now() - st.lastTap > 45000) pause();
    return;
  }
  const rec = { skill: lv.skill, correct: r.ok, ms: Math.round((spec.end - spec.start) * st.spb * 1000), level: st.level, item: spec.item, detail: r.detail };
  st.results.push(rec);
  game.attempt({ ...rec, silent: true, haptic: false }).then(() => { if (lv.skill === 'play.tension') loadItemMastery(lv.skill).then((m) => { st.stats = m; }); }).catch(() => {});
  lv.after?.(spec, r);
  st.recent = [...st.recent, r.ok].slice(-6);
  if (!st.canLevelUp && st.level < MAX_LEVEL && st.recent.length >= 5 && st.recent.filter(Boolean).length >= 5) {
    st.canLevelUp = true;
    if (nextEl) nextEl.hidden = false;
  }
}

function stop() {
  clearInterval(st.timer);
  st.bus?.kill();
  st.bus = null;
  st.running = false;
  st.ui = []; st.pending = []; st.taps = []; st.specs.clear();
  for (const x of held.values()) x.el.classList.remove('ml-down');
  held.clear();
}

function start() {
  stop();
  const level = Math.max(1, Math.min(MAX_LEVEL, +game.settings.level || 1));
  if (level !== st.level) { st.recent = []; st.canLevelUp = false; st.homeWins = 0; st.set = 'Dm'; }
  st.level = level;
  st.tempo = +game.settings.tempo || 80;
  st.lv = LEVELS[level];
  st.ctx = audio();
  st.bus = createBacking(st.ctx);
  st.spb = 60 / st.tempo;
  st.t0 = st.ctx.currentTime + 0.12 + 4 * st.spb; // one count-in bar
  st.step = -8;
  st.outside = false; st.paused = false; st.running = true;
  st.lastTap = performance.now();
  const first = getSpec(0);
  st.shown = first; st.cur = first.bars[0]; st.phase = first.question ? 'listen' : '';
  setPads(st.lv.sets ? SETS.find((s) => s.id === st.set).pads : st.cur.pads);
  buildControls();
  renderBeats(st.lv.bars);
  decorate();
  refreshChips();
  st.timer = setInterval(tick, 25);
  tick();
}

function pause() {
  if (!st.running) return;
  stop();
  st.paused = true;
  st.outside = false;
  holdEl?.classList.remove('pj-held');
  decorate();
}

// Hooks for automated tests.
window.__test = {
  get running() { return st.running; }, get paused() { return st.paused; }, get level() { return st.level; },
  get spb() { return st.spb; }, get results() { return st.results; }, get notes() { return st.notes; },
  get canLevelUp() { return st.canLevelUp; }, get homeWins() { return st.homeWins; },
  pos: posNow,
  spec: (idx) => { const s = getSpec(idx); return { start: s.start, end: s.end, item: s.item, target: s.target ?? null, xm: s.xm ?? null, resMidis: s.resMidis ?? null, tens: s.tens ?? null, res: s.res ?? null, changes: s.changes ?? null, bars: s.bars.map((b) => ({ pads: b.pads, tones: b.tones, guides: b.guides, sym: b.ch.sym })) }; },
  bars: () => st.lv.bars,
};

await game.ready();
st.stats = await loadItemMastery('play.tension').catch(() => new Map());
build();
start();
game.on('settings', () => {
  if (+game.settings.level !== st.level || +game.settings.tempo !== st.tempo) start();
  else decorate();
});
game.on('lang', () => { buildControls(); decorate(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);
