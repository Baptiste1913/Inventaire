/* V33.92 — Les tiroirs administrateur suivent le moteur des tiroirs Planning. */
(()=>{
 'use strict';
 function init(){
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('#planningAdminCard details.iu-admin-category').forEach(card=>{
   const summary=card.querySelector(':scope > summary');
   const content=card.querySelector(':scope > .iu-admin-category-body');
   if(!summary||!content||card.dataset.iuAdminFold==='yes')return;
   card.dataset.iuAdminFold='yes';
   let animation=null, requested=card.open;
   summary.addEventListener('click',event=>{
    if(reduced.matches||typeof card.animate!=='function')return;
    event.preventDefault();
    if(!animation)requested=card.open;
    const next=!requested;requested=next;
    const from=card.getBoundingClientRect().height;
    if(animation){animation.cancel();animation=null;}
    card.open=true;
    card.classList.toggle('is-admin-closing',!next);
    card.classList.add('iu-admin-animating');
    const cs=getComputedStyle(card);
    const px=value=>parseFloat(value)||0;
    const extra=px(cs.borderTopWidth)+px(cs.borderBottomWidth)+px(cs.paddingTop)+px(cs.paddingBottom);
    const folded=summary.getBoundingClientRect().height+extra;
    const expanded=folded+content.getBoundingClientRect().height;
    const to=next?expanded:folded;
    if(Math.abs(from-to)<.5){card.open=next;card.classList.remove('is-admin-closing','iu-admin-animating');return;}
    const current=card.animate([{height:from+'px'},{height:to+'px'}],{
     duration:560,easing:'cubic-bezier(.22,.75,.24,1)',fill:'both'
    });
    animation=current;
    current.onfinish=()=>{
     if(animation!==current)return;
     animation=null;
     if(!next)card.open=false;
     current.cancel();
     card.classList.remove('is-admin-closing','iu-admin-animating');
    };
   });
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
