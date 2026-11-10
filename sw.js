/* Inventaires U V32.3 — application shell hors ligne */
const CACHE = 'inventaires-u-offline-v33-64';
const CORE = [
  './', './index.html', './hero-layout.js?v=33.33', './push.js?v=33.34', './planning-admin.js?v=33.40', './events-data.js?v=33.19', './events.js?v=33.55', './style.css?v=33.64', './app.js?v=33.64',
  './auth-config.js?v=32.0', './idb.js?v=33.0', './auth.js?v=33.60', './manifest.webmanifest?v=13', './icon.png?v=11',
  './google-logo.png?v=32.0', './user-icon.png?v=33.1', './icon-512.png', './logo-u.png', './favicon.ico?v=13',
  './favicon-16.png?v=13', './favicon-32.png?v=13', './tutorial-share.png', './tutorial-home.png', './offline-no-wifi.png', './start-inventory-icon.png?v=32.0'
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

/* V33.16 — notifications visibles même lorsque la PWA est fermée. */
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch(_){payload={body:event.data?.text()||''};}
 const title=typeof payload.title==='string'?payload.title:'Inventaires U';
 const body=typeof payload.body==='string'?payload.body:'Votre prochain inventaire approche.';
 event.waitUntil(self.registration.showNotification(title,{body,icon:'./icon.png',badge:'./favicon-32.png',tag:payload.tag||'inventaires-u-reminder',data:{url:'./'},renotify:false}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{const url=new URL('./',self.registration.scope).href;const tabs=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=tabs.find(t=>t.url.startsWith(self.registration.scope));if(existing){await existing.focus();return;}await self.clients.openWindow(url);})());
});
