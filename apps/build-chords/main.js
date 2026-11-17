// Build the chord: hear or read an interval or a chord, then build it on the keyboard.
// Intervals are distances counted in half-step blocks; chords are stacks of thirds, read as strips of blocks.
import { createGame } from '@core/shell.js';
import { createKeyboard } from '@core/keyboard.js';
import { playSeq, wait } from '@core/audio.js';
import { INTERVALS, CHORDS, noteName, isNatural, mod, rand, pick, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const STREAK_UP = 6;
const LOW = 55, HIGH = 84, LOWEST_MAX = 72; // notes are kept between G3 and C6; the keyboard window (11 white keys) is chosen around them
const game = createGame({
  id: 'build-chords',
  title: L('Build the chord', 'Construis l’accord'),
  strings: {
    replay: L('Listen', 'Écouter'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
    maj: L('major', 'majeur'),
    min: L('minor', 'mineur'),
    tapHint: L('Tap the second note', 'Touche la deuxième note'),
    buildHint: L('Build the chord', 'Construis l’accord'),
    nameHint: L('Which one?', 'Lequel ?'),
    n1: L('unison', 'unisson'), n2: L('second', 'seconde'), n3: L('third', 'tierce'), n4: L('fourth', 'quarte'),
    n5: L('fifth', 'quinte'), n6: L('sixth', 'sixte'), n7: L('seventh', 'septième'), n8: L('octave', 'octave'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Hear an interval, tap the note', '1 · Entends un intervalle, touche la note') },
      { value: 2, label: L('2 · Seconds and thirds in half steps', '2 · Secondes et tierces en demi-tons') },
      { value: 3, label: L('3 · All intervals, up and down', '3 · Tous les intervalles, vers le haut et le bas') },
      { value: 4, label: L('4 · Major and minor triads', '4 · Accords majeurs et mineurs') },
      { value: 5, label: L('5 · Dim, aug, sus4, inversions', '5 · Dim, aug, sus4, renversements') },
      { value: 6, label: L('6 · Seventh chords and ninths', '6 · Accords de septième et neuvièmes') },
    ] },
    { key: 'labels', label: L('Note names on keys', 'Nom des notes sur les touches'), type: 'toggle', default: false },
  ],
});
const { h } = game;

// ---------- theory ----------
const IV = Object.fromEntries(INTERVALS.map((i) => [i.id, i]));
const NINTH = { maj9: { steps: [0, 4, 7, 11, 14] }, dom9: { steps: [0, 4, 7, 10, 14] }, min9: { steps: [0, 3, 7, 10, 14] } };
// Chord table: semitones above the root and the symbol shown to the player.
const CH = {
  maj: { steps: CHORDS.maj.steps, sym: '', en: 'Major', fr: 'Majeur' },
  min: { steps: CHORDS.min.steps, sym: 'm', en: 'Minor', fr: 'Mineur' },
  dim: { steps: CHORDS.dim.steps, sym: '°', en: 'Diminished', fr: 'Diminué' },
  aug: { steps: CHORDS.aug.steps, sym: '+', en: 'Augmented', fr: 'Augmenté' },
  sus4: { steps: CHORDS.sus4.steps, sym: 'sus4', en: 'Suspended', fr: 'Suspendu' },
  maj7: { steps: CHORDS.maj7.steps, sym: 'maj7', en: 'Major 7th', fr: 'Majeur 7' },
  dom7: { steps: CHORDS.dom7.steps, sym: '7', en: 'Dominant 7th', fr: 'Dominante 7' },
  min7: { steps: CHORDS.min7.steps, sym: 'm7', en: 'Minor 7th', fr: 'Mineur 7' },
  m7b5: { steps: CHORDS.m7b5.steps, sym: 'm7♭5', en: 'Half-diminished', fr: 'Demi-diminué' },
  dim7: { steps: CHORDS.dim7.steps, sym: '°7', en: 'Diminished 7th', fr: 'Diminué 7' },
  maj9: { steps: NINTH.maj9.steps, sym: 'maj9', en: 'Major 9th', fr: 'Majeur 9' },
  dom9: { steps: NINTH.dom9.steps, sym: '9', en: 'Dominant 9th', fr: 'Dominante 9' },
  min9: { steps: NINTH.min9.steps, sym: 'm9', en: 'Minor 9th', fr: 'Mineur 9' },
};
const ROOT_PREF = { 1: 'flat', 3: 'flat', 6: 'sharp', 8: 'flat', 10: 'flat' };
const nameOf = (midi) => noteName(midi, { lang: game.lang, pref: ROOT_PREF[mod(midi, 12)] || 'sharp' });
const gapsOfNotes = (notes) => notes.slice(1).map((m, i) => m - notes[i]);
/** Notes of a chord, lowest first. inv 1 moves the root up an octave, inv 2 the root and the third. */
function voicing(root, type, inv) {
  const s = CH[type].steps;
  return s.map((x, i) => root + x + (i < inv ? 12 : 0)).sort((a, b) => a - b);
}
const degreeOf = (semi) => ({ 0: 1, 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5, 8: 6, 9: 6, 10: 7, 11: 7, 12: 8 })[semi];

const IDS3 = INTERVALS.filter((i) => i.semi > 0).map((i) => i.id); // m2 … P8, tritone included
const SEVENTHS = ['maj7', 'dom7', 'min7', 'm7b5', 'dim7'];
const NINTHS = ['maj9', 'dom9', 'min9'];
const LEVELS = {
  1: { skill: 'theory.intervals', items: ['m2', 'M2', 'm3', 'M3', 'P4', 'P5', 'P8'], modes: ['tap'], white: true },
  2: { skill: 'theory.intervals', items: ['m2', 'M2', 'm3', 'M3'], modes: ['tap', 'name'], blocks: true },
  3: { skill: 'theory.intervals', items: IDS3.flatMap((i) => [i, `${i}:dn`]), modes: ['tap', 'tapname', 'name'] },
  4: { skill: 'theory.chords', items: ['maj', 'min'], modes: ['build'], recipe: true },
  5: { skill: 'theory.chords', items: ['dim', 'aug', 'sus4', 'maj', 'min', 'maj:inv1', 'maj:inv2', 'min:inv1', 'min:inv2', 'dim:inv1', 'dim:inv2', 'sus4:inv1'], modes: ['build', 'build', 'name'], recipe: true, choices: ['maj', 'min', 'dim', 'aug', 'sus4'] },
  6: { skill: 'theory.chords', items: [...SEVENTHS, ...SEVENTHS, ...NINTHS], modes: ['build', 'build', 'name'], recipe: true, choices: [...SEVENTHS, ...NINTHS] },
};

/** Keyboard window: from a white key at or below the lowest note, 11 white keys wide. */
function windowFor(notes) {
  const from = isNatural(Math.min(...notes)) ? Math.min(...notes) : Math.min(...notes) - 1;
  let to = from, whites = 1;
  while (whites < 11) { to++; if (isNatural(to)) whites++; }
  return [from, to];
}

function makeQuestion(item, level, forcedMode) {
  const cfg = LEVELS[level];
  const [id, flag] = item.split(':');
  const mode = forcedMode || pick(cfg.modes);
  const q = { level, skill: cfg.skill, item, id, mode, lit: [], latched: new Set(), strip: null, stripEarly: false, choices: null, answer: null, title: null, hint: null };
  if (level <= 3) {
    const semi = IV[id].semi, dir = flag === 'dn' ? -1 : 1;
    const roots = [];
    for (let r = LOW; r <= HIGH; r++) {
      const t = r + dir * semi;
      if (t < LOW || t > HIGH || Math.min(r, t) > LOWEST_MAX || (cfg.white && !(isNatural(r) && isNatural(t)))) continue;
      roots.push(r);
    }
    q.root = pick(roots);
    q.target = q.root + dir * semi;
    q.dir = dir;
    q.notes = [q.root, q.target];
    q.interval = { id, semi, dir };
    q.played = [q.root, q.target, [q.root, q.target]];
    q.strip = { units: semi };
    q.stripEarly = !!cfg.blocks && mode === 'name';
    if (mode === 'name') {
      q.lit = [q.root, q.target];
      q.answer = id;
      const pool = level === 2 ? cfg.items : shuffle(IDS3.filter((x) => x !== id)).slice(0, 5);
      q.choices = level === 2 ? cfg.items.slice() : shuffle([id, ...pool]);
      q.hear = [q.root, q.target];
      q.hint = 'nameHint';
    } else {
      q.lit = [q.root];
      q.hear = mode === 'tap' ? [q.root, q.target] : [q.root];
      q.hint = mode === 'tap' ? (level === 1 ? null : 'tapHint') : 'tapHint';
      if (mode === 'tapname') q.title = { interval: id, dir };
    }
  } else {
    const inv = flag ? +flag.replace('inv', '') : 0;
    const roots = [];
    for (let r = LOW - 12; r <= HIGH; r++) {
      const ns = voicing(r, id, inv);
      if (ns[0] >= LOW && ns[0] <= LOWEST_MAX && ns[ns.length - 1] <= HIGH) roots.push(r);
    }
    q.root = pick(roots);
    q.inv = inv;
    q.notes = voicing(q.root, id, inv);
    q.given = q.notes[0];
    q.played = [...q.notes, q.notes];
    q.strip = { gaps: gapsOfNotes(q.notes) };
    if (mode === 'build') {
      q.latched = new Set([q.given]);
      q.lit = [];
      q.hear = [q.given];
      q.title = { chord: id, root: q.root, bass: inv ? q.given : null };
      q.hint = 'buildHint';
      q.stripEarly = true;
      q.recipe = gapsOfNotes(voicing(q.root, id, 0));
    } else {
      q.mode = 'name';
      q.lit = q.notes.slice();
      q.answer = id;
      q.choices = cfg.choices.slice();
      q.hear = q.played;
      q.hint = 'nameHint';
    }
  }
  q.window = windowFor(q.notes);
  return q;
}

// ---------- screen ----------
let q = null, kb = null, locked = true, missed = false, streak = 0, last = null, seq = 0, started = 0, timer = 0, count = 0, shownLevel = 0, done = false;
const forced = []; // test hook: items to ask next

const PLAY = '<svg viewBox="0 0 64 64" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const replay = h('button', { className: 'ml-round bc-replay', innerHTML: PLAY });
const titleEl = h('p', { className: 'bc-title' });
const hintEl = h('p', { className: 'ml-hint' });
const head = h('div', { className: 'bc-head' }, replay, h('div', { className: 'bc-text' }, titleEl, hintEl));
const stripBox = h('div', { className: 'bc-stripbox' });
const kbBox = h('div', { style: 'width:100%' });
const choiceBox = h('div', { className: 'bc-choices' });
const nextBtn = h('button', { className: 'ml-btn ml-primary bc-next' });
replay.onclick = () => hear();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function hear() { if (q?.hear) playSeq(q.hear, { bpm: q.mode === 'name' && q.level >= 4 ? 200 : 120 }); }

const ivName = (id) => game.tr(IV[id]);
function unitStrip(n) {
  return h('div', { className: 'bc-strip bc-units' }, ...Array.from({ length: n }, () => h('span', { className: 'bc-u' })));
}
function gapStrip(gaps) {
  return h('div', { className: 'bc-strip' }, ...gaps.map((g) => h('span', { className: `bc-g bc-g${g === 3 || g === 4 ? g : 'x'}`, style: `flex-grow:${g}`, textContent: g })));
}
function stripEl(s) { return s.units != null ? unitStrip(s.units) : gapStrip(s.gaps); }

function titleText() {
  const t = q.title;
  if (done && q.level <= 3) {
    const { id, semi } = q.interval;
    return q.level === 1 ? `${degreeOf(semi)} · ${game.t('n' + degreeOf(semi))}` : ivName(id);
  }
  if (done) return nameOf(q.root) + CH[q.id].sym + (q.inv ? '/' + nameOf(q.given) : '');
  if (!t) return '';
  if (t.interval) return `${ivName(t.interval)} ${t.dir > 0 ? '↑' : '↓'}`;
  if (q.level === 4) return `${nameOf(t.root)} ${game.t(t.chord)}`;
  return nameOf(t.root) + CH[t.chord].sym + (t.bass != null ? '/' + nameOf(t.bass) : '');
}

function paint() {
  if (!q || !kb) return;
  kb.el.querySelectorAll('.ml-key').forEach((el) => {
    const m = +el.dataset.midi;
    el.classList.toggle('bc-on', q.latched.has(m));
    el.classList.toggle('bc-lit', q.lit.includes(m));
    el.classList.toggle('bc-given', m === (q.mode === 'build' ? q.given : q.root) && q.mode !== 'name');
  });
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  titleEl.textContent = titleText();
  hintEl.textContent = done || !q.hint ? '' : game.t(q.hint);
  replay.classList.toggle('bc-small', !!titleEl.textContent);
  kb = createKeyboard(kbBox, { from: q.window[0], to: q.window[1], labels: !!game.settings.labels, onDown: onKey });
  const showStrip = done || q.stripEarly;
  const s = done ? q.strip : q.mode === 'build' ? { gaps: q.recipe } : q.strip;
  stripBox.replaceChildren(...(showStrip ? [stripEl(s)] : []));
  renderChoices();
  paint();
}

function renderChoices() {
  choiceBox.classList.toggle('bc-hidden', !q.choices);
  if (!q.choices) { choiceBox.replaceChildren(); return; }
  choiceBox.dataset.n = q.choices.length;
  choiceBox.replaceChildren(...q.choices.map((id) => {
    const b = h('button', { className: 'ml-btn bc-choice' });
    b.dataset.id = id;
    if (q.level <= 3) {
      b.append(h('span', { textContent: ivName(id) }));
      if (q.level === 2) b.append(unitStrip(IV[id].semi));
    } else {
      b.append(h('b', { textContent: CH[id].sym || (game.lang === 'fr' ? 'Maj' : 'Maj') }), h('small', { textContent: game.tr(CH[id]) }));
    }
    b.onclick = () => answerName(id, b);
    return b;
  }));
}

// ---------- rounds ----------
async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(cfg.skill);
  if (id !== seq) return;
  const [fItem, fMode] = (forced.shift() ?? '').split('@');
  const item = fItem || pickWeak(cfg.items, stats, { avoid: last });
  last = item;
  q = makeQuestion(item, level, fMode);
  missed = false;
  locked = false;
  done = false;
  count++;
  render();
  hear();
  started = performance.now();
}

