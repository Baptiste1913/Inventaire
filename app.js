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
 symbol.textContent=warning?'!':'↶';
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
if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='Aucune pesée enregistrée pour le moment.';list.append(p);return;}
for(const entry of (historyExpanded?history:history.slice(0,5))){const row=document.createElement('div');row.className='history-item';const info=document.createElement('div');info.className='history-info';const name=document.createElement('strong');name.textContent=entry.name;const date=document.createElement('span');date.textContent=new Date(entry.at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});const detail=document.createElement('span');detail.textContent=`${fmt(entry.gross)} − ${fmt(entry.tare)} kg`;info.append(name,date,detail);const result=document.createElement('strong');result.className='history-net';result.textContent=`${fmt(entry.net)} kg`;row.append(info,result);list.append(row);}}
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
baskets.forEach((b,index)=>{const item=document.createElement('div');item.className='basket-item';item.dataset.id=b.id;const handle=document.createElement('button');handle.className='drag-handle';handle.type='button';handle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="8" cy="5" r="1.7" fill="currentColor"/><circle cx="16" cy="5" r="1.7" fill="currentColor"/><circle cx="8" cy="12" r="1.7" fill="currentColor"/><circle cx="16" cy="12" r="1.7" fill="currentColor"/><circle cx="8" cy="19" r="1.7" fill="currentColor"/><circle cx="16" cy="19" r="1.7" fill="currentColor"/></svg>';handle.title='Maintenir et glisser pour réordonner';handle.setAttribute('aria-label',`Déplacer ${b.name}`);handle.draggable=true;item.draggable=false;const info=document.createElement('div');info.className='basket-info';const name=document.createElement('strong');name.textContent=b.name;const tare=document.createElement('span');tare.textContent=`${fmt(b.tare)} kg à vide`;info.append(name,tare);const moves=document.createElement('div');moves.className='move-actions';for(const [label,delta] of [['▲',-1],['▼',1]]){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.disabled=index+delta<0||index+delta>=baskets.length;btn.setAttribute('aria-label',`${label==='▲'?'Monter':'Descendre'} ${b.name}`);btn.addEventListener('click',()=>moveBy(b.id,delta));moves.append(btn);}const actions=document.createElement('div');actions.className='item-actions';const edit=document.createElement('button');edit.type='button';edit.className='small-action';edit.textContent='Modifier';edit.addEventListener('click',()=>startEdit(b.id));const del=document.createElement('button');del.type='button';del.className='small-action delete';del.textContent='Suppr.';del.setAttribute('aria-label',`Supprimer ${b.name}`);del.addEventListener('click',()=>removeBasket(b.id));actions.append(edit,del);item.append(handle,info,moves,actions);list.append(item);
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
 const raw=$('grossWeight').value.trim(),gross=raw?parseWeight(raw):null,b=baskets.find(x=>x.id===$('basketSelect').value);
 netGrams=null;$('grossDisplay').textContent=gross===null?'— kg':`${fmt(gross)} kg`;$('tareDisplay').textContent=b?`${fmt(b.tare)} kg`:'— kg';$('errorMessage').textContent='';$('netDisplay').textContent='—';$('resultHint').textContent='Renseigne le poids pour calculer le net.';$('copyBtn').disabled=true;
 if(!raw||!b){renderWarning();refreshActionButtons();return;}
 if(gross===null){$('errorMessage').textContent=entryMode==='g'?'Saisis des grammes entiers, par exemple 1250.':'Saisis un poids avec au maximum 3 décimales (ex. 1.230).';renderWarning();refreshActionButtons();return;}
 if(gross<b.tare){$('errorMessage').textContent='Le poids brut est inférieur à la tare du panier. Cette pesée ne sera pas enregistrée.';renderWarning();refreshActionButtons();return;}
 netGrams=gross-b.tare;$('netDisplay').textContent=fmt(netGrams);$('resultHint').textContent='Prêt à reporter.';
 const blocked=renderWarning();$('copyBtn').disabled=blocked;refreshActionButtons();
}
function refreshActionButtons(){
 const resetLabel=$('resetBtn').querySelector('span');if(resetLabel)resetLabel.innerHTML='Nouvelle<br>pesée';
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
 text.textContent=!session?'Aucune session en cours':`${session.pausedAt?'En pause':'En cours'} · ${count} pesée${count>1?'s':''}`;
 const heroAction=$('heroStartSession'),heroLabel=$('heroActionLabel');
 if(heroAction&&heroLabel){
  const label=!session?'Démarrer un inventaire':session.pausedAt?'Reprendre l’inventaire':'Continuer la pesée';
  heroLabel.textContent=label;heroAction.setAttribute('aria-label',label);
 }
}
// V33.48 : le mode Concentration reprend la session existante, sans dupliquer les pesées.
let focusWasActive=false;
let focusTransitionTimer=null;
let focusInitialized=false;
// V33.54 : le flou commence sur la vue que l'utilisateur quitte,
// avant le changement de disposition. La session ne change qu'une fois.
let focusMotionBusy=false;
function animateFocusEntry(action){
 if(focusMotionBusy)return;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){action();return;}
 focusMotionBusy=true;
 document.body.classList.remove('focus-preleave');
 document.body.classList.add('focus-preenter');
 window.setTimeout(()=>{
  document.body.classList.remove('focus-preenter');
  try{action();}finally{focusMotionBusy=false;}
 },660);
}
function animateFocusExit(action){
 if(focusMotionBusy)return;
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){action();return;}
 focusMotionBusy=true;
 document.body.classList.remove('focus-preenter');
 document.body.classList.add('focus-preleave');
 // Le blur porte sur la pesée et son bandeau; le reste du site reste net.
 window.setTimeout(()=>{
  try{action();}finally{
   document.body.classList.remove('focus-preleave');
   focusMotionBusy=false;
  }
 },490);
}
function syncFocusMode(){
 const session=getActiveSession();
 const active=Boolean(session&&!session.pausedAt);
 const toolbar=$('focusToolbar');
 if(!toolbar)return;
 toolbar.hidden=!active;
 document.body.classList.toggle('is-focus-mode',active);
 if(!active)$('focusConfirm').hidden=true;
 if(active){
  const stats=activeStats(session);
  $('focusDuration').textContent=durationLabel(stats.duration);
  $('focusCount').textContent=String(stats.count);
 }
 if(active!==focusWasActive){
  if(focusTransitionTimer)clearTimeout(focusTransitionTimer);
  document.body.classList.remove('focus-entering','focus-leaving');
  // Ne pas animer le chargement initial d'une session restaurée.
  if(focusInitialized && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
   const transitionClass=active?'focus-entering':'focus-leaving';
   // Retour dans le style iOS : chaque carte revient dans l'ordre du document,
   // avec un petit décalage progressif plutôt qu'un délai arbitraire nth-child.
   if(!active){
    const cards=[...document.querySelectorAll('.app > *')].filter(node=>
      !node.classList.contains('focus-toolbar') &&
      !node.classList.contains('offline-indicator') &&
      !node.hidden && getComputedStyle(node).display!=='none');
    cards.forEach((card,index)=>card.style.setProperty('--focus-spring-delay', `${Math.min(index,9)*55}ms`));
   }
   document.body.classList.add(transitionClass);
   focusTransitionTimer=setTimeout(()=>{document.body.classList.remove(transitionClass);focusTransitionTimer=null;},active?550:930);
  }
  focusWasActive=active;
  // Évite que l'utilisateur reste au milieu d'une page devenue masquée.
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
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
function renderLiveSessionStats(){
 const session=getActiveSession();if(!session)return;
 const stats=activeStats(session);
 $('sessionDuration').textContent=durationLabel(stats.duration);
 $('sessionWeighCount').textContent=String(stats.count);
 $('sessionNet').textContent=`${fmt(stats.net)} kg`;
 renderHeroSummary();
 syncFocusMode();
}
function startSession(){const review=$('sessionQualityReview');if(review)review.hidden=true;
 if(getActiveSession()||!flushPending())return;
 const before=sessions,prevId=activeSessionId;
 const created={id:uid(),startedAt:Date.now(),endedAt:null,pausedAt:null,pausedMs:0,entries:[]};
 sessions=[created,...sessions];activeSessionId=created.id;
 if(!persistSessions()){sessions=before;activeSessionId=prevId;return;}
 clearWeigh();renderV22();$('sessionMessage').textContent='';
}
function pauseSession(){
 const session=getActiveSession();if(!session||session.pausedAt||!flushPending())return;
 session.pausedAt=Date.now();
 if(!persistSessions()){session.pausedAt=null;return;}
 clearWeigh();renderV22();$('sessionMessage').textContent='';
}
function resumeSession(){
 const session=getActiveSession();if(!session||!session.pausedAt)return;
 const oldPausedAt=session.pausedAt,oldPausedMs=session.pausedMs;
 session.pausedMs+=Date.now()-session.pausedAt;session.pausedAt=null;
 if(!persistSessions()){session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;return;}
 clearWeigh();renderV22();$('sessionMessage').textContent='';
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
 clearWeigh();renderV22();reviewSessionQuality(session);$('sessionMessage').textContent='Inventaire terminé. Retrouve son bilan dans « Mes inventaires ».';
 offerUndo('Inventaire terminé.',()=>{
  if(activeSessionId||!session.endedAt||session.endedAt!==now)return false;
  session.endedAt=null;session.pausedAt=oldPausedAt;session.pausedMs=oldPausedMs;activeSessionId=session.id;
  if(!persistSessions()){session.endedAt=now;session.pausedAt=null;activeSessionId=null;return false;}
  renderV22();$('sessionMessage').textContent='Inventaire repris.';return true;
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
 for(const s of (sessionsExpanded?ended:ended.slice(0,5))){const item=document.createElement('details');item.className='v22-session-item';const sum=document.createElement('summary');const name=document.createElement('strong');name.textContent=new Date(s.startedAt).toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});const meta=document.createElement('span');const stats=activeStats(s);meta.textContent=`${stats.count} pesées · ${fmt(stats.net)} kg · ${durationLabel(stats.duration)}`;sum.append(name,meta);
  const quickRemove=document.createElement('button');
  quickRemove.type='button';quickRemove.className='quick-delete-session-btn';quickRemove.textContent='Suppr.';
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
$('focusCancelStop').addEventListener('click',()=>{$('focusConfirm').hidden=true;$('focusStop').focus();});
$('focusConfirmStop').addEventListener('click',()=>{$('focusConfirm').hidden=true;animateFocusExit(()=>$('finishSession').click());});
// Actualise le chronomètre même sans nouvelle pesée.
setInterval(()=>{if(document.visibilityState==='visible'&&document.body.classList.contains('is-focus-mode'))syncFocusMode();},1000);
$('startSession').addEventListener('click',()=>animateFocusEntry(startSession));
$('pauseSession').addEventListener('click',pauseSession);
$('resumeSession').addEventListener('click',()=>animateFocusEntry(resumeSession));
$('finishSession').addEventListener('click',finishSession);
$('sessionsToggle').addEventListener('click',()=>{sessionsExpanded=!sessionsExpanded;renderSessionsHistory();});
$('fullExportBtn').addEventListener('click',fullExport);
$('fullImportInput').addEventListener('change',fullImport);
$('sessionsCsvBtn').addEventListener('click',()=>{const ended=sessions.filter(s=>Boolean(s.endedAt));if(!ended.length){$('backupStatus').textContent='Aucune session terminée à exporter.';return;}exportCSV(ended,`inventaires-u-sessions-${new Date().toISOString().slice(0,10)}.csv`);$('backupStatus').textContent='CSV des sessions exporté.';});
setInterval(()=>{if(!document.hidden)renderLiveSessionStats();},1000);

$('basketForm').addEventListener('submit',e=>{e.preventDefault();const name=$('basketName').value.trim(),tare=parseKg($('basketTare').value);if(!name||tare===null){$('basketFormError').textContent='Indique un nom et une tare valide en kg (ex. 0.554).';return;}$('basketFormError').textContent='';const next=baskets.map(b=>({...b}));if(editingId){const b=next.find(x=>x.id===editingId);if(b){b.name=name;b.tare=tare;}}else next.push({id:uid(),name,tare});if(commitBaskets(next)){cancelEdit();$('basketFormError').textContent='';}});
$('basketName').addEventListener('input',()=>{$('basketFormError').textContent='';});
$('basketTare').addEventListener('input',()=>{$('basketFormError').textContent='';});


$('grossWeight').addEventListener('input',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('basketSelect').addEventListener('change',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('grossWeight').addEventListener('blur',()=>{if(autoSaveTimer!==null)saveCurrentWeigh();});
// iOS peut suspendre le timer de 1,1 s dès que l'application se verrouille.
// Forcer une sauvegarde synchrone des données valides avant la suspension.
function saveBeforeSuspend(){if(autoSaveTimer!==null)saveCurrentWeigh();}
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveBeforeSuspend();else renderLiveSessionStats();});
window.addEventListener('pagehide',saveBeforeSuspend);
$('resetBtn').addEventListener('click',newWeigh);
$('historyToggleTop').addEventListener('click',()=>{historyExpanded=!historyExpanded;renderHistory();});
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
 if(copied){$('copyBtn').textContent='Copié : '+value;setTimeout(()=>$('copyBtn').textContent='Copier le poids net',1700);}
 else $('weighStatus').textContent=`Copie automatique indisponible. Sélectionne manuellement le poids net : ${value} kg.`;
});

$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'Inventaires U',version:2,unit:'g',baskets},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='inventaires-u-paniers.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('backupStatus').textContent='Export des paniers généré.';});
$('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await readTextFile(file));const items=Array.isArray(data)?data:data.baskets;if(!Array.isArray(items)||items.some(b=>!b||typeof b.name!=='string'||!Number.isFinite(Number(b.tare))||Number(b.tare)<0))throw Error('Format incorrect');const next=sanitize(items);if(!commitBaskets(next))throw Error('Stockage indisponible');dismissUndo();cancelEdit();$('backupStatus').textContent='Importation terminée.';}catch(err){$('backupStatus').textContent='Importation impossible : fichier non valide.';}finally{e.target.value='';}});



render();renderHistory();renderV22();
renderBackupSummary();
$('backupCard').addEventListener('toggle',()=>{if($('backupCard').open)renderBackupSummary();});
if('serviceWorker'in navigator)window.addEventListener('load',async()=>{try{const reg=await navigator.serviceWorker.register('./sw.js');reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){const active=getActiveSession();$('weighStatus').textContent=active?'Mise à jour disponible : termine ton inventaire avant de recharger.':'Mise à jour disponible : recharge la page quand tu le souhaites.';}});});}catch(e){console.warn(e);}});

