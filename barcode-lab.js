/* Inventaires U v40.52 — Essai de scan code-barres, isolé des données métier. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('iuBarcodeLab'),cameraWrap=$('iuBarcodeCameraWrap');
 if(!panel)return;
 const status=$('iuBarcodeStatus'),result=$('iuBarcodeResult');
 const startBtn=$('iuBarcodeStart'),stopBtn=$('iuBarcodeStop');
 const form=$('iuBarcodeForm'),input=$('iuBarcodeInput');
 let scanner=null,loadingLibrary=null,starting=false,busy=false,requestId=0,controller=null;
 let cameraActive=false,stopping=null;
 const valid=code=>/^[0-9]{8}$|^[0-9]{12,14}$/.test(code);
 const setStatus=(message,error=false)=>{status.textContent=message;status.classList.toggle('is-error',error);};
 const readable=(text,max=180)=>String(text||'').trim().slice(0,max)||'Non renseigné';
 function loadScanner(){
  if(window.Html5Qrcode)return Promise.resolve(window.Html5Qrcode);
  if(loadingLibrary)return loadingLibrary;
  loadingLibrary=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
   script.async=true;
   script.onload=()=>window.Html5Qrcode?resolve(window.Html5Qrcode):reject(Error('Bibliothèque de lecture indisponible.'));
   script.onerror=()=>reject(Error('Chargement du lecteur impossible. Vérifie la connexion.'));
   document.head.append(script);
  }).catch(error=>{loadingLibrary=null;throw error;});
  return loadingLibrary;
 }
 async function stopCamera(){
  if(stopping)return stopping;
  if(!scanner){cameraActive=false;cameraWrap.hidden=true;stopBtn.hidden=true;startBtn.hidden=false;return;}
  const instance=scanner;
  stopping=(async()=>{
   try{if(cameraActive||starting)await instance.stop();}catch(_){}
   try{instance.clear();}catch(_){}
   if(scanner===instance)scanner=null;
   cameraActive=false;starting=false;
   cameraWrap.hidden=true;stopBtn.hidden=true;startBtn.hidden=false;
  })().finally(()=>{stopping=null;});
  return stopping;
 }
 async function lookup(code){
  const clean=String(code||'').trim();
  if(!valid(clean)){setStatus('Saisis un EAN-8, UPC-12, EAN-13 ou GTIN-14 valide (chiffres uniquement).',true);return;}
  if(controller)controller.abort();
  const seq=++requestId;
  controller=new AbortController();
  input.value=clean;result.hidden=true;
  setStatus('Recherche du produit dans Open Food Facts…');
  try{
   const endpoint='https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(clean)+'.json?fields=code,product_name,product_name_fr,generic_name,brands,quantity,product_quantity,product_quantity_unit,categories,origins,labels,packaging,image_front_small_url,image_url,countries';
   const response=await fetch(endpoint,{mode:'cors',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   if(seq!==requestId)return;
   if(!response.ok)throw Error('La base de données a répondu avec le code '+response.status+'.');
   const data=await response.json();
   if(seq!==requestId)return;
   if(data.status!==1||!data.product){setStatus('Code '+clean+' lu, mais aucun produit trouvé dans Open Food Facts. Les codes internes de magasin sont souvent absents.',true);return;}
   const p=data.product;
   $('iuBarcodeName').textContent=readable(p.product_name_fr||p.product_name||p.generic_name||'Nom non renseigné');
   $('iuBarcodeBrand').textContent=readable(p.brands,140);
   $('iuBarcodeSource').textContent='Produit trouvé · Open Food Facts';
   const facts=$('iuBarcodeFacts');facts.replaceChildren();
   const addFact=(label,value)=>{
    const block=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=label;dd.textContent=readable(value);block.append(dt,dd);facts.append(block);
   };
   addFact('Code-barres',clean);
   const qty=String(p.quantity||'').trim();
   const pq=p.product_quantity,pu=p.product_quantity_unit;
   addFact('Quantité indiquée',qty||(pq&&pu?String(pq)+' '+String(pu):'Non renseignée'));
   addFact('Catégories',p.categories);
   addFact('Origine',p.origins);
   addFact('Labels',p.labels);
   addFact('Conditionnement',p.packaging);
   addFact('Pays',p.countries);
   const im=$('iuBarcodeImage'),src=p.image_front_small_url||p.image_url;
   if(typeof src==='string'&&src.startsWith('https://')&&/^https:\/\/[^\s]+$/.test(src)){im.src=src;im.hidden=false;}else{im.hidden=true;im.removeAttribute('src');}
   const link=$('iuBarcodeLink');link.href='https://world.openfoodfacts.org/product/'+encodeURIComponent(clean);link.hidden=false;
   result.hidden=false;
   setStatus('Produit trouvé. Informations fournies par Open Food Facts, à vérifier sur l’étiquette.');
  }catch(error){
   if(seq!==requestId||error.name==='AbortError')return;
   setStatus('Recherche impossible : '+(navigator.onLine?'connexion ou service indisponible.':'connexion Internet absente.')+' Le code '+clean+' reste disponible pour un nouvel essai.',true);
  }finally{if(seq===requestId)controller=null;}
 }
 async function startCamera(){
  if(starting||cameraActive||stopping)return;
  if(!panel.open)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setStatus('La caméra exige HTTPS et un navigateur autorisant l’accès caméra. Tu peux saisir le code manuellement.',true);return;}
  starting=true;startBtn.disabled=true;
  setStatus('Chargement du lecteur de codes-barres…');
  try{
   const Reader=await loadScanner();
   if(!panel.open||!document.body.classList.contains('is-admin-mode'))return;
   const formats=window.Html5QrcodeSupportedFormats;
   const supported=formats?['EAN_13','EAN_8','UPC_A','UPC_E','ITF_14','CODE_128'].map(x=>formats[x]).filter(x=>x!==undefined):undefined;
   scanner=new Reader('iuBarcodeCamera',supported?.length?{formatsToSupport:supported,verbose:false}:{verbose:false});
   cameraWrap.hidden=false;
   await scanner.start({facingMode:'environment'},{fps:8,disableFlip:true},decoded=>{
    const code=String(decoded||'').trim();
    if(!valid(code)||busy)return;
    busy=true;
    void (async()=>{await stopCamera();await lookup(code);busy=false;})();
   },()=>{});
   cameraActive=true;stopBtn.hidden=false;startBtn.hidden=true;
   setStatus('Caméra active : présente un code EAN/UPC devant l’objectif.');
  }catch(error){
   const message=String(error?.name||'')==='NotAllowedError'?'Accès caméra refusé. Autorise la caméra dans Safari et réessaie.':
    'Impossible de démarrer la caméra. Vérifie les autorisations, la connexion et réessaie ou saisis le code.';
   setStatus(message,true);
   await stopCamera();
  }finally{starting=false;startBtn.disabled=false;}
 }
 startBtn.addEventListener('click',()=>{void startCamera();});
 stopBtn.addEventListener('click',()=>{void stopCamera();setStatus('Caméra arrêtée.');});
 form.addEventListener('submit',event=>{
  event.preventDefault();void stopCamera();
  void lookup(input.value);
 });
 panel.addEventListener('toggle',()=>{
  if(!panel.open){void stopCamera();if(controller)controller.abort();requestId++;busy=false;}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void stopCamera();});
 const observer=new MutationObserver(()=>{
  if(!document.body.classList.contains('is-admin-mode'))void stopCamera();
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
})();
