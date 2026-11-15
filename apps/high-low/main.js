// High or low: two notes (did the sound go up or down?), then the shape of a short melody.
import { createGame } from '@core/shell.js';
import { playNote } from '@core/audio.js';
import { rand, pick, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const game = createGame({
  id: 'high-low',
  title: L('High or low', 'Aigu ou grave'),
  strings: {
    up: L('Up', 'Ça monte'),
    down: L('Down', 'Ça descend'),
    same: L('Same', 'Pareil'),
    replay: L('Listen again', 'Réécouter'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, you have a fine ear!', 'Bravo, tu as l’oreille fine !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Up or down, far apart', '1 · Monte ou descend, notes éloignées') },
      { value: 2, label: L('2 · Up or down, closer', '2 · Monte ou descend, notes plus proches') },
      { value: 3, label: L('3 · Up or down, very close', '3 · Monte ou descend, notes très proches') },
      { value: 4, label: L('4 · Up, down or same', '4 · Monte, descend ou pareil') },
      { value: 5, label: L('5 · Shape of 3 notes', '5 · Dessin de 3 notes') },
      { value: 6, label: L('6 · Shape of 4 notes', '6 · Dessin de 4 notes') },
    ] },
  ],
});
const MAX_LEVEL = 6;
const LO = 52, HI = 84;

const signed = (gaps) => gaps.flatMap((g) => [`+${g}`, `-${g}`]);
const words = (n) => (n === 1 ? ['u', 'd'] : words(n - 1).flatMap((w) => ['u', 'd'].map((c) => w + c)));
const LEVELS = {
  1: { skill: 'listen.highlow', items: signed([7, 8, 9, 10, 12, 14, 16]) },
  2: { skill: 'listen.highlow', items: signed([2, 3, 4]) },
  3: { skill: 'listen.highlow', items: signed([1, 2]) },
  4: { skill: 'listen.highlow', items: ['0', '0', ...signed([1, 2, 3])], same: true },
  5: { skill: 'listen.contour', items: words(2), shapes: true },
  6: { skill: 'listen.contour', items: words(3), shapes: true },
};

// ---- drawings -------------------------------------------------------------
const ARROWS = {
  up: '<path d="M32 10 54 36H40v18H24V36H10z"/>',
  down: '<path d="M32 54 10 28h14V10h16v18h14z"/>',
  same: '<path d="M12 22h40v8H12zM12 36h40v8H12z"/>',
};
const arrowSvg = (kind) => `<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">${ARROWS[kind]}</svg>`;
function shapeSvg(word) {
  const ys = [0];
  for (const c of word) ys.push(ys[ys.length - 1] + (c === 'u' ? 1 : -1));
  const min = Math.min(...ys), max = Math.max(...ys);
  const pts = ys.map((y, i) => [14 + (i * 92) / (ys.length - 1), 62 - ((y - min) / (max - min)) * 48]);
  return `<svg viewBox="0 0 120 76" aria-hidden="true"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="currentColor"/>`).join('')}</svg>`;
}

// ---- questions ------------------------------------------------------------
function build(level, item) {
  const cfg = LEVELS[level];
  let offsets, answer, options;
  if (cfg.shapes) {
    offsets = [0];
    for (const c of item) offsets.push(offsets[offsets.length - 1] + (c === 'u' ? 1 : -1) * (2 + rand(3)));
    answer = item;
    options = level === 5 ? cfg.items : shuffle([item, ...shuffle(cfg.items.filter((w) => w !== item)).slice(0, 3)]);
  } else {
    const d = +item;
    offsets = [0, d];
    answer = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
    options = cfg.same ? ['up', 'same', 'down'] : ['up', 'down'];
  }
  const lo = LO - Math.min(...offsets), hi = HI - Math.max(...offsets);
  const base = lo + rand(hi - lo + 1);
  return { level, skill: cfg.skill, item, answer, options, shapes: !!cfg.shapes, notes: offsets.map((o) => base + o), timbre: pick(['piano', 'piano', 'voice', 'pad']) };
}

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, quietUntil = 0, timer = 0;

const replay = game.h('button', { className: 'ml-round', innerHTML: '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>' });
const answers = game.h('div', { className: 'hl-answers' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary hl-next' });
replay.onclick = () => play();
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play() {
  if (!q) return;
  const now = performance.now();
  if (now < quietUntil - 150) return; // already sounding
  const step = q.shapes ? 0.55 : 0.75;
  q.notes.forEach((m, i) => playNote(m, { when: i * step, dur: step * 0.9, timbre: q.timbre, gain: 0.28 }));
  quietUntil = now + q.notes.length * step * 1000;
}

function renderAnswers() {
  if (!q) return;
  answers.className = 'hl-answers ' + (q.shapes ? 'hl-shapes' : 'hl-pair');
  answers.replaceChildren(...q.options.map((o) => {
    const b = game.h('button', { className: 'ml-btn hl-big', innerHTML: q.shapes ? shapeSvg(o) : arrowSvg(o) });
    b.dataset.value = o;
    if (!q.shapes) b.setAttribute('aria-label', game.t(o));
    b.onclick = () => answer(o, b);
    return b;
  }));
  replay.setAttribute('aria-label', game.t('replay'));
  nextBtn.textContent = game.t('next');
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(cfg.skill);
  if (id !== seq) return;
  // With very few items, forbidding a repeat would make the answer predictable.
  const item = pickWeak(cfg.items, stats, { avoid: cfg.items.length > 4 ? last : undefined });
  last = item;
  q = build(level, item);
  missed = false;
  locked = false;
  renderAnswers();
  quietUntil = 0;
  play();
  started = performance.now();
}

async function answer(value, button) {
  if (locked || button.disabled) return;
  const ok = value === q.answer;
  const rec = { skill: q.skill, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : value };
  clearTimeout(timer);
  if (ok) {
    locked = true;
    button.classList.add('ml-right');
    if (missed) game.flash(true); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= 10) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('hl-show');
        else if (streak === 10) game.say(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 750);
  } else {
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('hl-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    timer = setTimeout(() => play(), 650); // hear it again, then retry
  }
}

game.ready().then(() => {
  game.stage.replaceChildren(game.h('div', { className: 'hl-top' }, replay), answers, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('hl-show'); next(); });
  game.on('lang', renderAnswers);
  next();
});
