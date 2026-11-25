'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let raw=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'}
]});
global.localStorage={getItem:()=>raw};
const digi=require('../digi-catalog-lookup.js');
const js=fs.readFileSync('gemini-lab.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function code(prefix,cents){
 const first=prefix+String(Math.round(cents*655.36/100)).padStart(5,'0');
 let sum=0;
 for(let i=0;i<12;i++)sum+=Number(first[i])*(i%2?3:1);
 return first+String((10-sum%10)%10);
}
const ean=code('0203476',1382);
const fields={name:'CITRON PRIMOFIORI',ean13:ean,
 weightGrams:3960,pricePerKgCents:349,totalCents:1382};
function source(a,b){
 const start=js.indexOf(a),end=js.indexOf(b,start);
 assert(start>=0&&end>start,'Fonction absente : '+a);
 return js.slice(start,end);
}
const ctx=vm.createContext({window:{IUDigiCatalogLookup:digi},localBarcode:null});
vm.runInContext(
 'function eanCheck(first){let s=0;for(let i=0;i<12;i++)s+=Number(first[i])*(i%2?3:1);return String((10-s%10)%10)};'+
 source('function trustedBarcodeEvidence(reading){','function fieldForProblem(')+
 source('function validateResult(result){',' // Une lecture EAN13 purement optique')+
 'globalThis.validateResult=validateResult;',ctx);
const read=ctx.validateResult({fields,checks:{}});
assert.equal(read.error,undefined,'Une étiquette cohérente est recevable');
assert.equal(read.name,'CITRON PRIMOFIORI','Le nom lu confirme le catalogue');
assert(ctx.validateResult({fields:{...fields,name:'NOM FAUX INVENTÉ PAR GEMINI'},checks:{}}).error);
assert(ctx.validateResult({fields:{...fields,name:null},checks:{}}).error);
assert.equal(ctx.validateResult({fields:{...fields,name:null},checks:{eanRechecked:true}}).plu,'3476');
assert.equal(ctx.validateResult({fields:{...fields,name:'CITRON'},checks:{eanRechecked:true}}).plu,'3476');
assert(ctx.validateResult({fields:{...fields,name:null},guidedEAN:true,checks:{eanRechecked:true}}).error);
assert.equal(read.plu,'3476','Le PLU provient uniquement du catalogue');
assert.equal(read.catalogPrefix,'0203476');
assert.equal(read.grams,3960);
assert.equal(read.rate,349);
assert.equal(ctx.validateResult({fields:{...fields,ean13:code('0209999',1382)},checks:{}}).error.includes('Catalogue DIGI'),true);
raw=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'},
 {plu:'9876',libelle:'CITRON VERT',eanPrefix:'0203476'}
]});
assert(ctx.validateResult({fields,checks:{}}).error.includes('plusieurs articles'));
raw=null;
assert(ctx.validateResult({fields,checks:{}}).error.includes('Importe le catalogue'));
const render=source('function renderEanBars(container,ean,officialPLU){','function display(result,wallMs)');
assert(render.includes('String(officialPLU)'));
assert(!render.includes('ean.slice(3,7)'),'PLU non déduit du préfixe EAN');
assert(!js.includes("if(kind==='name')continue;"),'Relire le nom manquant');
assert(js.includes('plu:proposal.plu'),'PLU transmis au suivi');
assert(app.includes('digi.plu!==plu||digi.name!==product'),'Nom forgé bloqué au stockage');
assert(app.includes("if(x.source==='gemini')"),'Conserver les informations dans les bilans');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(html.includes('digi-catalog-lookup.js?v='+version));
assert(html.indexOf('digi-catalog-lookup.js?v='+version)<
 html.indexOf('gemini-lab.js?v='+version));
assert(sw.includes('digi-catalog-lookup.js?v='+version));
assert(html.includes('<option value="name">Article</option>'));
console.log('OK : EAN lu complet, nom/PLU DIGI uniques, aucune identité déduite');
