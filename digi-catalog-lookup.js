/* Inventaires U v42.46 — déduction DIGI exhaustive, bornée et traçable.
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
  cachedRaw=raw;
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
   const item={plu,name,eanPrefix:prefix};
   // Un même PLU avec deux noms divergents est aussi ambigu.
   groups.get(prefix).set(plu+'|'+name,item);
   const normalized=normalizeName(name);
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
  const x=normalizeName(a),y=normalizeName(b);
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
 function matchingCandidates({eanObserved='',name=''}={}){
  const catalog=index();
  if(!catalog.available||!catalog.count)return [];
  const pattern=observedPattern(eanObserved);
  const knownPrefix=pattern?[...pattern.slice(0,7)].filter(c=>c!=='?').length:0;
  // Si au moins cinq caractères sont observés dans le préfixe, le
  // nom ne doit JAMAIS faire accepter un préfixe contradictoire.
  const strictPrefix=knownPrefix>=5;
  const hint=normalizeName(name);
  if(!strictPrefix&&hint.length<6)return [];
  const out=[];
  for(const [prefix,items] of catalog.byPrefix){
   if(pattern&&[...prefix].some((digit,i)=>
      pattern[i]!=='?'&&pattern[i]!==digit))continue;
   for(const record of items.values()){
    const similarity=hint?nameSimilarity(hint,record.name):0;
    if(!strictPrefix&&similarity<.74)continue;
    out.push({eanPrefix:prefix,plu:record.plu,name:record.name,
     prefixDigits:strictPrefix?knownPrefix:0,
     nameScore:similarity,ambiguous:items.size!==1,
     source:'digi-import'});
   }
  }
  out.sort((a,b)=>b.prefixDigits-a.prefixDigits||
   b.nameScore-a.nameScore||a.eanPrefix.localeCompare(b.eanPrefix));
  return out;
 }
 // La limite de cinq ne concerne que les suggestions envoyées à Gemini.
 // La décision d'unicité est toujours prise sur TOUS les candidats.
 function candidates({eanObserved='',name='',limit=5}={}){
  return matchingCandidates({eanObserved,name}).slice(0,Math.min(5,Math.max(1,Number(limit)||5)));
 }
 function checkDigit(first12){
  if(!/^\d{12}$/.test(first12))return '';
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(first12[i])*(i%2?3:1);
  return String((10-sum%10)%10);
 }
 // Le nom n'est pas une identité. Un libellé partagé par plusieurs
 // origines/préfixes ne constitue JAMAIS une contradiction avec un EAN.
 function uniqueNameConflict(name,prefix){
  const key=normalizeName(name),items=index().byName?.get(key);
  if(!key||!items||items.size!==1)return false;
  const only=items.values().next().value;
  return only.eanPrefix!==prefix&&
   ![...(index().byPrefix.get(prefix)||new Map()).values()]
    .some(item=>normalizeName(item.name)===key);
 }
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
    if(!pattern.includes('?')&&eanValid(pattern)&&pattern.startsWith(item.eanPrefix))
     viable.push({item,codes:[pattern]});
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
 function verify(ean,plu,name){
  const record=resolve(ean);
  return Boolean(record.ok&&record.plu===String(plu??'')&&
   record.name===String(name??''));
 }
 function info(){
  const catalog=index();
  return {available:catalog.available,count:catalog.count,reason:catalog.reason};
 }
 return Object.freeze({resolve,verify,info,eanValid,catalogPrefix,candidates,reconstruct,amountVariants,observedPattern,normalizeName,nameSimilarity,STORAGE_KEY});
});
