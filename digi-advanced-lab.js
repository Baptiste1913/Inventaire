/* Separate bounded OCR Worker. Never delays Gemini and never stores photos. */
(function(root){
 'use strict';
 if(!root)return;
 const key='iu-digi-advanced-v1';
 let engine=null,active=null,nextId=0,failed=false,ready=false;
 let checkbox=null,status=null;
 function enabled(){try{return root.localStorage.getItem(key)!=='0'}catch(_){return true}}
 function show(s){if(status)status.textContent=s;}
 function close(){
  if(active){clearTimeout(active.timer);active.resolve(null);active=null;}
  if(engine){try{engine.terminate()}catch(_){}engine=null;}
  ready=false;failed=false;
 }
 function warm(){
  if(!enabled()||failed||!root.Worker)return false;
  if(engine)return true;
  try{
   const w=new root.Worker('digi-advanced-worker.js?v=42.53');engine=w;
   show('DIGI Advanced · préparation locale');
   w.onmessage=({data:m})=>{
    if(engine!==w)return;
    if(m.ready){ready=true;show('DIGI Advanced prêt · CPU local');return;}
    if(m.error){close();failed=true;show('DIGI Advanced indisponible');return;}
    if(!active||active.id!==m.id)return;
    const task=active;active=null;clearTimeout(task.timer);task.resolve(m.result||null);
   };
   w.onerror=()=>{if(engine===w){close();failed=true;show('DIGI Advanced indisponible');}};
   w.postMessage({id:++nextId,kind:'warm'});return true;
  }catch(_){close();failed=true;return false;}
 }
 function read(photo,hint=null){
  if(!photo||active||!warm())return Promise.resolve(null);
  const id=++nextId,w=engine;
  return new Promise(resolve=>{
   const timer=setTimeout(()=>{if(active?.id!==id)return;close();show('DIGI Advanced · délai local dépassé');},1600);
   active={id,resolve,timer};
   try{w.postMessage({id,kind:'read',photo,hint});}catch(_){close();}
  });
 }
 function bind(){
  checkbox=document.getElementById('iuDigiAdvancedEnabled');status=document.getElementById('iuDigiAdvancedStatus');
  if(!checkbox)return;
  checkbox.checked=enabled();show(enabled()?'DIGI Advanced · prêt à démarrer':'DIGI Advanced désactivé');
  checkbox.addEventListener('change',()=>{
   try{root.localStorage.setItem(key,checkbox.checked?'1':'0');}catch(_){}
   if(checkbox.checked)warm();else{close();show('DIGI Advanced désactivé');}
  });
 }
 root.IUDigiAdvanced=Object.freeze({warm,read,close,enabled,ready:()=>ready});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})(typeof window!=='undefined'?window:null);
