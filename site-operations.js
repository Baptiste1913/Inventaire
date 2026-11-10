/* Inventaires U 33.84 — état technique local, sans télémétrie utilisateurs. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const VERSION='33.85';
 const root=document.documentElement;
 const splash=$('iuPwaSplash');
 // L'écran d'ouverture ne concerne que la PWA installée : 2,4 à 3 s,
 // puis les cartes montent légèrement sans flou. Ne jamais forcer un reload.
 if(root.classList.contains('iu-pwa-starting')){
  const started=performance.now();
  let ready=document.readyState==='complete';
  let done=false;
  const reveal=()=>{
   if(done||!ready||performance.now()-started<2400)return;
   done=true;
   root.classList.add('iu-pwa-splash-leaving');
   root.classList.add('iu-pwa-revealing');
   const finish=()=>{
    root.classList.remove('iu-pwa-starting','iu-pwa-splash-leaving');
    splash?.setAttribute('aria-hidden','true');
    setTimeout(()=>root.classList.remove('iu-pwa-revealing'),760);
   };
   setTimeout(finish,330);
  };
  if(!ready)window.addEventListener('load',()=>{ready=true;reveal();},{once:true});
  setTimeout(reveal,2420);
  // L'interface ne doit pas rester bloquée si une ressource distante tarde.
  setTimeout(()=>{ready=true;reveal();},2900);
 }
 const panel=$('siteOperationsPanel');if(!panel)return;
 const apply=$('opsApplyUpdate');
 const value=(id,tone,text)=>{const el=$(id);if(!el)return;el.textContent=text;el.dataset.state=tone;};
 const formatBytes=n=>n>=1048576?(n/1048576).toFixed(2)+' Mo':Math.round(n/1024)+' Ko';
 let refreshing=false;
 const fetchTimed=async(url,options={})=>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4500);
  try{return await fetch(url,{...options,signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
 };
 async function manifest(){
  const r=await fetchTimed('./version.json?check='+Date.now());if(!r.ok)throw Error('HTTP '+r.status);return await r.json();
 }
 async function updateCheck(){
  if(apply)apply.hidden=true;
  if(!('serviceWorker' in navigator)){value('opsUpdate','muted','Non applicable');return;}
  const reg=window.IUWorkerRegistration||await navigator.serviceWorker.getRegistration();
  if(reg?.waiting){value('opsUpdate','warning','Prête à installer');if(apply){apply.hidden=false;apply.disabled=!window.IUCanSafelyUpdate?.();}return;}
  if(!navigator.onLine){value('opsUpdate','muted','Vérification hors ligne');return;}
  try{await reg?.update();}catch{}
  if(reg?.waiting){value('opsUpdate','warning','Prête à installer');if(apply){apply.hidden=false;apply.disabled=!window.IUCanSafelyUpdate?.();}return;}
  try{const v=await manifest();value('opsUpdate',v.version!==VERSION?'warning':'success',v.version!==VERSION?'Version '+v.version+' publiée':'À jour');}
  catch{value('opsUpdate','muted','Non vérifiable');}
 }
 async function refresh(){
  if(refreshing)return;refreshing=true;
  const button=$('opsRefresh');if(button)button.disabled=true;
  value('opsNetwork',navigator.onLine?'success':'warning',navigator.onLine?'En ligne (déclaré)':'Hors ligne');
  value('opsWorker','muted','Vérification…');
  value('opsHosting','muted','Vérification…');
  value('opsSupabase','muted','Vérification…');
  value('opsUpdate','muted','Vérification…');
  value('opsVersion','normal',VERSION);
  const nav=performance.getEntriesByType?.('navigation')?.[0];
  value('opsLoad','normal',nav?.duration>0?Math.round(nav.duration)+' ms':'Indisponible');
  value('opsPush','normal',!('Notification' in window)?'Non compatible':Notification.permission==='granted'?'Autorisées':Notification.permission==='denied'?'Bloquées':'Non autorisées');
  try{
   const r=await navigator.serviceWorker?.getRegistration();
   const controlled=!!navigator.serviceWorker?.controller;
   value('opsWorker',controlled?'success':'warning',controlled?'Actif':r?'Installé, non actif':'Non installé');
  }catch{value('opsWorker','warning','Indisponible');}
  await Promise.all([
   (async()=>{try{const m=await manifest();value('opsHosting','success','Accessible');value('opsVersion','normal',m.version||VERSION);value('opsAssets','normal',String(m.assets||'—'));value('opsSize','normal',Number.isFinite(m.bytes)?formatBytes(m.bytes):'—');}
     catch{value('opsHosting','warning',navigator.onLine?'Non vérifiable':'Hors ligne');value('opsAssets','muted','—');value('opsSize','muted','—');}})(),
   (async()=>{if(!navigator.onLine){value('opsSupabase','muted','Hors ligne');return;}
    const config=window.INVENTAIRES_AUTH_CONFIG;
    if(!config?.supabaseUrl){value('opsSupabase','muted','Non configuré');return;}
    try{const response=await fetchTimed(config.supabaseUrl.replace(/\/$/,'')+'/auth/v1/health',{headers:{apikey:config.supabaseAnonKey||''}});
      value('opsSupabase',response.ok?'success':'warning',response.ok?'Accessible':'HTTP '+response.status);
    }catch{value('opsSupabase','warning','Non vérifiable');}})(),
   updateCheck()
  ]);
  $('opsChecked').textContent='Dernière vérification : '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'. Indicateurs techniques observés depuis cet appareil.';
  refreshing=false;if(button)button.disabled=false;
 }
 panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
 $('opsRefresh')?.addEventListener('click',refresh);
 apply?.addEventListener('click',async()=>{
  if(!window.IUCanSafelyUpdate?.()){
   value('opsUpdate','warning','Termine ton inventaire avant la mise à jour');return;
  }
  apply.disabled=true;
  try{
   const reg=window.IUWorkerRegistration||await navigator.serviceWorker.getRegistration();
   if(!reg?.waiting){value('opsUpdate','warning','Mise à jour non encore prête');return;}
   let reloaded=false;
   navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!reloaded){reloaded=true;window.location.reload();}
   },{once:true});
   reg.waiting.postMessage({type:'IU_ACTIVATE_UPDATE'});
   value('opsUpdate','success','Activation en cours…');
  }catch{apply.disabled=false;value('opsUpdate','warning','Activation impossible');}
 });
 window.addEventListener('iu-update-ready',()=>{if(panel.open)updateCheck();});
 // Signaler une version publiée même si le worker en attente n'a pas terminé.
})();
