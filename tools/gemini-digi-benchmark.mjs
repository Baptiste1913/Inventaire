// Node 20+, local only. Manifest [{id,image,expected:{name,weightKg,pricePerKgEur,totalEur,ean13,eanObserved}}].
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const [mode,manifestPath,outputPath]=process.argv.slice(2);
if(!['prepare','score'].includes(mode)||!manifestPath||!outputPath)throw Error('Usage: node tools/gemini-digi-benchmark.mjs prepare|score manifest.json file.jsonl');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!Array.isArray(manifest)||!manifest.length||manifest.length>500||new Set(manifest.map(x=>x.id)).size!==manifest.length||manifest.some(x=>!/^[a-zA-Z0-9_-]+$/.test(x.id)||!x.expected||!x.image))throw Error('Manifeste invalide');
const src=fs.readFileSync('workers/coursesu-live-worker.js','utf8').split('export default {')[0];
const ctx=vm.createContext({});
vm.runInContext(src+'\nglobalThis.helpers={generalPrompt,responseSchema,compactSchema,compactKeys,parseDelimited,expandReading,geminiLabValue,geminiLabName,validEAN13};',ctx);
const h=ctx.helpers,formats=['json','compact','delimited'],levels=['MINIMAL','LOW'];
function prompt(format){
 if(format==='compact')return h.generalPrompt+' Utilise les clés JSON courtes suivantes à la place des clés longues : '+JSON.stringify(h.compactKeys)+'.';
 if(format==='delimited')return h.generalPrompt.replace('Retourne seulement un objet JSON avec les six propriétés exactes.','Retourne UNE ligne sans titre ni guillemets, exactement six champs séparés par ; dans cet ordre : name;weightKg;pricePerKgEur;totalEur;ean13;eanObserved. Remplace chaque champ inconnu par ? et conserve sa position. Aucun autre texte.');
 return h.generalPrompt;
}
const key=(id,f,l)=>id+'__'+f+'__'+l;
if(mode==='prepare'){
 const lines=[];
 for(const x of manifest){
  const image=fs.readFileSync(path.resolve(path.dirname(manifestPath),x.image));
  if(image.length<75||image.length>525000||image[0]!==255||image[1]!==216)throw Error('JPEG hors limites : '+x.id);
  for(const f of formats)for(const l of levels){
   const generationConfig={temperature:0,maxOutputTokens:1024,thinkingConfig:{thinkingLevel:l},responseMimeType:f==='delimited'?'text/plain':'application/json',...(f==='delimited'?{}:{responseSchema:f==='compact'?h.compactSchema:h.responseSchema})};
   lines.push(JSON.stringify({key:key(x.id,f,l),request:{contents:[{role:'user',parts:[{text:prompt(f)},{inlineData:{mimeType:'image/jpeg',data:image.toString('base64')}}]}],generationConfig}}));
  }
 }
 fs.writeFileSync(outputPath,lines.join('\n')+'\n',{flag:'wx',mode:0o600});
 console.log(lines.length,'requêtes préparées localement, aucun upload.');
}else{
 const rows=new Map();for(const line of fs.readFileSync(outputPath,'utf8').split(/\r?\n/).filter(Boolean)){const x=JSON.parse(line);if(rows.has(x.key))throw Error('Résultat dupliqué');rows.set(x.key,x);}
 const fields=['name','weightKg','pricePerKgEur','totalEur','ean13','eanObserved'];
 function normalized(k,v){
  if(v==null)return null;
  if(k==='name')return String(v).trim().normalize('NFC').toUpperCase();
  if(k==='weightKg')return h.geminiLabValue(String(v),'weight')??'INVALID';
  if(k==='pricePerKgEur'||k==='totalEur')return h.geminiLabValue(String(v),k==='totalEur'?'total':'rate')??'INVALID';
  return String(v);
 }
 for(const f of formats)for(const l of levels){
  let exact=0,failed=0,tokens=0;const matches=Object.fromEntries(fields.map(k=>[k,0])),denom=Object.fromEntries(fields.map(k=>[k,0]));
  for(const x of manifest){
   const data=rows.get(key(x.id,f,l))?.response;tokens+=data?.usageMetadata?.totalTokenCount||0;
   const c=data?.candidates?.[0],raw=(c?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
   let actual;try{if(c?.finishReason!=='STOP')throw Error('incomplete');actual=f==='delimited'?h.parseDelimited(raw):h.expandReading(JSON.parse(raw),f==='compact');}catch(_){failed++;}
   let all=!!actual,n=0;
   for(const k of fields)if(Object.hasOwn(x.expected,k)){n++;denom[k]++;if(actual&&Object.hasOwn(actual,k)&&normalized(k,actual[k])===normalized(k,x.expected[k]))matches[k]++;else all=false;}
   if(all&&n)exact++;
  }
  console.log(JSON.stringify({format:f,thinking:l,exact,total:manifest.length,failed,tokens,fields:Object.fromEntries(fields.map(k=>[k,matches[k]+'/'+denom[k]]))}));
 }
}
