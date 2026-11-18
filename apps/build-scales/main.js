// Build the scale: latch keys on a keyboard until the scale is complete, then hear it.
// First by ear (C major), then from a strip of wide and narrow blocks, then minor, modes and small changes.
import { createGame } from '@core/shell.js';
import { createKeyboard } from '@core/keyboard.js';
import { playSeq, wait } from '@core/audio.js';
import { SCALES, noteName, mod } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const STREAK_UP = 6;
const BASE = 60; // the keyboard shows C4 to B4: one key per pitch class
const game = createGame({
  id: 'build-scales',
  title: L('Build the scale', 'Construis la gamme'),
  strings: {
    replay: L('Listen', 'Écouter'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
    tone: L('{n} tone', '{n} ton'),
    major: L('major', 'majeur'),
    minorN: L('natural minor', 'mineur naturel'),
    minorH: L('harmonic minor', 'mineur harmonique'),
    homeHint: L('Same notes, another home', 'Mêmes notes, autre maison'),
    startHint: L('Where does it start?', 'Où commence-t-elle ?'),
    change1: L('Change one note', 'Change une note'),
    remove2: L('Remove two notes', 'Retire deux notes'),
    add1: L('Add one note', 'Ajoute une note'),
    dorian: L('Dorian', 'Dorien'),
    phrygian: L('Phrygian', 'Phrygien'),
    lydian: L('Lydian', 'Lydien'),
    mixolydian: L('Mixolydian', 'Mixolydien'),
    aeolian: L('Aeolian', 'Éolien'),
    pentaMajor: L('major pentatonic', 'pentatonique majeure'),
    blues: L('blues', 'blues'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · C major by ear', '1 · Do majeur à l’oreille') },
      { value: 2, label: L('2 · G and F major by ear', '2 · Sol et Fa majeur à l’oreille') },
      { value: 3, label: L('3 · Any major scale', '3 · Toutes les gammes majeures') },
      { value: 4, label: L('4 · Minor scales, relative minor', '4 · Gammes mineures, relative mineure') },
      { value: 5, label: L('5 · Modes: same notes, another start', '5 · Modes : mêmes notes, autre départ') },
      { value: 6, label: L('6 · Change a note: modes, pentatonic, blues', '6 · Change une note : modes, pentatonique, blues') },
    ] },
    { key: 'labels', label: L('Note names on keys', 'Nom des notes sur les touches'), type: 'toggle', default: false },
  ],
});
const { h } = game;

// ---------- theory ----------
const MODE_OFFSET = { dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, aeolian: 9 }; // start degree, in semitones above the major tonic
const STEPS = { ...SCALES, aeolian: SCALES.minor };
const stepsOf = (id) => STEPS[id].steps;
const pcsOf = (tonic, steps) => steps.map((s) => mod(tonic + s, 12));
const gapsOf = (steps) => steps.map((s, i) => (i + 1 < steps.length ? steps[i + 1] : 12) - s);
const scaleMidis = (tonic, steps) => [...steps.map((s) => BASE + tonic + s), BASE + tonic + 12];
const MAJOR_PREF = { 1: 'flat', 3: 'flat', 6: 'sharp', 8: 'flat', 10: 'flat' };
const MINOR_PREF = { 1: 'sharp', 3: 'flat', 6: 'sharp', 8: 'sharp', 10: 'flat' };
const ALL = [...Array(12).keys()];
const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Each level: skill and the list of items 'kind:pc'.
const LEVELS = {
  1: { skill: 'theory.scales', items: ['major:0'] },
  2: { skill: 'theory.scales', items: ['major:7', 'major:5'] },
  3: { skill: 'theory.scales', items: ALL.map((p) => `major:${p}`) },
  4: { skill: 'theory.scales', items: ALL.flatMap((p) => [`minor:${p}`, `harmonicMinor:${p}`, `relative:${p}`]) },
  5: { skill: 'theory.modes', items: Object.keys(MODE_OFFSET).flatMap((m) => ALL.map((p) => `${m}:${p}`)) },
  6: { skill: 'theory.modes', items: ['lydian', 'mixolydian', 'dorian', 'phrygian', 'pentaMajor', 'blues'].flatMap((m) => ALL.map((p) => `${m}:${p}`)) },
};
// Level 6: the scale to start from, per target.
const BASE_OF = { lydian: 'major', mixolydian: 'major', pentaMajor: 'major', dorian: 'minor', phrygian: 'minor', blues: 'pentaMinor' };
const ACTION = { lydian: 'change1', mixolydian: 'change1', dorian: 'change1', phrygian: 'change1', pentaMajor: 'remove2', blues: 'add1' };

