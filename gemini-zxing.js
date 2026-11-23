/* Inventaires U 42.36 — ZXing-C++ WASM principal, strictement local.
 * Distribution 3.1.2 hébergée par Inventaires U, aucun CDN.
 * Préparation non bloquante à l'ouverture caméra, secours EAN historique.
 */
(function(root){
 'use strict';
 const PIN='3.1.2',LOCAL_JS='./vendor/zxing/reader.js';
 const LOCAL_WASM='./vendor/zxing/zxing_reader.wasm';
 let warming=null,unavailable=false;
 function warm(){
  if(unavailable)return Promise.resolve(false);
  if(warming)return warming;
  warming=(async()=>{
   if(typeof root.ZXingWASM?.readBarcodes!=='function')root.importScripts(LOCAL_JS);
   const engine=root.ZXingWASM;
   if(typeof engine?.readBarcodes!=='function'||
      typeof engine?.prepareZXingModule!=='function')
    throw Error('ZXing local indisponible');
   await engine.prepareZXingModule({
    overrides:{locateFile:(name,prefix)=>name.endsWith('.wasm')
     ?new URL(LOCAL_WASM,root.location.href).href:prefix+name},
    fireImmediately:true
   });
   return true;
  })().catch(()=>{unavailable=true;return false;});
  return warming;
 }
 function valid(code){
  if(!/^\d{13}$/.test(String(code||'')))return false;
  let sum=0;for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2?3:1);
  return Number(code[12])===(10-sum%10)%10;
 }
 function bounds(result,width,height){
  const p=result?.position;
  if(!p||!width||!height)return null;
  const points=[p.topLeft,p.topRight,p.bottomLeft,p.bottomRight];
  if(points.some(a=>!a||!Number.isFinite(a.x)||!Number.isFinite(a.y)))return null;
  const xs=points.map(v=>v.x/width),ys=points.map(v=>v.y/height);
  const left=Math.min(...xs),right=Math.max(...xs);
  const top=Math.min(...ys),bottom=Math.max(...ys);
  const dy=(p.topRight.y-p.topLeft.y)/height;
  const dx=(p.topRight.x-p.topLeft.x)/width;
  if(left<0||right>1||top<0||bottom>1||right-left<.13||Math.abs(dy/(dx||1))>.18)return null;
  return {left,right,y:(top+bottom)/2,slope:dy/(dx||1)};
 }
 function evaluate(results,width,height,labelRect=null,geometry=null){
  const good=(results||[]).filter(r=>r?.format==='EAN13'&&r.isValid===true&&
   r.lineCount>=2&&valid(r.text));
  const codes=[...new Set(good.map(r=>r.text))];
  if(codes.length>1)return {ambiguous:true,confirmed:false,source:'optical'};
  if(codes.length!==1)return null;
  const barcode=good.find(r=>r.text===codes[0]&&bounds(r,width,height));
  if(!barcode)return null;
  const b=bounds(barcode,width,height);
  const inLegacy=b.y>=.60&&b.y<=.93&&
   (b.left+b.right)/2>=.15&&(b.left+b.right)/2<=.60&&
   b.right-b.left>=.20&&Math.abs(b.slope)<=.10;
  const evidence={ean13:codes[0],confirmed:true,ambiguous:false,
   source:'optical',bounds:b};
  if(!inLegacy&&geometry?.barcodeWithinLabel?.(evidence,labelRect))
   evidence.labelRect=labelRect;
  if(!inLegacy&&!evidence.labelRect)return null;
  return evidence;
 }
 async function read(photo){
  if(!photo||typeof root.OffscreenCanvas!=='function'||
     typeof root.createImageBitmap!=='function')return null;
  if(!await warm())return null;
  try{
   const bitmap=await root.createImageBitmap(photo);
   try{
    const results=await root.ZXingWASM.readBarcodes(photo,{
     formats:['EAN13'],tryHarder:true,tryRotate:false,
     tryInvert:false,tryDownscale:false,minLineCount:2,
     maxNumberOfSymbols:3,returnErrors:false
    });
    // Pas de second canvas ni de géométrie si aucune barre valide.
    if(!results?.some(r=>r?.format==='EAN13'&&r.isValid===true&&
       r.lineCount>=2&&valid(r.text)))return null;
    let paper=null;
    const geo=root.IUGeminiLabelGeometry;
    if(geo?.detect){
     const w=Math.min(300,bitmap.width),h=Math.round(bitmap.height*w/bitmap.width);
     const cv=new root.OffscreenCanvas(w,h);
     const ctx=cv.getContext('2d',{willReadFrequently:true});
     if(ctx){
      ctx.drawImage(bitmap,0,0,w,h);
      const found=geo.detect(ctx.getImageData(0,0,w,h));
      if(found?.source==='paper-outline')paper=found;
     }
    }
    return evaluate(results,bitmap.width,bitmap.height,paper,geo);
   }finally{bitmap.close?.();}
  }catch(_){
   // Un problème avec l'image ou WASM laisse toujours le secours EAN agir.
   return null;
  }
 }
 const api=Object.freeze({read,warm,evaluate,bounds,valid,version:PIN});
 if(root)root.IUZxingEAN=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:null);
