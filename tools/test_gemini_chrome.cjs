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
 const overlay={id,hidden:false,dataset:{state:id==='iuGeminiGrossChrome'?'idle':'scanning'},querySelector:()=>id==='iuGeminiGrossChrome'?canvas:guide,getClientRects:()=>[{}]};
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
for(const file of ['index.html','sw.js'])assert(fs.readFileSync(file,'utf8').includes('weigh-light.js?v=42.59'));
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
const backdrop=css.slice(css.indexOf('/* v42.61'));
assert(backdrop.includes('opacity:.31!important;'));
assert(backdrop.includes('prefers-reduced-motion:reduce'));
assert(backdrop.includes('prefers-reduced-transparency:reduce'));
assert(backdrop.includes('pointer-events:none!important;'));
const markup=fs.readFileSync('index.html','utf8');
const waves=markup.match(/<svg class="iu-gemini-chrome-backdrop"[\s\S]*?<\/svg>/g);
assert.equal(waves.length,1);
assert(markup.indexOf(waves[0])>markup.indexOf('id="iuGeminiLabelPanel"'));
const shades=[...waves[0].matchAll(/stop-color="#([0-9a-f]{6})"/g)];
assert(shades.length>=8&&shades.every(m=>grey('#'+m[1])));
for(const n of ['A','B','C'])assert(backdrop.includes('@keyframes iuChromeFlow'+n));
console.log('OK : fond DIGI monochrome, trois vagues, accessibilité, typographie');
