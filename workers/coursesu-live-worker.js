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
  String(row.extId||'')===String(match.productId)&&
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
   !String(match.expectedName||'').trim()||
   !String(match.digiName||'').trim()||
   !validEAN13(String(match.catalogEan||''))||
   String(match.catalogEan).slice(0,7)!==prefix||
   !String(match.expectedStoreName||'').trim()||
   !String(match.expectedStorePostcode||'').trim()||
   !String(match.productUrl||'').startsWith('https://www.coursesu.com/p/'))
   throw Error('Article non apparié à une fiche Courses U et un EAN vérifiés');
  if(normalize(input.name)!==normalize(match.digiName))
   throw Error('Nom de l’article DIGI différent du produit associé');
  const samePrefix=Object.entries(mapping).filter(([key])=>key.endsWith('|'+prefix));
  if(samePrefix.length!==1||samePrefix[0][0]!==plu+'|'+prefix)
   throw Error('Préfixe EAN associé à plusieurs produits : identification bloquée');
 }catch(e){return reply({error:e.message||'Correspondance invalide'},422,origin)}
 const storeId=String(env.COURSESU_STORE_ID),stop=new AbortController();
 const timeout=setTimeout(()=>stop.abort(),10000);
 let records;
 try{
  const url='https://api.apify.com/v2/acts/ratatoskr~systeme-u-scraper/run-sync-get-dataset-items';
  const response=await fetch(url,{method:'POST',headers:{
   'Authorization':'Bearer '+env.APIFY_TOKEN,
   'Content-Type':'application/json'
  },body:JSON.stringify({storeIds:[storeId],productIds:[String(match.productId)],maxItemsPerStore:1,language:'fr'}),signal:stop.signal});
  if(!response.ok)throw Error('Scraper HTTP '+response.status);
  const text=await response.text();
  if(text.length>120000)throw Error('Réponse du scraper trop volumineuse');
  records=JSON.parse(text);
 }catch(e){
  return reply({error:stop.signal.aborted?'Délai de scraping dépassé (10 s)':String(e.message||'Échec scraper').slice(0,100)},504,origin);
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
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'3600','Vary':'Origin'
   }});
  }
  if(request.method!=='POST'||new URL(request.url).pathname!=='/lookup')
   return reply({error:'Route invalide'},405,origin);
  return lookup(request,env,origin);
 }
};
