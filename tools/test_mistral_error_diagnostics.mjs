import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Tests sans réseau, sans appel facturé, sur la vraie route Cloudflare.
// Les messages bruts de Mistral peuvent contenir des données sensibles :
const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const logs=[];let fetchCount=0,upstreamStatus=429,providerBody='',bodyError=false;
const env={GEMINI_LAB_ENABLED:'true',MISTRAL_API_KEY:'SECRET_MISTRAL_API_KEY',
 COURSESU_TEST_TOKEN:'SECRET_PRIVATE_PILOT',GEMINI_API_KEY:'SECRET_GEMINI_KEY'};
const mockFetch=async(url,opts)=>{
 fetchCount++;
 assert.equal(url,'https://api.mistral.ai/v1/ocr');
 assert.equal(opts.headers.Authorization,'Bearer SECRET_MISTRAL_API_KEY');
 const request=JSON.parse(opts.body);
 assert.equal(request.model,'mistral-ocr-4-1');
 assert(request.document.image_url.startsWith('data:image/jpeg;base64,'));
 if(bodyError){
  return {ok:false,status:upstreamStatus,headers:new Headers(),
   text:async()=>{throw Error('SECRET_UNSAFE_RESPONSE');}};
 }
 return new Response(providerBody,{status:upstreamStatus,
  headers:{'Content-Type':'application/json'}});
};
const ctx=vm.createContext({fetch:mockFetch,Response,Request,Headers,
 AbortController,setTimeout,clearTimeout,URL,
 console:{error:line=>logs.push(line)}});
vm.runInContext(source.replace('export default {','globalThis.worker = {'),ctx);
const image=Buffer.from('SECRET-PHOTO-BYTES'.repeat(18)).toString('base64');
const payload={type:'iu-gemini-label-test',provider:'mistral',
 model:'mistral-ocr-4-1',mimeType:'image/jpeg',imageBase64:image};
async function call(){
 const response=await ctx.worker.fetch(new Request('https://local.test/gemini-lab',{
  method:'POST',headers:{'Content-Type':'application/json',
   'Origin':'https://inventaires-u.com','X-IU-Pilot-Key':env.COURSESU_TEST_TOKEN},
  body:JSON.stringify(payload)
 }),env);
 return {status:response.status,json:await response.json()};
}
function latest(){
 const line=logs.at(-1);
 assert(line.startsWith('IU_GEMINI_DIAGNOSTIC '));
 const result=JSON.parse(line.slice('IU_GEMINI_DIAGNOSTIC '.length));
 assert.equal(result.model,'mistral-ocr-4-1');
 assert.equal(result.stage,'mistral_http');
 assert.equal(result.reason,'provider_http_error');
 assert.equal(result.providerStatus,upstreamStatus);
 for(const privateValue of ['SECRET_','SECRET-PHOTO','private@example.com',
  'token_at_','Bearer','param','raw_status_code','message'])
  assert(!line.includes(privateValue),'Champ confidentiel journalisé : '+privateValue);
 return result;
}
providerBody=JSON.stringify({object:'error',message:'PRIVATE MESSAGE private@example.com',
 type:'rate_limited',param:'token_at_abcdefgh',code:'1300',raw_status_code:429});
let res=await call(),d=latest();
assert.equal(res.status,429);
assert.equal(d.httpStatus,429);
assert.equal(d.providerErrorType,'rate_limited');
assert.equal(d.providerErrorCode,'1300');
assert.equal(res.json.provider,'mistral');
assert(!JSON.stringify(res.json).includes('PRIVATE MESSAGE'));
assert.equal(fetchCount,1,'Aucun second appel à Mistral pour diagnostiquer');

providerBody=JSON.stringify({error:{type:'rate_limit_exceeded',code:1300,
 message:'SECRET_UNSAFE_RESPONSE'}});
res=await call();d=latest();
assert.equal(res.status,429);
assert.equal(d.providerErrorType,'rate_limit_exceeded');
assert.equal(d.providerErrorCode,'1300','Code numérique pris en charge');

providerBody=JSON.stringify({object:'error',message:'SECRET_UNSAFE_RESPONSE',
 type:'SECRET_UNSAFE_RESPONSE/../../',code:'Bearer SECRET_MISTRAL_API_KEY'});
res=await call();d=latest();
assert.equal(res.status,429);
assert.equal(d.providerErrorType,undefined,'Type dangereux rejeté');
assert.equal(d.providerErrorCode,undefined,'Code dangereux rejeté');

for(const body of ['<html>SECRET_UNSAFE_RESPONSE</html>','{bad JSON',
 JSON.stringify({type:'a'.repeat(200),code:'a'.repeat(200)})]){
 providerBody=body;
 res=await call();d=latest();
 assert.equal(res.status,429,'Ne jamais transformer un 429 en 422');
 assert.equal(d.providerErrorType,undefined);
 assert.equal(d.providerErrorCode,undefined);
}
bodyError=true;
res=await call();d=latest();
assert.equal(res.status,429,'Lecture de corps interrompue : conserver le code 429');
assert.equal(d.providerErrorCode,undefined);
bodyError=false;
upstreamStatus=402;
providerBody=JSON.stringify({type:'payment_required',code:'insufficient_balance',
 message:'SECRET_UNSAFE_RESPONSE'});
res=await call();d=latest();
assert.equal(res.status,402);
assert.equal(d.providerErrorType,'payment_required');
assert.equal(d.providerErrorCode,'insufficient_balance');
assert.equal(res.json.providerStatus,402);
assert.equal(logs.length,8,'Un seul diagnostic par échec');
console.log('OK : codes/type Mistral filtrés; aucune donnée privée en logs; HTTP inchangé');
