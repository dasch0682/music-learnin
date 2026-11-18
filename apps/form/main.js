// Phrases and form: same or different, question or answer, then the shape of a whole tune.
// Tunes are built from short generated phrases (2 bars, pentatonic or major).
import { createGame } from '@core/shell.js';
import { playNote } from '@core/audio.js';
import { mod, pick, rand } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6;
const SKILL = 'listen.form';
const game = createGame({
  id: 'form',
  title: L('Spot the phrases', 'Repère les phrases'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    same: L('Same', 'Pareil'),
    different: L('Different', 'Différent'),
    settled: L('Settled', 'Posé'),
    hanging: L('Hanging', 'Suspendu'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Same or different', '1 · Pareil ou différent') },
      { value: 2, label: L('2 · Question or answer', '2 · Question ou réponse') },
      { value: 3, label: L('3 · Build the form with blocks', '3 · Construis la forme avec des blocs') },
      { value: 4, label: L('4 · Varied repeats', '4 · Reprises variées') },
      { value: 5, label: L('5 · Name the form', '5 · Nomme la forme') },
      { value: 6, label: L('6 · Bars and modulation', '6 · Mesures et modulation') },
    ] },
    { key: 'tempo', label: L('Tempo', 'Tempo'), type: 'range', min: 100, max: 200, step: 10, default: 150 },
  ],
});

const SC = { penta: [0, 2, 4, 7, 9], major: [0, 2, 4, 5, 7, 9, 11] };
const MID = [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [1.5, 0.5, 1, 1], [1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 2], [1, 2, 1], [1.5, 0.5, 2]];
const END = [[1, 1, 2], [2, 2], [1, 0.5, 0.5, 2], [0.5, 0.5, 1, 2]];
const FORMS3 = ['AAB', 'ABA', 'AABA', 'ABAB'];
const FORMS4 = ["AA'B", "ABA'", "AA'BA", "ABAA'", "AA'BA'"];
const NAMES = { binary: L('Binary', 'Binaire'), ternary: L('Ternary', 'Ternaire'), rondo: L('Rondo', 'Rondo'), variations: L('Theme and variations', 'Thème et variations') };
const LEVELS = {
  1: ['same', 'different'], 2: ['question', 'answer'], 3: FORMS3, 4: FORMS4,
  5: Object.keys(NAMES), 6: ['bars-4', 'bars-6', 'bars-8', 'modulation'],
};

const SETTLED = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52h48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="38" r="12" fill="currentColor"/></svg>';
const HANGING = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52h48" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 36v8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 7"/></svg>';
const SAME = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="18" cy="32" r="12" fill="currentColor"/><circle cx="46" cy="32" r="12" fill="currentColor"/></svg>';
const DIFF = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="18" cy="32" r="12" fill="currentColor"/><rect x="34" y="20" width="24" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="4"/></svg>';
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';

