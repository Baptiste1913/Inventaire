/* Inventaires U V33.91 — animations accessibles des rubriques administrateur. */
(()=>{
 'use strict';
 function init(){
  document.querySelectorAll('#planningAdminCard details.iu-admin-category').forEach(details=>{
   const summary=details.querySelector(':scope > summary');
   const body=details.querySelector(':scope > .iu-admin-category-body');
   if(!summary||!body)return;
   let running=null;
   summary.addEventListener('click',event=>{
    // Conserve le fonctionnement natif du clavier, tout en animant l'ouverture ET la fermeture.
    if(event.defaultPrevented)return;
    event.preventDefault();
    if(running){running.cancel();running=null;}
    const shouldOpen=!details.dataset.iuDesiredOpen || details.dataset.iuDesiredOpen==='false';
    // Etat réel synchronisé après chaque interaction, même pendant l'animation.
    details.dataset.iuDesiredOpen=String(shouldOpen);
    const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce||typeof details.animate!=='function'){
     details.open=shouldOpen;details.classList.remove('iu-admin-animating');return;
    }
    const from=details.getBoundingClientRect().height;
    details.open=true;
    const header=summary.getBoundingClientRect().height;
    const to=shouldOpen?header+body.getBoundingClientRect().height:header;
    details.classList.add('iu-admin-animating');
    running=details.animate([{height:from+'px',opacity:1},{height:to+'px',opacity:1}],{
     duration:shouldOpen?340:285,easing:'cubic-bezier(.2,.8,.22,1)'
    });
    const thisAnimation=running;
    thisAnimation.onfinish=()=>{
     if(running!==thisAnimation)return;
     running=null;details.open=shouldOpen;
     details.classList.remove('iu-admin-animating');
    };
    thisAnimation.oncancel=()=>{if(running===thisAnimation)running=null;};
   });
   details.dataset.iuDesiredOpen=String(details.open);
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
