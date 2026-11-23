'use strict';
const assert=require('node:assert/strict');
const q=require('../gemini-frame-quality.js');
const width=360,height=208;
const zones={ean:{x:.14,y:.57,w:.41,h:.31},
 weight:{x:.46,y:.32,w:.19,h:.17},rate:{x:.15,y:.32,w:.19,h:.17}};
function image(){
 const d=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=4*(y*width+x);
  d[i]=d[i+1]=d[i+2]=235;d[i+3]=255;
 }
 return {width,height,data:d};
}
function paint(frame,box,step=5){
 const minX=Math.floor(box.x*width),maxX=Math.ceil((box.x+box.w)*width);
 const minY=Math.floor(box.y*height),maxY=Math.ceil((box.y+box.h)*height);
 for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){
  const ink=(Math.floor((x-minX)/step)+Math.floor((y-minY)/9))%2===0?25:236;
  const i=(y*width+x)*4;
  frame.data[i]=frame.data[i+1]=frame.data[i+2]=ink;
 }
}
function blur(frame){
 const out=image();
 for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
  let sum=0;
  for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)
   sum+=frame.data[((y+yy)*width+x+xx)*4];
  const i=(y*width+x)*4,value=Math.round(sum/9);
  out.data[i]=out.data[i+1]=out.data[i+2]=value;
 }
 return out;
}
const clear=image();Object.values(zones).forEach(box=>paint(clear,box));
const softened=blur(blur(clear));
const good=q.evaluate(clear,zones);
const poor=q.evaluate(softened,zones);
assert(good.score>poor.score+.06,'La photo nette est préférée à une photo floue');
for(const k of ['ean','weight','rate']){
 assert(good.regions[k]>poor.regions[k],
  'La netteté de '+k+' doit être mesurée indépendamment');
}
for(const k of ['ean','weight','rate']){
 const altered=image();
 for(const [key,box] of Object.entries(zones))paint(altered,box);
 const blurred=blur(blur(altered));
 const box=zones[k];
 for(let y=Math.floor(box.y*height);y<Math.ceil((box.y+box.h)*height);y++)
  for(let x=Math.floor(box.x*width);x<Math.ceil((box.x+box.w)*width);x++){
   const i=(y*width+x)*4;
   altered.data[i]=altered.data[i+1]=altered.data[i+2]=blurred.data[i];
  }
 assert(q.evaluate(altered,zones).regions[k]<good.regions[k],
  'Une zone floue ('+k+') pénalise sa propre note');
}
const empty=q.evaluate(image(),zones);
assert(empty.score<poor.score,'Un fond vide n’est pas accepté');
assert(q.sameScene(good,good),'Une image égale appartient à la même scène');
assert(!q.sameScene(good,empty),'Le fond vide est une scène différente');
const current={at:1000,epoch:1,rating:poor,canvas:{id:'live'}};
const previouslySharp={at:850,epoch:1,rating:good,canvas:{id:'buffer'}};
assert.equal(q.choose([previouslySharp],current,1000),previouslySharp,
 'Une photo préservée nette et récente remplace celle floue du clic');
assert.equal(q.choose([{...previouslySharp,at:450}],current,1000),current,
 'Aucune capture ancienne ne peut être reprise');
assert.equal(q.choose([{...previouslySharp,epoch:2}],current,1000),current,
 'Une ancienne session caméra ne peut pas servir');
assert.equal(q.choose([{...previouslySharp,rating:empty}],current,1000),current,
 'Ne jamais substituer une autre étiquette');
assert.equal(q.choose([],current,1000),current);
console.log('OK : contrôle EAN, poids, prix/kg, flou et tampon très récent sans confusion');
