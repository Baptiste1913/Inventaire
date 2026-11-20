// Run: node tools/test_coursesu_catalog_worker.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../workers/coursesu-live-worker.js',import.meta.url),'utf8')
 .split('export default {')[0];
const ctx=vm.createContext({Date,Number,Math,String,Object,Set,Array});
vm.runInContext(src+'\nglobalThis.checks={validEAN13,confirmedKgRate};',ctx);
const {validEAN13,confirmedKgRate}=ctx.checks;
const url='https://www.coursesu.com/p/carotte/1892766.html';
const map={productUrl:url,packVerifiedSource:url,verifiedPackGrams:750,packVerifiedAt:'2026-11-20'};
const carotte={extId:'1892766',ean:'0203476000004',price:1.49,currency:'EUR',
 name:'Carotte',capacityVolume:1,capacityUnit:'kg'};
assert.equal(validEAN13(carotte.ean),true);
assert.equal(validEAN13('0203476000005'),false);
assert.equal(confirmedKgRate(carotte,map).price,1.99);
assert.equal(confirmedKgRate(carotte,map).source,'verified-packaging');
assert.equal(confirmedKgRate(carotte,{}),null);
assert.equal(confirmedKgRate(carotte,{...map,verifiedPackGrams:1000,packVerifiedAt:'2026-01-01'}),null);
assert.equal(confirmedKgRate({...carotte,currency:'USD'},map),null);
assert.equal(confirmedKgRate(carotte,{...map,packVerifiedSource:'https://example.org/p'}),null);
assert.equal(confirmedKgRate({...carotte,pricePerKg:1.99,pricePerKgUnit:'EUR/kg'},{}).price,1.99);
console.log('Tests OK : tarif €/kg, vérification conditionnement, refus des données incertaines.');
