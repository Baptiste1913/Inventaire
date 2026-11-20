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
  code.slice(0,7)!==prefix||!/^\d{1,8}$/.test(plu))
  return reply({error:'Code EAN13, préfixe ou PLU incorrect'},400,origin);
 let mapping,match;
 try{
  mapping=JSON.parse(env.COURSESU_MATCHES_JSON);
  match=mapping[plu+'|'+prefix];
  if(!match||!/^\d{1,14}$/.test(String(match.productId||''))||
   !String(match.expectedName||'').trim()||
   !String(match.expectedStoreName||'').trim()||
   !String(match.expectedStorePostcode||'').trim()||
   !String(match.productUrl||'').startsWith('https://www.coursesu.com/p/'))
   throw Error('Article non apparié à une fiche Courses U vérifiée');
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
 const matches=records.filter(row=>
  String(row?.extId||'')===String(match.productId)&&
  String(row?.storeExtId||'')===storeId&&
  normalizedName(row.name,match.expectedName)&&
  normalize(row.storeName).includes(normalize(match.expectedStoreName))&&
  String(row.storeAddress||'').includes(String(match.expectedStorePostcode))&&
  row.currency==='EUR'
 );
 if(matches.length!==1)return reply({error:'Produit ou magasin non confirmé par le scraper'},422,origin);
 const row=matches[0],price=pricePerKg(row);
 if(price===null)return reply({error:'Aucun prix explicitement libellé en €/kg (prix à la pièce refusé)'},422,origin);
 return reply({type:'inventaires-u-live-price',verified:true,storeId:STORE,
  eanPrefix:prefix,plu,name:String(row.name||''),pricePerKg:price,pricePerKgUnit:'EUR/kg',
  checkedAt:new Date().toISOString(),sourceUrl:match.productUrl},200,origin);
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
