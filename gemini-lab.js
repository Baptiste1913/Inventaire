/* Inventaires U 42.23 — viseur prêt mais caméra inactive et étiquette vierge au démarrage.
   Clé pilote mémorisable uniquement sur cet appareil ; aucune photo conservée. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const toggle=$('iuGeminiLabToggle'),panel=$('iuGeminiLab');
 if(!panel)return;
 const photo=$('iuGeminiLabPhoto'),providerSelect=$('iuAiProvider'),
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
 let retainedSavedLabel=false;
 // La dernière photo et son résultat appartiennent à une même lecture.
 // Les erreurs ne doivent jamais laisser le scanner figé ou le bouton bloqué.
 let lastReadProblem=null,lastAnalysisError=null,lastSaveError=null,retakeConfirmUntil=0;
 let pendingReplacementFile=null,lastSavedImportedPhoto=null;
 let lastRawResult=null,localBarcode=null,barcodeJob=null,repairFocus=null;
 let manualCorrectedFields=[];
 let primaryBarcodePhoto=null,alternatePhotoTask=null,printedBusy=false;
 let cachedEncoding=null,cachedDetail=null,cachedEnhanced=null,cachedFocused=new Map(),cachedGuided=null;
 const guidedPhotos=new WeakSet();
 const guideHint=(source,reading)=>guidedPhotos.has(source)?{...reading,guideCrop:true}:reading;
 // Prepare a second, improved view for the exact same captured label.
 function samePhotoEnhanced(source,reading=null){
  if(!source)return Promise.resolve(null);
  if(cachedEnhanced?.source===source)return cachedEnhanced.promise;
  reading=guideHint(source,reading);
  // The cloud JPEG is never recompressed to make room for the detail.
  const maxBytes=file?.name==='etiquette-gemini.jpg'&&file.type==='image/jpeg'&&file.size<=490000?
   Math.max(100,Math.min(122000,Math.floor((750000-4*Math.ceil(file.size/3))/4)*3)):122000;
  const promise=Promise.resolve().then(()=>window.IUGeminiParallel?.prepareDetail?.(source,reading,maxBytes)||null)
   .then(blob=>blob?readParallelDetail(blob):null).catch(()=>null);
  cachedEnhanced={source,promise};return promise;
 }
 function samePhotoFocus(source,mode,reading){
  const found=cachedFocused.get(mode);if(found?.source===source)return found.promise;
  reading=guideHint(source,reading);
  const owner=file;
  // Separate focused lane on capable devices. Keep the original serial
  // fallback and preferred enhanced view if the extra lane is unavailable.
  const previous=mode==='numbers'?cachedFocused.get('ean')?.promise:null;
  const promise=Promise.resolve(previous).then(async()=>{
   if(file!==owner||!file)return null;
   const focused=window.IUGeminiParallel?.prepareFocused?.(source,reading,122000,mode);
   if(focused){const blob=await focused;if(blob)return blob;}
   await samePhotoEnhanced(source,reading);
   if(file!==owner||!file)return null;
   return window.IUGeminiParallel?.prepareDetail?.(source,reading,122000,mode)||null;
  }).then(blob=>blob?readParallelDetail(blob):null).catch(()=>null);
  cachedFocused.set(mode,{source,promise});return promise;
 }
 function samePhotoGuided(source,reading){
  if(cachedGuided?.source===source&&cachedGuided.reading===reading)return cachedGuided.promise;
  const promise=prepareLabelDetail(source,reading).catch(()=>null);
  cachedGuided={source,reading,promise};return promise;
 }
 // Prefer the enhanced view, not merely the fastest completed promise.
 // If it is late, fall back immediately at the shared deadline.
 async function chooseVisualDetail(preferred,fallback,deadline,until,usable,exclude=null){
  const available=entry=>entry&&usable(entry.task.value)&&entry.task.value!==exclude?
   {data:entry.task.value,kind:entry.kind}:null;
  const pick=async entry=>{
   if(!entry)return null;
   const data=await until(entry.task,deadline);
   return usable(data)&&data!==exclude?{data,kind:entry.kind}:null;
  };
  return available(preferred)||await pick(preferred)||available(fallback)||await pick(fallback)||null;
 }
 function samePhotoTask(source,detail=false){
  const stored=detail?cachedDetail:cachedEncoding;
  if(stored?.source===source)return stored.promise;
  const promise=(detail?prepareLabelDetail(source):imageBase64(source)).catch(error=>{
   if(detail&&cachedDetail?.source===source)cachedDetail=null;
   if(!detail&&cachedEncoding?.source===source)cachedEncoding=null;
   if(detail)return null;throw error;
  });
  if(detail)cachedDetail={source,promise};else cachedEncoding={source,promise};
  return promise;
 }
 let previewLastAt=0,previewBusy=false,warmedCameraEpoch=-1;
 const latency=window.IUGeminiLatency||null;
 const core=window.IURecognitionCore||null;
 let catalogDialogOpen=false,lastCatalogPromptGeneration=-1;
 const catalogDialog=$('iuGeminiCatalogConfirm'),
  catalogTitle=$('iuGeminiCatalogTitle'),
  catalogCancel=$('iuGeminiCatalogCancel'),
  catalogAccept=$('iuGeminiCatalogAccept');
 const fixedModel='gemini-3.5-flash-lite';
 const providerPreferenceKey='iu-ai-provider-v1';
 const storageKey='iu-gemini-pilot-key-v1';
 const endpoint='https://inventaires-u-prix.baptistee123.workers.dev/gemini-lab';
 const networkSamples=[];let warmDiagnostic=null;
 function warmNetwork(reconnect=false){
  const key=pilotKey.value.trim();
  if(!key||document.hidden||active)return;
  const task=window.IUGeminiTransport?.warm?.(endpoint,key,{isCurrent:()=>pilotKey.value.trim()===key,reconnect});
  if(task)void task.then(data=>{if(data){warmDiagnostic=data;renderNetworkDiagnostic();}}).catch(()=>{});
 }
 function renderNetworkDiagnostic(){
  const node=$('iuGeminiNetworkSummary');if(!node)return;
  const quantile=(values,p)=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?Math.round(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]):null;};
  const fmt=v=>Number.isFinite(v)?v+' ms':'—';
  const samples=networkSamples,latest=samples[samples.length-1];
  const lines=['Échantillons de requêtes réussies : '+samples.length+' (RAM uniquement).'];
  if(warmDiagnostic)lines.push('Connexion préparée : '+warmDiagnostic.ms+' ms · '+warmDiagnostic.transport);
  if(latest){
   lines.push('Médiane / P95 échange : '+fmt(quantile(samples.map(x=>x.ms),.5))+' / '+fmt(quantile(samples.map(x=>x.ms),.95)));
   lines.push('Dernière requête : '+latest.ms+' ms · '+latest.bytes+' octets · '+latest.transport);
   lines.push('Gemini demandé : '+latest.requested+' · confirmé : '+latest.tier);
   lines.push('Priority confirmé : '+samples.filter(x=>x.tier==='priority').length+' / '+samples.length);
   if(latest.server)lines.push('Worker : entrée '+fmt(latest.server.ingressMs)+' · préparation '+fmt(latest.server.preparationMs)+' · Google (réseau + calcul) '+fmt(latest.server.upstreamMs)+' · réponse '+fmt(latest.server.responseMs)+' · traitement '+fmt(latest.server.processingMs));
  }
  node.textContent=lines.join(' | ');
 }
 window.addEventListener('online',()=>{if(cameraStream&&!document.hidden&&!active)warmNetwork(true);});
 const cameraShell=$('iuGeminiCameraShell'),
  cameraIdle=$('iuGeminiCameraIdle'),
  video=$('iuGeminiVideo'),closeCamera=$('iuGeminiCloseCamera'),
  torch=$('iuGeminiTorch'),capture=$('iuGeminiCapture');
 let cameraStream=null,cameraStarting=false,cameraEpoch=0,torchOn=false,torchBusy=false,frameCaptureBusy=false;
 let cameraPausedInBackground=false;
 const modeCamera=$('iuGeminiModeCamera'),modePhoto=$('iuGeminiModePhoto');
 const modeControl=$('iuGeminiModeCamera')?.closest('.iu-gemini-mode-control');
 const grossPreview=$('iuGeminiGrossPreview');
 const nextWeigh=$('iuGeminiNext'),emptyResult=$('iuGeminiEmptyResult');
 const labelAlert=$('iuGeminiLabelAlert'),labelAlertText=$('iuGeminiLabelAlertText'),
  duplicateDialog=$('iuGeminiDuplicateConfirm'),
  duplicateCancel=$('iuGeminiDuplicateCancel'),
  duplicateAccept=$('iuGeminiDuplicateAccept');
 let duplicateDialogOpen=false,lastDuplicatePromptGeneration=-1;
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
 let guideSnapshot=null,guideSize=null,guideSource=null,guideScheduled=false,guideLastCheck=-Infinity;
 const labelLayout=window.IUGeminiLabelGeometry;
 const labelOutlineZones=labelLayout?.zones||[
  ['store',.49,.035,.45,.15],['product',.11,.265,.78,.145],
  ['rate',.065,.535,.275,.145],['weight',.395,.535,.245,.145],
  ['date',.665,.535,.285,.145],['barcode',.075,.725,.435,.20],
  ['ean',.055,.925,.465,.055],['total',.52,.725,.405,.245]
 ];
 // The displayed rectangles and the OCR crops serve different purposes:
 // a single visible EAN box, independent fine OCR/quality sampling zones.
 const cameraOutlineZones=labelLayout?.guideZones||[
  ['store',.49,.035,.45,.15],['product',.06,.245,.88,.145],
  ['rate',.06,.535,.29,.145],['weight',.385,.535,.245,.145],
  ['date',.665,.535,.275,.145],['barcode',.06,.715,.43,.265],
  ['total',.525,.715,.415,.265]
 ];
 function buildExactCameraOutline(source){
  const width=source.getBoundingClientRect().width,height=width/(labelLayout?.aspect||1.24);
  if(width<=60)return null;
  const wireframe=document.createElement('div');wireframe.className='iu-gemini-outline-label';
  wireframe.style.width=width+'px';wireframe.style.height=height+'px';
  wireframe.style.borderRadius='7px';
  for(const [kind,x,y,w,h] of cameraOutlineZones){
   const outline=document.createElement('span');outline.className='iu-gemini-outline-rect iu-gemini-outline-'+kind;
   outline.style.left=(x*width)+'px';outline.style.top=(y*height)+'px';
   outline.style.width=(w*width)+'px';outline.style.height=(h*height)+'px';wireframe.appendChild(outline);
  }
  return {node:wireframe,width,height};
 }
 // Safari peut conserver une surface vidéo portrait en mode paysage.
 // Dimensionner la surface elle-même au ratio natif, sans se fier uniquement
 // à object-fit. Le calcul de crop utilise toujours le rectangle vidéo réel.
 function cameraCoverGeometry(srcW,srcH,w,h){
  if(![srcW,srcH,w,h].every(v=>Number.isFinite(v)&&v>0))return null;
  const scale=Math.max(w/srcW,h/srcH);
  const width=srcW*scale,height=srcH*scale;
  return {width,height,left:(w-width)/2,top:(h-height)/2};
 }
 function syncCameraCover(){
  if(!cameraStage||!video)return;
  const cover=cameraCoverGeometry(video.videoWidth,video.videoHeight,cameraStage.clientWidth,cameraStage.clientHeight);
  if(!cover)return;
  for(const [key,value] of Object.entries(cover)){
   const property='--iu-video-'+key,val=value+'px';
   if(cameraStage.style.getPropertyValue(property)!==val)cameraStage.style.setProperty(property,val);
  }
 }
 function shutterGeometry(stageWidth,guideWidth){
  const gutter=Math.max(0,(stageWidth-guideWidth)/2);
  const baseMargin=Math.min(5,gutter*.12);
  const size=Math.max(0,gutter-2*baseMargin)*.85;
  return {size,margin:(gutter-size)/2};
 }
 function syncExactCameraGuide(){
  if(!cameraStage||!exactGuide||!output)return;
  const source=output.querySelector('.iu-gemini-printed-label.iu-gemini-label-placeholder');
  const stage=cameraStage.getBoundingClientRect();
  if(stage.width<40||stage.height<40)return;
  syncCameraCover();
  if(source){
   const bounds=source.getBoundingClientRect();
   if(bounds.width>60&&bounds.height>40&&
      (!guideSnapshot||source!==guideSource||!guideSize||
       Math.abs(bounds.width-guideSize.width)>.5)){
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
  // Repère agrandi de 85 à 90 % ; ratio physique inchangé (1.24).
  // Ce calcul ne modifie pas la capture photo ni sa résolution.
  const scale=(labelLayout?.guideScale||.90)*Math.min((stage.width-8)/guideSize.width,
   (stage.height-8)/guideSize.height);
  if(!(scale>0))return;
  exactGuide.style.width=(guideSize.width*scale)+'px';
  exactGuide.style.height=(guideSize.height*scale)+'px';
  const shutter=shutterGeometry(cameraStage.clientWidth,guideSize.width*scale);
  cameraStage.style.setProperty('--iu-shutter-size',shutter.size+'px');
  cameraStage.style.setProperty('--iu-shutter-margin',shutter.margin+'px');
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
  for(const event of ['loadedmetadata','resize','playing'])video?.addEventListener(event,syncCameraCover);
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
 const qualityEngine=window.IUGeminiFrameQuality||null;
 // Un seul tampon pleine résolution en RAM ; jamais de sauvegarde disque
 // ni de seconde image envoyée à Gemini.
 const qualitySampleCanvas=document.createElement('canvas');
 let qualityMonitorId=0,qualityMonitorKind='',qualityMonitorToken=0,
  qualityLastSampleAt=0,qualityLastCachedAt=0,qualityPrevious=null,
  qualityCached=null,lastSelectedQuality=null;
 const qualityRing=[];
 const qualityRingLimit=Number(navigator.hardwareConcurrency||0)>=6&&(!navigator.deviceMemory||navigator.deviceMemory>=4)?3:1;
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
  // Le voyant permanent indique le chargement et les erreurs de capture.
  if(active)setLabelAlert('working','Analyse…');
  else if(error&&['idle','working'].includes(labelAlert?.dataset.state))
   setLabelAlert('warning',message||'Erreur de lecture');
 };
 // Safari iOS peut afficher des bandes noires après pause()/play() ou
 // track.enabled=false/true sur un MediaStream. Pendant l'analyse, masquer
 // seulement le viseur par son état CSS, sans débrancher la vidéo : la capture
 // suivante conserve le flux natif et son cadrage de départ.
 // L'arrêt volontaire et le passage en arrière-plan restent gérés séparément.
 let analysisCameraClosed=false,restoreCameraAfterAnalysis=false;
 function setAnalysisCameraClosed(closed,{resume=true}={}){
  if(!cameraShell||!cameraStage)return;
  if(closed){
   if(analysisCameraClosed)return;
   stopQualityMonitor();
   analysisCameraClosed=true;
   const track=cameraStream?.getVideoTracks?.()[0];
   restoreCameraAfterAnalysis=Boolean(cameraStream&&
    cameraShell.dataset.state==='scanning'&&track?.readyState==='live');
   // Ne pas mettre en pause / désactiver la piste sur une analyse ordinaire.
   // Le CSS [data-state="analyzing"] masque déjà la vidéo pendant le traitement.
   if(cameraStill){cameraStill.hidden=true;cameraStill.removeAttribute('src');}
   cameraStage.classList.remove('is-photo-frozen');
   if(frameState)frameState.hidden=true;
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
  if(cameraIdle){
   cameraIdle.disabled=false;
   cameraIdle.setAttribute('aria-label','Activer la caméra, actuellement désactivée');
  }
  if(frameState)frameState.hidden=true;
  const track=cameraStream?.getVideoTracks?.()[0];
  const canResume=Boolean(resume&&wasLive&&track?.readyState==='live'&&
   !cameraShell.hidden&&isWeighingPage());
  if(!canResume){
   cameraShell.dataset.state='idle';
   // Safari peut terminer une piste quand elle est momentanément coupée.
   // Rouvrir dans ce cas seulement, sans affecter la fermeture volontaire.
   if(resume&&wasLive&&cameraStream&&track?.readyState!=='live'&&
      !document.hidden&&isWeighingPage()){
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
  // Une analyse normale n'a pas interrompu le flux : ne pas relancer
  // le lecteur vidéo Safari, ce qui pourrait ajouter des bandes latérales.
  // Seule une mise en arrière-plan effective peut nécessiter une reprise.
  if(!track.enabled)track.enabled=true;
  if(video.srcObject!==cameraStream)video.srcObject=cameraStream;
  if(video.paused)Promise.resolve(video.play()).then(()=>{
   syncCameraCover();startQualityMonitor();
  }).catch(()=>{
   if(!analysisCameraClosed&&cameraStream&&
      cameraShell.dataset.state==='scanning'){
    cameraShell.dataset.state='idle';
    say('Caméra interrompue par iOS · touche le viseur pour rouvrir.',true);
   }
  });
  else {syncCameraCover();startQualityMonitor();}
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
  const caption=active?'…':duplicate?'Vérifier doublon'
   :canSave?'Enregistrer'
   :needsBasketChange()?'Changer panier'
   :retry?'Réessayer':'Nouvelle photo';
  if(primaryText&&primaryText.textContent!==caption)primaryText.textContent=caption;
  nextWeigh.setAttribute('aria-label',duplicate?'Ouvrir la confirmation de ce doublon'
   :canSave?'Enregistrer la pesée sans nouvelle photo'
   :active?'Analyse en cours'
   :needsBasketChange()?'Changer de panier sans relire l’étiquette'
   :retry?'Relire la même photo':'Préparer une nouvelle photographie');
  nextWeigh.dataset.action=duplicate?'duplicate-review':canSave?'save'
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
 function catalogProposalCurrent(){
  return Boolean(proposal&&window.IUDigiCatalogLookup?.verify(
   proposal.ean,proposal.plu,proposal.name));
 }
 function correctedCurrentProposal(){
  if(!proposal||active||!catalogProposalCurrent()||validateResult(lastRawResult).error)return null;
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
  capture.disabled=locked||duplicateDialogOpen;
  capture.setAttribute('aria-disabled',String(capture.disabled));
  capture.dataset.action=duplicated?'duplicate-review'
   :ready?'save-and-scan':'scan';
  const description=active?'Annuler l’analyse et revenir au viseur'
   :duplicated?'Ouvrir la confirmation du doublon'
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
 function resetProposal(){
  proposal=null;
  if(nextWeigh){nextWeigh.disabled=active;nextWeigh.classList.remove('is-ready');}
  refreshCaptureButton();
 }
 function setLabelAlert(state,message){
  if(!labelAlert||!labelAlertText)return;
  const detail=String(message||'');
  let type=['idle','working','success','warning','duplicate'].includes(state)?state:'warning';
  let visibleMessage;
  if(type==='idle'){
   visibleMessage=cameraShell?.dataset.state==='scanning'?'Caméra active':'Caméra désactivée';
  }else if(type==='working'){
   visibleMessage='Analyse…';
  }else if(type==='success'){
   visibleMessage=/doublon/i.test(detail)?'Doublon confirmé':
    /enregistr/i.test(detail)?'Pesée enregistrée':'Étiquette prête';
  }else if(type==='duplicate'||/doublon|déjà (?:été )?enregistr/i.test(detail)){
   type='duplicate';visibleMessage='Doublon détecté';
  }else{
   visibleMessage=/tare trop élevée|mauvais panier/i.test(detail)?'Tare trop élevée':
    /choisis un panier|panier requis/i.test(detail)?'Panier requis':
    /clé|cloudflare nécessaire/i.test(detail)?'Clé Gemini requise':
    /référence DIGI|catalogue DIGI|catalogue ou/i.test(detail)?'Référence à vérifier':
    /enregistrement|stockage|non enregistrée/i.test(detail)?'Enregistrement impossible':
    /caméra|viseur|vidéo|accès refusé/i.test(detail)?'Caméra indisponible':
    /photo impossible|capture.*impossible|choisis une image/i.test(detail)?'Photo impossible':
    /réseau|503|429|indisponible|timeout|fetch|trop longue/i.test(detail)?'Erreur réseau':
    /pesée prête/i.test(detail)?'Pesée à enregistrer':
    /lecture|poids|valeur|incertain|incompl|invalide|EAN|prix/i.test(detail)?'Données incertaines':
    'Erreur de lecture';
  }
  if(labelAlert.dataset.state!==type){
   labelAlert.dataset.state=type;
   for(const key of ['idle','working','success','warning','duplicate'])
    labelAlert.classList.toggle('is-'+key,type===key);
  }
  if(labelAlertText.textContent!==visibleMessage)labelAlertText.textContent=visibleMessage;
  labelAlert.title=detail||visibleMessage;
  labelAlert.hidden=false;

 }
 function refreshCameraAlert(){
  if(active){setLabelAlert('working','Analyse…');return;}
  // Les résultats d'une photo importée ou conservée restent prioritaires.
  if(file||proposal||latestLabelFields)return;
  setLabelAlert('idle','');
 }
 function duplicateForCurrent(){
  if(!proposal||typeof window.IUGeminiDuplicateInfo!=='function')return false;
  try{return window.IUGeminiDuplicateInfo({
   ean13:proposal.ean,gross:proposal.grams,
   pricePerKgCents:proposal.rate,totalCents:proposal.total
  })?.duplicate===true;}catch(_){return false;}
 }
 function refreshLabelAlert(){
  if(active){setLabelAlert('working','Analyse…');return;}
  if(retainedSavedLabel){setLabelAlert('success',retainedSavedLabel);return;}
  // Si un résultat a déjà été lu pour CETTE photo, un panier plus
  // lourd que le brut est une erreur métier certaine, pas une panne IA.
  // Cela évite de masquer la tare lors d'une relecture réseau échouée.
  const knownGross=latestLabelFields?.weightGrams;
  const knownTare=typeof window.IUWeighScanContext==='function'
   ?window.IUWeighScanContext()?.tareGrams:null;
  if(Number.isSafeInteger(knownGross)&&knownGross>0&&
     Number.isSafeInteger(knownTare)&&knownTare>=knownGross){
   setLabelAlert('warning','Tare trop élevée · change de panier');
   return;
  }
  if(lastAnalysisError){setLabelAlert('warning',lastAnalysisError);return;}
  if(lastSaveError){setLabelAlert('warning','Enregistrement impossible · '+lastSaveError);return;}
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
   if(lastRawResult?.digiRecovery?.kind==='confirmation')
    setLabelAlert('warning','Référence DIGI probable · confirmation requise');
   else setLabelAlert('warning','Lecture non validable · '+lastReadProblem);
   return;
  }
  if(proposal&&!catalogProposalCurrent()){
   setLabelAlert('warning','Catalogue DIGI modifié · relis cette photo');
   return;
  }
  if(!proposal){
   setLabelAlert('warning','Lecture incomplète · réessaie');
   return;
  }
  if(duplicateForCurrent()){
   setLabelAlert('warning','Doublon détecté · validation nécessaire');
   return;
  }
  const note=lastRawResult?.digiRecovery?.kind==='reconstructed'
   ?' · EAN reconstitué':lastRawResult?.digiRecovery?.sources?.total==='calculated'
   ?' · montant calculé':'';
  setLabelAlert('success','Étiquette prête • PLU '+proposal.plu+note);
 }
 function validateResult(result){
  const f=result?.fields||{},checks=result?.checks||{};
  const grams=f.weightGrams,rate=f.pricePerKgCents,total=f.totalCents;
  if(!Number.isSafeInteger(grams)||grams<=0||grams>30000)
   return {error:'Poids lu sur l’étiquette manquant ou invalide.'};
  if(!Number.isSafeInteger(rate)||rate<=0||rate>1000000||
     !Number.isSafeInteger(total)||total<0)
   return {error:'Prix au kilo ou montant manquant.'};
  const ean=String(f.ean13||'');
  if(!/^\d{13}$/.test(ean)||eanCheck(ean.slice(0,12))!==ean[12])
   return {error:'EAN complet non reconnu ou clé EAN incorrecte.'};
  // Identité officielle UNIQUEMENT depuis un préfixe unique du catalogue DIGI.
  const digi=window.IUDigiCatalogLookup?.resolve(ean);
  if(!digi?.ok)return {error:'Catalogue DIGI · '+(digi?.reason||
   'module indisponible sur cet appareil')};
  if([result?.printedName,f.name].some(name=>window.IUDigiCatalogLookup?.nameIdentityConflict?.(name,digi.eanPrefix)))
   return {error:'Article contradictoire : nom imprimé et EAN différents.'};
  if(Math.abs(Math.round(grams*rate/1000)-total)>1)
   return {error:'Calcul prix × poids incohérent.'};
  if(checks.independentMismatch===true)
   return {error:'Code-barres différent de la lecture indépendante.'};
  if(checks.readingConflict===true)
   return {error:'Lectures contradictoires · vérifie les chiffres imprimés.'};
  if(checks.digiConflict===true)
   return {error:'Catalogue DIGI · '+(result.digiRecovery?.reason||'Données incohérentes')};
  if(checks.recoveryInterrupted===true)
   return {error:'Vérification complémentaire interrompue · relis cette photo.'};
  if(fieldsChecks(f).barcodePriceConsistent===false)
   return {error:'Prix de l’EAN différent du prix imprimé.'};
  return {name:digi.name,plu:digi.plu,catalogPrefix:digi.eanPrefix,
   grams,rate,total,ean};
 }
 // Une lecture EAN13 purement optique n'est acceptée que si elle est
 // unique, confirmée et vérifiée par checksum. Toute contradiction bloque.
 function trustedBarcodeEvidence(reading){
  const ean=String(reading?.ean13||'');
  if(!reading?.confirmed||reading?.ambiguous||
     !/^\d{13}$/.test(ean)||eanCheck(ean.slice(0,12))!==ean[12])
   return false;
  // Un OCR chiffre seul n'est pas équivalent à des barres décodées :
  // exiger deux bandes concordantes avant de l'utiliser comme preuve.
  if(reading.source==='printed-ocr')return reading.evidenceCount>=2;
  if(reading.source!=='optical')return true;
  const b=reading.bounds;
  // Le gabarit historique est prioritaire. Une étiquette décentrée peut
  // être reconnue seulement si le contour RÉEL détecté contient les
  // barres dans la partie basse. Aucun assouplissement sur simple EAN.
  const legacy=Boolean(b&&b.y>=.60&&b.y<=.93&&
   (b.left+b.right)/2>=.15&&(b.left+b.right)/2<=.60&&
   b.right-b.left>=.20&&Math.abs(b.slope||0)<=.10);
  if(legacy)return true;
  return window.IUGeminiLabelGeometry?.barcodeWithinLabel?.(
   reading,reading.labelRect)===true;
 }
 function reconcileBarcode(result,reading){
  const fields={...(result?.fields||{})},checks={...(result?.checks||{})};
  const incoming=String(fields.ean13||'');
  const fromGemini=/^\d{13}$/.test(incoming)&&eanCheck(incoming.slice(0,12))===incoming[12];
  const external=trustedBarcodeEvidence(reading)?reading.ean13:null;
  if(!fromGemini&&external)fields.ean13=external;
  checks.eanChecksumValid=Boolean(/^\d{13}$/.test(String(fields.ean13||''))&&
   eanCheck(String(fields.ean13).slice(0,12))===String(fields.ean13)[12]);
  if(reading?.ambiguous||(external&&fromGemini&&external!==incoming))
   checks.independentMismatch=true;
  return {...result,fields,checks,
   opticalEAN:external&&external===fields.ean13?reading.source:null};
 }
 // Le catalogue reste la source officielle des identités. Il ne doit
 // pas servir à inventer un poids, un prix/kg ou un EAN non corroboré.
 function catalogHints(result,reading=null){
  const catalog=window.IUDigiCatalogLookup;
  if(!catalog?.candidates)return [];
  const eanObserved=String(trustedBarcodeEvidence(reading)?reading.ean13:
   result?.eanObserved||result?.fields?.ean13||'');
  const name=String(result?.fields?.name||'');
  const guide=result&&!trustedBarcodeEvidence(reading)?result.digiPlan||catalog.recheckPlan?.(result):null;
  return (guide?.candidates?.length?guide.candidates:catalog.candidates({eanObserved,name,limit:5}))
   .filter(c=>c.name.length<=90&&/^[\p{L}\d .'\-(),/]+$/u.test(c.name))
   .map(c=>({eanPrefix:c.eanPrefix,plu:c.plu,name:c.name}));
 }
 // Les masques secondaires restent des indices : une lecture
 // contradictoire ne doit pas transformer un bon résultat en échec.
 function fuseEAN(result,...observations){
  const engine=window.IURecognitionCore,catalog=window.IUDigiCatalogLookup;
  if(!engine||!result)return result;
  if(readableValue('ean',result.fields?.ean13))return result;
  const merged=engine.fuse(result.eanObserved,...observations);
  if(merged.conflict||!merged.pattern||merged.pattern===result.eanObserved)return result;
  const trial={...result,eanObserved:merged.pattern};
  const recovered=catalog?.reconstruct?.(trial);
  // Si une piste rend le calcul ou l'identité impossible, l'écarter
  // sans détruire la lecture principale, ni les autres pistes.
  if(recovered?.kind==='conflict')return result;
  return trial;
 }
 function applyCatalogRecovery(result){
  const catalog=window.IUDigiCatalogLookup;
  if(!result||!catalog?.reconstruct||result.checks?.independentMismatch||
     result.checks?.readingConflict||localBarcode?.ambiguous)return result;
  // Le code optique complet, confirmé et non contredit par un autre
  // code complet, prévaut sur les masques OCR incertains de la photo.
  if(trustedBarcodeEvidence(localBarcode)&&localBarcode.ean13===result.fields?.ean13)
   result={...result,eanObserved:localBarcode.ean13,weakEANSupplement:false};
  if(result.digiRecovery?.kind==='reconstructed'||result.digiRecovery?.kind==='confirmed')
   return result;
  const recovered=catalog.reconstruct(result);
  if(!recovered||!recovered.result)return result;
  const info={kind:recovered.kind,sources:recovered.sources,
   candidates:recovered.candidates||[],proposedEAN:recovered.proposedEAN||null,
   variantCount:recovered.variantCount||0,prefixDigits:recovered.prefixDigits||0,
   knownDigits:recovered.knownDigits||0,conflictField:recovered.conflictField||null,
   reason:recovered.reason||null};
  // Un échec de déduction n'est pas une contradiction irréversible.
  // Recalculer après une vraie relecture ; les conflits entre lectures
  // complètes et mesures restent bloquants.
  return {...recovered.result,digiRecovery:info,
   checks:{...(recovered.result.checks||{}),digiConflict:recovered.kind==='conflict'}};
 }
 function fieldsChecks(fields){
  const ean=String(fields?.ean13||'');
  const validEAN=/^\d{13}$/.test(ean)&&eanCheck(ean.slice(0,12))===ean[12];
  // Formule DIGI limitée aux étiquettes de prix encodé en 02 :
  // elle vérifie, elle ne remplace jamais une valeur lue sur la photo.
  const priceInEAN=validEAN&&ean.startsWith('02')
   ?Math.round(Number(ean.slice(7,12))*100/655.36):null;
  const barcodePriceConsistent=priceInEAN!==null&&Number.isSafeInteger(fields?.totalCents)
   ?Math.abs(priceInEAN-fields.totalCents)<=1:null;
  return {
   barcodePriceConsistent,
   arithmeticConsistent:Number.isSafeInteger(fields?.weightGrams)&&
    Number.isSafeInteger(fields?.pricePerKgCents)&&Number.isSafeInteger(fields?.totalCents)&&
    Math.abs(Math.round(fields.weightGrams*fields.pricePerKgCents/1000)-fields.totalCents)<=1,
   eanChecksumValid:validEAN,
   independentMismatch:Boolean(localBarcode?.ambiguous||
    (trustedBarcodeEvidence(localBarcode)&&
     validEAN&&localBarcode.ean13!==ean))
  };
 }
 function fieldForProblem(error){
  if(/EAN|code-barres|indépendante/i.test(error))return 'ean';
  if(/Poids/i.test(error))return 'weight';
  if(/Prix au kilo|montant manquant|Calcul prix/i.test(error))return 'rate';
  if(/Article|Catalogue DIGI/i.test(error))return 'ean';
  return 'ean';
 }
 function refreshRepairPanel(){
  if(!repairPanel)return;
  const eligible=!active&&!!file&&!!lastRawResult&&!!lastReadProblem;
  const opening=repairPanel.hidden||repairManual?.hidden;
  repairPanel.hidden=!eligible;
  if(repairManual)repairManual.hidden=!eligible;
  if(!eligible)return;
  const previous=repairField?.value;
  if(repairField&&!repairFocus&&opening)
   repairField.value=fieldForProblem(lastReadProblem);
  if(opening||previous!==repairField?.value)fillRepairValue();
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
 function fillRepairValue(){
  if(!repairValue||!repairField)return;
  const key=fieldKeys[repairField.value],val=latestLabelFields?.[key];
  repairValue.inputMode=key==='ean13'?'numeric':key==='name'?'text':'decimal';
  repairValue.value=val===null||val===undefined?''
   :key==='ean13'||key==='name'?String(val)
   :key==='weightGrams'?(val/1000).toFixed(3):(val/100).toFixed(2);
 }
 repairField?.addEventListener('change',()=>{
  repairFocus=null;
  fillRepairValue();
 });
 repairEdit?.addEventListener('click',()=>{
  if(!lastRawResult||!repairManual||repairPanel?.hidden||active)return;
  repairManual.hidden=false;
  repairValue?.focus();repairValue?.select();
 });
 repairApply?.addEventListener('click',()=>{
  if(!lastRawResult||!repairField||repairPanel?.hidden||active)return;
  const kind=repairField.value,key=fieldKeys[kind];
  const value=parseManualValue(kind,repairValue?.value);
  if(value===null){setLabelAlert('warning','Valeur invalide · vérifie l’étiquette');return;}
  const fields={...lastRawResult.fields,[key]:value};
  if(['weight','rate'].includes(kind)&&lastRawResult.digiRecovery?.sources?.total==='calculated')
   fields.totalCents=null;
  const evidence=kind==='total'?null:lastRawResult.recoveryProvenance;
  const next=applyCatalogRecovery({...lastRawResult,fields,checks:fieldsChecks(fields),
   digiRecovery:null,recoveryProvenance:evidence,
   eanObserved:kind==='ean'?value:lastRawResult.eanObserved,source:'manual'});
  manualCorrectedFields=[...new Set([...manualCorrectedFields,kind])];
  repairFocus=null;
  display(next,0);
  if(repairPanel&&!repairPanel.hidden&&repairField){repairField.value=fieldForProblem(lastReadProblem);fillRepairValue();}
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
  // Un résultat enregistré est un instantané : un changement de panier
  // ne doit pas modifier les chiffres déjà enregistrés.
  if(retainedSavedLabel)return;
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
  const labelReady=Boolean(corrected&&proposal&&!lastReadProblem&&catalogProposalCurrent());
  label.classList.toggle('is-ready',labelReady);
  label.classList.toggle('is-review',!labelReady);
  if(weight)weight.textContent=labelReady?formatWeight(corrected.net):'—';
  const virtualDate=label.querySelector('.iu-gemini-label-date .iu-gemini-label-number');
  if(virtualDate)virtualDate.textContent=todayForVirtualLabel();
  if(total)total.textContent=labelReady?money(corrected.cents).replace(/\s/g,''):'—';
  if(digits)digits.textContent=labelReady?corrected.ean:'CODE EN ATTENTE';
  if(bars){
   if(labelReady)renderEanBars(bars,corrected.ean,proposal.plu);
   else bars.replaceChildren();
  }
  // Les informations de vigilance figurent dans le voyant sous l’étiquette.
 }
 // Les contrôles sont refaits au moment du clic de validation.
 function validationState(){
  if(retainedSavedLabel){
   if(nextWeigh){nextWeigh.disabled=false;nextWeigh.classList.remove('is-ready');}
   setPrimaryAction(false);refreshCaptureButton();refreshLabelAlert();return null;
  }
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const corrected=proposal&&ctx&&catalogProposalCurrent()&&!validateResult(lastRawResult).error
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
   const recovered=lastRawResult?.digiRecovery;
   signal.textContent=corrected
    ?(recovered?.kind==='reconstructed'?'EAN reconstitué · chiffres et calcul DIGI vérifiés.'
      :recovered?.kind==='confirmed'?'Article confirmé · vérifie le brut et le panier.'
      :recovered?.sources?.total==='calculated'?'Montant recalculé · vérifie le brut et le prix/kg.'
      :'Vérifie l’article, le brut et la tare avant de valider.')
    :'Validation impossible : vérifie le panier et sa tare.';
   signal.classList.toggle('is-ready',Boolean(corrected));
   signal.classList.toggle('is-warning',!corrected);
  }
  refreshCorrectedLabel();
  refreshLabelAlert();
  const duplicate=canSave&&duplicateForCurrent();
  refreshCaptureButton();
  if(duplicate&&!lastAnalysisError&&!lastReadProblem&&!lastSaveError&&!duplicateDialogOpen&&
     generation!==lastDuplicatePromptGeneration)
   openDuplicateConfirm();
  return canSave?corrected:null;
 }
 $('basketSelect')?.addEventListener('change',validationState);
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
 }
 function resetReading(){
  retainedSavedLabel=false;
  closeDuplicateConfirm();closeCatalogConfirm();
  clearReplacePrompt();
  retakeConfirmUntil=0;lastReadProblem=null;lastAnalysisError=null;lastSaveError=null;
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  generation++;abort?.abort();abort=null;active=false;file=null;
  setAnalysisCameraClosed(false);
  lastRawResult=null;localBarcode=null;barcodeJob=null;repairFocus=null;manualCorrectedFields=[];
  primaryBarcodePhoto=null;alternatePhotoTask=null;cachedEncoding=null;cachedDetail=null;cachedEnhanced=null;cachedFocused.clear();cachedGuided=null;
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
 function setPhoto(chosen,{confirmed=false,barcodePhoto=null,alternatePhoto=null,preparedBarcode=null,preparedEnhanced=null,guideCrop=false}={}){
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
  retainedSavedLabel=false;
  closeCatalogConfirm();
  clearReplacePrompt();
  retakeConfirmUntil=0;lastReadProblem=null;lastAnalysisError=null;lastSaveError=null;
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  latestLabelFields=null;lastRawResult=null;localBarcode=null;barcodeJob=null;
  repairFocus=null;manualCorrectedFields=[];
  if(repairPanel)repairPanel.hidden=true;
  if(repairManual)repairManual.hidden=true;
  analyze.textContent='Analyser l’étiquette';
  clearPreview();file=chosen;cachedEncoding=null;cachedDetail=null;cachedEnhanced=null;cachedFocused.clear();cachedGuided=null;attempts.clear();generation++;
  // Lire l'EAN en local en parallèle du réseau, sans envoi ni bibliothèque.
  // La pleine résolution reste réservée à l'EAN LOCAL si le JPEG
  // envoyé à Gemini a été réduit pour respecter le budget Cloudflare.
  const barcodeSource=barcodePhoto||chosen;
  if(guideCrop){guidedPhotos.add(chosen);guidedPhotos.add(barcodeSource);}
  primaryBarcodePhoto=barcodeSource;alternatePhotoTask=alternatePhoto;
  barcodeJob=(preparedBarcode?Promise.resolve(preparedBarcode):
   (window.IUGeminiParallel?.barcode(barcodeSource)||
    Promise.resolve().then(()=>window.IUGeminiEAN?.read(barcodeSource)||null)))
   .catch(()=>null);
  // Start visual enhancement before launching the analysis event. No upload here.
  if(preparedEnhanced)cachedEnhanced={source:barcodeSource,promise:preparedEnhanced};
  void samePhotoEnhanced(barcodeSource);
  void samePhotoTask(chosen,true);
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
 if(providerSelect){
  try{providerSelect.value=localStorage.getItem(providerPreferenceKey)==='openai'?'openai':'gemini';}
  catch(_){providerSelect.value='gemini';}
  providerSelect.addEventListener('change',()=>{
   try{localStorage.setItem(providerPreferenceKey,providerSelect.value)}catch(_){}
  });
 }
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
 const classicBasket=$('basketSelect'),geminiBasket=$('iuGeminiBasketSelect');
 function syncGeminiBasket(){
  if(!classicBasket||!geminiBasket)return;
  // Les options (nom — 0,xxx kg) sont reprises à l'identique
  // du sélecteur de la pesée classique, y compris le menu iOS.
  const options=Array.from(classicBasket.options,option=>option.cloneNode(true));
  geminiBasket.replaceChildren(...options);
  geminiBasket.value=classicBasket.value;
 }
 if(classicBasket&&geminiBasket){
  syncGeminiBasket();
  classicBasket.addEventListener('change',()=>{syncGeminiBasket();validationState();});
  geminiBasket.addEventListener('change',()=>{
   classicBasket.value=geminiBasket.value;
   classicBasket.dispatchEvent(new Event('change',{bubbles:true}));
   });
  new MutationObserver(()=>{syncGeminiBasket();validationState();}).observe(classicBasket,{childList:true,subtree:true});
 }
 if(toggle)toggle.addEventListener('click',()=>{
  const opening=panel.hidden;
  panel.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));
  if(!opening){if(retainedSavedLabel)stopCamera();else clear();}
 });
 const decodedPhotos=new WeakMap();
 function decodePhoto(source){
  const existing=decodedPhotos.get(source);if(existing)return existing;
  const task=new Promise((resolve,reject)=>{
   const localUrl=URL.createObjectURL(source);
   const img=new Image();
   img.onload=()=>{URL.revokeObjectURL(localUrl);resolve(img);};
   img.onerror=()=>{URL.revokeObjectURL(localUrl);reject(Error('Format photo non pris en charge'));};
   img.src=localUrl;
  }).catch(error=>{decodedPhotos.delete(source);throw error;});
  decodedPhotos.set(source,task);return task;
 }
 // Une vue centrale complémentaire est dérivée de la même capture. Ne
 // jamais couper l'image originale : c'est le seul repère géométrique sûr.
 // L'agrandissement est facultatif pour préserver la latence sur iPhone.
 async function prepareLabelDetail(source,confirmedOptical=null){
  if(source?.type!=='image/jpeg'||source.size<100)return null;
  const img=await decodePhoto(source);
  const width=img.naturalWidth,height=img.naturalHeight;
  if(width<650||height<350)return null;
  // Conservons la vue d'origine intégrale, indépendamment du détail.
  // Les contours réels sont recherchés sur une miniature puis acceptés
  // UNIQUEMENT si suffisamment nets et entourés de marges.
  let cropX=guidedPhotos.has(source)?0:Math.round(width*.065),cropY=guidedPhotos.has(source)?0:Math.round(height*.07);
  let cropW=width-2*cropX,cropH=height-2*cropY;
  const geometry=window.IUGeminiLabelGeometry;
  if(geometry){
   let rect=null;
   try{
    // Un cadre de papier déjà confirmé par le lecteur EAN peut
    // repositionner aussi l'agrandissement sans seconde détection.
    rect=confirmedOptical?.labelRect&&
     geometry.barcodeWithinLabel?.(confirmedOptical,confirmedOptical.labelRect)
     ?confirmedOptical.labelRect:null;
    if(!rect)rect=geometry.opticalCrop(confirmedOptical,width,height);
    if(!rect){
     const thumb=document.createElement('canvas');
     const factor=Math.min(1,240/width);
     thumb.width=Math.max(1,Math.round(width*factor));
     thumb.height=Math.max(1,Math.round(height*factor));
     const cx=thumb.getContext('2d',{willReadFrequently:true});
     if(cx){
      cx.drawImage(img,0,0,thumb.width,thumb.height);
      rect=geometry.detect(cx.getImageData(0,0,thumb.width,thumb.height));
     }
    }
   }catch(_){rect=null;}
   if(rect&&rect.x>.005&&rect.y>.005&&
      rect.x+rect.w<.995&&rect.y+rect.h<.995){
    const proposed={x:Math.floor(rect.x*width),y:Math.floor(rect.y*height),
     w:Math.ceil(rect.w*width),h:Math.ceil(rect.h*height)};
    // Un contour incertain n'est jamais imposé à Gemini. Repli exact
    // sur le recadrage central de l'ancienne version.
    if(proposed.w>=480&&proposed.h>=260&&
       proposed.x>=0&&proposed.y>=0&&
       proposed.x+proposed.w<=width&&proposed.y+proposed.h<=height){
     cropX=proposed.x;cropY=proposed.y;
     cropW=proposed.w;cropH=proposed.h;
    }
   }
  }
  if(cropW<450||cropH<230)return null;
  const canvas=document.createElement('canvas');
  // Préserver jusqu'à 1 700 px de détails sans aucune interpolation.
  const scale=Math.min(1,1700/Math.max(cropW,cropH));
  canvas.width=Math.max(1,Math.round(cropW*scale));
  canvas.height=Math.max(1,Math.round(cropH*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,cropX,cropY,cropW,cropH,0,0,canvas.width,canvas.height);
  for(const quality of [.84,.77,.69,.57]){
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(!blob||blob.size<100||blob.size>122000)continue;
   const direct=window.IUGeminiTransport?.wrapJPEG?.(blob);
   if(direct&&direct.length<=165000)return direct;
   const encoded=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('Image détail illisible'));
    reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
    reader.readAsDataURL(blob);
   });
   if(encoded.length>=100&&encoded.length<=165000)return encoded;
  }
  return null;
 }
 // Le filtre tourne dans le Worker, seule la conversion du Blob final
 // en base64 reste ici ; jamais plus de 122 Ko par vue secondaire.
 async function readParallelDetail(blob){
  if(!blob||blob.size<100||blob.size>122000)return null;
  const direct=window.IUGeminiTransport?.wrapJPEG?.(blob);
  if(direct&&direct.length<=165000)return direct;
  const encoded=await new Promise((resolve,reject)=>{
   const reader=new FileReader();
   reader.onerror=()=>reject(Error('Détail amélioré illisible'));
   reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
   reader.readAsDataURL(blob);
  });
  return encoded.length>=100&&encoded.length<=165000?encoded:null;
 }
 async function imageBase64(source){
  // Le JPEG issu du viseur est déjà recadré, redimensionné et compressé.
  // Éviter une deuxième décompression/compression si l'image passe sous
  // la limite Cloudflare (surtout sur Safari iPhone).
  if(source?.name==='etiquette-gemini.jpg'&&source.type==='image/jpeg'&&
     source.size>=100&&source.size<=490000){
   const direct=window.IUGeminiTransport?.wrapJPEG?.(source);
   if(direct&&direct.length<=690000)return direct;
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
  const scale=Math.min(1,1920/Math.max(img.naturalWidth,img.naturalHeight));
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
 function renderEanBars(container,ean,officialPLU){
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
  // Le PLU vient exclusivement du catalogue importé : aucune déduction
  // à partir de chiffres du préfixe ou d'une association apprise.
  if(/^\d{1,8}$/.test(String(officialPLU||''))){
   const plu=addDigit(String(officialPLU),0,0,'iu-gemini-ean-plu');
   plu.setAttribute('text-anchor','middle');
   plu.setAttribute('dominant-baseline','middle');
   plu.setAttribute('font-size',String(officialPLU.length<=4?12:officialPLU.length<=6?9:6.5));
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
  const digiMatch=window.IUDigiCatalogLookup?.resolve(String(fields.ean13||''));
  const identityConflict=Boolean(digiMatch?.ok&&[result?.printedName,fields.name].some(n=>window.IUDigiCatalogLookup?.nameIdentityConflict?.(n,digiMatch.eanPrefix)));
  const name=identityConflict?'ARTICLE À VÉRIFIER':digiMatch?.ok?digiMatch.name:'ARTICLE NON IDENTIFIÉ';
  const nameNode=add(label,'div','iu-gemini-label-name',name);
  if(identityConflict){
   nameNode.title='Nom lu : '+(result.printedName||fields.name||'—')+' · Catalogue : '+digiMatch.name;
  }else if(digiMatch?.ok){
   nameNode.title='Catalogue DIGI · PLU '+digiMatch.plu;
   label.setAttribute('aria-label','Étiquette virtuelle · '+digiMatch.name+
    ' · PLU '+digiMatch.plu+' · à comparer à la photo');
  }
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
  if(ready)renderEanBars(bars,corrected.ean,verified.plu);
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
  updateCardState(ready?'review':'retry');
  if(!proposal)resetProposal();
  validationState();refreshRepairPanel();
  if(result?.source==='local'){
   networkTime.textContent='OCR local · 2 lectures concordantes · aucune image envoyée'
    +' · '+(wallMs/1000).toFixed(2)+' s';
  }else{
   const usedModel=String(result?.model||fixedModel);
   const usedProvider=usedModel.startsWith('gpt-')?'OpenAI':'Gemini';
   networkTime.textContent=usedProvider+' · lecture principale : '+(Number(result.elapsedMs)/1000).toFixed(2)+' s'
    +' · photo + réseau : '+(wallMs/1000).toFixed(2)+' s'
    +(Number.isFinite(result.clientNetworkMs)?' · échange '+(result.clientNetworkMs/1000).toFixed(2)+' s':'')
    +(result.networkStats?.retries?' · '+result.networkStats.retries+' réessai(s) 503':'')
    +(result.timing?' · préparation '+result.timing.preparationMs+' ms · première réponse '+result.timing.firstResponseMs+' ms · relecture '+result.timing.recoveryMs+' ms · analyse '+result.timing.totalMs+' ms'+(result.timing.captureMs!==null?' · capture '+result.timing.captureMs+' ms':''):'')
    +(result.requestTimings?.length?' · réseau '+result.requestTimings.map((x,i)=>(i+1)+': préparation '+x.packetMs+' / réponse '+x.headersMs+' / JSON '+x.parseMs+' / Worker '+(x.workerMs??'—')+' ms'+(x.server?' (entrée '+x.server.ingressMs+' / Google '+x.server.upstreamMs+' / retour '+(x.server.responseMs??0)+' / traitement '+x.server.processingMs+' ms)':'')+' · '+(x.tier||'non confirmé')).join(' ; '):'')
    +(result.visualFirst?' · détail 1 : '+result.visualFirst:'')
    +(result.visualRecheck?' · détail 2 : '+result.visualRecheck:'')
    +(result.localDiagnostics?' · '+Object.entries(result.localDiagnostics).map(([k,v])=>k+' '+v).join(' / '):'')
    +(result.networkFailure?' · '+String(result.networkFailure.stage||'réseau')+' / '+Number(result.networkFailure.attempts||0)+' tentative(s)':'')
    +(result.digiPlan?' · DIGI : '+result.digiPlan.candidateCount+' candidat(s), '+result.digiPlan.observationCount+' observations, '+result.digiPlan.barRows+' lignes':'')
    +(result.digiDigitHint?' · OCR chiffres (indice) '+result.digiDigitHint:'')
    +(result.digiAdvancedHint?' · Advanced '+result.digiAdvancedHint.elapsedMs+' ms · indices '+[result.digiAdvancedHint.pattern?'EAN '+result.digiAdvancedHint.pattern:null,...Object.entries(result.digiAdvancedHint.fields||{}).map(([k,x])=>({weight:'poids ',rate:'€/kg ',total:'montant '}[k]||'')+x.text)].filter(Boolean).join(' / '):'')
    +(result.digiPlan?.positions?.length?' · EAN positions '+result.digiPlan.positions.join(', '):'')
    +(result.digiPlan?.ranges?.weight?' · plage poids '+result.digiPlan.ranges.weight.min+'–'+result.digiPlan.ranges.weight.max+' g':'')
    +(result.digiPlan?.ranges?.rate?' · plage tarif '+result.digiPlan.ranges.rate.min+'–'+result.digiPlan.ranges.rate.max+' ct/kg':'')
    +(Number.isFinite(result.clientPayloadBytes)?' · '+Math.round(result.clientPayloadBytes/1024)+' Kio '+(result.clientTransport||''):'')
    +' · modèle '+usedModel
    +(result.pipelineVersion===2?' · lecture renforcée':' · Worker Cloudflare à actualiser')
    +(result.transport==='binary-v1'?'':' · transport amélioré : Worker à actualiser')
    +(result?.digiRecovery?.kind==='reconstructed'?' · EAN récupéré par DIGI'
      :result?.digiRecovery?.kind==='confirmed'?' · article confirmé'
      :result?.digiRecovery?.kind==='confirmation'?' · confirmation DIGI requise'
      :result?.digiRecovery?.sources?.total==='calculated'?' · montant calculé':'');
  }
 }
 window.addEventListener('iu-digi-catalog-updated',()=>{
  if(!active&&lastRawResult)display(lastRawResult,0);
 });
 window.addEventListener('storage',event=>{
  if(event.key==='iu-plu-catalogue-local-v1'&&!active&&lastRawResult)
   display(lastRawResult,0);
 });
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
 async function requestGeminiWithRecovery(encoded,access,selectedModel,signal,id,focusField=null,
  provider='gemini',detailImageBase64=null,focusFields=null,catalogCandidates=null,digiPositions=null,budgetMs=13000){
  const payload={type:'iu-gemini-label-test',model:selectedModel,provider,
   mimeType:'image/jpeg',imageBase64:encoded,budgetMs,
   ...(detailImageBase64?{detailImageBase64}:{}),
   ...(focusField?{focusField}:{}),
   ...(focusFields?.length?{focusFields}:{}),
   ...(catalogCandidates?.length?{catalogCandidates:catalogCandidates.slice(0,5)}:{}),
   ...(digiPositions?.length?{digiPositions:digiPositions.slice(0,13)}:{})};
  const transport=typeof window!=='undefined'?window.IUGeminiTransport:null;
  const networkNow=()=>typeof performance!=='undefined'?performance.now():Date.now();
  const packingStart=networkNow();
  const packet=transport?.prepareAsync?await transport.prepareAsync(payload):transport?.prepare(payload)||{body:JSON.stringify(payload),contentType:'application/json'};
  // One request per logical reading. Only an explicit unreadable response
  // may trigger a complementary view in the outer analysis; no blind retry.
  if(signal.aborted||id!==generation)
   throw new DOMException('Analyse annulée','AbortError');
  let response;
  const networkStart=networkNow(),packetMs=Math.round(networkStart-packingStart);
  try{
   response=await fetch(endpoint,{
    method:'POST',signal,
    headers:{'Content-Type':packet.contentType,'X-IU-Pilot-Key':access},
    body:packet.body
   });
  }catch(error){
   if(signal.aborted||id!==generation||error?.name==='AbortError')throw error;
   throw Error('Connexion interrompue · réessaie cette photo');
  }
  if(signal.aborted||id!==generation)
   throw new DOMException('Analyse annulée','AbortError');
  const headersMs=Math.round(networkNow()-networkStart),parseStart=networkNow();
  let result;
  try{result=await response.json()}
  catch(_){
   // Un refus réseau/CDN non JSON ne signifie pas qu'un chiffre est
   // illisible. Montrer le code HTTP sans exposer de données sensibles.
   throw Error('Réponse Cloudflare illisible (HTTP '+response.status+') · réessaie cette photo');
  }
  if(response.ok){
   transport?.observe(result);
   const ms=Math.round(networkNow()-networkStart),parseMs=Math.round(networkNow()-parseStart);
   const protocol=packet.compressed?'gzip-binary':packet.contentType==='application/octet-stream'?'binary':'json';
   const tier=['priority','standard'].includes(result.serviceTier)?result.serviceTier:'non confirmé';
   const requested=['priority','standard'].includes(result.requestedTier)?result.requestedTier:'non communiqué';
   try{
    networkSamples.push({ms,bytes:packet.size??null,transport:protocol,tier,requested,server:result.serverTimings||null});
    if(networkSamples.length>100)networkSamples.shift();
    renderNetworkDiagnostic();
   }catch(_){}
   return {...result,clientNetworkMs:ms,
    clientPayloadBytes:packet.size??null,clientTransport:protocol,
    requestTimings:[{packetMs,headersMs,parseMs,workerMs:Number.isFinite(result.elapsedMs)?result.elapsedMs:null,server:result.serverTimings||null,tier,requested}]};
  }
  if(response.status===400||response.status===415)transport?.reset();
  const status=response.status,providerStatus=Number(result?.providerStatus);
  const diagnostic=String(result?.error||'');
  const unreadable=status===422||
   /Réponse Gemini non exploitable|Réponse Gemini incomplète|Réponse Gemini vide|limite de génération|JSON non reconnu/i.test(diagnostic);
  if(unreadable){const e=Error('Étiquette non lue · réessaie cette photo');e.unreadable=true;throw e;}
  if(provider==='openai'&&diagnostic.includes('OPENAI_API_KEY'))
   throw Error('OpenAI non configuré sur Cloudflare · utilise Gemini en attendant');
  if([401,403].includes(status)||[401,403].includes(providerStatus))
   throw Error(provider==='openai'?'Accès OpenAI refusé · vérifie la clé API dans Cloudflare':'Accès Gemini refusé · vérifie la clé');
  if(status===429||providerStatus===429)
   throw Error('Quota '+(provider==='openai'?'OpenAI':'Gemini')+' atteint · réessaie plus tard');
  if(status===400||status===413)
   throw Error('Photo non acceptée · reprends une photo');
  if(status===404||providerStatus===404)
   throw Error('Modèle '+(provider==='openai'?'OpenAI':'Gemini')+' indisponible');
  if(status===504||providerStatus===504){
   const e=Error('Délai Gemini dépassé (504) · photo conservée');e.transient=true;e.timeout=true;e.networkStats=result?.networkStats||{stage:'timeout',attempts:1};throw e;
  }
  if(status===503||providerStatus===503){
   const stats=result?.networkStats||{};
   const e=Error(stats.stage==='circuit_open'?'Gemini saturé · photo conservée, réessaie dans quelques secondes':
    providerStatus?'Gemini temporairement indisponible (503) · photo conservée':
    'Liaison Cloudflare–Gemini indisponible (503) · photo conservée');
   e.networkStats=stats;e.transient=true;throw e;
  }
  if(status>=500&&status<=599)
   throw Error('Erreur du service Gemini (HTTP '+status+
    (providerStatus?' / fournisseur '+providerStatus:'')+') · réessaie cette photo');
  throw Error('Service IA : réponse inattendue (HTTP '+status+') · réessaie cette photo');
 }
 // Une seule relecture groupée de la photo existante, y compris quand
 // plusieurs champs manquent ; jamais de nouvelle prise automatique.
 function readableValue(kind,value){
  if(kind==='name')return typeof value==='string'&&value.trim().length>=3;
  if(kind==='ean')return typeof value==='string'&&/^\d{13}$/.test(value)&&
   eanCheck(value.slice(0,12))===value[12];
  return Number.isSafeInteger(value)&&(kind==='total'?value>=0:value>0);
 }
 function recoveryTargets(result){
  const f=result?.fields||{},checks=fieldsChecks(f),targets=[];
  for(const [kind,key] of Object.entries(fieldKeys)){
   if(kind==='name')continue; // Nom exclusivement depuis le catalogue DIGI.
   if(!readableValue(kind,f[key]))targets.push(kind);
  }
  if(readableValue('ean',f.ean13)){
   const ref=window.IUDigiCatalogLookup?.resolve(f.ean13);
   if(ref?.status==='unknown')targets.push('ean');
  }
  const allAmounts=['weight','rate','total'].every(k=>readableValue(k,f[fieldKeys[k]]));
  if(allAmounts&&!checks.arithmeticConsistent)targets.push('weight','rate','total');
  if(checks.barcodePriceConsistent===false)targets.push('ean','total');
  if(checks.independentMismatch||result?.checks?.independentMismatch)targets.push('ean');
  if(result?.checks?.digiConflict){
   const kind=result.digiRecovery?.conflictField;
   if(kind==='name')targets.push('name','ean');
   else if(kind==='amount')targets.push('weight','rate','total','ean');
   else targets.push('ean');
  }
  // Une proposition DIGI ambiguë bénéficie de l'unique relecture
  // ciblée existante : lire les positions qui départagent les codes.
  // Si le réseau échoue, une confirmation humaine reste possible.
  if(result?.digiRecovery?.kind==='confirmation')targets.push('ean');
  // Quand Safari ne décode pas le code-barres indépendamment, la
  // deuxième lecture Gemini vérifie ces 13 chiffres sans nouvelle photo.
  // Un EAN contradictoire bloque l'enregistrement au lieu de choisir
  // arbitrairement une lecture cohérente par hasard.
  if(!trustedBarcodeEvidence(localBarcode)&&readableValue('ean',f.ean13)&&
     result?.digiRecovery?.kind!=='reconstructed'&&result?.digiRecovery?.kind!=='confirmed'&&
     result?.checks?.eanRechecked!==true)
   targets.push('ean');
  return [...new Set(targets)];
 }
 // OCR des chiffres imprimés : deux bandes, checksum, catalogue DIGI
 // et cohérence du montant. Une seule lecture OCR non confirmée ne doit
 // jamais transformer un EAN supposé en identité d'article.
 function applyPrintedEAN(result,printed){
  if(!result||!printed?.ean13||printed.ambiguous)return result;
  const incoming=String(result.fields?.ean13||'');
  const conflict=readableValue('ean',incoming)&&
   incoming!==printed.ean13;
  const opticalTrusted=trustedBarcodeEvidence(localBarcode);
  const checks={...(result.checks||{}),
   printedEANChecked:true,printedEANConflict:conflict};
  // Un OCR secondaire divergent, même très confiant, ne suffit
  // pas à annuler une lecture complète de Gemini : la relecture
  // habituelle et les contrôles DIGI décident.
  if(conflict)checks.secondaryEANConflict=true;
  const inspected={...result,checks};
  // Le code optique confirmé reste prioritaire. Une contradiction
  // ne peut être tranchée par l'OCR seul.
  if(opticalTrusted||localBarcode?.ambiguous||conflict||
     printed.confirmed!==true||printed.evidenceCount<2||
     !readableValue('ean',printed.ean13))return inspected;
  const digi=window.IUDigiCatalogLookup?.resolve(printed.ean13);
  if(!digi?.ok)return inspected;
  // Pour le code DIGI à prix variable, vérifier aussi les 5 chiffres
  // du montant encodé : un checksum seul ne suffit pas.
  const cents=result.fields?.totalCents;
  if(printed.ean13.startsWith('02')&&Number.isSafeInteger(cents)&&
     Math.abs(Math.round(Number(printed.ean13.slice(7,12))*100/655.36)
      -cents)>1)return inspected;
  const mask=result.eanObserved;
  if(typeof mask==='string'&&/^[\d?]{13}$/.test(mask)&&
     [...mask].some((d,i)=>d!=='?'&&d!==printed.ean13[i]))return inspected;
  localBarcode={ean13:printed.ean13,source:'printed-ocr',
   confirmed:true,ambiguous:false,evidenceCount:2};
  return reconcileBarcode({...inspected,eanObserved:printed.ean13},localBarcode);
 }
 function mergeRecoveredReading(original,recheck,targets){
  const fields={...(original?.fields||{})};
  let conflict=false,opticallyConfirmed=false,eanRechecked=false,nameRechecked=false;
  let recovery=original?.digiRecovery,observed=original?.eanObserved;
  let provenance=original?.recoveryProvenance;
  for(const kind of targets){
   const key=fieldKeys[kind],next=recheck?.fields?.[key];
   if(!readableValue(kind,next))continue;
   const current=fields[key];
   if(!readableValue(kind,current)){
    fields[key]=next;
    if(kind==='ean'){observed=next;eanRechecked=true;recovery=null;}
    continue;
   }
   if(kind==='total'&&(recovery?.sources?.total==='calculated'||provenance?.total==='calculated')&&
      Math.abs(current-next)<=1){
    fields[key]=next;recovery=recovery?{...recovery,sources:{...recovery.sources,total:'read'}}:null;
    provenance=provenance?{...provenance,total:'read'}:null;
    continue;
   }
   if(current===next){
    if(kind==='ean'){observed=next;eanRechecked=true;}
    continue;
   }
   // Une première proposition DIGI ne doit jamais battre un code
   // réellement relu, ni un nom officiel relu sur l'étiquette.
   if(kind==='name'&&original?.digiRecovery?.conflictField==='name'){
    const official=window.IUDigiCatalogLookup?.resolve(fields.ean13);
    const normalize=window.IUDigiCatalogLookup?.normalizeName;
    if(official?.ok&&normalize&&normalize(next)===normalize(official.name)){
     fields[key]=next;nameRechecked=true;continue;
    }
   }
   // Remplacer un EAN seulement si la seconde lecture Gemini ET le
   // décodeur optique indépendant confirment les mêmes 13 chiffres.
   if(kind==='ean'&&trustedBarcodeEvidence(localBarcode)&&
      localBarcode.ean13===next){
    fields[key]=next;opticallyConfirmed=true;observed=next;eanRechecked=true;recovery=null;
   }else{
    // Deux lectures contradictoires ne deviennent pas vraies par un calcul.
    conflict=true;
   }
  }
  return {...original,fields,printedName:original?.printedName||original?.fields?.name||recheck?.fields?.name||null,eanObserved:observed,digiRecovery:recovery,recoveryProvenance:provenance,source:'gemini-recovery',
   pipelineVersion:recheck?.pipelineVersion||original?.pipelineVersion,
   elapsedMs:Number(original?.elapsedMs||0)+Number(recheck?.elapsedMs||0),
   networkStats:{attempts:Number(original?.networkStats?.attempts||0)+Number(recheck?.networkStats?.attempts||0),
    retries:Number(original?.networkStats?.retries||0)+Number(recheck?.networkStats?.retries||0),
    upstream503:Number(original?.networkStats?.upstream503||0)+Number(recheck?.networkStats?.upstream503||0),
    waitMs:Number(original?.networkStats?.waitMs||0)+Number(recheck?.networkStats?.waitMs||0),stage:recheck?.networkStats?.stage||'google_http'},
   clientNetworkMs:Number(original?.clientNetworkMs||0)+Number(recheck?.clientNetworkMs||0),
   clientPayloadBytes:Number(original?.clientPayloadBytes||0)+Number(recheck?.clientPayloadBytes||0),
   clientTransport:original?.clientTransport===recheck?.clientTransport?original?.clientTransport:'mixte',
   requestTimings:[...(original?.requestTimings||[]),...(recheck?.requestTimings||[])],
   checks:{...(original?.checks||{}),
    readingConflict:Boolean(original?.checks?.readingConflict||conflict),
    eanRechecked:eanRechecked||original?.checks?.eanRechecked===true,
    digiConflict:nameRechecked?false:original?.checks?.digiConflict===true,
    independentMismatch:opticallyConfirmed?false:original?.checks?.independentMismatch===true}};
 }
 analyze.addEventListener('click',async()=>{
  if(analyze.disabled||!file)return;
  const selectedModel=fixedModel,access=pilotKey.value.trim();
  // Ce pilote de rapidité/fiabilité n'utilise qu'un seul moteur IA.
  const selectedProvider='gemini';
  const providerName=selectedProvider==='openai'?'OpenAI':'Gemini';
  const targetField=repairFocus&&lastRawResult?repairFocus:null;
  const resumeFields=!targetField&&lastRawResult?.checks?.recoveryInterrupted&&
   (lastRawResult.source!=='local-network-recovery'||trustedBarcodeEvidence(localBarcode))&&
   Array.isArray(lastRawResult.checks.recoveryInterruptedTargets)?lastRawResult.checks.recoveryInterruptedTargets.filter(k=>Object.prototype.hasOwnProperty.call(fieldKeys,k)):null;
  const oldResult=targetField||resumeFields?.length?lastRawResult:null;
  attempts.add(selectedModel);active=true;lastReadProblem=null;lastAnalysisError=null;
  setLabelAlert('working','Analyse…');
  updateButton();setAnalysisCameraClosed(true);
   // Nouvelle lecture verrouillée jusqu'à validation ou erreur de reconnaissance.
  // Laisser l'étiquette vierge affichée jusqu'au remplacement par le résultat.
  output.hidden=false;networkTime.textContent='';resetProposal();
  updateCardState('working');
  if(cameraStream&&cameraMode==='auto')setAutoHint('Analyse en cours · une seule photo envoyée','capturing');
  const id=++generation;
  abort=new AbortController();
  const currentAbort=abort;
  const guard=setTimeout(()=>currentAbort.abort(),24000);
  const start=performance.now();
  let advancedJob=null;
  say('Préparation puis envoi d’une seule photo à '+providerName+'…');
  try{
   // Gemini reçoit immédiatement l'image la plus complète possible.
   // Le décodeur EAN-13 travaille EN PARALLÈLE, sans retarder l'appel
   // réseau ni recadrer la photo pour ne pas couper les chiffres.
   const job=barcodeJob||
    (window.IUGeminiParallel?.barcode(file)||
     Promise.resolve().then(()=>window.IUGeminiEAN?.read(file)||null))
     .catch(()=>null);
   barcodeJob=job;
   // Lorsqu'un EAN est déjà disponible avant Gemini, envoyer sa SEULE
   // référence officielle sans attendre ZXing ni retarder le réseau.
   let opticalReady=null;
   void job.then(reading=>{if(id===generation)opticalReady=reading;});
   const detailTask=samePhotoTask(file,true);
   const sourcePhoto=primaryBarcodePhoto||file;
   const track=promise=>{
    const since=performance.now(),task=latency?latency.track(promise):{done:false,value:null,promise:Promise.resolve(promise).catch(()=>null)};
    void task.promise.then(value=>{task.done=true;task.value=value??null;task.ms=Math.round(performance.now()-since);});
    return task;
   };
   const until=(task,deadline)=>latency?latency.until(task,deadline):
    task?Promise.race([task.promise,new Promise(resolve=>setTimeout(()=>resolve(null),Math.max(0,deadline-performance.now())))]):Promise.resolve(null);
   const opticalTask=track(job);
   const normalView={kind:'original',task:track(detailTask)};
   const enhancedView={kind:'amélioré',task:track(samePhotoEnhanced(sourcePhoto,localBarcode))};
   let printedJob=null,partialJob=null,paddleJob=null,alternateJob=null,digitJob=null,earlyPartialJob=null;
   const stillCurrent=()=>id===generation&&active&&!currentAbort.signal.aborted;
   function startPrinted(){
    if(printedJob||!stillCurrent()||targetField||localBarcode?.ambiguous||
       trustedBarcodeEvidence(localBarcode)||!window.IUGeminiPrintedEAN)return;
    printedJob=track((async()=>{
     const TextDetector=window.TextDetector||null;
     if(printedBusy||localOcrBusy)return null;
     printedBusy=true;
     try{
      const engine=TextDetector?null:await ensureLocalOcr();
      if(!stillCurrent()||(!engine&&!TextDetector))return null;
      return await window.IUGeminiPrintedEAN.read(sourcePhoto,{
       engine,TextDetector,hint:guideHint(sourcePhoto,localBarcode),verifyTwice:true
      });
     }finally{printedBusy=false;}
    })());
   }
   function startLocalRecovery(reading){
    if(!stillCurrent()||targetField||reading?.ambiguous||trustedBarcodeEvidence(reading))return;
    startPrinted();
    if(!partialJob)partialJob=earlyPartialJob||track(window.IUGeminiParallel?.partial?.(sourcePhoto)||null);
    if(!digitJob)digitJob=track(window.IUGeminiParallel?.digits?.(sourcePhoto,guideHint(sourcePhoto,reading))||null);
    if(!paddleJob){
     const engine=window.IULiteRTLab?.enabled?.()?window.IULiteRTLab:window.IUPaddleLab;
     paddleJob=track(engine?.read?.(sourcePhoto,guideHint(sourcePhoto,reading))||null);
    }
    if(!alternateJob&&alternatePhotoTask)alternateJob=track(Promise.resolve(alternatePhotoTask).then(photo=>
     photo&&stillCurrent()?window.IUGeminiParallel?.barcode(photo):null));
   }
   // L'échec optique déclenche les secours aussitôt, pendant Gemini.
   // Si ZXing est lent, OCR imprimé et réseau peuvent déjà progresser.
   void opticalTask.promise.then(reading=>{
    if(stillCurrent()){opticalReady=reading;startLocalRecovery(reading);}
   });
   const earlyTimer=setTimeout(()=>{
    if(stillCurrent()&&!opticalTask.done){
     startPrinted();
     if(!targetField&&window.IUGeminiParallel?.parallelCapacity?.()&&!trustedBarcodeEvidence(localBarcode)&&!localBarcode?.ambiguous){
      // Préparer uniquement les barres sans modifier le seuil d'utilisation.
      // Le résultat ne devient une preuve qu'au déclenchement historique
      // de startLocalRecovery ; Nano conserve ses indications optiques.
      if(!earlyPartialJob&&!partialJob)earlyPartialJob=track(window.IUGeminiParallel.partial?.(sourcePhoto)||null);
     }
    }
   },220);
   void opticalTask.promise.then(()=>clearTimeout(earlyTimer));
   const detailDeadline=performance.now()+(lastSelectedQuality&&Object.values(lastSelectedQuality).some(r=>Number.isFinite(r)&&r<.45)?360:280);
   const encoded=await samePhotoTask(file);
   const safeDetail=detail=>detail&&detail.length+encoded.length<=750000?detail:null;
   const firstDetail=await chooseVisualDetail(enhancedView,normalView,detailDeadline,until,safeDetail);
   if(id!==generation||currentAbort.signal.aborted)throw new DOMException('Analyse annulée','AbortError');
   const preparationMs=Math.round(performance.now()-start);
   say(providerName+' analyse l’étiquette…');
   const receivedTask=requestGeminiWithRecovery(
    encoded,access,selectedModel,abort.signal,id,targetField,selectedProvider,
    safeDetail(firstDetail?.data),targetField?[targetField]:resumeFields?.length?resumeFields:null,
    catalogHints(oldResult,opticalReady),
    resumeFields?.includes('ean')?(oldResult?.digiPlan?.positions||window.IUDigiCatalogLookup?.recheckPlan?.(oldResult)?.positions):null);
   // Start only after the primary Gemini request has been issued. No await
   // on Advanced, no additional cloud call and no modified cloud JPEG.
   advancedJob=track(window.IUDigiAdvanced?.read?.(sourcePhoto,guideHint(sourcePhoto,opticalReady))||null);
   // Prepare focused crops in parallel with the primary network request.
   const focusEAN={kind:'EAN ciblé',task:track(samePhotoFocus(sourcePhoto,'ean',opticalReady))};
   const focusNumbers={kind:'chiffres ciblés',task:track(samePhotoFocus(sourcePhoto,'numbers',opticalReady))};
   let received,usedComplementaryRead=false,recheckView=null;
   try{received=await receivedTask;}
   catch(error){
    // A 422 is not a network failure. Try one DIFFERENT visual view,
    // with the original JPEG still present, without another user click.
    if((!error?.unreadable&&!error?.timeout)||id!==generation||currentAbort.signal.aborted||performance.now()-start>17500)throw error;
    const deadline=performance.now()+280;
    const firstEnhanced=firstDetail?.kind==='amélioré';
    recheckView=await chooseVisualDetail(firstEnhanced?normalView:enhancedView,
     firstEnhanced?enhancedView:normalView,deadline,until,safeDetail,firstDetail?.data||null);
    if((!recheckView&&!error?.timeout)||id!==generation||currentAbort.signal.aborted)throw error;
    usedComplementaryRead=true;
    say(providerName+' · seconde vue préparée…');
    received=await requestGeminiWithRecovery(encoded,access,selectedModel,currentAbort.signal,id,targetField,selectedProvider,
     recheckView?.data||null,targetField?[targetField]:resumeFields?.length?resumeFields:null,
     catalogHints(oldResult,opticalReady),resumeFields?.includes('ean')?(oldResult?.digiPlan?.positions||window.IUDigiCatalogLookup?.recheckPlan?.(oldResult)?.positions):null,
     Math.max(3000,Math.min(9000,Math.floor(22500-(performance.now()-start)))));
   }
   const firstResponseMs=Math.round(performance.now()-start);
   if(id!==generation)return;
   // Attendre brièvement la lecture locale après Gemini ; jamais de long
   // délai imposé si le décodeur Safari n'a pas trouvé l'EAN.
   // Une seule échéance pour les vérifications locales.
   const localDeadline=performance.now()+350;
   if(!localBarcode){
    const independent=await until(opticalTask,localDeadline);
    if(id!==generation)return;
    if(independent)localBarcode=independent;
   }
   let combined={...received,printedName:received?.fields?.name||null};
   if(targetField&&oldResult){
    const key=fieldKeys[targetField];
    const value=received?.fields?.[key];
    combined=value!==null&&value!==undefined&&value!==''
     ?{...oldResult,fields:{...oldResult.fields,[key]:value},
       source:'gemini-focused',focusField:targetField}
     :{...oldResult,source:'gemini-focused',focusField:targetField};
    if(targetField==='ean'){
     // Ne pas conserver la déduction d'une ancienne lecture ciblée.
     if(readableValue('ean',value))combined={...combined,eanObserved:value,
      digiRecovery:null,recoveryProvenance:null,
      checks:{...combined.checks,eanRechecked:true,digiConflict:false}};
     else combined=fuseEAN(combined,received?.eanObserved);
    }else if(value!==null&&value!==undefined&&value!==''){
     // Recalcul du montant dérivé lorsque poids ou tarif est relu.
     if(targetField==='total')combined={...combined,digiRecovery:null,recoveryProvenance:null};
     else if(oldResult.digiRecovery?.sources?.total==='calculated')
      combined={...combined,fields:{...combined.fields,totalCents:null},digiRecovery:null};
    }
   }
   if(resumeFields?.length&&oldResult){
    combined=mergeRecoveredReading(oldResult,received,resumeFields);
    const pending=resumeFields.filter(k=>!readableValue(k,received?.fields?.[fieldKeys[k]]));
    combined={...combined,checks:{...combined.checks,recoveryInterrupted:pending.length>0,recoveryInterruptedTargets:pending}};
    if(resumeFields.includes('ean'))combined=fuseEAN(combined,received?.eanObserved);
    if(pending.length===0)combined={...combined,networkFailure:null};
   }
   // Comparer les chiffres indépendamment, sans jamais remplacer un
   // EAN Gemini confirmé et contradictoire par simple supposition.
   combined=reconcileBarcode(combined,localBarcode);
   combined=applyCatalogRecovery(combined);
   let targets=!targetField?recoveryTargets(combined):[];
   if(resumeFields?.length)targets=[]; // pas de deuxième reprise automatique
   const unresolvedEAN=(targets.includes('ean')||combined.digiRecovery?.kind==='confirmation')&&
    !readableValue('ean',combined.fields?.ean13)&&
    !combined.checks?.readingConflict&&!combined.checks?.independentMismatch;
   if(unresolvedEAN)startLocalRecovery(localBarcode);
   if((targets.includes('ean')||combined.digiRecovery?.kind==='confirmation')&&
      !localBarcode?.ambiguous&&!trustedBarcodeEvidence(localBarcode)){
    startPrinted();
    const printedFast=await until(printedJob,localDeadline);
    if(id!==generation)return;
    if(printedFast?.ean13)combined=applyPrintedEAN(combined,printedFast);
    if(printedFast?.pattern)combined=fuseEAN(combined,printedFast.pattern);
    combined=applyCatalogRecovery(combined);
    targets=targetField||resumeFields?.length?[]:recoveryTargets(combined);
   }
   if(!targetField&&!localBarcode&&targets.length===1&&targets[0]==='ean'){
    const finalOptical=await until(opticalTask,localDeadline);
    if(id!==generation)return;
    if(finalOptical){
     localBarcode=finalOptical;
     combined=reconcileBarcode(combined,localBarcode);
     combined=applyCatalogRecovery(combined);
     targets=recoveryTargets(combined);
    }
   }
   async function consumeLocalEvidence(result,deadline){
    const [partial,paddle,alternate]=await Promise.all([
     until(partialJob,deadline),until(paddleJob,deadline),until(alternateJob,deadline)]);
    if(id!==generation)return result;
    if(readableValue('ean',result.fields?.ean13))return result;
    if(partial?.pattern){
     const next=fuseEAN(result,partial.pattern);
     result=partial.disagreement&&next!==result?{...next,weakEANSupplement:true}:next;
    }
    // Un moteur expérimental ou une image voisine ne peut inventer
    // un préfixe, ni apporter une identité sans preuves principales.
    // Paddle et une autre image sont encore moins probants : ne
    // compléter que des positions déjà largement corroborées.
    if(paddle?.pattern&&result.eanObserved){
     const corroborated=core?.corroborate(result.eanObserved,paddle.pattern);
     if(corroborated?.used){
      const next=fuseEAN(result,corroborated.pattern);
      if(next!==result)result={...next,weakEANSupplement:true};
     }
    }
    if(alternate?.confirmed&&alternate.ean13&&result.eanObserved){
     const corroborated=core?.corroborate(result.eanObserved,alternate.ean13);
     if(corroborated?.used){
      const next=fuseEAN(result,corroborated.pattern);
      if(next!==result)result={...next,weakEANSupplement:true};
     }
    }
    return applyCatalogRecovery(result);
   }
   if((partialJob||paddleJob||alternateJob)&&!readableValue('ean',combined.fields?.ean13)){
    combined=await consumeLocalEvidence(combined,localDeadline);
    if(id!==generation)return;
    targets=recoveryTargets(combined);
   }
   if(usedComplementaryRead&&targets.length){
    // The first call returned no usable fields: a later result alone is
    // not a second independent EAN verification. Keep that gate closed.
    combined={...combined,checks:{...combined.checks,recoveryInterrupted:true,recoveryInterruptedTargets:[...targets]}};
   }
   if(resumeFields?.length||usedComplementaryRead)targets=[];
   if(targets.length){
    // The synthetic-trained OCR is an advisory observation only. Never fuse its mask into the primary reading.
    const observations=[partialJob?.value,paddleJob?.value,alternateJob?.value,printedJob?.value,digitJob?.value,advancedJob?.value].filter(Boolean);
    try{
     const history=window.IUDigiRecentReferences?.()||[];
     combined={...combined,digiDigitHint:digitJob?.value?.pattern||null,digiPlan:window.IUDigiCatalogLookup?.solveHypotheses?.(combined,{observations,history})};
    }catch(_){}
   }
   let recoveryMs=0;
   if(targets.length){
    const recoveryStart=performance.now();
    // Une seule relecture de tous les champs problématiques sur cette
    // MEME photo. Ne pas perdre les valeurs fiables de la première.
    try{
     say(providerName+' · vérification de '+targets.length+' champ(s)…');
     // Prefer a complementary view: if Gemini already saw the enhanced
     // crop, provide unfiltered pixels. Otherwise prioritize the ready
     // enhanced crop; never let the cached normal crop win a race.
     const opticalDetail=trustedBarcodeEvidence(localBarcode)&&localBarcode?.bounds?
      samePhotoGuided(file,localBarcode):detailTask;
     const guidedView={kind:'original',task:track(opticalDetail)};
     const firstEnhanced=firstDetail?.kind==='amélioré';
     const detailEnd=performance.now()+220;
     const onlyEAN=targets.every(k=>k==='ean'),onlyNumbers=targets.every(k=>['weight','rate','total'].includes(k));
     const focusedView=onlyEAN?focusEAN:onlyNumbers?focusNumbers:null;
     recheckView=await chooseVisualDetail(focusedView||(firstEnhanced?guidedView:enhancedView),
      firstEnhanced?guidedView:enhancedView,detailEnd,until,safeDetail,firstDetail?.data||null);
     if(performance.now()-start>18500)throw Error('Budget de relecture épuisé');
     // If the same picture is the only available detail, keep the useful
     // crop and existing focused prompt rather than sending no detail.
     if(!recheckView)recheckView=await chooseVisualDetail(firstEnhanced?guidedView:enhancedView,
      normalView,detailEnd,until,safeDetail);
     if(id!==generation||currentAbort.signal.aborted)throw new DOMException('Analyse annulée','AbortError');
     const focused=await requestGeminiWithRecovery(
      encoded,access,selectedModel,abort.signal,id,null,selectedProvider,
      safeDetail(recheckView?.data),targets,
      catalogHints(combined,localBarcode),
      targets.includes('ean')?(combined.digiPlan?.positions||window.IUDigiCatalogLookup?.recheckPlan?.(combined)?.positions):null,
      Math.max(3000,Math.min(9000,Math.floor(22500-(performance.now()-start)))));
     if(id!==generation)return;
     combined=mergeRecoveredReading(combined,focused,targets);
     if(targets.includes('ean')){
      const merged=fuseEAN(combined,focused?.eanObserved);
      // Une ancienne lecture partielle erronée ne doit pas verrouiller
      // une nouvelle proposition. Elle exige néanmoins une confirmation
      // humaine, même si la seconde lecture permet une déduction unique.
      if(merged===combined&&!readableValue('ean',combined.fields?.ean13)&&focused?.eanObserved&&
         !combined.checks?.independentMismatch&&!combined.checks?.readingConflict){
       const alternate={...combined,eanObserved:focused.eanObserved,
        weakEANSupplement:true,digiRecovery:null};
       const candidate=window.IUDigiCatalogLookup?.reconstruct?.(alternate);
       if(candidate?.kind==='confirmation'&&combined.digiRecovery?.kind!=='confirmation')combined=alternate;
      }else combined=merged;
     }
     combined=reconcileBarcode(combined,localBarcode);
     combined=applyCatalogRecovery(combined);
    }catch(error){
     if(error?.name==='AbortError'&&id!==generation)throw error;
     // L'expiration globale de 24 s peut arriver pendant la SECONDE
     // lecture : ne jamais effacer les champs déjà obtenus de Gemini.
     // En revanche, interdire l'enregistrement tant que la confirmation
     // additionnelle n'a pas été obtenue.
     combined={...combined,networkFailure:error?.networkStats||null,checks:{...(combined.checks||{}),
      recoveryInterrupted:true,recoveryInterruptedTargets:[...targets]}};
    }
    recoveryMs=Math.round(performance.now()-recoveryStart);
   }
   let validated={...combined,visualFirst:firstDetail?.kind||'photo entière',visualRecheck:recheckView?.kind||null,
    localDiagnostics:Object.fromEntries(Object.entries({ZXing:opticalTask,imprimé:printedJob,barres:partialJob,Nano:digitJob,Advanced:advancedJob,OCR:paddleJob,détail:enhancedView.task}).map(([k,t])=>[k,t?.done?(t.value?'lu':'sans résultat')+' '+(t.ms??0)+' ms':t?'en cours':'non lancé']))};
   if(advancedJob?.value)validated={...validated,digiAdvancedHint:advancedJob.value,
    digiAdvancedComparison:window.IUDigiCatalogLookup?.compareAdvanced?.(validated,advancedJob.value)};
   const finalDeadline=performance.now()+110;
   if(printedJob){
    // Après la récupération Gemini, reprendre le résultat OCR déjà
    // lancé, uniquement s'il est prêt : aucun traitement illimité.
    const printed=await until(printedJob,finalDeadline);
    if(id!==generation)return;
    if(printed?.ean13)validated=applyPrintedEAN(validated,printed);
    if(printed?.pattern)validated=fuseEAN(validated,printed.pattern);
   }
   if((partialJob||paddleJob||alternateJob)&&!readableValue('ean',validated.fields?.ean13))validated=await consumeLocalEvidence(validated,finalDeadline);
   if(opticalTask.done&&opticalTask.value&&opticalTask.value!==localBarcode&&
      (trustedBarcodeEvidence(opticalTask.value)||opticalTask.value.ambiguous)){
    localBarcode=opticalTask.value;
    validated=reconcileBarcode(validated,localBarcode);
   }
   if(id!==generation)return;
   validated=applyCatalogRecovery(validated);
   // Une relecture réseau interrompue n'invalide pas un EAN que le
   // lecteur local a entre-temps confirmé, ou que DIGI a résolu sans
   // ambiguïté. Jamais lever un conflit fort ni un échec poids/prix.
   const interrupted=validated.checks?.recoveryInterruptedTargets;
   if(validated.checks?.recoveryInterrupted&&interrupted?.length===1&&interrupted[0]==='ean'&&
      !validated.checks?.readingConflict&&!validated.checks?.independentMismatch&&!validated.checks?.digiConflict&&
      (trustedBarcodeEvidence(localBarcode)&&localBarcode.ean13===validated.fields?.ean13||
       ['reconstructed','confirmation'].includes(validated.digiRecovery?.kind))){
    validated={...validated,checks:{...validated.checks,recoveryInterrupted:false}};
   }
   const priorMismatch=validated.checks?.independentMismatch===true;
   const localChecks=fieldsChecks(validated.fields);
   const opticalResolved=trustedBarcodeEvidence(localBarcode)&&
    validated.fields?.ean13===localBarcode.ean13;
   validated.checks={...validated.checks,...localChecks,
    independentMismatch:localChecks.independentMismatch||
     (priorMismatch&&!opticalResolved)};
   repairFocus=null;
   validated.timing={preparationMs,firstResponseMs,recoveryMs,totalMs:Math.round(performance.now()-start),captureMs:Number.isFinite(file?.iuCaptureMs)?file.iuCaptureMs:null};
   display(validated,performance.now()-start);
   // La validation reste MANUELLE ; en auto, placer le bouton à portée de doigt.
   // L'utilisateur reste au même endroit, sans défilement forcé.
   // L'analyse prépare un brouillon uniquement : aucun enregistrement implicite.
   const saveReady=Boolean(validationState());
   const usedLegacyGemini=selectedProvider==='openai'&&!String(received?.model||'').startsWith('gpt-');
   say(usedLegacyGemini?'Lecture faite par Gemini · Worker Cloudflare à mettre à jour'
    :saveReady?'Étiquette prête':('Lecture à vérifier · '+(lastReadProblem||'change de panier si nécessaire')),
    usedLegacyGemini||!saveReady);

  }catch(error){
   if(id===generation){
    // Une erreur technique ne doit pas condamner la photo déjà prise :
    // sa relance reste manuelle après épuisement des réessais bornés.
    attempts.delete(selectedModel);
    if(!proposal&&!output.querySelector('.iu-gemini-printed-label'))showBlankLabel();
    const reason=error?.name==='AbortError'
     ?'Analyse trop longue · réessaie cette photo ou améliore le réseau'
     :String(error?.message||'Échec réseau').slice(0,140);
    lastAnalysisError=reason;
    repairFocus=null;
    if(oldResult)display(reconcileBarcode({...oldResult,networkFailure:error?.networkStats||oldResult.networkFailure,digiAdvancedHint:advancedJob?.value||oldResult.digiAdvancedHint},localBarcode),performance.now()-start);
    else if(error?.transient){
     const local=await Promise.race([barcodeJob||Promise.resolve(null),new Promise(resolve=>setTimeout(()=>resolve(null),120))]);
     if(id!==generation)return;
     if(local)localBarcode=local;
     const partial=applyCatalogRecovery(reconcileBarcode({fields:{name:null,weightGrams:null,pricePerKgCents:null,totalCents:null,ean13:null},
      source:'local-network-recovery',digiAdvancedHint:advancedJob?.value||null,networkFailure:error.networkStats,checks:{recoveryInterrupted:true,
       recoveryInterruptedTargets:trustedBarcodeEvidence(localBarcode)?['weight','rate','total']:['name','weight','rate','total','ean']}},localBarcode));
     display(partial,performance.now()-start);
    }
    say(lastAnalysisError,true);
    updateCardState('error');
   }
  }finally{
   clearTimeout(guard);
   if(id===generation){
    active=false;abort=null;setAnalysisCameraClosed(false);
    updateButton();validationState();refreshRepairPanel();
    if(lastRawResult?.digiRecovery?.kind==='confirmation'&&
       generation!==lastCatalogPromptGeneration)
     openCatalogConfirm();
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
  if(exactGuide)delete exactGuide.dataset.aligned;
  stopQualityMonitor();
  // Fermeture volontaire : ne surtout pas réactiver la piste vidéo.
  setAnalysisCameraClosed(false,{resume:false});
  cameraPausedInBackground=false;
  clearAutoTimer();clearAutoStability();
  autoLocked=false;autoSuspended=false;autoNeedsChange=false;
  autoCapturePending=false;autoLastCaptured=null;autoChangeReference=null;
  cameraEpoch++;
  localOcrToken++;localCandidate=null;localPasses=0;localOcrBusy=false;
  releaseLocalOcr();
  window.IULiteRTLab?.close?.();
  window.IUDigiAdvanced?.close?.();
  if(!active){window.IUGeminiParallel?.closeDetail?.();window.IUGeminiParallel?.closeExtra?.();}
  if(cameraStream){
   for(const track of cameraStream.getTracks())track.stop();
   cameraStream=null;
  }
  try{video.pause();}catch(_){}
  video.srcObject=null;
  cameraStarting=false;torchBusy=false;torchOn=false;
  cameraShell.dataset.state='idle';
  cameraShell.hidden=false; // viseur visible à vide, sans appeler getUserMedia
  if(cameraIdle)cameraIdle.disabled=active;
  refreshTorch();
  refreshCameraAlert();
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
 function isWeighingPage(){
  return !panel.hidden&&!['is-admin-mode','is-events-mode','is-alerts-mode','is-account-mode']
   .some(mode=>document.body.classList.contains(mode));
 }
 function syncWeighingPage(){
  if(isWeighingPage())return;
  // Ne pas effacer la photo, l'étiquette ou la proposition non enregistrée.
  // Arrêter aussi une demande getUserMedia encore en attente via cameraEpoch.
  if(cameraStream||cameraStarting||analysisCameraClosed)stopCamera();
  closeDuplicateConfirm();closeCatalogConfirm();
 }
 async function startCamera(){
  if(!isWeighingPage()||cameraStarting||active)return;
  warmNetwork();
  // Préchauffer ZXing dans le Web Worker sans retarder la caméra.
  try{window.IUGeminiParallel?.preloadBarcode?.();window.IUGeminiParallel?.warmDetail?.();window.IUGeminiParallel?.warmExtra?.();}catch(_){}
  try{window.IUDigiAdvanced?.warm?.();}catch(_){}
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
    refreshCameraAlert();
    try{await video.play();syncCameraCover();}catch(_){
     say('Vidéo suspendue par iOS. Réessaie de toucher le viseur.',true);
    }
    if(cameraMode==='auto'&&!autoSuspended&&!active&&!file&&!proposal){
     startAutoMonitor();
    }
    startQualityMonitor();
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
  if(cameraIdle)cameraIdle.disabled=true;
  say('Ouverture du viseur…');
  let obtained=null;
  try{
   obtained=await navigator.mediaDevices.getUserMedia({
    // Priorité au capteur arrière et aux pixels natifs pour les EAN vus
    // à distance. « ideal » n'est PAS une obligation iOS : le flux réel
    // est celui rapporté par getSettings(), sans boucle de renégociation.
    audio:false,video:{
     facingMode:{ideal:'environment'},
     width:{ideal:3840},height:{ideal:2160},
     frameRate:{ideal:24,max:30}
    }
   });
   if(epoch!==cameraEpoch||!isWeighingPage()){
    for(const track of obtained.getTracks())track.stop();
    return;
   }
   cameraStream=obtained;
   cameraPausedInBackground=false;
   requestContinuousFocus(obtained);
   const liveTrack=obtained.getVideoTracks?.()[0];
   // Mesurer la résolution réellement obtenue sans interrompre Safari.
   try{
    const settings=liveTrack?.getSettings?.();
    if(settings?.width>0&&settings?.height>0)
     cameraShell.dataset.videoResolution=settings.width+'x'+settings.height;
   }catch(_){}
   liveTrack?.addEventListener('ended',()=>{
    if(cameraStream!==obtained||cameraShell.hidden||document.hidden)return;
    clearAutoTimer();
    autoLocked=true;
    stopCamera();
    setAutoHint('Caméra interrompue · touche le viseur pour reprendre','error');
    say('La caméra a été interrompue. Touche le viseur pour la rouvrir.',true);
   },{once:true});
   video.srcObject=obtained;
   cameraShell.hidden=false;cameraShell.dataset.state='scanning';
   refreshCameraAlert();
   await video.play();
   if(epoch!==cameraEpoch||!isWeighingPage())return;
   syncCameraCover();
   refreshTorch();
   startQualityMonitor();
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
   if(epoch===cameraEpoch){cameraStarting=false;if(cameraIdle)cameraIdle.disabled=active;}
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
  }finally{
   torchBusy=false;refreshTorch();
   // Le changement de lumière invalide l'ancien tampon.
   stopQualityMonitor();startQualityMonitor();
  }
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
  if(!corrected)return {ok:false,reason:'Corrige le panier ou la référence DIGI'};
  if(!catalogProposalCurrent())return {ok:false,reason:'Catalogue DIGI modifié · relis cette photo'};
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
    gross:proposal.grams,product:proposal.name,plu:proposal.plu,
    catalogPrefix:proposal.catalogPrefix,ean13:proposal.ean,
    pricePerKgCents:proposal.rate,totalCents:proposal.total,
    correctedEan13:corrected.ean,correctedTotalCents:corrected.cents,
    confirmDuplicate:duplicate&&confirmDuplicate,
    digiEvidence:lastRawResult?.digiRecovery?.sources||null,
    digiRecoveryKind:lastRawResult?.digiRecovery?.kind||null,
    manualCorrectedFields
   });
  }catch(_){return {ok:false,reason:'Stockage indisponible'};}
  if(saved?.ok){lastSaveError=null;if(identity)lastSavedImportedPhoto=identity;}
  return saved?.ok?saved:{ok:false,duplicate:!!saved?.duplicate,
   reason:String(saved?.reason||'Enregistrement impossible')};
 }
 function announceSaveError(saved){
  const msg=String(saved?.reason||'Enregistrement impossible');
  lastSaveError=msg;
  setLabelAlert('warning',msg);
  say('Pesée non enregistrée · '+msg,true);
 }
 // Référence DIGI probable : aucune validation silencieuse.
 // Il faut avoir lu six des sept chiffres du préfixe, au moins neuf
 // des douze chiffres utiles, ainsi qu'un nom réellement concordant.
 function openCatalogConfirm(){
  const info=lastRawResult?.digiRecovery;
  if(!isWeighingPage()||catalogDialogOpen||duplicateDialogOpen||active||!catalogDialog||
     info?.kind!=='confirmation'||!info.proposedEAN||
     lastRawResult?.checks?.independentMismatch||lastRawResult?.checks?.readingConflict||
     lastRawResult?.checks?.digiConflict||lastRawResult?.checks?.recoveryInterrupted)return false;
  const item=info.candidates?.[0];
  if(!item||item.ambiguous)return false;
  catalogDialogOpen=true;
  lastCatalogPromptGeneration=generation;
  if(catalogTitle)catalogTitle.textContent=
   'Référence DIGI proposée · '+item.name;
  const description=$('iuGeminiCatalogDescription');
  if(description)description.textContent='EAN proposé : '+info.proposedEAN+
   (info.variantCount>1?' · Plusieurs codes de montant compatibles.':'')+
   ' Compare les 13 chiffres et le libellé à l’étiquette. Ne confirme que si le code exact correspond.';
  catalogDialog.hidden=false;
  catalogCancel?.focus({preventScroll:true});
  return true;
 }
 function closeCatalogConfirm(){
  if(!catalogDialogOpen)return;
  catalogDialogOpen=false;
  if(catalogDialog)catalogDialog.hidden=true;
 }
 function cancelCatalogConfirm(){
  if(!catalogDialogOpen)return;
  closeCatalogConfirm();
  setLabelAlert('warning','Référence DIGI incertaine · vérifie l’étiquette');
  say('Proposition non confirmée · relis ou corrige le code-barres.');
  nextWeigh?.focus({preventScroll:true});
 }
 catalogCancel?.addEventListener('click',cancelCatalogConfirm);
 catalogAccept?.addEventListener('click',()=>{
  if(!catalogDialogOpen||!lastRawResult)return;
  // Un import concurrent peut avoir changé le catalogue : revalider
  // la proposition et tous ses chiffres AU MOMENT du choix.
  const accepted=window.IUDigiCatalogLookup?.reconstruct(
   lastRawResult,{allowProbable:true});
  if(accepted?.kind!=='confirmation'||!accepted.result?.fields?.ean13||
     accepted.proposedEAN!==lastRawResult.digiRecovery?.proposedEAN||
     lastRawResult.checks?.readingConflict||lastRawResult.checks?.independentMismatch||
     lastRawResult.checks?.digiConflict||lastRawResult.checks?.recoveryInterrupted){
   closeCatalogConfirm();
   setLabelAlert('warning','Référence DIGI modifiée · nouvelle lecture nécessaire');
   say('Le catalogue ou les valeurs ont changé · relis cette photo.',true);
   return;
  }
  closeCatalogConfirm();
  manualCorrectedFields=[...new Set([...manualCorrectedFields,'ean'])];
  const confirmed={...accepted.result,digiRecovery:{
   kind:'confirmed',sources:accepted.sources,candidates:accepted.candidates,
   confirmedByUser:true,proposedEAN:accepted.proposedEAN}};
  display(confirmed,0);
  validationState();
  if(!proposal){
   say('Confirmation reçue, mais la pesée comporte encore des données incertaines.',true);
   return;
  }
  say('Référence DIGI confirmée · vérifie la pesée avant de l’enregistrer.');
 });
 document.addEventListener('keydown',event=>{
  if(!catalogDialogOpen)return;
  if(event.key==='Escape'){event.preventDefault();cancelCatalogConfirm();}
  else if(event.key==='Tab'){
   const current=document.activeElement;
   if(event.shiftKey&&current===catalogCancel){
    event.preventDefault();catalogAccept?.focus();
   }else if(!event.shiftKey&&current===catalogAccept){
    event.preventDefault();catalogCancel?.focus();
   }
  }
 });
 // Doublon : même confirmation explicite que la fin d'inventaire.
 function openDuplicateConfirm(){
  if(!isWeighingPage()||duplicateDialogOpen||active||!duplicateDialog||
     !correctedCurrentProposal()||!duplicateForCurrent())return false;
  duplicateDialogOpen=true;
  lastDuplicatePromptGeneration=generation;
  duplicateDialog.hidden=false;
  refreshCaptureButton();
  duplicateCancel?.focus({preventScroll:true});
  return true;
 }
 function closeDuplicateConfirm(){
  if(!duplicateDialogOpen)return;
  duplicateDialogOpen=false;
  if(duplicateDialog)duplicateDialog.hidden=true;
  refreshCaptureButton();
 }
 function cancelDuplicateConfirm(){
  if(!duplicateDialogOpen)return;
  closeDuplicateConfirm();
  // Annuler efface seulement la photo en attente : rien dans l'historique.
  resetReading();
  say('Doublon annulé · photographie la prochaine étiquette.');
  if(cameraStream&&!cameraShell.hidden)capture?.focus({preventScroll:true});
 }
 // Libérer la photo et la proposition enregistrées, sans effacer le rendu.
 // La prochaine capture ou import remplace cet instantané normalement.
 function retainSavedWeigh(saved){
  retainedSavedLabel=saved.duplicate?'Doublon confirmé':'Pesée enregistrée';
  generation++;
  proposal=null;file=null;
  lastRawResult=null;lastReadProblem=null;lastAnalysisError=null;lastSaveError=null;
  localBarcode=null;barcodeJob=null;repairFocus=null;manualCorrectedFields=[];
  primaryBarcodePhoto=null;alternatePhotoTask=null;cachedEncoding=null;cachedDetail=null;cachedEnhanced=null;cachedFocused.clear();cachedGuided=null;
  attempts.clear();photo.value='';clearPreview();
  if(repairPanel)repairPanel.hidden=true;
  if(repairManual)repairManual.hidden=true;
  updateButton();validationState();
 }
 duplicateCancel?.addEventListener('click',cancelDuplicateConfirm);
 duplicateAccept?.addEventListener('click',()=>{
  if(!duplicateDialogOpen)return;
  closeDuplicateConfirm();
  const saved=saveVerifiedProposal({confirmDuplicate:true});
  if(!saved?.ok){announceSaveError(saved);validationState();return;}
  retainSavedWeigh(saved);
  if(cameraStream&&cameraMode==='auto')armAutoScanner(true);
  setLabelAlert('success',saved.duplicate?'Doublon confirmé':'Pesée enregistrée');
  say(saved.duplicate?'Doublon validé · prêt pour la suite.':'Pesée enregistrée · prêt pour la suite.');
  if(cameraStream&&!cameraShell.hidden)capture?.focus({preventScroll:true});
 });
 document.addEventListener('keydown',event=>{
  if(!duplicateDialogOpen)return;
  if(event.key==='Escape'){event.preventDefault();cancelDuplicateConfirm();}
  else if(event.key==='Tab'){
   const current=document.activeElement;
   if(event.shiftKey&&current===duplicateCancel){
    event.preventDefault();duplicateAccept?.focus();
   }else if(!event.shiftKey&&current===duplicateAccept){
    event.preventDefault();duplicateCancel?.focus();
   }
  }
 });
 // Les deux commandes utilisent la même transaction synchrone.
 // Conserver l'instantané affiché après l'enregistrement, sans proposition à resauver.
 function saveAndRetainCurrentWeigh(){
  if(duplicateForCurrent()){openDuplicateConfirm();return null;}
  const saved=saveVerifiedProposal();
  if(!saved?.ok){
   if(saved?.duplicate)openDuplicateConfirm();
   else announceSaveError(saved);
   return null;
  }
  retainSavedWeigh(saved);
  return saved;
 }
 nextWeigh?.addEventListener('click',()=>{
  if(active||frameCaptureBusy||duplicateDialogOpen||catalogDialogOpen)return;
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
   if(!retainedSavedLabel)resetReading();
   if(!cameraStream)void startCamera();
   else if(cameraMode==='auto')armAutoScanner(Boolean(retainedSavedLabel));
   else capture?.focus();
   return;
  }
  const saved=saveAndRetainCurrentWeigh();
  if(!saved)return;
  if(cameraStream&&cameraMode==='auto')armAutoScanner(true);
  setLabelAlert('success',saved.duplicate?'Doublon confirmé':'Pesée enregistrée');
  say(saved.duplicate?'Doublon confirmé · prêt pour la suite.'
   :'Pesée enregistrée · prêt pour la suite.');
 });
 cameraIdle?.addEventListener('click',()=>{selectReadingMode('camera');void startCamera();});
 closeCamera.addEventListener('click',()=>{
  stopCamera();
  say('Viseur fermé. Aucune photo envoyée.');
 });
 torch.addEventListener('click',()=>setTorch(!torchOn));
 // One strict ROI for every camera input. Never fall back to the full view.
 function cameraCaptureCrop(srcW,srcH,view){
  const outline=exactGuide?.getBoundingClientRect();
  const crop=labelLayout?.guideCrop(srcW,srcH,view,outline);
  if(!crop)throw Error('Repère caméra indisponible · recadre l’étiquette');
  return crop;
 }
 function drawGuideFrame(ctx,crop,w,h){
  // Rounded corners are neutralized too. Draw only video pixels, not UI.
  const r=Math.min(w/4,h/4,Math.max(0,crop.radius*Math.min(w/crop.width,h/crop.height)));
  ctx.save();
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  ctx.beginPath();ctx.moveTo(r,0);ctx.lineTo(w-r,0);
  ctx.quadraticCurveTo(w,0,w,r);ctx.lineTo(w,h-r);
  ctx.quadraticCurveTo(w,h,w-r,h);ctx.lineTo(r,h);
  ctx.quadraticCurveTo(0,h,0,h-r);ctx.lineTo(0,r);
  ctx.quadraticCurveTo(0,0,r,0);ctx.closePath();ctx.clip();
  ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,w,h);
  ctx.restore();
 }

 // v42.30 — Capture intelligente iPhone Safari, sans photo supplémentaire
 // envoyée à Gemini. Le contrôle basse résolution vise seulement
 // les barres EAN, les chiffres du poids et ceux du prix au kilo.
 function canMonitorQuality(){
  return Boolean(qualityEngine&&cameraStream&&!cameraShell.hidden&&
   cameraShell.dataset.state==='scanning'&&!document.hidden&&!panel.hidden&&
   video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0);
 }
 function qualityZones(view){
  const components={
   ean:labelOutlineZones.find(z=>z[0]==='barcode'),
   weight:labelOutlineZones.find(z=>z[0]==='weight'),
   rate:labelOutlineZones.find(z=>z[0]==='rate')
  };
  const mapped={};
  for(const [kind,z] of Object.entries(components)){
   const w=Math.min(.60,z[3]*(kind==='ean'?1.12:1.25));
   const h=Math.min(.35,z[4]*(kind==='ean'?1.12:1.25));
   mapped[kind]={x:Math.max(0,Math.min(1-w,z[1]+(z[3]-w)/2)),
    y:Math.max(0,Math.min(1-h,z[2]+(z[4]-h)/2)),w,h};
  }
  return mapped;
 }
 function sampleCameraQuality(){
  if(!qualityEngine||video.readyState<2||!video.videoWidth)return null;
  const view=video.getBoundingClientRect();
  const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,view);
  // Maximum 360 pixels, mémoire et CPU bornés ; le JPEG reste à 1 920 px.
  const scale=Math.min(1,360/Math.max(crop.width,crop.height));
  const w=Math.max(1,Math.round(crop.width*scale));
  const h=Math.max(1,Math.round(crop.height*scale));
  if(qualitySampleCanvas.width!==w)qualitySampleCanvas.width=w;
  if(qualitySampleCanvas.height!==h)qualitySampleCanvas.height=h;
  const ctx=qualitySampleCanvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  drawGuideFrame(ctx,crop,w,h);
  const image=ctx.getImageData(0,0,w,h);
  const rating=qualityEngine.evaluate(image,qualityZones(view),qualityPrevious?.gray);
  return rating;
 }
 function fullResolutionCameraFrame(maxEdge=1920){
  const bounds=video.getBoundingClientRect();
  const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,bounds);
  const factor=Math.min(1,maxEdge/Math.max(crop.width,crop.height));
  const cv=document.createElement('canvas');
  cv.width=Math.max(1,Math.round(crop.width*factor));
  cv.height=Math.max(1,Math.round(crop.height*factor));
  const ctx=cv.getContext('2d');
  if(!ctx)throw Error('Capture caméra impossible');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  drawGuideFrame(ctx,crop,cv.width,cv.height);
  cv.iuGuideCropKey=crop.key;
  return cv;
 }
 function clearQualityBuffer(){
  qualityPrevious=null;qualityCached=null;qualityRing.length=0;qualityLastSampleAt=0;
  qualityLastCachedAt=0;previewLastAt=0;
 }
 function stopQualityMonitor(){
  qualityMonitorToken++;
  if(qualityMonitorId){
   if(qualityMonitorKind==='video')try{video.cancelVideoFrameCallback?.(qualityMonitorId)}catch(_){}
   else clearTimeout(qualityMonitorId);
  }
  qualityMonitorId=0;qualityMonitorKind='';
  clearQualityBuffer();
 }
 function startQualityMonitor(){
  if(!canMonitorQuality()||qualityMonitorId)return;
  const token=qualityMonitorToken;
  if(typeof video.requestVideoFrameCallback==='function'){
   qualityMonitorKind='video';
   qualityMonitorId=video.requestVideoFrameCallback(()=>{
    qualityMonitorId=0;
    if(token!==qualityMonitorToken)return;
    scanQualityPreview();
    startQualityMonitor();
   });
  }else{
   // Fallback Safari : 6 échantillons/s maximum.
   qualityMonitorKind='timer';
   qualityMonitorId=setTimeout(()=>{
    qualityMonitorId=0;
    if(token!==qualityMonitorToken)return;
    scanQualityPreview();
    startQualityMonitor();
   },155);
  }
 }
 function scanQualityPreview(){
  if(!canMonitorQuality()||frameCaptureBusy||active)return;
  const now=performance.now();
  if(now-qualityLastSampleAt<145)return;
  qualityLastSampleAt=now;
  try{
   const rating=sampleCameraQuality();
   if(!rating?.gray)return;
   const moved=qualityPrevious&&
    qualityEngine.frameDistance(qualityPrevious.gray,rating.gray)>28;
   if(warmedCameraEpoch!==cameraEpoch){
    warmedCameraEpoch=cameraEpoch;
    try{window.IUDigiCatalogLookup?.info?.();}catch(_){}
    const epoch=cameraEpoch;
    setTimeout(()=>{
     if(epoch!==cameraEpoch||!cameraStream||document.hidden)return;
     if(!window.TextDetector)void ensureLocalOcr();
     if(window.IULiteRTLab?.enabled?.())void window.IULiteRTLab.warm();
     else void window.IUPaddleLab?.warm?.();
    },300);
   }
   if(moved){qualityCached=null;qualityRing.length=0;}
   qualityPrevious=rating;
   // Préparer seulement les moteurs et la mesure de netteté.
   // Aucun JPEG de visée ni résultat antérieur ne devient une preuve.
  }catch(_){
   // Le filtre est facultatif : un iPhone peu puissant conserve le
   // déclencheur normal sans erreur ou permission supplémentaire.
   qualityPrevious=null;qualityCached=null;qualityRing.length=0;
  }
 }
 function qualityCandidate(epoch){
  const rating=sampleCameraQuality();
  // 4K si le capteur l'autorise : conserver jusqu'à 2 880 px sur le
  // cliché du clic pour l'EAN. Le tampon de visée reste à 1 920 px.
  const localEdge=Math.max(video.videoWidth,video.videoHeight)>=2880?2880:2160;
  return {canvas:fullResolutionCameraFrame(localEdge),rating,
   at:performance.now(),epoch};
 }
 async function chooseSharpCameraFrame(epoch){
  const current=qualityCandidate(epoch);
  if(!qualityEngine)return current;
  let selected=current;
  if(!current.rating?.usable||current.rating.score<.49){
   await new Promise(resolve=>setTimeout(resolve,85));
   if(epoch===cameraEpoch&&!document.hidden&&cameraStream&&
      cameraShell.dataset.state==='scanning'&&video.readyState>=2){
    const later=qualityCandidate(epoch);
    // Deuxième cliché après le clic seulement, jamais de fusion entre images.
    if(later.canvas?.iuGuideCropKey===current.canvas?.iuGuideCropKey&&
       qualityEngine.sameScene(current.rating,later.rating,10)){
     selected=qualityEngine.choose([later],current,later.at)||current;
    }
   }
  }
  lastSelectedQuality=selected.rating?.regions||null;
  return selected;
 }
 // Lecture vidéo locale : reconnaissance du TEXTE au fil des images canvas.
 // Tesseract se télécharge à la première utilisation (même moteur que l'OCR
 // classique). Le module reste disponible pour une vérification secondaire.
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
  const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,view);
  const factor=Math.min(1,1920/Math.max(crop.width,crop.height));
  const cv=document.createElement('canvas');
  cv.width=Math.max(1,Math.round(crop.width*factor));
  cv.height=Math.max(1,Math.round(crop.height*factor));
  const ctx=cv.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas OCR indisponible');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,cv.width,cv.height);
  drawGuideFrame(ctx,crop,cv.width,cv.height);
  cv.iuGuideCropKey=crop.key;
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
  setAutoHint('Gemini · lecture de l’étiquette…','capturing');
  say('Analyse principale Gemini de l’étiquette…');
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));
  if(!blob||!sessionValid())throw Error('Image de secours indisponible');
  lastPhotoWasAuto=true;
  autoCapturePending=false;
  // Même contrôle et même validation manuelle que la photo traditionnelle.
  setPhoto(new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'}),{guideCrop:true});
 }
 async function readLocalFrame(quality){
  // Mode automatique : la détection de stabilité reste locale et légère,
  // mais le PREMIER moteur à lire le texte est toujours Gemini. L'OCR
  // local ne peut plus court-circuiter l'analyse principale.
  if(localOcrBusy||autoSuspended||active||file||proposal)return;
  autoLocked=true;localOcrBusy=true;
  refreshCaptureButton();
  const token=++localOcrToken,epoch=cameraEpoch,stream=cameraStream;
  const valid=()=>token===localOcrToken&&epoch===cameraEpoch&&
   cameraStream===stream&&scannerCardVisible()&&!active&&!file&&!proposal&&
   cameraMode==='auto';
  try{
   const canvas=liveFrameCanvas();
   autoLastCaptured=quality.pixels;
   if(!valid())return;
   setAutoHint('Gemini · lecture de l’étiquette…','capturing');
   await sendOcrFallback(canvas,valid);
  }catch(_){
   if(valid()){
    autoLocked=true;
    setAutoHint('Capture impossible · utilise le déclencheur','error');
    say('Capture automatique impossible, photographie manuellement.',true);
   }
  }finally{
   if(token===localOcrToken){
    localOcrBusy=false;refreshCaptureButton();
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
   setAutoHint(afterValidation?'Présente une autre étiquette':'Gemini prêt · vise une étiquette','waiting');
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
     const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,bounds);
     if(autoSampleCanvas.width!==176)autoSampleCanvas.width=176;
     const sampleHeight=Math.max(78,Math.min(126,Math.round(176*crop.height/crop.width)));
     if(autoSampleCanvas.height!==sampleHeight)autoSampleCanvas.height=sampleHeight;
     const ctx=autoSampleCanvas.getContext('2d',{willReadFrequently:true});
     if(!ctx)throw Error('Canvas de contrôle indisponible');
     drawGuideFrame(ctx,crop,autoSampleCanvas.width,autoSampleCanvas.height);
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
  if(duplicateDialogOpen||catalogDialogOpen)return;
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
  // Comme Enregistrer : valider la pesée précédente AVANT la capture.
  // Son étiquette reste affichée jusqu'à la réussite de la nouvelle photo.
  // Un doublon exige toujours sa confirmation explicite.
  if(hasSavableProposal()){
   if(duplicateForCurrent()){openDuplicateConfirm();return;}
   const saved=saveAndRetainCurrentWeigh();
   if(!saved)return;
   setLabelAlert('success',saved.duplicate?'Doublon confirmé':'Pesée enregistrée');
   say('Pesée enregistrée · photo suivante.');
  }
  const priorProposal=proposal;
  const frameGeneration=generation,frameEpoch=cameraEpoch;
  const priorBasket=$('basketSelect')?.value;
  frameCaptureBusy=true;
  setLabelAlert('working','Analyse…');
  refreshCaptureButton();
  const automatic=autoCapturePending;
  autoCapturePending=false;autoLocked=true;autoSuspended=true;
  clearAutoTimer();
  lastPhotoWasAuto=automatic;
  if(!automatic)autoLastCaptured=autoLastFrame;
  try{
   if(qualityEngine)setAutoHint('Sélection de l’image la plus nette…','capturing');
   const captureStarted=typeof performance!=='undefined'?performance.now():Date.now();
   const chosen=await chooseSharpCameraFrame(frameEpoch);
   const cv=chosen.canvas;
   if(chosen.rating&&!chosen.rating.usable)
    setAutoHint('Meilleure image disponible · vérification Gemini','waiting');
   let blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.88));
   // Conserver les pixels originaux uniquement pour ZXing local.
   // Gemini reçoit la variante 1 920 px si le JPEG dépasse le budget.
   const barcodeOriginal=blob;
   // Au-delà de l'ancien budget de transfert, repli vers le
   // JPEG 1 920 px historique avant d'envoyer quoi que ce soit.
   if(blob?.size>490000&&Math.max(cv.width,cv.height)>1920){
    const fallback=document.createElement('canvas');
    const factor=1920/Math.max(cv.width,cv.height);
    fallback.width=Math.max(1,Math.round(cv.width*factor));
    fallback.height=Math.max(1,Math.round(cv.height*factor));
    const ctx=fallback.getContext('2d');
    if(ctx){
     ctx.imageSmoothingQuality='high';
     ctx.drawImage(cv,0,0,fallback.width,fallback.height);
     blob=await new Promise(resolve=>fallback.toBlob(resolve,'image/jpeg',.86));
    }
   }
   if(!blob)throw Error('Capture impossible');
   // Si le panier, la session, le flux caméra ou la lecture a changé
   // pendant toBlob, ne pas remplacer la lecture ou la session courante.
   if(frameEpoch!==cameraEpoch||frameGeneration!==generation||
      proposal!==priorProposal||priorBasket!==$('basketSelect')?.value||
      !cameraStream||cameraShell.hidden||document.hidden||
      cameraShell.dataset.state!=='scanning')return;
   const nextPhoto=new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'});
   nextPhoto.iuCaptureMs=Math.round((typeof performance!=='undefined'?performance.now():Date.now())-captureStarted);
   if(proposal||latestLabelFields||file||retainedSavedLabel){
    // La nouvelle photo est prête : remplacer l'ancien résultat,
    // enregistré ou non, seulement maintenant.
    resetReading();
   }
   const used=setPhoto(nextPhoto,{confirmed:true,guideCrop:true,
    barcodePhoto:barcodeOriginal!==blob?barcodeOriginal:null});
   if(used===false)setAutoHint('Capture non utilisée · réessaie','waiting');
  }catch(_){
   say('Photo impossible · recommence la capture.',true);
   setAutoHint('Capture impossible · réessaie','error');
  }finally{
   frameCaptureBusy=false;
   if(!active&&labelAlert?.dataset.state==='working')refreshLabelAlert();
   refreshCaptureButton();
  }
 });
 document.addEventListener('visibilitychange',()=>{
  if(!isWeighingPage()){syncWeighingPage();return;}
  if(document.hidden&&cameraStream){
   stopQualityMonitor();
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
   refreshCameraAlert();
   video.srcObject=cameraStream;
   Promise.resolve(video.play()).then(()=>{
    syncCameraCover();startQualityMonitor();
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
 if(typeof MutationObserver==='function'){
  const routeObserver=new MutationObserver(syncWeighingPage);
  routeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
  routeObserver.observe(panel,{attributes:true,attributeFilter:['hidden']});
 }
 syncWeighingPage();
})();
