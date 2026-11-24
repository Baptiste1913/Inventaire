/* v42.47 — PP-OCRv5 local, LiteRT.js 2.5.3, Apache-2.0 models.
 * https://huggingface.co/litert-community/PP-OCRv5-LiteRT
 * No image upload: only runtime, dictionary and model downloads.
 * OCR is a weak observation; no autonomous validation. */
'use strict';
const BASE='https://huggingface.co/litert-community/PP-OCRv5-LiteRT/resolve/f4bcc36/';
const RUNTIME='https://cdn.jsdelivr.net/npm/@litertjs/core@2.5.3';
let model=null,Tensor=null,dict=null,backend='',busy=false;
function decodeCTC(data,chars){
 const n=chars.length;
 if(n<2||data.length%n||data.length/n>256||!data.length)return null;
 let prev=-1,text='',confidence=1;const digitOptions=[];
 for(let t=0;t<data.length;t+=n){
  let max=-Infinity,id=-1,min=Infinity,sum=0;
  for(let j=0;j<n;j++){
   const v=data[t+j];if(!Number.isFinite(v))return null;
   if(v>max){max=v;id=j;}if(v<min)min=v;sum+=v;
  }
  if(id!==0&&id!==prev){
   let probability;
   if(min>=0&&max<=1.0001&&Math.abs(sum-1)<.03)probability=max;
   else{let denom=0;for(let j=0;j<n;j++)denom+=Math.exp(data[t+j]-max);probability=1/denom;}
   confidence=Math.min(confidence,probability);
   const character=chars[id];
   if(/^\d$/.test(character)){
    const options=[];
    for(let j=1;j<n;j++)if(/^\d$/.test(chars[j]))options.push({digit:chars[j],score:data[t+j]});
    options.sort((a,b)=>b.score-a.score);
    digitOptions.push(options.slice(0,3));
   }
   text+=character;
  }
  prev=id;
 }
 const normalized=text.normalize('NFKC').trim();
 if(!/^[0-9 \t\u00a0\u202f-]{13,24}$/.test(normalized))return null;
 const pattern=normalized.replace(/\D/g,'');
 return pattern.length===13&&confidence>=.80?{pattern,confidence,digitOptions}:null;
}
async function initialize(){
 if(model)return {backend};
 const core=await import(RUNTIME+'/+esm');
 Tensor=core.Tensor;
 await core.loadLiteRt(RUNTIME+'/wasm/');
 const response=await fetch(BASE+'ppocrv5_dict.txt');
 if(!response.ok)throw Error('Dictionnaire indisponible');
 const lines=(await response.text()).replace(/\r/g,'').replace(/\n$/,'').split('\n');
 dict=['',...lines,' '];
 if(dict.length!==18385)throw Error('Dictionnaire incompatible');
 for(const candidate of self.navigator?.gpu?['webgpu','wasm']:['wasm']){
  let instance=null,input=null,out=null;
  try{
   const file=candidate==='webgpu'?'ppocr_rec_fp32_webgpu.tflite':'ppocr_rec_fp32.tflite';
   instance=await core.loadAndCompile(BASE+file,{accelerator:candidate});
   const shape=Array.from(instance.getInputDetails()[0].shape);
   if(shape.join(',')!=='1,3,48,320')throw Error('Dimensions incompatibles');
   input=new Tensor(new Float32Array(3*48*320).fill(-1),shape);
   out=await instance.run(input);
   const data=await out[0].data();
   if(!data.length||data.length%dict.length||!Number.isFinite(data[0]))throw Error('Sortie incompatible');
   model=instance;backend=candidate;return {backend};
  }catch(_){try{instance?.delete?.()}catch(_){}}
  finally{input?.delete?.();for(const t of out||[])t?.delete?.();}
 }
 throw Error('LiteRT PP-OCRv5 indisponible');
}
async function recognizeBand(bmp,x,y,w,h){
 if(w<100||h<12||x<0||y<0||x+w>bmp.width||y+h>bmp.height)return null;
 const cv=new OffscreenCanvas(320,48),ctx=cv.getContext('2d',{willReadFrequently:true});
 if(!ctx)return null;
 ctx.fillStyle='#000';ctx.fillRect(0,0,320,48);
 const dw=Math.min(320,Math.max(1,Math.round(48*w/h)));
 ctx.imageSmoothingQuality='high';
 ctx.drawImage(bmp,x,y,w,h,0,0,dw,48);
 const pixels=ctx.getImageData(0,0,320,48).data,n=320*48,values=new Float32Array(n*3);
 for(let i=0;i<n;i++)for(let c=0;c<3;c++)values[c*n+i]=pixels[4*i+c]/127.5-1;
 let input=null,out=null;
 try{
  input=new Tensor(values,[1,3,48,320]);out=await model.run(input);
  return decodeCTC(await out[0].data(),dict);
 }finally{input?.delete?.();for(const t of out||[])t?.delete?.();}
}
async function read(photo,zone){
 if(!model||!photo||busy)return null;
 busy=true;let bmp;
 try{
  bmp=await createImageBitmap(photo);
  const z=zone||{x:.025,y:.67,w:.67,h:.315};
  const x=Math.round(z.x*bmp.width),w=Math.round(z.w*bmp.width);
  const a=await recognizeBand(bmp,x,Math.round((z.y+.48*z.h)*bmp.height),w,Math.round(.49*z.h*bmp.height));
  const b=await recognizeBand(bmp,x,Math.round((z.y+.57*z.h)*bmp.height),w,Math.round(.40*z.h*bmp.height));
  if(a&&b&&a.pattern===b.pattern)return {pattern:a.pattern,confidence:Math.min(a.confidence,b.confidence),digitOptions:a.digitOptions,source:'litert',confirmed:false,backend};
  return null;
 }finally{bmp?.close?.();busy=false;}
}
self.onmessage=async({data:m})=>{
 const {id,kind}=m||{};
 if(!Number.isSafeInteger(id))return;
 try{
  if(kind==='init')self.postMessage({id,result:await initialize()});
  else if(kind==='read')self.postMessage({id,result:await read(m.photo,m.zone)});
 }catch(_){self.postMessage({id,error:'LiteRT indisponible'});}
};
