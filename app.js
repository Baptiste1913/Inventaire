'use strict';
const STORAGE_KEY='inventaires-u-v2';
const LEGACY_KEY='tare-paniettes-v1';
const HISTORY_KEY='inventaires-u-history-v1';
const $=id=>document.getElementById(id);
// Notifications empilables : chaque action garde son propre délai et sa fermeture.
const UNDO_DELAY_MS=8000;
const UNDO_EXIT_MS=280;
let pendingUndo=null,undoTimeout=null,undoExitTimeout=null;
const toastTimers=new Map();
const toastProgressTimers=new Map();
let undoToastNode=null;
function toastStack(){
 let stack=$('toastStack');
 if(!stack){
   stack=document.createElement('div');
   stack.id='toastStack';stack.className='toast-stack';
   document.body.append(stack);
 }
 return stack;
}
function closeToast(node,immediate=false){
 if(!node)return;
 const timer=toastTimers.get(node);
 if(timer)clearTimeout(timer);
 toastTimers.delete(node);
 const progressTimer=toastProgressTimers.get(node);
 if(typeof progressTimer==='function')progressTimer();
 else if(progressTimer!==undefined)clearInterval(progressTimer);
 toastProgressTimers.delete(node);
 if(node===undoToastNode){
   pendingUndo=null;undoTimeout=null;undoToastNode=null;
 }
 if(immediate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){node.remove();return;}
 node.classList.remove('undo-entering','undo-ticking');
 node.classList.add('undo-leaving');
 setTimeout(()=>node.remove(),UNDO_EXIT_MS);
}
function dismissUndo(immediate=false){closeToast(undoToastNode,immediate);}
function createToast(message,{action=null,onAction=null,persistent=false,warning=false,undo=false}={}){
 const toast=document.createElement('div');
 toast.className='undo-toast undo-entering'+(warning?' toast-warning':'')+(undo?' undo-ticking':'');
 toast.setAttribute('role','status');
 const symbol=document.createElement('span');symbol.className='undo-toast-symbol';symbol.setAttribute('aria-hidden','true');
 if(undo&&message==='Inventaire terminé.'){
  symbol.classList.add('is-finish-return');
  // Flèche de retour arrondie, sans changer le bouton « Annuler ».
  symbol.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/></svg>';
 }else symbol.textContent=warning?'!':'↶';
 const label=document.createElement('span');label.className='undo-toast-message';label.textContent=message;
 toast.append(symbol,label);
 if(action){
   const button=document.createElement('button');button.type='button';button.className='undo-toast-button';
   button.textContent=action;button.addEventListener('click',()=>onAction?.());
   toast.append(button);
 }
 const close=document.createElement('button');close.type='button';close.className='toast-close';
 close.setAttribute('aria-label','Fermer la notification');close.textContent='×';
 close.addEventListener('click',()=>closeToast(toast));
 toast.append(close);
 toastStack().prepend(toast);
 if(!persistent){
   // Même échéance absolue pour la fermeture et la barre, y compris après
   // une mise en arrière-plan de Safari/PWA (timers suspendus par iOS).
   const deadline=Date.now()+UNDO_DELAY_MS;
   const progress=document.createElement('span');
   progress.className='undo-toast-timer-fill';
   progress.setAttribute('aria-hidden','true');
   toast.append(progress);
   toast.classList.add('toast-has-timer');
   // Une seule animation native au moteur de rendu : progression réellement
   // continue (sans paliers de 100 ms), recalée au retour sur l'app.
   let animation=null;
   const animateRemaining=()=>{
     if(!toast.isConnected)return;
     const remaining=Math.max(0,deadline-Date.now());
     const ratio=remaining/UNDO_DELAY_MS;
     if(animation)animation.cancel();
     progress.style.transform=`scaleX(${ratio})`;
     if(remaining===0){closeToast(toast);return;}
     if(progress.animate){
       animation=progress.animate([{transform:`scaleX(${ratio})`},{transform:'scaleX(0)'}],
         {duration:remaining,easing:'linear',fill:'forwards'});
     }else{
       progress.style.transition='none';
       void progress.offsetWidth;
       progress.style.transition=`transform ${remaining}ms linear`;
       requestAnimationFrame(()=>{if(toast.isConnected)progress.style.transform='scaleX(0)';});
     }
   };
   animateRemaining();
   const onVisibility=()=>{if(!document.hidden)animateRemaining();};
   document.addEventListener('visibilitychange',onVisibility);
   toastProgressTimers.set(toast,()=>{
     document.removeEventListener('visibilitychange',onVisibility);
     if(animation)animation.cancel();
   });
   const timer=setTimeout(()=>closeToast(toast),UNDO_DELAY_MS);
   toastTimers.set(toast,timer);
 }
 return toast;
}
function offerUndo(message,restore){
 // Les anciennes annulations restent disponibles tant que leur notification est visible.
 const pending={restore,expires:Date.now()+UNDO_DELAY_MS};
 const toast=createToast(message,{action:'Annuler',undo:true,onAction:()=>{
   if(Date.now()>=pending.expires){closeToast(toast);return;}
   let restored=false;
   try{restored=pending.restore()===true;}catch(error){console.warn('Annulation impossible',error);}
   if(restored)closeToast(toast);
   else toast.querySelector('.undo-toast-message').textContent='Impossible de restaurer : stockage local indisponible.';
 }});
 pendingUndo=pending;undoToastNode=toast;
}
function showActionToast(message,{reload=false,persistent=false}={}){
 return createToast(message,{action:reload?'Actualiser':null,
   onAction:reload?()=>window.location.reload():null,persistent,warning:true});
}
// Some privacy modes forbid reading localStorage: keep the app usable without crashing.
const safeGet=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const DEFAULT_BASKETS=[{id:uid(),name:'Panier normal',tare:554},{id:uid(),name:'Demi-panier',tare:324},{id:uid(),name:'Panier ovale',tare:538},{id:uid(),name:'Grand panier',tare:1064}];
const fmt=grams=>(grams/1000).toFixed(3);
function parseKg(value){const s=String(value).trim().replace(',','.');if(!/^\d+(?:\.\d{1,3})?$/.test(s))return null;const n=Number(s)*1000;return Number.isSafeInteger(Math.round(n))?Math.round(n):null;}
function sanitize(arr){return arr.filter(b=>b&&typeof b.name==='string'&&b.name.trim()&&Number.isFinite(Number(b.tare))&&Number(b.tare)>=0).map(b=>({id:String(b.id||uid()),name:b.name.trim().slice(0,40),tare:Math.round(Number(b.tare))}));}
function loadBaskets(){for(const key of [STORAGE_KEY,LEGACY_KEY]){try{const raw=localStorage.getItem(key);if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return sanitize(parsed);}}catch(e){console.warn('Lecture des paniers impossible',e);}}return DEFAULT_BASKETS;}
let baskets=loadBaskets(),editingId=null,netGrams=null,dragId=null;
function loadHistory(){try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.name==='string'&&Number.isFinite(x.net)&&Number.isFinite(x.gross)&&Number.isFinite(x.tare)&&typeof x.at==='number').slice(0,15):[];}catch{return [];}}
let history=loadHistory(),historyExpanded=false,autoSaveTimer=null,currentWeighId=null;
let historyRevealMotion=null;
const HISTORY_PREVIEW_COUNT=5;
function persistHistory(){try{safeSetItem(HISTORY_KEY,JSON.stringify(history));renderHistory();return true;}catch{$('weighStatus').textContent='Impossible de sauvegarder cet historique sur cet appareil.';return false;}}
// Recherche d'un doublon dans l'inventaire courant et dans l'historique récent.
// C'est une information de vigilance, jamais un blocage de validation volontaire.
// Le même EAN et le même poids peuvent correspondre à deux produits physiques.
function iuGeminiDuplicate(ean,gross,rate,total){
 // Étiquette imprimée identique = EAN complet, poids, prix/kg et total.
 // La tare dépend du panier sélectionné et ne doit pas masquer un doublon.
 if(!/^\d{13}$/.test(ean||'')||!Number.isSafeInteger(gross)||
    !Number.isSafeInteger(rate)||!Number.isSafeInteger(total))return null;
 const match=x=>x?.source==='gemini'&&x.ean13===ean&&
  x.gross===gross&&x.pricePerKgCents===rate&&x.originalTotalCents===total;
 const session=getActiveSession();
 // Pendant un inventaire, un doublon doit appartenir à CET inventaire.
 // Une pesée d'hier ou d'une session terminée n'est pas un doublon actuel.
 if(session)return (session.entries||[]).find(match)||null;
 // Hors session : secours limité aux acquisitions très récentes.
 return history.find(x=>match(x)&&Date.now()-x.at<15*60*1000)||null;
}
window.IUDigiRecentReferences=()=>{
 const session=getActiveSession();
 return [...(session?.entries||[]).slice(-185).reverse(),...history].slice(0,200)
  .filter(x=>x?.source==='gemini'&&/^\d{7}$/.test(String(x.catalogPrefix||'')))
  .map(x=>({catalogPrefix:x.catalogPrefix}));
};
window.IUGeminiDuplicateInfo=payload=>({
 duplicate:Boolean(iuGeminiDuplicate(payload?.ean13,payload?.gross,
  payload?.pricePerKgCents,payload?.totalCents))
});
// Gemini utilise les mêmes historiques et sessions que la pesée classique.
window.IUGeminiSaveWeigh=payload=>{
 const gross=payload?.gross,rate=payload?.pricePerKgCents,total=payload?.totalCents;
 const ean=payload?.ean13,corrected=payload?.correctedEan13;
 const product=typeof payload?.product==='string'?payload.product.trim().slice(0,120):'';
 const b=baskets.find(x=>x.id===$('basketSelect').value);
 const plu=String(payload?.plu??''),prefix=String(payload?.catalogPrefix??'');
 const digi=window.IUDigiCatalogLookup?.resolve(ean);
 // Le magasin n'enregistre jamais un nom/PLU venant d'une déduction Gemini.
 if(!digi?.ok||digi.plu!==plu||digi.name!==product||digi.eanPrefix!==prefix)
  return {ok:false,reason:'Référence DIGI absente, ambiguë ou modifiée'};
 if(!b||!product||!Number.isSafeInteger(gross)||gross<=b.tare||gross>30000||
    !Number.isSafeInteger(rate)||rate<=0||!Number.isSafeInteger(total)||total<0||
    !/^\d{13}$/.test(ean||'')||!/^\d{13}$/.test(corrected||''))return {ok:false,reason:'Données ou panier invalides'};
 const net=gross-b.tare;
 if(Math.abs(Math.round(gross*rate/1000)-total)>1)
  return {ok:false,reason:'Prix original incohérent'};
 if(ean.startsWith('02')&&Math.abs(Math.round(Number(ean.slice(7,12))*100/655.36)-total)>1)
  return {ok:false,reason:'Montant de l’EAN original incohérent'};
 // Le montant et la clé EAN reconstitués doivent correspondre EXACTEMENT
 // au poids net et au prix de cette pesée, même si l'appelant est modifié.
 const correctedTotal=Math.round(net*rate/1000);
 const encoded=Math.round(correctedTotal*655.36/100);
 if(encoded<0||encoded>99999||!Number.isSafeInteger(encoded))
  return {ok:false,reason:'Montant EAN hors limites'};
 const first12=ean.slice(0,7)+String(encoded).padStart(5,'0');
 let sum=0;
 for(let i=0;i<12;i++)sum+=Number(first12[i])*(i%2?3:1);
 const expected=first12+String((10-sum%10)%10);
 if(corrected!==expected||payload?.correctedTotalCents!==correctedTotal)
  return {ok:false,reason:'Code-barres corrigé non conforme au calcul'};
 const now=Date.now();
 const duplicate=Boolean(iuGeminiDuplicate(ean,gross,rate,total));
 // Deux étiquettes identiques peuvent être deux vrais articles. Exiger
 // une confirmation explicite, également contrôlée au moment de la sauvegarde.
 if(duplicate&&payload?.confirmDuplicate!==true)
  return {ok:false,duplicate:true,reason:'Doublon à confirmer'};
 const editedFields=Array.isArray(payload?.manualCorrectedFields)
  ?[...new Set(payload.manualCorrectedFields.filter(v=>
    ['name','weight','rate','total','ean'].includes(v)))].slice(0,5):[];
 // Traçabilité informative uniquement : ne peut ni autoriser une pesée,
 // ni court-circuiter la comparaison exacte DIGI ci-dessus.
 const allowedEvidence={
  name:['catalog'],plu:['catalog'],ean:['read','calculated-verified','confirmed-by-user'],
  weight:['read'],rate:['read'],total:['read','calculated']
 };
 const evidence=payload?.digiEvidence&&typeof payload.digiEvidence==='object'
  ?Object.fromEntries(Object.entries(allowedEvidence).map(([key,values])=>[
    key,values.includes(payload.digiEvidence[key])?payload.digiEvidence[key]:null
   ]).filter(([,value])=>value!==null)):null;
 const recoveryKind=['matched','calculated','reconstructed','confirmed']
  .includes(payload?.digiRecoveryKind)?payload.digiRecoveryKind:null;
 const entry={id:uid(),at:now,name:b.name,tare:b.tare,gross,net,
  manualCorrectedFields:editedFields,
  digiEvidence:evidence,digiRecoveryKind:recoveryKind,
  duplicateConfirmed:duplicate&&payload?.confirmDuplicate===true,
  source:'gemini',product,plu,catalogPrefix:prefix,ean13:ean,correctedEan13:corrected,
  pricePerKgCents:rate,originalTotalCents:total,correctedTotalCents:payload.correctedTotalCents,
  model:'gemini-3.5-flash-lite'};
 const newHistory=[entry,...history].slice(0,15);
 const session=getActiveSession(),trackSession=Boolean(session&&!session.pausedAt);
 const newEntries=trackSession?[...session.entries,{...entry,groupId:entry.id}]:null;
 try{
  const oldHistory=localStorage.getItem(HISTORY_KEY);
  const oldSessions=trackSession?localStorage.getItem(SESSION_KEY):null;
  try{
   if(trackSession)safeSetItem(SESSION_KEY,JSON.stringify({sessions:sessions.map(x=>x===session?{...x,entries:newEntries}:x),activeId:activeSessionId}));
   safeSetItem(HISTORY_KEY,JSON.stringify(newHistory));
  }catch(error){
   try{if(trackSession){if(oldSessions===null)localStorage.removeItem(SESSION_KEY);else safeSetItem(SESSION_KEY,oldSessions);}}catch{}
   try{if(oldHistory===null)localStorage.removeItem(HISTORY_KEY);else safeSetItem(HISTORY_KEY,oldHistory);}catch{}
   throw error;
  }
 }catch{return {ok:false,reason:'Stockage indisponible : pesée non enregistrée'};}
 history=newHistory;
 if(trackSession)session.entries=newEntries;
 renderHistory();
 if(trackSession)renderLiveSessionStats();
 if($('backupCard')?.open)renderBackupSummary();
 return {ok:true,id:entry.id,net,duplicate};
};
// v43.10 — presentation commune, sans mutation des pesées sauvegardées.
function weighRecordElement(entry){
 const ai=entry.source==='gemini';
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const row=node('article','history-item iu-weigh-record'+(ai?' history-item-gemini':''));
 const head=node('div','iu-weigh-record-head'),identity=node('div','iu-weigh-record-identity');
 const titleLine=node('div','iu-weigh-record-titleline');

 titleLine.append(node('strong','iu-weigh-record-title',ai&&entry.product?entry.product:entry.name));
 identity.append(titleLine);
 if(ai&&entry.product)identity.append(node('span','iu-weigh-record-basket',entry.name));
 const date=new Date(entry.at);
 identity.append(node('span','iu-weigh-record-date',date.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})));
 head.append(identity);
 if(ai){
  const badge=node('span','iu-weigh-record-ai');badge.setAttribute('role','img');badge.setAttribute('aria-label','Pesée AI');
  const mark=node('span','iu-weigh-record-ai-mark','AI');mark.setAttribute('aria-hidden','true');
  const canvas=node('canvas','iu-weigh-record-ai-canvas');canvas.width=26;canvas.height=26;canvas.setAttribute('aria-hidden','true');
  badge.append(mark,canvas);head.append(badge);
 }
 row.append(head);
 const metrics=node('div','iu-weigh-record-metrics');
 const metric=(parent,label,value)=>{const cell=node('div','iu-weigh-record-metric');cell.append(node('small','',label),node('strong','',value));parent.append(cell);};
 metric(metrics,'Brut',fmt(entry.gross)+' kg');metric(metrics,'Tare',fmt(entry.tare)+' kg');
 const weights=node('div','iu-weigh-record-weights');weights.append(metrics);
 const result=node('div','iu-weigh-record-net');
 const netLine=node('div','iu-weigh-record-netline');netLine.append(node('strong','',fmt(entry.net)),node('span','','kg'));
 result.append(node('small','','Poids net'),netLine);weights.append(result);row.append(weights);
 if(ai){
  const prices=node('div','iu-weigh-record-metrics iu-weigh-record-prices');
  if(Number.isInteger(entry.pricePerKgCents))metric(prices,'Prix / kg',(entry.pricePerKgCents/100).toFixed(2).replace('.',',')+' €');
  if(Number.isInteger(entry.correctedTotalCents))metric(prices,'Total après tare',(entry.correctedTotalCents/100).toFixed(2).replace('.',',')+' €');
  if(prices.childNodes.length)row.append(prices);
 }
 if(ai){
  const foot=node('div','iu-weigh-record-foot');
  if(entry.plu)foot.append(node('span','iu-weigh-record-plu','PLU '+entry.plu));
  if(entry.duplicateConfirmed)foot.append(node('span','iu-weigh-record-status','Doublon confirmé'));
  if(Array.isArray(entry.manualCorrectedFields)&&entry.manualCorrectedFields.length)foot.append(node('span','iu-weigh-record-status','Valeur vérifiée'));
  const hasDetails=Boolean(entry.ean13||entry.correctedEan13||Number.isInteger(entry.originalTotalCents));
  if(foot.childNodes.length||hasDetails)row.append(foot);
  if(entry.ean13||entry.correctedEan13||Number.isInteger(entry.originalTotalCents)){
   const details=node('div','iu-weigh-record-details'),btn=node('button','iu-weigh-record-expand','Détails');
   btn.setAttribute('aria-label','Détails de l’étiquette');
   btn.type='button';btn.setAttribute('aria-expanded','false');details.hidden=true;
   const content=node('div','iu-weigh-record-codes');content.hidden=true;
   const line=(label,value)=>{const cell=node('div','iu-weigh-record-code');cell.append(node('small','',label),node('span','',value));content.append(cell);};
   if(entry.ean13)line('EAN lu',entry.ean13);
   if(entry.correctedEan13)line('EAN après tare',entry.correctedEan13);
   if(Number.isInteger(entry.originalTotalCents))line('Total brut',(entry.originalTotalCents/100).toFixed(2).replace('.',',')+' €');
   btn.addEventListener('click',()=>{content.hidden=!content.hidden;details.hidden=content.hidden;btn.setAttribute('aria-expanded',String(!content.hidden));btn.setAttribute('aria-label',content.hidden?'Détails de l’étiquette':'Masquer les détails de l’étiquette');btn.textContent=content.hidden?'Détails':'Fermer';});
   foot.append(btn);details.append(content);row.append(details);
  }
 }
 return row;
}
function weighArchiveElement(entries){
 const section=document.createElement('section');section.className='iu-weigh-archive';
 const title=document.createElement('h4');title.textContent='Détail des pesées';
 const toggle=document.createElement('button');toggle.type='button';toggle.className='iu-weigh-archive-toggle outline-btn';
 toggle.textContent='Voir les '+entries.length+' pesée'+(entries.length>1?'s':'');toggle.setAttribute('aria-expanded','false');toggle.disabled=!entries.length;
 const list=document.createElement('div');list.className='iu-weigh-record-list';list.hidden=true;
 const more=document.createElement('button');more.type='button';more.className='iu-weigh-archive-more outline-btn';more.hidden=true;
 const ordered=[...entries].reverse();let shown=0;
 function appendPage(){const end=Math.min(shown+20,ordered.length);const fragment=document.createDocumentFragment();for(;shown<end;shown++)fragment.append(weighRecordElement(ordered[shown]));list.append(fragment);more.hidden=list.hidden||shown>=ordered.length;more.textContent='Voir '+Math.min(20,ordered.length-shown)+' pesées supplémentaires ('+shown+'/'+ordered.length+')';}
 toggle.addEventListener('click',()=>{list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));toggle.textContent=list.hidden?'Voir les '+entries.length+' pesée'+(entries.length>1?'s':''):'Masquer les pesées';if(!list.hidden&&!shown)appendPage();more.hidden=list.hidden||shown>=ordered.length;});
 more.addEventListener('click',appendPage);section.append(title,toggle,list,more);return section;
}
// The preview stays mounted while only the additional records expand/collapse.
function updateHistoryToggle(){
 const btn=$('historyToggleTop'),remaining=Math.max(0,history.length-HISTORY_PREVIEW_COUNT);
 btn.hidden=!remaining;
 btn.setAttribute('aria-expanded',String(historyExpanded&&remaining>0));
 const label=btn.querySelector('.history-toggle-label');
 if(label)label.textContent=(historyExpanded?'Masquer ':'Afficher ')+(remaining===1?'la dernière pesée':'les '+remaining+' autres pesées');
}
function stopHistoryReveal(){
 const motion=historyRevealMotion;historyRevealMotion=null;
 if(motion){motion.onfinish=null;motion.cancel();}
 const reveal=$('historyMoreRegion');
 reveal.style.removeProperty('height');reveal.style.removeProperty('overflow');reveal.style.removeProperty('opacity');
}
function fillHistoryMore(){
 const list=$('historyMoreList');list.replaceChildren();
 for(const entry of history.slice(HISTORY_PREVIEW_COUNT))list.append(weighRecordElement(entry));
}
function renderHistory(){
 const list=$('historyList'),reveal=$('historyMoreRegion'),extra=$('historyMoreList');
 stopHistoryReveal();list.replaceChildren();extra.replaceChildren();
 if(history.length<=HISTORY_PREVIEW_COUNT)historyExpanded=false;
 $('historyCount').textContent=history.length+' pesée'+(history.length>1?'s':'');
 $('clearHistoryBtn').hidden=!history.length;
 updateHistoryToggle();
 reveal.hidden=!historyExpanded;reveal.inert=!historyExpanded;
 if(!history.length){const p=document.createElement('p');p.className='empty history-empty';p.textContent='Aucune pesée enregistrée pour le moment.';list.append(p);return;}
 for(const entry of history.slice(0,HISTORY_PREVIEW_COUNT))list.append(weighRecordElement(entry));
 if(historyExpanded)fillHistoryMore();
}
function toggleHistoryMore(){
 if(history.length<=HISTORY_PREVIEW_COUNT)return;
 const reveal=$('historyMoreRegion'),list=$('historyMoreList'),opening=!historyExpanded;
 const from=reveal.hidden?0:reveal.getBoundingClientRect().height;
 const opacity=reveal.hidden?0:Number(getComputedStyle(reveal).opacity)||0;
 stopHistoryReveal();historyExpanded=opening;updateHistoryToggle();
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const initialScroll=window.scrollY;
 if(opening){
  if(list.childElementCount!==history.length-HISTORY_PREVIEW_COUNT)fillHistoryMore();
  reveal.hidden=false;reveal.inert=false;
 }else reveal.inert=true;
 function finish(){
  if(historyExpanded!==opening)return;
  stopHistoryReveal();
  if(!opening){reveal.hidden=true;list.replaceChildren();return;}
  // Only reveal the first new entry if it is below the usable viewport.
  // Do not override a user's scroll gesture during the expansion.
  const first=list.firstElementChild;
  const viewport=window.visualViewport;
  const bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
  if(first&&reveal.getClientRects().length&&Math.abs(window.scrollY-initialScroll)<24&&first.getBoundingClientRect().top>bottom-145){
   first.scrollIntoView({behavior:reduce?'instant':'smooth',block:'nearest',inline:'nearest'});
  }
 }
 const to=opening?reveal.scrollHeight:0;
 if(reduce||typeof reveal.animate!=='function'||Math.abs(to-from)<1){finish();return;}
 reveal.style.height=from+'px';reveal.style.overflow='hidden';
 const motion=reveal.animate([{height:from+'px',opacity},{height:to+'px',opacity:opening?1:0}],{duration:420,easing:'cubic-bezier(.28,.72,.24,1)',fill:'both'});
 historyRevealMotion=motion;
 motion.onfinish=()=>{if(historyRevealMotion===motion)finish();};
}
function animateConfirmation(){const result=document.querySelector('.result');result.classList.remove('result-confirmed');void result.offsetWidth;result.classList.add('result-confirmed');setTimeout(()=>result.classList.remove('result-confirmed'),850);}
function persist(){
 try{safeSetItem(STORAGE_KEY,JSON.stringify(baskets));render();return true;}
 catch(e){baskets=loadBaskets();render();showActionToast('Enregistrement du panier impossible. Modification annulée.',{reload:true,persistent:true});return false;}
}
function commitBaskets(next){
 try{safeSetItem(STORAGE_KEY,JSON.stringify(next));}
 catch{showActionToast(externalDataChanged?'Données modifiées dans un autre onglet. Actualise la page.':'Enregistrement du panier impossible : stockage local indisponible.',{reload:true,persistent:true});return false;}
 baskets=next;render();renderBackupSummary();return true;
}
// Long appui sur toute la ligne : défilement normal avant activation, glissement fluide ensuite.
function setupTouchReorder(item,list){
 let timer=null,active=false,ghost=null,startX=0,startY=0,offsetY=0,offsetX=0,draggedId=item.dataset.id;
 const blocked=target=>Boolean(target.closest('button:not(.drag-handle),input,select,a'));
 const clearTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
 function startDrag(){
   timer=null;active=true;const rect=item.getBoundingClientRect();offsetY=startY-rect.top;offsetX=startX-rect.left;
   ghost=item.cloneNode(true);ghost.removeAttribute('id');ghost.classList.add('drag-ghost');ghost.style.left=rect.left+'px';ghost.style.top=rect.top+'px';ghost.style.width=rect.width+'px';ghost.style.height=rect.height+'px';
   document.body.append(ghost);item.classList.add('is-placeholder');list.classList.add('is-reordering');
   if(navigator.vibrate)navigator.vibrate(12);
 }
 function endDrag(){clearTimer();if(!active)return;active=false;ghost?.remove();ghost=null;item.classList.remove('is-placeholder');list.classList.remove('is-reordering');document.body.style.removeProperty('user-select');
   const ids=[...list.querySelectorAll('.basket-item')].map(x=>x.dataset.id);
   const newOrder=ids.map(id=>baskets.find(b=>b.id===id)).filter(Boolean);
   if(newOrder.length===baskets.length&&newOrder.some((b,i)=>b.id!==baskets[i].id)){commitBaskets(newOrder);}else render();
 }
 item.addEventListener('touchstart',e=>{if(e.touches.length!==1||blocked(e.target))return;const t=e.touches[0];startX=t.clientX;startY=t.clientY;clearTimer();timer=setTimeout(startDrag,260);},{passive:true});
 item.addEventListener('touchmove',e=>{if(!active){const t=e.touches[0];if(t&&(Math.abs(t.clientY-startY)>9||Math.abs(t.clientX-startX)>9))clearTimer();return;}
   e.preventDefault();const t=e.touches[0];if(!t)return;const y=t.clientY;ghost.style.transform=`translate3d(${t.clientX-startX}px,${y-startY}px,0)`;
   const others=[...list.querySelectorAll('.basket-item')].filter(el=>el!==item);
   const target=others.find(el=>{const r=el.getBoundingClientRect();return y>=r.top&&y<=r.bottom;});
   if(target){const r=target.getBoundingClientRect();list.insertBefore(item,y<r.top+r.height/2?target:target.nextSibling);}
 },{passive:false});
 item.addEventListener('touchend',endDrag,{passive:true});item.addEventListener('touchcancel',endDrag,{passive:true});
 item.addEventListener('contextmenu',e=>{if(active||timer!==null)e.preventDefault();});
}
function render(){const select=$('basketSelect'),selected=select.value;select.replaceChildren();if(!baskets.length){const o=new Option('Ajoute d’abord un panier','');select.add(o);}else{for(const b of baskets)select.add(new Option(`${b.name} — ${fmt(b.tare)} kg`,b.id));if(baskets.some(b=>b.id===selected))select.value=selected;}
$('basketCount').textContent=`${baskets.length} panier${baskets.length>1?'s':''}`;const list=$('basketList');list.replaceChildren();if(!baskets.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Aucun panier enregistré.';list.append(empty);}
baskets.forEach((b,index)=>{const item=document.createElement('div');item.className='basket-item';item.dataset.id=b.id;const handle=document.createElement('button');handle.className='drag-handle';handle.type='button';handle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="8" cy="5" r="1.7" fill="currentColor"/><circle cx="16" cy="5" r="1.7" fill="currentColor"/><circle cx="8" cy="12" r="1.7" fill="currentColor"/><circle cx="16" cy="12" r="1.7" fill="currentColor"/><circle cx="8" cy="19" r="1.7" fill="currentColor"/><circle cx="16" cy="19" r="1.7" fill="currentColor"/></svg>';handle.title='Maintenir et glisser pour réordonner';handle.setAttribute('aria-label',`Déplacer ${b.name}`);handle.draggable=true;item.draggable=false;const info=document.createElement('div');info.className='basket-info';const name=document.createElement('strong');name.textContent=b.name;const tare=document.createElement('span');tare.textContent=`${fmt(b.tare)} kg à vide`;info.append(name,tare);const moves=document.createElement('div');moves.className='move-actions';for(const [label,delta] of [['▲',-1],['▼',1]]){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.disabled=index+delta<0||index+delta>=baskets.length;btn.setAttribute('aria-label',`${label==='▲'?'Monter':'Descendre'} ${b.name}`);btn.addEventListener('click',()=>moveBy(b.id,delta));moves.append(btn);}const actions=document.createElement('div');actions.className='item-actions';const edit=document.createElement('button');edit.type='button';edit.className='small-action';edit.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M17.5 3.5a2.12 2.12 0 0 1 3 3L11 16l-4 1 1-4 9.5-9.5z"/></svg>';edit.setAttribute('aria-label',`Modifier ${b.name}`);edit.title=`Modifier ${b.name}`;edit.addEventListener('click',()=>startEdit(b.id));const del=document.createElement('button');del.type='button';del.className='small-action delete';del.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 10v7m4-7v7"/></svg>';del.setAttribute('aria-label',`Supprimer ${b.name}`);del.title=`Supprimer ${b.name}`;del.addEventListener('click',()=>removeBasket(b.id));actions.append(edit,del);item.append(handle,info,moves,actions);list.append(item);
item.draggable=true;
item.addEventListener('dragstart',e=>{if(e.target.closest('button:not(.drag-handle)')){e.preventDefault();return;}dragId=b.id;item.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',b.id);});
item.addEventListener('dragend',()=>{dragId=null;list.querySelectorAll('.basket-item').forEach(x=>x.classList.remove('dragging','drag-over'));});
item.addEventListener('dragover',e=>{e.preventDefault();if(dragId!==b.id)item.classList.add('drag-over');});
item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
item.addEventListener('drop',e=>{e.preventDefault();reorder(dragId||e.dataTransfer.getData('text/plain'),b.id);});
setupTouchReorder(item,list);
});calculate();}
function reorder(from,to){const i=baskets.findIndex(b=>b.id===from),j=baskets.findIndex(b=>b.id===to);if(i<0||j<0||i===j){render();return;}const next=baskets.slice();const [item]=next.splice(i,1);next.splice(j,0,item);commitBaskets(next);}
function moveBy(id,delta){const i=baskets.findIndex(b=>b.id===id),j=i+delta;if(i<0||j<0||j>=baskets.length)return;const next=baskets.slice();[next[i],next[j]]=[next[j],next[i]];commitBaskets(next);}
function startEdit(id){const b=baskets.find(x=>x.id===id);if(!b)return;editingId=id;$('basketName').value=b.name;$('basketTare').value=fmt(b.tare);$('formTitle').textContent='Modifier le panier';$('saveBasketBtn').textContent='Enregistrer les modifications';$('cancelEditBtn').classList.remove('hidden');$('basketForm').scrollIntoView({behavior:'smooth',block:'center'});}
function cancelEdit(){editingId=null;$('basketForm').reset();$('formTitle').textContent='Ajouter un panier';$('saveBasketBtn').textContent='+ Ajouter le panier';$('cancelEditBtn').classList.add('hidden');}
function removeBasket(id){
 const index=baskets.findIndex(b=>b.id===id);if(index<0)return;
 const removed={...baskets[index]};
 const next=baskets.filter(b=>b.id!==id);
 try{safeSetItem(STORAGE_KEY,JSON.stringify(next));}
 catch{$('backupStatus').textContent='Suppression impossible : stockage local indisponible.';return;}
 const selected=$('basketSelect').value;
 baskets=next;
 if(editingId===id)cancelEdit();
 render();renderBackupSummary();
 offerUndo('Panier supprimé.',()=>{
   if(baskets.some(b=>b.id===removed.id))return false;
   const restored=baskets.slice();restored.splice(Math.min(index,restored.length),0,removed);
   try{safeSetItem(STORAGE_KEY,JSON.stringify(restored));}catch{return false;}
   baskets=restored;render();
   if(selected===removed.id){$('basketSelect').value=removed.id;calculate();}
   renderBackupSummary();
   return true;
 });
}
// Inventaires U V24 — sessions locales simplifiées, sans totaliseur produit, avec bilans renforcés.
const SESSION_KEY='inventaires-u-sessions-v1';
const MODE_KEY='inventaires-u-weight-mode-v1';
const LIMIT_KEY='inventaires-u-warning-limit-v1';
const DUPLICATE_CONFIRM_KEY='inventaires-u-duplicate-confirm-v1';
const safeClone=x=>JSON.parse(JSON.stringify(x));
const readJSON=(key,fallback)=>{try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw);}catch{return fallback;}};
function cleanWeigh(x){
  if(!x||typeof x!=='object'||!Number.isSafeInteger(x.net)||!Number.isSafeInteger(x.gross)||!Number.isSafeInteger(x.tare)||x.gross<0||x.tare<0||x.net!==x.gross-x.tare||!Number.isFinite(x.at))return null;
  const saved={id:typeof x.id==='string'?x.id.slice(0,90):uid(),at:x.at,
   name:String(x.name||'Panier').slice(0,40),tare:x.tare,gross:x.gross,
   net:x.net,groupId:String(x.groupId||x.id||uid()).slice(0,90)};
  if(x.source==='gemini'){
   saved.source='gemini';
   for(const key of ['product','plu','catalogPrefix','ean13','correctedEan13'])
    if(typeof x[key]==='string')saved[key]=x[key].slice(0,key==='product'?120:20);
   for(const key of ['pricePerKgCents','originalTotalCents','correctedTotalCents'])
    if(Number.isSafeInteger(x[key])&&x[key]>=0)saved[key]=x[key];
   if(Array.isArray(x.manualCorrectedFields))
    saved.manualCorrectedFields=x.manualCorrectedFields.filter(v=>
     ['ean','weight','rate','total'].includes(v)).slice(0,4);
   saved.duplicateConfirmed=x.duplicateConfirmed===true;
  }
  return saved;
}

/* V39.60 — Mois de référence explicite, indépendant de la date réelle.
   Les sessions historiques sans référence restent à classer. */
const iuMonthNames=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function iuReferenceValid(value){return typeof value==='string'&&/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);}
function iuSuggestedReference(date=new Date()){
 const iso=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 const planned=window.InventairesPlanning?window.InventairesPlanning.inventoryForDate?.(iso):window.IUInventorySchedule?.byDate(iso);
 if(iuReferenceValid(planned?.referenceMonth))return planned.referenceMonth;
 // Suggestion modifiable : tout début de mois peut concerner le mois précédent.
 const year=date.getFullYear(),month=date.getMonth()-(date.getDate()<=7?1:0);
 const d=new Date(year,month,1,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function iuReferenceLabel(key){if(!iuReferenceValid(key))return 'Non classé';const [y,m]=key.split('-').map(Number);return iuMonthNames[m-1]+' '+y;}
function iuApplyReference(session,value){
 if(!session)return false;
 const old=session.referenceMonth;
 session.referenceMonth=iuReferenceValid(value)?value:null;
 if(!persistSessions()){session.referenceMonth=old;return false;}
 renderSessionsHistory();renderSessionControls();notifyInventoryProgressChanged();
 return true;
}
function iuReferenceSelector(session,extraLabel='Mois de référence'){
 const label=document.createElement('label');label.className='iu-reference-picker';
 const text=document.createElement('span');text.textContent=extraLabel;label.append(text);
 const select=document.createElement('select');select.className='iu-reference-select';
 select.setAttribute('aria-label',extraLabel);
 const empty=document.createElement('option');empty.value='';empty.textContent='À classer';select.append(empty);
 const base=new Date(session.startedAt);const currentYear=new Date().getFullYear();
 const years=new Set([base.getFullYear()-1,base.getFullYear(),base.getFullYear()+1,currentYear-1,currentYear,currentYear+1]);
 if(iuReferenceValid(session.referenceMonth))years.add(Number(session.referenceMonth.slice(0,4)));
 for(const y of [...years].sort((a,b)=>b-a))for(let m=12;m>=1;m--){
  const option=document.createElement('option');option.value=y+'-'+String(m).padStart(2,'0');option.textContent=iuMonthNames[m-1]+' '+y;select.append(option);
 }
 select.value=iuReferenceValid(session.referenceMonth)?session.referenceMonth:'';
 select.addEventListener('change',()=>iuApplyReference(session,select.value));
 label.append(select);return label;
}

function cleanSession(x){
  if(!x||typeof x!=='object'||!Number.isFinite(x.startedAt))return null;
  return {id:String(x.id||uid()).slice(0,90),startedAt:x.startedAt,referenceMonth:iuReferenceValid(x.referenceMonth)?x.referenceMonth:null,endedAt:Number.isFinite(x.endedAt)?x.endedAt:null,pausedAt:Number.isFinite(x.pausedAt)?x.pausedAt:null,pausedMs:Math.max(0,Number(x.pausedMs)||0),entries:Array.isArray(x.entries)?x.entries.map(cleanWeigh).filter(Boolean):[]};
}
const loadedSessions=readJSON(SESSION_KEY,{sessions:[],activeId:null});
let sessions=(Array.isArray(loadedSessions?.sessions)?loadedSessions.sessions:[]).map(cleanSession).filter(Boolean);
let activeSessionId=typeof loadedSessions?.activeId==='string'&&sessions.some(s=>s.id===loadedSessions.activeId&&!s.endedAt)?loadedSessions.activeId:null;
let activeGroup=null,lastGroup=null;
let entryMode=safeGet(MODE_KEY)==='g'?'g':'kg';
/* V40.62 — lecture du contexte de tare, sans modifier la logique métier.
   Une étiquette contient un poids NET, pas le brut attendu par le calcul. */
window.IUWeighScanContext=()=>{
 const basket=baskets.find(x=>x.id===document.getElementById('basketSelect')?.value);
 if(!basket||!Number.isFinite(basket.tare)||basket.tare<0)return null;
 return {tareGrams:basket.tare,basketName:basket.name,entryMode};
};
let maxGrossGrams=parseKg(safeGet(LIMIT_KEY)||'20.000')||20000;
let confirmDuplicates=safeGet(DUPLICATE_CONFIRM_KEY)!=='false';
let acceptedAnomalyKey='',sessionsExpanded=false;
// Une lecture OCR est une PROPOSITION. Elle ne peut être enregistrée
// automatiquement : l'utilisateur vérifie et valide depuis la pesée classique.
let scannerDraft=false;
function scannerDraftUI(){
 const banner=$('iuScannedDraftNotice');
 if(banner)banner.hidden=!scannerDraft;
}

// V39.58 — Ordre de consultation des bilans (sans modifier les données).
let iuInventorySort='recent';
let iuArchiveYear=new Date().getFullYear(),iuArchiveMonth='all',iuArchiveUnclassified=true;
function getActiveSession(){return sessions.find(s=>s.id===activeSessionId&&!s.endedAt)||null;}
/* V40.01 — Une seule lecture des pesées par calcul de statistiques.
   Les opérations restent exactement les mêmes en grammes entiers : aucune
   modification des formules, arrondis, groupes, durées ou sauvegardes. */
function activeStats(s){
  const count=s.entries.length;
  let gross=0,tare=0,min=Infinity,max=-Infinity;
  const groupMap=new Map();
  for(const e of s.entries){
    gross+=e.gross;
    tare+=e.tare;
    min=Math.min(min,e.net);
    max=Math.max(max,e.net);
    const id=e.groupId||e.id;
    groupMap.set(id,(groupMap.get(id)||0)+1);
  }
  let multi=0;
  for(const n of groupMap.values())if(n>1)multi++;
  const net=gross-tare;
  const duration=Math.max(0,(s.endedAt||Date.now())-s.startedAt-(s.pausedMs||0)-(s.pausedAt?(s.endedAt||Date.now())-s.pausedAt:0));
  return {count,gross,tare,net,duration,groups:groupMap.size,multi,min:count?min:0,max:count?max:0,average:count?Math.round(net/count):0};
}
function durationLabel(ms){const sec=Math.floor(Math.max(0,ms)/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h} h ${String(m).padStart(2,'0')} min`:`${m} min ${String(s).padStart(2,'0')} s`;}
const dateLabel=t=>new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function persistSessions(){try{safeSetItem(SESSION_KEY,JSON.stringify({sessions,activeId:activeSessionId}));return true;}catch{const el=$('sessionMessage');if(el)el.textContent='⚠️ Espace local insuffisant : exporte tes données pour éviter toute perte.';return false;}}
// Ne pas reconstruire le calendrier pendant l'animation Concentration
// ni à chaque pesée : informer le planning seulement lors d'une clôture,
// restauration ou suppression effective de bilan.
function notifyInventoryProgressChanged(){
 window.setTimeout(()=>window.dispatchEvent(new Event('iu-inventory-progress-changed')),250);
}
function parseWeight(value){if(entryMode==='kg')return parseKg(value);const s=String(value).trim();return /^\d{1,9}$/.test(s)?Number(s):null;}
function weightFromGrams(g){return entryMode==='g'?String(g):fmt(g);}
function issueFor(gross,b){if(gross>maxGrossGrams)return `Poids brut inhabituel (${fmt(gross)} kg). Vérifie la balance.`;
  if(confirmDuplicates&&currentWeighId===null){const prev=history[0];if(prev&&prev.gross===gross&&prev.tare===b.tare&&Date.now()-prev.at<120000)return 'Ce poids et cette tare sont identiques à la pesée précédente. Vérifie qu’il ne s’agit pas d’un doublon.';}
  return '';
}
function anomalyKey(gross,b){return `${b.id}:${gross}`;}
function warningForCurrent(){const gross=parseWeight($('grossWeight').value),b=baskets.find(b=>b.id===$('basketSelect').value);if(gross===null||!b)return '';return issueFor(gross,b);}
function renderWarning(){const message=warningForCurrent(),gross=parseWeight($('grossWeight').value),b=baskets.find(b=>b.id===$('basketSelect').value);const accepted=message&&b&&acceptedAnomalyKey===anomalyKey(gross,b);$('weighWarning').hidden=!message||Boolean(accepted);$('weighWarningText').textContent=message;return Boolean(message&&!accepted);}
function calculate(){
 const previousNetText=$('netDisplay').textContent;
 const raw=$('grossWeight').value.trim(),gross=raw?parseWeight(raw):null,b=baskets.find(x=>x.id===$('basketSelect').value);
 netGrams=null;$('grossDisplay').textContent=gross===null?'— kg':`${fmt(gross)} kg`;$('tareDisplay').textContent=b?`${fmt(b.tare)} kg`:'— kg';$('errorMessage').textContent='';$('netDisplay').textContent='—';$('resultHint').textContent='Renseigne le poids pour calculer le net.';$('copyBtn').disabled=true;
 if(!raw||!b){renderWarning();refreshActionButtons();return;}
 if(gross===null){$('errorMessage').textContent=entryMode==='g'?'Saisis des grammes entiers, par exemple 1250.':'Saisis un poids avec au maximum 3 décimales (ex. 1.230).';renderWarning();refreshActionButtons();return;}
 // En mode essai, le poids NET peut être négatif si la tare est plus lourde.
 // Le poids BRUT, lui, reste un nombre positif (poids de l'étiquette).
 netGrams=gross-b.tare;
 const nextNetText=fmt(netGrams),netElement=$('netDisplay');
 netElement.textContent=nextNetText;
 if(previousNetText!==nextNetText){
  netElement.classList.remove('net-value-updated');
  void netElement.offsetWidth;
  netElement.classList.add('net-value-updated');
 }
 $('resultHint').textContent=netGrams<0?'Mode essai : poids net négatif autorisé.':'Prêt à reporter.';
 const blocked=renderWarning();$('copyBtn').disabled=blocked;refreshActionButtons();
}
function refreshActionButtons(){
 // Ne pas reconstruire le libellé à chaque frappe dans le poids brut.
 const resetLabel=$('resetBtn').querySelector('span');
 if(resetLabel&&resetLabel.innerHTML!=='Nouvelle<br>pesée')resetLabel.innerHTML='Nouvelle<br>pesée';
}
// V36.63 — Pas de scroll forcé pendant la saisie.
// Le correctif 36.62 surveillait le scroll puis appelait window.scrollBy,
// provoquant des compensations concurrentes de l'ancrage clavier Safari.
// La mise en page conserve désormais assez de hauteur sous le calcul.
function saveCurrentWeigh(){
 // Même le minuteur, la suspension de Safari et les changements de panier
 // ne doivent jamais enregistrer silencieusement une valeur issue du scanner.
 if(scannerDraft)return false;
 clearTimeout(autoSaveTimer);autoSaveTimer=null;
 const b=baskets.find(x=>x.id===$('basketSelect').value),gross=parseWeight($('grossWeight').value);
 if(!b||gross===null)return false;
 if(renderWarning()){$('weighStatus').textContent='⚠️ Confirme cette valeur avant son enregistrement.';return false;}
 const previous=history.find(x=>x.id===currentWeighId);
 if(previous&&previous.gross===gross&&previous.tare===b.tare&&previous.name===b.name)return true;
 const entry={id:currentWeighId||uid(),at:Date.now(),name:b.name,tare:b.tare,gross,net:gross-b.tare,source:'classique'};
 const newHistory=[entry,...history.filter(x=>x.id!==entry.id)].slice(0,15);
 const session=getActiveSession();
 const trackSession=session&&!session.pausedAt;
 let newEntries=null;
 if(trackSession){
  const existing=session.entries.findIndex(x=>x.id===entry.id);
  const rec={...entry,groupId:entry.id};
  newEntries=session.entries.slice();
  if(existing>=0)newEntries[existing]=rec;else newEntries.push(rec);
 }
 // Ne confirmer la pesée que lorsque les écritures locales ont réussi.
 // En cas de refus du stockage, garder les données en mémoire telles qu'avant.
 try{
  const oldHistory=localStorage.getItem(HISTORY_KEY);
  const oldSessions=trackSession?localStorage.getItem(SESSION_KEY):null;
  try{
   if(trackSession)safeSetItem(SESSION_KEY,JSON.stringify({sessions:sessions.map(s=>s===session?{...s,entries:newEntries}:s),activeId:activeSessionId}));
   safeSetItem(HISTORY_KEY,JSON.stringify(newHistory));
  }catch(error){
   // Restaurer la clé session si l'écriture de l'historique a échoué.
   if(trackSession){try{if(oldSessions===null)localStorage.removeItem(SESSION_KEY);else safeSetItem(SESSION_KEY,oldSessions);}catch{}}
   // L'historique n'est normalement pas touché si setItem a échoué.
   // Revenir à l'ancienne valeur par précaution si besoin.
   try{if(oldHistory===null)localStorage.removeItem(HISTORY_KEY);else safeSetItem(HISTORY_KEY,oldHistory);}catch{}
   throw error;
  }
 }catch{
  $('weighStatus').textContent='⚠️ Pesée non enregistrée : stockage indisponible. Vérifie l’espace libre et exporte tes données.';
  return false;
 }
 history=newHistory;
 if(trackSession)session.entries=newEntries;
 currentWeighId=entry.id;
 renderHistory();
 if(trackSession)renderLiveSessionStats();
 if($('backupCard').open)renderBackupSummary();
 // Même structure et mêmes classes que le bloc « Inventaire terminé ».
 const status=$('weighStatus');
 status.classList.add('v22-message','is-complete');
 const content=document.createElement('span');
 content.className='session-complete-copy';
 const title=document.createElement('strong');
 title.className='session-complete-title';
 title.textContent='Pesée enregistrée automatiquement';
 content.append(title);
 status.replaceChildren(content);
 animateConfirmation();
 return true;
}
function clearWeighSavedStyle(){
 const status=$('weighStatus');
 status.classList.remove('v22-message','is-complete');
}
function scheduleAutoSave(){
 clearTimeout(autoSaveTimer);autoSaveTimer=null;
 clearWeighSavedStyle();
 if(scannerDraft){
  // La confirmation est maintenant dans la carte résultat : aucun
  // second message explicatif sous celle-ci.
  $('weighStatus').textContent='';
  scannerDraftUI();return;
 }
 $('weighStatus').textContent='';
 if(netGrams!==null&&!renderWarning())autoSaveTimer=setTimeout(saveCurrentWeigh,1100);
}
function flushPending(){
 if(scannerDraft){
  $('weighStatus').textContent='Vérifie puis valide le poids détecté avant de passer à la pesée suivante.';
  return false;
 }
 if(autoSaveTimer!==null)return saveCurrentWeigh();if(netGrams!==null&&renderWarning()){$('weighStatus').textContent='⚠️ Confirme cette pesée avant de continuer.';return false;}
 // Si une valeur valide a été saisie mais que le délai n'est pas encore passé.
 if(netGrams!==null&&!currentWeighId)return saveCurrentWeigh();
 if(netGrams!==null&&currentWeighId){const prior=history.find(x=>x.id===currentWeighId),gross=parseWeight($('grossWeight').value),b=baskets.find(x=>x.id===$('basketSelect').value);if(!prior||gross!==prior.gross||b?.tare!==prior.tare)return saveCurrentWeigh();}
 return true;
}
function clearWeigh(keepSuccess=false){
 clearTimeout(autoSaveTimer);autoSaveTimer=null;scannerDraft=false;scannerDraftUI();
 currentWeighId=null;acceptedAnomalyKey='';
 $('grossWeight').value='';
 if(!keepSuccess){
  clearWeighSavedStyle();
  $('weighStatus').textContent='';
 }
 calculate();
}

// Selon le fonctionnement demandé pour la pesée de rayon, le poids lu sur
// l'étiquette est saisi TEL QUEL comme poids BRUT. La tare est ensuite
// soustraite uniquement par calculate(), comme en saisie manuelle.
// Le statut de brouillon empêche toute sauvegarde avant validation humaine.
window.IUWeighScanDraft=labelGrams=>{
 if(!Number.isSafeInteger(labelGrams)||labelGrams<=0||labelGrams>30000)return false;
 const state=window.IUWeighScanContext();
 if(!state||!Number.isSafeInteger(state.tareGrams)||state.tareGrams<0)return false;
 const grossGrams=labelGrams;
 if(!Number.isSafeInteger(grossGrams)||grossGrams>999999)return false;
 // Une pesée précédente doit être enregistrée avant d'être remplacée.
 // Un brouillon OCR déjà présent peut simplement être remplacé.
 if(!scannerDraft&&$('grossWeight').value.trim()){
  if(!flushPending())return false;
  clearWeigh();
 }
 scannerDraft=true;
 clearTimeout(autoSaveTimer);autoSaveTimer=null;
 $('grossWeight').value=state.entryMode==='g'?String(grossGrams):fmt(grossGrams);
 $('grossWeight').dispatchEvent(new Event('input',{bubbles:true}));
 scannerDraftUI();
 return true;
};
// Préparer la pesée suivante sans fermer la caméra ni ouvrir le clavier.
window.IUWeighScanPrepareNext=()=>{
 if(scannerDraft)return false;
 if(!$('grossWeight').value.trim())return true;
 if(!flushPending()||!currentWeighId)return false;
 clearWeigh();
 return true;
};
// V36.59 — Sur Safari iOS, focus() sans option force parfois un scroll
// lorsque le clavier numérique est déjà affiché. Garder le focus existant
// et ne jamais demander à Safari de recentrer la page pour une nouvelle pesée.
function focusGrossWithoutScroll(){
 const field=$('grossWeight');
 if(!field||document.activeElement===field)return;
 field.focus({preventScroll:true});
}
// « Nouvelle pesée » devient une validation explicite du brut reconnu :
 // la sauvegarde est réalisée avant l'effacement, comme en saisie manuelle.
function commitScannerDraft(){
 if(!scannerDraft)return true;
 if(netGrams===null){
  clearWeighSavedStyle();
  $('weighStatus').textContent='Corrige le poids reconnu avant de continuer.';
  return false;
 }
 if(renderWarning()){
  clearWeighSavedStyle();
  $('weighStatus').textContent='Confirme d’abord l’avertissement avant la nouvelle pesée.';
  return false;
 }
 scannerDraft=false;scannerDraftUI();
 if(!saveCurrentWeigh()){
  scannerDraft=true;scannerDraftUI();
  return false;
 }
 window.dispatchEvent(new Event('iu-weigh-scan-saved'));
 return true;
}
function newWeigh(){
 const overlay=$('iuWeighScanOverlay');
 const scannerOpen=Boolean(overlay&&!overlay.hidden);
 let hadWeight=Boolean($('grossWeight').value.trim());
 if(scannerDraft){
  if(!commitScannerDraft())return;
 }else{
  if(!flushPending())return;
  if(netGrams===null&&hadWeight){
   clearWeighSavedStyle();
   $('weighStatus').textContent='Corrige cette saisie ou efface-la manuellement.';return;
  }
 }
 if(hadWeight)clearWeigh(true);
 if(scannerOpen){
  // Même flux vidéo, worker OCR et mise au point : pas de relance caméra.
  window.dispatchEvent(new Event('iu-weigh-scan-next'));
 }else{
  focusGrossWithoutScroll();
 }
}
function beginGroup(){return false;}
function finishGroup(){return true;}
function removeGroupEntry(id){return false;}
function groupSum(g){return 0;}
// Mise à jour légère du HUD, sans retraitement des historiques.
function islandDurationLabel(ms){const minutes=Math.floor(Math.max(0,ms)/60000),h=Math.floor(minutes/60),m=minutes%60;return h?`${h} h ${String(m).padStart(2,'0')}`:`${m} min`;}
// V37.41 — Indicateurs alimentés par les sessions enregistrées.
function heroTimePerWeigh(stats){
 if(!stats||!stats.count||!stats.duration)return '—';
 const secs=Math.max(0,Math.round(stats.duration/1000/stats.count));
 const h=Math.floor(secs/3600),m=Math.floor(secs%3600/60),x=secs%60;
 return (h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0');
}
function latestFinishedInventory(){let latest=null;for(const s of sessions){if(Number.isFinite(s.endedAt)&&(!latest||s.endedAt>latest.endedAt))latest=s;}return latest;}
function heroSetText(id,val){const el=$(id);if(el&&el.textContent!==String(val))el.textContent=String(val);}
function renderHeroSummary(precomputedStats=null){
 const root=document.querySelector('.app > section.intro'),status=$('heroStatus'),text=$('heroStatusText');
 if(!root||!status||!text)return;
 const session=getActiveSession(),last=latestFinishedInventory();
 // Sans session active, toujours afficher la prochaine date, même juste après un bilan.
 // V39.51 : les sessions en pause conservent l'accueil standard.
 const state=session&&!session.pausedAt?'running':'before';
 const stats=session?(precomputedStats||activeStats(session)):last?activeStats(last):null;
 const count=stats?.count||0,avg=heroTimePerWeigh(stats);
 const raw=$('calendarNextDate')?.textContent?.trim()||'';
 const nextDate=raw&&!/chargement|confirmer/i.test(raw)?raw:'Date à confirmer';
 const countdown=$('calendarNextCountdown');
 const dateCaption=countdown&&!countdown.hidden&&countdown.textContent.trim()?countdown.textContent.trim():'Selon votre planning';
 let fields;
 if(state==='running')fields=['SUIVI EN TEMPS RÉEL','Inventaire en cours','Votre session est enregistrée automatiquement.',durationLabel(stats.duration),'Durée active','Pesées enregistrées',String(count),'Temps / pesée',avg,'Revenir à ma session','pauseSession','En cours'];

 else fields=['PROCHAIN INVENTAIRE','','',nextDate,dateCaption,'Dernier inventaire',last?String(count)+' pesées':'—','Temps moyen / pesée',last?avg:'—',last?'Consulter le dernier bilan':'Aller à Ma session',last?'sessionsHistoryList':'startSession','Prêt'];
 if(root.dataset.introState!==state)root.dataset.introState=state;
 status.classList.toggle('is-running',state==='running');
 status.classList.toggle('is-paused',state==='paused');
 status.classList.remove('is-finished');
 heroSetText('heroStatusText',fields[11]);
 const statusMessage=state==='running'?'Pesées enregistrées automatiquement':state==='paused'?'Pesées conservées · Reprise disponible':nextDate==='Date à confirmer'?'Date à définir dans Événements':'Prochaine échéance dans votre planning';
 heroSetText('introStatusMessage',statusMessage);
 const ids=['introSmartEyebrow','introSmartHeading','introSmartDescription','introSmartPrimary','introSmartPrimaryCaption','introSmartStat1Label','introSmartStat1','introSmartStat2Label','introSmartStat2','heroActionLabel'];
 ids.forEach((id,i)=>heroSetText(id,fields[i]));
 const trigger=$('heroStartSession');
 if(trigger){
  if(trigger.disabled)trigger.disabled=false;
  if(trigger.getAttribute('aria-disabled')!=='false')trigger.setAttribute('aria-disabled','false');
  if(trigger.getAttribute('aria-controls')!==fields[10])trigger.setAttribute('aria-controls',fields[10]);
  const label=fields[9]+' — '+fields[11];
  if(trigger.getAttribute('aria-label')!==label)trigger.setAttribute('aria-label',label);
 }
}

// V33.65 — transition verticale par carte : l'accueil descend du bas vers
// le haut pendant que Concentration remonte. La banderole et l'en-tête ne
// se déplacent pas. Le mouvement inverse accompagne Pause et Terminer.
// Le navigateur conserve les instantanes pendant le changement d'interface :
// aucun formulaire ni aucune pesée n'est duplique dans le DOM.
let focusWasActive=false;
let focusInitialized=false;
let focusMotionBusy=false;
// V39.85 : distance restante du swipe, transmise au moteur de Retour.
let iuSwipeReturnOffset=0;
let focusPendingTask=null;
/* V39.52 — Position de l'accueil au moment d'entrer en Concentration.
   Variable distincte des pages Admin/Compte pour éviter les collisions. */
let iuFocusHomeScrollY=0;
function iuRestoreFocusHomeScroll(){
 const y=Math.max(0,iuFocusHomeScrollY);
 const root=document.scrollingElement||document.documentElement;
 if(root)root.scrollTop=y;
 window.scrollTo({top:y,left:0,behavior:'instant'});
 // Safari peut recalculer la hauteur après la réapparition des cartes.
 requestAnimationFrame(()=>{
  if(document.body.classList.contains('is-focus-mode'))return;
  const limit=Math.max(0,(root?.scrollHeight||0)-window.innerHeight);
  const target=Math.min(y,limit);
  if(Math.abs((window.scrollY||0)-target)>2)window.scrollTo({top:target,left:0,behavior:'instant'});
 });
}
/* V38.58 — Conserver la position exacte de l'accueil lors des navigations
   vers Admin, Mon compte, Evénements et Alertes. Pas de stockage persistant :
   un rechargement continue de démarrer en haut, comme auparavant. */
let iuSavedHomeScrollY=0;
function iuRestoreHomeScroll(){
 const y=Math.max(0,iuSavedHomeScrollY);
 const scroller=document.scrollingElement||document.documentElement;
 if(scroller)scroller.scrollTop=y;
 window.scrollTo({top:y,left:0,behavior:'instant'});
 // Safari peut appliquer son changement de hauteur de document à la
 // frame suivante. Corriger seulement une éventuelle position écrêtée,
 // pendant que l'ancienne page est encore recouverte par le masque.
 requestAnimationFrame(()=>{
  if(document.body.classList.contains('is-admin-mode')||
     document.body.classList.contains('is-account-mode')||
     document.body.classList.contains('is-events-mode')||
     document.body.classList.contains('is-alerts-mode'))return;
  if(Math.abs((window.scrollY||0)-y)>2)window.scrollTo({top:y,left:0,behavior:'instant'});
 });
}
const focusReducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const focusStaticSelectors='.app > .header, .app > .intro';
const focusNormalSelectors='.app > .card, .app > .inventory-calendar, .app > footer';
const focusViewSelectors='.app > .focus-toolbar, .app > .calc-card';
const focusSurfaceSelectors='.app > .focus-transition-surface';
const focusVisible=node=>{
 if(!node||node.hidden)return false;
 const style=getComputedStyle(node),r=node.getBoundingClientRect();
 return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;
};
function focusTagViews(entering,phase,tagged,config={}){
 const normalSelectors=config.normalSelectors||focusNormalSelectors;
 const viewSelectors=config.viewSelectors||focusViewSelectors;
 const surfaceSelectors=config.surfaceSelectors||focusSurfaceSelectors;
 const normal=(entering&&phase==='old')||(!entering&&phase==='new');
 if(normal){
  // L'ordre commence au bloc le plus bas : il sort en premier.
  // Seuls les blocs a l'ecran sont captures (les autres restent intacts).
  const cards=[...document.querySelectorAll(normalSelectors)]
   .filter(focusVisible).sort((a,b)=>b.getBoundingClientRect().top-a.getBoundingClientRect().top).slice(0,12);
  for(const [i,el] of cards.entries()){
   el.style.viewTransitionName=`iu-normal-${i}`;
   tagged.add(el);
  }
  // En-tete et banderole : aucune translation, seulement une disparition
  // ou une apparition douce, depuis leur position fixe a l'ecran.
  const anchors=[...document.querySelectorAll(focusStaticSelectors)].filter(focusVisible);
  for(const [i,el] of anchors.entries()){
   el.style.viewTransitionName=`iu-anchor-${i}`;
   tagged.add(el);
  }
 }else{
  // Dans le mode concentre, le bandeau et la pesée arrivent ensemble
  // depuis le bas ; la pesée suit le bandeau de quelques millisecondes.
  const surface=document.querySelector(surfaceSelectors);
  if(focusVisible(surface)){
   surface.style.viewTransitionName='iu-focus-surface';
   tagged.add(surface);
  }
  const focus=[...document.querySelectorAll(viewSelectors)].filter(focusVisible);
  for(const [i,el] of focus.entries()){
   el.style.viewTransitionName=`iu-focus-${i}`;
   tagged.add(el);
  }
 }
}
/* V33.70 — Safari iPhone: à la SORTIE seulement, animer les vrais éléments
   à leurs coordonnées réelles plutôt que les snapshots View Transitions.
   Ces snapshots pouvaient prendre la largeur de l'état Concentration et
   déplacer tout l'accueil vers la droite. Durée/courbe/flou INCHANGÉS. */
/* V36.86 — Copie VISUELLE des styles calculés avant la sortie.
   Le moteur « Quitter » clone ses cartes dans une surface fixe. Sur
   Compte/Admin, ces cartes dépendent de sélecteurs liés à leur parent :
   reproduire les valeurs calculées empêche les énormes icônes SVG et
   les cartes déstructurées, sans reconstituer ni modifier leurs données. */
const iuExitVisualProperties=[
 'display','box-sizing','position','inset','top','right','bottom','left',
 'flex','flex-grow','flex-shrink','flex-basis','flex-direction','flex-wrap',
 'align-items','align-self','align-content','justify-content','gap',
 'row-gap','column-gap','grid-template-columns','grid-template-rows',
 'grid-auto-flow','grid-column','grid-row','order',
 'width','height','min-width','max-width','min-height','max-height',
 'margin','padding','overflow','overflow-x','overflow-y',
 'border','border-width','border-style','border-color','border-radius',
 'background','background-color','background-image','background-size',
 'background-position','background-repeat','box-shadow',
 'color','font-family','font-size','font-weight','font-style',
 'line-height','letter-spacing','text-align','text-transform',
 'text-decoration','white-space','word-break','overflow-wrap',
 'text-overflow','vertical-align','opacity','visibility',
 'object-fit','object-position','fill','stroke','stroke-width',
 'stroke-linecap','stroke-linejoin','stroke-dasharray',
 'filter','clip-path','aspect-ratio','align-self','place-items'
];
function iuPreserveExitVisual(source,copy){
 const orig=[source,...source.querySelectorAll('*')];
 const cloned=[copy,...copy.querySelectorAll('*')];
 // Toutes les lectures sont regroupées avant toute écriture : aucune
 // alternance lecture/écriture pendant le départ de l'animation Safari.
 const captures=orig.map((el,i)=>{
  const style=getComputedStyle(el);
  const props=iuExitVisualProperties
   .filter(p=>i!==0||!['opacity','filter'].includes(p))
   .map(p=>[p,style.getPropertyValue(p)])
   .filter(pair=>Boolean(pair[1]));
  const media=/^(svg|img|video|canvas)$/i.test(el.tagName);
  const rect=media?el.getBoundingClientRect():null;
  return {props,rect,tag:el.tagName};
 });
 for(let i=0;i<captures.length&&i<cloned.length;i++){
  const {props,rect,tag}=captures[i],el=cloned[i];
  for(const [prop,value] of props)el.style.setProperty(prop,value,'important');
  // Une icône dépendant d'un parent ne doit jamais se dilater quand elle
  // entre dans la couche fixe de l'animation.
  if(rect&&rect.width>0&&rect.height>0){
   el.style.setProperty('width',rect.width+'px','important');
   el.style.setProperty('height',rect.height+'px','important');
  }
  if(tag?.toLowerCase()==='canvas'){
   try{el.getContext('2d')?.drawImage(orig[i],0,0);}catch{}
  }
 }
}
function exitFocusWithoutSnapshot(action,config={}){
 // V38.58 : transitions des pages autonomes sans filtre sur .app,
 // qui provoquait une recomposition des verres floutés dans Safari iOS.
 const standaloneReturn=Boolean(config.solidDuringMotion);
 const swipeExitX=standaloneReturn?Math.max(0,iuSwipeReturnOffset):0;
 iuSwipeReturnOffset=0;
 const focusReturn=!standaloneReturn;
 const duration=610;
 const easing='cubic-bezier(.16,.84,.24,1)';
 const app=document.querySelector('.app');
 const source=[...document.querySelectorAll(config.exitSourceSelectors||focusViewSelectors)].filter(focusVisible);
 const surface=document.querySelector(config.surfaceSelectors||focusSurfaceSelectors);
 const layer=document.createElement('div');
 layer.className='iu70-exit-overlay';
 layer.setAttribute('aria-hidden','true');
 // Le clone est limité à la largeur physique du viewport : aucune
 // capture d'une autre largeur ne peut décaler l'accueil.
 for(const node of source){
  const rect=node.getBoundingClientRect();
  const computed=getComputedStyle(node);
  const clone=node.cloneNode(true);
  if(config.preservePageCloneStyles)iuPreserveExitVisual(node,clone);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(child=>child.removeAttribute('id'));
  clone.querySelectorAll('input,button,select,textarea').forEach(el=>el.setAttribute('tabindex','-1'));
  // V38.75 — Si la page a été défilée, sa carte dépasse le viewport.
  // Animer directement toute la copie faisait entrer à l'écran les éléments
  // situés AU-DESSUS de la zone visible au fur et à mesure de la descente.
  // La copie reste à ses coordonnées originelles mais est enfermée dans
  // un cadre à la taille exacte de l'intersection avec le viewport.
  // On anime ce cadre, jamais le contenu caché à l'extérieur.
  let cloneHost=layer,clipLeft=0,clipTop=0;
  if(standaloneReturn){
   const viewW=Math.max(1,window.innerWidth),viewH=Math.max(1,window.innerHeight);
   const left=Math.max(0,rect.left),top=Math.max(0,rect.top);
   const right=Math.min(viewW,rect.right),bottom=Math.min(viewH,rect.bottom);
   if(right<=left||bottom<=top)continue;
   clipLeft=left;clipTop=top;
   const crop=document.createElement('div');
   crop.className='iu70-exit-visible-crop';
   crop.style.setProperty('position','absolute','important');
   crop.style.setProperty('left',left+'px','important');
   crop.style.setProperty('top',top+'px','important');
   crop.style.setProperty('width',(right-left)+'px','important');
   crop.style.setProperty('height',(bottom-top)+'px','important');
   crop.style.setProperty('overflow','hidden','important');
   crop.style.setProperty('box-sizing','border-box','important');
   crop.style.setProperty('pointer-events','none','important');
   layer.append(crop);
   cloneHost=crop;
  }
  clone.style.setProperty('position','absolute','important');
  clone.style.setProperty('display',
   config.preservePageCloneStyles?getComputedStyle(node).display:'block',
   'important');
  clone.style.setProperty('left',(rect.left-clipLeft)+'px','important');
  clone.style.setProperty('top',(rect.top-clipTop)+'px','important');
  clone.style.setProperty('width',rect.width+'px','important');
  clone.style.setProperty('height',rect.height+'px','important');
  clone.style.setProperty('max-width','none','important');
  clone.style.setProperty('margin','0','important');
  clone.style.setProperty('box-sizing','border-box','important');
  // Les éléments quittant Mon compte/Administrateur sont déjà stylés
  // intégralement ; le parent du clone n'existe plus dans l'overlay.
  clone.style.setProperty('background',computed.background,'important');
  clone.style.setProperty('box-shadow',computed.boxShadow,'important');
  clone.style.setProperty('border',computed.border,'important');
  clone.style.setProperty('border-radius',computed.borderRadius,'important');
  clone.style.setProperty('opacity','1','important');
  cloneHost.append(clone);
 }
 // La surface pleine-écran reprend le fond opaque déjà existant.
 const cover=document.createElement('div');
 cover.className='iu70-exit-cover';
 layer.prepend(cover);
 document.body.append(layer);
 focusMotionBusy=true;
 // La réapparition du bandeau relançait iuWelcomeEnter (translation 9px),
 // alors que cette fonction anime déjà tout le retour. Le bloquer AVANT
 // de démasquer l'accueil évite le saut, même après l'animation de sortie.
 document.body.classList.add('iu-home-return-stable');
 // Le nouvel accueil est mis en page sans translation de son bandeau.
 action();
 // Restaurer le défilement sous la surface de sortie, avant la révélation.
 if(focusReturn&&!document.body.classList.contains('is-focus-mode'))
  iuRestoreFocusHomeScroll();
 // Retour en cascade comme à l'ouverture PWA : de haut en bas.
 // La descente du mode Concentration et son flou restent inchangés.
 const tiles=[...document.querySelectorAll(config.normalSelectors||focusNormalSelectors)]
  .filter(focusVisible)
  .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
 const anchors=[...document.querySelectorAll(focusStaticSelectors)].filter(focusVisible);
 const animations=[];
 const animate=(el,frames,opts={})=>{
  if(!el)return;
  animations.push(el.animate(frames,{duration,easing,fill:'both',...opts}));
 };
 animate(cover,[{transform:'translate3d(0,0,0)'},{transform:'translate3d(0,105dvh,0)'}]);
 // Pour une page autonome, les enfants des cadres sont immobiles :
 // seul le crop visible descend, avec le même flou et le même rythme.
 for(const clone of [...layer.children].filter(el=>el!==cover)){
  animate(clone,[
   {offset:0,transform:'translate3d(0,0,0)',filter:'blur(0px)',opacity:1},
   {offset:.12,filter:'blur(0px)',opacity:1},
   {offset:.60,filter:'blur(1.7px)',opacity:1},
   {offset:1,transform:swipeExitX?'translate3d('+Math.max(0,window.innerWidth-swipeExitX)+'px,105dvh,0)':'translate3d(0,105dvh,0)',filter:'blur(3.2px)',opacity:1}
  ]);
 }
 // V33.73 : flouter TOUT l'accueil, sous la surface opaque qui descend.
 // Dans V33.71/72, les tuiles devenaient nettes avant d'être découvertes
 // par le panneau. Le filtre doit donc durer plus longtemps que sa révélation.
 // Un seul compositing layer pour le bandeau ET les cartes évite les écarts.
 const previousAppFilter=app.style.filter;
 const previousAppWillChange=app.style.willChange;
 let homeBlurSheet=null;
 if(standaloneReturn||focusReturn){
  // La feuille de flou fixe évite de re-composer le verre de Bienvenue
  // au passage pause / fin d'inventaire sur Safari iPhone.
  homeBlurSheet=document.createElement('div');
  homeBlurSheet.className='iu-home-return-blur-sheet';
  homeBlurSheet.setAttribute('aria-hidden','true');
  document.body.append(homeBlurSheet);
  animate(homeBlurSheet,[
   {offset:0,opacity:1},
   {offset:.30,opacity:.88},
   {offset:1,opacity:0}
  ],{duration:620,easing:'ease-out'});
 }else{
  // Mode Concentration inchangé : son flou historique est conservé.
  app.style.filter='blur(3.2px)';
  app.style.willChange='filter';
  void app.offsetWidth;
  const homeBlur=app.animate([
   {offset:0,filter:'blur(3.2px)'},
   {offset:.28,filter:'blur(3.0px)'},
   {offset:1,filter:'blur(0px)'}
  ],{duration:450,easing:'ease-out',fill:'forwards'});
  animations.push(homeBlur);
 }
 for(const [index,tile] of tiles.entries()){
  // V38.58 — Retour depuis les pages : les cartes partent moins bas
  // (14dvh au lieu de 30dvh). Vitesse et délai inchangés.
  // Le retour de Concentration garde sa trajectoire originale.
  animate(tile,[
   {transform:standaloneReturn?'translate3d(0,14dvh,0)':'translate3d(0,30dvh,0)',opacity:1},
   {transform:'translate3d(0,0,0)',opacity:1}
  ],{
   duration:720,
   delay:index*70,
   easing:'cubic-bezier(.18,.82,.24,1)'
  });
 }
 for(const anchor of anchors){
  // En retour d'une page, Bienvenue reste immobile et entièrement opaque.
  // Le masque coulissant et le flou externe suffisent à sa révélation.
  if((standaloneReturn||focusReturn)&&anchor.classList.contains('intro'))continue;
  // V33.74 : l'en-tête et la banderole restent visibles dès le début,
  // avec un simple renforcement progressif de l'opacité au lieu d'un
  // passage brutal de 0% à 100%.
  animate(anchor,[
   {offset:0,opacity:.72},
   {offset:.45,opacity:.9},
   {offset:1,opacity:1}
  ],{easing:'linear'});
 }
 const cleanup=()=>{
  animations.forEach(anim=>anim.cancel());
  if(standaloneReturn||focusReturn){
   homeBlurSheet?.remove();
  }else{
   app.style.filter=previousAppFilter;
   app.style.willChange=previousAppWillChange;
  }
  layer.remove();
  focusMotionBusy=false;
  const pending=focusPendingTask;
  focusPendingTask=null;
  if(pending)requestAnimationFrame(pending);
 };
 Promise.all(animations.map(anim=>anim.finished.catch(()=>{}))).then(cleanup,cleanup);
 if(!animations.length)cleanup();
}
/* V36.80 — Pages Compte/Administration : une navigation SANS CLONAGE.
   Le cloneNode de la sortie Concentration est adapté aux petites cartes
   d'inventaire, pas aux panneaux compte/admin : une copie hors de sa carte
   perd les sélecteurs CSS, grossit les SVG et affiche l'ancien accueil.
   La page réelle reste montée/opaque jusqu'à la FIN de sa fermeture.
   Le bouton Retour n'est jamais translaté. */
/* V36.82 — Reproduction complète du mouvement Concentration sans clone.
   Deux mouvements simultanés : les cartes d'accueil descendent quand la
   page arrive, puis elles remontent pendant que la page repart. Le fond
   reste opaque et les vraies cartes conservent leur CSS/SVG sur iOS. */
/* V36.85 — Même moteur de snapshots PAR CARTE que Concentration.
   Ne jamais translater la capture root : elle comporte parfois de grands
   vides après la mise en page iOS, d'où la bande blanche des vidéos.
   Utiliser exactement les groupes iu-normal-N, iu-focus-N et la surface
   opaque iu-focus-surface, déjà éprouvés dans le mode Concentration.
   Aucun clone du DOM, aucune copie des photos ni des SVG. */
/* V38.75 — Entrée native des pages autonomes.
   Le bandeau Retour et la page sont de VRAIS éléments animés ; éviter
   la couche ::view-transition du navigateur qui capturait le bandeau,
   interceptait le premier toucher et retardait les demandes de fermeture. */
let iuCancelStandaloneEntry=null;

/* V38.75 — Entrée couplée Alertes/Événements : un seul animateur pour les
   deux surfaces, y compris à leur première apparition sur Safari. */
/* V39.89 — Entrée liée : le bandeau et les surfaces de page restent
   deux éléments distincts, mais reçoivent exactement la même translation
   sur chaque frame. Aucun relais CSS/WAAPI en fin de trajectoire. */
function iuAnimateCoupledSubpage(action,config){
 const bar=$('iuSubpageBar');
 if(!bar){action();return;}
 focusMotionBusy=true;
 let frame=0,timer=null,done=false;
 let nativeAnimations=[];
 const initialY=Math.ceil(Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,600)*1.05);
 const panels=[];
 const nodes=[bar];
 const styleBefore=new Map();
 const move=y=>{
  const translate='0 '+Math.max(0,y).toFixed(2)+'px';
  nodes.forEach(el=>el.style.setProperty('translate',translate,'important'));
 };
 const ease=t=>{
  let lo=0,hi=1;
  for(let i=0;i<13;i++){
   const u=(lo+hi)/2,k=1-u;
   const x=3*.16*k*k*u+3*.24*k*u*u+u*u*u;
   if(x<t)lo=u;else hi=u;
  }
  const u=(lo+hi)/2,k=1-u;
  return 3*.84*k*k*u+3*k*u*u+u*u*u;
 };
 const finish=()=>{
  if(done)return;
  done=true;
  cancelAnimationFrame(frame);
  if(timer!==null)clearTimeout(timer);
  // Relâcher tous les joueurs pour éviter des calques persistants.
  // La position finale est immédiatement verrouillée ci-dessous.
  for(const anim of nativeAnimations)anim.cancel();
  nativeAnimations=[];
  // Fixer l'ultime image AVANT d'ôter le mode d'entrée.
  move(0);
  document.body.classList.remove('iu-coupled-rise','iu-subpage-entering','iu-alerts-rise-running');
  // Le bandeau reste exactement en place après l'entrée. Sa transition
  // de compactage au vrai scroll redevient disponible.
  for(const el of nodes){
   el.style.setProperty('animation','none','important');
   el.style.setProperty('translate','0 0','important');
   el.style.removeProperty('transition');
  }
  if(iuCancelStandaloneEntry===finish)iuCancelStandaloneEntry=null;
  focusMotionBusy=false;
  window.IUSyncSubpageBar?.();
  const pending=focusPendingTask;focusPendingTask=null;
  if(pending)requestAnimationFrame(pending);
 };
 iuCancelStandaloneEntry=finish;
 // Avant la première frame, empêcher les keyframes CSS spécifiques
 // de contredire la translation commune sur Safari.
 bar.style.setProperty('animation','none','important');
 bar.style.setProperty('transition','none','important');
 bar.style.setProperty('translate','0 '+initialY+'px','important');
 document.body.classList.add('iu-subpage-entering','iu-coupled-rise');
 try{
  action();
  window.IUSyncSubpageBar?.();
  document.querySelectorAll(config.viewSelectors||'').forEach(el=>{
   if(el.hidden)return;
   const st=getComputedStyle(el);
   if(st.display==='none'||st.visibility==='hidden')return;
   panels.push(el);
   el.style.setProperty('animation','none','important');
   el.style.setProperty('transition','none','important');
   el.style.setProperty('translate','0 '+initialY+'px','important');
   nodes.push(el);
  });
  // Initialiser le rendu lié en une seule mesure de layout.
  void bar.offsetHeight;
  panels.forEach(el=>void el.offsetHeight);
 }catch(error){finish();throw error;}
 // V40.07 — Déplacement natif sur les mêmes 610 ms, synchronisé pour
 // le bandeau et les panneaux. L'ancien mouvement reste disponible en repli.
 const runFallback=()=>{
  let start=null;
  const tick=now=>{
   if(done)return;
   if(start===null)start=now;
   const t=Math.min(1,Math.max(0,(now-start)/610));
   move(initialY*(1-ease(t)));
   if(t>=1)finish();
   else frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
 };
 frame=requestAnimationFrame(()=>{
  if(done)return;
  frame=requestAnimationFrame(()=>{
   if(done)return;
   let nativeOK=false;
   if(nodes.every(el=>typeof el.animate==='function')){
    try{
     // Supprimer le stationnement CSS !important des Alertes, tandis
     // que iu-coupled-rise neutralise leurs keyframes CSS concurrentes.
     if(document.body.classList.contains('is-alerts-mode'))
      document.body.classList.add('iu-alerts-rise-running');
     for(const el of nodes){
      el.style.removeProperty('translate');
      nativeAnimations.push(el.animate([
       {translate:'0 '+initialY+'px'},
       {translate:'0 0'}
      ],{duration:610,easing:'cubic-bezier(.16,.84,.24,1)',fill:'both'}));
     }
     nativeOK=nativeAnimations.length===nodes.length;
     if(nativeOK)Promise.all(nativeAnimations.map(anim=>anim.finished)).then(finish,finish);
    }catch(_){
     for(const anim of nativeAnimations)anim.cancel();
     nativeAnimations=[];
     nodes.forEach(el=>el.style.setProperty('translate','0 '+initialY+'px','important'));
    }
   }
   if(!nativeOK)runFallback();
  });
 });
 timer=setTimeout(finish,1200);
}
function iuAnimateStandalonePage(action,entering,config){
 if(entering&&config.solidDuringMotion){
  iuAnimateCoupledSubpage(action,config);
  return;
 }
 // Cette fonction n'est appelée que pour l'ouverture autonome.
 // Le moteur de retour vers l'accueil est conservé tel quel.
 if(!entering){action();return;}
 focusMotionBusy=true;
 // Éviter que le scroll conservé de l'accueil fasse apparaître le bandeau
 // directement en mode compact durant les premières images de l'entrée.
 document.body.classList.add('iu-subpage-entering');
 const enteringBar=$('iuSubpageBar');
 // V39.88 : ôter l'ancien verrou de fin d'entrée avant la nouvelle ouverture.
 enteringBar?.style.removeProperty('animation');
 enteringBar?.style.removeProperty('translate');
 try{
  action();
  // Le bouton est monté immédiatement, avant de commencer à animer la page.
  window.IUSyncSubpageBar?.();
 }catch(error){
  document.body.classList.remove('iu-subpage-entering');
  focusMotionBusy=false;
  throw error;
 }
 // V38.75 : un conteneur de page court (Alertes/Événements) pouvait
 // paraître hors écran sur Safari, car la mise à jour du scrollY liée au
 // changement de page n'était pas encore reflétée dans getBoundingClientRect.
 // Contrôler la visibilité CSS, PAS l'intersection avec le viewport :
 // la page ET le bandeau montent alors à chaque ouverture.
 const pageSurfaces=[...document.querySelectorAll(config.viewSelectors||focusViewSelectors)]
  .filter(el=>{
   if(el.hidden)return false;
   const computed=getComputedStyle(el);
   return computed.display!=='none'&&computed.visibility!=='hidden';
  });
 const bar=$('iuSubpageBar');
 const parts=bar&&!bar.hidden?[bar,...pageSurfaces]:pageSurfaces;
 const anims=[];
 // L'entrée CSS de la page Alertes doit être gérée indépendamment :
 // ne jamais lui superposer une deuxième animation WAAPI.
 let alertPanel=null,alertEndHandler=null,alertFinishTimer=null;
 let settled=false;
 const finish=()=>{
  if(settled)return;
  settled=true;
  if(alertPanel&&alertEndHandler)alertPanel.removeEventListener('animationend',alertEndHandler);
  if(alertFinishTimer!==null)clearTimeout(alertFinishTimer);
  anims.forEach(anim=>anim.cancel());
  // Verrouiller la position finale du bandeau avant la fin de l'animation.
  // Safari recalculait sinon sa translation à la disparition de la classe.
  if(bar&&!bar.hidden){
   bar.style.setProperty('animation','none','important');
   bar.style.setProperty('translate','0 0','important');
  }
  document.body.classList.remove('iu-alerts-rise-running','iu-subpage-entering');
  if(iuCancelStandaloneEntry===cancelEntry)iuCancelStandaloneEntry=null;
  focusMotionBusy=false;
  window.IUSyncSubpageBar?.();
  const pending=focusPendingTask;
  focusPendingTask=null;
  if(pending)requestAnimationFrame(pending);
 };
 const cancelEntry=()=>finish();
 iuCancelStandaloneEntry=cancelEntry;
 // V38.75 — Spécifique à Alertes : Safari peut créer le CSSAnimation
 // du bandeau une frame avant celui du panneau. Le contrôle immédiat
 // getAnimations() renvoyait alors un seul joueur et déclenchait le repli
 // WAAPI *sur les deux*, alors que leur animation CSS était déjà en cours.
 // Ce double mouvement désynchronisait visuellement le bandeau.
 // Garder une unique animation CSS pour les deux surfaces : aucun repli
 // JavaScript superposé. Le comportement Événements validé est inchangé.
 if(config.modeClass==='is-alerts-mode'&&bar&&!bar.hidden){
  // V38.75 — Première ouverture : #iuAlertsPage passe de hidden à visible
  // dans la même task que la pose de is-alerts-mode. Sur Safari, déclencher
  // immédiatement l'animation CSS peut faire démarrer le bandeau avant
  // le panneau. Celui-ci doit avoir une vraie mise en page avant l'animation.
  alertPanel=$('iuAlertsPage')?.querySelector('.iu-alerts-page-body');
  if(alertPanel){
   // Tant que iu-alerts-rise-running n'est pas présent, le bandeau et
   // le panneau sont TOUS DEUX stationnés 105dvh sous le viewport.
   // Les mesures forcent WebKit à initialiser leurs styles au premier accès.
   void bar.offsetHeight;
   void alertPanel.offsetHeight;
   alertEndHandler=event=>{
    if(event.target===alertPanel&&event.animationName==='iu72-linked-rise')finish();
   };
   alertPanel.addEventListener('animationend',alertEndHandler);
   // Deux frames distinctes : la première enregistre l'état initial,
   // la suivante lance la même keyframe CSS sur les deux éléments.
   requestAnimationFrame(()=>{
    if(settled||!document.body.classList.contains('is-alerts-mode'))return;
    requestAnimationFrame(()=>{
     if(settled||!document.body.classList.contains('is-alerts-mode'))return;
     document.body.classList.add('iu-alerts-rise-running');
    });
   });
   // Safari/PWA peut ignorer animationend en cas de sortie anticipée.
   alertFinishTimer=setTimeout(finish,850);
   return;
  }
 }
 // V38.75 — Événements : conserve son synchronisme déjà validé.
 const linked= config.modeClass==='is-events-mode';
 if(linked){
  // Lire le style des deux surfaces après le changement de classe pour
  // initialiser leurs animations CSS dans la même frame.
  parts.forEach(el=>getComputedStyle(el).animationName);
  const linkedAnims=parts.map(el=>
   [...el.getAnimations({subtree:false})].find(anim=>anim.animationName==='iu72-linked-rise')
  );
  if(linkedAnims.every(Boolean))anims.push(...linkedAnims);
 }
 if(!anims.length){
  // Repli WAAPI (et comportement antérieur inchangé pour Admin/Compte).
  const options={duration:610,easing:'cubic-bezier(.16,.84,.24,1)',fill:'both'};
  for(const el of parts){
   try{
    anims.push(el.animate([
     {translate:'0 105dvh',opacity:1},
     {translate:'0 0',opacity:1}
    ],options));
   }catch(error){
    // Sans prise en charge des animations, la page reste utilisable.
   }
  }
 }
 if(anims.length)Promise.all(anims.map(anim=>anim.finished.catch(()=>{}))).then(finish,finish);
 else finish();
}

function changeFocusWithMotion(action,entering,config={}){
 if(focusMotionBusy)return;
 // Capturer le défilement AVANT le masquage de l'accueil et le scroll
 // vers le haut de la page entrante. Ne rien changer au mode Concentration.
 if(entering&&config.solidDuringMotion){
  const root=document.scrollingElement||document.documentElement;
  iuSavedHomeScrollY=Math.max(0,window.scrollY||root?.scrollTop||0);
 }
 if(focusReducedMotion()){action();return;}
 const html=document.documentElement;
 const before=document.body.classList.contains(config.modeClass||'is-focus-mode');
 // La transition n'est utile que si l'action peut changer de mode.
 if((entering&&before)||(!entering&&!before)){action();return;}
 // Pages séparées : pas de captures View Transition ni de copie
 // des cartes. Le moteur Concentration conserve son comportement existant.
 // Le bouton Retour appelle désormais EXACTEMENT la même fonction
 // que Pause/Quitter en concentration. Les styles des panneaux sont
 // conservés dans les copies du moteur pour Safari iPhone.
 if(!entering&&config.solidDuringMotion&&typeof Element.prototype.animate==='function'){
  exitFocusWithoutSnapshot(action,{...config,preservePageCloneStyles:true});
  return;
 }
 if(entering&&config.solidDuringMotion&&typeof Element.prototype.animate==='function'){
  iuAnimateStandalonePage(action,entering,config);
  return;
 }
 // Sortie : les éléments réels préservent le cadrage iPhone.
 if(!entering && typeof Element.prototype.animate==='function'){
  exitFocusWithoutSnapshot(action,config);
  return;
 }
 focusMotionBusy=true;
 const tagged=new Set();
 const cleanup=()=>{
  for(const el of tagged)el.style.viewTransitionName='';
  html.classList.remove('iu-focus-slide','iu-focus-entering','iu-focus-exiting','iu-admin-solid-transition');
  document.body.classList.remove('iu-slide-fallback-out','iu-slide-fallback-in');
  focusMotionBusy=false;
  // Un clic sur « Annuler » peut survenir avant la fin de la fermeture.
  // Rejouer l'ouverture une fois les instantanes precedents liberes.
  const pending=focusPendingTask;focusPendingTask=null;
  if(pending)requestAnimationFrame(pending);
 };
 const update=()=>{
  // Les anciens noms doivent etre retires avant la capture de la cible.
  for(const el of tagged)el.style.viewTransitionName='';
  action();
  focusTagViews(entering,'new',tagged,config);
 };
 html.classList.add('iu-focus-slide',entering?'iu-focus-entering':'iu-focus-exiting');
 // Le mode Admin garde son fond visible dès la première frame, sans
 // fondu translucide des captures. Le mode Concentration reste inchangé.
 if(config.solidDuringMotion)html.classList.add('iu-admin-solid-transition');
 focusTagViews(entering,'old',tagged,config);
 // V36.79 — Si l'utilisateur avait fait défiler l'accueil avant
 // d'ouvrir Admin/Mon compte, Safari peut capturer l'ancienne banderole
 // avec un décalage vertical, puis la laisser visible à la place du fond.
 // Dans ce cas précis, éviter la capture View Transition : on utilise
 // directement les cartes réelles, sans toucher au mode Concentration.
 const enteringFromScrolledHome=entering&&config.solidDuringMotion&&
  Math.max(window.scrollY||0,document.scrollingElement?.scrollTop||0)>8;
 if(!enteringFromScrolledHome&&typeof document.startViewTransition==='function'){
  try{
   const transition=document.startViewTransition(update);
   transition.finished.then(cleanup,cleanup);
  }catch(error){cleanup();action();}
  return;
 }
 // Repli natif Web Animations : page immédiatement opaque, mouvement
 // identique des cartes, sans ancienne capture décalée en Safari iOS.
 update();
 if(enteringFromScrolledHome){
  // Un seul rattrapage après la nouvelle mise en page. Ne pas surveiller
  // le scroll de manière continue : l'utilisateur garde ses gestes libres.
  requestAnimationFrame(()=>{
   if(document.body.classList.contains(config.modeClass||'is-focus-mode')&&
      window.scrollY>2)window.scrollTo({top:0,left:0,behavior:'instant'});
  });
 }
 const incoming=[...document.querySelectorAll(entering?(config.viewSelectors||focusViewSelectors):(config.normalSelectors||focusNormalSelectors))]
  .filter(focusVisible);
 const anims=incoming.map(el=>el.animate(
  [{transform:'translate3d(0,30px,0)',opacity:config.solidDuringMotion?1:.7},
   {transform:'translate3d(0,0,0)',opacity:1}],
  {duration:config.solidDuringMotion?610:420,delay:0,
   easing:'cubic-bezier(.38,0,.62,1)'}));
 Promise.all(anims.map(a=>a.finished.catch(()=>{}))).then(cleanup,cleanup);
 if(!anims.length)cleanup();
}
function animateFocusEntry(action){
 // N'enregistrer le scroll qu'au passage accueil -> concentration ;
 // pas lors d'un retour Annuler déclenché par une notification.
 if(!document.body.classList.contains('is-focus-mode')){
  const root=document.scrollingElement||document.documentElement;
  iuFocusHomeScrollY=Math.max(0,window.scrollY||root?.scrollTop||0);
 }
 changeFocusWithMotion(action,true);
}
function animateFocusExit(action){
 // Également appliqué quand l'utilisateur désactive les animations.
 if(focusReducedMotion()){
  action();
  if(!document.body.classList.contains('is-focus-mode'))iuRestoreFocusHomeScroll();
  return;
 }
 changeFocusWithMotion(action,false);
}
/* V36.66 — Vue Administrateur : le même moteur d'entrée/sortie que le
   mode concentration, sans dupliquer le contenu protégé ni ses formulaires.
   Le <details> reste en place pour les scripts administrateur et Supabase. */
const iuAdminPageMotion={
 modeClass:'is-admin-mode',
 // Deux surfaces distinctes, comme bandeau et pesée du mode Concentration :
 // la page entière ne se comporte plus comme une carte qui se déplie.
 // V36.76 — La seule carte Admin contient maintenant son Retour.
 viewSelectors:'.app > #planningAdminCard > .planning-admin-body, .app > #planningAdminCard > .iu-admin-loading-message',
 exitSourceSelectors:'.app > #planningAdminCard > .planning-admin-body, .app > #planningAdminCard > .iu-admin-loading-message',
 normalSelectors:focusNormalSelectors,
 // Taguer la surface opaque en vue-transition : elle reste statique
 // pendant que le bandeau et la carte avancent comme en concentration.
 surfaceSelectors:'.app > #planningAdminCard > .iu-admin-opaque-backdrop',
 solidDuringMotion:true,
 // V36.87 : l'accueil est toujours remis en haut sous la transition opaque.
 homeScrollY:()=>iuSavedHomeScrollY
};

/* V39.30 : mémorisation légère du défilement de l'accueil, sans iframe. */
let iuEdgeHomeSnapshot=null;
function iuEdgePrepareHome(){
 const scroller=document.scrollingElement||document.documentElement;
 const y=Math.max(0,window.scrollY||0,scroller?.scrollTop||0,document.body?.scrollTop||0);
 iuSavedHomeScrollY=y;
 iuEdgeHomeSnapshot={scrollY:y};
}

function iuOpenAdminPage(){
 const card=$('planningAdminCard');
 if(!card||card.hidden||card.dataset.adminLoading==='true'||
    document.body.classList.contains('is-admin-mode')||focusMotionBusy)return;
 iuEdgePrepareHome();
 changeFocusWithMotion(()=>{
  card.open=true;
  document.body.classList.add('is-admin-mode');
  document.documentElement.classList.add('iu-admin-page-active');
  // Comme pour le mode Session, c'est la page qui défile. Ne pas
  // enfermer tous les réglages dans un <details> à scroll interne iOS.
  window.scrollTo({top:0,left:0,behavior:'instant'});
 },true,iuAdminPageMotion);
}
function iuCloseAdminPage(immediate=false){
 const card=$('planningAdminCard');
 if(!card||!document.body.classList.contains('is-admin-mode'))return;
 const exit=()=>{
  document.body.classList.remove('is-admin-mode');
  document.documentElement.classList.remove('iu-admin-page-active');
  card.open=false;
  // Retrouver la position mémorisée avant que le masque ne découvre l'accueil.
  iuRestoreHomeScroll();
 };
 if(!immediate&&focusMotionBusy){
  // Un seul toucher interrompt l'entrée encore en cours, puis lance
  // immédiatement la sortie, sans attente ni deuxième appui.
  iuCancelStandaloneEntry?.();
  if(focusMotionBusy){
   focusPendingTask=()=>iuCloseAdminPage();
   return;
  }
 }
 if(immediate||focusReducedMotion()){exit();return;}
 changeFocusWithMotion(exit,false,iuAdminPageMotion);
}
window.IUOpenAdminPage=iuOpenAdminPage;

/* V36.71 — Mon compte devient une vraie page, suivant exactement
   les choix validés pour l'Administration (v36.69/70) :
   document naturellement défilable sur Safari, bandeau compact,
   fond opaque durant la transition, retour à la position d'accueil.
   Le DOM du tableau de bord et de l'authentification n'est pas cloné. */
const iuAccountPageMotion={
 modeClass:'is-account-mode',
 // Bandeau, profil Google (si connecté) et tableau de bord ont chacun
 // leur surface dans l'animation de concentration, sans fondu transparent.
 // La carte profil (si connecté) porte le Retour ; en mode local, il
 // apparaît dans account-body. Même moteur opaque de concentration.
 viewSelectors:'.app > #accountCard > .iu-account-profile-card:not([hidden]), .app > #accountCard > .account-body',
 exitSourceSelectors:'.app > #accountCard > .iu-account-profile-card:not([hidden]), .app > #accountCard > .account-body',
 normalSelectors:focusNormalSelectors,
 surfaceSelectors:'.app > #accountCard > .iu-account-opaque-backdrop',
 solidDuringMotion:true,
 // V36.87 : aucune restauration d'une position de scroll désormais obsolète.
 homeScrollY:()=>iuSavedHomeScrollY
};
function iuOpenAccountPage(){
 const card=$('accountCard');
 if(!card||document.body.classList.contains('is-account-mode')||focusMotionBusy)return;
 iuEdgePrepareHome();
 changeFocusWithMotion(()=>{
  card.open=true;
  document.body.classList.add('is-account-mode');
  document.documentElement.classList.add('iu-account-page-active');
  window.scrollTo({top:0,left:0,behavior:'instant'});
 },true,iuAccountPageMotion);
}
function iuCloseAccountPage(immediate=false){
 const card=$('accountCard');
 if(!card||!document.body.classList.contains('is-account-mode'))return;
 const exit=()=>{
  document.body.classList.remove('is-account-mode');
  document.documentElement.classList.remove('iu-account-page-active');
  card.open=false;
  // Retour à l'endroit où la navigation a commencé.
  iuRestoreHomeScroll();
 };
 if(!immediate&&focusMotionBusy){
  // Un seul toucher interrompt l'entrée encore en cours, puis lance
  // immédiatement la sortie, sans attente ni deuxième appui.
  iuCancelStandaloneEntry?.();
  if(focusMotionBusy){
   focusPendingTask=()=>iuCloseAccountPage();
   return;
  }
 }
 if(immediate||focusReducedMotion()){exit();return;}
 changeFocusWithMotion(exit,false,iuAccountPageMotion);
}
window.IUOpenAccountPage=iuOpenAccountPage;
window.IUCloseAccountPage=iuCloseAccountPage;

/* V37.09 — Événements : même navigation plein écran opaque que les
   pages Mon compte et Administrateur, y compris la fermeture iOS. */
const iuEventsPageMotion={
 modeClass:'is-events-mode',
 viewSelectors:'.app > #eventsPage > .iu-events-page-inner',
 exitSourceSelectors:'.app > #eventsPage > .iu-events-page-inner',
 normalSelectors:focusNormalSelectors,
 surfaceSelectors:'.app > #eventsPage > .iu-events-opaque-backdrop',
 solidDuringMotion:true,
 homeScrollY:()=>iuSavedHomeScrollY
};
function iuOpenEventsPage(){
 const page=$('eventsPage');
 if(!page||focusMotionBusy||
    document.body.classList.contains('is-events-mode')||
    document.body.classList.contains('is-account-mode')||
    document.body.classList.contains('is-admin-mode'))return;
 window.InventairesPlanning?.preparePage?.();
 iuEdgePrepareHome();
 changeFocusWithMotion(()=>{
  page.hidden=false;
  document.body.classList.add('is-events-mode');
  document.documentElement.classList.add('iu-events-page-active');
  window.scrollTo({top:0,left:0,behavior:'instant'});
 },true,iuEventsPageMotion);
}
function iuCloseEventsPage(immediate=false){
 const page=$('eventsPage');
 if(!page||!document.body.classList.contains('is-events-mode'))return;
 const action=()=>{
  document.body.classList.remove('is-events-mode');
  document.documentElement.classList.remove('iu-events-page-active');
  page.hidden=true;
  iuRestoreHomeScroll();
 };
 if(!immediate&&focusMotionBusy){
  // Un seul toucher interrompt l'entrée encore en cours, puis lance
  // immédiatement la sortie, sans attente ni deuxième appui.
  iuCancelStandaloneEntry?.();
  if(focusMotionBusy){
   focusPendingTask=()=>iuCloseEventsPage();
   return;
  }
 }
 if(immediate||focusReducedMotion()){action();return;}
 changeFocusWithMotion(action,false,iuEventsPageMotion);
}
window.IUOpenEventsPage=iuOpenEventsPage;
window.IUCloseEventsPage=iuCloseEventsPage;
/* V38.58 — Alertes : même moteur opaque d'entrée/sortie que la page Administrateur,
   sans modifier les données de veille ni le comportement hors ligne. */
const iuAlertsPageMotion={
 modeClass:'is-alerts-mode',
 viewSelectors:'.app > #iuAlertsPage > .iu-alerts-page-body',
 exitSourceSelectors:'.app > #iuAlertsPage > .iu-alerts-page-body',
 normalSelectors:focusNormalSelectors,
 surfaceSelectors:'.app > #iuAlertsPage > .iu-alerts-opaque-backdrop',
 solidDuringMotion:true,
 homeScrollY:()=>iuSavedHomeScrollY
};
function iuOpenAlertsPage(){
 const page=$('iuAlertsPage');
 if(!page||focusMotionBusy||document.body.classList.contains('is-alerts-mode')||
    document.body.classList.contains('is-admin-mode')||
    document.body.classList.contains('is-account-mode')||
    document.body.classList.contains('is-events-mode'))return;
 iuEdgePrepareHome();
 changeFocusWithMotion(()=>{
  page.hidden=false;
  document.body.classList.add('is-alerts-mode');
  document.documentElement.classList.add('iu-alerts-page-active');
  window.scrollTo({top:0,left:0,behavior:'instant'});
 },true,iuAlertsPageMotion);
}
function iuCloseAlertsPage(immediate=false){
 const page=$('iuAlertsPage');
 if(!page||!document.body.classList.contains('is-alerts-mode'))return;
 const action=()=>{
  document.body.classList.remove('is-alerts-mode');
  document.documentElement.classList.remove('iu-alerts-page-active');
  page.hidden=true;
  iuRestoreHomeScroll();
 };
 if(!immediate&&focusMotionBusy){
  // Un seul toucher interrompt l'entrée encore en cours, puis lance
  // immédiatement la sortie, sans attente ni deuxième appui.
  iuCancelStandaloneEntry?.();
  if(focusMotionBusy){
   focusPendingTask=()=>iuCloseAlertsPage();
   return;
  }
 }
 if(immediate||focusReducedMotion()){action();return;}
 changeFocusWithMotion(action,false,iuAlertsPageMotion);
}
window.IUOpenAlertsPage=iuOpenAlertsPage;
window.IUCloseAlertsPage=iuCloseAlertsPage;

function syncFocusMode(sessionInput,statsInput){
 const session=arguments.length?sessionInput:getActiveSession();
 const active=Boolean(session&&!session.pausedAt);
 const toolbar=$('focusToolbar');
 if(!toolbar)return;
 // Éviter de réécrire les propriétés de mise en page pendant chaque
 // sauvegarde ou chaque actualisation de la durée de session.
 if(toolbar.hidden===active)toolbar.hidden=!active;
 if(document.body.classList.contains('is-focus-mode')!==active)
  document.body.classList.toggle('is-focus-mode',active);
 if(!active&&!$('focusConfirm').hidden)$('focusConfirm').hidden=true;
 if(active){
  const stats=statsInput||activeStats(session);
  const durationValue=durationLabel(stats.duration),countValue=String(stats.count);
  if($('focusDuration').textContent!==durationValue)$('focusDuration').textContent=durationValue;
  if($('focusCount').textContent!==countValue)$('focusCount').textContent=countValue;
 }
 if(active!==focusWasActive){
  focusWasActive=active;
  // Durant la capture native, positionner directement la vue cible.
  // En dehors d'une transition, garder le retour en haut historique.
  if(document.documentElement.classList.contains('iu-focus-slide')){
   window.scrollTo({top:0,left:0,behavior:'instant'});
  }
 }
 focusInitialized=true;
}
function renderSessionControls(){const s=getActiveSession();$('sessionBadge').textContent=s?(s.pausedAt?'En pause':'En cours'):'Aucune session';$('sessionBadge').classList.toggle('active',Boolean(s&&!s.pausedAt));$('sessionBadge').classList.toggle('is-paused',Boolean(s&&s.pausedAt));$('sessionLive').hidden=!s;
 $('startSession').hidden=Boolean(s);$('pauseSession').hidden=!s||Boolean(s.pausedAt);$('resumeSession').hidden=!s||!s.pausedAt;$('finishSession').hidden=!s;
 $('sessionHelp').textContent=s?(s.pausedAt?'En pause : reprends pour enregistrer tes pesées.':`Début : ${dateLabel(s.startedAt)} · Suivi automatique actif.`):'Démarre une session pour conserver les statistiques de ton inventaire.';
 const refBox=$('iuActiveReference');
 if(refBox){
  refBox.hidden=!s;
  if(s){const current=refBox.querySelector('select');if(!current||current.dataset.sessionId!==s.id||current.value!==(s.referenceMonth||'')){
   refBox.replaceChildren(iuReferenceSelector(s,'Mois de référence de cet inventaire'));
   refBox.querySelector('select').dataset.sessionId=s.id;
  }}
 }
 let sessionStats=null;
 if(s){const stats=activeStats(s);sessionStats=stats;$('sessionDuration').textContent=durationLabel(stats.duration);$('sessionWeighCount').textContent=String(stats.count);$('sessionNet').textContent=`${fmt(stats.net)} kg`;}
 renderHeroSummary(sessionStats);
 if(s)syncFocusMode(s,sessionStats);
 else syncFocusMode();
 window.IUUpdateQuickDockSession?.();
}
// L'horloge met à jour seulement les textes qui ont réellement changé :
// moins de mutations DOM, donc moins de recalculs sur Safari iPhone.
function renderLiveSessionStats(updateHero=true){
 const session=getActiveSession();if(!session)return null;
 const stats=activeStats(session);
 const values=[['sessionDuration',durationLabel(stats.duration)],['sessionWeighCount',String(stats.count)],['sessionNet',`${fmt(stats.net)} kg`]];
 for(const [id,value] of values){const el=$(id);if(el&&el.textContent!==value)el.textContent=value;}
 if(updateHero)renderHeroSummary(stats);
 syncFocusMode(session,stats);
 return stats;
}
function startSession(){const review=$('sessionQualityReview');if(review)review.hidden=true;
 if(getActiveSession()||!flushPending())return;
 const before=sessions,prevId=activeSessionId;
 const created={id:uid(),startedAt:Date.now(),referenceMonth:iuSuggestedReference(),endedAt:null,pausedAt:null,pausedMs:0,entries:[]};
 sessions=[created,...sessions];activeSessionId=created.id;
 if(!persistSessions()){sessions=before;activeSessionId=prevId;return;}
 clearWeigh();renderV22();$('sessionMessage').classList.remove('is-complete');$('sessionMessage').textContent='';
}
function pauseSession(){
 const session=getActiveSession();if(!session||session.pausedAt||!flushPending())return;
 session.pausedAt=Date.now();
 if(!persistSessions()){session.pausedAt=null;return;}
 clearWeigh();renderV22();$('sessionMessage').classList.remove('is-complete');$('sessionMessage').textContent='';
}
function resumeSession(){
 const session=getActiveSession();if(!session||!session.pausedAt)return;
 const oldPausedAt=session.pausedAt,oldPausedMs=session.pausedMs;
 session.pausedMs+=Date.now()-session.pausedAt;session.pausedAt=null;
 if(!persistSessions()){session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;return;}
 clearWeigh();renderV22();$('sessionMessage').classList.remove('is-complete');$('sessionMessage').textContent='';
}
function reviewSessionQuality(session){
 const target=$('sessionQualityReview');if(!target||!session)return;
 const entries=session.entries||[];
 const problems=[];
 const invalid=entries.filter(e=>!Number.isSafeInteger(e.gross)||!Number.isSafeInteger(e.tare)||!Number.isSafeInteger(e.net)||e.net!==e.gross-e.tare||e.gross<0||e.tare<0);
 if(invalid.length)problems.push(`${invalid.length} pesée(s) incohérente(s) : vérifier les valeurs.`);
 const negative=entries.filter(e=>Number.isSafeInteger(e.net)&&e.net<0);
 if(negative.length)problems.push(`${negative.length} poids net(s) négatif(s) enregistrés en mode essai.`);
 const limit=maxGrossGrams;
 const heavy=entries.filter(e=>Number.isSafeInteger(e.gross)&&e.gross>limit);
 if(heavy.length)problems.push(`${heavy.length} poids brut(s) au-dessus du seuil d'alerte.`);
 const nearDuplicates=entries.filter((e,i)=>i>0&&e.gross===entries[i-1].gross&&e.tare===entries[i-1].tare&&Math.abs(e.at-entries[i-1].at)<120000);
 if(nearDuplicates.length)problems.push(`${nearDuplicates.length} pesée(s) consécutive(s) identique(s) à moins de 2 minutes (à confirmer).`);
 target.replaceChildren();
 target.classList.toggle('has-issues',problems.length>0);
 const heading=document.createElement('strong');heading.textContent=problems.length?'Contrôle de cohérence : points à vérifier':'Contrôle de cohérence : aucune anomalie détectée';
 target.append(heading);
 const info=document.createElement('p');info.textContent=`${entries.length} pesées contrôlées. Ce contrôle ne vérifie pas les tares réelles ni les produits.`;
 target.append(info);
 if(problems.length){const ul=document.createElement('ul');for(const message of problems){const li=document.createElement('li');li.textContent=message;ul.append(li);}target.append(ul);}
 target.hidden=false;
}
function finishSession(){
 const session=getActiveSession();if(!session)return;
 if(!session.pausedAt&&!flushPending())return;
 const oldPausedAt=session.pausedAt,oldPausedMs=session.pausedMs;
 const now=Date.now();
 if(session.pausedAt){session.pausedMs+=now-session.pausedAt;session.pausedAt=null;}
 session.endedAt=now;activeSessionId=null;
 if(!persistSessions()){
  session.endedAt=null;session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;activeSessionId=session.id;
  return;
 }
 clearWeigh();renderV22();reviewSessionQuality(session);notifyInventoryProgressChanged();$('sessionMessage').classList.add('is-complete');{const message=$('sessionMessage');message.replaceChildren();const title=document.createElement('strong');title.className='session-complete-title';title.textContent='Inventaire terminé';const detail=document.createElement('span');detail.className='session-complete-detail';detail.textContent='Retrouve son bilan dans « Mes inventaires ».';const content=document.createElement('span');content.className='session-complete-copy';content.append(title,detail);message.append(content);}
 offerUndo('Inventaire terminé.',()=>{
  if(activeSessionId||!session.endedAt||session.endedAt!==now)return false;
  session.endedAt=null;session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;activeSessionId=session.id;
  if(!persistSessions()){session.endedAt=now;session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;activeSessionId=null;return false;}
  notifyInventoryProgressChanged();
  // L'animation se rejoue UNIQUEMENT lors de cette restauration via « Annuler ».
  // Garder le DOM normal jusqu'a la capture native pour eviter le saut.
  const restoreView=()=>{
   renderV22();$('sessionMessage').classList.remove('is-complete');$('sessionMessage').textContent='Inventaire repris.';
  };
  if(!session.pausedAt){
   const reopen=()=>animateFocusEntry(restoreView);
   if(focusMotionBusy)focusPendingTask=reopen;
   else reopen();
  }else restoreView();
  return true;
 });
}
function sessionBreakdown(s){const map=new Map();for(const e of s.entries)map.set(e.name,(map.get(e.name)||0)+1);return [...map.entries()].sort((a,b)=>b[1]-a[1]);}
function makeStat(label,value){const box=document.createElement('div');box.className='v22-stat';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;box.append(small,strong);return box;}
// v43.15 — statistiques de consultation uniquement, à partir des pesées sauvegardées.
// Les montants sont des prix de vente après tare, pas des coûts d'achat.
function iuInventoryAIStats(entries){
 const result={total:entries.length,ai:0,classic:0,net:0,aiNet:0,priced:0,pricedNet:0,value:0,unidentified:0,duplicates:0,corrections:0,correctionKnown:0,duplicateKnown:0,products:[]};
 const products=new Map();
 for(const e of entries){
  result.net+=e.net;
  if(e.source!=='gemini'){result.classic++;continue;}
  result.ai++;result.aiNet+=e.net;
  const priced=e.net>=0&&Number.isSafeInteger(e.correctedTotalCents)&&e.correctedTotalCents>=0;
  if(priced){result.priced++;result.value+=e.correctedTotalCents;result.pricedNet+=e.net;}
  if(typeof e.duplicateConfirmed==='boolean'){result.duplicateKnown++;if(e.duplicateConfirmed)result.duplicates++;}
  if(Array.isArray(e.manualCorrectedFields)){result.correctionKnown++;if(e.manualCorrectedFields.length)result.corrections++;}
  const name=typeof e.product==='string'?e.product.trim():'';
  const plu=typeof e.plu==='string'&&/^\d{1,8}$/.test(e.plu)?e.plu:'';
  const prefix=typeof e.catalogPrefix==='string'&&/^\d{7}$/.test(e.catalogPrefix)?e.catalogPrefix:'';
  if(!name||!plu){result.unidentified++;continue;}
  // Group only exact saved identities. Never infer a product from a name or price.
  const key=JSON.stringify([plu,name.normalize('NFC').toLocaleUpperCase('fr-FR'),prefix]);
  if(!products.has(key))products.set(key,{name,plu,prefix,count:0,net:0,priced:0,value:0});
  const p=products.get(key);p.count++;p.net+=e.net;if(priced){p.priced++;p.value+=e.correctedTotalCents;}
 }
 result.products=[...products.values()].sort((a,b)=>b.net-a.net||a.name.localeCompare(b.name,'fr')||a.plu.localeCompare(b.plu));
 return result;
}
function iuInventoryAIElement(entries){
 const data=iuInventoryAIStats(entries);
 if(!data.ai)return null; // historical classic-only reports retain their original appearance.
 const node=(tag,cls,txt)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;};
 const money=cents=>(cents/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
 const percent=(a,b)=>b?Math.round(a*100/b)+' %':'—';
 const section=node('section','iu-ai-bilan');
 const header=node('div','iu-ai-bilan-head');
 const title=node('div','iu-ai-bilan-title');
 title.append(node('small','','SERVICES U / ANALYSE AI'),node('h4','','Statistiques des articles'));
 header.append(title);
 const badge=node('span','iu-weigh-record-ai');badge.setAttribute('role','img');badge.setAttribute('aria-label','Analyse AI');
 const mark=node('span','iu-weigh-record-ai-mark','AI');mark.setAttribute('aria-hidden','true');
 const canvas=node('canvas','iu-weigh-record-ai-canvas');canvas.width=26;canvas.height=26;canvas.setAttribute('aria-hidden','true');badge.append(mark,canvas);header.append(badge);section.append(header);
 const coverage=node('div','iu-ai-bilan-coverage');
 const counts=node('div','iu-ai-bilan-counts');
 counts.append(node('strong','',percent(data.ai,data.total)+' AI'),node('span','',data.ai+' AI · '+data.classic+' classiques'));coverage.append(counts);
 const track=node('div','iu-ai-bilan-track');track.setAttribute('role','img');track.setAttribute('aria-label',data.ai+' pesées AI sur '+data.total);
 const fill=node('div','iu-ai-bilan-fill');fill.style.width=(100*data.ai/data.total)+'%';track.append(fill);coverage.append(track);section.append(coverage);
 const grid=node('div','v22-stats-grid iu-ai-bilan-grid');
 for(const [label,value] of [
 ['Références identifiées',String(data.products.length)],
 ['Poids net AI',fmt(data.aiNet)+' kg'],
 ['Moyenne / pesée AI',fmt(Math.round(data.aiNet/data.ai))+' kg'],
 ['Valeur au prix de vente',data.priced?money(data.value):'—'],
 ['Pesées avec montant',data.priced+' / '+data.total],
 ['Poids net valorisé',data.priced?fmt(data.pricedNet)+' kg':'—']
 ])grid.append(makeStat(label,value));
 section.append(grid,node('p','iu-ai-bilan-note','Montants enregistrés après tare, au prix de vente. Les pesées sans montant (dont les pesées classiques) ne sont pas valorisées. Ce total n’est ni un coût d’achat ni une valeur comptable du stock.'));
 section.append(node('p','iu-ai-bilan-note','Regroupement par PLU, nom enregistré et préfixe DIGI lorsque disponible. Les variantes non concordantes restent séparées.'));
 if(data.unidentified)section.append(node('p','iu-ai-bilan-note',data.unidentified+' pesée(s) AI sans identité complète, non classée(s) par article.'));
 if(data.products.length){
  const products=node('div','iu-ai-bilan-products');
  const productHeader=node('div','iu-ai-bilan-product-head');
  productHeader.append(node('h4','','Répartition par article'));
  const sort=node('select','iu-ai-bilan-sort');sort.setAttribute('aria-label','Trier les articles');
  for(const [key,label] of [['net','Poids net'],['count','Pesées'],['value','Valeur connue']]){const option=node('option','',label);option.value=key;sort.append(option);}sort.value='net';productHeader.append(sort);products.append(productHeader);
  const rows=node('div','iu-ai-bilan-product-list');
  const toggle=node('button','outline-btn iu-ai-bilan-toggle');toggle.type='button';toggle.setAttribute('aria-expanded','false');
  let expanded=false;
  function render(){
   const key=['net','count','value'].includes(sort.value)?sort.value:'net';
   const ordered=[...data.products].sort((a,b)=>(key==='value'?Number(b.priced>0)-Number(a.priced>0):0)||b[key]-a[key]||a.name.localeCompare(b.name,'fr'));
   rows.replaceChildren();
   const max=ordered.reduce((m,p)=>Math.max(m,key==='value'&&!p.priced?0:p[key]),0);
   for(const p of (expanded?ordered:ordered.slice(0,5))){
    const row=node('div','iu-ai-bilan-product');
    const top=node('div','iu-ai-bilan-product-top');
    const id=node('div','iu-ai-bilan-product-id');id.append(node('strong','',p.name),node('small','','PLU '+p.plu));
    top.append(id,node('strong','iu-ai-bilan-product-weight',fmt(p.net)+' kg'));row.append(top);
    const bar=node('div','iu-ai-bilan-track');bar.setAttribute('aria-hidden','true');
    const progress=node('div','iu-ai-bilan-fill');progress.style.width=(max?Math.max(0,p[key])/max*100:0)+'%';bar.append(progress);row.append(bar);
    const meta=node('div','iu-ai-bilan-product-meta');meta.append(node('span','',p.count+' pesée'+(p.count>1?'s':'')),node('span','',p.priced?money(p.value)+(p.priced<p.count?' · partiel':''):'Montant inconnu'));row.append(meta);rows.append(row);
   }
   toggle.hidden=data.products.length<=5;toggle.textContent=expanded?'Réduire la liste':'Voir les '+data.products.length+' références';
   toggle.setAttribute('aria-expanded',String(expanded));
  }
  sort.addEventListener('change',render);toggle.addEventListener('click',()=>{expanded=!expanded;render();});products.append(rows,toggle);render();section.append(products);
 }
 const trace=node('div','iu-ai-bilan-trace');trace.append(node('h4','','Traçabilité des pesées AI'));
 const traceGrid=node('div','v22-stats-grid iu-ai-bilan-grid');
 traceGrid.append(makeStat('Doublons confirmés',String(data.duplicates)),makeStat('Corrections manuelles',String(data.corrections)));
 trace.append(traceGrid,node('p','iu-ai-bilan-note','Nombre de pesées portant une confirmation ou une correction enregistrée. Les anciens bilans peuvent ne pas conserver tous ces statuts. Ce n’est pas le taux de réussite de la reconnaissance.'));section.append(trace);
 return section;
}
function summaryElement(s){const stats=activeStats(s);const box=document.createElement('div');box.className='v22-bilan';const grid=document.createElement('div');grid.className='v22-stats-grid';
 for(const [label,value] of [['Début',dateLabel(s.startedAt)],['Fin',s.endedAt?dateLabel(s.endedAt):'—'],['Durée active',durationLabel(stats.duration)],['Pesées',String(stats.count)],['Poids brut',`${fmt(stats.gross)} kg`],['Tares cumulées',`${fmt(stats.tare)} kg`],['Poids net',`${fmt(stats.net)} kg`],['Moyenne / pesée',stats.count?`${fmt(stats.average)} kg`:'—'],['Plus petite',stats.count?`${fmt(stats.min)} kg`:'—'],['Plus grande',stats.count?`${fmt(stats.max)} kg`:'—'],['Pesées / heure',stats.duration&&stats.count?((stats.count*3600000)/stats.duration).toFixed(1).replace('.',','):'—']]) grid.append(makeStat(label,value));
 const refArea=document.createElement('div');refArea.className='iu-bilan-reference';refArea.append(iuReferenceSelector(s,'Mois de référence (modifiable)'));const actual=document.createElement('small');actual.textContent='Réalisé le '+dateLabel(s.startedAt);refArea.append(actual);box.append(refArea,grid);
 const breakdown=sessionBreakdown(s);if(breakdown.length){const h=document.createElement('h4');h.textContent='Types de paniers utilisés';box.append(h);for(const [name,count] of breakdown){const p=document.createElement('p');p.className='v22-stat-line';p.textContent=`${name} : ${count} pesée${count>1?'s':''}`;box.append(p);}}
 const hist=document.createElement('div');hist.className='v22-activity';const title=document.createElement('h4');title.textContent='Activité par demi-heure';hist.append(title);
 const bins=new Map();for(const e of s.entries){const d=new Date(e.at);d.setMinutes(Math.floor(d.getMinutes()/30)*30,0,0);const key=d.getTime();bins.set(key,(bins.get(key)||0)+1);}
 const sorted=[...bins.entries()].sort((a,b)=>a[0]-b[0]);const max=Math.max(1,...sorted.map(x=>x[1]));for(const [at,count] of sorted){const row=document.createElement('div');row.className='v22-bar-row';const label=document.createElement('span');label.textContent=new Date(at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});const bar=document.createElement('div');bar.className='v22-bar-track';const fill=document.createElement('div');fill.className='v22-bar-fill';fill.style.width=`${count/max*100}%`;bar.append(fill);const amount=document.createElement('strong');amount.textContent=String(count);row.append(label,bar,amount);hist.append(row);}
 if(!sorted.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Aucune pesée dans cette session.';hist.append(empty);}
 box.append(hist);const aiStats=iuInventoryAIElement(s.entries);if(aiStats)box.append(aiStats);box.append(weighArchiveElement(s.entries));const actions=document.createElement('div');actions.className='v22-session-export';const csv=document.createElement('button');csv.type='button';csv.className='outline-btn';csv.textContent='Exporter en CSV';csv.addEventListener('click',()=>exportCSV([s],`inventaire-u-${new Date(s.startedAt).toISOString().slice(0,10)}.csv`));const json=document.createElement('button');json.type='button';json.className='outline-btn';json.textContent='Bilan JSON';json.addEventListener('click',()=>download(JSON.stringify({app:'Inventaires U',version:30,sessions:[s]},null,2),`inventaire-u-${new Date(s.startedAt).toISOString().slice(0,10)}.json`,'application/json'));const remove=document.createElement('button');remove.type='button';remove.className='delete-session-btn';remove.textContent='Supprimer ce bilan';remove.setAttribute('aria-label',`Supprimer le bilan du ${dateLabel(s.startedAt)}`);remove.addEventListener('click',()=>deleteSession(s.id));actions.append(csv,json);box.append(actions,remove);return box;}
function deleteSession(id){
 const index=sessions.findIndex(s=>s.id===id&&Boolean(s.endedAt));
 if(index<0)return;
 const removed=safeClone(sessions[index]),label=dateLabel(removed.startedAt);
 const previous=sessions;
 sessions=sessions.filter(s=>s.id!==id);
 if(!persistSessions()){
   sessions=previous;
   $('bilanNotice').textContent='Suppression impossible : stockage local indisponible.';
   return;
 }
 renderSessionsHistory();renderHeroSummary();renderBackupSummary();notifyInventoryProgressChanged();
 $('bilanNotice').textContent=`Bilan du ${label} supprimé.`;
 offerUndo('Bilan supprimé.',()=>{
   if(sessions.some(s=>s.id===removed.id))return false;
   const before=sessions;
   const restored=sessions.slice();restored.splice(Math.min(index,restored.length),0,removed);
   sessions=restored;
   if(!persistSessions()){sessions=before;return false;}
   renderSessionsHistory();renderHeroSummary();renderBackupSummary();notifyInventoryProgressChanged();
   $('bilanNotice').textContent=`Bilan du ${label} restauré.`;
   return true;
 });
}
// Dimension réelle des en-têtes des bilans pour placer « Suppr. » au milieu, même une fois ouverts.
const sessionSummaryObserver=typeof ResizeObserver==='function' ? new ResizeObserver(entries=>{
 for(const entry of entries){
  const shell=entry.target.closest('.v30-session-shell');
  if(shell) shell.style.setProperty('--session-summary-height',`${entry.target.getBoundingClientRect().height}px`);
 }
}) : null;
function iuUpdateArchiveControls(all){
 const years=[...new Set(all.filter(s=>iuReferenceValid(s.referenceMonth)).map(s=>Number(s.referenceMonth.slice(0,4))))].sort((a,b)=>b-a);
 const select=$('iuArchiveYear');if(!select)return;
 if(!years.length)years.push(new Date().getFullYear());
 if(!years.includes(iuArchiveYear))iuArchiveYear=years[0];
 select.replaceChildren();
 for(const year of years){const option=document.createElement('option');option.value=String(year);option.textContent=String(year);select.append(option);}
 select.value=String(iuArchiveYear);
 const misc=all.filter(s=>!iuReferenceValid(s.referenceMonth)).length;
 const miscButton=$('iuArchiveUnclassified');miscButton.textContent='À classer ('+misc+')';
 miscButton.setAttribute('aria-pressed',String(iuArchiveUnclassified));
 const yearsButton=$('iuArchiveByYear');yearsButton.setAttribute('aria-pressed',String(!iuArchiveUnclassified));
 const grid=$('iuArchiveMonths');grid.hidden=iuArchiveUnclassified;
 grid.replaceChildren();
 for(let m=1;m<=12;m++){
  const key=iuArchiveYear+'-'+String(m).padStart(2,'0');
  const count=all.filter(s=>s.referenceMonth===key).length;
  const button=document.createElement('button');button.type='button';button.className='iu-archive-month';
  button.classList.toggle('is-selected',iuArchiveMonth===key);
  button.setAttribute('aria-pressed',String(iuArchiveMonth===key));
  button.textContent=iuMonthNames[m-1].slice(0,3);
  const number=document.createElement('small');number.textContent=String(count);button.append(number);
  button.disabled=!count;
  button.addEventListener('click',()=>{iuArchiveMonth=iuArchiveMonth===key?'all':key;renderSessionsHistory();});
  grid.append(button);
 }
 const showAll=$('iuArchiveAllMonths');showAll.hidden=iuArchiveUnclassified;
 showAll.setAttribute('aria-pressed',String(iuArchiveMonth==='all'));
}

function renderSessionsHistory(){const all=sessions.filter(s=>Boolean(s.endedAt));$('sessionsCount').textContent=`${all.length} session${all.length>1?'s':''}`;
 iuUpdateArchiveControls(all);
 const ended=all.filter(s=>iuArchiveUnclassified?!iuReferenceValid(s.referenceMonth):(iuReferenceValid(s.referenceMonth)&&s.referenceMonth.startsWith(iuArchiveYear+'-')&&(iuArchiveMonth==='all'||s.referenceMonth===iuArchiveMonth))).sort((a,b)=>iuInventorySort==='oldest'?a.startedAt-b.startedAt:b.startedAt-a.startedAt);
 const list=$('sessionsHistoryList');if(sessionSummaryObserver)sessionSummaryObserver.disconnect();list.replaceChildren();$('sessionsToggle').hidden=ended.length<=5;$('sessionsToggle').textContent=sessionsExpanded?'Réduire la liste':`Voir les ${ended.length} sessions`;
 if(!ended.length){const p=document.createElement('p');p.className='empty';p.textContent=iuArchiveUnclassified?'Toutes les sessions sont classées.':'Aucun inventaire pour cette période.';list.append(p);return;}
 let lastMonth='';
 for(const s of (sessionsExpanded?ended:ended.slice(0,5))){
  const month=iuArchiveUnclassified?new Date(s.startedAt).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):iuReferenceLabel(s.referenceMonth);
  if(month!==lastMonth){const divider=document.createElement('div');divider.className='iu-inventory-month';divider.textContent=month.charAt(0).toLocaleUpperCase('fr-FR')+month.slice(1);list.append(divider);lastMonth=month;}
  const item=document.createElement('details');item.className='v22-session-item';const sum=document.createElement('summary');const name=document.createElement('strong');const started=new Date(s.startedAt);const dayTitle=started.toLocaleDateString('fr-FR',{day:'numeric',month:'short',...(started.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});const timeTitle=started.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});name.textContent=`Inventaire · ${dayTitle} à ${timeTitle}`;
  const heading=document.createElement('span');heading.className='iu-inventory-title';
  const eyebrow=document.createElement('span');eyebrow.className='iu-inventory-kicker';eyebrow.textContent=iuArchiveUnclassified?'À CLASSER · BILAN TERMINÉ':'BILAN · '+iuReferenceLabel(s.referenceMonth).toLocaleUpperCase('fr-FR');
  heading.append(eyebrow,name);
  const meta=document.createElement('span');meta.className='iu-inventory-meta';const stats=activeStats(s);
  const pieces=stats.count?[`${stats.count} pesée${stats.count>1?'s':''}`,`${fmt(stats.net)} kg net`,durationLabel(stats.duration)]:['Aucune pesée',durationLabel(stats.duration)];
  for(const [i,textValue] of pieces.entries()){const part=document.createElement('span');part.className='iu-inventory-metric'+(i===0?' is-primary':'');part.textContent=textValue;meta.append(part);}
  sum.append(heading,meta);
  const quickRemove=document.createElement('button');
  quickRemove.type='button';quickRemove.className='quick-delete-session-btn';quickRemove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 10v7m4-7v7"/></svg>';
  quickRemove.setAttribute('aria-label',`Supprimer rapidement le bilan du ${dateLabel(s.startedAt)}`);
  quickRemove.title='Supprimer ce bilan';
  quickRemove.addEventListener('click',event=>{event.stopPropagation();deleteSession(s.id);});
  // Le bouton doit rester EN DEHORS du <details> : ses enfants sont masqués quand le bilan est fermé.
  const shell=document.createElement('div');shell.className='v30-session-shell';
  item.append(sum,summaryElement(s));shell.append(item,quickRemove);list.append(shell);
  shell.style.setProperty('--session-summary-height',`${sum.getBoundingClientRect().height}px`);
  if(sessionSummaryObserver)sessionSummaryObserver.observe(sum);
  setupSecondaryDetailsAnimation(item,'.v22-bilan');}
}
function renderV22(){renderSessionControls();renderSessionsHistory();$('inputUnit').textContent=entryMode==='g'?'g':'kg';$('modeKg').setAttribute('aria-pressed',String(entryMode==='kg'));$('modeG').setAttribute('aria-pressed',String(entryMode==='g'));$('modeSlideThumb').parentElement.classList.toggle('is-rapid',entryMode==='g');$('inputHint').textContent=entryMode==='g'?'Sans virgule : tape 1250 pour obtenir 1,250 kg.':'Avec décimales : tape 1,250 pour 1,250 kg.';$('grossWeight').setAttribute('inputmode',entryMode==='g'?'numeric':'decimal');$('grossWeight').placeholder=entryMode==='g'?'Ex. 1250':'Ex. 1.230';$('maxGrossLimit').value=fmt(maxGrossGrams);$('confirmDuplicates').checked=confirmDuplicates;renderBackupSummary();}
let modeMotionCleanup=null;
function animateModeSwitch(){
 const control=document.querySelector('.weigh-preferences-mode');
 if(!control||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 control.classList.remove('is-switching');void control.offsetWidth;
 control.classList.add('is-switching');
 clearTimeout(modeMotionCleanup);
 modeMotionCleanup=setTimeout(()=>control.classList.remove('is-switching'),390);
}
function switchMode(mode){if(mode===entryMode)return;const parsed=parseWeight($('grossWeight').value);entryMode=mode;try{safeSetItem(MODE_KEY,mode);}catch{}if(parsed!==null)$('grossWeight').value=weightFromGrams(parsed);acceptedAnomalyKey='';calculate();scheduleAutoSave();renderV22();animateModeSwitch();}
function setLimit(){const n=parseKg($('maxGrossLimit').value);if(n===null||n<1000||n>1000000){$('maxGrossLimit').value=fmt(maxGrossGrams);$('weighStatus').textContent='Choisis un seuil entre 1 et 1000 kg.';return;}maxGrossGrams=n;try{safeSetItem(LIMIT_KEY,fmt(n));}catch{}acceptedAnomalyKey='';calculate();scheduleAutoSave();}
function readTextFile(file){
  if(typeof file.text==='function')return file.text();
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||Error('Lecture impossible'));reader.readAsText(file);});
}
function download(data,name,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportCSV(items,name){const head=['Session','Début session','Fin session','Durée active (min)','Pesée','Date/heure pesée','Groupe de pesées','Type de panier','Poids brut (kg)','Tare (kg)','Poids net (kg)'];
 const csvCell=x=>`"${String(x??'').replace(/"/g,'""')}"`;const lines=[head.map(csvCell).join(';')];for(const s of items){const st=activeStats(s);for(const [i,e] of s.entries.entries()){lines.push([s.id,dateLabel(s.startedAt),s.endedAt?dateLabel(s.endedAt):'En cours',(st.duration/60000).toFixed(1).replace('.',','),i+1,dateLabel(e.at),e.groupId,e.name,fmt(e.gross).replace('.',','),fmt(e.tare).replace('.',','),fmt(e.net).replace('.',',')].map(csvCell).join(';'));}}
 download('\ufeff'+lines.join('\r\n'),name,'text/csv;charset=utf-8');}
const BACKUP_LAST_KEY='inventaires-u-last-backup-created-v1';
function renderBackupSummary(){
  const sessionCount=sessions.length;
  const archivedCount=sessions.reduce((n,s)=>n+s.entries.length,0);
  $('backupSummary').textContent=`${baskets.length} panier${baskets.length>1?'s':''} · ${sessionCount} inventaire${sessionCount>1?'s':''} · ${archivedCount} pesée${archivedCount>1?'s':''} archivée${archivedCount>1?'s':''}`;
  const last=Number(safeGet(BACKUP_LAST_KEY));
  $('backupLast').textContent=Number.isFinite(last)&&last>0?`Dernier export généré : ${dateLabel(last)}`:'Aucun export généré sur cet appareil.';
}
// Le fichier JSON contient également les préférences de saisie et d'alerte.
function createBackupData(){return {
 app:'Inventaires U',version:29,backupFormatVersion:2,unit:'g',exportedAt:Date.now(),
 baskets,history,sessions,activeSessionId,activeGroup:null,lastGroup:null,
 settings:{entryMode,maxGrossGrams,confirmDuplicates}
};}
function fullExport(){
  if(!flushPending()){$('backupStatus').textContent='Vérifie la dernière pesée avant de créer la sauvegarde.';return;}
  try{
    const data=createBackupData();
    download(JSON.stringify(data,null,2),`inventaires-u-complet-${new Date(data.exportedAt).toISOString().slice(0,10)}.json`,'application/json');
    try{safeSetItem(BACKUP_LAST_KEY,String(data.exportedAt));}catch{}
    renderBackupSummary();
    $('backupStatus').textContent='Fichier de sauvegarde généré. Conserve-le dans l’app Fichiers pour pouvoir restaurer tes données.';
  }catch{
    $('backupStatus').textContent='Impossible de préparer la sauvegarde. Réessaie.';
  }
}
function validateFullBackup(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.app!=='Inventaires U'||![22,23,24,25,26,27,28,29].includes(data.version))throw Error('Format non reconnu');
 if(!Array.isArray(data.baskets)||!Array.isArray(data.sessions)||!Array.isArray(data.history))throw Error('Champs manquants');
 if(data.baskets.length>1000||data.sessions.length>10000||data.history.length>1000)throw Error('Trop de données');
 // Ne supprimer silencieusement aucune donnée invalide pendant une restauration.
 if(data.baskets.some(b=>!b||typeof b!=='object'||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>40||!Number.isSafeInteger(Number(b.tare))||Number(b.tare)<0||Number(b.tare)>1000000))throw Error('Paniers invalides');
 const bb=sanitize(data.baskets);
 if(bb.length!==data.baskets.length||new Set(bb.map(b=>b.id)).size!==bb.length)throw Error('Paniers dupliqués');
 const ss=data.sessions.map(x=>{
  if(!x||!Array.isArray(x.entries)||!Number.isFinite(x.startedAt)||x.startedAt<=0||
    (x.endedAt!=null&&(!Number.isFinite(x.endedAt)||x.endedAt<x.startedAt))||
    (x.pausedAt!=null&&(!Number.isFinite(x.pausedAt)||x.pausedAt<x.startedAt))||
    !Number.isFinite(Number(x.pausedMs||0))||Number(x.pausedMs||0)<0||x.entries.length>100000)throw Error('Session invalide');
  const s=cleanSession(x);
  if(!s||s.entries.length!==x.entries.length||x.entries.some((e,i)=>!isConsistentWeigh(e,s.entries[i])))throw Error('Pesée invalide dans une session');
  if(new Set(s.entries.map(e=>e.id)).size!==s.entries.length)throw Error('Pesées dupliquées');
  return s;
 });
 if(new Set(ss.map(s=>s.id)).size!==ss.length)throw Error('Sessions dupliquées');
 const hh=data.history.map(cleanWeigh);
 if(hh.some((e,i)=>!e||!isConsistentWeigh(data.history[i],e)))throw Error('Historique invalide');
 const active=typeof data.activeSessionId==='string'&&ss.some(s=>s.id===data.activeSessionId&&!s.endedAt)?data.activeSessionId:null;
 let settings=null;
 if(data.settings!==undefined){
  const a=data.settings;
  if(!a||!['kg','g'].includes(a.entryMode)||!Number.isSafeInteger(a.maxGrossGrams)||a.maxGrossGrams<1000||a.maxGrossGrams>1000000||typeof a.confirmDuplicates!=='boolean')throw Error('Réglages invalides');
  settings={entryMode:a.entryMode,maxGrossGrams:a.maxGrossGrams,confirmDuplicates:a.confirmDuplicates};
 }
 return {bb,ss,hh:hh.slice(0,15),active,settings};
}
function importSingleBilan(data){
 if(!data||data.app!=='Inventaires U'||!Array.isArray(data.sessions)||data.sessions.length!==1||data.baskets!==undefined)throw Error('Bilan individuel non reconnu');
 const raw=data.sessions[0];
 const sample={app:'Inventaires U',version:29,baskets:[],history:[],sessions:[raw],activeSessionId:null};
 const checked=validateFullBackup(sample),bilan=checked.ss[0];
 if(!bilan.endedAt)throw Error('Ce bilan n’est pas terminé');
 if(sessions.some(x=>x.id===bilan.id))throw Error('Ce bilan existe déjà');
 const next=sessions.concat([bilan]);
 const old=sessions;sessions=next;
 if(!persistSessions()){sessions=old;throw Error('Stockage indisponible');}
 renderV22();renderBackupSummary();return bilan;
}
function isConsistentWeigh(raw,clean){
 return Boolean(clean&&raw&&Number.isSafeInteger(raw.gross)&&Number.isSafeInteger(raw.tare)&&Number.isSafeInteger(raw.net)&&raw.gross-raw.tare===raw.net&&Number.isFinite(raw.at));
}
// Écriture avec retour arrière si le stockage local refuse une des clés.
function commitRestoredData(values){
 const oldValues=new Map();
 for(const [k] of values)oldValues.set(k,localStorage.getItem(k));
 try{for(const [k,v] of values){if(v===null)localStorage.removeItem(k);else safeSetItem(k,v);}}
 catch(e){
  for(const [k,old] of oldValues){try{if(old===null)localStorage.removeItem(k);else safeSetItem(k,old);}catch{}}
  throw Error('Stockage local insuffisant');
 }
}
// Fusion non destructive : les identifiants existants gagnent en cas de divergence.
// Les doublons exacts et les éléments déjà présents ne sont jamais ajoutés deux fois.
function mergeBackup(checked){
 const basketIds=new Set(baskets.map(b=>b.id));
 const basketNames=new Set(baskets.map(b=>`${b.name.trim().toLocaleLowerCase('fr')}|${b.tare}`));
 const bb=[...baskets];let addedBaskets=0,skippedBaskets=0;
 for(const b of checked.bb){const nameKey=`${b.name.trim().toLocaleLowerCase('fr')}|${b.tare}`;
  if(basketIds.has(b.id)||basketNames.has(nameKey)){skippedBaskets++;continue;}
  bb.push(b);basketIds.add(b.id);basketNames.add(nameKey);addedBaskets++;
 }
 const existingSessions=new Map(sessions.map(x=>[x.id,x]));
 const sessionIds=new Set(sessions.map(x=>x.id));
 const ss=[...sessions];let addedSessions=0,skippedSessions=0;
 for(const item of checked.ss){if(sessionIds.has(item.id)){
   if(JSON.stringify(existingSessions.get(item.id))!==JSON.stringify(item))throw Error('Un inventaire importé possède le même identifiant mais des pesées différentes. Exporte tes données puis conserve les deux versions séparément avant de choisir.');
   skippedSessions++;continue;}
  ss.push(item);sessionIds.add(item.id);addedSessions++;
 }
 const historyKeys=new Set(history.map(e=>e.id?`id:${e.id}`:`content:${JSON.stringify([e.at,e.name,e.gross,e.tare,e.net])}`));
 const hh=[...history];let addedHistory=0;
 for(const e of checked.hh){const key=e.id?`id:${e.id}`:`content:${JSON.stringify([e.at,e.name,e.gross,e.tare,e.net])}`;
  if(historyKeys.has(key))continue;historyKeys.add(key);hh.push(e);addedHistory++;
 }
 hh.sort((a,b)=>b.at-a.at);
 return {bb,ss,hh:hh.slice(0,15),active:activeSessionId,settings:null,addedBaskets,addedSessions,addedHistory,skippedBaskets,skippedSessions};
}
function chooseBackupImport(){
 return new Promise(resolve=>{
  const dialog=$('importChoiceDialog');if(!dialog||typeof dialog.showModal!=='function'){
   resolve(window.confirm('Fusionner la sauvegarde avec les données actuelles ? (Annuler = abandonner)')?'merge':'cancel');return;
  }
  const finish=mode=>{dialog.close();resolve(mode);};
  const merge=$('importMergeBtn'),replace=$('importReplaceBtn'),cancel=$('importCancelBtn');
  const onMerge=()=>finish('merge');const onReplace=()=>finish('replace');const onCancel=()=>finish('cancel');
  const cleanup=()=>{merge.removeEventListener('click',onMerge);replace.removeEventListener('click',onReplace);cancel.removeEventListener('click',onCancel);dialog.removeEventListener('cancel',onEscape);};
  const onEscape=e=>{e.preventDefault();cleanup();finish('cancel');};
  merge.addEventListener('click',onMerge,{once:true});replace.addEventListener('click',onReplace,{once:true});cancel.addEventListener('click',onCancel,{once:true});dialog.addEventListener('cancel',onEscape);
  dialog.addEventListener('close',cleanup,{once:true});dialog.showModal();
 });
}
async function fullImport(event){
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>10*1024*1024)throw Error('Fichier trop volumineux (10 Mo maximum).');
  const data=JSON.parse(await readTextFile(file));
  if(Array.isArray(data.sessions)&&data.sessions.length===1&&!Array.isArray(data.baskets)){
    const bilan=importSingleBilan(data);
    $('backupStatus').textContent=`Bilan du ${dateLabel(bilan.startedAt)} importé sans remplacer les autres données.`;
    return;
  }
  const checked=validateFullBackup(data);
  const choice=await chooseBackupImport();
  if(choice==='cancel'){$('backupStatus').textContent='Import annulé : aucune donnée modifiée.';return;}
  if(choice==='replace'&&!window.confirm('Remplacer toutes les données de cet espace ? Les données cloud pourront également être remplacées après synchronisation.')){
   $('backupStatus').textContent='Remplacement annulé.';return;
  }
  const selected=choice==='merge'?mergeBackup(checked):checked;
  // Conserver une copie téléchargeable de l’état précédent avant toute écriture.
  const before=createBackupData();
  download(JSON.stringify(before,null,2),`inventaires-u-avant-import-${new Date().toISOString().slice(0,10)}.json`,'application/json');
  const values=[
   [STORAGE_KEY,JSON.stringify(selected.bb)],
   [HISTORY_KEY,JSON.stringify(selected.hh)],
   [SESSION_KEY,JSON.stringify({sessions:selected.ss,activeId:selected.active})]
  ];
  if(selected.settings)values.push(
   [MODE_KEY,selected.settings.entryMode],
   [LIMIT_KEY,fmt(selected.settings.maxGrossGrams)],
   [DUPLICATE_CONFIRM_KEY,String(selected.settings.confirmDuplicates)]
  );
  // Capture complète des clés écrites pour une restauration annulable.
  const previous=values.map(([k])=>[k,localStorage.getItem(k)]);
  commitRestoredData(values);
  clearTimeout(autoSaveTimer);autoSaveTimer=null;
  dismissUndo();
  baskets=selected.bb;sessions=selected.ss;history=selected.hh;
  activeSessionId=selected.active;activeGroup=null;lastGroup=null;currentWeighId=null;
  if(selected.settings){entryMode=selected.settings.entryMode;maxGrossGrams=selected.settings.maxGrossGrams;confirmDuplicates=selected.settings.confirmDuplicates;}
  editingId=null;acceptedAnomalyKey='';$('grossWeight').value='';
  render();renderHistory();renderV22();
  $('backupStatus').textContent=choice==='merge'?`Fusion terminée : +${selected.addedSessions} inventaire(s), +${selected.addedBaskets} panier(s), +${selected.addedHistory} pesée(s) dans l’historique. ${selected.skippedSessions+selected.skippedBaskets} élément(s) déjà présent(s) ignoré(s).`:`Remplacement terminé : ${selected.ss.length} inventaire(s) et ${selected.bb.length} panier(s).`;
  offerUndo(choice==='merge'?'Fusion effectuée.':'Sauvegarde restaurée.',()=>{
    try{commitRestoredData(previous.map(([k,v])=>[k,v]));}catch{return false;}
    baskets=loadBaskets();history=loadHistory();
    const loaded=readJSON(SESSION_KEY,{sessions:[],activeId:null});
    sessions=(loaded.sessions||[]).map(cleanSession).filter(Boolean);activeSessionId=loaded.activeId||null;
    entryMode=safeGet(MODE_KEY)==='g'?'g':'kg';maxGrossGrams=parseKg(safeGet(LIMIT_KEY)||'20.000')||20000;
    confirmDuplicates=safeGet(DUPLICATE_CONFIRM_KEY)!=='false';
    render();renderHistory();renderV22();$('backupStatus').textContent='Restauration annulée : données précédentes rétablies.';return true;
  });
 }catch(e){
  $('backupStatus').textContent=`Restauration impossible : ${e instanceof SyntaxError?'fichier JSON illisible':e.message||'fichier non valide'}. Aucune donnée remplacée.`;
 }finally{event.target.value='';}
}
// Commandes V22.
$('modeKg').addEventListener('click',()=>switchMode('kg'));
$('modeG').addEventListener('click',()=>switchMode('g'));

