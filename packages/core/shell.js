// Game shell: the minimal chrome shared by every game.
// Top bar (home, title, score, settings), settings dialog (language, theme, game options,
// import/export of settings and results), answer logging and feedback.
import '@fontsource/noto-music/music-400.css';
import './core.css';
import { getLang, setLang, onLang, tr, createT } from './i18n.js';
import { getSettings, saveSettings, logAttempt, clearAttempts } from './storage.js';
import { exportSettings, exportResults, importFile } from './transfer.js';
import { audio, sfx, SFX_MS } from './audio.js';
import { getFeedback, setFeedback, FEEDBACK_MODES, MODE_LABELS, pickMessage } from './feedback.js';
import { onProfile } from './profiles.js';
import { registerSW } from './update.js';

const UI = {
  settings: { en: 'Settings', fr: 'Réglages' },
  language: { en: 'Language', fr: 'Langue' },
  theme: { en: 'Theme', fr: 'Thème' },
  auto: { en: 'Auto', fr: 'Auto' },
  light: { en: 'Light', fr: 'Clair' },
  dark: { en: 'Dark', fr: 'Sombre' },
  data: { en: 'Data', fr: 'Données' },
  exportSettings: { en: 'Export settings', fr: 'Exporter les réglages' },
  importSettings: { en: 'Import settings', fr: 'Importer les réglages' },
  exportResults: { en: 'Export results', fr: 'Exporter les résultats' },
  importResults: { en: 'Import results', fr: 'Importer les résultats' },
  resetResults: { en: 'Erase results of this game', fr: 'Effacer les résultats de ce jeu' },
  confirmReset: { en: 'Erase all results of this game for this profile?', fr: 'Effacer tous les résultats de ce jeu pour ce profil ?' },
  imported: { en: 'Imported: {n} new', fr: 'Importé : {n} nouveaux' },
  importedSettings: { en: 'Settings imported', fr: 'Réglages importés' },
  badFile: { en: 'This file is not valid', fr: 'Ce fichier n’est pas valide' },
  close: { en: 'Close', fr: 'Fermer' },
  start: { en: 'Start', fr: 'Commencer' },
  home: { en: 'Home', fr: 'Accueil' },
  feedback: { en: 'Feedback', fr: 'Retours' },
  vibration: { en: 'Vibration', fr: 'Vibration' },
  correct: { en: 'Correct', fr: 'Juste' },
  tryAgain: { en: 'Try again', fr: 'Essaie encore' },
};
const ui = createT(UI);

// Theme: 'auto' follows the system.
export function applyTheme(theme = localStorage.getItem('ml:theme') || 'auto') {
  localStorage.setItem('ml:theme', theme);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Feedback mode select + vibration toggle (shared by the settings dialogs of games and pages).
 *  onChange runs after a change. Returns an array of nodes. */
export function feedbackFields(onChange) {
  const fb = getFeedback();
  const sel = h('select', {}, ...FEEDBACK_MODES.map((m) => h('option', { value: m, textContent: tr(MODE_LABELS[m]), selected: m === fb.mode })));
  sel.setAttribute('aria-label', ui('feedback'));
  sel.onchange = () => { setFeedback({ mode: sel.value }); onChange?.(); };
  const out = [h('label', { className: 'ml-field ml-fb-mode' }, h('span', { textContent: ui('feedback') }), sel)];
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    const box = h('input', { type: 'checkbox', checked: fb.haptics });
    box.onchange = () => { setFeedback({ haptics: box.checked }); onChange?.(); };
    out.push(h('label', { className: 'ml-field ml-fb-haptics' }, h('span', { textContent: ui('vibration') }), box));
  }
  return out;
}

function head(home) {
  const add = (tag, attrs) => document.head.append(Object.assign(document.createElement(tag), attrs));
  add('link', { rel: 'manifest', href: home + 'manifest.webmanifest' });
  add('link', { rel: 'icon', href: home + 'icon.svg' });
  if (import.meta.env.PROD) registerSW(home);
}

