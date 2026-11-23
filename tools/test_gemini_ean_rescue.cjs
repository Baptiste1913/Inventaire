'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('gemini-ean.js','utf8');
const window={};
vm.runInNewContext(js,{window});
const engine=window.IUGeminiEAN;
assert(engine?.decode95&&engine?.lineCode,'Décodage EAN-13 local absent');
const L=['0001101','0011001','0010011','0111101','0100011','0110001',
 '0101111','0111011','0110111','0001011'];
const G=['0100111','0110011','0011011','0100001','0011101','0111001',
 '0000101','0010001','0001001','0010111'];
const R=['1110010','1100110','1101100','1000010','1011100','1001110',
 '1010000','1000100','1001000','1110100'];
const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
 'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
function checksum(first12){
 let s=0;for(let i=0;i<12;i++)s+=Number(first12[i])*(i%2?3:1);
 return String((10-s%10)%10);
}
function modules(code){
 return '101'+[...code.slice(1,7)].map((v,i)=>
  (parity[Number(code[0])][i]==='L'?L:G)[Number(v)]).join('')+
  '01010'+[...code.slice(7)].map(v=>R[Number(v)]).join('')+'101';
}
for(const first12 of ['020347601384','020663209059','020347601789',
 '220347601384','920347601384']){
 const code=first12+checksum(first12);
 const bits=modules(code);
 assert.equal(bits.length,95);
 assert.equal(engine.decode95(bits),code,'Les chiffres 7, 8, 9 doivent être reconnus à droite');
 const stripe=[...'0'.repeat(24)+bits+'0'.repeat(24)]
  .flatMap(bit=>Array(4).fill(bit==='1'?25:237));
 assert.equal(engine.lineCode(stripe)[0]?.code,code,'Lecture directe avec barres nettes');
 assert.equal(engine.lineCode(stripe,.43)[0]?.code,code,'Seuil bas fiable');
 assert.equal(engine.lineCode(stripe,.57)[0]?.code,code,'Seuil haut fiable');
 const changed=code.slice(0,12)+String((Number(code[12])+1)%10);
 assert.equal(engine.decode95(modules(changed)),null,'EAN au checksum incorrect rejeté');
}
assert(js.includes('scanRaster(original,iw,ih,1100)'),
 'Conserver le parcours de lecture historique en première intention');
assert(js.includes('scanRaster(original,iw,ih,1500,true)'),
 'Seconde passe uniquement quand la première est insuffisante');
assert(js.includes('v.rows.size>=2'),'Deux lignes réelles confirment l’EAN');
assert(js.includes("if(usual)return usual;"),'Ne pas ralentir les cas déjà reconnus');
console.log('OK : EAN-13 chiffres 0 à 9, clés, seuils, première passe puis secours conditionnel');