// ---- phrases ----
const sigOf = (p) => JSON.stringify([p.rhythm, p.degs]);
function genPhrase({ scaleId, bars = 2, ending = 'settled', needDeg = null }) {
  const len = SC[scaleId].length, fifth = SC[scaleId].indexOf(7);
  for (let tries = 0; tries < 500; tries++) {
    const rhythm = [];
    for (let b = 0; b < bars - 1; b++) rhythm.push(...pick(MID));
    rhythm.push(...pick(END));
    const n = rhythm.length, degs = new Array(n);
    degs[n - 1] = ending === 'settled' ? 0 : pick([1, fifth]);
    for (let i = n - 2; i >= 0; i--) degs[i] = Math.max(0, Math.min(len, degs[i + 1] + pick([-2, -1, -1, 1, 1, 2])));
    if (new Set(degs).size < 4 || degs.some((d, i) => i && d === degs[i - 1])) continue;
    if (needDeg != null && !degs.includes(needDeg)) continue;
    return { scaleId, bars, ending, rhythm, degs };
  }
  throw new Error('no phrase');
}
const sim = (a, b) => { const n = Math.min(a.degs.length, b.degs.length); let s = 0; for (let i = 0; i < n; i++) if (a.degs[i] === b.degs[i]) s++; return s / n; };
const distinct = (a, b) => JSON.stringify(a.rhythm) !== JSON.stringify(b.rhythm) && sim(a, b) < 0.4;
/** n phrases that all differ clearly from each other. */
function genSet(n, opts) {
  for (let tries = 0; tries < 300; tries++) {
    const set = [];
    for (let i = 0; i < n; i++) set.push(genPhrase(opts));
    if (set.every((a, i) => set.every((b, j) => j <= i || distinct(a, b)))) return set;
  }
  throw new Error('no set');
}
/** Same rhythm and ending, k inner notes moved by one step. */
function vary(p, k, avoid = []) {
  const len = SC[p.scaleId].length;
  for (let tries = 0; tries < 200; tries++) {
    const degs = [...p.degs], n = degs.length;
    const idx = [];
    while (idx.length < k) { const i = 1 + rand(n - 2); if (!idx.includes(i)) idx.push(i); }
    for (const i of idx) { const d = degs[i] + pick([-1, 1]); degs[i] = d < 0 ? 1 : d > len ? len - 1 : d; }
    const v = { ...p, degs };
    if (degs.some((d, i) => i && d === degs[i - 1])) continue;
    if (degs.filter((d, i) => d !== p.degs[i]).length === 0) continue;
    if (avoid.some((a) => sigOf(a) === sigOf(v))) continue;
    return v;
  }
  throw new Error('no variation');
}
function realize(p, root) {
  const sc = SC[p.scaleId], len = sc.length;
  const notes = p.degs.map((d, i) => ({ m: root + sc[mod(d, len)] + 12 * Math.floor(d / len), d: p.rhythm[i] }));
  const home = 36 + mod(root - 36, 12), dom = 36 + mod(root + 7 - 36, 12);
  const bass = new Array(p.bars).fill(home);
  if (p.ending === 'hanging') bass[p.bars - 1] = dom;
  else if (p.bars >= 3) bass[p.bars - 2] = dom;
  return { ...p, root, notes, bass, sig: sigOf(p) };
}

// ---- state and sound ----
let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0, forced = null;
const timers = [];
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const row = game.h('div', { className: 'fm-row' });
const pal = game.h('div', { className: 'fm-row fm-pal' });
const choices = game.h('div', { className: 'fm-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary fm-next' });
replay.onclick = () => play();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));
const beatLen = () => 60 / ((+game.settings.tempo || 150) * (q?.level === 6 ? 1.2 : 1));

/** Schedule phrases one after the other. Returns the length in seconds. */
function playPhrases(idx) {
  const beat = beatLen();
  let t = 0;
  for (const i of idx) {
    const p = q.phrases[i];
    p.notes.reduce((when, n) => { playNote(n.m, { when: t + when * beat, dur: n.d * beat * 0.92, gain: 0.3 }); return when + n.d; }, 0);
    p.bass.forEach((b, bar) => playNote(b, { when: t + bar * 4 * beat, dur: 3.8 * beat, gain: 0.3, timbre: 'bass' }));
    const el = q.blocks[i], len = p.bars * 4 * beat;
    timers.push(setTimeout(() => el && el.classList.add('fm-on'), t * 1000));
    timers.push(setTimeout(() => el && el.classList.remove('fm-on'), (t + len) * 1000));
    t += len;
  }
  quietUntil = performance.now() + (t + 0.3) * 1000;
  return t;
}
function play() {
  if (!q || performance.now() < quietUntil - 150) return;
  if (q.kind === 'fill' || q.kind === 'neutral' || q.kind === 'mod') playPhrases(q.phrases.map((_, i) => i));
  else playPhrases([0, ...(q.phrases.length > 1 ? [1] : [])]);
}
const playOne = (i) => { if (performance.now() >= quietUntil - 150) playPhrases([i]); };