const h = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};

// ?level=N in the page URL: set the level (only if the game has a `level` option and N is one of its options), save it,
// then remove the parameter so that a later reload keeps the level the player reached.
function applyUrlLevel(config, settings) {
  try {
    const url = new URL(location.href);
    const raw = url.searchParams.get('level');
    if (raw == null) return;
    url.searchParams.delete('level');
    history.replaceState(history.state, '', url);
    const f = (config.settings || []).find((x) => x.key === 'level');
    if (!f) return;
    let value;
    if (f.options) value = f.options.find((o) => String(o.value) === raw.trim())?.value;
    else if (/^\d+$/.test(raw.trim()) && +raw >= (f.min ?? -Infinity) && +raw <= (f.max ?? Infinity)) value = +raw;
    if (value === undefined) return;
    settings.level = value;
    saveSettings(config.id, settings);
  } catch { /* no URL support: ignore */ }
}

/**
 * Create a game page.
 * config: {
 *   id: 'find-a-note',                          // game slug, used for storage
 *   title: { en, fr },
 *   strings: { key: { en, fr } },               // game texts, read with game.t(key, vars)
 *   settings: [                                 // options shown in the settings dialog
 *     { key, label: {en,fr}, type: 'select', options: [{ value, label: {en,fr} }], default },
 *     { key, label: {en,fr}, type: 'toggle', default: true },
 *     { key, label: {en,fr}, type: 'range', min, max, step, default },
 *   ],
 *   home: '../',                                // path to the hub (default '../')
 *   quiet: (ms) => {},                          // optional: called with the length of every shell sound, before it starts (microphone games)
 *   ear: true,                                  // optional: listening game (allows the "good ear" messages)
 * }
 */
