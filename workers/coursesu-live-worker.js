/* Inventaires U v42.49 — Worker Gemini, contexte DIGI ciblé et JPEG binaire sans perte.
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
// Binary envelope: 4-byte big-endian metadata length, UTF-8 JSON,
// exact JPEG bytes, optional exact detail JPEG bytes. No decompression,
// resizing or re-encoding. Legacy JSON remains fully supported.
function validBase64(value){
 return typeof value==='string'&&value.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function bytesBase64(bytes){
 let text='';
 for(let i=0;i<bytes.length;i+=16384)
  text+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(text);
}
async function boundedBytes(request,limit){
 if(!request.body?.getReader){
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.length>limit)throw Error('Image trop volumineuse');
  return bytes;
 }
 const reader=request.body.getReader(),chunks=[];let length=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   length+=value.byteLength;if(length>limit){await reader.cancel();throw Error('Image trop volumineuse');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 if(chunks.length===1)return chunks[0];
 const bytes=new Uint8Array(length);let pos=0;
 for(const chunk of chunks){bytes.set(chunk,pos);pos+=chunk.byteLength;}
 return bytes;
}
function parseBinary(bytes){
 if(bytes.length<4||bytes.length>800000)throw Error('Envelope invalide');
 const metaLength=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
 if(metaLength<2||metaLength>16384||4+metaLength>bytes.length)throw Error('Métadonnées invalides');
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(4,4+metaLength)));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Métadonnées invalides');
 const main=data.imageBytes,detail=data.detailBytes??0,start=4+metaLength;
 if(!Number.isSafeInteger(main)||main<75||main>525000||
    !Number.isSafeInteger(detail)||detail<0||detail>127500||
    (detail>0&&detail<75)||main+detail>562500||start+main+detail!==bytes.length)
  throw Error('Taille JPEG invalide');
 const a=bytes.subarray(start,start+main),b=bytes.subarray(start+main);
 const jpeg=x=>x[0]===255&&x[1]===216;
 if(!jpeg(a)||(detail&&!jpeg(b)))throw Error('JPEG invalide');
 return {...data,imageBase64:bytesBase64(a),detailImageBase64:detail?bytesBase64(b):undefined};
}
// A single model, a single serialized image payload, at most three calls.
 // Only explicit upstream 503/UNAVAILABLE is automatically replayed.
 // An in-memory breaker is best-effort per isolate, not a global service.
const geminiCircuit={failures:0,until:0,probing:false};
async function resilientGemini(url,options,{deadline,signal,now=Date.now,
 random=Math.random,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 send=fetch,circuit=geminiCircuit,maxAttempts=3}={}){
 const stats={attempts:0,retries:0,upstream503:0,waitMs:0,stage:'google_http'};
 if(circuit.until>now()||circuit.probing)return {response:null,stats:{...stats,stage:'circuit_open',retryAfterMs:Math.max(1000,circuit.until-now())}};
 const probe=circuit.failures>=3;
 if(probe)circuit.probing=true;
 try{
  for(let i=0;i<maxAttempts;i++){
   if(signal?.aborted||deadline-now()<600)break;
   stats.attempts++;
   let response;
   try{response=await send(url,options);}
   catch(error){
    stats.stage=signal?.aborted?'timeout':'cloudflare_google_network';
    return {response:null,stats,networkError:true};
   }
   if(response.status!==503){
    // A response proves the link is alive; quota or bad input is not
    // overload and must never cause an automatic model retry.
    circuit.failures=0;circuit.until=0;
    return {response,stats};
   }
   stats.upstream503++;circuit.failures++;
   const header=response.headers?.get('Retry-After');
   const seconds=header&&/^\d+(?:\.\d+)?$/.test(header)?Number(header)*1000:
    header?Math.max(0,Date.parse(header)-now()):0;
   const backoff=Math.max(Number.isFinite(seconds)?seconds:0,
    Math.round((i===0?250:600)+random()*180));
   if(i===maxAttempts-1||probe||deadline-now()<1500){
    if(circuit.failures>=3||seconds>0)circuit.until=now()+Math.min(30000,Math.max(3000,Number.isFinite(seconds)?seconds:0));
    return {response,stats};
   }
   // Honor a long Retry-After by returning control, never sleeping
   // beyond the request budget.
   if(backoff>1800||deadline-now()<backoff+1100){
    circuit.until=now()+Math.min(30000,Math.max(1000,backoff));
    return {response,stats:{...stats,retryAfterMs:backoff}};
   }
   try{await response.body?.cancel?.();}catch(_){}
   stats.retries++;stats.waitMs+=backoff;await wait(backoff);
  }
  return {response:null,stats:{...stats,stage:'timeout'}};
 }finally{if(probe)circuit.probing=false;}
}
 const generalPrompt='Lis UNE étiquette DIGI centrale de fruits et légumes Super U. '
  +'Image 1 = photo entière. Une éventuelle image 2 est un agrandissement '
  +'du CENTRE de la même photo et jamais une deuxième étiquette. '
  +'Ne mélange aucune information de deux étiquettes différentes. '
  +'Lis uniquement les données VISIBLES, sans déduire par calcul ni inventer : '
  +'name = nom IMPRIMÉ visible (null si illisible, ne PAS le copier du catalogue) ; '
  +'weightKg = poids net imprimé (ex. "1,058"), '
  +'pricePerKgEur = prix imprimé €/kg (ex. "1,99"), totalEur = prix à payer '
  +'imprimé (ex. "2,11"), ean13 = les 13 chiffres si TOUS visibles et certains. '
  +'eanObserved = 13 positions EXACTES, chiffres réellement visibles et ? pour '
  +'chaque position incertaine, sans ajouter, supprimer ni déplacer un chiffre ; '
  +'null si l alignement des 13 positions ne peut être établi. '
  +'Un EAN incertain doit être représenté par son masque eanObserved plutôt que perdu en entier ; ne suppose pas la clé. '
  +'Si un caractère du poids ou du prix est ambigu, retourne null pour ce champ. '
  +'Le catalogue n est qu une liste de candidats, JAMAIS une preuve : '
  +'ne complète pas les chiffres EAN par le catalogue, par le montant '
  +'ou par le nom ; chaque caractère observé doit venir des pixels. '
  +'Ne soustrais pas la tare, ne génère jamais un EAN depuis le prix. '
  +'Retourne seulement un objet JSON avec les six propriétés exactes.';
 const focusNames={name:'nom',weight:'poids net',rate:'prix au kilo',
  total:'prix total',ean:'les 13 chiffres sous le code-barres'};
  const nullableField={type:'STRING',nullable:true};
  const responseSchema={type:'OBJECT',properties:{
   name:nullableField,weightKg:nullableField,pricePerKgEur:nullableField,
   totalEur:nullableField,ean13:nullableField,eanObserved:nullableField},
   required:['name','weightKg','pricePerKgEur','totalEur','ean13','eanObserved'],
   propertyOrdering:['name','weightKg','pricePerKgEur','totalEur','ean13','eanObserved']};

async function geminiPilot(request,env,origin){
 const ingressStarted=Date.now();
 const closed={type:'inventaires-u-gemini-lab',actorExecuted:false,
  inventoryUpdated:false};
 if(env.GEMINI_LAB_ENABLED!=='true')
  return reply({...closed,error:'Pilote Gemini désactivé. Aucun appel lancé.'},503,origin);
 if(!env.COURSESU_TEST_TOKEN||request.headers.get('X-IU-Pilot-Key')!==env.COURSESU_TEST_TOKEN)
  return reply({...closed,error:'Clé privée de pilote requise. Aucun appel lancé.'},401,origin);
 let payload;
 try{
  const length=Number(request.headers.get('content-length')||0);
  if(length>800000)throw Error('Image trop volumineuse');
  if(request.headers.get('Content-Type')?.split(';')[0].trim()==='application/octet-stream'){
   payload=parseBinary(await boundedBytes(request,800000));
  }else{
   const text=await request.text();
   if(text.length>800000)throw Error('Image trop volumineuse');
   payload=JSON.parse(text);
  }
 }catch(_){return reply({...closed,error:'Image ou JSON invalide.'},400,origin)}
 const ingressMs=Date.now()-ingressStarted;
 const provider='gemini',model=payload?.model;
 if((payload?.provider&&payload.provider!=='gemini')||
    model!=='gemini-3.5-flash-lite'||
    payload?.type!=='iu-gemini-label-test'||
    payload?.mimeType!=='image/jpeg'||
    typeof payload?.imageBase64!=='string'||payload.imageBase64.length>700000||
    payload.imageBase64.length<100||!validBase64(payload.imageBase64))
  return reply({...closed,error:'Modèle ou image JPEG incorrect.'},400,origin);
 if(!env.GEMINI_API_KEY)
  return reply({...closed,provider,error:'GEMINI_API_KEY non configurée.'},503,origin);
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
 const positions=payload?.digiPositions;
 if(positions!==undefined&&(!Array.isArray(positions)||positions.length>13||
    positions.some(n=>!Number.isSafeInteger(n)||n<1||n>13)||new Set(positions).size!==positions.length))
  return reply({...closed,error:'Positions DIGI incorrectes.'},400,origin);
 const digiPositions=focusFields.includes('ean')&&Array.isArray(positions)?positions:[];
 // Le catalogue complet, les prix et l'historique restent sur l'appareil.
 // Au plus cinq entrées officielles neutres, fournies UNIQUEMENT comme
 // indices de lecture et jamais comme une vérité ni une instruction.
 const suggestions=payload?.catalogCandidates;
 if(suggestions!==undefined&&(!Array.isArray(suggestions)||suggestions.length>5||
    suggestions.some(c=>!c||typeof c!=='object'||
      !/^(?:02|2\d)\d{5}$/.test(c.eanPrefix||'')||
      !/^\d{1,8}$/.test(c.plu||'')||
      typeof c.name!=='string'||c.name.length<3||c.name.length>90||
      !/^[\p{L}\d .'\-(),/]+$/u.test(c.name))))
  return reply({...closed,error:'Références DIGI incorrectes.'},400,origin);
 const catalogCandidates=Array.isArray(suggestions)?
  suggestions.map(c=>({eanPrefix:c.eanPrefix,plu:c.plu,name:c.name})):[];
 // Vue centrale issue de la même photo, limitée pour ne pas pénaliser Safari.
 const detail=payload?.detailImageBase64;
 if(detail!==undefined&&(typeof detail!=='string'||
    detail.length<100||detail.length>170000||
    !validBase64(detail)||
    detail.length+payload.imageBase64.length>750000))
  return reply({...closed,error:'Agrandissement JPEG invalide ou trop volumineux.'},400,origin);
 const candidateContext=catalogCandidates.length
  ?' AIDE DIGI : ces références locales sont des OPTIONS, pas le résultat. '
   +'Vérifie sur la photo si un préfixe et un libellé correspondent '
   +'mais ne recopie jamais un nombre non visible. '
   +'Si aucune ne correspond, ignore-les. '
   +JSON.stringify(catalogCandidates)
  :'';
 const prompt=(focusFields.length?generalPrompt+
  ' RELECTURE CIBLÉE : relis uniquement '+focusFields.map(k=>focusNames[k]).join(', ')+
  '. Mets tous les autres champs à null sauf eanObserved si l EAN est ciblé. '
  +'En cas de doute, retourne null.'
  :generalPrompt)+candidateContext+(digiPositions.length?
   ' CONTRÔLE DIGI : relis les 13 positions de gauche à droite. Les positions suivantes demandent une attention particulière : '
   +digiPositions.join(', ')+'. Examine leurs pixels, sans compléter depuis les candidats ni faire de calcul. '
   +'Retourne la lecture complète si elle est visible, sinon un masque de 13 positions avec ?. '
   :'');
 const budgetMs=Number.isSafeInteger(payload?.budgetMs)?Math.max(3000,Math.min(13000,payload.budgetMs)):13000;
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),budgetMs);
 const incomingSignal=request.signal;
 const cancel=()=>abort.abort();
 if(incomingSignal?.aborted)cancel();else incomingSignal?.addEventListener('abort',cancel,{once:true});
 const started=Date.now();
 let providerAnswered=false,networkStats={attempts:0,retries:0,upstream503:0,waitMs:0,stage:'google_http'};
 try{

  let extracted;
  const imageParts=[{inline_data:{mime_type:'image/jpeg',data:payload.imageBase64}}];
  if(detail)imageParts.push(
   {text:'Image 2 : détail de la MEME photo (étiquette entière, code-barres ou zone numérique). Utilise la première image pour situer les champs et le détail pour relire les pixels.'},
   {inline_data:{mime_type:'image/jpeg',data:detail}});
  const upstreamStarted=Date.now();
  const attempt=await resilientGemini('https://generativelanguage.googleapis.com/v1beta/models/'
   +model+':generateContent',{
    method:'POST',signal:abort.signal,
    headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},
    body:JSON.stringify({
     contents:[{role:'user',parts:[{text:prompt},...imageParts]}],
     generationConfig:{temperature:0,maxOutputTokens:1024,
      responseMimeType:'application/json',responseSchema}
    })
   },{deadline:started+budgetMs,signal:abort.signal,maxAttempts:payload.speculative===true?1:3});
  networkStats=attempt.stats;
  const upstreamMs=Date.now()-upstreamStarted;
  const res=attempt.response;
  if(!res){
   const status=abort.signal.aborted||networkStats.stage==='timeout'?504:503;
   return reply({...closed,provider,model,networkStats,error:networkStats.stage==='circuit_open'?
    'Gemini en récupération temporaire.':status===504?'Délai Gemini dépassé.':'Liaison Cloudflare–Gemini indisponible.'},status,origin);
  }
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
    :status===404?404:status===400?400:status===504?504:[500,502,503].includes(status)?503:502;
   return reply({...closed,error:diagnostic,providerStatus:status,model,networkStats},outputStatus,origin);
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
  // Une lecture partielle reste un MASQUE, pas une référence inventée.
  const rawObserved=typeof extracted.eanObserved==='string'?
   extracted.eanObserved.replace(/[ \u00a0\u202f-]/g,''):null;
  const eanObserved=rawObserved&&/^[0-9?]{13}$/.test(rawObserved)&&
   ([...rawObserved.slice(0,7)].filter(d=>d!=='?').length>=4||
    ([...rawObserved].filter(d=>d!=='?').length>=6&&/\d/.test(rawObserved.slice(2,7))))
   ?rawObserved:(typeof extracted.ean13==='string'&&/^\d{13}$/.test(extracted.ean13)?
    extracted.ean13:null);
  const coherent=weightGrams!==null&&pricePerKgCents!==null&&totalCents!==null
    &&Math.abs(Math.round(weightGrams*pricePerKgCents/1000)-totalCents)<=1;
  const priceFromEAN=ean13?.startsWith('02')
   ?Math.round(Number(ean13.slice(7,12))*100/655.36):null;
  const barcodePriceConsistent=priceFromEAN!==null&&totalCents!==null
   ?Math.abs(priceFromEAN-totalCents)<=1:null;
  return reply({...closed,provider,model,pipelineVersion:2,transport:'binary-v1',speculativeReads:true,
   serverTimings:{ingressMs,upstreamMs,processingMs:Math.max(0,Date.now()-upstreamStarted-upstreamMs)},
   focusField:focus,focusFields,elapsedMs:Date.now()-started,networkStats,
   fields:{name:geminiLabName(extracted.name),weightGrams,pricePerKgCents,totalCents,ean13},
   eanObserved,contextCandidates:catalogCandidates.length,
   checks:{arithmeticConsistent:coherent,eanChecksumValid:ean13!==null,
    barcodePriceConsistent},
   verifiedForInventory:false,warning:'Données indicatives : vérifier visuellement chaque chiffre avant toute utilisation.'},
   200,origin);
 }catch(_){
  const status=abort.signal.aborted?504:providerAnswered?422:503;
  const label='Gemini';
  const message=abort.signal.aborted?'Délai '+label+' dépassé.'
   :providerAnswered?'Réponse '+label+' non exploitable.':'Service '+label+' indisponible.';
  return reply({...closed,provider,error:message,model,networkStats},status,origin);
 }finally{clearTimeout(timeout);incomingSignal?.removeEventListener('abort',cancel);}
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
