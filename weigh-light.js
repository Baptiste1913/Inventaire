/* V41.03 — fibre optique haute définition, sans contour bleu statique.
   Les images OCR restent lues depuis la vidéo, non depuis ce canvas. */
(()=>{
 'use strict';
 const overlay=document.getElementById('iuWeighScanOverlay');
 const guide=overlay?.querySelector('.iu-weigh-scan-guide');
 const canvas=guide?.querySelector('.iu-weight-light');
 if(!overlay||!guide||!canvas)return;
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)return;
 const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const PI=Math.PI,TAU=2*PI;
 let w=0,h=0,raf=0,last=0,running=false;
 function measure(){
  const box=canvas.getBoundingClientRect(),a=box.width,b=box.height;
  if(a<20||b<15){w=h=0;return;}
  const dpr=Math.min(3,window.devicePixelRatio||1);
  w=a;h=b;
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
  ctx.setTransform(pw/w,0,0,ph/h,0,0);
 }
 // Rectangle arrondi parcouru dans le sens horaire, avec normale sortante.
 function at(f){
  const l=7,t=7,r=w-7,b=h-7;
  const ww=r-l,hh=b-t,R=Math.max(1,Math.min(9,ww/5,hh/3));
  const H=ww-2*R,V=hh-2*R,A=PI*R/2;
  let p=((f%1)+1)%1*(2*H+2*V+4*A);
  const corner=(x,y,a)=>({x:x+R*Math.cos(a),y:y+R*Math.sin(a),nx:Math.cos(a),ny:Math.sin(a)});
  if(p<H)return{x:l+R+p,y:t,nx:0,ny:-1};p-=H;
  if(p<A)return corner(r-R,t+R,-PI/2+p/R);p-=A;
  if(p<V)return{x:r,y:t+R+p,nx:1,ny:0};p-=V;
  if(p<A)return corner(r-R,b-R,p/R);p-=A;
  if(p<H)return{x:r-R-p,y:b,nx:0,ny:1};p-=H;
  if(p<A)return corner(l+R,b-R,PI/2+p/R);p-=A;
  if(p<V)return{x:l,y:b-R-p,nx:-1,ny:0};p-=V;
  return corner(l+R,t+R,PI+p/R);
 }
 function wave(u,time,phase,amp){
  const p=at(u);
  const shift=amp*(.75*Math.sin(TAU*3*u+time*.73+phase)+.25*Math.sin(TAU*7*u-time*.43+phase*1.6));
  return{x:p.x+p.nx*shift,y:p.y+p.ny*shift};
 }
 function thread(time,phase,amp,color,halo){
  ctx.save();ctx.globalCompositeOperation='lighter';
  ctx.beginPath();
  for(let i=0;i<=320;i++){
   const p=wave(i/320,time,phase,amp);
   if(!i)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  }
  ctx.closePath();ctx.strokeStyle=halo;ctx.globalAlpha=.11;
  ctx.lineWidth=1.8;ctx.shadowColor=halo;ctx.shadowBlur=2.1;ctx.stroke();
  ctx.globalAlpha=.48;ctx.strokeStyle=color;ctx.shadowBlur=.35;
  ctx.lineWidth=.54;ctx.stroke();ctx.restore();
 }
 // Éclats dégradés sans tirets visibles : intensité fondue aux extrémités.
 function streak(time,o){
  const center=o.offset+o.direction*time/o.period;
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  const segments=64;
  for(let i=0;i<segments;i++){
   const a=(i/segments-.5)*o.span,b=((i+1)/segments-.5)*o.span;
   const k=Math.pow(Math.sin(PI*(i+.5)/segments),1.65);
   const p1=wave(center+a,time,o.phase,o.amp),p2=wave(center+b,time,o.phase,o.amp);
   ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);
   ctx.lineWidth=o.width*(.57+.43*k);ctx.globalAlpha=o.alpha*k;
   ctx.strokeStyle=o.color;ctx.shadowColor=o.halo;ctx.shadowBlur=o.blur;ctx.stroke();
  }
  ctx.restore();
 }
 function draw(t){
  if(!w||!h)measure();if(!w||!h)return;
  ctx.clearRect(0,0,w,h);
  // Filaments fins et continus, jamais de contour CSS uniforme.
  thread(t,.2,.72,'#77bfee','rgba(29,105,223,.70)');
  thread(t,2.4,.92,'#66d8bb','rgba(8,151,126,.68)');
  thread(t,4.1,.69,'#e2f8ff','rgba(140,220,249,.58)');
  // Cœurs blancs moins brûlés, traînées bleue et émeraude en sens opposés.
  streak(t,{offset:.10,direction:1,period:7.8,span:.31,phase:.2,amp:.72,color:'#8bc6ff',halo:'#246fe1',blur:2.6,width:1.0,alpha:.72});
  streak(t,{offset:.115,direction:1,period:7.8,span:.22,phase:4.1,amp:.69,color:'#f5fcff',halo:'#c8ecff',blur:1.5,width:.74,alpha:.88});
  streak(t,{offset:.66,direction:-1,period:10.4,span:.30,phase:2.4,amp:.92,color:'#b0f8dd',halo:'#11ae8e',blur:2.4,width:.98,alpha:.73});
  // Rubis en touches très courtes : coloris rouge profond, sans halo étendu.
  streak(t,{offset:.38,direction:-1,period:12.7,span:.12,phase:2.4,amp:.92,color:'#e3587a',halo:'#a81845',blur:2.3,width:.78,alpha:.55});
  streak(t,{offset:.83,direction:1,period:16.2,span:.065,phase:.2,amp:.72,color:'#f1a3b4',halo:'#95153d',blur:1.7,width:.52,alpha:.37});
 }
 function enabled(){
  return !document.hidden&&!overlay.hidden&&overlay.dataset.state==='scanning'&&!motion?.matches&&guide.getClientRects().length>0;
 }
 function loop(now){
  if(!running)return;
  if(now-last>=33){last=now;draw(now/1000);}
  raf=requestAnimationFrame(loop);
 }
 function sync(){
  if(enabled()){
   measure();
   if(!running){running=true;last=0;raf=requestAnimationFrame(loop);}
  }else{
   running=false;if(raf)cancelAnimationFrame(raf);raf=0;
   if(!overlay.hidden&&guide.getClientRects().length){measure();draw(0);}
  }
 }
 new MutationObserver(sync).observe(overlay,{attributes:true,attributeFilter:['hidden','data-state']});
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('pagehide',()=>{running=false;if(raf)cancelAnimationFrame(raf);raf=0;});
 window.addEventListener('resize',sync,{passive:true});
 if(motion?.addEventListener)motion.addEventListener('change',sync);
 else motion?.addListener?.(sync);
 if(window.ResizeObserver)new ResizeObserver(()=>{measure();if(!running)sync();}).observe(guide);
 sync();
})();