// V30 — interrupteur glissable au doigt, avec clics et navigation clavier conservés.
(function setupSwipeMode(){
 const control=document.querySelector('.weigh-preferences-mode');
 const thumb=$('modeSlideThumb');
 if(!control||!thumb)return;
 let touch=null,ignoreClick=false;
 control.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
  touch={id:e.pointerId,x:e.clientX,initial:entryMode==='g'?1:0,progress:entryMode==='g'?1:0,dragging:false};
 });
 control.addEventListener('pointermove',e=>{
  if(!touch||e.pointerId!==touch.id)return;
  const dx=e.clientX-touch.x;
  if(!touch.dragging&&Math.abs(dx)<9)return;
  touch.dragging=true;
  const width=Math.max(1,(control.getBoundingClientRect().width-8)/2);
  touch.progress=Math.min(1,Math.max(0,touch.initial+dx/width));
  control.classList.add('is-dragging');
  thumb.style.transform=`translate3d(${touch.progress*width}px,0,0)`;
 });
 const finish=(e,cancelled)=>{
  if(!touch||e.pointerId!==touch.id)return;
  const state=touch;touch=null;
  if(!state.dragging)return;
  const width=Math.max(1,(control.getBoundingClientRect().width-8)/2);
  thumb.style.transform=`translate3d(${state.progress*width}px,0,0)`;
  control.classList.remove('is-dragging');
  // Une glissade horizontale suffisante valide le changement.
  const target=cancelled?state.initial:(state.initial===0?(state.progress>=.28?1:0):(state.progress<=.72?0:1));
  ignoreClick=true;
  if(!cancelled)switchMode(target?'g':'kg');
  // La prochaine frame lance la fin du glissement depuis la position du doigt.
  requestAnimationFrame(()=>thumb.style.removeProperty('transform'));
  // Safari peut déclencher un click après pointerup : ne pas revenir en arrière.
  window.setTimeout(()=>{ignoreClick=false;},350);
 };
 control.addEventListener('pointerup',e=>finish(e,false));
 control.addEventListener('pointercancel',e=>finish(e,true));
 control.addEventListener('click',e=>{if(!ignoreClick)return;e.preventDefault();e.stopImmediatePropagation();ignoreClick=false;},true);
})();

