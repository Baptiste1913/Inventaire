'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('gemini-lab.js','utf8');
const start=js.indexOf('async function requestWithHydrogenFallback(');
const end=js.indexOf(' // Une seule relecture groupée de la photo',start);
assert(start>0&&end>start,'Hydrogen fallback helper present');
const code=js.slice(start,end);
const upstreamErr=()=>Object.assign(new Error('Google 503'),{upstream503:true});
async function scenario({model='gemini-4-hydrogen',failure=upstreamErr(),
 fallbackFailure=null,aborted=false}={}){
 const calls=[],messages=[];
 const controller=new AbortController();
 const ctx=vm.createContext({
  hydrogenModel:'gemini-4-hydrogen',fixedModel:'gemini-3.5-flash-lite',
  hydrogenCooldownUntil:0,generation:42,Date,
  say:message=>messages.push(message),
  requestGeminiWithRecovery:async (...args)=>{
   calls.push(args);
   if(calls.length===1&&failure)throw failure;
   if(calls.length===2&&fallbackFailure)throw fallbackFailure;
   return {provider:'gemini',model:args[2],fields:{ean13:null}};
  }
 });
 vm.runInContext(code+';globalThis.run=requestWithHydrogenFallback;',ctx);
 if(aborted)controller.abort();
 let result=null,error=null;
 try{result=await ctx.run('SAME-IMAGE','PRIVATE-PILOT',model,controller.signal,
  42,'ean','gemini','SAME-DETAIL',['ean'])}
 catch(e){error=e;}
 return {calls,messages,result,error,cooldown:ctx.hydrogenCooldownUntil};
}
(async()=>{
 const success=await scenario({failure:null});
 assert.equal(success.calls.length,1);
 assert.equal(success.result.model,'gemini-4-hydrogen');
 const fallback=await scenario();
 assert.equal(fallback.calls.length,2);
 assert.equal(fallback.calls[0][2],'gemini-4-hydrogen');
 assert.equal(fallback.calls[1][2],'gemini-3.5-flash-lite');
 assert.equal(fallback.calls[0][0],fallback.calls[1][0]);
 assert.equal(fallback.calls[0][7],fallback.calls[1][7],
  'Same detailed photo in backup');
 assert.equal(fallback.result.fallbackFrom,'gemini-4-hydrogen');
 assert.equal(fallback.result.model,'gemini-3.5-flash-lite');
 assert(fallback.cooldown>Date.now());
 for(const fail of [
  new Error('Google 429'),
  new Error('Cloudflare 503'),
  Object.assign(new Error('Timeout'),{name:'AbortError'}),
  Object.assign(new Error('Quota 429'),{upstream503:false})
 ]){
  const attempt=await scenario({failure:fail});
  assert.equal(attempt.calls.length,1,'No backup on quota/network/timeout');
  assert.equal(attempt.error,fail);
 }
 const lite=await scenario({model:'gemini-3.5-flash-lite'});
 assert.equal(lite.calls.length,1,'Never back up a backup');
 const cancelled=await scenario({aborted:true});
 assert.equal(cancelled.calls.length,1,'Aborted analysis must never call fallback');
 const failedBackup=await scenario({fallbackFailure:new Error('Flash-Lite unavailable')});
 assert.equal(failedBackup.calls.length,2,'Exactly two calls even when both fail');
 assert(failedBackup.error,'The second error propagates without retry loop');
 console.log('OK : secours unique sur vrai 503 Google, sans erreurs 429 ou boucle');
})().catch(error=>{console.error(error);process.exitCode=1});
