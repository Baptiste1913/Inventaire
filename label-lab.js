/* Inventaires U v40.59 — Laboratoire OCR étiquettes, sans modification des inventaires. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('iuLabelLab');
 if(!panel)return;
 const camera=$('iuLabelCamera'),gallery=$('iuLabelGallery'),preview=$('iuLabelPreview'),
  previewWrap=$('iuLabelPreviewWrap'),readBtn=$('iuLabelRead'),status=$('iuLabelStatus'),
  stage=$('iuLabelStage'),cropBox=$('iuLabelCropBox'),cropToggle=$('iuLabelCropToggle'),cropHelp=$('iuLabelCropHelp'),
  result=$('iuLabelResult'),textArea=$('iuLabelText');
 let selectedFile=null,previewUrl=null,loadPromise=null,worker=null,reading=false,generation=0;
 let cropMode=false,crop=null,dragStart=null;
 const statusText=(message,error=false)=>{status.textContent=message;status.classList.toggle('is-error',error);};
 const normalized=s=>String(s||'').replace(/[\u00a0\u202f]/g,' ').replace(/[’‘]/g,"'").replace(/[€]/g,'€');

 const formatted=(v,unit)=>v?v+' '+unit:'Non détecté';
 // Les étiquettes DIGI peuvent perdre leurs virgules à la reconnaissance OCR.
 // Une valeur corrigée reste marquée pour vérification humaine.
 function parseLabel(value){
  const raw=String(value||'').replace(/[\u00a0\u202f]/g,' ').replace(/[’‘]/g,"'");
  const lines=raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const text=lines.join(' ');
  const candidates=lines.filter(line=>{
   const alpha=(line.match(/[A-ZÀ-Ÿ]/gi)||[]).length;
   return alpha>=5 && line.length<65
    && !/^\d{4,5}\s*(?:ST|SAINT)\b/i.test(line)
    && !/(?:super\s*u|saint.germain|st\s*germain|prix|poids|emball|kilo|date|payer|euros?|\bkg\b|\bplu\b|€|\d{2}[.\/]\d{2})/i.test(line)
    && /^[\p{L}0-9\s'’\-.,]+$/u.test(line);
  });
  // Refuser les fragments parasites en minuscules au lieu de les présenter comme produit.
  const validNames=candidates.filter(line=>{
   const chars=(line.match(/[A-ZÀ-Ÿa-zà-ÿ]/g)||[]).length;
   const capitals=(line.match(/[A-ZÀ-Ÿ]/g)||[]).length;
   return chars>=6&&chars<=44&&capitals/Math.max(1,chars)>=.72
    && !/\d{2,}/.test(line);
  });
  const name=(validNames[0]||'')
   .replace(/[^\p{L}0-9\s'’-]/gu,' ').replace(/\s+/g,' ').trim();
  let weight='',weightNeedsReview=false;
  const kgMatch=text.match(/(?<![\d.,])([0-9]{1,3}[,.][0-9]{2,3}|0[0-9]{3})\s*k\s*g\b/i);
  if(kgMatch){
   const token=kgMatch[1];
   if(/^0[0-9]{3}$/.test(token)){weight='0,'+token.slice(1);weightNeedsReview=true;}
   else weight=token.replace('.',',');
  }
  const pricePerKg=text.match(/(?<![\d.,])([0-9]{1,3}[,.][0-9]{1,2}|0[0-9]{2})\s*(?:€|EUR|E)\s*\/\s*k\s*g\b/i);
  let unitPrice='',unitPriceNeedsReview=false;
  if(pricePerKg){
   const token=pricePerKg[1];
   if(/^0[0-9]{2}$/.test(token)){unitPrice='0,'+token.slice(1);unitPriceNeedsReview=true;}
   else unitPrice=token.replace('.',',');
  }
  if(!unitPrice){
   const match=text.match(/(?:prix\s*unitaire|prix\s*au\s*kilo|prix\s*\/\s*kg)[^0-9]{0,25}([0-9]{1,3}[,.][0-9]{1,2})/i);
   if(match)unitPrice=match[1].replace('.',',');
  }
  let total='';
  const totalMatch=text.match(/(?:prix\s*[aà]\s*payer|montant(?:\s*total)?|total\s*[àa]\s*payer)[^0-9]{0,25}([0-9]{1,3}[,.][0-9]{1,2})\s*(?:€|EUR)?/i);
  if(totalMatch)total=totalMatch[1].replace('.',',');
  if(!total){
   // Ne jamais prendre le tarif €/kg pour le prix total.
   const prices=[...text.matchAll(/(?<![\d.,])([0-9]{1,3}[,.][0-9]{1,2})\s*(?:€|EUR)(?!\s*\/\s*k\s*g)/gi)];
   if(prices.length===1)total=prices[0][1].replace('.',',');
  }
  const pluMatch=text.match(/\bPLU\s*[:#-]?\s*([0-9]{2,6})\b/i);
  const plu=pluMatch?pluMatch[1]:'';
  // Un code EAN mal reconnu ne doit pas être reconstruit arbitrairement.
  const checkEAN=code=>{
   if(!/^\d{13}$/.test(code))return false;
   let sum=0;
   for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2===0?1:3);
   return (10-sum%10)%10===Number(code[12]);
  };
  const codeCandidates=(text.match(/(?<!\d)\d{13}(?!\d)/g)||[]).filter(checkEAN);
  const code=codeCandidates.length===1?codeCandidates[0]:'';
  return {name,weight,weightNeedsReview,unitPrice,unitPriceNeedsReview,total,plu,code};
 }
 function showParsed(value){
  const p=parseLabel(value);
  $('iuLabelProduct').textContent=p.name||'Non détecté';
  $('iuLabelWeight').textContent=formatted(p.weight,'kg')+(p.weightNeedsReview?' · à vérifier':'');
  $('iuLabelUnitPrice').textContent=formatted(p.unitPrice,'€/kg')+(p.unitPriceNeedsReview?' · à vérifier':'');
  $('iuLabelTotalPrice').textContent=formatted(p.total,'€');
  $('iuLabelPlu').textContent=p.plu||'Non détecté';
  $('iuLabelCode').textContent=p.code||'Non détecté';
  result.hidden=false;
  if(p.weightNeedsReview||p.unitPriceNeedsReview)
   statusText('Séparateurs manquants dans certains chiffres : valeurs proposées à vérifier sur l’étiquette.');
 }
 function loadTesseract(){
  if(window.Tesseract?.createWorker)return Promise.resolve(window.Tesseract);
  if(loadPromise)return loadPromise;
  loadPromise=new Promise((resolve,reject)=>{
   const node=document.createElement('script');
   node.async=true;node.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
   node.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('Lecteur OCR indisponible.'));
   node.onerror=()=>reject(Error('Impossible de télécharger le module de reconnaissance.'));
   document.head.append(node);
  }).catch(err=>{loadPromise=null;throw err;});
  return loadPromise;
 }

 // Le cadrage est sélectionné sur l'aperçu avec le doigt, sans bibliothèque tierce.
 // Les coordonnées restent dans [0,1] et ne sont appliquées qu'à l'OCR.
 function displayImageArea(){
  const rect=preview.getBoundingClientRect();
  const width=preview.naturalWidth,height=preview.naturalHeight;
  if(!rect.width||!rect.height||!width||!height)return null;
  const factor=Math.min(rect.width/width,rect.height/height);
  const dw=width*factor,dh=height*factor;
  return {left:rect.left+(rect.width-dw)/2,top:rect.top+(rect.height-dh)/2,width:dw,height:dh};
 }
 function positionFromPointer(e){
  const area=displayImageArea();if(!area)return null;
  return {x:Math.max(0,Math.min(1,(e.clientX-area.left)/area.width)),
   y:Math.max(0,Math.min(1,(e.clientY-area.top)/area.height))};
 }
 function drawCrop(){
  if(!crop){cropBox.hidden=true;return;}
  const area=displayImageArea();
  if(!area)return;
  const origin=preview.getBoundingClientRect();
  cropBox.style.left=(area.left-origin.left+crop.x*area.width)+'px';
  cropBox.style.top=(area.top-origin.top+crop.y*area.height)+'px';
  cropBox.style.width=(crop.w*area.width)+'px';
  cropBox.style.height=(crop.h*area.height)+'px';
  cropBox.hidden=false;
 }
 function setCropMode(enabled){
  cropMode=enabled;
  stage.classList.toggle('is-selecting',cropMode);
  cropToggle.setAttribute('aria-pressed',String(cropMode));
  cropToggle.textContent=cropMode?'Terminer le recadrage':'Recadrer sur l’étiquette';
  cropHelp.textContent=cropMode
   ?'Fais glisser le doigt d’un coin à l’autre de l’étiquette. La sélection sera utilisée pour la prochaine lecture.'
   :crop?'Zone sélectionnée. Appuie sur « Lire l’étiquette » pour recommencer.':'Si le nom est mal lu, trace un rectangle sur l’étiquette avec le doigt, puis relance la lecture.';
 }
 cropToggle.addEventListener('click',()=>setCropMode(!cropMode));
 stage.addEventListener('pointerdown',event=>{
  if(!cropMode||!selectedFile||event.isPrimary===false)return;
  const point=positionFromPointer(event);if(!point)return;
  event.preventDefault();dragStart=point;crop={x:point.x,y:point.y,w:0,h:0};
  try{stage.setPointerCapture(event.pointerId);}catch(_){}
  drawCrop();
 });
 stage.addEventListener('pointermove',event=>{
  if(!dragStart||!cropMode)return;
  event.preventDefault();
  const point=positionFromPointer(event);if(!point)return;
  crop={x:Math.min(point.x,dragStart.x),y:Math.min(point.y,dragStart.y),
   w:Math.abs(point.x-dragStart.x),h:Math.abs(point.y-dragStart.y)};
  drawCrop();
 });
 const endCrop=event=>{
  if(!dragStart)return;
  dragStart=null;
  if(!crop||crop.w<.08||crop.h<.06){crop=null;drawCrop();statusText('Sélection trop petite. Dessine un rectangle plus grand.',true);return;}
  drawCrop();setCropMode(false);result.hidden=true;
  statusText('Recadrage prêt. Relance la lecture sur la zone sélectionnée.');
 };
 stage.addEventListener('pointerup',endCrop);
 stage.addEventListener('pointercancel',()=>{dragStart=null;});
 window.addEventListener('resize',drawCrop,{passive:true});
 function croppedCanvas(canvas){
  if(!crop||crop.w<.08||crop.h<.06)return canvas;
  const x=Math.max(0,Math.floor(crop.x*canvas.width));
  const y=Math.max(0,Math.floor(crop.y*canvas.height));
  const width=Math.max(1,Math.min(canvas.width-x,Math.ceil(crop.w*canvas.width)));
  const height=Math.max(1,Math.min(canvas.height-y,Math.ceil(crop.h*canvas.height)));
  const out=document.createElement('canvas');
  // La mise à l'échelle améliore les petits caractères, tout en plafonnant la RAM sur iPhone.
  const ratio=Math.min(2.2,2500/Math.max(width,height));
  out.width=Math.round(width*ratio);out.height=Math.round(height*ratio);
  out.getContext('2d').drawImage(canvas,x,y,width,height,0,0,out.width,out.height);
  return out;
 }
 function productNameFromTop(text){
  const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const eligible=lines.filter(line=>{
   const chars=(line.match(/[A-ZÀ-Ÿa-zà-ÿ]/g)||[]),upper=(line.match(/[A-ZÀ-Ÿ]/g)||[]).length;
   return chars.length>=6&&chars.length<=44&&upper/chars.length>.70
    && /^[\p{L}\d\s'’.-]+$/u.test(line)
    && !/(?:SUPER\s*U|ST\s*GERMAIN|SAINT\s*GERMAIN|PRIX|POIDS|EMBALLAGE|DATE|PAYER|EUR|KG|TOTAL)/i.test(line)
    && !/\d{2,}/.test(line);
  });
  return eligible.sort((a,b)=>b.length-a.length)[0]||'';
 }

 function selectFile(file){
  if(!file)return;
  if(!file.type.startsWith('image/')){statusText('Sélectionne une photo ou une image.',true);return;}
  if(file.size>22*1024*1024){statusText('Photo trop volumineuse (22 Mo maximum).',true);return;}
  generation++;
  crop=null;dragStart=null;setCropMode(false);drawCrop();
  selectedFile=file;
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(file);
  preview.src=previewUrl;previewWrap.hidden=false;readBtn.disabled=false;
  preview.onload=drawCrop;
  textArea.value='';result.hidden=true;
  statusText('Photo chargée. Appuie sur « Lire l’étiquette ».');
 }
 camera.addEventListener('change',()=>{selectFile(camera.files?.[0]);camera.value='';});
 gallery.addEventListener('change',()=>{selectFile(gallery.files?.[0]);gallery.value='';});
 async function prepareImage(file){
  const objectUrl=URL.createObjectURL(file);
  try{
   const image=new Image();
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=objectUrl;});
   const maxSide=2000,scale=Math.min(1,maxSide/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(!ctx)throw Error('Image non lisible sur cet appareil.');
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   return canvas;
  }finally{URL.revokeObjectURL(objectUrl);}
 }
 async function read(){
  if(!selectedFile||reading)return;
  reading=true;readBtn.disabled=true;const token=++generation;
  statusText('Préparation de la photo…');
  try{
   const full=await prepareImage(selectedFile);
   const canvas=croppedCanvas(full);
   if(token!==generation)return;
   statusText('Chargement du moteur de reconnaissance (premier essai : Internet requis)…');
   const Tesseract=await loadTesseract();
   if(token!==generation)return;
   if(!worker){
    worker=await Tesseract.createWorker(['fra','eng'],1,{
     logger:event=>{
      if(token!==generation||!event?.status)return;
      if(event.status==='recognizing text'&&Number.isFinite(event.progress))
       statusText('Lecture de l’étiquette : '+Math.round(event.progress*100)+' %');
     }
    });
   }
   if(token!==generation)return;
   const response=await worker.recognize(canvas);
   if(token!==generation)return;
   let text=String(response?.data?.text||'').trim();
   if(crop&&canvas.width>60&&canvas.height>90){
    // Deuxième passe sur la partie haute, pour isoler le libellé de l'étiquette.
    statusText('Lecture complémentaire du nom du produit…');
    const upper=document.createElement('canvas');
    upper.width=canvas.width;upper.height=Math.max(60,Math.round(canvas.height*.58));
    upper.getContext('2d').drawImage(canvas,0,0,canvas.width,upper.height,0,0,upper.width,upper.height);
    const titleReply=await worker.recognize(upper);
    if(token!==generation)return;
    const title=productNameFromTop(titleReply?.data?.text);
    if(title)text=title+'\n'+text;
   }
   textArea.value=text;
   statusText(text?'Lecture terminée. Vérifie les valeurs proposées, puis corrige le texte si nécessaire.':'Aucun texte reconnu. Reprends la photo de plus près et avec davantage de lumière.',!text);
   if(text)showParsed(text);
  }catch(error){
   if(token!==generation)return;
   statusText('Lecture impossible : '+(navigator.onLine?'réessaie avec une autre photo ou vérifie le chargement du moteur.':'connexion nécessaire pour télécharger le moteur au premier essai.'),true);
  }finally{reading=false;readBtn.disabled=!selectedFile;}
 }
 readBtn.addEventListener('click',()=>{void read();});
 $('iuLabelReanalyse').addEventListener('click',()=>{statusText('Extraction mise à jour à partir du texte corrigé.');showParsed(textArea.value);});
 function clearPhoto(){
  generation++;selectedFile=null;crop=null;dragStart=null;setCropMode(false);drawCrop();readBtn.disabled=true;result.hidden=true;textArea.value='';
  previewWrap.hidden=true;preview.removeAttribute('src');
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
 }
 panel.addEventListener('toggle',()=>{if(!panel.open)clearPhoto();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&reading)statusText('Analyse en cours. Garde l’application ouverte pendant le test.');});
})();