$('maxGrossLimit').addEventListener('change',setLimit);
$('confirmDuplicates').addEventListener('change',event=>{confirmDuplicates=event.target.checked;try{safeSetItem(DUPLICATE_CONFIRM_KEY,String(confirmDuplicates));}catch{}acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('confirmWarning').addEventListener('click',()=>{
 const gross=parseWeight($('grossWeight').value),b=baskets.find(x=>x.id===$('basketSelect').value);
 if(gross===null||!b)return;
 acceptedAnomalyKey=anomalyKey(gross,b);
 const wasScannerDraft=scannerDraft;
 scannerDraft=false;scannerDraftUI();
 calculate();
 if(saveCurrentWeigh()){
  if(wasScannerDraft)window.dispatchEvent(new Event('iu-weigh-scan-saved'));
 }else if(wasScannerDraft){
  scannerDraft=true;scannerDraftUI();
 }
});
$('iuScannedDraftConfirm')?.addEventListener('click',()=>{
 if(!scannerDraft)return;
 if(netGrams===null){
  $('weighStatus').textContent='Corrige la valeur du poids avant de valider.';
  return;
 }
 // Une anomalie (doublon, seuil) exige toujours sa confirmation dédiée.
 if(renderWarning()){
  $('weighStatus').textContent='Vérifie aussi l’avertissement avant l’enregistrement.';
  return;
 }
 scannerDraft=false;scannerDraftUI();
 if(!saveCurrentWeigh()){
  scannerDraft=true;scannerDraftUI();
 }else{
  window.dispatchEvent(new Event('iu-weigh-scan-saved'));
 }
});
$('focusPause').addEventListener('click',()=>animateFocusExit(()=>$('pauseSession').click()));
$('focusStop').addEventListener('click',()=>{$('focusConfirm').hidden=false;$('focusConfirmStop').focus();});
// « Continuer » ferme seulement la confirmation, sans aucune animation.
// L'animation d'ouverture est reservee au bouton « Annuler » de la
// notification « Inventaire terminé » (voir finishSession / offerUndo).
$('focusCancelStop').addEventListener('click',()=>{
 $('focusConfirm').hidden=true;
 $('focusStop').focus({preventScroll:true});
});
$('focusConfirmStop').addEventListener('click',()=>{$('focusConfirm').hidden=true;animateFocusExit(()=>$('finishSession').click());});
// Le rafraîchissement de la durée est centralisé dans l'horloge unique ci-dessous.
$('startSession').addEventListener('click',()=>animateFocusEntry(startSession));
$('pauseSession').addEventListener('click',pauseSession);
$('resumeSession').addEventListener('click',()=>animateFocusEntry(resumeSession));
$('finishSession').addEventListener('click',finishSession);
$('sessionsToggle').addEventListener('click',()=>animateExpandedList('sessionsHistoryList',()=>{sessionsExpanded=!sessionsExpanded;renderSessionsHistory();}));
$('iuInventorySort').addEventListener('change',event=>{iuInventorySort=event.target.value==='oldest'?'oldest':'recent';renderSessionsHistory();});
$('iuArchiveYear').addEventListener('change',event=>{iuArchiveYear=Number(event.target.value);iuArchiveMonth='all';iuArchiveUnclassified=false;sessionsExpanded=false;renderSessionsHistory();});
$('iuArchiveUnclassified').addEventListener('click',()=>{iuArchiveUnclassified=true;iuArchiveMonth='all';sessionsExpanded=false;renderSessionsHistory();});
$('iuArchiveByYear').addEventListener('click',()=>{iuArchiveUnclassified=false;iuArchiveMonth='all';sessionsExpanded=false;renderSessionsHistory();});
$('iuArchiveAllMonths').addEventListener('click',()=>{iuArchiveMonth='all';renderSessionsHistory();});
$('fullExportBtn').addEventListener('click',fullExport);
$('fullImportInput').addEventListener('change',fullImport);
$('sessionsCsvBtn').addEventListener('click',()=>{const ended=sessions.filter(s=>Boolean(s.endedAt));if(!ended.length){$('backupStatus').textContent='Aucune session terminée à exporter.';return;}exportCSV(ended,`inventaires-u-sessions-${new Date().toISOString().slice(0,10)}.csv`);$('backupStatus').textContent='CSV des sessions exporté.';});
setInterval(()=>{
 // Seul l'affichage périodique attend la fin des transitions, jamais
 // l'enregistrement, les pesées, les alertes ou la synchronisation.
 if(document.hidden||focusMotionBusy||document.body.classList.contains('iu-edge-swiping'))return;
 const liveStats=renderLiveSessionStats(false);
 if(liveStats&&!document.body.classList.contains('is-focus-mode'))
  renderHeroSummary(liveStats);
},1000);

$('basketForm').addEventListener('submit',e=>{e.preventDefault();const name=$('basketName').value.trim(),tare=parseKg($('basketTare').value);if(!name||tare===null){$('basketFormError').textContent='Indique un nom et une tare valide en kg (ex. 0.554).';return;}$('basketFormError').textContent='';const next=baskets.map(b=>({...b}));if(editingId){const b=next.find(x=>x.id===editingId);if(b){b.name=name;b.tare=tare;}}else next.push({id:uid(),name,tare});if(commitBaskets(next)){cancelEdit();$('basketFormError').textContent='';}});
$('basketName').addEventListener('input',()=>{$('basketFormError').textContent='';});
$('basketTare').addEventListener('input',()=>{$('basketFormError').textContent='';});



// V34.41 — Saisie iPhone stable : laisser Safari gérer le clavier et le
// cadrage. Le correctif V34.40 provoquait des retours en haut lors de
// certains changements de hauteur du visualViewport pendant un scroll.
// Ne plus écrire dans window.scrollTo lors de la saisie ou du défilement.
(function focusWeighingKeyboard(){
 const field=$('grossWeight');
 if(!field)return;
 field.setAttribute('enterkeyhint','done');
 field.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&document.body.classList.contains('is-focus-mode')){
   event.preventDefault();
   field.blur();
  }
 });
})();

