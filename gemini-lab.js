/* Inventaires U 41.26 — banc d'essai Gemini, indépendant des pesées.
   Aucun stockage d'image ou de clé ; une requête volontaire par modèle et photo. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const toggle=$('iuGeminiLabToggle'),panel=$('iuGeminiLab');
 if(!toggle||!panel)return;
 const photo=$('iuGeminiLabPhoto'),camera=$('iuGeminiLabCamera'),
  picture=$('iuGeminiLabPreview'),model=$('iuGeminiLabModel'),
  pilotKey=$('iuGeminiPilotKey'),consent=$('iuGeminiConsent'),
  analyze=$('iuGeminiAnalyze'),status=$('iuGeminiLabStatus'),
  output=$('iuGeminiLabOutput'),networkTime=$('iuGeminiNetworkTime');
 let file=null,url=null,active=false,attempts=new Set(),generation=0,abort=null;
 const endpoint='https://inventaires-u-prix.baptistee123.workers.dev/gemini-lab';
 const say=(message,error=false)=>{
  status.textContent=message;
  status.classList.toggle('is-error',error);
 };
 const formatWeight=g=>Number.isInteger(g)?(g/1000).toFixed(3).replace('.',',')+' kg':'Non reconnu';
 const money=c=>Number.isInteger(c)?(c/100).toFixed(2).replace('.',',')+' €':'Non reconnu';
 function updateButton(){
  analyze.disabled=!file||!consent.checked||!pilotKey.value.trim()||active||
   attempts.has(model.value);
 }
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
  picture.hidden=true;picture.removeAttribute('src');
 }
 function clear(){
  generation++;abort?.abort();abort=null;active=false;file=null;
  pilotKey.value='';consent.checked=false;attempts.clear();
  photo.value='';camera.value='';
  output.hidden=true;output.replaceChildren();networkTime.textContent='';
  clearPreview();updateButton();say('Sélectionne une photo pour commencer.');
 }
 function setPhoto(chosen){
  if(!chosen)return;
  if(active){say('Analyse en cours : attends la réponse avant de changer de photo.',true);return;}
  if(!chosen.type.startsWith('image/')||chosen.size>15*1024*1024){
   say('Choisis une image de moins de 15 Mo.',true);return;
  }
  clearPreview();file=chosen;attempts.clear();generation++;
  url=URL.createObjectURL(chosen);
  picture.src=url;picture.hidden=false;
  output.hidden=true;networkTime.textContent='';
  say('Photo prête. Une analyse sera envoyée uniquement après validation.');
  updateButton();
 }
 for(const input of [photo,camera]){
  input.addEventListener('change',()=>{
   const selected=input.files?.[0]||null;
   input.value='';
   setPhoto(selected);
  });
 }
 for(const input of [model,pilotKey,consent]){
  input.addEventListener('change',updateButton);
  input.addEventListener('input',updateButton);
 }
 toggle.addEventListener('click',()=>{
  const opening=panel.hidden;
  panel.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));
  if(!opening)clear();
  else panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 });
 function decodePhoto(source){
  return new Promise((resolve,reject)=>{
   const localUrl=URL.createObjectURL(source);
   const img=new Image();
   img.onload=()=>{URL.revokeObjectURL(localUrl);resolve(img);};
   img.onerror=()=>{URL.revokeObjectURL(localUrl);reject(Error('Format photo non pris en charge'));};
   img.src=localUrl;
  });
 }
 async function imageBase64(source){
  const img=await decodePhoto(source);
  const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
  if(!scale||!img.naturalWidth||!img.naturalHeight)throw Error('Photo vide');
  const cv=document.createElement('canvas');
  cv.width=Math.max(1,Math.round(img.naturalWidth*scale));
  cv.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=cv.getContext('2d');
  if(!ctx)throw Error('Traitement image impossible sur cet appareil');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);
  ctx.drawImage(img,0,0,cv.width,cv.height);
  for(const quality of [.88,.80,.72,.64,.56]){
   const data=cv.toDataURL('image/jpeg',quality);
   const b64=data.slice(data.indexOf(',')+1);
   if(b64.length<=690000)return b64;
  }
  throw Error('Photo trop volumineuse après compression');
 }
 function display(result,wallMs){
  output.replaceChildren();
  const fields=result?.fields||{},checks=result?.checks||{};
  const entries=[
   ['Article',fields.name||'Non reconnu'],
   ['Poids net lu',formatWeight(fields.weightGrams)],
   ['Prix au kilo',Number.isInteger(fields.pricePerKgCents)?money(fields.pricePerKgCents)+'/kg':'Non reconnu'],
   ['Prix à payer',money(fields.totalCents)],
   ['Code-barres EAN-13',fields.ean13||'Non confirmé'],
   ['Contrôle du calcul',checks.arithmeticConsistent===true?'Cohérent (arrondi au centime)':'Non confirmé ou incohérent'],
   ['EAN : clé de contrôle',checks.eanChecksumValid===true?'Valide':'Non confirmé']
  ];
  for(const [label,value] of entries){
   const row=document.createElement('div');row.className='iu-gemini-result-row';
   const title=document.createElement('span');title.textContent=label;
   const strong=document.createElement('strong');strong.textContent=value;
   row.append(title,strong);output.append(row);
  }
  const caution=document.createElement('p');
  caution.textContent='Résultat expérimental : contrôle visuel obligatoire. Aucun poids transféré, aucun EAN généré.';
  caution.className='iu-gemini-result-warning';output.append(caution);
  output.hidden=false;
  networkTime.textContent='Gemini : '+(Number(result.elapsedMs)/1000).toFixed(2)+' s'
   +' · total photo + réseau : '+(wallMs/1000).toFixed(2)+' s'
   +' · modèle '+String(result.model||model.value);
 }
 analyze.addEventListener('click',async()=>{
  if(analyze.disabled||!file)return;
  const selectedModel=model.value,access=pilotKey.value.trim();
  if(!['gemini-3.8-flash','gemini-3.5-flash-lite'].includes(selectedModel))return;
  attempts.add(selectedModel);active=true;updateButton();
  output.hidden=true;networkTime.textContent='';
  const id=++generation;
  abort=new AbortController();
  const start=performance.now();
  say('Préparation puis envoi d’une seule photo à Gemini…');
  try{
   const encoded=await imageBase64(file);
   if(id!==generation)return;
   say('Gemini analyse l’étiquette…');
   const response=await fetch(endpoint,{
    method:'POST',signal:abort.signal,
    headers:{'Content-Type':'application/json','X-IU-Pilot-Key':access},
    body:JSON.stringify({type:'iu-gemini-label-test',model:selectedModel,
      mimeType:'image/jpeg',imageBase64:encoded})
   });
   // Aucun secret ni photo n'est conservé dans l'interface après le test.
   if(id!==generation)return;
   let result;
   try{result=await response.json()}catch(_){throw Error('Réponse JSON invalide');}
   if(!response.ok)throw Error(String(result?.error||'Réponse du Worker impossible'));
   display(result,performance.now()-start);
   say(result?.checks?.arithmeticConsistent===true
     ?'Lecture terminée : calcul cohérent. Vérifie les chiffres sur la photo.'
     :'Lecture terminée : un ou plusieurs champs sont à contrôler.');
  }catch(error){
   if(id===generation&&error?.name!=='AbortError'){
    const reason=String(error?.message||'Échec réseau').slice(0,140);
    say('Essai non terminé : '+reason,true);
   }
  }finally{
   if(id===generation){active=false;abort=null;pilotKey.value='';updateButton();}
  }
 });
 clear();
})();
