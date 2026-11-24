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
for(const file of ['index.html','sw.js'])assert(fs.readFileSync(file,'utf8').includes('weigh-light.js?v=43.04'));
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
assert(source.includes("2.15,config.tint,config.opacity*.44,isLogo?.65:1.5,'source-over',.125"));
assert(source.includes(".95,config.core,config.opacity,isLogo?.18:.35,'source-over',.05"));
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

const markup=fs.readFileSync('index.html','utf8');
const section=markup.slice(markup.indexOf('<section id="iuGeminiLab"'),markup.indexOf('</section>',markup.indexOf('<section id="iuGeminiLab"')));
assert(!section.includes('iuGeminiBackdropChrome')&&!section.includes('iu-gemini-chrome-backdrop')&&!section.includes('iu-digi-chrome-halo'));
assert(!source.includes("document.getElementById('iuGeminiBackdropChrome')"));
assert((section.match(/class="iu-ai-glow-orb /g)||[]).length===3);
assert(section.indexOf('class="iu-gemini-welcome-glow"')<section.indexOf('class="iu-gemini-clear-glass"'));
assert(section.indexOf('class="iu-gemini-clear-glass"')<section.indexOf('id="iuGeminiLabelPanel"'));
assert(!section.includes('iu-welcome-dot-wave'));
const newGlow=css.slice(css.indexOf('/* v42.87'),css.indexOf('/* v42.88'));
for(const rule of ['iuHomeBackdropRed 10s ease-in-out -2s','iuHomeBackdropBlue 13s ease-in-out -6s','iuHomeBackdropGreen 17s ease-in-out -11s'])assert(newGlow.includes(rule));
const palette=[...newGlow.matchAll(/rgba\((\d+),(\d+),(\d+),[^)]+\)/g)];
assert(palette.length>=9&&palette.every(m=>m[1]===m[2]&&m[2]===m[3]));
assert(newGlow.includes('filter:blur(25px)!important'));
assert(newGlow.includes('animation-play-state:paused!important'));
assert(newGlow.includes('prefers-reduced-motion:reduce')&&newGlow.includes('prefers-reduced-transparency:reduce'));
assert(css.match(/> \.iu-gemini-label-shell > \.iu-gemini-clear-glass \{([^}]+)\}/)[1].includes('-webkit-backdrop-filter:blur(1.25px)!important;'));
for(const f of ['index.html','sw.js'])assert(fs.readFileSync(f,'utf8').includes('gemini-chrome-halos.js?v=42.87')&&fs.readFileSync(f,'utf8').includes('gemini-lab.css?v=43.01'));
{
 const hooks={},field={dataset:{}};let observer;
 const doc={hidden:false,querySelector:()=>field,addEventListener:(k,fn)=>hooks[k]=fn};
 const win={addEventListener:(k,fn)=>hooks[k]=fn};
 class Intersection{constructor(fn){observer=fn;}observe(){}}
 new Function('document','window','IntersectionObserver',fs.readFileSync('gemini-chrome-halos.js','utf8'))(doc,win,Intersection);
 assert.equal(field.dataset.paused,'true');observer([{isIntersecting:true}]);assert.equal(field.dataset.paused,'false');
 doc.hidden=true;hooks.visibilitychange();assert.equal(field.dataset.paused,'true');
 doc.hidden=false;hooks.visibilitychange();assert.equal(field.dataset.paused,'false');
 observer([{isIntersecting:false}]);assert.equal(field.dataset.paused,'true');
}
const whole=run('iuGeminiOuterChrome');assert.deepEqual(whole.paints,gross.paints);
const wholeReduced=run('iuGeminiOuterChrome',true);assert.equal(wholeReduced.requests,0);assert(wholeReduced.paints.length>=15);
console.log('OK : lumières Bienvenue monochromes, suspension hors écran, ancien fond retiré, contour global préservé.');
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
 assert(source.includes('if(isRing){widthPx*=loaderWidthScale;outset*=loaderWidthScale;}'));
 for(let i=0;i<=128;i++){const p=debug.basePoint(i/128);assert(Math.abs(Math.hypot(p.x-24,p.y-24)-18)<1e-8);}
 shell.dataset.state='idle';observers.forEach(fn=>fn());assert.equal(frames.size,0);
 reduced=true;shell.dataset.state='analyzing';const count=paints.length;observers.forEach(fn=>fn());assert.equal(frames.size,0);assert(paints.length>count);
 console.log('OK : anneau circulaire Chrome partagé, démarrage/arrêt et mouvement réduit.');
}

