'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('gemini-lab.js','utf8');
const begin=js.indexOf('async function prepareLabelDetail(source,confirmedOptical=null){');
const end=js.indexOf('async function imageBase64(source){',begin);
assert(begin>=0&&end>begin,'La vue secondaire doit prendre un repère optionnel');
const code=js.slice(begin,end);
async function exercise(mode){
 let draws=[],detected=0,readCount=0;
 const candidate={x:.19,y:.14,w:.63,h:.74};
 const opt={x:.23,y:.18,w:.55,h:.64};
 const geometry={
  opticalCrop(reading){
   if(mode==='optical'&&reading?.confirmed)return opt;
   return null;
  },
  detect(){
   detected++;
   if(mode==='good')return candidate;
   if(mode==='bad')return {x:.002,y:.03,w:.63,h:.74};
   return null;
  }
 };
 const ctx={
  window:{IUGeminiLabelGeometry:mode==='legacy'?null:geometry},
  decodePhoto:async()=>({naturalWidth:1200,naturalHeight:800}),
  document:{createElement:()=>({
   width:0,height:0,
   getContext(){return {
    drawImage(...args){draws.push(args)},
    getImageData(){return {width:240,height:160,
     data:new Uint8ClampedArray(240*160*4)}}
   }},
   toBlob(cb){cb({size:1000})}
  })},
  FileReader:class{
   readAsDataURL(){
    readCount++;this.result='data:image/jpeg;base64,'+'A'.repeat(300);
    this.onload?.();
   }
  }
 };
 const fn=vm.runInNewContext(code+';prepareLabelDetail',ctx);
 const result=await fn({type:'image/jpeg',size:350000},
  mode==='optical'?{confirmed:true,bounds:{left:.3,right:.6,y:.75,slope:0}}:null);
 assert(result&&result.length===300,'Un seul JPEG secondaire borné');
 assert.equal(readCount,1);
 assert(draws.length>=1,'Le recadrage doit être dessiné');
 const last=draws[draws.length-1];
 return {x:last[1],y:last[2],w:last[3],h:last[4],detected};
}
(async()=>{
 const legacy=await exercise('legacy');
 assert.deepEqual([legacy.x,legacy.y,legacy.w,legacy.h],
  [78,56,1044,688],'Ne pas modifier le recadrage habituel');
 const good=await exercise('good');
 assert.deepEqual([good.x,good.y,good.w,good.h],
  [228,112,756,592],'Le papier réel fournit un meilleur détail');
 const optical=await exercise('optical');
 assert.deepEqual([optical.x,optical.y,optical.w,optical.h],
  [276,144,660,512],'La lecture optique confirmée localise le détail');
 assert.equal(optical.detected,0,'Une confirmation optique évite la détection papier');
 const bad=await exercise('bad');
 assert.deepEqual([bad.x,bad.y,bad.w,bad.h],
  [78,56,1044,688],'Étiquette en bordure : repli sans risque');
 assert(js.includes("const detailTask=samePhotoTask(file,true)"));
 assert(js.includes("prepareLabelDetail(file,localBarcode).catch(()=>null)"));
 assert(js.includes("samePhotoTask(file),until(track(detailTask),detailDeadline)"));
 assert(js.includes("const safeDetail=detail=>detail&&detail.length+encoded.length<=750000"));
 assert(js.includes("targets.length===1&&targets[0]==='ean'"));
 console.log('OK : photo entière conservée, détail optique/papier, repli géométrique');
})().catch(e=>{console.error(e);process.exitCode=1});
