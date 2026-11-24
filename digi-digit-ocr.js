/* v42.50 — OCR digits: synthetic-print adapted linear classifier + glyph templates.
 * 8x12 grayscale glyphs, 970 signed int8 weights. Pretrained on sklearn digits,
 * adapted to 4000 synthetic glyphs. Held-out fonts: 1136/1200 (94.67%).
 * NOT a measured accuracy on DIGI labels. All output is advisory only.
 * No network, no photos persisted, no autonomous verification. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUDigiDigitOCR=api;
})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:null,function(){
 'use strict';
 const W=8,H=12,N=W*H;
 const B64='AQL/Af75/P8A/v4B//78/v4AAgUFBgIAAAMCAwIHCAUFA/369voECwkA+v/59/8NDf/7/fn3/wgJCP/4+f0BAQUKBv//AAD8AAQFBQQA/fz++/8C/vv7AAH9/AIA/gAA6wMKCAD7AQMB9/oDCQUD+/z1+f4HBQD2+/4AChwY/vT9Av38EA779QAC+/wNDfn3AQH//gUM9/kB9/f2CA36+Pj29PEIEPz29wHz9wgVBPj6BQcADREMCwsHDQcMDRMVEIH8/QEA/v38/QL9+vz9/Pr7BQH//wAC/gEDAf7+/wAEB/v8+vf3AAcD+vv59PUCBv/5+Pz6/v/7+f79BQP/+/n5/wALBvr7+voABAsGBAYFAQEDAgMCAwQDAgMCAwIEBwL2A/z9AwL69/v+/vv9+vv7/P8BAAIBAwQD+fj3/wUGAgb68/f/Av4F/vv0+QcJ/wD7//X/AgIFCP/6+P71/AUJB/z9/vT8BgkJAAECAAACBAgE/wEB/v7+/QUBAAD+/Pv89f76+fj8//37/vn5/P//APz9+Pv+Af/++/38AQIGAAL+/P4E/v8CAAD9AAH8/f//AP4BAPwAA/3/AwIABAMFAf4EAwQIBggFAQH+/wACA/77//n59/sD//3++/r4+wL//f4CCAQA/wUEBwICA/////wCAwIHAgQC+wACBQsE+/X1+QQJDQUC/Pz6AAIC/wICAPz39/v7+gEFAvb0+fr9AwUG+ff8/f8EBQf/+/8BAAH9/gP//f/8+/v9AQQCAv78/f7s/vv7//8CAQD79vz7+vf7Afv6/wX99vj9APwEA/3w8fkJAQUHAvn2+A0MCAcCAAD9EA8HBfr8BgAJCgf++/wCBQQHBfz7+wEG/gIFBPr9Awf7/AMF/v3/A/78AAcEAwAC1gMDAgD/BAkHAwMDAwQABgf/AAIDBQIEAfz7+/z/BgT9/vv7/wIFAP7/+fr+AgL9/wD8/gIBAv8B/f0BAgAB/f3+/QABAgD8/P38AP/99/f8/fv6+/z19vv//fv8+/b4/PkAAQD/Af78+gIE//n3+fsCCQYA+vwCBQcLDwX+AQUPCPkDDQT+AwH88fwUCgQE+fnxAAsKA/b07ggNA/79/AH6EAj//fz7AQQGBv36+vwBCP/9+QD/+P//AP38AQH+Af3aAP4FBf74/v0B/v77/P39AAf//v7+/QAEDwcDAwAKCAgJBwAA/f8GDAELAwD8AwwM+AUJEAEDCQT39QEEBQMB+/nz+fr/AP73/fj4Av/7+/sA/fz+//r7/wADAgH/+wH/2g==';
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 function decodeWeights(){
  const bytes=[];let n=0,bits=0;
  for(const c of B64){if(c==='=')break;const d=alphabet.indexOf(c);if(d<0)throw Error('weights');n=(n<<6)|d;bits+=6;if(bits>=8){bits-=8;bytes.push((n>>bits)&255);}}
  return Int8Array.from(bytes);
 }
 const weights=decodeWeights(),scale=.19671408832073212;
 const glyphs=[
 '01110/10001/10001/10001/10001/10001/01110',
 '00100/01100/00100/00100/00100/00100/01110',
 '01110/10001/00001/00010/00100/01000/11111',
 '11110/00001/00001/01110/00001/00001/11110',
 '00010/00110/01010/10010/11111/00010/00010',
 '11111/10000/10000/11110/00001/00001/11110',
 '01110/10000/10000/11110/10001/10001/01110',
 '11111/00001/00010/00100/01000/01000/01000',
 '01110/10001/10001/01110/10001/10001/01110',
 '01110/10001/10001/01111/00001/00001/01110'];
 function normalize(a,w,h){
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(a[y*w+x]>40){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<x0||y1<y0)return null;
  const out=new Float32Array(N),bw=x1-x0+1,bh=y1-y0+1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   let sum=0,count=0;
   for(let sy=Math.floor(y*bh/H);sy<Math.ceil((y+1)*bh/H);sy++)
    for(let sx=Math.floor(x*bw/W);sx<Math.ceil((x+1)*bw/W);sx++){sum+=a[(y0+sy)*w+x0+sx];count++;}
   out[y*W+x]=sum/(255*Math.max(1,count));
  }
  return out;
 }
 let templates=null;
 function warm(){
  if(templates)return true;
  templates=glyphs.map((g,digit)=>({digit,vector:normalize(Uint8Array.from(g.replace(/\//g,''),x=>x==='1'?255:0),5,7)}));
  if(typeof OffscreenCanvas==='function'){
   const c=new OffscreenCanvas(64,72),ctx=c.getContext('2d',{willReadFrequently:true});
   if(ctx)for(const font of ['48px monospace','48px sans-serif','bold 48px sans-serif','48px serif']){
    ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';
    for(let d=0;d<10;d++){
     ctx.fillStyle='black';ctx.fillRect(0,0,64,72);ctx.fillStyle='white';ctx.fillText(String(d),32,36);
     const rgba=ctx.getImageData(0,0,64,72).data,a=new Uint8Array(64*72);
     for(let i=0;i<a.length;i++)a[i]=rgba[i*4];
     const vector=normalize(a,64,72);if(vector)templates.push({digit:d,vector});
    }
   }
  }
  return true;
 }
 function classify(v){
  if(!v||v.length!==N||weights.length!==10*(N+1))return [];
  warm();const distance=Array(10).fill(Infinity),logits=[];
  for(const {digit,vector} of templates){let d=0;for(let i=0;i<N;i++)d+=(v[i]-vector[i])**2;distance[digit]=Math.min(distance[digit],d/N);}
  for(let d=0;d<10;d++){let z=weights[d*(N+1)+N];for(let i=0;i<N;i++)z+=weights[d*(N+1)+i]*v[i];logits.push(z*scale);}
  const high=Math.max(...logits);
  // Scores are ranking costs, not calibrated probabilities.
  return logits.map((z,d)=>({digit:String(d),score:-((high-z)*.18+distance[d]*6),
   templateDistance:distance[d]})).sort((a,b)=>b.score-a.score).slice(0,3);
 }
 function sharpen(a,w,h){
  const out=new Uint8Array(a);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
   const i=y*w+x,v=a[i],mean=(a[i-1]+a[i+1]+a[i-w]+a[i+w])/4;
   out[i]=Math.max(0,Math.min(255,Math.round(v+.65*(v-mean))));
  }
  return out;
 }
 // Locate an isolated digit line, exactly 13 connected column runs.
 // Reject merged glyphs, extra date/text, bars and irregular spacing.
 function readRaster(gray,w,h){
  if(w<120||h<18||w*h>220000||gray.length!==w*h)return null;
  const hist=new Uint32Array(256);for(const v of gray)hist[v]++;
  function percentile(p){let n=0;for(let i=0;i<256;i++){n+=hist[i];if(n>=gray.length*p)return i;}return 255;}
  const dark=percentile(.04),light=percentile(.85);
  if(light-dark<48)return null;
  const threshold=dark+(light-dark)*.48,counts=new Uint16Array(h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(gray[y*w+x]<threshold)counts[y]++;
  const bands=[];let top=-1;
  for(let y=0;y<=h;y++){
   if(y<h&&counts[y]>=Math.max(4,w*.012)){if(top<0)top=y;}
   else if(top>=0){if(y-top>=7&&y-top<=h*.65)bands.push([top,y]);top=-1;}
  }
  for(const [y0,y1] of bands.reverse()){
   const bh=y1-y0,cols=new Uint16Array(w),runs=[];let start=-1;
   for(let x=0;x<w;x++)for(let y=y0;y<y1;y++)if(gray[y*w+x]<threshold)cols[x]++;
   for(let x=0;x<=w;x++){
    if(x<w&&cols[x]>=Math.max(1,bh*.06)){if(start<0)start=x;}
    else if(start>=0){runs.push([start,x]);start=-1;}
   }
   if(runs.length!==13||runs[0][0]===0||runs[12][1]===w)continue;
   const widths=runs.map(([a,b])=>b-a).sort((a,b)=>a-b),median=widths[6];
   if(median<2||median>bh*1.25||widths[0]<median*.24||widths[12]>median*1.85)continue;
   const gaps=runs.slice(1).map(([x],i)=>x-runs[i][1]);
   if(gaps.some(g=>g>median*3.2))continue;
   const options=[];let rejected=false;
   for(const [x0,x1] of runs){
    const gw=x1-x0,a=new Uint8Array(gw*bh);let ink=0;
    for(let y=0;y<bh;y++)for(let x=0;x<gw;x++){
     const v=gray[(y0+y)*w+x0+x];const value=v<threshold?Math.round(255*Math.min(1,(light-v)/(light-dark))):0;
     a[y*gw+x]=value;if(value>40)ink++;
    }
    if(ink<gw*bh*.12||ink>gw*bh*.87){rejected=true;break;}
    const o=classify(normalize(a,gw,bh));if(o.length!==3){rejected=true;break;}options.push(o);
   }
   if(rejected)continue;
   const pattern=options.map(o=>o[0].score-o[1].score>=.12?o[0].digit:'?').join('');
   if(pattern.replace(/\?/g,'').length>=6)return {pattern,digitOptions:options,source:'digit-template',confirmed:false};
  }
  return null;
 }
 async function read(photo,hint){
  if(!photo||typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')return null;
  let bmp;try{
   bmp=await createImageBitmap(photo);
   const label=hint?.labelRect;
   const z=label?.source==='paper-outline'?{x:label.x+.01*label.w,y:label.y+.70*label.h,w:.84*label.w,h:.29*label.h}:{x:.025,y:.67,w:.67,h:.315};
   const x=Math.round(z.x*bmp.width),y=Math.round((z.y+.37*z.h)*bmp.height),sw=Math.round(z.w*bmp.width),sh=Math.round(.61*z.h*bmp.height);
   if(x<0||y<0||sw<100||sh<10||x+sw>bmp.width||y+sh>bmp.height)return null;
   const factor=Math.min(2,1100/sw,170/sh),w=Math.round(sw*factor),h=Math.round(sh*factor);
   const cv=new OffscreenCanvas(w,h),ctx=cv.getContext('2d',{willReadFrequently:true});if(!ctx)return null;
   ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   ctx.drawImage(bmp,x,y,sw,sh,0,0,w,h);
   const rgba=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h);
   for(let i=0;i<gray.length;i++)gray[i]=(77*rgba[4*i]+150*rgba[4*i+1]+29*rgba[4*i+2])>>>8;
   // Bicubic/browser high-quality interpolation and mild unsharp mask,
   // never generative upscaling. Keep the original JPEG untouched.
   const a=readRaster(gray,w,h),b=readRaster(sharpen(gray,w,h),w,h);
   if(a&&b&&a.pattern===b.pattern)return {...a,views:2};
   if(a&&b)return null;
   return a||b;
  }catch(_){return null;}finally{bmp?.close?.();}
 }
 return Object.freeze({warm,read,readRaster,classify,normalize,sharpen,modelSize:weights.length});
});
