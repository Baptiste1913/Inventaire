/* Inventaires U 42.36 — travail image hors du thread de la caméra.
 * Classic Worker Safari ; aucune requête HTTP externe ni accès au stockage.
 */
'use strict';
importScripts('./gemini-recognition-core.js?v=42.45');
importScripts('./gemini-ean.js?v=42.49');
importScripts('./gemini-label-geometry.js?v=42.33');
importScripts('./gemini-zxing.js?v=42.36');
importScripts('./digi-digit-ocr.js?v=42.50');
function zoneToPixels(rect,w,h){
 if(!rect)return null;
 return {
  x:Math.max(0,Math.floor(rect.x*w)),
  y:Math.max(0,Math.floor(rect.y*h)),
  w:Math.min(w,Math.ceil(rect.w*w)),
  h:Math.min(h,Math.ceil(rect.h*h))
 };
}
function sampleContrast(image){
 const {width:w,height:h,data}=image;
 const hist=new Uint32Array(256);
 let n=0;
 // Échantillonnage 2D décalé, sans aliasing avec l'espacement périodique
 // des traits EAN. Un pas fixe de dix pixels peut ne voir QUE les barres.
 for(let y=0;y<h;y+=7){
  for(let x=(y*5)%11;x<w;x+=11){
   const i=(y*w+x)*4;
   hist[(77*data[i]+150*data[i+1]+29*data[i+2])>>>8]++;n++;
  }
 }
 let cum=0,low=0,high=255;
 for(let i=0;i<256;i++){cum+=hist[i];if(cum>=n*.05){low=i;break;}}
 cum=0;
 for(let i=0;i<256;i++){cum+=hist[i];if(cum>=n*.95){high=i;break;}}
 return {low,high,range:high-low};
}
// CLAHE grayscale sur le SEUL détail d'une relecture ; jamais sur
// l'image entière envoyée à Gemini, et seulement si le contraste est
// réellement insuffisant. Luminance traitée à 1400px max hors Safari UI.
function clahe(image,clipFactor=2.2,grid=8){
 const {width:w,height:h,data}=image;
 const maps=[],histSize=256;
 for(let ty=0;ty<grid;ty++)for(let tx=0;tx<grid;tx++){
  const x0=Math.floor(w*tx/grid),x1=Math.floor(w*(tx+1)/grid);
  const y0=Math.floor(h*ty/grid),y1=Math.floor(h*(ty+1)/grid);
  const hist=new Uint32Array(histSize);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const i=(y*w+x)*4;
   hist[(77*data[i]+150*data[i+1]+29*data[i+2])>>>8]++;
  }
  const n=Math.max(1,(x1-x0)*(y1-y0));
  const clip=Math.max(1,Math.round(n*clipFactor/256));
  let extra=0;
  for(let k=0;k<256;k++)if(hist[k]>clip){
   extra+=hist[k]-clip;hist[k]=clip;
  }
  const share=Math.floor(extra/256),rest=extra%256;
  for(let k=0;k<256;k++)hist[k]+=share+(k<rest?1:0);
  const lookup=new Uint8Array(256);
  let cumul=0;
  for(let k=0;k<256;k++){
   cumul+=hist[k];
   lookup[k]=Math.min(255,Math.round(cumul*255/n));
  }
  maps.push(lookup);
 }
 for(let y=0;y<h;y++){
  const fy=(y+.5)*grid/h-.5;
  const y0=Math.max(0,Math.min(grid-1,Math.floor(fy))),y1=Math.min(grid-1,y0+1);
  const wy=Math.max(0,Math.min(1,fy-y0));
  for(let x=0;x<w;x++){
   const fx=(x+.5)*grid/w-.5;
   const x0=Math.max(0,Math.min(grid-1,Math.floor(fx))),x1=Math.min(grid-1,x0+1);
   const wx=Math.max(0,Math.min(1,fx-x0));
   const i=(y*w+x)*4,v=(77*data[i]+150*data[i+1]+29*data[i+2])>>>8;
   const upper=maps[y0*grid+x0][v]*(1-wx)+maps[y0*grid+x1][v]*wx;
   const lower=maps[y1*grid+x0][v]*(1-wx)+maps[y1*grid+x1][v]*wx;
   // Garder un peu de la source pour ne pas noircir les chiffres fins.
   const enhanced=upper*(1-wy)+lower*wy;
   const pixel=Math.min(255,Math.round(v*.28+enhanced*.72));
   data[i]=data[i+1]=data[i+2]=pixel;
  }
 }
 return image;
}
async function enhancedDetail(photo,reading){
 if(typeof OffscreenCanvas!=='function'||
    typeof createImageBitmap!=='function'||!self.IUGeminiLabelGeometry)
  return null;
 const bitmap=await createImageBitmap(photo);
 try{
  const iw=bitmap.width,ih=bitmap.height;
  if(!(iw>=650&&ih>=350))return null;
  const geometry=self.IUGeminiLabelGeometry;
  let rect=geometry.barcodeWithinLabel?.(reading,reading?.labelRect)
   ?reading.labelRect:null;
  if(!rect)rect=geometry.opticalCrop(reading,iw,ih);
  if(!rect){
   const thumb=new OffscreenCanvas(Math.max(1,Math.round(iw*Math.min(1,240/iw))),
    Math.max(1,Math.round(ih*Math.min(1,240/iw))));
   const tc=thumb.getContext('2d',{willReadFrequently:true});
   if(tc){
    tc.drawImage(bitmap,0,0,thumb.width,thumb.height);
    rect=geometry.detect(tc.getImageData(0,0,thumb.width,thumb.height));
   }
  }
  if(!rect||rect.x<.008||rect.y<.008||
     rect.x+rect.w>.992||rect.y+rect.h>.992)return null;
  // Perspective : quatre bords réels et marges sûres obligatoires.
  const core=self.IURecognitionCore;
  if(core?.quad&&core?.warp){
   try{
    const tw=Math.min(300,iw),th=Math.max(1,Math.round(ih*tw/iw));
    const thumb=new OffscreenCanvas(tw,th),tc=thumb.getContext('2d',{willReadFrequently:true});
    tc.drawImage(bitmap,0,0,tw,th);
    const ti=tc.getImageData(0,0,tw,th);core.grayscale(ti.data);
    const q=core.quad(ti,rect);
    if(q){
     const scale=Math.min(1,1600/Math.max(iw,ih));
     const src=new OffscreenCanvas(Math.round(iw*scale),Math.round(ih*scale));
     const sc=src.getContext('2d',{willReadFrequently:true});
     sc.drawImage(bitmap,0,0,src.width,src.height);
     const W=Math.round(Math.min(1400,rect.w*iw)),H=Math.round(Math.min(1150,rect.h*ih));
     const flat=new OffscreenCanvas(W,H),fc=flat.getContext('2d');
     const dest=fc.createImageData(W,H);
     if(core.warp(sc.getImageData(0,0,src.width,src.height),dest,q)){
      fc.putImageData(dest,0,0);
      for(const quality of [.84,.75,.65,.55]){
       const jpeg=await flat.convertToBlob({type:'image/jpeg',quality});
       if(jpeg.size>=100&&jpeg.size<=122000)return jpeg;
      }
     }
    }
   }catch(_){}
  }
  const box=zoneToPixels(rect,iw,ih);
  if(box.w<480||box.h<260||box.x+box.w>iw||box.y+box.h>ih)return null;
  const factor=Math.min(1,1400/Math.max(box.w,box.h));
  const w=Math.round(box.w*factor),h=Math.round(box.h*factor);
  const canvas=new OffscreenCanvas(w,h);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,box.x,box.y,box.w,box.h,0,0,w,h);
  const img=ctx.getImageData(0,0,w,h);
  const contrast=sampleContrast(img);
  const slope=reading?.confirmed&&reading?.bounds?Number(reading.bounds.slope)||0:0;
  const rotate=Math.abs(slope)>.035&&Math.abs(slope)<.12;
  // Ne jamais retoucher une image suffisamment contrastée et droite.
  if((contrast.range>=110||contrast.range<12)&&!rotate)return null;
  if(contrast.range>=12&&contrast.range<110){
   self.IURecognitionCore?.grayscale(img.data);
   clahe(img);
   ctx.putImageData(img,0,0);
  }
  if(rotate){
   const clone=new OffscreenCanvas(w,h);
   const rc=clone.getContext('2d');
   if(!rc)return null;
   rc.fillStyle='#fff';rc.fillRect(0,0,w,h);
   rc.translate(w/2,h/2);
   rc.rotate(-Math.atan(slope));
   // Préserver une marge pour ne pas couper chiffres et gardes EAN.
   rc.scale(.94,.94);
   rc.drawImage(canvas,-w/2,-h/2);
   const contents=clone;
   for(const quality of [.84,.75,.65,.55]){
    const jpeg=await contents.convertToBlob({type:'image/jpeg',quality});
    if(jpeg.size>=100&&jpeg.size<=122000)return jpeg;
   }
   return null;
  }
  for(const quality of [.84,.75,.65,.55]){
   const jpeg=await canvas.convertToBlob({type:'image/jpeg',quality});
   if(jpeg.size>=100&&jpeg.size<=122000)return jpeg;
  }
  return null;
 }finally{bitmap.close?.();}
}
self.onmessage=async event=>{
 const {id,kind,photo,reading}=event.data||{};
 if(!Number.isSafeInteger(id))return;
 if(kind==='warm-zxing'){
  // Compiler le moteur sans photo et sans retarder le viseur.
  try{self.IUDigiDigitOCR?.warm?.();}catch(_){}
  try{await self.IUZxingEAN?.warm?.();}catch(_){}
  return;
 }
 if(!photo)return;
 try{
  if(typeof OffscreenCanvas!=='function'||
     typeof createImageBitmap!=='function'){
   self.postMessage({id,error:'unsupported'});return;
  }
  let result=null;
  if(kind==='preview-barcode'){
   try{result=await self.IUZxingEAN?.read(photo)||null;}catch(_){}
  }
  else if(kind==='barcode'){
   // ZXing est le premier choix. Pas de second décodage si validé.
   // Une ambiguïté optique n'est jamais écrasée par une supposition.
   try{result=await self.IUZxingEAN?.read(photo)||null;}catch(_){}
   if(!result)result=await self.IUGeminiEAN.read(photo);
  }
  else if(kind==='partial')result=await self.IUGeminiEAN.readPartial?.(photo)||null;
  else if(kind==='digit-template')result=await self.IUDigiDigitOCR?.read(photo,reading)||null;
  else if(kind==='enhanced-detail')result=await enhancedDetail(photo,reading);
  self.postMessage({id,result});
 }catch(_){
  // Les échecs du prétraitement ne compromettent jamais Gemini.
  self.postMessage({id,result:null});
 }
};
