'use strict';
// Test du vrai code de filtrage du Worker avec des images synthétiques.
// Pas de GPU ni d'appel API externe : validation du comportement facultatif.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('gemini-image-worker.js','utf8');

async function simulate(mode,slope=0){
 const events={clahe:0,encoded:0,rotations:0,answers:[]};
 class FakeCanvas{
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){
   const owner=this;
   return {
    fillStyle:'#fff',
    drawImage(){},
    translate(){},
    rotate(){events.rotations++;},
    scale(){},
    fillRect(){},
    putImageData(){events.clahe++;},
    getImageData(){
     const data=new Uint8ClampedArray(owner.width*owner.height*4);
     for(let y=0;y<owner.height;y++)for(let x=0;x<owner.width;x++){
      const i=(y*owner.width+x)*4;
      const dark=(x%10)<3;
      const v=mode==='good'?(dark?28:232):
       mode==='faded'?(dark?170:215):207;
      data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
     }
     return {width:owner.width,height:owner.height,data};
    }
   };
  }
  async convertToBlob(){events.encoded++;return {size:5100,type:'image/jpeg'};}
 }
 const self={
  IUGeminiEAN:{read:async()=>({ean13:'valid',confirmed:true})},
  IUGeminiLabelGeometry:{
   opticalCrop:()=>({x:.20,y:.16,w:.61,h:.67}),
   detect:()=>null
  },
  postMessage(message){events.answers.push(message);}
 };
 const ctx=vm.createContext({
  self,OffscreenCanvas:FakeCanvas,
  createImageBitmap:async()=>({width:1000,height:800,close(){}}),
  importScripts:()=>{},Uint8ClampedArray,Uint8Array,Uint32Array,
  Float64Array,Promise,Math,Number
 });
 vm.runInContext(source,ctx);
 await self.onmessage({data:{
  id:1,kind:'enhanced-detail',photo:{size:130000,type:'image/jpeg'},
  reading:{confirmed:true,bounds:{left:.2,right:.48,y:.73,slope}}
 }});
 assert.equal(events.answers.length,1);
 assert.equal(events.answers[0].id,1);
 return {events,result:events.answers[0].result};
}
(async()=>{
 const good=await simulate('good');
 assert.equal(good.result,null,'Une bonne photo ne doit PAS être transformée');
 assert.equal(good.events.clahe,0);
 assert.equal(good.events.encoded,0);
 const blank=await simulate('uniform');
 assert.equal(blank.result,null,'Fond vide sans caractères : pas de filtre');
 assert.equal(blank.events.encoded,0);
 const faded=await simulate('faded');
 assert(faded.result&&faded.result.size===5100,
  'Papier thermique délavé : un détail renforcé peut être généré');
 assert(faded.events.clahe>=1,'CLAHE bien exécuté hors thread');
 assert(faded.events.encoded>=1);
 const tilted=await simulate('good',.067);
 assert(tilted.result&&tilted.events.rotations>=1,
  'Redressement seulement sur une orientation optiquement connue');
 assert.equal(tilted.events.clahe,0,
  'Ne pas appliquer CLAHE à une bonne photo même inclinée');
 console.log('OK : CLAHE seulement si nécessaire, aucune modification d’une bonne photo, redressement en secours');
})().catch(e=>{console.error(e);process.exitCode=1});
