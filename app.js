'use strict';
const STORAGE_KEY='inventaires-u-v2';
const LEGACY_KEY='tare-paniettes-v1';
const HISTORY_KEY='inventaires-u-history-v1';
const $=id=>document.getElementById(id);
const uid=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const DEFAULT_BASKETS=[{id:uid(),name:'Panier normal',tare:554},{id:uid(),name:'Demi-panier',tare:324},{id:uid(),name:'Panier ovale',tare:538},{id:uid(),name:'Grand panier',tare:1064}];
const fmt=grams=>(grams/1000).toFixed(3);
function parseKg(value){const s=String(value).trim().replace(',','.');if(!/^\d+(?:\.\d{1,3})?$/.test(s))return null;const n=Number(s)*1000;return Number.isSafeInteger(Math.round(n))?Math.round(n):null;}
function sanitize(arr){return arr.filter(b=>b&&typeof b.name==='string'&&b.name.trim()&&Number.isFinite(Number(b.tare))&&Number(b.tare)>=0).map(b=>({id:String(b.id||uid()),name:b.name.trim().slice(0,40),tare:Math.round(Number(b.tare))}));}
function loadBaskets(){for(const key of [STORAGE_KEY,LEGACY_KEY]){try{const raw=localStorage.getItem(key);if(raw!==null){const parsed=JSON.parse(raw);if(Array.isArray(parsed))return sanitize(parsed);}}catch(e){console.warn('Lecture des paniers impossible',e);}}return DEFAULT_BASKETS;}
let baskets=loadBaskets(),editingId=null,netGrams=null,dragId=null;
function loadHistory(){try{const a=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x.name==='string'&&Number.isFinite(x.net)&&Number.isFinite(x.gross)&&Number.isFinite(x.tare)&&typeof x.at==='number').slice(0,15):[];}catch{return [];}}
let history=loadHistory(),historyExpanded=false,autoSaveTimer=null,currentWeighId=null;
function persistHistory(){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(history));}catch{$('weighStatus').textContent='Impossible de sauvegarder cet historique sur cet appareil.';}renderHistory();}
function renderHistory(){const list=$('historyList');list.replaceChildren();$('historyCount').textContent=`${history.length} pesée${history.length>1?'s':''}`;$('clearHistoryBtn').hidden=!history.length;
const btn=$('historyToggleTop');btn.hidden=history.length<=5;btn.setAttribute('aria-expanded',String(historyExpanded));const label=btn.querySelector('.history-toggle-label');if(label)label.textContent=historyExpanded?'Réduire l’historique':`Voir les ${history.length} pesées`;
if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='Aucune pesée enregistrée pour le moment.';list.append(p);return;}
for(const entry of (historyExpanded?history:history.slice(0,5))){const row=document.createElement('div');row.className='history-item';const info=document.createElement('div');info.className='history-info';const name=document.createElement('strong');name.textContent=entry.name;const date=document.createElement('span');date.textContent=new Date(entry.at).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});const detail=document.createElement('span');detail.textContent=`${fmt(entry.gross)} − ${fmt(entry.tare)} kg`;info.append(name,date,detail);const result=document.createElement('strong');result.className='history-net';result.textContent=`${fmt(entry.net)} kg`;row.append(info,result);list.append(row);}}
function animateConfirmation(){const result=document.querySelector('.result');result.classList.remove('result-confirmed');void result.offsetWidth;result.classList.add('result-confirmed');setTimeout(()=>result.classList.remove('result-confirmed'),850);}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(baskets));}catch(e){$('backupStatus').textContent='Impossible de sauvegarder localement : espace de stockage indisponible.';}render();}
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
   if(newOrder.length===baskets.length&&newOrder.some((b,i)=>b.id!==baskets[i].id)){baskets=newOrder;persist();}else render();
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
function reorder(from,to){const i=baskets.findIndex(b=>b.id===from),j=baskets.findIndex(b=>b.id===to);if(i<0||j<0||i===j){render();return;}const [item]=baskets.splice(i,1);baskets.splice(j,0,item);persist();}
function moveBy(id,delta){const i=baskets.findIndex(b=>b.id===id),j=i+delta;if(i<0||j<0||j>=baskets.length)return;[baskets[i],baskets[j]]=[baskets[j],baskets[i]];persist();}
function startEdit(id){const b=baskets.find(x=>x.id===id);if(!b)return;editingId=id;$('basketName').value=b.name;$('basketTare').value=fmt(b.tare);$('formTitle').textContent='Modifier le panier';$('saveBasketBtn').textContent='Enregistrer les modifications';$('cancelEditBtn').classList.remove('hidden');$('basketForm').scrollIntoView({behavior:'smooth',block:'center'});}
function cancelEdit(){editingId=null;$('basketForm').reset();$('formTitle').textContent='Ajouter un panier';$('saveBasketBtn').textContent='+ Ajouter le panier';$('cancelEditBtn').classList.add('hidden');}
function removeBasket(id){const b=baskets.find(x=>x.id===id);if(!b||!confirm(`Supprimer « ${b.name} » ?`))return;baskets=baskets.filter(x=>x.id!==id);if(editingId===id)cancelEdit();persist();}
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
function cleanGroup(x){if(!x||typeof x!=='object'||!Array.isArray(x.entries))return null;return {id:String(x.id||uid()).slice(0,90),entries:x.entries.map(cleanWeigh).filter(Boolean),at:Number(x.at)||Date.now()};}
const loadedSessions=readJSON(SESSION_KEY,{sessions:[],activeId:null});
let sessions=(Array.isArray(loadedSessions?.sessions)?loadedSessions.sessions:[]).map(cleanSession).filter(Boolean);
let activeSessionId=typeof loadedSessions?.activeId==='string'&&sessions.some(s=>s.id===loadedSessions.activeId&&!s.endedAt)?loadedSessions.activeId:null;
let activeGroup=null,lastGroup=null;
let entryMode=localStorage.getItem(MODE_KEY)==='g'?'g':'kg';
let maxGrossGrams=parseKg(localStorage.getItem(LIMIT_KEY)||'20.000')||20000;
let confirmDuplicates=localStorage.getItem(DUPLICATE_CONFIRM_KEY)!=='false';
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
function persistSessions(){try{localStorage.setItem(SESSION_KEY,JSON.stringify({sessions,activeId:activeSessionId}));return true;}catch{const el=$('sessionMessage');if(el)el.textContent='⚠️ Espace local insuffisant : exporte tes données pour éviter toute perte.';return false;}}
function persistGroup(){return true;}
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
 const prev=history.find(x=>x.id===currentWeighId);
 // Évite une seconde écriture si le poids et la tare n'ont pas changé.
 if(prev&&prev.gross===gross&&prev.tare===b.tare&&prev.name===b.name)return true;
 const entry={id:currentWeighId||uid(),at:Date.now(),name:b.name,tare:b.tare,gross,net:gross-b.tare};
 const oldIndex=history.findIndex(x=>x.id===entry.id);if(oldIndex>=0)history.splice(oldIndex,1);
 currentWeighId=entry.id;history.unshift(entry);history=history.slice(0,15);
 const session=getActiveSession();if(session&&!session.pausedAt){const existing=session.entries.findIndex(x=>x.id===entry.id);const rec={...entry,groupId:entry.id};if(existing>=0)session.entries[existing]=rec;else session.entries.push(rec);persistSessions();}
 persistHistory();renderV22();$('weighStatus').textContent='Pesée enregistrée automatiquement';animateConfirmation();return true;
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
function renderGroup(){}
// Mise à jour légère du HUD, sans retraitement des historiques.
function islandDurationLabel(ms){const minutes=Math.floor(Math.max(0,ms)/60000),h=Math.floor(minutes/60),m=minutes%60;return h?`${h} h ${String(m).padStart(2,'0')}`:`${m} min`;}
function renderInventoryIsland(){}
function renderSessionControls(){const s=getActiveSession();$('sessionBadge').textContent=s?(s.pausedAt?'En pause':'En cours'):'Aucune session';$('sessionBadge').classList.toggle('active',Boolean(s&&!s.pausedAt));$('sessionLive').hidden=!s;
 $('startSession').hidden=Boolean(s);$('pauseSession').hidden=!s||Boolean(s.pausedAt);$('resumeSession').hidden=!s||!s.pausedAt;$('finishSession').hidden=!s;
 $('sessionHelp').textContent=s?(s.pausedAt?'En pause : reprends pour enregistrer tes pesées.':`Début : ${dateLabel(s.startedAt)} · Suivi automatique actif.`):'Démarre une session pour conserver les statistiques de ton inventaire.';
 if(s){const stats=activeStats(s);$('sessionDuration').textContent=durationLabel(stats.duration);$('sessionWeighCount').textContent=String(stats.count);$('sessionNet').textContent=`${fmt(stats.net)} kg`;}
}
function startSession(){if(getActiveSession())return;if(!flushPending())return;clearWeigh();const s={id:uid(),startedAt:Date.now(),endedAt:null,pausedAt:null,pausedMs:0,entries:[]};sessions.unshift(s);activeSessionId=s.id;persistSessions();renderV22();$('sessionMessage').textContent='Session démarrée. Tes pesées sont comptabilisées automatiquement.';}
function pauseSession(){const s=getActiveSession();if(!s||s.pausedAt||!flushPending())return;s.pausedAt=Date.now();clearWeigh();persistSessions();renderV22();$('sessionMessage').textContent='Session en pause.';}
function resumeSession(){const s=getActiveSession();if(!s||!s.pausedAt)return;s.pausedMs+=Date.now()-s.pausedAt;s.pausedAt=null;clearWeigh();persistSessions();renderV22();$('sessionMessage').textContent='Session reprise.';}
function finishSession(){const s=getActiveSession();if(!s)return;if(!s.pausedAt&&!flushPending())return;
 if(!confirm('Terminer cette session et enregistrer son bilan ?'))return;
 const now=Date.now();if(s.pausedAt){s.pausedMs+=now-s.pausedAt;s.pausedAt=null;}s.endedAt=now;activeSessionId=null;clearWeigh();persistSessions();renderV22();$('sessionMessage').textContent='Inventaire terminé. Retrouve son bilan dans « Mes inventaires ».';}
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
 box.append(hist);const actions=document.createElement('div');actions.className='v22-session-export';const csv=document.createElement('button');csv.type='button';csv.className='outline-btn';csv.textContent='Exporter en CSV';csv.addEventListener('click',()=>exportCSV([s],`inventaire-u-${new Date(s.startedAt).toISOString().slice(0,10)}.csv`));const json=document.createElement('button');json.type='button';json.className='outline-btn';json.textContent='Bilan JSON';json.addEventListener('click',()=>download(JSON.stringify({app:'Inventaires U',version:27,sessions:[s]},null,2),`inventaire-u-${new Date(s.startedAt).toISOString().slice(0,10)}.json`,'application/json'));const remove=document.createElement('button');remove.type='button';remove.className='delete-session-btn';remove.textContent='Supprimer ce bilan';remove.setAttribute('aria-label',`Supprimer le bilan du ${dateLabel(s.startedAt)}`);remove.addEventListener('click',()=>deleteSession(s.id));actions.append(csv,json);box.append(actions,remove);return box;}