/** Everything the screen needs about one question. */
function makeQuestion(item, level) {
  const [kind, p] = item.split(':');
  const pc = +p;
  const q = { level, skill: LEVELS[level].skill, item, kind, tonic: pc, home: null, lit: new Set(), start: new Set(), strip: null, stripEarly: false };
  if (level === 5) {
    const parent = mod(pc - MODE_OFFSET[kind], 12);
    Object.assign(q, { mode: 'pick', answer: pc, home: parent, lit: new Set(pcsOf(parent, stepsOf('major'))), hear: scaleMidis(parent, stepsOf('major')), played: scaleMidis(pc, stepsOf(kind)), strip: stepsOf(kind), title: { mode: kind }, hint: 'startHint' });
  } else if (kind === 'relative') {
    const major = mod(pc + 3, 12);
    Object.assign(q, { mode: 'pick', answer: pc, home: major, lit: new Set(pcsOf(major, stepsOf('major'))), hear: scaleMidis(major, stepsOf('major')), played: scaleMidis(pc, stepsOf('minor')), strip: stepsOf('minor'), title: null, hint: 'homeHint' });
  } else if (level === 6) {
    const base = BASE_OF[kind];
    const target = new Set(pcsOf(pc, stepsOf(kind)));
    Object.assign(q, { mode: 'build', target, start: new Set(pcsOf(pc, stepsOf(base))), home: pc, hear: scaleMidis(pc, stepsOf(base)), played: scaleMidis(pc, stepsOf(kind)), strip: stepsOf(kind), stripEarly: true, title: { pc, mode: kind, pref: base === 'major' ? MAJOR_PREF : MINOR_PREF }, hint: ACTION[kind] });
  } else {
    const steps = stepsOf(kind);
    Object.assign(q, { mode: 'build', target: new Set(pcsOf(pc, steps)), home: pc, played: scaleMidis(pc, steps), strip: steps, stripEarly: level >= 3 });
    if (level <= 2) q.hear = q.played; // by ear
    else {
      q.hear = [BASE + pc];
      q.title = { pc, words: kind === 'major' ? 'major' : kind === 'minor' ? 'minorN' : 'minorH', pref: kind === 'major' ? MAJOR_PREF : MINOR_PREF };
    }
  }
  return q;
}

// ---------- screen ----------
let q = null, kb = null, kbKey = '';
let latched = new Set();
const forced = []; // test hook: items to ask next
let locked = true, missed = false, revealed = false, streak = 0, last = null, seq = 0, started = 0, timer = 0, count = 0, shownLevel = 0;

const PLAY = '<svg viewBox="0 0 64 64" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const replay = h('button', { className: 'ml-round bs-replay', innerHTML: PLAY });
const titleEl = h('p', { className: 'bs-title' });
const hintEl = h('p', { className: 'ml-hint' });
const head = h('div', { className: 'bs-head' }, replay, h('div', { className: 'bs-text' }, titleEl, hintEl));
const stripBox = h('div', { className: 'bs-stripbox' });
const kbBox = h('div', { style: 'width:100%' });
const nextBtn = h('button', { className: 'ml-btn ml-primary bs-next' });
replay.onclick = () => hear();

async function hear() {
  if (!q?.hear) return;
  playSeq(q.hear, { bpm: 170, beats: q.hear.length === 1 ? 2 : 1 });
}

function stripEl(steps) {
  const label = (g) => game.t('tone', { n: g === 1 ? '½' : g === 2 ? '1' : g === 3 ? '1½' : '2' });
  return h('div', { className: 'bs-strip' }, ...gapsOf(steps).map((g) => h('span', { className: `bs-g bs-g${g}`, style: `flex-grow:${g + 1}`, textContent: label(g) })));
}

function titleText() {
  const t = q.title;
  if (!t) return '';
  if (t.mode && t.pc == null) return game.t(t.mode);
  const name = noteName(BASE + t.pc, { lang: game.lang, pref: t.pref[t.pc] || 'sharp' });
  return `${name} ${game.t(t.words || t.mode)}`;
}

