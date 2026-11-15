const V = '__VERSION__';
const FILES = __FILES__;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('ml-') && k !== V).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(V);
    const opts = { ignoreSearch: true, ignoreVary: true };
    let r = await c.match(e.request, opts);
    if (!r && u.pathname.endsWith('/')) r = await c.match(u.pathname + 'index.html', opts);
    if (r) return r;
    try { return await fetch(e.request); } catch {
      return (e.request.mode === 'navigate' && (await c.match('./index.html', opts))) || Response.error();
    }
  })());
});
