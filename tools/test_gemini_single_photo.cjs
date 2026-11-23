'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('gemini-lab.js','utf8');
const worker=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
function slice(start,end){
 const a=js.indexOf(start),b=js.indexOf(end,a);
 assert(a>=0&&b>a,'Code manquant : '+start);
 return js.slice(a,b);
}
const helpers=slice('function fieldsChecks(fields){','function fieldForProblem(')+
 slice('function readableValue(kind,value){',"analyze.addEventListener('click'");
const ctx=vm.createContext({localBarcode:null,window:{IUDigiCatalogLookup:{resolve:()=>({ok:true,status:'matched',plu:'3476',name:'CITRON PRIMOFIORI'})}}});
vm.runInContext('const fieldKeys={name:"name",weight:"weightGrams",rate:"pricePerKgCents",total:"totalCents",ean:"ean13"};'+
 'function eanCheck(e){let s=0;for(let i=0;i<12;i++)s+=Number(e[i])*(i%2?3:1);return String((10-s%10)%10)}'+
 helpers+'globalThis.test={fieldsChecks,recoveryTargets,mergeRecoveredReading};',ctx);
const {fieldsChecks,recoveryTargets,mergeRecoveredReading}=ctx.test;
function priceEAN(cents){
 const digits='0206632'+String(Math.round(cents*655.36/100)).padStart(5,'0');
 let s=0;for(let i=0;i<12;i++)s+=Number(digits[i])*(i%2?3:1);
 return digits+String((10-s%10)%10);
}
const label={name:'CITRON PRIMOFIORI',weightGrams:3960,
 pricePerKgCents:349,totalCents:1382,ean13:priceEAN(1382)};
assert.equal(fieldsChecks(label).arithmeticConsistent,true);
assert.equal(fieldsChecks(label).barcodePriceConsistent,true);
assert.equal(fieldsChecks({...label,totalCents:1189}).barcodePriceConsistent,false);
const incomplete={fields:{...label,ean13:null,weightGrams:null},checks:{}};
assert.deepEqual(Array.from(recoveryTargets(incomplete)),['weight','ean']);
const noOptical=recoveryTargets({fields:label,checks:{}});
assert.deepEqual(Array.from(noOptical),['ean'],
 'Sans lecture optique, confirmer l’EAN par une seconde lecture de la même photo');
const recovered=mergeRecoveredReading(incomplete,{fields:label},['weight','ean']);
assert.equal(recovered.fields.weightGrams,3960);
assert.equal(recovered.fields.ean13,label.ean13);
const mismatch=mergeRecoveredReading({fields:label,checks:{}},
 {fields:{...label,weightGrams:3000}},['weight']);
assert.equal(mismatch.checks.readingConflict,true);
assert.equal(mismatch.fields.weightGrams,3960,'Conserver premier poids en cas de divergence');
const eanConflict=mergeRecoveredReading({fields:label,checks:{}},
 {fields:{ean13:priceEAN(900)}},['ean']);
assert.equal(eanConflict.checks.readingConflict,true,
 'Deux lectures Gemini avec EAN distincts bloquent le code-barres');
ctx.localBarcode={confirmed:true,ean13:label.ean13,ambiguous:false};
const changed=mergeRecoveredReading({fields:{...label,ean13:priceEAN(900)},
 checks:{independentMismatch:true}},{fields:{ean13:label.ean13}},['ean']);
assert.equal(changed.fields.ean13,label.ean13);
assert.equal(changed.checks.independentMismatch,false);
assert(worker.includes('responseSchema')&&worker.includes('pipelineVersion:2'));
assert(worker.includes('focusFields')&&worker.includes('detailImageBase64'));
assert(js.includes('const selectedProvider=\'gemini\''));
assert(js.includes('const targets=!targetField?recoveryTargets(combined):[]'));
assert(js.includes('clearTimeout(guard)'));
assert(!slice("analyze.addEventListener('click'","function refreshTorch()").includes('IUGeminiSaveWeigh('));
console.log('OK : Gemini photo unique, relecture groupée, anti-hallucination et EAN sûr');
