'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8'),css=fs.readFileSync('gemini-lab.css','utf8'),html=fs.readFileSync('index.html','utf8');
const geometry=fs.readFileSync('gemini-label-geometry.js','utf8');
const mod={exports:{}};new Function('module',geometry)(mod);
const start=js.indexOf(' function cameraCoverGeometry('),end=js.indexOf(' function syncExactCameraGuide(',start);
const {cameraCoverGeometry,shutterGeometry}=new Function(js.slice(start,end)+';return {cameraCoverGeometry,shutterGeometry};')();
for(const [sw,sh] of [[1080,1920],[1920,1080],[2160,3840],[3840,2160],[1440,1440]]){
 for(const [w,h] of [[308,184],[280,160],[500,184],[700,240]]){
  const r=cameraCoverGeometry(sw,sh,w,h);
  assert(r.width>=w-1e-8&&r.height>=h-1e-8);
  assert(Math.abs(r.width/r.height-sw/sh)<1e-8);
  assert(Math.abs(r.left*2+r.width-w)<1e-8&&Math.abs(r.top*2+r.height-h)<1e-8);
  const gw=.9*Math.min(w-8,(h-8)*1.24),gh=gw/1.24;
  const guide={left:(w-gw)/2,top:(h-gh)/2,width:gw,height:gh};
  const crop=mod.exports.guideCrop(sw,sh,r,guide);
  const original=mod.exports.guideCrop(sw,sh,{left:0,top:0,width:w,height:h},guide);
  assert(crop&&original);
  for(const key of ['x','y','width','height'])assert(Math.abs(crop[key]-original[key])<=1,'Crop stable : '+key);
  const button=shutterGeometry(w,gw);
  assert(Math.abs(button.size+2*button.margin-(w-gw)/2)<1e-8);
  assert(button.size>0);
  const gutter=(w-gw)/2;
  assert(Math.abs(button.size-(gutter-2*Math.min(5,gutter*.12))*.85)<1e-8);
 }
}
assert.equal(cameraCoverGeometry(0,1920,308,184),null);
assert(!html.includes('id="iuGeminiDetected"'));
assert(!js.includes('showDetectedIndicator'));
assert(js.includes("['loadedmetadata','resize','playing']"));
assert(css.includes('max-width:none!important;max-height:none!important;'));
assert(css.includes('top:50%!important;bottom:auto!important;transform:translateY(-50%)!important;'));
assert(css.includes('flex:none!important;border-radius:13px!important;color:#111!important;'));
assert(js.includes('if(duplicateForCurrent()){openDuplicateConfirm();return;}'));
console.log('OK : couverture native portrait/paysage, crop préservé, déclencheur centré, statut unique.');
