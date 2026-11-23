/* Inventaires U — Worker Cloudflare dédié uniquement à Gemini.
 * Route : POST /gemini-lab, authentifiée par COURSESU_TEST_TOKEN.
 * Images et contrôles stricts du moteur Gemini inchangés.
 * Les opérations Courses U / Apify sont désormais un fichier séparé.
 */
function reply(body,status,origin){
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin'
 }});
}
// Traces d'erreurs uniquement. Aucun contenu utilisateur, photo, en-tête,
// adresse, jeton, réponse Google ou message d'exception n'est enregistré.
function geminiDiagnostic({stage,reason,model=null,providerStatus=null,httpStatus,elapsedMs=0}){
 const safeModel=['gemini-3.8-flash','gemini-3.5-flash-lite','mistral-ocr-4-1'].includes(model)?model:null;
 console.error('IU_GEMINI_DIAGNOSTIC '+JSON.stringify({
  event:'iu_gemini_failure',stage,reason,model:safeModel,
  providerStatus:Number.isInteger(providerStatus)?providerStatus:null,
  httpStatus,elapsedMs:Math.max(0,Math.round(elapsedMs))
 }));
}
function validEAN13(code){
 if(!/^\d{13}$/.test(String(code||'')))return false;
 let sum=0;
 for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2?3:1);
 return (10-sum%10)%10===Number(code[12]);
}
// Conversion stricte des données lues sur l'étiquette DIGI.
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

// Version de test OCR 4.1 : les valeurs ambiguës restent null.
function mistralLabelText(markdown){
 if(typeof markdown!=='string'||markdown.length>16000)return null;
 const raw=markdown.normalize('NFKC').replace(/<[^>]{0,120}>/g,' ')
  .replace(/[\u00a0\u202f]/g,' ');
 const one=(pattern,convert)=>{
  const found=new Set();
  for(const m of raw.matchAll(pattern)){
   const value=convert(m);
   if(value!==null&&value!==undefined)found.add(value);
  }
  return found.size===1?[...found][0]:null;
 };
 // Le poids doit avoir trois décimales ET l'unité kg.
 const weightGrams=one(/(\d{1,2}[,.]\d{3})\s*(?:kg|kilos?)\b/gi,m=>
  geminiLabValue(m[1]+'kg','weight'));
 // €/kg obligatoire : un prix total ne peut pas devenir prix/kg.
 const pricePerKgCents=one(/(\d{1,3}[,.]\d{2})\s*(?:€|euros?)\s*(?:\/\s*kg|kg|\/\s*kilo)\b/gi,m=>
  geminiLabValue(m[1]+'€','rate'));
 // Le total n'est accepté que s'il suit son intitulé.
 const totalCents=one(/(?:prix\s*(?:à|a)\s*payer|montant\s*(?:à|a)\s*payer|total\s*(?:ttc)?)[^\d]{0,55}(\d{1,3}[,.]\d{2})\s*(?:€|eur)?/gi,m=>
  geminiLabValue(m[1]+'€','total'));
 // EAN isolé de 13 chiffres, contrôle de clé, pas de concaténation.
 const ean13=one(/(?:^|[^\d])((?:\d[ \t-]?){12}\d)(?!\d)/gm,m=>{
  const e=m[1].replace(/\D/g,'');
  return validEAN13(e)?e:null;
 });
 return {name:null,weightGrams,pricePerKgCents,totalCents,ean13};
}
async function mistralPilot(payload,env,origin,closed){
 const model='mistral-ocr-4-1',started=Date.now();
 if(!env.MISTRAL_API_KEY){
  geminiDiagnostic({stage:'configuration',reason:'mistral_key_missing',model,httpStatus:503});
  return reply({...closed,provider:'mistral',model,
   error:'Mistral non configuré sur Cloudflare (MISTRAL_API_KEY).'},503,origin);
 }
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),13000);
 let stage='mistral_fetch';
 try{
  const res=await fetch('https://api.mistral.ai/v1/ocr',{
   method:'POST',signal:abort.signal,
   headers:{'Content-Type':'application/json','Authorization':'Bearer '+env.MISTRAL_API_KEY},
   body:JSON.stringify({model,document:{
    type:'image_url',image_url:'data:image/jpeg;base64,'+payload.imageBase64
   },include_image_base64:false})
  });
  stage='mistral_http';
  if(!res.ok){
   const status=res.status;
   const outgoing=[400,401,402,403,404,413,429].includes(status)
    ?(status===401?403:status):[500,502,503,504].includes(status)?503:502;
   // Retry-After est une durée publique et bornée, pas une réponse brute.
   const retryRaw=Number(res.headers?.get('retry-after'));
   const retryAfterSeconds=status===429&&Number.isFinite(retryRaw)&&
    retryRaw>=1&&retryRaw<=180?Math.ceil(retryRaw):null;
   geminiDiagnostic({stage,reason:'provider_http_error',model,
    providerStatus:status,httpStatus:outgoing,elapsedMs:Date.now()-started});
   return reply({...closed,provider:'mistral',model,providerStatus:status,
    ...(retryAfterSeconds?{retryAfterSeconds}:{}),
    error:status===429?'Limite API Mistral atteinte.':
     status===402?'Paiement requis pour l’API Mistral.':
     'Erreur OCR Mistral (HTTP '+status+').'},outgoing,origin);
  }
  stage='mistral_response';
  const data=await res.json(),pages=data?.pages;
  if(!Array.isArray(pages)||pages.length!==1)throw Error('OCR inattendu');
  const fields=mistralLabelText(pages[0]?.markdown);
  if(!fields)throw Error('OCR non exploitable');
  const {weightGrams,pricePerKgCents,totalCents,ean13}=fields;
  const coherent=weightGrams!==null&&pricePerKgCents!==null&&totalCents!==null
   &&Math.abs(Math.round(weightGrams*pricePerKgCents/1000)-totalCents)<=1;
  const priceEAN=ean13?.startsWith('02')
   ?Math.round(Number(ean13.slice(7,12))*100/655.36):null;
  return reply({...closed,provider:'mistral',source:'mistral-ocr',model,
   pipelineVersion:3,elapsedMs:Date.now()-started,fields,
   checks:{arithmeticConsistent:coherent,eanChecksumValid:ean13!==null,
    barcodePriceConsistent:priceEAN!==null&&totalCents!==null
     ?Math.abs(priceEAN-totalCents)<=1:null},
   verifiedForInventory:false,
   warning:'OCR indicatif : contrôler le code-barres, le prix et la tare avant validation.'},200,origin);
 }catch(_){
  const status=abort.signal.aborted?504:stage==='mistral_fetch'?503:422;
  geminiDiagnostic({stage,reason:abort.signal.aborted?'timeout':
   stage==='mistral_fetch'?'transport_error':'response_parse_error',
   model,httpStatus:status,elapsedMs:Date.now()-started});
  return reply({...closed,provider:'mistral',model,
   error:status===504?'Délai Mistral dépassé.':
    status===503?'Service Mistral injoignable.':'Réponse Mistral non exploitable.'},
    status,origin);
 }finally{clearTimeout(timer);}
}

