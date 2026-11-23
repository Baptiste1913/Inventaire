/* Inventaires U v42.44 — catalogue DIGI et récupération contrôlée d'EAN.
 * Les 13 chiffres EAN proviennent exclusivement de la lecture d'une étiquette.
 * Aucune association apprise, exemple, tarif ou approximation n'est autorisée.
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
  const groups=new Map();
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
   count++;
  }
  cachedIndex={available:true,byPrefix:groups,count,
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
 function candidates({eanObserved='',name='',limit=5}={}){
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
   if(strictPrefix&&[...prefix].some((digit,i)=>
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
  return out.slice(0,Math.min(5,Math.max(1,Number(limit)||5)));
 }
 function checkDigit(first12){
  if(!/^\d{12}$/.test(first12))return '';
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(first12[i])*(i%2?3:1);
  return String((10-sum%10)%10);
 }
 function reconstruct(result,{allowProbable=false}={}){
  const fields={...(result?.fields||{})};
  const sources={name:'catalog',plu:'catalog',ean:'read',
   weight:'read',rate:'read',total:'read'};
  const grams=fields.weightGrams,rate=fields.pricePerKgCents;
  // Aucun poids ni prix au kilo ne peut être créé par le catalogue.
  if(!Number.isSafeInteger(grams)||grams<1||grams>30000||
     !Number.isSafeInteger(rate)||rate<1||rate>1000000)
   return {result,kind:'none',sources};
  const computed=Math.round(grams*rate/1000);
  if(!Number.isSafeInteger(computed)||computed<0)return {result,kind:'none',sources};
  if(Number.isSafeInteger(fields.totalCents)&&
     Math.abs(fields.totalCents-computed)>1)
   return {result,kind:'conflict',sources,reason:'Montant et calcul contradictoires'};
  if(fields.totalCents===null||fields.totalCents===undefined){
   fields.totalCents=computed;sources.total='calculated';
  }
  const ean=typeof fields.ean13==='string'?fields.ean13:'';
  const validOriginal=eanValid(ean);
  const pattern=observedPattern(result?.eanObserved)||
   (validOriginal?ean:'');
  const possible=candidates({eanObserved:pattern,name:fields.name,limit:5});
  // Une concordance TRÈS forte avec un AUTRE article du catalogue
  // signale une étiquette voisine ou une lecture contradictoire.
  // Ne pas sélectionner silencieusement un code mathématique.
  const claimedPrefix=validOriginal?ean.slice(0,7):possible[0]?.eanPrefix;
  if(claimedPrefix&&candidates({name:fields.name,limit:3})
    .some(item=>item.eanPrefix!==claimedPrefix&&item.nameScore>=.90))
   return {result:{...result,fields},kind:'conflict',sources,
    reason:'Nom lu incompatible avec le préfixe DIGI'};
  if(validOriginal){
   // Un code complet contredisant des chiffres imprimés partiels ne
   // devient jamais vrai sous prétexte que son checksum est valide.
   if(pattern&&[...pattern].some((digit,i)=>digit!=='?'&&digit!==ean[i]))
    return {result:{...result,fields},kind:'conflict',sources,
     reason:'EAN complet différent des chiffres observés'};
   // Nom et PLU exclusivement depuis l'index officiel, rien à déduire.
   const exact=resolve(ean);
   return {result:{...result,fields},kind:exact.ok
    ?(sources.total==='calculated'?'calculated':'matched'):'none',
    sources,candidates:exact.ok?[exact]:[]};
  }
  if(!pattern||!possible.length)
   return {result:{...result,fields},kind:sources.total==='calculated'
    ?'calculated':'none',sources,candidates:possible};
  const known=[...pattern.slice(0,12)].filter(c=>c!=='?').length;
  const first=possible[0];
  // Les suggestions ambiguës ne peuvent pas devenir un article.
  const unique=possible.length===1&&!first.ambiguous;
  const knownPrefix=first.prefixDigits;
  const nameSupports=first.nameScore>=.82;
  const prefixComplete=knownPrefix===7;
  const minimumEvidence=known>=9&&
   (prefixComplete||(knownPrefix===6&&nameSupports));
  if(!unique||!minimumEvidence)
   return {result:{...result,fields},kind:'candidate',sources,
    candidates:possible,reason:'Préfixe ou chiffres insuffisamment confirmés'};
  // Le codage du montant est vérifié uniquement pour la famille 02.
  // Les autres préfixes variables DIGI ne sont pas supposés identiques.
  if(!first.eanPrefix.startsWith('02'))
   return {result:{...result,fields},kind:'candidate',sources,
    candidates:possible,reason:'Règle du prix non vérifiée pour ce préfixe'};
  // L'encodeur de l'EAN de prix Super U/DIGI de cette application.
  const amount=Math.round(fields.totalCents*655.36/100);
  if(amount<0||amount>99999)return {result,kind:'conflict',sources,
   reason:'Montant DIGI non encodable'};
  const first12=first.eanPrefix+String(amount).padStart(5,'0');
  const rebuilt=first12+checkDigit(first12);
  if([...pattern].some((digit,i)=>digit!=='?'&&digit!==rebuilt[i]))
   return {result:{...result,fields},kind:'conflict',sources,
    candidates:possible,reason:'Chiffres imprimés incompatibles avec le calcul DIGI'};
  // Ne pas substituer une simple suggestion au code réellement imprimé.
  const kind=prefixComplete?'reconstructed':'confirmation';
  if(kind==='confirmation'&&!allowProbable)
   return {result:{...result,fields},kind,sources,
    proposedEAN:rebuilt,candidates:possible,
    reason:'Préfixe partiel et libellé concordant : confirmation nécessaire'};
  if(kind==='confirmation'&&!nameSupports)
   return {result:{...result,fields},kind:'candidate',sources,candidates:possible};
  const record=resolve(rebuilt);
  if(!record.ok||record.plu!==first.plu||record.name!==first.name)
   return {result:{...result,fields},kind:'conflict',sources,
    reason:'Référence DIGI non unique après reconstruction'};
  fields.ean13=rebuilt;
  sources.ean=kind==='reconstructed'?'calculated-verified':'confirmed-by-user';
  return {result:{...result,fields,
   checks:{...(result?.checks||{}),eanChecksumValid:true,
    arithmeticConsistent:true,barcodePriceConsistent:true},
   recoveryProvenance:sources},kind,sources,
   candidates:possible,proposedEAN:rebuilt,confirmedByUser:allowProbable};
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
 return Object.freeze({resolve,verify,info,eanValid,catalogPrefix,candidates,reconstruct,observedPattern,normalizeName,nameSimilarity,STORAGE_KEY});
});
