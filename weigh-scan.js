/* Inventaires U v40.62 — OCR poids net renforcé, caméra immersive et confirmation explicite. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const trigger=$('iuWeighScanToggle'),overlay=$('iuWeighScanOverlay');
 if(!trigger||!overlay)return;
 const closeBtn=$('iuWeighScanClose'),video=$('iuWeighScanVideo'),
 status=$('iuWeighScanStatus'),proposal=$('iuWeighScanProposal'),value=$('iuWeighScanValue'),
 conversion=$('iuWeighScanConversion'),apply=$('iuWeighScanApply'),
 again=$('iuWeighScanAgain'),retry=$('iuWeighScanRetry'),gross=$('grossWeight');
 let stream=null,worker=null,enginePromise=null,session=0,scanning=false,starting=false;
 let lastNormal='',lastEnhanced='',count=0,proposalGrams=null,scanPass=0,wasOpen=false;
 const say=(msg,error=false)=>{status.textContent=msg;status.classList.toggle('is-error',error);};
 const context=()=>typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
 const format=grams=>(grams/1000).toFixed(3).replace('.',',')+' kg';
 // Ne jamais retenir un montant ou un tarif €/kg. Un seul nombre doit précéder kg.
 const extractWeight=text=>{
  const s=String(text||'').replace(/[\u00a0\u202f]/g,' ').replace(/[oO]/g,'0').replace(/[lI]/g,'1')
   .replace(/(\d)\s*[,.;:]\s*(\d)/g,'$1,$2').replace(/\s+/g,' ');
  if(/[€$]/.test(s)||/\/\s*k\s*g/i.test(s))return null;
  const hits=[...s.matchAll(/(?:^|[^\d])(\d{1,2}[.,]\d{3}|0\d{3})\s*k\s*g\b/gi)];
  if(hits.length!==1)return null;
  const token=hits[0][1];
  const grams=/^0\d{3}$/.test(token)?Number(token.slice(1)):
   Math.round(Number(token.replace(',','.'))*1000);
  return Number.isSafeInteger(grams)&&grams>=1&&grams<=30000?grams:null;
 };
 const stopTracks=()=>{
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  try{video.pause();}catch(_){}
  video.srcObject=null;scanning=false;
 };
 function hide(){
  session++;stopTracks();starting=false;proposalGrams=null;
  lastNormal='';lastEnhanced='';count=0;
  overlay.hidden=true;retry.hidden=true;proposal.hidden=true;
  document.body.classList.remove('iu-weigh-scan-open');
  if(wasOpen){trigger.focus({preventScroll:true});wasOpen=false;}
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
 function makeFrame(enhance){
  const vw=video.videoWidth,vh=video.videoHeight,cw=video.clientWidth,ch=video.clientHeight;
  if(!vw||!vh||!cw||!ch)return null;
  // Cadrage limité au nombre et à « kg », pas aux trois colonnes de l'étiquette.
  const fit=Math.max(cw/vw,ch/vh),offX=(vw*fit-cw)/2,offY=(vh*fit-ch)/2;
  const x=cw*.24,y=ch*.425,w=cw*.52,h=ch*.15;
  const canvas=document.createElement('canvas');
  canvas.width=680;canvas.height=Math.max(90,Math.round(canvas.width*h/w));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video,(x+offX)/fit,(y+offY)/fit,w/fit,h/fit,0,0,canvas.width,canvas.height);
  if(enhance){
   const image=ctx.getImageData(0,0,canvas.width,canvas.height);
   for(let i=0;i<image.data.length;i+=4){
    const gray=.299*image.data[i]+.587*image.data[i+1]+.114*image.data[i+2];
    const v=Math.max(0,Math.min(255,(gray-128)*1.65+128));
    image.data[i]=image.data[i+1]=image.data[i+2]=v;
   }
   ctx.putImageData(image,0,0);
  }
  return canvas;
 }
 function showProposal(grams){
  if(grams==null)return;
  proposalGrams=grams;value.textContent=format(grams);
  const state=context();
  if(!state){
   conversion.textContent='Impossible de lire le panier sélectionné. Vérifie le panier avant utilisation.';
   apply.disabled=true;
  }else{
   const total=grams+state.tareGrams;
   conversion.textContent='Étiquette : '+format(grams)+' net · Panier : '+format(state.tareGrams)
    +' de tare · Brut reconstitué : '+format(total)+'.';
   apply.disabled=!Number.isSafeInteger(total)||total>999999;
  }
  proposal.hidden=false;scanning=false;
  say('Poids proposé après lectures indépendantes. Vérifie bien les chiffres sur l’étiquette.');
  if(navigator.vibrate)try{navigator.vibrate(35);}catch(_){}
 }
 async function scan(id){
  while(scanning&&id===session&&!overlay.hidden&&!document.hidden){
   const enhanced=(scanPass++%2)===1;
   try{
    const frame=makeFrame(enhanced);
    if(frame){
     const data=await worker.recognize(frame);
     if(id!==session||!scanning)return;
     const confidence=Number(data?.data?.confidence)||0;
     const grams=extractWeight(data?.data?.text);
     if(grams!==null&&confidence>=50){
      const token=String(grams);
      if(enhanced)lastEnhanced=token;else lastNormal=token;
      if(lastNormal&&lastEnhanced&&lastNormal===lastEnhanced){
       count++;
       if(count>=1){showProposal(grams);return;}
      }else{
       say('Lecture du poids : '+format(grams)+' · confirmation en cours…');
       if(lastNormal&&lastEnhanced&&lastNormal!==lastEnhanced){
        lastNormal='';lastEnhanced='';count=0;
        say('Lecture instable : les chiffres ne concordent pas. Rapproche le poids du cadre.');
       }
      }
     }else{
      lastNormal='';lastEnhanced='';count=0;
      say('Centre uniquement le nombre et « kg » dans le cadre. Évite le prix et la date.');
     }
    }
   }catch(_){if(id===session&&scanning)say('Lecture difficile. Rapproche le poids et stabilise la caméra.');}
   if(id!==session||!scanning)return;
   // Pas d'attente ajoutée par défaut : la reconnaissance OCR est déjà séquentielle.
   await new Promise(resolve=>setTimeout(resolve,90));
  }
 }
 async function startCamera(reuse=false){
  if(starting||scanning||overlay.hidden)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   say('Impossible d’utiliser la caméra : vérifie Safari, HTTPS et les autorisations.',true);retry.hidden=false;return;
  }
  const id=++session;starting=true;retry.hidden=true;proposal.hidden=true;proposalGrams=null;
  lastNormal='';lastEnhanced='';count=0;scanPass=0;
  say(stream?'Reprise de la reconnaissance…':'Ouverture de la caméra…');
  try{
   // Demander la caméra dès le geste utilisateur, en parallèle du moteur OCR.
   const cameraPromise=stream?Promise.resolve(stream):navigator.mediaDevices.getUserMedia({
    audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:24}}
   });
   const recognition=engine();
   const source=await cameraPromise;
   if(id!==session||overlay.hidden){if(source!==stream)source.getTracks().forEach(t=>t.stop());return;}
   stream=source;video.srcObject=source;
   await video.play();
   if(id!==session)return;
   say('Préparation de la lecture…');
   await recognition;
   if(id!==session)return;
   starting=false;scanning=true;
   say('Cadre le nombre et « kg », sans le prix.');
   void scan(id);
  }catch(error){
   if(id===session){
    stopTracks();starting=false;retry.hidden=false;
    say(error?.name==='NotAllowedError'?'Caméra refusée. Autorise-la dans Safari.'
      :'Lecture indisponible. Vérifie la caméra et la connexion du premier chargement.',true);
   }
  }finally{if(id===session)starting=false;}
 }
 trigger.addEventListener('click',()=>{
  if(!overlay.hidden)return;
  overlay.hidden=false;wasOpen=true;document.body.classList.add('iu-weigh-scan-open');
  closeBtn.focus({preventScroll:true});
  void startCamera();
 });
 closeBtn.addEventListener('click',hide);
 overlay.addEventListener('click',e=>{if(e.target===overlay)hide();});
 retry.addEventListener('click',()=>{void startCamera();});
 again.addEventListener('click',()=>{
  proposal.hidden=true;proposalGrams=null;void startCamera(true);
 });
 apply.addEventListener('click',()=>{
  const state=context();
  if(proposalGrams===null||!state){say('Vérifie le panier avant utilisation.',true);return;}
  const grossGrams=proposalGrams+state.tareGrams;
  if(!Number.isSafeInteger(grossGrams)||grossGrams<=0||grossGrams>999999){
   say('Poids brut calculé invalide. Ne pas utiliser.',true);return;
  }
  const content=state.entryMode==='g'?String(grossGrams):(grossGrams/1000).toFixed(3).replace('.',',');
  gross.value=content;
  // Identique à une saisie manuelle ; les règles d'alerte et d'enregistrement existantes s'appliquent.
  gross.dispatchEvent(new Event('input',{bubbles:true}));
  hide();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)hide();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!overlay.hidden)hide();});
 window.addEventListener('pagehide',()=>{hide();if(worker){const old=worker;worker=null;enginePromise=null;void old.terminate().catch(()=>{});}});
 const observer=new MutationObserver(()=>{
  if(!overlay.hidden&&gross.getClientRects().length===0)hide();
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();