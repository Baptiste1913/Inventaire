/* Inventaires U — halos chromés autonomes. Trajets aléatoires continus. */
(()=>{
 'use strict';
 const field=document.querySelector('#iuGeminiLab .iu-gemini-label-glow-field');
 if(!field)return;
 const nodes=Array.from(field.querySelectorAll('.iu-digi-chrome-halo'));
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const transparency=window.matchMedia('(prefers-reduced-transparency: reduce)');
 const forced=window.matchMedia('(forced-colors: active)');
 const range=(a,b)=>a+(b-a)*Math.random();
 const pose=()=>({
  transform:'translate('+range(-48,48).toFixed(2)+'%,'+range(-24,52).toFixed(2)+'%) scale('+range(.82,1.22).toFixed(3)+')',
  opacity:range(.55,1).toFixed(3)
 });
 const states=nodes.map(node=>({node,animation:null,current:null}));
 let visible=typeof IntersectionObserver!=='function',enabled=false;
 function step(state){
  if(!enabled)return;
  if(!state.current)state.current=pose();
  const next=pose();
  state.node.style.transform=state.current.transform;
  state.node.style.opacity=state.current.opacity;
  if(typeof state.node.animate!=='function')return;
  const animation=state.node.animate([state.current,next],{
   duration:Math.round(range(10500,20500)),easing:'ease-in-out',fill:'both'
  });
  state.animation=animation;
  animation.onfinish=()=>{
   if(!enabled||state.animation!==animation)return;
   state.node.style.transform=next.transform;
   state.node.style.opacity=next.opacity;
   state.current=next;state.animation=null;
   animation.cancel();step(state);
  };
 }
 function sync(){
  const next=visible&&!document.hidden&&!reduced.matches&&!transparency.matches&&!forced.matches;
  if(next===enabled)return;
  enabled=next;
  for(const state of states){
   if(enabled){
    if(state.animation?.playState==='finished'){
     const finished=state.animation;state.current=finished.effect.getKeyframes().slice(-1).map(k=>({transform:k.transform,opacity:k.opacity}))[0];
     state.animation=null;finished.cancel();step(state);
    }else if(state.animation)state.animation.play();else step(state);
   }else state.animation?.pause();
  }
 }
 if(typeof IntersectionObserver==='function'){
  new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting===true;sync();}).observe(field);
 }
 for(const query of [reduced,transparency,forced]){
  if(query.addEventListener)query.addEventListener('change',sync);
  else query.addListener?.(sync);
 }
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('pagehide',()=>{enabled=false;for(const state of states)state.animation?.pause();});
 sync();
})();
