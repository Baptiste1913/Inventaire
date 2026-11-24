/* Inventaires U 42.86 — chrome : logo compact et validation du doublon.
   Les réflexions se déplacent, jamais la géométrie du viseur. Aucun accès OCR. */
(()=>{
 'use strict';
 for(const overlay of [document.getElementById('iuWeighScanOverlay'),document.getElementById('iuGeminiCameraShell'),document.getElementById('iuGeminiGrossChrome'),document.getElementById('iuGeminiOuterChrome'),document.getElementById('iuGeminiLoadingChrome'),document.getElementById('iuGeminiAIChrome'),document.getElementById('iuGeminiDuplicateAccept'),document.getElementById('iuGeminiRepairApply')]){
 if(!overlay)continue;
 // Même trajectoire et mêmes fibres lumineuses pour le poids OCR et
 // pour le pourtour de l'étiquette DIGI, sans dupliquer l'animation.
 const isDuplicate=overlay.id==='iuGeminiDuplicateAccept';
 const duplicateDialog=isDuplicate?document.getElementById('iuGeminiDuplicateConfirm'):null;
 const isRepair=overlay.id==='iuGeminiRepairApply';
 const repairPanel=isRepair?document.getElementById('iuGeminiRepair'):null;
 const repairManual=isRepair?document.getElementById('iuGeminiRepairManual'):null;
 const isGross=overlay.id==='iuGeminiGrossChrome'||isDuplicate||isRepair;
 const isOuter=overlay.id==='iuGeminiOuterChrome';
 const isBackdrop=overlay.id==='iuGeminiBackdropChrome';
 const isLoader=overlay.id==='iuGeminiLoadingChrome';
 const loaderShell=isLoader?document.getElementById('iuGeminiCameraShell'):null;
 const isLogo=overlay.id==='iuGeminiAIChrome';
 const isRing=isLoader||isLogo;
 const isPanelChrome=isGross||isOuter||isBackdrop||isRing;
 const isGemini=isPanelChrome||overlay.id==='iuGeminiCameraShell';
 const contourBoost=0;
 const backdropWidthScale=.82;
 const loaderWidthScale=isRing?1.6:1;
 const guide=isBackdrop||isOuter||isRing?overlay.parentElement:isGross?overlay:overlay.querySelector(isGemini
   ?'.iu-gemini-camera-exact-guide':'.iu-weigh-scan-guide');
 const canvas=isBackdrop||isOuter||isRing?overlay:guide?.querySelector('.iu-weight-light');
 if(!overlay||!guide||!canvas||typeof Path2D==='undefined')continue;
 const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
 if(!ctx)return;
 const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const TWO_PI=Math.PI*2;
 const COUNT=1280;
 let width=0,height=0,renderScale=0;
 let lanes=[],chromeOuterLines=[],logoInnerLines=[],running=false,request=0,lastTick=0,lastPaint=0,elapsed=0;
 let inViewport=true,lastVisibilityCheck=0;
 let motionPaths=[],openPoints=null;
 const laneSpecs=[[.28,.37],[2.35,.58],[4.5,.22],[1.42,.49],[5.32,.30],[3.82,.41],[.94,.26],[2.93,.34],[5.81,.23]];
 function wrap(u){return ((u%1)+1)%1;}
 // Contour arrondi à paramétrisation par longueur d'arc réelle :
 // les déplacements restent continus, y compris dans les quatre coins.
 function basePoint(u){
  if(isBackdrop&&openPoints)return openPoint(u);
  if(isRing){
   const angle=wrap(u)*TWO_PI-Math.PI/2,r=Math.min(width,height)/2-(isLogo?7:6);
   const nx=Math.cos(angle),ny=Math.sin(angle);
   return {x:width/2+r*nx,y:height/2+r*ny,nx,ny};
  }
  const inset=isOuter?1.8:isGemini?6:7;
  const left=inset,top=inset,right=width-inset,bottom=height-inset;
  const r=Math.max(2,Math.min(isOuter?19:isGross?12:isGemini?7:9,(right-left)/5,(bottom-top)/3));
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
 // Open paths are sampled from the original SVG curves. Their animated
 // screen matrices preserve the old placement and the three CSS motions.
 function openPoint(u){
  u=Math.max(0,Math.min(1,u));
  const n=openPoints.length-1,k=Math.max(0,Math.min(n-1,Math.floor(u*n)));
  const a=openPoints[k],b=openPoints[k+1],fraction=u*n-k;
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
  return {x:a.x+dx*fraction,y:a.y+dy*fraction,nx:dy/len,ny:-dx/len};
 }
 // Original path positions and motion poses, evaluated on one clock.
 const backdropMotion=[
  {seconds:17,delay:3,keys:[[0,-.09,-.18,1.06,.88],[.4,.12,.23,1.12,1.18],[.75,-.06,.08,1.03,.96],[1,-.09,-.18,1.06,.88]]},
  {seconds:23,delay:12,keys:[[0,.11,.16,1.07,1],[.38,-.13,-.22,1.12,.88],[.73,.04,.27,1.04,1.15],[1,.11,.16,1.07,1]]},
  {seconds:29,delay:7,keys:[[0,-.11,.17,1.07,.94],[.5,.12,-.29,1.12,1.18],[1,-.11,.17,1.07,.94]]}
 ];
 function sampleMotionPaths(){
  const svg=guide.querySelector('.iu-gemini-chrome-backdrop');
  if(!svg)return [];
  return Array.from(svg.querySelectorAll('g.iu-chrome-flow-a,g.iu-chrome-flow-b,g.iu-chrome-flow-c')).map((group,index)=>{
   const path=group.querySelector('path');
   if(!path||!path.getTotalLength||!path.getPointAtLength)return null;
   const len=path.getTotalLength();
   if(!Number.isFinite(len)||len<=0)return null;
   const local=Array.from({length:129},(_,i)=>{const p=path.getPointAtLength(len*i/128);return{x:p.x/340,y:p.y/260};});
   const xs=local.map(p=>p.x),ys=local.map(p=>p.y);
   const box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
   return {index,local,box,loose:[],inner:[],next:null,nextInner:null};
  }).filter(Boolean);
 }
 function motionPose(t,index){
  const cfg=backdropMotion[index],p=wrap((t+cfg.delay)/cfg.seconds);
  let i=0;while(i<cfg.keys.length-2&&p>cfg.keys[i+1][0])i++;
  const a=cfg.keys[i],b=cfg.keys[i+1];
  const q=Math.max(0,Math.min(1,(p-a[0])/(b[0]-a[0])));
  const ease=q*q*(3-2*q);
  return a.slice(1).map((v,k)=>v+(b[k+1]-v)*ease);
 }
 function projectMotion(motion,t){
  const [tx,ty,sx,sy]=motionPose(t,motion.index),b=motion.box;
  const cx=b.x+b.w/2,cy=b.y+b.h/2;
  const pts=motion.local.map(p=>({x:(cx+(p.x-cx)*sx+tx*b.w)*width,
   y:(cy+(p.y-cy)*sy+ty*b.h)*height}));
  {
   // Chaque branche traverse les côtés du canvas avant le clip du résultat.
   // Prolonger les tangentes évite la coupure prématurée et les plats.
   const first=pts[0],next=pts[1],last=pts[pts.length-1],prev=pts[pts.length-2];
   const left=Math.min(-12,first.x-4),right=Math.max(width+12,last.x+4);
   const slope=(a,b)=>Math.abs(b.x-a.x)>.001?(b.y-a.y)/(b.x-a.x):0;
   pts.unshift({x:left,y:first.y+(left-first.x)*slope(first,next)});
   pts.push({x:right,y:last.y+(right-last.x)*slope(prev,last)});
   if(motion.index===2){
    const maxY=Math.max(...pts.map(p=>p.y));
    // Plafond doux du bas seulement, sans déformer les courbes.
    const d=maxY-(height-8),shift=(d+Math.sqrt(d*d+16))/2;
    for(const p of pts)p.y-=shift;
   }
  }
  return pts;
 }
 function lanePoint(u,phase,amplitude,outset=0){
  const p=basePoint(u);
  const d=amplitude*(.77*Math.sin(TWO_PI*3*u+phase)+.23*Math.sin(TWO_PI*7*u-phase*.4))+outset;
  return {x:p.x+p.nx*d,y:p.y+p.ny*d};
 }
 function buildLane(phase,amplitude,outset=0){
  const points=[];
  const line=new Path2D();
  const count=isBackdrop?129:COUNT;
  for(let i=0;i<count;i++){
   const u=i/(isBackdrop?count-1:count);
   const p=basePoint(u);
   // Une très légère ondulation fixée une seule fois : ni déformation
   // ni saut à chaque image. Fréquences entières => boucle fermée.
   const displacement=amplitude*(.77*Math.sin(TWO_PI*3*u+phase)+
      .23*Math.sin(TWO_PI*7*u-phase*.4));
   const x=p.x+p.nx*(displacement+outset),y=p.y+p.ny*(displacement+outset);
   points.push({x,y});
   if(i===0)line.moveTo(x,y);else line.lineTo(x,y);
  }
  if(!isBackdrop)line.closePath();
  return {points,line};
 }
 function point(u,laneIndex){
  if(isBackdrop)return lanePoint(u,...laneSpecs[laneIndex]);
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
     canvas.width===pxW&&canvas.height===pxH&&(isBackdrop?motionPaths.length===3:lanes.length===9))return true;
  const geometryChanged=w!==width||h!==height||lanes.length!==9;
  width=w;height=h;renderScale=scale;
  if(canvas.width!==pxW)canvas.width=pxW;
  if(canvas.height!==pxH)canvas.height=pxH;
  ctx.setTransform(pxW/w,0,0,pxH/h,0,0);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  if(isBackdrop){if(!motionPaths.length)motionPaths=sampleMotionPaths();return motionPaths.length>0;}
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
   if(isGemini)chromeOuterLines=[buildLane(.28,.37,.06).line,buildLane(2.35,.58,.04).line,buildLane(1.42,.49,.03).line];
   if(isLogo)logoInnerLines=logoInnerSpecs.map(spec=>buildLane(...spec).line);
  }
  return true;
 }
 // Width profile for background strands only; the three perimeter
 // animations keep their original thickness. No change in opacity.
 function centreThickness(u){return 1-.30*Math.pow(Math.sin(Math.PI*Math.max(0,Math.min(1,u))),2);}
 function backgroundBaseShape(laneIndex,widthPx,outset){
  const [phase,amp]=laneSpecs[laneIndex],shape=new Path2D(),points=[];
  for(let i=0;i<=128;i++){
   const u=i/128,p=lanePoint(u,phase,amp,outset),n=basePoint(u);
   const r=widthPx*centreThickness(u)/2;
   points.push({x:p.x,y:p.y,nx:n.nx,ny:n.ny,r});
   const x=p.x+n.nx*r,y=p.y+n.ny*r;
   if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  for(let i=points.length-1;i>=0;i--){const p=points[i];shape.lineTo(p.x-p.nx*p.r,p.y-p.ny*p.r);}
  shape.closePath();return shape;
 }
 function baseFilament(laneIndex,alpha,widthPx,color='#f0f5f7',line=null){
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle=color;
  ctx.lineJoin='round';
  ctx.lineWidth=widthPx*loaderWidthScale*(isLogo?.85:1)+contourBoost;
  ctx.globalAlpha=alpha;
  if(isBackdrop){ctx.fillStyle=color;ctx.fill(backgroundBaseShape(laneIndex,widthPx*backdropWidthScale,laneIndex===0?.06:laneIndex===1?.04:.03));}
  else ctx.stroke(line||lanes[laneIndex].line);
  ctx.restore();
 }
 // Les anciens reflets étaient assemblés par ~60 petits strokes séparés
 // avec extrémités carrées : joints visibles à l'échelle Retina.
 // Un ruban est maintenant UN chemin fermé antialiasé, d'épaisseur variable,
 // effilé naturellement aux deux extrémités, sans ligne segmentée.
 function reflectionCenter(t,config){
  const raw=config.start+config.direction*t/config.seconds;
  // Leave the open curve entirely before returning to its other end.
  return isBackdrop?wrap((raw+config.span/2)/(1+config.span))*(1+config.span)-config.span/2:wrap(raw);
 }
 function endFade(u){return isBackdrop?Math.max(0,Math.min(1,u/.035,(1-u)/.035)):1;}
 function ribbonGeometry(t,config){
  const center=reflectionCenter(t,config);
  const samples=config.samples||192;
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
   const envelope=Math.pow(Math.max(0,Math.sin(Math.PI*s)),1.65)*endFade(u)*(isBackdrop?centreThickness(u):1);
   // Detached fibres peel away gently and return, with no discontinuity.
   const drift=(config.drift||0)*Math.pow(Math.sin(Math.PI*s),2)*
    (.68+.32*Math.sin(TWO_PI*s*1.4+t*.7+(config.start||0)*TWO_PI));
   positions.push({x:p.x-ty*drift,y:p.y+tx*drift,nx:-ty,ny:tx,envelope});
  }
  return positions;
 }
 // Enlarge only the inward side of the original logo ribbons. Radial
 // displacement is independent of the orientation of each path normal.
 function logoRibbonVertex(p,offset,innerExtra){
  let x=p.x+p.nx*offset,y=p.y+p.ny*offset;
  const dx=width/2-p.x,dy=height/2-p.y,length=Math.hypot(dx,dy)||1;
  if(isLogo&&innerExtra&&offset*(p.nx*dx+p.ny*dy)>0){
   const add=innerExtra*p.envelope;
   x+=dx/length*add;y+=dy/length*add;
  }
  return {x,y};
 }
 function drawRibbon(points,widthPx,color,opacity,blur,blend='screen',outset=0,innerExtra=0){
  if(isBackdrop){widthPx*=backdropWidthScale;outset*=backdropWidthScale;blur*=.8;}
  if(isRing){widthPx*=loaderWidthScale;outset*=loaderWidthScale;}
  if(isLogo){widthPx*=.85;innerExtra*=.85;}
  const shape=new Path2D();
  for(let i=0;i<points.length;i++){
   const p=points[i];
   const radius=(widthPx+contourBoost)*p.envelope/2;
   // Clockwise main ribbons have inward normals: shift only added width outward.
   const offset=radius-outset*p.envelope;
   const {x,y}=logoRibbonVertex(p,offset,innerExtra);
   if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  for(let i=points.length-1;i>=0;i--){
   const p=points[i],radius=(widthPx+contourBoost)*p.envelope/2;
   const offset=radius+outset*p.envelope;
   const v=logoRibbonVertex(p,-offset,innerExtra);
   shape.lineTo(v.x,v.y);
  }
  shape.closePath();
  ctx.save();
  ctx.globalCompositeOperation=blend;
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
  // Uniquement sur le contour IA, renforcer la saturation de la
  // couleur sans augmenter l'épaisseur géométrique des filaments.
  drawRibbon(ribbon,2.25,config.tint,
    config.opacity*(isGemini?.69:.27),isGemini?3.1:2.3);
  drawRibbon(ribbon,.86,config.core,
    config.opacity*(isGemini?.95:.81),.55);
 }
 // Chrome is confined to the Gemini viewfinder. Dark reflections require
 // source-over, not screen (which would make black disappear).
 const chromeReflections=[
  {lane:0,start:.07,direction:1,seconds:10.2,span:.26,tint:'#a7a7a7',core:'#eeeeee',opacity:.90},
  {lane:1,start:.62,direction:-1,seconds:12.3,span:.23,tint:'#555555',core:'#292929',opacity:.72,dark:true},
  {lane:2,start:.34,direction:1,seconds:17.1,span:.14,tint:'#888888',core:'#bcbcbc',opacity:.82},
  {lane:3,start:.11,direction:-1,seconds:13.8,span:.17,tint:'#bdbdbd',core:'#fafafa',opacity:.92},
  {lane:5,start:.48,direction:1,seconds:15.4,span:.18,tint:'#444444',core:'#1b1b1b',opacity:.56,dark:true},
  {lane:6,start:.79,direction:-1,seconds:18.6,span:.16,tint:'#767676',core:'#d8d8d8',opacity:.81}
 ];
 // Transient local waves: no recurring orbit, independent random lifetimes.
 const waveShades=['#f2f2f2','#e7e7e7','#d6d6d6','#c4c4c4','#b3b3b3',
  '#a1a1a1','#909090','#7f7f7f','#6c6c6c','#595959','#464646','#343434','#232323'];
 const MAX_WAVES=6;
 let looseFibres=[],nextWaveAt=null;
 const range=(min,max)=>min+(max-min)*Math.random();
 function spawnWave(t){
  return {born:t,life:range(1.25,3.2),center:Math.random(),
   lane:Math.floor(range(0,9)),span:isBackdrop?range(.045,.10):range(.027,.072),amplitude:isBackdrop?range(3.2,6.2):range(.85,2.2),
   phase:range(0,TWO_PI),cycles:range(1.0,1.65),frequency:range(.65,1.3),
   travel:range(-.018,.018),width:isBackdrop?range(.34,.56):range(.26,.48),opacity:isBackdrop?range(.32,.55):range(.16,.34),
   shade:waveShades[Math.floor(range(0,waveShades.length))]};
 }
 function advanceWaves(t){
  looseFibres=looseFibres.filter(w=>t-w.born<w.life);
  if(nextWaveAt===null)nextWaveAt=t+range(.08,.4);
  if(t<nextWaveAt)return;
  if(looseFibres.length<MAX_WAVES)looseFibres.push(spawnWave(t));
  // Occasionally a longer lull; no catch-up burst after a suspended tab.
  nextWaveAt=t+(Math.random()<.13?range(.95,1.7):range(.24,.66));
 }
 function waveShape(t,w){
  const age=Math.max(0,Math.min(1,(t-w.born)/w.life));
  const lifeEnvelope=Math.pow(Math.sin(Math.PI*age),1.35);
  const center=isBackdrop?w.center+w.travel*Math.sin(Math.PI*age):wrap(w.center+w.travel*Math.sin(Math.PI*age));
  const span=w.span*(.42+.58*lifeEnvelope);
  const positions=[],samples=56;
  for(let i=0;i<=samples;i++){
   const s=i/samples,u=center+(s-.5)*span;
   const p=point(u,w.lane),normal=basePoint(u);
   const envelope=Math.pow(Math.sin(Math.PI*s),1.7)*endFade(u)*(isBackdrop?centreThickness(u):1);
   // Signed normal displacement: crosses the contour in BOTH directions.
   // Spatial and temporal waves blend; the ends remain attached.
   const oscillation=.72*Math.sin(TWO_PI*(w.cycles*age+w.frequency*s)+w.phase)
     +.28*Math.sin(TWO_PI*(.7*age+1.6*s)-w.phase);
   const drift=w.amplitude*lifeEnvelope*envelope*oscillation;
   positions.push({x:p.x+normal.nx*drift,y:p.y+normal.ny*drift,
    nx:normal.nx,ny:normal.ny,envelope});
  }
  return {positions,lifeEnvelope,center,span};
 }
 function paintWaves(t){
  if(reduceMotion?.matches)return;
  advanceWaves(t);
  for(const w of looseFibres){
   const shape=waveShape(t,w);
   if(shape.lifeEnvelope<.012)continue;
   drawRibbon(shape.positions,w.width*(.55+.45*shape.lifeEnvelope),w.shade,
    w.opacity*shape.lifeEnvelope,.32,'source-over');
  }
 }
 // Long local inner reflections, independent of short crossing waves.
 const MAX_INNER_WAVES=4;
 let innerWaves=[],nextInnerWaveAt=null;
 function spawnInnerWave(t){
  return {born:t,life:range(1.8,4.2),center:Math.random(),span:range(.10,.22),
   amplitude:isBackdrop?range(2.2,4.4):range(.5,1.4),phase:range(0,TWO_PI),cycles:range(.7,1.2),
   frequency:range(.45,.9),travel:range(-.012,.012),width:isBackdrop?range(.30,.50):range(.24,.42),
   opacity:isBackdrop?range(.25,.43):range(.10,.22),shade:waveShades[Math.floor(range(0,waveShades.length))],
   side:isBackdrop&&Math.random()<.5?-1:1};
 }
 function advanceInnerWaves(t){
  innerWaves=innerWaves.filter(w=>t-w.born<w.life);
  if(nextInnerWaveAt===null)nextInnerWaveAt=t+range(.12,.55);
  if(t<nextInnerWaveAt)return;
  if(innerWaves.length<MAX_INNER_WAVES)innerWaves.push(spawnInnerWave(t));
  nextInnerWaveAt=t+(Math.random()<.18?range(.9,1.5):range(.35,.8));
 }
 function innerWaveShape(t,w){
  const age=Math.max(0,Math.min(1,(t-w.born)/w.life));
  const lifeEnvelope=Math.pow(Math.sin(Math.PI*age),1.2);
  const center=isBackdrop?w.center+w.travel*Math.sin(Math.PI*age):wrap(w.center+w.travel*Math.sin(Math.PI*age));
  const span=w.span*(.45+.55*lifeEnvelope),positions=[],samples=84;
  // Stay within the perimeter gutter; closest internal rectangle starts
  // at 2% of guide height (barcode/total bottom).
  const safeDepth=isBackdrop?5.0:isPanelChrome?2.0:Math.max(0,Math.min(2.0,(height-12)*.02-.55));
  for(let i=0;i<=samples;i++){
   const s=i/samples,u=center+(s-.5)*span,p=basePoint(u);
   const envelope=Math.pow(Math.sin(Math.PI*s),1.45)*endFade(u)*(isBackdrop?centreThickness(u):1);
   const oscillation=.76*Math.sin(TWO_PI*(w.cycles*age+w.frequency*s)+w.phase)
    +.24*Math.sin(TWO_PI*(.5*age+1.25*s)-w.phase);
   const depth=Math.min(safeDepth,(.42+w.amplitude*(.55+.45*oscillation)))*lifeEnvelope*envelope;
   const side=isBackdrop?w.side:1;
   positions.push({x:p.x-p.nx*depth*side,y:p.y-p.ny*depth*side,nx:p.nx,ny:p.ny,envelope});
  }
  return {positions,lifeEnvelope,center,span,safeDepth};
 }
 function paintInnerWaves(t){
  if(reduceMotion?.matches)return;
  advanceInnerWaves(t);
  for(const w of innerWaves){
   const shape=innerWaveShape(t,w);
   if(shape.lifeEnvelope<.01||shape.safeDepth<.35)continue;
   drawRibbon(shape.positions,w.width*(.65+.35*shape.lifeEnvelope),w.shade,
    w.opacity*shape.lifeEnvelope,.28,'source-over');
  }
 }
 function resetWaves(){
  looseFibres=[];nextWaveAt=null;innerWaves=[];nextInnerWaveAt=null;
  if(isBackdrop)for(const p of motionPaths){p.loose=[];p.inner=[];p.next=null;p.nextInner=null;}
 }
 function paintChrome(t){
  // A single animated contour, made of thin overlapping metal fibres;
  // the gentle breathing keeps the full perimeter legible on light/dark paper.
  baseFilament(0,.35+.045*Math.sin(t*.9),1.02,'#303030',chromeOuterLines[0]);
  baseFilament(1,.62+.065*Math.sin(t*.73+1.4),.76,'#dedede',chromeOuterLines[1]);
  baseFilament(3,.34+.04*Math.sin(t*.61+2),.54,'#898989',chromeOuterLines[2]);
  for(const config of chromeReflections){
   // At a 12px ring, overlapping diffuse highlights flatten the metal.
   // Shorter arcs and tighter halos preserve distinct dark/light fibres;
   // the width multiplier, palette, opacity and animation clock stay intact.
   const ribbon=ribbonGeometry(t,isLogo?{...config,span:config.span*.85}:config);
   drawRibbon(ribbon,2.15,config.tint,config.opacity*.44,isLogo?.65:1.5,'source-over',.125,isLogo?.55*logoBreath(t,config.lane):0);
   drawRibbon(ribbon,.95,config.core,config.opacity,isLogo?.18:.35,'source-over',.05,isLogo?.35*logoBreath(t,config.lane):0);
  }
  if(isLogo)paintLogoInner(t);
  if(running){paintWaves(t);paintInnerWaves(t);}
 }
 // Three extra nested fibres and three independently moving reflections.
 // Cached paths and 64 samples on these tiny arcs limit the extra work.
 const logoInnerReflections=[
  {lane:4,start:.22,direction:1,seconds:11.6,span:.16,samples:48,tint:'#696969',core:'#e5e5e5',opacity:.76,depth:1.25},
  {lane:7,start:.70,direction:-1,seconds:14.7,span:.14,samples:48,tint:'#aeaeae',core:'#343434',opacity:.65,depth:1.85},
  {lane:8,start:.43,direction:1,seconds:16.9,span:.18,samples:48,tint:'#777777',core:'#f2f2f2',opacity:.78,depth:2.35},
  {lane:2,start:.91,direction:-1,seconds:19.2,span:.14,samples:48,tint:'#929292',core:'#ededed',opacity:.68,depth:2.06},
  {lane:6,start:.56,direction:1,seconds:21.4,span:.15,samples:48,tint:'#656565',core:'#bcbcbc',opacity:.72,depth:2.52}
 ];
 // Slow, phase-shifted breathing; never changes the external edge.
 function logoBreath(t,index){
  const period=18+(index%5)*3;
  return 1+.13*Math.sin(TWO_PI*t/period+index*1.7);
 }
 const logoInnerSpecs=[[.94,.24,-.60],[3.82,.25,-1.00],[5.81,.20,-1.38],[2.35,.18,-1.74],[4.50,.16,-2.02]];
 function logoJoinCenter(t,index){
  return wrap(.12+index*.29+.035*Math.sin(TWO_PI*t/(24+index*5)+index*1.4));
 }
 function logoJoinWeight(u,t,index){
  const center=logoJoinCenter(t,index);
  const distance=c=>Math.abs(wrap(u-c+.5)-.5);
  const d=Math.min(distance(center),distance(center+.5));
  return d>=.135?0:.5+.5*Math.cos(Math.PI*d/.135);
 }
 function logoLinkedPoint(u,t,index){
  if(index<0)return lanePoint(u,1.42,.49,.03);
  const own=lanePoint(u,...logoInnerSpecs[index]);
  const join=logoJoinWeight(u,t,index);
  if(!join)return own;
  const parent=logoLinkedPoint(u,t,index-1);
  return {x:own.x+(parent.x-own.x)*join,y:own.y+(parent.y-own.y)*join};
 }
 function linkedLogoPath(t,index){
  const path=new Path2D();
  for(let i=0;i<96;i++){
   const p=logoLinkedPoint(i/96,t,index);
   if(!i)path.moveTo(p.x,p.y);else path.lineTo(p.x,p.y);
  }
  path.closePath();return path;
 }
 function linkedLogoRibbon(t,config,index){
  const center=reflectionCenter(t,config),samples=config.samples||64,points=[];
  for(let i=0;i<=samples;i++){
   const s=i/samples,u=center+(s-.5)*config.span;
   const p=logoLinkedPoint(u,t,index),a=logoLinkedPoint(u-.0005,t,index),b=logoLinkedPoint(u+.0005,t,index);
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   points.push({...p,nx:-dy/len,ny:dx/len,envelope:Math.pow(Math.max(0,Math.sin(Math.PI*s)),1.65)});
  }
  return points;
 }
 function paintLogoInner(t){
  const phase=reduceMotion?.matches?0:t;
  baseFilament(6,.44,.38*logoBreath(phase,6),'#777777',linkedLogoPath(phase,0));
  baseFilament(5,.56,.34*logoBreath(phase,5),'#d6d6d6',linkedLogoPath(phase,1));
  baseFilament(8,.36,.30*logoBreath(phase,8),'#555555',linkedLogoPath(phase,2));
  baseFilament(2,.42,.30*logoBreath(phase,2),'#b3b3b3',linkedLogoPath(phase,3));
  baseFilament(6,.40,.28*logoBreath(phase,4),'#777777',linkedLogoPath(phase,4));
  for(const [index,config] of logoInnerReflections.entries()){
   const ribbon=linkedLogoRibbon(phase,config,index),breath=logoBreath(phase,index+3);
   drawRibbon(ribbon,.72*breath,config.tint,config.opacity*.48,.24,'source-over');
   drawRibbon(ribbon,.38*breath,config.core,config.opacity,.10,'source-over');
  }
 }
 // Confiner les filaments au résultat sans modifier leur trajectoire
 // ni déplacer le canvas derrière le verre. Rayon CSS du panneau : 20 px.
 function backdropClipRect(panel,bounds){
  const sx=width/bounds.width,sy=height/bounds.height;
  const w=panel.width,h=panel.height;
  const radius=Math.min(20,w/2,h/2);
  return {x:(panel.left-bounds.left)*sx,y:(panel.top-bounds.top)*sy,
   w:w*sx,h:h*sy,rx:radius*sx,ry:radius*sy};
 }
 function clipBackdrop(){
  const panel=document.getElementById('iuGeminiLabelPanel');
  if(!panel||panel.hidden||!ctx.clip)return false;
  const bounds=canvas.getBoundingClientRect(),box=panel.getBoundingClientRect();
  if(!bounds.width||!bounds.height||box.width<=0||box.height<=0)return false;
  const {x,y,w,h,rx,ry}=backdropClipRect(box,bounds);
  const clip=new Path2D(),k=.5522847498307936,R=x+w,B=y+h;
  // Coins arrondis alignés sur le panneau de résultat.
  clip.moveTo(x+rx,y);clip.lineTo(R-rx,y);
  clip.bezierCurveTo(R-rx+k*rx,y,R,y+ry-k*ry,R,y+ry);
  clip.lineTo(R,B-ry);clip.bezierCurveTo(R,B-ry+k*ry,R-rx+k*rx,B,R-rx,B);
  clip.lineTo(x+rx,B);clip.bezierCurveTo(x+rx-k*rx,B,x,B-ry+k*ry,x,B-ry);
  clip.lineTo(x,y+ry);clip.bezierCurveTo(x,y+ry-k*ry,x+rx-k*rx,y,x+rx,y);clip.closePath();
  ctx.clip(clip);return true;
 }
 function paintBackdrop(t){
  ctx.save();if(!clipBackdrop()){ctx.restore();return;}
  for(const motion of motionPaths){
   openPoints=projectMotion(motion,t);
   looseFibres=motion.loose;innerWaves=motion.inner;nextWaveAt=motion.next;nextInnerWaveAt=motion.nextInner;
   // Même moteur et palette, fibres de fond affinées ; chaque branche
   // possède ses propres courtes et longues ramifications aléatoires.
   paintChrome(t);
   motion.loose=looseFibres;motion.inner=innerWaves;motion.next=nextWaveAt;motion.nextInner=nextInnerWaveAt;
  }
  openPoints=null;ctx.restore();
 }
 function paint(t){
  if(!width||!height)return;
  ctx.clearRect(0,0,width,height);
  if(isBackdrop){paintBackdrop(t);return;}
  if(isGemini){paintChrome(t);return;}
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
  return !document.hidden&&!overlay.hidden&&(!isDuplicate||duplicateDialog?.hidden===false)&&(!isRepair||(repairPanel?.hidden===false&&repairManual?.hidden===false))&&
    (isLoader?loaderShell?.dataset.state==='analyzing'&&inViewport:isPanelChrome?inViewport:overlay.dataset.state==='scanning')&&!reduceMotion?.matches&&
    guide.getClientRects().length>0;
 }
 function frame(now){
  if(!running)return;
  if(isPanelChrome&&now-lastVisibilityCheck>=250){
   lastVisibilityCheck=now;
   if(!isActive()){sync();return;}
  }
  if(lastTick){
   // Évite une téléportation du reflet après une longue frame OCR,
   // une suspension Safari ou une baisse de FPS.
   elapsed+=Math.min(48,Math.max(0,now-lastTick))/1000*(isLoader?2:1);
  }
  lastTick=now;
  // Avoid two full-rate canvases while the camera is also scanning.
  const analyzing=document.getElementById('iuGeminiCameraShell')?.dataset.state==='analyzing';
  const interval=analyzing&&!isLoader&&(isOuter||isGross||isLogo)?64:isLogo?15:isBackdrop||isOuter||(isGross&&document.getElementById('iuGeminiCameraShell')?.dataset.state==='scanning')?32:16;
  if(now-lastPaint>=interval){
   lastPaint=now;
   paint(elapsed);
  }
  request=window.requestAnimationFrame(frame);
 }
 function sync(){
  if(isActive()){
   if(!measure())return;
   if(!running){
    running=true;lastTick=0;lastPaint=0;lastVisibilityCheck=0;
    request=window.requestAnimationFrame(frame);
   }
  }else{
   running=false;
   if(isGemini&&!isBackdrop)resetWaves();
   if(request)window.cancelAnimationFrame(request);
   request=0;lastTick=0;
   if(!document.hidden&&!overlay.hidden&&(!isDuplicate||duplicateDialog?.hidden===false)&&(!isRepair||(repairPanel?.hidden===false&&repairManual?.hidden===false))&&(!isLoader||loaderShell?.dataset.state==='analyzing')&&(!isPanelChrome||inViewport)&&guide.getClientRects().length&&measure())paint(elapsed);
  }
 }
 const visibilityObserver=new MutationObserver(sync);
 visibilityObserver.observe(overlay,{attributes:true,attributeFilter:['hidden','data-state']});
 if(loaderShell)visibilityObserver.observe(loaderShell,{attributes:true,attributeFilter:['hidden','data-state']});
 if(duplicateDialog)visibilityObserver.observe(duplicateDialog,{attributes:true,attributeFilter:['hidden']});
 if(repairPanel)visibilityObserver.observe(repairPanel,{attributes:true,attributeFilter:['hidden']});
 if(repairManual)visibilityObserver.observe(repairManual,{attributes:true,attributeFilter:['hidden']});
 if(isPanelChrome){
  const section=document.getElementById('iuGeminiLab');
  if(section&&section!==overlay)visibilityObserver.observe(section,{attributes:true,attributeFilter:['hidden','class','data-scan-state','style']});
  const result=document.getElementById('iuGeminiEmptyResult');
  if(result)visibilityObserver.observe(result,{attributes:true,attributeFilter:['hidden','class','style']});
  if(window.IntersectionObserver)new window.IntersectionObserver(entries=>{
   inViewport=entries[0]?.isIntersecting===true;sync();
  }).observe(guide);
 }
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);
 window.addEventListener('pagehide',()=>{running=false;if(isGemini&&!isBackdrop)resetWaves();if(request)window.cancelAnimationFrame(request);request=0;lastTick=0;});
 window.addEventListener('resize',()=>{measure();sync();},{passive:true});
 // Le zoom par pincement n'émet pas forcément window.resize sur iOS.
 // La surface est rééchantillonnée uniquement quand son niveau change.
 if(window.visualViewport){
  window.visualViewport.addEventListener('resize',()=>{measure();sync();},{passive:true});
 }
 if(reduceMotion?.addEventListener)reduceMotion.addEventListener('change',sync);
 else reduceMotion?.addListener?.(sync);
 if(window.ResizeObserver)new window.ResizeObserver(()=>{
  // Recalcule uniquement si la taille CSS change vraiment.
  if(isPanelChrome){sync();}else if(guide.getClientRects().length){measure();if(!running)paint(elapsed);}
 }).observe(guide);
 sync();
 }
})();