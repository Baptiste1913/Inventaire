/*
 Exemple de passerelle Cloudflare Worker pour Inventaires U.
 Nécessite des secrets côté Worker (APIFY_TOKEN et COURSESU_MATCHES_JSON).
 Aucun accès au scraper n'est actif tant que le Worker n'est pas déployé.
*/
const STORE='superu-saintgermain';
function reply(body,status,origin){
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin'
 }});
}
function normalize(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function validEAN13(code){
 if(!/^\d{13}$/.test(String(code||'')))return false;
 let sum=0;
 for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2?3:1);
 return (10-sum%10)%10===Number(code[12]);
}
function pricePerKg(row){
 if(row?.pricePerKgUnit==='EUR/kg'){
  const p=Number(row.pricePerKg);
  if(Number.isFinite(p)&&p>0&&p<=999&&Math.abs(p*100-Math.round(p*100))<1e-6)return p;
 }
 const explicit=[row?.pricePerUnit,row?.unitPrice,row?.pricePerKgLabel];
 const prices=[];
 for(const label of explicit){
  if(typeof label!=='string')continue;
  const m=label.replace(/[\u00a0\u202f]/g,' ').match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|EUR)\s*(?:\/|par\s+|le\s+)\s*(?:kg|kilo(?:gramme)?)/i);
  if(m)prices.push(Number(m[1].replace(',','.')));
 }
 const unique=[...new Set(prices)];
 return unique.length===1&&unique[0]>0&&unique[0]<=999?unique[0]:null;
}
// La contenance retournée par le scraper (capacityVolume/capacityUnit) ne
// suffit pas : la fiche carotte a renvoyé 1 kg au lieu de 750 g.
// Un calcul n'est autorisé que depuis une quantité *séparément vérifiée*
// sur la fiche du même produit, datée et enregistrée côté serveur.
function confirmedKgRate(row,match){
 // Une identité numérique (EAN/nom) ne prouve pas une offre commerciale identique :
 // ex. carotte en sachet de 750 g vs carotte en vrac pesée par balance DIGI.
 if(match?.sameRetailOfferVerified!==true)return null;
 const explicit=pricePerKg(row);
 if(explicit!==null)return {price:explicit,source:'explicit-EUR/kg'};
 const grams=Number(match?.verifiedPackGrams);
 const date=String(match?.packVerifiedAt||'');
 if(!Number.isInteger(grams)||grams<50||grams>20000||
  match?.sameRetailOfferVerified!==true||
  match?.packVerifiedSource!==match?.productUrl||
  !/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const then=Date.parse(date+'T12:00:00Z'),age=Date.now()-then;
 if(!Number.isFinite(then)||age<0||age>30*86400000)return null;
 const sale=Number(row?.price);
 if(row?.currency!=='EUR'||!Number.isFinite(sale)||sale<=0||sale>999||
  Math.abs(sale*100-Math.round(sale*100))>1e-6)return null;
 const cents=Math.round(Math.round(sale*100)*1000/grams);
 if(cents<1||cents>99999)return null;
 return {price:cents/100,source:'verified-packaging',packGrams:grams,
  packVerifiedAt:date};
}
// Identité stricte du produit et du magasin, contrôlée hors de la requête HTTP.
// Le champ storeAddress n'est pas toujours présent dans les résultats du scraper :
// l'ID 68539 a été vérifié séparément avec storeSearch pour Saint-Germain (10120).
// Une adresse présente mais incompatible est systématiquement refusée.
function verifiedCatalogRow(row,match,storeId,prefix){
 return !!row&&String(storeId)==='68539'&&
  String(match.expectedStorePostcode)==='10120'&&
  String(row.storeExtId||'')===String(storeId)&&
  String(row.extId||'')===String(match.actorExtId)&&
  validEAN13(String(row.ean||''))&&
  String(row.ean)===String(match.catalogEan)&&
  String(row.ean).slice(0,7)===prefix&&
  !!normalize(row.name)&&normalize(row.name)===normalize(match.expectedName)&&
  !!normalize(row.storeName)&&
  normalize(row.storeName)===normalize(match.expectedStoreName)&&
  (!row.storeAddress||String(row.storeAddress).includes('10120'))&&
  row.currency==='EUR';
}
async function lookup(request,env,origin){
 if(env.COURSESU_LIVE_ENABLED!=='true')
  return reply({error:'Recherches Apify désactivées pendant la configuration : aucun appel payant autorisé'},503,origin);
 // Pilote uniquement : le navigateur public n'a pas cette clé, même si le mode live est activé.
 if(!env.COURSESU_TEST_TOKEN||request.headers.get('X-IU-Pilot-Key')!==env.COURSESU_TEST_TOKEN)
  return reply({error:'Clé privée de test requise : aucun appel Apify lancé'},401,origin);
 if(!env.APIFY_TOKEN||!env.COURSESU_STORE_ID||!env.COURSESU_MATCHES_JSON)
  return reply({error:'Passerelle non configurée : token, magasin et correspondances requis'},503,origin);
 let input;
 try{
  const body=await request.text();
  if(body.length>5000)throw Error('trop volumineux');
  input=JSON.parse(body);
 }catch(_){return reply({error:'Requête JSON invalide'},400,origin)}
 const code=String(input?.code||''),prefix=String(input?.eanPrefix||''),plu=String(input?.plu||'');
 if(input?.type!=='inventaires-u-price-lookup'||input.storeId!==STORE||
  !/^\d{13}$/.test(code)||!/^(?:02|2\d)\d{5}$/.test(prefix)||
  code.slice(0,7)!==prefix||!validEAN13(code)||!/^\d{1,8}$/.test(plu))
  return reply({error:'Code EAN13, préfixe ou PLU incorrect'},400,origin);
 let mapping,match;
 try{
  mapping=JSON.parse(env.COURSESU_MATCHES_JSON);
  match=mapping[plu+'|'+prefix];
  if(!match||!/^\d{1,14}$/.test(String(match.productId||''))||
   !/^\d{1,14}$/.test(String(match.actorExtId||''))||
   !String(match.expectedName||'').trim()||
   !String(match.digiName||'').trim()||
   !validEAN13(String(match.catalogEan||''))||
   String(match.catalogEan).slice(0,7)!==prefix||
   !String(match.expectedStoreName||'').trim()||
   !String(match.expectedStorePostcode||'').trim()||
   !String(match.productUrl||'').startsWith('https://www.coursesu.com/p/')||
   !String(match.productUrl||'').endsWith('/'+String(match.productId)+'.html'))
   throw Error('Article non apparié à une fiche Courses U et un EAN vérifiés');
  if(normalize(input.name)!==normalize(match.digiName))
   throw Error('Nom de l’article DIGI différent du produit associé');
  const samePrefix=Object.entries(mapping).filter(([key])=>key.endsWith('|'+prefix));
  if(samePrefix.length!==1||samePrefix[0][0]!==plu+'|'+prefix)
   throw Error('Préfixe EAN associé à plusieurs produits : identification bloquée');
 }catch(e){return reply({error:e.message||'Correspondance invalide'},422,origin)}
 const storeId=String(env.COURSESU_STORE_ID),stop=new AbortController();
 const timeout=setTimeout(()=>stop.abort(),60000);
 let records;
 try{
  const url='https://api.apify.com/v2/acts/ratatoskr~systeme-u-scraper/run-sync-get-dataset-items?maxTotalChargeUsd=0.02&maxItems=1&restartOnError=false';
  const response=await fetch(url,{method:'POST',headers:{
   'Authorization':'Bearer '+env.APIFY_TOKEN,
   'Content-Type':'application/json'
  },body:JSON.stringify({storeIds:[storeId],productIds:[String(match.actorExtId)],maxItemsPerStore:1,language:'fr'}),signal:stop.signal});
  if(!response.ok){
   // Ne jamais exposer la réponse brute : elle pourrait contenir des données sensibles.
   // Le type d'erreur Apify est un identifiant technique contrôlé, pas un message libre.
   let payload=null;
   try{payload=await response.json()}catch(_){}
   const rawType=payload?.error?.type;
   const errorType=typeof rawType==='string'&&/^[a-z0-9-]{1,72}$/.test(rawType)
    ?rawType:'unknown';
   const explanations={
    'insufficient-permissions':'Permissions insuffisantes pour cet appel ; vérifier la portée exacte du token.',
    'missing-actor-rights':'Le token ne dispose pas des droits nécessaires sur cet Actor.',
    'full-permission-actor-not-approved':'Approbation des permissions de l’Actor requise dans la console Apify.',
    'actor-is-not-rented':'L’accès à cet Actor n’est pas activé pour ce compte Apify.',
    'actor-not-found':'Actor introuvable ou inaccessible avec ce token.',
    'invalid-token':'Token Apify invalide.',
    'not-enough-usage-to-run-paid-actor':'Crédits ou limite d’utilisation insuffisants.',
    'apify-plan-required-to-use-paid-actor':'Abonnement Apify incompatible avec cet Actor payant.',
    'max-total-charge-usd-below-minimum':'Le plafond de coût par exécution est inférieur au minimum autorisé.',
    'invalid-input':'Paramètres d’entrée refusés par Apify.'
   };
   return reply({error:'Requête refusée par Apify',apifyStatus:response.status,
    apifyErrorType:errorType,
    diagnostic:explanations[errorType]||'Cause non déterminée : vérifier le type d’erreur Apify.',
    actorRunVerified:false},502,origin);
  }
  const text=await response.text();
  if(text.length>120000)throw Error('Réponse du scraper trop volumineuse');
  records=JSON.parse(text);
 }catch(e){
  return reply({error:stop.signal.aborted?'Délai de scraping dépassé (60 s)':String(e.message||'Échec scraper').slice(0,100)},504,origin);
 }finally{clearTimeout(timeout)}
 if(!Array.isArray(records))return reply({error:'Format de réponse scraper inconnu'},502,origin);
 const matches=records.filter(row=>verifiedCatalogRow(row,match,storeId,prefix));
 if(matches.length!==1)return reply({error:'Produit ou magasin non confirmé par le scraper'},422,origin);
 const row=matches[0],rate=confirmedKgRate(row,match);
 if(rate===null)return reply({error:'EAN et article confirmés, mais prix €/kg non fiable : contenance non vérifiée ou tarif indisponible'},422,origin);
 return reply({type:'inventaires-u-live-price',verified:true,storeId:STORE,
  eanPrefix:prefix,plu,name:String(row.name||''),catalogEan:row.ean,
  pricePerKg:rate.price,pricePerKgUnit:'EUR/kg',priceSource:rate.source,
  packGrams:rate.packGrams||null,checkedAt:new Date().toISOString(),
  sourceUrl:match.productUrl},200,origin);
}
// Diagnostic sans exécution d'Actor : permet d'identifier les tokens invalides
// et les tokens à droits restreints (403 attendu sur /v2/users/me).
async function authCheck(request,env,origin){
 if(!env.COURSESU_TEST_TOKEN||request.headers.get('X-IU-Pilot-Key')!==env.COURSESU_TEST_TOKEN)
  return reply({error:'Clé privée de test requise'},401,origin);
 if(!env.APIFY_TOKEN)return reply({error:'Token Apify non configuré'},503,origin);
 const stop=new AbortController(),timeout=setTimeout(()=>stop.abort(),10000);
 try{
  // Cet endpoint ne démarre aucun Actor et n'accède à aucune donnée facturable.
  const response=await fetch('https://api.apify.com/v2/users/me',{
   method:'GET',headers:{Authorization:'Bearer '+env.APIFY_TOKEN},signal:stop.signal
  });
  let payload;
  try{payload=await response.json()}catch(_){payload=null}
  const errorType=String(payload?.error?.type||'').slice(0,60);
  const verdict=response.status===200?'recognized':
   response.status===403&&errorType==='insufficient-permissions'?'recognized-restricted':
   response.status===401?'rejected':'inconclusive';
  return reply({type:'inventaires-u-apify-auth-check',
   apifyStatus:response.status,errorType:errorType||null,tokenStatus:verdict,
   actorExecuted:false,actorRunPermissionVerified:false},200,origin);
 }catch(_){return reply({error:stop.signal.aborted?'Délai de vérification Apify dépassé':'Erreur réseau Apify',actorExecuted:false},502,origin)}
 finally{clearTimeout(timeout)}
}
function normalizedName(a,b){return !!normalize(a)&&normalize(a)===normalize(b)}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const allow=(env.ALLOWED_ORIGINS||'https://inventaires-u.com,https://baptiste1913.github.io')
   .split(',').map(s=>s.trim());
  if(!allow.includes(origin))return new Response('Origine interdite',{status:403});
  if(request.method==='OPTIONS'){
   return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-IU-Pilot-Key',
    'Access-Control-Max-Age':'3600','Vary':'Origin'
   }});
  }
  const path=new URL(request.url).pathname;
  if(path==='/auth-check'&&request.method==='POST')return authCheck(request,env,origin);
  if(request.method!=='POST'||path!=='/lookup')
   return reply({error:'Route invalide'},405,origin);
  return lookup(request,env,origin);
 }
};
