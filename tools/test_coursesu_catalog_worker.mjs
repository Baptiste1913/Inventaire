import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../workers/coursesu-live-worker.js',import.meta.url),'utf8').split('export default {')[0];
const ctx=vm.createContext({});
vm.runInContext(src+'\nglobalThis.api={validEAN13,confirmedKgRate,verifiedCatalogRow};',ctx);
const {validEAN13,confirmedKgRate,verifiedCatalogRow}=ctx.api;
// Identifiants fictifs, aucun export magasin privé dans le dépôt.
function checkdigit(part){
 let sum=0;for(let i=0;i<12;i++)sum+=Number(part[i])*(i%2?3:1);
 return String((10-sum%10)%10);
}
const eanBase='020123400000',ean=eanBase+checkdigit(eanBase);
const prefix='0201234';
const row={extId:'1234567',ean,name:'Radis rond',storeExtId:68539,
 storeName:'St germain',currency:'EUR',price:1.49,capacityVolume:1,capacityUnit:'kg'};
const match={productId:'1234567',catalogEan:ean,expectedName:'Radis rond',
 expectedStoreName:'St germain',expectedStorePostcode:'10120'};
assert.equal(validEAN13(ean),true);
assert.equal(verifiedCatalogRow(row,match,'68539',prefix),true);
assert.equal(verifiedCatalogRow({...row,ean:ean.slice(0,-1)+'0'},match,'68539',prefix),ean.at(-1)==='0');
assert.equal(verifiedCatalogRow({...row,ean:'020999900000'+checkdigit('020999900000')},match,'68539',prefix),false);
assert.equal(verifiedCatalogRow({...row,storeExtId:12345},match,'68539',prefix),false);
assert.equal(verifiedCatalogRow({...row,name:'Radis noir'},match,'68539',prefix),false);
assert.equal(verifiedCatalogRow({...row,storeName:'Ville voisine'},match,'68539',prefix),false);
assert.equal(verifiedCatalogRow({...row,storeAddress:'10130 Autre ville'},match,'68539',prefix),false);
assert.equal(verifiedCatalogRow({...row,currency:'USD'},match,'68539',prefix),false);
assert.equal(verifiedCatalogRow(row,{...match,catalogEan:'0209999000000'},'68539',prefix),false);
assert.equal(verifiedCatalogRow(row,match,'68538',prefix),false);
assert.equal(verifiedCatalogRow(row,match,'68539','0209999'),false);
const verified={...match,productUrl:'https://www.coursesu.com/p/radis/1234567.html',
 packVerifiedSource:'https://www.coursesu.com/p/radis/1234567.html',
 packVerifiedAt:'2026-11-20',verifiedPackGrams:750,sameRetailOfferVerified:true};
assert.equal(confirmedKgRate(row,verified).price,1.99);
assert.equal(confirmedKgRate(row,{...verified,sameRetailOfferVerified:false}),null);
assert.equal(confirmedKgRate(row,{...verified,verifiedPackGrams:1000,packVerifiedAt:'2026-01-01'}),null);
assert.equal(confirmedKgRate({...row,currency:'USD'},verified),null);
assert.equal(confirmedKgRate({...row,pricePerKg:1.99,pricePerKgUnit:'EUR/kg'},{}).price,1.99);
console.log('OK : correspondance EAN exacte du catalogue et refus de tout produit/magasin ambigu');
