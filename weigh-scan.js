/* Inventaires U v40.89 — scanner intégré, retour d'arrière-plan sans fermeture, caméra relancée au besoin. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const trigger=$('iuWeighScanToggle'),overlay=$('iuWeighScanOverlay');
 if(!trigger||!overlay)return;
 const closeBtn=$('iuWeighScanClose'),video=$('iuWeighScanVideo'),torchBtn=$('iuWeighScanTorch'),guide=overlay.querySelector('.iu-weigh-scan-guide'),
 status=$('iuWeighScanStatus'),proposal=$('iuWeighScanProposal'),value=$('iuWeighScanValue'),
 conversion=$('iuWeighScanConversion'),apply=$('iuWeighScanApply'),
 again=$('iuWeighScanAgain'),retry=$('iuWeighScanRetry'),gross=$('grossWeight');
 // La vidéo s'ouvre dans la carte « Nouvelle pesée », comme le mini-lecteur
 // de poids sans IA expérimenté dans l'administration.
 const anchor=trigger.closest('.iu-weigh-scan-option');
 if(anchor?.parentElement){
  // Le sélecteur de panier et le bouton occupent maintenant la même ligne.
  // Insérer la caméra APRÈS cette ligne, sinon elle écraserait le sélecteur.
  const row=anchor.closest('.iu-basket-scan-row');
  (row||anchor).insertAdjacentElement('afterend',overlay);
  overlay.classList.add('iu-weigh-scan-inline');
  overlay.setAttribute('role','region');
  overlay.removeAttribute('aria-modal');
  trigger.removeAttribute('aria-haspopup');
  trigger.setAttribute('aria-expanded','false');
 }
 let stream=null,worker=null,enginePromise=null,session=0,scanning=false,starting=false,wasOpen=false;
 let proposalGrams=null,lastCandidate=null,observations=[],nextVariant=0,previousStatus='';
 let torchEnabled=false,torchBusy=false;
 const say=(msg,error=false)=>{
  if(previousStatus!==msg){status.textContent=msg;previousStatus=msg;}
  status.classList.toggle('is-error',error);
 };
 const context=()=>typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
 const format=grams=>(grams/1000).toFixed(3).replace('.',',')+' kg';
 const extractWeight=text=>{
  const s=String(text||'').replace(/[\u00a0\u202f]/g,' ')
   .replace(/[oO]/g,'0').replace(/[lI]/g,'1')
   .replace(/(\d)\s*[,.;:]\s*(\d)/g,'$1,$2').replace(/\s+/g,' ').trim();
  // Même si le cadrage contient un prix ou une date, seule une valeur
  // de trois décimales immédiatement suivie de « kg » est retenue.
  // Ne jamais confondre les unités €/kg avec le poids net.
  const matches=[...s.matchAll(/(?:^|[^\d.,€$\/])(\d{1,2}[,.]\d{3}|0\d{3})\s*k\s*g\b/gi)];
  if(matches.length!==1)return null;
  const token=matches[0][1];
  const grams=/^0\d{3}$/.test(token)?Number(token.slice(1)):
   Math.round(Number(token.replace(',','.'))*1000);
  return Number.isSafeInteger(grams)&&grams>=1&&grams<=30000?grams:null;
 };
 function resetObservations(){
  lastCandidate=null;observations=[];nextVariant=0;
 }
 function updateTorchButton(){
  if(!torchBtn)return;
  torchBtn.setAttribute('aria-pressed',String(torchEnabled));
  torchBtn.setAttribute('aria-label',torchEnabled?'Désactiver le flash':'Activer le flash');
  torchBtn.title=torchEnabled?'Désactiver le flash':'Activer le flash';
  torchBtn.classList.toggle('is-on',torchEnabled);
  torchBtn.disabled=torchBusy;
 }
 function getTorchTrack(){
  const track=stream?.getVideoTracks?.()[0];
  if(!track||track.readyState!=='live'||typeof track.applyConstraints!=='function')return null;
  try{
   if(track.getCapabilities?.().torch===true)return track;
  }catch(_){}
  return null;
 }
 function refreshTorchAvailability(){
  const track=getTorchTrack();
  if(!track){torchEnabled=false;torchBusy=false;}
  if(torchBtn)torchBtn.hidden=!track;
  updateTorchButton();
 }
 async function setTorch(on){
  const track=getTorchTrack();
  if(!track||torchBusy)return;
  torchBusy=true;updateTorchButton();
  try{
   await track.applyConstraints({advanced:[{torch:on}]});
   if(stream?.getVideoTracks?.()[0]!==track||overlay.hidden)return;
   torchEnabled=on;
  }catch(_){
   if(stream?.getVideoTracks?.()[0]===track&&!overlay.hidden){
    say('Le flash n’est pas disponible sur cette caméra.',true);
    torchEnabled=false;
    if(torchBtn)torchBtn.hidden=true;
   }
  }finally{
   torchBusy=false;
   updateTorchButton();
  }
 }
 function stopTracks(){
  // L'arrêt de la piste éteint aussi la torche si elle était active.
  torchEnabled=false;torchBusy=false;
  if(torchBtn)torchBtn.hidden=true;
  updateTorchButton();
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  try{video.pause();}catch(_){}
  video.srcObject=null;scanning=false;
 }
 function close(){
  session++;scanning=false;starting=false;stopTracks();resetObservations();
  proposalGrams=null;proposal.hidden=true;retry.hidden=true;
  overlay.hidden=true;overlay.dataset.state='';
  trigger.setAttribute('aria-expanded','false');
  if(wasOpen){wasOpen=false;trigger.focus({preventScroll:true});}
 }
 async function engine(){
  if(worker)return worker;
  if(enginePromise)return enginePromise;
  enginePromise=(async()=>{
   if(!window.Tesseract?.createWorker){
    await new Promise((resolve,reject)=>{
     const tag=document.createElement('script');
     tag.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
     tag.async=true;tag.onload=resolve;tag.onerror=reject;document.head.append(tag);
    });
   }
   const w=await window.Tesseract.createWorker('eng',1,{});
   await w.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,kKgG '});
   worker=w;return w;
  })().catch(error=>{enginePromise=null;throw error;});
  return enginePromise;
 }
 // Contraste adaptatif léger : niveaux de gris, correction des ombres et
 // renforcement modéré des caractères. Uniquement sur le crop envoyé à l'OCR.
 // 10 × 4 zones interpolées : évite les démarcations d'un filtre par blocs.
 function improveOcrImage(image){
  const {width,height,data}=image;
  if(width<4||height<4)return image;
  const cols=Math.min(10,Math.max(2,Math.floor(width/24)));
  const rows=Math.min(4,Math.max(2,Math.floor(height/24)));
  const sums=new Float64Array(cols*rows),counts=new Uint32Array(cols*rows);
  const histogram=new Uint32Array(256);
  for(let y=0,i=0;y<height;y++){
   const cellRow=Math.min(rows-1,Math.floor(y*rows/height));
   for(let x=0;x<width;x++,i+=4){
    const gray=Math.round(.299*data[i]+.587*data[i+1]+.114*data[i+2]);
    const cell=cellRow*cols+Math.min(cols-1,Math.floor(x*cols/width));
    sums[cell]+=gray;counts[cell]++;histogram[gray]++;
   }
  }
  const means=sums.map((sum,index)=>sum/Math.max(1,counts[index]));
  const total=width*height;
  let low=0,high=255,cumulative=0,foundLow=false;
  for(let gray=0;gray<256;gray++){
   cumulative+=histogram[gray];
   if(!foundLow&&cumulative>=total*.08){low=gray;foundLow=true;}
   if(cumulative>=total*.92){high=gray;break;}
  }
  // Les caractères déjà très contrastés sont moins retouchés.
  const gain=Math.max(1.10,Math.min(1.23,1.23-(high-low-45)*.001));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  for(let y=0,i=0;y<height;y++){
   const yy=y*rows/height-.5;
   const row0=clamp(Math.floor(yy),0,rows-1),row1=Math.min(rows-1,row0+1);
   const ty=clamp(yy-row0,0,1);
   for(let x=0;x<width;x++,i+=4){
    const xx=x*cols/width-.5;
    const col0=clamp(Math.floor(xx),0,cols-1),col1=Math.min(cols-1,col0+1);
    const tx=clamp(xx-col0,0,1);
    const top=means[row0*cols+col0]*(1-tx)+means[row0*cols+col1]*tx;
    const bottom=means[row1*cols+col0]*(1-tx)+means[row1*cols+col1]*tx;
    const local=top*(1-ty)+bottom*ty;
    const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];
    const exposure=clamp((218-local)*.36,-14,34);
    const shade=clamp(Math.round(local+(gray-local)*gain+exposure),0,255);
    data[i]=data[i+1]=data[i+2]=shade;
   }
  }
  return image;
 }
 function cropFrame(adaptive){
  const vw=video.videoWidth,vh=video.videoHeight;
  const videoRect=video.getBoundingClientRect(),guideRect=guide.getBoundingClientRect();
  const cw=videoRect.width,ch=videoRect.height;
  if(!vw||!vh||!cw||!ch||!guideRect.width||!guideRect.height)return null;
  // Le découpage OCR suit désormais la position RÉELLE du cadre affiché.
  // La même zone est utilisée quelle que soit la taille de l'iPhone.
  const x=Math.max(0,guideRect.left-videoRect.left);
  const y=Math.max(0,guideRect.top-videoRect.top);
  const w=Math.min(guideRect.width,cw-x),h=Math.min(guideRect.height,ch-y);
  if(w<=0||h<=0)return null;
  const fit=Math.max(cw/vw,ch/vh),ox=(vw*fit-cw)/2,oy=(vh*fit-ch)/2;
  const canvas=document.createElement('canvas');
  canvas.width=720;
  canvas.height=Math.max(110,Math.round(canvas.width*h/w));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video,(x+ox)/fit,(y+oy)/fit,w/fit,h/fit,0,0,canvas.width,canvas.height);
  if(adaptive){
   // La première lecture profite du contraste adaptatif. Si elle échoue,
   // le passage suivant conserve les pixels d'origine : aucune lecture
   // supplémentaire n'est imposée et l'image caméra reste naturelle.
   const image=ctx.getImageData(0,0,canvas.width,canvas.height);
   ctx.putImageData(improveOcrImage(image),0,0);
  }
  return canvas;
 }
 function refreshConversion(){
  if(proposalGrams===null)return;
  const state=context();
  if(!state||!Number.isSafeInteger(state.tareGrams)||state.tareGrams<0){
   conversion.textContent='Panier introuvable. Sélectionne un panier valide avant utilisation.';
   apply.disabled=true;return;
  }
  const gross=proposalGrams;
  const net=gross-state.tareGrams;
  conversion.textContent='Brut : '+format(gross)+
   ' · Panier : '+format(state.tareGrams)+
   ' · Net : '+format(net)+(net<0?' (essai)':'')+'.';
  apply.disabled=!Number.isSafeInteger(gross)||gross>999999||gross<=0;
 }
 function showProposal(grams){
  // Une seule lecture crédible est proposée, sans nouvelle phase de mise au
  // point. La caméra reste ALLUMÉE, mais l'OCR est arrêté jusqu'à validation.
  const transferred=typeof window.IUWeighScanDraft==='function'&&window.IUWeighScanDraft(grams)===true;
  proposalGrams=grams;value.textContent=format(grams);
  scanning=false;overlay.dataset.state='result';
  refreshConversion();
  // Lorsque le poids a été prérempli, le résultat central suffit.
  // Ne pas dupliquer le montant, la tare ni les boutons sous la caméra.
  proposal.hidden=transferred;
  retry.hidden=true;
  apply.hidden=transferred;
  again.disabled=transferred;
  again.hidden=transferred;
  again.textContent='Étiquette suivante';
  say(transferred?'':'Vérifie la pesée précédente.',!transferred);
  if(navigator.vibrate)try{navigator.vibrate(25);}catch(_){}
 }
 function evaluateObservation(grams,confidence){
  // Une seule lecture crédible suffit pour PROPOSER une valeur, jamais
  // pour l'enregistrer. La correction et la validation restent humaines.
  if(grams===null||confidence<54)return false;
  showProposal(grams);
  return true;
 }

 async function scan(id){
  while(scanning&&id===session&&!overlay.hidden&&!document.hidden){
   const variant=nextVariant;nextVariant=(nextVariant+1)%2;
   try{
    const canvas=cropFrame(variant===0);
    if(canvas){
     const data=await worker.recognize(canvas);
     if(!scanning||id!==session)return;
     const confidence=Number(data?.data?.confidence)||0;
     const grams=extractWeight(data?.data?.text);
     if(evaluateObservation(grams,confidence))return;
     if(grams===null||confidence<54)say('');
    }
   }catch(_){
    if(id===session&&scanning){resetObservations();say('Lecture difficile. Stabilise l’étiquette et rapproche-la.');}
   }
   if(id!==session||!scanning)return;
   // Le OCR est déjà séquentiel : délai court pour ne pas pénaliser la détection.
   await new Promise(resolve=>setTimeout(resolve,65));
  }
 }
 function resumeScan(){
  if(overlay.hidden||document.hidden||starting||scanning||!worker||!stream)return false;
  session++;const id=session;
  proposalGrams=null;proposal.hidden=true;retry.hidden=true;
  apply.hidden=false;again.disabled=false;again.hidden=false;
  resetObservations();overlay.dataset.state='scanning';scanning=true;
  say('');
  void scan(id);return true;
 }
 // Demande la mise au point continue seulement si le navigateur expose
 // explicitement cette capacité. Safari iPhone peut ne pas l'exposer.
 // Une erreur ici ne doit JAMAIS arrêter le scanner.
 function requestContinuousFocus(source){
  try{
   const track=source.getVideoTracks?.()[0];
   if(!track?.getCapabilities||!track.applyConstraints)return;
   const caps=track.getCapabilities();
   if(!Array.isArray(caps?.focusMode)||!caps.focusMode.includes('continuous'))return;
   void track.applyConstraints({advanced:[{focusMode:'continuous'}]}).catch(()=>{});
  }catch(_){}
 }
 async function startCamera(){
  if(starting||scanning||overlay.hidden||document.hidden)return;
  if(stream&&worker){resumeScan();return;}
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   say('Caméra indisponible : vérifie les autorisations iPhone et HTTPS.',true);
   retry.hidden=false;return;
  }
  const id=++session;starting=true;retry.hidden=true;proposal.hidden=true;proposalGrams=null;
  resetObservations();overlay.dataset.state='loading';
  say('');
  try{
   // Permission caméra demandée directement lors de l'appui sur le bouton.
   const cameraPromise=stream?Promise.resolve(stream):navigator.mediaDevices.getUserMedia({
    audio:false,
    video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:24,max:30}}
   });
   const enginePromiseLocal=engine();
   const source=await cameraPromise;
   if(overlay.hidden||id!==session){if(source!==stream)source.getTracks().forEach(t=>t.stop());return;}
   stream=source;
   video.srcObject=source;
   requestContinuousFocus(source);
   if(video.paused)await video.play();
   refreshTorchAvailability();
   await enginePromiseLocal;
   if(overlay.hidden||id!==session)return;
   starting=false;resumeScan();
  }catch(error){
   if(id!==session)return;
   stopTracks();starting=false;overlay.dataset.state='error';retry.hidden=false;
   say(error?.name==='NotAllowedError'
    ?'Caméra refusée. Autorise-la dans Safari.'
    :'Scanner indisponible. Vérifie la connexion initiale et les autorisations.',true);
  }finally{if(id===session)starting=false;}
 }
 trigger.addEventListener('click',()=>{
  if(!overlay.hidden){close();return;}
  overlay.hidden=false;wasOpen=true;
  trigger.setAttribute('aria-expanded','true');
  closeBtn.focus({preventScroll:true});
  void startCamera();
 });
 closeBtn.addEventListener('click',close);
 torchBtn?.addEventListener('click',()=>{void setTorch(!torchEnabled);});
 // Il n'y a plus de fond plein écran ni de clic extérieur à intercepter.
 retry.addEventListener('click',()=>{void startCamera();});
 window.addEventListener('iu-weigh-scan-saved',()=>{
  if(overlay.hidden)return;
  say('');
 });
 // « Nouvelle pesée » relance la lecture sur le flux existant (sans
 // fermeture, sans nouvel accès caméra, sans perdre le focus optique).
 window.addEventListener('iu-weigh-scan-next',()=>{
  if(overlay.hidden||scanning||starting)return;
  if(!resumeScan())void startCamera();
 });
 again.addEventListener('click',()=>{
  if(again.disabled)return;
  if(typeof window.IUWeighScanPrepareNext==='function'&&!window.IUWeighScanPrepareNext()){
   say('Valide ou corrige la pesée en cours avant de poursuivre.',true);return;
  }
  // Le même flux reste ouvert : pas de nouveau getUserMedia ni autofocus
  // au changement d'étiquette.
  if(!resumeScan())void startCamera();
 });
 apply.addEventListener('click',()=>{
  if(proposalGrams===null||typeof window.IUWeighScanDraft!=='function'||
     window.IUWeighScanDraft(proposalGrams)!==true){
   say('Sélectionne un panier et vérifie la pesée actuelle avant de transférer le poids.',true);
   return;
  }
  close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
 // iOS peut suspendre ou interrompre la piste vidéo en arrière-plan.
 // Conserver la zone scanner ouverte ; libérer le matériel puis redémarrer
 // automatiquement à la prochaine apparition de l'application.
 function suspendForBackground(){
  if(overlay.hidden)return;
  session++;scanning=false;starting=false;
  stopTracks();resetObservations();
  overlay.dataset.state='suspended';
  say('');
 }
 function resumeAfterBackground(){
  if(overlay.hidden||document.hidden||gross.getClientRects().length===0)return;
  void startCamera();
 }
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)suspendForBackground();
  else resumeAfterBackground();
 });
 window.addEventListener('pagehide',suspendForBackground);
 window.addEventListener('pageshow',resumeAfterBackground);
 window.addEventListener('focus',resumeAfterBackground);
 const observer=new MutationObserver(()=>{
  if(!overlay.hidden&&gross.getClientRects().length===0)close();
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();
