const CACHE = 'marusa-v2';
const STATIC = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Cache-first only for icon and manifest static assets
  if (STATIC.some(url => e.request.url.endsWith(url))) {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
  }
  // All other requests (HTML, CSS, JS, API) always go to network
});