function deleteSession(id){
 const target=sessions.find(s=>s.id===id&&Boolean(s.endedAt));
 if(!target)return;
 const label=dateLabel(target.startedAt);
 if(!confirm(`Supprimer définitivement le bilan du ${label} et ses ${target.entries.length} pesées archivées ?\nCette action ne peut pas être annulée. Les 15 dernières pesées du suivi rapide ne seront pas modifiées.`))return;
 const previous=sessions;
 sessions=sessions.filter(s=>s.id!==id);
 if(!persistSessions()){
   sessions=previous;
   $('bilanNotice').textContent='Suppression impossible : stockage local indisponible.';
   return;
 }
 renderSessionsHistory();
 $('bilanNotice').textContent=`Bilan du ${label} supprimé.`;
}
function renderSessionsHistory(){const ended=sessions.filter(s=>Boolean(s.endedAt)).sort((a,b)=>b.startedAt-a.startedAt);$('sessionsCount').textContent=`${ended.length} session${ended.length>1?'s':''}`;
 const list=$('sessionsHistoryList');list.replaceChildren();$('sessionsToggle').hidden=ended.length<=5;$('sessionsToggle').textContent=sessionsExpanded?'Réduire la liste':`Voir les ${ended.length} sessions`;
 if(!ended.length){const p=document.createElement('p');p.className='empty';p.textContent='Aucune session terminée pour le moment.';list.append(p);return;}
 for(const s of (sessionsExpanded?ended:ended.slice(0,5))){const item=document.createElement('details');item.className='v22-session-item';const sum=document.createElement('summary');const name=document.createElement('strong');name.textContent=new Date(s.startedAt).toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});const meta=document.createElement('span');const stats=activeStats(s);meta.textContent=`${stats.count} pesées · ${fmt(stats.net)} kg · ${durationLabel(stats.duration)}`;sum.append(name,meta);item.append(sum,summaryElement(s));list.append(item);}
}
function renderV22(){renderGroup();renderSessionControls();renderSessionsHistory();$('inputUnit').textContent=entryMode==='g'?'g':'kg';$('modeKg').setAttribute('aria-pressed',String(entryMode==='kg'));$('modeG').setAttribute('aria-pressed',String(entryMode==='g'));$('inputHint').textContent=entryMode==='g'?'Sans virgule : tape 1250 pour obtenir 1,250 kg.':'Avec décimales : tape 1,250 pour 1,250 kg.';$('grossWeight').setAttribute('inputmode',entryMode==='g'?'numeric':'decimal');$('grossWeight').placeholder=entryMode==='g'?'Ex. 1250':'Ex. 1.230';$('maxGrossLimit').value=fmt(maxGrossGrams);$('confirmDuplicates').checked=confirmDuplicates;}
function switchMode(mode){if(mode===entryMode)return;const parsed=parseWeight($('grossWeight').value);entryMode=mode;try{localStorage.setItem(MODE_KEY,mode);}catch{}if(parsed!==null)$('grossWeight').value=weightFromGrams(parsed);acceptedAnomalyKey='';calculate();scheduleAutoSave();renderV22();}
function setLimit(){const n=parseKg($('maxGrossLimit').value);if(n===null||n<1000||n>1000000){$('maxGrossLimit').value=fmt(maxGrossGrams);$('weighStatus').textContent='Choisis un seuil entre 1 et 1000 kg.';return;}maxGrossGrams=n;try{localStorage.setItem(LIMIT_KEY,fmt(n));}catch{}acceptedAnomalyKey='';calculate();scheduleAutoSave();}
function download(data,name,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function exportCSV(items,name){const head=['Session','Début session','Fin session','Durée active (min)','Pesée','Date/heure pesée','Groupe de pesées','Type de panier','Poids brut (kg)','Tare (kg)','Poids net (kg)'];
 const csvCell=x=>`"${String(x??'').replaceAll('"','""')}"`;const lines=[head.map(csvCell).join(';')];for(const s of items){const st=activeStats(s);for(const [i,e] of s.entries.entries()){lines.push([s.id,dateLabel(s.startedAt),s.endedAt?dateLabel(s.endedAt):'En cours',(st.duration/60000).toFixed(1).replace('.',','),i+1,dateLabel(e.at),e.groupId,e.name,fmt(e.gross).replace('.',','),fmt(e.tare).replace('.',','),fmt(e.net).replace('.',',')].map(csvCell).join(';'));}}
 download('\ufeff'+lines.join('\r\n'),name,'text/csv;charset=utf-8');}
function fullExport(){if(autoSaveTimer!==null)saveCurrentWeigh();download(JSON.stringify({app:'Inventaires U',version:27,unit:'g',exportedAt:Date.now(),baskets,history,sessions,activeSessionId,activeGroup:null,lastGroup:null},null,2),`inventaires-u-sauvegarde-${new Date().toISOString().slice(0,10)}.json`,'application/json');$('backupStatus').textContent='Sauvegarde complète exportée.';}
async function fullImport(event){const file=event.target.files?.[0];if(!file)return;try{
 if(file.size>10*1024*1024)throw Error('Taille excessive');const data=JSON.parse(await file.text());if(!data||data.app!=='Inventaires U'||![22,23,24,25,26,27].includes(data.version)||!Array.isArray(data.baskets)||!Array.isArray(data.sessions)||!Array.isArray(data.history))throw Error('Format incorrect');
 const bb=sanitize(data.baskets),ss=data.sessions.map(cleanSession);if(ss.some(x=>!x))throw Error('Session incorrecte');const hh=data.history.map(cleanWeigh);if(hh.some(x=>!x))throw Error('Historique incorrect');
 if(!confirm(`Restaurer ${bb.length} panier(s), ${ss.length} session(s) et ${hh.length} pesée(s) ? Les données actuelles seront remplacées. Exporte-les d’abord si nécessaire.`))return;
 clearTimeout(autoSaveTimer);autoSaveTimer=null;baskets=bb;sessions=ss;history=hh.slice(0,15);activeSessionId=typeof data.activeSessionId==='string'&&sessions.some(s=>s.id===data.activeSessionId&&!s.endedAt)?data.activeSessionId:null;activeGroup=null;lastGroup=null;currentWeighId=null;
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(baskets));}catch{}persistHistory();persistSessions();persistGroup();render();renderV22();$('backupStatus').textContent='Sauvegarde complète restaurée.';
 }catch(e){$('backupStatus').textContent='Importation impossible : sauvegarde invalide.';}finally{event.target.value='';}}
