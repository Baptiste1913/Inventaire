import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Aucun appel à Google pendant ce test. Une erreur upstream reste
// identifiable par son statut original, sans corps de réponse ni secret.
const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const records=[];
let remoteStatus=200,networkFailure=false,brokenJson=false;
const secretImage=Buffer.from('SECRET-PHOTO-BODY'.repeat(8)).toString('base64');
const env={GEMINI_LAB_ENABLED:'true',COURSESU_TEST_TOKEN:'SECRET-PRIVATE-TOKEN',
 GEMINI_API_KEY:'SECRET-GOOGLE-API-KEY'};
const fetchMock=async(url,options)=>{
 assert(url.startsWith('https://generativelanguage.googleapis.com/'));
 assert.equal(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);
 if(networkFailure)throw new Error('SECRET-EXCEPTION-INCLUDING-PRIVATE-DATA');
 if(remoteStatus!==200)return new Response('SECRET-GOOGLE-RESPONSE-AND-USER-DATA',
  {status:remoteStatus});
 if(brokenJson)return new Response('NOT VALID JSON PRIVATE INFO',{status:200});
 const ean='0206632019594';
 return new Response(JSON.stringify({candidates:[{finishReason:'STOP',
  content:{parts:[{text:JSON.stringify({
   name:null,weightKg:'1,000',pricePerKgEur:'2,99',totalEur:'2,99',
   ean13:ean
  })}]}}]}),{status:200});
};
const ctx=vm.createContext({
 fetch:fetchMock,Response,AbortController,setTimeout,clearTimeout,URL,
 console:{error:(...args)=>records.push(args.join(' '))}
});
vm.runInContext(source.replace('export default {','globalThis.worker = {'),ctx);
const body=()=>({
 type:'iu-gemini-label-test',provider:'gemini',model:'gemini-3.5-flash-lite',
 mimeType:'image/jpeg',imageBase64:secretImage
});
async function request(options={}){
 const headers=new Headers({
  Origin:'https://inventaires-u.com',
  'X-IU-Pilot-Key':options.token||env.COURSESU_TEST_TOKEN,
  'Content-Type':'application/json'
 });
 const res=await ctx.worker.fetch(new Request('https://example.test/gemini-lab',{
  method:'POST',headers,body:JSON.stringify(body())
 }),options.env||env);
 return {status:res.status,json:await res.json()};
}
function latest(){
 assert(records.length>0,'Un échec doit être diagnostiqué');
 const line=records[records.length-1];
 assert(line.startsWith('IU_GEMINI_DIAGNOSTIC '),'Préfixe de journal stable');
 const detail=JSON.parse(line.slice('IU_GEMINI_DIAGNOSTIC '.length));
 assert.equal(detail.event,'iu_gemini_failure');
 assert([null,'gemini-3.5-flash-lite'].includes(detail.model),
  'Le modèle logué doit être connu ou absent');
 assert(Number.isFinite(detail.elapsedMs)&&detail.elapsedMs>=0);
 for(const forbidden of ['SECRET-', 'imageBase64','x-goog-api-key',
  'content-type','X-IU-Pilot-Key','https://','weightKg','ean13'])
  assert(!line.includes(forbidden),'Ne jamais journaliser des données : '+forbidden);
 return detail;
}
let res=await request();
assert.equal(res.status,200);
assert.equal(records.length,0,'Aucun journal sur lecture Gemini réussie');
for(const upstream of [500,502,503,504,429,400]){
 remoteStatus=upstream;
 const count=records.length;
 res=await request();
 const expected=upstream===429?429:upstream===400?400:503;
 assert.equal(res.status,expected);
 assert.equal(res.json.providerStatus,upstream,'Corps de réponse inchangé');
 assert.equal(records.length,count+1,'Un seul journal par réponse fournisseur');
 const detail=latest();
 assert.equal(detail.stage,'google_http');
 assert.equal(detail.reason,'provider_http_error');
 assert.equal(detail.providerStatus,upstream,'Code Google exact conservé');
 assert.equal(detail.httpStatus,expected,'Code Cloudflare également visible');
}
remoteStatus=200;networkFailure=true;
res=await request();
assert.equal(res.status,503);
assert.equal(res.json.providerStatus,undefined);
assert.equal(latest().stage,'google_fetch');
assert.equal(latest().reason,'transport_error');
assert.equal(latest().providerStatus,null,'Pas de faux code Google inventé');
networkFailure=false;brokenJson=true;
res=await request();
assert.equal(res.status,422);
assert.equal(latest().stage,'google_response_parse');
assert.equal(latest().reason,'response_parse_error');
brokenJson=false;
let before=records.length;
res=await request({env:{...env,GEMINI_LAB_ENABLED:'false'}});
assert.equal(res.status,503);
assert.equal(records.length,before+1);
assert.equal(latest().reason,'pilot_disabled');
assert.equal(latest().model,null);
before=records.length;
res=await request({env:{...env,GEMINI_API_KEY:''}});
assert.equal(res.status,503);
assert.equal(records.length,before+1);
assert.equal(latest().reason,'api_key_missing');
before=records.length;
res=await request({token:'INVALID'});
assert.equal(res.status,401);
assert.equal(records.length,before,'Ne pas journaliser les jetons incorrects');
// Les traces n'altèrent ni prompt, ni schéma, ni taux d'échec.
assert(source.includes('responseSchema')&&source.includes('detailImageBase64'));
assert.equal(source.match(/await fetch\(/g)?.length,2,'Un appel possible par fournisseur : Gemini et Mistral');
console.log('OK : vrai code Google, étape et durée, aucune photo/clé donnée en logs');
