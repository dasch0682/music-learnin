// Play the chord: latched keys. Tap keys to build the chord; when it is complete it is played and checked.
import { createGame } from '@core/shell.js';
import { createKeyboard } from '@core/keyboard.js';
import { playChord, playNote, wait } from '@core/audio.js';
import { noteName, isNatural, CHORDS, mod } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'play-chords',
  title: L('Play the chord', 'Joue l’accord'),
  strings: {
    listen: L('Hear it', 'Écouter'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Hear a chord, rebuild it', '1 · Écoute un accord, reconstruis-le') },
      { value: 2, label: L('2 · From the name: C, F, G, Am, Dm, Em', '2 · D’après le nom : Do, Fa, Sol, Lam, Rém, Mim') },
      { value: 3, label: L('3 · All major and minor chords', '3 · Tous les accords majeurs et mineurs') },
      { value: 4, label: L('4 · Inversions, diminished, augmented', '4 · Renversements, diminué, augmenté') },
      { value: 5, label: L('5 · Seventh chords', '5 · Accords de septième') },
      { value: 6, label: L('6 · Cadences', '6 · Cadences') },
      { value: 7, label: L('7 · ii–V–I with sevenths', '7 · ii–V–I avec septièmes') },
    ] },
    { key: 'labels', label: L('Note names on keys', 'Nom des notes sur les touches'), type: 'toggle', default: false },
  ],
});
const { h } = game;

const MAX_LEVEL = 7, STREAK_UP = 5;
const skillOf = (level) => (level >= 6 ? 'play.cadence' : 'play.chords');
const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
// A chord: root pitch class, type, inversion (0 = root position).
const c = (root, type, inv = 0) => ({ root, type, inv });
const CADENCES = {
  perfect: { name: L('Perfect cadence', 'Cadence parfaite'), degrees: [['V', 7, 'maj'], ['I', 0, 'maj']] },
  plagal: { name: L('Plagal cadence', 'Cadence plagale'), degrees: [['IV', 5, 'maj'], ['I', 0, 'maj']] },
  half: { name: L('Half cadence', 'Demi-cadence'), degrees: [['I', 0, 'maj'], ['V', 7, 'maj']] },
  deceptive: { name: L('Deceptive cadence', 'Cadence rompue'), degrees: [['V', 7, 'maj'], ['vi', 9, 'min']] },
  iiVI: { name: L('ii–V–I', 'ii–V–I'), degrees: [['ii7', 2, 'min7'], ['V7', 7, 'dom7'], ['Imaj7', 0, 'maj7']] },
};
const pools = {
  1: () => [[0, 'maj'], [5, 'maj'], [7, 'maj']].map(([r, t]) => ({ chords: [c(r, t)] })),
  2: () => [[0, 'maj'], [5, 'maj'], [7, 'maj'], [9, 'min'], [2, 'min'], [4, 'min']].map(([r, t]) => ({ chords: [c(r, t)] })),
  3: () => ALL.flatMap((r) => ['maj', 'min'].map((t) => ({ chords: [c(r, t)] }))),
  4: () => ALL.flatMap((r) => [
    ...['maj', 'min'].flatMap((t) => [1, 2].map((i) => ({ chords: [c(r, t, i)] }))),
    { chords: [c(r, 'dim')] }, { chords: [c(r, 'aug')] }]),
  5: () => ALL.flatMap((r) => ['maj7', 'dom7', 'min7'].map((t) => ({ chords: [c(r, t)] }))),
  6: () => [0, 7, 5].flatMap((k) => ['perfect', 'plagal', 'half', 'deceptive'].map((id) => cadence(id, k))),
  7: () => [0, 5, 10, 7, 3, 2].map((k) => cadence('iiVI', k)),
};
function cadence(id, key) {
  const cd = CADENCES[id];
  return { cad: id, key, chords: cd.degrees.map(([, off, type]) => c(mod(key + off, 12), type)), rn: cd.degrees.map((d) => d[0]) };
}
const itemOf = (q) => {
  if (q.cad) return q.cad;
  const ch = q.chords[0];
  return ch.type + (ch.inv ? ':inv' + ch.inv : '');
};
const fullKey = (q) => JSON.stringify(q.chords);
const pcsOf = (ch) => CHORDS[ch.type].steps.map((s) => mod(ch.root + s, 12));
const bassOf = (ch) => (ch.inv ? pcsOf(ch)[ch.inv] : null);