$('grossWeight').addEventListener('input',()=>{
 acceptedAnomalyKey='';
 calculate();
 // En cas de correction manuelle, le brouillon est conservé jusqu'au
 // bouton de validation ; la saisie n'est jamais perdue ni auto-enregistrée.
 scheduleAutoSave();
});
$('basketSelect').addEventListener('change',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('grossWeight').addEventListener('blur',()=>{if(autoSaveTimer!==null)saveCurrentWeigh();});
// iOS peut suspendre le timer de 1,1 s dès que l'application se verrouille.
// Forcer une sauvegarde synchrone des données valides avant la suspension.
function saveBeforeSuspend(){if(autoSaveTimer!==null)saveCurrentWeigh();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveBeforeSuspend();else renderLiveSessionStats();});
window.addEventListener('pagehide',saveBeforeSuspend);
// Sur iOS, pointerdown.preventDefault() peut encore laisser le bouton
// voler le focus au champ (WebKit 316402 / 322721). mousedown permet
// de garder le clavier et le cadrage avant le clic Nouvelle pesée.
// Éviter qu'un appui sur Nouvelle pesée vole le focus au clavier iPhone.
// Aucune compensation de scroll ni listener global sur visualViewport.
$('resetBtn').addEventListener('mousedown',event=>{
 if(document.activeElement===$('grossWeight'))event.preventDefault();
});
$('resetBtn').addEventListener('click',newWeigh);