function record(ok) {
  return { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: q.mode };
}

async function success() {
  locked = true;
  clearTimeout(timer);
  const my = seq;
  done = true;
  q.latched = new Set(q.notes);
  titleEl.textContent = titleText();
  hintEl.textContent = '';
  replay.classList.toggle('bc-small', true);
  stripBox.replaceChildren(...(q.level >= 2 ? [stripEl(q.strip)] : []));
  paint();
  if (missed) game.flash(true);
  else {
    streak++;
    if (streak >= STREAK_UP) {
      if (q.level < MAX_LEVEL) nextBtn.classList.add('bc-show');
      else if (streak === STREAK_UP) game.celebrate(game.t('top'));
    }
    await game.attempt(record(true));
  }
  await playSeq(q.played, { bpm: q.level <= 3 ? 110 : 150 });
  await wait(500);
  if (my === seq) next();
}

async function failure(bad) {
  streak = 0;
  nextBtn.classList.remove('bc-show');
  for (const m of bad) {
    const k = kb.el.querySelector(`[data-midi="${m}"]`);
    if (!k) continue;
    k.classList.add('bc-bad');
    setTimeout(() => k.classList.remove('bc-bad'), 700);
  }
  if (missed) game.flash(false);
  else { missed = true; await game.attempt(record(false)); }
}

