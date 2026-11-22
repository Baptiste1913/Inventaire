/* Inventaires U 42.14 — encodage JPEG haute définition hors du fil UI.
   Aucune donnée n'est envoyée vers un autre domaine ; cette tâche locale
   renvoie seulement un Blob à la page qui l'a demandé. */
'use strict';
self.onmessage=async event=>{
 const {id,source,maxBytes}=event.data||{};
 if(!Number.isSafeInteger(id)||!source||!Number.isSafeInteger(maxBytes)){
  self.postMessage({id,error:'invalid-input'});return;
 }
 let bitmap=null;
 try{
  if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')
   throw Error('unsupported');
  // Le comportement par défaut conserve l'orientation EXIF de la photo.
  bitmap=await createImageBitmap(source);
  const longest=Math.max(bitmap.width,bitmap.height);
  if(!(longest>0))throw Error('empty');
  const canvas=new OffscreenCanvas(1,1);
  const ctx=canvas.getContext('2d');
  if(!ctx||typeof canvas.convertToBlob!=='function')throw Error('unsupported');
  let prevWidth=0,prevHeight=0;
  for(const side of [2400,2200,1920,1700,1500]){
   const scale=Math.min(1,side/longest);
   const width=Math.max(1,Math.round(bitmap.width*scale));
   const height=Math.max(1,Math.round(bitmap.height*scale));
   if(prevWidth===width&&prevHeight===height)continue;
   prevWidth=width;prevHeight=height;
   canvas.width=width;canvas.height=height;
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
   ctx.drawImage(bitmap,0,0,width,height);
   const encode=quality=>canvas.convertToBlob({type:'image/jpeg',quality});
   const top=await encode(.93);
   if(top.type==='image/jpeg'&&top.size>=75&&top.size<=maxBytes){
    self.postMessage({id,blob:top});return;
   }
   // Recherche adaptative sans baisser les seuils de qualité historiques.
   // Tester .81 avant .87 uniquement si .93 dépasse largement le plafond.
   if(top.size>maxBytes*1.18){
    const middle=await encode(.81);
    if(middle.type==='image/jpeg'&&middle.size>=75&&middle.size<=maxBytes){
     const higher=await encode(.87);
     self.postMessage({id,blob:higher.size>=75&&higher.size<=maxBytes&&
      higher.type==='image/jpeg'?higher:middle});return;
    }
    const lower=await encode(.75);
    if(lower.type==='image/jpeg'&&lower.size>=75&&lower.size<=maxBytes){
     self.postMessage({id,blob:lower});return;
    }
   }else{
    for(const quality of [.87,.81,.75]){
     const blob=await encode(quality);
     if(blob.type==='image/jpeg'&&blob.size>=75&&blob.size<=maxBytes){
      self.postMessage({id,blob});return;
     }
    }
   }
  }
  self.postMessage({id,error:'too-large'});
 }catch(_){
  // L'iPhone peut ne pas fournir OffscreenCanvas/convertToBlob : le
  // script principal reprend automatiquement avec son Canvas classique.
  self.postMessage({id,error:'unavailable'});
 }finally{
  try{bitmap?.close?.();}catch(_){}
 }
};
