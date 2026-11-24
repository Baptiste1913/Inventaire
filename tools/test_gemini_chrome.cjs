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
 const overlay={id,hidden:false,dataset:{state:'scanning'},querySelector:()=>guide};
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
for(const file of ['index.html','sw.js'])assert(fs.readFileSync(file,'utf8').includes('weigh-light.js?v=42.56'));
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
const instrument=source.replace(' sync();\n }\n})();',' sync();\n if(isGemini)inspect({advanceWaves,waveShape,spawnWave,point,basePoint,wrap,active:()=>looseFibres,shades:waveShades});\n }\n})();');
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
