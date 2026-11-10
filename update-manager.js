/* Inventaires U V33.93 — version utilisée dérivée du script effectivement chargé. */
(()=>{'use strict';
 // Un marqueur dans l'URL du script chargé représente la version réellement exécutée.
 // Ne pas lire version.json ici : il indique la dernière version PUBLIÉE,
 // qui peut être différente de celle encore ouverte dans la PWA.
 const runningScript=document.currentScript?.src ||
   document.querySelector('script[src*="update-manager.js"]')?.src || '';
 const versionParam=(()=>{try{return new URL(runningScript,location.href).searchParams.get('v')||'';}catch{return '';}})();
 const VERSION=/^\d+(?:\.\d+){1,3}$/.test(versionParam)?versionParam:'indéterminée';
 window.IUCurrentVersion=VERSION;
 const $=id=>document.getElementById(id);
 const main=$('iuUpdateButton'),secondary=$('iuUpdateReload');if(!main)return;
 const ADMIN=$('planningAdminCard');
 let busy=false, knownPublished='', notes='', ready=false, lastChecked='', publication='',reg=null, state='idle';
 const log=type=>window.IUTechnicalLog?.(type);
 const sessionSafe=()=>window.IUCanSafelyUpdate?.()===true;
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
  else if(knownPublished!==VERSION){set('available','Version '+knownPublished+' publiée',workerOK?'Installation en préparation dans le cache.':'Impossible de préparer le cache pour le moment.','Vérifier à nouveau');}
  else{set('current','Application à jour','Tu utilises la version actuellement publiée.','Vérifier les mises à jour');}
 }
 async function install(){if(busy)return;
  if(!sessionSafe()){render();return;}
  reg=window.IUWorkerRegistration||await navigator.serviceWorker.getRegistration();
  if(!reg?.waiting){await check();return;}
  busy=true;set('checking','Activation en cours…','La nouvelle version sera ouverte une fois le cache activé.','Installation…',true);
  let finish=false;const controllerChanged=()=>{if(finish)return;finish=true;
    // Check again at the last possible moment; refuse reload if inventory started meanwhile.
    if(sessionSafe())location.reload();else {busy=false;ready=false;set('waiting','Rechargement reporté','Termine ton inventaire, puis recharge la version publiée.','Vérifier à nouveau');secondary.hidden=false;}
   };
  navigator.serviceWorker.addEventListener('controllerchange',controllerChanged,{once:true});
  try{reg.waiting.postMessage({type:'IU_ACTIVATE_UPDATE'});
   // If controllerchange never arrives, provide a safe manual recovery path.
   setTimeout(()=>{if(!finish){busy=false;log('update');set('unavailable','Activation non confirmée','Tu peux réessayer de vérifier les mises à jour.','Réessayer');}},10000);
  }catch{busy=false;log('update');set('unavailable','Installation impossible','Réessaie lorsque la connexion est stable.','Réessayer');}
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
