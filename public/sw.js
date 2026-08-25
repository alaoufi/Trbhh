// Trbhh service worker — lightweight offline shell + runtime cache.
const CACHE = 'trbhh-v8';
const CORE = ['/manifest.webmanifest', '/icon-192.png?v=2', '/placeholder-ad.svg'];

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
  // Never substitute an offline public shell for a navigation. A cached
  // anonymous home page looks exactly like a member has been signed out;
  // leaving navigations to the browser preserves the real session cookie.
  if (request.mode === 'navigate') return;
  // Bundles must be network-first: deployments replace their content while a
  // fixed URL can otherwise remain trapped in a user's old runtime cache.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => caches.match(request)));
    return;
  }
  // Images and uploaded media remain cache-first for a useful offline shell.
  if (url.pathname.startsWith('/media/')) {
    e.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
      return res;
    }).catch(() => hit)));
    return;
  }
  e.respondWith(fetch(request).catch(() => caches.match(request)));
});

// --- التنبيهات الفورية (Web Push) ---
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'تربح';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
