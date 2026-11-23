import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8').split('export default {')[0];
const calls=[];let status=200;
function ean(cents){
 const first='0206632'+String(Math.round(cents*655.36/100)).padStart(5,'0');
 let sum=0;for(let i=0;i<12;i++)sum+=Number(first[i])*(i%2?3:1);
 return first+String((10-sum%10)%10);
}
const realEAN=ean(1382);
const upstream=async(url,options)=>{
 calls.push({url:String(url),options});
 if(status!==200)return new Response('PRIVATE UPSTREAM ERROR',{status});
 return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{
  text:JSON.stringify({name:'CITRON PRIMOFIORI',weightKg:'3,960',
  pricePerKgEur:'3,49',totalEur:'13,82',ean13:realEAN})
 }]}}]}),{status:200});
};
const ctx=vm.createContext({fetch:upstream,Response,AbortController,setTimeout,clearTimeout,URL});
vm.runInContext(source+'\nglobalThis.pilot=geminiPilot;',ctx);
const env={GEMINI_LAB_ENABLED:'true',COURSESU_TEST_TOKEN:'token',GEMINI_API_KEY:'secret'};
const image=Buffer.from('jpeg-fixture'.repeat(14)).toString('base64');
const detail=Buffer.from('central-fixture'.repeat(14)).toString('base64');
const payload=extra=>({type:'iu-gemini-label-test',provider:'gemini',model:'gemini-3.5-flash-lite',
 mimeType:'image/jpeg',imageBase64:image,...extra});
async function request(x,token='token'){
 const res=await ctx.pilot({headers:{get:k=>k==='X-IU-Pilot-Key'?token:null},
  text:async()=>JSON.stringify(x)},env,'https://inventaires-u.com');
 return {status:res.status,data:await res.json()};
}
const a=await request(payload({detailImageBase64:detail}));
assert.equal(a.status,200);
assert.equal(a.data.pipelineVersion,2);
assert.equal(a.data.fields.weightGrams,3960);
assert.equal(a.data.fields.pricePerKgCents,349);
assert.equal(a.data.fields.totalCents,1382);
assert.equal(a.data.fields.ean13,realEAN);
assert.equal(a.data.checks.barcodePriceConsistent,true);
const sent=JSON.parse(calls[0].options.body);
assert.equal(sent.contents[0].parts.length,4,'Vue entière et détail en un appel Gemini');
assert.equal(sent.generationConfig.responseMimeType,'application/json');
assert.equal(sent.generationConfig.responseSchema.properties.ean13.nullable,true);
const second=await request(payload({focusFields:['weight','ean'],detailImageBase64:detail}));
assert.equal(second.status,200);
assert.deepEqual(Array.from(second.data.focusFields),['weight','ean']);
assert(JSON.parse(calls[1].options.body).contents[0].parts[0].text.includes('RELECTURE CIBLÉE'));
const before=calls.length;
assert.equal((await request(payload({focusFields:['ean','ean']}))).status,400);
assert.equal((await request(payload({detailImageBase64:'no jpeg'}))).status,400);
assert.equal((await request(payload({}),'wrong')).status,401);
assert.equal(calls.length,before,'Requêtes invalides rejetées avant Gemini');
status=429;const limited=await request(payload({}));
assert.equal(limited.status,429);
assert(!JSON.stringify(limited.data).includes('PRIVATE UPSTREAM ERROR'));
console.log('OK : schéma, deux vues, une relecture groupée, EAN et contrôle des secrets');
