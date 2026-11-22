/* Inventaires U 42.22 — viseur prêt mais caméra inactive et étiquette vierge au démarrage.
   Clé pilote mémorisable uniquement sur cet appareil ; aucune photo conservée. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const toggle=$('iuGeminiLabToggle'),panel=$('iuGeminiLab');
 if(!panel)return;
 const photo=$('iuGeminiLabPhoto'),
  pilotKey=$('iuGeminiPilotKey'),saveKey=$('iuGeminiSaveKey'),
  forgetKey=$('iuGeminiForgetKey'),keyInfo=$('iuGeminiKeyInfo'),
  analyze=$('iuGeminiAnalyze'),status=$('iuGeminiLabStatus'),
  output=$('iuGeminiLabOutput'),networkTime=$('iuGeminiNetworkTime');
 // Le patron de l'étiquette est conservé sans prix, poids ni code factice.
 // Il est restauré après chaque Nouvelle pesée.
 const blankLabelNodes=Array.from(output?.childNodes||[],node=>node.cloneNode(true));
 function showBlankLabel(){
  if(!output)return;
  output.replaceChildren(...blankLabelNodes.map(node=>node.cloneNode(true)));
  output.hidden=false;
 }
  let file=null,url=null,active=false,attempts=new Set(),generation=0,abort=null;
 let proposal=null,latestLabelFields=null;
 // La dernière photo et son résultat appartiennent à une même lecture.
 // Les erreurs ne doivent jamais laisser le scanner figé ou le bouton bloqué.
 let lastReadProblem=null,lastAnalysisError=null,retakeConfirmUntil=0;
 let pendingReplacementFile=null,lastSavedImportedPhoto=null;
 let lastRawResult=null,localBarcode=null,barcodeJob=null,repairFocus=null;
 let manualCorrectedFields=[];
 const fixedModel='gemini-3.5-flash-lite';
 const storageKey='iu-gemini-pilot-key-v1';
 const endpoint='https://inventaires-u-prix.baptistee123.workers.dev/gemini-lab';
 const openCamera=$('iuGeminiOpenCamera'),cameraShell=$('iuGeminiCameraShell'),
  cameraIdle=$('iuGeminiCameraIdle'),
  video=$('iuGeminiVideo'),closeCamera=$('iuGeminiCloseCamera'),
  torch=$('iuGeminiTorch'),capture=$('iuGeminiCapture'),detected=$('iuGeminiDetected');
 let cameraStream=null,cameraStarting=false,cameraEpoch=0,torchOn=false,torchBusy=false,frameCaptureBusy=false;
 let cameraPausedInBackground=false;
 const modeCamera=$('iuGeminiModeCamera'),modePhoto=$('iuGeminiModePhoto');
 const modeControl=$('iuGeminiModeCamera')?.closest('.iu-gemini-mode-control');
 const shortcut=$('iuGeminiCameraShortcut'),grossPreview=$('iuGeminiGrossPreview');
 const nextWeigh=$('iuGeminiNext'),emptyResult=$('iuGeminiEmptyResult');
 const labelAlert=$('iuGeminiLabelAlert'),labelAlertText=$('iuGeminiLabelAlertText'),
  duplicateSkip=$('iuGeminiDuplicateSkip');
 const repairPanel=$('iuGeminiRepair'),repairField=$('iuGeminiRepairField'),
  repairRead=$('iuGeminiRepairRead'),repairEdit=$('iuGeminiRepairEdit'),
  repairManual=$('iuGeminiRepairManual'),repairValue=$('iuGeminiRepairValue'),
  repairApply=$('iuGeminiRepairApply');
 const resultGross=$('iuGeminiGrossDisplay');
 const cameraStill=$('iuGeminiCameraStill'),frameState=$('iuGeminiFrameState'),
  replacementPrompt=$('iuGeminiReplacePrompt'),
  replaceKeep=$('iuGeminiReplaceKeep'),replaceProceed=$('iuGeminiReplaceProceed');
 const primaryText=nextWeigh?.querySelector('span');

 // v41.83 — Gabarit tracé d'après l'étiquette DIGI pleine et le
 // croquis de référence : 7 zones généreuses, aucune case par mot.
 const exactGuide=$('iuGeminiExactGuide');
 const cameraStage=cameraShell?.querySelector('.iu-gemini-camera-stage');
 let guideSnapshot=null,guideSize=null,guideSource=null,guideScheduled=false;
 const filledGuideValues=[
  ['.iu-gemini-label-name','CAROTTE'],
  ['.iu-gemini-label-rate .iu-gemini-label-number','1,99€/kg'],
  ['.iu-gemini-label-gross .iu-gemini-label-number','0,504 kg'],
  ['.iu-gemini-label-date .iu-gemini-label-number','22.11.2026'],
  ['.iu-gemini-label-ean','0203476006556'],
  ['.iu-gemini-label-total-number','1,00€']
 ];
 // Fractions relevées sur la maquette pleine (1372×1088) et corrigées
 // avec les sept grands encadrés rouges fournis : en-tête, produit,
 // 3 mesures, EAN, prix. Les zones ne se chevauchent pas.
 const labelOutlineZones=[
  ['store',  .510,.014,.430,.209],
  // Libellé : -15 % en largeur et en hauteur, centré.
  ['product',.125,.285,.761,.156],
  // Prix unitaire, poids net, date : -33 % sur les deux axes.
  ['rate',   .099,.503,.178,.125],
  ['weight', .382,.503,.180,.125],
  ['date',   .696,.503,.200,.125],
  // EAN : même hauteur et même position verticale que le bloc prix.
  ['barcode',.025,.687,.510,.291],
  ['total',  .547,.687,.404,.291]
 ];
 function buildExactCameraOutline(source){
  const initial=source.getBoundingClientRect();
  if(initial.width<=60||initial.height<=40||!source.parentElement)return null;
  // Le calcul est fait sur une copie DIGI réellement remplie :
  // jamais sur les tirets vides, et sans remplacer le résultat visible.
  const fullLabel=source.cloneNode(true);
  fullLabel.classList.remove('iu-gemini-label-placeholder');
  fullLabel.setAttribute('aria-hidden','true');
  for(const [selector,value] of filledGuideValues){
   const field=fullLabel.querySelector(selector);
   if(field)field.textContent=value;
  }
  fullLabel.style.setProperty('position','absolute','important');
  fullLabel.style.setProperty('visibility','hidden','important');
  fullLabel.style.setProperty('pointer-events','none','important');
  fullLabel.style.setProperty('width',initial.width+'px','important');
  fullLabel.style.setProperty('max-width','none','important');
  fullLabel.style.setProperty('height',initial.height+'px','important');
  fullLabel.style.setProperty('margin','0','important');
  let base=initial;
  try{
   source.parentElement.appendChild(fullLabel);
   const measured=fullLabel.getBoundingClientRect();
   if(measured.width>60&&measured.height>40)base=measured;
  }finally{
   fullLabel.remove();
  }
  const wireframe=document.createElement('div');
  wireframe.className='iu-gemini-outline-label';
  wireframe.style.width=base.width+'px';
  wireframe.style.height=base.height+'px';
  wireframe.style.borderRadius=getComputedStyle(source).borderTopLeftRadius;
  for(const [kind,x,y,w,h] of labelOutlineZones){
   const outline=document.createElement('span');
   outline.className='iu-gemini-outline-rect iu-gemini-outline-'+kind;
   outline.style.left=(x*base.width)+'px';
   outline.style.top=(y*base.height)+'px';
   outline.style.width=(w*base.width)+'px';
   outline.style.height=(h*base.height)+'px';
   wireframe.appendChild(outline);
  }
  return {node:wireframe,width:base.width,height:base.height};
 }
 function syncExactCameraGuide(){
  if(!cameraStage||!exactGuide||!output)return;
  const source=output.querySelector('.iu-gemini-printed-label.iu-gemini-label-placeholder');
  const stage=cameraStage.getBoundingClientRect();
  if(stage.width<40||stage.height<40)return;
  if(source){
   const bounds=source.getBoundingClientRect();
   if(bounds.width>60&&bounds.height>40&&
      (!guideSnapshot||source!==guideSource||!guideSize||
       Math.abs(bounds.width-guideSize.width)>.5||
       Math.abs(bounds.height-guideSize.height)>.5)){
    const built=buildExactCameraOutline(source);
    if(built){
     guideSource=source;
     guideSize={width:built.width,height:built.height};
     guideSnapshot=built.node;
     // Garder le Canvas de l'effet OCR : il reste attaché au repère,
     // y compris entre deux pesées et lors de son recalcul responsive.
     const outlineLight=exactGuide.querySelector('.iu-gemini-outline-light');
     if(outlineLight)exactGuide.replaceChildren(guideSnapshot,outlineLight);
     else exactGuide.replaceChildren(guideSnapshot);
    }
   }
  }
  if(!guideSnapshot||!guideSize)return;
  // Repère réduit de 18 % : on recule l'iPhone pour cadrer toute
  // l'étiquette avec de l'air autour. Ratio et formes DIGI inchangés.
  const scale=.82*Math.min((stage.width-8)/guideSize.width,
   (stage.height-8)/guideSize.height);
  if(!(scale>0))return;
  exactGuide.style.width=(guideSize.width*scale)+'px';
  exactGuide.style.height=(guideSize.height*scale)+'px';
  guideSnapshot.style.setProperty('transform','scale('+scale+')');
  guideSnapshot.style.setProperty('transform-origin','top left');
 }
 function scheduleExactCameraGuide(){
  if(guideScheduled)return;
  guideScheduled=true;
  requestAnimationFrame(()=>{
   guideScheduled=false;
   syncExactCameraGuide();
  });
 }
 if(cameraStage&&exactGuide){
  scheduleExactCameraGuide();
  if(typeof ResizeObserver==='function'){
   const observer=new ResizeObserver(scheduleExactCameraGuide);
   observer.observe(cameraStage);
   if(output)observer.observe(output);
  }
  if(output&&typeof MutationObserver==='function')
   new MutationObserver(scheduleExactCameraGuide).observe(output,{childList:true});
  window.addEventListener('resize',scheduleExactCameraGuide,{passive:true});
  document.fonts?.ready?.then(()=>{guideSnapshot=null;scheduleExactCameraGuide();}).catch(()=>{});
 }

 // La carte reste compacte en permanence : seuls les états changent.
 function updateCardState(nextState){
  panel.dataset.scanState=nextState||(!output.hidden?'review':file?'working':'search');
 }
 function scannerCardVisible(){
  return !document.hidden&&!panel.hidden&&panel.isConnected&&panel.getClientRects().length>0;
 }
 updateCardState('search');
 const setupCallout=$('iuGeminiSetupCallout'),geminiOptions=$('iuGeminiOptions');
 const autoScanState=$('iuGeminiAutoScanState'),autoReset=null;
 const autoSampleCanvas=document.createElement('canvas');
 const localReader=window.IUGeminiLocalOCR||null;
 let localWorker=null,localWorkerPromise=null,localEngineGeneration=0,
  localOcrDisabled=false,localOcrBusy=false,localOcrToken=0,
  localCandidate=null,localPasses=0;
 let cameraMode='manual',autoTimer=0,autoLocked=false,autoSuspended=false,
  autoLastFrame=null,autoLastCaptured=null,autoChangeReference=null,
  autoNeedsChange=false,autoChangeCount=0,autoStableSince=0,autoStableCount=0,
  autoEarliest=0,autoCapturePending=false,lastPhotoWasAuto=false;
 function selectReadingMode(mode){
  modeCamera?.setAttribute('aria-pressed',String(mode==='camera'));
  modePhoto?.setAttribute('aria-pressed',String(mode==='photo'));
  modeControl?.classList.toggle('is-rapid',mode==='photo');
 }
 const say=(message,error=false)=>{
  status.textContent=message;
  status.classList.toggle('is-error',error);
  // Le texte de statut était masqué par les styles : réutiliser le voyant
  // réellement visible pendant une analyse plutôt que laisser « Aucune pesée ».
  // L'unique « Analyse… » visible est déjà au centre du viseur fermé.
  if(active&&!latestLabelFields)setLabelAlert('idle','');
 };
 // Le flux reste réservé à la PWA pour une reprise instantanée,
 // mais la piste vidéo est réellement désactivée pendant chaque analyse.
 // Le viseur reprend l'état fermé de l'écran initial, sans photo figée.
 let analysisCameraClosed=false,restoreCameraAfterAnalysis=false;
 function setAnalysisCameraClosed(closed,{resume=true}={}){
  if(!cameraShell||!cameraStage)return;
  const title=cameraIdle?.querySelector('span');
  if(closed){
   if(analysisCameraClosed)return;
   analysisCameraClosed=true;
   const track=cameraStream?.getVideoTracks?.()[0];
   restoreCameraAfterAnalysis=Boolean(cameraStream&&
    cameraShell.dataset.state==='scanning'&&track?.readyState==='live');
   if(track?.readyState==='live')track.enabled=false;
   try{video.pause();}catch(_){}
   if(cameraStill){cameraStill.hidden=true;cameraStill.removeAttribute('src');}
   cameraStage.classList.remove('is-photo-frozen');
   if(frameState)frameState.hidden=true;
   if(title)title.textContent='Analyse…';
   if(cameraIdle){
    cameraIdle.disabled=true;
    cameraIdle.setAttribute('aria-label','Analyse en cours');
   }
   cameraShell.dataset.state='analyzing';
   return;
  }
  if(!analysisCameraClosed)return;
  analysisCameraClosed=false;
  const wasLive=restoreCameraAfterAnalysis;
  restoreCameraAfterAnalysis=false;
  if(title)title.textContent='Caméra désactivée';
  if(cameraIdle){
   cameraIdle.disabled=false;
   cameraIdle.setAttribute('aria-label','Activer la caméra, actuellement désactivée');
  }
  if(frameState)frameState.hidden=true;
  const track=cameraStream?.getVideoTracks?.()[0];
  const canResume=Boolean(resume&&wasLive&&track?.readyState==='live'&&
   !cameraShell.hidden&&!panel.hidden);
  if(!canResume){
   cameraShell.dataset.state='idle';
   // Safari peut terminer une piste quand elle est momentanément coupée.
   // Rouvrir dans ce cas seulement, sans affecter la fermeture volontaire.
   if(resume&&wasLive&&cameraStream&&track?.readyState!=='live'&&
      !document.hidden&&!panel.hidden){
    void startCamera();
   }
   return;
  }
  if(document.hidden){
   // Reprise différée au retour sur Safari : ne jamais réactiver une
   // caméra invisible en arrière-plan.
   cameraPausedInBackground=true;
   cameraShell.dataset.state='idle';
   return;
  }
  cameraShell.dataset.state='scanning';
  track.enabled=true;
  video.srcObject=cameraStream;
  Promise.resolve(video.play()).catch(()=>{
   if(!analysisCameraClosed&&cameraStream&&
      cameraShell.dataset.state==='scanning'){
    cameraShell.dataset.state='idle';
    say('Caméra interrompue par iOS · touche le viseur pour rouvrir.',true);
   }
  });
 }
 function clearReplacePrompt(){
  pendingReplacementFile=null;
  if(replacementPrompt)replacementPrompt.hidden=true;
 }
 function needsBasketChange(){
  if(!proposal)return false;
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  return !Number.isSafeInteger(ctx?.tareGrams)||ctx.tareGrams<0||
   ctx.tareGrams>=proposal.grams;
 }
 function setPrimaryAction(canSave){
  if(!nextWeigh)return;
  const duplicate=canSave&&duplicateForCurrent();
  const retry=Boolean(file&&(lastAnalysisError||lastReadProblem||
   (!proposal&&latestLabelFields)));
  const caption=active?'Analyse…':duplicate?'Confirmer doublon'
   :canSave?'Enregistrer'
   :needsBasketChange()?'Changer panier'
   :retry?'Réessayer':'Nouvelle photo';
  if(primaryText&&primaryText.textContent!==caption)primaryText.textContent=caption;
  nextWeigh.setAttribute('aria-label',duplicate?'Confirmer le doublon et enregistrer la pesée'
   :canSave?'Enregistrer la pesée sans nouvelle photo'
   :active?'Analyse en cours'
   :needsBasketChange()?'Changer de panier sans relire l’étiquette'
   :retry?'Relire la même photo':'Préparer une nouvelle photographie');
  nextWeigh.dataset.action=duplicate?'confirm-duplicate':canSave?'save'
   :active?'busy':needsBasketChange()?'basket':retry?'retry':'retake';
 }
 const formatWeight=g=>Number.isInteger(g)?(g/1000).toFixed(3).replace('.',',')+' kg':'Non reconnu';
 const money=c=>Number.isInteger(c)?(c/100).toFixed(2).replace('.',',')+' €':'Non reconnu';
 // Date civile locale affichée UNIQUEMENT sur la maquette d'étiquette.
 // Elle n'est ni déduite ni reconnue par Gemini, et n'est pas enregistrée
 // comme une date d'emballage prouvée de l'article réel.
 function todayForVirtualLabel(){
  const date=new Date();
  return [String(date.getDate()).padStart(2,'0'),
   String(date.getMonth()+1).padStart(2,'0'),
   String(date.getFullYear())].join('.');
 }
 // Le résultat reprend directement la carte de pesée classique.
 // Il reste visible sans étiquette ; la tare suit le panier en cours.
 // Uniquement le poids brut : les autres valeurs sont déjà sur l’étiquette.
 function refreshResultCard(){
  const gross=latestLabelFields?.weightGrams;
  const valid=Number.isSafeInteger(gross)&&gross>0;
  if(resultGross)resultGross.textContent=valid?(gross/1000).toFixed(3).replace('.',','):'—';
  emptyResult?.classList.toggle('has-reading',valid);
 }
 refreshResultCard();
 // Une lecture correcte ne doit pas être perdue par accident :
 // demander confirmation avant d'écraser une pesée enregistrable.
 // Mais la caméra doit rester accessible en cas de mauvaise tare,
 // lecture incorrecte ou analyse interminable (annulation explicite).
 // Seules les données vérifiées et recalculables sont enregistrables.
 // Contrairement à l'ancien flux, un doublon valide peut être confirmé.
 function correctedCurrentProposal(){
  if(!proposal||active)return null;
  const ctx=typeof window.IUWeighScanContext==='function'
   ?window.IUWeighScanContext():null;
  return ctx?recodeAfterTare(proposal.ean,proposal.grams,
   ctx.tareGrams,proposal.rate):null;
 }
 function hasSavableProposal(){return !!correctedCurrentProposal();}
 function refreshCaptureButton(){
  if(!capture)return;
  const locked=Boolean(frameCaptureBusy||(!active&&localOcrBusy));
  const ready=hasSavableProposal();
  const duplicated=ready&&duplicateForCurrent();
  capture.disabled=locked;
  capture.setAttribute('aria-disabled',String(locked));
  capture.dataset.action=duplicated?'confirm-duplicate'
   :ready?'save-and-scan':'scan';
  const description=active?'Annuler l’analyse et revenir au viseur'
   :duplicated?'Confirmer ce doublon et photographier la suivante'
   :ready?'Enregistrer cette pesée et photographier la suivante'
   :locked?'Préparation du scanner':'Photographier une étiquette';
  capture.title=description;
  capture.setAttribute('aria-label',description);
 }
 function updateButton(){
  // Une seule action visible, analyse déclenchée en interne après la photo.
  analyze.hidden=true;
  analyze.disabled=!file||!pilotKey.value.trim()||active;
  setPrimaryAction(false);
  refreshCaptureButton();
 }
 // Réutilisation exacte de l'indicateur OCR classique : une coche verte
 // apparaît dans le viseur lorsqu'une étiquette a été reconnue.
 function resetDetectedIndicator(){
  if(!detected)return;
  detected.hidden=true;
  detected.classList.remove('is-visible');
  detected.removeAttribute('title');
 }
 function revealDetectedIndicator(fields){
  if(!detected||cameraShell.hidden)return;
  const name=typeof fields?.name==='string'&&fields.name.trim()?fields.name.trim():'Étiquette';
  detected.title=name+' reconnu';
  detected.setAttribute('aria-label',name+' reconnu');
  detected.hidden=false;
  detected.classList.remove('is-visible');
  void detected.offsetWidth;
  detected.classList.add('is-visible');
 }
 function resetProposal(){
  proposal=null;
  if(nextWeigh){nextWeigh.disabled=active;nextWeigh.classList.remove('is-ready');}
  refreshCaptureButton();
 }
 function setLabelAlert(state,message){
  if(!labelAlert||!labelAlertText)return;
  const type=['idle','working','success','warning'].includes(state)?state:'warning';
  if(labelAlert.dataset.state!==type){
   labelAlert.dataset.state=type;
   labelAlert.classList.toggle('is-idle',type==='idle');
   labelAlert.classList.toggle('is-success',type==='success');
   labelAlert.classList.toggle('is-warning',type==='warning');
   labelAlert.classList.toggle('is-working',type==='working');
  }
  labelAlertText.textContent=message;
  labelAlert.hidden=type==='idle'&&!message;
  if(duplicateSkip)duplicateSkip.hidden=!(
   type==='warning'&&message.startsWith('Doublon détecté'));
 }
 function duplicateForCurrent(){
  if(!proposal||typeof window.IUGeminiDuplicateInfo!=='function')return false;
  try{return window.IUGeminiDuplicateInfo({
   ean13:proposal.ean,gross:proposal.grams,
   pricePerKgCents:proposal.rate,totalCents:proposal.total
  })?.duplicate===true;}catch(_){return false;}
 }
 function refreshLabelAlert(){
  if(active){setLabelAlert('idle','');return;}
  if(lastAnalysisError){setLabelAlert('warning',lastAnalysisError);return;}
  const raw=latestLabelFields?.weightGrams;
  if(!Number.isSafeInteger(raw)||raw<=0){
   if(lastReadProblem)setLabelAlert('warning','Lecture non validable · '+lastReadProblem);
   else if(latestLabelFields)setLabelAlert('warning','Poids non reconnu · relis cette photo');
   else setLabelAlert('idle','');
   return;
  }
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=ctx?.tareGrams;
  if(Number.isSafeInteger(tare)&&tare>=raw){
   setLabelAlert('warning','Tare trop élevée · change de panier');
   return;
  }
  if(!Number.isSafeInteger(tare)||tare<0){
   setLabelAlert('warning','Choisis un panier');
   return;
  }
  if(lastReadProblem){
   setLabelAlert('warning','Lecture non validable · '+lastReadProblem);
   return;
  }
  if(!proposal){
   setLabelAlert('warning','Lecture incomplète · réessaie');
   return;
  }
  if(duplicateForCurrent()){
   setLabelAlert('warning','Doublon détecté · confirme ou ignore');
   return;
  }
  setLabelAlert('success','étiquette prête');
 }
 function validateResult(result){
  const f=result?.fields||{},c=result?.checks||{};
  const grams=f.weightGrams,rate=f.pricePerKgCents,total=f.totalCents;
  const name=typeof f.name==='string'?f.name.trim():'';
  if(!name||name.length<3||name.length>120)return {error:'Article non reconnu avec certitude.'};
  if(!Number.isSafeInteger(grams)||grams<=0||grams>30000)return {error:'Poids lu sur l’étiquette manquant ou invalide.'};
  if(!Number.isSafeInteger(rate)||rate<=0||rate>1000000||
     !Number.isSafeInteger(total)||total<0)return {error:'Prix au kilo ou montant manquant.'};
  // Ne jamais faire confiance aux seuls booléens produits par l'IA :
  // recalculer localement les règles métier avant toute proposition.
  // Les arrondis de balance peuvent différer d'un centime. Cette
  // tolérance locale est aussi appliquée au Worker. Jamais de prix inventé.
  const arithmeticOk=Math.abs(Math.round(grams*rate/1000)-total)<=1;
  if(!arithmeticOk)return {error:'Calcul prix × poids incohérent.'};
  const ean=String(f.ean13||'');
  if(!/^[0-9]{13}$/.test(ean)||
     eanCheck(ean.slice(0,12))!==ean[12])
   return {error:'EAN non confirmé ou clé EAN incorrecte.'};
  if(c.independentMismatch===true)
   return {error:'Code-barres différent de la lecture indépendante.'};
  return {name,grams,rate,total,ean};
 }
 // Une lecture EAN13 purement optique n'est acceptée que si elle est
 // unique, confirmée et vérifiée par checksum. Toute contradiction bloque.
 function reconcileBarcode(result,reading){
  const fields={...(result?.fields||{})},checks={...(result?.checks||{})};
  const incoming=String(fields.ean13||'');
  const fromGemini=/^\d{13}$/.test(incoming)&&eanCheck(incoming.slice(0,12))===incoming[12];
  const opticalArea=reading?.source!=='optical'||(
   reading.bounds&&reading.bounds.y>=.52&&reading.bounds.y<=.94&&
   (reading.bounds.left+reading.bounds.right)/2<=.71&&
   Math.abs(reading.bounds.slope||0)<=.10);
  const external=reading?.confirmed&&reading?.ean13&&opticalArea&&
   eanCheck(reading.ean13.slice(0,12))===reading.ean13[12]
   ?reading.ean13:null;
  if(!fromGemini&&external)fields.ean13=external;
  checks.eanChecksumValid=Boolean(/^\d{13}$/.test(String(fields.ean13||''))&&
   eanCheck(String(fields.ean13).slice(0,12))===String(fields.ean13)[12]);
  if(reading?.ambiguous||(external&&fromGemini&&external!==incoming))
   checks.independentMismatch=true;
  return {...result,fields,checks,
   opticalEAN:external&&external===fields.ean13?reading.source:null};
 }
 function fieldsChecks(fields){
  const ean=String(fields?.ean13||'');
  const validEAN=/^\d{13}$/.test(ean)&&eanCheck(ean.slice(0,12))===ean[12];
  return {
   arithmeticConsistent:Number.isSafeInteger(fields?.weightGrams)&&
    Number.isSafeInteger(fields?.pricePerKgCents)&&Number.isSafeInteger(fields?.totalCents)&&
    Math.abs(Math.round(fields.weightGrams*fields.pricePerKgCents/1000)-fields.totalCents)<=1,
   eanChecksumValid:validEAN,
   independentMismatch:Boolean(localBarcode?.ambiguous||
    (localBarcode?.confirmed&&localBarcode.ean13&&
     validEAN&&localBarcode.ean13!==ean))
  };
 }
 function fieldForProblem(error){
  if(/EAN|code-barres|indépendante/i.test(error))return 'ean';
  if(/Poids/i.test(error))return 'weight';
  if(/Prix au kilo|montant manquant|Calcul prix/i.test(error))return 'rate';
  if(/Article/i.test(error))return 'name';
  return 'ean';
 }
 function refreshRepairPanel(){
  if(!repairPanel)return;
  const eligible=!active&&!!file&&!!lastRawResult&&!!lastReadProblem;
  repairPanel.hidden=!eligible;
  if(!eligible){
   if(repairManual)repairManual.hidden=true;
   return;
  }
  if(repairField&&!repairFocus)
   repairField.value=fieldForProblem(lastReadProblem);
 }
 function parseManualValue(key,value){
  const raw=String(value||'').trim();
  if(key==='name'){
   if(raw.length<3||raw.length>120)return null;
   return raw;
  }
  if(key==='ean'){
   const digits=raw.replace(/[\s-]/g,'');
   return /^\d{13}$/.test(digits)&&eanCheck(digits.slice(0,12))===digits[12]
    ?digits:null;
  }
  const text=raw.replace(',', '.');
  if(key==='weight'){
   if(!/^\d{1,2}\.\d{3}$/.test(text))return null;
   const g=Math.round(Number(text)*1000);
   return g>0&&g<=30000?g:null;
  }
  if(!/^\d{1,3}\.\d{2}$/.test(text))return null;
  const cents=Math.round(Number(text)*100);
  return cents>=0&&cents<=(key==='total'?99999:1000000)?cents:null;
 }
 const fieldKeys={name:'name',weight:'weightGrams',rate:'pricePerKgCents',
  total:'totalCents',ean:'ean13'};
 repairField?.addEventListener('change',()=>{
  repairFocus=null;
  if(repairManual)repairManual.hidden=true;
  if(repairValue)repairValue.value='';
 });
 repairEdit?.addEventListener('click',()=>{
  if(!lastRawResult||!repairManual)return;
  repairManual.hidden=false;
  if(repairValue){
   const key=fieldKeys[repairField?.value],val=latestLabelFields?.[key];
   repairValue.value=val===null||val===undefined?''
    :key==='ean13'||key==='name'?String(val)
    :key==='weightGrams'?(val/1000).toFixed(3):(val/100).toFixed(2);
   repairValue.focus();repairValue.select();
  }
 });
 repairApply?.addEventListener('click',()=>{
  if(!lastRawResult||!repairField||active)return;
  const kind=repairField.value,key=fieldKeys[kind];
  const value=parseManualValue(kind,repairValue?.value);
  if(value===null){setLabelAlert('warning','Valeur invalide · vérifie l’étiquette');return;}
  const fields={...lastRawResult.fields,[key]:value};
  const next={...lastRawResult,fields,checks:fieldsChecks(fields),
   source:'manual'};
  manualCorrectedFields=[...new Set([...manualCorrectedFields,kind])];
  repairFocus=null;
  display(next,0);
  const corrected=correctedCurrentProposal();
  const error=validateResult(next).error;
  setLabelAlert(corrected?'success':'warning',corrected
   ?'étiquette prête · valeur vérifiée'
   :error||'Valeur corrigée · vérifie la tare du panier');
 });
 repairRead?.addEventListener('click',()=>{
  if(!file||!lastRawResult||active)return;
  repairFocus=repairField?.value||fieldForProblem(lastReadProblem);
  if(repairManual)repairManual.hidden=true;
  if(!analyze.disabled)analyze.click();
 });
 function refreshCorrectedLabel(){
  refreshResultCard();
  if(!latestLabelFields)return;
  const fields=latestLabelFields;
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=ctx?.tareGrams,gross=fields.weightGrams;
  const corrected=recodeAfterTare(fields.ean13,gross,tare,fields.pricePerKgCents);
  const net=Number.isSafeInteger(gross)&&Number.isSafeInteger(tare)&&gross>tare?gross-tare:null;
  const label=output.querySelector('.iu-gemini-printed-label');
  if(!label)return;
  const weight=label.querySelector('.iu-gemini-label-gross .iu-gemini-label-number');
  const total=label.querySelector('.iu-gemini-label-total-number');
  const digits=label.querySelector('.iu-gemini-label-ean');
  const bars=label.querySelector('.iu-gemini-label-bars');
  const labelReady=Boolean(corrected&&proposal&&!lastReadProblem);
  label.classList.toggle('is-ready',labelReady);
  label.classList.toggle('is-review',!labelReady);
  if(weight)weight.textContent=labelReady?formatWeight(corrected.net):'—';
  const virtualDate=label.querySelector('.iu-gemini-label-date .iu-gemini-label-number');
  if(virtualDate)virtualDate.textContent=todayForVirtualLabel();
  if(total)total.textContent=labelReady?money(corrected.cents).replace(/\s/g,''):'—';
  if(digits)digits.textContent=labelReady?corrected.ean:'CODE EN ATTENTE';
  if(bars){
   if(labelReady)renderEanBars(bars,corrected.ean);
   else bars.replaceChildren();
  }
  // Les informations de vigilance figurent dans le voyant sous l’étiquette.
 }
 // Les contrôles sont refaits au moment du clic de validation.
 function validationState(){
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const corrected=proposal&&ctx
   ?recodeAfterTare(proposal.ean,proposal.grams,ctx.tareGrams,proposal.rate):null;
  const canSave=Boolean(corrected)&&!active;
  if(nextWeigh){
   // Comme « Nouvelle pesée » classique, le bouton reste disponible :
   // une anomalie non corrigée bloque seulement l’enregistrement.
   nextWeigh.disabled=active;
   nextWeigh.classList.toggle('is-ready',canSave);
  }
  setPrimaryAction(canSave);
  const signal=output.querySelector('.iu-gemini-result-signal');
  if(signal&&proposal){
   signal.textContent=corrected
    ?'Vérifie l’article, le brut et la tare avant de valider.'
    :'Validation impossible : vérifie le panier et sa tare.';
   signal.classList.toggle('is-ready',Boolean(corrected));
   signal.classList.toggle('is-warning',!corrected);
  }
  refreshCorrectedLabel();
  refreshLabelAlert();
  // Réutiliser la coche du viseur seulement lorsque tous les calculs
  // métier sont validés, la tare correcte et sans doublon signalé.
  const confirmed=canSave&&!duplicateForCurrent()&&!cameraShell.hidden;
  if(confirmed){
   if(detected?.hidden)revealDetectedIndicator(latestLabelFields);
  }else if(detected&&!detected.hidden){
   resetDetectedIndicator();
  }
  refreshCaptureButton();
  return canSave?corrected:null;
 }
 $('basketSelect')?.addEventListener('change',validationState);
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
 }
 function resetReading(){
  clearReplacePrompt();
  retakeConfirmUntil=0;lastReadProblem=null;lastAnalysisError=null;
  resetDetectedIndicator();
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  generation++;abort?.abort();abort=null;active=false;file=null;
  setAnalysisCameraClosed(false);
  lastRawResult=null;localBarcode=null;barcodeJob=null;repairFocus=null;manualCorrectedFields=[];
  if(repairPanel)repairPanel.hidden=true;
  if(repairManual)repairManual.hidden=true;
  attempts.clear();photo.value='';latestLabelFields=null;
  showBlankLabel();networkTime.textContent='';resetProposal();
  if(grossPreview)grossPreview.value='';
  if(emptyResult)emptyResult.hidden=false;
  refreshResultCard();
  clearPreview();updateButton();
  updateCardState('search');
  refreshLabelAlert();
  say('');
 }
 function clear(){stopCamera();resetReading();}
 function setPhoto(chosen,{confirmed=false}={}){
  if(!chosen)return false;
  if(!chosen.type.startsWith('image/')||chosen.size>15*1024*1024){
   say('Choisis une image de moins de 15 Mo.',true);return false;
  }
  // Importation : confirmation DANS l'app et sans dialogue iOS bloquant.
  if(hasSavableProposal()&&!confirmed){
   pendingReplacementFile=chosen;
   if(replacementPrompt)replacementPrompt.hidden=false;
   setLabelAlert('warning','Pesée prête · enregistrer ou remplacer cette photo');
   say('Cette pesée est prête. Choisis Conserver ou Remplacer.');
   return false;
  }
  if(active)resetReading();
  clearReplacePrompt();
  retakeConfirmUntil=0;lastReadProblem=null;lastAnalysisError=null;
  resetDetectedIndicator();
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  latestLabelFields=null;lastRawResult=null;localBarcode=null;barcodeJob=null;
  repairFocus=null;manualCorrectedFields=[];
  if(repairPanel)repairPanel.hidden=true;
  if(repairManual)repairManual.hidden=true;
  analyze.textContent='Analyser l’étiquette';
  clearPreview();file=chosen;attempts.clear();generation++;
  // Lire l'EAN en local en parallèle du réseau, sans envoi ni bibliothèque.
  barcodeJob=Promise.resolve().then(()=>
   window.IUGeminiEAN?.read(chosen)||null).catch(()=>null);
  url=URL.createObjectURL(chosen);
  // Afficher immédiatement l'étiquette virtuelle vierge pendant le chargement.
  showBlankLabel();networkTime.textContent='';resetProposal();
  if(emptyResult)emptyResult.hidden=false;
  if(grossPreview)grossPreview.value='';
  refreshResultCard();
  refreshLabelAlert();
  updateCardState('working');
  updateButton();
  if(!analyze.disabled){
   // Une seule analyse par capture/import. Enregistrement toujours manuel.
   analyze.click();
  }else if(!pilotKey.value.trim()){
   setLabelAlert('warning','Configure la clé Gemini');
   say('Configure la clé Gemini pour analyser la photo.',true);
  }else{
   say('Photo prête, analyse indisponible pour le moment.',true);
  }
  return true;
 }
 replaceKeep?.addEventListener('click',()=>{
  clearReplacePrompt();refreshLabelAlert();say('Pesée conservée.');
 });
 replaceProceed?.addEventListener('click',()=>{
  const next=pendingReplacementFile;
  clearReplacePrompt();
  if(next)setPhoto(next,{confirmed:true});
 });
 photo.addEventListener('change',()=>{
  selectReadingMode('photo');
  const selected=photo.files?.[0]||null;
  photo.value='';
  if(selected){
   autoSuspended=true;autoLocked=true;lastPhotoWasAuto=false;
   setAutoHint('Photo importée · lecture Gemini','waiting');
   setPhoto(selected);
  }else if(cameraStream&&cameraMode==='auto'&&!file&&!proposal&&!active){
   autoSuspended=false;armAutoScanner(false);
  }
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
  if(setupCallout)setupCallout.hidden=Boolean(pilotKey.value.trim());
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
 setupCallout?.addEventListener('click',()=>{
  if(!geminiOptions)return;
  // La clé reste configurable dans la carte Gemini.
  geminiOptions.open=true;
  geminiOptions.scrollIntoView({block:'nearest',behavior:'smooth'});
  pilotKey.focus({preventScroll:true});
 });
 // Le panier Gemini réutilise la sélection et les règles de tare de la pesée classique.
 const classicBasket=$('basketSelect'),geminiBasket=$('iuGeminiBasketSelect'),
  geminiName=$('iuGeminiBasketName'),geminiTare=$('iuGeminiBasketTare');
 // Le <select> natif reste au premier plan pour le sélecteur Safari.
 // Seule la légende visible superposée présente le nom et la tare sur
 // deux lignes à l'intérieur de son cadre, sans changer les calculs.
 function updateGeminiBasketTare(){
  const selected=geminiBasket?.selectedOptions?.[0];
  const fullText=String(selected?.textContent||'Choisir un panier').trim();
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  // Garder la tare dans chaque option native comme dans le panier
  // classique ; l'affichage fermé reste sur deux lignes, sans doublon.
  const name=String(ctx?.basketName||
   fullText.replace(/\s+[—–-]\s+\d+(?:[.,]\d+)?\s*kg\s*$/i,'')).trim();
  const grams=ctx?.tareGrams;
  const tare=Number.isSafeInteger(grams)&&grams>=0
   ?'Tare : '+formatWeight(grams):'Tare non définie';
  if(geminiName)geminiName.textContent=name;
  if(geminiTare)geminiTare.textContent=tare;
  if(geminiBasket)geminiBasket.setAttribute('aria-label','Type de panier : '+name+'. '+tare);
 }
 function syncGeminiBasket(){
  if(!classicBasket||!geminiBasket)return;
  // Les options (nom — 0,xxx kg) sont reprises à l'identique
  // du sélecteur de la pesée classique, y compris le menu iOS.
  const options=Array.from(classicBasket.options,option=>option.cloneNode(true));
  geminiBasket.replaceChildren(...options);
  geminiBasket.value=classicBasket.value;
  updateGeminiBasketTare();
 }
 if(classicBasket&&geminiBasket){
  syncGeminiBasket();
  classicBasket.addEventListener('change',()=>{syncGeminiBasket();validationState();});
  geminiBasket.addEventListener('change',()=>{
   classicBasket.value=geminiBasket.value;
   classicBasket.dispatchEvent(new Event('change',{bubbles:true}));
   updateGeminiBasketTare();
  });
  new MutationObserver(()=>{syncGeminiBasket();validationState();}).observe(classicBasket,{childList:true,subtree:true});
 }
 if(toggle)toggle.addEventListener('click',()=>{
  const opening=panel.hidden;
  panel.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));
  if(!opening)clear();
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
  // Le JPEG issu du viseur est déjà recadré, redimensionné et compressé.
  // Éviter une deuxième décompression/compression si l'image passe sous
  // la limite Cloudflare (surtout sur Safari iPhone).
  if(source?.name==='etiquette-gemini.jpg'&&source.type==='image/jpeg'&&
     source.size>=100&&source.size<=490000){
   try{
    const encoded=await new Promise((resolve,reject)=>{
     const reader=new FileReader();
     reader.onerror=()=>reject(Error('Lecture JPEG indisponible'));
     reader.onload=()=>{
      const str=String(reader.result||''),index=str.indexOf(',');
      if(index<0)return reject(Error('Format JPEG invalide'));
      resolve(str.slice(index+1));
     };
     reader.readAsDataURL(source);
    });
    if(encoded.length>=100&&encoded.length<=690000)return encoded;
   }catch(_){/* Safari peut nécessiter le chemin canvas habituel. */}
  }
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
 // Encodage DIGI expérimental vérifié sur 8 étiquettes :
 // 7 chiffres article + 5 chiffres prix (euros × 655,36) + clé EAN-13.
 // Ce code n'est jamais transféré ni présenté comme validé sur Zebra.
 function eanCheck(first12){
  if(!/^\d{12}$/.test(first12))return null;
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(first12[i])*(i%2===0?1:3);
  return String((10-sum%10)%10);
 }
 function recodeAfterTare(ean,gross,tare,rate){
  if(!/^\d{13}$/.test(ean||'')||eanCheck(ean.slice(0,12))!==ean[12]||
     !Number.isSafeInteger(gross)||!Number.isSafeInteger(tare)||
     !Number.isSafeInteger(rate)||tare<0||rate<=0||gross<=tare)return null;
  const net=gross-tare;
  // Montant de vente arrondi au centime, puis encodage de ce montant.
  const cents=Math.round(net*rate/1000);
  const encoded=Math.round(cents*655.36/100);
  if(!Number.isSafeInteger(encoded)||encoded<0||encoded>99999)return null;
  const first12=ean.slice(0,7)+String(encoded).padStart(5,'0');
  return {ean:first12+eanCheck(first12),net,cents,encoded};
 }
 // Barres EAN-13 exactes, SVG local sans bibliothèque ni réseau.
 function renderEanBars(container,ean){
  container.replaceChildren();
  if(!/^\d{13}$/.test(ean||'')||eanCheck(ean.slice(0,12))!==ean[12])return;
  const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R=['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
  let bits='101';
  for(let i=1;i<=6;i++){const d=Number(ean[i]);bits+=parity[Number(ean[0])][i-1]==='L'?L[d]:G[d];}
  bits+='01010';
  for(let i=7;i<13;i++)bits+=R[Number(ean[i])];
  bits+='101';
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 150 58');
  svg.setAttribute('preserveAspectRatio','xMidYMax meet');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','EAN 13 '+ean[0]+' '+ean.slice(1,7)+' '+ean.slice(7));
  svg.classList.add('iu-gemini-ean-svg');
  // La vraie étiquette comporte une barre noire continue au-dessus du code.
  // Elle commence et termine au droit des 95 modules de l'EAN.
  const topLine=document.createElementNS(ns,'line');
  topLine.setAttribute('x1','15');
  topLine.setAttribute('y1','-0.3');
  topLine.setAttribute('x2',String(15+95*1.38));
  topLine.setAttribute('y2','-0.3');
  topLine.setAttribute('stroke','#111');
  topLine.setAttribute('stroke-width','1.9');
  svg.append(topLine);
  for(let i=0;i<bits.length;i++){
   if(bits[i]!=='1')continue;
   const rect=document.createElementNS(ns,'rect');
   rect.setAttribute('x',String(15+i*1.38));rect.setAttribute('y','2');
   rect.setAttribute('width','1.38');rect.setAttribute('height',(i<3||i>=92||i>=45&&i<50)?'52':'44');
   rect.setAttribute('fill','#111');svg.append(rect);
  }
  // Chiffres imprimés comme sur une étiquette Super U : 0 203476 013844.
  const addDigit=(digit,x,y,cls)=>{
   const text=document.createElementNS(ns,'text');
   text.setAttribute('x',String(x));text.setAttribute('y',String(y));
   text.setAttribute('fill','#111');text.setAttribute('text-anchor','middle');
   text.setAttribute('font-family','Oswald, Arial Narrow, sans-serif');
   text.setAttribute('font-size','10.5');text.setAttribute('font-weight','500');
   text.setAttribute('class',cls);
   text.textContent=digit;svg.append(text);
   return text;
  };
  addDigit(ean[0],10,58,'iu-gemini-ean-leading');
  for(let i=0;i<6;i++){
   addDigit(ean[i+1],15+(3+7*i+3.5)*1.38,58,'iu-gemini-ean-digit');
   addDigit(ean[i+7],15+(50+7*i+3.5)*1.38,58,'iu-gemini-ean-digit');
  }
  // Le code 0203476... de la photo porte le PLU 3476 sur le bord gauche.
  if(ean.startsWith('020')){
   const plu=addDigit(ean.slice(3,7),0,0,'iu-gemini-ean-plu');
   plu.setAttribute('text-anchor','middle');
   plu.setAttribute('dominant-baseline','middle');
   plu.setAttribute('font-size','12');
   plu.setAttribute('font-weight','700');
   // Centre du PLU calé sur la hauteur des vraies barres noires.
   plu.setAttribute('transform','translate(5.6 28) rotate(90)');
  }
  container.replaceChildren(svg);
 }
 function display(result,wallMs){
  output.replaceChildren();
  const fields=result?.fields||{},checks=result?.checks||{};
  latestLabelFields=fields;lastRawResult=result;
  const verified=validateResult(result);
  const context=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=context?.tareGrams;
  const gross=fields.weightGrams;
  if(grossPreview)grossPreview.value=Number.isSafeInteger(gross)?(gross/1000).toFixed(3):'';
  const net=Number.isSafeInteger(gross)&&Number.isSafeInteger(tare)?gross-tare:null;
  const arithmetic=checks.arithmeticConsistent===true;
  const eanValid=checks.eanChecksumValid===true;
  const netValid=Number.isSafeInteger(net)&&net>0;
  const corrected=!verified.error&&netValid
   ?recodeAfterTare(fields.ean13,gross,tare,fields.pricePerKgCents):null;
  const ready=Boolean(corrected);
  const label=document.createElement('article');
  label.className='iu-gemini-printed-label'+(ready?' is-ready':' is-review');
  label.setAttribute('aria-label','Étiquette virtuelle reconstituée, à comparer à la photo avant validation');
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
  add(grossBox,'strong','iu-gemini-label-number',ready?formatWeight(corrected.net):'—');
  const dateBox=add(middle,'div','iu-gemini-label-date','');
  add(dateBox,'span','iu-gemini-label-caption',"Date d’emballage");
  // Affichage local seulement : une date du jour, pas une donnée reconnue.
  const dateValue=add(dateBox,'strong','iu-gemini-label-number',todayForVirtualLabel());
  dateValue.title='Date du jour — non reconnue sur la photo';
  dateValue.setAttribute('aria-label','Date du jour, ajoutée automatiquement : '+dateValue.textContent);
    const bottom=add(label,'div','iu-gemini-label-bottom','');
  const barcode=add(bottom,'div','iu-gemini-label-barcode','');
  const bars=add(barcode,'div','iu-gemini-label-bars','');
  bars.setAttribute('aria-hidden','true');
  if(ready)renderEanBars(bars,corrected.ean);
  add(barcode,'span','iu-gemini-label-ean',ready?corrected.ean:'CODE EN ATTENTE');
  const total=add(bottom,'div','iu-gemini-label-total','');
  add(total,'span','iu-gemini-label-total-caption','PRIX A PAYER');
  add(total,'strong','iu-gemini-label-total-number',ready?money(corrected.cents).replace(/\s/g,''):'—');
  // La ligne de contrôle conserve seulement le brut de l’étiquette.
  refreshResultCard();
  const frame=add(output,'div','iu-gemini-label-frame','');
  frame.setAttribute('role','group');
  frame.setAttribute('aria-label','Aperçu réduit de l’étiquette virtuelle');
  frame.append(label);
  output.hidden=false;
  if(emptyResult)emptyResult.hidden=false;
  // Les données reconnues restent disponibles si le panier est incorrect :
  // choisir un autre panier recalcule le net sans refaire la lecture.
  proposal=verified.error?null:verified;
  lastReadProblem=verified.error||null;
  lastAnalysisError=null;
  // La coche verte est réservée à une pesée réellement validable,
  // et non à une simple lecture visuelle encore incohérente.
  resetDetectedIndicator();
  updateCardState(ready?'review':'retry');
  if(!proposal)resetProposal();
  validationState();refreshRepairPanel();
  if(result?.source==='local'){
   networkTime.textContent='OCR local · 2 lectures concordantes · aucune image envoyée'
    +' · '+(wallMs/1000).toFixed(2)+' s';
  }else{
   networkTime.textContent='Gemini de secours : '+(Number(result.elapsedMs)/1000).toFixed(2)+' s'
    +' · photo + réseau : '+(wallMs/1000).toFixed(2)+' s'
    +' · modèle '+String(result.model||fixedModel);
  }
 }
 // v42.06 — réessais limités pour indisponibilités TRANSITOIRES seulement.
 // La même photo est utilisée, jamais de nouvelle prise de vue automatique.
 // Un refus d’accès / une clé erronée n'est jamais renvoyé au fournisseur.
 function waitGeminiBackoff(milliseconds,signal){
  return new Promise((resolve,reject)=>{
   if(signal.aborted)return reject(new DOMException('Analyse annulée','AbortError'));
   const onAbort=()=>{
    clearTimeout(timer);
    signal.removeEventListener('abort',onAbort);
    reject(new DOMException('Analyse annulée','AbortError'));
   };
   const timer=setTimeout(()=>{
    signal.removeEventListener('abort',onAbort);
    resolve();
   },milliseconds);
   signal.addEventListener('abort',onAbort,{once:true});
  });
 }
 function retryDelay(response,attempt){
  // Plafond court pour ne pas bloquer l’inventaire après une saturation.
  const seconds=Number(response?.headers?.get('Retry-After'));
  if(Number.isFinite(seconds)&&seconds>0)return Math.min(8000,Math.max(1000,Math.ceil(seconds*1000)));
  return attempt===1?1100:2600;
 }
 async function requestGeminiWithRecovery(encoded,access,selectedModel,signal,id,focusField=null){
  const body=JSON.stringify({type:'iu-gemini-label-test',model:selectedModel,
   mimeType:'image/jpeg',imageBase64:encoded,
   ...(focusField?{focusField}:{})});
  // Une seule requête par pression : HTTP 502 peut cacher un échec de
  // lecture et ne doit jamais provoquer une deuxième analyse automatique.
  if(signal.aborted||id!==generation)
   throw new DOMException('Analyse annulée','AbortError');
  let response;
  try{
   response=await fetch(endpoint,{
    method:'POST',signal,
    headers:{'Content-Type':'application/json','X-IU-Pilot-Key':access},
    body
   });
  }catch(error){
   if(signal.aborted||id!==generation||error?.name==='AbortError')throw error;
   throw Error('Connexion interrompue · réessaie cette photo');
  }
  if(signal.aborted||id!==generation)
   throw new DOMException('Analyse annulée','AbortError');
  let result;
  try{result=await response.json()}
  catch(_){throw Error('Réponse illisible du service · réessaie cette photo');}
  if(response.ok)return result;
  const status=response.status,providerStatus=Number(result?.providerStatus);
  const diagnostic=String(result?.error||'');
  const unreadable=status===422||
   /Réponse Gemini non exploitable|Réponse Gemini incomplète|Réponse Gemini vide|limite de génération|JSON non reconnu/i.test(diagnostic);
  if(unreadable)throw Error('Étiquette non lue · réessaie cette photo');
  if([401,403].includes(status)||[401,403].includes(providerStatus))
   throw Error('Accès Gemini refusé · vérifie la clé');
  if(status===429||providerStatus===429)
   throw Error('Quota Gemini atteint · réessaie plus tard');
  if(status===400||status===413)
   throw Error('Photo non acceptée · reprends une photo');
  if(status===404||providerStatus===404)
   throw Error('Modèle Gemini indisponible');
  throw Error('Service IA indisponible · réessaie cette photo');
 }
 analyze.addEventListener('click',async()=>{
  if(analyze.disabled||!file)return;
  const selectedModel=fixedModel,access=pilotKey.value.trim();
  const targetField=repairFocus&&lastRawResult?repairFocus:null;
  const oldResult=targetField?lastRawResult:null;
  attempts.add(selectedModel);active=true;lastReadProblem=null;lastAnalysisError=null;
  resetDetectedIndicator();updateButton();setAnalysisCameraClosed(true);
   // Nouvelle lecture verrouillée jusqu'à validation ou erreur de reconnaissance.
  // Laisser l'étiquette vierge affichée jusqu'au remplacement par le résultat.
  output.hidden=false;networkTime.textContent='';resetProposal();
  updateCardState('working');
  if(cameraStream&&cameraMode==='auto')setAutoHint('Analyse en cours · une seule photo envoyée','capturing');
  const id=++generation;
  abort=new AbortController();
  const start=performance.now();
  say('Préparation puis envoi d’une seule photo à Gemini…');
  try{
   // La lecture indépendante est déclenchée UNE fois par photo.
   // Seuls les codes confirmés et leur géométrie sûre peuvent influencer
   // le cadrage. Une photo ambiguë est transmise sans découpe.
   const job=barcodeJob||Promise.resolve().then(()=>
    window.IUGeminiEAN?.read(file)||null).catch(()=>null);
   barcodeJob=job;
   const readFast=await Promise.race([job,
    new Promise(resolve=>setTimeout(()=>resolve(null),250))]);
   if(id!==generation)return;
   if(readFast)localBarcode=readFast;
   let photoForGemini=file;
   // Sur une RELECTURE ciblée, garder le cliché intact pour ne pas
   // réappliquer un recadrage qui aurait pu perdre des caractères.
   if(!targetField&&readFast?.confirmed&&!readFast.ambiguous&&
      typeof window.IUGeminiEAN?.cropIfSafe==='function'){
    const cropped=await window.IUGeminiEAN.cropIfSafe(file,readFast);
    if(id!==generation)return;
    if(cropped)photoForGemini=cropped;
   }
   const encoded=await imageBase64(photoForGemini);
   if(id!==generation)return;
   say('Gemini analyse l’étiquette…');
   // Une seule demande réseau. La relecture ciblée est VOLONTAIRE.
   const received=await requestGeminiWithRecovery(
    encoded,access,selectedModel,abort.signal,id,targetField);
   if(id!==generation)return;
   // Attendre brièvement la lecture locale après Gemini ; jamais de long
   // délai imposé si le décodeur Safari n'a pas trouvé l'EAN.
   if(!localBarcode){
    const independent=await Promise.race([job,
     new Promise(resolve=>setTimeout(()=>resolve(null),350))]);
    if(id!==generation)return;
    if(independent)localBarcode=independent;
   }
   let combined=received;
   if(targetField&&oldResult){
    const key=fieldKeys[targetField];
    const value=received?.fields?.[key];
    if(value!==null&&value!==undefined&&value!==''){
     combined={...oldResult,fields:{...oldResult.fields,[key]:value},
      source:'gemini-focused',focusField:targetField};
    }else{
     combined={...oldResult,
      source:'gemini-focused',focusField:targetField};
    }
   }
   // Le code optique supplée un EAN incomplet ; s'il contredit Gemini,
   // l'étiquette reste à vérifier et NE PEUT PAS être enregistrée.
   const validated=reconcileBarcode(combined,localBarcode);
   const priorMismatch=validated.checks?.independentMismatch===true;
   const localChecks=fieldsChecks(validated.fields);
   validated.checks={...validated.checks,...localChecks,
    independentMismatch:priorMismatch||localChecks.independentMismatch};
   repairFocus=null;
   display(validated,performance.now()-start);
   // La validation reste MANUELLE ; en auto, placer le bouton à portée de doigt.
   // L'utilisateur reste au même endroit, sans défilement forcé.
   // L'analyse prépare un brouillon uniquement : aucun enregistrement implicite.
   const saveReady=Boolean(validationState());
   say(saveReady?'Étiquette prête':('Lecture à vérifier · '+(lastReadProblem||'change de panier si nécessaire')),!saveReady);

  }catch(error){
   if(id===generation&&error?.name!=='AbortError'){
    // Une erreur technique ne doit pas condamner la photo déjà prise :
    // sa relance reste manuelle après épuisement des réessais bornés.
    attempts.delete(selectedModel);
    if(!proposal&&!output.querySelector('.iu-gemini-printed-label'))showBlankLabel();
    const reason=String(error?.message||'Échec réseau').slice(0,140);
    lastAnalysisError=reason;
    repairFocus=null;
    if(oldResult)display(reconcileBarcode(oldResult,localBarcode),performance.now()-start);
    say(lastAnalysisError,true);
    updateCardState('error');
   }
  }finally{
   if(id===generation){
    active=false;abort=null;setAnalysisCameraClosed(false);
    updateButton();validationState();refreshRepairPanel();
    if(cameraStream&&cameraMode==='auto'){
     setAutoHint(proposal?'Lecture prête · vérifie puis valide'
      :'Lecture à reprendre · recadre et relance','waiting');
    }
   }
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
  // Fermeture volontaire : ne surtout pas réactiver la piste vidéo.
  setAnalysisCameraClosed(false,{resume:false});
  resetDetectedIndicator();
  cameraPausedInBackground=false;
  clearAutoTimer();clearAutoStability();
  autoLocked=false;autoSuspended=false;autoNeedsChange=false;
  autoCapturePending=false;autoLastCaptured=null;autoChangeReference=null;
  cameraEpoch++;
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  releaseLocalOcr();
  if(cameraStream){
   for(const track of cameraStream.getTracks())track.stop();
   cameraStream=null;
  }
  try{video.pause();}catch(_){}
  video.srcObject=null;
  cameraStarting=false;torchBusy=false;torchOn=false;
  cameraShell.dataset.state='idle';
  cameraShell.hidden=false; // viseur visible à vide, sans appeler getUserMedia
  openCamera.hidden=true; // ouverture par le bouton scanner ou par le viseur vide
  openCamera.disabled=false;
  shortcut?.setAttribute('aria-pressed','false');
  shortcut?.setAttribute('aria-expanded','true');
  refreshTorch();
 }
 // Comme le scanner OCR classique, demander la mise au point continue
 // uniquement lorsqu'elle est officiellement prise en charge par le capteur.
 // Un échec de contrainte ne doit jamais interrompre la caméra.
 function requestContinuousFocus(source){
  try{
   const track=source?.getVideoTracks?.()[0];
   if(!track?.getCapabilities||!track.applyConstraints)return;
   const caps=track.getCapabilities();
   if(!Array.isArray(caps?.focusMode)||!caps.focusMode.includes('continuous'))return;
   void track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
  }catch(_){}
 }
 async function startCamera(){
  if(cameraStarting||active)return;
  // Réutiliser la même piste déjà autorisée : pas de nouvel appel
  // getUserMedia tant que la caméra fonctionne dans cette session.
  if(cameraStream){
   const track=cameraStream.getVideoTracks?.()[0];
   if(track?.readyState==='live'){
    if(document.hidden)return;
    cameraPausedInBackground=false;
    track.enabled=true;
    video.srcObject=cameraStream;
    cameraShell.hidden=false;
    cameraShell.dataset.state='scanning';
    shortcut?.setAttribute('aria-pressed','true');
    shortcut?.setAttribute('aria-expanded','true');
    shortcut?.setAttribute('aria-label','Afficher le viseur Gemini');
    try{await video.play()}catch(_){
     say('Vidéo suspendue par iOS. Réessaie de toucher le viseur.',true);
    }
    if(cameraMode==='auto'&&!autoSuspended&&!active&&!file&&!proposal){
     void ensureLocalOcr();
     startAutoMonitor();
    }
    return;
   }
   // iOS peut terminer une piste après verrouillage. Dans ce cas
   // l'app ne relance pas automatiquement une demande d'autorisation.
   stopCamera();
  }
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
   cameraPausedInBackground=false;
   requestContinuousFocus(obtained);
   const liveTrack=obtained.getVideoTracks?.()[0];
   liveTrack?.addEventListener('ended',()=>{
    if(cameraStream!==obtained||cameraShell.hidden||document.hidden)return;
    clearAutoTimer();
    autoLocked=true;
    setAutoHint('Caméra interrompue · touche Scanner pour reprendre','error');
    say('La caméra a été interrompue. Touche Scanner pour la rouvrir.',true);
   },{once:true});
   video.srcObject=obtained;
   cameraShell.hidden=false;cameraShell.dataset.state='scanning';openCamera.hidden=true;
   shortcut?.setAttribute('aria-pressed','true');
   shortcut?.setAttribute('aria-expanded','true');
   shortcut?.setAttribute('aria-label','Afficher le viseur Gemini');
   await video.play();
   if(epoch!==cameraEpoch||panel.hidden)return;
   refreshTorch();
   if(cameraMode==='auto'&&!file&&!proposal&&!active)armAutoScanner(false);
   else setAutoHint('Valide ou reprends la lecture en cours','waiting');
   say(cameraMode==='auto'
    ?'Scanner auto prêt : tiens une seule étiquette nette et stable dans le cadre.'
    :'Mode manuel : capture l’étiquette quand elle est nette.');
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
 modeCamera?.addEventListener('click',()=>{
  selectReadingMode('camera');
  if(cameraStream?.getVideoTracks?.()[0]?.readyState==='live'&&
     cameraMode==='auto'&&autoSuspended&&!file&&!active&&!proposal)armAutoScanner(false);
  startCamera();
 });
 modePhoto?.addEventListener('click',()=>{
  selectReadingMode('photo');
  autoSuspended=true;
  photo.click();
 });
 shortcut?.addEventListener('click',()=>{
  selectReadingMode('camera');
  // Ce raccourci doit toujours AFFICHER le viseur. Une seconde pression
  // ne ferme plus la piste et ne provoque plus un nouveau prompt iOS.
  startCamera();
 });
 // Réutiliser le même point d'enregistrement pour les deux gestes :
 // Enregistrer en dernier, ou Enregistrer + photographier via le viseur.
 function importedPhotoIdentity(chosen){
  return chosen&&chosen.name!=='etiquette-gemini.jpg'
   ?[chosen.name,chosen.size,chosen.lastModified,chosen.type].join('|'):null;
 }
 function saveVerifiedProposal({confirmDuplicate=false,fromCapture=false}={}){
  if(active||(!fromCapture&&frameCaptureBusy))
   return {ok:false,reason:'Une capture est déjà en cours'};
  const corrected=correctedCurrentProposal();
  if(!corrected)return {ok:false,reason:'Corrige le panier ou la lecture'};
  if(typeof window.IUGeminiSaveWeigh!=='function')
   return {ok:false,reason:'Enregistrement indisponible'};
  const identity=importedPhotoIdentity(file);
  if(identity&&identity===lastSavedImportedPhoto)
   return {ok:false,reason:'Cette photo importée a déjà été enregistrée'};
  const duplicate=duplicateForCurrent();
  if(duplicate&&!confirmDuplicate)
   return {ok:false,duplicate:true,reason:'Doublon à confirmer'};
  let saved;
  try{
   saved=window.IUGeminiSaveWeigh({
    gross:proposal.grams,product:proposal.name,ean13:proposal.ean,
    pricePerKgCents:proposal.rate,totalCents:proposal.total,
    correctedEan13:corrected.ean,correctedTotalCents:corrected.cents,
    confirmDuplicate:duplicate&&confirmDuplicate,
    manualCorrectedFields
   });
  }catch(_){return {ok:false,reason:'Stockage indisponible'};}
  if(saved?.ok&&identity)lastSavedImportedPhoto=identity;
  return saved?.ok?saved:{ok:false,duplicate:!!saved?.duplicate,
   reason:String(saved?.reason||'Enregistrement impossible')};
 }
 function announceSaveError(saved){
  const msg=String(saved?.reason||'Enregistrement impossible');
  setLabelAlert('warning',msg);
  say('Pesée non enregistrée · '+msg,true);
 }
 duplicateSkip?.addEventListener('click',()=>{
  // Ignorer une lecture identique sans modifier la session ni l'historique.
  if(!duplicateForCurrent())return;
  resetReading();
  say('Doublon ignoré · photographie l’étiquette suivante.');
 });
 nextWeigh?.addEventListener('click',()=>{
  if(active||frameCaptureBusy)return;
  const corrected=validationState();
  if(!corrected){
   if(needsBasketChange()){
    setLabelAlert('warning','Tare trop élevée · change de panier');
    if(geminiBasket){
     geminiBasket.focus();
     try{geminiBasket.showPicker?.();}catch(_){}
    }
    return;
   }
   if(file&&(lastReadProblem||lastAnalysisError||(!proposal&&latestLabelFields))){
    if(!analyze.disabled)analyze.click();
    else setLabelAlert('warning','Configure la clé Gemini');
    return;
   }
   resetReading();
   if(!cameraStream)void startCamera();
   else if(cameraMode==='auto')armAutoScanner(false);
   else capture?.focus();
   return;
  }
  // Sur un doublon, le bouton porte explicitement « Confirmer doublon ».
  const saved=saveVerifiedProposal({confirmDuplicate:duplicateForCurrent()});
  if(!saved?.ok){announceSaveError(saved);return;}
  resetReading();
  if(cameraStream&&cameraMode==='auto')armAutoScanner(true);
  setLabelAlert('success',saved.duplicate?'Doublon confirmé':'Pesée enregistrée');
  say(saved.duplicate?'Doublon confirmé · prêt pour la suite.'
   :'Pesée enregistrée · prêt pour la suite.');
 });
 openCamera.addEventListener('click',startCamera);
 cameraIdle?.addEventListener('click',startCamera);
 closeCamera.addEventListener('click',()=>{
  stopCamera();
  say('Viseur fermé. Aucune photo envoyée.');
 });
 torch.addEventListener('click',()=>setTorch(!torchOn));
 // Reprendre le cadrage visible en direct, puis réduire les marges latérales.
 // Les étiquettes voisines ne doivent pas être envoyées si possible.
 function cameraCaptureCrop(srcW,srcH,viewW,viewH){
  if(!Number.isFinite(srcW)||!Number.isFinite(srcH)||srcW<=0||srcH<=0)
   throw Error('Dimensions de caméra indisponibles');
  let x=0,y=0,width=srcW,height=srcH;
  const ratio=Number.isFinite(viewW)&&Number.isFinite(viewH)&&viewW>0&&viewH>0
   ?viewW/viewH:srcW/srcH;
  if(width/height>ratio){width=height*ratio;x=(srcW-width)/2;}
  else{height=width/ratio;y=(srcH-height)/2;}
  // Préserver une marge pour le PLU vertical et les gardes EAN.
  const focused=width*.88;
  x+=(width-focused)/2;
  width=focused;
  return {x,y,width,height};
 }


 // Lecture vidéo locale : reconnaissance du TEXTE au fil des images canvas.
 // Tesseract se télécharge à la première utilisation (même moteur que l'OCR
 // classique). L'image ne sort de l'appareil qu'en cas de secours Gemini.
 function loadTesseract(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  return new Promise((resolve,reject)=>{
   let done=false,tag=Array.from(document.scripts).find(x=>
    String(x.src||'').includes('tesseract.js@5.1.1/dist/tesseract.min.js'));
   const finish=(error)=>{
    if(done)return;done=true;clearTimeout(timer);
    tag?.removeEventListener('load',check);
    tag?.removeEventListener('error',failed);
    if(error||!window.Tesseract?.createWorker)reject(error||Error('OCR indisponible'));
    else resolve(window.Tesseract);
   };
   const check=()=>finish();
   const failed=()=>finish(Error('Moteur OCR non chargé'));
   const timer=setTimeout(()=>finish(Error('OCR trop long à charger')),7500);
   if(!tag){
    tag=document.createElement('script');
    tag.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    tag.async=true;
    tag.addEventListener('load',check,{once:true});
    tag.addEventListener('error',failed,{once:true});
    document.head.append(tag);
   }else{
    tag.addEventListener('load',check,{once:true});
    tag.addEventListener('error',failed,{once:true});
   }
   if(window.Tesseract?.createWorker)check();
  });
 }
 function ensureLocalOcr(){
  if(!localReader||localOcrDisabled)return Promise.resolve(null);
  if(localWorker)return Promise.resolve(localWorker);
  if(localWorkerPromise)return localWorkerPromise;
  const serial=++localEngineGeneration;
  localWorkerPromise=(async()=>{
   const library=await loadTesseract();
   const worker=await library.createWorker('eng',1,{});
   if(serial!==localEngineGeneration){
    try{await worker.terminate()}catch(_){}
    return null;
   }
   localWorker=worker;
   return worker;
  })().catch(()=>{
   if(serial===localEngineGeneration)localOcrDisabled=true;
   return null;
  });
  return localWorkerPromise;
 }
 function releaseLocalOcr(){
  ++localEngineGeneration;
  const pending=localWorkerPromise;
  localWorkerPromise=null;localWorker=null;localOcrDisabled=false;
  if(pending)void pending.then(async worker=>{
   try{await worker?.terminate?.()}catch(_){}
  }).catch(()=>{});
 }
 function liveFrameCanvas(){
  const view=video.getBoundingClientRect();
  const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,view.width,view.height);
  const factor=Math.min(1,1450/Math.max(crop.width,crop.height));
  const cv=document.createElement('canvas');
  cv.width=Math.max(1,Math.round(crop.width*factor));
  cv.height=Math.max(1,Math.round(crop.height*factor));
  const ctx=cv.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas OCR indisponible');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,cv.width,cv.height);
  ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,cv.width,cv.height);
  return cv;
 }
 async function decodeLocalBarcode(canvas){
  if(typeof window.BarcodeDetector!=='function')return '';
  try{
   const reader=new window.BarcodeDetector({formats:['ean_13']});
   const items=await reader.detect(canvas);
   const codes=[...new Set((items||[]).map(x=>String(x.rawValue||'').replace(/\D/g,''))
    .filter(x=>localReader?.eanValid(x)))];
   return codes.length===1?codes[0]:'';
  }catch(_){return '';}
 }
 async function recognizeLocally(canvas){
  const waited=await Promise.race([ensureLocalOcr(),
   new Promise(resolve=>setTimeout(()=>resolve(null),5200))]);
  if(!waited)return null;
  const reading=Promise.all([
   waited.recognize(canvas),
   decodeLocalBarcode(canvas)
  ]).then(([result,barcode])=>({result,barcode}));
  const output=await Promise.race([reading,
   new Promise(resolve=>setTimeout(()=>resolve(null),6500))]);
  if(!output){
   localOcrDisabled=true;
   releaseLocalOcr();
   localOcrDisabled=true;
   return null;
  }
  return localReader.parse(output.result?.data?.text,{
   confidence:output.result?.data?.confidence,barcode:output.barcode
  });
 }
 async function sendOcrFallback(canvas,sessionValid){
  if(!sessionValid())return;
  if(!pilotKey.value.trim()){
   autoLocked=true;
   setAutoHint('OCR incertain · clé Cloudflare nécessaire pour Gemini','error');
   say('Lecture OCR incertaine. Aucune image envoyée : configure la clé Cloudflare ou réessaie.',true);
   return;
  }
  setAutoHint('Lecture locale incomplète · secours Gemini…','capturing');
  say('OCR incomplet : une seule image sera transmise à Gemini pour vérification.');
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
  if(!blob||!sessionValid())throw Error('Image de secours indisponible');
  lastPhotoWasAuto=true;
  autoCapturePending=false;
  // Même contrôle et même validation manuelle que la photo traditionnelle.
  setPhoto(new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'}));
 }
 async function readLocalFrame(quality){
  if(localOcrBusy||autoSuspended||active||file||proposal)return;
  autoLocked=true;localOcrBusy=true;
  refreshCaptureButton();
  const token=++localOcrToken,epoch=cameraEpoch,stream=cameraStream;
  const valid=()=>token===localOcrToken&&epoch===cameraEpoch&&
   cameraStream===stream&&scannerCardVisible()&&!active&&!file&&!proposal&&
   cameraMode==='auto';
  let canvas=null;
  const started=performance.now();
  try{
   canvas=liveFrameCanvas();
   autoLastCaptured=quality.pixels;
   setAutoHint('OCR local · lecture de la vidéo…','framing');
   let parsed=null;
   try{parsed=await recognizeLocally(canvas)}catch(_){}
   if(!valid())return;
   if(parsed){
    if(localCandidate&&localReader.matchTwo(localCandidate,parsed)){
     parsed.elapsedMs=Math.round(performance.now()-started);
     parsed.model='OCR local · 2 lectures concordantes';
     display(parsed,parsed.elapsedMs);
     autoLocked=true;
     const saveReady=Boolean(validationState());
     setAutoHint(saveReady?'OCR local confirmé · vérifie et valide'
      :'Lecture locale non validable · vérifie les valeurs',saveReady?'ready':'error');
     say(saveReady
      ?'Lecture OCR locale confirmée : vérifie le brut, puis touche Nouvelle pesée.'
      :'Lecture locale incomplète : contrôle manuel nécessaire.',!saveReady);
     return;
    }
    if(!localCandidate){
     localCandidate=parsed;
     localPasses=1;
     autoLocked=false;
     autoStableCount=0;autoEarliest=performance.now()+180;
     setAutoHint('OCR lu · vérification par une seconde lecture…','framing');
     return;
    }
   }
   // Une seule image de secours, jamais deux requêtes silencieuses.
   await sendOcrFallback(canvas,valid);
  }catch(_){
   if(valid()){
    autoLocked=true;
    setAutoHint('Lecture incomplète · touche Reprendre ou Capturer','error');
    say('Lecture automatique impossible. Essaie la capture manuelle.',true);
   }
  }finally{
   if(token===localOcrToken){
    localOcrBusy=false;
    refreshCaptureButton();
    if(!autoLocked&&valid())startAutoMonitor();
   }
  }
 }

 // Analyse locale basse résolution, sans photo transmise ni API distante.
 // Ce filtre détecte un document clair, contrasté et net au centre du viseur ;
 // Gemini reste seul responsable de la reconnaissance du texte et de l'EAN.
 function inspectAutoFrame(frame){
  const width=frame.width,height=frame.height,data=frame.data;
  const gray=new Uint8Array(width*height);
  for(let i=0,j=0;i<gray.length;i++,j+=4)
   gray[i]=(77*data[j]+150*data[j+1]+29*data[j+2])>>>8;
  const x0=Math.floor(width*.12),x1=Math.ceil(width*.88);
  const y0=Math.floor(height*.12),y1=Math.ceil(height*.88);
  let light=0,dark=0,edges=0,strong=0,count=0;
  for(let y=y0+1;y<y1;y++){
   for(let x=x0+1;x<x1;x++){
    const index=y*width+x,v=gray[index];
    if(v>172)light++;
    if(v<100)dark++;
    const edge=Math.abs(v-gray[index-1])+Math.abs(v-gray[index-width]);
    edges+=edge;if(edge>42)strong++;
    count++;
   }
  }
  const bright=light/Math.max(count,1),darkness=dark/Math.max(count,1);
  const sharpness=edges/Math.max(count,1),strongRatio=strong/Math.max(count,1);
  return {pixels:gray,bright,darkness,sharpness,strongRatio,
   usable:bright>.14&&darkness>.01&&darkness<.72&&
    sharpness>5.7&&strongRatio>.018};
 }
 function autoFrameDistance(first,second){
  if(!first||!second||first.length!==second.length)return Infinity;
  let sum=0,count=0;
  for(let i=0;i<first.length;i+=5){sum+=Math.abs(first[i]-second[i]);count++;}
  return sum/Math.max(count,1);
 }
 function setAutoHint(message,phase='waiting'){
  if(autoScanState&&autoScanState.textContent!==message)autoScanState.textContent=message;
  if(cameraShell)cameraShell.dataset.autoPhase=phase;
  if(autoReset)autoReset.hidden=!(cameraMode==='auto'&&cameraStream&&autoLocked&&!active&&!proposal);
 }
 function clearAutoTimer(){
  if(autoTimer){clearTimeout(autoTimer);autoTimer=0;}
 }
 function clearAutoStability(){
  autoLastFrame=null;autoStableSince=0;autoStableCount=0;autoChangeCount=0;
 }
 function armAutoScanner(afterValidation=false){
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  clearAutoStability();
  autoLocked=false;autoSuspended=false;
  autoChangeReference=afterValidation?autoLastCaptured:null;
  autoNeedsChange=Boolean(autoChangeReference);
  autoEarliest=performance.now()+(afterValidation?420:180);
  autoCapturePending=false;
  if(cameraMode==='auto'&&cameraStream){
   setAutoHint(afterValidation?'Présente une autre étiquette':'OCR local prêt · vise une étiquette','waiting');
   startAutoMonitor();
  }
 }
 function startAutoMonitor(){
  if(cameraMode!=='auto'||!cameraStream||!scannerCardVisible()||autoTimer||autoLocked||localOcrBusy)return;
  autoTimer=setTimeout(autoTick,230);
 }
 function autoTick(){
  autoTimer=0;
  if(!scannerCardVisible()||!cameraStream||cameraShell.hidden||cameraMode!=='auto')return;
  try{
   if(!autoLocked&&!autoSuspended&&!active&&!file&&!proposal&&performance.now()>=autoEarliest){
    if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
     const bounds=video.getBoundingClientRect();
     const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,bounds.width,bounds.height);
     if(autoSampleCanvas.width!==176)autoSampleCanvas.width=176;
     const sampleHeight=Math.max(78,Math.min(126,Math.round(176*crop.height/crop.width)));
     if(autoSampleCanvas.height!==sampleHeight)autoSampleCanvas.height=sampleHeight;
     const ctx=autoSampleCanvas.getContext('2d',{willReadFrequently:true});
     if(!ctx)throw Error('Canvas de contrôle indisponible');
     ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,
      autoSampleCanvas.width,autoSampleCanvas.height);
     const quality=inspectAutoFrame(ctx.getImageData(0,0,autoSampleCanvas.width,autoSampleCanvas.height));
     const now=performance.now();
     if(autoNeedsChange){
      // Une scène vraiment différente évite de reprendre la même pesée
      // simplement parce que l'iPhone a bougé.
      const changed=autoFrameDistance(quality.pixels,autoChangeReference)>18;
      autoChangeCount=changed?Math.min(3,autoChangeCount+1):0;
      if(autoChangeCount<2){
       setAutoHint('Présente une étiquette différente','waiting');
       autoLastFrame=null;return;
      }
      autoNeedsChange=false;autoChangeReference=null;
      autoLastFrame=null;autoStableSince=0;autoStableCount=0;
      autoEarliest=now+140;
      setAutoHint('Nouvelle étiquette · OCR local en préparation','framing');
     }
     // Deux images lisibles suffisent même si elles ne sont pas immobiles.
     // Une proposition exploitable réclame ensuite deux OCR concordants.
     if(quality.usable){
      autoStableCount=Math.min(3,autoStableCount+1);
      if(!autoStableSince)autoStableSince=now;
      autoLastFrame=quality.pixels;
      if(autoStableCount>=2&&now>=autoEarliest){
       autoLocked=true;
       void readLocalFrame(quality);
      }else setAutoHint('Étiquette détectée · OCR local bientôt prêt','framing');
     }else{
      autoStableCount=Math.max(0,autoStableCount-1);
      if(autoStableCount===0)autoStableSince=0;
      autoLastFrame=quality.pixels;
      setAutoHint('Rapproche l’étiquette pour une meilleure netteté','framing');
     }
    }
   }
  }catch(_){
   // Une image vidéo momentanément invalide ne bloque plus la caméra.
   autoStableCount=0;autoStableSince=0;
   autoEarliest=performance.now()+330;
   setAutoHint('Visée momentanément indisponible · nouvel essai','framing');
  }finally{
   if(scannerCardVisible()&&cameraMode==='auto'&&cameraStream&&!cameraShell.hidden&&
      !autoLocked&&!localOcrBusy)startAutoMonitor();
  }
 }
 // Mode unique : déclenchement explicite avec « Analyser cette étiquette ».
 // Les préférences Auto historiques ne sont plus lues ni sauvegardées.
 function selectCameraMode(){
  cameraMode='manual';
  // Conserver l'icône SVG du déclencheur flottant.
  if(capture)capture.setAttribute('aria-label','Photographier et analyser cette étiquette');
  localOcrToken++;localOcrBusy=false;localCandidate=null;localPasses=0;
  clearAutoTimer();autoLocked=false;autoCapturePending=false;
  setAutoHint('Cadre prêt · appuie pour analyser','manual');
 }
 selectCameraMode();

 capture.addEventListener('click',async()=>{
  if(!cameraStream||cameraShell.hidden||cameraShell.dataset.state!=='scanning'||
     document.hidden||!video.videoWidth||!video.videoHeight){
   say('Viseur non prêt · ouvre la caméra.',true);
   return;
  }
  if(frameCaptureBusy||(!active&&localOcrBusy))return;
  if(active){
   resetReading();
   say('Analyse annulée · reprends une photo.');
   return;
  }
  // Le geste est unique : capturer d'abord, enregistrer la pesée
  // précédente uniquement si la nouvelle photographie est obtenue.
  // Le libellé du déclencheur signale « Confirmer doublon » lorsque
  // l'utilisateur choisit volontairement d'enregistrer un article identique.
  const priorProposal=proposal;
  const frameGeneration=generation,frameEpoch=cameraEpoch;
  const priorBasket=$('basketSelect')?.value;
  const priorWasSavable=Boolean(correctedCurrentProposal());
  const duplicateBefore=priorWasSavable&&duplicateForCurrent();
  frameCaptureBusy=true;
  refreshCaptureButton();
  const automatic=autoCapturePending;
  autoCapturePending=false;autoLocked=true;autoSuspended=true;
  clearAutoTimer();
  lastPhotoWasAuto=automatic;
  if(!automatic)autoLastCaptured=autoLastFrame;
  try{
   const cv=document.createElement('canvas');
   const viewport=video.getBoundingClientRect();
   const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,
    viewport.width,viewport.height);
   const factor=Math.min(1,1600/Math.max(crop.width,crop.height));
   cv.width=Math.max(1,Math.round(crop.width*factor));
   cv.height=Math.max(1,Math.round(crop.height*factor));
   const ctx=cv.getContext('2d');
   if(!ctx)throw Error('Capture impossible');
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='high';
   ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,
    0,0,cv.width,cv.height);
   const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.90));
   if(!blob)throw Error('Capture impossible');
   // Si le panier, la session, le flux caméra ou la lecture a changé
   // pendant toBlob, n'enregistrer ni ne remplacer quoi que ce soit.
   if(frameEpoch!==cameraEpoch||frameGeneration!==generation||
      proposal!==priorProposal||priorBasket!==$('basketSelect')?.value||
      !cameraStream||cameraShell.hidden||document.hidden||
      cameraShell.dataset.state!=='scanning')return;
   const nextPhoto=new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'});
   if(priorWasSavable){
    const saved=saveVerifiedProposal({
     confirmDuplicate:duplicateBefore,fromCapture:true
    });
    if(!saved?.ok){announceSaveError(saved);return;}
    resetReading();
    say(saved.duplicate?'Doublon confirmé · photo suivante.':'Pesée enregistrée · photo suivante.');
   }else if(proposal||latestLabelFields||file){
    // Résultat incorrect ou analyse échouée : nouvelle photo, aucune
    // sauvegarde. Les données existantes ne sont pas altérées.
    resetReading();
   }
   const used=setPhoto(nextPhoto,{confirmed:true});
   if(used===false)setAutoHint('Capture non utilisée · réessaie','waiting');
  }catch(_){
   say('Photo impossible · recommence la capture.',true);
   setAutoHint('Capture impossible · réessaie','error');
  }finally{
   frameCaptureBusy=false;
   refreshCaptureButton();
  }
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&cameraStream){
   localOcrToken++;localOcrBusy=false;localCandidate=null;localPasses=0;
   if(!proposal&&!file)autoLocked=false;
   // Aucune image vidéo ne doit rester capturée lorsque la PWA est masquée.
   // Désactiver temporairement la piste au lieu de la détruire évite
   // de redemander l'accès lors de courts changements d'application.
   clearAutoTimer();
   cameraPausedInBackground=true;
   for(const track of cameraStream.getVideoTracks())track.enabled=false;
   try{video.pause()}catch(_){}
  }else if(!document.hidden&&cameraPausedInBackground&&cameraStream){
   cameraPausedInBackground=false;
   // Le retour de l'app ne doit pas rouvrir la caméra si Gemini
   // travaille encore ; la fin de l'analyse s'en charge.
   if(analysisCameraClosed)return;
   const track=cameraStream.getVideoTracks?.()[0];
   if(!track||track.readyState!=='live'){
    stopCamera();
    say('iOS a interrompu la caméra. Touche Scanner pour la rouvrir.',true);
    return;
   }
   track.enabled=true;
   cameraShell.dataset.state='scanning';
   video.srcObject=cameraStream;
   Promise.resolve(video.play()).then(()=>{
    if(cameraMode==='auto'&&!autoLocked&&!autoSuspended&&
       !active&&!file&&!proposal)startAutoMonitor();
   }).catch(()=>{
    say('Reprise vidéo bloquée par iOS. Touche Scanner pour continuer.',true);
   });
  }
 });
 // Quand la page est réellement fermée, WebKit libère automatiquement
 // les pistes. Ne pas forcer stop() ici : certaines navigations internes
 // de PWA peuvent aussi émettre pagehide et provoquer un prompt inutile.
 clear();
})();
