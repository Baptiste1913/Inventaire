/* Inventaires U 42.87 — lumières de Bienvenue : keyframes CSS partagés. */
(()=>{
 'use strict';
 const field=document.querySelector('#iuGeminiLab .iu-gemini-welcome-glow');
 if(!field)return;
 let visible=typeof IntersectionObserver!=='function';
 function sync(){field.dataset.paused=String(!visible||document.hidden);}
 if(typeof IntersectionObserver==='function'){
  new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting===true;sync();}).observe(field);
 }
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('pagehide',()=>{field.dataset.paused='true';});
 sync();
})();
