'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const ctx={};vm.runInNewContext(src.split('export default {')[0]+';this.retry=resilientGemini;',ctx);
let time=10000;
async function run(statuses,circuit={failures:0,until:0,probing:false},after=null){
 const body=JSON.stringify({image:'unchanged bytes'}),options={body},calls=[];
 const result=await ctx.retry('gemini-3.5-flash-lite',options,{deadline:time+13000,now:()=>time,random:()=>0,
 wait:async ms=>{time+=ms},send:async(url,opts)=>{
  assert.equal(url,'gemini-3.5-flash-lite');assert.equal(opts,options);
  const status=statuses[calls.length];calls.push(status);
  return {status,headers:{get:()=>after},body:{cancel:async()=>{}}};
 },circuit});
 return {result,calls,circuit};
}
(async()=>{
 let x=await run([503,503,200]);assert.equal(x.result.response.status,200);assert.equal(x.result.stats.retries,2);
 x=await run([429]);assert.equal(x.calls.length,1);
 x=await run([400]);assert.equal(x.calls.length,1);
 x=await run([503,503,503]);assert.equal(x.calls.length,3);
 const breaker=x.circuit;
 x=await run([200],breaker);assert.equal(x.calls.length,0);assert.equal(x.result.stats.stage,'circuit_open');
 time=breaker.until+1;
 x=await run([200],breaker);assert.equal(x.calls.length,1);assert.equal(breaker.failures,0);
 x=await run([503],undefined,'5');assert.equal(x.calls.length,1);assert(x.circuit.until>=time+5000);
 assert(src.includes("model!=='gemini-3.5-flash-lite'"));assert(!src.includes('gemini-3.8-flash'));
 console.log('OK : réessais 503, modèle unique, protection, Retry-After, aucune répétition de 429/400');
})().catch(e=>{console.error(e);process.exitCode=1});
