/* Inventaires U 42.36 — Web Worker EAN avec repli sans perte.
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
 let worker=null,unavailable=false,nextId=0,warmStarted=false;
 const pending=new Map();
 // Le même JPEG ne doit jamais déclencher plusieurs relectures historiques
 // lorsqu'un Worker échoue pendant que Gemini est en cours.
 let legacyCache=new WeakMap();
 function legacyEAN(photo){
  if(!photo)return Promise.resolve(null);
  let task=legacyCache.get(photo);
  if(!task){
   task=Promise.resolve().then(()=>root?.IUGeminiEAN?.read(photo)||null)
    .catch(()=>null);
   legacyCache.set(photo,task);
  }
  return task;
 }
 function settle(item,result){
  // Une ambiguïté optique ne peut jamais être remplacée silencieusement
  // par une lecture d'une autre méthode.
  if(item.kind!=='barcode'||result?.confirmed||result?.ambiguous)
   return item.resolve(result||null);
  // Le code du Worker peut retourner null sur iOS alors que le
  // BarcodeDetector du fil principal aurait reconnu les barres.
  legacyEAN(item.photo).then(item.resolve);
 }
 function dispose(unsupported=false){
  warmStarted=false;
  if(worker){try{worker.terminate()}catch(_){}worker=null;}
  if(unsupported)unavailable=true;
  for(const item of pending.values()){
   clearTimeout(item.timeout);
   if(unsupported)settle(item,null);
   else item.resolve(null);
  }
  pending.clear();
 }
 function connect(){
  if(unavailable||!root||typeof root.Worker!=='function')return null;
  if(worker)return worker;
  try{
   const instance=new root.Worker('gemini-image-worker.js?v=42.49');
   instance.onmessage=event=>{
    const {id,result,error}=event.data||{};
    const item=pending.get(id);
    if(!item)return;
    pending.delete(id);clearTimeout(item.timeout);
    if(error==='unsupported'){
     // L'erreur de capacité désactive le Worker pour la session.
     // settle() est appelé une seule fois par dispose().
     pending.set(id,item);
     dispose(true);
     return;
    }
    settle(item,result);
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
    settle({kind,photo,resolve},null);
   },kind==='barcode'?4500:1400);
   pending.set(id,{kind,photo,resolve,timeout});
   try{engine.postMessage({id,kind,photo,reading});}
   catch(_){
    clearTimeout(timeout);pending.delete(id);
    settle({kind,photo,resolve},null);
   }
  });
 }
 // Précharger hors du fil Safari dès l'ouverture de la caméra.
 function preloadBarcode(){
  if(warmStarted||unavailable)return false;
  const engine=connect();
  if(!engine)return false;
  try{
   engine.postMessage({id:++nextId,kind:'warm-zxing'});
   warmStarted=true;
   return true;
  }catch(_){return false;}
 }
 function barcode(photo){
  if(!photo)return Promise.resolve(null);
  return dispatch('barcode',photo);
 }
 function previewBarcode(photo){
  if(!photo||pending.size)return Promise.resolve(null);
  return dispatch('preview-barcode',photo);
 }
 function partial(photo){return photo?dispatch('partial',photo):Promise.resolve(null);}
 function enhancedDetail(photo,reading){
  if(!photo||!root?.OffscreenCanvas||
     !root?.createImageBitmap)return Promise.resolve(null);
  return dispatch('enhanced-detail',photo,reading);
 }
 function close(){
  dispose(false);
  legacyCache=new WeakMap();
 }
 function available(){return !unavailable&&Boolean(root?.Worker&&root?.OffscreenCanvas);}
 return Object.freeze({barcode,preloadBarcode,previewBarcode,partial,enhancedDetail,close,available});
});
