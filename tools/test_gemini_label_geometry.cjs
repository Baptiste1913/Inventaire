'use strict';
const assert=require('node:assert/strict');
const geom=require('../gemini-label-geometry.js');
function frame(width=240,height=170,paper={x:39,y:22,w:162,h:128},background=58){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const inside=paper&&x>=paper.x&&x<paper.x+paper.w&&
   y>=paper.y&&y<paper.y+paper.h;
  let value=inside?238:background;
  if(inside&&y>=paper.y+paper.h*.58&&y<paper.y+paper.h*.85&&
     x>=paper.x+paper.w*.10&&x<paper.x+paper.w*.56&&
     (Math.floor(x/3)%2===0))value=33;
  const i=(y*width+x)*4;
  data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
 }
 return {width,height,data};
}
const clear=geom.detect(frame());
assert(clear&&clear.source==='paper-outline','Étiquette claire détectée');
assert(clear.x<39/240&&clear.y<22/170,'Marges conservées');
assert(clear.x+clear.w>(39+162)/240);
assert(clear.y+clear.h>(22+128)/170);
assert.equal(geom.detect(frame(240,170,null)),null,'Ne pas inventer un cadre sur fond vide');
assert.equal(geom.detect(frame(240,170,{x:20,y:10,w:199,h:149},245)),null,
 'Un fond presque aussi clair ne donne pas de contour fiable');
assert.equal(geom.detect(frame(240,170,{x:0,y:0,w:240,h:170})),null,
 'Ne pas recadrer une étiquette tronquée aux bords');
assert.equal(geom.detect(frame(240,170,{x:110,y:14,w:120,h:141})),null,
 'Refuser une étiquette coupée sur le bord');
assert.equal(geom.opticalCrop({confirmed:false,bounds:{left:.2,right:.5,y:.75,slope:0}},1400,1000),null);
assert.equal(geom.opticalCrop({confirmed:true,ambiguous:true,bounds:{left:.2,right:.5,y:.75,slope:0}},1400,1000),null);
assert.equal(geom.opticalCrop({confirmed:true,bounds:{left:.2,right:.5,y:.75,slope:.2}},1400,1000),null);
const unknown=geom.detect(frame(240,170,null));
assert.equal(unknown,null);
console.log('OK : détection prudente du contour DIGI et refus des cadrages incertains');
