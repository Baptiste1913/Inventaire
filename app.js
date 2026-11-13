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
function persistHistory(){try{safeSetItem(HISTORY_KEY,JSON.stringify(history));renderHistory();return true;}catch{$('weighStatus').textContent='Impossible de sauvegarder cet historique sur cet appareil.';return false;}}
function renderHistory(){const list=$('historyList');list.replaceChildren();$('historyCount').textContent=`${history.length} pesée${history.length>1?'s':''}`;$('clearHistoryBtn').hidden=!history.length;
const btn=$('historyToggleTop');btn.hidden=history.length<=5;btn.setAttribute('aria-expanded',String(historyExpanded));const label=btn.querySelector('.history-toggle-label');if(label)label.textContent=historyExpanded?'Réduire l’historique':`Voir les ${history.length} pesées`;
if(!history.length){const p=document.createElement('p');p.className='empty history-empty';p.textContent='Aucune pesée enregistrée pour le moment.';list.append(p);return;}
for(const entry of (historyExpanded?history:history.slice(0,5))){const row=document.createElement('article');row.className='history-item';const info=document.createElement('div');info.className='history-info';const name=document.createElement('strong');name.className='history-name';name.textContent=entry.name;const meta=document.createElement('div');meta.className='history-meta';const date=document.createElement('span');date.className='history-chip';date.textContent=new Date(entry.at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit'});const detail=document.createElement('span');detail.className='history-chip history-chip-detail';detail.textContent=`Brut ${fmt(entry.gross)} kg · Tare ${fmt(entry.tare)} kg`;meta.append(date,detail);info.append(name,meta);const result=document.createElement('div');result.className='history-result';const resultLabel=document.createElement('small');resultLabel.textContent='Poids net';const resultValue=document.createElement('strong');resultValue.className='history-net';resultValue.textContent=`${fmt(entry.net)} kg`;result.append(resultLabel,resultValue);row.append(info,result);list.append(row);}}
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
  if(!x||typeof x!=='object'||!Number.isSafeInteger(x.net)||!Number.isSafeInteger(x.gross)||!Number.isSafeInteger(x.tare)||x.net<0||x.gross<x.tare||x.tare<0||!Number.isFinite(x.at))return null;
  return {id:typeof x.id==='string'?x.id.slice(0,90):uid(),at:x.at,name:String(x.name||'Panier').slice(0,40),tare:x.tare,gross:x.gross,net:x.net,groupId:String(x.groupId||x.id||uid()).slice(0,90)};
}
function cleanSession(x){
  if(!x||typeof x!=='object'||!Number.isFinite(x.startedAt))return null;
  return {id:String(x.id||uid()).slice(0,90),startedAt:x.startedAt,endedAt:Number.isFinite(x.endedAt)?x.endedAt:null,pausedAt:Number.isFinite(x.pausedAt)?x.pausedAt:null,pausedMs:Math.max(0,Number(x.pausedMs)||0),entries:Array.isArray(x.entries)?x.entries.map(cleanWeigh).filter(Boolean):[]};
}
const loadedSessions=readJSON(SESSION_KEY,{sessions:[],activeId:null});
let sessions=(Array.isArray(loadedSessions?.sessions)?loadedSessions.sessions:[]).map(cleanSession).filter(Boolean);
let activeSessionId=typeof loadedSessions?.activeId==='string'&&sessions.some(s=>s.id===loadedSessions.activeId&&!s.endedAt)?loadedSessions.activeId:null;
let activeGroup=null,lastGroup=null;
let entryMode=safeGet(MODE_KEY)==='g'?'g':'kg';
let maxGrossGrams=parseKg(safeGet(LIMIT_KEY)||'20.000')||20000;
let confirmDuplicates=safeGet(DUPLICATE_CONFIRM_KEY)!=='false';
let acceptedAnomalyKey='',sessionsExpanded=false;
function getActiveSession(){return sessions.find(s=>s.id===activeSessionId&&!s.endedAt)||null;}
function activeStats(s){
  const count=s.entries.length, gross=s.entries.reduce((n,e)=>n+e.gross,0),tare=s.entries.reduce((n,e)=>n+e.tare,0),net=gross-tare;
  const duration=Math.max(0,(s.endedAt||Date.now())-s.startedAt-(s.pausedMs||0)-(s.pausedAt?(s.endedAt||Date.now())-s.pausedAt:0));
  const groupMap=new Map(); for(const e of s.entries){const id=e.groupId||e.id;groupMap.set(id,(groupMap.get(id)||0)+1);}
  return {count,gross,tare,net,duration,groups:groupMap.size,multi:[...groupMap.values()].filter(n=>n>1).length,min:count?Math.min(...s.entries.map(e=>e.net)):0,max:count?Math.max(...s.entries.map(e=>e.net)):0,average:count?Math.round(net/count):0};
}
function durationLabel(ms){const sec=Math.floor(Math.max(0,ms)/1000),h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h} h ${String(m).padStart(2,'0')} min`:`${m} min ${String(s).padStart(2,'0')} s`;}
const dateLabel=t=>new Date(t).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function persistSessions(){try{safeSetItem(SESSION_KEY,JSON.stringify({sessions,activeId:activeSessionId}));return true;}catch{const el=$('sessionMessage');if(el)el.textContent='⚠️ Espace local insuffisant : exporte tes données pour éviter toute perte.';return false;}}
function parseWeight(value){if(entryMode==='kg')return parseKg(value);const s=String(value).trim();return /^\d{1,9}$/.test(s)?Number(s):null;}
function weightFromGrams(g){return entryMode==='g'?String(g):fmt(g);}
function issueFor(gross,b){if(gross>maxGrossGrams)return `Poids brut inhabituel (${fmt(gross)} kg). Vérifie la balance.`;
  if(confirmDuplicates&&currentWeighId===null){const prev=history[0];if(prev&&prev.gross===gross&&prev.tare===b.tare&&Date.now()-prev.at<120000)return 'Ce poids et cette tare sont identiques à la pesée précédente. Vérifie qu’il ne s’agit pas d’un doublon.';}
  return '';
}
function anomalyKey(gross,b){return `${b.id}:${gross}`;}
function warningForCurrent(){const gross=parseWeight($('grossWeight').value),b=baskets.find(b=>b.id===$('basketSelect').value);if(gross===null||!b||gross<b.tare)return '';return issueFor(gross,b);}
function renderWarning(){const message=warningForCurrent(),gross=parseWeight($('grossWeight').value),b=baskets.find(b=>b.id===$('basketSelect').value);const accepted=message&&b&&acceptedAnomalyKey===anomalyKey(gross,b);$('weighWarning').hidden=!message||Boolean(accepted);$('weighWarningText').textContent=message;return Boolean(message&&!accepted);}
function calculate(){
 const previousNetText=$('netDisplay').textContent;
 const raw=$('grossWeight').value.trim(),gross=raw?parseWeight(raw):null,b=baskets.find(x=>x.id===$('basketSelect').value);
 netGrams=null;$('grossDisplay').textContent=gross===null?'— kg':`${fmt(gross)} kg`;$('tareDisplay').textContent=b?`${fmt(b.tare)} kg`:'— kg';$('errorMessage').textContent='';$('netDisplay').textContent='—';$('resultHint').textContent='Renseigne le poids pour calculer le net.';$('copyBtn').disabled=true;
 if(!raw||!b){renderWarning();refreshActionButtons();return;}
 if(gross===null){$('errorMessage').textContent=entryMode==='g'?'Saisis des grammes entiers, par exemple 1250.':'Saisis un poids avec au maximum 3 décimales (ex. 1.230).';renderWarning();refreshActionButtons();return;}
 if(gross<b.tare){$('errorMessage').textContent='Le poids brut est inférieur à la tare du panier. Cette pesée ne sera pas enregistrée.';renderWarning();refreshActionButtons();return;}
 netGrams=gross-b.tare;
 const nextNetText=fmt(netGrams),netElement=$('netDisplay');
 netElement.textContent=nextNetText;
 if(previousNetText!==nextNetText){
  netElement.classList.remove('net-value-updated');
  void netElement.offsetWidth;
  netElement.classList.add('net-value-updated');
 }
 $('resultHint').textContent='Prêt à reporter.';
 const blocked=renderWarning();$('copyBtn').disabled=blocked;refreshActionButtons();
}
function refreshActionButtons(){
 // Ne pas reconstruire le libellé à chaque frappe dans le poids brut.
 const resetLabel=$('resetBtn').querySelector('span');
 if(resetLabel&&resetLabel.innerHTML!=='Nouvelle<br>pesée')resetLabel.innerHTML='Nouvelle<br>pesée';
}
function saveCurrentWeigh(){
 clearTimeout(autoSaveTimer);autoSaveTimer=null;
 const b=baskets.find(x=>x.id===$('basketSelect').value),gross=parseWeight($('grossWeight').value);
 if(!b||gross===null||gross<b.tare)return false;
 if(renderWarning()){$('weighStatus').textContent='⚠️ Confirme cette valeur avant son enregistrement.';return false;}
 const previous=history.find(x=>x.id===currentWeighId);
 if(previous&&previous.gross===gross&&previous.tare===b.tare&&previous.name===b.name)return true;
 const entry={id:currentWeighId||uid(),at:Date.now(),name:b.name,tare:b.tare,gross,net:gross-b.tare};
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
 $('weighStatus').textContent='Pesée enregistrée automatiquement';
 animateConfirmation();
 return true;
}
function scheduleAutoSave(){clearTimeout(autoSaveTimer);autoSaveTimer=null;$('weighStatus').textContent='';if(netGrams!==null&&!renderWarning())autoSaveTimer=setTimeout(saveCurrentWeigh,1100);}
function flushPending(){if(autoSaveTimer!==null)return saveCurrentWeigh();if(netGrams!==null&&renderWarning()){$('weighStatus').textContent='⚠️ Confirme cette pesée avant de continuer.';return false;}
 // Si une valeur valide a été saisie mais que le délai n'est pas encore passé.
 if(netGrams!==null&&!currentWeighId)return saveCurrentWeigh();
 if(netGrams!==null&&currentWeighId){const prior=history.find(x=>x.id===currentWeighId),gross=parseWeight($('grossWeight').value),b=baskets.find(x=>x.id===$('basketSelect').value);if(!prior||gross!==prior.gross||b?.tare!==prior.tare)return saveCurrentWeigh();}
 return true;
}
function clearWeigh(){clearTimeout(autoSaveTimer);autoSaveTimer=null;currentWeighId=null;acceptedAnomalyKey='';$('grossWeight').value='';$('weighStatus').textContent='';calculate();}
function newWeigh(){if(!flushPending())return;if(!netGrams&&$('grossWeight').value.trim()){$('weighStatus').textContent='Corrige cette saisie ou efface-la manuellement.';return;}
 if(!$('grossWeight').value.trim()){$('grossWeight').focus();return;}
 clearWeigh();$('grossWeight').focus();}
function beginGroup(){return false;}
function finishGroup(){return true;}
function removeGroupEntry(id){return false;}
function groupSum(g){return 0;}
// Mise à jour légère du HUD, sans retraitement des historiques.
function islandDurationLabel(ms){const minutes=Math.floor(Math.max(0,ms)/60000),h=Math.floor(minutes/60),m=minutes%60;return h?`${h} h ${String(m).padStart(2,'0')}`:`${m} min`;}
function renderHeroSummary(){
 const status=$('heroStatus'),text=$('heroStatusText');
 if(!status||!text)return;
 const session=getActiveSession();
 status.classList.toggle('is-running',Boolean(session&&!session.pausedAt));
 status.classList.toggle('is-paused',Boolean(session&&session.pausedAt));
 const count=session?session.entries.length:0;
 text.textContent=!session?'Aucune session':`${session.pausedAt?'En pause':'En cours'} · ${count} pesée${count>1?'s':''}`;
 // Le raccourci de la banderole lance directement l'inventaire ;
 // si une session est en pause il propose de la reprendre, jamais d'en créer une deuxième.
 const heroAction=$('heroStartSession'),heroLabel=$('heroActionLabel');
 if(heroAction&&heroLabel){
  heroLabel.textContent=session?.pausedAt?'Reprendre':'Inventaire';
  // Éviter le rendu natif :disabled de Safari iOS (bouton blanc).
  // Le clic est déjà sans effet lorsque la session est en cours.
  heroAction.disabled=false;
  heroAction.setAttribute('aria-disabled',String(Boolean(session&&!session.pausedAt)));
   // Apparence stable, uniquement gérée par CSS.
  heroAction.setAttribute('aria-label',(session?.pausedAt?'Reprendre l’inventaire':session?'Inventaire en cours':'Démarrer un inventaire')+' — '+text.textContent);
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
let focusPendingTask=null;
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
function focusTagViews(entering,phase,tagged){
 const normal=(entering&&phase==='old')||(!entering&&phase==='new');
 if(normal){
  // L'ordre commence au bloc le plus bas : il sort en premier.
  // Seuls les blocs a l'ecran sont captures (les autres restent intacts).
  const cards=[...document.querySelectorAll(focusNormalSelectors)]
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
  const surface=document.querySelector(focusSurfaceSelectors);
  if(focusVisible(surface)){
   surface.style.viewTransitionName='iu-focus-surface';
   tagged.add(surface);
  }
  const focus=[...document.querySelectorAll(focusViewSelectors)].filter(focusVisible);
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
function exitFocusWithoutSnapshot(action){
 const duration=610;
 const easing='cubic-bezier(.16,.84,.24,1)';
 const app=document.querySelector('.app');
 const source=[...document.querySelectorAll(focusViewSelectors)].filter(focusVisible);
 const surface=document.querySelector(focusSurfaceSelectors);
 const layer=document.createElement('div');
 layer.className='iu70-exit-overlay';
 layer.setAttribute('aria-hidden','true');
 // Le clone est limité à la largeur physique du viewport : aucune
 // capture d'une autre largeur ne peut décaler l'accueil.
 for(const node of source){
  const rect=node.getBoundingClientRect();
  const computed=getComputedStyle(node);
  const clone=node.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(child=>child.removeAttribute('id'));
  clone.querySelectorAll('input,button,select,textarea').forEach(el=>el.setAttribute('tabindex','-1'));
  clone.style.setProperty('position','absolute','important');
  clone.style.setProperty('display','block','important');
  clone.style.setProperty('left',rect.left+'px','important');
  clone.style.setProperty('top',rect.top+'px','important');
  clone.style.setProperty('width',rect.width+'px','important');
  clone.style.setProperty('height',rect.height+'px','important');
  clone.style.setProperty('max-width','none','important');
  clone.style.setProperty('margin','0','important');
  clone.style.setProperty('box-sizing','border-box','important');
  clone.style.setProperty('background',computed.background,'important');
  clone.style.setProperty('box-shadow',computed.boxShadow,'important');
  clone.style.setProperty('border',computed.border,'important');
  clone.style.setProperty('border-radius',computed.borderRadius,'important');
  clone.style.setProperty('opacity','1','important');
  layer.append(clone);
 }
 // La surface pleine-écran reprend le fond opaque déjà existant.
 const cover=document.createElement('div');
 cover.className='iu70-exit-cover';
 layer.prepend(cover);
 document.body.append(layer);
 focusMotionBusy=true;
 // Le nouvel accueil est mis en page par le navigateur, sans aucune
 // transition de vue qui pourrait le redimensionner horizontalement.
 action();
 // Retour en cascade comme à l'ouverture PWA : de haut en bas.
 // La descente du mode Concentration et son flou restent inchangés.
 const tiles=[...document.querySelectorAll(focusNormalSelectors)]
  .filter(focusVisible)
  .sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top);
 const anchors=[...document.querySelectorAll(focusStaticSelectors)].filter(focusVisible);
 const animations=[];
 const animate=(el,frames,opts={})=>{
  if(!el)return;
  animations.push(el.animate(frames,{duration,easing,fill:'both',...opts}));
 };
 animate(cover,[{transform:'translate3d(0,0,0)'},{transform:'translate3d(0,105dvh,0)'}]);
 for(const clone of [...layer.children].filter(el=>el!==cover)){
  animate(clone,[
   {offset:0,transform:'translate3d(0,0,0)',filter:'blur(0px)',opacity:1},
   {offset:.12,filter:'blur(0px)',opacity:1},
   {offset:.60,filter:'blur(1.7px)',opacity:1},
   {offset:1,transform:'translate3d(0,105dvh,0)',filter:'blur(3.2px)',opacity:1}
  ]);
 }
 // V33.73 : flouter TOUT l'accueil, sous la surface opaque qui descend.
 // Dans V33.71/72, les tuiles devenaient nettes avant d'être découvertes
 // par le panneau. Le filtre doit donc durer plus longtemps que sa révélation.
 // Un seul compositing layer pour le bandeau ET les cartes évite les écarts.
 const previousAppFilter=app.style.filter;
 const previousAppWillChange=app.style.willChange;
 app.style.filter='blur(3.2px)';
 app.style.willChange='filter';
 void app.offsetWidth;
 const homeBlur=app.animate([
  {offset:0,filter:'blur(3.2px)'},
  {offset:.28,filter:'blur(3.0px)'},
  {offset:1,filter:'blur(0px)'}
 ],{duration:450,easing:'ease-out',fill:'forwards'});
 animations.push(homeBlur);
 for(const [index,tile] of tiles.entries()){
  // Même décalage entre les blocs que l'ouverture PWA (85 ms).
  // Déplacement vertical préservé ; seule la succession est nouvelle.
  animate(tile,[
   {transform:'translate3d(0,105dvh,0)',opacity:1},
   {transform:'translate3d(0,0,0)',opacity:1}
  ],{delay:index*85});
 }
 for(const anchor of anchors){
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
  app.style.filter=previousAppFilter;
  app.style.willChange=previousAppWillChange;
  layer.remove();
  focusMotionBusy=false;
  const pending=focusPendingTask;
  focusPendingTask=null;
  if(pending)requestAnimationFrame(pending);
 };
 Promise.all(animations.map(anim=>anim.finished.catch(()=>{}))).then(cleanup,cleanup);
 if(!animations.length)cleanup();
}
function changeFocusWithMotion(action,entering){
 if(focusMotionBusy)return;
 if(focusReducedMotion()){action();return;}
 const html=document.documentElement;
 const before=document.body.classList.contains('is-focus-mode');
 // La transition n'est utile que si l'action peut changer de mode.
 if((entering&&before)||(!entering&&!before)){action();return;}
 // Sortie : les éléments réels préservent le cadrage iPhone.
 if(!entering && typeof Element.prototype.animate==='function'){
  exitFocusWithoutSnapshot(action);
  return;
 }
 focusMotionBusy=true;
 const tagged=new Set();
 const cleanup=()=>{
  for(const el of tagged)el.style.viewTransitionName='';
  html.classList.remove('iu-focus-slide','iu-focus-entering','iu-focus-exiting');
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
  focusTagViews(entering,'new',tagged);
 };
 html.classList.add('iu-focus-slide',entering?'iu-focus-entering':'iu-focus-exiting');
 focusTagViews(entering,'old',tagged);
 if(typeof document.startViewTransition==='function'){
  try{
   const transition=document.startViewTransition(update);
   transition.finished.then(cleanup,cleanup);
  }catch(error){cleanup();action();}
  return;
 }
 // Repli sans View Transitions : une seule phase courte, sans cascade ni
 // deux animations séparées qui provoquent un saut à mi-parcours.
 update();
 const incoming=[...document.querySelectorAll(entering?focusViewSelectors:focusNormalSelectors)]
  .filter(focusVisible);
 const anims=incoming.map(el=>el.animate(
  [{transform:'translate3d(0,30px,0)',opacity:.7},{transform:'translate3d(0,0,0)',opacity:1}],
  {duration:420,delay:0,easing:'cubic-bezier(.38,0,.62,1)'}));
 Promise.all(anims.map(a=>a.finished.catch(()=>{}))).then(cleanup,cleanup);
 if(!anims.length)cleanup();
}
function animateFocusEntry(action){changeFocusWithMotion(action,true);}
function animateFocusExit(action){changeFocusWithMotion(action,false);}
function syncFocusMode(sessionInput,statsInput){
 const session=arguments.length?sessionInput:getActiveSession();
 const active=Boolean(session&&!session.pausedAt);
 const toolbar=$('focusToolbar');
 if(!toolbar)return;
 toolbar.hidden=!active;
 document.body.classList.toggle('is-focus-mode',active);
 if(!active)$('focusConfirm').hidden=true;
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
 if(s){const stats=activeStats(s);$('sessionDuration').textContent=durationLabel(stats.duration);$('sessionWeighCount').textContent=String(stats.count);$('sessionNet').textContent=`${fmt(stats.net)} kg`;}
 renderHeroSummary();
 syncFocusMode();
}
// L'horloge met à jour seulement les textes qui ont réellement changé :
// moins de mutations DOM, donc moins de recalculs sur Safari iPhone.
function renderLiveSessionStats(updateHero=true){
 const session=getActiveSession();if(!session)return;
 const stats=activeStats(session);
 const values=[['sessionDuration',durationLabel(stats.duration)],['sessionWeighCount',String(stats.count)],['sessionNet',`${fmt(stats.net)} kg`]];
 for(const [id,value] of values){const el=$(id);if(el&&el.textContent!==value)el.textContent=value;}
 if(updateHero)renderHeroSummary();
 syncFocusMode(session,stats);
}
function startSession(){const review=$('sessionQualityReview');if(review)review.hidden=true;
 if(getActiveSession()||!flushPending())return;
 const before=sessions,prevId=activeSessionId;
 const created={id:uid(),startedAt:Date.now(),endedAt:null,pausedAt:null,pausedMs:0,entries:[]};
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
 const invalid=entries.filter(e=>!Number.isSafeInteger(e.gross)||!Number.isSafeInteger(e.tare)||!Number.isSafeInteger(e.net)||e.net!==e.gross-e.tare||e.gross<e.tare);
 if(invalid.length)problems.push(`${invalid.length} pesée(s) incohérente(s) : vérifier les valeurs.`);
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
 clearWeigh();renderV22();reviewSessionQuality(session);$('sessionMessage').classList.add('is-complete');{const message=$('sessionMessage');message.replaceChildren();const title=document.createElement('strong');title.className='session-complete-title';title.textContent='Inventaire terminé';const detail=document.createElement('span');detail.className='session-complete-detail';detail.textContent='Retrouve son bilan dans « Mes inventaires ».';const content=document.createElement('span');content.className='session-complete-copy';content.append(title,detail);message.append(content);}
 offerUndo('Inventaire terminé.',()=>{
  if(activeSessionId||!session.endedAt||session.endedAt!==now)return false;
  session.endedAt=null;session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;activeSessionId=session.id;
  if(!persistSessions()){session.endedAt=now;session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;activeSessionId=null;return false;}
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
function summaryElement(s){const stats=activeStats(s);const box=document.createElement('div');box.className='v22-bilan';const grid=document.createElement('div');grid.className='v22-stats-grid';
 for(const [label,value] of [['Début',dateLabel(s.startedAt)],['Fin',s.endedAt?dateLabel(s.endedAt):'—'],['Durée active',durationLabel(stats.duration)],['Pesées',String(stats.count)],['Poids brut',`${fmt(stats.gross)} kg`],['Tares cumulées',`${fmt(stats.tare)} kg`],['Poids net',`${fmt(stats.net)} kg`],['Moyenne / pesée',stats.count?`${fmt(stats.average)} kg`:'—'],['Plus petite',stats.count?`${fmt(stats.min)} kg`:'—'],['Plus grande',stats.count?`${fmt(stats.max)} kg`:'—'],['Pesées / heure',stats.duration&&stats.count?((stats.count*3600000)/stats.duration).toFixed(1).replace('.',','):'—']]) grid.append(makeStat(label,value));
 box.append(grid);
 const breakdown=sessionBreakdown(s);if(breakdown.length){const h=document.createElement('h4');h.textContent='Types de paniers utilisés';box.append(h);for(const [name,count] of breakdown){const p=document.createElement('p');p.className='v22-stat-line';p.textContent=`${name} : ${count} pesée${count>1?'s':''}`;box.append(p);}}
 const hist=document.createElement('div');hist.className='v22-activity';const title=document.createElement('h4');title.textContent='Activité par demi-heure';hist.append(title);
 const bins=new Map();for(const e of s.entries){const d=new Date(e.at);d.setMinutes(Math.floor(d.getMinutes()/30)*30,0,0);const key=d.getTime();bins.set(key,(bins.get(key)||0)+1);}
 const sorted=[...bins.entries()].sort((a,b)=>a[0]-b[0]);const max=Math.max(1,...sorted.map(x=>x[1]));for(const [at,count] of sorted){const row=document.createElement('div');row.className='v22-bar-row';const label=document.createElement('span');label.textContent=new Date(at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});const bar=document.createElement('div');bar.className='v22-bar-track';const fill=document.createElement('div');fill.className='v22-bar-fill';fill.style.width=`${count/max*100}%`;bar.append(fill);const amount=document.createElement('strong');amount.textContent=String(count);row.append(label,bar,amount);hist.append(row);}
 if(!sorted.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='Aucune pesée dans cette session.';hist.append(empty);}
 box.append(hist);const actions=document.createElement('div');actions.className='v22-session-export';const csv=document.createElement('button');csv.type='button';csv.className='outline-btn';csv.textContent='Exporter en CSV';csv.addEventListener('click',()=>exportCSV([s],`inventaire-u-${new Date(s.startedAt).toISOString().slice(0,10)}.csv`));const json=document.createElement('button');json.type='button';json.className='outline-btn';json.textContent='Bilan JSON';json.addEventListener('click',()=>download(JSON.stringify({app:'Inventaires U',version:30,sessions:[s]},null,2),`inventaire-u-${new Date(s.startedAt).toISOString().slice(0,10)}.json`,'application/json'));const remove=document.createElement('button');remove.type='button';remove.className='delete-session-btn';remove.textContent='Supprimer ce bilan';remove.setAttribute('aria-label',`Supprimer le bilan du ${dateLabel(s.startedAt)}`);remove.addEventListener('click',()=>deleteSession(s.id));actions.append(csv,json);box.append(actions,remove);return box;}
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
 renderSessionsHistory();renderBackupSummary();
 $('bilanNotice').textContent=`Bilan du ${label} supprimé.`;
 offerUndo('Bilan supprimé.',()=>{
   if(sessions.some(s=>s.id===removed.id))return false;
   const before=sessions;
   const restored=sessions.slice();restored.splice(Math.min(index,restored.length),0,removed);
   sessions=restored;
   if(!persistSessions()){sessions=before;return false;}
   renderSessionsHistory();renderBackupSummary();
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
function renderSessionsHistory(){const ended=sessions.filter(s=>Boolean(s.endedAt)).sort((a,b)=>b.startedAt-a.startedAt);$('sessionsCount').textContent=`${ended.length} session${ended.length>1?'s':''}`;
 const list=$('sessionsHistoryList');if(sessionSummaryObserver)sessionSummaryObserver.disconnect();list.replaceChildren();$('sessionsToggle').hidden=ended.length<=5;$('sessionsToggle').textContent=sessionsExpanded?'Réduire la liste':`Voir les ${ended.length} sessions`;
 if(!ended.length){const p=document.createElement('p');p.className='empty';p.textContent='Aucune session terminée pour le moment.';list.append(p);return;}
 for(const s of (sessionsExpanded?ended:ended.slice(0,5))){const item=document.createElement('details');item.className='v22-session-item';const sum=document.createElement('summary');const name=document.createElement('strong');const started=new Date(s.startedAt);const dayTitle=started.toLocaleDateString('fr-FR',{day:'numeric',month:'short',...(started.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});const timeTitle=started.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});name.textContent=`Inventaire · ${dayTitle} à ${timeTitle}`;const meta=document.createElement('span');const stats=activeStats(s);meta.textContent=stats.count?`${stats.count} pesée${stats.count>1?'s':''} · ${fmt(stats.net)} kg net · ${durationLabel(stats.duration)}`:`Aucune pesée enregistrée · ${durationLabel(stats.duration)}`;sum.append(name,meta);
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
$('confirmWarning').addEventListener('click',()=>{const gross=parseWeight($('grossWeight').value),b=baskets.find(x=>x.id===$('basketSelect').value);if(gross===null||!b||gross<b.tare)return;acceptedAnomalyKey=anomalyKey(gross,b);calculate();saveCurrentWeigh();});
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
$('fullExportBtn').addEventListener('click',fullExport);
$('fullImportInput').addEventListener('change',fullImport);
$('sessionsCsvBtn').addEventListener('click',()=>{const ended=sessions.filter(s=>Boolean(s.endedAt));if(!ended.length){$('backupStatus').textContent='Aucune session terminée à exporter.';return;}exportCSV(ended,`inventaires-u-sessions-${new Date().toISOString().slice(0,10)}.csv`);$('backupStatus').textContent='CSV des sessions exporté.';});
setInterval(()=>{if(!document.hidden)renderLiveSessionStats(false);},1000);

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

$('grossWeight').addEventListener('input',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('basketSelect').addEventListener('change',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('grossWeight').addEventListener('blur',()=>{if(autoSaveTimer!==null)saveCurrentWeigh();});
// iOS peut suspendre le timer de 1,1 s dès que l'application se verrouille.
// Forcer une sauvegarde synchrone des données valides avant la suspension.
function saveBeforeSuspend(){if(autoSaveTimer!==null)saveCurrentWeigh();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveBeforeSuspend();else renderLiveSessionStats();});
window.addEventListener('pagehide',saveBeforeSuspend);
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
$('historyToggleTop').addEventListener('click',()=>animateExpandedList('historyList',()=>{historyExpanded=!historyExpanded;renderHistory();}));
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
const iuFoldStats={prepared:0,cacheHits:0,cacheMisses:0,lastWarmupMs:0};
window.IUFoldPerformance=()=>({
 ...iuFoldStats,
 recent:IU_FOLD_METRICS.slice(-16).map(item=>({...item}))
});
window.IUPrewarmFoldLayouts=async(progress)=>{
 if(iuFoldMeasurementActive)return false;
 iuFoldMeasurementActive=true;
 const started=performance.now();
 const cards=[...document.querySelectorAll('details[data-unified-fold="yes"]')]
  // Les sous-tiroirs heritent de styles contextuels de leur carte parente :
  // seuls les tiroirs principaux se mesurent de facon fiable dans un clone.
  .filter(card=>card.parentElement?.classList.contains('app')&&!card.hidden);
 // Chaque carte est preparee par etape : ne jamais bloquer toute une frame.
 const yieldFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
 let done=0;
 try{
  for(const card of cards){
   try{
    // Mesurer dans un conteneur invisible, sans cliquer ni changer l'etat
    // des <details> existants (ce qui declencherait leurs handlers).
    const owner=card.closest('.app');
    const root=document.createElement('div');
    root.className='app';
    root.style.cssText='position:fixed!important;left:-200vw!important;top:0!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important;';
    const width=owner?.getBoundingClientRect().width||document.documentElement.clientWidth;
    root.style.width=width+'px';
    const clone=card.cloneNode(true);
    clone.removeAttribute('hidden');
    clone.style.cssText='height:auto!important;max-height:none!important;animation:none!important;transition:none!important;';
    clone.open=false;
    root.append(clone);document.body.append(root);
    const closed=clone.getBoundingClientRect().height;
    clone.open=true;
    const expanded=clone.getBoundingClientRect().height;
    root.remove();
    if(Number.isFinite(closed)&&Number.isFinite(expanded)&&expanded>=closed&&closed>0){
     IU_FOLD_CACHE.set(card,{closed,expanded,width:card.getBoundingClientRect().width,viewport:window.innerWidth});
     iuFoldStats.prepared++;
    }
   }catch(error){console.debug('Preparation dimension tiroir ignoree',error);}
   done++;
   if(typeof progress==='function')progress(done,cards.length);
   await yieldFrame();
  }
  iuFoldStats.lastWarmupMs=Math.round(performance.now()-started);
  return true;
 }finally{iuFoldMeasurementActive=false;}
};
window.addEventListener('resize',()=>{
 // Le cache verifie aussi la largeur et le viewport au moment d'utilisation.
 iuFoldStats.prepared=0;
},{passive:true});

/* V36.38 — Inspiré de Grafikart : limiter les lectures/écritures forcées.
   Le JavaScript ne réécrit plus height à chaque frame : Web Animations
   interpole la hauteur. Une mesure initiale par interaction, puis un rendu
   géré par le navigateur ; l'icône reste animée par transform en CSS.
   Les doubles appuis reprennent à la hauteur réellement affichée. */
const FOLD_MOTION_MS=420;
const FOLD_MOTION_EASE='cubic-bezier(.28,.72,.24,1)';
window.IU_FOLD_MOTION=Object.freeze({duration:FOLD_MOTION_MS,easing:FOLD_MOTION_EASE});
const foldReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function setupUnifiedFold(card,summary,content,closingClass='is-fold-closing'){
 if(!card||!summary||!content||card.dataset.unifiedFold==='yes')return;
 card.dataset.unifiedFold='yes';
 const invalidator=new MutationObserver(records=>{
  if(records.some(r=>r.target!==card))IU_FOLD_CACHE.delete(card);
 });
 invalidator.observe(card,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','style']});
 let intended=card.open,animation=null,animationStartedAt=0;
 const isEvents=card.id==='eventsDisclosure';
 const isAdminCategory=card.classList.contains('iu-admin-category');
 const px=value=>parseFloat(value)||0;
 function cleanup(){
  card.style.removeProperty('height');
  card.style.removeProperty('overflow');
  card.classList.remove('iu-fold-animating',closingClass,'iu-admin-animating');
  if(isEvents)card.removeAttribute('data-motion');
 }
 function finish(anim,to){
  if(animation!==anim)return;
  // Maintenir la dernière hauteur avant l'annulation évite une frame de saut.
  card.style.height=to+'px';
  animation=null;
  anim.cancel();
  card.open=intended;
  cleanup();
  IU_FOLD_METRICS.push({name:card.id||card.className.slice(0,40),
   durationMs:Math.round(performance.now()-animationStartedAt),
   pixels:Math.round(Math.abs(to-(card.dataset.iuFoldStart?Number(card.dataset.iuFoldStart):to)))});
  if(IU_FOLD_METRICS.length>24)IU_FOLD_METRICS.shift();
  delete card.dataset.iuFoldStart;
 }
 card.addEventListener('toggle',()=>{if(!animation)intended=card.open;});
 summary.addEventListener('click',event=>{
  if(event.defaultPrevented)return;
  event.preventDefault();
  const from=card.getBoundingClientRect().height;
  // Conserver le point visible pendant l'annulation de l'ancienne trajectoire.
  card.style.height=from+'px';
  const previous=animation;animation=null;
  if(previous)previous.cancel();
  intended=!intended;
  if(foldReducedMotion.matches||typeof card.animate!=='function'){
   card.open=intended;cleanup();return;
  }
  // Grouper les mesures avant le lancement de la nouvelle animation.
  // La hauteur du contenu ne sera plus consultée à chaque image.
  card.open=true;
  card.style.height='auto';
  // Employer les tailles preparees si le contenu n'a pas change.
  // Sinon garder les mesures live, indispensables pour les cartes dynamiques.
  const prepared=IU_FOLD_CACHE.get(card);
  const valid=prepared&&prepared.viewport===window.innerWidth&&
   Math.abs(prepared.width-card.getBoundingClientRect().width)<1;
  const cs=getComputedStyle(card);
  const borders=px(cs.borderTopWidth)+px(cs.borderBottomWidth);
  const collapsed=valid?prepared.closed:summary.getBoundingClientRect().height+
   borders+px(cs.paddingTop)+px(cs.paddingBottom);
  const expanded=valid?prepared.expanded:Math.max(collapsed,card.scrollHeight+borders);
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
  const duration=Math.max(150,Math.round(FOLD_MOTION_MS*Math.min(1,distance)));
  // Une animation déclarative et une seule écriture de hauteur au démarrage.
  const anim=card.animate([{height:from+'px'},{height:to+'px'}],{
   duration,easing:FOLD_MOTION_EASE,fill:'both'
  });
  animation=anim;
  animationStartedAt=performance.now();
  card.dataset.iuFoldStart=String(from);
  anim.onfinish=()=>finish(anim,to);
  anim.oncancel=()=>{if(animation===anim){animation=null;cleanup();}};
 });
}
window.IUSetupFold=setupUnifiedFold;
(function setupAllFolds(){
 const bind=(selector,summary,content,closing)=>{
  document.querySelectorAll(selector).forEach(card=>
   setupUnifiedFold(card,card.querySelector(summary),card.querySelector(content),closing));
 };
 bind('.fold-card',':scope > .fold-summary',':scope > .fold-body','is-fold-closing');
 bind('#planningAdminCard .planning-accordion',':scope > .planning-panel-summary',':scope > .planning-panel-content','is-planning-closing');
 bind('.planning-import-help',':scope > summary',':scope > .planning-import-help-body','is-detail-closing');
 bind('details.calc-alerts',':scope > summary',':scope > .calc-alerts-body, :scope > .recovery-body','is-detail-closing');
 bind('details.backup-advanced',':scope > summary',':scope > .backup-advanced-body','is-detail-closing');
 bind('details.events-disclosure',':scope > summary',':scope > .events-disclosure-content','is-events-closing');
 bind('#planningAdminCard details.iu-admin-category',':scope > summary',':scope > .iu-admin-category-body','is-admin-closing');
})();
function setupSecondaryDetailsAnimation(card,bodySelector){
 if(!card)return;
 setupUnifiedFold(card,card.querySelector(':scope > summary'),card.querySelector(`:scope > ${bodySelector}`),'is-detail-closing');
}
// V34.45 — Le bouton « Inventaire » déclenche le même parcours que les
// boutons Ma session : animation d'entrée, contrôle des données et
// persistance inchangés. Aucun défilement ni changement de focus imposé.
(function setupHeroSessionAction(){
 const trigger=$('heroStartSession');
 if(!trigger)return;
 trigger.addEventListener('click',()=>{
  const session=getActiveSession();
  if(session){
   if(session.pausedAt)$('resumeSession')?.click();
   return;
  }
  $('startSession')?.click();
 });
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
