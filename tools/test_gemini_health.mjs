import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const requests=[],logs=[];
let hydrogenStatus=503,flashStatus=200;
const upstream=async(url,options)=>{
 const model=String(url).includes('gemini-4-hydrogen')?'gemini-4-hydrogen':
  String(url).includes('gemini-3.5-flash-lite')?'gemini-3.5-flash-lite':null;
 assert(model,'Unexpected model');
 assert.equal(options.headers['x-goog-api-key'],'PRIVATE-GOOGLE-KEY');
 const body=JSON.parse(options.body);
 assert.equal(body.contents.length,1);
 assert(!JSON.stringify(body).includes('inline_data'),'No image in health check');
 assert(!JSON.stringify(body).includes('imageBase64'),'No user image in health check');
 if(model==='gemini-4-hydrogen'){
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'LOW');
  assert.equal(body.generationConfig.temperature,undefined);
 }
 requests.push({model,body});
 const status=model==='gemini-4-hydrogen'?hydrogenStatus:flashStatus;
 if(status!==200)return new Response(JSON.stringify({error:{
  status:'UNAVAILABLE',message:'PRIVATE-MESSAGE-MUST-NOT-LOG'
 }}),{status});
 return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'OK'}]}}]}),{status:200});
};
const ctx=vm.createContext({
 Response,Request,URL,AbortController,setTimeout,clearTimeout,fetch:upstream,
 console:{error:(...args)=>logs.push(args.join(' '))}
});
vm.runInContext(source.replace('export default {','globalThis.worker = {'),ctx);
const env={GEMINI_LAB_ENABLED:'true',COURSESU_TEST_TOKEN:'PRIVATE-PILOT',
 GEMINI_API_KEY:'PRIVATE-GOOGLE-KEY'};
async function check(options={}){
 const req=new Request('https://inventaires-u-prix.baptistee123.workers.dev'+
  (options.route||'/gemini-health'),{
  method:options.method||'POST',
  headers:{'Origin':options.origin||'https://inventaires-u.com',
   'X-IU-Pilot-Key':options.key||'PRIVATE-PILOT'}
 });
 const response=await ctx.worker.fetch(req,options.env||env);
 return {status:response.status,
  body:response.status===204?null:await response.text()};
}
const first=await check();
assert.equal(first.status,200);
const json=JSON.parse(first.body);
assert.equal(json.type,'inventaires-u-gemini-health');
assert.equal(json.checks.length,2,'Exactly two text-only API calls');
assert.equal(requests.length,2);
const hydrogen=json.checks.find(c=>c.model==='gemini-4-hydrogen');
const flash=json.checks.find(c=>c.model==='gemini-3.5-flash-lite');
assert.equal(hydrogen.httpStatus,503);
assert.equal(hydrogen.providerErrorType,'UNAVAILABLE');
assert.equal(hydrogen.ok,false);
assert.equal(flash.ok,true);
assert.equal(flash.httpStatus,200);
assert(!first.body.includes('PRIVATE-'));
assert(logs.some(line=>line.includes('google_health_http')));
assert(!logs.join(' ').includes('PRIVATE-'),'Provider body and credentials not logged');
let n=requests.length;
assert.equal((await check({key:'wrong'})).status,401);
assert.equal((await check({origin:'https://bad.example'})).status,403);
assert.equal((await check({env:{...env,GEMINI_API_KEY:''}})).status,503);
assert.equal((await check({env:{...env,GEMINI_LAB_ENABLED:'false'}})).status,503);
assert.equal((await check({method:'GET'})).status,405);
assert.equal((await check({route:'/openai'})).status,404);
assert.equal(requests.length,n,'Unauthorized probes must never reach Google');
hydrogenStatus=200;
const next=JSON.parse((await check()).body);
assert(next.checks.every(c=>c.ok),'Both models can be tested independently');
assert.equal(requests.length,n+2);
console.log('OK : diagnostic Hydrogen/Flash-Lite isolé, authentifié et sans image');
