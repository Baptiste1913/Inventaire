/* Inventaires U 41.47 — viseur Gemini expérimental indépendant des pesées.
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
  output=$('iuGeminiLabOutput'),networkTime=$('iuGeminiNetworkTime'),
  transfer=$('iuGeminiTransfer'),transferSummary=$('iuGeminiTransferSummary'),
  transferCheck=$('iuGeminiTransferCheck'),confirmArticle=$('iuGeminiConfirmArticle'),
  confirmTare=$('iuGeminiConfirmTare'),transferApply=$('iuGeminiTransferApply');
 let file=null,url=null,active=false,attempts=new Set(),generation=0,abort=null;
 let proposal=null,latestLabelFields=null;
 const fixedModel='gemini-3.5-flash-lite';
 const storageKey='iu-gemini-pilot-key-v1';
 const endpoint='https://inventaires-u-prix.baptistee123.workers.dev/gemini-lab';
 const openCamera=$('iuGeminiOpenCamera'),cameraShell=$('iuGeminiCameraShell'),
  video=$('iuGeminiVideo'),closeCamera=$('iuGeminiCloseCamera'),
  torch=$('iuGeminiTorch'),capture=$('iuGeminiCapture');
 let cameraStream=null,cameraStarting=false,cameraEpoch=0,torchOn=false,torchBusy=false;
 const modeCamera=$('iuGeminiModeCamera'),modePhoto=$('iuGeminiModePhoto');
 const modeControl=$('iuGeminiModeCamera')?.closest('.iu-gemini-mode-control');
 const shortcut=$('iuGeminiCameraShortcut'),grossPreview=$('iuGeminiGrossPreview');
 const nextWeigh=$('iuGeminiNext'),emptyResult=$('iuGeminiEmptyResult');
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
 function refreshCorrectedLabel(){
  if(!latestLabelFields)return;
  const f=latestLabelFields;
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=ctx?.tareGrams;
  const corrected=recodeAfterTare(f.ean13,f.weightGrams,tare,f.pricePerKgCents);
  const label=output.querySelector('.iu-gemini-printed-label');
  if(!label)return;
  const weight=label.querySelector('.iu-gemini-label-gross .iu-gemini-label-number');
  const total=label.querySelector('.iu-gemini-label-total-number');
  const digits=label.querySelector('.iu-gemini-label-ean');
  const bars=label.querySelector('.iu-gemini-label-bars');
  const notice=output.querySelector('.iu-gemini-label-notice');
  const comparison=output.querySelector('.iu-gemini-recode-summary');
  if(weight)weight.textContent=corrected?formatWeight(corrected.net):formatWeight(f.weightGrams);
  const quickGross=output.querySelector('.iu-gemini-quick-gross');
  const quickNet=output.querySelector('.iu-gemini-quick-net-value');
  const quickTare=output.querySelector('.iu-gemini-quick-tare');
  if(quickGross)quickGross.textContent=formatWeight(f.weightGrams);
  const netValue=Number.isSafeInteger(f.weightGrams)&&Number.isSafeInteger(tare)&&f.weightGrams>tare?f.weightGrams-tare:null;
  if(quickNet)quickNet.textContent=netValue===null?'—':(netValue/1000).toFixed(3).replace('.',',');
  if(quickTare)quickTare.textContent=formatWeight(tare);
  if(total)total.textContent=money(corrected?corrected.cents:f.totalCents).replace(/\\s/g,'');
  if(digits)digits.textContent=corrected?.ean||f.ean13||'EAN NON RECONNU';
  if(bars)renderEanBars(bars,corrected?.ean||f.ean13);
  if(notice)notice.textContent=corrected?'Code recalculé après tare · expérimental, non validé sur Zebra':'Code original · choisir une tare valide pour recalculer';
  if(comparison){
   comparison.hidden=!corrected;
   const code=comparison.querySelector('.iu-gemini-recode-code');
   const details=comparison.querySelector('.iu-gemini-recode-details');
   if(code)code.textContent=corrected?.ean||'';
   if(details)details.textContent=corrected?'Original : '+f.ean13+' · montant corrigé : '+money(corrected.cents)+' · poids : '+formatWeight(corrected.net):'';
  }
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
  refreshCorrectedLabel();
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
  refreshCorrectedLabel();
  resetTransfer();
  say('Poids BRUT de l’étiquette transféré en brouillon, sans sauvegarde. La tare du panier est déduite par le formulaire : vérifie le net et valide la pesée.');
 });
 function clearPreview(){
  if(url){URL.revokeObjectURL(url);url=null;}
  picture.hidden=true;picture.removeAttribute('src');
 }
 function resetReading(){
  generation++;abort?.abort();abort=null;active=false;file=null;
  attempts.clear();photo.value='';latestLabelFields=null;
  output.hidden=true;output.replaceChildren();networkTime.textContent='';resetTransfer();
  if(grossPreview)grossPreview.value='';
  if(emptyResult)emptyResult.hidden=false;
  clearPreview();capture.disabled=false;updateButton();
  say('Scanne une étiquette pour commencer.');
 }
 function clear(){stopCamera();resetReading();}
 function setPhoto(chosen){
  if(!chosen)return;
  if(active){say('Analyse en cours : attends la réponse avant de changer de photo.',true);return;}
  if(!chosen.type.startsWith('image/')||chosen.size>15*1024*1024){
   say('Choisis une image de moins de 15 Mo.',true);return;
  }
  latestLabelFields=null;
  clearPreview();file=chosen;attempts.clear();generation++;
  url=URL.createObjectURL(chosen);
  picture.src=url;picture.hidden=false;
  output.hidden=true;networkTime.textContent='';resetTransfer();
  if(emptyResult)emptyResult.hidden=false;
  if(grossPreview)grossPreview.value='';
  say(cameraStream?'Photo capturée. Appuie sur « Analyser une fois », puis vise la suivante.':'Photo prête. Une analyse sera envoyée uniquement après validation.');
  updateButton();
 }
 photo.addEventListener('change',()=>{
  selectReadingMode('photo');
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
 // Le panier Gemini réutilise la sélection et les règles de tare de la pesée classique.
 const classicBasket=$('basketSelect'),geminiBasket=$('iuGeminiBasketSelect');
 function syncGeminiBasket(){
  if(!classicBasket||!geminiBasket)return;
  geminiBasket.replaceChildren(...Array.from(classicBasket.options,option=>option.cloneNode(true)));
  geminiBasket.value=classicBasket.value;
 }
 if(classicBasket&&geminiBasket){
  syncGeminiBasket();
  classicBasket.addEventListener('change',syncGeminiBasket);
  geminiBasket.addEventListener('change',()=>{
   classicBasket.value=geminiBasket.value;
   classicBasket.dispatchEvent(new Event('change',{bubbles:true}));
  });
  new MutationObserver(syncGeminiBasket).observe(classicBasket,{childList:true,subtree:true});
 }
 if(toggle)toggle.addEventListener('click',()=>{
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
  svg.setAttribute('viewBox','0 0 95 56');
  svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Code-barres EAN-13 généré '+ean);
  svg.classList.add('iu-gemini-ean-svg');
  for(let i=0;i<bits.length;i++){
   if(bits[i]!=='1')continue;
   const rect=document.createElementNS(ns,'rect');
   rect.setAttribute('x',String(i));rect.setAttribute('y','0');
   rect.setAttribute('width','1');rect.setAttribute('height',(i<3||i>=92||i>=45&&i<50)?'56':'49');
   rect.setAttribute('fill','#111');svg.append(rect);
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
  add(grossBox,'strong','iu-gemini-label-number',formatWeight(corrected?.net??gross));
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
  renderEanBars(bars,corrected?.ean||fields.ean13);
  add(barcode,'span','iu-gemini-label-ean',corrected?.ean||fields.ean13||'EAN NON RECONNU');
  const total=add(bottom,'div','iu-gemini-label-total','');
  add(total,'span','iu-gemini-label-total-caption','PRIX A PAYER');
  add(total,'strong','iu-gemini-label-total-number',money(fields.totalCents).replace(/\s/g,''));
  // Résultat compact, comme l'OCR : poids brut et net côte à côte.
  const summary=add(output,'div','iu-gemini-label-summary','');
  // Même composant de résultat que la pesée classique : structure et classes partagées.
  const glow=add(output,'div','iu-result-glow-shell','');
  const lights=add(glow,'div','iu-result-glow-field','');
  lights.setAttribute('aria-hidden','true');
  for(const color of ['red','blue','green'])add(lights,'span','iu-home-glow-orb iu-home-glow-'+color,'');
  const quick=add(glow,'div','result iu-result-compact','');
  const waves=add(quick,'div','iu-result-light-field iu-welcome-dot-wave','');
  waves.setAttribute('aria-hidden','true');
  add(waves,'i','','');add(waves,'i','','');
  const weights=add(quick,'div','iu-result-weights','');
  const brut=add(weights,'span','','Brut ');
  add(brut,'strong','iu-gemini-quick-gross',formatWeight(gross));
  const tareWeight=add(weights,'span','','Tare ');
  add(tareWeight,'strong','iu-gemini-quick-tare',formatWeight(tare));
  const heading=add(quick,'div','result-heading','');
  add(heading,'span','','Poids net');
  const copy=add(heading,'button','copy-btn iu-gemini-copy','');
  copy.type='button';copy.disabled=!netValid;
  copy.setAttribute('aria-label','Copier le poids net Gemini');
  copy.innerHTML='<svg class="copy-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8h2"/></svg><svg class="copy-btn-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>Copier</span>';
  copy.addEventListener('click',async()=>{
   if(!netValid)return;
   try{await navigator.clipboard.writeText((net/1000).toFixed(3));say('Poids net copié.');}
   catch{say('Impossible de copier sur cet appareil.',true);}
  });
  const netLine=add(quick,'div','net-line','');
  add(netLine,'strong','iu-gemini-quick-net-value',netValid?String((net/1000).toFixed(3)).replace('.',','):'—');
  add(netLine,'span','','kg');
  add(quick,'p','result-subtitle','Poids des produits après déduction du panier.');
  const statusText=ready?'Contrôles cohérents · vérification visuelle requise'
    :verified.error?'Transfert bloqué · '+verified.error
    :!netValid?'Transfert bloqué · tare supérieure ou égale au brut'
    :'Vérification nécessaire';
  add(summary,'span','iu-gemini-label-state'+(ready?' is-ready':' is-review'),statusText);
  // L'étiquette numérique corrigée vient APRÈS le résultat OCR compact.
  output.append(label);
  output.append(summary);
  add(output,'p','iu-gemini-label-notice',corrected
   ?'Code DIGI recalculé expérimentalement après tare · non validé sur Zebra · barres EAN-13 générées, lecture Zebra non vérifiée'
   :'Code-barres original · barres EAN-13 générées');
  if(corrected){
   const compare=add(output,'div','iu-gemini-recode-summary','');
   add(compare,'span','iu-gemini-recode-title','CODE RECALCULÉ APRÈS TARE · EXPÉRIMENTAL');
   add(compare,'strong','iu-gemini-recode-code',corrected.ean);
   add(compare,'span','iu-gemini-recode-details','Original : '+fields.ean13+' · montant corrigé : '+money(corrected.cents)+' · poids : '+formatWeight(corrected.net));
  }
  refreshCorrectedLabel();
  const checksRow=add(output,'div','iu-gemini-label-checks','');
  add(checksRow,'span',arithmetic?'is-ok':'is-warning',
   (arithmetic?'✓':'!')+' Calcul du prix '+(arithmetic?'cohérent':'à vérifier'));
  add(checksRow,'span',eanValid?'is-ok':'is-warning',
   (eanValid?'✓':'!')+' EAN '+(eanValid?'valide':'à vérifier'));
  const caution=add(output,'p','iu-gemini-result-warning',
   'Un calcul cohérent ou un EAN valide ne garantit pas que Gemini a lu les bons chiffres. Compare avec la photo avant de confirmer.');
  output.hidden=false;
  if(emptyResult)emptyResult.hidden=true;
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
   // Enregistrement automatique uniquement après validation stricte des données.
   const checked=validateResult(result);
   const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
   const corrected=!checked.error&&ctx
    ?recodeAfterTare(checked.ean,checked.grams,ctx.tareGrams,checked.rate):null;
   if(corrected&&typeof window.IUGeminiSaveWeigh==='function'){
    const saved=window.IUGeminiSaveWeigh({
     gross:checked.grams,product:checked.name,ean13:checked.ean,
     pricePerKgCents:checked.rate,totalCents:checked.total,
     correctedEan13:corrected.ean,correctedTotalCents:corrected.cents
    });
    if(saved?.ok){
     say('Pesée Gemini enregistrée automatiquement dans l’historique · '+formatWeight(saved.net)+' net.');
     resetTransfer();
    }else if(saved?.duplicate){
     say('Étiquette déjà enregistrée récemment : aucun doublon créé.');
    }else{
     say('Lecture réussie, mais sauvegarde non effectuée : '+String(saved?.reason||'erreur'),true);
    }
   }else{
    say('Lecture à vérifier : aucune pesée enregistrée automatiquement.',true);
   }

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
  openCamera.hidden=true; // ouverture uniquement par le bouton scanner partagé
  openCamera.disabled=false;
  shortcut?.setAttribute('aria-pressed','false');
  shortcut?.setAttribute('aria-expanded','false');
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
   shortcut?.setAttribute('aria-pressed','true');
   shortcut?.setAttribute('aria-expanded','true');
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
 modeCamera?.addEventListener('click',()=>{
  selectReadingMode('camera');
  if(cameraStream)cameraShell.scrollIntoView({block:'nearest',behavior:'smooth'});
  else startCamera();
 });
 modePhoto?.addEventListener('click',()=>{
  selectReadingMode('photo');
  photo.click();
 });
 shortcut?.addEventListener('click',()=>{
  selectReadingMode('camera');
  if(cameraStream)stopCamera();else startCamera();
 });
 nextWeigh?.addEventListener('click',()=>{
  if(active){say('L’analyse est en cours : termine-la avant une nouvelle pesée.',true);return;}
  resetReading();
 });
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
