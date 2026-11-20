/* Inventaires U — diagnostic Apify ciblé : tarif explicite €/kg, sans approximation. */
import { Actor } from 'apify';

const HOST = 'https://www.coursesu.com';
const SITE = '/on/demandware.store/Sites-DigitalU-Site/fr_FR';

function clean(s) {
 return String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;|&#8239;/gi,' ')
  .replace(/&euro;|&#8364;/gi,'€').replace(/\s+/g,' ').trim();
}
function norm(s) {
 return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function parsePrice(html,expectedName) {
 const title = html.match(/<h1\b[^>]*\bdata-name-link=["']([^"']+)["']/i)
  || html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
 const name=clean(title?.[1]);
 if(!name||!norm(expectedName)||!norm(name).includes(norm(expectedName)))
  throw Error('Produit non confirmé : titre absent ou différent');
 const noScripts=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ');
 const fragments=[...noScripts.matchAll(/<(?:p|span|div)\b[^>]*class=["'][^"']*\bunit-info\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|span|div)>/gi)].map(x=>clean(x[1]));
 const cents=new Set();
 for(const text of fragments){
  for(const x of text.matchAll(/(?:^|[^\d.,])(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:€|EUR)\s*(?:\/|par\s+|le\s+)\s*(?:kg|kilo(?:gramme)?)\b/gi)){
   const n=Math.round(Number(x[1].replace(',','.'))*100);
   if(n>0&&n<=99999)cents.add(n);
  }
 }
 if(cents.size!==1)throw Error(cents.size?'Prix €/kg contradictoires':'Aucun prix explicite €/kg dans unit-info');
 return {name,pricePerKg:[...cents][0]/100,pricePerKgUnit:'EUR/kg',priceSource:'explicit-unit-info'};
}
function selected(status,cookieId,expectedName,postcode) {
 if(!cookieId||!status||typeof status!=='object'||status.storeNotActive===true)return false;
 return [status.selectedStore,status.currentStore,status.store,status.storeData,status.selectedStoreData,status]
  .filter(x=>x&&typeof x==='object'&&!Array.isArray(x))
  .some(s=>{
   const id=String(s.id??s.storeId??s.extId??s.storeExtId??'');
   const name=String(s.name??s.storeName??s.displayName??'');
   const addr=String(s.address??s.storeAddress??s.postcode??s.postalCode??s.zipCode??'');
   return id===cookieId&&norm(name).includes(norm(expectedName))&&addr.includes(postcode);
  });
}
function session() {
 const cookies=new Map();
 async function get(path) {
  if(!path.startsWith('/')||path.startsWith('//'))throw Error('Chemin non autorisé');
  const headers={'Accept':'text/html,application/json;q=0.8','User-Agent':'InventairesUPricePilot/1.0'};
  if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
  const r=await fetch(HOST+path,{headers,redirect:'follow',signal:AbortSignal.timeout(7000)});
  if(new URL(r.url).origin!==HOST)throw Error('Redirection hors Courses U');
  if([403,429].includes(r.status))throw Error('Accès refusé/limité (HTTP '+r.status+')');
  if(!r.ok)throw Error('Courses U HTTP '+r.status);
  if(Number(r.headers.get('content-length'))>2000000)throw Error('Page trop volumineuse');
  const set=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():String(r.headers.get('set-cookie')||'').split(/,(?=\s*[\w-]+=)/);
  for(const c of set){const m=/^([\w-]+)=([^;]*)/.exec(c.trim());if(m)cookies.set(m[1],m[2]);}
  const body=await r.text();
  if(body.length>2000000)throw Error('Page trop volumineuse');
  return body;
 }
 return {get,cookie:key=>cookies.get(key)};
}

await Actor.init();
try {
 const input=await Actor.getInput()||{};
 const productUrl=String(input.productUrl||'https://www.coursesu.com/p/carotte/1892766.html');
 const url=new URL(productUrl);
 const id=/^\/p\/[^/?#]+\/(\d{1,12})\.html\/?$/.exec(url.pathname)?.[1];
 if(url.origin!==HOST||!id||url.search||url.hash)throw Error('URL Courses U invalide');
 const expectedName=String(input.expectedName||'Carotte');
 const storeName=String(input.storeName||'Saint-Germain');
 const postcode=String(input.storePostcode||'10120');
 if(!norm(storeName)||!norm(expectedName)||!/^\d{5}$/.test(postcode))throw Error('Identité magasin ou produit manquante');
 const net=session(),start=Date.now();
 let output;
 try{
  await net.get('/drive/home');
  await net.get('/drive-superu-saintgermain');
  const cookie=net.cookie('storeId');
  if(!cookie)throw Error('Sélection du magasin non confirmée : cookie storeId absent');
  const state=JSON.parse(await net.get(SITE+'/Stores-GetStatus'));
  if(!selected(state,cookie,storeName,postcode))throw Error('Magasin actif non vérifié : aucun tarif accepté');
  const html=await net.get(SITE+'/Product-Show?pid='+encodeURIComponent(id));
  const price=parsePrice(html,expectedName);
  output={ok:true,storeVerified:true,productId:id,storeName,storePostcode:postcode,
   checkedAt:new Date().toISOString(),sourceUrl:productUrl,elapsedMs:Date.now()-start,...price};
 }catch(err){
  output={ok:false,productId:id,storeName,storePostcode:postcode,
   elapsedMs:Date.now()-start,error:String(err?.message||err).slice(0,220)};
 }
 await Actor.pushData(output);
 console.log('Diagnostic Inventaires U:',JSON.stringify(output));
}finally{await Actor.exit();}
