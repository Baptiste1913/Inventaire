'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('weigh-light.js','utf8');
function run(id,reduce=false){
 const paints=[],frames=[],events={};let requests=0;
 class Path{moveTo(){}lineTo(){}closePath(){}}
 const ctx={save(){},restore(){},clearRect(){},setTransform(){},
  stroke(){paints.push({color:this.strokeStyle,mode:this.globalCompositeOperation,alpha:this.globalAlpha});},
  fill(){paints.push({color:this.fillStyle,mode:this.globalCompositeOperation,alpha:this.globalAlpha});}};
 const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:212,height:172})};
 const guide={querySelector:()=>canvas,getClientRects:()=>[{}]};
 const overlay={id,parentElement:guide,hidden:false,getContext:()=>ctx,getBoundingClientRect:()=>({width:212,height:172}),dataset:{state:id==='iuGeminiGrossChrome'?'idle':'scanning'},querySelector:()=>id==='iuGeminiGrossChrome'||id==='iuGeminiLab'?canvas:guide,getClientRects:()=>[{}]};
 const document={hidden:false,getElementById:k=>k===id?overlay:null,addEventListener:(k,fn)=>{events[k]=fn;}};
 const window={devicePixelRatio:3,matchMedia:()=>({matches:reduce}),addEventListener(){},
  requestAnimationFrame:fn=>{frames.push(fn);return ++requests;},cancelAnimationFrame(){}};
 class Observer{constructor(fn){this.fn=fn}observe(){}}
 new Function('document','window','Path2D','MutationObserver','cancelAnimationFrame',source)(document,window,Path,Observer,()=>{});
 if(!reduce){assert.equal(frames.length,1);frames.shift()(100);assert.equal(frames.length,1);}
 return {paints,frames,requests};
}
const gemini=run('iuGeminiCameraShell');
const grey=c=>/^#[0-9a-f]{6}$/i.test(c)&&c.slice(1,3)===c.slice(3,5)&&c.slice(3,5)===c.slice(5,7);
assert(gemini.paints.length>=15);
assert(gemini.paints.every(p=>grey(p.color)&&p.mode==='source-over'));
assert(gemini.paints.some(p=>p.color==='#1b1b1b'));
assert(gemini.paints.some(p=>p.color==='#fafafa'));
assert(gemini.paints.every(p=>Number.isFinite(p.alpha)&&p.alpha>=0&&p.alpha<=1));
const gross=run('iuGeminiGrossChrome');
assert(gross.paints.length>=15);
assert(gross.paints.every(p=>grey(p.color)&&p.mode==='source-over'));
assert.deepEqual(gross.paints,gemini.paints,'Même palette et couches Chrome au démarrage');
const grossReduced=run('iuGeminiGrossChrome',true);
assert.equal(grossReduced.requests,0);assert(grossReduced.paints.length>=15);
const classic=run('iuWeighScanOverlay');
assert(classic.paints.some(p=>p.color==='#79c7ff'&&p.mode==='screen'));
assert(classic.paints.some(p=>p.color==='#44d4ae'));
const reduced=run('iuGeminiCameraShell',true);
assert.equal(reduced.requests,0);assert(reduced.paints.length>0);
assert(source.includes('MAX_WAVES=6')&&source.includes('advanceWaves(t)'));
assert(source.includes('if(isGemini){paintChrome(t);return;}'));
const css=fs.readFileSync('gemini-lab.css','utf8');
const outer=css.slice(css.indexOf('/* v42.55'));
assert(outer.includes('> .iu-gemini-outline-label {'));
assert(outer.includes('border:0!important;')&&outer.includes('outline:0!important;'));
assert(!css.includes('data-aligned="true"] .iu-gemini-outline-label{border-color:rgba(155,243,198'));
for(const file of ['index.html','sw.js'])assert(fs.readFileSync(file,'utf8').includes('weigh-light.js?v=42.82'));
// Inspect the real wave lifecycle with seeded randomness and a mocked canvas.
// The debug hook exists only in this test's local copy.
let state=42;
const seeded=Object.create(Math);
seeded.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
let api;
class TestPath{moveTo(){}lineTo(){}closePath(){}}
const ctx={save(){},restore(){},stroke(){},fill(){},clearRect(){},setTransform(){}};
const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:212,height:172})};
const guide={querySelector:()=>canvas,getClientRects:()=>[{}]};
const overlay={id:'iuGeminiCameraShell',hidden:false,dataset:{state:'scanning'},querySelector:()=>guide};
const doc={hidden:false,getElementById:k=>k===overlay.id?overlay:null,addEventListener(){}};
const win={devicePixelRatio:3,matchMedia:()=>({matches:false}),addEventListener(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){}};
class Observer{observe(){}}
const instrument=source.replace(' sync();\n }\n})();',' sync();\n if(isGemini)inspect({advanceWaves,waveShape,spawnWave,point,basePoint,wrap,active:()=>looseFibres,shades:waveShades,advanceInnerWaves,innerWaveShape,spawnInnerWave,inner:()=>innerWaves,resetWaves});\n }\n})();');
new Function('document','window','Path2D','MutationObserver','Math','inspect',instrument)(doc,win,TestPath,Observer,seeded,x=>{api=x});
assert(api);assert.equal(api.shades.length,13);assert(api.shades.every(grey));
let peak=0,births=new Set(),colors=new Set(),locations=new Set(),inside=false,outside=false;
for(let i=0;i<1600;i++){
 const t=i*.025;api.advanceWaves(t);
 for(const w of api.active()){
  births.add(w.born);colors.add(w.shade);locations.add(w.center);
  assert(w.width<=.48&&w.opacity<=.34&&w.amplitude<=2.2);
  const age=(t-w.born)/w.life;
  if(age<.15||age>.85)continue;
  const sh=api.waveShape(t,w),p=sh.positions[28],b=api.point(sh.center,w.lane),n=api.basePoint(sh.center);
  const displacement=(p.x-b.x)*n.nx+(p.y-b.y)*n.ny;
  if(displacement>.1)outside=true;if(displacement<-.1)inside=true;
 }
 peak=Math.max(peak,api.active().length);
}
assert(peak<=6&&peak>=2);assert(births.size>30);assert(locations.size===births.size);
assert(colors.size>=9);assert(inside&&outside);
const wave=api.spawnWave(50),birth=api.waveShape(50,wave),middle=api.waveShape(50+wave.life/2,wave),end=api.waveShape(50+wave.life,wave);
assert(birth.lifeEnvelope<1e-8&&end.lifeEnvelope<1e-8);
assert(middle.span>birth.span&&middle.span>end.span);
api.advanceWaves(200);assert(api.active().length<=1,'Pas de rattrapage en rafale');
console.log('OK : chrome monochrome, cycle aléatoire, vagues bidirectionnelles, mouvement réduit, OCR classique préservé');

