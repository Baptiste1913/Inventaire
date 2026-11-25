/* Inventaires U v42.49 — Worker Gemini, contexte DIGI ciblé et JPEG binaire sans perte.
 * Route : POST /gemini-lab, authentifiée par COURSESU_TEST_TOKEN.
 * Images et contrôles stricts du moteur Gemini inchangés.
 * Les opérations Courses U / Apify sont désormais un fichier séparé.
 */
function reply(body,status,origin){
 const timingHeader=body.serverTimings?Object.entries(body.serverTimings).filter(([k,v])=>Number.isFinite(v)&&v>=0).map(([k,v])=>k+';dur='+v).join(', '):'';
 return new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin',
  'Timing-Allow-Origin':origin,...(timingHeader?{'Server-Timing':timingHeader}:{})
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
 // Les clés du schéma fixent l'unité : kg et euros. Une différence de
 // représentation ne doit pas supprimer une mesure. Aucun arrondi ni OCR inventé.
 if(typeof raw!=='string'&&typeof raw!=='number')return null;
 if(typeof raw==='number'&&!Number.isFinite(raw))return null;
 const text=String(raw).trim();
 if(text.length>40)return null;
 const space='[ \\u00a0\\u202f]*';
 const rate=kind==='rate'||kind==='money';
 if(kind!=='weight'&&!rate&&kind!=='total')return null;
 if(kind==='weight'){
  const gram=text.match(new RegExp('^(\\d{1,5})'+space+'g$','i'));
  if(gram){const n=Number(gram[1]);return n>=1&&n<=30000?n:null;}
 }
 // Pas de séparateurs de milliers, d'exposant, de signe ou de chiffres
 // séparés par des espaces. Un entier nu en chaîne reste ambigu (kg/g).
 const suffix=kind==='weight'?'kg':rate?'(?:€(?:'+space+'/(?:'+space+')(?:kg|kilo)|kg)?|EUR(?:'+space+'/'+space+'kg)?)':'(?:€|EUR)';
 const m=text.match(new RegExp('^(\\d{1,'+(kind==='weight'?2:3)+'})(?:[.,](\\d{1,'+(kind==='weight'?3:2)+'}))?('+space+suffix+')?$','i'));
 if(!m||(!m[2]&&!m[3]&&typeof raw==='string'))return null;
 const digits=kind==='weight'?3:2,scale=10**digits;
 const value=Number(m[1])*scale+Number((m[2]||'').padEnd(digits,'0'));
 return Number.isSafeInteger(value)&&value>=1&&value<=(kind==='weight'?30000:99999)?value:null;
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
 if(typeof bytes.toBase64==='function')return bytes.toBase64();
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

const requestedTier=()=>'standard';
const compactKeys={name:'n',weightKg:'w',pricePerKgEur:'p',totalEur:'t',ean13:'e',eanObserved:'o'};
const compactSchema={...responseSchema,properties:Object.fromEntries(Object.entries(compactKeys).map(([k,v])=>[v,responseSchema.properties[k]])),required:Object.values(compactKeys),propertyOrdering:Object.values(compactKeys)};
function expandReading(value,compact){
 if(!compact)return value;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(compactKeys).some(k=>!Object.prototype.hasOwnProperty.call(value,compactKeys[k])))throw Error('JSON compact incomplet');
 return Object.fromEntries(Object.entries(compactKeys).map(([k,v])=>[k,value[v]]));
}
// No delimiter repair or positional guessing; uncertain values use ?.
function parseDelimited(answer){
 const line=String(answer).trim();
 if(/[\r\n]/.test(line))throw Error('Réponse texte multiligne');
 const parts=line.split(';').map(x=>x.trim());
 if(parts.length!==6||parts.some(x=>!x))throw Error('Six champs requis');
 const [name,weightKg,pricePerKgEur,totalEur,ean13,eanObserved]=parts.map(x=>x==='?'?null:x);
 if(name!==null&&!geminiLabName(name)||weightKg!==null&&geminiLabValue(weightKg,'weight')===null||
 pricePerKgEur!==null&&geminiLabValue(pricePerKgEur,'rate')===null||
 totalEur!==null&&geminiLabValue(totalEur,'total')===null||
 ean13!==null&&!validEAN13(ean13)||eanObserved!==null&&!/^[0-9?]{13}$/.test(eanObserved)||
 ean13!==null&&eanObserved!==null&&[...eanObserved].some((v,i)=>v!=='?'&&v!==ean13[i]))throw Error('Champ texte invalide');
 return {name,weightKg,pricePerKgEur,totalEur,ean13,eanObserved};
}
function configuredCache(env,mode,format){
 const name=env.GEMINI_DIGI_CACHE||'';
 return mode==='developer'&&format==='json'&&/^cachedContents\/[A-Za-z0-9_-]{1,180}$/.test(name)?name:null;
}
function speculativeEnabled(env){
 return env.GEMINI_SPECULATIVE_EAN==='true'&&env.GEMINI_ROUTE!=='hedge';
}
// All experiments are opt-in. No changes to JPEG bytes or identity checks.
function visualPlan(env,difficulty,focusFields,detail){
 const mode=env.GEMINI_MEDIA_RESOLUTION;
 if(!['medium','high','adaptive'].includes(mode))return null;
 const focused=focusFields.length>0;
 const easy=Number.isSafeInteger(difficulty)&&difficulty<=54;
 const main=mode==='adaptive'?(easy&&detail&&!focused?'medium':'high'):mode;
 const secondary=detail?(focused&&env.GEMINI_DETAIL_RESOLUTION==='ultra_high'?'ultra_high':'high'):null;
 return {main,detail:secondary};
}
function outputLimit(env,format,thinkingLevel){
 return env.GEMINI_TOKEN_LIMIT==='adaptive'&&thinkingLevel==='MINIMAL'?({json:256,compact:192,delimited:128}[format]||1024):1024;
}
function temperatureOption(env){
 return env.GEMINI_TEMPERATURE==='default'?null:env.GEMINI_TEMPERATURE==='0.5'?.5:0;
}
function interactionBody(model,body,plan){
 const cfg=body.generationConfig, schema=cfg.responseSchema;
 let imageIndex=0;
 const input=body.contents[0].parts.map(p=>{
  if(typeof p.text==='string')return {type:'text',text:p.text};
  const resolution=imageIndex++===0?plan?.main:plan?.detail;
  return {type:'image',data:p.inline_data.data,mime_type:p.inline_data.mime_type,...(resolution?{resolution}:{})};
 });
 const response_format=schema?{type:'text',mime_type:'application/json',schema:{type:'object',
  properties:Object.fromEntries(Object.keys(schema.properties).map(k=>[k,{type:['string','null']}])),required:schema.required}}:{type:'text',mime_type:'text/plain'};
 // Interactions uses its own wire schema; omit legacy sampling options.
 return {model,input,store:false,stream:false,response_format,generation_config:{thinking_level:cfg.thinkingConfig.thinkingLevel.toLowerCase(),max_output_tokens:cfg.maxOutputTokens}};
}
function normalizeInteraction(data){
 if(data?.status!=='completed'||!Array.isArray(data.steps))throw Error('Interaction non terminée');
 const steps=data.steps.filter(s=>s.type==='model_output');
 if(steps.length!==1||!Array.isArray(steps[0].content)||steps[0].content.some(p=>p.type!=='text'||typeof p.text!=='string'))throw Error('Sortie Interaction non exploitable');
 const text=steps[0].content.map(p=>p.text).join('');
 if(!text.trim()||text.length>5000)throw Error('Sortie Interaction vide ou trop longue');
 const u=data.usage||{};
 return {candidates:[{finishReason:'STOP',content:{parts:[{text}]}}],usageMetadata:{promptTokenCount:u.total_input_tokens,candidatesTokenCount:u.total_output_tokens,thoughtsTokenCount:u.total_thought_tokens,cachedContentTokenCount:u.total_cached_tokens,totalTokenCount:u.total_tokens}};
}
function mediaBody(body,plan){
 let i=0;
 return {...body,contents:body.contents.map(c=>({...c,parts:c.parts.map(p=>{
  if(!p.inline_data)return p;
  const level=i++===0?plan.main:plan.detail;
  return {...p,mediaResolution:{level:'MEDIA_RESOLUTION_'+level.toUpperCase()}};
 })}))};
}
// Only metadata; never retain label values or provider error text.
function fieldDiagnostics(raw,parsed,focusFields){
 const map={name:'name',weightKg:'weight',pricePerKgEur:'rate',totalEur:'total',ean13:'ean',eanObserved:'ean'};
 return Object.fromEntries(Object.entries(map).map(([key,kind])=>{
  const present=Object.prototype.hasOwnProperty.call(raw,key),v=raw[key];
  const type=!present?'absent':v===null?'null':Array.isArray(v)?'array':typeof v;
  const expected=!focusFields.length||focusFields.includes(kind);
  const state=!expected?'not_requested':!present?'missing':v===null?'unreadable':(type!=='string'&&!(type==='number'&&['weight','rate','total'].includes(kind)))?'wrong_type':parsed[key]==null?'invalid_format':'accepted';
  return [key,{type,state}];
 }));
}
function hybridEnabled(env,model){
 return env.GEMINI_BASELINE_4295!=='true'&&env.GEMINI_HYBRID_RECOVERY!=='false'&&env.GEMINI_API_MODE==='interactions'&&routingMode(env,model)==='developer'&&!env.GEMINI_DIGI_CACHE;
}
function usageOf(data){
 const usage=data?.usageMetadata||{},out={};
 for(const k of ['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','cachedContentTokenCount','totalTokenCount'])if(Number.isSafeInteger(usage[k])&&usage[k]>=0)out[k]=usage[k];
 return out;
}
function vertexEndpoint(env,model){
 if(!env.VERTEX_API_KEY)return null;
 // Express key by default; a project-scoped key can use the explicit global endpoint.
 const project=env.VERTEX_PROJECT_ID;
 if(project&&!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$|^\d{6,20}$/.test(project))return null;
 return 'https://aiplatform.googleapis.com/v1/'+(project?'projects/'+project+'/locations/global/':'')+'publishers/google/models/'+model;
}
function routingMode(env,model){
 return vertexEndpoint(env,model)&&['vertex','hedge'].includes(env.GEMINI_ROUTE)?env.GEMINI_ROUTE:'developer';
}
const vertexCircuit={failures:0,until:0,probing:false};
let hedgeCooldown=0;
async function readStream(res,signal){
 const reader=res.body?.getReader();if(!reader)throw Error('Flux absent');
 const decoder=new TextDecoder();let buffer='',answer='',finishReason=null,usageMetadata={},count=0,firstTokenMs=null;
 const start=Date.now();
 function event(line){
  if(!line.startsWith('data:'))return;
  const text=line.slice(5).trim();if(!text||text==='[DONE]')return;
  const data=JSON.parse(text);if(data.error)throw Error('Erreur de flux');
  const candidate=data.candidates?.[0];
  for(const part of candidate?.content?.parts||[])if(!part.thought&&typeof part.text==='string'){
   if(part.text&&firstTokenMs===null)firstTokenMs=Date.now()-start;
   answer+=part.text;if(answer.length>5000)throw Error('Flux trop volumineux');
  }
  if(candidate?.finishReason)finishReason=candidate.finishReason;
  if(data.usageMetadata)usageMetadata={...usageMetadata,...data.usageMetadata};
 }
 try{
  for(;;){
   if(signal.aborted)throw Error('Flux annulé');
   const {value,done}=await reader.read();if(done)break;
   count+=value.byteLength;if(count>131072)throw Error('Flux trop volumineux');
   buffer+=decoder.decode(value,{stream:true});let i;
   while((i=buffer.indexOf('\n'))>=0){event(buffer.slice(0,i).trimEnd());buffer=buffer.slice(i+1);}
  }
  buffer+=decoder.decode();if(buffer.trim())event(buffer.trimEnd());
  if(finishReason!=='STOP'&&finishReason!=='MAX_TOKENS')throw Error('Flux incomplet');
  return {data:{candidates:[{finishReason,content:{parts:[{text:answer}]}}],usageMetadata},firstTokenMs};
 }finally{try{await reader.cancel();}catch(_){}reader.releaseLock();}
}
// A hedge may win only with a complete internally consistent reading.
// The client still applies every existing identity and optical validation.
function completeHedge(data,compact,delimited=false){
 try{
  const c=data?.candidates?.[0];if(c?.finishReason!=='STOP')return false;
  const raw=(c.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
  const r=delimited?parseDelimited(raw):expandReading(JSON.parse(raw),compact);
  if(!geminiLabName(r.name)||!validEAN13(r.ean13))return false;
  const w=geminiLabValue(r.weightKg,'weight'),p=geminiLabValue(r.pricePerKgEur,'rate'),t=geminiLabValue(r.totalEur,'total');
  return w!==null&&p!==null&&t!==null&&Math.abs(Math.round(w*p/1000)-t)<=1;
 }catch(_){return false;}
}
async function decodeEnvelope(request){
 const bytes=await boundedBytes(request,800000);
 if(bytes[0]!==31||bytes[1]!==139)return parseBinary(bytes);
 if(typeof DecompressionStream!=='function')throw Error('Compression indisponible');
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
 return parseBinary(await boundedBytes({body:stream},800000));
}
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
   payload=await decodeEnvelope(request);
  }else{
   const text=await request.text();
   if(text.length>800000)throw Error('Image trop volumineuse');
   payload=JSON.parse(text);
  }
 }catch(_){return reply({...closed,error:'Image ou JSON invalide.'},400,origin)}
 const ingressMs=Date.now()-ingressStarted,validationStarted=Date.now();
 if(payload?.type==='iu-gemini-network-warmup'){
  if(!env.GEMINI_API_KEY&&!vertexEndpoint(env,'gemini-3.5-flash-lite'))return reply({...closed,error:'Gemini non configuré.'},503,origin);
  return reply({type:'iu-gemini-network-warmup',transport:'binary-v1',gzipEnvelope:typeof DecompressionStream==='function',requestedTier:requestedTier(env),route:routingMode(env,'gemini-3.5-flash-lite'),speculativeEAN:speculativeEnabled(env)},200,origin);
 }
 const provider='gemini',model=payload?.model;
 if((payload?.provider&&payload.provider!=='gemini')||
    model!=='gemini-3.5-flash-lite'||
    payload?.type!=='iu-gemini-label-test'||
    payload?.mimeType!=='image/jpeg'||
    typeof payload?.imageBase64!=='string'||payload.imageBase64.length>700000||
    payload.imageBase64.length<100||!validBase64(payload.imageBase64))
  return reply({...closed,error:'Modèle ou image JPEG incorrect.'},400,origin);
 if(!env.GEMINI_API_KEY&&!(routingMode(env,model)==='vertex'&&vertexEndpoint(env,model)))
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
 const difficulty=Number.isSafeInteger(payload.difficulty)&&payload.difficulty>=0&&payload.difficulty<=100?payload.difficulty:null;
 const speculative=payload.speculative===true;
 if(speculative&&(!speculativeEnabled(env)||focusFields.length!==1||focusFields[0]!=='ean'))return reply({...closed,error:'Relecture anticipée désactivée.'},400,origin);
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
 let providerAnswered=false,networkStats={attempts:0,retries:0,upstream503:0,waitMs:0,stage:'google_http'},diagnosticMeta={},failureStage='upstream';
 try{

  let extracted;
  const imageParts=[{inline_data:{mime_type:'image/jpeg',data:payload.imageBase64}}];
  if(detail)imageParts.push(
   {text:'Image 2 : détail de la MEME photo (étiquette entière, code-barres ou zone numérique). Utilise la première image pour situer les champs et le détail pour relire les pixels.'},
   {inline_data:{mime_type:'image/jpeg',data:detail}});
  const baseline=env.GEMINI_BASELINE_4295==='true'&&routingMode(env,model)==='developer';
  const hybridRecovery=hybridEnabled(env,model);
  const reinforced=hybridRecovery&&!speculative&&(payload.recovery===true||focusFields.length>0);
  const recoveryProfile=baseline?'baseline':reinforced?'reinforced':'normal';
  const delimited=!baseline&&!reinforced&&env.GEMINI_OUTPUT_FORMAT==='delimited';
  const compact=!baseline&&!reinforced&&!delimited&&env.GEMINI_COMPACT_JSON==='true';
  const format=delimited?'delimited':compact?'compact':'json';
  const streaming=!baseline&&!reinforced&&env.GEMINI_STREAM==='true';
  const adaptive=env.GEMINI_ADAPTIVE_THINKING==='true';
  const thinkingLevel=baseline?null:reinforced?(payload.strongRecovery===true||env.GEMINI_RECOVERY_THINKING==='low'||(difficulty!==null&&difficulty>=75)?'LOW':'MINIMAL'):!speculative&&((focusFields.length&&env.GEMINI_RECOVERY_THINKING==='low')||(adaptive&&difficulty!==null&&difficulty>=75))?'LOW':'MINIMAL';
  // Preserve the literal production prompt; compact is an explicit experiment.
  const mode=routingMode(env,model);
  const cache=baseline?null:configuredCache(env,mode,format);
  const effectivePrompt=baseline?prompt:delimited?prompt.replace('Retourne seulement un objet JSON avec les six propriétés exactes.','Retourne UNE ligne sans titre ni guillemets, exactement six champs séparés par ; dans cet ordre : name;weightKg;pricePerKgEur;totalEur;ean13;eanObserved. Remplace chaque champ inconnu ou non ciblé par ? et conserve sa position. Aucun autre texte.'):compact?prompt+' Utilise les clés JSON courtes suivantes à la place des clés longues : '+JSON.stringify(compactKeys)+'.':prompt;
  const temperature=baseline||reinforced?0:temperatureOption(env),maxOutputTokens=baseline||reinforced?1024:outputLimit(env,format,thinkingLevel);
  const generationConfig={...(temperature===null?{}:{temperature}),maxOutputTokens,responseMimeType:delimited?'text/plain':'application/json',...(delimited?{}:{responseSchema:compact?compactSchema:responseSchema}),...(baseline?{}:{thinkingConfig:{thinkingLevel}})};
  const isolatedPrompt=baseline?effectivePrompt:effectivePrompt+' Ignore les étiquettes voisines et les fragments hors du contour de l étiquette centrale. Si la zone détaillée ne peut pas être rattachée sans ambiguïté à cette même étiquette, ne l utilise pas. Ne mélange jamais leurs champs.';
  const body={contents:[{role:'user',parts:[{text:isolatedPrompt},...imageParts]}],generationConfig};
  // Explicit cache is opt-in; the immutable original prompt stays available for fallback.
  const cachedBody=cache?{...body,cachedContent:cache,contents:[{role:'user',parts:[{text:'Applique les instructions DIGI en cache à cette nouvelle photo uniquement. '+prompt.slice(generalPrompt.length)},...imageParts]}]}:null;
  const developer='https://generativelanguage.googleapis.com/v1beta/models/'+model;
  const vertex=vertexEndpoint(env,model);
  const method=streaming?':streamGenerateContent?alt=sse':':generateContent';
  // Keep experiments independent from optional legacy Vertex/cache/racing paths.
  const plan=baseline?null:reinforced?{main:'high',detail:detail?(env.GEMINI_DETAIL_RESOLUTION==='ultra_high'?'ultra_high':'high'):null}:mode==='developer'&&!cache?visualPlan(env,difficulty,focusFields,Boolean(detail)):null;
  const useInteractions=!baseline&&!reinforced&&mode==='developer'&&!cache&&env.GEMINI_API_MODE==='interactions';
  const experimentAPI=useInteractions?'interactions':plan?'generateContent-alpha':'generateContent';
  const serialized=JSON.stringify(body);
  const preparationMs=Date.now()-validationStarted,upstreamStarted=Date.now();
  const controllers=[];
  const stopAll=()=>controllers.forEach(c=>c.abort());
  abort.signal.addEventListener('abort',stopAll,{once:true});
  async function call(route,maxAttempts){
   const control=new AbortController();controllers.push(control);
   if(abort.signal.aborted)control.abort();
   const standardURL=(route==='vertex'?vertex:developer)+method;
   const key=route==='vertex'?env.VERTEX_API_KEY:env.GEMINI_API_KEY;
   const began=Date.now();
   let api=route==='developer'?experimentAPI:'generateContent',media=route==='developer'?plan:null;
   let apiFallback=false;
   let url=api==='interactions'?'https://generativelanguage.googleapis.com/v1beta/interactions':api==='generateContent-alpha'?standardURL.replace('/v1beta/','/v1alpha/'):standardURL;
   let sentBody=api==='interactions'?JSON.stringify(interactionBody(model,body,media)):media?JSON.stringify(mediaBody(body,media)):cachedBody?JSON.stringify(cachedBody):serialized;
   const opts={method:'POST',signal:control.signal,headers:{'Content-Type':'application/json','x-goog-api-key':key,...(api==='interactions'?{'Api-Revision':'2026-05-20'}:{})},body:sentBody};
   const limits={deadline:started+budgetMs,signal:control.signal,circuit:route==='vertex'?vertexCircuit:geminiCircuit,maxAttempts};
   let attempt=await resilientGemini(url,opts,limits),cacheFallback=false;
   // Experimental endpoints/options may not be enabled for this project.
   // Revert only on explicit 400/404 option/endpoint rejection, once, within the original budget.
   if(api!=='generateContent'&&[400,404].includes(attempt.response?.status)&&attempt.stats.attempts===1&&Date.now()<started+budgetMs-1500&&!control.signal.aborted){
    const reason=await attempt.response.text().catch(()=>'');
    if(/media.?resolution|resolution|interaction|response.?format|generation.?config|unknown field|not found|not supported|invalid argument/i.test(reason)){
     const previous=attempt.stats;apiFallback=true;api='generateContent';media=null;
     const {['Api-Revision']:revision,...headers}=opts.headers;
     attempt=await resilientGemini(standardURL,{...opts,headers,body:serialized},{...limits,maxAttempts:1});
     attempt.stats={...attempt.stats,attempts:previous.attempts+attempt.stats.attempts,upstream503:previous.upstream503+attempt.stats.upstream503,waitMs:previous.waitMs+attempt.stats.waitMs};
    }
   }
   // Reissue only on explicit cache rejection, not a successful or ambiguous request.
   if(cachedBody&&[400,404].includes(attempt.response?.status)&&attempt.stats.attempts===1&&Date.now()<started+budgetMs-1500){
    const reason=await attempt.response.text().catch(()=>'');
    if(/cached.?content|cache/i.test(reason)&&/not found|expired|invalid|not supported|permission/i.test(reason)){
     const initial=attempt.stats;cacheFallback=true;
     attempt=await resilientGemini(url,{...opts,body:serialized},{...limits,maxAttempts:1});
     attempt.stats={...attempt.stats,attempts:initial.attempts+attempt.stats.attempts};
    }
   }
   const res=attempt.response,headersMs=Date.now()-began;let data=null,firstTokenMs=null,bodyError=false;
   if(res?.ok){
    try{
     if(streaming&&api!=='interactions'){const stream=await readStream(res,control.signal);data=stream.data;firstTokenMs=stream.firstTokenMs===null?null:headersMs+stream.firstTokenMs;}
     else{const raw=await res.text();if(raw.length>(api==='interactions'?65536:16000))throw Error('Réponse trop volumineuse');data=JSON.parse(raw);if(api==='interactions')data=normalizeInteraction(data);}
    }catch(_){bodyError=true;}
   }
   return {route,attempt,res,data,headersMs,firstTokenMs,bodyError,cacheFallback,api,apiFallback,media,totalMs:Date.now()-began,control};
  }
  let selected,hedgeStarted=false,hedgeWinner=false;
  try{
   const canHedge=mode==='hedge'&&!speculative&&!focusFields.length&&Date.now()>=hedgeCooldown&&budgetMs>=5000;
   if(!canHedge)selected=await call(mode==='vertex'?'vertex':'developer',speculative?1:3);
   else{
    // Only one extra inference, same serialized request, no stale photo.
    // Delay is configurable for a controlled comparison, not a default race.
    const delay=Math.max(1200,Math.min(5000,Number(env.GEMINI_HEDGE_DELAY_MS)||2200));
    let timer;
    const primary=call('developer',1);
    const first=await Promise.race([primary.then(value=>({value})),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),delay);})]);
    clearTimeout(timer);
    if(first)selected=first.value;
    else if(abort.signal.aborted)selected=await primary;
    else{
     hedgeStarted=true;
     const secondary=call('vertex',1);
     const raced=await Promise.race([primary,secondary]);
     if(raced.route==='vertex'&&raced.res?.ok&&completeHedge(raced.data,compact,delimited)){
      selected=raced;hedgeWinner=true;
     }else if(raced.route==='developer'&&raced.res?.ok&&!raced.bodyError){
      selected=raced;
     }else{
      const main=await primary;
      selected=main;
      // If the principal failed, accept only a complete secondary response.
      if(!main.res?.ok||main.bodyError){
       const backup=await secondary;
       if(backup.res?.ok&&completeHedge(backup.data,compact,delimited)){selected=backup;hedgeWinner=true;}
      }
     }
     if(!selected.res?.ok||selected.attempt.stats.upstream503)hedgeCooldown=Date.now()+30000;
    }
   }
  }finally{
   // Response bodies have already been collected; abort only outstanding work.
   stopAll();abort.signal.removeEventListener('abort',stopAll);
  }
  const res=selected.res,attempt=selected.attempt;
  networkStats=attempt.stats;
  const upstreamMs=selected.headersMs,responseMs=Math.max(0,selected.totalMs-upstreamMs),routingWallMs=Date.now()-upstreamStarted;
  const processingStarted=Date.now();
  const googleMeta={requestedTier:'standard',sentTier:'standard',serviceTier:res?.headers?.get('x-gemini-service-tier')==='standard'?'standard':'unknown',
   inferenceRoute:selected.route,routingMode:mode,hedgeStarted,hedgeWinner,thinkingLevel:thinkingLevel||'DEFAULT',compact,streaming:streaming&&selected.api!=='interactions',api:selected.api,apiFallback:selected.apiFallback,mediaRequested:plan,media: selected.media,maxOutputTokens,temperature:selected.api==='interactions'?'default':temperature===null?'default':temperature,
   firstTokenMs:selected.firstTokenMs,usage:usageOf(selected.data),format,difficulty,speculative,cacheRequested:Boolean(cache),cacheFallback:selected.cacheFallback===true,speculativeEAN:speculativeEnabled(env),hybridRecovery,recoveryProfile,numericNormalization:'exact-v1'};
  diagnosticMeta={...googleMeta,elapsedMs:Date.now()-started,serverTimings:{ingressMs,preparationMs,upstreamMs,responseMs,routingWallMs}};
  if(!res){
   const status=abort.signal.aborted||networkStats.stage==='timeout'?504:503;
   return reply({...closed,...diagnosticMeta,provider,model,networkStats,failureStage:networkStats.stage||'upstream',error:networkStats.stage==='circuit_open'?
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
   return reply({...closed,...diagnosticMeta,error:diagnostic,providerStatus:status,model,networkStats,failureStage:'provider_http'},outputStatus,origin);
  }
  providerAnswered=true;failureStage='provider_body';
  if(selected.bodyError||!selected.data)throw Error('Réponse incomplète');
  const data=selected.data;
  const candidate=data?.candidates?.[0];
  // Une réponse interrompue par la limite de tokens ne peut pas être
  // interprétée comme une étiquette fiable, même si le JSON est partiel.
  if(candidate?.finishReason==='MAX_TOKENS')
   return reply({...closed,error:'Réponse Gemini incomplète (limite de génération). Recadrez l’étiquette et réessayez.',
    ...diagnosticMeta,failureStage:'max_tokens',model},422,origin);
  if(candidate?.finishReason&&candidate.finishReason!=='STOP')return reply({...closed,...diagnosticMeta,model,failureStage:'finish_reason',error:'Réponse Gemini incomplète.'},422,origin);
  const parts=candidate?.content?.parts||[];
  const answer=parts.filter(p=>!p?.thought&&typeof p?.text==='string').map(p=>p.text).join('');
  if(!answer.trim())
   return reply({...closed,error:'Réponse Gemini vide. Centrez l’étiquette et réessayez.',
    ...diagnosticMeta,failureStage:'empty_output',model},422,origin);
  if(answer.length>5000)throw Error('Réponse trop longue');
  // Certaines réponses textuelles conservent des balises Markdown malgré
  // responseMimeType. Accepter le JSON strict puis, à défaut, le bloc JSON.
  failureStage='output_parse';
  if(delimited)extracted=parseDelimited(answer);
  else try{extracted=JSON.parse(answer)}
  catch(_){
   const match=answer.trim().match(/^(?:```(?:json)?\s*)?(\{[\s\S]*\})(?:\s*```)?$/i);
   if(!match)
    return reply({...closed,error:'Réponse Gemini non exploitable. Recadrez l’étiquette et réessayez.',
     ...diagnosticMeta,failureStage:'output_parse',model},422,origin);
   try{extracted=JSON.parse(match[1])}
   catch(_){
    return reply({...closed,error:'Réponse Gemini incomplète. Recadrez l’étiquette et réessayez.',
     ...diagnosticMeta,failureStage:'output_parse',model},422,origin);
   }
  }
  extracted=expandReading(extracted,compact);
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
  return reply({...closed,provider,model,pipelineVersion:2,transport:'binary-v1',gzipEnvelope:typeof DecompressionStream==='function',
   focusField:focus,focusFields,elapsedMs:Date.now()-started,networkStats,...googleMeta,
   serverTimings:{ingressMs,preparationMs,upstreamMs,responseMs,routingWallMs,processingMs:Date.now()-processingStarted},
   fields:{name:geminiLabName(extracted.name),weightGrams,pricePerKgCents,totalCents,ean13},
   eanObserved,contextCandidates:catalogCandidates.length,
   fieldDiagnostics:fieldDiagnostics(extracted,{name:geminiLabName(extracted.name),weightKg:weightGrams,pricePerKgEur:pricePerKgCents,totalEur:totalCents,ean13,eanObserved},focusFields),
   checks:{arithmeticConsistent:coherent,eanChecksumValid:ean13!==null,
    barcodePriceConsistent},
   verifiedForInventory:false,warning:'Données indicatives : vérifier visuellement chaque chiffre avant toute utilisation.'},
   200,origin);
 }catch(_){
  const status=abort.signal.aborted?504:providerAnswered?422:503;
  const label='Gemini';
  const message=abort.signal.aborted?'Délai '+label+' dépassé.'
   :providerAnswered?'Réponse '+label+' non exploitable.':'Service '+label+' indisponible.';
  return reply({...closed,...diagnosticMeta,provider,error:message,model,networkStats,failureStage:abort.signal.aborted?'timeout':failureStage},status,origin);
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
