'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Le code-barres est excentré et très court en hauteur : les balayages
// globaux le ratent, le crop du papier permet deux lignes convergentes.
const L=['0001101','0011001','0010011','0111101','0100011','0110001',
 '0101111','0111011','0110111','0001011'];
const R=['1110010','1100110','1101100','1000010','1011100',
 '1001110','1010000','1000100','1001000','1110100'];
const ean='0203476013844';
const bits='101'+[...ean.slice(1,7)].map(d=>L[+d]).join('')+
 '01010'+[...ean.slice(7)].map(d=>R[+d]).join('')+'101';
assert.equal(bits.length,95);
const original={width:1000,height:800};
const pixel=(x,y)=>{
 if(!(x>=425&&x<925&&y>=110&&y<690))return 38;
 const i=Math.floor((x-455)/4);
 if(y>=590&&y<614&&i>=0&&i<95)return bits[i]==='1'?22:237;
 return 237;
};
class FakeCanvas{
 constructor(w,h){this.width=w;this.height=h;}
 getContext(){
  const canvas=this;
  let sx=0,sy=0,sw=original.width,sh=original.height;
  return {
   drawImage(...args){
    if(args.length===9){
     sx=args[1];sy=args[2];sw=args[3];sh=args[4];
    }else{sx=0;sy=0;sw=original.width;sh=original.height;}
   },
   getImageData(){
    const data=new Uint8ClampedArray(canvas.width*canvas.height*4);
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
     const ox=Math.min(999,Math.floor(sx+(x+.5)*sw/canvas.width));
     const oy=Math.min(799,Math.floor(sy+(y+.5)*sh/canvas.height));
     const v=pixel(ox,oy),i=(y*canvas.width+x)*4;
     data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
    }
    return {width:canvas.width,height:canvas.height,data};
   }
  };
 }
}
const window={};
const ctx=vm.createContext({
 window,OffscreenCanvas:FakeCanvas,
 createImageBitmap:async()=>({...original,close(){}})
});
vm.runInContext(fs.readFileSync('gemini-label-geometry.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('gemini-ean.js','utf8'),ctx);
(async()=>{
 const result=await window.IUGeminiEAN.read(original);
 assert.equal(result?.ean13,ean,'EAN réel reconnu dans son papier décentré');
 assert.equal(result?.source,'optical');
 assert.equal(result?.confirmed,true);
 assert(result?.labelRect?.source==='paper-outline',
  'Une confirmation excentrée doit être reliée au papier détecté');
 assert(result.bounds.left>.45&&result.bounds.right<.84,
  'Le crop ne doit pas effacer la position d’origine');
 assert.equal(window.IUGeminiLabelGeometry.barcodeWithinLabel(result,result.labelRect),true);
 const other={...result,bounds:{...result.bounds,left:.02,right:.15}};
 assert.equal(window.IUGeminiLabelGeometry.barcodeWithinLabel(other,result.labelRect),false,
  'Barres d’une autre étiquette : pas de confiance');
 const invalid={...result,bounds:{...result.bounds,y:.26}};
 assert.equal(window.IUGeminiLabelGeometry.barcodeWithinLabel(invalid,result.labelRect),false,
  'Barres hors de la partie basse : pas de confiance');
 console.log('OK : recherche EAN dans la zone-barres native et validation géométrique décentrée');
})().catch(error=>{console.error(error);process.exitCode=1});
