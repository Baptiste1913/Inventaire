/* Inventaires U v42.29 — identité officielle depuis le catalogue DIGI importé.
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
 function verify(ean,plu,name){
  const record=resolve(ean);
  return Boolean(record.ok&&record.plu===String(plu??'')&&
   record.name===String(name??''));
 }
 function info(){
  const catalog=index();
  return {available:catalog.available,count:catalog.count,reason:catalog.reason};
 }
 return Object.freeze({resolve,verify,info,eanValid,catalogPrefix,STORAGE_KEY});
});