/* V36.11 — Historiques/Bilans : une seule trajectoire de hauteur, même
   après deux appuis rapprochés. Aucune animation des rafraîchissements. */
const iuListMotion=new WeakMap();
function animateExpandedList(id,renderChange){
 const list=$(id);if(!list){renderChange();return;}
 const previous=iuListMotion.get(list);
 const from=list.getBoundingClientRect().height;
 list.style.height=from+'px';list.style.overflow='hidden';
 if(previous){iuListMotion.delete(list);previous.cancel();}
 renderChange();
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||typeof list.animate!=='function'){
  list.style.removeProperty('height');list.style.removeProperty('overflow');return;
 }
 list.style.height='auto';const to=list.scrollHeight;
 list.style.height=from+'px';
 if(Math.abs(to-from)<1){
  list.style.removeProperty('height');list.style.removeProperty('overflow');return;
 }
 const duration=FOLD_MOTION_MS;
 const motion=list.animate([{height:from+'px'},{height:to+'px'}],{
  duration,easing:FOLD_MOTION_EASE,fill:'both'
 });
 iuListMotion.set(list,motion);
 motion.onfinish=()=>{
  if(iuListMotion.get(list)!==motion)return;
  iuListMotion.delete(list);list.style.height=to+'px';motion.cancel();
  list.style.removeProperty('height');list.style.removeProperty('overflow');
 };
}
$('historyToggleTop').addEventListener('click',toggleHistoryMore);
$('clearHistoryBtn').addEventListener('click',()=>{
 if(!history.length)return;
 const previous=history.map(e=>({...e})),previousExpanded=historyExpanded;
 clearTimeout(autoSaveTimer);autoSaveTimer=null;
 history=[];
 if(!persistHistory()){history=previous;return;}
 currentWeighId=null;historyExpanded=false;renderHistory();renderBackupSummary();
 $('weighStatus').textContent='Historique récent effacé.';
 offerUndo('Historique effacé.',()=>{
   // Conserver les nouvelles pesées éventuellement créées depuis la suppression.
   const existing=new Set(history.map(e=>e.id));
   const restored=[...history,...previous.filter(e=>!existing.has(e.id))]
     .sort((a,b)=>b.at-a.at).slice(0,15);
   try{safeSetItem(HISTORY_KEY,JSON.stringify(restored));}catch{return false;}
   history=restored;historyExpanded=previousExpanded;
   renderHistory();renderBackupSummary();
   $('weighStatus').textContent='Historique restauré.';
   return true;
 });
});
$('cancelEditBtn').addEventListener('click',cancelEdit);
let copyFeedbackTimer=null;
$('copyBtn').addEventListener('click',async()=>{
 if(netGrams===null||renderWarning()||!flushPending())return;
 const value=fmt(netGrams);
 let copied=false;
 if(navigator.clipboard && typeof navigator.clipboard.writeText==='function'){
  try{await navigator.clipboard.writeText(value);copied=true;}catch{}
 }
 if(!copied){
  const field=document.createElement('textarea');field.value=value;field.setAttribute('readonly','');
  field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(field);field.focus();field.select();
  try{copied=document.execCommand('copy');}catch{}
  field.remove();
 }
 if(copied){
  const btn=$('copyBtn'),label=$('copyBtnLabel');
  clearTimeout(copyFeedbackTimer);
  btn.classList.add('is-copied');
  label.textContent='Poids copié';
  btn.setAttribute('aria-label','Poids copié');
  copyFeedbackTimer=setTimeout(()=>{
   btn.classList.remove('is-copied');
   label.textContent='Copier';
   btn.setAttribute('aria-label','Copier le poids net');
  },1700);
 }else $('weighStatus').textContent=`Copie automatique indisponible. Sélectionne manuellement le poids net : ${value} kg.`;
});

