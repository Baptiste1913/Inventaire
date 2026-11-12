/* Inventaires U V34.34 — suivi des étapes réelles de mise à jour, récupération après rechargement. */
(()=>{'use strict';
 // Un marqueur dans l'URL du script chargé représente la version réellement exécutée.
 // Ne pas lire version.json ici : il indique la dernière version PUBLIÉE,
 // qui peut être différente de celle encore ouverte dans la PWA.
 const runningScript=document.currentScript?.src ||
   document.querySelector('script[src*="update-manager.js"]')?.src || '';
 const versionParam=(()=>{try{return new URL(runningScript,location.href).searchParams.get('v')||'';}catch{return '';}})();
 // The loaded HTML document identifies this app build. The update manager script
 // may legitimately be cached at an older query version if it has not changed.
 // Never use its own URL to label the active page.
 const documentVersion=document.querySelector('meta[name="iu-build-version"]')?.content?.trim()||'';
 const VERSION=/^\d+(?:\.\d+){1,3}$/.test(documentVersion)?documentVersion:
   (/^\d+(?:\.\d+){1,3}$/.test(versionParam)?versionParam:'indéterminée');
 window.IUCurrentVersion=VERSION;
 const $=id=>document.getElementById(id);
 const main=$('iuUpdateButton'),secondary=$('iuUpdateReload');if(!main)return;
 const ADMIN=$('planningAdminCard');
 let busy=false, knownPublished='', notes='', ready=false, lastChecked='', publication='',reg=null, state='idle';
 const log=type=>window.IUTechnicalLog?.(type);
 const sessionSafe=()=>window.IUCanSafelyUpdate?.()===true;

 const UPDATE_VISUAL_KEY='iu-update-visual-v1';
 const root=document.documentElement;
 const overlay=$('iuUpdateOverlay');
 const overlayTitle=$('iuUpdateScreenTitle');
 const overlayText=$('iuUpdateScreenText');
 const overlayDismiss=$('iuUpdateOverlayDismiss');
 const progress=$('iuUpdateProgress');
 const progressStep=$('iuUpdateStep');
 const progressCount=$('iuUpdateStepCount');
 const steps=['Activation de la mise à jour','Chargement de l’application','Préparation des services','Finalisation de l’installation'];
 const updateProgress=(step)=>{
   const n=Math.max(0,Math.min(4,Number(step)||0));
   if(progress){
     progress.style.setProperty('--iu-update-complete',(n*25)+'%');
     progress.setAttribute('aria-valuenow',String(n));
     progress.setAttribute('aria-valuetext',n===4?'Installation terminée':steps[Math.min(n,3)]);
   }
   if(progressStep)progressStep.textContent=n===4?'Installation terminée':steps[Math.min(n,3)];
   if(progressCount)progressCount.textContent=n===4?'Terminé':'Étape '+Math.min(n+1,4)+' sur 4';
 };

 const clearStoredVisual=()=>{try{sessionStorage.removeItem(UPDATE_VISUAL_KEY);}catch(_){}};
 const storeVisual=(at,target)=>{try{sessionStorage.setItem(UPDATE_VISUAL_KEY,JSON.stringify({at,target}));}catch(_){}};
 const revealState=(kind)=>{root.classList.remove('iu-update-running','iu-update-recovering');root.classList.add(kind);};
 const showVisual=(recovering=false)=>{
   if(!overlay)return;
   overlay.classList.remove('iu-update-overlay-leaving');
   overlay.setAttribute('aria-hidden','false');
   overlayDismiss.hidden=true;
   overlayTitle.textContent='Installation de la mise à jour…';
   updateProgress(recovering?1:0);
   overlayText.textContent=recovering?'Chargement de la nouvelle version.':'Préparation de votre nouvelle version.';
   revealState(recovering?'iu-update-recovering':'iu-update-running');
 };
 const hideVisual=()=>{
   overlay?.classList.remove('iu-update-overlay-leaving');
   overlay?.setAttribute('aria-hidden','true');
   root.classList.remove('iu-update-running','iu-update-recovering');
 };
 function failVisual(message){
   clearStoredVisual();
   root.classList.remove('iu-update-running','iu-update-recovering');
   if(!overlay)return;
   overlay.style.display='flex';
   overlay.classList.remove('iu-update-overlay-leaving');
   if(progressStep)progressStep.textContent='Installation interrompue';
   if(progressCount)progressCount.textContent='À vérifier';
   overlayTitle.textContent='Mise à jour non confirmée';
   overlayText.textContent=message||'La version actuelle reste accessible.';
   overlayDismiss.hidden=false;
   overlayDismiss.onclick=()=>{overlay.style.removeProperty('display');overlay.setAttribute('aria-hidden','true');};
 }
 function completeVisual(){
   let payload=null;
   try{payload=JSON.parse(sessionStorage.getItem(UPDATE_VISUAL_KEY)||'null');}catch(_){}
   if(!payload||typeof payload.at!=='number'){hideVisual();return;}
   showVisual(true);
   overlayText.textContent='Chargement de l’application et de l’administration…';
   let cancelled=false;
   const waitForAdmin=()=>new Promise((resolve,reject)=>{
     if(window.IUAdminInitialReady===true){resolve();return;}
     let timeout=null;
     const ready=()=>{clearTimeout(timeout);resolve();};
     window.addEventListener('iu-admin-initial-ready',ready,{once:true});
     timeout=setTimeout(()=>{
       window.removeEventListener('iu-admin-initial-ready',ready);
       reject(new Error('admin-timeout'));
     },18000);
   });
   const waitForLoad=()=>new Promise(resolve=>{
     if(document.readyState==='complete'){resolve();return;}
     window.addEventListener('load',resolve,{once:true});
   });
   const waitForQuietAdmin=()=>new Promise(resolve=>{
     const admin=$('planningAdminCard');
     if(!admin){resolve();return;}
     let idle=null;
     const observer=new MutationObserver(()=>{
       clearTimeout(idle);idle=setTimeout(complete,400);
     });
     const complete=()=>{observer.disconnect();resolve();};
     observer.observe(admin,{subtree:true,childList:true,attributes:true,characterData:true});
     idle=setTimeout(complete,450);
   });
   (async()=>{
     try{
       await waitForLoad();
       updateProgress(2);
       await waitForAdmin();
       if(document.fonts?.ready)await document.fonts.ready;
       // L'ouverture de la nouvelle page prépare son cache hors ligne avant révélation.
       // Deux frames confirment que la disposition a été peinte.
       await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
       await waitForQuietAdmin();
       if(payload.target&&payload.target!==VERSION){
         throw new Error('version-mismatch');
       }
       if(cancelled)return;
       updateProgress(3);
       const cards=[...document.querySelectorAll('.app > .card, .app > .inventory-calendar, .app > footer')]
         .filter(el=>{const st=getComputedStyle(el);return !el.hidden&&st.display!=='none'&&st.visibility!=='hidden';});
       const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
       const cascadeMs=reduced?0:620+Math.max(0,cards.length-1)*85;
       // Les contrôles du chargement, de l'administration, des polices et
       // de la peinture sont terminés : aucun délai minimum artificiel.
       overlayText.textContent='Finalisation de la mise à jour…';
       if(cancelled)return;
       updateProgress(4);
       overlayTitle.textContent='Mise à jour installée';
       overlayText.textContent='Inventaires U est prêt.';
       cards.forEach((el,i)=>el.style.setProperty('--iu-update-order',String(i)));
       root.classList.add('iu-update-revealing');
       overlay.classList.add('iu-update-overlay-leaving');
       clearStoredVisual();
       setTimeout(()=>{hideVisual();overlay.style.removeProperty('display');},reduced?0:470);
       setTimeout(()=>{
         root.classList.remove('iu-update-revealing');
         cards.forEach(el=>el.style.removeProperty('--iu-update-order'));
       },cascadeMs+100);
     }catch(error){
       if(cancelled)return;
       const message=error?.message==='version-mismatch'
         ?'La nouvelle version n’a pas été chargée. Vérifie les mises à jour depuis l’administration.'
         :'Le chargement de l’administration n’a pas pu être confirmé. Tu peux revenir à l’application et réessayer.';
       failVisual(message);
     }
   })();
 }
 if(root.classList.contains('iu-update-recovering'))completeVisual();
 const set=(type,title,detail,button,disabled=false)=>{
  state=type;$('iuUpdateIndicator').dataset.state=type;
  $('iuUpdateTitle').textContent=title;$('iuUpdateDetail').textContent=detail;
  main.textContent=button;main.disabled=disabled;
 };
 $('iuInstalledVersion').textContent=VERSION;
 $('iuPublishedVersion').textContent='—';
 const absolute=(x)=>String(x||'').replace(/[<>]/g,'').slice(0,700);
 function releaseInfo(){const el=$('iuUpdateRelease');if(!notes||knownPublished===VERSION){el.hidden=true;return;}
  el.hidden=false;$('iuUpdateNotes').textContent=notes;$('iuUpdatePublished').textContent=publication?'Publication : '+publication:'';
 }
 async function check(){if(busy)return;busy=true;
  set('checking','Recherche en cours…','Consultation des fichiers publiés et du cache PWA.','Vérification…',true);
  let publishedOK=false,workerOK=false;
  if(navigator.onLine){
   try{const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),6000);
    let r;try{r=await fetch('./version.json?update='+Date.now(),{cache:'no-store',signal:ac.signal});}finally{clearTimeout(timeout);}
    if(!r.ok)throw Error('unavailable');const payload=await r.json();
    if(typeof payload.version!=='string'||!/^[0-9]+(?:\.[0-9]+){1,3}$/.test(payload.version))throw Error('invalid version');
    knownPublished=payload.version;notes=absolute(payload.notes);publication=absolute(payload.published);
    $('iuPublishedVersion').textContent=knownPublished;publishedOK=true;
   }catch{log('hosting');}
  }
  if('serviceWorker'in navigator){
   try{reg=window.IUWorkerRegistration||await navigator.serviceWorker.getRegistration()||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
    if(navigator.onLine)await reg.update();workerOK=true;
   }catch{log('worker');}
  }
  // Installation is only offered for a fully installed waiting worker.
  // Rechercher la registration actuelle, pas seulement la référence mémorisée.
  if('serviceWorker'in navigator){
    try{reg=await navigator.serviceWorker.getRegistration()||reg;}catch(_){}
  }
  ready=Boolean(reg?.waiting&&navigator.serviceWorker.controller);
  lastChecked=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  $('iuUpdateChecked').textContent='Dernière vérification : '+lastChecked;
  busy=false;render(publishedOK,workerOK);releaseInfo();
 }
 function render(publishedOK=true,workerOK=true){
  secondary.hidden=true;
  if(ready){
   if(sessionSafe())set('ready','Mise à jour prête','La nouvelle version est téléchargée et peut être installée.','Installer maintenant');
   else set('waiting','Installation reportée','Un inventaire est en cours : termine-le avant d’installer la mise à jour.','Vérifier à nouveau');
  }else if(!navigator.onLine){set('offline','Hors ligne','La recherche sera possible lorsque la connexion reviendra.','Réessayer');}
  else if(!publishedOK){set('unavailable','Vérification impossible','Impossible de confirmer la version actuellement publiée.','Réessayer');}
  else if(knownPublished!==VERSION){set('available','Version '+knownPublished+' publiée',workerOK?'Mise à jour détectée. Si elle ne devient pas prête, ferme puis rouvre l’application et relance la vérification.':'Préparation du cache impossible. Vérifie ta connexion et réessaie.','Vérifier à nouveau');}
  else{set('current','Application à jour','Tu utilises la version actuellement publiée.','Vérifier les mises à jour');}
 }
 async function install(){
  if(busy)return;
  if(!sessionSafe()){render();return;}
  reg=window.IUWorkerRegistration||await navigator.serviceWorker.getRegistration();
  if(!reg?.waiting){await check();return;}
  busy=true;
  const begunAt=Date.now();
  showVisual();
  set('checking','Activation en cours…','La nouvelle version sera ouverte une fois le cache activé.','Installation…',true);
  let finished=false;
  let timeoutId=null;
  const onControllerChange=()=>{
   if(finished)return;
   finished=true;
   clearTimeout(timeoutId);
   if(sessionSafe()){
     updateProgress(1);
     storeVisual(begunAt,knownPublished||'');
     // Conserver l'écran à l'image pendant le rechargement de la PWA.
     setTimeout(()=>location.reload(),110);
   }else{
     hideVisual();
     busy=false;ready=false;
     set('waiting','Rechargement reporté','Termine ton inventaire, puis recharge la version publiée.','Vérifier à nouveau');
     secondary.hidden=false;
   }
  };
  navigator.serviceWorker.addEventListener('controllerchange',onControllerChange,{once:true});
  try{
   reg.waiting.postMessage({type:'IU_ACTIVATE_UPDATE'});
   timeoutId=setTimeout(()=>{
     if(finished)return;
     finished=true;
     navigator.serviceWorker.removeEventListener('controllerchange',onControllerChange);
     hideVisual();
     busy=false;
     log('update');
     set('unavailable','Activation non confirmée','Tu peux réessayer de vérifier les mises à jour.','Réessayer');
   },10000);
  }catch{
   finished=true;
   navigator.serviceWorker.removeEventListener('controllerchange',onControllerChange);
   hideVisual();busy=false;log('update');
   set('unavailable','Installation impossible','Réessaie lorsque la connexion est stable.','Réessayer');
  }
 }

 main.addEventListener('click',()=>{if(ready&&sessionSafe())install();else check();});
 secondary.addEventListener('click',()=>{if(sessionSafe())location.reload();else set('waiting','Inventaire en cours','Termine ton inventaire avant de recharger.','Vérifier à nouveau');});
 const activated=()=>{if(ADMIN?.open)check();};
 ADMIN?.addEventListener('toggle',activated);
 window.addEventListener('iu-update-ready',()=>{if(ADMIN?.open)check();});
 window.addEventListener('online',()=>{if(ADMIN?.open)check();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ADMIN?.open)check();});
 if(ADMIN?.open)check();
})();