{
 const paints=[],frames=new Map();let req=0,debug;
 class Path{moveTo(x,y){assert(Number.isFinite(x)&&Number.isFinite(y));}lineTo(x,y){this.moveTo(x,y);}closePath(){}}
 const ctx={save(){},restore(){},clearRect(){},setTransform(){},stroke(){paints.push(this.strokeStyle);},fill(){paints.push(this.fillStyle);}};
 const guide={getClientRects:()=>[{}]};
 const canvas={id:'iuGeminiAIChrome',parentElement:guide,getContext:()=>ctx,getBoundingClientRect:()=>({width:26,height:26})};
 const doc={hidden:false,getElementById:k=>k===canvas.id?canvas:null,addEventListener(){}};
 let visible;const win={devicePixelRatio:3,matchMedia:()=>({matches:false}),addEventListener(){},requestAnimationFrame:fn=>{frames.set(++req,fn);return req;},cancelAnimationFrame:id=>frames.delete(id),IntersectionObserver:class{constructor(fn){visible=fn;}observe(){}}};
 class Observer{observe(){}}
 const instrument=source.replace(' sync();\n }\n})();',' sync();\n if(isLogo)inspect({basePoint,loaderWidthScale,chromeReflections,logoInnerReflections,logoInnerLines,logoRibbonVertex,logoBreath,logoJoinCenter,logoJoinWeight,logoLinkedPoint});\n }\n})();');
 new Function('document','window','Path2D','MutationObserver','inspect',instrument)(doc,win,Path,Observer,x=>{debug=x;});
 assert.equal(frames.size,1);
 const [id,fn]=frames.entries().next().value;frames.delete(id);fn(100);
 assert.deepEqual(paints.slice(0,15),gross.paints.slice(0,15).map(p=>p.color));
 for(let i=0;i<=128;i++){const p=debug.basePoint(i/128);assert(Math.abs(Math.hypot(p.x-13,p.y-13)-6)<1e-8);}
 const initial=paints.length;
 for(let i=1;i<=60;i++){const [id,fn]=frames.entries().next().value;frames.delete(id);fn(100+i*1000/60);}
 assert(paints.length-initial>=60*15,'60 rendus en une seconde');
 assert.equal(debug.loaderWidthScale,1.6);
 assert.equal(debug.logoInnerLines.length,5);assert.equal(debug.logoInnerReflections.length,5);
 for(let k=0;k<5;k++)for(const time of [0,5,15,29,60]){
  const u=debug.logoJoinCenter(time,k);
  assert(debug.logoJoinWeight(u+.12,time,k)>0,'Jonction élargie');
  assert.equal(debug.logoJoinWeight(u+.14,time,k),0,'Jonction localisée');
  const a=debug.logoLinkedPoint(u,time,k),b=debug.logoLinkedPoint(u,time,k-1);
  assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-8,'Jonction réelle avec la fibre voisine');
  const left=debug.logoLinkedPoint(u-.00001,time,k),right=debug.logoLinkedPoint(u+.00001,time,k);
  assert(Math.hypot(left.x-right.x,left.y-right.y)<.005,'Jonction continue');
  const x=debug.logoLinkedPoint(0,time,k),y=debug.logoLinkedPoint(1,time,k);
  assert(Math.hypot(x.x-y.x,x.y-y.y)<1e-8,'Boucle fermée');
  const breath=debug.logoBreath(time,k);
  assert(breath>=.87-1e-8&&breath<=1.13+1e-8);
  assert(Math.abs(debug.logoBreath(time+.0167,k)-breath)<.001,'Variation lente');
 }
 assert(Math.abs(debug.logoBreath(0,0)-debug.logoBreath(4,0))>.1);
 assert(debug.logoBreath(0,0)!==debug.logoBreath(0,1),'Phases indépendantes');
 assert(paints.length-initial>=60*30,'Filaments supplémentaires à chaque frame');
 const vertex={x:19,y:13,nx:-1,ny:0,envelope:1};
 assert.deepEqual(debug.logoRibbonVertex(vertex,-1,.55),debug.logoRibbonVertex(vertex,-1,0),'Bord externe inchangé');
 assert(debug.logoRibbonVertex(vertex,1,.55).x<debug.logoRibbonVertex(vertex,1,0).x,'Épaisseur vers le centre');
 assert.deepEqual(debug.chromeReflections.map(c=>c.seconds),[10.2,12.3,17.1,13.8,15.4,18.6]);
 assert(source.includes('elapsed+=Math.min(48,Math.max(0,now-lastTick))/1000*(isLoader?2:1)'));
 visible([{isIntersecting:false}]);assert.equal(frames.size,0);
 visible([{isIntersecting:true}]);assert.equal(frames.size,1);
 console.log('OK : logo AI circulaire 12 px, même palette Chrome, suspension hors écran.');
}

