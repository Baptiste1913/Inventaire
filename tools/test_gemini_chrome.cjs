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
assert(gemini.paints.length>15);
assert(gemini.paints.every(p=>grey(p.color)&&p.mode==='source-over'));
assert(gemini.paints.some(p=>p.color==='#1b1b1b'));
assert(gemini.paints.some(p=>p.color==='#fafafa'));
assert(gemini.paints.every(p=>Number.isFinite(p.alpha)&&p.alpha>=0&&p.alpha<=1));
const classic=run('iuWeighScanOverlay');
assert(classic.paints.some(p=>p.color==='#79c7ff'&&p.mode==='screen'));
assert(classic.paints.some(p=>p.color==='#44d4ae'));
const reduced=run('iuGeminiCameraShell',true);
assert.equal(reduced.requests,0);assert(reduced.paints.length>0);
assert(source.includes('drift:3.4')&&source.includes('drift:-3.6'));
assert(source.includes('if(isGemini){paintChrome(t);return;}'));
const css=fs.readFileSync('gemini-lab.css','utf8');
const outer=css.slice(css.indexOf('/* v42.55'));
assert(outer.includes('> .iu-gemini-outline-label {'));
assert(outer.includes('border:0!important;')&&outer.includes('outline:0!important;'));
assert(!css.includes('data-aligned="true"] .iu-gemini-outline-label{border-color:rgba(155,243,198'));
for(const file of ['index.html','sw.js'])assert(fs.readFileSync(file,'utf8').includes('weigh-light.js?v=42.55'));
console.log('OK : chrome monochrome, fibres, mouvement réduit, OCR classique préservé, contour CSS retiré');
