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
 let detailWorker=null,detailPending=null,detailUnavailable=false;
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
   const instance=new root.Worker('gemini-image-worker.js?v=42.53');
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
 function digits(photo,hint){return photo?dispatch('digit-template',photo,hint):Promise.resolve(null);}
 function enhancedDetail(photo,reading){
  if(!photo||!root?.OffscreenCanvas||
     !root?.createImageBitmap)return Promise.resolve(null);
  return dispatch('enhanced-detail',photo,reading);
 }
 // Separate instance: expensive rectification never queues behind ZXing,
 // Tesseract or the partial barcode scan. At most one detail in flight.
 function closeDetail(){
  if(detailPending){clearTimeout(detailPending.timer);detailPending.resolve(null);detailPending=null;}
  if(detailWorker){try{detailWorker.terminate()}catch(_){}detailWorker=null;}
 }
 function warmDetail(){
  if(detailUnavailable||!root?.Worker||!root?.OffscreenCanvas||!root?.createImageBitmap)return false;
  if(detailWorker)return true;
  try{
   const instance=new root.Worker('gemini-image-worker.js?v=42.53&detail=1');
   detailWorker=instance;
   instance.onmessage=event=>{
    if(detailWorker!==instance)return;
    const {id,result,error}=event.data||{};
    if(error==='unsupported'){closeDetail();detailUnavailable=true;return;}
    if(!detailPending||detailPending.id!==id)return;
    const task=detailPending;detailPending=null;clearTimeout(task.timer);task.resolve(result||null);
   };
   instance.onerror=()=>{if(detailWorker===instance){closeDetail();detailUnavailable=true;}};
   instance.postMessage({id:++nextId,kind:'warm-detail'});return true;
  }catch(_){closeDetail();detailUnavailable=true;return false;}
 }
 function prepareDetail(photo,reading=null,maxBytes=122000,mode='enhanced'){
  if(!photo||!warmDetail())return Promise.resolve(null);
  if(detailPending){
   if(detailPending.photo===photo&&detailPending.maxBytes===maxBytes&&detailPending.mode===mode)return detailPending.promise;
   // Never let an older label monopolize the new one.
   closeDetail();if(!warmDetail())return Promise.resolve(null);
  }
  const id=++nextId;
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  const timer=setTimeout(()=>{if(detailPending?.id===id)closeDetail();},1700);
  detailPending={id,photo,maxBytes,mode,promise,resolve,timer};
  try{detailWorker.postMessage({id,kind:'enhanced-detail',photo,reading,maxBytes,mode});}catch(_){closeDetail();}
  return promise;
 }
 function close(){
  closeDetail();detailUnavailable=false;
  dispose(false);
  legacyCache=new WeakMap();
 }
 function available(){return !unavailable&&Boolean(root?.Worker&&root?.OffscreenCanvas);}
 return Object.freeze({barcode,preloadBarcode,previewBarcode,partial,digits,enhancedDetail,warmDetail,prepareDetail,closeDetail,close,available});
});