let longPeak=0,longBirths=new Set(),deepest=0;
for(let i=0;i<1600;i++){
 const now=i*.025;api.advanceInnerWaves(now);
 longPeak=Math.max(longPeak,api.inner().length);
 for(const w of api.inner()){
  longBirths.add(w.born);
  assert(w.span>=.10&&w.span<=.22&&w.width<=.42&&w.opacity<=.22);
  const shape=api.innerWaveShape(now,w);
  for(const j of [0,21,42,63,84]){
   const u=shape.center+(j/84-.5)*shape.span,b=api.basePoint(u),p=shape.positions[j];
   const d=(p.x-b.x)*b.nx+(p.y-b.y)*b.ny;
   assert(d<=1e-8&&d>=-shape.safeDepth-1e-8);
   deepest=Math.max(deepest,-d);
  }
 }
}
assert(longPeak>=2&&longPeak<=4);assert(longBirths.size>25);assert(deepest>.5);
const long=api.spawnInnerWave(50),first=api.innerWaveShape(50,long),mid=api.innerWaveShape(50+long.life/2,long),last=api.innerWaveShape(50+long.life,long);
assert(first.lifeEnvelope<1e-8&&last.lifeEnvelope<1e-8&&mid.span>first.span);
api.resetWaves();assert.equal(api.inner().length,0);assert.equal(api.active().length,0);
assert(source.includes("2.15,config.tint,config.opacity*.44,1.5,'source-over',.125"));
assert(source.includes(".95,config.core,config.opacity,.35,'source-over',.05"));
const update=css.slice(css.indexOf('/* v42.57'));
assert(update.includes('opacity:.22!important;'));
assert(update.includes('box-shadow:0 0 0 100vmax rgba(0,0,0,.38)!important;'));
assert(update.includes('background:transparent!important;'));
assert(update.includes('[data-state="scanning"]'));
assert(update.includes('overflow:hidden!important;'));
console.log('OK : longues fibres internes bornées, épaisseur extérieure et voile transparent au centre');

