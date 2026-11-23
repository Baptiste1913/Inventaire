/* Inventaires U v42.31 — EAN-13 optique indépendant, secours haute précision.
 * Pur JavaScript sans chargement distant ; fallback iOS lorsque
 * BarcodeDetector n'existe pas. Jamais de code créé par déduction.
 * Les clés EAN et deux lignes optiques concordantes sont requises. */
(()=>{
 'use strict';
 const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
 const PARITY=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
 const reverse=patterns=>new Map(patterns.map((pattern,i)=>[pattern,String(i)]));
 const LEFT=reverse(L),ODD=reverse(G),RIGHT=reverse(R);
 const parityToFirst=reverse(PARITY);
 const valid=code=>{
  if(!/^\d{13}$/.test(String(code||'')))return false;
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2?3:1);
  return (10-sum%10)%10===Number(code[12]);
 };
 function decode95(bits){
  if(typeof bits!=='string'||bits.length!==95||bits.slice(0,3)!=='101'||
     bits.slice(45,50)!=='01010'||bits.slice(92)!=='101')return null;
  let parity='',digits='';
  for(let i=0;i<6;i++){
   const segment=bits.slice(3+i*7,10+i*7);
   if(LEFT.has(segment)){parity+='L';digits+=LEFT.get(segment);}
   else if(ODD.has(segment)){parity+='G';digits+=ODD.get(segment);}
   else return null;
  }
  const first=parityToFirst.get(parity);
  if(first===undefined)return null;
  let right='';
  for(let i=0;i<6;i++){
   const value=RIGHT.get(bits.slice(50+i*7,57+i*7));
   if(value===undefined)return null;
   right+=value;
  }
  const code=first+digits+right;
  return valid(code)?code:null;
 }
 function lineCode(values,thresholdMix=.5){
  const width=values.length;
  // P5/P85 atténue les reflets et les petits points noirs.
  const sorted=[...values].sort((a,b)=>a-b);
  const light=sorted[Math.min(width-1,Math.floor(width*.88))];
  const dark=sorted[Math.floor(width*.07)];
  if(light-dark<38)return [];
  const threshold=dark+(light-dark)*thresholdMix;
  const binary=values.map(value=>value<threshold?1:0);
  const runs=[];
  for(let x=0;x<width;x++){
   if(!runs.length||runs[runs.length-1].bit!==binary[x])
    runs.push({bit:binary[x],start:x,count:1});
   else runs[runs.length-1].count++;
  }
  const results=[];
  // 59 alternated runs form exactly 95 narrow/wide EAN-13 modules.
  for(let i=0;i+58<runs.length;i++){
   if(runs[i].bit!==1)continue;
   const guards=[0,1,2,27,28,29,30,31,56,57,58].map(k=>runs[i+k]?.count||0);
   const sortedGuards=[...guards].sort((a,b)=>a-b);
   const guardUnit=sortedGuards[5];
   if(guardUnit<1.4||guardUnit>20)continue;
   if(guards.some(size=>size<guardUnit*.43||size>guardUnit*1.95))continue;
   const start=runs[i].start;
   const end=runs[i+58].start+runs[i+58].count;
   const module=(end-start)/95;
   if(module<1.2||module>18||Math.abs(module-guardUnit)>guardUnit*.34)continue;
   const bits=[];
   for(let m=0;m<95;m++){
    const center=Math.min(width-1,Math.floor(start+(m+.5)*module));
    bits.push(binary[center]?'1':'0');
   }
   const code=decode95(bits.join(''));
   if(code)results.push({code,start,end});
  }
  return results;
 }
 // Seuillage glissant pour un éclairage inégal : uniquement en secours.
 // On ne modifie pas la photo, les chiffres ni le parcours initial.
 function adaptiveLine(values){
  const n=values.length,radius=24;
  const sums=new Float64Array(n+1);
  for(let i=0;i<n;i++)sums[i+1]=sums[i]+values[i];
  const out=new Array(n);
  for(let i=0;i<n;i++){
   const lo=Math.max(0,i-radius),hi=Math.min(n,i+radius+1);
   const mean=(sums[hi]-sums[lo])/(hi-lo);
   out[i]=values[i]<mean-8?35:235;
  }
  return out;
 }
 async function nativeRead(source){
  if(typeof BarcodeDetector==='undefined')return null;
  try{
   if(typeof BarcodeDetector.getSupportedFormats==='function'){
    const formats=await BarcodeDetector.getSupportedFormats();
    if(!formats.includes('ean_13'))return null;
   }
   const detector=new BarcodeDetector({formats:['ean_13']});
   const candidates=await detector.detect(source);
   const codes=[...new Set(candidates.map(item=>String(item.rawValue||'').replace(/\D/g,''))
    .filter(valid))];
   if(codes.length===1)return {ean13:codes[0],source:'native',confirmed:true};
   if(codes.length>1)return {ambiguous:true,source:'native'};
  }catch(_){/* Lecture optique pure JS ci-dessous. */}
  return null;
 }
 // La lecture d'origine (1100 px, 50 lignes inclinées) reste la
 // première tentative. Une seconde passe un peu plus détaillée n'est
 // tentée QUE si aucune lecture fiable n'a été obtenue.
 function scanRaster(original,iw,ih,targetWidth,enhanced=false){
  const scale=Math.min(1,targetWidth/iw);
  const w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
  if(w<220||h<120)return null;
  const canvas=typeof OffscreenCanvas==='function'
   ?new OffscreenCanvas(w,h):document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)return null;
  context.drawImage(original,0,0,w,h);
  const pixels=context.getImageData(0,0,w,h).data;
  const line=(y,slope)=>{
   const a=new Array(w);
   for(let x=0;x<w;x++){
    const yy=Math.max(0,Math.min(h-1,Math.round(y+slope*(x-w*.5))));
    const index=(yy*w+x)*4;
    a[x]=(pixels[index]*299+pixels[index+1]*587+pixels[index+2]*114)/1000;
   }
   return a;
  };
  const votes=new Map();
  const fractions=enhanced
   ?[.49,.55,.60,.65,.70,.75,.80,.84,.88,.92]
   :[.47,.53,.59,.65,.70,.75,.79,.83,.87,.91];
  const slopes=enhanced?[0,-.055,.055,-.11,.11]:[0,-.045,.045,-.09,.09];
  const thresholds=enhanced?[.43,.57]:[.5];
  for(const fraction of fractions){
   const y=Math.floor(h*fraction);
   for(const slope of slopes){
    const values=line(y,slope);
    const candidates=[];
    for(const threshold of thresholds)candidates.push(...lineCode(values,threshold));
    if(enhanced&&candidates.length===0)
     candidates.push(...lineCode(adaptiveLine(values)));
    for(const item of candidates){
     const key=item.code,record=votes.get(key)||
      {rows:new Set(),xs:[],ys:[],slopes:[]};
     record.rows.add(fraction);
     record.xs.push([item.start,item.end]);
     record.ys.push(y);record.slopes.push(slope);
     votes.set(key,record);
    }
   }
  }
  // Des seuils différents sur la MÊME rangée ne comptent pas comme
  // confirmations indépendantes. Deux lignes physiques sont requises.
  const confirmed=[...votes.entries()].filter(([,v])=>v.rows.size>=2);
  if(confirmed.length>1)return {ambiguous:true,source:'optical'};
  if(confirmed.length!==1)return null;
  const [ean13,data]=confirmed[0],ranges=data.xs;
  const pos=Math.floor(ranges.length/2),rect=ranges[pos];
  return {ean13,source:'optical',confirmed:true,
   pass:enhanced?'enhanced':'standard',
   bounds:{left:rect[0]/w,right:rect[1]/w,
    y:data.ys[Math.min(pos,data.ys.length-1)]/h,
    slope:data.slopes[Math.min(pos,data.slopes.length-1)]}};
 }
 async function rasterRead(source){
  if(typeof document==='undefined'&&typeof OffscreenCanvas==='undefined')return null;
  let bitmap=null,img=null,objectUrl=null;
  try{
   if(typeof createImageBitmap==='function'){
    bitmap=await createImageBitmap(source);
   }else{
    objectUrl=URL.createObjectURL(source);
    img=await new Promise((resolve,reject)=>{
     const picture=new Image();
     picture.onload=()=>resolve(picture);
     picture.onerror=()=>reject(Error('Image non lisible'));
     picture.src=objectUrl;
    });
   }
   const original=bitmap||img;
   const iw=original.width||original.naturalWidth;
   const ih=original.height||original.naturalHeight;
   if(!(iw>0&&ih>0))return null;
   const usual=scanRaster(original,iw,ih,1100);
   if(usual)return usual;
   // Rester borné (1500 px) : pas de bibliothèque supplémentaire et pas
   // de troisième passe pour ne pas dégrader la vitesse de l'inventaire.
   return scanRaster(original,iw,ih,1500,true);
  }catch(_){return null;}
  finally{
   try{bitmap?.close?.();}catch(_){}
   if(objectUrl)URL.revokeObjectURL(objectUrl);
  }
 }
 // Repositionnement conservateur sur une SEULE étiquette lisible.
 // On n'enlève jamais un bord par supposition : sinon on garde la photo.
 // Le code-barres occupe environ la moitié de la largeur DIGI ; la
 // zone candidate est suffisamment agrandie pour préserver entête/prix.
 function suggestLabelCrop(reading,width,height){
  const box=reading?.bounds;
  if(!reading?.confirmed||reading.ambiguous||!box||!(width>0&&height>0))return null;
  if(Math.abs(box.slope||0)>.075)return null; // Pas de perspective certaine.
  const barW=box.right-box.left;
  if(!(barW>.24&&barW<.48))return null;
  const lw=barW/.51;
  const lh=lw*width/(height*1.26);
  const paddingX=lw*.12,paddingY=lh*.12;
  const x=box.left-.025*lw-paddingX;
  const y=box.y-.79*lh-paddingY;
  const rw=lw+paddingX*2,rh=lh+paddingY*2;
  if(rw>=.94||rh>=.94||rw<.48||rh<.38)return null;
  // Refuser les étiquettes coupées ou proches des bords.
  if(x<.015||y<.015||x+rw>.985||y+rh>.985)return null;
  return {x:Math.floor(x*width),y:Math.floor(y*height),
   width:Math.ceil(rw*width),height:Math.ceil(rh*height)};
 }
 async function cropIfSafe(source,reading){
  if(!source||typeof document==='undefined'||!reading?.bounds)return null;
  let bitmap=null,image=null,objectUrl=null;
  try{
   if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(source);
   else{
    objectUrl=URL.createObjectURL(source);
    image=await new Promise((resolve,reject)=>{
     const im=new Image();
     im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Image absente'));
     im.src=objectUrl;
    });
   }
   const original=bitmap||image;
   const width=original.width||original.naturalWidth;
   const height=original.height||original.naturalHeight;
   const rect=suggestLabelCrop(reading,width,height);
   if(!rect)return null;
   const cv=document.createElement('canvas');
   const scale=Math.min(1,1600/Math.max(rect.width,rect.height));
   cv.width=Math.round(rect.width*scale);cv.height=Math.round(rect.height*scale);
   const ctx=cv.getContext('2d');
   if(!ctx||!cv.toBlob)return null;
   ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(original,rect.x,rect.y,rect.width,rect.height,0,0,cv.width,cv.height);
   const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.90));
   if(!blob||blob.size<100)return null;
   return new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'});
  }catch(_){return null;}
  finally{
   try{bitmap?.close?.()}catch(_){}
   if(objectUrl)URL.revokeObjectURL(objectUrl);
  }
 }
 async function read(source){
  if(!source)return null;
  const native=await nativeRead(source);
  if(native?.ambiguous)return native;
  // Une lecture native vérifiée suffit, sans alourdir la requête.
  if(native?.ean13)return native;
  return rasterRead(source);
 }
 const scope=typeof window!=='undefined'?window:
  (typeof self!=='undefined'?self:null);
 if(scope)scope.IUGeminiEAN={read,decode95,lineCode,valid,
  suggestLabelCrop,cropIfSafe};
})();