'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const ocr=require('../digi-digit-ocr.js');
assert.equal(ocr.modelSize,970);
assert.equal(ocr.normalize(new Uint8Array(20),4,5),null);
assert.equal(ocr.readRaster(new Uint8Array(200*40).fill(255),200,40),null);
assert(ocr.sharpen(new Uint8Array(25).fill(100),5,5).every(x=>x===100));
const glyphs=['01110/10001/10001/10001/10001/10001/01110','00100/01100/00100/00100/00100/00100/01110','01110/10001/00001/00010/00100/01000/11111','11110/00001/00001/01110/00001/00001/11110','00010/00110/01010/10010/11111/00010/00010','11111/10000/10000/11110/00001/00001/11110','01110/10000/10000/11110/10001/10001/01110','11111/00001/00010/00100/01000/01000/01000','01110/10001/10001/01110/10001/10001/01110','01110/10001/10001/01111/00001/00001/01110'];
let included=0;
for(let d=0;d<10;d++){
 const pixels=Uint8Array.from(glyphs[d].replace(/\//g,''),x=>x==='1'?255:0);
 const options=ocr.classify(ocr.normalize(pixels,5,7));
 assert.equal(options.length,3);
 assert(options.every(x=>Number.isFinite(x.score)));
 if(options.some(x=>x.digit===String(d)))included++;
}
assert(included>=8,'Les glyphes simples doivent rester parmi les hypothèses');
const w=280,h=44,gray=new Uint8Array(w*h).fill(255);
for(const [i,d] of [...'0203476013844'].entries()){
 const glyph=glyphs[+d].replace(/\//g,'');
 for(let y=0;y<7;y++)for(let x=0;x<5;x++)if(glyph[y*5+x]==='1')
  for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)gray[(10+y*3+dy)*w+10+i*20+x*3+dx]=0;
}
const read=ocr.readRaster(gray,w,h);
assert(read&&read.source==='digit-template'&&read.confirmed===false);
assert.equal(read.digitOptions.length,13);
assert.equal(read.pattern.length,13);
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
const lab=fs.readFileSync('gemini-lab.js','utf8'),worker=fs.readFileSync('gemini-image-worker.js','utf8');
const v=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(worker.includes("importScripts('./digi-digit-ocr.js?v="+v+"')"));
assert(sw.includes('digi-digit-ocr.js?v='+v));
assert(html.includes('gemini-parallel.js?v='+v));
assert(lab.includes('printedJob?.value,digitJob?.value'));
assert(!lab.includes('fuseEAN(result,digitJob'));
assert(!lab.includes('fuseEAN(combined,digitJob'));
console.log('OK : classificateur, glyphes, segmentation synthétique et séparation des preuves');
