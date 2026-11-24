'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const model=require('../digi-advanced-model.js'),core=require('../digi-advanced-core.js');
assert.equal(core.parameterCount,3696);
assert.equal(model.trainingLines,30000);
assert.equal(model.trainingCharacters,220654);
let count=0;
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
let hash=2166136261;
for(const l of model.layers){
 let n=0,bits=0;
 for(const c of l.weights){if(c==='=')break;n=(n<<6)|alphabet.indexOf(c);bits+=6;if(bits>=8){bits-=8;hash=Math.imul(hash^((n>>bits)&255),16777619)>>>0;count++;}}
}
assert.equal(hash,2675934489,'Quantized weights match trained export');
const input=Uint8Array.from({length:224*24},(_,i)=>(i*31+Math.floor(i/7))%256);
const output=core.infer(input);
assert.equal(output.h,1);assert.equal(output.w,112);
for(const [t,c,v] of [[0,0,40.00659],[0,3,-11.97505],[10,5,-8.21782],[30,1,.79817],[60,10,-29.75211],[111,11,17.48436]])
 assert(Math.abs(output.data[c*output.w+t]-v)<.002,'PyTorch quantized reference logits');
assert.equal(core.decode(output).text,'1888888');
assert.equal(core.accept({text:'3,960',margins:[3,3,3,3,3]},'weight').value,3960);
assert.equal(core.accept({text:'3,49',margins:[3,3,3,3]},'rate').value,349);
assert.equal(core.accept({text:'13,82',margins:[3,3,3,3,3]},'total').value,1382);
assert.equal(core.accept({text:'1,4',margins:[3,3,3]},'total'),null);
assert.equal(core.accept({text:'3,960',margins:[3,.1,3,3,3]},'weight'),null);
const ean=core.accept({text:'0203476013844',margins:Array(13).fill(3)},'ean');
assert.equal(ean.pattern,'0203476013844');assert.equal(ean.confirmed,false);
const lab=fs.readFileSync('gemini-lab.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert(lab.includes('const receivedTask=requestGeminiWithRecovery('));
assert(lab.indexOf('const receivedTask=requestGeminiWithRecovery(')<lab.indexOf('advancedJob=track(window.IUDigiAdvanced'));
assert(lab.includes('received=await receivedTask;'));
assert(lab.includes('digitJob?.value,advancedJob?.value'));
assert(!lab.includes('fuseEAN(result,advancedJob'));
assert(!lab.includes('fuseEAN(combined,advancedJob'));
assert(html.includes('digi-advanced-lab.js?v=42.51'));
for(const file of ['digi-advanced-lab.js','digi-advanced-model.js','digi-advanced-core.js','digi-advanced-worker.js'])assert(sw.includes(file+'?v=42.51'));
console.log('OK : CNN quantifié, référence PyTorch, CTC, formats, ordre réseau, séparation des preuves');
