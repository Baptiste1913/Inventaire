/* v42.45 — fusion prudente, perspective et SIMD local. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IURecognitionCore=api;
})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:null,function(){
 'use strict';
 function mask(raw){
  if(typeof raw!=='string')return '';
  const s=raw.replace(/[\s\u00a0\u202f-]/g,'');
  return /^[0-9?]{13}$/.test(s)&&/\d/.test(s)?s:'';
 }
 function fuse(...values){
  const masks=values.map(mask).filter(Boolean),out=Array(13).fill('?');
  let conflict=false,known=0;
  for(let i=0;i<13;i++){
   const ds=new Set(masks.map(m=>m[i]).filter(d=>d!=='?'));
   if(ds.size>1)conflict=true;
   else if(ds.size===1){out[i]=ds.values().next().value;known++;}
  }
  return {pattern:known?out.join(''):'',known,conflict};
 }
 // Une image voisine ne peut fournir ni identité, ni poids, ni prix.
 // Exiger préfixe COMPLET et au moins dix positions concordantes sur
 // la photo principale avant d'utiliser une lecture supplémentaire.
 function corroborate(primary,alternate){
  const a=mask(primary),b=mask(alternate);
  if(!a||!b||a.slice(0,7).includes('?')||a.slice(0,7)!==b.slice(0,7))
   return {pattern:a,used:false};
  let overlap=0;
  for(let i=0;i<13;i++)if(a[i]!=='?'&&b[i]!=='?'){
   if(a[i]!==b[i])return {pattern:a,used:false};
   overlap++;
  }
  return overlap>=10?{pattern:fuse(a,b).pattern,used:true}:{pattern:a,used:false};
 }
 const SIMD='AGFzbQEAAAABBgFgAn9/AAMCAQAEBQFwAQEBBQMBAAIGCAF/AUGAiAQLBxECBm1lbW9yeQIABGdyYXkAAArcBAHZBAMDfwJ7An9BACECAkAgAUEESQ0AQQAhAyAAIQQDQCAEIAT9AAAAIgVBCP2tAf0M/wAAAP8AAAD/AAAA/wAAACIG/U79DJYAAACWAAAAlgAAAJYAAAD9tQEgBSAG/U79DE0AAABNAAAATQAAAE0AAAD9tQH9rgEgBUEQ/a0BIAb9Tv0MHQAAAB0AAAAdAAAAHQAAAP21Af2uAUEI/a0B/QwBAQEAAQEBAAEBAQABAQEA/bUBIAX9DAAAAP8AAAD/AAAA/wAAAP/9Tv1Q/QsAACAEQRBqIQQgA0EIaiEHIANBBGoiAiEDIAcgAU0NAAsLAkAgASACTQ0AAkAgASACayIHQQNNDQAgACACQQJ0aiEEIAIgAUEDcSIIaiABayEDIAIgByAIa2ohAgNAIAQgBP0AAgAiBUEI/a0B/Qz/AAAA/wAAAP8AAAD/AAAAIgb9Tv0MlgAAAJYAAACWAAAAlgAAAP21ASAFIAb9Tv0MTQAAAE0AAABNAAAATQAAAP21Af2uASAFQRD9rQEgBv1O/QwdAAAAHQAAAB0AAAAdAAAA/bUB/a4BQQj9rQH9DAEBAQABAQEAAQEBAAEBAQD9tQEgBf0MAAAA/wAAAP8AAAD/AAAA//1O/VD9CwIAIARBEGohBCADQQRqIgMNAAsgCEUNAQsgASACayEHIAAgAkECdGohBANAIAQgBCgCACIDQQh2Qf8BcUGWAWwgA0H/AXFBzQBsaiADQRB2Qf8BcUEdbGpBCHZBgYIEbCADQYCAgHhxcjYCACAEQQRqIQQgB0F/aiIHDQALCws=';
 let simd=null,checked=false;
 function grayscale(data){
  if(!data||data.length%4||data.length>16000000)return 'none';
  if(!checked){checked=true;try{
   simd=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.from(atob(SIMD),c=>c.charCodeAt(0)))).exports;
  }catch(_){}}
  if(simd)try{
   const n=data.length,pages=Math.ceil((n+65536)/65536);
   if(pages>simd.memory.buffer.byteLength/65536)simd.memory.grow(pages-simd.memory.buffer.byteLength/65536);
   const buf=new Uint8Array(simd.memory.buffer,65536,n);
   buf.set(data);simd.gray(65536,n/4);data.set(buf);return 'wasm-simd';
  }catch(_){simd=null;}
  for(let i=0;i<data.length;i+=4){const y=(77*data[i]+150*data[i+1]+29*data[i+2])>>>8;
   data[i]=data[i+1]=data[i+2]=y;}
  return 'js';
 }
 function fit(points){
  if(points.length<7)return null;
  let x=0,y=0,xx=0,xy=0;
  for(const p of points){x+=p[0];y+=p[1];xx+=p[0]*p[0];xy+=p[0]*p[1];}
  const n=points.length,d=n*xx-x*x;if(Math.abs(d)<1)return null;
  const a=(n*xy-x*y)/d,b=(y-a*x)/n;
  const err=Math.sqrt(points.reduce((s,p)=>s+(p[1]-a*p[0]-b)**2,0)/n);
  return err<=3.4&&Math.abs(a)<.65?{a,b}:null;
 }
 function quad(image,rect){
  const {width:w,height:h,data}=image||{};
  if(!rect||!data||w<80||h<60||rect.w<.35||rect.h<.30)return null;
  const x0=rect.x*w,x1=(rect.x+rect.w)*w,y0=rect.y*h,y1=(rect.y+rect.h)*h;
  const gray=(x,y)=>data[(Math.round(y)*w+Math.round(x))*4];
  function side(vertical,expected,range,dir){
   const start=vertical?y0:x0,end=vertical?y1:x1,dim=vertical?w:h,points=[];
   for(let i=0;i<15;i++){
    const f=Math.round(start+(end-start)*(.14+.72*i/14));if(f<4||f>=(vertical?h:w)-4)continue;
    let best=null,scoreBest=0;
    for(let t=Math.max(4,Math.round(expected-range));t<Math.min(dim-4,expected+range);t++){
     let a=0,b=0;for(let k=1;k<=3;k++){a+=vertical?gray(t+dir*k,f):gray(f,t+dir*k);b+=vertical?gray(t-dir*k,f):gray(f,t-dir*k);}
     const score=(a-b)/3-Math.abs(t-expected)*.35;
     if(a/3>=145&&score>=26&&score>scoreBest){best=t;scoreBest=score;}
    }
    if(best!==null)points.push([f,best]);
   }
   return fit(points);
  }
  const l=side(true,x0,w*.13,1),r=side(true,x1,w*.13,-1),
   t=side(false,y0,h*.13,1),b=side(false,y1,h*.13,-1);
  if(!l||!r||!t||!b)return null;
  const cross=(v,hz)=>{const d=1-v.a*hz.a;if(Math.abs(d)<.6)return null;
   const x=(v.a*hz.b+v.b)/d;return [x/w,(hz.a*x+hz.b)/h];};
  const q=[cross(l,t),cross(r,t),cross(r,b),cross(l,b)];
  if(q.some(p=>!p||p.some(v=>!Number.isFinite(v)||v<.008||v>.992)))return null;
  const [a,c,d,e]=q;
  if(c[0]-a[0]<.28||d[0]-e[0]<.28||e[1]-a[1]<.25||d[1]-c[1]<.25)return null;
  const area=Math.abs(q.reduce((s,p,i)=>s+p[0]*q[(i+1)%4][1]-p[1]*q[(i+1)%4][0],0))/2;
  if(area<rect.w*rect.h*.60||area>rect.w*rect.h*1.55)return null;
  return Math.max(Math.abs(a[1]-c[1]),Math.abs(e[1]-d[1]),Math.abs(a[0]-e[0]),Math.abs(c[0]-d[0]))>=.018?q:null;
 }
 function transform(q){
  const [a,b,c,d]=q,dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],
   dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1];
  const det=dx1*dy2-dx2*dy1;if(Math.abs(det)<1e-8)return null;
  const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
  return [a[0],a[1],b[0]-a[0]+g*b[0],d[0]-a[0]+h*d[0],b[1]-a[1]+g*b[1],d[1]-a[1]+h*d[1],g,h];
 }
 function project(q,u,v){
  const m=transform(q);if(!m)return null;
  const [a,b,c,d,e,f,g,h]=m,k=1+g*u+h*v;
  return k>=.2?[(a+c*u+d*v)/k,(b+e*u+f*v)/k]:null;
 }
 function warp(source,target,q){
  const {width:w,height:h,data:src}=source,{width:W,height:H,data:out}=target;
  const m=transform(q);if(!m||!W||!H||W*H>1800000)return false;
  const [a,b,c,d,e,f,g,j]=m;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const u=x/Math.max(1,W-1),v=y/Math.max(1,H-1),k=1+g*u+j*v;
   if(k<.2)return false;
   const sx=(a+c*u+d*v)/k*(w-1),sy=(b+e*u+f*v)/k*(h-1);
   if(sx<0||sy<0||sx>=w-1||sy>=h-1)return false;
   const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,p=(iy*w+ix)*4,o=(y*W+x)*4;
   for(let ch=0;ch<3;ch++)out[o+ch]=Math.round((src[p+ch]*(1-fx)+src[p+4+ch]*fx)*(1-fy)+(src[p+w*4+ch]*(1-fx)+src[p+w*4+4+ch]*fx)*fy);
   out[o+3]=255;
  }
  return true;
 }
 return Object.freeze({mask,fuse,corroborate,grayscale,quad,project,warp});
});
