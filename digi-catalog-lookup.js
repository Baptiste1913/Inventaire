/* Inventaires U v42.48 — déduction DIGI exhaustive, bornée et traçable.
 * Un EAN calculé n'est pas une lecture : code exact unique ou confirmation.
 * Aucune association apprise, tarif historique ou poids/prix deviné.
 * L'index se rafraîchit dès qu'un import local remplace le catalogue.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUDigiCatalogLookup=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const STORAGE_KEY='iu-plu-catalogue-local-v1';
 let cachedRaw=null,cachedIndex=null;
 const queryCache=new Map();
 function eanValid(code){
  if(typeof code!=='string'||!/^\d{13}$/.test(code))return false;
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2===0?1:3);
  return (10-sum%10)%10===Number(code[12]);
 }
 function catalogPrefix(raw){
  const code=String(raw??'').trim();
  const prefix=/^\d{7}$/.test(code)?code:
   /^\d{13}$/.test(code)&&code.endsWith('000000')?code.slice(0,7):'';
  return /^(?:02|2\d)\d{5}$/.test(prefix)?prefix:'';
 }
 function index(){
  let raw='';
  try{raw=localStorage.getItem(STORAGE_KEY)||''}
  catch(_){return {available:false,reason:'Stockage du catalogue DIGI inaccessible'};}
  if(raw===cachedRaw&&cachedIndex)return cachedIndex;
  cachedRaw=raw;queryCache.clear();
  const empty={available:false,reason:'Importe le catalogue DIGI sur cet iPhone',
   byPrefix:new Map(),count:0};
  if(!raw){cachedIndex=empty;return cachedIndex}
  let data;
  try{data=JSON.parse(raw)}catch(_){
   cachedIndex={...empty,reason:'Catalogue DIGI illisible : réimporte le fichier'};
   return cachedIndex;
  }
  if(!data||!Array.isArray(data.articles)||!data.articles.length||
     data.articles.length>10000){
   cachedIndex={...empty,reason:'Catalogue DIGI invalide : réimporte le fichier'};
   return cachedIndex;
  }
  const groups=new Map(),byName=new Map();
  let count=0;
  for(const row of data.articles){
   if(!row||typeof row!=='object')continue;
   const plu=String(row.plu??row.PLU??'').trim();
   const name=String(row.libelle??row['Libellé']??'').trim();
   const prefix=catalogPrefix(row.eanPrefix??row.ean_prefix??
    row['Préfixe EAN']??row.Gencod??row.gencod);
   if(!/^[0-9]{1,8}$/.test(plu)||!name||name.length>145||!prefix)continue;
   if(!groups.has(prefix))groups.set(prefix,new Map());
   const item={plu,name,eanPrefix:prefix,normalizedName:normalizeName(name)};
   // Un même PLU avec deux noms divergents est aussi ambigu.
   groups.get(prefix).set(plu+'|'+name,item);
   const normalized=item.normalizedName;
   if(normalized){
    if(!byName.has(normalized))byName.set(normalized,new Map());
    byName.get(normalized).set(prefix+'|'+plu+'|'+name,item);
   }
   count++;
  }
  cachedIndex={available:true,byPrefix:groups,byName,count,
   reason:count?'':'Catalogue importé sans préfixe EAN DIGI utilisable'};
  return cachedIndex;
 }
 function resolve(code){
  if(!eanValid(code))return {ok:false,status:'invalid',
   reason:'EAN-13 complet et clé de contrôle requis'};
  const catalog=index();
  if(!catalog.available)return {ok:false,status:'missing',reason:catalog.reason};
  if(!catalog.count)return {ok:false,status:'empty',reason:catalog.reason};
  const prefix=code.slice(0,7),items=catalog.byPrefix.get(prefix);
  if(!items?.size)return {ok:false,status:'unknown',eanPrefix:prefix,
   reason:'Préfixe '+prefix+' absent du catalogue DIGI importé'};
  if(items.size!==1)return {ok:false,status:'ambiguous',eanPrefix:prefix,
   reason:'Préfixe '+prefix+' associé à plusieurs articles DIGI'};
  const item=items.values().next().value;
  return {ok:true,status:'matched',plu:item.plu,name:item.name,
   eanPrefix:prefix,source:'digi-import'};
 }

 // Suggestions INDEXÉES, jamais utilisées comme identité officielle sans
 // preuve : les associations historiques ou prix enregistrés sont exclus.
 function normalizeName(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim().slice(0,85);
 }
 function nameSimilarity(a,b){
  return normalizedSimilarity(normalizeName(a),normalizeName(b));
 }
 function normalizedSimilarity(x,y){
  if(x.length<4||y.length<4)return 0;
  if(x===y)return 1;
  // Distance d'édition bornée, sans bibliothèque ni appel réseau.
  const row=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){
   let prev=row[0];row[0]=i;
   for(let j=1;j<=y.length;j++){
    const old=row[j];
    row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(x[i-1]===y[j-1]?0:1));
    prev=old;
   }
  }
  return Math.max(0,1-row[y.length]/Math.max(x.length,y.length));
 }
 function observedPattern(raw){
  if(typeof raw!=='string')return '';
  const value=raw.replace(/[\s\u00a0\u202f-]/g,'').replace(/[Xx_]/g,'?');
  return /^[\d?]{13}$/.test(value)?value:'';
 }
 // For a partial prefix with at most two unknown digits, look up
 // at most 100 keys rather than scanning every item in the catalogue.
 function prefixGroups(catalog,pattern){
  if(!pattern)return catalog.byPrefix;
  const prefix=pattern.slice(0,7),missing=[...prefix].filter(d=>d==='?').length;
  if(missing>2)return catalog.byPrefix;
  const groups=[];
  function expand(p){
   const i=p.indexOf('?');
   if(i<0){const items=catalog.byPrefix.get(p);if(items)groups.push([p,items]);return;}
   for(let d=0;d<10;d++)expand(p.slice(0,i)+d+p.slice(i+1));
  }
  expand(prefix);return groups;
 }
 function matchingCandidates({eanObserved='',name=''}={}){
  const catalog=index();
  if(!catalog.available||!catalog.count)return [];
  const pattern=observedPattern(eanObserved);
  const knownPrefix=pattern?[...pattern.slice(0,7)].filter(c=>c!=='?').length:0;
  const strictPrefix=knownPrefix>=5,hint=normalizeName(name);
  if(!strictPrefix&&hint.length<6)return [];
  const key=pattern.slice(0,7)+'|'+hint;
  if(queryCache.has(key))return queryCache.get(key);
  const out=[];
  for(const [prefix,items] of prefixGroups(catalog,pattern)){
   if(pattern&&[...prefix].some((digit,i)=>
      pattern[i]!=='?'&&pattern[i]!==digit))continue;
   for(const record of items.values()){
    const similarity=hint?normalizedSimilarity(hint,record.normalizedName):0;
    if(!strictPrefix&&similarity<.74)continue;
    out.push({eanPrefix:prefix,plu:record.plu,name:record.name,
     prefixDigits:knownPrefix,nameScore:similarity,ambiguous:items.size!==1,
     source:'digi-import'});
   }
  }
  out.sort((a,b)=>b.prefixDigits-a.prefixDigits||
   b.nameScore-a.nameScore||a.eanPrefix.localeCompare(b.eanPrefix));
  if(queryCache.size>=32)queryCache.delete(queryCache.keys().next().value);
  queryCache.set(key,out);return out;
 }
 // La limite de cinq ne concerne que les suggestions envoyées à Gemini.
 // La décision d'unicité est toujours prise sur TOUS les candidats.
 function candidates({eanObserved='',name='',limit=5}={}){
  return matchingCandidates({eanObserved,name}).slice(0,Math.min(5,Math.max(1,Number(limit)||5))).map(c=>({...c}));
 }
 function checkDigit(first12){
  if(!/^\d{12}$/.test(first12))return '';
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(first12[i])*(i%2?3:1);
  return String((10-sum%10)%10);
 }
 // Le nom n'est pas une identité. Un libellé partagé par plusieurs
 // origines/préfixes ne constitue JAMAIS une contradiction avec un EAN.
 function fruitFamily(name){
  const key=normalizeName(name);
  if(/\b(?:CLEMENTINES?|MANDARINES?|SATSUMAS?)\b/.test(key))return 'mandarine';
  if(/\b(?:CITRONS?|LIMES?)\b/.test(key))return 'citron';
  if(/\bORANGES?\b/.test(key))return 'orange';
  if(/\b(?:PAMPLEMOUSSES?|POMELOS?)\b/.test(key))return 'pomelo';
  return null;
 }
 function nameIdentityConflict(name,prefix){
  const key=normalizeName(name);
  if(!key||!prefix)return false;
  const catalog=index(),official=[...(catalog.byPrefix.get(prefix)||new Map()).values()];
  if(!official.length)return false;
  if(official.some(item=>normalizeName(item.name)===key))return false;
  const items=catalog.byName?.get(key);
  if(items?.size&&![...items.values()].some(item=>item.eanPrefix===prefix))return true;
  const family=fruitFamily(key);
  const variety=k=>normalizeName(k).replace(/\b(?:ORANGES?|CITRONS?|LIMES?|CLEMENTINES?|MANDARINES?|SATSUMAS?|PAMPLEMOUSSES?|POMELOS?|A|DE|DU|DES|FEUILLES?|BIO|NTAR)\b/g,' ').replace(/\s+/g,' ').trim();
  return Boolean(family&&official.every(item=>{
   const other=fruitFamily(item.name);
   if(!other)return false;
   if(other!==family)return true;
   // Deux libellés spécifiques de la même famille peuvent se contredire.
   const a=variety(key),b=variety(item.name);
   return Boolean(a&&b&&a!==b&&!(' '+a+' ').includes(' '+b+' ')&&!(' '+b+' ').includes(' '+a+' '));
  }));
 }
 // Un libellé absent ou simplement proche n'est jamais une confirmation.
 function identityEvidence(name,ean){
  const key=normalizeName(name),record=resolve(ean);
  if(!record.ok)return {status:record.status,record};
  if(!key||key.length<3)return {status:'unread',record};
  if(key===normalizeName(record.name))return {status:'confirmed',record};
  return {status:nameIdentityConflict(name,record.eanPrefix)?'conflict':'uncertain',record};
 }
 function uniqueNameConflict(name,prefix){return nameIdentityConflict(name,prefix);}
 function compatible(code,pattern){
  return !pattern||[...pattern].every((d,i)=>d==='?'||d===code[i]);
 }
 // L'encodage DIGI 02 n'est pas injectif : 6 à 7 valeurs brutes par
 // centime. Énumérer les valeurs compatibles avec la tolérance de
 // lecture ET le calcul, puis vérifier la clé et chaque chiffre observé.
 function amountVariants(prefix,total,computed,pattern){
  if(!/^02\d{5}$/.test(prefix)||!Number.isSafeInteger(total)||
     !Number.isSafeInteger(computed)||total<0||computed<0)return [];
  const low=Math.max(0,total-1,computed-1),high=Math.min(total+1,computed+1);
  if(low>high)return [];
  const min=Math.max(0,Math.floor((low-.5)*655.36/100)-1);
  const max=Math.min(99999,Math.ceil((high+.5)*655.36/100)+1);
  const out=[];
  for(let n=min;n<=max;n++){
   const price=Math.round(n*100/655.36);
   if(price<low||price>high)continue;
   const first=prefix+String(n).padStart(5,'0'),code=first+checkDigit(first);
   if(compatible(code,pattern))out.push(code);
  }
  // Une variante canonique, si compatible, est la première proposition.
  // Elle n'est jamais une preuve de l'EAN imprimé.
  const canonical=Math.round(total*655.36/100);
  return out.sort((a,b)=>Math.abs(Number(a.slice(7,12))-canonical)-
   Math.abs(Number(b.slice(7,12))-canonical)||a.localeCompare(b));
 }
 function reconstruct(result,{allowProbable=false}={}){
  const fields={...(result?.fields||{})};
  const sources={name:'catalog',plu:'catalog',ean:'read',
   weight:'read',rate:'read',total:result?.digiRecovery?.sources?.total==='calculated'||
    result?.recoveryProvenance?.total==='calculated'?'calculated':'read'};
  const grams=fields.weightGrams,rate=fields.pricePerKgCents;
  const ean=typeof fields.ean13==='string'?fields.ean13:'';
  const validOriginal=eanValid(ean);
  const pattern=observedPattern(result?.eanObserved)||(validOriginal?ean:'');
  // Chercher l'identité et préparer les indices même si un chiffre de
  // poids/prix manque ; ces deux valeurs ne sont JAMAIS déduites.
  const possible=validOriginal?[]:matchingCandidates({eanObserved:pattern,name:fields.name});
  const hints=possible.slice(0,5);
  const outcome=(kind,extra={})=>({result:{...result,fields},kind,sources,candidates:hints,...extra});
  if(!Number.isSafeInteger(grams)||grams<1||grams>30000||
     !Number.isSafeInteger(rate)||rate<1||rate>1000000)
   return outcome('none');
  const computed=Math.round(grams*rate/1000);
  if(!Number.isSafeInteger(computed)||computed<0)return outcome('none');
  if(sources.total==='calculated'||fields.totalCents===null||fields.totalCents===undefined){
   fields.totalCents=computed;sources.total='calculated';
  }
  if(!Number.isSafeInteger(fields.totalCents)||fields.totalCents<0||
     Math.abs(fields.totalCents-computed)>1)
   return outcome('conflict',{conflictField:'amount',reason:'Montant et calcul contradictoires'});
  if(validOriginal){
   const exact=resolve(ean);
   if(!compatible(ean,pattern))
    return outcome('conflict',{conflictField:'ean',reason:'EAN complet différent des chiffres observés'});
   if(exact.ok&&uniqueNameConflict(fields.name,exact.eanPrefix))
    return outcome('conflict',{conflictField:'name',reason:'Nom lu incompatible avec le préfixe DIGI'});
   if(ean.startsWith('02')&&Math.abs(Math.round(Number(ean.slice(7,12))*100/655.36)-fields.totalCents)>1)
    return outcome('conflict',{conflictField:'amount',reason:'Prix encodé incompatible avec le montant'});
   return outcome(exact.ok?(sources.total==='calculated'?'calculated':'matched'):'none',
    {candidates:exact.ok?[exact]:[]});
  }
  if(!pattern||!possible.length)
   return outcome(sources.total==='calculated'?'calculated':'none');
  const known=[...pattern.slice(0,12)].filter(d=>d!=='?').length;
  const prefixDigits=[...pattern.slice(0,7)].filter(d=>d!=='?').length;
  // 5/7 = au moins trois chiffres d'identification au-delà du 02.
  // Garder au moins 9 des 12 chiffres utiles. Le nom ne peut ni
  // remplacer les chiffres observés ni départager deux origines.
  if(prefixDigits<5||known<9)
   return outcome('candidate',{reason:'Préfixe ou chiffres insuffisamment confirmés'});
  const viable=[];
  let unknownFamily=false,ambiguousReference=false;
  for(const item of possible){
   if(!item.eanPrefix.startsWith('02')){
    // Aucun encodage montant supposé pour les autres familles.
    // Une lecture intégralement observée peut en revanche être vérifiée.
    const observedComplete=!pattern.includes('?')?pattern:
     /^\d{12}\?$/.test(pattern)?pattern.slice(0,12)+checkDigit(pattern.slice(0,12)):null;
    if(observedComplete&&eanValid(observedComplete)&&observedComplete.startsWith(item.eanPrefix))
     viable.push({item,codes:[observedComplete]});
    else unknownFamily=true;
    continue;
   }
   const codes=amountVariants(item.eanPrefix,fields.totalCents,computed,pattern);
   if(codes.length){viable.push({item,codes});if(item.ambiguous)ambiguousReference=true;}
  }
  if(!viable.length&&!unknownFamily){
   return outcome('conflict',{conflictField:'ean',
    reason:'Aucun EAN compatible avec les chiffres observés et les montants'});
  }
  if(unknownFamily||ambiguousReference||viable.length!==1||viable[0].item.ambiguous)
   return outcome('candidate',{reason:'Plusieurs références possibles ou règle du prix non vérifiée'});
  const {item:first,codes}=viable[0];
  if(uniqueNameConflict(fields.name,first.eanPrefix))
   return outcome('conflict',{conflictField:'name',reason:'Nom lu incompatible avec le préfixe DIGI'});
  if(prefixDigits<7&&first.nameScore<.82)
   return outcome('candidate',{reason:'Libellé insuffisamment concordant avec le préfixe partiel'});
  const rebuilt=codes[0],record=resolve(rebuilt);
  if(!record.ok||record.plu!==first.plu||record.name!==first.name)
   return outcome('candidate',{reason:'Référence DIGI non unique'});
  // Même si l'article est certain, plusieurs valeurs EAN de prix
  // peuvent correspondre au même montant. Ne jamais présenter un
  // code arbitraire comme un original effectivement lu.
  const kind=prefixDigits===7&&codes.length===1&&!result?.weakEANSupplement?'reconstructed':'confirmation';
  const details={candidates:[first],proposedEAN:rebuilt,variantCount:codes.length,
   prefixDigits,knownDigits:known,reason:kind==='confirmation'?
    'Comparer l’article ET les 13 chiffres proposés à l’étiquette originale':null};
  if(kind==='confirmation'&&!allowProbable)return outcome(kind,details);
  fields.ean13=rebuilt;
  sources.ean=kind==='reconstructed'?'calculated-verified':'confirmed-by-user';
  return {result:{...result,fields,
   checks:{...(result?.checks||{}),eanChecksumValid:true,
    arithmeticConsistent:true,barcodePriceConsistent:true,digiConflict:false},
   recoveryProvenance:sources},kind,sources,...details,
   confirmedByUser:kind==='confirmation'&&allowProbable};
 }
 // Search strategy for a new reading of the SAME image. All hints
 // are advisory, never used as validation. A wrong observed digit can
 // prevent a strict match: allow a one-digit-near prefix as a hint only.
 function recheckPlan(result){
  const fields=result?.fields||{};
  const pattern=observedPattern(result?.eanObserved)||observedPattern(fields.ean13);
  const catalog=index();
  if(!catalog.available||!catalog.count)return {candidates:[],positions:[]};
  let pool=matchingCandidates({eanObserved:pattern,name:fields.name});
  const grams=fields.weightGrams,rate=fields.pricePerKgCents,total=fields.totalCents;
  const computed=Number.isSafeInteger(grams)&&grams>0&&Number.isSafeInteger(rate)&&rate>0?
   Math.round(grams*rate/1000):null;
  const cents=Number.isSafeInteger(total)&&total>=0?total:computed;
  const comparable=computed!==null&&cents!==null&&Math.abs(cents-computed)<=1;
  let ranked=pool.map(item=>({item,codes:comparable&&item.eanPrefix.startsWith('02')?
   amountVariants(item.eanPrefix,cents,computed,pattern):null}));
  const viable=ranked.filter(x=>x.codes===null||x.codes.length);
  // If a strict observed prefix fails, suggest nearby codes, but never
  // reconstruct from them. Similar name only influences ranking.
  if(!viable.length&&pattern){
   const known=[...pattern.slice(0,7)].filter(d=>d!=='?').length,hint=normalizeName(fields.name);
   if(known>=5){
    ranked=[];
    for(const [prefix,items] of catalog.byPrefix){
     const differences=[...prefix].reduce((n,d,i)=>n+(pattern[i]!=='?'&&d!==pattern[i]?1:0),0);
     if(differences!==1)continue;
     for(const r of items.values()){
      const nameScore=hint?normalizedSimilarity(hint,r.normalizedName):0;
      ranked.push({item:{eanPrefix:prefix,plu:r.plu,name:r.name,nameScore,prefixDigits:known-1,ambiguous:items.size!==1},codes:null});
     }
    }
    ranked.sort((a,b)=>b.item.nameScore-a.item.nameScore||a.item.eanPrefix.localeCompare(b.item.eanPrefix));
    if(!ranked.length)ranked=pool.map(item=>({item,codes:null}));
   }else ranked=viable;
  }else ranked=viable;
  const positions=new Set();
  for(let i=0;i<13;i++)if(!pattern||pattern[i]==='?')positions.add(i+1);
  // Request pixels at discriminating positions (including an apparent
  // misread). Don't transmit calculated candidate EANs or price values.
  for(const {item} of ranked){
   if(pattern)for(let i=0;i<7;i++)if(pattern[i]!=='?'&&item.eanPrefix[i]!==pattern[i])positions.add(i+1);
  }
  let firstCode=null;
  for(const entry of ranked)for(const code of entry.codes||[]){
   if(!firstCode){firstCode=code;continue;}
   for(let i=0;i<13;i++)if(code[i]!==firstCode[i])positions.add(i+1);
  }
  if(!viable.length&&comparable&&pool.length)for(let i=8;i<=13;i++)positions.add(i);
  // A full code with a bad checksum/unknown catalogue prefix needs
  // a fresh read of the entire line, not a forced correction.
  if(!positions.size&&(!eanValid(pattern)||!resolve(pattern).ok))
   for(let i=1;i<=13;i++)positions.add(i);
  return {candidates:ranked.slice(0,5).map(x=>({...x.item})),
   positions:[...positions].sort((a,b)=>a-b),candidateCount:ranked.length};
 }
 // All hypotheses below are ADVISORY. Only reconstruct() may resolve
 // the original EAN, and it retains its existing admission rules.
 const BARS_L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const BARS_G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const BARS_R=BARS_L.map(s=>[...s].map(x=>x==='0'?'1':'0').join(''));
 const PARITIES=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
 function encodeBars(ean){
  if(!eanValid(ean))return '';
  const parity=PARITIES[+ean[0]];
  return '101'+[...ean.slice(1,7)].map((d,i)=>(parity[i]==='L'?BARS_L:BARS_G)[+d]).join('')+
   '01010'+[...ean.slice(7)].map(d=>BARS_R[+d]).join('')+'101';
 }
 function barDistance(code,rows){
  const bits=encodeBars(code);
  const good=(Array.isArray(rows)?rows:[]).slice(0,8).filter(x=>typeof x==='string'&&/^[01]{95}$/.test(x)&&
   x.slice(0,3)==='101'&&x.slice(45,50)==='01010'&&x.slice(92)==='101');
  if(!bits||good.length<2)return null;
  const distances=good.map(row=>[...row].reduce((n,d,i)=>n+(d!==bits[i]?1:0),0)).sort((a,b)=>a-b);
  return distances[Math.floor(distances.length/2)];
 }
 // Rounding intervals include the existing +/-1 cent tolerance.
 // No inverse-calculated weight or price is installed in fields.
 function inverseRanges(fields){
  const g=fields?.weightGrams,r=fields?.pricePerKgCents,t=fields?.totalCents;
  const e=fields?.ean13;
  const totals=[];
  if(Number.isSafeInteger(t)&&t>=0)totals.push(t);
  if(eanValid(e)&&e.startsWith('02'))totals.push(Math.round(Number(e.slice(7,12))*100/655.36));
  const ranges={};
  if(totals.length){
   const lo=Math.max(0,...totals.map(v=>v-1)),hi=Math.min(...totals.map(v=>v+1));
   if(lo>hi)return {conflict:true};
   const range=(den,max)=>({min:Math.max(1,Math.ceil((lo-.5)*1000/den)),max:Math.min(max,Math.ceil((hi+.5)*1000/den)-1)});
   if(Number.isSafeInteger(r)&&r>0)ranges.weight=range(r,30000);
   if(Number.isSafeInteger(g)&&g>0)ranges.rate=range(g,1000000);
   ranges.total={min:lo,max:hi};
  }
  if(Number.isSafeInteger(g)&&g>0&&Number.isSafeInteger(r)&&r>0)
   ranges.computedTotal=Math.round(g*r/1000);
  return ranges;
 }
 function solveHypotheses(result,{observations=[],history=[]}={}){
  const fields=result?.fields||{},base=observedPattern(result?.eanObserved)||observedPattern(fields.ean13);
  const guide=recheckPlan(result),ranges=inverseRanges(fields);
  const sources=[],rows=[],alternatives=[];
  if(base)sources.push({mask:base,weight:3});
  for(const o of (Array.isArray(observations)?observations:[]).slice(0,6)){
   const mask=observedPattern(o?.pattern||o?.ean13);
   if(mask)sources.push({mask,weight:o.source==='optical-partial'?2:['digit-template','digi-advanced'].includes(o.source)?.35:1});
   if(Array.isArray(o?.bitRows))rows.push(...o.bitRows.slice(0,8));
   if(Array.isArray(o?.digitOptions)&&o.digitOptions.length===13)alternatives.push(o.digitOptions);
  }
  const catalogue=index();
  if(!catalogue.available)return {...guide,ranges,ranked:[],observationCount:sources.length};
  const recent=new Map();
  for(const e of (Array.isArray(history)?history:[]).slice(0,200)){
   const prefix=catalogPrefix(e?.catalogPrefix);
   if(prefix)recent.set(prefix,Math.min(10,(recent.get(prefix)||0)+1));
  }
  const pool=new Map();
  const add=c=>pool.set(c.eanPrefix+'|'+c.plu+'|'+c.name,c);
  // All strict matches, not just the top 5. Also consider alternate
  // observed masks and nearby candidates. Bound CPU; never infer uniqueness.
  for(const source of sources)for(const c of matchingCandidates({eanObserved:source.mask,name:fields.name}))add(c);
  for(const c of guide.candidates)add(c);
  if(!pool.size)for(const c of matchingCandidates({name:fields.name}))add(c);
  const ranked=[],g=fields.weightGrams,r=fields.pricePerKgCents;
  const computed=Number.isSafeInteger(g)&&g>0&&Number.isSafeInteger(r)&&r>0?Math.round(g*r/1000):null;
  const total=Number.isSafeInteger(fields.totalCents)?fields.totalCents:computed;
  const comparable=Number.isSafeInteger(total)&&Number.isSafeInteger(computed)&&Math.abs(total-computed)<=1;
  function mismatch(code,source){
   return [...source.mask].reduce((n,d,i)=>n+(d!=='?'&&code[i]!==d?source.weight:0),0);
  }
  for(const item of [...pool.values()].slice(0,160)){
   let codes=comparable&&item.eanPrefix.startsWith('02')?amountVariants(item.eanPrefix,total,computed,''):[];
   if(!codes.length&&eanValid(base)&&base.startsWith(item.eanPrefix))codes=[base];
   if(!codes.length)codes=[item.eanPrefix+'??????'];
   let best=null;
   for(const code of codes){
    const loss=sources.reduce((n,o)=>n+mismatch(code.slice(0,13),o),0);
    const optical=barDistance(code,rows);
    let ocrLoss=0;
    for(const option of alternatives)for(let i=0;i<13;i++){
     const opts=option[i];if(!Array.isArray(opts)||!opts.length||code[i]==='?')continue;
     const rank=opts.findIndex(x=>String(x?.digit)===code[i]);
     ocrLoss+=rank<0?1:rank*.25;
    }
    const score=loss*4+(optical??0)*1.5+ocrLoss+(1-(item.nameScore||0))*3;
    if(!best||score<best.score)best={code,score,barDistance:optical};
   }
   ranked.push({...item,...best,recent:recent.get(item.eanPrefix)||0});
  }
  ranked.sort((a,b)=>a.score-b.score||b.recent-a.recent||a.eanPrefix.localeCompare(b.eanPrefix));
  const positions=new Set(guide.positions);
  for(let i=0;i<13;i++){
   const observed=new Set(sources.map(x=>x.mask[i]).filter(x=>x&&x!=='?'));
   if(observed.size>1)positions.add(i+1);
  }
  // Do not send candidate EANs or scores as evidence. Only positions
  // and official product references guide the next visual reading.
  for(const item of ranked.slice(0,5))if(base)for(let i=0;i<13;i++)
   if(item.code[i]!=='?'&&base[i]!=='?'&&item.code[i]!==base[i])positions.add(i+1);
  return {candidates:ranked.slice(0,5).map(({eanPrefix,plu,name})=>({eanPrefix,plu,name})),
   positions:[...positions].sort((a,b)=>a-b),candidateCount:pool.size,ranges,
   ranked:ranked.slice(0,5),observationCount:sources.length,barRows:Math.min(8,rows.length),
   truncated:pool.size>160};
 }
 function compareAdvanced(result,observation){
  const ranges=inverseRanges(result?.fields),keys={weight:'weightGrams',rate:'pricePerKgCents',total:'totalCents'},out={};
  if(observation?.source!=='digi-advanced')return out;
  for(const [kind,key] of Object.entries(keys)){
   const value=observation.fields?.[kind]?.value;
   if(!Number.isSafeInteger(value)||value<1)continue;
   const actual=result?.fields?.[key],range=ranges[kind];
   out[kind]={value,agrees:Number.isSafeInteger(actual)?value===actual:null,
    withinRange:range?value>=range.min&&value<=range.max:null};
  }
  return out;
 }
 function verify(ean,plu,name){
  const record=resolve(ean);
  return Boolean(record.ok&&record.plu===String(plu??'')&&
   record.name===String(name??''));
 }
 function info(){
  const catalog=index();
  return {available:catalog.available,count:catalog.count,reason:catalog.reason};
 }
 return Object.freeze({resolve,verify,info,eanValid,catalogPrefix,candidates,reconstruct,recheckPlan,solveHypotheses,inverseRanges,compareAdvanced,encodeBars,barDistance,amountVariants,observedPattern,normalizeName,nameSimilarity,nameIdentityConflict,identityEvidence,STORAGE_KEY});
});
