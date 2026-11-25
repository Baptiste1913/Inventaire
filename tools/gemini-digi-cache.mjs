// Node 20+, run from repo root. Key from environment, never command line.
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const prefix=source.slice(source.indexOf(' const generalPrompt='),source.indexOf(' const focusNames='));
const context=vm.runInNewContext(prefix+'\ngeneralPrompt');
const args=process.argv.slice(2),extra=args.find(x=>!x.startsWith('--'));
const text=context+(extra?'\n\n'+fs.readFileSync(extra,'utf8'):'');
if(text.length>100000)throw Error('Contexte trop long');
const key=process.env.GEMINI_API_KEY;if(!key)throw Error('GEMINI_API_KEY manquante');
const root='https://generativelanguage.googleapis.com/v1beta/',model='models/gemini-3.5-flash-lite';
async function post(path,body){
 const res=await fetch(root+path,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)});
 if(!res.ok)throw Error('Google HTTP '+res.status+' (vérifier accès, taille minimale et facturation)');
 return res.json();
}
const count=await post(model+':countTokens',{contents:[{role:'user',parts:[{text}]}]});
console.log('Tokens statiques :',count.totalTokens);
if(!args.includes('--create')){console.log('Aucun cache créé. Relancer avec --create après validation du contexte et du coût.');process.exit(0);}
const cache=await post('cachedContents',{model,displayName:'inventaires-u-digi-v43-07',systemInstruction:{parts:[{text}]},ttl:'3600s'});
console.log('GEMINI_DIGI_CACHE='+cache.name,'Expiration :',cache.expireTime);
