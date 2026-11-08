/* Inventaires U V32.3 — application shell hors ligne */
const CACHE = 'inventaires-u-offline-v34-5-beta';
const CORE = [
  './', './index.html', './style.css?v=34.3', './app.js?v=34.3',
  './bootstrap-v34.js?v=34.5', './auth-config.js?v=32.0', './idb.js?v=34.4', './auth.js?v=34.5', './manifest.webmanifest?v=13', './icon.png?v=11',
  './google-logo.png?v=32.0', './user-icon.png?v=33.1', './icon-512.png', './logo-u.png', './favicon.ico?v=13',
  './favicon-16.png?v=13', './favicon-32.png?v=13', './offline-no-wifi.png', './start-inventory-icon.png?v=32.0'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Do not activate if a required file is missing.
    await cache.addAll(CORE);
    // Wait until old clients close: do not replace a running inventory.
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
  if (url.origin !== self.location.origin) {
    // The ESM module is cached after the first online load. OAuth and cloud still need network.
    if(url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@supabase/supabase-js@2/')){
      event.respondWith((async()=>{
        const cache=await caches.open(CACHE);
        const hit=await cache.match(request);if(hit)return hit;
        const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());
        return response;
      })());
    }
    return;
  }
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
