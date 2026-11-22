/* Inventaires U v42.22 — EAN-13 optique indépendant.
 * Pur JavaScript sans chargement distant ; fallback iOS lorsque
 * BarcodeDetector n'existe pas. Jamais de code créé par déduction.
 * Les clés EAN et deux lignes optiques concordantes sont requises. */
(()=>{
 'use strict';
 const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1001000','1110100'];
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
 function lineCode(values){
  const width=values.length;
  // P5/P85 atténue les reflets et les petits points noirs.
  const sorted=[...values].sort((a,b)=>a-b);
  const light=sorted[Math.min(width-1,Math.floor(width*.88))];
  const dark=sorted[Math.floor(width*.07)];
  if(light-dark<38)return [];
  const threshold=(light+dark)*.5;
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
 async function rasterRead(source){
  if(typeof document==='undefined')return null;
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
   const iw=original.width||original.naturalWidth,ih=original.height||original.naturalHeight;
   if(!(iw>0&&ih>0))return null;
   const scale=Math.min(1,1100/iw);
   const w=Math.max(1,Math.round(iw*scale)),h=Math.max(1,Math.round(ih*scale));
   if(w<220||h<120)return null;
   const canvas=document.createElement('canvas');
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
   // Sur une étiquette DIGI, le code est généralement en bas à gauche,
   // mais scanner aussi le centre pour les importations recadrées.
   for(const fraction of [.47,.53,.59,.65,.70,.75,.79,.83,.87,.91]){
    for(const slope of [0,-.045,.045,-.09,.09]){
     const y=Math.floor(h*fraction);
     for(const item of lineCode(line(y,slope))){
      const key=item.code,v=votes.get(key)||{rows:new Set(),xs:[],ys:[],slopes:[]};
      v.rows.add(fraction);v.xs.push([item.start,item.end]);v.ys.push(y);v.slopes.push(slope);
      votes.set(key,v);
     }
    }
   }
   // Un seul résultat confirmé sur >=2 lignes différentes ; sinon abstention.
   const confirmed=[...votes.entries()].filter(([,v])=>v.rows.size>=2);
   if(confirmed.length>1)return {ambiguous:true,source:'optical'};
   if(confirmed.length!==1)return null;
   const [ean13,data]=confirmed[0],ranges=data.xs;
   const rect=ranges[Math.floor(ranges.length/2)];
   return {ean13,source:'optical',confirmed:true,
    bounds:{left:rect[0]/w,right:rect[1]/w,
     y:data.ys[Math.floor(data.ys.length/2)]/h,
     slope:data.slopes[Math.floor(data.slopes.length/2)]}};
  }catch(_){return null;}
  finally{
   try{bitmap?.close?.();}catch(_){}
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
 window.IUGeminiEAN={read,decode95,lineCode,valid};
})();