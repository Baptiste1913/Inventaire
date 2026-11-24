/* PaddleOCR expérimental, opt-in. Le SDK traite les photos sur l'appareil.
 * Modèles téléchargés au premier démarrage ; aucun résultat ne valide seul. */
(function(root){
 'use strict';
 if(!root)return;
 const key='iu-paddle-experiment-v1';
 let engine=null,loading=null,running=false,epoch=0,backend='',failed=false;
 function enabled(){try{return localStorage.getItem(key)==='true'}catch(_){return false}}
 function status(s){const el=document.getElementById('iuPaddleStatus');if(el)el.textContent=s;}
 // Dedicated same-origin Worker. It imports the fixed SDK as a module
 // and does not instantiate the SDK's cross-origin nested worker.
 function localWorker(candidate){
  return new Promise((resolve,reject)=>{
   let w;
   try{w=new Worker(new URL('gemini-paddle-worker.js?v=42.45',document.baseURI),{type:'module'});}
   catch(e){reject(e);return;}
   let seq=0,closed=false;
   const pending=new Map();
   const dispose=()=>{
    if(closed)return;closed=true;w.terminate();
    for(const v of pending.values()){clearTimeout(v.timer);v.reject(Error('OCR arrêté'));}
    pending.clear();
   };
   w.onmessage=e=>{
    const {id,result,error}=e.data||{},p=pending.get(id);
    if(!p)return;pending.delete(id);clearTimeout(p.timer);
    if(error)p.reject(Error(error));else p.resolve(result);
   };
   w.onerror=()=>dispose();
   function call(kind,extra,limit){
    if(closed)return Promise.reject(Error('OCR arrêté'));
    return new Promise((resolve,reject)=>{
     const id=++seq;
     const timer=setTimeout(()=>{dispose();},limit);
     pending.set(id,{resolve,reject,timer});
     try{w.postMessage({id,kind,...extra});}catch(e){dispose();}
    });
   }
   const model={dispose,predict:async cv=>{
    const image=cv.getContext('2d').getImageData(0,0,cv.width,cv.height);
    return call('predict',{image},8000);
   }};
   call('init',{backend:candidate},60000).then(()=>resolve(model),error=>{dispose();reject(error);});
  });
 }
 async function warm(){
  if(!enabled()||failed)return null;
  if(engine)return engine;if(loading)return loading;
  const id=epoch;status('PaddleOCR : chargement des modèles locaux…');
  loading=(async()=>{
   for(const candidate of navigator.gpu?['webgpu','wasm']:['wasm']){
    let model;
    try{
     model=await localWorker(candidate);
     if(id!==epoch||!enabled()){model.dispose();return null;}
     engine=model;backend=candidate;status('PaddleOCR prêt · '+candidate.toUpperCase());return engine;
    }catch(_){try{model?.dispose?.()}catch(_){}}
   }
   throw Error('Moteur indisponible');
  })().catch(()=>{if(id===epoch){failed=true;status('PaddleOCR indisponible · scanner normal conservé');}return null;})
   .finally(()=>{if(id===epoch)loading=null;});
  return loading;
 }
 function close(){epoch++;loading=null;running=false;failed=false;
  const old=engine;engine=null;backend='';try{old?.dispose?.()}catch(_){}}
 function parse(items){
  const codes=new Set();
  for(const item of items||[]){
   if(Number(item?.score)<.90||typeof item?.text!=='string'||
      !/^[0-9 \u00a0\u202f-]{13,24}$/.test(item.text.trim()))continue;
   const code=item.text.replace(/\D/g,'');if(code.length===13)codes.add(code);
  }
  return codes.size===1?[...codes][0]:null;
 }
 async function read(photo,hint){
  if(!enabled()||!engine||running||!photo)return null;
  const id=epoch,model=engine;running=true;let bmp;
  try{
   bmp=await createImageBitmap(photo);
   const z=root.IUGeminiPrintedEAN?.roi(hint)||{x:.025,y:.67,w:.67,h:.315};
   const x=Math.round(z.x*bmp.width),y=Math.round((z.y+z.h*.38)*bmp.height),
    w=Math.round(z.w*bmp.width),h=Math.round(z.h*.60*bmp.height);
   if(w<150||h<25||x+w>bmp.width||y+h>bmp.height)return null;
   const cv=document.createElement('canvas'),scale=Math.min(1.5,1200/w);
   cv.width=Math.round(w*scale);cv.height=Math.round(h*scale);
   const ctx=cv.getContext('2d');if(!ctx)return null;
   ctx.drawImage(bmp,x,y,w,h,0,0,cv.width,cv.height);
   const [result]=await model.predict(cv,{textRecScoreThresh:.90});
   if(id!==epoch)return null;
   const pattern=parse(result?.items);
   status('PaddleOCR · '+backend.toUpperCase()+' · '+(pattern?'ligne EAN lue':'aucun EAN')+
    (Number.isFinite(result?.metrics?.totalMs)?' · '+Math.round(result.metrics.totalMs)+' ms':''));
   return pattern?{pattern,source:'paddle',confirmed:false}:null;
  }catch(_){return null;}finally{bmp?.close?.();if(id===epoch)running=false;}
 }
 function bind(){
  const el=document.getElementById('iuPaddleExperimental');if(!el)return;
  el.checked=enabled();
  el.addEventListener('change',()=>{
   try{localStorage.setItem(key,String(el.checked))}catch(_){el.checked=false;}
   if(el.checked)void warm();else{close();status('PaddleOCR désactivé');}
  });
  if(enabled())void warm();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 root.IUPaddleLab=Object.freeze({warm,read,close,enabled,parse});
})(typeof window!=='undefined'?window:null);
