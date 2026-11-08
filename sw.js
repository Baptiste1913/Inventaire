/* Inventaires U V31.17 — application shell hors ligne */
const CACHE = 'inventaires-u-offline-v31-17';
const CORE = [
  './', './index.html', './style.css?v=31.17', './app.js?v=31.17',
  './manifest.webmanifest?v=13', './icon.png?v=11',
  './icon-512.png', './logo-u.png', './favicon.ico?v=13',
  './favicon-16.png?v=13', './favicon-32.png?v=13', './offline-no-wifi.png', './start-inventory-icon.png?v=31.17'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Do not activate if a required file is missing.
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('inventaires-u-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put('./index.html', response.clone());
        return response;
      } catch (_) {
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }
  // Static resources are cache-first; query strings must match the precache list.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
