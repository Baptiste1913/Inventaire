/* Inventaires U V34 beta — IndexedDB authoritative store, synchronous in-memory API. */
(()=>{'use strict';
 const DB='inventaires-u-v34',STORE='kv',BACKUP_DB='inventaires-u-v33',BACKUP_STORE='workspaces';
 const prefix='inventaires-u-', legacy='tare-paniettes-v1';
 const cache=new Map();let db=null,dirty=new Map(),drainPromise=null,writeError=null;const tabId=Math.random().toString(36).slice(2);let channel=null;
 const isAppKey=k=>typeof k==='string'&&(k.startsWith(prefix)||k===legacy);
 function open(){return new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onblocked=()=>no(Error('IndexedDB bloquée par un autre onglet'));});}
 function readAll(){return new Promise((ok,no)=>{const tx=db.transaction(STORE,'readonly'),s=tx.objectStore(STORE),a=s.getAllKeys(),b=s.getAll();tx.oncomplete=()=>ok(a.result.map((k,i)=>[k,b.result[i]]));tx.onerror=()=>no(tx.error);});}
 function commit(entries){return new Promise((ok,no)=>{const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);for(const [k,v] of entries){if(v===null)s.delete(k);else s.put(v,k);}tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});}
 function report(e){writeError=e;console.error('IndexedDB : écriture impossible',e);window.dispatchEvent(new CustomEvent('inventory-storage-error',{detail:String(e)}));}
 function drain(){
  if(drainPromise)return drainPromise;
  // An empty queue must not cache a resolved promise as an active drain.
  if(!dirty.size)return Promise.resolve();
  drainPromise=(async()=>{try{
   while(dirty.size){
    const batch=[...dirty];dirty.clear();
    try{await commit(batch);writeError=null;if(channel)channel.postMessage({tabId,keys:batch.map(x=>x[0])});}
    catch(e){for(const [k,v] of batch)if(!dirty.has(k))dirty.set(k,v);report(e);throw e;}
   }
  }finally{drainPromise=null;}})();
  return drainPromise;
 }
 async function flush(){while(drainPromise||dirty.size){await drain();}if(writeError)throw writeError;}
 function drainInBackground(){
  void drain().catch(e=>console.warn('Sauvegarde IndexedDB en attente de reprise',e));
 }
 let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;drainInBackground();});};
 const store={
  getItem(k){k=String(k);return cache.has(k)?cache.get(k):null;},
  setItem(k,v){k=String(k);v=String(v);cache.set(k,v);dirty.set(k,v);schedule();},
  removeItem(k){k=String(k);cache.delete(k);dirty.set(k,null);schedule();},
  key(i){return [...cache.keys()][i]??null;},
  get length(){return cache.size;},
  keys(){return [...cache.keys()];},
  async flush(){await flush();},
  get error(){return writeError;}
 };
 async function init(){db=await open();let all=await readAll();
  if(!all.length){const initial=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(isAppKey(k))initial.push([k,localStorage.getItem(k)]);}}catch(e){console.warn('Import localStorage indisponible',e);}
   if(initial.length){await commit(initial);all=initial;}
  }
  for(const [k,v] of all)cache.set(k,v);
  try{channel=new BroadcastChannel('inventaires-u-v34');channel.onmessage=e=>{if(e.data?.tabId===tabId)return;for(const key of e.data?.keys||[])window.dispatchEvent(new StorageEvent('storage',{key}));};}catch{}
  window.addEventListener('pagehide',drainInBackground);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)drainInBackground();});
  window.addEventListener('inventory-storage-error',()=>{const el=document.getElementById('weighStatus');if(el)el.textContent='Erreur de sauvegarde IndexedDB : ne ferme pas cette page. Exporte une sauvegarde.';});
  return store;
 }
 // Legacy V33 recovery copy retained as an independently readable fallback.
 const openOld=()=>new Promise((ok,no)=>{const r=indexedDB.open(BACKUP_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(BACKUP_STORE))r.result.createObjectStore(BACKUP_STORE);};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 async function oldGet(id){const d=await openOld();return new Promise((ok,no)=>{const t=d.transaction(BACKUP_STORE,'readonly'),r=t.objectStore(BACKUP_STORE).get(id);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error);t.oncomplete=()=>d.close();});}
 async function put(id,data){store.setItem(id==='guest'?'inventaires-u-guest-workspace-v1':'inventaires-u-account-workspace-v1:'+id,JSON.stringify(data));await store.flush();}
 async function get(id){const raw=store.getItem(id==='guest'?'inventaires-u-guest-workspace-v1':'inventaires-u-account-workspace-v1:'+id);if(raw){try{return {data:JSON.parse(raw),savedAt:Date.now()};}catch{}}return oldGet(id);}
 window.InventoryStore=store;window.InventairesIDB={init,put,get,flush:()=>store.flush()};
})();