// Commandes V22.
$('modeKg').addEventListener('click',()=>switchMode('kg'));
$('modeG').addEventListener('click',()=>switchMode('g'));
$('maxGrossLimit').addEventListener('change',setLimit);
$('confirmDuplicates').addEventListener('change',event=>{confirmDuplicates=event.target.checked;try{localStorage.setItem(DUPLICATE_CONFIRM_KEY,String(confirmDuplicates));}catch{}acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('confirmWarning').addEventListener('click',()=>{const gross=parseWeight($('grossWeight').value),b=baskets.find(x=>x.id===$('basketSelect').value);if(gross===null||!b||gross<b.tare)return;acceptedAnomalyKey=anomalyKey(gross,b);calculate();saveCurrentWeigh();});
$('startSession').addEventListener('click',startSession);
$('pauseSession').addEventListener('click',pauseSession);
$('resumeSession').addEventListener('click',resumeSession);
$('finishSession').addEventListener('click',finishSession);
$('sessionsToggle').addEventListener('click',()=>{sessionsExpanded=!sessionsExpanded;renderSessionsHistory();});
$('fullExportBtn').addEventListener('click',fullExport);
$('fullImportInput').addEventListener('change',fullImport);
$('sessionsCsvBtn').addEventListener('click',()=>{const ended=sessions.filter(s=>Boolean(s.endedAt));if(!ended.length){$('backupStatus').textContent='Aucune session terminée à exporter.';return;}exportCSV(ended,`inventaires-u-sessions-${new Date().toISOString().slice(0,10)}.csv`);$('backupStatus').textContent='CSV des sessions exporté.';});
setInterval(()=>{const s=getActiveSession();if(s){$('sessionDuration').textContent=durationLabel(activeStats(s).duration);}},1000);

$('basketForm').addEventListener('submit',e=>{e.preventDefault();const name=$('basketName').value.trim(),tare=parseKg($('basketTare').value);if(!name||tare===null){alert('Indique un nom et une tare valide en kg (ex. 0.554).');return;}if(editingId){const b=baskets.find(x=>x.id===editingId);if(b){b.name=name;b.tare=tare;}}else baskets.push({id:uid(),name,tare});cancelEdit();persist();});


$('grossWeight').addEventListener('input',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('basketSelect').addEventListener('change',()=>{acceptedAnomalyKey='';calculate();scheduleAutoSave();});
$('grossWeight').addEventListener('blur',()=>{if(autoSaveTimer!==null)saveCurrentWeigh();});
$('resetBtn').addEventListener('click',newWeigh);
$('historyToggleTop').addEventListener('click',()=>{historyExpanded=!historyExpanded;renderHistory();});
$('clearHistoryBtn').addEventListener('click',()=>{if(!confirm('Effacer les 15 dernières pesées visibles ? Les pesées des sessions restent conservées.'))return;clearTimeout(autoSaveTimer);autoSaveTimer=null;currentWeighId=null;history=[];historyExpanded=false;persistHistory();$('weighStatus').textContent='Historique récent effacé.';});
$('cancelEditBtn').addEventListener('click',cancelEdit);
$('copyBtn').addEventListener('click',async()=>{if(netGrams===null||renderWarning()||!flushPending())return;const value=fmt(netGrams);try{await navigator.clipboard.writeText(value);$('copyBtn').textContent='Copié : '+value;setTimeout(()=>$('copyBtn').textContent='Copier le poids net',1700);}catch(e){prompt('Copie ce poids :',value);}});

$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'Inventaires U',version:2,unit:'g',baskets},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='inventaires-u-paniers.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('backupStatus').textContent='Sauvegarde téléchargée.';});
$('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());const items=Array.isArray(data)?data:data.baskets;if(!Array.isArray(items)||items.some(b=>!b||typeof b.name!=='string'||!Number.isFinite(Number(b.tare))||Number(b.tare)<0))throw Error('Format incorrect');if(!confirm(`Importer ${items.length} panier(s) ? Cela remplacera ta liste actuelle.`))return;baskets=sanitize(items);cancelEdit();persist();$('backupStatus').textContent='Importation terminée.';}catch(err){$('backupStatus').textContent='Importation impossible : fichier non valide.';}finally{e.target.value='';}});


render();renderHistory();renderV22();
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));

// V20 : notification persistante jusqu'au retour en ligne ou fermeture manuelle.
(function(){
  const indicator=document.getElementById('offlineIndicator');
  const dismiss=document.getElementById('offlineDismiss');
  if(!indicator||!dismiss)return;
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
    },390);
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


// V27 — animation symétrique des catégories (ouverture ET fermeture).
// Le <details> reste ouvert le temps de l'animation sortante.
(function setupFoldAnimations(){
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  for(const card of document.querySelectorAll('.fold-card')){
    const summary=card.querySelector(':scope > .fold-summary');
    const content=card.querySelector(':scope > .fold-body');
    if(!summary||!content)continue;
    let motion=null;
    let targetOpen=card.open;
    summary.addEventListener('click',event=>{
      if(reduceMotion.matches||typeof content.animate!=='function')return;
      event.preventDefault();
      const next=!targetOpen;
      targetOpen=next;
      const currentHeight=card.open?content.getBoundingClientRect().height:0;
      if(motion){motion.cancel();motion=null;}
      if(next)card.open=true;
      const goalHeight=next?content.scrollHeight:0;
      if(Math.abs(currentHeight-goalHeight)<1){card.open=next;return;}
      content.style.overflow='hidden';
      const animation=content.animate([
        {height:`${currentHeight}px`,opacity:next?0:1,transform:next?'translateY(-7px)':'translateY(0)'},
        {height:`${goalHeight}px`,opacity:next?1:0,transform:next?'translateY(0)':'translateY(-7px)'}
      ],{duration:250,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'});
      motion=animation;
      animation.onfinish=()=>{
        if(motion!==animation)return;
        motion=null;
        animation.cancel();
        content.style.overflow='';
        if(!next)card.open=false;
      };
    });
  }
})();
