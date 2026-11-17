// Transpose: read a part written for a transposing instrument and play (or pick) what sounds.
import { createGame } from '@core/shell.js';
import { renderStaff, CLEFS } from '@core/staff.js';
import { createKeyboard } from '@core/keyboard.js';
import { playSeq, playNote } from '@core/audio.js';
import { INTERVALS, LETTERS, naturalMidi, isNatural, mod, rand, pick, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'score-reading',
  title: L('Change the key', 'Change de tonalité'),
  strings: {
    inst: L('in {n}', 'en {n}'),
    gap1: L('a whole tone lower', 'un ton plus bas'),
    nextLevel: L('Next level →', 'Niveau suivant →'),
    replay: L('Hear it again', 'Réécouter'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · B♭ instrument: play what sounds', '1 · Instrument en si♭ : joue le son réel') },
      { value: 2, label: L('2 · E♭ and F instruments', '2 · Instruments en mi♭ et en fa') },
      { value: 3, label: L('3 · Reverse: pick the written note', '3 · À l’envers : choisis la note écrite') },
      { value: 4, label: L('4 · Two clefs: play the marked staff', '4 · Deux clés : joue la portée marquée') },
      { value: 5, label: L('5 · Transpose a motif by an interval', '5 · Transpose un motif d’un intervalle') },
      { value: 6, label: L('6 · Motif with a key signature (B♭ or E♭)', '6 · Motif avec armure (si♭ ou mi♭)') },
    ] },
    { key: 'hear', label: L('Hear the notes', 'Entendre les notes'), type: 'toggle', default: true },
  ],
});
const { h } = game;

const SKILL = 'read.score';
const MAX_LEVEL = 6, STREAK_UP = 8, INTRO_ROUNDS = 3, MAX_WHITES = 12;
// Written note -> sounding note: `steps` letters and `semis` semitones lower.
const INST = {
  Bb: { semis: -2, steps: -1, name: L('B♭', 'si♭') },
  Eb: { semis: -9, steps: -5, name: L('E♭', 'mi♭') },
  F: { semis: -7, steps: -4, name: L('F', 'fa') },
};
// Letters are indexes in C D E F G A B. Orders of the signature (F C G D A E B / B E A D G C F).
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
const altered = (n) => (n > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(n));
const altOf = (letter, n) => (altered(n).includes(letter) ? Math.sign(n) : 0);
// Signature of the sounding key = written signature moved by this many fifths.
const SIG_SHIFT = { Bb: -2, Eb: -3, F: -1 };

// A note is { step (C4 = 28), acc, midi }.
const letterOf = (step) => mod(step, 7);
const natural = (step) => naturalMidi(letterOf(step), Math.floor(step / 7));
const note = (step, acc = 0) => ({ step, acc, midi: natural(step) + acc });
/** Same note moved by `steps` letters and `semis` semitones; the accidental follows. */
const moved = (n, steps, semis) => { const step = n.step + steps; return note(step, n.midi + semis - natural(step)); };
const valid = (n) => Math.abs(n.acc) <= 1 && n.step >= 26 && n.step <= 42;
const keyOf = (n) => `${n.step}:${n.acc}`;

/** White-key window that holds [lo, hi] midi, from a white key to a white key. */
function windowFor(lo, hi) {
  let from = lo, to = hi;
  while (!isNatural(from)) from--;
  while (!isNatural(to)) to++;
  return [from, to];
}
const whitesIn = ([a, b]) => { let n = 0; for (let m = a; m <= b; m++) if (isNatural(m)) n++; return n; };

// ---------- questions ----------
function pool(level) {
  if (level === 1) return [{ item: 'Bb', inst: 'Bb' }];
  if (level === 2) return ['Eb', 'F'].map((inst) => ({ item: inst, inst }));
  if (level === 3) return ['Bb', 'Eb', 'F'].map((inst) => ({ item: inst + ':r', inst }));
  if (level === 4) return Object.keys(CLEFS).map((c) => ({ item: 'clef:' + c, clef: c }));
  if (level === 5) return ['up', 'down'].flatMap((dir) => IVL.map((v) => ({ item: `${dir}:${v.id}`, dir: dir === 'up' ? 1 : -1, ivl: v })));
  return ['Bb', 'Eb'].map((inst) => ({ item: inst + ':key', inst }));
}
const ivl = (id, steps) => ({ ...INTERVALS.find((i) => i.id === id), steps });
const IVL = [ivl('M2', 1), ivl('m3', 2), ivl('M3', 2), ivl('P4', 3), ivl('P5', 4)];