const grossStyle=css.slice(css.indexOf('/* v42.59'));
assert(grossStyle.includes('height:62px!important;'));
assert(grossStyle.includes('min-height:62px!important;')&&grossStyle.includes('max-height:62px!important;'));
assert(grossStyle.includes('button#iuGeminiNext'));
assert(grossStyle.includes('font-size:clamp(30px,8.2vw,35px)!important;'));
assert(grossStyle.includes('content:none!important;'));
assert(grossStyle.includes('pointer-events:none!important;'));
assert(fs.readFileSync('index.html','utf8').includes('id="iuGeminiGrossChrome"><canvas class="iu-weight-light iu-gemini-gross-light" aria-hidden="true">'));
assert(source.includes('new window.IntersectionObserver'));
assert(source.includes('isGross?12:isGemini?7:9'));
console.log('OK : même moteur chrome pour le poids, hauteur commune, typographie et mouvement réduit');

const refColor=fs.readFileSync('result-card.css','utf8').match(/\.iu-result-weights > span \{[^}]*?color:(#[0-9a-f]{6})!important;/i)[1];
const caption=grossStyle.match(/#iuGeminiGrossChrome\.iu-gemini-gross-panel > span \{([^}]+)\}/)[1];
assert(caption.includes('color:'+refColor+'!important;'));
assert(caption.includes('-webkit-text-fill-color:'+refColor+'!important;'));
assert(caption.includes('font-size:11px!important;'));
assert(grossStyle.includes('font-weight:1000!important;'));
assert(grossStyle.includes('-webkit-text-stroke:.42px currentColor!important;'));
assert(grossStyle.includes('padding-block:4px!important;'));
assert(11*1.2+35+2+8<=62,'La typographie tient dans la hauteur conservée');
console.log('OK : teinte classique exacte, hiérarchie typographique renforcée et hauteur conservée');

const chromeHalos=css.slice(css.indexOf('/* Reflets diffus argent/acier'),css.indexOf('/* result-card.css applique'));
const palette=[...chromeHalos.matchAll(/rgba\((\d+),(\d+),(\d+),[^)]+\)/g)];
assert(palette.length===12&&palette.every(m=>m[1]===m[2]&&m[2]===m[3]));
assert(!chromeHalos.includes('iuHomeBackdrop'));
const backdrop=css.slice(css.indexOf('/* v42.65'));
assert(backdrop.includes('opacity:.94!important;'));
assert(backdrop.includes('prefers-reduced-motion:reduce'));
assert(backdrop.includes('prefers-reduced-transparency:reduce'));
assert(backdrop.includes('pointer-events:none!important;'));
const markup=fs.readFileSync('index.html','utf8');
const waves=markup.match(/<svg class="iu-gemini-chrome-backdrop"[\s\S]*?<\/svg>/g);
assert.equal(waves.length,1);
assert(markup.indexOf(waves[0])<markup.indexOf('id="iuGeminiLabelPanel"'));
const shades=[...waves[0].matchAll(/stop-color="#([0-9a-f]{6})"/g)];
assert(shades.length>=8&&shades.every(m=>grey('#'+m[1])));
for(const n of ['A','B','C'])assert(backdrop.includes('@keyframes iuChromeFlow'+n));
console.log('OK : fond DIGI monochrome, trois vagues, accessibilité, typographie');

assert(markup.indexOf(waves[0])<markup.indexOf('id="iuGeminiLabelPanel"'),'SVG frère du panneau');
assert(backdrop.includes('> .iu-gemini-label-shell > svg.iu-gemini-chrome-backdrop'));
assert(backdrop.includes('inset:-26px -24px!important;'));
assert(backdrop.includes('width:calc(100% + 48px)!important;height:calc(100% + 52px)!important;'));
assert(backdrop.includes('overflow:visible!important;'));
assert(backdrop.includes('overflow:hidden!important;'));
assert(backdrop.includes('contain:paint!important;'));
assert(backdrop.includes('z-index:0!important;'));
assert(backdrop.includes('opacity:.43!important;'));
assert(!css.includes('rgba(92,121,147,.104)'));
assert(css.includes('rgba(92,121,147,.062)'));
assert(backdrop.includes('-webkit-backdrop-filter:none!important;'));
assert(backdrop.includes('filter:none!important;'));
assert(backdrop.includes('translate(12%,23%)'));
assert(backdrop.includes('translate(-13%,-22%)'));
assert(backdrop.includes('translate(12%,-29%)'));
console.log('OK : débordement du panneau uniquement, amplitude et points renforcés');

{
const haloSource=fs.readFileSync('gemini-chrome-halos.js','utf8');
const haloNodes=Array.from({length:4},()=>({style:{},animations:[],animate(frames,opts){
 const a={frames,opts,paused:false,cancel(){this.cancelled=true},pause(){this.paused=true},play(){this.paused=false}};
 this.animations.push(a);return a;
}}));
const hooks={};let observer;
const field={querySelectorAll:()=>haloNodes};
const doc={hidden:false,querySelector:()=>field,addEventListener:(k,fn)=>hooks[k]=fn};
const win={matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){}};
class Intersection{constructor(fn){observer=fn;}observe(){}}
new Function('document','window','IntersectionObserver',haloSource)(doc,win,Intersection);
assert(haloNodes.every(n=>n.animations.length===0));
observer([{isIntersecting:true}]);
assert(haloNodes.every(n=>n.animations.length===1));
for(const n of haloNodes){
 const previous=n.animations[0];
 assert(previous.opts.duration>=10500&&previous.opts.duration<=20500);
 previous.onfinish();
 const next=n.animations[1];
 assert.deepEqual(previous.frames[1],next.frames[0],'continuité du mouvement');
 assert(previous.cancelled);
}
doc.hidden=true;hooks.visibilitychange();assert(haloNodes.every(n=>n.animations[1].paused));
doc.hidden=false;hooks.visibilitychange();assert(haloNodes.every(n=>!n.animations[1].paused));
observer([{isIntersecting:false}]);assert(haloNodes.every(n=>n.animations[1].paused));
assert(markup.includes('gemini-chrome-halos.js?v=42.64'));
assert(fs.readFileSync('sw.js','utf8').includes('gemini-chrome-halos.js?v=42.64'));
console.log('OK : halos randomisés, transitions continues, suspension hors écran, cache');
}

{
const groups=[...waves[0].matchAll(/<g class="iu-chrome-flow-[abc]"[\s\S]*?<\/g>/g)];
assert.equal(groups.length,3);
for(const group of groups){
 assert.equal((group[0].match(/class="iu-chrome-strand"/g)||[]).length,6);
 assert.equal((group[0].match(/class="iu-chrome-fine-strand"/g)||[]).length,1);
 assert.equal((group[0].match(/vector-effect="non-scaling-stroke"/g)||[]).length,7);
 assert(group[0].includes('url(#iuDigiChromeShadow)')&&group[0].includes('url(#iuDigiChromePearl)'));
}
assert(!css.includes('rgba(255,255,255,.07) 0%,rgba(255,255,255,.12) 54%'));
assert(chromeHalos.includes('width:52%!important;height:46%!important;'));
assert(chromeHalos.includes('filter:blur(29px)!important;'));
assert(chromeHalos.includes('rgba(87,87,87,0.592)'));
assert(backdrop.includes('opacity:.88!important;'));
assert(backdrop.includes('opacity:.43!important;'),'Opacité de secours conservée');
assert(backdrop.includes('backdrop-filter:none!important;'),'Pas de filtre dynamique Safari');
assert(fs.readFileSync('gemini-chrome-halos.js','utf8').includes('opacity:range(.72,1)'));
console.log('OK : six fibres chromées par vague, voile allégé, halos plus petits et plus lumineux');
}

{
const glassMarkup='<div class="iu-gemini-clear-glass" aria-hidden="true"></div>';
assert(markup.includes(waves[0]+'\n<canvas id="iuGeminiBackdropChrome" class="iu-gemini-backdrop-light" aria-hidden="true"></canvas>\n'+glassMarkup+'\n<div id="iuGeminiLabelPanel"'));
const glassStyle=css.match(/> \.iu-gemini-label-shell > \.iu-gemini-clear-glass \{([^}]+)\}/)[1];
assert(glassStyle.includes('background:rgba(128,128,128,.002)!important;'));
assert(glassStyle.includes('position:absolute!important;'));
assert(glassStyle.includes('inset:0!important;'));
assert(glassStyle.includes('z-index:1!important;'));
assert(css.slice(css.indexOf('/* v42.67')).includes('z-index:2!important;'));
assert(glassStyle.includes('backdrop-filter:blur(1.25px)!important;'));
assert(glassStyle.includes('pointer-events:none!important;'));
assert(glassStyle.includes('overflow:hidden!important;'));
assert(backdrop.includes('background-color:transparent!important;'));
assert(backdrop.includes('-webkit-backdrop-filter:none!important;'));
assert(backdrop.includes('opacity:.94!important;'));
assert(backdrop.includes('prefers-reduced-transparency:reduce'));
assert(markup.includes('gemini-lab.css?v=42.83'));
assert(fs.readFileSync('sw.js','utf8').includes('gemini-lab.css?v=42.83'));
console.log('OK : verre transparent flou séparé, filaments renforcés et accessibilité');
}