$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'Inventaires U',version:2,unit:'g',baskets},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='inventaires-u-paniers.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('backupStatus').textContent='Export des paniers généré.';});
$('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await readTextFile(file));const items=Array.isArray(data)?data:data.baskets;if(!Array.isArray(items)||items.some(b=>!b||typeof b.name!=='string'||!Number.isFinite(Number(b.tare))||Number(b.tare)<0))throw Error('Format incorrect');const next=sanitize(items);if(!commitBaskets(next))throw Error('Stockage indisponible');dismissUndo();cancelEdit();$('backupStatus').textContent='Importation terminée.';}catch(err){$('backupStatus').textContent='Importation impossible : fichier non valide.';}finally{e.target.value='';}});



render();renderHistory();renderV22();
renderBackupSummary();
// V36.41 — Préparer les listes et bilans locaux pendant le splash.
// Utilise les fonctions existantes sans ouvrir de détails ni écrire de données.
window.IUPrewarmLocalPanels=()=>{
 renderHistory();
 renderSessionsHistory();
 renderBackupSummary();
 return true;
};
$('backupCard').addEventListener('toggle',()=>{if($('backupCard').open)renderBackupSummary();});
// V33.84 — vérifications régulières non bloquantes, sans rechargement forcé.
window.IUCanSafelyUpdate=()=>!getActiveSession();
if('serviceWorker'in navigator)window.addEventListener('load',async()=>{
 try{
  const reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
  window.IUWorkerRegistration=reg;
  const notify=()=>{
   if(reg.waiting&&navigator.serviceWorker.controller){
    window.dispatchEvent(new CustomEvent('iu-update-ready'));
    $('weighStatus').textContent=getActiveSession()
     ?'Mise à jour disponible : termine ton inventaire avant de l’appliquer.'
     :'Mise à jour disponible dans les réglages administrateur.';
   }
  };
  reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')notify();});});
  notify();
  // GitHub Pages peut mettre quelques instants à publier. Vérifier au retour
  // dans l'app limite ensuite le délai lié au cache SW.
  let lastCheck=0;
  const check=()=>{if(!navigator.onLine||document.visibilityState==='hidden'||Date.now()-lastCheck<15000)return;lastCheck=Date.now();reg.update().catch(()=>{});};
  document.addEventListener('visibilitychange',check);
  window.addEventListener('online',check);
  window.addEventListener('focus',check);
  setInterval(check,60000);
  check();
 }catch(e){console.warn('Service worker non disponible',e);}
});

// V34.50 — Notifications de connectivité à deux états (iPhone/PWA).
// Hors ligne persistant sauf fermeture manuelle ; reconnexion uniquement
// après un vrai passage hors ligne, puis auto-fermeture après 2,5 secondes.
// Le statut navigator.onLine indique le réseau, pas la disponibilité du cloud.
(function setupConnectivityNotices(){
 const offline=document.getElementById('offlineIndicator');
 const online=document.getElementById('onlineIndicator');
 const offlineDismiss=document.getElementById('offlineDismiss');
 const onlineDismiss=document.getElementById('onlineDismiss');
 if(!offline||!online||!offlineDismiss||!onlineDismiss)return;
 const stack=toastStack();
 offline.classList.add('toast-stacked-offline');
 online.classList.add('toast-stacked-offline');
 stack.append(offline,online);
 const exitTimers=new Map();
 let onlineTimer=null,debounceTimer=null;
 let offlineDismissed=false;
 let state=navigator.onLine?'online':'offline';
 function stopExit(notice){
  const timer=exitTimers.get(notice);
  if(timer!==undefined){clearTimeout(timer);exitTimers.delete(notice);}
 }
 function reveal(notice){
  stopExit(notice);
  if(!notice.hidden&&!notice.classList.contains('is-leaving'))return;
  notice.hidden=false;
  notice.classList.remove('is-entering','is-leaving');
  void notice.offsetWidth;
  notice.classList.add('is-entering');
 }
 function dismiss(notice){
  stopExit(notice);
  if(notice.hidden)return;
  notice.classList.remove('is-entering');
  notice.classList.add('is-leaving');
  const timer=setTimeout(()=>{
   if(exitTimers.get(notice)!==timer)return;
   notice.hidden=true;
   notice.classList.remove('is-leaving');
   exitTimers.delete(notice);
  },280);
  exitTimers.set(notice,timer);
 }
 function clearOnlineTimer(){if(onlineTimer!==null){clearTimeout(onlineTimer);onlineTimer=null;}}
 function showOffline(){
  clearOnlineTimer();
  dismiss(online);
  if(!offlineDismissed)reveal(offline);
  document.body.classList.toggle('offline-notice-visible',!offlineDismissed);
 }
 function showOnline(){
  dismiss(offline);
  document.body.classList.remove('offline-notice-visible');
  reveal(online);
  clearOnlineTimer();
  onlineTimer=setTimeout(()=>{onlineTimer=null;dismiss(online);},2500);
 }
 function wentOffline(){
  if(debounceTimer!==null){clearTimeout(debounceTimer);debounceTimer=null;}
  if(state==='offline')return;
  state='offline';
  offlineDismissed=false;
  showOffline();
 }
 function wentOnline(){
  if(state!=='offline'||debounceTimer!==null)return;
  // Attendre que le signal se stabilise : pas de fausse « reconnexion »
  // lors d'une alternance très brève Wi-Fi/cellulaire.
  debounceTimer=setTimeout(()=>{
   debounceTimer=null;
   if(!navigator.onLine||state!=='offline')return;
   state='online';
   showOnline();
  },700);
 }
 function sync(){
  if(navigator.onLine)wentOnline();
  else wentOffline();
 }
 offlineDismiss.addEventListener('click',()=>{
  offlineDismissed=true;
  document.body.classList.remove('offline-notice-visible');
  dismiss(offline);
 });
 onlineDismiss.addEventListener('click',()=>{clearOnlineTimer();dismiss(online);});
 window.addEventListener('online',sync);
 window.addEventListener('offline',sync);
 window.addEventListener('pageshow',sync);
 if(state==='offline')showOffline();
 else {offline.hidden=true;online.hidden=true;}
})();
 
 

/* V36.42 — Caches de dimensions, invalidation et diagnostic leger.
   Les clones sont mesures hors ecran pendant le splash, jamais caches dans
   localStorage : les tailles dependent du viewport, de l'utilisateur et du DOM. */
const IU_FOLD_CACHE=new WeakMap();
const IU_FOLD_METRICS=[];
let iuFoldMeasurementActive=false;
// V36.43 — Mode de comparaison graphique temporaire, sans données privées.
let iuFoldLightEffects=false;
window.IUSetFoldLightEffects=enabled=>{
 iuFoldLightEffects=Boolean(enabled);
 document.documentElement.classList.toggle('iu-test-light-fold-effects',iuFoldLightEffects);
 return iuFoldLightEffects;
};
window.IUGetFoldLightEffects=()=>iuFoldLightEffects;
const iuFoldStats={prepared:0,cacheHits:0,cacheMisses:0,liveCacheHits:0,lastWarmupMs:0,
 autoPrepared:0,autoSkipped:0};
// V36.54 — L'échantillonnage rAF produit lui-même du travail par image.
 // Désactivé en usage normal ; activation manuelle dans l'administration.
let iuFoldFrameDiagnosticsEnabled=false;
window.IUGetFoldFrameDiagnostics=()=>iuFoldFrameDiagnosticsEnabled;
window.IUSetFoldFrameDiagnostics=enabled=>{
 iuFoldFrameDiagnosticsEnabled=Boolean(enabled);
 return iuFoldFrameDiagnosticsEnabled;
};
window.IUFoldPerformance=()=>({
 ...iuFoldStats,
 frameDiagnosticsEnabled:iuFoldFrameDiagnosticsEnabled,
 recent:IU_FOLD_METRICS.slice(-16).map(item=>({...item}))
});
window.IUPrewarmFoldLayouts=async(progress,options={})=>{
 if(iuFoldMeasurementActive)return false;
 const automatic=options?.automatic===true;
 iuFoldMeasurementActive=true;
 const started=performance.now();
 let workMs=0;
 let cards=[...document.querySelectorAll('details[data-unified-fold="yes"]')]
  // Les sous-tiroirs héritent de styles contextuels difficiles à cloner :
  // seules les cartes directement sous .app sont mesurables sans risque.
  .filter(card=>card.parentElement?.classList.contains('app')&&!card.hidden);
 if(automatic){
  // Préchauffage très sélectif : exclure les historiques volumineux et
  // les formulaires d'administration/compte (données sensibles ou dynamiques).
  // Ne garder que deux tiroirs fermés et peu chargés au maximum.
  const preferred=['backupCard','basket-card','history-card','sessions-history-card'];
  cards=preferred.map(key=>cards.find(card=>card.id===key||card.classList.contains(key)))
   .filter((card,index,all)=>card&&all.indexOf(card)===index)
   .filter(card=>!card.open&&!card.closest('[hidden]')&&
    card.querySelectorAll('*').length<=105)
   .slice(0,2);
 }
 const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
 const canContinue=()=>!document.hidden&&!focusMotionBusy&&
  !document.documentElement.classList.contains('iu-pwa-starting')&&
  !document.body.classList.contains('iu-edge-swiping')&&
  !document.body.classList.contains('is-focus-mode')&&
  !(window.IUIsHeavyFoldAnimating?.())&&
  !document.querySelector('.iu-fold-animating');
 let done=0;
 try{
  for(const card of cards){
   if(automatic&&(!canContinue()||performance.now()-started>110||workMs>26))break;
   let root=null;
   const startedCard=performance.now();
   try{
    // Aucun <details> réel n'est ouvert ou modifié.
    const owner=card.closest('.app');
    root=document.createElement(automatic?'main':'div');
    root.className='app';
    root.setAttribute('aria-hidden','true');
    root.style.cssText='position:fixed!important;left:-200vw!important;top:0!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important;';
    const width=owner?.getBoundingClientRect().width||document.documentElement.clientWidth;
    root.style.width=width+'px';
    const clone=card.cloneNode(true);
    clone.removeAttribute('hidden');
    clone.style.cssText='height:auto!important;max-height:none!important;animation:none!important;transition:none!important;';
    clone.open=false;
    root.append(clone);document.body.append(root);
    const closedRect=clone.getBoundingClientRect();
    const closed=closedRect.height;
    clone.open=true;
    const expanded=clone.getBoundingClientRect().height;
    // En mode automatique, ne cacher que des mesures dont la largeur réelle
    // correspond (sinon l'ouverture doit refaire une mesure fiable).
    const realWidth=card.getBoundingClientRect().width;
    const matching=!automatic||Math.abs(closedRect.width-realWidth)<1.5;
    if(matching&&Number.isFinite(closed)&&Number.isFinite(expanded)&&expanded>=closed&&closed>0){
     IU_FOLD_CACHE.set(card,{closed,expanded,width:realWidth,
      viewport:window.innerWidth,source:'clone'});
     iuFoldStats.prepared++;
     if(automatic)iuFoldStats.autoPrepared++;
    }else if(automatic)iuFoldStats.autoSkipped++;
   }catch(error){
    if(automatic)iuFoldStats.autoSkipped++;
    console.debug('Preparation dimension tiroir ignoree',error);
   }finally{
    root?.remove(); // toujours libérer les nœuds temporaires
    workMs+=performance.now()-startedCard;
   }
   done++;
   if(typeof progress==='function')progress(done,cards.length);
   // Le préchauffage automatique relâche le main thread entre deux cartes.
   if(automatic)await new Promise(resolve=>setTimeout(resolve,400));
   else await yieldFrame();
  }
  iuFoldStats.lastWarmupMs=Math.round(automatic?workMs:performance.now()-started);
  return done>0;
 }finally{iuFoldMeasurementActive=false;}
};
window.addEventListener('resize',()=>{
 // Le cache verifie aussi la largeur et le viewport au moment d'utilisation.
 iuFoldStats.prepared=0;
},{passive:true});

/* V40.09 — Préchauffage adaptatif : uniquement après l'ouverture, en période
   d'inactivité et jamais sur les données métier. Aucune prolongation du splash.
   Les calculs préparés restent dans le WeakMap existant et sont invalidés
   lors d'une modification du contenu ou de la largeur du viewport. */
(function iuScheduleGentleFoldWarmup(){
 let lastActivity=performance.now(),attempts=0,finished=false,stopped=false;
 let timer=0,idle=0;
 const recordActivity=()=>{lastActivity=performance.now();};
 for(const type of ['pointerdown','touchstart','keydown','scroll'])
  document.addEventListener(type,recordActivity,{passive:true,capture:true});
 const cleanup=()=>{
  stopped=true;
  if(timer)clearTimeout(timer);
  if(idle&&typeof cancelIdleCallback==='function')cancelIdleCallback(idle);
  for(const type of ['pointerdown','touchstart','keydown','scroll'])
   document.removeEventListener(type,recordActivity,true);
 };
 window.addEventListener('pagehide',cleanup,{once:true});
 const eligible=()=>{
  if(document.hidden||focusMotionBusy||iuFoldMeasurementActive)return false;
  if(performance.now()-lastActivity<1700)return false;
  if(document.documentElement.classList.contains('iu-pwa-starting'))return false;
  if(document.body.classList.contains('iu-edge-swiping')||
     document.body.classList.contains('is-focus-mode')||
     document.querySelector('.iu-fold-animating'))return false;
  if(window.IUIsHeavyFoldAnimating?.())return false;
  if(navigator.connection?.saveData||navigator.deviceMemory&&navigator.deviceMemory<4||
     navigator.hardwareConcurrency&&navigator.hardwareConcurrency<4)return false;
  return true;
 };
 const tryWarm=deadline=>{
  idle=0;
  if(stopped||finished)return;
  // Ne jamais lancer de clones quand le navigateur n'a pas assez de marge.
  if(!eligible()||(deadline&&deadline.timeRemaining()<13)){
   if(++attempts<9)schedule(2000);
   else cleanup();
   return;
  }
  finished=true; // une seule session de préchauffage, au maximum
  Promise.resolve(window.IUPrewarmFoldLayouts?.(null,{automatic:true}))
   .catch(()=>{}).finally(cleanup);
 };
 const schedule=delay=>{
  if(stopped||finished)return;
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{
   timer=0;
   if(stopped||finished)return;
   if(typeof requestIdleCallback==='function')
    idle=requestIdleCallback(tryWarm);
   else tryWarm(null); // Safari sans requestIdleCallback : après repos prolongé
  },delay);
 };
 window.addEventListener('load',()=>schedule(2100),{once:true});
})();