let lastStep = null;
/** Written steps of levels 1-3: E4 to E5. */
function writtenNote(inst) {
  let st;
  do st = 30 + rand(8); while (st === lastStep);
  lastStep = st;
  return note(st);
}

function makeQuestion(level, stats, last, intro) {
  const base = pickWeak(pool(level), stats, { keyOf: (x) => x.item, avoid: last });
  const q = { ...base, level, kind: 'play' };
  if (level <= 2) {
    const I = INST[q.inst];
    q.written = writtenNote(q.inst);
    q.sounding = moved(q.written, I.steps, I.semis);
    q.exp = [q.sounding.midi];
    q.win = windowFor(natural(30) + I.semis - 1, natural(37) + I.semis + 1);
    q.intro = level === 1 && intro > 0;
  } else if (level === 3) {
    const I = INST[q.inst];
    q.kind = 'pick';
    let st;
    do st = 28 + rand(39 - 28 + 1 + I.steps); while (st === lastStep);
    lastStep = st;
    q.sounding = note(st);
    q.written = moved(q.sounding, -I.steps, -I.semis);
    const wrongWay = moved(q.sounding, I.steps, I.semis);
    const others = Object.keys(INST).filter((k) => k !== q.inst).map((k) => moved(q.sounding, -INST[k].steps, -INST[k].semis));
    const cands = [q.sounding, wrongWay, ...others, note(q.written.step + 1), note(q.written.step - 1), note(q.written.step + 2), note(q.written.step - 2)];
    const seen = new Set([q.written.midi]);
    const wrong = [];
    for (const c of shuffle(cands)) if (valid(c) && !seen.has(c.midi) && (seen.add(c.midi), wrong.push(c)) && wrong.length === 3) break;
    q.options = shuffle([q.written, ...wrong]);
    q.exp = [];
  } else if (level === 4) {
    q.kind = 'two';
    const other = pick(Object.keys(CLEFS).filter((c) => c !== q.clef));
    const clefs = shuffle([q.clef, other]);
    q.staves = clefs.map((c) => {
      const b = CLEFS[c].bottom;
      return { clef: c, ...note(b - 2 + rand(13)), marked: c === q.clef };
    });
    if (Math.random() < 0.4) { // same place on both staves, different sound
      const [a, b] = q.staves;
      const pos = a.step - CLEFS[a.clef].bottom;
      if (pos >= -2 && pos <= 10) Object.assign(b, note(CLEFS[b.clef].bottom + pos));
    }
    const m = q.staves.find((s) => s.marked);
    q.exp = [m.midi];
    const lo = m.midi - 2 - rand(7), hi = lo + 14;
    const w = windowFor(lo, hi);
    while (whitesIn(w) > MAX_WHITES) w[1]--;
    while (!isNatural(w[1])) w[1]--;
    q.win = w;
  } else if (level === 5) {
    q.kind = 'motif';
    const n = 3 + rand(2);
    while (!q.source) {
      const steps = [28 + rand(11)];
      while (steps.length < n) {
        const s = steps.at(-1) + pick([-2, -1, 1, 2]);
        if (s < 28 || s > 40) { steps.length = 1; continue; }
        steps.push(s);
      }
      if (Math.max(...steps) - Math.min(...steps) > 6 || new Set(steps).size < 3) continue;
      const src = steps.map((s) => note(s));
      const dst = src.map((s) => moved(s, q.dir * q.ivl.steps, q.dir * q.ivl.semi));
      if (!dst.every(valid)) continue;
      q.source = src; q.target = dst; break;
    }
    q.exp = q.target.map((t) => t.midi);
    q.win = windowFor(Math.min(...q.exp) - 3, Math.max(...q.exp) + 3);
    q.sig = 0;
  } else {
    q.kind = 'motif';
    const I = INST[q.inst];
    const lo = 28 - I.steps;
    const w = (q.inst === 'Bb' ? -3 : -2) + rand(q.inst === 'Bb' ? 8 : 7); // written signature -3..4 / -2..4
    q.sig = w + SIG_SHIFT[q.inst];
    const steps = [lo + 1 + rand(6)];
    while (steps.length < 4) {
      const s = steps.at(-1) + pick([-2, -1, 1, 2]);
      if (s < lo || s > lo + 7) continue;
      steps.push(s);
    }
    q.writtenSig = w;
    q.source = steps.map((s) => note(s, altOf(letterOf(s), w)));
    q.target = q.source.map((n) => moved(n, I.steps, I.semis));
    q.exp = q.target.map((t) => t.midi);
    q.win = windowFor(Math.min(...q.exp) - 2, Math.max(...q.exp) + 2);
  }
  if (q.win) while (whitesIn(q.win) > MAX_WHITES) q.win[1]--;
  return q;
}

