// Jazz colours: plain or coloured first, then the names of the colours: dominant, major, altered, minor.
import { createGame } from '@core/shell.js';
import { playNote, playChord, audioTime } from '@core/audio.js';
import { rand, shuffle } from '@core/music.js';
import { loadItemMastery, pickWeak } from '@core/mastery.js';
import './style.css';

const L = (en, fr) => ({ en, fr });
const MAX_LEVEL = 6, SKILL = 'listen.jazz', CLEAN = 8;
const game = createGame({
  id: 'ear-jazz',
  title: L('Guess the jazz chord', 'Devine l’accord jazz'),
  strings: {
    replay: L('Listen again', 'Réécouter'),
    arpeggio: L('Note by note', 'Note par note'),
    plain: L('Plain', 'Simple'),
    colour: L('Coloured', 'Coloré'),
    next: L('Next level →', 'Niveau suivant →'),
    top: L('Well done, what an ear!', 'Bravo, quelle oreille !'),
  },
  settings: [
    { key: 'level', label: L('Level', 'Niveau'), type: 'select', default: 1, options: [
      { value: 1, label: L('1 · Plain or coloured', '1 · Simple ou coloré') },
      { value: 2, label: L('2 · Dominant colours', '2 · Couleurs de dominante') },
      { value: 3, label: L('3 · Major family', '3 · Famille majeure') },
      { value: 4, label: L('4 · Altered dominants', '4 · Dominantes altérées') },
      { value: 5, label: L('5 · Minor family', '5 · Famille mineure') },
      { value: 6, label: L('6 · All mixed', '6 · Tout mélangé') },
    ] },
  ],
});

// Each chord: its symbol and its upper voicing, in semitones above the bass note (the root).
// The seventh (or sixth) and the third sit in the middle, the colours on top.
const CHORDS = {
  '7': ['7', [10, 16, 19]], '9': ['9', [10, 16, 19, 26]], '13': ['13', [10, 14, 16, 21]], '7sus4': ['7sus4', [10, 17, 19]],
  'maj7': ['maj7', [11, 16, 19]], 'maj9': ['maj9', [11, 16, 19, 26]], '69': ['6/9', [9, 16, 19, 26]], 'maj7#11': ['maj7♯11', [11, 16, 19, 30]],
  '7b9': ['7♭9', [10, 16, 19, 25]], '7#9': ['7♯9', [10, 16, 19, 27]], '7#11': ['7♯11', [10, 16, 19, 30]], '7b13': ['7♭13', [10, 14, 16, 20]],
  'm7': ['m7', [10, 15, 19]], 'm9': ['m9', [10, 15, 19, 26]], 'm11': ['m11', [10, 15, 19, 29]], 'm6': ['m6', [9, 15, 19]], 'mMaj7': ['m(maj7)', [11, 15, 19]],
};
const FAMILIES = [['7', '9', '13', '7sus4'], ['maj7', 'maj9', '69', 'maj7#11'], ['7b9', '7#9', '7#11', '7b13'], ['m7', 'm9', 'm11', 'm6', 'mMaj7']];
const ALL = FAMILIES.flat();
const COLOURED = new Set(['9', 'maj9', 'm9']);
const LEVELS = {
  1: { types: ['7', '9', 'maj7', 'maj9', 'm7', 'm9'], icons: true },
  2: { types: FAMILIES[0] },
  3: { types: FAMILIES[1] },
  4: { types: FAMILIES[2] },
  5: { types: FAMILIES[3] },
  6: { types: ALL, show: 6 },
};

// A single dot, or the same dot with sparks around it.
const PLAIN = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="14" fill="currentColor"/></svg>';
const COLOUR = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="30" cy="36" r="14" fill="currentColor"/><g fill="currentColor"><path d="M50 4l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M12 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M54 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g></svg>';
const PLAY = '<svg viewBox="0 0 64 64" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M22 12v40l32-20z"/></svg>';
const STEPS = '<svg viewBox="0 0 64 64" width="36" height="36" fill="currentColor" aria-hidden="true"><circle cx="12" cy="48" r="9"/><circle cx="32" cy="32" r="9"/><circle cx="52" cy="16" r="9"/></svg>';

const notesOf = (bass, id) => [bass, ...CHORDS[id][1].map((s) => bass + s)];

// Timers wake up just before each event and schedule it on the audio clock, so a sequence can be cancelled.
let timers = [], marked = null;
function mark(el) { marked?.classList.remove('jz-playing'); marked = el; el?.classList.add('jz-playing'); }
function stop() { timers.forEach(clearTimeout); timers = []; mark(null); }
function run(events) {
  stop();
  const t0 = audioTime() + 0.06;
  for (const e of events) timers.push(setTimeout(() => e.fn(Math.max(0, t0 + e.t - audioTime())), Math.max(0, e.t * 1000 - 40)));
}
const block = (notes, t) => [{ t, fn: (when) => { playNote(notes[0], { when, dur: 1.5, gain: 0.2 }); playChord(notes.slice(1), { when, dur: 1.5, gain: 0.34 }); } }];
const broken = (notes, t) => notes.map((m, i) => ({ t: t + i * 0.36, fn: (when) => playNote(m, { when, dur: (notes.length - i) * 0.36 + 0.6, gain: 0.16 }) }));

