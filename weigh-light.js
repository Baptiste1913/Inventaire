/* Inventaires U 41.05 — optical silk: tracé stable, lumières progressives.
   Les réflexions se déplacent, jamais la géométrie du viseur. Aucun accès OCR. */
(()=>{
 'use strict';
 const overlay=document.getElementById('iuWeighScanOverlay');
 const guide=overlay?.querySelector('.iu-weigh-scan-guide');
 const canvas=guide?.querySelector('.iu-weight-light');
 if(!overlay||!guide||!canvas||typeof Path2D==='undefined')return;
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)return;
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const TWO_PI=Math.PI*2;
 const COUNT=480;
 let width=0,height=0;
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
  // Évite de recréer les pixels du canvas pour des variations fractionnaires
  // de layout : cela causait des scintillements visibles sur Safari.
  if(w===width&&h===height&&lanes.length)return true;
  width=w;height=h;
  const dpr=Math.min(3,window.devicePixelRatio||1);
  const pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(canvas.width!==pw)canvas.width=pw;
  if(canvas.height!==ph)canvas.height=ph;
  ctx.setTransform(pw/w,0,0,ph/h,0,0);
  ctx.imageSmoothingEnabled=true;
  lanes=[buildLane(.28,.37),buildLane(2.35,.58),buildLane(4.5,.22)];
  return true;
 }
 function baseFilament(laneIndex,alpha,widthPx){
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle='#f0f5f7';
  ctx.lineJoin='round';
  ctx.lineWidth=widthPx;
  ctx.globalAlpha=alpha;
  ctx.stroke(lanes[laneIndex].line);
  ctx.restore();
 }
 // Éclat local à enveloppe continue, sans dégradé directionnel :
 // aucun retournement brutal lorsque la lumière traverse un angle.
 function illuminate(t,config){
  const position=wrap(config.start+config.direction*t/config.seconds);
  const radius=config.span/2,steps=60;
  for(let pass=0;pass<2;pass++){
   ctx.save();
   ctx.globalCompositeOperation='screen';
   ctx.strokeStyle=pass?config.core:config.tint;
   ctx.shadowColor=config.tint;
   ctx.shadowBlur=pass?.5:2.2;
   ctx.lineWidth=pass?.68:1.65;
   ctx.lineCap='butt';
   for(let i=0;i<steps;i++){
    const normalized=(i+.5)/steps;
    const intensity=Math.pow(Math.max(0,Math.sin(Math.PI*normalized)),2.8);
    if(intensity<.004)continue;
    const u0=position-radius+(i/steps)*config.span;
    const u1=position-radius+((i+1)/steps)*config.span;
    const p=point(u0,config.lane),q=point(u1,config.lane);
    ctx.globalAlpha=config.opacity*intensity*(pass?.92:.27);
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
    ctx.lineTo(q.x,q.y);
    ctx.stroke();
   }
   ctx.restore();
  }
 }
 function paint(t){
  if(!width||!height)return;
  ctx.clearRect(0,0,width,height);
  // 80–85 % monochrome : deux fins fils nacrés, un troisième reflet.
  baseFilament(0,.60,.72);
  baseFilament(1,.30,.52);
  baseFilament(2,.17,.38);
  // Les couleurs n'apparaissent que dans des vagues mobiles discrètes.
  illuminate(t,{lane:0,start:.07,direction:1,seconds:10.2,span:.23,
    tint:'#72bfff',core:'#f5fbff',opacity:.87});
  illuminate(t,{lane:1,start:.62,direction:-1,seconds:12.3,span:.17,
    tint:'#35cba6',core:'#e4fff5',opacity:.79});
  illuminate(t,{lane:2,start:.34,direction:1,seconds:17.1,span:.072,
    tint:'#b72850',core:'#f2c0cd',opacity:.44});
  // Court éclat blanc qui croise les reflets colorés.
  illuminate(t,{lane:2,start:.11,direction:-1,seconds:13.8,span:.115,
    tint:'#d6e9f3',core:'#ffffff',opacity:.68});
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
 window.addEventListener('resize',()=>{width=height=0;lanes=[];sync();},{passive:true});
 if(reduceMotion?.addEventListener)reduceMotion.addEventListener('change',sync);
 else reduceMotion?.addListener?.(sync);
 if(window.ResizeObserver)new ResizeObserver(()=>{
  // Recalcule uniquement si la taille CSS change vraiment.
  if(guide.getClientRects().length){measure();if(!running)paint(elapsed);}
 }).observe(guide);
 sync();
})();