// ---------- screen ----------
const label = h('p', { className: 'ml-hint sr-label' });
const hint = h('p', { className: 'ml-hint sr-gap' });
const staves = h('div', { className: 'sr-staves' });
const answerBox = h('div', { className: 'sr-answer' });
const kbBox = h('div', { style: 'width:100%' });
const offerBtn = h('button', { className: 'ml-btn ml-primary sr-offer sr-off' });
const replayBtn = h('button', { className: 'ml-round sr-replay', textContent: '▶' });

let started = false, q = null, gen = 0, locked = true, missed = false, wrongs = 0, t0 = 0, streak = 0, last = null;
let kb = null, kbWin = '', pos = 0, intro = INTRO_ROUNDS;

/** A staff cut close to the lines. */
function drawStaff(box, opts) {
  const gap = 12;
  const svg = renderStaff(box, { ...opts, gap });
  svg.setAttribute('viewBox', `0 ${gap * 1.8} ${opts.width} ${gap * 11}`);
  return svg;
}
const spellOf = (n) => [{ step: n.step, acc: n.acc }];
const headOf = (n, extra = {}) => ({ midi: n.midi, spell: spellOf(n), ...extra });
const holder = (cls) => h('div', { className: 'sr-staff ' + (cls || '') });

function showKeyboard() {
  const key = q.win.join('-');
  if (!kb || key !== kbWin || !kbBox.isConnected) {
    kbWin = key;
    kb = createKeyboard(kbBox, { from: q.win[0], to: q.win[1], sound: !!game.settings.hear, onDown: onKey });
  }
  if (answerBox.firstChild !== kbBox) answerBox.replaceChildren(kbBox);
}

function drawTarget(done) {
  const box = staves.querySelector('.sr-target');
  if (!box) return;
  const notes = q.target.map((t, i) => headOf(t, { acc: q.level === 6 ? false : undefined, color: i < pos ? (done ? 'var(--good)' : undefined) : 'transparent' }));
  drawStaff(box, { clef: 'treble', keySig: q.sig, notes, width: 260 });
}

function render() {
  if (!q) return;
  offerBtn.textContent = game.t('nextLevel');
  replayBtn.setAttribute('aria-label', game.t('replay'));
  offerBtn.classList.toggle('sr-off', !(streak >= STREAK_UP && q.level < MAX_LEVEL));
  const withInst = q.inst != null;
  label.textContent = withInst ? (q.kind === 'pick' ? '→ ' : '') + game.t('inst', { n: INST[q.inst].name[game.lang] }) : q.kind === 'motif' && q.level === 5 ? `${q.dir > 0 ? '↑' : '↓'} ${q.ivl[game.lang]}` : '';
  label.hidden = !label.textContent;
  hint.textContent = q.intro ? '↓ ' + game.t('gap1') : '';
  hint.hidden = !q.intro;
  if (q.kind === 'play') {
    const a = holder();
    staves.replaceChildren(a);
    drawStaff(a, { clef: 'treble', notes: [headOf(q.written)], width: 250 });
    showKeyboard();
    if (q.intro) kb.flash(q.written.midi, 'ml-hint', 60000);
  } else if (q.kind === 'pick') {
    const a = holder();
    staves.replaceChildren(a);
    drawStaff(a, { clef: 'treble', notes: [headOf(q.sounding)], width: 250 });
    const grid = h('div', { className: 'sr-choices' }, ...q.options.map((o) => {
      const b = h('button', { className: 'ml-btn' });
      b.dataset.key = keyOf(o);
      drawStaff(b, { clef: 'treble', notes: [headOf(o)], width: 150 });
      b.setAttribute('aria-label', game.t('inst', { n: INST[q.inst].name[game.lang] }));
      b.onclick = () => answerPick(keyOf(o) === keyOf(q.written), b);
      return b;
    }));
    answerBox.replaceChildren(grid);
  } else if (q.kind === 'two') {
    staves.replaceChildren(...q.staves.map((s) => {
      const box = holder(s.marked ? 'sr-marked' : '');
      box.dataset.clef = s.clef;
      drawStaff(box, { clef: s.clef, notes: [headOf(s, { color: s.marked ? 'var(--accent)' : undefined })], width: 250 });
      return box;
    }));
    showKeyboard();
  } else {
    const a = holder('sr-source'), b = holder('sr-target');
    staves.replaceChildren(a, b);
    drawStaff(a, { clef: 'treble', keySig: q.level === 6 ? q.writtenSig : 0, notes: q.source.map((n) => headOf(n, { acc: q.level === 6 ? false : undefined })), width: 260 });
    a.append(replayBtn);
    drawTarget();
    showKeyboard();
  }
}

