// Offline cache. Bump VERSION whenever you deploy new files so users get them.
const VERSION = 'tarnol-v9';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.bundle.js', 'js/firebase-config.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const ours = u.origin === location.origin, sdk = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (!ours && !sdk) return; // Firestore / Auth API traffic is handled by Firebase itself (offline persistence)
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(r, { ignoreSearch: true });
    const net = fetch(r).then(res => { if (res.ok) cache.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }          // cache first, refresh in background
    const res = await net;
    return res || (r.mode === 'navigate' ? cache.match('index.html') : Response.error());
  })());
});
