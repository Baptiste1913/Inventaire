/* Inventaires U v40.55 — Laboratoire OCR étiquettes, sans modification des inventaires. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('iuLabelLab');
 if(!panel)return;
 const camera=$('iuLabelCamera'),gallery=$('iuLabelGallery'),preview=$('iuLabelPreview'),
  previewWrap=$('iuLabelPreviewWrap'),readBtn=$('iuLabelRead'),status=$('iuLabelStatus'),
  result=$('iuLabelResult'),textArea=$('iuLabelText');
 let selectedFile=null,previewUrl=null,loadPromise=null,worker=null,reading=false,generation=0;
 const statusText=(message,error=false)=>{status.textContent=message;status.classList.toggle('is-error',error);};
 const normalized=s=>String(s||'').replace(/[\u00a0\u202f]/g,' ').replace(/[’‘]/g,"'").replace(/[€]/g,'€');
 const priceNumber=v=>v.replace(/\s/g,'').replace(/[,.]/g,'.');
 const amount=(str,unit)=>str?priceNumber(str)+' '+unit:'Non détecté';
 function findMoney(lines,keywords){
  for(let i=0;i<lines.length;i++){
   if(!keywords.test(lines[i]))continue;
   const group=lines.slice(i,i+3).join(' ');
   const matches=[...group.matchAll(/([0-9]{1,3}(?:[\s.,][0-9]{1,3})?)\s*(?:€|E|EUR)/gi)];
   if(matches.length)return matches[0][1];
   const between=group.match(/(?:payer|total|unitaire|kilo|kg)[^0-9]{0,25}([0-9]+[,.][0-9]{1,2})/i);
   if(between)return between[1];
  }
  return '';
 }
 function parseLabel(value){
  const raw=normalized(value);
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const candidates=lines.filter(line=>{
   const letters=(line.match(/[A-ZÀ-Ÿ]/gi)||[]).length;
   return letters>=5&&line.length<65&&
    !/(super\s*u|saint.germain|st\s*germain|prix|poids|emball|kilo|date|payer|euros?|\bkg\b|\bplu\b)/i.test(line);
  });
  let name=candidates.find(s=>s===s.toUpperCase()&&/[A-ZÀ-Ÿ]{3}/.test(s))||candidates[0]||'';
  if(name)name=name.replace(/[^\p{L}0-9\s'’-]/gu,' ').replace(/\s+/g,' ').trim();
  let weight='';
  const all=lines.join(' ');
  const weightMatch=all.match(/poids\s*(?:n[eé]t|net)?[^0-9]{0,35}([0-9]{1,3}[,.][0-9]{2,3})\s*(?:k\s*g|kg)?/i);
  if(weightMatch)weight=weightMatch[1];
  if(!weight){
   const kg=[...all.matchAll(/([0-9]{1,3}[,.][0-9]{2,3})\s*k\s*g/gi)];
   if(kg.length)weight=kg[kg.length-1][1];
  }
  let unitPrice='';
  const unitMatch=all.match(/(?:prix\s*unitaire|prix\s*au\s*kilo|prix\s*\/\s*kg)[^0-9]{0,30}([0-9]{1,3}[,.][0-9]{1,2})/i);
  if(unitMatch)unitPrice=unitMatch[1];
  if(!unitPrice){
   const kgEuro=all.match(/([0-9]{1,3}[,.][0-9]{1,2})\s*(?:€|E|EUR)\s*\/\s*k\s*g/i);
   if(kgEuro)unitPrice=kgEuro[1];
  }
  let total='';
  const totalMatch=all.match(/(?:prix\s*[aà]\s*payer|montant|total)[^0-9]{0,34}([0-9]{1,3}[,.][0-9]{1,2})\s*(?:€|E|EUR)?/i);
  if(totalMatch)total=totalMatch[1];
  if(!total){
   const euros=[...all.matchAll(/([0-9]{1,3}[,.][0-9]{1,2})\s*(?:€|EUR)/gi)];
   if(euros.length)total=euros[euros.length-1][1];
  }
  let plu='';
  const pluMatch=all.match(/\bPLU\s*[:#-]?\s*([0-9]{2,6})\b/i);
  if(pluMatch)plu=pluMatch[1];
  const eanMatch=all.replace(/[\s-]/g,'').match(/(?:^|\D)([0-9]{13})(?:\D|$)/);
  const code=eanMatch?eanMatch[1]:'';
  return {name,weight,unitPrice,total,plu,code};
 }
 function showParsed(value){
  const p=parseLabel(value);
  $('iuLabelProduct').textContent=p.name||'Non détecté';
  $('iuLabelWeight').textContent=amount(p.weight,'kg');
  $('iuLabelUnitPrice').textContent=amount(p.unitPrice,'€/kg');
  $('iuLabelTotalPrice').textContent=amount(p.total,'€');
  $('iuLabelPlu').textContent=p.plu||'Non détecté';
  $('iuLabelCode').textContent=p.code||'Non détecté';
  result.hidden=false;
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
 function selectFile(file){
  if(!file)return;
  if(!file.type.startsWith('image/')){statusText('Sélectionne une photo ou une image.',true);return;}
  if(file.size>22*1024*1024){statusText('Photo trop volumineuse (22 Mo maximum).',true);return;}
  generation++;
  selectedFile=file;
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(file);
  preview.src=previewUrl;previewWrap.hidden=false;readBtn.disabled=false;
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
   const canvas=await prepareImage(selectedFile);
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
   const text=String(response?.data?.text||'').trim();
   textArea.value=text;
   showParsed(text);
   statusText(text?'Lecture terminée. Vérifie les valeurs proposées, puis corrige le texte si nécessaire.':'Aucun texte reconnu. Reprends la photo de plus près et avec davantage de lumière.',!text);
  }catch(error){
   if(token!==generation)return;
   statusText('Lecture impossible : '+(navigator.onLine?'réessaie avec une autre photo ou vérifie le chargement du moteur.':'connexion nécessaire pour télécharger le moteur au premier essai.'),true);
  }finally{reading=false;readBtn.disabled=!selectedFile;}
 }
 readBtn.addEventListener('click',()=>{void read();});
 $('iuLabelReanalyse').addEventListener('click',()=>{showParsed(textArea.value);statusText('Extraction mise à jour à partir du texte corrigé.');});
 function clearPhoto(){
  generation++;selectedFile=null;readBtn.disabled=true;result.hidden=true;textArea.value='';
  previewWrap.hidden=true;preview.removeAttribute('src');
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
 }
 panel.addEventListener('toggle',()=>{if(!panel.open)clearPhoto();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&reading)statusText('Analyse en cours. Garde l’application ouverte pendant le test.');});
})();
