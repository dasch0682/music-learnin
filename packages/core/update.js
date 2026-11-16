// Service worker registration + a small "new version · reload" toast when an updated version is installed.
import { createT } from './i18n.js';

const ui = createT({ text: { en: 'New version · reload', fr: 'Nouvelle version · recharger' } });
let shown = false;

function showToast() {
  if (shown || typeof document === 'undefined') return;
  shown = true;
  const b = Object.assign(document.createElement('button'), { className: 'ml-update', textContent: ui('text') });
  b.setAttribute('role', 'status');
  b.onclick = () => location.reload();
  document.body.append(b);
}

/** Register sw.js at `home`. Shows the toast when a new version takes over a page that was already controlled. */
export function registerSW(home) {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) showToast(); });
  return navigator.serviceWorker.register(home + 'sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showToast(); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    return reg;
  }).catch(() => null);
}
/** Test hook: show the toast as if a new version had been installed. */
export const _showUpdateToast = showToast;