export function createGame(config) {
  const home = config.home ?? '../';
  applyTheme();
  head(home);
  const defaults = Object.fromEntries((config.settings || []).map((f) => [f.key, f.default]));
  const settings = getSettings(config.id, defaults);
  applyUrlLevel(config, settings);
  const handlers = { settings: new Set(), lang: new Set() };
  const emit = (ev) => handlers[ev].forEach((fn) => fn(ev === 'lang' ? getLang() : settings));
  const t = createT(config.strings || {});
  let score = 0;
  let fb = getFeedback();
  const applyFb = () => { fb = getFeedback(); document.documentElement.dataset.fb = fb.mode; };
  applyFb();
  onProfile(applyFb);

  const titleEl = h('span', { className: 'ml-title' });
  const scoreEl = h('span', { className: 'ml-score', textContent: '0' });
  const gear = h('button', { className: 'ml-icon', textContent: '⚙' });
  const homeEl = h('a', { className: 'ml-icon', href: home, textContent: '⌂' });
  const fbGlyph = h('span', { className: 'ml-fb-glyph' });
  fbGlyph.setAttribute('aria-hidden', 'true');
  const fbText = h('span', { className: 'ml-sr' });
  const fbEl = h('span', { className: 'ml-fb' }, fbGlyph, fbText);
  fbEl.setAttribute('aria-live', 'polite');
  fbEl.setAttribute('role', 'status');
  const bar = h('header', { className: 'ml-bar' }, homeEl, titleEl, fbEl, scoreEl, gear);
  const stage = h('main', { className: 'ml-stage' });
  const toast = h('div', { className: 'ml-toast' });
  const dialog = h('dialog', { className: 'ml-settings' });
  document.body.classList.add('ml-game');
  document.body.append(bar, stage, toast, dialog);

  // Toasts: say() and celebrate() always show; shell messages never replace one shown less than 2.2 s ago.
  let toastTimer = 0, lastSayAt = -1e9, lastMsgAt = -1e9;
  const showToast = (msg, ms) => {
    toast.textContent = msg;
    toast.classList.add('ml-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('ml-show'), ms);
  };
  const say = (msg) => { lastSayAt = performance.now(); showToast(msg, 2200); };

  const segmented = (value, options, onPick) => h('div', { className: 'ml-seg' }, ...options.map(([v, label]) => {
    const b = h('button', { textContent: label, className: v === value ? 'ml-on' : '' });
    b.onclick = () => onPick(v);
    return b;
  }));

  function field(f) {
    let input;
    const set = (v) => { settings[f.key] = v; saveSettings(config.id, settings); emit('settings'); };
    if (f.type === 'select') {
      input = h('select', {}, ...f.options.map((o) => h('option', { value: String(o.value), textContent: tr(o.label), selected: String(o.value) === String(settings[f.key]) })));
      input.onchange = () => { const o = f.options.find((x) => String(x.value) === input.value); set(o.value); };
    } else if (f.type === 'toggle') {
      input = h('input', { type: 'checkbox', checked: !!settings[f.key] });
      input.onchange = () => set(input.checked);
    } else {
      const out = h('output', { textContent: settings[f.key] });
      const r = h('input', { type: 'range', min: f.min, max: f.max, step: f.step ?? 1, value: settings[f.key] });
      r.oninput = () => { out.textContent = r.value; };
      r.onchange = () => set(+r.value);
      input = h('span', { className: 'ml-range' }, r, out);
    }
    return h('label', { className: 'ml-field' }, h('span', { textContent: tr(f.label) }), input);
  }

  async function doImport(kind) {
    try {
      const r = await importFile(kind);
      if (r.cancelled) return;
      if (r.kind === 'results') say(ui('imported', { n: r.added }));
      else { Object.assign(settings, getSettings(config.id, defaults)); applyFb(); say(ui('importedSettings')); emit('settings'); renderDialog(); }
    } catch { say(ui('badFile')); }
  }

  function renderDialog() {
    const btn = (label, fn) => { const b = h('button', { textContent: label, className: 'ml-btn' }); b.onclick = fn; return b; };
    const theme = localStorage.getItem('ml:theme') || 'auto';
    dialog.replaceChildren(
      h('h2', { textContent: ui('settings') }),
      ...(config.settings || []).map(field),
      h('div', { className: 'ml-field' }, h('span', { textContent: ui('language') }),
        segmented(getLang(), [['fr', 'Français'], ['en', 'English']], (v) => setLang(v))),
      h('div', { className: 'ml-field' }, h('span', { textContent: ui('theme') }),
        segmented(theme, [['auto', ui('auto')], ['light', ui('light')], ['dark', ui('dark')]], (v) => { applyTheme(v); renderDialog(); })),
      ...feedbackFields(applyFb),
      h('h3', { textContent: ui('data') }),
      h('div', { className: 'ml-data' },
        btn(ui('exportSettings'), () => exportSettings(config.id)),
        btn(ui('importSettings'), () => doImport('settings')),
        btn(ui('exportResults'), () => exportResults(config.id)),
        btn(ui('importResults'), () => doImport('results')),
        btn(ui('resetResults'), async () => { if (confirm(ui('confirmReset'))) { await clearAttempts(config.id); emit('settings'); } })),
      btn(ui('close'), () => dialog.close()),
    );
    dialog.lastChild.classList.add('ml-primary');
  }

  function renderChrome() {
    titleEl.textContent = tr(config.title);
    document.title = tr(config.title);
    gear.setAttribute('aria-label', ui('settings'));
    homeEl.setAttribute('aria-label', ui('home'));
    if (dialog.open) renderDialog();
  }
  gear.onclick = () => { renderDialog(); dialog.showModal(); };
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  onLang(() => { renderChrome(); emit('lang'); });
  renderChrome();

  // ---- Feedback (docs/feedback-spec.md): one place for sound, stage tint, badge, score pulse, stars and toast.
  let streak = 0, qMisses = 0, qn = 0, badQ = -5, soundUntil = 0, soundName = null;
  const recent = [];
  const timers = {};
  const once = (key, fn, ms) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };
  const log = (rec) => { const l = (window.__fb = window.__fb || []); l.push(rec); if (l.length > 50) l.shift(); };

  function stars() {
    const old = document.querySelector('.ml-stars');
    old?.remove();
    const r = scoreEl.getBoundingClientRect();
    const box = h('div', { className: 'ml-stars' });
    box.style.left = r.left + r.width / 2 + 'px';
    box.style.top = r.top + r.height / 2 + 'px';
    box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 + 0.3, d = 24 + (i % 2) * 16;
      const sp = h('span', { textContent: '★' });
      sp.style.setProperty('--dx', Math.round(Math.cos(a) * d) + 'px');
      sp.style.setProperty('--dy', Math.round(Math.sin(a) * d) + 'px');
      box.append(sp);
    }
    document.body.append(box);
    once('stars', () => box.remove(), 700);
  }
  function pulse() {
    scoreEl.classList.remove('ml-pulse');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('ml-pulse');
    once('pulse', () => scoreEl.classList.remove('ml-pulse'), 400);
  }
  function badge(bad) {
    fbEl.classList.remove('ml-fb-good', 'ml-fb-bad');
    fbEl.classList.add('ml-show', bad ? 'ml-fb-bad' : 'ml-fb-good');
    fbGlyph.textContent = bad ? '↺' : '✓';
    fbText.textContent = ui(bad ? 'tryAgain' : 'correct');
    once('badge', () => fbEl.classList.remove('ml-show'), 700);
  }

  // kind: 'good' | 'bad' | 'streak' (a good answer that reaches a milestone) | 'level'.
  // o: { silent, haptic, message } for callers; { bank, n, milestone } are set by the shell itself.
  function run(kind, o = {}) {
    const mode = fb.mode, enc = mode === 'encouraging', loud = mode === 'normal' || enc;
    const answer = kind !== 'level';
    const bad = kind === 'bad';
    let sound = null;
    if (loud && !o.silent) {
      if (kind === 'good') sound = enc ? 'good-warm' : 'good';
      else if (bad) sound = enc ? 'bad-soft' : 'bad';
      else if (kind === 'streak') sound = enc ? 'cheer' : 'good';
      else sound = 'cheer';
    }
    const now = performance.now();
    if (sound && now < soundUntil && (sound === 'cheer' || soundName === 'cheer')) sound = null; // a cheer never stacks with another sound
    let ms = 0;
    if (sound) {
      ms = SFX_MS[sound];
      soundUntil = now + ms;
      soundName = sound;
      try { config.quiet?.(ms); sfx(sound); } catch { /* no audio */ }
    }
    let haptic = false;
    if (fb.haptics && mode !== 'silent' && o.haptic !== false && !config.quiet && navigator.vibrate) {
      haptic = navigator.vibrate(sound === 'cheer' || kind === 'level' ? [12, 40, 12, 40, 24] : bad ? [18, 50, 18] : 12);
    }
    let visual = 'none';
    if (answer) {
      visual = mode === 'discreet' ? 'none' : bad && mode === 'normal' ? 'tint+shake' : 'tint';
      stage.classList.remove('ml-good', 'ml-bad');
      void stage.offsetWidth;
      stage.classList.add(bad ? 'ml-bad' : 'ml-good');
      badge(bad);
      if (enc && !bad) pulse();
      if (kind === 'streak' && mode === 'normal') pulse();
    } else if (loud) visual = enc ? 'stars' : 'pulse';
    if ((kind === 'streak' || kind === 'level') && enc) { stars(); visual = visual === 'none' ? 'stars' : visual + '+stars'; }
    if (kind === 'level' && mode === 'normal') pulse();
    let message = null;
    if (o.message != null) { message = o.message; say(message); }
    else if (o.bank && enc && now - lastSayAt >= 2200 && (o.milestone || now - lastMsgAt >= 8000)) {
      const raw = pickMessage(o.bank, getLang(), recent, { ear: !!config.ear });
      if (raw) {
        message = raw.replaceAll('{n}', o.n ?? '');
        recent.push(raw);
        if (recent.length > 3) recent.shift();
        lastMsgAt = now;
        showToast(message, 1600);
      }
    }
    const rec = { kind, mode, sound, ms, visual, message, haptic: !!haptic, t: Math.round(now) };
    log(rec);
    return rec;
  }

  // An answer. counted: it comes from attempt() (streak and praise); flash() only gives the cue.
  const MILESTONES = (n) => n === 5 || n === 10 || n === 20 || (n > 20 && n % 20 === 0);
  function judge(correct, o = {}) {
    if (!correct) {
      const first = qMisses === 0;
      qMisses++;
      streak = 0;
      const rec = run('bad', { ...o, bank: first && qn - badQ !== 1 ? 'bad' : null });
      if (first && rec.message) badQ = qn;
      return rec;
    }
    const recovery = qMisses > 0;
    const revealed = !!o.revealed || qMisses >= 2; // the answer was shown: no praise
    qMisses = 0;
    qn++;
    let kind = 'good', bank = null, milestone = false;
    if (o.counted && !revealed) streak++;
    if (!revealed) {
      if (recovery) bank = 'recovery';
      else if (o.counted) {
        if (fb.mode === 'encouraging' && MILESTONES(streak)) { kind = 'streak'; bank = 'streak'; milestone = true; }
        else if (fb.mode === 'normal' && streak % 10 === 0) kind = 'streak';
        else if (streak === 3) bank = 'good';
      }
    }
    return run(kind, { ...o, bank, n: streak, milestone });
  }

  const game = {
    id: config.id,
    /** Element where the game draws itself. */
    stage,
    /** Live settings object (already merged with saved values). */
    settings,
    /** Translate a key of config.strings. */
    t,
    /** Resolve a { en, fr } object. */
    tr,
    get lang() { return getLang(); },
    /** Listen to 'settings' or 'lang' changes (re-render the round there). */
    on(ev, fn) { handlers[ev].add(fn); return () => handlers[ev].delete(fn); },
    /** Change a setting from the game itself (e.g. automatic level up). */
    set(key, value) { settings[key] = value; saveSettings(config.id, settings); emit('settings'); },
    setScore(n) { score = n; scoreEl.textContent = n; },
    get score() { return score; },
    /** Feedback only (cue for the active mode), no log, no streak. { silent, haptic, revealed }. */
    flash(correct, o = {}) { judge(correct, o); },
    /** One place for every cue: kind 'good' | 'bad' | 'streak' | 'level'. { silent, haptic, message } */
    feedback(kind, o = {}) { return run(kind, o); },
    /** Level-up or "top" toast, with the cheer and stars of the mode. */
    celebrate(message) { return run('level', { message }); },
    /** Clean successes in a row, as counted by the shell. */
    get streak() { return streak; },
    /** { mode, haptics } of the active profile. */
    get fb() { return fb; },
    /** Record an answer in the shared log, update score, give feedback.
     *  a: { skill, correct, ms?, level?, item?, detail?, silent?, haptic?, revealed? } */
    async attempt(a) {
      const { silent, haptic, revealed, ...rec } = a;
      if (a.correct) game.setScore(score + 1);
      judge(a.correct, { silent, haptic, revealed, counted: true });
      return logAttempt({ game: config.id, ...rec });
    },
    /** Show a big start button; resolves after the tap (this unlocks audio on mobile). */
    ready(label) {
      return new Promise((resolve) => {
        const b = h('button', { className: 'ml-start', textContent: label || ui('start') });
        b.onclick = () => { audio(); b.remove(); resolve(); };
        stage.replaceChildren(b);
      });
    },
    /** Short message at the bottom of the screen. */
    say,
    /** DOM helper: h('div', { className: 'x' }, child1, child2) */
    h,
  };
  return game;
}

export { h };
