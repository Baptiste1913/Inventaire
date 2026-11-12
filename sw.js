/* Inventaires U V32.3 — application shell hors ligne */
const CACHE = 'inventaires-u-offline-v35-52';
const CORE = [
  './', './index.html', './version.json', './admin-categories.js?v=33.93', './technical-log.js?v=33.93', './update-manager.js?v=35.52', './error-journal.js?v=33.93', './site-operations.js?v=34.39', './push.js?v=33.75', './planning-admin.js?v=34.19', './events-data.js?v=33.19', './events.js?v=34.30', './style.css?v=35.52', './app.js?v=35.52',
  './auth-config.js?v=32.0', './idb.js?v=33.0', './auth.js?v=34.49', './manifest.webmanifest?v=13', './icon.png?v=11',
  './google-logo.png?v=32.0', './user-icon.png?v=33.1', './icon-512.png', './logo-u.png', './favicon-u.svg?v=35.52',
   './tutorial-share.png', './tutorial-home.png', './wifi-disconnected.svg', './wifi-connected.svg', './mascotte-pasteque.svg', './start-inventory-icon.png?v=32.0'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // V35.52 : protéger les fichiers indispensables sans bloquer toute la
    // mise à jour lorsqu'une image ou une ressource secondaire manque.
    // Ne jamais activer un shell incomplet.
    const required = ['./index.html', './style.css?v=35.52', './app.js?v=35.52',
      './update-manager.js?v=35.52', './auth-config.js?v=32.0', './idb.js?v=33.0',
      './auth.js?v=34.49'];
    await cache.addAll(required);
    const optional = CORE.filter(path => !required.includes(path));
    await Promise.allSettled(optional.map(async path => {
      const response = await fetch(new Request(path, {cache:'reload'}));
      if (response.ok) await cache.put(path, response);
    }));
    // L'activation reste manuelle pour protéger l'inventaire en cours.
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
  // version.json : vérification réseau à chaque demande, même si l'ancienne PWA contrôle la page.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(request,{cache:'no-store'}).catch(async()=>
      (await caches.match(request)) || Response.error()));
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

// Activer la mise à jour uniquement à la demande de l'utilisateur, jamais
// pendant un inventaire. Les clients existants pourront ensuite se recharger.
self.addEventListener('message',event=>{
 if(event.data?.type==='IU_ACTIVATE_UPDATE')self.skipWaiting();
});