/** Keyboard window: from the white key at or under lo to the one at or over hi. */
function windowOf(q, level) {
  let lo, hi;
  if (level >= 6) { lo = 57; hi = 76; }
  else {
    const r = 60 + q.chords[0].root;
    lo = level === 4 ? r - 5 : r;
    hi = r + 12;
  }
  while (!isNatural(lo)) lo--;
  while (!isNatural(hi)) hi++;
  return [lo, hi];
}

// ---------- names ----------
const MINORISH = new Set(['min', 'dim', 'min7', 'm7b5', 'dim7']);
function prefOf(pc, type) {
  if (MINORISH.has(type)) return [3, 10].includes(pc) ? 'flat' : 'sharp';
  return [1, 3, 8, 10].includes(pc) ? 'flat' : 'sharp';
}
function chordName(ch) {
  const lang = game.lang, pref = prefOf(ch.root, ch.type);
  let sym = CHORDS[ch.type].symbol;
  if (lang === 'fr' && sym === 'maj7') sym = ' maj7';
  let s = noteName(60 + ch.root, { lang, pref }) + sym;
  if (ch.inv) s += '/' + noteName(60 + bassOf(ch), { lang, pref });
  return s;
}

// ---------- screen ----------
const nameEl = h('p', { className: 'ml-prompt pc-name' });
const stepsEl = h('div', { className: 'pc-steps' });
const listenBtn = h('button', { className: 'pc-listen', textContent: '▶' });
const kbBox = h('div', { className: 'pc-kb' });
const offerBtn = h('button', { className: 'ml-btn ml-primary pc-offer pc-off' });

let started = false, gen = 0;
let current = null, step = 0, locked = true, wrongLogged = false, t0 = 0;
let streak = 0, last = null, lastFull = null, win = null, kb = null, kbKey = '';
const latched = new Set();
const levelNow = () => (pools[+game.settings.level] ? +game.settings.level : 1);
const chordNow = () => current.chords[step];

function paint() {
  const lv = levelNow();
  listenBtn.title = game.t('listen');
  listenBtn.setAttribute('aria-label', game.t('listen'));
  offerBtn.textContent = game.t('nextLevel');
  offerBtn.classList.toggle('pc-off', !(streak >= STREAK_UP && lv < MAX_LEVEL));
  if (!current) return;
  if (lv >= 6) {
    nameEl.textContent = game.tr(CADENCES[current.cad].name);
    stepsEl.replaceChildren(...current.chords.map((ch, i) => h('div', { className: 'pc-step' + (i < step ? ' pc-done' : i === step ? ' pc-cur' : '') },
      h('span', { textContent: chordName(ch) }), h('small', { textContent: current.rn[i] }))));
  } else {
    nameEl.textContent = lv === 1 ? '' : chordName(current.chords[Math.min(step, current.chords.length - 1)]);
    stepsEl.replaceChildren();
  }
  stepsEl.style.display = lv >= 6 ? '' : 'none';
  nameEl.style.display = lv === 1 ? 'none' : '';
  listenBtn.style.display = lv === 1 ? '' : 'none';
  paintKeys();
}
function paintKeys() {
  kb?.el.querySelectorAll('[data-midi]').forEach((k) => k.classList.toggle('pc-on', latched.has(+k.dataset.midi)));
}
function buildKeyboard() {
  const key = [win, game.settings.labels, game.lang].join('|');
  if (key === kbKey) return;
  kbKey = key;
  kb = createKeyboard(kbBox, { from: win[0], to: win[1], labels: !!game.settings.labels, sound: true, onDown: onKey });
}

// ---------- rounds ----------
/** The app plays the chord (level 1) and flashes its keys once. */
async function model() {
  const my = gen;
  locked = true;
  const ch = chordNow();
  const lo = win[0];
  const notes = voicing(ch, lo);
  notes.forEach((m) => kb?.flash(m, 'ml-hit', 900));
  playChord(notes, { dur: 0.9 });
  await wait(1100);
  if (my !== gen) return;
  locked = false;
  t0 = performance.now();
}
/** One way to play a chord from `lo` up (bass first, the others above it). */
function voicing(ch, lo) {
  const pcs = pcsOf(ch);
  const order = ch.inv ? [...pcs.slice(ch.inv), ...pcs.slice(0, ch.inv)] : pcs;
  const out = [];
  let m = lo - 1;
  for (const pc of order) { m++; while (mod(m, 12) !== pc) m++; out.push(m); }
  return out;
}

