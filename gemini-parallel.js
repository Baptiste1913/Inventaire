/* Inventaires U 42.32 — une file locale sur Web Worker.
 * Charge l'EAN hors du fil Safari ; repli sur le lecteur historique si
 * Web Worker ou OffscreenCanvas indisponible. Aucun réseau ni donnée stockée.
 */
(function(root,factory){
 'use strict';
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiParallel=api;
})(typeof window!=='undefined'?window:null,function(root){
 'use strict';
 let worker=null,unavailable=false,nextId=0;
 const pending=new Map();
 function legacyEAN(photo){
  return Promise.resolve().then(()=>root?.IUGeminiEAN?.read(photo)||null)
   .catch(()=>null);
 }
 function dispose(unsupported=false){
  if(worker){try{worker.terminate()}catch(_){}worker=null;}
  if(unsupported)unavailable=true;
  for(const item of pending.values()){
   clearTimeout(item.timeout);
   if(item.kind==='barcode'&&unsupported)
    legacyEAN(item.photo).then(item.resolve);
   else item.resolve(null);
  }
  pending.clear();
 }
 function connect(){
  if(unavailable||!root||typeof root.Worker!=='function')return null;
  if(worker)return worker;
  try{
   const instance=new root.Worker('gemini-image-worker.js?v=42.32');
   instance.onmessage=event=>{
    const {id,result,error}=event.data||{};
    const item=pending.get(id);
    if(!item)return;
    pending.delete(id);clearTimeout(item.timeout);
    if(error==='unsupported'){
     dispose(true);
     if(item.kind==='barcode')legacyEAN(item.photo).then(item.resolve);
     else item.resolve(null);
     return;
    }
    item.resolve(result||null);
   };
   instance.onerror=()=>{
    // La prise de vue et l'analyse Gemini restent disponibles.
    dispose(true);
   };
   worker=instance;
   return worker;
  }catch(_){unavailable=true;return null;}
 }
 function dispatch(kind,photo,reading=null){
  const engine=connect();
  if(!engine)return kind==='barcode'?legacyEAN(photo):Promise.resolve(null);
  const id=++nextId;
  return new Promise(resolve=>{
   const timeout=setTimeout(()=>{
    pending.delete(id);
    resolve(null);
   },kind==='barcode'?5800:1400);
   pending.set(id,{kind,photo,resolve,timeout});
   try{engine.postMessage({id,kind,photo,reading});}
   catch(_){
    clearTimeout(timeout);pending.delete(id);
    if(kind==='barcode')legacyEAN(photo).then(resolve);
    else resolve(null);
   }
  });
 }
 function barcode(photo){
  if(!photo)return Promise.resolve(null);
  return dispatch('barcode',photo);
 }
 function enhancedDetail(photo,reading){
  if(!photo||!root?.OffscreenCanvas||
     !root?.createImageBitmap)return Promise.resolve(null);
  return dispatch('enhanced-detail',photo,reading);
 }
 function close(){dispose(false);}
 function available(){return !unavailable&&Boolean(root?.Worker&&root?.OffscreenCanvas);}
 return Object.freeze({barcode,enhancedDetail,close,available});
});
