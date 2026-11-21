/* Inventaires U 41.54 — affinage des dimensions de l'étiquette virtuelle DIGI.
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
 const modeCamera=$('iuGeminiModeCamera'),modePhoto=$('iuGeminiModePhoto');
 const modeControl=$('iuGeminiModeCamera')?.closest('.iu-gemini-mode-control');
 const shortcut=$('iuGeminiCameraShortcut'),grossPreview=$('iuGeminiGrossPreview');
 const nextWeigh=$('iuGeminiNext'),emptyResult=$('iuGeminiEmptyResult');
 const setupCallout=$('iuGeminiSetupCallout'),geminiOptions=$('iuGeminiOptions');
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
  if(!latestLabelFields)return;
  const fields=latestLabelFields;
  const ctx=typeof window.IUWeighScanContext==='function'?window.IUWeighScanContext():null;
  const tare=ctx?.tareGrams,gross=fields.weightGrams;
  const corrected=recodeAfterTare(fields.ean13,gross,tare,fields.pricePerKgCents);
  const net=Number.isSafeInteger(gross)&&Number.isSafeInteger(tare)&&gross>tare?gross-tare:null;
  const grossEl=output.querySelector('.iu-gemini-quick-gross-value');
  const netEl=output.querySelector('.iu-gemini-quick-net-value');
  const tareEl=output.querySelector('.iu-gemini-quick-tare');
  if(grossEl)grossEl.textContent=Number.isSafeInteger(gross)?(gross/1000).toFixed(3).replace('.',','):'—';
  if(netEl)netEl.textContent=net===null?'—':formatWeight(net);
  if(tareEl)tareEl.textContent=formatWeight(tare);
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
  clearPreview();capture.disabled=false;updateButton();
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
  if(grossPreview)grossPreview.value='';
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
  svg.setAttribute('viewBox','0 0 128 66');
  svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('role','img');
  svg.setAttribute('aria-label','EAN 13 '+ean[0]+' '+ean.slice(1,7)+' '+ean.slice(7));
  svg.classList.add('iu-gemini-ean-svg');
  // La vraie étiquette comporte une barre noire continue au-dessus du code.
  // Elle commence et termine au droit des 95 modules de l'EAN.
  const topLine=document.createElementNS(ns,'line');
  topLine.setAttribute('x1','15');
  topLine.setAttribute('y1','-0.3');
  topLine.setAttribute('x2',String(15+95*1.12));
  topLine.setAttribute('y2','-0.3');
  topLine.setAttribute('stroke','#111');
  topLine.setAttribute('stroke-width','1.9');
  svg.append(topLine);
  for(let i=0;i<bits.length;i++){
   if(bits[i]!=='1')continue;
   const rect=document.createElementNS(ns,'rect');
   rect.setAttribute('x',String(15+i*1.12));rect.setAttribute('y','2');
   rect.setAttribute('width','1.12');rect.setAttribute('height',(i<3||i>=92||i>=45&&i<50)?'52':'44');
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
  addDigit(ean[0],10,61,'iu-gemini-ean-leading');
  for(let i=0;i<6;i++){
   addDigit(ean[i+1],15+(3+7*i+3.5)*1.12,61,'iu-gemini-ean-digit');
   addDigit(ean[i+7],15+(50+7*i+3.5)*1.12,61,'iu-gemini-ean-digit');
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
  // Résultat prioritaire : poids lu en grand, net calculé en petit, tare visible.
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
  const netWeight=add(weights,'span','','Poids net calculé ');
  add(netWeight,'strong','iu-gemini-quick-net-value',netValid?formatWeight(net):'—');
  const tareWeight=add(weights,'span','','Tare ');
  add(tareWeight,'strong','iu-gemini-quick-tare',formatWeight(tare));
  const heading=add(quick,'div','result-heading','');
  add(heading,'span','','Poids brut à vérifier');
  const copy=add(heading,'button','copy-btn iu-gemini-copy','');
  copy.type='button';copy.disabled=!Number.isSafeInteger(gross)||gross<=0;
  copy.setAttribute('aria-label','Copier le poids brut lu par Gemini');
  copy.innerHTML='<svg class="copy-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8h2"/></svg><svg class="copy-btn-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>Copier</span>';
  copy.addEventListener('click',async()=>{
   if(!Number.isSafeInteger(gross)||gross<=0)return;
   try{await navigator.clipboard.writeText((gross/1000).toFixed(3));say('Poids brut copié.');}
   catch{say('Impossible de copier sur cet appareil.',true);}
  });
  const netLine=add(quick,'div','net-line','');
  add(netLine,'strong','iu-gemini-quick-gross-value',Number.isSafeInteger(gross)?(gross/1000).toFixed(3).replace('.',','):'—');
  add(netLine,'span','','kg');
  add(quick,'p','result-subtitle','Poids lu sur l’étiquette, panière comprise.');
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
  if(emptyResult)emptyResult.hidden=true;
  proposal=ready?verified:null;
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
   // L'analyse prépare un brouillon uniquement : aucun enregistrement implicite.
   say(proposal
    ?'Lecture prête : vérifie le poids brut et l’étiquette, puis valide.'
    :'Lecture non validable. Vérifie l’étiquette ou reprends une photo.',!proposal);

  }catch(error){
   if(id===generation&&error?.name!=='AbortError'){
    const reason=String(error?.message||'Échec réseau').slice(0,140);
    say('Essai non terminé : '+reason,true);
   }
  }finally{
   if(id===generation){active=false;abort=null;capture.disabled=false;updateButton();validationState();}
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
   say('Centre l’étiquette entière. Une seule analyse démarrera après capture.');
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
   say('Pesée validée et enregistrée · '+formatWeight(saved.net)+' net. Prêt pour la suivante.');
   // Après validation, les commandes du prochain scan reviennent à portée de vue.
   requestAnimationFrame(()=>{
    const target=cameraStream&&!cameraShell.hidden?cameraShell:shortcut;
    target?.scrollIntoView({block:'nearest',behavior:'smooth'});
   });
  }else if(saved?.duplicate){
   say('Cette étiquette a déjà été enregistrée : aucun doublon ajouté.',true);
  }else{
   say('Pesée non enregistrée : '+String(saved?.reason||'erreur de sauvegarde'),true);
  }
 });
 openCamera.addEventListener('click',startCamera);
 closeCamera.addEventListener('click',()=>{
  stopCamera();say('Viseur fermé. Aucune photo envoyée.');
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
 capture.addEventListener('click',async()=>{
  if(!cameraStream||active||!video.videoWidth||!video.videoHeight)return;
  capture.disabled=true;
  try{
   const cv=document.createElement('canvas');
   const viewport=video.getBoundingClientRect();
   const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,viewport.width,viewport.height);
   const factor=Math.min(1,1920/Math.max(crop.width,crop.height));
   cv.width=Math.max(1,Math.round(crop.width*factor));
   cv.height=Math.max(1,Math.round(crop.height*factor));
   const ctx=cv.getContext('2d');
   if(!ctx)throw Error('Capture impossible');
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='high';
   ctx.drawImage(video,crop.x,crop.y,crop.width,crop.height,0,0,cv.width,cv.height);
   const blob=await new Promise(resolve=>cv.toBlob(resolve,'image/jpeg',.95));
   if(!blob)throw Error('Capture impossible');
   setPhoto(new File([blob],'etiquette-gemini.jpg',{type:'image/jpeg'}));
  }catch(_){say('Capture impossible. Réessaie.',true);}
  finally{capture.disabled=active;}
 });
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&cameraStream)stopCamera();
 });

 clear();
})();
