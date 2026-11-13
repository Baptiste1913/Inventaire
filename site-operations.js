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
  const splashStartedAt=performance.now();
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
  // V36.41 — Préparation complète des contenus déjà autorisés avant de
  // masquer le splash. Aucun <details> n'est ouvert artificiellement, aucune
  // écriture dans localStorage et aucune requête cloud obligatoire hors ligne.
  // V36.42 — Ordonnanceur des preparations, mesures factuelles et repli
  // sur le demarrage local lorsque le reseau ou l'authentification est lent.
  const prewarmPanels=async()=>{
   const begin=performance.now();
   const metrics={version:VERSION,startedAt:Date.now(),tasks:[],longTasks:0,slowestTaskMs:0};
   window.IUStartupMetrics=metrics;
   const observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>{
    metrics.longTasks+=list.getEntries().length;
   }):null;
   try{observer?.observe({entryTypes:['longtask']});}catch(_){}
   const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
   const run=async(name,from,to,fn)=>{
    const t=performance.now();
    set(from,name);
    try{await fn();metrics.tasks.push({name,ms:Math.round(performance.now()-t),ok:true});}
    catch(error){metrics.tasks.push({name,ms:Math.round(performance.now()-t),ok:false});console.warn('Preparation '+name,error);}
    metrics.slowestTaskMs=Math.max(metrics.slowestTaskMs,metrics.tasks[metrics.tasks.length-1].ms);
    set(to,name);
    await yieldFrame();
   };
   // Le calcul local peut se faire avant la connexion Google.
   await run('Listes et bilans',96,97,()=>window.IUPrewarmLocalPanels?.());
   await run('Images et polices',97,98,async()=>{
    const images=[...document.images].filter(el=>el.getAttribute('src'));
    await Promise.race([Promise.allSettled(images.map(el=>{
     try{return typeof el.decode==='function'?el.decode().catch(()=>{}):Promise.resolve();}
     catch(_){return Promise.resolve();}
    })),sleep(2600)]);
    if(document.fonts?.ready)await Promise.race([document.fonts.ready.catch(()=>{}),sleep(1200)]);
   });
   // On laisse au login/planning un délai raisonnable, mais jamais infini :
   // ces services ne doivent pas empêcher l'inventaire sans réseau.
   await run('Compte et administration',98,98,async()=>{
    await Promise.all([
     readyOrTimeout(()=>window.IUAuthInitialReady===true,4800),
     readyOrTimeout(()=>window.IUAdminInitialReady===true,4800)
    ]);
    window.IUPrewarmAccount?.();
   });
   await run('Dimensions et animations',98,99,async()=>{
    await window.IUPrewarmFoldLayouts?.();
   });
   metrics.totalMs=Math.round(performance.now()-begin);
   metrics.foldCache=window.IUFoldPerformance?.();
   try{observer?.disconnect();}catch(_){}
   return true;
  };
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
    // Attendre la préparation effective du cache hors ligne. Pas de préchargement
    // des données privées ni de dépendance au réseau Supabase pour les pesées.
    const offlineReady=await new Promise(resolve=>{
     if(!('serviceWorker' in navigator)){resolve(false);return;}
     let settled=false, timer=null, channel=null;
     const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);try{channel?.port1.close();channel?.port2.close();}catch(_){}resolve(ok);};
     timer=setTimeout(()=>finish(false),14000);
     (async()=>{
      try{
       const reg=await navigator.serviceWorker.ready;
       if(settled)return;
       const worker=navigator.serviceWorker.controller||reg.active;
       if(!worker){finish(false);return;}
       channel=new MessageChannel();
       channel.port1.onmessage=event=>{
        const data=event.data||{};
        if(data.type==='IU_OFFLINE_PROGRESS'&&data.total){
         // 72 à 96 % correspondent aux fichiers réellement contrôlés.
         set(72+Math.round(24*data.done/data.total),'Préparation hors ligne');
        }
        if(data.type==='IU_OFFLINE_COMPLETE')finish(data.missing===0);
       };
       worker.postMessage({type:'IU_PREPARE_OFFLINE'},[channel.port2]);
      }catch(_){finish(false);}
     })();
    });
    await prewarmPanels();
    const usable=Boolean(document.querySelector('.app > .calc-card')&&document.querySelector('#grossWeight'));
    if(offlineReady&&coreReady&&usable)set(100,'Ouverture terminée');
    else console.warn('Ouverture : certaines ressources hors ligne ou étapes de préparation ne sont pas confirmées.');
    // Le chargement visible dépend des vérifications, avec un court temps
    // de lecture de l'animation uniquement si tout est effectivement prêt.
    if(offlineReady&&coreReady&&usable)await sleep(Math.max(0,950-performance.now()+splashStartedAt));
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
  const startup=window.IUStartupMetrics;
  const folds=window.IUFoldPerformance?.();
  const perfInfo=startup?.totalMs!==undefined
   ?' · Préparation '+startup.totalMs+' ms · Dimensions '+(folds?.prepared||0)+' blocs · Cache '+(folds?.cacheHits||0)+' utilisation(s) · '+(folds?.cacheMisses||0)+' recalcul(s)'
   :'';
  // V36.50 — Surfaces surveillées par l'optimiseur (mesures locales,
  // pas une estimation inventée du nombre de FPS).
  const animationStats=window.IUMotionOptimizer?.stats();
  const motionInfo=animationStats
   ?' · Animation : '+animationStats.offscreen+' zone(s) hors écran sur '+(animationStats.owners+animationStats.details)+' suivie(s)'
   :'';
  $('opsChecked').textContent='Dernière vérification : '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'. Indicateurs techniques observés depuis cet appareil.'+perfInfo+motionInfo;
  refreshing=false;if(button)button.disabled=false;
 }
 // V36.40 — Diagnostics préparés dès que l'accès administrateur est
 // autorisé, idéalement avant le premier dépliage. Pas de requêtes réseau
 // répétées à chaque ouverture ; le bouton Actualiser reste disponible.
 const adminCard=$('planningAdminCard');
 let diagnosticTimer=0,diagnosticsReady=false;
 const queueDiagnostics=(delay=900)=>{
  clearTimeout(diagnosticTimer);
  if(!adminCard||adminCard.hidden||diagnosticsReady)return;
  diagnosticTimer=setTimeout(async()=>{
   diagnosticTimer=0;
   if(adminCard.hidden||diagnosticsReady)return;
   // Ne pas modifier les indicateurs en pleine animation de hauteur.
   if(adminCard.classList.contains('iu-fold-animating')){
    queueDiagnostics(520);return;
   }
   await refresh();
   diagnosticsReady=true;
  },delay);
 };
 if(adminCard){
  const visibilityObserver=new MutationObserver(()=>{
   if(!adminCard.hidden)queueDiagnostics(900);
   else clearTimeout(diagnosticTimer);
  });
  visibilityObserver.observe(adminCard,{attributes:true,attributeFilter:['hidden']});
  if(!adminCard.hidden)queueDiagnostics(1000);
  adminCard.addEventListener('toggle',()=>{
   if(adminCard.open&&!diagnosticsReady)queueDiagnostics(520);
  });
 }
 // V36.43 — Comparaison A/B sur les seules cartes lourdes.
 // Les mesures sont locales et limitées aux dernières animations.
 const compare=$('opsFoldCompare'),results=$('opsFoldTestResults');
 const showFoldResults=()=>{
  if(!results)return;
  const perf=window.IUFoldPerformance?.();
  const recent=(perf?.recent||[]).filter(x=>x&&Number.isFinite(x.durationMs));
  const shown=recent.slice(-6);
  const lines=shown.map(x=>{
   const name=x.name==='planningAdminCard'?'Administrateur':x.name==='accountCard'?'Mon compte':x.name?.slice(0,35)||'Tiroir';
   return name+' ('+(x.effects||'normal')+') : '+x.durationMs+' ms, '+(x.slowFrames||0)+' intervalle(s) > 34 ms, écart max '+(x.maxGapMs||0)+' ms';
  });
  results.textContent='Cache : '+(perf?.cacheHits||0)+' utilisation(s), '+(perf?.cacheMisses||0)+' nouvelle(s) mesure(s).'+
   (lines.length?'\n'+lines.join('\n'):'\\nAucune animation mesurée. Ouvre puis ferme un tiroir pour comparer.');
 };
 compare?.addEventListener('click',()=>{
  const enabled=window.IUSetFoldLightEffects?.(!window.IUGetFoldLightEffects?.())===true;
  compare.setAttribute('aria-pressed',String(enabled));
  compare.textContent=enabled?'Rétablir les effets graphiques':'Tester la fluidité sans effets graphiques';
  showFoldResults();
 });
 window.addEventListener('iu-fold-performance',showFoldResults);
 showFoldResults();
 $('opsRefresh')?.addEventListener('click',refresh);
 window.addEventListener('iu-update-ready',()=>{if(adminCard?.open)updateCheck();});
 // Signaler une version publiée même si le worker en attente n'a pas terminé.
})();