// ---- building a question ----
function codeClass(code) { return `fm-c-${code[0]}${code.length > 1 ? ' fm-p' + (code.length - 1) : ''}`; }
const letter = (code) => code.replace(/'/g, (m, o) => '′');

function build(level, item) {
  const root = 55 + rand(8);
  const base = { level, item, answer: item, seq: [], phrases: [], pos: 0, ids: [] };
  if (level === 1) {
    const [a, b] = genSet(2, { scaleId: 'penta' });
    const ph = [a, item === 'same' ? a : b].map((p) => realize(p, root));
    return { ...base, kind: 'neutral', phrases: ph, seq: ['A', item === 'same' ? 'A' : 'B'], cols: 2,
      buttons: [{ id: 'same', html: SAME, aria: 'same' }, { id: 'different', html: DIFF, aria: 'different' }] };
  }
  if (level === 2) {
    const ph = [realize(genPhrase({ scaleId: pick(['penta', 'major']), ending: item === 'question' ? 'hanging' : 'settled' }), root)];
    return { ...base, kind: 'neutral', phrases: ph, cols: 2,
      buttons: [{ id: 'question', html: HANGING, aria: 'hanging' }, { id: 'answer', html: SETTLED, aria: 'settled' }] };
  }
  if (level === 3 || level === 4) {
    const codes = item.match(/[A-C]'?/g);
    const scaleId = pick(['penta', 'major']);
    const [A, B] = genSet(2, { scaleId });
    const map = { A, B, "A'": level === 4 ? vary(A, 2) : null };
    const ph = codes.map((c) => realize(map[c], root));
    return { ...base, kind: 'fill', seq: codes, phrases: ph, pos: 1, ids: level === 3 ? ['A', 'B'] : ['A', "A'", 'B'] };
  }
  if (level === 5) {
    const scaleId = pick(['penta', 'major']);
    const [A, B, C] = genSet(3, { scaleId });
    const A1 = vary(A, 2), A2 = vary(A, 3, [A1]);
    const map = { A, B, C, "A'": A1, "A''": A2 };
    const codes = { binary: pick([['A', 'B'], ['A', 'A', 'B', 'B']]), ternary: ['A', 'B', 'A'], rondo: ['A', 'B', 'A', 'C', 'A'], variations: ['A', "A'", "A''"] }[item];
    return { ...base, kind: 'neutral', seq: codes, phrases: codes.map((c) => realize(map[c], root)), cols: 2, reveal: true,
      buttons: Object.keys(NAMES).map((id) => ({ id, text: NAMES[id] })) };
  }
  if (item.startsWith('bars-')) {
    const bars = +item.slice(5);
    const p = realize(genPhrase({ scaleId: pick(['penta', 'major']), bars }), root);
    return { ...base, kind: 'bars', phrases: [p], answer: String(bars), cols: 3, buttons: [4, 6, 8].map((n) => ({ id: String(n), text: String(n) })) };
  }
  const A = genPhrase({ scaleId: 'major', needDeg: 3 });
  const m = 1 + rand(3);
  const ph = [0, 1, 2, 3].map((i) => realize(A, root + (i >= m ? 7 : 0)));
  return { ...base, kind: 'mod', phrases: ph, answer: String(m), modAt: m, buttons: [] };
}

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
  q.blocks = [];
  pal.replaceChildren();
  row.replaceChildren();
  choices.replaceChildren();
  if (q.kind !== 'bars') {
    q.phrases.forEach((_, i) => {
      const b = game.h('button', { className: 'fm-block' });
      b.dataset.slot = i;
      if (q.kind === 'mod') {
        b.dataset.id = String(i);
        b.disabled = i === 0;
        if (i === 0) b.classList.add('fm-c-A');
        b.onclick = () => answer(String(i), b);
        const mini = game.h('button', { className: 'ml-btn fm-mini', innerHTML: '▶' });
        mini.setAttribute('aria-label', game.t('replay'));
        mini.onclick = () => playOne(i);
        row.append(game.h('div', { className: 'fm-cell' }, b, mini));
      } else {
        b.onclick = () => playOne(i);
        row.append(b);
      }
      q.blocks.push(b);
    });
    paintSlots();
  }
  if (q.kind === 'fill') {
    q.ids.forEach((id) => {
      const b = game.h('button', { className: `fm-block ${codeClass(id)}` });
      b.dataset.id = id;
      b.setAttribute('aria-label', id);
      b.onclick = () => answer(id, b);
      pal.append(b);
    });
  }
  choices.style.setProperty('--cols', q.cols || 2);
  (q.buttons || []).forEach((bt) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (bt.html) { b.classList.add('fm-icon'); b.innerHTML = bt.html; b.setAttribute('aria-label', game.t(bt.aria)); }
    else b.textContent = game.tr(bt.text);
    b.dataset.id = bt.id;
    b.onclick = () => answer(bt.id, b);
    choices.append(b);
  });
}
function paintSlots(reveal = false) {
  q.blocks.forEach((b, i) => {
    b.className = 'fm-block' + (b.dataset.id !== undefined && q.kind === 'mod' ? '' : '');
    b.textContent = '';
    const show = q.kind === 'fill' ? i < q.pos : reveal;
    if (show) { b.className += ' ' + codeClass(q.seq[i]); if (reveal) b.textContent = letter(q.seq[i]); }
    if (q.kind === 'mod' && i === 0) b.className += ' fm-c-A';
  });
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  timers.splice(0).forEach(clearTimeout);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const items = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  let item = forced && items.includes(forced) ? forced : pickWeak(items, stats, { avoid: last });
  forced = null;
  last = item;
  q = build(level, item);
  missed = false;
  locked = false;
  render();
  quietUntil = 0;
  play();
  started = performance.now();
}

