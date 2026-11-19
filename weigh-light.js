/* V41.04 — rubans optiques en traits continus, lissage haute définition.
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
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
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
 // Trait lumineux dessiné en UN seul chemin, sans les 64 mini-segments
 // qui produisaient des petites cassures et des taches sur Safari iOS.
 function streak(time,o){
  const center=o.offset+o.direction*time/o.period;
  const first=center-o.span/2,last=center+o.span/2;
  const p0=wave(first,time,o.phase,o.amp);
  const p1=wave(last,time,o.phase,o.amp);
  const mid=wave(center,time,o.phase,o.amp);
  let dx=p1.x-p0.x,dy=p1.y-p0.y;
  // Près d'un angle, prévenir un dégradé de longueur presque nulle.
  if(dx*dx+dy*dy<25){
   const before=wave(center-.035,time,o.phase,o.amp);
   const after=wave(center+.035,time,o.phase,o.amp);
   dx=after.x-before.x;dy=after.y-before.y;
  }
  const pStart=dx*dx+dy*dy>=25?p0:{x:mid.x-dx*2,y:mid.y-dy*2};
  const pEnd=dx*dx+dy*dy>=25?p1:{x:mid.x+dx*2,y:mid.y+dy*2};
  const gradient=ctx.createLinearGradient(pStart.x,pStart.y,pEnd.x,pEnd.y);
  gradient.addColorStop(0,'rgba(0,0,0,0)');
  gradient.addColorStop(.13,o.edge);
  gradient.addColorStop(.30,o.color);
  gradient.addColorStop(.46,o.core);
  gradient.addColorStop(.57,o.core);
  gradient.addColorStop(.73,o.color);
  gradient.addColorStop(.90,o.edge);
  gradient.addColorStop(1,'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation='screen';
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();
  const samples=112;
  for(let i=0;i<=samples;i++){
   const p=wave(first+(last-first)*i/samples,time,o.phase,o.amp);
   if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);
  }
  // Diffusion très localisée, puis cœur continu ultrafin.
  ctx.strokeStyle=gradient;
  ctx.globalAlpha=o.alpha*.54;
  ctx.lineWidth=o.width*2.15;
  ctx.shadowColor=o.halo;
  ctx.shadowBlur=o.blur;
  ctx.stroke();
  ctx.globalAlpha=o.alpha;
  ctx.lineWidth=o.width*.83;
  ctx.shadowBlur=.35;
  ctx.stroke();
  ctx.restore();
 }
 function draw(t){
  if(!w||!h)measure();if(!w||!h)return;
  ctx.clearRect(0,0,w,h);
  // Trois fibres ultrafines : bleue, émeraude et nacrée.
  thread(t,.2,.72,'#80c0ec','rgba(29,100,207,.68)');
  thread(t,2.4,.92,'#65d4b8','rgba(11,142,120,.62)');
  thread(t,4.1,.69,'#e6f9ff','rgba(148,217,250,.52)');
  // Reflets continus, sans raccords entre segments ni effet de pointillés.
  streak(t,{offset:.10,direction:1,period:7.8,span:.285,phase:.2,amp:.72,
   color:'#6eaef3',core:'#cfedff',edge:'rgba(66,137,225,.16)',halo:'#246fe1',blur:2.8,width:1.06,alpha:.87});
  streak(t,{offset:.115,direction:1,period:7.8,span:.17,phase:4.1,amp:.69,
   color:'#d5f3ff',core:'#ffffff',edge:'rgba(205,245,255,.08)',halo:'#aee5ff',blur:1.8,width:.82,alpha:.93});
  streak(t,{offset:.66,direction:-1,period:10.4,span:.27,phase:2.4,amp:.92,
   color:'#63d7b5',core:'#d5fff2',edge:'rgba(25,151,124,.11)',halo:'#0fa989',blur:2.5,width:1.02,alpha:.84});
  // Notes rubis discrètes mais identifiables dans la matière lumineuse.
  streak(t,{offset:.38,direction:-1,period:12.7,span:.105,phase:2.4,amp:.92,
   color:'#b82e55',core:'#e77993',edge:'rgba(142,26,60,.08)',halo:'#8e163d',blur:2.1,width:.79,alpha:.63});
  streak(t,{offset:.83,direction:1,period:16.2,span:.06,phase:.2,amp:.72,
   color:'#c84a70',core:'#f4afbf',edge:'rgba(157,26,70,.06)',halo:'#881738',blur:1.6,width:.56,alpha:.43});
 }
 function enabled(){
  return !document.hidden&&!overlay.hidden&&overlay.dataset.state==='scanning'&&!motion?.matches&&guide.getClientRects().length>0;
 }
 function loop(now){
  if(!running)return;
  if(now-last>=22){last=now;draw(now/1000);}
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