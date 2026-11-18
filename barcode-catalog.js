/* Inventaires U v40.66 — catalogue PLU DIGI local et identification expérimentale EAN. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const panel=$('iuEanAdminPanel'),modal=$('iuEanOverlay');
 if(!panel||!modal)return;
 const keyCatalog='iu-plu-catalogue-local-v1',keyLinks='iu-ean-prefix-links-local-v1';
 const known={ '2824059':{plu:'916',name:'BANANE CAVENDISH'},
               '0205655':{plu:'8325',name:'COURGETTE'},
               '2412955':{plu:'9694',name:'CLEMENTINE A FEUILLES'} };
 const readStorage=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};
 const catalog=new Map();
 // Préfixes EAN issus du catalogue DIGI importé, séparés des associations apprises.
 const eanIndex=new Map(),ambiguousPrefixes=new Set();
 const storedLinks=readStorage(keyLinks);
 const learned=storedLinks&&typeof storedLinks==='object'&&!Array.isArray(storedLinks)?storedLinks:{};
 const $s=(id,txt)=>{$(id).textContent=txt;};
 let scanner=null,starting=false,scanning=false,closing=null,modalFromCalc=false,selectedCode='',currentPrefix='';
 let imported=false;
 const normalizeItem=item=>{
  if(!item||typeof item!=='object')return null;
  const plu=String(item.plu??item.PLU??'').trim();
  const name=String(item.libelle??item['Libellé']??'').trim();
  if(!/^[0-9]{1,8}$/.test(plu)||!name||name.length>145)return null;
  const status=item.actif??item.sur_clavier_actuel??item['Sur clavier actuel'];
  const active=status===true||status==='Oui'||status==='oui';
  const rawEAN=String(item.eanPrefix??item.ean_prefix??item['Préfixe EAN']??item.Gencod??item.gencod??'').trim();
  const eanPrefix=/^\d{7}$/.test(rawEAN)?rawEAN:
   (/^\d{13}$/.test(rawEAN)&&rawEAN.endsWith('000000')?rawEAN.slice(0,7):'');
  const validPrefix=/^(?:02|2\d)\d{5}$/.test(eanPrefix)?eanPrefix:'';
  return {plu,name,active,clavier:String(item.clavier??item.Clavier??'').slice(0,50),eanPrefix:validPrefix};
 };
 const fillCatalog=items=>{
  if(!Array.isArray(items)||items.length>10000)throw Error('Liste d’articles invalide ou trop volumineuse.');
  const records=new Map();
  items.forEach(item=>{const normalized=normalizeItem(item);if(normalized)records.set(normalized.plu,normalized)});
  if(records.size<1)throw Error('Aucun PLU lisible dans ce fichier.');
  return records;
 };
 function populate(records){
  catalog.clear();eanIndex.clear();ambiguousPrefixes.clear();
  const groups=new Map();
  records.forEach((item,key)=>{
   catalog.set(key,item);
   if(item.eanPrefix){
    if(!groups.has(item.eanPrefix))groups.set(item.eanPrefix,new Set());
    groups.get(item.eanPrefix).add(item.plu);
   }
  });
  groups.forEach((pluList,prefix)=>{
   if(pluList.size===1)eanIndex.set(prefix,Array.from(pluList)[0]);
   else ambiguousPrefixes.add(prefix);
  });
  imported=true;updateCount();
 }
 function updateCount(){
  const active=Array.from(catalog.values()).filter(item=>item.active).length;
  $s('iuEanCatalogCount',imported?catalog.size+' références PLU disponibles':'Catalogue non importé');
  $s('iuEanCatalogActive',imported?active+' sur les claviers lors de l’export · '+eanIndex.size+' préfixes EAN importés · '+Object.keys(learned).length+' association(s) ajoutée(s) localement':'3 correspondances vérifiées sur étiquettes disponibles pour essai.');
 }
 const initial=readStorage(keyCatalog);
 if(initial&&Array.isArray(initial.articles)){
  try{populate(fillCatalog(initial.articles))}catch(_){updateCount()}
 }else updateCount();
 function parseCSV(text){
  const records=[];let row=[],field='',inside=false;
  for(let i=0;i<text.length;i++){
   const ch=text[i];
   if(ch==='"'){
    if(inside&&text[i+1]==='"'){field+='"';i++}else inside=!inside;
   }else if(ch===';'&&!inside){row.push(field);field=''}
   else if((ch==='\n'||ch==='\r')&&!inside){
    if(ch==='\r'&&text[i+1]==='\n')i++;
    row.push(field);records.push(row);row=[];field='';
   }else field+=ch;
  }
  if(field||row.length){row.push(field);records.push(row)}
  const header=(records.shift()||[]).map(s=>s.replace(/^\uFEFF/,'').trim());
  return records.filter(row=>row.some(s=>s.trim())).map(row=>Object.fromEntries(header.map((h,i)=>[h,row[i]||''])));
 }
 $('iuEanCatalogFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(file.size>5*1024*1024){$s('iuEanCatalogStatus','Fichier trop volumineux (5 Mo maximum).');return}
  try{
   const text=await file.text();
   const items=file.name.toLowerCase().endsWith('.csv')?parseCSV(text):(JSON.parse(text).articles??JSON.parse(text));
   const records=fillCatalog(items);
   const serializable=Array.from(records.values()).map(item=>({plu:item.plu,libelle:item.name,actif:item.active,clavier:item.clavier,eanPrefix:item.eanPrefix}));
   // Les données sont conservées dans une clé distincte de tous les inventaires.
   localStorage.setItem(keyCatalog,JSON.stringify({articles:serializable}));
   populate(records);
   $s('iuEanCatalogStatus','Import réussi : '+records.size+' PLU, '+eanIndex.size+' préfixes EAN reconnus hors ligne sur cet appareil.'+(ambiguousPrefixes.size?' '+ambiguousPrefixes.size+' préfixe(s) ambigus non associés automatiquement.':''));
   renderSearch('iuEanCatalogSearch','iuEanCatalogMatches',false);
  }catch(error){$s('iuEanCatalogStatus','Import impossible. Sélectionne le fichier JSON ou CSV consolidé : '+String(error.message||'').slice(0,100))}
 });
 function entries(query){
  const q=String(query||'').toLocaleLowerCase('fr').trim();
  if(!q||!imported)return [];
  const all=Array.from(catalog.values()).filter(item=>item.plu.includes(q)||item.name.toLocaleLowerCase('fr').includes(q)||(item.eanPrefix&&item.eanPrefix.includes(q)));
  all.sort((a,b)=>Number(b.plu===q)-Number(a.plu===q)||Number(b.active)-Number(a.active)||a.name.localeCompare(b.name,'fr'));
  return all.slice(0,7);
 }
 function renderSearch(inputId,targetId,canLink){
  const container=$(targetId);container.replaceChildren();
  const matches=entries($(inputId).value);
  if(!matches.length){
   if($(inputId).value.trim()&&imported)container.textContent='Aucune référence trouvée.';
   else if($(inputId).value.trim()&&!imported)container.textContent='Importe le catalogue pour rechercher les références DIGI.';
   return;
  }
  matches.forEach(item=>{
   const btn=document.createElement('button');btn.type='button';
   const name=document.createElement('strong'),detail=document.createElement('small');
   name.textContent=item.name;
   detail.textContent='PLU '+item.plu+(item.eanPrefix?' · EAN '+item.eanPrefix:'')+(item.active?' · Clavier lors de l’export':'');
   btn.append(name,detail);
   btn.addEventListener('click',()=>{
    if(canLink){associate(item);}
    else{$('iuEanCatalogSearch').value=item.plu;$s('iuEanCatalogStatus','PLU '+item.plu+' — '+item.name);}
    container.replaceChildren();
   });
   container.append(btn);
  });
 }
 $('iuEanCatalogSearch').addEventListener('input',()=>renderSearch('iuEanCatalogSearch','iuEanCatalogMatches',false));
 $('iuEanLearnSearch').addEventListener('input',()=>renderSearch('iuEanLearnSearch','iuEanLearnMatches',true));
 function checkDigit(code){
  if(!/^\d{8}$|^\d{12,14}$/.test(code))return false;
  const sum=Array.from(code.slice(0,-1)).reduce((acc,digit,index)=>{
   const distance=code.length-2-index;return acc+Number(digit)*(distance%2===0?3:1);
  },0);
  return (10-sum%10)%10===Number(code.at(-1));
 }
 function normalizeCode(text){
  let code=String(text||'').replace(/[\s-]/g,'');
  if(!/^\d{8}$|^\d{12,14}$/.test(code)||!checkDigit(code))return '';
  if(code.length===12)code='0'+code;
  return code;
 }
 function lookup(code){
  selectedCode=code;
  currentPrefix=code.length===13&&/^0?2/.test(code)?code.slice(0,7):'';
  const manual=currentPrefix&&typeof learned[currentPrefix]==='string'?learned[currentPrefix]:null;
  const importedPLU=currentPrefix?eanIndex.get(currentPrefix):null;
  const examplePLU=currentPrefix?known[currentPrefix]?.plu:null;
  // Une association manuelle explicite prime, puis le référentiel DIGI, puis les exemples.
  // Un conflit avec l'import est signalé plutôt que masqué.
  const association=manual||importedPLU||examplePLU||null;
  const fallback=known[currentPrefix];
  const matched=association?catalog.get(association)||
   ((fallback?.plu===association)?{plu:association,name:fallback.name,active:false}:null):null;
  const conflict=!!(manual&&importedPLU&&manual!==importedPLU);
  const ambiguous=!!(currentPrefix&&ambiguousPrefixes.has(currentPrefix)&&!manual);
  let origin=matched?
   (manual?'Association enregistrée sur cet appareil':
    importedPLU?'Correspondance automatique depuis l’export DIGI':
    'Correspondance vérifiée sur une étiquette'):
   (ambiguous?'Préfixe partagé par plusieurs PLU : association manuelle nécessaire.':
    'Aucune correspondance EAN → PLU trouvée dans le catalogue actuel.');
  if(conflict)origin+=' Attention : cette association est différente de l’export DIGI.';
  $s('iuEanResultCode',code);
  $s('iuEanResultPrefix',currentPrefix||'Non applicable');
  $s('iuEanResultPLU',matched?'PLU '+matched.plu:'Non identifié');
  $s('iuEanResultTitle',matched?matched.name:'Produit non identifié');
  $s('iuEanMatchOrigin',origin);
  $s('iuEanResultWeight','Non disponible dans ce code de manière fiable');
  $('iuEanResult').hidden=false;
  $('iuEanLearn').hidden=!currentPrefix||!imported;
  $('iuEanLearnSearch').value='';
  $('iuEanLearnMatches').replaceChildren();
  $('iuEanOpenWeight').hidden=!modalFromCalc;
  $('iuEanInput').value=code;
  const summary=matched?matched.name+' (PLU '+matched.plu+'). ':'';
  status.textContent='Code-barres valide. '+summary+
   'Le poids exact nécessite toujours la lecture de l’étiquette.'+
   (conflict?' Attention : vérifie l’association manuelle.':'');
 }
 const status=$('iuEanStatus');
 function handleCode(raw){
  const code=normalizeCode(raw);
  if(!code){status.textContent='Code invalide ou clé EAN incorrecte. Vérifie tous les chiffres.';$('iuEanResult').hidden=true;return}
  void stopCamera();
  lookup(code);
 }
 function associate(item){
  if(!currentPrefix)return;
  if(!imported)return;
  const existing=learned[currentPrefix]||eanIndex.get(currentPrefix)||known[currentPrefix]?.plu;
  if(existing&&existing!==item.plu&&!confirm('Ce préfixe correspond déjà au PLU '+existing+'. Remplacer cette association ?'))return;
  learned[currentPrefix]=item.plu;
  try{localStorage.setItem(keyLinks,JSON.stringify(learned))}
  catch(_){status.textContent='Enregistrement local impossible : stockage saturé.';return}
  updateCount();lookup(selectedCode);
  status.textContent='Association locale créée : '+currentPrefix+' → PLU '+item.plu+'.';
 }
 function loadScanner(){
  if(window.Html5Qrcode)return Promise.resolve(window.Html5Qrcode);
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
   script.async=true;script.onload=()=>window.Html5Qrcode?resolve(window.Html5Qrcode):reject(Error('Lecteur non disponible'));
   script.onerror=()=>reject(Error('Téléchargement impossible'));document.head.append(script);
  });
 }
 async function stopCamera(){
  if(closing)return closing;
  const instance=scanner;
  if(!instance){
   scanning=false;starting=false;$('iuEanCameraWrap').hidden=true;
   $('iuEanStop').hidden=true;$('iuEanStart').hidden=false;return;
  }
  scanner=null;scanning=false;
  closing=(async()=>{
   try{await instance.stop()}catch(_){}
   try{await instance.clear()}catch(_){}
   $('iuEanCameraWrap').hidden=true;$('iuEanStop').hidden=true;$('iuEanStart').hidden=false;
  })().finally(()=>{closing=null});
  return closing;
 }
 async function startCamera(){
  if(starting||scanning||modal.hidden)return;
  starting=true;$('iuEanStart').disabled=true;
  status.textContent='Ouverture de la caméra…';
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Permission caméra ou HTTPS indisponible');
   if(closing)await closing;
   const Reader=await loadScanner();
   if(modal.hidden)return;
   const format=window.Html5QrcodeSupportedFormats;
   const formats=format?['EAN_13','EAN_8','UPC_A','UPC_E'].map(k=>format[k]).filter(x=>x!==undefined):[];
   scanner=new Reader('iuEanCamera',formats.length?{formatsToSupport:formats,verbose:false}:{verbose:false});
   $('iuEanCameraWrap').hidden=false;
   await scanner.start({facingMode:'environment'},{fps:10,disableFlip:true},
    result=>{if(!scanning)return;handleCode(result)},()=>{});
   if(modal.hidden){await stopCamera();return}
   scanning=true;$('iuEanStop').hidden=false;$('iuEanStart').hidden=true;
   status.textContent='Caméra active : pointe l’étiquette vers le code-barres.';
  }catch(_){
   await stopCamera();
   status.textContent='Caméra indisponible. Vérifie son autorisation et Internet au premier lancement, ou saisis le code.';
  }finally{starting=false;$('iuEanStart').disabled=false}
 }
 function open(fromCalc){
  modalFromCalc=!!fromCalc;modal.hidden=false;
  $('iuEanResult').hidden=true;status.textContent='Prêt. Cadre un EAN sur une étiquette.';
  $('iuEanInput').value='';$('iuEanOpenWeight').hidden=!fromCalc;
  document.body.classList.add('iu-weigh-scan-open');
  $('iuEanClose').focus({preventScroll:true});
  void startCamera();
 }
 function close(){
  void stopCamera();modal.hidden=true;document.body.classList.remove('iu-weigh-scan-open');
  $('iuEanResult').hidden=true;
  if(modalFromCalc)$('iuEanWeighOpen')?.focus({preventScroll:true});
  modalFromCalc=false;
 }
 $('iuEanWeighOpen')?.addEventListener('click',()=>open(true));
 $('iuEanAdminOpen').addEventListener('click',()=>open(false));
 $('iuEanClose').addEventListener('click',close);
 modal.addEventListener('click',event=>{if(event.target===modal)close()});
 $('iuEanStart').addEventListener('click',()=>{void startCamera()});
 $('iuEanStop').addEventListener('click',()=>{void stopCamera();status.textContent='Caméra arrêtée.'});
 $('iuEanScanAgain').addEventListener('click',()=>{$('iuEanResult').hidden=true;void startCamera()});
 $('iuEanForm').addEventListener('submit',event=>{event.preventDefault();handleCode($('iuEanInput').value)});
 $('iuEanOpenWeight').addEventListener('click',()=>{close();$('iuWeighScanToggle')?.click()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!modal.hidden)close()});
 window.addEventListener('pagehide',()=>{close()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)close()});
 new MutationObserver(()=>{
  if(modal.hidden)return;
  if(modalFromCalc){if($('grossWeight')?.getClientRects().length===0)close()}
  else if(!document.body.classList.contains('is-admin-mode'))close();
 }).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Dev/test: inspect without exposing inventory data or opening the camera.
 window.IUEanCatalogueInfo=()=>({imported,count:catalog.size,links:Object.keys(learned).length});
})();
