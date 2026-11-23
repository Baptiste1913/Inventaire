import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Aucun appel réel aux fournisseurs : contrat du Worker vérifié avec des réponses simulées.
const source=fs.readFileSync(new URL('../workers/coursesu-live-worker.js',import.meta.url),'utf8')
 .split('export default {')[0];
let upstreamCalls=[];
const fakeFetch=async (url,options)=>{
 upstreamCalls.push({url:String(url),options});
 const isOpenAI=String(url).includes('api.openai.com');
 const answer={name:'CAROTTE',weightKg:'0,714',pricePerKgEur:'2,99',
  totalEur:'2,13',ean13:'0203476013844'};
 const result=isOpenAI
  ?{status:'completed',output:[{type:'message',
     content:[{type:'output_text',text:JSON.stringify(answer)}]}]}
  :{candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]};
 return new Response(JSON.stringify(result),{status:200});
};
const context=vm.createContext({
 fetch:fakeFetch,Response,AbortController,setTimeout,clearTimeout,URL
});
vm.runInContext(source+'\nglobalThis.testPilot=geminiPilot;',context);
const env={GEMINI_LAB_ENABLED:'true',COURSESU_TEST_TOKEN:'test-secret',
 OPENAI_API_KEY:'openai-fake-key',GEMINI_API_KEY:'gemini-fake-key'};
const imageBase64=Buffer.from('image-fixture-not-real'.repeat(12)).toString('base64');
const payload=(provider,focusField)=>({type:'iu-gemini-label-test',
 provider,model:'gemini-3.5-flash-lite',mimeType:'image/jpeg',imageBase64,
 ...(focusField?{focusField}:{})});
const request=(body,key='test-secret')=>({
 headers:{get(name){if(name==='X-IU-Pilot-Key')return key;return null;}},
 text:async()=>JSON.stringify(body)
});
async function read(body,key,envOverride=env){
 const response=await context.testPilot(request(body,key),envOverride,'https://inventaires-u.com');
 return {status:response.status,json:await response.json()};
}
const openai=await read(payload('openai','weight'));
assert.equal(openai.status,200);
assert.equal(openai.json.provider,'openai');
assert.equal(openai.json.model,'gpt-6.1-terra');
assert.equal(openai.json.fields.weightGrams,714);
assert.equal(openai.json.fields.pricePerKgCents,299);
assert.equal(openai.json.fields.totalCents,213);
assert.equal(openai.json.fields.ean13,'0203476013844');
assert.equal(openai.json.checks.arithmeticConsistent,true);
assert.equal(upstreamCalls.length,1);
assert.equal(upstreamCalls[0].url,'https://api.openai.com/v1/responses');
const openaiBody=JSON.parse(upstreamCalls[0].options.body);
assert.equal(openaiBody.model,'gpt-6.1-terra');
assert.equal(openaiBody.service_tier,'fast');
assert.equal(openaiBody.store,false);
assert.equal(openaiBody.input[0].content[1].detail,'high');
assert.equal(openaiBody.text.format.strict,true);
assert.equal(upstreamCalls[0].options.headers.Authorization,'Bearer openai-fake-key');
assert(openaiBody.input[0].content[0].text.includes('RELECTURE CIBLÉE'));
upstreamCalls=[];
const google=await read(payload('gemini'));
assert.equal(google.status,200);
assert.equal(google.json.provider,'gemini');
assert.equal(google.json.model,'gemini-3.5-flash-lite');
assert.equal(google.json.fields.weightGrams,714);
assert.equal(upstreamCalls.length,1);
assert(upstreamCalls[0].url.includes('generativelanguage.googleapis.com'));
upstreamCalls=[];
const missing=await read(payload('openai'),'test-secret',{...env,OPENAI_API_KEY:''});
assert.equal(missing.status,503);
assert.match(missing.json.error,/OPENAI_API_KEY/);
assert.equal(upstreamCalls.length,0,'Ne pas contacter un fournisseur sans secret');
const unauthorized=await read(payload('openai'),'bad-token');
assert.equal(unauthorized.status,401);
assert.equal(upstreamCalls.length,0,'Ne pas contacter un fournisseur sans clé pilote');
console.log('OK : OpenAI Fast + JSON vérifié, Gemini intact, secrets côté Worker, verrou du pilote');
