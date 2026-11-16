// Music words: loud or soft, short or smooth, fast or slow, first by ear, then the signs and the Italian terms.
import { createGame } from '@core/shell.js';
import { playNote, click } from '@core/audio.js';
import { pick, rand, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const game = createGame({
  id: 'music-words',
  title: L('Music words', 'Les mots de la musique'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    louder: L('Which is louder?', 'Lequel est plus fort ?'),
    softer: L('Which is softer?', 'Lequel est plus doux ?'),
    faster: L('Which is faster?', 'Lequel est plus rapide ?'),
    slower: L('Which is slower?', 'Lequel est plus lent ?'),
    order: L('Slowest first', 'Du plus lent au plus rapide'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Louder, faster?', '1 · Plus fort, plus vite ?') },
      { value: 2, label: L('2 · Short, smooth, louder, softer', '2 · Piqué, lié, crescendo, decrescendo') },
      { value: 3, label: L('3 · Pick the sign', '3 · Choisis le signe') },
      { value: 4, label: L('4 · Dynamics: pp to ff', '4 · Nuances : pp à ff') },
      { value: 5, label: L('5 · Tempo terms', '5 · Termes de tempo') },
      { value: 6, label: L('6 · Expression terms', '6 · Termes d’expression') },
    ] },
  ],
});

const TUNES = [[0, 2, 4, 7, 9, 7, 4], [9, 7, 4, 2, 0, 2, 4], [0, 4, 2, 7, 4, 9, 7], [4, 7, 9, 7, 4, 2, 0], [7, 9, 12, 9, 7, 4, 2]];
const ART = { staccato: 0.22, normal: 0.7, legato: 1.08 };
const DYN = [['pp', 'pianissimo', 0.05], ['p', 'piano', 0.09], ['mp', 'mezzo piano', 0.15], ['mf', 'mezzo forte', 0.25], ['f', 'forte', 0.4], ['ff', 'fortissimo', 0.62]];
const TEMPO = [['largo', 50], ['adagio', 66], ['andante', 84], ['moderato', 104], ['allegro', 132], ['presto', 176]];
const DEFS = {
  staccato: L('Short, detached notes.', 'Notes courtes et détachées.'),
  legato: L('Smooth, notes joined together.', 'Notes liées, sans coupure.'),
  accent: L('Play this note with more force.', 'Jouer cette note avec plus de force.'),
  fermata: L('Hold the note longer than written.', 'Tenir la note plus longtemps que sa valeur.'),
  ritardando: L('Gradually slow down.', 'Ralentir peu à peu.'),
  accelerando: L('Gradually speed up.', 'Accélérer peu à peu.'),
  'da capo': L('Go back to the beginning.', 'Retourner au début.'),
  coda: L('The closing section of the piece.', 'La conclusion du morceau.'),
};
const TERMS = Object.keys(DEFS);
const SPECS = {
  p: { gain: 0.08 }, f: { gain: 0.55 },
  staccato: { art: 'staccato', gain: 0.3 }, legato: { art: 'legato', gain: 0.3 },
  cresc: { dyn: 'cresc' }, dim: { dyn: 'dim' },
  accent: { accent: 2, gain: 0.2 }, fermata: { fermata: 3, gain: 0.3 },
  ritardando: { tempo: 'rit', gain: 0.3 }, accelerando: { tempo: 'accel', gain: 0.3 },
};
const SKILL = { listen: 'listen.expression', read: 'read.expression' };
const LEVELS = {
  1: { skill: SKILL.listen, items: ['louder', 'softer', 'faster', 'slower'] },
  2: { skill: SKILL.listen, items: ['staccato', 'legato', 'cresc', 'dim'] },
  3: { skill: SKILL.listen, items: ['p', 'f', 'staccato', 'legato', 'cresc', 'dim'] },
  4: { skill: SKILL.read, items: DYN.map((d) => d[0]) },
  5: { skill: SKILL.read, items: TEMPO.map((d) => d[0]) },
  6: { skill: SKILL.read, items: TERMS },
};

const svg = (inner) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICON = {
  staccato: svg('<circle cx="14" cy="34" r="4" fill="currentColor"/><circle cx="32" cy="34" r="4" fill="currentColor"/><circle cx="50" cy="34" r="4" fill="currentColor"/>'),
  legato: svg('<path d="M8 38Q32 8 56 38"/><circle cx="14" cy="46" r="5" fill="currentColor"/><circle cx="50" cy="46" r="5" fill="currentColor"/>'),
  cresc: svg('<path d="M8 32L56 14M8 32L56 50"/>'),
  dim: svg('<path d="M8 14L56 32L8 50"/>'),
  accent: svg('<path d="M14 10L46 22L14 34"/><circle cx="30" cy="50" r="6" fill="currentColor"/>'),
  fermata: svg('<path d="M10 40Q32 4 54 40"/><circle cx="32" cy="42" r="4" fill="currentColor"/>'),
  coda: svg('<circle cx="32" cy="32" r="15"/><path d="M32 6V58M6 32H58"/>'),
  'da capo': '<i class="mw-sign">D.C.</i>',
};
const NAME = {
  staccato: L('Short', 'Piqué'), legato: L('Smooth', 'Lié'), cresc: L('Getting louder', 'De plus en plus fort'), dim: L('Getting softer', 'De plus en plus doux'),
  p: L('Soft', 'Doux'), f: L('Loud', 'Fort'),
};
const sign = (s) => `<i class="mw-sign">${s}</i>`;
const iconOf = (id) => ICON[id] || sign(id);
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';

