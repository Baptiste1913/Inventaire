'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
global.localStorage={getItem:()=>"{\"articles\":[{\"plu\":\"3476\",\"libelle\":\"CITRON PRIMOFIORI\",\"eanPrefix\":\"0203476\"},{\"plu\":\"5555\",\"libelle\":\"CLEMENTINE A FEUILLES\",\"eanPrefix\":\"0205555\"},{\"plu\":\"5556\",\"libelle\":\"CLEMENTINE A FEUILLES\",\"eanPrefix\":\"0205556\"}]}"};
const catalog=require('../digi-catalog-lookup.js'),js=fs.readFileSync('gemini-lab.js','utf8');
assert(catalog.nameIdentityConflict('Clémentine à feuilles','0203476'));
assert(catalog.nameIdentityConflict('Clémentine','0203476'));
assert(catalog.nameIdentityConflict('Citron Primofiori','0205555'));
assert(!catalog.nameIdentityConflict('Clémentine à feuilles','0205556'));
assert(!catalog.nameIdentityConflict('','0203476'));
global.localStorage.getItem=()=>JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'},
 {plu:'3313',libelle:'ORANGE NAVELINE',eanPrefix:'0203313'},
 {plu:'9513',libelle:'ORANGE NAVEL',eanPrefix:'2662252'}
]});
assert(catalog.nameIdentityConflict('ORANGE CAMBRIA','0203313'));
assert(catalog.nameIdentityConflict('ORANGE CAMBRIA','2662252'));
assert(catalog.nameIdentityConflict('ORANGE SANGUINE','2662252'));
function take(a,b){return js.slice(js.indexOf(a),js.indexOf(b,js.indexOf(a)));}
const ctx={window:{IUDigiCatalogLookup:catalog},localBarcode:null};
vm.runInNewContext("function eanCheck(s){let n=0;for(let i=0;i<12;i++)n+=Number(s[i])*(i%2?3:1);return String((10-n%10)%10)};"+take('function trustedBarcodeEvidence(reading){','function fieldForProblem(')+take('function validateResult(result){',' // Une lecture EAN13 purement optique')+';this.validate=validateResult;',ctx);
const first='0203476'+String(Math.round(100*655.36/100)).padStart(5,'0');
const fields={name:'CITRON PRIMOFIORI',ean13:first+ctx.eanCheck(first),weightGrams:500,pricePerKgCents:200,totalCents:100};
assert(!ctx.validate({fields,checks:{}}).error);
assert(ctx.validate({fields:{...fields,name:'CLEMENTINE A FEUILLES'},checks:{}}).error.includes('Article contradictoire'));
assert(ctx.validate({fields,printedName:'CLEMENTINE A FEUILLES',checks:{}}).error.includes('Article contradictoire'));
assert(js.includes("validateResult(lastRawResult).error"));
const select=take('async function chooseSharpCameraFrame(epoch){',' // Lecture vidéo locale');
assert(!/qualityRing|qualityCached|backup/.test(select));
const capture=take("capture.addEventListener('click'","document.addEventListener('visibilitychange'");
assert(!/alternatePhoto|preparedBarcode|preparedEnhanced|chosen\.jpeg/.test(capture));
assert(!js.includes('speculativeSupported'));
console.log('OK : clémentine/citron, origines multiples, nom initial, capture unique, garde de sauvegarde.');