{
 const frames=new Map(),colors=[],observers=[];let req=0;
 class Path{moveTo(){}lineTo(){}closePath(){}}
 const ctx={save(){},restore(){},clearRect(){},setTransform(){},stroke(){colors.push(this.strokeStyle);},fill(){colors.push(this.fillStyle);}};
 const dialog={hidden:true};
 const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:140,height:57})};
 const button={id:'iuGeminiDuplicateAccept',hidden:false,querySelector:()=>canvas,getClientRects:()=>dialog.hidden?[]:[{}]};
 const doc={hidden:false,getElementById:k=>k===button.id?button:k==='iuGeminiDuplicateConfirm'?dialog:null,addEventListener(){}};
 const win={devicePixelRatio:2,matchMedia:()=>({matches:false}),addEventListener(){},requestAnimationFrame:fn=>{frames.set(++req,fn);return req;},cancelAnimationFrame:id=>frames.delete(id)};
 class Observer{constructor(fn){this.fn=fn;}observe(node){if(node===dialog)observers.push(this.fn);}}
 new Function('document','window','Path2D','MutationObserver',source)(doc,win,Path,Observer);
 assert.equal(frames.size,0);
 dialog.hidden=false;observers.forEach(fn=>fn());assert.equal(frames.size,1);
 const [id,fn]=frames.entries().next().value;frames.delete(id);fn(100);
 assert.deepEqual(colors.slice(0,15),gross.paints.slice(0,15).map(p=>p.color));
 dialog.hidden=true;observers.forEach(fn=>fn());assert.equal(frames.size,0);
 console.log('OK : bouton de doublon, même palette Chrome, arrêt à la fermeture.');
}

const spill=css.slice(css.indexOf('/* v42.88'));
assert(newGlow.includes('inset:-64px -36px -65px!important'));
assert(spill.includes('overflow:hidden!important;isolation:isolate!important;border-radius:20px!important'));
assert(spill.includes('overflow:visible!important;isolation:auto!important;z-index:auto!important'));
console.log('OK : halos débordants, clip de la carte complète, contrôles au premier plan.');

const finish=css.slice(css.indexOf('/* v42.89'));
assert(finish.includes('#iuQuickEvents .iu-dock-custom-icon {\n width:22px!important;height:22px!important;flex:0 0 22px!important;'));
assert(finish.includes('align-self:end!important;justify-self:center!important'));
assert(finish.includes('#iuQuickEvents .iu-dock-custom-icon > path {\n transform:none!important;'));
console.log('OK : Planning 22 px conservé.');

{
 const frames=new Map(),colors=[],observers=[];let req=0;
 class Path{moveTo(){}lineTo(){}closePath(){}}
 const ctx={save(){},restore(){},clearRect(){},setTransform(){},stroke(){colors.push(this.strokeStyle);},fill(){colors.push(this.fillStyle);}};
 const panel={hidden:true},manual={hidden:true};
 const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:85,height:60})};
 const button={id:'iuGeminiRepairApply',hidden:false,querySelector:()=>canvas,getClientRects:()=>!panel.hidden&&!manual.hidden?[{}]:[]};
 const doc={hidden:false,getElementById:k=>({iuGeminiRepairApply:button,iuGeminiRepair:panel,iuGeminiRepairManual:manual})[k]||null,addEventListener(){}};
 const win={devicePixelRatio:2,matchMedia:()=>({matches:false}),addEventListener(){},requestAnimationFrame:fn=>{frames.set(++req,fn);return req;},cancelAnimationFrame:id=>frames.delete(id)};
 class Observer{constructor(fn){this.fn=fn;}observe(node){if(node===panel||node===manual)observers.push(this.fn);}}
 new Function('document','window','Path2D','MutationObserver',source)(doc,win,Path,Observer);
 assert.equal(frames.size,0);
 panel.hidden=false;manual.hidden=false;observers.forEach(fn=>fn());assert.equal(frames.size,1);
 const [id,fn]=frames.entries().next().value;frames.delete(id);fn(100);
 assert.deepEqual(colors.slice(0,15),gross.paints.slice(0,15).map(p=>p.color));
 manual.hidden=true;observers.forEach(fn=>fn());assert.equal(frames.size,0);
 console.log('OK : correction manuelle, contour identique et arrêt quand masqué.');
}

const badge=css.slice(css.indexOf('/* v43.01')).split('@media')[0];
assert(badge.includes('border:1px solid rgba(214,224,231,.95)!important;'));
assert(badge.includes('box-shadow:none!important;'));
assert(badge.includes('background:rgba(128,128,128,.002)!important;'));
assert(source.includes('isLogo?{...config,span:config.span*.85}:config'));
console.log('OK : contour import, absence de relief, filaments intérieurs et cadence du logo.');

assert(source.includes('widthPx*loaderWidthScale*(isLogo?.85:1)'));
assert(source.includes('if(isLogo){widthPx*=.85;innerExtra*=.85;}'));
console.log('OK : cinq fibres intérieures liées, cinq reflets, épaisseur réduite uniquement sur le logo.');

assert(source.includes('const logoInnerSpecs=[[.94,.24,-.60],[3.82,.25,-1.00],[5.81,.20,-1.38],[2.35,.18,-1.74],[4.50,.16,-2.02]];'));
console.log('OK : trajectoires intérieures rapprochées, jonctions élargies.');
