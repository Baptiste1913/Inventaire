/* Inventaires U V36.50 — animations visibles uniquement.
   Aucune donnée privée lue ; aucune minuterie métier, sauvegarde, synchronisation,
   animation de tiroir ou notification ne sont interceptées. */
(()=>{
 'use strict';
 if(window.IUMotionOptimizer)return;
 const root=document.documentElement;
 const ownerSelector='.app > .header, .app > .intro, .app > .card, .app > .inventory-calendar, .app > .focus-toolbar, .app > footer';
 const detailSelector='.app .intro-session-dot, .app .session-pill, .app .account-summary-status, .app .account-status-dot, .app .iu-admin-spinner, .app .focus-live-dot';
 const watched=new Map();
 const folding=new Set();
 let observer=null,detailObserver=null,connected=false,queued=false;
 let intersections=0;
 const mark=entries=>{
  for(const entry of entries){
   if(!entry.target.isConnected)continue;
   const offscreen=!entry.isIntersecting;
   entry.target.classList.toggle('iu-motion-offscreen',offscreen);
   intersections++;
  }
 };
 const isVisible=element=>{
  if(document.hidden||!element?.isConnected||element.hidden||element.closest('[hidden]'))return false;
  if(element.closest('.iu-motion-offscreen'))return false;
  return true;
 };
 const refresh=()=>{
  if(!connected||!observer||!detailObserver)return;
  for(const [el,type] of watched){
   if(!el.isConnected){
    (type==='owner'?observer:detailObserver).unobserve(el);
    watched.delete(el);
   }
  }
  for(const [selector,type,io] of [[ownerSelector,'owner',observer],[detailSelector,'detail',detailObserver]]){
   for(const el of document.querySelectorAll(selector)){
    if(watched.has(el))continue;
    watched.set(el,type);
    io.observe(el);
   }
  }
 };
 const scheduleRefresh=()=>{
  if(queued||!connected)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;refresh();});
 };
 const onVisibility=()=>{
  root.classList.toggle('iu-motion-in-background',document.hidden);
  if(!document.hidden)scheduleRefresh();
 };
 const beginFold=element=>{
  if(!element)return;
  folding.add(element);
  root.classList.add('iu-motion-fold-busy');
 };
 const endFold=element=>{
  if(element)folding.delete(element);
  if(!folding.size)root.classList.remove('iu-motion-fold-busy');
  scheduleRefresh();
 };
 const stats=()=>{
  let offscreen=0,owners=0,details=0;
  for(const [el,type] of watched){
   if(!el.isConnected)continue;
   if(type==='owner')owners++;else details++;
   if(el.classList.contains('iu-motion-offscreen'))offscreen++;
  }
  return {supported:!!window.IntersectionObserver,owners,details,offscreen,folds:folding.size,intersections,background:document.hidden};
 };
 // Diagnostic manuel uniquement : ne pas recalculer tous les styles à chaque
 // animation/scroll. Inclut les pseudos ::before et ::after du DOM courant.
 const audit=()=>{
  const out={inspected:0,animations:0,running:0,offscreenRunning:0,paused:0};
  const nodes=document.querySelectorAll('.app *');
  for(const node of nodes){
   out.inspected++;
   const offscreen=!isVisible(node);
   for(const pseudo of [null,'::before','::after']){
    let cs;
    try{cs=getComputedStyle(node,pseudo);}catch(_){continue;}
    if(!cs||cs.animationName==='none'||!cs.animationName)continue;
    const names=cs.animationName.split(',').map(s=>s.trim()).filter(s=>s!=='none');
    const states=cs.animationPlayState.split(',');
    names.forEach((_,i)=>{
     out.animations++;
     const paused=(states[i]||states[0]||'running').trim()==='paused';
     if(paused)out.paused++;
     else{
      out.running++;
      if(offscreen)out.offscreenRunning++;
     }
    });
   }
  }
  return out;
 };
 const start=()=>{
  if(connected)return;
  connected=true;
  root.classList.add('iu-motion-managed');
  onVisibility();
  if('IntersectionObserver' in window){
   observer=new IntersectionObserver(mark,{threshold:0.01,rootMargin:'80px 0px 80px 0px'});
   detailObserver=new IntersectionObserver(mark,{threshold:0.01,rootMargin:'24px 0px 24px 0px'});
   refresh();
  }
 };
 // Les deux observateurs sont libérés à la sortie de page. Reconnexion
 // lorsque Safari restaure une PWA depuis son cache d'historique (BFCache).
 const onPageHide=()=>{
  observer?.disconnect();detailObserver?.disconnect();
  observer=null;detailObserver=null;
  watched.clear();folding.clear();connected=false;
  root.classList.remove('iu-motion-fold-busy');
 };
 window.addEventListener('pagehide',onPageHide);
 window.addEventListener('pageshow',start);
 document.addEventListener('visibilitychange',onVisibility);
 window.addEventListener('iu-fold-performance',scheduleRefresh);
 window.IUMotionOptimizer={beginFold,endFold,isBusy:()=>folding.size>0,isVisible,stats,audit,refresh:scheduleRefresh};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
