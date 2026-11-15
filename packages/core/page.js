// Shell for non-game pages (home, mastery map): top bar + global settings dialog.
import '@fontsource/noto-music/music-400.css';
import './core.css';
import { getLang, setLang, onLang, createT } from './i18n.js';
import { exportSettings, exportResults, importFile } from './transfer.js';
import { applyTheme, h } from './shell.js';

const ui = createT({
  settings: { en: 'Settings', fr: 'Réglages' },
  language: { en: 'Language', fr: 'Langue' },
  theme: { en: 'Theme', fr: 'Thème' },
  auto: { en: 'Auto', fr: 'Auto' },
  light: { en: 'Light', fr: 'Clair' },
  dark: { en: 'Dark', fr: 'Sombre' },
  data: { en: 'Data, all games', fr: 'Données, tous les jeux' },
  exportSettings: { en: 'Export settings', fr: 'Exporter les réglages' },
  importSettings: { en: 'Import settings', fr: 'Importer les réglages' },
  exportResults: { en: 'Export results', fr: 'Exporter les résultats' },
  importResults: { en: 'Import results', fr: 'Importer les résultats' },
  imported: { en: 'Imported: {n} new', fr: 'Importé : {n} nouveaux' },
  importedSettings: { en: 'Settings imported', fr: 'Réglages importés' },
  badFile: { en: 'This file is not valid', fr: 'Ce fichier n’est pas valide' },
  close: { en: 'Close', fr: 'Fermer' },
  home: { en: 'Home', fr: 'Accueil' },
});

/** createPage({ home: './' | '../', showHome, render(main) }) — render is called again on language or data change. */
export function createPage({ home = './', showHome = false, title, render }) {
  applyTheme();
  const add = (attrs) => document.head.append(Object.assign(document.createElement('link'), attrs));
  add({ rel: 'manifest', href: home + 'manifest.webmanifest' });
  add({ rel: 'icon', href: home + 'icon.svg' });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(home + 'sw.js').catch(() => {});

  const titleEl = h('span', { className: 'ml-title' });
  const gear = h('button', { className: 'ml-icon', textContent: '⚙' });
  const homeEl = showHome ? h('a', { className: 'ml-icon', href: home, textContent: '⌂' }) : null;
  const main = h('main', { className: 'ml-page' });
  const toast = h('div', { className: 'ml-toast' });
  const dialog = h('dialog', { className: 'ml-settings' });
  document.body.append(h('header', { className: 'ml-bar' }, homeEl, titleEl, gear), main, toast, dialog);

  const say = (msg) => { toast.textContent = msg; toast.classList.add('ml-show'); setTimeout(() => toast.classList.remove('ml-show'), 2200); };
  const refresh = () => {
    const text = typeof title === 'function' ? title() : title;
    titleEl.textContent = text;
    document.title = text;
    gear.setAttribute('aria-label', ui('settings'));
    homeEl?.setAttribute('aria-label', ui('home'));
    render(main);
  };
  const seg = (value, options, onPick) => h('div', { className: 'ml-seg' }, ...options.map(([v, label]) => {
    const b = h('button', { textContent: label, className: v === value ? 'ml-on' : '' });
    b.onclick = () => onPick(v);
    return b;
  }));
  async function doImport(kind) {
    try {
      const r = await importFile(kind);
      say(r.kind === 'results' ? ui('imported', { n: r.added }) : ui('importedSettings'));
      refresh();
    } catch { say(ui('badFile')); }
  }
  function renderDialog() {
    const btn = (label, fn) => { const b = h('button', { textContent: label, className: 'ml-btn' }); b.onclick = fn; return b; };
    const close = btn(ui('close'), () => dialog.close());
    close.classList.add('ml-primary');
    dialog.replaceChildren(
      h('h2', { textContent: ui('settings') }),
      h('div', { className: 'ml-field' }, h('span', { textContent: ui('language') }), seg(getLang(), [['fr', 'Français'], ['en', 'English']], setLang)),
      h('div', { className: 'ml-field' }, h('span', { textContent: ui('theme') }),
        seg(localStorage.getItem('ml:theme') || 'auto', [['auto', ui('auto')], ['light', ui('light')], ['dark', ui('dark')]], (v) => { applyTheme(v); renderDialog(); })),
      h('h3', { textContent: ui('data') }),
      h('div', { className: 'ml-data ml-even' },
        btn(ui('exportSettings'), () => exportSettings()),
        btn(ui('importSettings'), () => doImport('settings')),
        btn(ui('exportResults'), () => exportResults()),
        btn(ui('importResults'), () => doImport('results'))),
      close,
    );
  }
  gear.onclick = () => { renderDialog(); dialog.showModal(); };
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  onLang(() => { if (dialog.open) renderDialog(); refresh(); });
  refresh();
  return { refresh, say };
}