/** Notes with their start time, length and gain, from a few musical parameters. */
function plan(spec) {
  const { tune, bpm = 100, gain = 0.25, art = 'normal', dyn = null, accent = -1, fermata = -1, tempo = null } = spec;
  const beat = 60 / bpm, n = tune.length;
  let t = 0;
  const notes = tune.map((m, i) => {
    let scale = 1;
    if (tempo === 'rit') scale = 1 + Math.max(0, i - 2) * 0.5;
    if (tempo === 'accel') scale = Math.max(0.4, 1.6 - 0.2 * i);
    const hold = fermata === i ? 3 : 1;
    let g = gain;
    if (dyn === 'cresc') g = 0.05 * Math.pow(10, i / (n - 1));
    if (dyn === 'dim') g = 0.5 * Math.pow(0.1, i / (n - 1));
    if (accent === i) g *= 2.4;
    const note = { m, when: t, dur: beat * scale * hold * ART[art], gain: g };
    t += beat * scale * hold;
    return note;
  });
  return { notes, end: t, bpm, art };
}
const playPlan = (p, off) => p.notes.forEach((n) => playNote(n.m, { when: off + n.when, dur: n.dur, gain: n.gain }));

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0, flip = 0, forced = null;
const timers = [];
const card = game.h('div', { className: 'mw-card' });
const prompt = game.h('p', { className: 'ml-prompt' });
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const choices = game.h('div', { className: 'mw-choices' });
const def = game.h('p', { className: 'mw-def' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary mw-next' });
replay.onclick = () => play();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play() {
  if (!q || !q.plans.length) return;
  const now = performance.now();
  if (now < quietUntil - 150) return;
  let off = 0;
  q.plans.forEach((p, k) => {
    playPlan(p, off);
    if (q.level === 1) {
      const b = choices.children[k];
      timers.push(setTimeout(() => b && b.classList.add('mw-lit'), off * 1000));
      timers.push(setTimeout(() => b && b.classList.remove('mw-lit'), (off + p.end) * 1000));
    }
    off += p.end + 0.7;
  });
  quietUntil = now + (off + 0.3) * 1000;
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  replay.style.visibility = q.plans.length ? 'visible' : 'hidden';
  nextBtn.textContent = game.t('next');
  prompt.textContent = q.prompt ? game.t(q.prompt) : '';
  prompt.style.display = q.prompt ? '' : 'none';
  card.innerHTML = q.card || '';
  choices.style.setProperty('--cols', q.cols);
  choices.classList.toggle('mw-big', q.level === 1);
  choices.replaceChildren(...q.buttons.map((bt) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (bt.html) { b.classList.add('mw-ic'); b.innerHTML = bt.html; } else b.textContent = bt.text;
    if (bt.aria) b.setAttribute('aria-label', game.tr(bt.aria));
    b.dataset.id = bt.id;
    b.onclick = () => answer(bt.id, b);
    return b;
  }));
  if (q.order && q.pos) q.order.slice(0, q.pos).forEach((id, i) => mark(choices.querySelector(`[data-id="${id}"]`), i + 1));
}
function mark(b, n) {
  b.classList.add('ml-right');
  b.disabled = true;
  b.append(game.h('span', { className: 'mw-badge', textContent: String(n) }));
}

function build(level, item, mode) {
  const cfg = LEVELS[level];
  const root = 55 + rand(8);
  const tune = pick(TUNES).map((m) => m + root);
  const base = { level, skill: cfg.skill, item, plans: [], prompt: null, card: '', cols: 2, mode: null, answer: item };
  const P = (extra) => plan({ tune, ...extra });
  if (level === 1) {
    const hi = { louder: { gain: 0.45 }, softer: { gain: 0.1 }, faster: { bpm: 150 }, slower: { bpm: 75 } };
    const lo = { louder: { gain: 0.1 }, softer: { gain: 0.45 }, faster: { bpm: 75 }, slower: { bpm: 150 } };
    const idx = rand(2);
    const target = P(hi[item]), other = P(lo[item]);
    return { ...base, plans: idx === 0 ? [target, other] : [other, target], answer: String(idx + 1), prompt: item, cols: 2,
      buttons: [{ id: '1', text: '1' }, { id: '2', text: '2' }] };
  }
  if (level === 2 || level === 3) {
    const ids = cfg.items;
    return { ...base, plans: [P({ bpm: 100, ...SPECS[item] })], cols: level === 2 ? 2 : 3,
      buttons: ids.map((id) => ({ id, html: iconOf(id), aria: NAME[id] })) };
  }
  if (level === 4) {
    const gain = DYN.find((d) => d[0] === item)[2];
    const word = (id) => DYN.find((d) => d[0] === id)[1];
    const sw = mode === 'sw';
    return { ...base, mode, plans: [P({ gain })], card: sw ? sign(item) : `<span class="mw-word">${word(item)}</span>`, cols: 2,
      buttons: DYN.map(([id, w]) => (sw ? { id, text: w } : { id, html: sign(id), aria: L(w, w) })) };
  }
  if (level === 5) {
    const buttons = TEMPO.map(([id]) => ({ id, text: id }));
    if (item === 'order') {
      let order;
      do order = shuffle(TEMPO).slice(0, 4); while (order.every((t, i, a) => !i || a[i - 1][1] < t[1]));
      const ids = order.map((t) => t[0]);
      return { ...base, item: 'order', mode: 'order', order: [...order].sort((a, b) => a[1] - b[1]).map((t) => t[0]), pos: 0, prompt: 'order', cols: 2,
        buttons: ids.map((id) => ({ id, text: id })) };
    }
    const bpm = TEMPO.find((t) => t[0] === item)[1];
    return { ...base, mode: 'match', plans: [plan({ tune: tune.slice(0, 5), bpm, gain: 0.3 })], buttons };
  }
  const symbol = ['accent', 'fermata', 'staccato', 'legato', 'da capo', 'coda'];
  const see = item === 'da capo' || item === 'coda' || (symbol.includes(item) && mode === 'see');
  return { ...base, mode: see ? 'see' : 'hear', plans: see ? [] : [P({ bpm: 120, ...SPECS[item] })], card: see ? iconOf(item) : '', def: item,
    buttons: TERMS.map((id) => ({ id, text: id })) };
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  timers.splice(0).forEach(clearTimeout);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(cfg.skill);
  if (id !== seq) return;
  let item, mode = null;
  const f = forced; forced = null;
  if (f && cfg.items.concat('order').includes(f.item)) { item = f.item; mode = f.mode || null; }
  else {
    if (level === 5 && flip++ % 2) item = 'order';
    else item = pickWeak(cfg.items, stats, { avoid: last });
  }
  last = item;
  if (!mode) mode = level === 4 ? pick(['sw', 'ws']) : level === 6 ? pick(['hear', 'see']) : null;
  q = build(level, item, mode);
  missed = false;
  locked = false;
  def.textContent = '';
  render();
  quietUntil = 0;
  play();
  started = performance.now();
}

async function answer(id, button) {
  if (locked || button.disabled) return;
  const order = q.mode === 'order';
  const ok = id === (order ? q.order[q.pos] : q.answer);
  const rec = { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : id };
  clearTimeout(timer);
  if (order) {
    const bpm = TEMPO.find((t) => t[0] === id)[1];
    for (let i = 0; i < 3; i++) click({ when: (i * 60) / bpm, accent: i === 0 });
  }
  if (ok) {
    if (order && q.pos < q.order.length - 1) { mark(button, ++q.pos); return; }
    locked = true;
    if (order) mark(button, ++q.pos); else button.classList.add('ml-right');
    if (missed) game.flash(true);
    else {
      streak++;
      if (streak >= 8) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('mw-show');
        else if (streak === 8) game.say(game.t('top'));
      }
      await game.attempt(rec);
    }
    if (q.def) {
      def.replaceChildren(game.h('b', { textContent: q.def }), ' · ' + game.tr(DEFS[q.def]));
      timer = setTimeout(next, 2800);
    } else timer = setTimeout(next, 900);
  } else {
    streak = 0;
    nextBtn.classList.remove('mw-show');
    if (order) { button.classList.add('ml-wrong'); setTimeout(() => button.classList.remove('ml-wrong'), 450); }
    else { button.classList.add('ml-wrong'); button.disabled = true; }
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    if (!order) timer = setTimeout(() => { quietUntil = 0; play(); }, 700);
  }
}

window.__test = {
  state: () => (q ? { level: q.level, item: q.item, mode: q.mode, answer: q.answer, order: q.order, pos: q.pos, plans: q.plans, ids: q.buttons.map((b) => b.id) } : {}),
  force: (item, mode) => { forced = { item, mode }; },
};

game.ready().then(() => {
  game.stage.replaceChildren(card, prompt, replay, choices, def, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('mw-show'); next(); });
  game.on('lang', render);
  next();
});
