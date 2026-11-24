'use strict';
const assert=require('node:assert/strict');
global.localStorage={getItem:()=>JSON.stringify({articles:[
 {plu:'3476',libelle:'POIRE SANTA MARIA',eanPrefix:'0203476'},
 {plu:'3576',libelle:'POIRE SANTA MARIA',eanPrefix:'0203576'}]})};
const d=require('../digi-catalog-lookup.js');
const ean=d.amountVariants('0203476',299,299,'')[0],bars=d.encodeBars(ean);
assert.equal(bars.length,95);assert.equal(d.barDistance(ean,[bars,bars]),0);
assert.equal(d.barDistance(ean,[bars]),null);
const fields={name:'POIRE SANTA MARIA',weightGrams:1000,pricePerKgCents:299,totalCents:299,ean13:null};
const label={fields,eanObserved:'0203??6'+ean.slice(7)};
const solved=d.solveHypotheses(label,{observations:[{source:'optical-partial',pattern:label.eanObserved,bitRows:[bars,bars]}],
 history:[{catalogPrefix:'0203576'}]});
assert.equal(solved.ranked[0].eanPrefix,'0203476');assert.equal(solved.ranked[0].barDistance,0);
assert.equal(d.reconstruct(label).result.fields.ean13,null,'Les scores ne sont pas une preuve d identité');
assert(!Object.hasOwn(solved.candidates[0],'code'),'Pas de transmission du code calculé à Gemini');
const range=d.inverseRanges({pricePerKgCents:349,totalCents:1382});
assert(range.weight.min<=3960&&range.weight.max>=3960);
assert.equal(d.reconstruct({fields:{...fields,weightGrams:null},eanObserved:ean}).result.fields.weightGrams,null);
console.log('OK : barres, hypothèses, calcul inverse avec arrondis, historique non probant');