assert(css.match(/> \.iu-gemini-label-shell > \.iu-gemini-clear-glass \{([^}]+)\}/)[1].includes('-webkit-backdrop-filter:blur(1.25px)!important;'));


{
const final=css.slice(css.indexOf('/* v42.71'));
assert(final.includes('background-image:none!important;'));
assert(final.includes('opacity:0!important;'));
assert(final.includes('opacity:1!important;'));
assert(final.includes('pointer-events:none!important;'));
assert(!markup.slice(markup.indexOf('id="iuGeminiLabelPanel"'),markup.indexOf('id="iuGeminiEmptyResult"')).includes('iu-welcome-dot-wave'));
assert(!markup.includes('<span class="iu-gemini-frame-gradient"'));
assert(!markup.includes('<span class="iu-gemini-frame-surface"'));
assert(markup.includes('id="iuGeminiOuterChrome" class="iu-gemini-outer-light"'));
assert(fs.readFileSync('gemini-lab.js','utf8').includes("setLabelAlert('success','Étiquette prête • PLU '+proposal.plu+note);"));
assert(source.includes('if(isBackdrop){paintBackdrop(t);return;}'));
const whole=run('iuGeminiOuterChrome');
assert.deepEqual(whole.paints,gross.paints,'Grand contour : mêmes couches que le poids');
const wholeReduced=run('iuGeminiOuterChrome',true);
assert.equal(wholeReduced.requests,0);
assert(wholeReduced.paints.length>=15);
console.log('OK : suppression du quadrillage, contour global chrome partagé et statut PLU');
}

