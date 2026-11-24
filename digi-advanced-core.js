/* DIGI Advanced: 5-layer quantized CNN + CTC. Worker CPU inference only.
 * No network/image storage, no authority to validate. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./digi-advanced-model.js'):root?.IUDigiAdvancedModel,root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUDigiAdvancedCore=api;
})(typeof self!=='undefined'?self:null,function(model,root){
 'use strict';
 const W=224,H=24,alphabet='0123456789,';
 let layers=null;
 function decode64(s){
  const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=[];
  let n=0,bits=0;
  for(const c of s){if(c==='=')break;const d=abc.indexOf(c);if(d<0)throw Error('model base64');n=(n<<6)|d;bits+=6;if(bits>=8){bits-=8;out.push((n>>bits)&255);}}
  return Int8Array.from(out);
 }
 function warm(){
  if(layers)return true;
  if(model?.version!==1||model.width!==W||model.height!==H||model.alphabet!==alphabet||model.layers?.length!==5)throw Error('model incompatible');
  const expected=[[6,1,3,3],[12,6,3,3],[16,12,3,3],[20,16,3,1],[12,20,1,1]];
  layers=model.layers.map((l,i)=>{
   if(l.shape.join(',')!==expected[i].join(',')||l.bias.length!==l.shape[0]||!Number.isFinite(l.scale)||l.scale<=0)throw Error('model shape');
   const q=decode64(l.weights);
   if(q.length!==l.shape.reduce((a,b)=>a*b,1)||!l.bias.every(Number.isFinite))throw Error('model weights');
   return {...l,values:Float32Array.from(q,x=>x*l.scale)};
  });
  return true;
 }
 function conv(src,h,w,layer,relu){
  const [oc,ic,kh,kw]=layer.shape,[sh,sw]=layer.stride,[ph,pw]=layer.padding;
  const oh=Math.floor((h+2*ph-kh)/sh)+1,ow=Math.floor((w+2*pw-kw)/sw)+1;
  const dst=new Float32Array(oc*oh*ow),v=layer.values;
  for(let o=0;o<oc;o++)for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
   let sum=layer.bias[o];
   for(let c=0;c<ic;c++)for(let ky=0;ky<kh;ky++){
    const sy=y*sh+ky-ph;if(sy<0||sy>=h)continue;
    const ib=c*h*w+sy*w,wb=((o*ic+c)*kh+ky)*kw;
    for(let kx=0;kx<kw;kx++){
     const sx=x*sw+kx-pw;if(sx>=0&&sx<w)sum+=src[ib+sx]*v[wb+kx];
    }
   }
   dst[(o*oh+y)*ow+x]=relu?Math.max(0,sum):sum;
  }
  return {data:dst,h:oh,w:ow};
 }
 function infer(input){
  if(!input||input.length!==W*H)return null;
  warm();let a={data:Float32Array.from(input,v=>v/255),h:H,w:W};
  for(let i=0;i<layers.length;i++)a=conv(a.data,a.h,a.w,layers[i],i<layers.length-1);
  if(a.h!==1||a.data.length!==12*a.w)return null;
  return a;
 }
 function decode(output){
  if(!output||output.h!==1||output.data.length!==12*output.w)return null;
  const {data,w}=output;let prev=0,text='',margins=[];
  for(let t=0;t<w;t++){
   let id=0,first=-Infinity,second=-Infinity;
   for(let c=0;c<12;c++){
    const z=data[c*w+t];if(!Number.isFinite(z))return null;
    if(z>first){second=first;first=z;id=c;}else if(z>second)second=z;
   }
   if(id&&id!==prev){text+=alphabet[id-1];margins.push(first-second);}
   else if(id&&id===prev&&margins.length)margins[margins.length-1]=Math.max(margins[margins.length-1],first-second);
   prev=id;
  }
  return text?{text,margins}:null;
 }
 function accept(decoded,field){
  if(!decoded)return null;
  const s=decoded.text;
  if(field==='ean'){
   if(!/^\d{13}$/.test(s))return null;
   const pattern=[...s].map((c,i)=>decoded.margins[i]>=.7?c:'?').join('');
   return pattern.replace(/\?/g,'').length>=7?{pattern,source:'digi-advanced',confirmed:false}:null;
  }
  const rule=field==='weight'?/^\d{1,2},\d{3}$/:/^\d{1,3},\d{2}$/;
  if(!rule.test(s)||decoded.margins.some(m=>m<.7))return null;
  const [a,b]=s.split(',').map(Number),value=a*(field==='weight'?1000:100)+b;
  if(!Number.isSafeInteger(value)||value<1||value>(field==='weight'?30000:99999))return null;
  return {value,text:s,source:'digi-advanced',confirmed:false};
 }
 // Geometry bounds match the app's guide, but are widened modestly.
 // Every crop is a hypothesis: never replace confirmed OCR values.
 const ZONES={ean:[.02,.79,.61,.20],weight:[.34,.475,.26,.19],rate:[.055,.475,.26,.19],total:[.55,.74,.42,.25]};
 function readZone(bmp,label,field){
  const z=ZONES[field],sx=Math.round((label.x+z[0]*label.w)*bmp.width),
   sy=Math.round((label.y+z[1]*label.h)*bmp.height),
   sw=Math.round(z[2]*label.w*bmp.width),sh=Math.round(z[3]*label.h*bmp.height);
  if(sx<0||sy<0||sw<50||sh<12||sx+sw>bmp.width||sy+sh>bmp.height)return null;
  const factor=Math.min(1,640/sw,160/sh),w=Math.round(sw*factor),h=Math.round(sh*factor);
  const cv=new OffscreenCanvas(w,h),ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
  ctx.drawImage(bmp,sx,sy,sw,sh,0,0,w,h);
  const rgba=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h),hist=new Uint32Array(256);
  for(let i=0;i<gray.length;i++){const v=(77*rgba[4*i]+150*rgba[4*i+1]+29*rgba[4*i+2])>>>8;gray[i]=v;hist[v]++;}
  function percentile(p){let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=gray.length*p)return i;}return 255;}
  const dark=percentile(.035),light=percentile(.85);
  if(light-dark<45)return null;
  const threshold=dark+(light-dark)*.5,rows=new Uint16Array(h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(gray[y*w+x]<threshold)rows[y]++;
  let bands=[],top=-1,last=-1;
  for(let y=0;y<=h;y++){
   if(y<h&&rows[y]>=Math.max(2,w*.009)){if(top<0)top=y;last=y;}
   else if(top>=0&&(y-last>2||y===h)){if(last-top>=5)bands.push([top,last+1]);top=-1;}
  }
  // The printed EAN lies under the bars; prefer the lowest short band.
  // Numeric fields use the tallest candidate, generally the value.
  bands.sort((a,b)=>field==='ean'?b[1]-a[1]:(b[1]-b[0])-(a[1]-a[0]));
  for(const [y0,y1] of bands.slice(0,2)){
   let x0=w,x1=-1,ink=0;const bh=y1-y0;
   for(let y=y0;y<y1;y++)for(let x=0;x<w;x++)if(gray[y*w+x]<threshold){x0=Math.min(x0,x);x1=Math.max(x1,x);ink++;}
   const bw=x1-x0+1;
   if(bw<20||bh<6||bh>h*.86||bw/bh<(field==='ean'?5:1.1)||ink>bw*bh*.75)continue;
   if(x0<=0||x1>=w-1)continue;
   const scale=Math.min(20/bh,(W-8)/bw),dw=Math.max(1,Math.round(bw*scale)),dh=Math.max(1,Math.round(bh*scale));
   const input=new Uint8Array(W*H),dy=Math.floor((H-dh)/2);
   for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    // Area averaging for reductions, same non-generative normalization.
    let sum=0,n=0;
    for(let yy=Math.floor(y*bh/dh);yy<Math.ceil((y+1)*bh/dh);yy++)
     for(let xx=Math.floor(x*bw/dw);xx<Math.ceil((x+1)*bw/dw);xx++){
      sum+=Math.max(0,Math.min(255,(light-gray[(y0+yy)*w+x0+xx])*255/(light-dark)));n++;
     }
    input[(dy+y)*W+3+x]=Math.round(sum/Math.max(1,n));
   }
   const result=accept(decode(infer(input)),field);
   if(result)return result;
  }
  return null;
 }
 async function read(photo,hint){
  if(!photo||typeof OffscreenCanvas!=='function'||typeof createImageBitmap!=='function')return null;
  let bmp;
  try{
   warm();bmp=await createImageBitmap(photo);
   if(bmp.width<400||bmp.height<250)return null;
   let label=hint?.labelRect?.source==='paper-outline'?hint.labelRect:null;
   if(!label&&root?.IUGeminiLabelGeometry?.detect){
    const scale=Math.min(1,300/Math.max(bmp.width,bmp.height)),w=Math.round(bmp.width*scale),h=Math.round(bmp.height*scale);
    const cv=new OffscreenCanvas(w,h),ctx=cv.getContext('2d',{willReadFrequently:true});
    if(ctx){ctx.drawImage(bmp,0,0,w,h);label=root.IUGeminiLabelGeometry.detect(ctx.getImageData(0,0,w,h));}
   }
   if(!label)label={x:0,y:0,w:1,h:1};
   if(![label.x,label.y,label.w,label.h].every(Number.isFinite)||label.w<.3||label.h<.25||label.x<0||label.y<0||label.x+label.w>1.001||label.y+label.h>1.001)return null;
   const started=performance.now(),fields={};let ean=null;
   for(const field of ['ean','weight','rate','total']){
    if(performance.now()-started>750)break;
    const r=readZone(bmp,label,field);
    if(r){if(field==='ean')ean=r;else fields[field]=r;}
   }
   if(!ean&&!Object.keys(fields).length)return null;
   return {source:'digi-advanced',confirmed:false,pattern:ean?.pattern||null,fields,elapsedMs:Math.round(performance.now()-started)};
  }catch(_){return null;}finally{bmp?.close?.();}
 }
 return Object.freeze({warm,infer,decode,accept,read,parameterCount:3696});
});