function onKey(midi) {
  if (locked || !q || q.mode === 'name') return;
  if (q.mode === 'build') {
    if (midi === q.given) return;
    if (q.latched.has(midi)) q.latched.delete(midi); else q.latched.add(midi);
    paint();
    if (q.latched.size === q.notes.length) {
      if (q.notes.every((m) => q.latched.has(m))) success();
      else {
        locked = true;
        failure([...q.latched].filter((m) => !q.notes.includes(m)));
        const my = seq;
        timer = setTimeout(() => { if (my !== seq) return; q.latched = new Set([q.given]); paint(); locked = false; }, 900);
      }
    }
    return;
  }
  // Intervals: one tap on the second note.
  if (midi === q.root) return;
  if (midi === q.target) success();
  else {
    locked = true;
    failure([midi]);
    const my = seq;
    timer = setTimeout(() => { if (my !== seq) return; locked = false; hear(); }, 800);
  }
}

function answerName(id, button) {
  if (locked || !q || button.disabled) return;
  if (id === q.answer) { button.classList.add('ml-right'); success(); return; }
  button.classList.add('ml-wrong');
  button.disabled = true;
  if (missed) choiceBox.querySelector(`[data-id="${q.answer}"]`)?.classList.add('ml-reveal'); // 2nd miss: show the answer
  failure([]);
}

window.__test = {
  force: (items) => { forced.push(...items); },
  state: () => q && ({
    n: count, level: q.level, item: q.item, id: q.id, mode: q.mode, locked, missed, done,
    root: q.root, dir: q.dir ?? 0, inv: q.inv ?? 0, notes: q.notes, given: q.given ?? q.root, target: q.target ?? null,
    lit: q.lit, latched: [...q.latched].sort((a, b) => a - b), choices: q.choices, answer: q.answer, window: q.window,
    played: q.played, nextShown: nextBtn.classList.contains('bc-show'), title: titleEl.textContent,
  }),
};

game.ready().then(() => {
  game.stage.replaceChildren(head, stripBox, kbBox, choiceBox, nextBtn);
  shownLevel = +game.settings.level;
  game.on('settings', () => {
    if (+game.settings.level !== shownLevel) { shownLevel = +game.settings.level; streak = 0; nextBtn.classList.remove('bc-show'); next(); } else render();
  });
  game.on('lang', () => render());
  next();
});
