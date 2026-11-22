/* Inventaires U v41.69 — lecture locale prudente des étiquettes DIGI.
   Aucun réseau ni capture sauvegardée : ce module ne traite que le texte OCR.
   En cas de doute, ne jamais compléter ou inventer une donnée. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiLocalOCR=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function eanValid(value){
  if(!/^\d{13}$/.test(value||''))return false;
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(value[i])*(i%2===0?1:3);
  return (10-sum%10)%10===Number(value[12]);
 }
 function normalized(text){
  return String(text||'').normalize('NFKC')
   .replace(/[\u00a0\u202f]/g,' ').replace(/[\u2018\u2019]/g,"'")
   .replace(/[€]/g,'€');
 }
 function numberValue(raw,decimals){
  const normalizedNumber=String(raw||'').replace(/\s/g,'').replace(',','.');
  if(!/^\d{1,5}(?:\.\d{1,3})?$/.test(normalizedNumber))return null;
  const numeric=Number(normalizedNumber);
  if(!Number.isFinite(numeric)||numeric<=0)return null;
  const multiplied=numeric*10**decimals;
  if(Math.abs(multiplied-Math.round(multiplied))>1e-5)return null;
  return Math.round(multiplied);
 }
 function distinctMatches(text,re,decimals){
  const values=new Set();
  for(const match of text.matchAll(re)){
   const value=numberValue(match[1],decimals);
   if(value!==null)values.add(value);
  }
  return [...values];
 }
 function pickName(text){
  const rejected=/\b(SUPER|GERMAIN|PRIX|POIDS|UNITAIRE|TOTAL|DATE|EMBALLAGE|PAYER|PAYER|NET|TARE|BALANCE|EURO|EUR|KG|MAGASIN|SAINT|FRANCE|EXPED|ST GERMAIN)\b/i;
  const candidates=[];
  for(const original of normalized(text).split(/[\r\n]+/)){
   const line=original.replace(/[^\p{L} '\-]/gu,' ').replace(/\s+/g,' ').trim();
   if(line.length<4||line.length>46||rejected.test(line))continue;
   if(!/^[\p{L}][\p{L} '\-]+$/u.test(line))continue;
   if(line.split(' ').length>5)continue;
   const letters=line.replace(/[^A-Za-zÀ-ÿ]/g,'');
   if(!letters||letters.length<4)continue;
   const upper=(letters.match(/[A-ZÀ-ÖØ-Þ]/g)||[]).length/letters.length;
   if(upper<.70)continue;
   candidates.push(line.toUpperCase());
  }
  return candidates.length===1?candidates[0]:null;
 }
 function parse(text,opts={}){
  const input=normalized(text),confidence=Number(opts.confidence);
  if(!Number.isFinite(confidence)||confidence<62)return null;
  const label=input.toUpperCase().replace(/\s+/g,' ');
  const name=pickName(input);
  if(!name||!/POIDS|PRIX|€|EUR|K(?:G|6)/i.test(label))return null;
  // Nombre imprimé sous « Poids net » (équivaut au brut de la panière).
  const weights=distinctMatches(label,/(?<![\d.,])(\d{1,2}[.,]\d{3})\s*K(?:G|6)\b/gi,3)
   .filter(g=>g>0&&g<=30000);
  const rates=distinctMatches(label,/(?<![\d.,])(\d{1,4}[.,]\d{2})\s*(?:€|EUR)\s*\/\s*K(?:G|6)\b/gi,2)
   .filter(c=>c>0&&c<=1000000);
  const totals=new Set();
  for(const m of label.matchAll(/(?<![\d.,])(\d{1,4}[.,]\d{2})\s*(?:€|EUR)(?!\s*\/\s*K(?:G|6))/gi)){
   const value=numberValue(m[1],2);
   if(value!==null&&value<=100000)totals.add(value);
  }
  const listedCodes=new Set();
  for(const m of input.matchAll(/(?<!\d)(\d(?:[\t -]?\d){12})(?!\d)/g)){
   const digits=m[1].replace(/\D/g,'');
   if(eanValid(digits))listedCodes.add(digits);
  }
  const scanned=String(opts.barcode||'').replace(/\D/g,'');
  if(scanned&&!eanValid(scanned))return null;
  // Si un code a été lu optiquement ET décodé, aucune divergence autorisée.
  if(scanned&&listedCodes.size&&(!listedCodes.has(scanned)||listedCodes.size!==1))return null;
  const codes=scanned?[scanned]:[...listedCodes];
  if(weights.length!==1||rates.length!==1||totals.size!==1||codes.length!==1)return null;
  const [weightGrams]=weights,[pricePerKgCents]=rates,[totalCents]=totals,[ean13]=codes;
  if(Math.round(weightGrams*pricePerKgCents/1000)!==totalCents)return null;
  // Sur les étiquettes DIGI à préfixe 02, le prix est aussi codé dans
  // les cinq chiffres après l'identifiant produit : contrôle indépendant.
  if(ean13.startsWith('02')){
   const encoded=Number(ean13.slice(7,12));
   const independentlyDecoded=Math.round(encoded*100/655.36);
   if(Math.abs(independentlyDecoded-totalCents)>1)return null;
  }
  return {
   fields:{name,weightGrams,pricePerKgCents,totalCents,ean13},
   checks:{arithmeticConsistent:true,eanChecksumValid:true},
   model:'OCR local',elapsedMs:0,source:'local',
   verifiedForInventory:false
  };
 }
 function signature(reading){
  const f=reading?.fields;
  return f?[f.name,f.weightGrams,f.pricePerKgCents,f.totalCents,f.ean13].join('|'):'';
 }
 function matchTwo(first,second){
  const s1=signature(first),s2=signature(second);
  return Boolean(s1&&s2&&s1===s2);
 }
 return Object.freeze({parse,eanValid,signature,matchTwo});
});
