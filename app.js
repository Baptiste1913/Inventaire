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
function saveCurrentWeigh(){clearTimeout(autoSaveTimer);autoSaveTimer=null;if(netGrams===null)return;const b=baskets.find(x=>x.id===$('basketSelect').value);const gross=parseKg($('grossWeight').value);if(!b||gross===null)return;
const entry={id:currentWeighId||uid(),at:Date.now(),name:b.name,tare:b.tare,gross,net:gross-b.tare};
if(currentWeighId){const existing=history.findIndex(x=>x.id===currentWeighId);if(existing>=0)history.splice(existing,1);}
currentWeighId=entry.id;history.unshift(entry);history=history.slice(0,15);persistHistory();$('weighStatus').textContent='✓ Pesée enregistrée automatiquement';animateConfirmation();}
function scheduleAutoSave(){clearTimeout(autoSaveTimer);autoSaveTimer=null;$('weighStatus').textContent='';if(netGrams!==null)autoSaveTimer=setTimeout(saveCurrentWeigh,1100);}
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
function calculate(){const raw=$('grossWeight').value.trim(),gross=raw?parseKg(raw):null,b=baskets.find(x=>x.id===$('basketSelect').value);netGrams=null;$('grossDisplay').textContent=gross===null?'— kg':`${fmt(gross)} kg`;$('tareDisplay').textContent=b?`− ${fmt(b.tare)} kg`:'— kg';$('errorMessage').textContent='';$('netDisplay').textContent='—';$('resultHint').textContent='Renseigne le poids pour calculer le net.';$('copyBtn').disabled=true;if(!raw||!b)return;if(gross===null){$('errorMessage').textContent='Saisis un poids positif avec au maximum 3 décimales (ex. 1.230 ou 1,230).';return;}if(gross<b.tare){$('errorMessage').textContent='Le poids brut est inférieur à la tare du panier.';return;}netGrams=gross-b.tare;$('netDisplay').textContent=fmt(netGrams);$('resultHint').textContent='Valeur prête à reporter dans ton inventaire.';$('copyBtn').disabled=false;}
function startEdit(id){const b=baskets.find(x=>x.id===id);if(!b)return;editingId=id;$('basketName').value=b.name;$('basketTare').value=fmt(b.tare);$('formTitle').textContent='Modifier le panier';$('saveBasketBtn').textContent='Enregistrer les modifications';$('cancelEditBtn').classList.remove('hidden');$('basketForm').scrollIntoView({behavior:'smooth',block:'center'});}
function cancelEdit(){editingId=null;$('basketForm').reset();$('formTitle').textContent='Ajouter un panier';$('saveBasketBtn').textContent='+ Ajouter le panier';$('cancelEditBtn').classList.add('hidden');}
function removeBasket(id){const b=baskets.find(x=>x.id===id);if(!b||!confirm(`Supprimer « ${b.name} » ?`))return;baskets=baskets.filter(x=>x.id!==id);if(editingId===id)cancelEdit();persist();}
$('basketForm').addEventListener('submit',e=>{e.preventDefault();const name=$('basketName').value.trim(),tare=parseKg($('basketTare').value);if(!name||tare===null){alert('Indique un nom et une tare valide en kg (ex. 0.554).');return;}if(editingId){const b=baskets.find(x=>x.id===editingId);if(b){b.name=name;b.tare=tare;}}else baskets.push({id:uid(),name,tare});cancelEdit();persist();});
$('grossWeight').addEventListener('input',()=>{calculate();scheduleAutoSave();});$('basketSelect').addEventListener('change',()=>{calculate();scheduleAutoSave();});$('grossWeight').addEventListener('blur',()=>{if(autoSaveTimer!==null)saveCurrentWeigh();});$('resetBtn').addEventListener('click',()=>{if(autoSaveTimer!==null)saveCurrentWeigh();currentWeighId=null;$('grossWeight').value='';$('weighStatus').textContent='';calculate();$('grossWeight').focus();});$('historyToggleTop').addEventListener('click',()=>{historyExpanded=!historyExpanded;renderHistory();});$('clearHistoryBtn').addEventListener('click',()=>{if(!confirm('Effacer définitivement toutes les pesées enregistrées ?'))return;clearTimeout(autoSaveTimer);autoSaveTimer=null;currentWeighId=null;history=[];historyExpanded=false;persistHistory();$('weighStatus').textContent='Historique effacé.';});$('cancelEditBtn').addEventListener('click',cancelEdit);
$('copyBtn').addEventListener('click',async()=>{if(netGrams===null)return;const value=fmt(netGrams);if(autoSaveTimer!==null)saveCurrentWeigh();try{await navigator.clipboard.writeText(value);$('copyBtn').textContent='✓ Copié : '+value;setTimeout(()=>$('copyBtn').textContent='Copier le poids net',1700);}catch(e){prompt('Copie ce poids :',value);}});
$('exportBtn').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({app:'Inventaires U',version:2,unit:'g',baskets},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='inventaires-u-paniers.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);$('backupStatus').textContent='Sauvegarde téléchargée.';});
$('importInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());const items=Array.isArray(data)?data:data.baskets;if(!Array.isArray(items)||items.some(b=>!b||typeof b.name!=='string'||!Number.isFinite(Number(b.tare))||Number(b.tare)<0))throw Error('Format incorrect');if(!confirm(`Importer ${items.length} panier(s) ? Cela remplacera ta liste actuelle.`))return;baskets=sanitize(items);cancelEdit();persist();$('backupStatus').textContent='Importation terminée.';}catch(err){$('backupStatus').textContent='Importation impossible : fichier non valide.';}finally{e.target.value='';}});
render();renderHistory();if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));

// V15 : statut réseau (indicateur uniquement, sans bloquer les calculs).
(function(){
  const indicator=document.getElementById('offlineIndicator');
  if(!indicator)return;
  function updateConnectionStatus(){indicator.hidden=navigator.onLine;}
  window.addEventListener('online',updateConnectionStatus);
  window.addEventListener('offline',updateConnectionStatus);
  updateConnectionStatus();
})();
