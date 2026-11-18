/* Inventaires U v40.63 — Scanner continu sécurisé : caméra/worker réutilisés et confirmations sur images successives. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const trigger=$('iuWeighScanToggle'),overlay=$('iuWeighScanOverlay');
 if(!trigger||!overlay)return;
 const closeBtn=$('iuWeighScanClose'),video=$('iuWeighScanVideo'),guide=overlay.querySelector('.iu-weigh-scan-guide'),
 status=$('iuWeighScanStatus'),proposal=$('iuWeighScanProposal'),value=$('iuWeighScanValue'),
 conversion=$('iuWeighScanConversion'),apply=$('iuWeighScanApply'),
 again=$('iuWeighScanAgain'),retry=$('iuWeighScanRetry'),gross=$('grossWeight');
 let stream=null,worker=null,enginePromise=null,session=0,scanning=false,starting=false,wasOpen=false;
 let proposalGrams=null,lastCandidate=null,observations=[],nextVariant=0,previousStatus='';
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
  // Le total et le prix au kilo ne sont jamais admis comme poids.
  if(/[€$]/.test(s)||/\/\s*k\s*g/i.test(s))return null;
  const matches=[...s.matchAll(/(?:^|[^\d])(\d{1,2}[,.]\d{3}|0\d{3})\s*k\s*g\b/gi)];
  if(matches.length!==1)return null;
  const token=matches[0][1];
  const grams=/^0\d{3}$/.test(token)?Number(token.slice(1)):
   Math.round(Number(token.replace(',','.'))*1000);
  return Number.isSafeInteger(grams)&&grams>=1&&grams<=30000?grams:null;
 };
 function resetObservations(){
  lastCandidate=null;observations=[];nextVariant=0;
 }
 function stopTracks(){
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  try{video.pause();}catch(_){}
  video.srcObject=null;scanning=false;
 }
 function close(){
  session++;scanning=false;starting=false;stopTracks();resetObservations();
  proposalGrams=null;proposal.hidden=true;retry.hidden=true;
  overlay.hidden=true;overlay.dataset.state='';
  document.body.classList.remove('iu-weigh-scan-open');
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
 function cropFrame(enhance){
  const vw=video.videoWidth,vh=video.videoHeight,cw=video.clientWidth,ch=video.clientHeight;
  if(!vw||!vh||!cw||!ch)return null;
  // Exactement la zone superposée sur l'aperçu, sans texte des colonnes voisines.
  const fit=Math.max(cw/vw,ch/vh),ox=(vw*fit-cw)/2,oy=(vh*fit-ch)/2;
  const x=cw*.23,y=ch*.42,w=cw*.54,h=ch*.16;
  const canvas=document.createElement('canvas');
  canvas.width=600;
  canvas.height=Math.max(92,Math.round(canvas.width*h/w));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video,(x+ox)/fit,(y+oy)/fit,w/fit,h/fit,0,0,canvas.width,canvas.height);
  if(enhance){
   const image=ctx.getImageData(0,0,canvas.width,canvas.height);
   const data=image.data;
   for(let i=0;i<data.length;i+=4){
    const gray=.299*data[i]+.587*data[i+1]+.114*data[i+2];
    // Un traitement différent fournit un contrôle visuel complémentaire.
    const shade=gray<154?Math.max(0,(gray-111)*1.3+95):Math.min(255,(gray-111)*1.18+111);
    data[i]=data[i+1]=data[i+2]=shade;
   }
   ctx.putImageData(image,0,0);
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
  const gross=proposalGrams+state.tareGrams;
  conversion.textContent='Poids net de l’étiquette : '+format(proposalGrams)+
   ' · Tare du panier : '+format(state.tareGrams)+
   ' · Brut reconstitué : '+format(gross)+'.';
  apply.disabled=!Number.isSafeInteger(gross)||gross>999999||gross<=0;
 }
 function showProposal(grams){
  proposalGrams=grams;value.textContent=format(grams);
  scanning=false;overlay.dataset.state='result';
  refreshConversion();proposal.hidden=false;retry.hidden=true;
  say('Poids proposé. Vérifie les trois décimales sur l’étiquette avant de confirmer.');
  if(navigator.vibrate)try{navigator.vibrate(30);}catch(_){}
 }
 function evaluateObservation(grams,confidence,variant){
  if(grams===null||confidence<57){
   resetObservations();return false;
  }
  const now=Date.now();
  observations=observations.filter(o=>now-o.time<2300);
  if(lastCandidate!==grams||observations.some(o=>o.grams!==grams)){
   lastCandidate=grams;observations=[];
  }
  observations.push({grams,confidence,variant,time:now});
  if(observations.length>5)observations.shift();
  const hasPlain=observations.some(o=>o.variant===0);
  const hasEnhanced=observations.some(o=>o.variant===1);
  const strong=observations.length>=2&&observations.every(o=>o.confidence>=82);
  // Deux images nettement reconnues suffisent ; sinon, troisième contrôle.
  const countNeeded=strong?2:3;
  const stable=observations.length>=countNeeded&&hasPlain&&hasEnhanced;
  if(stable){
   showProposal(grams);return true;
  }
  say('Poids possible : '+format(grams)+' · vérification '+Math.min(observations.length,countNeeded)+'/'+countNeeded+'…');
  return false;
 }
 async function scan(id){
  while(scanning&&id===session&&!overlay.hidden&&!document.hidden){
   const variant=nextVariant;nextVariant=(nextVariant+1)%2;
   try{
    const canvas=cropFrame(variant===1);
    if(canvas){
     const data=await worker.recognize(canvas);
     if(!scanning||id!==session)return;
     const confidence=Number(data?.data?.confidence)||0;
     const grams=extractWeight(data?.data?.text);
     if(evaluateObservation(grams,confidence,variant))return;
     if(grams===null||confidence<57)say('Cadre uniquement le poids net et « kg ». Éloigne le prix et la date.');
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
  if(overlay.hidden||starting||scanning||!worker||!stream)return false;
  session++;const id=session;
  proposalGrams=null;proposal.hidden=true;retry.hidden=true;
  resetObservations();overlay.dataset.state='scanning';scanning=true;
  say('Prêt. Présente le poids suivant dans le cadre.');
  void scan(id);return true;
 }
 async function startCamera(){
  if(starting||scanning||overlay.hidden)return;
  if(stream&&worker){resumeScan();return;}
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   say('Caméra indisponible : vérifie les autorisations iPhone et HTTPS.',true);
   retry.hidden=false;return;
  }
  const id=++session;starting=true;retry.hidden=true;proposal.hidden=true;proposalGrams=null;
  resetObservations();overlay.dataset.state='loading';
  say(stream?'Préparation du lecteur…':'Ouverture de la caméra…');
  try{
   // Permission caméra demandée directement lors de l'appui sur le bouton.
   const cameraPromise=stream?Promise.resolve(stream):navigator.mediaDevices.getUserMedia({
    audio:false,
    video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:24}}
   });
   const enginePromiseLocal=engine();
   const source=await cameraPromise;
   if(overlay.hidden||id!==session){if(source!==stream)source.getTracks().forEach(t=>t.stop());return;}
   stream=source;
   video.srcObject=source;
   if(video.paused)await video.play();
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
  if(!overlay.hidden)return;
  overlay.hidden=false;wasOpen=true;
  document.body.classList.add('iu-weigh-scan-open');
  closeBtn.focus({preventScroll:true});
  void startCamera();
 });
 closeBtn.addEventListener('click',close);
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
 retry.addEventListener('click',()=>{void startCamera();});
 again.addEventListener('click',()=>{
  // Pas de reconfiguration caméra ni rechargement OCR entre deux étiquettes.
  if(!resumeScan())void startCamera();
 });
 apply.addEventListener('click',()=>{
  const state=context();
  if(proposalGrams===null||!state){say('Sélectionne un panier valide avant de poursuivre.',true);return;}
  const grossGrams=proposalGrams+state.tareGrams;
  if(!Number.isSafeInteger(grossGrams)||grossGrams<=0||grossGrams>999999){
   say('Poids brut invalide : transfert refusé.',true);return;
  }
  const text=state.entryMode==='g'?String(grossGrams):(grossGrams/1000).toFixed(3).replace('.',',');
  gross.value=text;
  // Cette action explicite reproduit une saisie manuelle, avec ses contrôles.
  gross.dispatchEvent(new Event('input',{bubbles:true}));
  close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)close();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!overlay.hidden)close();});
 window.addEventListener('pagehide',()=>{
  close();
  const old=worker;worker=null;enginePromise=null;
  if(old)void old.terminate().catch(()=>{});
 });
 const observer=new MutationObserver(()=>{
  if(!overlay.hidden&&gross.getClientRects().length===0)close();
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();