// V20 : notification persistante jusqu'au retour en ligne ou fermeture manuelle.
(function(){
  const indicator=document.getElementById('offlineIndicator');
  const dismiss=document.getElementById('offlineDismiss');
  if(!indicator||!dismiss)return;
  indicator.classList.add('toast-stacked-offline');
  toastStack().append(indicator);
  let dismissed=false;
  let finishTimer=null;
  let visible=false;
  const stopExit=()=>{if(finishTimer!==null){clearTimeout(finishTimer);finishTimer=null;}};
  function show(){
    if(dismissed||visible)return;
    stopExit();
    indicator.hidden=false;
    document.body.classList.add('offline-notice-visible');
    indicator.classList.remove('is-leaving','is-entering');
    void indicator.offsetWidth;
    indicator.classList.add('is-entering');
    visible=true;
  }
  function hide(){
    stopExit();
    if(!visible){indicator.hidden=true;indicator.classList.remove('is-entering','is-leaving');return;}
    visible=false;
    document.body.classList.remove('offline-notice-visible');
    indicator.classList.remove('is-entering');
    indicator.classList.add('is-leaving');
    finishTimer=setTimeout(()=>{
      if(!visible){indicator.hidden=true;indicator.classList.remove('is-leaving');}
      finishTimer=null;
    },280);
  }
  function sync(){
    if(navigator.onLine){dismissed=false;hide();}
    else show();
  }
  dismiss.addEventListener('click',()=>{dismissed=true;hide();});
  window.addEventListener('online',sync);
  window.addEventListener('offline',()=>{dismissed=false;sync();});
  window.addEventListener('pageshow',sync);
  sync();
})();


