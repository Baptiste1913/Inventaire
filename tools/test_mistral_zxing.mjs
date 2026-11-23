import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const logs=[];let calls=0,providerStatus=200,bodyText='';
const first='0206632'+String(Math.round(100*655.36/100)).padStart(5,'0');
let sum=0;for(let i=0;i<12;i++)sum+=Number(first[i])*(i%2?3:1);
const ean=first+String((10-sum%10)%10);
bodyText='SUPER U\nPOIVRON JAUNE\nPrix unitaire 2,00€/kg\nPoids net 0,500 kg\n'
 +'PRIX A PAYER 1,00 €\n'+ean;
const mock=async(url,opts)=>{
 calls++;
 assert.equal(url,'https://api.mistral.ai/v1/ocr');
 assert.equal(opts.headers.Authorization,'Bearer private-mistral-key');
 const request=JSON.parse(opts.body);
 assert.equal(request.model,'mistral-ocr-4-1');
 assert(request.document.image_url.startsWith('data:image/jpeg;base64,'));
 assert.equal(request.include_image_base64,false);
 if(providerStatus!==200)return new Response('SECRET_PROVIDER_DATA',{status:providerStatus});
 return new Response(JSON.stringify({pages:[{index:0,markdown:bodyText}]}),{status:200});
};
const ctx=vm.createContext({fetch:mock,Response,AbortController,setTimeout,
 clearTimeout,URL,console:{error:(m)=>logs.push(m)}});
vm.runInContext(source.replace('export default {','globalThis.worker = {'),ctx);
const env={GEMINI_LAB_ENABLED:'true',MISTRAL_API_KEY:'private-mistral-key',
 COURSESU_TEST_TOKEN:'private-token',GEMINI_API_KEY:'private-gemini-key'};
const image=Buffer.from('JPEG-FAKE-DATA'.repeat(16)).toString('base64');
const payload=()=>({type:'iu-gemini-label-test',provider:'mistral',
 model:'mistral-ocr-4-1',mimeType:'image/jpeg',imageBase64:image});
async function submit(p=payload(),overrides={}){
 const headers=new Headers({Origin:'https://inventaires-u.com',
  'X-IU-Pilot-Key':'private-token','Content-Type':'application/json'});
 const res=await ctx.worker.fetch(new Request('https://test.invalid/gemini-lab',{
  method:'POST',headers,body:JSON.stringify(p)
 }),{...env,...overrides});
 return {status:res.status,json:await res.json()};
}
const success=await submit();
assert.equal(success.status,200);
assert.equal(success.json.provider,'mistral');
assert.equal(success.json.pipelineVersion,3);
assert.equal(success.json.fields.weightGrams,500);
assert.equal(success.json.fields.pricePerKgCents,200);
assert.equal(success.json.fields.totalCents,100);
assert.equal(success.json.fields.ean13,ean);
assert.equal(success.json.checks.arithmeticConsistent,true);
assert.equal(success.json.checks.barcodePriceConsistent,true);
assert.equal(success.json.verifiedForInventory,false);
assert(!JSON.stringify(success.json).includes('POIVRON JAUNE'),'Nom uniquement depuis le catalogue');
assert.equal(calls,1,'Une capture, une requête Mistral');

bodyText='POIVRON VERT\n2,00€\n0,500 kg\n1,00€\n'+ean;
const incomplete=await submit();
assert.equal(incomplete.status,200);
assert.equal(incomplete.json.fields.pricePerKgCents,null,'Pas de prix sans /kg');
assert.equal(incomplete.json.fields.totalCents,null,'Pas de total sans intitulé');
assert.equal(calls,2);

const before=calls;
assert.equal((await submit(payload(),{MISTRAL_API_KEY:''})).status,503);
assert.equal(calls,before,'Sans secret, aucun appel fournisseur');
providerStatus=503;
const unavailable=await submit();
assert.equal(unavailable.status,503);
assert.equal(unavailable.json.providerStatus,503);
assert(logs.some(l=>l.includes('"providerStatus":503')),'Statut Mistral disponible pour le diagnostic');
providerStatus=200;
assert(!logs.join('\n').includes('private-mistral-key'));
assert(!logs.join('\n').includes('JPEG-FAKE-DATA'));
assert.equal((await submit({...payload(),model:'mistral-ocr-4-0'})).status,400,
 'Ne jamais utiliser le modèle OCR 4.0 retiré');
console.log('OK : OCR 4.1, champs DIGI stricts, secret serveur, pas de deuxième analyse');

const zx=fs.readFileSync('gemini-zxing.js','utf8');
const mockRoot={};
vm.runInNewContext(zx,{self:mockRoot,importScripts:()=>{throw Error('unexpected')}});
const api=mockRoot.IUZxingEAN;
assert.equal(api.version,'3.1.2');
const point=(x,y)=>({x,y});
const candidate={format:'EAN13',isValid:true,lineCount:3,text:ean,
 position:{topLeft:point(200,640),topRight:point(530,640),
  bottomLeft:point(200,670),bottomRight:point(530,670)}};
const evidence=api.evaluate([candidate],1000,900);
assert.equal(evidence?.ean13,ean);
assert.equal(evidence?.source,'optical');
assert.equal(evidence?.confirmed,true);
assert.equal(evidence?.bounds?.y>0.6,true);
assert.equal(api.evaluate([{...candidate,text:'0203476013844'}],1000,900).ean13,
 '0203476013844');
assert.equal(api.evaluate([{...candidate,lineCount:1}],1000,900),null,
 'Une seule ligne de barres ne suffit pas');
const other={...candidate,text:'0203476013844'};
assert.equal(api.evaluate([candidate,other],1000,900).ambiguous,true,
 'Deux EAN différents = blocage, jamais un choix arbitraire');
const outside={...candidate,position:{topLeft:point(720,220),topRight:point(920,220),
 bottomLeft:point(720,235),bottomRight:point(920,235)}};
assert.equal(api.evaluate([outside],1000,900),null,'Pas d’EAN pris sur une autre zone');
const w=fs.readFileSync('gemini-image-worker.js','utf8');
assert(w.indexOf('self.IUZxingEAN?.read(photo)')<
 w.indexOf('self.IUGeminiEAN.read(photo)'),'ZXing est désormais prioritaire');
assert(w.includes("importScripts('./gemini-zxing.js?v=42.36')"));
assert(zx.includes("LOCAL_JS='./vendor/zxing/reader.js'"));
assert(zx.includes("LOCAL_WASM='./vendor/zxing/zxing_reader.wasm'"));
assert(!zx.includes('cdn.jsdelivr.net'),'ZXing ne dépend plus d’un CDN');
console.log('OK : ZXing EAN valide, vérification géométrique et ambiguïtés bloquées');
