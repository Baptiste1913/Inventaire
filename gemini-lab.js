/* Inventaires U 41.28 — viseur Gemini expérimental indépendant des pesées.
   Clé pilote mémorisable uniquement sur cet appareil ; aucune photo conservée. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const toggle=$('iuGeminiLabToggle'),panel=$('iuGeminiLab');
 if(!toggle||!panel)return;
 const photo=$('iuGeminiLabPhoto'),picture=$('iuGeminiLabPreview'),
  pilotKey=$('iuGeminiPilotKey'),saveKey=$('iuGeminiSaveKey'),
  forgetKey=$('iuGeminiForgetKey'),keyInfo=$('iuGeminiKeyInfo'),
  analyze=$('iuGeminiAnalyze'),status=$('iuGeminiLabStatus'),
  output=$('iuGeminiLabOutput'),networkTime=$('iuGeminiNetworkTime');
 let file=null,url=null,active=false,attempts=new Set(),generation=0,abort=null;
 const fixedModel='gemini-3.5-flash-lite';
 const storageKey='iu-gemini-pilot-key-v1';
 const endpoint='https://inventaires-u-prix.baptistee123.workers.dev/gemini-lab';
 const openCamera=$('iuGeminiOpenCamera'),cameraShell=$('iuGeminiCameraShell'),
  video=$('iuGeminiVideo'),closeCamera=$('iuGeminiCloseCamera'),
  torch=$('iuGeminiTorch'),capture=$('iuGeminiCapture');
 let cameraStream=null,cameraStarting=false,cameraEpoch=0,torchOn=false,torchBusy=false;
 const say=(message,error=false)=>{
  status.textContent=message;
  status.classList.toggle('is-error',error);
 };
 const formatWeight=g=>Number.isInteger(g)?(g/1000).toFixed(3).replace('.',',')+' kg':'Non reconnu';
 const money=c=>Number.isInteger(c)?(c/100).toFixed(2).replace('.',',')+' €':'Non reconnu';
 function updateButton(){
  analyze.disabled=!file||!pilotKey.value.trim()||active||attempts.has(fixedModel);
 }
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
  picture.hidden=true;picture.removeAttribute('src');
 }
 function clear(){
  stopCamera();
  generation++;abort?.abort();abort=null;active=false;file=null;
  attempts.clear();
  photo.value='';
  output.hidden=true;output.replaceChildren();networkTime.textContent='';
  clearPreview();updateButton();say('Sélectionne une photo pour commencer.');
 }
 function setPhoto(chosen){
  if(!chosen)return;
  if(active){say('Analyse en cours : attends la réponse avant de changer de photo.',true);return;}
  stopCamera();
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
 photo.addEventListener('change',()=>{
  const selected=photo.files?.[0]||null;
  photo.value='';
  setPhoto(selected);
 });
 pilotKey.addEventListener('input',updateButton);
 function readStoredKey(){
  try{return localStorage.getItem(storageKey)||'';}catch(_){return '';}
 }
 function keyState(){
  const stored=readStoredKey();
  const hasKey=Boolean(stored);
  forgetKey.hidden=!hasKey;
  saveKey.hidden=hasKey&&pilotKey.value.trim()===stored;
  keyInfo.textContent=hasKey
   ?'Clé enregistrée sur cet appareil. Tu peux la supprimer à tout moment.'
   :'Clé non enregistrée. Mémorisation locale non chiffrée : uniquement sur un appareil personnel de confiance.';
  updateButton();
 }
 saveKey.addEventListener('click',()=>{
  const key=pilotKey.value.trim();
  if(!key){say('Saisis la clé pilote avant de la mémoriser.',true);return;}
  try{
   localStorage.setItem(storageKey,key);
   keyState();
   say('Clé mémorisée dans ce navigateur. Elle ne sera plus demandée ici.');
  }catch(_){say('Enregistrement impossible : stockage du navigateur indisponible.',true);}
 });
 forgetKey.addEventListener('click',()=>{
  try{localStorage.removeItem(storageKey);}catch(_){}
  pilotKey.value='';
  keyState();
  say('Clé locale effacée. Tu devras la saisir pour une prochaine analyse.');
 });
 pilotKey.addEventListener('input',keyState);
 pilotKey.value=readStoredKey();
 keyState();
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
   +' · modèle '+String(result.model||fixedModel);
 }
 analyze.addEventListener('click',async()=>{
  if(analyze.disabled||!file)return;
  const selectedModel=fixedModel,access=pilotKey.value.trim();
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
   // La photo n'est pas enregistrée ; la clé n'est conservée que si l'utilisateur l'a mémorisée.
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
   if(id===generation){active=false;abort=null;updateButton();}
  }
 });

 function refreshTorch(){
  let supported=false;
  try{supported=cameraStream?.getVideoTracks?.()[0]?.getCapabilities?.()?.torch===true;}catch(_){}
  torch.hidden=!supported;
  torch.disabled=torchBusy;
  torch.classList.toggle('is-on',torchOn);
  torch.setAttribute('aria-pressed',String(torchOn));
  torch.setAttribute('aria-label',torchOn?'Désactiver le flash':'Activer le flash');
  torch.title=torchOn?'Désactiver le flash':'Activer le flash';
 }
 function stopCamera(){
  cameraEpoch++;
  if(cameraStream){
   for(const track of cameraStream.getTracks())track.stop();
   cameraStream=null;
  }
  try{video.pause();}catch(_){}
  video.srcObject=null;
  cameraStarting=false;torchBusy=false;torchOn=false;
  cameraShell.hidden=true;
  openCamera.hidden=false;
  openCamera.disabled=false;
  refreshTorch();
 }
 async function startCamera(){
  if(cameraStarting||cameraStream||active)return;
  if(!navigator.mediaDevices?.getUserMedia){
   say('Caméra en direct indisponible : autorise la caméra ou utilise la galerie.',true);return;
  }
  cameraStarting=true;
  const epoch=++cameraEpoch;
  openCamera.disabled=true;
  say('Ouverture du viseur…');
  let obtained=null;
  try{
   obtained=await navigator.mediaDevices.getUserMedia({
    audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}
   });
   if(epoch!==cameraEpoch||panel.hidden){
    for(const track of obtained.getTracks())track.stop();
    return;
   }
   cameraStream=obtained;
   video.srcObject=obtained;
   cameraShell.hidden=false;openCamera.hidden=true;
   await video.play();
   if(epoch!==cameraEpoch||panel.hidden)return;
   refreshTorch();
   say('Vise l’étiquette entière, puis touche Capturer.');
  }catch(_){
   if(epoch===cameraEpoch){
    stopCamera();
    say('Caméra indisponible ou accès refusé. Tu peux utiliser la galerie.',true);
   }
  }finally{
   if(epoch===cameraEpoch){cameraStarting=false;openCamera.disabled=false;}
  }
 }
 async function setTorch(enabled){
  const track=cameraStream?.getVideoTracks?.()[0];
  if(!track||torchBusy)return;
  let capable=false;
  try{capable=track.getCapabilities?.()?.torch===true;}catch(_){}
  if(!capable)return;
  torchBusy=true;refreshTorch();
  try{
   await track.applyConstraints({advanced:[{torch:enabled}]});
   if(cameraStream?.getVideoTracks?.()[0]===track)torchOn=enabled;
  }catch(_){
   if(cameraStream?.getVideoTracks?.()[0]===track){
    say('Flash indisponible sur cette caméra.',true);
    torchOn=false;
   }
  }finally{torchBusy=false;refreshTorch();}
 }
 openCamera.addEventListener('click',startCamera);
 closeCamera.addEventListener('click',()=>{
  stopCamera();say('Viseur fermé. Aucune photo envoyée.');
 });
 torch.addEventListener('click',()=>setTorch(!torchOn));
 capture.addEventListener('click',async()=>{
  if(!cameraStream||active||!video.videoWidth||!video.videoHeight)return;
  capture.disabled=true;
  try{
   const cv=document.createElement('canvas');
   const factor=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
   cv.width=Math.round(video.videoWidth*factor);
   cv.height=Math.round(video.videoHeight*factor);
   const ctx=cv.getContext('2d');
   if(!ctx)throw Error('Capture impossible');
   ctx.drawImage(video,0,0,cv.width,cv.height);
   const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.87));
   if(!blob)throw Error('Capture impossible');
   stopCamera();
   setPhoto(new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'}));
   say('Étiquette capturée. Vérifie la photo avant d’envoyer à Gemini.');
  }catch(_){say('Capture impossible. Réessaie.',true);}
  finally{capture.disabled=false;}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&cameraStream)stopCamera();
 });

 clear();
})();
