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
  const url='https://api.apify.com/v2/acts/ratatoskr~systeme-u-scraper/run-sync-get-dataset-items?maxTotalChargeUsd=0.10&maxItems=1&restartOnError=false';
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

// Diagnostic strictement non facturable côté Apify : lecture HTML d'une seule
// fiche Courses U publique. Aucun prix n'est transmis au calculateur d'inventaire.
async function htmlCheck(request,env,origin){
 if(!env.COURSESU_TEST_TOKEN||request.headers.get('X-IU-Pilot-Key')!==env.COURSESU_TEST_TOKEN)
  return reply({error:'Clé privée de test requise ; aucun accès externe effectué'},401,origin);
 const sourceUrl='https://www.coursesu.com/p/carotte/1892766.html';
 const stop=new AbortController(),timeout=setTimeout(()=>stop.abort(),12000);
 try{
  const response=await fetch(sourceUrl,{method:'GET',redirect:'manual',
   headers:{'Accept':'text/html','Accept-Language':'fr-FR,fr;q=0.9'},signal:stop.signal});
  const upstreamStatus=response.status;
  const contentType=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(upstreamStatus!==200||contentType!=='text/html'){
   return reply({type:'inventaires-u-html-check',upstreamStatus,htmlReceived:false,
    contentType:contentType||null,actorExecuted:false,usableForWeight:false},200,origin);
  }
  if(!response.body)return reply({error:'Corps HTML absent',actorExecuted:false},502,origin);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let html='',bytes=0;
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>600000){
    await reader.cancel();
    return reply({error:'Page HTML trop volumineuse',upstreamStatus,actorExecuted:false},502,origin);
   }
   html+=decoder.decode(value,{stream:true});
  }
  html+=decoder.decode();
  // L'ID du magasin provient des données de la page, pas des scripts génériques.
  const dataLayerMatch=html.match(/\bdataLayerNC\s*=\s*(\{[^\r\n]{1,3000}\})/);
  let storeId=null;
  if(dataLayerMatch){
   try{storeId=String(JSON.parse(dataLayerMatch[1]).store_id||'')}catch(_){}
  }
  // Vérification par le JSON-LD Product, évite de confondre le nom et le prix
  // d'un article recommandé avec celui de la fiche consultée.
  const products=[];
  const ldTags=html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for(const tag of ldTags){
   try{
    const data=JSON.parse(tag[1]);
    const candidates=Array.isArray(data)?data:(Array.isArray(data?.['@graph'])?data['@graph']:[data]);
    for(const item of candidates)if(item?.['@type']==='Product')products.push(item);
   }catch(_){}
  }
  const productMatches=products.filter(p=>p['@id']===sourceUrl&&
   String(p.mpn||'')==='1892766'&&String(p.sku||'')==='0203476000004'&&
   normalize(p.name)==='carotte');
  // La page peut afficher le même tarif en version desktop, mobile et sticky.
  // On n'accepte qu'une seule valeur €/kg distincte.
  const unitRates=[];
  for(const tag of html.matchAll(/<span\b([^>]*)>([^<]{0,200})<\/span>/gi)){
   const cls=tag[1].match(/\bclass\s*=\s*["']([^"']+)["']/i)?.[1]||'';
   if(!cls.split(/\s+/).includes('unit-info'))continue;
   const label=tag[2].replace(/&#8364;|&#x20ac;|&euro;/gi,'€')
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
   const m=label.match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*€\s*\/\s*kg$/i);
   if(!m)continue;
   const cents=Math.round(Number(m[1].replace(',','.'))*100);
   if(Number.isSafeInteger(cents)&&cents>0&&cents<=99900)unitRates.push(cents);
  }
  const distinct=[...new Set(unitRates)];
  const storeVerified=storeId==='68539';
  const productVerified=productMatches.length===1;
  return reply({type:'inventaires-u-html-check',upstreamStatus,htmlReceived:true,
   storeVerified,productVerified,unitPriceOccurrences:unitRates.length,
   unitPriceDistinctCount:distinct.length,
   observedUnitPriceEurKg:storeVerified&&productVerified&&distinct.length===1
    ?distinct[0]/100:null,
   actorExecuted:false,usableForWeight:false,
   note:'Diagnostic uniquement ; équivalence commerciale DIGI non confirmée'},200,origin);
 }catch(_){
  return reply({type:'inventaires-u-html-check',
   error:stop.signal.aborted?'Délai de lecture HTML dépassé':'Lecture HTML impossible',
   actorExecuted:false,usableForWeight:false},502,origin);
 }finally{clearTimeout(timeout)}
}


