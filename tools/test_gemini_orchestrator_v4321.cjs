'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const l=require('../gemini-latency.js');
(async()=>{let finish;const slow=l.track(new Promise(r=>{finish=r})),fast=l.track(Promise.resolve('ok'));await fast.promise;let found;
const x=await l.collect({tasks:()=>[['fast',fast],['slow',slow]],consume:(k,v)=>{found=v},ready:()=>found==='ok',deadline:1000,now:()=>0});assert.equal(x.reason,'ready');assert(!slow.done);finish(null);
const js=fs.readFileSync('gemini-lab.js','utf8');assert(js.includes('collectLocal'));assert(js.includes('workersKeptWarm:true'));assert(!js.includes('cancelPhoto?.(sourcePhoto)'));
console.log('OK: orchestrateur corrigé, indépendamment du déducteur');})().catch(e=>{console.error(e);process.exitCode=1});