/* V36.38 — Inspiré de Grafikart : limiter les lectures/écritures forcées.
   Le JavaScript ne réécrit plus height à chaque frame : Web Animations
   interpole la hauteur. Une mesure initiale par interaction, puis un rendu
   géré par le navigateur ; l'icône reste animée par transform en CSS.
   Les doubles appuis reprennent à la hauteur réellement affichée. */
const FOLD_MOTION_MS=420;
const FOLD_MOTION_EASE='cubic-bezier(.28,.72,.24,1)';
window.IU_FOLD_MOTION=Object.freeze({duration:FOLD_MOTION_MS,easing:FOLD_MOTION_EASE});
const foldReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
// V36.52 — Une information de cycle de vie, limitée aux deux grands volets.
// Elle permet aux statistiques / contrôles réseau secondaires d'attendre la fin
// du mouvement sans modifier la moindre animation ou son esthétique.
const iuBusyHeavyFolds=new Set();
window.IUIsHeavyFoldAnimating=()=>iuBusyHeavyFolds.size>0;
// V36.55 — Allégement graphique temporaire des deux grands tiroirs.
// On garde les ombres extérieures des cartes et le moteur natif.
// Réversible depuis le tableau de bord sans recharger la PWA.
let iuHeavyPaintLiteEnabled=true;
window.IUGetHeavyPaintLite=()=>iuHeavyPaintLiteEnabled;
window.IUSetHeavyPaintLite=enabled=>{
 iuHeavyPaintLiteEnabled=Boolean(enabled);
 return iuHeavyPaintLiteEnabled;
};
// V36.56 — Gel léger, réversible : pause des animations décoratives
// internes et report des seules écritures du diagnostic administrateur.
// Ne bloque ni les clics, ni le login, ni les sauvegardes ou le réseau.
let iuHeavyContentFreezeEnabled=false;
window.IUGetHeavyContentFreeze=()=>iuHeavyContentFreezeEnabled;
window.IUSetHeavyContentFreeze=enabled=>{
 iuHeavyContentFreezeEnabled=Boolean(enabled);
 return iuHeavyContentFreezeEnabled;
};
// V36.53 : test A/B sans affecter les autres tiroirs, ni le mode par défaut.
let iuHeavyFoldMotionMode='native';
window.IUGetHeavyFoldMotionMode=()=>iuHeavyFoldMotionMode;
window.IUSetHeavyFoldMotionMode=mode=>{
 if(mode!=='native'&&mode!=='raf')return iuHeavyFoldMotionMode;
 iuHeavyFoldMotionMode=mode;
 return iuHeavyFoldMotionMode;
};
// Équivalent du cubic-bezier CSS (.28,.72,.24,1), calculé sur le TEMPS
// écoulé. La recherche binaire inverse x(t) pour conserver la même courbe.
function iuHeavyFoldEase(progress){
 if(progress<=0)return 0;
 if(progress>=1)return 1;
 let low=0,high=1,t=progress;
 for(let i=0;i<10;i++){
  const s=1-t;
  const x=3*s*s*t*.28+3*s*t*t*.24+t*t*t;
  if(x<progress)low=t;else high=t;
  t=(low+high)/2;
 }
 const s=1-t;
 return 3*s*s*t*.72+3*s*t*t*1+t*t*t;
}
function setupUnifiedFold(card,summary,content,closingClass='is-fold-closing'){
 if(!card||!summary||!content||card.dataset.unifiedFold==='yes')return;
 card.dataset.unifiedFold='yes';
 const isHeavyFold=card.id==='planningAdminCard'||card.id==='accountCard';
 // Le cache géométrique d'un grand volet doit aussi être invalidé quand
 // une sous-rubrique s'ouvre ou quand une section se masque (auth/admin).
 // Les indicateurs et barres de progression n'invalident toujours pas
 // la mesure à chaque modification de style.
 const invalidator=new MutationObserver(records=>{
  if(records.some(r=>r.type==='childList'||r.type==='characterData'||
   (isHeavyFold&&r.type==='attributes'&&
    (r.attributeName==='hidden'||r.attributeName==='open'))))
   IU_FOLD_CACHE.delete(card);
 });
 invalidator.observe(content,{
  subtree:true,childList:true,characterData:true,
  ...(isHeavyFold?{attributes:true,attributeFilter:['hidden','open']}:{})
 });
 let intended=card.open,animation=null,animationStartedAt=0,pendingCloseFrame=0;
 let activeEngine='native';
 let rafSamples=0,lastSampleAt=0,sampleGaps=0,largestGap=0,frameLoop=0;
 const stopSampling=()=>{
  if(frameLoop){cancelAnimationFrame(frameLoop);frameLoop=0;}
 };
 const beginSampling=()=>{
  stopSampling();rafSamples=0;sampleGaps=0;largestGap=0;lastSampleAt=0;
  if(!iuFoldFrameDiagnosticsEnabled)return;
  const sample=now=>{
   if(!animation){frameLoop=0;return;}
   if(lastSampleAt){
    const gap=now-lastSampleAt;
    if(gap>34)sampleGaps++;
    largestGap=Math.max(largestGap,gap);
   }
   lastSampleAt=now;rafSamples++;
   frameLoop=requestAnimationFrame(sample);
  };
  frameLoop=requestAnimationFrame(sample);
 };
 const isEvents=card.id==='eventsDisclosure';
 const beginHeavyFold=()=>{
  if(!isHeavyFold||iuBusyHeavyFolds.has(card))return;
  if(iuHeavyPaintLiteEnabled)card.classList.add('iu-heavy-paint-lite');
  if(iuHeavyContentFreezeEnabled)card.classList.add('iu-heavy-content-frozen');
  iuBusyHeavyFolds.add(card);
  window.dispatchEvent(new CustomEvent('iu-heavy-fold-start',{detail:{id:card.id}}));
 };
 const endHeavyFold=()=>{
  if(!isHeavyFold)return;
  card.classList.remove('iu-heavy-paint-lite','iu-heavy-content-frozen');
  if(!iuBusyHeavyFolds.delete(card))return;
  window.dispatchEvent(new CustomEvent('iu-heavy-fold-end',{detail:{id:card.id}}));
 };
 const isAdminCategory=card.classList.contains('iu-admin-category');
 const px=value=>parseFloat(value)||0;
 // Expérience activable depuis le tableau de bord : boucle rAF pilotée
 // par le timestamp réel, jamais par un incrément fixe de pixels/frame.
 // Le navigateur continue de gérer tous les autres tiroirs avec WAAPI.
 function makeHeightMotion(from,to,duration){
  activeEngine=isHeavyFold&&iuHeavyFoldMotionMode==='raf'?'raf':'native';
  if(activeEngine==='native'){
   return card.animate([{height:from+'px'},{height:to+'px'}],{
    duration,easing:FOLD_MOTION_EASE,fill:'both'
   });
  }
  const startedAt=performance.now();
  let frame=0,cancelled=false;
  const motion={
   onfinish:null,oncancel:null,
   cancel(){
    if(cancelled)return;
    cancelled=true;
    if(frame)cancelAnimationFrame(frame);
    if(typeof motion.oncancel==='function')motion.oncancel();
   }
  };
  const step=timestamp=>{
   if(cancelled)return;
   if(!card.isConnected){
    motion.cancel();
    if(animation===motion){animation=null;stopSampling();cleanup();}
    return;
   }
   const progress=Math.min(1,Math.max(0,(timestamp-startedAt)/duration));
   const eased=iuHeavyFoldEase(progress);
   card.style.height=(from+(to-from)*eased).toFixed(2)+'px';
   if(progress>=1){
    if(typeof motion.onfinish==='function')motion.onfinish();
   }else{
    frame=requestAnimationFrame(step);
   }
  };
  frame=requestAnimationFrame(step);
  return motion;
 }
 function cleanup(){
  card.style.removeProperty('height');
  card.style.removeProperty('overflow');
  card.classList.remove('iu-fold-animating',closingClass,'iu-admin-animating');
  if(isEvents)card.removeAttribute('data-motion');
  endHeavyFold();
 }
 function finish(anim,to){
  if(animation!==anim)return;
  // Maintenir la dernière hauteur avant l'annulation évite une frame de saut.
  card.style.height=to+'px';
  animation=null;
  anim.cancel();
  card.open=intended;
  cleanup();
  stopSampling();
  IU_FOLD_METRICS.push({name:card.id||card.className.slice(0,40),
   durationMs:Math.round(performance.now()-animationStartedAt),
   frames:rafSamples,slowFrames:sampleGaps,maxGapMs:Math.round(largestGap),
   effects:iuFoldLightEffects?'allégés':(iuHeavyPaintLiteEnabled&&isHeavyFold?'optimisés':'normaux'),
   engine:activeEngine,
   direction:intended?'ouverture':'fermeture',
   measured:rafSamples>0,
   approxFps:rafSamples>1?Math.round((rafSamples-1)*1000/Math.max(1,performance.now()-animationStartedAt)):0,
   pixels:Math.round(Math.abs(to-(card.dataset.iuFoldStart?Number(card.dataset.iuFoldStart):to)))});
  if(IU_FOLD_METRICS.length>24)IU_FOLD_METRICS.shift();
  window.dispatchEvent(new Event('iu-fold-performance'));
  delete card.dataset.iuFoldStart;
 }
 card.addEventListener('toggle',()=>{if(!animation&&!pendingCloseFrame)intended=card.open;});
 summary.addEventListener('click',event=>{
  if(event.defaultPrevented)return;
  event.preventDefault();
  const rect=card.getBoundingClientRect();
  const from=rect.height;
  // V36.54 — Seule une mesure réelle du tiroir totalement ouvert
  // peut être réutilisée. Les clones de préparation restent des solutions
  // de repli pour éviter un cache imprécis après authentification.
  const cached=(!intended&&isHeavyFold)?IU_FOLD_CACHE.get(card):null;
  const canOpenFromCache=Boolean(cached?.source==='live'&&
   cached.viewport===window.innerWidth&&Math.abs(cached.width-rect.width)<1&&
   Number.isFinite(cached.closed)&&Number.isFinite(cached.expanded)&&
   cached.expanded>=cached.closed&&cached.closed>0);
  const wasFullyOpen=isHeavyFold&&intended&&card.open&&!animation&&
   !pendingCloseFrame&&!card.style.height;
  // V36.48 : regrouper TOUTES les lectures du grand tiroir avant
  // la première écriture style, pour éviter un layout forcé supplémentaire.
  let closingTarget=null;
  if(intended&&(card.id==='accountCard'||card.id==='planningAdminCard')){
   const cs=getComputedStyle(card);
   const borders=px(cs.borderTopWidth)+px(cs.borderBottomWidth);
   closingTarget=summary.getBoundingClientRect().height+
    borders+px(cs.paddingTop)+px(cs.paddingBottom);
  }
  // La hauteur mesurée à la fermeture d'un volet stabilisé est
  // réutilisable aux ouvertures suivantes, sans forcer height:auto +
  // scrollHeight sur tout son tableau de bord.
  if(wasFullyOpen&&closingTarget!==null&&from>=closingTarget){
   IU_FOLD_CACHE.set(card,{
    closed:closingTarget,expanded:from,width:rect.width,
    viewport:window.innerWidth,source:'live'
   });
  }
  // Conserver le point visible pendant l'annulation de l'ancienne trajectoire.
  card.style.height=from+'px';
  // Annuler une fermeture préparée mais pas encore envoyée au navigateur.
  if(pendingCloseFrame){cancelAnimationFrame(pendingCloseFrame);pendingCloseFrame=0;}
  const previous=animation;animation=null;
  stopSampling();
  if(previous)previous.cancel();
  intended=!intended;
  if(foldReducedMotion.matches||typeof card.animate!=='function'){
   card.open=intended;cleanup();return;
  }
  // V36.48 : sur les deux cartes lourdes, la fermeture ne modifie pas
  // temporairement open/height:auto pour relire tout le contenu.
  // Lire seulement la hauteur visible et l'en-tête, puis regrouper les
  // écritures CSS dans requestAnimationFrame, juste avant la peinture.
  // Une seule animation native de height, sans boucle JavaScript par image.
  if(!intended&&closingTarget!==null){
   const to=Math.min(from,closingTarget);
   if(Math.abs(from-to)<1){card.open=false;cleanup();return;}
   // V36.49 — Une seule écriture de hauteur durant le clic (ci-dessus).
   // Les changements de classes et d'overflow sont regroupés dans la
   // prochaine frame, sans nouvelle lecture de layout après ces écritures.
   // Cela évite une invalidation du rendu sur la frame intermédiaire.
   pendingCloseFrame=requestAnimationFrame(()=>{
    pendingCloseFrame=0;
    // Une réouverture rapide annule le travail sans laisser de styles
    // transitoires ou d'animation concurrente.
    if(intended||!card.isConnected){cleanup();return;}
    card.style.overflow='hidden';
    card.classList.add('iu-fold-animating',closingClass);
    const anim=makeHeightMotion(from,to,FOLD_MOTION_MS);
    animation=anim;
    beginHeavyFold();
    animationStartedAt=performance.now();
    beginSampling();
    card.dataset.iuFoldStart=String(from);
    anim.onfinish=()=>finish(anim,to);
    anim.oncancel=()=>{if(animation===anim){animation=null;stopSampling();cleanup();}};
   });
   return;
  }
  // Le moteur des autres tiroirs et toute l'ouverture restent inchangés.
  // Grouper les mesures avant le lancement de la nouvelle animation.
  // La hauteur du contenu ne sera plus consultée à chaque image.
  card.open=true;
  // Pour un grand volet inchangé, la hauteur ouverte exacte a été mesurée
  // à sa dernière fermeture. Safari peut lancer WAAPI directement sans
  // recalculer la hauteur de tout le contenu et de ses descendants.
  // Le moindre changement de contenu/visibilité invalide cette voie rapide.
  if(!canOpenFromCache)card.style.height='auto';
  const prepared=canOpenFromCache?cached:IU_FOLD_CACHE.get(card);
  const valid=canOpenFromCache||Boolean(prepared&&
   prepared.viewport===window.innerWidth&&
   Math.abs(prepared.width-rect.width)<1);
  let collapsed,expanded;
  if(canOpenFromCache){
   collapsed=cached.closed;
   expanded=cached.expanded;
   iuFoldStats.liveCacheHits++;
  }else{
   const cs=getComputedStyle(card);
   const borders=px(cs.borderTopWidth)+px(cs.borderBottomWidth);
   collapsed=valid?prepared.closed:summary.getBoundingClientRect().height+
    borders+px(cs.paddingTop)+px(cs.paddingBottom);
   expanded=valid?prepared.expanded:Math.max(collapsed,card.scrollHeight+borders);
  }
  if(valid)iuFoldStats.cacheHits++;else iuFoldStats.cacheMisses++;
  const to=intended?expanded:collapsed;
  card.style.height=from+'px';
  card.style.overflow='hidden';
  card.classList.add('iu-fold-animating');
  card.classList.toggle(closingClass,!intended);
  if(isAdminCategory)card.classList.add('iu-admin-animating');
  if(isEvents)card.dataset.motion=intended?'opening':'closing';
  if(Math.abs(to-from)<1){
   card.open=intended;cleanup();return;
  }
  const distance=Math.abs(to-from)/Math.max(1,expanded-collapsed);
  // V36.58 — Uniquement l'ouverture des grands volets est ralentie.
  // Fermeture et autres tiroirs restent à 420 ms pour une course complète.
  const openingMs=isHeavyFold&&intended?520:FOLD_MOTION_MS;
  const duration=Math.max(150,Math.round(openingMs*Math.min(1,distance)));
  // Une animation déclarative et une seule écriture de hauteur au démarrage.
  const anim=makeHeightMotion(from,to,duration);
  animation=anim;
  beginHeavyFold();
  animationStartedAt=performance.now();
  beginSampling();
  card.dataset.iuFoldStart=String(from);
  anim.onfinish=()=>finish(anim,to);
  anim.oncancel=()=>{if(animation===anim){animation=null;stopSampling();cleanup();}};
 });
}
window.IUSetupFold=setupUnifiedFold;
(function setupAllFolds(){
 const bind=(selector,summary,content,closing)=>{
  document.querySelectorAll(selector).forEach(card=>
   setupUnifiedFold(card,card.querySelector(summary),card.querySelector(content),closing));
 };
 // L'administration n'est plus un accordéon : elle occupe une vue dédiée.
 bind('.fold-card:not(#planningAdminCard):not(#accountCard)',':scope > .fold-summary',':scope > .fold-body','is-fold-closing');
 bind('#planningAdminCard .planning-accordion',':scope > .planning-panel-summary',':scope > .planning-panel-content','is-planning-closing');
 bind('.planning-import-help',':scope > summary',':scope > .planning-import-help-body','is-detail-closing');
 bind('details.calc-alerts',':scope > summary',':scope > .calc-alerts-body, :scope > .recovery-body','is-detail-closing');
 bind('details.backup-advanced',':scope > summary',':scope > .backup-advanced-body','is-detail-closing');
 bind('details.events-disclosure',':scope > summary',':scope > .events-disclosure-content','is-events-closing');
 bind('#eventsOtherPanel',':scope > .iu-events-other-summary',':scope > .iu-events-other-list','is-events-closing');
 bind('#planningAdminCard details.iu-admin-category',':scope > summary',':scope > .iu-admin-category-body','is-admin-closing');
 const adminCard=$('planningAdminCard');
 // La flèche d'accès aux réglages est maintenant directement dans
 // index.html, comme avant v36.69. Ne pas ajouter l'icône de lecture.
 const summary=adminCard?.querySelector(':scope > summary');
 summary?.addEventListener('click',event=>{
  event.preventDefault();
  iuOpenAdminPage();
 });
 $('iuAdminReturn')?.addEventListener('click',()=>iuCloseAdminPage()); $('iuAdminReturnLoading')?.addEventListener('click',()=>iuCloseAdminPage());
 // Même navigation par page que l'administrateur. Ne jamais activer
 // l'animation d'accordéon sur un <details> qui contient les données Google.
 const accountCard=$('accountCard');
 const accountSummary=accountCard?.querySelector(':scope > summary');
 accountSummary?.addEventListener('click',event=>{
  event.preventDefault();
  iuOpenAccountPage();
 });
 $('iuAccountLaunch')?.addEventListener('click',event=>{
  event.preventDefault();
  event.stopPropagation();
  iuOpenAccountPage();
 });
 // Les deux pages n'ont qu'un Retour. L'actualisation de
 // l'état des services reste dans sa rubrique (#opsRefresh).
 $('iuAccountReturn')?.addEventListener('click',()=>iuCloseAccountPage()); $('iuAccountReturnGuest')?.addEventListener('click',()=>iuCloseAccountPage());
 $('eventsOpenPage')?.addEventListener('click',()=>iuOpenEventsPage());
 $('iuEventsReturn')?.addEventListener('click',()=>iuCloseEventsPage());
 $('iuAlertsReturn')?.addEventListener('click',()=>iuCloseAlertsPage());
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('is-admin-mode')){
   event.preventDefault();iuCloseAdminPage();
  }else if(event.key==='Escape'&&document.body.classList.contains('is-account-mode')){
   event.preventDefault();iuCloseAccountPage();
  }else if(event.key==='Escape'&&document.body.classList.contains('is-events-mode')){
   event.preventDefault();iuCloseEventsPage();
  }
  else if(event.key==='Escape'&&document.body.classList.contains('is-alerts-mode')){
   event.preventDefault();iuCloseAlertsPage();
  }
 });
 if(adminCard){
  // Si l'accès est révoqué (déconnexion / RLS), ne jamais laisser
  // la vue administrateur affichée alors que le volet est masqué.
  new MutationObserver(()=>{
   if(adminCard.hidden||adminCard.dataset.adminLoading==='true')
    iuCloseAdminPage(true);
  }).observe(adminCard,{attributes:true,attributeFilter:['hidden','data-admin-loading']});
 }
})();
function setupSecondaryDetailsAnimation(card,bodySelector){
 if(!card)return;
 setupUnifiedFold(card,card.querySelector(':scope > summary'),card.querySelector(`:scope > ${bodySelector}`),'is-detail-closing');
}
// V37.41 — Action adaptée à l'état : naviguer, reprendre ou ouvrir un bilan.
(function setupHeroSessionAction(){
 const trigger=$('heroStartSession');if(!trigger)return;
 const scrollTo=target=>{
  if(!target)return;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({behavior:reduce?'auto':'smooth',block:'center',inline:'nearest'});
 };
 trigger.addEventListener('click',()=>{
  const session=getActiveSession();
  if(session?.pausedAt){$('resumeSession')?.click();return;}
  if(!session&&latestFinishedInventory()){
   const card=document.querySelector('.sessions-history-card');if(!card)return;
   const wasOpen=card.open;
   if(!wasOpen)card.querySelector(':scope > summary')?.click();
   window.setTimeout(()=>{
    const latest=card.querySelector('#sessionsHistoryList .v22-session-item');
    if(latest&&!latest.open)latest.querySelector(':scope > summary')?.click();
    scrollTo(latest||card);
   },wasOpen?130:480);
   return;
  }
  const target=session?$('pauseSession'):$('startSession');
  scrollTo(target&&!target.hidden?target:document.querySelector('.session-card'));
 });
})();
// Le planning reste le détenteur de la date, même après une mise à jour cloud.
window.addEventListener('iu-planning-updated',renderHeroSummary);
(function watchHeroPlanningDate(){
 const date=$('calendarNextDate'),countdown=$('calendarNextCountdown');
 if(typeof MutationObserver!=='function'||!date)return;
 const observer=new MutationObserver(()=>{if(!getActiveSession())renderHeroSummary();});
 observer.observe(date,{subtree:true,characterData:true,childList:true});
 if(countdown)observer.observe(countdown,{subtree:true,characterData:true,childList:true,attributes:true,attributeFilter:['hidden']});
})();

