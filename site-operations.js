/* Inventaires U V34.39 — état technique et ouverture PWA avec progression contrôlée. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const VERSION=document.querySelector('meta[name="iu-build-version"]')?.content||'indéterminée';
 const root=document.documentElement;
 const splash=$('iuPwaSplash');
 // V34.39 — Progression basée sur la disponibilité vérifiable de l'application.
 // Aucun pourcentage ne dépend d'une minuterie : le chargement réseau
 // ou cloud non essentiel ne bloque pas les pesées locales.
 if(root.classList.contains('iu-pwa-starting')){
  const loader=$('iuSplashLoader'),step=$('iuSplashStep'),percent=$('iuSplashPercent');
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
  let value=0,finished=false;
  const set=(next,label)=>{
   if(finished)return;
   value=Math.max(value,Math.min(100,Math.round(next)));
   loader?.style.setProperty('--iu-splash-progress',value+'%');
   loader?.setAttribute('aria-valuenow',String(value));
   if(percent)percent.textContent=value+' %';
   if(label&&step)step.textContent=label;
  };
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const readyOrTimeout=(check,timeout=2500)=>new Promise(resolve=>{
   if(check()){resolve(true);return;}
   const begun=performance.now();
   const poll=()=>{
    if(check()){resolve(true);return;}
    if(performance.now()-begun>=timeout){resolve(false);return;}
    setTimeout(poll,60);
   };
   setTimeout(poll,60);
  });
  const whenReady=()=>new Promise(resolve=>{
   if(document.readyState!=='loading'){resolve();return;}
   document.addEventListener('DOMContentLoaded',resolve,{once:true});
  });
  const reveal=()=>{
   if(finished)return;
   finished=true;
   const cards=[...document.querySelectorAll('.app > .card, .app > .inventory-calendar, .app > footer')]
    .filter(el=>{const cs=getComputedStyle(el);return !el.hidden&&cs.display!=='none'&&cs.visibility!=='hidden';});
   cards.forEach((el,i)=>el.style.setProperty('--iu-pwa-order',String(i)));
   root.classList.add('iu-pwa-splash-leaving','iu-pwa-revealing');
   setTimeout(()=>{
    root.classList.remove('iu-pwa-starting','iu-pwa-splash-leaving');
    splash?.setAttribute('aria-hidden','true');
    const finalDuration=reduced?0:620+Math.max(0,cards.length-1)*85;
    setTimeout(()=>{
     root.classList.remove('iu-pwa-revealing');
     cards.forEach(el=>el.style.removeProperty('--iu-pwa-order'));
    },finalDuration+80);
   },reduced?0:320);
  };
  (async()=>{
   try{
    set(6,'Préparation de l’application');
    await whenReady();
    set(23,'Interface chargée');
    // Ce drapeau est posé à la fin de l'initialisation du moteur de pesée.
    const coreReady=await readyOrTimeout(()=>typeof window.IUCanSafelyUpdate==='function',2500);
    if(!coreReady){
     console.info('Ouverture : moteur de pesée non confirmé à temps');
    }
    if(coreReady)set(50,'Pesée initialisée');
    const loaded=await readyOrTimeout(()=>document.readyState==='complete',1800);
    if(loaded)set(72,'Ressources chargées');
    // La police ne doit pas ralentir indéfiniment le mode hors ligne.
    if(document.fonts?.ready){
     await Promise.race([document.fonts.ready.catch(()=>{}),sleep(750)]);
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const usable=Boolean(document.querySelector('.app > .calc-card')&&document.querySelector('#grossWeight'));
    if(usable)set(92,'Espace prêt');
    // Pas de durée minimum : 100 % uniquement si le moteur et le formulaire
    // sont vérifiés. La transition se lance dès que ces étapes sont prêtes.
    if(coreReady&&usable)set(100,'Ouverture terminée');
    else console.warn('Ouverture : préparation non confirmée ; interface rendue sans fausse complétion.');
    reveal();
   }catch(error){
    console.warn('Ouverture : indicateur de chargement interrompu',error);
    set(100,'Ouverture de l’application');
    reveal();
   }
  })();
 }
 const panel=$('siteOperationsPanel');if(!panel)return;
 const apply=null;
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
  if(reg?.waiting){value('opsUpdate','warning','Prête à installer');return;}
  if(!navigator.onLine){value('opsUpdate','muted','Vérification hors ligne');return;}
  try{await reg?.update();}catch{}
  if(reg?.waiting){value('opsUpdate','warning','Prête à installer');return;}
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
     catch{window.IUTechnicalLog?.('hosting');value('opsHosting','warning',navigator.onLine?'Non vérifiable':'Hors ligne');value('opsAssets','muted','—');value('opsSize','muted','—');}})(),
   (async()=>{if(!navigator.onLine){value('opsSupabase','muted','Hors ligne');return;}
    const config=window.INVENTAIRES_AUTH_CONFIG;
    if(!config?.supabaseUrl){value('opsSupabase','muted','Non configuré');return;}
    try{const response=await fetchTimed(config.supabaseUrl.replace(/\/$/,'')+'/auth/v1/health',{headers:{apikey:config.supabaseAnonKey||''}});
      value('opsSupabase',response.ok?'success':'warning',response.ok?'Accessible':'HTTP '+response.status);
    }catch{window.IUTechnicalLog?.('service');value('opsSupabase','warning','Non vérifiable');}})(),
   updateCheck()
  ]);
  $('opsChecked').textContent='Dernière vérification : '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'. Indicateurs techniques observés depuis cet appareil.';
  refreshing=false;if(button)button.disabled=false;
 }
 const adminCard=$('planningAdminCard');
 if(adminCard){
  adminCard.addEventListener('toggle',()=>{if(adminCard.open)refresh();});
  if(adminCard.open)refresh();
 }
 $('opsRefresh')?.addEventListener('click',refresh);
 window.addEventListener('iu-update-ready',()=>{if(adminCard?.open)updateCheck();});
 // Signaler une version publiée même si le worker en attente n'a pas terminé.
})();
