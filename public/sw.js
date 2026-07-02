// Trbhh service worker — lightweight offline shell + runtime cache.
const CACHE = 'trbhh-v3';
const CORE = ['/', '/manifest.webmanifest', '/icon-192.png', '/placeholder-ad.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // network-first for pages, cache-first for media/static
  if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => hit)));
    return;
  }
  e.respondWith(fetch(request).catch(() => caches.match(request).then((hit) => hit || caches.match('/'))));
});
