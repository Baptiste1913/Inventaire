'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('gemini-image-worker.js','utf8');
const zx=fs.readFileSync('gemini-zxing.js','utf8');
const parallel=fs.readFileSync('gemini-parallel.js','utf8');
const lab=fs.readFileSync('gemini-lab.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const wasm=fs.readFileSync('vendor/zxing/zxing_reader.wasm');
const js=fs.readFileSync('vendor/zxing/reader.js','utf8');
assert.deepEqual([...wasm.subarray(0,4)],[0,97,115,109],
 'Le moteur doit être un vrai binaire WebAssembly');
assert(wasm.length>100000,'Moteur ZXing local non vide');
assert(js.includes('prepareZXingModule')&&js.includes('readBarcodes'),
 'Lecteur local ZXing complet');
assert(zx.includes("LOCAL_JS='./vendor/zxing/reader.js'"));
assert(zx.includes("LOCAL_WASM='./vendor/zxing/zxing_reader.wasm'"));
assert(!zx.includes('cdn.jsdelivr.net'),'Aucun CDN pour la lecture EAN');
assert(sw.includes("'./vendor/zxing/reader.js'"));
assert(sw.includes("'./vendor/zxing/zxing_reader.wasm'"));
assert(parallel.includes("kind:'warm-zxing'"));
assert(lab.includes('window.IUGeminiParallel?.preloadBarcode?.();'));
assert(source.indexOf('self.IUZxingEAN?.read(photo)')<
 source.indexOf('self.IUGeminiEAN.read(photo)'),
 'ZXing doit être le premier lecteur EAN');
let zxResult,throwZX=false;
const calls=[],messages=[];
const self={
 IUZxingEAN:{
  warm:async()=>{calls.push('warm');return true;},
  read:async()=>{calls.push('zxing');if(throwZX)throw Error('WASM inaccessible');return zxResult;}
 },
 IUGeminiEAN:{
  read:async()=>{calls.push('legacy');return {ean13:'0203476013844',confirmed:true};}
 },
 postMessage:p=>messages.push(p)
};
const ctx=vm.createContext({self,importScripts:()=>{},OffscreenCanvas:class{},
 createImageBitmap:async()=>({width:900,height:900}),Uint8Array,Uint32Array,
 Uint8ClampedArray,Float64Array,Promise,setTimeout,clearTimeout});
vm.runInContext(source,ctx);
const photo={type:'image/jpeg',size:120000};
(async()=>{
 await self.onmessage({data:{id:1,kind:'warm-zxing'}});
 assert.deepEqual(calls,['warm'],'Préchargement sans photo');
 assert.equal(messages.length,0,'Aucune pesée affichée pendant le préchauffage');
 calls.length=0;
 zxResult={ean13:'0203476013844',confirmed:true,source:'optical'};
 await self.onmessage({data:{id:2,kind:'barcode',photo}});
 assert.deepEqual(calls,['zxing'],'Aucun vieux décodeur si ZXing réussit');
 assert.equal(messages.at(-1).result.ean13,zxResult.ean13);
 calls.length=0;zxResult=null;
 await self.onmessage({data:{id:3,kind:'barcode',photo}});
 assert.deepEqual(calls,['zxing','legacy'],'Ancien lecteur automatique après échec ZXing');
 calls.length=0;throwZX=true;
 await self.onmessage({data:{id:4,kind:'barcode',photo}});
 assert.deepEqual(calls,['zxing','legacy'],'Erreur ZXing = secours sans crash');
 calls.length=0;throwZX=false;
 zxResult={ambiguous:true,confirmed:false,source:'optical'};
 await self.onmessage({data:{id:5,kind:'barcode',photo}});
 assert.deepEqual(calls,['zxing'],'Ne jamais forcer un code à la place d’une ambiguïté');
 assert.equal(messages.at(-1).result.ambiguous,true);
 console.log('OK : ZXing local principal, préchargement, secours automatique et sécurité EAN');
})().catch(error=>{console.error(error);process.exitCode=1});
