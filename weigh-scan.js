/* Inventaires U v41.21 — retour de détection compatible et confirmation visuelle iPhone. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const trigger=$('iuWeighScanToggle'),overlay=$('iuWeighScanOverlay');
 if(!trigger||!overlay)return;
 const closeBtn=$('iuWeighScanClose'),video=$('iuWeighScanVideo'),torchBtn=$('iuWeighScanTorch'),guide=overlay.querySelector('.iu-weigh-scan-guide'),
 photoCamera=$('iuWeighScanPhotoCamera'),photoGallery=$('iuWeighScanPhotoGallery'),
 photoStatus=$('iuWeighScanPhotoStatus'),photoResult=$('iuWeighScanPhotoResult'),
 detected=$('iuWeighScanDetected'),
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
 let torchEnabled=false,torchBusy=false,lastDetectionFeedbackAt=-Infinity;
 let photoBusy=false,photoToken=0,scanRead=null;
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
 function resetDetectedIndicator(){
  if(!detected)return;
  detected.hidden=true;
  detected.classList.remove('is-visible');
  detected.removeAttribute('title');
 }
 function revealDetectedIndicator(grams){
  if(!detected||overlay.hidden)return;
  detected.title='Poids reconnu : '+format(grams);
  detected.setAttribute('aria-label','Poids reconnu : '+format(grams));
  detected.hidden=false;
  detected.classList.remove('is-visible');
  void detected.offsetWidth;
  detected.classList.add('is-visible');
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
  photoToken++;
  session++;scanning=false;starting=false;stopTracks();resetObservations();
  if(photoStatus)photoStatus.textContent='Aucune photo analysée.';
  if(photoResult){photoResult.hidden=true;photoResult.replaceChildren();}
  proposalGrams=null;proposal.hidden=true;retry.hidden=true;
  resetDetectedIndicator();
  guide?.classList.remove('iu-weigh-scan-confirmed');
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

 // Lecture locale d'une photo entière de DIGI : aucune valeur n'est appliquée
 // aux inventaires ; ne pas déduire un prix unitaire du code-barres.
 function parseWholeLabel(raw){
  const lines=String(raw||'').replace(/[\u00a0\u202f]/g,' ').replace(/[’‘]/g,"'")
   .split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const text=lines.join(' ');
  const values=(regex,mult,max)=>[...new Set([...text.matchAll(regex)]
   .map(m=>Math.round(Number(m[1].replace(',','.'))*mult))
   .filter(n=>Number.isSafeInteger(n)&&n>0&&n<=max))];
  const weights=values(/(?:^|[^\d.,€/$])(\d{1,2}[,.]\d{3})\s*k\s*g\b/gi,1000,30000);
  const rates=values(/(?:^|[^\d.,])(\d{1,3}[,.]\d{2})\s*(?:€|EUR|E)?\s*\/\s*k\s*g\b/gi,100,99999);
  const totals=values(/(?:^|[^\d.,])(\d{1,3}[,.]\d{2})\s*(?:€|EUR)(?!\s*\/\s*k\s*g\b)/gi,100,99999);
  const labeled=text.match(/(?:prix\s*(?:a|à)\s*payer|montant\s*total|total\s*(?:a|à)\s*payer)\s*[:\-]?\s*(\d{1,3}[,.]\d{2})/i);
  if(labeled){
   const cents=Math.round(Number(labeled[1].replace(',','.'))*100);
   if(cents>0&&cents<=99999&&!totals.includes(cents))totals.push(cents);
  }
  const name=lines.find(line=>{
   const letters=(line.match(/\p{L}/gu)||[]),caps=(line.match(/[A-ZÀ-Ÿ]/g)||[]);
   return letters.length>=5&&letters.length<=32&&caps.length/letters.length>.75&&
    !/(SUPER\s*U|SAINT|GERMAIN|PRIX|POIDS|TOTAL|PAYER|EMBALLAGE|DATE|EUR|KG|CARTE)/i.test(line)&&
    !/\d{2,}/.test(line);
  })||'';
  const checkEAN=c=>{
   if(!/^\d{13}$/.test(c))return false;
   let sum=0;
   for(let i=0;i<12;i++)sum+=Number(c[i])*(i%2?3:1);
   return (10-sum%10)%10===Number(c[12]);
  };
  const eans=[...new Set((text.match(/(?<!\d)\d{13}(?!\d)/g)||[]).filter(checkEAN))];
  const weight=weights.length===1?weights[0]:null;
  const rate=rates.length===1?rates[0]:null;
  const total=totals.length===1?totals[0]:null;
  return {name,weight,rate,total,ean:eans.length===1?eans[0]:null,
   ambiguous:weights.length>1||rates.length>1||totals.length>1,
   consistent:weight!==null&&rate!==null&&total!==null&&
    Math.round(weight*rate/1000)===total};
 }
 function agreeWholeLabel(a,b){
  // Deux configurations de reconnaissance de la même image : accord numérique
  // obligatoire ; ce n'est pas une preuve absolue d'exactitude.
  if(!a.consistent||!b.consistent||a.ambiguous||b.ambiguous)return false;
  if(a.weight!==b.weight||a.rate!==b.rate||a.total!==b.total)return false;
  if(a.ean&&b.ean&&a.ean!==b.ean)return false;
  if(a.name&&b.name&&a.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()!==b.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())return false;
  return true;
 }
 function displayWholeLabel(p,agreed){
  if(!photoResult)return false;
  const euro=n=>n===null?'Non détecté':(n/100).toFixed(2).replace('.',',')+' €';
  const tare=context()?.tareGrams;
  const same=proposalGrams===null||p.weight===proposalGrams;
  const encoded=typeof window.IUDigiWeight?.amountCents==='function'&&p.ean
   ?window.IUDigiWeight.amountCents(p.ean,p.ean.slice(0,7)):null;
  const barcodeContradiction=encoded!==null&&p.total!==null&&encoded!==p.total;
  const valid=p.consistent&&!p.ambiguous&&same&&agreed&&!barcodeContradiction;
  const rows=[
   ['Article OCR',p.name||'Non détecté'],
   ['Poids imprimé',p.weight===null?'Non détecté':format(p.weight)],
   ['Prix au kilo',p.rate===null?'Non détecté':euro(p.rate)+'/kg'],
   ['Prix total',euro(p.total)],
   ['EAN en OCR',p.ean||'Non détecté (lecteur de codes-barres séparé)'],
   ['Accord entre 2 lectures',agreed?'Valeurs numériques identiques':'Échec : vérifier chaque chiffre'],
   ['Contrôle code DIGI / montant',encoded===null?'Non vérifiable avec ce code'
    :barcodeContradiction?'Prix encodé contradictoire : REFUS':'Prix encodé cohérent (format DIGI)']
  ];
  if(p.weight!==null&&Number.isSafeInteger(tare)&&tare>=0){
   const net=p.weight-tare;
   rows.push(['Après tare du panier',net>=0?format(net):'Tare supérieure au poids : refus']);
  }
  rows.push(['Contrôle des montants',
   valid?'Prix × poids cohérent · vérification visuelle nécessaire':
   p.ambiguous?'Valeurs contradictoires : refus':
   !agreed?'Deux lectures différentes ou incomplètes : refus':
   barcodeContradiction?'EAN et prix contradictoires : refus':
   !same?'Poids différent du scanner : refus':
   'Incomplet ou incohérent : aucun calcul validé']);
  photoResult.replaceChildren();
  for(const [label,value] of rows){
   const row=document.createElement('div');row.className='iu-weigh-ocr-row';
   const a=document.createElement('span');a.textContent=label;
   const b=document.createElement('strong');b.textContent=value;
   row.append(a,b);photoResult.append(row);
  }
  const warning=document.createElement('p');warning.className='iu-weigh-ocr-note';
  warning.textContent='Essai OCR local seulement. Ne valide aucune pesée et ne crée aucun EAN.';
  photoResult.append(warning);photoResult.hidden=false;
  return valid;
 }
 async function readWholeLabelPhoto(file){
  if(!file||photoBusy||overlay.hidden||!photoStatus||!photoResult)return;
  if(!file.type.startsWith('image/')||file.size>18*1024*1024){
   photoStatus.textContent='Sélectionne une photo de moins de 18 Mo.';return;
  }
  const token=++photoToken;
  photoBusy=true;session++;scanning=false;
  photoResult.hidden=true;photoResult.replaceChildren();
  photoStatus.textContent='Analyse locale de la photo en cours…';
  let url=null;
  try{
   if(scanRead)await scanRead.catch(()=>{});
   const ocr=await engine();
   url=URL.createObjectURL(file);
   const picture=new Image();
   await new Promise((resolve,reject)=>{
    picture.onload=resolve;picture.onerror=reject;picture.src=url;
   });
   const w=picture.naturalWidth,h=picture.naturalHeight;
   if(!w||!h)throw Error('Image vide');
   const scale=Math.min(2,1800/Math.max(w,h));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(w*scale));
   canvas.height=Math.max(1,Math.round(h*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Canvas inaccessible');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(picture,0,0,canvas.width,canvas.height);
   await ocr.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
   const answer=await ocr.recognize(canvas);
   if(token!==photoToken||overlay.hidden)return;
   // Deuxième lecture : traitement de luminosité puis mode texte épars.
   // Aucune donnée n'est envoyée à un serveur.
   photoStatus.textContent='Vérification des chiffres avec une deuxième lecture locale…';
   const confirmCanvas=document.createElement('canvas');
   confirmCanvas.width=canvas.width;confirmCanvas.height=canvas.height;
   const confirmCtx=confirmCanvas.getContext('2d',{willReadFrequently:true});
   if(!confirmCtx)throw Error('Traitement image indisponible');
   confirmCtx.drawImage(canvas,0,0);
   const pixels=confirmCtx.getImageData(0,0,confirmCanvas.width,confirmCanvas.height);
   const d=pixels.data;
   for(let i=0;i<d.length;i+=4){
    const gray=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
    const enhanced=Math.max(0,Math.min(255,Math.round((gray-128)*1.24+132)));
    d[i]=d[i+1]=d[i+2]=enhanced;
   }
   confirmCtx.putImageData(pixels,0,0);
   await ocr.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
   const second=await ocr.recognize(confirmCanvas);
   if(token!==photoToken||overlay.hidden)return;
   const parsed=parseWholeLabel(answer?.data?.text||'');
   const check=parseWholeLabel(second?.data?.text||'');
   const agreed=agreeWholeLabel(parsed,check);
   const valid=displayWholeLabel(parsed,agreed);
   photoStatus.textContent=valid
    ?'Deux lectures concordantes et contrôles cohérents. Vérifie encore la photo.'
    :'Lecture non confirmée : aucun transfert, refais une photo plus nette.';
  }catch(_){
   if(token===photoToken&&!overlay.hidden)
    photoStatus.textContent='Lecture impossible : vérifie la photo ou le chargement OCR.';
  }finally{
   if(url)URL.revokeObjectURL(url);
   if(worker)try{await worker.setParameters({
    tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.,kKgG '
   });}catch(_){}
   photoBusy=false;
  }
 }
 for(const input of [photoCamera,photoGallery]){
  input?.addEventListener('change',()=>{
   const file=input.files?.[0]||null;
   input.value='';
   if(file)void readWholeLabelPhoto(file);
  });
 }

 // Une seule confirmation par nouvelle pesée reconnue. La lecture OCR
 // est déjà interrompue après showProposal : aucune vibration répétée.
 // iOS Safari ne prend pas en charge navigator.vibrate ; sur iPhone
 // l'éclat visuel fournit le retour sans contour permanent supplémentaire.
 function signalWeightDetected(){
  if(document.hidden||overlay.hidden)return;
  const now=performance.now();
  if(now-lastDetectionFeedbackAt<900)return;
  lastDetectionFeedbackAt=now;
  if(proposalGrams!==null)revealDetectedIndicator(proposalGrams);
  guide?.classList.remove('iu-weigh-scan-confirmed');
  // Une seule lecture du layout uniquement sur résultat pour relancer
  // proprement le très court éclat lors d'une étiquette suivante.
  if(guide)void guide.offsetWidth;
  guide?.classList.add('iu-weigh-scan-confirmed');
  if(typeof navigator.vibrate==='function'){
   try{navigator.vibrate(35);}catch(_){}
  }
 }
 function showProposal(grams){
  // Une seule lecture crédible est proposée, sans nouvelle phase de mise au
  // point. La caméra reste ALLUMÉE, mais l'OCR est arrêté jusqu'à validation.
  const transferred=typeof window.IUWeighScanDraft==='function'&&window.IUWeighScanDraft(grams)===true;
  proposalGrams=grams;value.textContent=format(grams);
  scanning=false;overlay.dataset.state='result';
  revealDetectedIndicator(grams);
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
  signalWeightDetected();
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
     const reading=worker.recognize(canvas);
      scanRead=reading;
      const data=await reading;
      scanRead=null;
     if(!scanning||id!==session)return;
     const confidence=Number(data?.data?.confidence)||0;
     const grams=extractWeight(data?.data?.text);
     if(evaluateObservation(grams,confidence))return;
     if(grams===null||confidence<54)say('');
    }
   }catch(_){
    scanRead=null;
    if(id===session&&scanning){resetObservations();say('Lecture difficile. Stabilise l’étiquette et rapproche-la.');}
   }
   if(id!==session||!scanning)return;
   // Le OCR est déjà séquentiel : délai court pour ne pas pénaliser la détection.
   await new Promise(resolve=>setTimeout(resolve,65));
  }
 }
 function resumeScan(){
  if(overlay.hidden||document.hidden||starting||scanning||photoBusy||!worker||!stream)return false;
  session++;const id=session;
  proposalGrams=null;proposal.hidden=true;retry.hidden=true;
  resetDetectedIndicator();
  guide?.classList.remove('iu-weigh-scan-confirmed');
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
  if(starting||scanning||photoBusy||overlay.hidden||document.hidden)return;
  // Une piste encore active est réutilisée : pas de nouvelle permission.
  // Une piste définitivement terminée ne peut pas être réactivée.
  const existingTrack=stream?.getVideoTracks?.()[0];
  if(stream&&(!existingTrack||existingTrack.readyState!=='live'))stopTracks();
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
   say('Caméra indisponible : vérifie les autorisations iPhone et HTTPS.',true);
   retry.hidden=false;return;
  }
  const id=++session;starting=true;retry.hidden=true;proposal.hidden=true;proposalGrams=null;
  resetDetectedIndicator();
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
   const isNewStream=stream!==source;
   stream=source;
   if(video.srcObject!==source)video.srcObject=source;
   if(isNewStream){
    requestContinuousFocus(source);
    source.getVideoTracks?.()[0]?.addEventListener('ended',()=>{
     if(stream!==source||overlay.hidden||document.hidden)return;
     session++;scanning=false;
     retry.hidden=false;overlay.dataset.state='error';
     say('Caméra interrompue. Appuie sur « Relancer la caméra ».',true);
    },{once:true});
   }
   if(video.paused)await video.play();
   refreshTorchAvailability();
   await enginePromiseLocal;
   if(overlay.hidden||id!==session)return;
   starting=false;resumeScan();
  }catch(error){
   if(id!==session)return;
   // Si l'autoplay échoue mais que la piste est encore valide, conserver
   // cette autorisation et laisser l'utilisateur relancer la lecture.
   const live=stream?.getVideoTracks?.()[0]?.readyState==='live';
   if(!live)stopTracks();
   starting=false;overlay.dataset.state='error';retry.hidden=false;
   say(live
    ?'Caméra en pause. Appuie sur « Relancer la caméra ».'
    :error?.name==='NotAllowedError'
     ?'Accès caméra refusé. Vérifie l’autorisation de ce site dans Safari.'
     :'Scanner indisponible. Vérifie la caméra et les autorisations.',true);
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
 // iOS suspend lui-même la vidéo en arrière-plan. Ne pas appeler
 // MediaStreamTrack.stop() ici : cela imposait un nouvel getUserMedia()
 // et pouvait provoquer une demande d'autorisation à chaque retour.
 function suspendForBackground(){
  if(overlay.hidden)return;
  session++;scanning=false;starting=false;
  resetDetectedIndicator();
  resetObservations();overlay.dataset.state='suspended';
  say('');
  try{video.pause();}catch(_){}
 }
 function resumeAfterBackground(){
  if(overlay.hidden||document.hidden||gross.getClientRects().length===0||starting||scanning||photoBusy)return;
  const track=stream?.getVideoTracks?.()[0];
  if(track?.readyState==='live'){
   // Reprendre la piste existante, sans nouvel appel à getUserMedia.
   void startCamera();
  }else{
   // Si iOS a définitivement coupé la piste, garder le scanner visible
   // et ne pas déclencher de nouvelle permission sans action explicite.
   retry.hidden=false;overlay.dataset.state='error';
   say('La caméra a été interrompue. Appuie sur « Relancer la caméra ».',true);
  }
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