// Détection des changements provenant d'un autre onglet.
let externalDataChanged=false;
window.addEventListener('storage',event=>{
 if(![STORAGE_KEY,HISTORY_KEY,SESSION_KEY,MODE_KEY,LIMIT_KEY,DUPLICATE_CONFIRM_KEY].includes(event.key))return;
 externalDataChanged=true;
 showActionToast('Données modifiées dans un autre onglet. Actualise cette page avant de continuer.',{reload:true,persistent:true});
});
function safeSetItem(key,value){if(externalDataChanged)throw Error('Autre onglet détecté');localStorage.setItem(key,value);}


/* V34.76 — Safari iOS/PWA : neutraliser le zoom au double-tap sans gêner
   le scroll, les champs éditables ni les gestes multi-doigts. */
(function preventDoubleTapZoom(){
  let lastTapTime=0,lastX=0,lastY=0,tracking=null;
  const editable=el=>Boolean(el&&el.closest&&el.closest('input,textarea,select,[contenteditable="true"]'));
  document.addEventListener('touchstart',e=>{
    if(e.touches.length!==1){tracking=null;lastTapTime=0;return;}
    const t=e.touches[0];
    tracking={x:t.clientX,y:t.clientY,moved:false};
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!tracking||e.touches.length!==1)return;
    const t=e.touches[0];
    if(Math.hypot(t.clientX-tracking.x,t.clientY-tracking.y)>12)tracking.moved=true;
  },{passive:true});
  document.addEventListener('touchend',e=>{
    if(!tracking||tracking.moved||e.changedTouches.length!==1||e.touches.length){tracking=null;lastTapTime=0;return;}
    const t=e.changedTouches[0],now=Date.now();
    if(!editable(e.target)&&now-lastTapTime<340&&Math.hypot(t.clientX-lastX,t.clientY-lastY)<32){
      if(e.cancelable)e.preventDefault();
      lastTapTime=0;
    }else{
      lastTapTime=now;lastX=t.clientX;lastY=t.clientY;
    }
    tracking=null;
  },{passive:false});
  document.addEventListener('touchcancel',()=>{tracking=null;lastTapTime=0;},{passive:true});
})();


/* V38.65 — Barre commune à toutes les pages secondaires.
   Sortie unique vers les fonctions de navigation existantes ;
   position fixe au-dessus de la page (pas de parent transformé sur Safari). */
(function setupSubpageBar(){
 const bar=$('iuSubpageBar'), back=$('iuSubpageBack');
 if(!bar||!back)return;
 const modes=['is-admin-mode','is-account-mode','is-events-mode','is-alerts-mode'];
 let pending=false,wasActive=false,canCompact=false,touchStartY=null,touchStartX=null;
 function active(){return modes.some(mode=>document.body.classList.contains(mode));}
 // Seul un défilement réel de l'utilisateur permet le compactage.
 document.addEventListener('touchstart',event=>{
  if(!active()||event.touches.length!==1)return;
  touchStartY=event.touches[0].clientY;
  touchStartX=event.touches[0].clientX;
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  if(!active()||touchStartY===null||event.touches.length!==1)return;
  const dy=Math.abs(event.touches[0].clientY-touchStartY);
  const dx=Math.abs(event.touches[0].clientX-touchStartX);
  // Ne pas compacter pendant un balayage horizontal ou l'entrée de page.
  if(dy>12&&dy>dx*1.3&&!document.body.classList.contains('iu-subpage-entering')&&!document.body.classList.contains('iu-edge-swiping')){
   canCompact=true;schedule();
  }
 },{passive:true});
 document.addEventListener('touchend',()=>{touchStartY=null;touchStartX=null;},{passive:true});
 document.addEventListener('touchcancel',()=>{touchStartY=null;touchStartX=null;},{passive:true});
 window.addEventListener('wheel',event=>{
  if(active()&&Math.abs(event.deltaY)>2){canCompact=true;schedule();}
 },{passive:true});
 function refresh(){
  pending=false;
  const nowActive=active();
  if(!nowActive){
   bar.hidden=true;
   bar.dataset.compact='false';
   wasActive=false;
   canCompact=false;
   touchStartY=null;
   touchStartX=null;
   return;
  }
  if(!wasActive){
   wasActive=true;
   canCompact=false;
  }
  bar.hidden=false;
  // Pendant l'entrée, garder le bandeau dans son état initial 70px.
  // Le scroll peut encore indiquer celui de l'accueil pendant une frame
  // sur Safari et provoquait une contraction à 55px au mauvais moment.
  if(document.body.classList.contains('iu-subpage-entering')||!canCompact){
   bar.dataset.compact='false';
   return;
  }
  const y=Math.max(window.scrollY||0,document.scrollingElement?.scrollTop||0);
  bar.dataset.compact=y>=88?'true':'false';
 }
 function schedule(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(refresh);
 }
 back.addEventListener('click',()=>{
  if(document.body.classList.contains('is-admin-mode'))iuCloseAdminPage();
  else if(document.body.classList.contains('is-account-mode'))iuCloseAccountPage();
  else if(document.body.classList.contains('is-events-mode'))iuCloseEventsPage();
  else if(document.body.classList.contains('is-alerts-mode'))iuCloseAlertsPage();
 });
 window.addEventListener('scroll',schedule,{passive:true});
 // Les scrolls internes éventuels de Safari sont également observés.
 document.addEventListener('scroll',schedule,true);
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Rafraîchissement synchrone au moment du changement de page.
 // Sans cela le premier frame d'entrée ne contenait pas le bouton.
 window.IUSyncSubpageBar=refresh;
 refresh();
})();


/* V39.30 : geste conservé, retour masqué par un fond opaque stylisé. */
(function iuInstallEdgeSwipeBack(){
 const pages={
  'is-admin-mode':{selector:'#planningAdminCard',close:()=>iuCloseAdminPage()},
  'is-account-mode':{selector:'#accountCard',close:()=>iuCloseAccountPage()},
  'is-events-mode':{selector:'#eventsPage',close:()=>iuCloseEventsPage()},
  'is-alerts-mode':{selector:'#iuAlertsPage',close:()=>iuCloseAlertsPage()}
 };
 const current=()=>Object.entries(pages).find(([mode])=>document.body.classList.contains(mode))?.[1];
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let g=null,veil=null,surface=null,arrow=null,seam=null;
 // Respecter les réglages d'accessibilité sans altérer l'aspect normal.
 const simplerVisuals=()=>Boolean(window.matchMedia?.('(prefers-reduced-transparency: reduce)')?.matches||
   window.matchMedia?.('(forced-colors: active)')?.matches);
 function prepare(){
  if(veil)return;
  veil=document.createElement('div');veil.className='iu-edge-swipe-backdrop';
  veil.setAttribute('aria-hidden','true');
  // V40.08 : révéler l'écran par deux calques déplacés en sens opposé
  // au lieu de recalculer un masque clip-path à chaque image.
  surface=document.createElement('div');
  surface.className='iu-edge-swipe-surface';
  surface.style.cssText='position:absolute;inset:0;pointer-events:none;will-change:transform';
  surface.innerHTML='<div class="iu-edge-swipe-glow"></div>';
  veil.append(surface);
  arrow=null;
  seam=document.createElement('div');seam.className='iu-edge-swipe-seam';
  seam.setAttribute('aria-hidden','true');
  seam.style.willChange='transform,opacity';
  document.body.append(veil,seam);
  // Conserver le dégradé exact de la feuille CSS sans le dupliquer.
  surface.style.background=getComputedStyle(veil).background;
  if(simplerVisuals()){
   surface.style.background='#f4f6f8';
   surface.firstElementChild.style.display='none';
  }
  veil.style.background='transparent';
  veil.style.clipPath='none';veil.style.webkitClipPath='none';
  veil.style.willChange='transform,opacity';
  const width=Math.max(1,window.innerWidth);
  veil.style.transform='translate3d('+(-width)+'px,0,0)';
  surface.style.transform='translate3d('+width+'px,0,0)';
 }
 function draw(target,x){
  const width=Math.max(1,window.innerWidth);
  x=Math.round(Math.max(0,Math.min(width,x)));
  target.distance=x;
  if(target.lastDrawnX===x)return;
  target.lastDrawnX=x;
  document.body.style.setProperty('--iu-swipe-dock-progress',String(Math.max(0,Math.min(1,x/width))));
  target.nodes.forEach(n=>n.style.setProperty('translate',x+'px 0','important'));
  // Le fond reste fixe sur l'écran tandis que la fenêtre révèle [0, x].
  veil.style.transform='translate3d('+(x-width)+'px,0,0)';
  surface.style.transform='translate3d('+(width-x)+'px,0,0)';
  // Remplacer left, qui exige un calcul de géométrie, par transform.
  seam.style.transform='translate3d('+x+'px,0,0)';
  seam.style.opacity=String(Math.min(.75,Math.max(0,(x-12)/65)));
 }
 function cleanup(){
  const old=g;g=null;
  if(old){
   if(old.raf)cancelAnimationFrame(old.raf);
   if(old.timer!==null)clearTimeout(old.timer);
   old.nodes.forEach(n=>{n.style.removeProperty('translate');n.style.removeProperty('transition');});
  }
  document.body.classList.remove('iu-edge-swiping');
  document.body.style.removeProperty('--iu-swipe-dock-progress');
  veil?.remove();seam?.remove();veil=null;surface=null;seam=null;arrow=null;
 }
 function finish(success){
  const target=g;if(!target||target.finishing)return;
  if(!target.active){cleanup();return;}
  target.finishing=true;
  if(target.raf){cancelAnimationFrame(target.raf);target.raf=0;}
  if(success){
   // V39.87 : la page suit toujours le doigt apres son relachement.
   // Terminer la trajectoire reelle, avant de restaurer l'accueil.
   const saved=iuEdgeHomeSnapshot?.scrollY;
   if(Number.isFinite(saved))iuSavedHomeScrollY=saved;
   const remaining=Math.max(0,innerWidth-target.distance);
   const ms=reduced()?0:Math.max(170,Math.min(370,Math.round(170+remaining/Math.max(1,innerWidth)*190)));
   const ease='cubic-bezier(.16,.84,.24,1)';
   const complete=()=>{
    if(g!==target)return;
    target.page.close(true);
    document.body.classList.add('iu-home-return-stable');
    const y=Math.max(0,iuSavedHomeScrollY);
    window.scrollTo({top:y,left:0,behavior:'instant'});
    target.nodes.forEach(n=>{n.style.removeProperty('translate');n.style.removeProperty('transition');});
    document.body.classList.remove('iu-edge-swiping');
    // Maintenir le voile pour le fondu de sortie déjà prévu.
    veil.style.visibility='visible';veil.style.opacity='1';
    seam.style.opacity='0';
    requestAnimationFrame(()=>{
     if(g!==target)return;
     veil.style.transition='opacity 320ms cubic-bezier(.16,.84,.24,1)';
     veil.style.opacity='0';
     target.timer=setTimeout(()=>{
      if(g!==target)return;
      cleanup();
      iuEdgeHomeSnapshot=null;
     },350);
    });
   };
   if(ms){
    target.nodes.forEach(n=>n.style.setProperty('transition','translate '+ms+'ms '+ease,'important'));
    veil.style.transition='transform '+ms+'ms '+ease;
   surface.style.transition='transform '+ms+'ms '+ease;
    seam.style.transition='transform '+ms+'ms '+ease;
    void target.nodes[0].getBoundingClientRect();
    requestAnimationFrame(()=>{if(g===target)draw(target,innerWidth);});
    target.timer=setTimeout(complete,ms+20);
   }else{draw(target,innerWidth);complete();}
   return;
  }
  // Geste annulé : revenir en douceur à la position initiale.
  const ms=reduced()?0:Math.round(190+target.distance/Math.max(1,innerWidth)*140);
  if(ms){
   const ease='cubic-bezier(.16,.84,.24,1)';
   target.nodes.forEach(n=>n.style.setProperty('transition','translate '+ms+'ms '+ease,'important'));
   veil.style.transition='transform '+ms+'ms '+ease;
   surface.style.transition='transform '+ms+'ms '+ease;
   seam.style.transition='transform '+ms+'ms '+ease;
   void target.nodes[0].getBoundingClientRect();
   requestAnimationFrame(()=>{if(g===target)draw(target,0);});
  }else draw(target,0);
  target.timer=setTimeout(()=>{if(g===target)cleanup();},ms+25);
 }
 document.addEventListener('touchstart',event=>{
  if(g||focusMotionBusy||event.touches.length!==1||event.defaultPrevented)return;
  const touch=event.touches[0],page=current();
  if(!page||touch.clientX<0||touch.clientX>28)return;
  const panel=document.querySelector(page.selector),bar=$('iuSubpageBar');
  if(!panel||!bar||bar.hidden)return;
  g={page,nodes:[panel,bar],x:touch.clientX,y:touch.clientY,lastX:touch.clientX,
   lastTime:performance.now(),velocity:0,distance:0,lastDrawnX:null,
   active:false,finishing:false,raf:0,timer:null};
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  const target=g;if(!target||target.finishing)return;
  if(event.touches.length!==1){finish(false);return;}
  const t=event.touches[0],dx=t.clientX-target.x,dy=t.clientY-target.y;
  if(!target.active){
   if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){cleanup();return;}
   if(dx<9||dx<Math.abs(dy)*1.3)return;
   target.active=true;prepare();document.body.classList.add('iu-edge-swiping');
  }
  if(event.cancelable)event.preventDefault();
  const now=performance.now(),dt=Math.max(1,now-target.lastTime);
  target.velocity=.4*target.velocity+.6*(t.clientX-target.lastX)/dt;
  target.lastX=t.clientX;target.lastTime=now;
  target.distance=Math.max(0,Math.min(innerWidth,dx));
  if(!target.raf)target.raf=requestAnimationFrame(()=>{
   target.raf=0;if(g===target&&!target.finishing)draw(target,target.distance);
  });
 },{passive:false});
 document.addEventListener('touchend',()=>{
  const target=g;if(!target)return;
  if(!target.active){cleanup();return;}
  finish(target.distance>innerWidth*.34||(target.distance>65&&target.velocity>.55));
 },{passive:true});
 document.addEventListener('touchcancel',()=>{if(g)finish(false);},{passive:true});
 window.addEventListener('pagehide',cleanup);
})();


/* V39.62 — Dock d'accueil : accès réutilisant les fonctions existantes.
   La gestion du droit Administrateur reste déléguée à Supabase/RLS. */
function iuInitQuickDock(){
 const dock=$('iuQuickDock'),admin=$('iuQuickAdmin'),sessionButton=$('iuQuickSession');
 if(!dock||!admin||!sessionButton)return;
 const adminCard=$('planningAdminCard');
 const updateAdmin=()=>{
  // Ne jamais proposer une entrée admin pendant la vérification des droits.
  const granted=Boolean(adminCard&&!adminCard.hidden&&adminCard.dataset.adminLoading!=='true');
  if(admin.hidden!==!granted)admin.hidden=!granted;
 };
 const observer=adminCard?new MutationObserver(updateAdmin):null;
 observer?.observe(adminCard,{attributes:true,attributeFilter:['hidden','data-admin-loading']});
 window.addEventListener('iu-admin-check-finished',updateAdmin);
 window.addEventListener('iu-admin-initial-ready',updateAdmin);
 updateAdmin();
 // V39.90 : conserver le dock reel jusqu'a la navigation sans clone,
 // ni neutralisation des interactions au premier clic.
 const updateSession=()=>{
  const active=getActiveSession(),paused=Boolean(active?.pausedAt);
  const aria=!active?'Démarrer un inventaire':paused?'Reprendre l’inventaire':'Inventaire en cours';
  const label=!active?'Inventaire':paused?'Reprendre':'En cours';
  if(sessionButton.getAttribute('aria-label')!==aria)sessionButton.setAttribute('aria-label',aria);
  const labelNode=$('iuQuickSessionLabel');
  if(labelNode&&labelNode.textContent!==label)labelNode.textContent=label;
  if(sessionButton.classList.contains('is-active-session')!==Boolean(active))
   sessionButton.classList.toggle('is-active-session',Boolean(active));
 };
 window.IUUpdateQuickDockSession=updateSession;
 updateSession();

 // Glisser le doigt sur la barre pour prévisualiser, puis relâcher pour choisir.
 // Ne déclenche aucune action avant le relâchement (important pour Démarrer).

 // Sélection tactile façon iOS : capsule qui suit le doigt, activation au relâchement.

 // Capsule pilotée en coordonnées continues (pas de saut d'un onglet à l'autre).
 const glass=document.createElement('span');
 glass.className='iu-dock-liquid-indicator';
 glass.setAttribute('aria-hidden','true');dock.prepend(glass);
 let drag=null,raf=0,suppressNativeClick=false;
 const items=()=>[...dock.querySelectorAll('.iu-quick-dock-item:not([hidden])')];
 const captureDockGeometry=()=>({
  dock:dock.getBoundingClientRect(),
  items:items().map(el=>{
   const rect=el.getBoundingClientRect();
   return {el,rect,center:rect.left+rect.width/2};
  })
 });
 const itemAt=(x,y,geometry)=>{
  const rect=geometry?.dock||dock.getBoundingClientRect();
  if(x<rect.left-20||x>rect.right+20||y<rect.top-24||y>rect.bottom+24)return null;
  const choices=geometry?.items||captureDockGeometry().items;
  return choices.reduce((best,{el,center})=>{
   const distance=Math.abs(x-center);
   return !best||distance<best.distance?{el,distance}:best;
  },null)?.el||null;
 };
 const draw=()=>{
  raf=0;if(!drag||!drag.active)return;
  const rect=drag.geometry.dock,selected=itemAt(drag.currentX,drag.currentY,drag.geometry);
  for(const {el} of drag.geometry.items)el.classList.toggle('iu-dock-hovered',el===selected);
  const width=drag.width;
  const x=Math.max(width/2+4,Math.min(rect.width-width/2-4,drag.currentX-rect.left));
  const speed=Math.min(1,Math.abs(drag.currentX-drag.previousX)/35);
  glass.style.width=width+'px';
  glass.style.transform='translate3d('+(x-width/2)+'px,0,0) scaleX('+(1+speed*.08)+')';
  drag.previousX=drag.currentX;
 };
 const clear=()=>{
  if(raf){cancelAnimationFrame(raf);raf=0;}
  drag=null;dock.classList.remove('iu-dock-dragging');
  for(const b of items())b.classList.remove('iu-dock-hovered');
 };
 dock.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'||e.button!==0)return;
  const target=e.target.closest('.iu-quick-dock-item:not([hidden])');
  if(!target)return;
  const geometry=captureDockGeometry();
  const rect=geometry.items.find(item=>item.el===target)?.rect||target.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,currentX:e.clientX,currentY:e.clientY,
   previousX:e.clientX,width:rect.width,geometry,active:false,vertical:false};
 });
 dock.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id||drag.vertical)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.active&&Math.abs(dy)>11&&Math.abs(dy)>Math.abs(dx)){drag.vertical=true;return;}
  if(!drag.active&&Math.abs(dx)>6&&Math.abs(dx)>=Math.abs(dy)){
   drag.active=true;
   dock.classList.add('iu-dock-dragging');
   try{dock.setPointerCapture(e.pointerId);}catch(_){}
  }
  if(drag.active){
   drag.currentX=e.clientX;drag.currentY=e.clientY;
   if(!raf)raf=requestAnimationFrame(draw);
  }
 });
 dock.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const selected=drag.active?itemAt(e.clientX,e.clientY,drag.geometry):null;
  if(selected&&!selected.hidden){
   suppressNativeClick=true;
   window.setTimeout(()=>{suppressNativeClick=false;},300);
  }
  clear();
  if(selected&&!selected.hidden)selected.click();
 });
 dock.addEventListener('pointercancel',clear);
 dock.addEventListener('click',e=>{
  if(suppressNativeClick&&e.isTrusted){
   e.preventDefault();e.stopImmediatePropagation();suppressNativeClick=false;
  }
 },true);

 // Animation de retour à l'accueil, y compris au premier chargement.
 const subpageClasses=['is-focus-mode','is-admin-mode','is-account-mode','is-events-mode','is-alerts-mode'];
 const isOnHome=()=>!subpageClasses.some(name=>document.body.classList.contains(name));
 let lastHome=isOnHome();
 let entranceTimer=0;
 let homeBlurTimer=0;
 const animateDockEntrance=()=>{
  if(!isOnHome())return;
  dock.classList.remove('iu-dock-entering');
  void dock.offsetWidth;
  dock.classList.add('iu-dock-entering');
  window.clearTimeout(entranceTimer);
  entranceTimer=window.setTimeout(()=>dock.classList.remove('iu-dock-entering'),1250);
 };
 const homeObserver=new MutationObserver(()=>{
  const nowHome=isOnHome();
  if(nowHome===lastHome)return; // les autres mutations de classes sont sans effet
  if(nowHome&&!lastHome){
   // Déverrouiller les colonnes seulement après retour sur la page d'accueil.
   dock.classList.remove('iu-dock-leaving','iu-dock-home-blur','iu-dock-entering');
   window.clearTimeout(homeBlurTimer);
   // L'accueil restaure directement le dock sans couche temporaire.
  }
  if(!nowHome){
   dock.classList.remove('iu-dock-leaving','iu-dock-entering','iu-dock-home-blur');
   window.clearTimeout(homeBlurTimer);
  }
  lastHome=nowHome;
 });
 homeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 window.requestAnimationFrame(()=>animateDockEntrance());
 const canNavigate=()=>!focusMotionBusy&&!document.body.classList.contains('is-focus-mode')&&
  !document.body.classList.contains('is-admin-mode')&&!document.body.classList.contains('is-account-mode')&&
  !document.body.classList.contains('is-events-mode')&&!document.body.classList.contains('is-alerts-mode');
 admin.addEventListener('click',()=>{updateAdmin();if(!admin.hidden)navigateDock(()=>iuOpenAdminPage());});
 $('iuQuickEvents')?.addEventListener('click',()=>navigateDock(()=>iuOpenEventsPage()));
 // La barre reste disponible dans toutes les vues. Un changement de
 // rubrique ferme d'abord la page courante avec sa transition native.
 const leaveCurrentPage=()=>{
  if(document.body.classList.contains('is-admin-mode')){iuCloseAdminPage();return true;}
  if(document.body.classList.contains('is-account-mode')){iuCloseAccountPage();return true;}
  if(document.body.classList.contains('is-events-mode')){iuCloseEventsPage();return true;}
  if(document.body.classList.contains('is-alerts-mode')){iuCloseAlertsPage();return true;}
  return false;
 };
 const navigateDock=action=>{
  // Le retour precedent peut encore finir sa cascade pendant que
  // l'accueil est deja visible. Ne jamais perdre ce premier clic.
  if(focusMotionBusy){
   if(isOnHome())focusPendingTask=()=>navigateDock(action);
   return;
  }
  if(document.body.classList.contains('is-focus-mode'))return;
  if(!leaveCurrentPage()){action();return;}
  const until=Date.now()+2000;
  const wait=()=>{
   if(isOnHome()&&!focusMotionBusy){action();return;}
   if(Date.now()<until)window.requestAnimationFrame(wait);
  };
  window.requestAnimationFrame(wait);
 };
 $('iuQuickAlerts')?.addEventListener('click',()=>navigateDock(()=>iuOpenAlertsPage()));
 $('iuQuickAccount')?.addEventListener('click',()=>navigateDock(()=>iuOpenAccountPage()));
 sessionButton.addEventListener('click',()=>{
  if(!canNavigate()){navigateDock(()=>sessionButton.click());return;}
  const active=getActiveSession();
  if(active?.pausedAt)animateFocusEntry(resumeSession);
  else if(!active)animateFocusEntry(startSession);
  else {
   // En session active, ne pas créer de doublon ni perdre les pesées.
   const focus=$('focusToolbar');
   if(focus)focus.scrollIntoView({behavior:'smooth',block:'start'});
  }
 });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iuInitQuickDock,{once:true});
else iuInitQuickDock();