async function answer(id, button) {
  if (locked || button.disabled) return;
  const fill = q.kind === 'fill';
  const ok = id === (fill ? q.seq[q.pos] : q.answer);
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : id };
  clearTimeout(timer);
  if (ok) {
    if (fill) { q.pos++; paintSlots(); if (q.pos < q.seq.length) return; }
    locked = true;
    if (!fill) button.classList.add('ml-right');
    if (q.reveal) paintSlots(true);
    if (missed) game.flash(true);
    else {
      streak++;
      if (streak >= 8) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('fm-show');
        else if (streak === 8) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, q.reveal ? 2000 : 1100);
  } else {
    streak = 0;
    nextBtn.classList.remove('fm-show');
    if (fill) { button.classList.add('ml-wrong'); setTimeout(() => button.classList.remove('ml-wrong'), 450); }
    else { button.classList.add('ml-wrong'); button.disabled = true; }
    if (missed) { (fill ? pal : q.kind === 'mod' ? row : choices).querySelector(`[data-id="${fill ? q.seq[q.pos] : q.answer}"]`)?.classList.add('ml-reveal'); game.flash(false); } // 2nd miss: show the answer
    else { missed = true; await game.attempt(rec); }
    timer = setTimeout(() => { quietUntil = 0; fill ? playOne(q.pos) : play(); }, 700);
  }
}

window.__test = {
  state: () => (q ? { level: q.level, item: q.item, kind: q.kind, seq: q.seq, answer: q.answer, pos: q.pos, modAt: q.modAt, phrases: q.phrases, ids: q.kind === 'fill' ? q.ids : q.kind === 'mod' ? ['1', '2', '3'] : q.buttons.map((b) => b.id) } : {}),
  force: (item) => { forced = item; },
};

game.ready().then(() => {
  game.stage.replaceChildren(replay, row, pal, choices, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('fm-show'); next(); });
  game.on('lang', render);
  next();
});
