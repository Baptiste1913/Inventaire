'use strict';
const assert=require('node:assert/strict');
let saved=null;
global.localStorage={getItem(key){
 assert.equal(key,'iu-plu-catalogue-local-v1');return saved;
}};
const digi=require('../digi-catalog-lookup.js');
function barcode(prefix,price='01384'){
 const first=prefix+price;
 assert.equal(first.length,12);
 let sum=0;
 for(let i=0;i<12;i++)sum+=Number(first[i])*(i%2===0?1:3);
 return first+String((10-sum%10)%10);
}
const first=barcode('0203476'),second=barcode('0205655','00350');
assert.equal(digi.resolve(first).status,'missing');
saved=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476',actif:true},
 {plu:'8325',libelle:'COURGETTE',eanPrefix:'0205655',actif:false}
]});
assert.deepEqual(digi.resolve(first),{
 ok:true,status:'matched',plu:'3476',name:'CITRON PRIMOFIORI',
 eanPrefix:'0203476',source:'digi-import'
});
assert.equal(digi.resolve(second).plu,'8325','Un produit inactif reste identifiable');
assert.equal(digi.verify(first,'3476','CITRON PRIMOFIORI'),true);
assert.equal(digi.verify(first,'9999','CITRON PRIMOFIORI'),false);
assert.equal(digi.verify(first,'3476','CITRON INVENTÉ'),false);
assert.equal(digi.resolve(first.slice(0,12)+'0').status,'invalid');
assert.equal(digi.resolve(barcode('0209999')).status,'unknown');
saved=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'},
 {plu:'9999',libelle:'AUTRE PRODUIT',eanPrefix:'0203476'}
]});
assert.equal(digi.resolve(first).status,'ambiguous');
assert.equal(digi.verify(first,'3476','CITRON PRIMOFIORI'),false);
saved=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'},
 {plu:'3476',libelle:'CITRON VERT',eanPrefix:'0203476'}
]});
assert.equal(digi.resolve(first).status,'ambiguous',
 'Même PLU avec noms différents ne peut être accepté');
saved=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'},
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'}
]});
assert.equal(digi.resolve(first).ok,true,'Doublon identique non ambigu');
saved=JSON.stringify({articles:[
 {plu:'3476',libelle:'CITRON PRIMOFIORI',eanPrefix:'0203476'}
]});
assert.equal(digi.resolve(first).ok,true,'Index reconstruit après un import');
saved='{"articles":[';
assert.equal(digi.resolve(first).status,'missing','Import corrompu refusé');
saved=null;
assert.equal(digi.resolve(first).status,'missing','Pas de données par défaut');
assert.equal(digi.catalogPrefix('0203476000000'),'0203476');
assert.equal(digi.catalogPrefix('0203476013844'),'','EAN variable non présent comme référence');
console.log('OK : catalogue DIGI unique, local, EAN complet et correspondances non inventées');
