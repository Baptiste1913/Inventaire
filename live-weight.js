/* Inventaires U v40.60 — lecture de poids en direct, laboratoire sans sauvegarde. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('iuLabelLab'),root=$('iuLiveWeightLab');
 if(!panel||!root)return;
 const start=$('iuLiveWeightStart'),stop=$('iuLiveWeightStop'),view=$('iuLiveWeightView'),
  video=$('iuLiveWeightVideo'),status=$('iuLiveWeightStatus'),
  reading=$('iuLiveWeightReading'),value=$('iuLiveWeightValue');
 let stream=null,worker=null,loader=null,active=false,session=0,timer=null,starting=false,consecutive=0,lastValue='';
 const say=(text,error=false)=>{status.textContent=text;status.classList.toggle('is-error',error);};
 const validWeight=text=>{
  const normalized=String(text||'').replace(/\s+/g,' ').replace(/[oO]/g,'0').replace(/[lI]/g,'1');
  // L'unité kg est obligatoire : ne jamais confondre 0,99 €/kg ou le prix total.
  const match=normalized.match(/(?:^|[^\d])(\d{1,2}[,.]\d{3}|0\d{3})\s*k\s*g\b/i);
  if(!match)return '';
  const token=match[1],number=/^0\d{3}$/.test(token)?'0.'+token.slice(1):token.replace(',','.');
  const n=Number(number);
  if(!Number.isFinite(n)||n<0.001||n>30)return '';
  return n.toFixed(3).replace('.',',')+' kg';
 };
 function cancelTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
 function cameraOff(){
  cancelTimer();
  if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
  video.pause();video.srcObject=null;active=false;
  view.hidden=true;stop.hidden=true;start.hidden=false;start.disabled=false;
 }
 async function stopAll(message){
  session++;
  cameraOff();starting=false;consecutive=0;lastValue='';
  const old=worker;worker=null;
  if(old)try{await old.terminate();}catch(_){}
  if(message)say(message);
 }
 function loadEngine(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(loader)return loader;
  loader=new Promise((resolve,reject)=>{
   const element=document.createElement('script');
   element.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
   element.async=true;
   element.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('Moteur OCR indisponible'));
   element.onerror=()=>reject(Error('Chargement du module OCR impossible'));
   document.head.append(element);
  }).catch(error=>{loader=null;throw error;});
  return loader;
 }
 function captureWeight(){
  if(!video.videoWidth||!video.videoHeight)return null;
  const cw=video.clientWidth,ch=video.clientHeight;
  if(!cw||!ch)return null;
  // La cible correspond exactement au cadre superposé : object-fit:cover.
  const vw=video.videoWidth,vh=video.videoHeight,scale=Math.max(cw/vw,ch/vh);
  const shownW=vw*scale,shownH=vh*scale;
  const offsetX=(shownW-cw)/2,offsetY=(shownH-ch)/2;
  const left=cw*.12,top=ch*.39,width=cw*.76,height=ch*.22;
  const sx=(left+offsetX)/scale,sy=(top+offsetY)/scale,sw=width/scale,sh=height/scale;
  const canvas=document.createElement('canvas');
  const boost=Math.min(2,1000/Math.max(sw,1));
  canvas.width=Math.max(1,Math.round(sw*boost));
  canvas.height=Math.max(1,Math.round(sh*boost));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  return canvas;
 }
 async function scan(token){
  if(!active||token!==session||!panel.open||document.hidden)return;
  try{
   const canvas=captureWeight();
   if(canvas&&worker){
    const response=await worker.recognize(canvas);
    if(token!==session||!active)return;
    const weight=validWeight(response?.data?.text);
    if(weight){
     if(weight===lastValue)consecutive++;else{lastValue=weight;consecutive=1;}
     say(consecutive<2?'Poids possible : '+weight+'. Vérification en cours…':'Poids détecté deux fois : '+weight+'. Vérifie sur l’étiquette.');
     if(consecutive>=2){
      value.textContent=weight;reading.hidden=false;
      cameraOff();return;
     }
    }else{consecutive=0;lastValue='';say('Vise uniquement la ligne « Poids net » dans le cadre.');}
   }
  }catch(_){if(token===session&&active)say('Lecture difficile. Rapproche l’étiquette et stabilise le téléphone.');}
  if(token===session&&active)timer=setTimeout(()=>{void scan(token);},380);
 }
 async function startCamera(){
  if(starting||active)return;
  if(!panel.open||!document.body.classList.contains('is-admin-mode'))return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   say('Caméra indisponible. Ouvre le site en HTTPS dans Safari et autorise la caméra.',true);return;
  }
  const token=++session;starting=true;start.disabled=true;reading.hidden=true;
  say('Ouverture de la caméra…');
  try{
   // La demande de permission se fait immédiatement après le toucher de l'utilisateur.
   const source=await navigator.mediaDevices.getUserMedia({
    audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:15,max:30}}
   });
   if(token!==session||!panel.open){source.getTracks().forEach(track=>track.stop());return;}
   stream=source;video.srcObject=source;view.hidden=false;stop.hidden=false;start.hidden=true;
   await video.play();
   if(token!==session)return;
   say('Préparation de la reconnaissance locale du poids…');
   const OCR=await loadEngine();
   if(token!==session)return;
   worker=await OCR.createWorker('eng',1,{});
   if(token!==session){await worker.terminate();worker=null;return;}
   await worker.setParameters({
    tessedit_pageseg_mode:'6',
    tessedit_char_whitelist:'0123456789.,kKgG '
   });
   if(token!==session)return;
   active=true;starting=false;lastValue='';consecutive=0;
   say('Caméra active. Place « 0,356 kg » dans le cadre, bien net.');
   void scan(token);
  }catch(error){
   if(token!==session)return;
   const denied=error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError';
   say(denied?'Autorisation caméra refusée. Autorise la caméra dans Safari.':'Démarrage impossible. Vérifie la connexion du premier chargement et les permissions caméra.',true);
   await stopAll();
  }finally{if(token===session){starting=false;start.disabled=false;}}
 }
 start.addEventListener('click',()=>{void startCamera();});
 stop.addEventListener('click',()=>{void stopAll('Caméra arrêtée.');});
 panel.addEventListener('toggle',()=>{if(!panel.open)void stopAll();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void stopAll();});
 window.addEventListener('pagehide',()=>{void stopAll();});
 const observer=new MutationObserver(()=>{if(!document.body.classList.contains('is-admin-mode'))void stopAll();});
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();