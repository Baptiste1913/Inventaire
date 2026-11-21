/* Inventaires U 41.35 — viseur Gemini expérimental indépendant des pesées.
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
  output=$('iuGeminiLabOutput'),networkTime=$('iuGeminiNetworkTime'),
  transfer=$('iuGeminiTransfer'),transferSummary=$('iuGeminiTransferSummary'),
  transferCheck=$('iuGeminiTransferCheck'),confirmArticle=$('iuGeminiConfirmArticle'),
  confirmTare=$('iuGeminiConfirmTare'),transferApply=$('iuGeminiTransferApply');
 let file=null,url=null,active=false,attempts=new Set(),generation=0,abort=null;
 let proposal=null;
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
 function resetTransfer(){
  proposal=null;
  transfer.hidden=true;
  transferApply.disabled=true;
  confirmArticle.checked=false;confirmTare.checked=false;
  transferSummary.textContent='';transferCheck.textContent='';
 }
 function validateResult(result){
  const f=result?.fields||{},c=result?.checks||{};
  const grams=f.weightGrams,rate=f.pricePerKgCents,total=f.totalCents;
  const name=typeof f.name==='string'?f.name.trim():'';
  if(!name||name.length<3||name.length>120)return {error:'Article non reconnu avec certitude.'};
  if(!Number.isSafeInteger(grams)||grams<=0||grams>30000)return {error:'Poids net manquant ou invalide.'};
  if(!Number.isSafeInteger(rate)||rate<=0||rate>1000000||
     !Number.isSafeInteger(total)||total<0)return {error:'Prix au kilo ou montant manquant.'};
  if(Math.abs(Math.round(grams*rate/1000)-total)>1||
     c.arithmeticConsistent!==true)return {error:'Calcul prix × poids incohérent.'};
  if(c.eanChecksumValid!==true||!/^[0-9]{13}$/.test(f.ean13||''))return {error:'EAN non confirmé ou invalide.'};
  return {name,grams,rate,total,ean:f.ean13};
 }
 function transferState(){
  if(!proposal){transferApply.disabled=true;return;}
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=ctx?.tareGrams;
  const valid=Number.isSafeInteger(tare)&&tare>=0&&tare<=30000;
  // L’étiquette DIGI affiche un « poids net » qui inclut la panière :
  // ce poids est le BRUT de notre formulaire, sans ajout de tare.
  const gross=proposal.grams;
  const net=valid?gross-tare:null;
  const allowed=valid&&net>0&&gross<=30000;
  transferSummary.textContent=allowed
   ?proposal.name+' · '+formatWeight(gross)+' brut (lu sur l’étiquette) − '+formatWeight(tare)+' de tare = '+formatWeight(net)+' net de produits.'
   :valid?'Transfert bloqué : le poids de l’étiquette doit être supérieur à la tare sélectionnée.'
    :'Sélectionne un panier avec une tare valide pour préparer la pesée.';
  transferCheck.textContent='Article à confirmer visuellement : '+proposal.name+
   ' · EAN '+proposal.ean+'. Le code-barres n’est pas transféré.';
  transferApply.disabled=!allowed||!confirmArticle.checked||!confirmTare.checked||active;
 }
 confirmArticle.addEventListener('change',transferState);
 confirmTare.addEventListener('change',transferState);
 $('basketSelect')?.addEventListener('change',()=>{
  confirmTare.checked=false;transferState();
 });
 transferApply.addEventListener('click',()=>{
  transferState();
  if(transferApply.disabled||!proposal)return;
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const gross=proposal.grams;
  if(!ctx||!Number.isSafeInteger(ctx.tareGrams)||gross<=ctx.tareGrams){
   say('Transfert bloqué : panier ou tare invalide.',true);return;
  }
  if(typeof window.IUWeighScanDraft!=='function'||window.IUWeighScanDraft(gross)!==true){
   say('Transfert refusé : termine ou vérifie la pesée précédente.',true);return;
  }
  resetTransfer();
  say('Poids BRUT de l’étiquette transféré en brouillon, sans sauvegarde. La tare du panier est déduite par le formulaire : vérifie le net et valide la pesée.');
 });
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
  picture.hidden=true;picture.removeAttribute('src');
 }
 function clear(){
  stopCamera();
  generation++;abort?.abort();abort=null;active=false;file=null;
  attempts.clear();
  photo.value='';
  output.hidden=true;output.replaceChildren();networkTime.textContent='';resetTransfer();
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
  output.hidden=true;networkTime.textContent='';resetTransfer();
  say(cameraStream?'Photo capturée. Appuie sur « Analyser une fois », puis vise la suivante.':'Photo prête. Une analyse sera envoyée uniquement après validation.');
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
  const verified=validateResult(result);
  const context=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=context?.tareGrams;
  const gross=fields.weightGrams;
  const net=Number.isSafeInteger(gross)&&Number.isSafeInteger(tare)?gross-tare:null;
  const arithmetic=checks.arithmeticConsistent===true;
  const eanValid=checks.eanChecksumValid===true;
  const netValid=Number.isSafeInteger(net)&&net>0;
  const ready=!verified.error&&netValid;
  const label=document.createElement('article');
  label.className='iu-gemini-printed-label'+(ready?' is-ready':' is-review');
  label.setAttribute('aria-label','Étiquette reconstituée à vérifier avant transfert');
  const add=(parent,tag,className,value)=>{
   const el=document.createElement(tag);el.className=className;el.textContent=value;
   parent.append(el);return el;
  };
  // Composition conforme à la vraie étiquette : magasin en haut à droite,
  // produit au centre, trois colonnes, EAN à gauche et prix encadré à droite.
  const top=add(label,'div','iu-gemini-label-top','');
  add(top,'span','iu-gemini-label-store','SUPER U');
  add(top,'span','iu-gemini-label-address','10120 ST GERMAIN');
  const name=typeof fields.name==='string'&&fields.name.trim()?fields.name.trim():'ARTICLE NON RECONNU';
  add(label,'div','iu-gemini-label-name',name);
  const middle=add(label,'div','iu-gemini-label-middle','');
  const rate=add(middle,'div','iu-gemini-label-rate','');
  add(rate,'span','iu-gemini-label-caption','Prix unitaire');
  add(rate,'strong','iu-gemini-label-number',Number.isInteger(fields.pricePerKgCents)?money(fields.pricePerKgCents).replace(/\s/g,'')+'/kg':'—');
  const grossBox=add(middle,'div','iu-gemini-label-gross','');
  add(grossBox,'span','iu-gemini-label-caption','Poids net');
  add(grossBox,'strong','iu-gemini-label-number',formatWeight(gross));
  const dateBox=add(middle,'div','iu-gemini-label-date','');
  add(dateBox,'span','iu-gemini-label-caption',"Date d’emballage");
  const rawDate=fields.packagingDate||fields.packedOn||fields.date||null;
  const printedDate=typeof rawDate==='string'&&/^\d{2}[./-]\d{2}[./-]\d{4}$/.test(rawDate.trim())
    ?rawDate.trim().replace(/[/-]/g,'.')
    :typeof rawDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())
      ?rawDate.trim().slice(8,10)+'.'+rawDate.trim().slice(5,7)+'.'+rawDate.trim().slice(0,4)
      :'—';
  add(dateBox,'strong','iu-gemini-label-number',printedDate);
  const bottom=add(label,'div','iu-gemini-label-bottom','');
  const barcode=add(bottom,'div','iu-gemini-label-barcode','');
  const bars=add(barcode,'div','iu-gemini-label-bars','');
  bars.setAttribute('aria-hidden','true');
  add(barcode,'span','iu-gemini-label-ean',fields.ean13||'EAN NON RECONNU');
  const total=add(bottom,'div','iu-gemini-label-total','');
  add(total,'span','iu-gemini-label-total-caption','PRIX A PAYER');
  add(total,'strong','iu-gemini-label-total-number',money(fields.totalCents).replace(/\s/g,''));
  const summary=add(output,'div','iu-gemini-label-summary','');
  const statusText=ready?'Contrôles cohérents · vérification visuelle requise'
    :verified.error?'Transfert bloqué · '+verified.error
    :!netValid?'Transfert bloqué · tare supérieure ou égale au brut'
    :'Vérification nécessaire';
  add(summary,'span','iu-gemini-label-state'+(ready?' is-ready':' is-review'),statusText);
  output.append(label);
  add(output,'p','iu-gemini-label-notice','Code-barres illustratif non scannable · comparer avec la photo originale');
  const calculation=add(output,'div','iu-gemini-net-summary','');
  add(calculation,'span','iu-gemini-net-caption','POIDS RÉEL DES PRODUITS · APRÈS TARE');
  add(calculation,'strong','iu-gemini-net-value'+(netValid?'':' is-invalid'),
   net===null?'Tare non disponible':formatWeight(net));
  add(calculation,'span','iu-gemini-net-detail',
   formatWeight(gross)+' brut − '+formatWeight(tare)+' panière');
  const checksRow=add(output,'div','iu-gemini-label-checks','');
  add(checksRow,'span',arithmetic?'is-ok':'is-warning',
   (arithmetic?'✓':'!')+' Calcul du prix '+(arithmetic?'cohérent':'à vérifier'));
  add(checksRow,'span',eanValid?'is-ok':'is-warning',
   (eanValid?'✓':'!')+' EAN '+(eanValid?'valide':'à vérifier'));
  const caution=add(output,'p','iu-gemini-result-warning',
   'Un calcul cohérent ou un EAN valide ne garantit pas que Gemini a lu les bons chiffres. Compare avec la photo avant de confirmer.');
  output.hidden=false;
  if(verified.error){
   resetTransfer();transfer.hidden=false;
   transferCheck.textContent='Transfert bloqué : '+verified.error;
  }else{
   proposal=verified;transfer.hidden=false;
   confirmArticle.checked=false;confirmTare.checked=false;
   transferState();
  }
  networkTime.textContent='Gemini : '+(Number(result.elapsedMs)/1000).toFixed(2)+' s'
   +' · total photo + réseau : '+(wallMs/1000).toFixed(2)+' s'
   +' · modèle '+String(result.model||fixedModel);
 }
 analyze.addEventListener('click',async()=>{
  if(analyze.disabled||!file)return;
  const selectedModel=fixedModel,access=pilotKey.value.trim();
  attempts.add(selectedModel);active=true;updateButton();capture.disabled=true;
  output.hidden=true;networkTime.textContent='';resetTransfer();
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
   if(id===generation){active=false;abort=null;capture.disabled=false;updateButton();}
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
  cameraShell.dataset.state='idle';
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
   cameraShell.hidden=false;cameraShell.dataset.state='scanning';openCamera.hidden=true;
   await video.play();
   if(epoch!==cameraEpoch||panel.hidden)return;
   refreshTorch();
   say('Vise une étiquette, capture-la, puis analyse-la. La caméra reste ouverte pour les suivantes.');
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
   setPhoto(new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'}));
   say('Photo capturée. Le viseur reste ouvert : analyse-la, puis capture la suivante.');
  }catch(_){say('Capture impossible. Réessaie.',true);}
  finally{capture.disabled=false;}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&cameraStream)stopCamera();
 });

 clear();
})();
