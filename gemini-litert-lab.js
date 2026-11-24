/* Optional LiteRT OCR: model download on opt-in, one warm worker. */
(function(root){
 'use strict';
 if(!root)return;
 const key='iu-litert-experiment-v1';
 let worker=null,ready=false,loading=null,failed=false,seq=0,busy=false,epoch=0,backend='';
 const pending=new Map();
 function enabled(){try{return localStorage.getItem(key)==='true'}catch(_){return false}}
 function status(s){const el=document.getElementById('iuLiteRTStatus');if(el)el.textContent=s;}
 function close(){
  epoch++;ready=false;loading=null;busy=false;failed=false;backend='';
  try{worker?.terminate()}catch(_){}worker=null;
  for(const p of pending.values()){clearTimeout(p.timer);p.resolve(null);}pending.clear();
 }
 function call(kind,extra,timeout){
  return new Promise(resolve=>{
   if(!worker)return resolve(null);
   const id=++seq,timer=setTimeout(()=>{
    pending.delete(id);resolve(null);close();failed=true;
    status('LiteRT indisponible · scanner normal conservé');
   },timeout);
   pending.set(id,{resolve,timer});
   try{worker.postMessage({id,kind,...extra})}catch(_){clearTimeout(timer);pending.delete(id);resolve(null);}
  });
 }
 function warm(){
  if(!enabled()||failed)return Promise.resolve(false);
  if(ready)return Promise.resolve(true);
  if(loading)return loading;
  const token=epoch;
  status('LiteRT · téléchargement et préparation du modèle…');
  try{
   worker=new Worker(new URL('gemini-litert-worker.js?v=42.47',document.baseURI),{type:'module'});
   worker.onmessage=e=>{
    const {id,result,error}=e.data||{},p=pending.get(id);if(!p)return;
    clearTimeout(p.timer);pending.delete(id);p.resolve(error?null:result);
   };
   worker.onerror=()=>{close();failed=true;status('LiteRT indisponible · scanner normal conservé');};
  }catch(_){failed=true;status('LiteRT indisponible sur ce navigateur');return Promise.resolve(false);}
  loading=call('init',{},120000).then(result=>{
   if(token!==epoch||!enabled())return false;
   if(!result?.backend){close();failed=true;status('LiteRT indisponible · scanner normal conservé');return false;}
   ready=true;backend=result.backend;status('LiteRT prêt · '+backend.toUpperCase());return true;
  }).finally(()=>{if(token===epoch)loading=null;});
  return loading;
 }
 async function read(photo,hint){
  if(!enabled()||!ready||busy||!photo)return null;
  const token=epoch,start=performance.now();busy=true;
  try{
   const zone=root.IUGeminiPrintedEAN?.roi(hint);
   const result=await call('read',{photo,zone},4500);
   if(token!==epoch)return null;
   status('LiteRT · '+backend.toUpperCase()+' · '+(result?.pattern?'EAN lu':'aucun EAN')+' · '+Math.round(performance.now()-start)+' ms');
   return result;
  }finally{if(token===epoch)busy=false;}
 }
 function bind(){
  const el=document.getElementById('iuLiteRTExperimental'),paddle=document.getElementById('iuPaddleExperimental');
  if(!el)return;
  el.checked=enabled();
  function disablePaddle(){
   if(paddle?.checked){paddle.checked=false;paddle.dispatchEvent(new Event('change'));}
  }
  el.addEventListener('change',()=>{
   try{localStorage.setItem(key,String(el.checked))}catch(_){el.checked=false;}
   if(el.checked){disablePaddle();void warm();}else{close();status('LiteRT désactivé');}
  });
  paddle?.addEventListener('change',()=>{
   if(paddle.checked&&el.checked){el.checked=false;el.dispatchEvent(new Event('change'));}
  });
  if(enabled()){disablePaddle();status('LiteRT · préparation à l’ouverture de la caméra');}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 root.IULiteRTLab=Object.freeze({warm,read,enabled,close,isReady:()=>ready});
})(typeof window!=='undefined'?window:null);
