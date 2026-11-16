// Game shell: the minimal chrome shared by every game.
// Top bar (home, title, score, settings), settings dialog (language, theme, game options,
// import/export of settings and results), answer logging and feedback.
import '@fontsource/noto-music/music-400.css';
import './core.css';
import { getLang, setLang, onLang, tr, createT } from './i18n.js';
import { getSettings, saveSettings, logAttempt, clearAttempts } from './storage.js';
import { exportSettings, exportResults, importFile } from './transfer.js';
import { audio, sfx } from './audio.js';
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
};
const ui = createT(UI);

// Theme: 'auto' follows the system.
export function applyTheme(theme = localStorage.getItem('ml:theme') || 'auto') {
  localStorage.setItem('ml:theme', theme);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
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

  const titleEl = h('span', { className: 'ml-title' });
  const scoreEl = h('span', { className: 'ml-score', textContent: '0' });
  const gear = h('button', { className: 'ml-icon', textContent: '⚙' });
  const homeEl = h('a', { className: 'ml-icon', href: home, textContent: '⌂' });
  const bar = h('header', { className: 'ml-bar' }, homeEl, titleEl, scoreEl, gear);
  const stage = h('main', { className: 'ml-stage' });
  const toast = h('div', { className: 'ml-toast' });
  const dialog = h('dialog', { className: 'ml-settings' });
  document.body.classList.add('ml-game');
  document.body.append(bar, stage, toast, dialog);

  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add('ml-show');
    setTimeout(() => toast.classList.remove('ml-show'), 2200);
  };

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
      else { Object.assign(settings, getSettings(config.id, defaults)); say(ui('importedSettings')); emit('settings'); renderDialog(); }
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
    /** Visual + sound feedback only. */
    flash(correct, { silent = false } = {}) {
      stage.classList.remove('ml-good', 'ml-bad');
      void stage.offsetWidth;
      stage.classList.add(correct ? 'ml-good' : 'ml-bad');
      if (!silent) sfx(correct ? 'good' : 'bad');
    },
    /** Record an answer in the shared log, update score, give feedback.
     *  a: { skill, correct, ms?, level?, item?, detail?, silent? } */
    async attempt(a) {
      if (a.correct) game.setScore(score + 1);
      game.flash(a.correct, { silent: a.silent });
      return logAttempt({ game: config.id, ...a });
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