async function next() {
  const my = ++gen;
  locked = true;
  const level = levelNow();
  const stats = await loadItemMastery(skillOf(level));
  if (my !== gen) return;
  const all = pools[level]();
  // Items are coarse (a chord type, a cadence), so the same one may come back; never the exact same chord twice in a row.
  const fresh = all.filter((q) => fullKey(q) !== lastFull);
  const keys = new Set(fresh.map(itemOf));
  current = pickWeak(fresh, stats, { keyOf: itemOf, avoid: keys.size > 1 ? last : undefined });
  last = itemOf(current);
  lastFull = fullKey(current);
  step = 0;
  wrongLogged = false;
  latched.clear();
  win = windowOf(current, level);
  buildKeyboard();
  paint();
  if (level === 1) await model();
  else { locked = false; t0 = performance.now(); }
}

/** The latched keys against the chord asked: right, or which keys to release. */
function judge(ch) {
  const pcs = pcsOf(ch);
  const keys = [...latched].sort((a, b) => a - b);
  const seen = new Set();
  const bad = keys.filter((m) => { const pc = mod(m, 12); const wrong = !pcs.includes(pc) || seen.has(pc); seen.add(pc); return wrong; });
  if (bad.length) return { ok: false, release: bad };
  if (ch.inv && mod(keys[0], 12) !== bassOf(ch)) return { ok: false, release: keys };
  return { ok: true, keys };
}

async function onKey(midi) {
  if (locked || !current) return;
  if (latched.has(midi)) latched.delete(midi); else latched.add(midi);
  paintKeys();
  const ch = chordNow();
  if (latched.size < pcsOf(ch).length) return;
  const res = judge(ch);
  if (!res.ok) {
    streak = 0;
    offerBtn.classList.add('pc-off');
    res.release.forEach((m) => { latched.delete(m); kb.flash(m, 'ml-bad', 450); });
    paintKeys();
    if (wrongLogged) return game.flash(false, { silent: true });
    wrongLogged = true;
    await game.attempt({ skill: skillOf(levelNow()), correct: false, ms: Math.round(performance.now() - t0), level: levelNow(), item: itemOf(current), silent: true });
    return;
  }
  // Right chord: it sounds together, the keys flash good and are released.
  const my = gen;
  const keys = res.keys;
  locked = true;
  playChord(keys, { dur: 0.8 });
  keys.forEach((m) => kb.flash(m, 'ml-good', 600));
  latched.clear();
  paintKeys();
  if (step + 1 < current.chords.length) {
    step++;
    paint();
    await wait(700);
    if (my === gen) { locked = false; }
    return;
  }
  step++;
  paint();
  if (!wrongLogged) streak++;
  paint();
  await game.attempt({ skill: skillOf(levelNow()), correct: true, ms: Math.round(performance.now() - t0), level: levelNow(), item: itemOf(current), silent: true });
  let delay = 900;
  if (current.cad) { replayCadence(my); delay = 700 + current.chords.length * 900; }
  setTimeout(() => { if (my === gen) next(); }, delay);
}

/** The cadence again, with the bass added under each chord. */
function replayCadence(my) {
  setTimeout(() => {
    if (my !== gen) return;
    current.chords.forEach((ch, i) => {
      const when = i * 0.9;
      const notes = voicing(ch, 60);
      playChord(notes, { dur: 0.8, when });
      playNote(36 + ch.root, { dur: 0.8, when, timbre: 'bass', gain: 0.3 });
    });
  }, 500);
}

listenBtn.onclick = () => { if (started && current && levelNow() === 1 && !locked) { gen++; latched.clear(); model(); } };
offerBtn.onclick = () => { if (levelNow() < MAX_LEVEL) game.set('level', levelNow() + 1); };
game.on('settings', () => { if (started) { streak = 0; kbKey = ''; next(); } });
game.on('lang', () => { if (started) { kbKey = ''; buildKeyboard(); paint(); } });

window.__test = {
  state: () => ({
    level: levelNow(), item: current && itemOf(current), cad: current?.cad, key: current?.key,
    chords: current?.chords, pcs: current?.chords.map(pcsOf), bass: current?.chords.map(bassOf),
    names: current?.chords.map(chordName), step, win, locked, wrongLogged, streak, latched: [...latched],
  }),
};

game.ready().then(() => {
  started = true;
  game.stage.replaceChildren(nameEl, stepsEl, listenBtn, h('div', { className: 'pc-input', style: 'width:100%' }, kbBox), offerBtn);
  next();
});