{
 const drawn=[],frames=[],clips=[];let debug;
 class Path{constructor(){this.points=[];}moveTo(x,y){assert(Number.isFinite(x)&&Number.isFinite(y));this.points.push([x,y]);}lineTo(x,y){this.moveTo(x,y);}bezierCurveTo(...args){this.points.push(args);}closePath(){}}
 const ctx={save(){},restore(){},clearRect(){},setTransform(){},stroke(){drawn.push([this.strokeStyle,this.lineWidth,this.globalAlpha]);},fill(){drawn.push([this.fillStyle,null,this.globalAlpha]);},clip(p){clips.push(p.points);}};
 const motion=[0,1,2].map(i=>({getTotalLength:()=>340,getPointAtLength:d=>({x:d,y:70+i*75+10*Math.sin(d/40)}),getScreenCTM:()=>({a:1,b:0,c:0,d:1,e:0,f:0})}));
 const svg={querySelectorAll:()=>motion.map(p=>({querySelector:()=>p}))};
 const guide={querySelector:()=>svg,getClientRects:()=>[{}]};
 const bg={id:'iuGeminiBackdropChrome',parentElement:guide,hidden:false,getContext:()=>ctx,getBoundingClientRect:()=>({width:340,height:260,left:0,top:0})};
 const panel={hidden:false,getBoundingClientRect:()=>({left:24,top:26,width:292,height:208})};
 const outer={getBoundingClientRect:()=>({left:10,top:-100,width:320,height:352})};
 const doc={hidden:false,getElementById:k=>k===bg.id?bg:k==='iuGeminiLabelPanel'?panel:k==='iuGeminiLab'?outer:null,addEventListener(){}};
 const win={devicePixelRatio:2,matchMedia:()=>({matches:false}),addEventListener(){},requestAnimationFrame:fn=>{frames.push(fn);return 1;},cancelAnimationFrame(){}};
 class Observer{observe(){}}
 const instrument=source.replace(' sync();\n }\n})();',' sync();\n if(isBackdrop)inspect({reflectionCenter,endFade,projectMotion,motionPose,ribbonGeometry,openPoint,centreThickness,backdropClipRect,paintBackdrop,backgroundBaseShape,backdropWidthScale,spawnWave,waveShape,spawnInnerWave,innerWaveShape,point,basePoint,paths:()=>motionPaths,setOpen:p=>{openPoints=p;}});\n }\n})();');
 new Function('document','window','Path2D','MutationObserver','inspect',instrument)(doc,win,Path,Observer,x=>{debug=x});
 assert.equal(frames.length,1);frames.shift()(100);
 assert.equal(drawn.length,45);
 for(let i=0;i<3;i++){assert.deepEqual(drawn.slice(i*15,i*15+15),drawn.slice(0,15));}
 assert(drawn.every(p=>grey(p[0])&&p[2]>=0&&p[2]<=1));
 assert.equal(drawn[0][0],'#303030');assert.equal(drawn[1][0],'#dedede');assert.equal(drawn[2][0],'#898989');
 assert.equal(clips.length,1);assert(clips[0].every(p=>p.every(Number.isFinite)));
 assert(debug);
 const config={start:.07,direction:1,seconds:10.2,span:.26,lane:0};
 const local=debug.projectMotion(debug.paths()[0],0);debug.setOpen(local);
 assert.deepEqual(debug.openPoint(-10),debug.openPoint(0));
 assert.deepEqual(debug.openPoint(10),debug.openPoint(1));
 const seam=(1+config.span/2-config.start)*config.seconds;
 const before=debug.ribbonGeometry(seam-.00001,config),after=debug.ribbonGeometry(seam+.00001,config);
 assert(before.every(p=>p.envelope<1e-6)&&after.every(p=>p.envelope<1e-6),'Reflet invisible au raccord');
 for(let time=0;time<90;time+=.13){
  const top=debug.projectMotion(debug.paths()[0],time),middle=debug.projectMotion(debug.paths()[1],time);
  const mean=points=>points.reduce((sum,p)=>sum+p.y,0)/points.length;
  assert(mean(top)<.45*260&&mean(middle)>.35*260,'Placement initial non regroupé');
  const bottom=debug.projectMotion(debug.paths()[2],time);
  assert(bottom.every(p=>Number.isFinite(p.y)&&p.y<=252));
  for(const branch of [top,middle,bottom]){
   assert(branch[0].x<=-12&&branch[branch.length-1].x>=352,'Les trois branches dépassent les limites latérales avant clip');
   const a=branch[0],b=branch[1],c=branch[2],d=branch[branch.length-3],e=branch[branch.length-2],f=branch[branch.length-1];
   const slope=(a,b)=>(b.y-a.y)/(b.x-a.x);
   assert(Math.abs(slope(a,b)-slope(b,c))<1e-8);
   assert(Math.abs(slope(d,e)-slope(e,f))<1e-8);
  }
 }
 for(const [i,seconds,delay] of [[0,17,3],[1,23,12],[2,29,7]]){
  const left=debug.motionPose(seconds-delay-.00001,i),right=debug.motionPose(seconds-delay+.00001,i);
  assert(left.every((x,k)=>Math.abs(x-right[k])<.0001));
 }
 assert.equal(debug.centreThickness(0),1);assert.equal(debug.centreThickness(.5),.7);assert.equal(debug.centreThickness(1),1);
 assert(debug.centreThickness(.25)>.7&&debug.centreThickness(.25)<1);
 const shape=debug.backgroundBaseShape(0,1.02,.06).points;
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 assert(Math.abs(distance(shape[0],shape[257])-1.02)<1e-8);
 assert(Math.abs(distance(shape[64],shape[193])-.714)<1e-8);
 const clip=debug.backdropClipRect(panel.getBoundingClientRect(),bg.getBoundingClientRect());
 for(const [key,expected] of Object.entries({x:24,y:26,w:292,h:208,rx:20,ry:20}))assert(Math.abs(clip[key]-expected)<1e-8,key);
 const coords=clips[0].flat();
 for(let i=0;i<coords.length;i+=2)assert(coords[i]>=24&&coords[i]<=316&&coords[i+1]>=26&&coords[i+1]<=234,'Clip limité au résultat');
 assert(clips[0].some(p=>p.length===6),'Coins cubiques alignés sur le résultat');
 assert(source.includes("document.getElementById('iuGeminiLabelPanel')"));
 assert(css.includes('border-radius:20px!important;'));
 assert.equal(debug.backdropWidthScale,.82);
 for(let time=1;time<=12;time+=.2)debug.paintBackdrop(time);
 for(const branch of debug.paths()){
  assert(branch.loose.length>0&&branch.inner.length>0,'Chaque branche possède ses propres fibres');
  debug.setOpen(debug.projectMotion(branch,5));
  const w={...debug.spawnWave(5),center:.5,span:.1,amplitude:6,phase:Math.PI/2};
  const shape=debug.waveShape(5+w.life/2,w);
  const signed=shape.positions.map((p,i)=>{
   const u=shape.center+(i/56-.5)*shape.span,b=debug.point(u,w.lane),n=debug.basePoint(u);
   return (p.x-b.x)*n.nx+(p.y-b.y)*n.ny;
  });
  assert(signed.some(v=>Math.abs(v)>1),'Une ramification s’écarte de la branche');
  const inner={...debug.spawnInnerWave(5),center:.5,side:-1};
  assert(debug.innerWaveShape(5+inner.life/2,inner).safeDepth===5);
 }
 assert(debug.paths()[0].loose!==debug.paths()[1].loose&&debug.paths()[1].inner!==debug.paths()[2].inner);
 const count=drawn.length;panel.hidden=true;debug.paintBackdrop(1);assert.equal(drawn.length,count,'Pas de dessin hors résultat masqué');
 panel.hidden=false;panel.getBoundingClientRect=()=>({left:24,top:26,width:0,height:0});
 debug.paintBackdrop(2);assert.equal(drawn.length,count,'Pas de dessin si résultat sans dimensions');
 console.log('OK : trajectoires initiales, tangentes continues, clip strict du résultat, largeur variable au centre');
}

