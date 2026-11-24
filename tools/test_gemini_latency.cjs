'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const latency=require('../gemini-latency.js');
const lab=fs.readFileSync('gemini-lab.js','utf8'),html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
const worker=fs.readFileSync('gemini-litert-worker.js','utf8'),ui=fs.readFileSync('gemini-litert-lab.js','utf8');
const scope={self:{}};
vm.runInNewContext(worker+';this.decode=decodeCTC;',scope);
function testCTC(s){
 const chars=['','0','1','2','3','4','5','6','7','8','9',' '],ids=[];
 for(const d of s)ids.push(0,chars.indexOf(d));
 const data=new Float32Array(ids.length*chars.length);
 for(let i=0;i<ids.length;i++)data[i*chars.length+ids[i]]=1;
 return scope.decode(data,chars);
}
assert.equal(testCTC('0203476013844').pattern,'0203476013844');
assert.equal(testCTC('020347601384'),null);
assert.equal(testCTC('0 203476 013844').pattern,'0203476013844');
assert(worker.includes('ppocr_rec_fp32_webgpu.tflite')&&worker.includes('ppocr_rec_fp32.tflite'));
assert(ui.includes('if(!enabled()||!ready||busy||!photo)return null'));
assert(lab.includes('preparedBarcode:chosen.jpeg===barcodeOriginal?chosen.preparedBarcode:null'));
assert(lab.includes('const localDeadline=performance.now()+350'));
assert(lab.includes('const finalDeadline=performance.now()+110'));
assert(lab.indexOf('void opticalTask.promise.then(reading=>')<lab.indexOf('const received=await requestGeminiWithRecovery'));
for(const name of ['gemini-latency.js','gemini-litert-lab.js'])assert(html.includes(name+'?v=42.47')&&sw.includes(name+'?v=42.47'));
assert(sw.includes('gemini-litert-worker.js?v=42.47'));
(async()=>{
 let resolve;
 const task=latency.track(new Promise(r=>{resolve=r}));
 assert.equal(await latency.until(task,0,()=>0),null);
 resolve('ean');await task.promise;
 assert.equal(await latency.until(task,0,()=>0),'ean');
 const broken=latency.track(Promise.reject(Error('local')));
 assert.equal(await broken.promise,null);assert.equal(broken.done,true);
 console.log('OK : échéance partagée, résultat tardif, CTC, prétraitement exact, LiteRT optionnel');
})().catch(e=>{console.error(e);process.exitCode=1});
