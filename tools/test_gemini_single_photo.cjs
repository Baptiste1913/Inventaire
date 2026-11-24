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
const helpers=slice('function trustedBarcodeEvidence(reading){','function fieldForProblem(')+
 slice('function readableValue(kind,value){',"analyze.addEventListener('click'");
const ctx=vm.createContext({localBarcode:null,window:{IUDigiCatalogLookup:{resolve:()=>({ok:true,status:'matched',plu:'3476',name:'CITRON PRIMOFIORI'})}}});
vm.runInContext('const fieldKeys={name:"name",weight:"weightGrams",rate:"pricePerKgCents",total:"totalCents",ean:"ean13"};'+
 'function eanCheck(e){let s=0;for(let i=0;i<12;i++)s+=Number(e[i])*(i%2?3:1);return String((10-s%10)%10)}'+
 helpers+'globalThis.test={fieldsChecks,recoveryTargets,mergeRecoveredReading,trustedBarcodeEvidence};',ctx);
const {fieldsChecks,recoveryTargets,mergeRecoveredReading,trustedBarcodeEvidence}=ctx.test;
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
const trustedOpticalTargets=recoveryTargets({fields:label,checks:{}});
assert.equal(trustedOpticalTargets.length,0,
 'Ne pas relire Gemini lorsque le code-barres local confirme le même EAN');
ctx.localBarcode={confirmed:true,ean13:label.ean13,source:'optical',
 bounds:{left:.1,right:.24,y:.4,slope:0}};
assert.equal(trustedBarcodeEvidence(ctx.localBarcode),false,
 'Un code optique hors de la zone DIGI n’est pas une preuve suffisante');
assert.deepEqual(Array.from(recoveryTargets({fields:label,checks:{}})),['ean'],
 'Si la lecture locale est mal placée, conserver la relecture Gemini de sécurité');
ctx.window.IUGeminiLabelGeometry=require('../gemini-label-geometry.js');
ctx.localBarcode={confirmed:true,ean13:label.ean13,source:'optical',
 bounds:{left:.61,right:.83,y:.76,slope:.03},
 labelRect:{x:.38,y:.12,w:.57,h:.77,source:'paper-outline'}};
assert.equal(trustedBarcodeEvidence(ctx.localBarcode),true,
 'Un EAN hors gabarit fixe reste fiable si inclus dans le papier identifié');
assert.deepEqual(Array.from(recoveryTargets({fields:label,checks:{}})),[],
 'Un code-barres décentré confirmé évite une relecture Gemini inutile');
ctx.localBarcode={...ctx.localBarcode,
 bounds:{left:.90,right:.99,y:.76,slope:0}};
assert.equal(trustedBarcodeEvidence(ctx.localBarcode),false,
 'Ne pas valider un autre EAN placé en dehors de la feuille détectée');
ctx.localBarcode={confirmed:true,ean13:label.ean13,ambiguous:false,source:'native'};
assert(worker.includes('responseSchema')&&worker.includes('pipelineVersion:2'));
assert(worker.includes('focusFields')&&worker.includes('detailImageBase64'));
assert(js.includes('const selectedProvider=\'gemini\''));
assert(js.includes('let targets=!targetField?recoveryTargets(combined):[]'));
assert(js.includes("targets.length===1&&targets[0]==='ean'"),
 'Attente bornée pour éviter un appel Gemini si la lecture EAN locale est imminente');
assert(js.includes('samePhotoGuided(file,localBarcode)'),
 'Recadrage optique réservé à la vue secondaire sur la même photo');
assert(js.includes('clearTimeout(guard)'));
assert(!slice("analyze.addEventListener('click'","function refreshTorch()").includes('IUGeminiSaveWeigh('));
console.log('OK : Gemini photo unique, relecture groupée, anti-hallucination et EAN sûr');