assert(css.includes(':not(#iuGeminiOuterChrome) {'));
assert(css.includes('> canvas#iuGeminiOuterChrome.iu-gemini-outer-light {\n position:absolute!important;'));
assert(source.includes('if(isGemini&&!isBackdrop)resetWaves();'));

{
 const paints=[],widths=[],frames=new Map(),observers=[];let req=0,debug;
 class Path{moveTo(x,y){assert(Number.isFinite(x)&&Number.isFinite(y));}lineTo(x,y){this.moveTo(x,y);}closePath(){}}
 const ctx={save(){},restore(){},clearRect(){},setTransform(){},stroke(){paints.push(this.strokeStyle);widths.push(this.lineWidth);},fill(){paints.push(this.fillStyle);}};
 const shell={id:'iuGeminiCameraShell',dataset:{state:'idle'},querySelector:()=>null};
 const guide={getClientRects:()=>shell.dataset.state==='analyzing'?[{}]:[]};
 const canvas={id:'iuGeminiLoadingChrome',parentElement:guide,getContext:()=>ctx,getBoundingClientRect:()=>({width:48,height:48})};
 const doc={hidden:false,getElementById:k=>k===canvas.id?canvas:k===shell.id?shell:null,addEventListener(){}};
 let reduced=false;
 const win={devicePixelRatio:3,matchMedia:()=>({get matches(){return reduced;}}),addEventListener(){},requestAnimationFrame:fn=>{frames.set(++req,fn);return req;},cancelAnimationFrame:id=>frames.delete(id)};
 class Observer{constructor(fn){this.fn=fn;}observe(node){if(node===shell)observers.push(this.fn);}}
 const instrument=source.replace(' sync();\n }\n})();',' sync();\n if(isLoader)inspect({basePoint,spawnWave,spawnInnerWave});\n }\n})();');
 new Function('document','window','Path2D','MutationObserver','inspect',instrument)(doc,win,Path,Observer,x=>{debug=x;});
 assert.equal(frames.size,0);
 shell.dataset.state='analyzing';observers.forEach(fn=>fn());assert.equal(frames.size,1);
 const [id,fn]=frames.entries().next().value;frames.delete(id);fn(100);
 assert.deepEqual(paints.slice(0,15),gross.paints.slice(0,15).map(p=>p.color));
 for(const [i,w] of [1.02,.76,.54].entries())assert(Math.abs(widths[i]-w*1.6)<1e-8,'Épaisseur de l’anneau renforcée');
 assert(source.includes('if(isLoader){widthPx*=loaderWidthScale;outset*=loaderWidthScale;}'));
 for(let i=0;i<=128;i++){const p=debug.basePoint(i/128);assert(Math.abs(Math.hypot(p.x-24,p.y-24)-18)<1e-8);}
 shell.dataset.state='idle';observers.forEach(fn=>fn());assert.equal(frames.size,0);
 reduced=true;shell.dataset.state='analyzing';const count=paints.length;observers.forEach(fn=>fn());assert.equal(frames.size,0);assert(paints.length>count);
 console.log('OK : anneau circulaire Chrome partagé, démarrage/arrêt et mouvement réduit.');
}
