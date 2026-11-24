'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lab=fs.readFileSync('gemini-lab.js','utf8'),worker=fs.readFileSync('gemini-image-worker.js','utf8'),parallel=fs.readFileSync('gemini-parallel.js','utf8');
const select=vm.runInNewContext(lab.slice(lab.indexOf(' async function chooseVisualDetail('),lab.indexOf(' function samePhotoTask('))+';chooseVisualDetail');
const entry=(kind,value,done=true)=>({kind,task:{value,done}});
const until=async(t,d)=>t.done?t.value:null,usable=d=>typeof d==='string'&&d.length<=20&&d.length>0;
(async()=>{
 const enhanced=entry('amélioré','filtered'),normal=entry('original','raw');
 assert.equal((await select(enhanced,normal,280,until,usable)).kind,'amélioré');
 assert.equal((await select(entry('amélioré',null),normal,280,until,usable)).data,'raw');
 assert.equal((await select(entry('amélioré',null,false),normal,280,until,usable)).data,'raw');
 assert.equal((await select(entry('amélioré','x'.repeat(21)),normal,280,until,usable)).data,'raw');
 assert.equal((await select(normal,enhanced,280,until,usable,'raw')).data,'filtered');
 assert.equal(await select(entry('amélioré',null),normal,280,until,usable,'raw'),null);
 assert.equal(await select(entry('amélioré',null),entry('original',null),280,until,usable),null);
 assert(lab.indexOf('void samePhotoEnhanced(barcodeSource);')<lab.indexOf('analyze.click();',lab.indexOf('void samePhotoEnhanced(barcodeSource);')));
 assert(lab.includes('if(resumeFields?.length||usedComplementaryRead)targets=[];'));
 assert(lab.includes('if((!error?.unreadable&&!error?.timeout)||id!==generation||currentAbort.signal.aborted'));
 assert(lab.includes('if(usedComplementaryRead&&targets.length)'));
 assert(lab.includes('cachedEnhanced=null;cachedFocused.clear();cachedGuided=null;attempts.clear();generation++'));
 assert(lab.includes('const encoded=await samePhotoTask(file)'));
 assert(lab.includes('safeDetail(firstDetail?.data)'));
 assert(parallel.includes('gemini-image-worker.js?v=42.58&detail=1'));
 assert(worker.includes('jpeg.size<=limit'));
 let imports=[],answers=[];
 class FakeCanvas{
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){const cv=this;return {drawImage(){},putImageData(){},getImageData(){const data=new Uint8ClampedArray(cv.width*cv.height*4);for(let i=0;i<data.length;i+=4){const x=(i/4)%cv.width,v=x%10<3?170:215;data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}return {width:cv.width,height:cv.height,data}}};}
  async convertToBlob(){return {size:5100,type:'image/jpeg'}}
 }
 const self={location:{search:'?v=42.52&detail=1'},IUGeminiLabelGeometry:{detect:()=>null,opticalCrop:()=>null},postMessage:m=>answers.push(m)};
 vm.runInNewContext(worker,{self,importScripts:(...p)=>imports.push(...p),OffscreenCanvas:FakeCanvas,createImageBitmap:async()=>({width:1000,height:800,close(){}})});
 assert.equal(imports.length,2);
 await self.onmessage({data:{id:1,kind:'enhanced-detail',photo:{},maxBytes:6000}});
 assert.equal(answers[0].result.size,5100);
 await self.onmessage({data:{id:2,kind:'enhanced-detail',photo:{},maxBytes:5000}});
 assert.equal(answers[1].result,null);
 console.log('OK : première vue améliorée prioritaire, fallback borné, relecture complémentaire, limite JPEG et Worker dédié');
})().catch(e=>{console.error(e);process.exitCode=1});
