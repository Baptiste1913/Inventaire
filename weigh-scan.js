/* Inventaires U v40.61 — scanner de poids facultatif dans Nouvelle pesée. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const toggle=$('iuWeighScanToggle'),panel=$('iuWeighScanPanel'),start=$('iuWeighScanStart'),
 stop=$('iuWeighScanStop'),view=$('iuWeighScanView'),video=$('iuWeighScanVideo'),
 status=$('iuWeighScanStatus'),result=$('iuWeighScanResult'),value=$('iuWeighScanValue'),
 apply=$('iuWeighScanApply'),again=$('iuWeighScanAgain'),gross=$('grossWeight');
 if(!toggle||!gross)return;
 let stream=null,worker=null,load=null,token=0,scanning=false,starting=false,loop=null,last='',matches=0,ready=false;
 const say=s=>{status.textContent=s;};
 const parse=text=>{
  const s=String(text||'').replace(/\s+/g,' ').replace(/[oO]/g,'0').replace(/[lI]/g,'1');
  const m=s.match(/(?:^|[^\d])(\d{1,2}[,.]\d{3}|0\d{3})\s*k\s*g\b/i);
  if(!m)return '';
  const n=Number(/^0\d{3}$/.test(m[1])?'0.'+m[1].slice(1):m[1].replace(',','.'));
  return Number.isFinite(n)&&n>=.001&&n<=30?n.toFixed(3).replace('.',','):'';
 };
 const delay=()=>new Promise(resolve=>{loop=setTimeout(resolve,160);});
 function cameraOff(){
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  try{video.pause();}catch(_){}
  video.srcObject=null;view.hidden=true;stop.hidden=true;start.hidden=false;start.disabled=false;scanning=false;
 }
 function halt(message){
  token++;cameraOff();starting=false;last='';matches=0;
  if(message)say(message);
 }
 function close(){
  halt();panel.hidden=true;toggle.setAttribute('aria-expanded','false');
 }
 toggle.addEventListener('click',()=>{
  if(panel.hidden){panel.hidden=false;toggle.setAttribute('aria-expanded','true');}
  else close();
 });
 async function engine(){
  if(worker)return worker;
  if(load)return load;
  load=(async()=>{
   if(!window.Tesseract?.createWorker){
    await new Promise((resolve,reject)=>{
     const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
     script.onload=resolve;script.onerror=reject;document.head.append(script);
    });
   }
   const w=await window.Tesseract.createWorker('eng',1,{});
   await w.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,kKgG '});
   worker=w;return w;
  })().catch(e=>{load=null;throw e;});
  return load;
 }
 function frame(){
  const vw=video.videoWidth,vh=video.videoHeight,cw=video.clientWidth,ch=video.clientHeight;
  if(!vw||!vh||!cw||!ch)return null;
  const scale=Math.max(cw/vw,ch/vh),ox=(vw*scale-cw)/2,oy=(vh*scale-ch)/2;
  // 76% de largeur et 16% de hauteur : moins de pixels et moins de texte parasite.
  const x=cw*.12,y=ch*.42,w=cw*.76,h=ch*.16;
  const canvas=document.createElement('canvas');
  canvas.width=900;canvas.height=Math.max(80,Math.round(900*h/w));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return null;
  ctx.drawImage(video,(x+ox)/scale,(y+oy)/scale,w/scale,h/scale,0,0,canvas.width,canvas.height);
  return canvas;
 }
 async function scan(id){
  while(scanning&&id===token&&!document.hidden&&!panel.hidden){
   try{
    const canvas=frame();
    if(canvas){
     const data=await worker.recognize(canvas);
     if(id!==token||!scanning)return;
     const n=parse(data?.data?.text);
     if(n){
      matches=n===last?matches+1:1;last=n;
      say(matches===1?'Poids possible : '+n+' kg. Confirmation…':'Poids reconnu deux fois. Vérifie avant utilisation.');
      if(matches>=2){
       value.textContent=n+' kg';result.hidden=false;
       cameraOff();
       if(navigator.vibrate)try{navigator.vibrate(40);}catch(_){}
       return;
      }
     }else{last='';matches=0;say('Centre la ligne du poids net dans le cadre.');}
    }
   }catch(_){if(id===token)say('Lecture difficile. Rapproche l’étiquette.');}
   if(id!==token||!scanning)return;
   await delay();
  }
 }
 async function activate(){
  if(starting||scanning||panel.hidden)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.isSecureContext){say('Caméra indisponible : utilise Safari en HTTPS.');return;}
  const id=++token;starting=true;start.disabled=true;result.hidden=true;say('Ouverture de la caméra…');
  try{
   const source=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:540},frameRate:{ideal:15,max:24}}});
   if(id!==token||panel.hidden){source.getTracks().forEach(t=>t.stop());return;}
   stream=source;video.srcObject=source;view.hidden=false;start.hidden=true;stop.hidden=false;
   await video.play();
   if(id!==token)return;
   say('Initialisation de la reconnaissance…');
   await engine();
   if(id!==token)return;
   starting=false;scanning=true;last='';matches=0;
   say('Place le poids net dans le cadre.');
   void scan(id);
  }catch(e){
   if(id===token){halt();say(e?.name==='NotAllowedError'?'Autorise la caméra dans Safari.':'Impossible de démarrer. Vérifie la caméra et la connexion initiale.');}
  }finally{if(id===token){starting=false;start.disabled=false;}}
 }
 start.addEventListener('click',()=>{void activate();});
 stop.addEventListener('click',()=>halt('Caméra arrêtée.'));
 again.addEventListener('click',()=>{result.hidden=true;void activate();});
 apply.addEventListener('click',()=>{
  const n=parse(value.textContent);
  if(!n){say('Poids invalide. Relance la lecture.');return;}
  // Le mode grammes utilise un entier; le mode kg conserve trois décimales.
  const grams=$('modeG')?.getAttribute('aria-pressed')==='true';
  gross.value=grams?String(Math.round(Number(n.replace(',','.'))*1000)):n;
  gross.dispatchEvent(new Event('input',{bubbles:true}));
  close();say('Poids inséré dans le champ. Vérifie avant de valider la pesée.');
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)halt();});
 window.addEventListener('pagehide',halt);
 const observer=new MutationObserver(()=>{
  // Le bloc de pesée est caché quand l'utilisateur quitte le calcul.
  const card=gross.closest('.calc-card');
  if(card&&card.getClientRects().length===0&&(!panel.hidden||scanning))close();
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();