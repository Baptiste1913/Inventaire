'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const script=fs.readFileSync('gemini-parallel.js','utf8');
const local=fs.readFileSync('gemini-lab.js','utf8');
const imgWorker=fs.readFileSync('gemini-image-worker.js','utf8');
const ean=fs.readFileSync('gemini-ean.js','utf8');
const geometry=fs.readFileSync('gemini-label-geometry.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(!imgWorker.includes('fetch('),'Le traitement doit rester strictement local');
assert(imgWorker.includes('importScripts('),'Web Worker classique Safari');
assert(imgWorker.includes('function clahe('),'CLAHE conditionnel présent');
assert(imgWorker.includes('if((contrast.range>=110||contrast.range<12)&&!rotate)return null;'),
 'Aucun CLAHE pour les images déjà suffisamment contrastées');
assert(imgWorker.includes("result=await self.IUGeminiEAN.read(photo);"),
 'Le décodeur historique EAN reste prioritaire dans le Web Worker');
assert(imgWorker.includes("self.IUZxingEAN?.read(photo)"),
 'ZXing est uniquement appelé en secours du décodeur EAN');
assert(imgWorker.includes("jpeg.size<=122000"),'Détail JPEG respectant le budget');
assert(ean.includes("typeof OffscreenCanvas==='function'"),
 'Décodage des lignes via canvas hors thread');
assert(ean.includes("adaptiveLine(values)"),'Seuillage glissant en secours uniquement');
assert(geometry.includes("typeof self!=='undefined'?self:null"),
 'Le lecteur de contours est disponible en Worker');
const parallelVersion=(html.match(/gemini-parallel\.js\?v=([\d.]+)/)||[])[1];
const imageWorkerVersion=(sw.match(/gemini-image-worker\.js\?v=([\d.]+)/)||[])[1];
assert(parallelVersion&&imageWorkerVersion,'Les deux Workers doivent rester déclarés');
assert(sw.includes('gemini-parallel.js?v='+parallelVersion));
assert(sw.includes('gemini-image-worker.js?v='+imageWorkerVersion));
assert(html.indexOf('gemini-parallel.js?v='+parallelVersion)<
 html.indexOf('gemini-lab.js?v='+version),
 'Le gestionnaire parallèle doit être chargé avant le scanner');
assert(local.includes('window.IUGeminiParallel?.barcode(chosen)'));
assert(local.includes('window.IUGeminiParallel?.enhancedDetail(file,'));
assert(local.includes('blob?.size>490000&&Math.max(cv.width,cv.height)>1920'));
assert(local.includes('fullResolutionCameraFrame(2160)'));
const photo={name:'simulated-jpeg',size:12000,type:'image/jpeg'};
const messages=[];
let created=0,terminated=0;
class FakeWorker{
 constructor(url){this.url=url;created++;}
 postMessage(message){
  messages.push(message);
  Promise.resolve().then(()=>this.onmessage({data:{
   id:message.id,result:message.kind==='barcode'
    ?{ean13:'0203476013844',confirmed:true,source:'optical'}
    :{size:4500,type:'image/jpeg'}
  }}));
 }
 terminate(){terminated++;}
}
const fallbackCalls=[];
const window={
 Worker:FakeWorker,OffscreenCanvas:class{},
 createImageBitmap:()=>{},
 IUGeminiEAN:{read:async blob=>{fallbackCalls.push(blob);return {ean13:'legacy'}}}
};
const ctx=vm.createContext({window,setTimeout,clearTimeout,Promise,Map,Object,Number});
vm.runInContext(script,ctx);
const api=window.IUGeminiParallel;
(async()=>{
 assert(api&&api.available());
 const results=await Promise.all([
  api.barcode(photo),api.enhancedDetail(photo,{confirmed:true})
 ]);
 assert.equal(results[0].ean13,'0203476013844');
 assert.equal(results[1].size,4500);
 assert.equal(created,1,'Un seul Web Worker réutilisé');
 assert.deepEqual(messages.map(x=>x.kind),['barcode','enhanced-detail']);
 assert.equal(fallbackCalls.length,0,'Ne pas lancer le vieux lecteur en doublon');
 api.close();
 assert.equal(terminated,1,'Arrêt propre du Worker');

 const legacyWindow={IUGeminiEAN:{read:async()=>
  ({ean13:'legacy',confirmed:true})}};
 const fallback=vm.createContext({window:legacyWindow,setTimeout,clearTimeout,Promise,Map,Object,Number});
 vm.runInContext(script,fallback);
 assert.equal((await legacyWindow.IUGeminiParallel.barcode(photo)).ean13,'legacy',
  'Si Worker est absent, lecture locale historique intacte');
 assert.equal(await legacyWindow.IUGeminiParallel.enhancedDetail(photo,null),null,
  'Le filtre reste optionnel en cas d’incompatibilité');

 class CrashingWorker{
  constructor(){}
  postMessage(){Promise.resolve().then(()=>this.onerror({message:'Unsupported'}));}
  terminate(){}
 }
 const brokenWindow={Worker:CrashingWorker,OffscreenCanvas:class{},
  createImageBitmap:()=>{},IUGeminiEAN:{read:async()=>({ean13:'legacy-after-error'})}};
 const broken=vm.createContext({window:brokenWindow,setTimeout,clearTimeout,Promise,Map,Object,Number});
 vm.runInContext(script,broken);
 assert.equal((await brokenWindow.IUGeminiParallel.barcode(photo)).ean13,
  'legacy-after-error','Crash Web Worker => retour au lecteur d’origine');
 class EmptyWorker{
  postMessage(message){
   Promise.resolve().then(()=>this.onmessage({data:{id:message.id,result:null}}));
  }
  terminate(){}
 }
 let localRuns=0;
 const emptyWindow={Worker:EmptyWorker,OffscreenCanvas:class{},
  createImageBitmap:()=>{},IUGeminiEAN:{read:async()=>{
   localRuns++;return {ean13:'verified-by-legacy'};
  }}};
 const empty=vm.createContext({window:emptyWindow,setTimeout,clearTimeout,Promise,Map,Object,Number});
 vm.runInContext(script,empty);
 assert.equal((await emptyWindow.IUGeminiParallel.barcode(photo))?.ean13,
  'verified-by-legacy','Worker sans lecture => secours historique');
 assert.equal((await emptyWindow.IUGeminiParallel.barcode(photo))?.ean13,
  'verified-by-legacy');
 assert.equal(localRuns,1,'Ne pas redécoder plusieurs fois la même photo');

 class HungWorker{
  postMessage(){}
  terminate(){}
 }
 const hangingWindow={Worker:HungWorker,OffscreenCanvas:class{},
  createImageBitmap:()=>{},IUGeminiEAN:{read:async()=>({ean13:'legacy-timeout'})}};
 const fakeClock={
  setTimeout(callback,ms){
   if(ms===4500)Promise.resolve().then(callback);
   return 1;
  },
  clearTimeout(){}
 };
 const hung=vm.createContext({window:hangingWindow,Promise,Map,Object,Number,
  ...fakeClock});
 vm.runInContext(script,hung);
 assert.equal((await hangingWindow.IUGeminiParallel.barcode(photo))?.ean13,
  'legacy-timeout','Worker bloqué => reprise locale sans EAN perdu');
 console.log('OK : EAN/CLAHE hors thread, secours sur erreur, résultat vide et délai, déduplication');
})().catch(error=>{console.error(error);process.exitCode=1});
