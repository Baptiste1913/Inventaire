/* Inventaires U 41.66 — résultat classique prêt, caméra Gemini en continu.
   Clé pilote mémorisable uniquement sur cet appareil ; aucune photo conservée. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const toggle=$('iuGeminiLabToggle'),panel=$('iuGeminiLab');
 if(!panel)return;
 const photo=$('iuGeminiLabPhoto'),picture=$('iuGeminiLabPreview'),
  pilotKey=$('iuGeminiPilotKey'),saveKey=$('iuGeminiSaveKey'),
  forgetKey=$('iuGeminiForgetKey'),keyInfo=$('iuGeminiKeyInfo'),
  analyze=$('iuGeminiAnalyze'),status=$('iuGeminiLabStatus'),
  output=$('iuGeminiLabOutput'),networkTime=$('iuGeminiNetworkTime');
  let file=null,url=null,active=false,attempts=new Set(),generation=0,abort=null;
 let proposal=null,latestLabelFields=null;
 const fixedModel='gemini-3.5-flash-lite';
 const storageKey='iu-gemini-pilot-key-v1';
 const endpoint='https://inventaires-u-prix.baptistee123.workers.dev/gemini-lab';
 const openCamera=$('iuGeminiOpenCamera'),cameraShell=$('iuGeminiCameraShell'),
  video=$('iuGeminiVideo'),closeCamera=$('iuGeminiCloseCamera'),
  torch=$('iuGeminiTorch'),capture=$('iuGeminiCapture');
 let cameraStream=null,cameraStarting=false,cameraEpoch=0,torchOn=false,torchBusy=false;
 let cameraPausedInBackground=false;
 const modeCamera=$('iuGeminiModeCamera'),modePhoto=$('iuGeminiModePhoto');
 const modeControl=$('iuGeminiModeCamera')?.closest('.iu-gemini-mode-control');
 const shortcut=$('iuGeminiCameraShortcut'),grossPreview=$('iuGeminiGrossPreview');
 const nextWeigh=$('iuGeminiNext'),emptyResult=$('iuGeminiEmptyResult');
 const resultGross=$('iuGeminiGrossDisplay'),resultTare=$('iuGeminiTareDisplay'),
  resultNet=$('iuGeminiNetDisplay'),resultHint=$('iuGeminiResultHint'),
  copyNet=$('iuGeminiCopyNet'),copyNetLabel=$('iuGeminiCopyNetLabel');
 const productBar=$('iuGeminiProductBar'),productName=$('iuGeminiProductName'),
  productRate=$('iuGeminiProductRate');
 // La carte reste compacte en permanence : seuls les états changent.
 function updateCardState(nextState){
  panel.dataset.scanState=nextState||(!output.hidden?'review':file?'working':'search');
 }
 function scannerCardVisible(){
  return !document.hidden&&!panel.hidden&&panel.isConnected&&panel.getClientRects().length>0;
 }
 updateCardState('search');
 const setupCallout=$('iuGeminiSetupCallout'),geminiOptions=$('iuGeminiOptions');
 const autoModeButton=$('iuGeminiAutoMode'),manualModeButton=$('iuGeminiManualMode'),
  autoScanState=$('iuGeminiAutoScanState'),autoReset=$('iuGeminiAutoReset');
 const autoSampleCanvas=document.createElement('canvas');
 let cameraMode='auto',autoTimer=0,autoLocked=false,autoSuspended=false,
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
 };
 const formatWeight=g=>Number.isInteger(g)?(g/1000).toFixed(3).replace('.',',')+' kg':'Non reconnu';
 const money=c=>Number.isInteger(c)?(c/100).toFixed(2).replace('.',',')+' €':'Non reconnu';
 // Jour local de l'appareil pour la date de la MAQUETTE d'étiquette.
 const todayForVirtualLabel=()=>{
  const date=new Date();
  return [String(date.getDate()).padStart(2,'0'),
   String(date.getMonth()+1).padStart(2,'0'),
   String(date.getFullYear())].join('.');
 };
 // Le résultat reprend directement la carte de pesée classique.
 // Il reste visible sans étiquette ; la tare suit le panier en cours.
 function refreshResultCard(){
  const context=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const gross=latestLabelFields?.weightGrams,tare=context?.tareGrams;
  const grossValid=Number.isSafeInteger(gross)&&gross>0;
  const tareValid=Number.isSafeInteger(tare)&&tare>=0;
  const net=grossValid&&tareValid&&gross>tare?gross-tare:null;
  if(resultGross)resultGross.textContent=grossValid?formatWeight(gross):'— kg';
  if(resultTare)resultTare.textContent=tareValid?formatWeight(tare):'— kg';
  if(resultNet)resultNet.textContent=net===null?'—':(net/1000).toFixed(3).replace('.',',');
  if(resultHint)resultHint.textContent=net!==null
   ?'Vérifie le poids net et l’étiquette avant de valider.'
   :grossValid?'Poids net indisponible : vérifie le panier et sa tare.'
   :'Présente une étiquette pour calculer le poids net.';
  if(copyNet){
   copyNet.disabled=net===null;
   copyNet.dataset.grams=net===null?'':String(net);
  }
  return net;
 }
 copyNet?.addEventListener('click',async()=>{
  const grams=Number(copyNet.dataset.grams);
  if(copyNet.disabled||!Number.isSafeInteger(grams)||grams<=0)return;
  try{
   await navigator.clipboard.writeText((grams/1000).toFixed(3));
   if(copyNetLabel)copyNetLabel.textContent='Copié';
   setTimeout(()=>{if(copyNetLabel)copyNetLabel.textContent='Copier';},1100);
  }catch(_){say('Impossible de copier sur cet appareil.',true);}
 });
 refreshResultCard();
 function updateButton(){
  analyze.hidden=!file;
  analyze.disabled=!file||!pilotKey.value.trim()||active||attempts.has(fixedModel);
 }
 function resetProposal(){
  proposal=null;
  if(nextWeigh){nextWeigh.disabled=true;nextWeigh.classList.remove('is-ready');}
 }
 function validateResult(result){
  const f=result?.fields||{},c=result?.checks||{};
  const grams=f.weightGrams,rate=f.pricePerKgCents,total=f.totalCents;
  const name=typeof f.name==='string'?f.name.trim():'';
  if(!name||name.length<3||name.length>120)return {error:'Article non reconnu avec certitude.'};
  if(!Number.isSafeInteger(grams)||grams<=0||grams>30000)return {error:'Poids lu sur l’étiquette manquant ou invalide.'};
  if(!Number.isSafeInteger(rate)||rate<=0||rate>1000000||
     !Number.isSafeInteger(total)||total<0)return {error:'Prix au kilo ou montant manquant.'};
  if(Math.abs(Math.round(grams*rate/1000)-total)>1||
     c.arithmeticConsistent!==true)return {error:'Calcul prix × poids incohérent.'};
  if(c.eanChecksumValid!==true||!/^[0-9]{13}$/.test(f.ean13||''))return {error:'EAN non confirmé ou invalide.'};
  return {name,grams,rate,total,ean:f.ean13};
 }
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
  const caption=output.querySelector('.iu-gemini-label-frame-caption');
  if(weight)weight.textContent=corrected?formatWeight(corrected.net):formatWeight(gross);
  const virtualDate=label.querySelector('.iu-gemini-label-date .iu-gemini-label-number');
  if(virtualDate)virtualDate.textContent=todayForVirtualLabel();
  if(total)total.textContent=money(corrected?corrected.cents:fields.totalCents).replace(/\s/g,'');
  if(digits)digits.textContent=corrected?.ean||fields.ean13||'EAN NON RECONNU';
  if(bars)renderEanBars(bars,corrected?.ean||fields.ean13);
  if(caption)caption.textContent=corrected
   ?'Aperçu simulé · EAN recalculé non vérifié sur Zebra'
   :'Aperçu simulé · EAN original';
 }
 // Les contrôles sont refaits au moment du clic de validation.
 function validationState(){
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const corrected=proposal&&ctx
   ?recodeAfterTare(proposal.ean,proposal.grams,ctx.tareGrams,proposal.rate):null;
  const canSave=Boolean(corrected)&&!active;
  if(nextWeigh){
   nextWeigh.disabled=!canSave;
   nextWeigh.classList.toggle('is-ready',canSave);
  }
  const signal=output.querySelector('.iu-gemini-result-signal');
  if(signal&&proposal){
   signal.textContent=corrected
    ?'Vérifie l’article, le brut et la tare avant de valider.'
    :'Validation impossible : vérifie le panier et sa tare.';
   signal.classList.toggle('is-ready',Boolean(corrected));
   signal.classList.toggle('is-warning',!corrected);
  }
  refreshCorrectedLabel();
  return canSave?corrected:null;
 }
 $('basketSelect')?.addEventListener('change',validationState);
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
  picture.hidden=true;picture.removeAttribute('src');
 }
 function resetReading(){
  generation++;abort?.abort();abort=null;active=false;file=null;
  attempts.clear();photo.value='';latestLabelFields=null;
  output.hidden=true;output.replaceChildren();networkTime.textContent='';resetProposal();
  if(grossPreview)grossPreview.value='';
  if(emptyResult)emptyResult.hidden=false;
  if(productBar)productBar.hidden=true;
  if(productName)productName.textContent='';
  if(productRate)productRate.textContent='';
  refreshResultCard();
  clearPreview();capture.disabled=false;updateButton();
  updateCardState('search');
  say('');
 }
 function clear(){stopCamera();resetReading();}
 function setPhoto(chosen){
  if(!chosen)return;
  if(active){say('Analyse en cours : attends la réponse avant de changer de photo.',true);return false;}
  if(!chosen.type.startsWith('image/')||chosen.size>15*1024*1024){
   say('Choisis une image de moins de 15 Mo.',true);return false;
  }
  if(proposal&&!window.confirm('Cette pesée n’est pas encore validée. Abandonner ce résultat pour lire une autre étiquette ?')){
   say('Pesée conservée. Valide-la pour continuer.');return false;
  }
  latestLabelFields=null;
  analyze.textContent='Analyser l’étiquette';
  clearPreview();file=chosen;attempts.clear();generation++;
  url=URL.createObjectURL(chosen);
  picture.src=url;picture.hidden=false;
  output.hidden=true;networkTime.textContent='';resetProposal();
  if(emptyResult)emptyResult.hidden=false;
  if(productBar)productBar.hidden=true;
  if(grossPreview)grossPreview.value='';
  refreshResultCard();
  updateCardState('working');
  updateButton();
  if(!analyze.disabled){
   // Une seule analyse par capture/import. Enregistrement toujours manuel.
   analyze.click();
  }else if(!pilotKey.value.trim()){
   say('Photo prête. Configure la clé Gemini pour lancer l’analyse.',true);
  }else{
   say('Photo prête, analyse indisponible pour le moment.',true);
  }
  return true;
 }
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
 const classicBasket=$('basketSelect'),geminiBasket=$('iuGeminiBasketSelect');
 function syncGeminiBasket(){
  if(!classicBasket||!geminiBasket)return;
  geminiBasket.replaceChildren(...Array.from(classicBasket.options,option=>option.cloneNode(true)));
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
  latestLabelFields=fields;
  const verified=validateResult(result);
  const context=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=context?.tareGrams;
  const gross=fields.weightGrams;
  if(grossPreview)grossPreview.value=Number.isSafeInteger(gross)?(gross/1000).toFixed(3):'';
  const net=Number.isSafeInteger(gross)&&Number.isSafeInteger(tare)?gross-tare:null;
  const arithmetic=checks.arithmeticConsistent===true;
  const eanValid=checks.eanChecksumValid===true;
  const netValid=Number.isSafeInteger(net)&&net>0;
  const ready=!verified.error&&netValid;
  const corrected=ready?recodeAfterTare(fields.ean13,gross,tare,fields.pricePerKgCents):null;
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
  add(grossBox,'strong','iu-gemini-label-number',formatWeight(corrected?.net??gross));
  const dateBox=add(middle,'div','iu-gemini-label-date','');
  add(dateBox,'span','iu-gemini-label-caption',"Date d’emballage");
  // Date du jour pour l'aperçu virtuel, pas pour la photo source.
  add(dateBox,'strong','iu-gemini-label-number',todayForVirtualLabel());
    const bottom=add(label,'div','iu-gemini-label-bottom','');
  const barcode=add(bottom,'div','iu-gemini-label-barcode','');
  const bars=add(barcode,'div','iu-gemini-label-bars','');
  bars.setAttribute('aria-hidden','true');
  renderEanBars(bars,corrected?.ean||fields.ean13);
  add(barcode,'span','iu-gemini-label-ean',corrected?.ean||fields.ean13||'EAN NON RECONNU');
  const total=add(bottom,'div','iu-gemini-label-total','');
  add(total,'span','iu-gemini-label-total-caption','PRIX A PAYER');
  add(total,'strong','iu-gemini-label-total-number',money(fields.totalCents).replace(/\s/g,''));
  // Le résultat permanent au-dessus de l'étiquette est exactement
  // celui de la pesée classique : Brut, Tare et Net dans une seule carte.
  if(productBar)productBar.hidden=false;
  if(productName)productName.textContent=name;
  if(productRate)productRate.textContent=
   Number.isInteger(fields.pricePerKgCents)?money(fields.pricePerKgCents)+'/kg':'Prix non reconnu';
  refreshResultCard();
  const signal=add(output,'p','iu-gemini-result-signal'+(ready?' is-ready':' is-warning'),
   verified.error?'Enregistrement bloqué · '+verified.error
   :!netValid?'Enregistrement bloqué · la tare dépasse le poids lu.'
   :'Vérifie les valeurs avant validation.');
  const frame=add(output,'div','iu-gemini-label-frame','');
  frame.setAttribute('role','group');
  frame.setAttribute('aria-label','Aperçu réduit de l’étiquette virtuelle');
  frame.append(label);
  add(frame,'p','iu-gemini-label-frame-caption','Aperçu simulé · EAN non vérifié sur Zebra');
  output.hidden=false;
  if(emptyResult)emptyResult.hidden=false;
  proposal=ready?verified:null;
  updateCardState(proposal?'review':'retry');
  if(!proposal)resetProposal();
  validationState();
  networkTime.textContent='Gemini : '+(Number(result.elapsedMs)/1000).toFixed(2)+' s'
   +' · total photo + réseau : '+(wallMs/1000).toFixed(2)+' s'
   +' · modèle '+String(result.model||fixedModel);
 }
 analyze.addEventListener('click',async()=>{
  if(analyze.disabled||!file)return;
  const selectedModel=fixedModel,access=pilotKey.value.trim();
  attempts.add(selectedModel);active=true;updateButton();capture.disabled=true;
  output.hidden=true;networkTime.textContent='';resetProposal();
  updateCardState('working');
  if(cameraStream&&cameraMode==='auto')setAutoHint('Analyse en cours · une seule photo envoyée','capturing');
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
   if(!response.ok){
    const message=String(result?.error||'Réponse du Worker impossible');
    // Une réponse 502 non exploitable permet une NOUVELLE tentative manuelle,
    // sans deuxième requête cachée ni sauvegarde automatique.
    if(response.status===502&&/Réponse Gemini non exploitable|Réponse Gemini incomplète|Réponse Gemini vide/i.test(message)){
     attempts.delete(selectedModel);
     analyze.textContent='Réessayer l’analyse';
     throw Error('Gemini n’a pas fourni de lecture utilisable. Recadre l’étiquette ou touche « Réessayer l’analyse ».');
    }
    throw Error(message);
   }
   display(result,performance.now()-start);
   // La validation reste MANUELLE ; en auto, placer le bouton à portée de doigt.
   // L'utilisateur reste au même endroit, sans défilement forcé.
   // L'analyse prépare un brouillon uniquement : aucun enregistrement implicite.
   say(proposal
    ?'Lecture prête : vérifie le poids brut et l’étiquette, puis valide.'
    :'Lecture non validable. Vérifie l’étiquette ou reprends une photo.',!proposal);

  }catch(error){
   if(id===generation&&error?.name!=='AbortError'){
    const reason=String(error?.message||'Échec réseau').slice(0,140);
    say('Essai non terminé : '+reason,true);
    updateCardState('error');
   }
  }finally{
   if(id===generation){
    active=false;abort=null;capture.disabled=false;updateButton();validationState();
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
  cameraPausedInBackground=false;
  clearAutoTimer();clearAutoStability();
  autoLocked=false;autoSuspended=false;autoNeedsChange=false;
  autoCapturePending=false;autoLastCaptured=null;autoChangeReference=null;
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
  openCamera.hidden=true; // ouverture uniquement par le bouton scanner partagé
  openCamera.disabled=false;
  shortcut?.setAttribute('aria-pressed','false');
  shortcut?.setAttribute('aria-expanded','false');
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
    if(cameraMode==='auto'&&!autoSuspended&&!active&&!file&&!proposal)startAutoMonitor();
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
 nextWeigh?.addEventListener('click',()=>{
  if(active||!proposal)return;
  const corrected=validationState();
  if(!corrected){say('Validation impossible : vérifie les données et le panier.',true);return;}
  if(typeof window.IUGeminiSaveWeigh!=='function'){
   say('Enregistrement indisponible sur cette version.',true);return;
  }
  const saved=window.IUGeminiSaveWeigh({
   gross:proposal.grams,product:proposal.name,ean13:proposal.ean,
   pricePerKgCents:proposal.rate,totalCents:proposal.total,
   correctedEan13:corrected.ean,correctedTotalCents:corrected.cents
  });
  if(saved?.ok){
   resetReading();
   if(cameraStream&&cameraMode==='auto')armAutoScanner(true);
   say('Pesée validée et enregistrée · '+formatWeight(saved.net)+' net. Prêt pour la suivante.');
   // Le scanner reste sur la même carte, sans saut de page.
  }else if(saved?.duplicate){
   say('Cette étiquette a déjà été enregistrée : aucun doublon ajouté.',true);
  }else{
   say('Pesée non enregistrée : '+String(saved?.reason||'erreur de sauvegarde'),true);
  }
 });
 openCamera.addEventListener('click',startCamera);
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
   usable:bright>.25&&darkness>.015&&darkness<.60&&
    sharpness>7&&strongRatio>.027};
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
  if(autoReset)autoReset.hidden=!(cameraMode==='auto'&&cameraStream&&autoLocked&&!active&&!proposal&&Boolean(file));
 }
 function clearAutoTimer(){
  if(autoTimer){clearTimeout(autoTimer);autoTimer=0;}
 }
 function clearAutoStability(){
  autoLastFrame=null;autoStableSince=0;autoStableCount=0;autoChangeCount=0;
 }
 function armAutoScanner(afterValidation=false){
  clearAutoStability();
  autoLocked=false;autoSuspended=false;
  autoChangeReference=afterValidation?autoLastCaptured:null;
  autoNeedsChange=Boolean(autoChangeReference);
  autoEarliest=performance.now()+(afterValidation?650:320);
  autoCapturePending=false;
  if(cameraMode==='auto'&&cameraStream){
   setAutoHint(afterValidation?'Présente une autre étiquette':'Centre une étiquette nette','waiting');
   startAutoMonitor();
  }
 }
 function startAutoMonitor(){
  if(cameraMode!=='auto'||!cameraStream||!scannerCardVisible()||autoTimer)return;
  autoTimer=setTimeout(autoTick,230);
 }
 function autoTick(){
  autoTimer=0;
  if(!scannerCardVisible()||!cameraStream||cameraShell.hidden||cameraMode!=='auto')return;
  try{
   if(!autoLocked&&!autoSuspended&&!active&&!file&&!proposal&&performance.now()>=autoEarliest){
    if(!pilotKey.value.trim()){
     setAutoHint('Configure la clé Gemini pour le scan auto','waiting');
    }else if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
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
      const changed=autoFrameDistance(quality.pixels,autoChangeReference)>11||!quality.usable;
      autoChangeCount=changed?autoChangeCount+1:0;
      if(autoChangeCount<2){
       setAutoHint('Écarte l’ancienne étiquette avant la suivante','waiting');
       autoLastFrame=null;return;
      }
      autoNeedsChange=false;autoChangeReference=null;
      autoLastFrame=null;autoStableSince=0;autoStableCount=0;
      autoEarliest=now+250;
      setAutoHint('Nouvelle étiquette détectée · stabilise','framing');
     }
     if(!quality.usable){
      clearAutoStability();
      setAutoHint('Approche et centre une seule étiquette nette','framing');
     }else{
      const motion=autoFrameDistance(quality.pixels,autoLastFrame);
      if(motion>=10.5||!autoLastFrame){
       autoStableSince=now;autoStableCount=1;
       setAutoHint('Maintiens l’étiquette immobile','framing');
      }else{
       autoStableCount++;
       setAutoHint('Étiquette cadrée · contrôle de netteté','framing');
      }
      autoLastFrame=quality.pixels;
      if(autoStableCount>=4&&now-autoStableSince>=650&&now>=autoEarliest){
       autoLocked=true;
       autoLastCaptured=quality.pixels;
       autoCapturePending=true;
       setAutoHint('Photo nette · analyse Gemini…','capturing');
       capture.click();
      }
     }
    }
   }
  }catch(_){
   autoLocked=true;
   setAutoHint('Détection automatique indisponible · utilise Capturer','error');
  }finally{
   if(scannerCardVisible()&&cameraMode==='auto'&&cameraStream&&!cameraShell.hidden)
    startAutoMonitor();
  }
 }
 function selectCameraMode(mode){
  cameraMode=mode==='manual'?'manual':'auto';
  autoModeButton?.setAttribute('aria-pressed',String(cameraMode==='auto'));
  manualModeButton?.setAttribute('aria-pressed',String(cameraMode==='manual'));
  autoModeButton?.classList.toggle('is-selected',cameraMode==='auto');
  manualModeButton?.classList.toggle('is-selected',cameraMode==='manual');
  if(capture)capture.textContent=cameraMode==='auto'?'Capturer maintenant':'Capturer cette étiquette';
  if(cameraMode==='manual'){
   clearAutoTimer();setAutoHint('Capture manuelle activée','manual');
  }else if(cameraStream&&!file&&!active&&!proposal){
   armAutoScanner(false);
  }else{
   setAutoHint('Valide ou reprends la lecture en cours','waiting');
   startAutoMonitor();
  }
 }
 autoModeButton?.addEventListener('click',()=>selectCameraMode('auto'));
 manualModeButton?.addEventListener('click',()=>selectCameraMode('manual'));
 autoReset?.addEventListener('click',()=>{
  if(active||proposal||!cameraStream)return;
  resetReading();armAutoScanner(false);
  say('Détection automatique reprise : centre une étiquette nette.');
 });

 capture.addEventListener('click',async()=>{
  if(!cameraStream||active||!video.videoWidth||!video.videoHeight)return;
  const automatic=autoCapturePending;
  autoCapturePending=false;autoLocked=true;
  lastPhotoWasAuto=automatic;
  if(!automatic)autoLastCaptured=autoLastFrame;
  setAutoHint(automatic?'Capture automatique · analyse en cours':'Capture manuelle · analyse en cours','capturing');
  capture.disabled=true;
  try{
   const cv=document.createElement('canvas');
   const viewport=video.getBoundingClientRect();
   const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,viewport.width,viewport.height);
   const factor=Math.min(1,1600/Math.max(crop.width,crop.height));
   cv.width=Math.max(1,Math.round(crop.width*factor));
   cv.height=Math.max(1,Math.round(crop.height*factor));
   const ctx=cv.getContext('2d');
   if(!ctx)throw Error('Capture impossible');
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='high';
   ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,cv.width,cv.height);
   const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.90));
   if(!blob)throw Error('Capture impossible');
   setPhoto(new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'}));
  }catch(_){
   say('Capture impossible. Réessaie.',true);
   setAutoHint('Capture impossible · utilise le bouton manuel','error');
  }
  finally{capture.disabled=active;}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&cameraStream){
   // Aucune image vidéo ne doit rester capturée lorsque la PWA est masquée.
   // Désactiver temporairement la piste au lieu de la détruire évite
   // de redemander l'accès lors de courts changements d'application.
   clearAutoTimer();
   cameraPausedInBackground=true;
   for(const track of cameraStream.getVideoTracks())track.enabled=false;
   try{video.pause()}catch(_){}
  }else if(!document.hidden&&cameraPausedInBackground&&cameraStream){
   cameraPausedInBackground=false;
   const track=cameraStream.getVideoTracks?.()[0];
   if(!track||track.readyState!=='live'){
    stopCamera();
    say('iOS a interrompu la caméra. Touche Scanner pour la rouvrir.',true);
    return;
   }
   track.enabled=true;
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
