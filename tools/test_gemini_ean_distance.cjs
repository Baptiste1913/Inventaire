'use strict';
/* v42.43 — Safari distant : 4K facultative, EAN-13 seul, chiffres OCR locaux. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const lab=fs.readFileSync('gemini-lab.js','utf8');
const printed=fs.readFileSync('gemini-ean-printed.js','utf8');
const zxing=fs.readFileSync('gemini-zxing.js','utf8');
const ean=fs.readFileSync('gemini-ean.js','utf8');
const worker=fs.readFileSync('gemini-image-worker.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(lab.includes('width:{ideal:3840},height:{ideal:2160}'),
 'Le capteur arrière est demandé en haute résolution, sans minimum bloquant');
assert(lab.includes('frameRate:{ideal:24,max:30}'),
 'La capture 4K ne doit pas entraîner 60 images/s inutiles');
assert(lab.includes('getSettings?.()')&&lab.includes('cameraShell.dataset.videoResolution'),
 'Safari doit indiquer la résolution réellement négociée');
assert(lab.includes('localEdge=Math.max(video.videoWidth,video.videoHeight)>=2880?2880:2160'),
 'La photographie locale exploite les pixels natifs si possible');
assert(lab.includes('barcodePhoto:barcodeOriginal!==blob?barcodeOriginal:null'),
 'La lecture EAN utilise le fichier haute définition et Gemini le JPEG compressé');
assert(lab.includes('barcodeSource=barcodePhoto||chosen'),
 'Les photos importées conservent le chemin EAN original');
assert(zxing.includes("formats:['EAN13']")&&
 ean.includes("formats:['ean_13']")&&
 worker.includes("self.IUZxingEAN?.read(photo)"),
 'Aucun format QR, DataMatrix ou Code39 ne doit être ajouté au flux EAN');
assert(lab.includes('verifyTwice:true')&&lab.includes('await ensureLocalOcr()'),
 'L OCR imprimé ne démarre qu en secours et sur un moteur local');
assert(lab.includes('const finalDeadline=performance.now()+110'),
 'Attente OCR bornée pour ne pas bloquer les inventaires');
assert(printed.includes("tessedit_char_whitelist:'0123456789'")&&
 printed.includes("tessedit_pageseg_mode:'7'"),
 'Tesseract ne doit chercher que les chiffres de la ligne');
assert(lab.includes('function applyPrintedEAN(result,printed)')&&
 lab.includes("window.IUDigiCatalogLookup?.resolve(printed.ean13)"),
 'Pas d EAN OCR adopté sans catalogue DIGI');
assert(html.includes('gemini-ean-printed.js?v='+version));
assert(sw.includes('gemini-ean-printed.js?v='+version));
assert(html.includes('gemini-lab.js?v='+version));
assert(sw.includes('gemini-lab.js?v='+version));
const ctx=vm.createContext({module:{exports:{}},window:null});
vm.runInContext(printed,ctx);
const api=ctx.module.exports;
const code='0203476013844';
assert.equal(api.valid(code),true);
assert.equal(api.parse('0 203476 013844')?.ean13,code);
assert.equal(api.parse('0 203476 013845'),null,'EAN erroné refusé');
assert.equal(api.promote({ean13:code,confidence:92},{ean13:code,confidence:91})?.confirmed,true);
assert.equal(api.promote({ean13:code,confidence:92},null)?.confirmed,false);
assert.equal(api.promote({ean13:code,confidence:92},{ean13:code,confidence:62})?.confirmed,false);
assert.equal(api.promote({ean13:code,confidence:92},{ean13:'2812955005160',confidence:99})?.ambiguous,true);
let reads=0,params=[],closed=0;
const fakeWin={};
const fakeCtx={drawImage(){},filter:'none'};
const fakeDoc={createElement(){return {width:0,height:0,getContext(){return fakeCtx}}}};
const fakeVM=vm.createContext({
 window:fakeWin,document:fakeDoc,
 createImageBitmap:async()=>({width:1600,height:1200,close(){closed++}})
});
vm.runInContext(printed,fakeVM);
const engine={
 setParameters:async p=>params.push(p),
 recognize:async()=>{reads++;return {data:{text:'0 203476 013844',confidence:93}}}
};
async function run(){
 const result=await fakeWin.IUGeminiPrintedEAN.read({type:'image/jpeg'},{
  engine,verifyTwice:true
 });
 assert.equal(result?.ean13,code);
 assert.equal(result?.confirmed,true,'Deux bandes identiques de la même photo');
 assert.equal(result?.evidenceCount,2);
 assert.equal(reads,2);
 assert.equal(params[0].tessedit_char_whitelist,'0123456789');
 assert.equal(params[1].tessedit_char_whitelist,'');
 assert.equal(closed,1);
 let i=0;
 const disagree=await fakeWin.IUGeminiPrintedEAN.read({type:'image/jpeg'},{
  engine:{recognize:async()=>({data:{
   text:++i===1?'0 203476 013844':'0 203476 013845',confidence:96
  }})},verifyTwice:true
 });
 assert.equal(disagree?.confirmed,false,'Une lecture fausse ne devient pas fiable');
 const first=lab.indexOf(' function applyPrintedEAN(');
 const last=lab.indexOf(' function mergeRecoveredReading(',first);
 assert(first>0&&last>first);
 const special=lab.slice(first,last);
 const p=vm.createContext({
  window:{IUDigiCatalogLookup:{resolve:()=>({ok:true,name:'TEST',plu:'3476'})}},
  localBarcode:null,Number,Math,
  eanCheck:(digits)=>{let s=0;for(let n=0;n<12;n++)s+=Number(digits[n])*(n%2?3:1);
   return String((10-s%10)%10)},
  readableValue:(kind,value)=>kind==='ean'&&api.valid(value),
  trustedBarcodeEvidence:()=>false,
  reconcileBarcode:(result,reading)=>({
   ...result,fields:{...result.fields,ean13:reading.ean13},
   opticalEAN:reading.source
  })
 });
 vm.runInContext(special+';this.apply=applyPrintedEAN;',p);
 const blank={fields:{ean13:null,totalCents:211},checks:{}};
 const promoted=p.apply(blank,{ean13:code,confirmed:true,evidenceCount:2,confidence:94});
 assert.equal(promoted.fields.ean13,code,'OCR cohérent et catalogue -> EAN restauré');
 assert.equal(p.localBarcode?.confirmed,true);
 p.localBarcode=null;
 const single=p.apply(blank,{ean13:code,confirmed:false,evidenceCount:1,confidence:99});
 assert.equal(single.fields.ean13,null,'Une seule lecture imprimée ne suffit pas');
 p.localBarcode=null;
 const wrongTotal=p.apply({fields:{ean13:null,totalCents:800},checks:{}},
  {ean13:code,confirmed:true,evidenceCount:2,confidence:94});
 assert.equal(wrongTotal.fields.ean13,null,'Montant DIGI divergent -> OCR refusé');
 console.log('OK : 4K optionnelle, EAN-13 seul, OCR local concordant, refus ambiguïté/erreur');
}
run().catch(error=>{console.error(error);process.exitCode=1});