async function geminiPilot(request,env,origin){
 const closed={type:'inventaires-u-gemini-lab',actorExecuted:false,
  inventoryUpdated:false};
 if(env.GEMINI_LAB_ENABLED!=='true'){
  geminiDiagnostic({stage:'configuration',reason:'pilot_disabled',httpStatus:503});
  return reply({...closed,error:'Pilote Gemini désactivé. Aucun appel lancé.'},503,origin);
 }
 if(!env.COURSESU_TEST_TOKEN||request.headers.get('X-IU-Pilot-Key')!==env.COURSESU_TEST_TOKEN)
  return reply({...closed,error:'Clé privée de pilote requise. Aucun appel lancé.'},401,origin);
 let payload;
 try{
  const length=Number(request.headers.get('content-length')||0);
  if(length>800000)throw Error('Image trop volumineuse');
  const text=await request.text();
  if(text.length>800000)throw Error('Image trop volumineuse');
  payload=JSON.parse(text);
 }catch(_){return reply({...closed,error:'Image ou JSON invalide.'},400,origin)}
 const provider=payload?.provider==='mistral'?'mistral':'gemini',model=payload?.model;
 if((payload?.provider&&!['gemini','mistral'].includes(payload.provider))||
    !(provider==='mistral'?model==='mistral-ocr-4-1':
     ['gemini-3.8-flash','gemini-3.5-flash-lite'].includes(model))||
    payload?.type!=='iu-gemini-label-test'||
    payload?.mimeType!=='image/jpeg'||
    typeof payload?.imageBase64!=='string'||payload.imageBase64.length>700000||
    payload.imageBase64.length<100||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.imageBase64))
  return reply({...closed,error:'Modèle ou image JPEG incorrect.'},400,origin);
 if(provider==='gemini'&&!env.GEMINI_API_KEY){
  geminiDiagnostic({stage:'configuration',reason:'api_key_missing',model,httpStatus:503});
  return reply({...closed,provider,error:'GEMINI_API_KEY non configurée.'},503,origin);
 }
 const photoBytes=payload.imageBase64.length*3/4;
 if(photoBytes>525000)return reply({...closed,error:'Photo trop volumineuse.'},413,origin);
 const permitted=['name','weight','rate','total','ean'];
 const focus=permitted.includes(payload?.focusField)?payload.focusField:null;
 const requested=payload?.focusFields;
 if(requested!==undefined&&(!Array.isArray(requested)||requested.length<1||
    requested.length>5||requested.some(field=>!permitted.includes(field))||
    new Set(requested).size!==requested.length))
  return reply({...closed,error:'Champs de relecture incorrects.'},400,origin);
 const focusFields=Array.isArray(requested)?requested:(focus?[focus]:[]);
 // Un seul appel OCR Mistral par demande, aucune relecture distante forcée.
 if(provider==='mistral')return mistralPilot(payload,env,origin,closed);
 // Vue centrale issue de la même photo, limitée pour ne pas pénaliser Safari.
 const detail=payload?.detailImageBase64;
 if(detail!==undefined&&(typeof detail!=='string'||
    detail.length<100||detail.length>170000||
    !/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(detail)||
    detail.length+payload.imageBase64.length>750000))
  return reply({...closed,error:'Agrandissement JPEG invalide ou trop volumineux.'},400,origin);
 const generalPrompt='Lis UNE étiquette DIGI centrale de fruits et légumes Super U. '
  +'Image 1 = photo entière. Une éventuelle image 2 est un agrandissement '
  +'du CENTRE de la même photo et jamais une deuxième étiquette. '
  +'Ne mélange aucune information de deux étiquettes différentes. '
  +'Lis uniquement les données VISIBLES, sans déduire par calcul ni inventer : '
  +'name = null (le catalogue DIGI local fournit le nom officiel) ; '
  +'weightKg = poids net imprimé (ex. "1,058"), '
  +'pricePerKgEur = prix imprimé €/kg (ex. "1,99"), totalEur = prix à payer '
  +'imprimé (ex. "2,11"), ean13 = les 13 chiffres imprimés sous les barres. '
  +'Si un caractère est ambigu, retourne null pour ce champ. '
  +'Ne soustrais pas la tare, ne génère jamais un EAN depuis le prix. '
  +'Retourne seulement un objet JSON avec les cinq propriétés exactes.';
 const focusNames={name:'nom',weight:'poids net',rate:'prix au kilo',
  total:'prix total',ean:'les 13 chiffres sous le code-barres'};
 const prompt=focusFields.length?generalPrompt+
  ' RELECTURE CIBLÉE : relis uniquement '+focusFields.map(k=>focusNames[k]).join(', ')+
  '. Mets tous les autres champs à null. En cas de doute, retourne null.'
  :generalPrompt;
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),13000);
 const started=Date.now();
 let providerAnswered=false;
 // Stades exclusivement techniques : aucun texte d'exception n'est logué.
 let stage='google_fetch';
 try{
  let extracted;
  const nullableField={type:'STRING',nullable:true};
  const responseSchema={type:'OBJECT',properties:{
   name:nullableField,weightKg:nullableField,pricePerKgEur:nullableField,
   totalEur:nullableField,ean13:nullableField},
   required:['name','weightKg','pricePerKgEur','totalEur','ean13'],
   propertyOrdering:['name','weightKg','pricePerKgEur','totalEur','ean13']};
  const imageParts=[{inline_data:{mime_type:'image/jpeg',data:payload.imageBase64}}];
  if(detail)imageParts.push(
   {text:'Image 2 : agrandissement central de la MEME photo, pour relire les chiffres fins.'},
   {inline_data:{mime_type:'image/jpeg',data:detail}});
  const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'
   +model+':generateContent',{
    method:'POST',signal:abort.signal,
    headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({
     contents:[{role:'user',parts:[{text:prompt},...imageParts]}],
     generationConfig:{temperature:0,maxOutputTokens:1024,
      responseMimeType:'application/json',responseSchema}
    })
   });
  stage='google_http';
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
   geminiDiagnostic({stage,reason:'provider_http_error',model,
    providerStatus:status,httpStatus:outputStatus,elapsedMs:Date.now()-started});
   return reply({...closed,error:diagnostic,providerStatus:status,model},outputStatus,origin);
  }
  providerAnswered=true;
  stage='google_response_read';
  const raw=await res.text();
  stage='google_response_parse';
  if(raw.length>16000)throw Error('Réponse trop volumineuse');
  const data=JSON.parse(raw);
  const candidate=data?.candidates?.[0];
  // Une réponse interrompue par la limite de tokens ne peut pas être
  // interprétée comme une étiquette fiable, même si le JSON est partiel.
  if(candidate?.finishReason==='MAX_TOKENS'){
   geminiDiagnostic({stage,reason:'max_tokens',model,
    httpStatus:422,elapsedMs:Date.now()-started});
   return reply({...closed,error:'Réponse Gemini incomplète (limite de génération). Recadrez l’étiquette et réessayez.',
    model},422,origin);
  }
  const parts=candidate?.content?.parts||[];
  const answer=parts.filter(p=>typeof p?.text==='string').map(p=>p.text).join('');
  if(!answer.trim()){
   geminiDiagnostic({stage,reason:'empty_response',model,
    httpStatus:422,elapsedMs:Date.now()-started});
   return reply({...closed,error:'Réponse Gemini vide. Centrez l’étiquette et réessayez.',
    model},422,origin);
  }
  if(answer.length>5000)throw Error('Réponse trop longue');
  // Certaines réponses textuelles conservent des balises Markdown malgré
  // responseMimeType. Accepter le JSON strict puis, à défaut, le bloc JSON.
  try{extracted=JSON.parse(answer)}
  catch(_){
   const match=answer.trim().match(/^(?:```(?:json)?\s*)?(\{[\s\S]*\})(?:\s*```)?$/i);
   if(!match){
    geminiDiagnostic({stage,reason:'malformed_response',model,
     httpStatus:422,elapsedMs:Date.now()-started});
    return reply({...closed,error:'Réponse Gemini non exploitable. Recadrez l’étiquette et réessayez.',
     model},422,origin);
   }
   try{extracted=JSON.parse(match[1])}
   catch(_){
    geminiDiagnostic({stage,reason:'malformed_response',model,
     httpStatus:422,elapsedMs:Date.now()-started});
    return reply({...closed,error:'Réponse Gemini incomplète. Recadrez l’étiquette et réessayez.',
     model},422,origin);
   }
  }
  if(!extracted||typeof extracted!=='object'||Array.isArray(extracted))throw Error('JSON non reconnu');
  stage='result_validation';
  const weightGrams=geminiLabValue(extracted.weightKg,'weight');
  const pricePerKgCents=geminiLabValue(extracted.pricePerKgEur,'rate');
  const totalCents=geminiLabValue(extracted.totalEur,'total');
  const ean13=typeof extracted.ean13==='string'&&validEAN13(extracted.ean13)
    ?extracted.ean13:null;
  const coherent=weightGrams!==null&&pricePerKgCents!==null&&totalCents!==null
    &&Math.abs(Math.round(weightGrams*pricePerKgCents/1000)-totalCents)<=1;
  const priceFromEAN=ean13?.startsWith('02')
   ?Math.round(Number(ean13.slice(7,12))*100/655.36):null;
  const barcodePriceConsistent=priceFromEAN!==null&&totalCents!==null
   ?Math.abs(priceFromEAN-totalCents)<=1:null;
  return reply({...closed,provider,model,pipelineVersion:2,
   focusField:focus,focusFields,elapsedMs:Date.now()-started,
   fields:{name:geminiLabName(extracted.name),weightGrams,pricePerKgCents,totalCents,ean13},
   checks:{arithmeticConsistent:coherent,eanChecksumValid:ean13!==null,
    barcodePriceConsistent},
   verifiedForInventory:false,warning:'Données indicatives : vérifier visuellement chaque chiffre avant toute utilisation.'},
   200,origin);
 }catch(_){
  const status=abort.signal.aborted?504:providerAnswered?422:503;
  const label='Gemini';
  const message=abort.signal.aborted?'Délai '+label+' dépassé.'
   :providerAnswered?'Réponse '+label+' non exploitable.':'Service '+label+' indisponible.';
  geminiDiagnostic({stage,reason:abort.signal.aborted?'timeout'
   :stage==='google_fetch'?'transport_error'
   :stage==='google_response_read'?'response_read_error'
   :stage==='result_validation'?'result_validation_error':'response_parse_error',
   model,httpStatus:status,elapsedMs:Date.now()-started});
  return reply({...closed,provider,error:message,model},status,origin);
 }finally{clearTimeout(timeout)}
}

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
  if(path!=='/gemini-lab')
   return reply({error:'Route indisponible sur le Worker Gemini'},404,origin);
  if(request.method!=='POST')
   return reply({error:'Méthode non autorisée'},405,origin);
  return geminiPilot(request,env,origin);
 }
};