// V31.31 — moteur d’accordéon partagé : une seule courbe, aucune animation
// concurrente sur le contenu et mesure de hauteur cohérente pour Safari.
const FOLD_MOTION_MS=560;
const FOLD_MOTION_EASE='cubic-bezier(.22,.75,.24,1)';
function setupUnifiedFold(card,summary,content,closingClass){
 if(!card||!summary||!content||card.dataset.unifiedFold==='yes')return;
 card.dataset.unifiedFold='yes';
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let animation=null,requested=card.open;
 summary.addEventListener('click',event=>{
  if(reduced.matches||typeof card.animate!=='function')return;
  event.preventDefault();
  // Respecter aussi les ouvertures programmatiques (édition depuis la liste).
  if(!animation)requested=card.open;
  const next=!requested;requested=next;
  const currentHeight=card.getBoundingClientRect().height;
  if(animation){animation.cancel();animation=null;}
  // Maintenir le contenu dans le flux pendant toute la fermeture.
  card.open=true;
  card.classList.toggle(closingClass,!next);
  const cs=getComputedStyle(card);
  const px=x=>parseFloat(x)||0;
  const extra=px(cs.borderTopWidth)+px(cs.borderBottomWidth)+px(cs.paddingTop)+px(cs.paddingBottom);
  const collapsed=summary.getBoundingClientRect().height+extra;
  const expanded=collapsed+content.getBoundingClientRect().height;
  const target=next?expanded:collapsed;
  if(Math.abs(currentHeight-target)<.5){card.open=next;card.classList.remove(closingClass);return;}
  const anim=card.animate([{height:`${currentHeight}px`},{height:`${target}px`}],
    {duration:FOLD_MOTION_MS,easing:FOLD_MOTION_EASE,fill:'both'});
  animation=anim;
  anim.onfinish=()=>{
   if(animation!==anim)return;
   animation=null;
   if(!next)card.open=false;
   anim.cancel();
   card.classList.remove(closingClass);
  };
 });
}
(function setupFoldAnimations(){
 document.querySelectorAll('.fold-card').forEach(card=>
  setupUnifiedFold(card,card.querySelector(':scope > .fold-summary'),card.querySelector(':scope > .fold-body'),'is-fold-closing'));
})();
// V33.37 : même moteur d'animation (560 ms) pour les quatre outils d'administration.
document.querySelectorAll('.planning-accordion').forEach(card=>
 setupUnifiedFold(card,card.querySelector(':scope > .planning-panel-summary'),card.querySelector(':scope > .planning-panel-content'),'is-planning-closing'));
function setupSecondaryDetailsAnimation(card,bodySelector){
 if(!card)return;
 setupUnifiedFold(card,card.querySelector(':scope > summary'),card.querySelector(`:scope > ${bodySelector}`),'is-detail-closing');
}
setupSecondaryDetailsAnimation($('weighSettings'),'.calc-alerts-body');


// La banderole pilote la VRAIE session : aucune seconde session n'est créée.
(function setupHeroSessionAction(){
 const trigger=$('heroStartSession');
 if(!trigger)return;
 trigger.addEventListener('click',()=>{
  const session=getActiveSession();
  if(!session){$('startSession').click();return;}
  if(session.pausedAt){$('resumeSession').click();return;}
  // En cours : si un jour la bannière reste visible, revenir à la pesée.
  const destination=$('calc-title');
  if(destination)destination.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
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
