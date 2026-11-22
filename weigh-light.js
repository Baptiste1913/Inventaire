/* Inventaires U 41.88 — deux filaments anthracite sous les fibres nacrées.
   Les réflexions se déplacent, jamais la géométrie du viseur. Aucun accès OCR. */
(()=>{
 'use strict';
 for(const overlay of [document.getElementById('iuWeighScanOverlay'),document.getElementById('iuGeminiCameraShell')]){
 if(!overlay)continue;
 // Même trajectoire et mêmes fibres lumineuses pour le poids OCR et
 // pour le pourtour de l'étiquette DIGI, sans dupliquer l'animation.
 const isGemini=overlay.id==='iuGeminiCameraShell';
 const contourBoost=isGemini?1:0; // +1 px seulement autour de l'étiquette IA
 const guide=overlay?.querySelector(isGemini
   ?'.iu-gemini-camera-exact-guide':'.iu-weigh-scan-guide');
 const canvas=guide?.querySelector('.iu-weight-light');
 if(!overlay||!guide||!canvas||typeof Path2D==='undefined')continue;
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)return;
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const TWO_PI=Math.PI*2;
 const COUNT=1280;
 let width=0,height=0,renderScale=0;
 let lanes=[],running=false,request=0,lastTick=0,lastPaint=0,elapsed=0;
 function wrap(u){return ((u%1)+1)%1;}
 // Contour arrondi à paramétrisation par longueur d'arc réelle :
 // les déplacements restent continus, y compris dans les quatre coins.
 function basePoint(u){
  const left=7,top=7,right=width-7,bottom=height-7;
  const r=Math.max(2,Math.min(9,(right-left)/5,(bottom-top)/3));
  const horizontal=Math.max(1,right-left-2*r);
  const vertical=Math.max(1,bottom-top-2*r);
  const arc=Math.PI*r/2;
  let d=wrap(u)*(horizontal*2+vertical*2+arc*4);
  const corner=(x,y,angle)=>({x:x+r*Math.cos(angle),y:y+r*Math.sin(angle),
     nx:Math.cos(angle),ny:Math.sin(angle)});
  if(d<horizontal)return{x:left+r+d,y:top,nx:0,ny:-1};
  d-=horizontal;
  if(d<arc)return corner(right-r,top+r,-Math.PI/2+d/r);
  d-=arc;
  if(d<vertical)return{x:right,y:top+r+d,nx:1,ny:0};
  d-=vertical;
  if(d<arc)return corner(right-r,bottom-r,d/r);
  d-=arc;
  if(d<horizontal)return{x:right-r-d,y:bottom,nx:0,ny:1};
  d-=horizontal;
  if(d<arc)return corner(left+r,bottom-r,Math.PI/2+d/r);
  d-=arc;
  if(d<vertical)return{x:left,y:bottom-r-d,nx:-1,ny:0};
  d-=vertical;
  return corner(left+r,top+r,Math.PI+d/r);
 }
 function buildLane(phase,amplitude){
  const points=[];
  const line=new Path2D();
  for(let i=0;i<COUNT;i++){
   const u=i/COUNT;
   const p=basePoint(u);
   // Une très légère ondulation fixée une seule fois : ni déformation
   // ni saut à chaque image. Fréquences entières => boucle fermée.
   const displacement=amplitude*(.77*Math.sin(TWO_PI*3*u+phase)+
      .23*Math.sin(TWO_PI*7*u-phase*.4));
   const x=p.x+p.nx*displacement,y=p.y+p.ny*displacement;
   points.push({x,y});
   if(i===0)line.moveTo(x,y);else line.lineTo(x,y);
  }
  line.closePath();
  return {points,line};
 }
 function point(u,laneIndex){
  const a=wrap(u)*COUNT;
  const i=Math.floor(a),frac=a-i;
  const lane=lanes[laneIndex].points;
  const p=lane[i],q=lane[(i+1)%COUNT];
  return {x:p.x+(q.x-p.x)*frac,y:p.y+(q.y-p.y)*frac};
 }
 function measure(){
  const bounds=canvas.getBoundingClientRect();
  const w=Math.round(bounds.width),h=Math.round(bounds.height);
  if(w<20||h<15){width=height=0;return false;}
  // Respecter la densité native ET le zoom réel de Safari. Un canvas
  // limité au DPR=3 était agrandi et apparaissait crénelé au pincement.
  const zoom=Math.max(1,window.visualViewport?.scale||1);
  const requested=Math.min(5.5,(window.devicePixelRatio||1)*zoom);
  // Paliers de demi-pixel pour éviter de réallouer le bitmap en permanence
  // pendant le geste de zoom, sans perdre la finesse à l'arrêt.
  const scale=Math.max(1,Math.min(5.5,
   Math.ceil(requested*2)/2,
   Math.sqrt(1800000/(w*h))
  ));
  const pxW=Math.round(w*scale),pxH=Math.round(h*scale);
  if(width===w&&height===h&&renderScale===scale&&
     canvas.width===pxW&&canvas.height===pxH&&lanes.length===9)return true;
  const geometryChanged=w!==width||h!==height||lanes.length!==9;
  width=w;height=h;renderScale=scale;
  if(canvas.width!==pxW)canvas.width=pxW;
  if(canvas.height!==pxH)canvas.height=pxH;
  ctx.setTransform(pxW/w,0,0,pxH/h,0,0);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  if(geometryChanged){
   lanes=[
    buildLane(.28,.37),
    buildLane(2.35,.58),
    buildLane(4.5,.22),
    buildLane(1.42,.49),
    buildLane(5.32,.30),
    buildLane(3.82,.41),
    buildLane(.94,.26),
    buildLane(2.93,.34),
    buildLane(5.81,.23)
   ];
  }
  return true;
 }
 function baseFilament(laneIndex,alpha,widthPx,color='#f0f5f7'){
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle=color;
  ctx.lineJoin='round';
  ctx.lineWidth=widthPx+contourBoost;
  ctx.globalAlpha=alpha;
  ctx.stroke(lanes[laneIndex].line);
  ctx.restore();
 }
 // Les anciens reflets étaient assemblés par ~60 petits strokes séparés
 // avec extrémités carrées : joints visibles à l'échelle Retina.
 // Un ruban est maintenant UN chemin fermé antialiasé, d'épaisseur variable,
 // effilé naturellement aux deux extrémités, sans ligne segmentée.
 function ribbonGeometry(t,config){
  const center=wrap(config.start+config.direction*t/config.seconds);
  const samples=192;
  const positions=[];
  const epsilon=1/(COUNT*2);
  for(let i=0;i<=samples;i++){
   const s=i/samples;
   const u=center+(s-.5)*config.span;
   const p=point(u,config.lane);
   const prev=point(u-epsilon,config.lane);
   const next=point(u+epsilon,config.lane);
   let tx=next.x-prev.x,ty=next.y-prev.y;
   const magnitude=Math.hypot(tx,ty)||1;
   tx/=magnitude;ty/=magnitude;
   // La largeur évolue progressivement : aucune césure lumineuse.
   const envelope=Math.pow(Math.max(0,Math.sin(Math.PI*s)),1.65);
   positions.push({x:p.x,y:p.y,nx:-ty,ny:tx,envelope});
  }
  return positions;
 }
 function drawRibbon(points,widthPx,color,opacity,blur){
  const shape=new Path2D();
  for(let i=0;i<points.length;i++){
   const p=points[i];
   const radius=(widthPx+contourBoost)*p.envelope/2;
   const x=p.x+p.nx*radius,y=p.y+p.ny*radius;
   if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  for(let i=points.length-1;i>=0;i--){
   const p=points[i],radius=(widthPx+contourBoost)*p.envelope/2;
   shape.lineTo(p.x-p.nx*radius,p.y-p.ny*radius);
  }
  shape.closePath();
  ctx.save();
  ctx.globalCompositeOperation='screen';
  ctx.globalAlpha=opacity;
  ctx.fillStyle=color;
  ctx.shadowColor=color;
  ctx.shadowBlur=blur;
  ctx.fill(shape);
  ctx.restore();
 }
 function illuminate(t,config){
  const ribbon=ribbonGeometry(t,config);
  // Halo coloré feutré + centre nacré ultra-fin : deux formes continues.
  // Limiter le flou aux pixels proches du repère.
  drawRibbon(ribbon,2.25,config.tint,config.opacity*.27,2.3);
  drawRibbon(ribbon,.86,config.core,config.opacity*.81,.55);
 }
 function paint(t){
  if(!width||!height)return;
  ctx.clearRect(0,0,width,height);
  // Deux fibres anthracite sous la nacre : contraste subtil lorsque
  // l'étiquette est claire. Tracés animés inchangés, aucun bord statique.
  baseFilament(0,.22,.92,'rgba(12,16,20,.85)');
  baseFilament(3,.16,.72,'rgba(18,22,28,.72)');
  // Neuf fibres claires, toujours dominantes sur le contour.
  baseFilament(0,.56,.74,'#f0f5f7');
  baseFilament(1,.32,.56,'#eef4f6');
  baseFilament(2,.18,.40,'#edf3f5');
  baseFilament(3,.22,.36,'#eef5f7');
  baseFilament(4,.17,.30,'#eff4f6');
  baseFilament(5,.12,.24,'#eef3f5');
  baseFilament(6,.09,.20,'#edf2f4');
  baseFilament(7,.10,.23,'#eef4f6');
  baseFilament(8,.08,.19,'#edf2f4');
  // Palette Gemini : bleu, violet, rose, corail/or pâle.
  // Cette branche est exclusivement dédiée au gabarit IA ; l'OCR
  // classique conserve toutes ses couleurs et largeurs d'origine.
  if(isGemini){
   illuminate(t,{lane:0,start:.07,direction:1,seconds:10.2,span:.25,
     tint:'#4285f4',core:'#dceaff',opacity:.96});
   illuminate(t,{lane:1,start:.62,direction:-1,seconds:12.3,span:.20,
     tint:'#9769d5',core:'#f1dfff',opacity:.91});
   illuminate(t,{lane:2,start:.34,direction:1,seconds:17.1,span:.09,
     tint:'#e66bb8',core:'#ffe1f4',opacity:.72});
   illuminate(t,{lane:2,start:.11,direction:-1,seconds:13.8,span:.13,
     tint:'#f3a36b',core:'#ffefdf',opacity:.64});
   illuminate(t,{lane:5,start:.48,direction:1,seconds:15.4,span:.16,
     tint:'#7582ef',core:'#e4e6ff',opacity:.72});
   illuminate(t,{lane:6,start:.79,direction:-1,seconds:18.6,span:.12,
     tint:'#d786d9',core:'#fcecff',opacity:.65});
   return;
  }
  // Reflets bleu, émeraude et rubis légèrement renforcés.
  illuminate(t,{lane:0,start:.07,direction:1,seconds:10.2,span:.25,
    tint:'#79c7ff',core:'#f6fbff',opacity:.94});
  illuminate(t,{lane:1,start:.62,direction:-1,seconds:12.3,span:.20,
    tint:'#44d4ae',core:'#ebfff7',opacity:.88});
  illuminate(t,{lane:2,start:.34,direction:1,seconds:17.1,span:.09,
    tint:'#c4315b',core:'#f5c6d3',opacity:.56});
  illuminate(t,{lane:2,start:.11,direction:-1,seconds:13.8,span:.13,
    tint:'#dcecf5',core:'#ffffff',opacity:.72});
  // Nouveaux reflets diffus : filaments animés sans rupture de tracé.
  illuminate(t,{lane:5,start:.48,direction:1,seconds:15.4,span:.16,
    tint:'#55b8ff',core:'#e8f6ff',opacity:.62});
  illuminate(t,{lane:6,start:.79,direction:-1,seconds:18.6,span:.12,
    tint:'#59dcb8',core:'#ecfff8',opacity:.54});
 }
 function isActive(){
  return !document.hidden&&!overlay.hidden&&
    overlay.dataset.state==='scanning'&&!reduceMotion?.matches&&
    guide.getClientRects().length>0;
 }
 function frame(now){
  if(!running)return;
  if(lastTick){
   // Évite une téléportation du reflet après une longue frame OCR,
   // une suspension Safari ou une baisse de FPS.
   elapsed+=Math.min(48,Math.max(0,now-lastTick))/1000;
  }
  lastTick=now;
  if(now-lastPaint>=16){
   lastPaint=now;
   paint(elapsed);
  }
  request=window.requestAnimationFrame(frame);
 }
 function sync(){
  if(isActive()){
   if(!measure())return;
   if(!running){
    running=true;lastTick=0;lastPaint=0;
    request=window.requestAnimationFrame(frame);
   }
  }else{
   running=false;
   if(request)window.cancelAnimationFrame(request);
   request=0;lastTick=0;
   if(!overlay.hidden&&guide.getClientRects().length&&measure())paint(elapsed);
  }
 }
 new MutationObserver(sync).observe(overlay,{
  attributes:true,attributeFilter:['hidden','data-state']
 });
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('pagehide',()=>{running=false;if(request)cancelAnimationFrame(request);request=0;lastTick=0;});
 window.addEventListener('resize',()=>{measure();sync();},{passive:true});
 // Le zoom par pincement n'émet pas forcément window.resize sur iOS.
 // La surface est rééchantillonnée uniquement quand son niveau change.
 if(window.visualViewport){
  window.visualViewport.addEventListener('resize',()=>{measure();sync();},{passive:true});
 }
 if(reduceMotion?.addEventListener)reduceMotion.addEventListener('change',sync);
 else reduceMotion?.addListener?.(sync);
 if(window.ResizeObserver)new ResizeObserver(()=>{
  // Recalcule uniquement si la taille CSS change vraiment.
  if(guide.getClientRects().length){measure();if(!running)paint(elapsed);}
 }).observe(guide);
 sync();
 }
})();