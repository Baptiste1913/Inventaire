'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('gemini-lab.js','utf8');
function segment(begin,end){
 const a=js.indexOf(begin),b=js.indexOf(end,a);
 assert(a>=0&&b>a,'Partie scanner absente : '+begin);
 return js.slice(a,b);
}
const alert=segment('function refreshLabelAlert(){','function validateResult(');
let shown='';
let ctx=vm.createContext({
 active:false,lastAnalysisError:'Liaison Cloudflare–Gemini indisponible (503)',
 latestLabelFields:{weightGrams:210},
 window:{IUWeighScanContext:()=>({tareGrams:324})},
 setLabelAlert:(state,msg)=>{shown=msg;}
});
vm.runInContext(alert+';refreshLabelAlert()',ctx);
assert.equal(shown,'Tare trop élevée · change de panier',
 'Une relecture Cloudflare ratée ne doit pas masquer une tare connue');
ctx.latestLabelFields=null;
vm.runInContext('refreshLabelAlert()',ctx);
assert(shown.includes('Cloudflare'),'Sans lecture locale, l’erreur réseau reste affichée');

const validation=segment('function validateResult(result){',
 ' // Une lecture EAN13 purement optique');
const checkCtx=vm.createContext({
 window:{IUDigiCatalogLookup:{resolve:()=>({
  ok:true,name:'POIVRON JAUNE',plu:'3403',eanPrefix:'0203476'
 })}},
 eanCheck:(s)=>{let total=0;for(let i=0;i<12;i++)
  total+=Number(s[i])*(i%2===0?1:3);
  return String((10-total%10)%10)},
 fieldsChecks:()=>({barcodePriceConsistent:null})
});
vm.runInContext(validation+';globalThis.validate=validateResult;',checkCtx);
const value={fields:{weightGrams:500,pricePerKgCents:299,
 totalCents:150,ean13:'0203476013844'},checks:{}};
assert.equal(checkCtx.validate(value).plu,'3403');
assert(checkCtx.validate({...value,checks:{recoveryInterrupted:true}}).error
 .includes('Vérification complémentaire interrompue'),
 'Une vérification expirée ne doit jamais autoriser une pesée sans preuve');

const request=segment('async function requestGeminiWithRecovery(',
 ' // Une seule relecture groupée de la photo');
async function errorFor(status,payload={},provider='gemini'){
 let count=0;
 const netCtx=vm.createContext({
  endpoint:'https://example.invalid/gemini-lab',
  generation:13,DOMException,
  fetch:async()=>{count++;
   return new Response(JSON.stringify(payload),{status,
    headers:{'Content-Type':'application/json'}});}
 });
 vm.runInContext(request+';globalThis.request=requestGeminiWithRecovery;',netCtx);
 let message=null;
 try{
  await netCtx.request('A'.repeat(128),'test-key',
   provider==='mistral'?'mistral-ocr-4-1':'gemini-3.5-flash-lite',
   new AbortController().signal,13,null,provider);
 }catch(error){message=error.message;}
 assert.equal(count,1,'Pas de nouvel appel Gemini automatique');
 return message;
}
(async()=>{
 assert((await errorFor(503,{error:'Service Gemini indisponible.'}))
  .includes('Cloudflare–Gemini'));
 assert((await errorFor(503,{error:'Erreur fournisseur',providerStatus:503}))
  .includes('Gemini temporairement indisponible'));
 assert((await errorFor(504,{error:'Délai Gemini dépassé.'}))
  .includes('délai Cloudflare'));
 assert((await errorFor(422,{error:'Réponse Gemini vide'}))
  .includes('Étiquette non lue'));
 assert((await errorFor(429,{error:'Quota Gemini atteint.'}))
  .includes('Limite API Gemini atteinte (429)'));
 assert((await errorFor(429,{error:'Limite API Mistral atteinte.',provider:'mistral',providerStatus:429},
  'mistral')).includes('Limite API Mistral atteinte (429)'));
 assert((await errorFor(429,{error:'Limite API Mistral atteinte.',provider:'mistral',
  providerStatus:429,retryAfterSeconds:15},'mistral')).includes('attends 15 s'));
 assert((await errorFor(402,{error:'Paiement requis',provider:'mistral',
  providerStatus:402},'mistral')).includes('facturation ou crédits API'));
 assert((await errorFor(503,{error:'Erreur Gemini',providerStatus:504}))
  .includes('Gemini a renvoyé une erreur de délai'));
 assert((await errorFor(429,{error:'Quota Gemini atteint.',provider:'gemini',
  providerStatus:429},'mistral')).includes('Cloudflare a répondu via Gemini'));
 assert((await errorFor(400,{error:'Modèle ou image JPEG incorrect.'}))
  .includes('Photo non acceptée'));
 assert(js.includes("if(error?.name==='AbortError'&&id!==generation)throw error;"),
  'Une interruption de seconde lecture peut conserver les données de la première');
 assert(js.includes('recoveryInterrupted:true'),
  'Une confirmation manquante bloque la validation automatique');
 console.log('OK : panne IA ≠ tare, statuts détaillés, brouillon conservé et validation sûre');
})().catch(e=>{console.error(e);process.exitCode=1});