function paint() {
  if (!q || !kb) return;
  for (let pc = 0; pc < 12; pc++) {
    const el = kb.el.querySelector(`[data-midi="${BASE + pc}"]`);
    el.classList.toggle('bs-on', q.mode === 'build' && latched.has(pc));
    el.classList.toggle('bs-lit', q.mode === 'pick' && q.lit.has(pc));
    el.classList.toggle('bs-home', q.home === pc);
    el.classList.toggle('ml-reveal', revealed && q.mode === 'pick' && q.answer === pc);
  }
}

function render(showStrip) {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  titleEl.textContent = titleText();
  hintEl.textContent = q.hint ? game.t(q.hint) : '';
  replay.classList.toggle('bs-small', !!q.title || !!q.hint);
  const key = [game.settings.labels, game.lang].join('|');
  if (key !== kbKey) {
    kbKey = key;
    kb = createKeyboard(kbBox, { from: BASE, to: BASE + 11, labels: !!game.settings.labels, onDown: onKey });
  }
  stripBox.replaceChildren(...(showStrip ?? q.stripEarly ? [stripEl(q.strip)] : []));
  paint();
}

// ---------- rounds ----------
async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const stats = await loadItemMastery(LEVELS[level].skill);
  if (id !== seq) return;
  const item = forced.shift() ?? pickWeak(LEVELS[level].items, stats, { avoid: last });
  last = item;
  q = makeQuestion(item, level);
  latched = new Set(q.start);
  missed = false;
  revealed = false;
  locked = false;
  count++;
  render();
  hear();
  started = performance.now();
}

function record(ok) {
  return { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item };
}

async function success() {
  locked = true;
  clearTimeout(timer);
  const my = seq;
  stripBox.replaceChildren(stripEl(q.strip));
  const rec = record(true);
  if (missed) game.flash(true);
  else {
    streak++;
    if (streak >= STREAK_UP) {
      if (q.level < MAX_LEVEL) nextBtn.classList.add('bs-show');
      else if (streak === STREAK_UP) game.celebrate(game.t('top'));
    }
    await game.attempt(rec);
  }
  await playSeq(q.played, { bpm: 230 });
  await wait(450);
  if (my === seq) next();
}

async function failure(badPcs) {
  locked = true;
  clearTimeout(timer);
  streak = 0;
  nextBtn.classList.remove('bs-show');
  for (const pc of badPcs) {
    const k = kb.el.querySelector(`[data-midi="${BASE + pc}"]`);
    k.classList.add('bs-bad');
    setTimeout(() => k.classList.remove('bs-bad'), 700);
  }
  if (missed) {
    if (q.mode === 'pick') { revealed = true; paint(); } // 2nd miss: show the right key
    game.flash(false);
  } else { missed = true; await game.attempt(record(false)); }
  const my = seq;
  timer = setTimeout(() => {
    if (my !== seq) return;
    latched = new Set(q.start); // try again
    paint();
    locked = false;
    if (q.level <= 2) hear();
  }, 900);
}

function onKey(midi) {
  if (locked || !q) return;
  const pc = midi - BASE;
  if (q.mode === 'pick') {
    if (pc === q.answer) success();
    else failure([pc]);
    return;
  }
  if (latched.has(pc)) latched.delete(pc); else latched.add(pc);
  paint();
  if (latched.size === q.target.size && !same(latched, q.start)) {
    if (same(latched, q.target)) success();
    else failure([...latched].filter((x) => !q.target.has(x)));
  }
}

nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

window.__test = {
  force: (items) => { forced.push(...items); },
  state: () => q && ({
    n: count, level: q.level, item: q.item, kind: q.kind, mode: q.mode, tonic: q.tonic, locked, missed,
    expected: q.mode === 'pick' ? [q.answer] : [...q.target].sort((a, b) => a - b),
    start: [...q.start].sort((a, b) => a - b), latched: [...latched].sort((a, b) => a - b),
    lit: [...q.lit].sort((a, b) => a - b), home: q.home, hear: q.hear, played: q.played, base: BASE,
    nextShown: nextBtn.classList.contains('bs-show'),
  }),
};

game.ready().then(() => {
  game.stage.replaceChildren(head, stripBox, kbBox, nextBtn);
  shownLevel = +game.settings.level;
  game.on('settings', () => {
    if (+game.settings.level !== shownLevel) { shownLevel = +game.settings.level; streak = 0; nextBtn.classList.remove('bs-show'); next(); } else render();
  });
  game.on('lang', () => render());
  next();
});
