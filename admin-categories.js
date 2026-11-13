/* V36.11 — Rubriques administrateur: pas de deuxième animation concurrente. */
(()=>{
 'use strict';
 function init(){
  if(typeof window.IUSetupFold!=='function')return;
  document.querySelectorAll('#planningAdminCard details.iu-admin-category').forEach(card=>{
   window.IUSetupFold(card,card.querySelector(':scope > summary'),
    card.querySelector(':scope > .iu-admin-category-body'),'is-admin-closing');
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