// Essai privé Gemini, distinct du moteur de pesée. Aucune écriture en inventaire.
// Activation opt-in GEMINI_LAB_ENABLED + clef utilisateur TEST jamais publiée.
// Les appels Gemini sont susceptibles de consommer des quotas ou d'être facturés.
function geminiLabValue(raw,kind){
 // Les réponses Gemini utilisent parfois les unités imprimées :
 // « 0,714 kg », « 5,99 €/kg » ou « 4,28 € ». Ne jamais perdre ces
 // valeurs valides pour une simple différence de présentation.
 if(typeof raw!=='string')return null;
 const text=raw.trim().replace(/[\u00a0\u202f\s]+/g,'')
  .replace(/,/g,'.').replace(/€/g,'€');
 if(kind==='weight'){
  let grams=null;
  const kg=text.match(/^(\d{1,2})\.(\d{3})(?:kg)?$/i);
  const gram=text.match(/^(\d{1,5})g$/i);
  if(kg)grams=Number(kg[1])*1000+Number(kg[2]);
  else if(gram)grams=Number(gram[1]);
  return Number.isSafeInteger(grams)&&grams>=1&&grams<=30000?grams:null;
 }
 // €/kg ne peut s'appliquer qu'au prix unitaire ; jamais au prix total.
 const rate=kind==='rate'||kind==='money';
 const pattern=rate
  ?/^(\d{1,3})\.(\d{2})(?:€(?:\/kg|\/kilo|kg)?)?$/i
  :/^(\d{1,3})\.(\d{2})(?:€)?$/i;
 const match=text.match(pattern);
 if(!match)return null;
 const cents=Number(match[1])*100+Number(match[2]);
 return cents>0&&cents<=99999?cents:null;
}
function geminiLabName(value){
 if(typeof value!=='string')return null;
 const name=value.trim();
 return name.length>=2&&name.length<=70&&/^[\p{L}\d '.\-]+$/u.test(name)?name:null;
}
async function geminiPilot(request,env,origin){
 const closed={type:'inventaires-u-gemini-lab',actorExecuted:false,
  inventoryUpdated:false};
 if(env.GEMINI_LAB_ENABLED!=='true')
  return reply({...closed,error:'Pilote Gemini désactivé. Aucun appel lancé.'},503,origin);
 if(!env.COURSESU_TEST_TOKEN||request.headers.get('X-IU-Pilot-Key')!==env.COURSESU_TEST_TOKEN)
  return reply({...closed,error:'Clé privée de pilote requise. Aucun appel lancé.'},401,origin);
 if(!env.GEMINI_API_KEY)return reply({...closed,error:'GEMINI_API_KEY non configurée.'},503,origin);
 let payload;
 try{
  const length=Number(request.headers.get('content-length')||0);
  if(length>800000)throw Error('Image trop volumineuse');
  const text=await request.text();
  if(text.length>800000)throw Error('Image trop volumineuse');
  payload=JSON.parse(text);
 }catch(_){return reply({...closed,error:'Image ou JSON invalide.'},400,origin)}
 const model=payload?.model;
 if(!['gemini-3.8-flash','gemini-3.5-flash-lite'].includes(model)||
    payload?.type!=='iu-gemini-label-test'||
    payload?.mimeType!=='image/jpeg'||
    typeof payload?.imageBase64!=='string'||payload.imageBase64.length>700000||
    payload.imageBase64.length<100||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.imageBase64))
  return reply({...closed,error:'Modèle ou image JPEG incorrect.'},400,origin);
 const photoBytes=payload.imageBase64.length*3/4;
 if(photoBytes>525000)return reply({...closed,error:'Photo trop volumineuse.'},413,origin);
 const focus=['name','weight','rate','total','ean'].includes(payload?.focusField)
  ?payload.focusField:null;
 const generalPrompt='Tu es un lecteur visuel d’étiquettes DIGI du rayon fruits et légumes. '
  +'Lis uniquement les informations VISIBLES sur cette seule photo, sans inventer, déduire ou compléter. '
  +'Rends un objet JSON uniquement avec les clés name, weightKg, pricePerKgEur, totalEur, ean13. '
  +'Chaque valeur est une chaîne exacte ou null si texte non visible, ambigu ou illisible. '
  +'weightKg = nombre imprimé devant kg sous Poids net (ex. "1,058"); '
  +'pricePerKgEur = prix imprimé devant €/kg (ex. "1,99"); '
  +'totalEur = prix affiché dans Prix à payer (ex. "2,11"); '
  +'ean13 = exactement 13 chiffres lisibles, sinon null. '
  +'NE déduis JAMAIS un chiffre par la somme, le prix, le code ou un article supposé.';
 const focusNames={name:'le nom du produit',weight:'le poids net imprimé',rate:'le prix unitaire en €/kg',
  total:'le prix à payer',ean:'les 13 chiffres sous le code-barres EAN-13'};
 const focusKeys={name:'name',weight:'weightKg',rate:'pricePerKgEur',total:'totalEur',ean:'ean13'};
 const prompt=focus?generalPrompt+
  ' Cette requête est une RELECTURE CIBLÉE : concentre-toi uniquement sur '+focusNames[focus]+
  '. Renseigne uniquement la propriété '+focusKeys[focus]+
  ' dans les 5 clés JSON. Mets les quatre autres propriétés à null. Aucune supposition.'
  :generalPrompt;
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),55000);
 const started=Date.now();
 let providerAnswered=false;
 try{
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'
   +model+':generateContent',{
    method:'POST',signal:abort.signal,
    headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({
     contents:[{role:'user',parts:[{text:prompt},
      {inline_data:{mime_type:'image/jpeg',data:payload.imageBase64}}]}],
     generationConfig:{temperature:0,maxOutputTokens:1024,responseMimeType:'application/json'}
    })
   });
  if(!res.ok){
   const status=res.status;
   // Ne pas faire fuiter le corps de la réponse, qui peut contenir des données du compte.
   const diagnostic=status===401||status===403?'Clé Gemini non autorisée pour ce projet.'
    :status===429?'Quota Gemini atteint. Ne pas réessayer en boucle.'
    :status===404?'Modèle non accessible avec cette clé API.'
    :status===400?'Paramètres refusés par Gemini.'
    :'Erreur du fournisseur Gemini.';
   // Ne pas transformer un refus d’accès/quota en fausse panne HTTP 502.
   const outputStatus=status===429?429:[401,403].includes(status)?403
    :status===404?404:status===400?400:[500,502,503,504].includes(status)?503:502;
   return reply({...closed,error:diagnostic,providerStatus:status,model},outputStatus,origin);
  }
  providerAnswered=true;
  const raw=await res.text();
  if(raw.length>16000)throw Error('Réponse trop volumineuse');
  const data=JSON.parse(raw);
  const candidate=data?.candidates?.[0];
  // Une réponse interrompue par la limite de tokens ne peut pas être
  // interprétée comme une étiquette fiable, même si le JSON est partiel.
  if(candidate?.finishReason==='MAX_TOKENS')
   return reply({...closed,error:'Réponse Gemini incomplète (limite de génération). Recadrez l’étiquette et réessayez.',
    model},422,origin);
  const parts=candidate?.content?.parts||[];
  const answer=parts.filter(p=>typeof p?.text==='string').map(p=>p.text).join('');
  if(!answer.trim())
   return reply({...closed,error:'Réponse Gemini vide. Centrez l’étiquette et réessayez.',
    model},422,origin);
  if(answer.length>5000)throw Error('Réponse trop longue');
  // Certaines réponses textuelles conservent des balises Markdown malgré
  // responseMimeType. Accepter le JSON strict puis, à défaut, le bloc JSON.
  let extracted;
  try{extracted=JSON.parse(answer)}
  catch(_){
   const match=answer.trim().match(/^(?:```(?:json)?\s*)?(\{[\s\S]*\})(?:\s*```)?$/i);
   if(!match)
    return reply({...closed,error:'Réponse Gemini non exploitable. Recadrez l’étiquette et réessayez.',
     model},422,origin);
   try{extracted=JSON.parse(match[1])}
   catch(_){
    return reply({...closed,error:'Réponse Gemini incomplète. Recadrez l’étiquette et réessayez.',
     model},422,origin);
   }
  }
  if(!extracted||typeof extracted!=='object'||Array.isArray(extracted))throw Error('JSON non reconnu');
  const weightGrams=geminiLabValue(extracted.weightKg,'weight');
  const pricePerKgCents=geminiLabValue(extracted.pricePerKgEur,'rate');
  const totalCents=geminiLabValue(extracted.totalEur,'total');
  const ean13=typeof extracted.ean13==='string'&&validEAN13(extracted.ean13)
    ?extracted.ean13:null;
  const coherent=weightGrams!==null&&pricePerKgCents!==null&&totalCents!==null
    &&Math.abs(Math.round(weightGrams*pricePerKgCents/1000)-totalCents)<=1;
  return reply({...closed,model,focusField:focus,elapsedMs:Date.now()-started,
   fields:{name:geminiLabName(extracted.name),weightGrams,pricePerKgCents,totalCents,ean13},
   checks:{arithmeticConsistent:coherent,eanChecksumValid:ean13!==null},
   verifiedForInventory:false,warning:'Données indicatives : vérifier visuellement chaque chiffre avant toute utilisation.'},
   200,origin);
 }catch(_){
  const status=abort.signal.aborted?504:providerAnswered?422:503;
  const message=abort.signal.aborted?'Délai Gemini dépassé.'
   :providerAnswered?'Réponse Gemini non exploitable.':'Service Gemini indisponible.';
  return reply({...closed,error:message,model},status,origin);
 }finally{clearTimeout(timeout)}
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
  if(path==='/html-check'&&request.method==='POST')return htmlCheck(request,env,origin);
  if(path==='/gemini-lab'&&request.method==='POST')return geminiPilot(request,env,origin);
  if(request.method!=='POST'||path!=='/lookup')
   return reply({error:'Route invalide'},405,origin);
  return lookup(request,env,origin);
 }
};
