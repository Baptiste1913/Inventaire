'use strict';
const assert=require('node:assert/strict');
const core=require('../gemini-recognition-core.js');
assert.deepEqual(core.fuse('02034?60138??','020?476013?44'),{pattern:'0203476013844',known:13,conflict:false});
assert(core.fuse('0203476013844','0203476013845').conflict);
assert.equal(core.fuse('123').pattern,'');
assert.equal(core.corroborate('02034?6013844','0203476013844').used,false);
assert.equal(core.corroborate('02034760138??','0203476013844').pattern,'0203476013844');
assert.equal(core.corroborate('02034760138??','0203476013944').used,false);
const rgba=new Uint8ClampedArray([255,0,0,255,0,255,0,128,0,0,255,255,255,255,255,255,12,34,56,1]);
const expected=Array.from(rgba);
for(let i=0;i<expected.length;i+=4){const y=(77*expected[i]+150*expected[i+1]+29*expected[i+2])>>>8;expected[i]=expected[i+1]=expected[i+2]=y;}
assert(['wasm-simd','js'].includes(core.grayscale(rgba)));
assert.deepEqual(Array.from(rgba),expected);
const q=[[.1,.1],[.8,.15],[.85,.8],[.15,.85]];
for(const [i,uv] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]]){
 const p=core.project(q,...uv);assert(p.every((x,j)=>Math.abs(x-q[i][j])<1e-6));
}
const source={width:32,height:32,data:new Uint8ClampedArray(32*32*4).fill(123)};
const target={width:12,height:12,data:new Uint8ClampedArray(12*12*4)};
assert(core.warp(source,target,q));assert.equal(target.data[0],123);assert.equal(target.data[3],255);
console.log('OK : fusion stricte, SIMD identique au JS et homographie locale.');

const fs=require('node:fs'),vm=require('node:vm');
const scope={window:{}};
vm.runInNewContext(fs.readFileSync('gemini-ean.js','utf8'),scope);
const ean=scope.window.IUGeminiEAN;
const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const code='0203476013844';
const bits='101'+[...code.slice(1,7)].map(d=>L[+d]).join('')+'01010'+[...code.slice(7)].map(d=>R[+d]).join('')+'101';
assert.equal(ean.decode95(bits),code);
const damaged=bits.slice(0,17)+'0000000'+bits.slice(24);
assert.equal(ean.decodePartial95(damaged),'020?476013844');
assert.equal(ean.decodePartial95('000'+damaged.slice(3)),null,'Gardes EAN obligatoires');
const paddle=fs.readFileSync('gemini-paddle-lab.js','utf8');
const worker=fs.readFileSync('gemini-paddle-worker.js','utf8');
assert(paddle.includes('if(!enabled()||!engine||running||!photo)return null'));
assert(paddle.includes("navigator.gpu?['webgpu','wasm']:['wasm']"));
assert(worker.includes("worker:false")&&worker.includes("simd:true"));
assert(worker.includes("@paddleocr/paddleocr-js@0.4.2"));
console.log('OK : décodeur EAN partiel sans invention, Paddle optionnel hors du thread principal.');
