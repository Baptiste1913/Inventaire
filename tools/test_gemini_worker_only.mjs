import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const archived=fs.readFileSync('workers/coursesu-apify-worker.js','utf8');
assert(source.length<24000,'Worker Gemini doit rester minimal');
for(const token of ['APIFY_TOKEN','OPENAI_API_KEY','api.apify.com','api.openai.com',
 'COURSESU_LIVE_ENABLED','function lookup(','function authCheck(','function htmlCheck('])
 assert(!source.includes(token),'Code historique dans Gemini : '+token);
assert(archived.includes('function lookup('),'Passerelle Courses U préservée séparément');
assert(!archived.includes('function geminiPilot('),'Aucune dépendance Gemini dans Apify');

const calls=[];let remoteStatus=200;
function encodeEAN(cents){
 const prefix='0206632'+String(Math.round(cents*655.36/100)).padStart(5,'0');
 let sum=0;for(let i=0;i<12;i++)sum+=Number(prefix[i])*(i%2?3:1);
 return prefix+String((10-sum%10)%10);
}
const code=encodeEAN(299);
const upstream=async(url,options)=>{
 calls.push({url:String(url),options});
 if(remoteStatus!==200)
  return new Response('PRIVATE_PROVIDER_ERROR',{status:remoteStatus});
 return new Response(JSON.stringify({candidates:[{finishReason:'STOP',
  content:{parts:[{text:JSON.stringify({
   name:null,weightKg:'1,000',pricePerKgEur:'2,99',
   totalEur:'2,99',ean13:code
  })}]}}]}),{status:200});
};
const ctx=vm.createContext({
 fetch:upstream,Response,AbortController,setTimeout,clearTimeout,URL
});
vm.runInContext(source.replace('export default {','globalThis.worker = {'),ctx);
assert.equal(typeof ctx.worker?.fetch,'function');
const env={GEMINI_LAB_ENABLED:'true',
 COURSESU_TEST_TOKEN:'test-token',GEMINI_API_KEY:'test-api-key'};
const photo=Buffer.from('jpeg-fixture'.repeat(16)).toString('base64');
const detail=Buffer.from('crop-fixture'.repeat(13)).toString('base64');
const body=extra=>({
 type:'iu-gemini-label-test',provider:'gemini',model:'gemini-3.5-flash-lite',
 mimeType:'image/jpeg',imageBase64:photo,...extra
});
async function call(route='/gemini-lab',payload=body(),options={}){
 const method=options.method||'POST';
 const headers=new Headers({
  Origin:options.origin||'https://inventaires-u.com',
  'X-IU-Pilot-Key':options.token||'test-token',
  'Content-Type':'application/json'
 });
 const req=new Request('https://inventaires-u-prix.baptistee123.workers.dev'+route,{
  method,headers,...(method==='POST'?{body:JSON.stringify(payload)}:{})
 });
 const res=await ctx.worker.fetch(req,options.env||env);
 const type=res.headers.get('Content-Type')||'';
 return {status:res.status,headers:res.headers,
  json:res.status===204||!type.includes('application/json')?null:await res.json()};
}
const read=await call('/gemini-lab',body({detailImageBase64:detail}));
assert.equal(read.status,200);
assert.equal(read.json.provider,'gemini');
assert.equal(read.json.model,'gemini-3.5-flash-lite');
assert.equal(read.json.pipelineVersion,2);
assert.equal(read.json.fields.weightGrams,1000);
assert.equal(read.json.fields.pricePerKgCents,299);
assert.equal(read.json.fields.totalCents,299);
assert.equal(read.json.fields.ean13,code);
assert.equal(read.json.verifiedForInventory,false);
assert.equal(read.headers.get('Access-Control-Allow-Origin'),'https://inventaires-u.com');
assert.equal(calls.length,1);
assert(calls[0].url.startsWith('https://generativelanguage.googleapis.com/'));
const sent=JSON.parse(calls[0].options.body);
assert.equal(sent.contents[0].parts.length,4,'Photo et détail envoyés en un appel');
assert.equal(sent.generationConfig.responseMimeType,'application/json');
assert.equal(sent.generationConfig.responseSchema.type,'OBJECT');
assert.equal(sent.generationConfig.temperature,0);
const focus=await call('/gemini-lab',body({focusFields:['weight','ean']}));
assert.equal(focus.status,200);
assert.deepEqual(Array.from(focus.json.focusFields),['weight','ean']);
assert(JSON.parse(calls[1].options.body).contents[0].parts[0].text.includes('RELECTURE CIBLÉE'));
const before=calls.length;
for(const route of ['/lookup','/auth-check','/html-check','/openai']){
 assert.equal((await call(route)).status,404,'Route désactivée : '+route);
}
assert.equal(calls.length,before,'Routes retirées sans appel réseau');
assert.equal((await call('/gemini-lab',body({provider:'openai'}))).status,400);
assert.equal((await call('/gemini-lab',body({model:'gpt-6.1-terra'}))).status,400);
assert.equal((await call('/gemini-lab',body({focusFields:['ean','ean']}))).status,400);
assert.equal((await call('/gemini-lab',body({detailImageBase64:'not-base64!'}))).status,400);
assert.equal((await call('/gemini-lab',body(),{token:'wrong'})).status,401);
assert.equal((await call('/gemini-lab',body(),{env:{...env,GEMINI_API_KEY:''}})).status,503);
assert.equal((await call('/gemini-lab',body(),{env:{...env,GEMINI_LAB_ENABLED:'false'}})).status,503);
assert.equal(calls.length,before,'Requête refusée sans contacter le fournisseur');
const options=await call('/gemini-lab',body(),{method:'OPTIONS'});
assert.equal(options.status,204);
assert.equal(options.headers.get('Access-Control-Allow-Origin'),'https://inventaires-u.com');
assert.equal((await call('/gemini-lab',body(),{method:'GET'})).status,405);
assert.equal((await call('/gemini-lab',body(),{
 origin:'https://not-approved.example'})).status,403);
const flash=await call('/gemini-lab',body({model:'gemini-3.8-flash'}));
assert.equal(flash.status,400,'Seul Gemini 3.5 Flash-Lite est autorisé');
remoteStatus=429;
const limited=await call();
assert.equal(limited.status,429);
assert(!JSON.stringify(limited.json).includes('PRIVATE_PROVIDER_ERROR'));
console.log('OK : Gemini seul, sécurité/CORS conservés, anciens fournisseurs inaccessibles');