let q = null, started = 0, streak = 0, last = null, missed = false, locked = false, seq = 0, timer = 0;
const replay = game.h('button', { className: 'ml-round', innerHTML: PLAY });
const arpBtn = game.h('button', { className: 'jz-arp', innerHTML: STEPS });
const choices = game.h('div', { className: 'jz-choices' });
const nextBtn = game.h('button', { className: 'ml-btn ml-primary jz-next' });
replay.onclick = () => play(false);
arpBtn.onclick = () => play(true);
nextBtn.onclick = () => game.set('level', Math.min(MAX_LEVEL, +game.settings.level + 1));

function play(arp) { if (q) run((arp ? broken : block)(q.notes, 0)); }

function render() {
  if (!q) return;
  replay.setAttribute('aria-label', game.t('replay'));
  arpBtn.setAttribute('aria-label', game.t('arpeggio'));
  nextBtn.textContent = game.t('next');
  const old = new Map([...choices.children].map((b) => [b.dataset.type, b]));
  choices.replaceChildren(...q.types.map((type) => {
    const b = game.h('button', { className: 'ml-btn' });
    if (q.icons) {
      b.classList.add('jz-icon', 'jz-' + type);
      b.innerHTML = type === 'plain' ? PLAIN : COLOUR;
      b.setAttribute('aria-label', game.t(type));
    } else b.textContent = CHORDS[type][0];
    b.dataset.type = type;
    b.onclick = () => answer(type, b);
    const was = old.get(type); // a language change keeps the marks of the current question
    if (was && q.keep) { b.className = was.className; b.disabled = was.disabled; }
    return b;
  }));
  q.keep = true;
}

async function next() {
  const id = ++seq;
  clearTimeout(timer);
  stop();
  const level = Math.min(MAX_LEVEL, Math.max(1, +game.settings.level || 1));
  const cfg = LEVELS[level];
  const stats = await loadItemMastery(SKILL);
  if (id !== seq) return;
  const item = pickWeak(cfg.types, stats, { avoid: cfg.types.length > 4 ? last : undefined });
  last = item;
  let types = cfg.types, answerId = item;
  if (cfg.icons) { types = ['plain', 'colour']; answerId = COLOURED.has(item) ? 'colour' : 'plain'; }
  else if (cfg.show) {
    // Half of the choices come from the same family as the chord, the others from elsewhere.
    const family = FAMILIES.find((f) => f.includes(item));
    const near = shuffle(family.filter((x) => x !== item)).slice(0, 2);
    const far = shuffle(ALL.filter((x) => !family.includes(x))).slice(0, cfg.show - 1 - near.length);
    const keep = new Set([item, ...near, ...far]);
    types = ALL.filter((x) => keep.has(x));
  }
  const bass = 40 + rand(12);
  q = { level, item, answer: answerId, bass, types, icons: !!cfg.icons, notes: notesOf(bass, item) };
  missed = false;
  locked = false;
  render();
  play(false);
  started = performance.now();
}

async function answer(type, button) {
  if (locked || button.disabled) return;
  const ok = type === q.answer;
  const rec = { skill: SKILL, correct: ok, ms: Math.round(performance.now() - started), level: q.level, item: q.item, detail: ok ? null : type };
  clearTimeout(timer);
  stop();
  if (ok) {
    locked = true;
    button.classList.add('ml-right');
    if (missed) game.flash(true); // only the first answer of a question is logged
    else {
      streak++;
      if (streak >= CLEAN) {
        if (q.level < MAX_LEVEL) nextBtn.classList.add('jz-show');
        else if (streak === CLEAN) game.celebrate(game.t('top'));
      }
      await game.attempt(rec);
    }
    timer = setTimeout(next, 900);
  } else {
    button.classList.add('ml-wrong');
    button.disabled = true;
    streak = 0;
    nextBtn.classList.remove('jz-show');
    if (missed) game.flash(false);
    else { missed = true; await game.attempt(rec); }
    const cur = q;
    timer = setTimeout(() => {
      if (cur !== q) return;
      // With names: the chord that was chosen, on the same root, then the question again.
      if (q.icons) play(false);
      else run([{ t: 0, fn: () => mark(button) }, ...block(notesOf(q.bass, type), 0), { t: 1.7, fn: () => mark(replay) }, ...block(q.notes, 1.7), { t: 3.2, fn: () => mark(null) }]);
    }, 650);
  }
}

window.__test = { state: () => ({ level: q?.level, item: q?.item, answer: q?.answer, bass: q?.bass, notes: q?.notes, types: q?.types }) };

game.ready().then(() => {
  game.stage.replaceChildren(game.h('div', { className: 'jz-top' }, replay, arpBtn), choices, nextBtn);
  game.on('settings', () => { streak = 0; nextBtn.classList.remove('jz-show'); next(); });
  game.on('lang', render);
  next();
});
