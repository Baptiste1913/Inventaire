import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8').replace('export default {','globalThis.worker={');
const origin='https://baptiste1913.github.io',endpoint='https://example.test/gemini-lab';
const env={GEMINI_LAB_ENABLED:'true',COURSESU_TEST_TOKEN:'test',GEMINI_API_KEY:'mock',VERTEX_API_KEY:'mockv'};
const imageBase64=Buffer.from(new Uint8Array(120).fill(65)).toString('base64');
const payload={type:'iu-gemini-label-test',provider:'gemini',model:'gemini-3.5-flash-lite',mimeType:'image/jpeg',imageBase64};
const prefix='020347600123';let sum=0;for(let i=0;i<12;i++)sum+=Number(prefix[i])*(i%2?3:1);
const ean=prefix+(10-sum%10)%10,fields={name:'CITRON',weightKg:'0,264',pricePerKgEur:'2,99',totalEur:'0,79',ean13:ean,eanObserved:ean};
const success=(f=fields,finishReason='STOP')=>new Response(JSON.stringify({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(f)}]}}],usageMetadata:{promptTokenCount:1200,candidatesTokenCount:58,thoughtsTokenCount:0,cachedContentTokenCount:12}}));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(send){
 const calls=[];let aborted=0;
 const ctx=vm.createContext({fetch:async(url,opt)=>{calls.push({url,key:opt.headers['x-goog-api-key'],body:JSON.parse(opt.body)});opt.signal.addEventListener('abort',()=>aborted++);return send(url,opt);},Response,Request,Blob,TextDecoder,AbortController,URL,Uint8Array,DataView,btoa,clearTimeout,setTimeout:(fn,ms)=>setTimeout(fn,ms>=5000?500:ms>=1200?5:ms)});
 vm.runInContext(source,ctx);
 return {calls,get aborted(){return aborted},request:(overrides={},p=payload)=>ctx.worker.fetch(new Request(endpoint,{method:'POST',headers:{Origin:origin,'X-IU-Pilot-Key':'test','Content-Type':'application/json'},body:JSON.stringify(p)}),{...env,...overrides})};
}
let a=setup(async()=>success());
let r=await a.request({GEMINI_SERVICE_TIER:'priority'}),d=await r.json();
assert.equal(d.requestedTier,'standard');assert.equal(a.calls[0].body.service_tier,undefined);
assert.equal(d.fields.weightGrams,264);assert.equal(d.usage.cachedContentTokenCount,12);
assert.equal(a.calls[0].body.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');
await a.request({GEMINI_RECOVERY_THINKING:'low'},{...payload,focusFields:['ean']});
assert.equal(a.calls[1].body.generationConfig.thinkingConfig.thinkingLevel,'LOW');
d=await (await a.request({GEMINI_ROUTE:'vertex'})).json();assert.equal(d.inferenceRoute,'vertex');
assert(a.calls[2].url.startsWith('https://aiplatform.googleapis.com/v1/publishers/google/models/'));assert.equal(a.calls[2].key,'mockv');
await a.request({GEMINI_ROUTE:'vertex',VERTEX_PROJECT_ID:'my-project'});assert(a.calls[3].url.includes('projects/my-project/locations/global'));
d=await (await a.request({GEMINI_ROUTE:'vertex',VERTEX_API_KEY:''})).json();assert.equal(d.inferenceRoute,'developer');
a=setup(async()=>success({n:fields.name,w:fields.weightKg,p:fields.pricePerKgEur,t:fields.totalEur,e:ean,o:ean}));
r=await a.request({GEMINI_COMPACT_JSON:'true'});assert.equal(r.status,200);assert.equal((await r.json()).fields.ean13,ean);
a=setup(async()=>success({n:'CITRON'}));assert.equal((await a.request({GEMINI_COMPACT_JSON:'true'})).status,422);
a=setup(async(url)=>{if(url.includes('generativelanguage'))await wait(30);return success();});
d=await (await a.request({GEMINI_ROUTE:'hedge'})).json();assert.equal(d.hedgeWinner,true);assert.equal(d.inferenceRoute,'vertex');assert.equal(a.calls.length,2);assert.deepEqual(a.calls[0].body,a.calls[1].body);assert.equal(a.aborted,2);
a=setup(async(url)=>{if(url.includes('generativelanguage')){await wait(25);return success();}return success({...fields,ean13:null});});
d=await (await a.request({GEMINI_ROUTE:'hedge'})).json();assert.equal(d.hedgeWinner,false);assert.equal(d.inferenceRoute,'developer');
function stream(finishReason='STOP'){
 const text=JSON.stringify(fields);
 const events=[{candidates:[{content:{parts:[{thought:true,text:'ignored'},{text:text.slice(0,34)}]}}]},{candidates:[{finishReason,content:{parts:[{text:text.slice(34)}]}}],usageMetadata:{cachedContentTokenCount:10}}];
 return new Response(events.map(x=>'data: '+JSON.stringify(x)+'\r\n\r\n').join(''));
}
a=setup(async()=>stream());r=await a.request({GEMINI_STREAM:'true'});d=await r.json();assert.equal(r.status,200);assert.equal(d.fields.weightGrams,264);assert.equal(d.usage.cachedContentTokenCount,10);assert.equal(typeof d.firstTokenMs,'number');
a=setup(async()=>stream('MAX_TOKENS'));assert.equal((await a.request({GEMINI_STREAM:'true'})).status,422);
a=setup(async()=>stream('SAFETY'));assert.equal((await a.request({GEMINI_STREAM:'true'})).status,422);
console.log('OK: Standard, Vertex, hedge, compact, streaming, thinking, cache metadata.');
