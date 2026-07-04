// Stale-while-revalidate service worker: every hit is served from cache
// (instant, works offline) while the network refreshes the cache in the
// background — deploys reach users one load later, no version bump needed.
const CACHE = 'macro-calc-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'calc.js', 'favicon.svg'];

addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  skipWaiting();
});

addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(location.origin)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(() => {})); // offline: keep serving the cached copy
      return cached;
    }
    return fresh;
  })());
});