// ---------- rounds ----------
async function next() {
  const my = ++gen;
  locked = true;
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const stats = await loadItemMastery(SKILL);
  if (my !== gen) return;
  q = makeQuestion(level, stats, last, intro);
  last = q.item;
  if (q.intro) intro--;
  missed = false;
  wrongs = 0;
  pos = 0;
  kb?.el.querySelectorAll('.ml-hint').forEach((k) => k.classList.remove('ml-hint'));
  render();
  if (game.settings.hear) {
    if (q.kind === 'motif') playSeq(q.source.map((n) => n.midi), { bpm: 200 });
    else if (q.intro) playNote(q.written.midi, { dur: 0.6 });
  }
  t0 = performance.now();
  locked = false;
}

/** Only the first answer of a question is logged. A wrong answer is followed by a retry. */
async function judge(ok, silent) {
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - t0), level: q.level, item: q.item, silent };
  if (ok) {
    locked = true;
    if (missed) return game.flash(true, { silent });
    streak++;
    offerBtn.classList.toggle('sr-off', !(streak >= STREAK_UP && q.level < MAX_LEVEL));
    return game.attempt(rec);
  }
  streak = 0;
  wrongs++;
  offerBtn.classList.add('sr-off');
  if (missed) return game.flash(false, { silent });
  missed = true;
  return game.attempt(rec);
}

async function onKey(midi) {
  if (locked || !q || q.kind === 'pick') return;
  const my = gen;
  if (midi === q.exp[pos]) {
    kb.flash(midi, 'ml-good', 450);
    pos++;
    if (q.kind === 'motif') drawTarget(pos === q.exp.length);
    if (pos < q.exp.length) return;
    if (q.kind === 'play') drawStaff(staves.firstChild, { clef: 'treble', notes: [headOf(q.written, { color: 'var(--good)' })], width: 250 });
    await judge(true, true); // the key already made its sound
    if (my !== gen) return;
    if (q.kind === 'motif' && game.settings.hear) await playSeq(q.exp, { bpm: 200 });
    else await new Promise((r) => setTimeout(r, 550));
    if (my === gen) next();
  } else {
    kb.flash(midi, 'ml-bad', 400);
    await judge(false, true);
    if (my !== gen) return;
    if (wrongs >= 2) kb.flash(q.exp[pos], 'ml-hint', 900);
  }
}

async function answerPick(ok, button) {
  if (locked || button.disabled) return;
  const my = gen;
  if (!ok) {
    button.classList.add('ml-wrong');
    button.disabled = true;
    return judge(false);
  }
  button.classList.add('ml-right');
  const hear = !!game.settings.hear;
  await judge(true, hear);
  if (hear) await playSeq([q.sounding.midi], { bpm: 120 });
  else await new Promise((r) => setTimeout(r, 600));
  if (my === gen) next();
}

game.on('settings', () => { if (started) { streak = 0; intro = INTRO_ROUNDS; next(); } });
game.on('lang', () => { if (started) render(); });
offerBtn.onclick = () => { if (+game.settings.level < MAX_LEVEL) game.set('level', +game.settings.level + 1); };
replayBtn.onclick = () => { if (q?.kind === 'motif') playSeq(q.source.map((n) => n.midi), { bpm: 200 }); };

window.__test = {
  state: () => q && ({
    level: q.level, item: q.item, kind: q.kind, inst: q.inst, locked, streak, pos, intro: !!q.intro,
    written: q.written && { ...q.written }, sounding: q.sounding && { ...q.sounding },
    exp: q.exp, win: q.win, sig: q.sig, writtenSig: q.writtenSig, clef: q.clef,
    source: q.source?.map((n) => ({ ...n })), target: q.target?.map((n) => ({ ...n })),
    staves: q.staves?.map((s) => ({ ...s })), dir: q.dir, ivl: q.ivl?.id,
    options: q.options?.map((o) => ({ ...o })), answer: q.written && keyOf(q.written),
  }),
  letters: LETTERS.en,
};

game.ready().then(() => {
  started = true;
  game.stage.replaceChildren(label, hint, staves, answerBox, offerBtn);
  next();
});
