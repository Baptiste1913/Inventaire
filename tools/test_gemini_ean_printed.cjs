'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parse,valid,roi}=require('../gemini-ean-printed.js');
assert(valid('0203476013844'));
assert.equal(parse('0 203476 013844')?.ean13,'0203476013844');
assert.equal(parse('0203476013844',83)?.confidence,83);
assert.equal(parse('CAROTTE\n0 203476 013844\n2,11 €')?.ean13,'0203476013844');
assert.equal(parse('203476 013844'),null,'12 chiffres ne sont pas complétés');
assert.equal(parse('0203476013845'),null,'Clé EAN invalide');
assert.equal(parse('Produit 0 203476 013844'),null,'Ne pas lire une ligne contenant du texte');
assert.equal(parse('0 203476 013844 22'),null,'Ne pas fabriquer un EAN depuis un prix');
assert.equal(parse('0 203476 013844',38),null,'OCR trop incertain');
assert.equal(parse('0203476013844\n0206632090597')?.ambiguous,true,
 'Plusieurs EAN indépendants : indéterminé');
const hints={labelRect:{x:.35,y:.12,w:.55,h:.78,source:'paper-outline'}};
const r=roi(hints);
assert(r.x>.35&&r.x+r.w<.91&&r.y>.64);
const win={};
let reads=0,closed=false;
const canvas={width:0,height:0,getContext(){
 return {drawImage(){reads++;}};
}};
const vmctx=vm.createContext({
 window:win,document:{createElement:()=>({...canvas,getContext:canvas.getContext})},
 createImageBitmap:async()=>({width:1200,height:900,close(){closed=true}})
});
vm.runInContext(fs.readFileSync('gemini-ean-printed.js','utf8'),vmctx);
(async()=>{
 const photo={type:'image/jpeg',size:12345};
 const success=await win.IUGeminiPrintedEAN.read(photo,{
  engine:{recognize:async()=>({data:{text:'0 203476 013844',confidence:91}})}
 });
 assert.equal(success?.ean13,'0203476013844');
 assert.equal(success?.confirmed,false,'Texte imprimé ≠ barres optiquement confirmées');
 assert.equal(reads,1);
 assert.equal(closed,true);
 const missing=await win.IUGeminiPrintedEAN.read(photo);
 assert.equal(missing,null,'Aucun moteur OCR chargé : aucune requête ni blocage');
 console.log('OK : chiffres imprimés OCR stricts, sans invention ni chargement réseau');
})().catch(error=>{console.error(error);process.exitCode=1});
