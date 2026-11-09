/* Inventaires U V33.35 — administration sécurisée du planning.
   L'interface est réservée aux comptes autorisés PAR LES POLITIQUES RLS SUPABASE.
   La visibilité du panneau n'est pas une mesure de sécurité. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const card=$('planningAdminCard');if(!card)return;
let client=null,authorized=false,rows=[],editingEvent=null,editingInventory=null,pendingImport=null,confirmId=null;
let busy=false,authGeneration=0;
const dateLabel=iso=>{const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;};
const status=(message,error=false)=>{const node=$('planningAdminStatus');node.textContent=message;node.classList.toggle('is-error',error);};
const requireOnline=()=>{if(!authorized)throw Error('Accès réservé au responsable du planning.');if(!navigator.onLine)throw Error('Connexion Internet nécessaire pour enregistrer les changements.');};
function validDate(value){
 if(typeof value!=='string')return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
 if(!m)return false;
 const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
 return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()+1===+m[2]&&d.getUTCDate()===+m[3];
}
function parseDate(raw){
 const s=String(raw||'').trim();if(validDate(s))return s;
 const m=/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
 if(!m)return '';
 const iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
 return validDate(iso)?iso:'';
}
function checkDates(start,end){
 if(!validDate(start)||!validDate(end))throw Error('Indique des dates valides.');
 if(end<start)throw Error('La fin ne peut pas précéder le début.');
}
function safeCode(raw){
 const s=String(raw||'').trim();
 if(!s)return '';
 if(!/^[\w-]{1,70}$/.test(s))throw Error('Code : 1 à 70 lettres, chiffres, tirets ou tirets bas.');
 return s;
}
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'operation';}
function inventoryRow(iso){checkDates(iso,iso);return {id:'inventory:'+iso,kind:'inventory',title:'Inventaire du '+dateLabel(iso),starts_on:iso,ends_on:iso,enabled:true,updated_at:new Date().toISOString()};}
function storeRow(title,start,end,code='',imported=false){
 title=String(title||'').trim();if(!title||title.length>240)throw Error('Le titre doit contenir entre 1 et 240 caractères.');
 checkDates(start,end);
 const id=code?'store:'+safeCode(code):(imported?'store:import:'+start+':'+normalize(title):'store:manual:'+crypto.randomUUID());
 return {id,kind:'store',title,starts_on:start,ends_on:end,enabled:true,updated_at:new Date().toISOString()};
}
function resetEventForm(){editingEvent=null;$('planningEventForm').reset();$('planningEventCode').disabled=false;$('planningEventSubmit').textContent='Ajouter l’événement';$('planningEventCancel').hidden=true;}
function resetInventoryForm(){editingInventory=null;$('planningInventoryForm').reset();$('planningInventorySubmit').textContent='Ajouter l’inventaire';$('planningInventoryCancel').hidden=true;}
function setBusy(value){busy=value;card.querySelectorAll('button, input, textarea').forEach(el=>{
 if(el.id==='planningImportConfirm'){el.disabled=value||!pendingImport?.length;return;}
 if(el.id==='planningEventCode'&&editingEvent){el.disabled=true;return;}
 el.disabled=value;
});}
async function mutate(fn,success){
 if(busy)return;
 try{requireOnline();setBusy(true);await fn();status(success);await Promise.all([loadRows(),window.InventairesPlanning?.refresh(true)]);}
 catch(e){status(e?.message||'Enregistrement impossible.',true);}
 finally{setBusy(false);}
}
async function loadRows(){
 if(!authorized||!client)return;
 const {data,error}=await client.from('inventory_push_events').select('id,kind,title,starts_on,ends_on,enabled').order('starts_on',{ascending:false}).limit(1000);
 if(error)throw Error('Impossible de charger le planning : '+error.message);
 rows=data||[];renderRows();
}
// Ouvrir automatiquement le bon sous-menu quand on modifie un élément de la liste.
function revealEditor(formId){
 const form=$(formId),panel=form?.closest('.planning-accordion');
 if(panel&&!panel.open)panel.open=true;
 requestAnimationFrame(()=>form?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'}));
}
function renderRows(){
 const list=$('planningManageList');list.replaceChildren();
 const today=new Date();const cutoff=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
 const future=rows.filter(r=>(r.ends_on||r.starts_on)>=cutoff).sort((a,b)=>a.starts_on.localeCompare(b.starts_on)||a.title.localeCompare(b.title,'fr'));
 const query=String($('planningSearch')?.value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const selected=future.filter(r=>{if(!query)return true;const hay=[r.title,r.kind==='inventory'?'inventaire':'evenement',r.id,r.starts_on,r.ends_on,dateLabel(r.starts_on),dateLabel(r.ends_on)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return hay.includes(query);});
 const feedback=$('planningSearchFeedback');if(feedback)feedback.textContent=query?`${selected.length} résultat${selected.length>1?'s':''} sur ${future.length} élément${future.length>1?'s':''} à venir`:'';
 $('planningCount').textContent=selected.length+' élément'+(selected.length>1?'s':'');
 if(!selected.length){const empty=document.createElement('p');empty.className='planning-muted';empty.textContent=query?'Aucun résultat pour cette recherche.':'Aucune date à afficher.';list.append(empty);return;}
 for(const r of selected){
  const item=document.createElement('div');item.className='planning-list-row';
  const details=document.createElement('div');details.className='planning-list-text';
  const badge=document.createElement('span');badge.className='planning-kind';badge.textContent=r.kind==='inventory'?'Inventaire':'Événement';
  if(!r.enabled){badge.textContent+=' · Annulé';badge.classList.add('is-cancelled');}
  const title=document.createElement('strong');title.textContent=r.kind==='inventory'?'Inventaire':r.title;
  const period=document.createElement('span');period.textContent=r.starts_on===r.ends_on?dateLabel(r.starts_on):dateLabel(r.starts_on)+' – '+dateLabel(r.ends_on);
  const state=document.createElement('span');state.className='planning-event-state '+(r.starts_on<=cutoff?'is-current':'is-upcoming');state.textContent=r.starts_on<=cutoff?'En cours':'À venir';
  if(!r.enabled){state.textContent='Annulé';state.className='planning-event-state is-cancelled';}
  details.append(badge,state,title,period);
  const actions=document.createElement('div');actions.className='planning-list-actions';
  const edit=document.createElement('button');edit.type='button';edit.className='planning-mini-button';edit.textContent='Modifier';edit.disabled=!r.enabled;
  edit.addEventListener('click',()=>{
   if(r.kind==='inventory'){
    resetInventoryForm();editingInventory=r.id;$('planningInventoryDate').value=r.starts_on;
    $('planningInventorySubmit').textContent='Modifier la date';$('planningInventoryCancel').hidden=false;
    revealEditor('planningInventoryForm');
   }else{
    resetEventForm();editingEvent=r.id;$('planningEventTitle').value=r.title;
    $('planningEventStart').value=r.starts_on;$('planningEventEnd').value=r.ends_on;
    const code=r.id.startsWith('store:')?r.id.slice(6):r.id;
    $('planningEventCode').value=/^(manual|import):/.test(code)?'':code;
    $('planningEventCode').disabled=true;$('planningEventSubmit').textContent='Enregistrer les modifications';
    $('planningEventCancel').hidden=false;
    revealEditor('planningEventForm');
   }
  });
  const toggle=document.createElement('button');toggle.type='button';toggle.className='planning-mini-button planning-mini-danger';toggle.textContent=r.enabled?'Annuler':'Réactiver';
  toggle.addEventListener('click',()=>{
   confirmId=r.id;
   $('planningConfirmTitle').textContent=r.enabled?'Annuler cet élément ?':'Réactiver cet élément ?';
   $('planningConfirmText').textContent=r.enabled
    ?'Il disparaîtra du planning public et aucun nouveau rappel ne sera envoyé pour cet élément.'
    :'Il redeviendra visible et pourra déclencher un rappel à J-7 si la date le permet.';
   $('planningConfirmAccept').textContent=r.enabled?'Confirmer l’annulation':'Confirmer la réactivation';
   $('planningConfirmDialog').showModal();
  });
  actions.append(edit,toggle);item.append(details,actions);list.append(item);
 }
}
$('planningSearch')?.addEventListener('input',renderRows);
$('planningCopyExample')?.addEventListener('click',async()=>{
 const sample='type;code;titre;debut;fin\nevenement;27P15;Opération fruits et légumes;08/02/2027;14/02/2027\ninventaire;;;15/02/2027;';
 try{await navigator.clipboard.writeText(sample);status('Exemple copié. Colle-le dans ton tableau ou dans la zone d’importation.');}
 catch{const target=$('planningImportText');target.value=sample;status('Exemple ajouté dans la zone d’importation.');}
});
$('planningInventoryForm').addEventListener('submit',e=>{
 e.preventDefault();const iso=$('planningInventoryDate').value;
 mutate(async()=>{
  const row=inventoryRow(iso);
  const {error}=await client.from('inventory_push_events').upsert(row,{onConflict:'id'});
  if(error)throw error;
  if(editingInventory&&editingInventory!==row.id){
   const {error:oldError}=await client.from('inventory_push_events').update({enabled:false,updated_at:new Date().toISOString()}).eq('id',editingInventory);
   if(oldError)throw Error('Nouvelle date ajoutée, mais l’ancienne n’a pas été annulée : '+oldError.message);
  }
  resetInventoryForm();
 },'Date d’inventaire enregistrée. Le rappel J-7 est pris en compte.');
});
$('planningInventoryCancel').addEventListener('click',resetInventoryForm);
$('planningEventForm').addEventListener('submit',e=>{
 e.preventDefault();
 mutate(async()=>{
  const title=$('planningEventTitle').value,start=$('planningEventStart').value;
  const end=$('planningEventEnd').value||start,code=$('planningEventCode').value;
  const row=storeRow(title,start,end,editingEvent?'':code);
  if(editingEvent)row.id=editingEvent;
  const {error}=await client.from('inventory_push_events').upsert(row,{onConflict:'id'});
  if(error)throw error;
  resetEventForm();
 },'Événement enregistré. Le planning et les rappels sont mis à jour.');
});
$('planningEventCancel').addEventListener('click',resetEventForm);

$('planningConfirmDismiss').addEventListener('click',()=>{$('planningConfirmDialog').close();confirmId=null;});
$('planningConfirmDialog').addEventListener('cancel',()=>{confirmId=null;});
$('planningConfirmAccept').addEventListener('click',()=>{
 const id=confirmId;const row=rows.find(r=>r.id===id);$('planningConfirmDialog').close();confirmId=null;
 if(!row)return;
 mutate(async()=>{
  const {error}=await client.from('inventory_push_events').update({enabled:!row.enabled,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)throw error;
 },row.enabled?'Élément annulé.':'Élément réactivé.');
});
function countOutsideQuotes(text,sep){let quotes=false,n=0;for(const ch of text){if(ch==='"')quotes=!quotes;else if(ch===sep&&!quotes)n++;}return n;}
function parseDelimited(input){
 const text=String(input||'').replace(/^\uFEFF/,'');
 if(text.length>500000)throw Error('Le tableau dépasse 500 Ko. Importe-le en plusieurs parties.');
 const first=text.split(/\r?\n/).find(s=>s.trim())||'';
 const delimiter=[';',',','\t'].sort((a,b)=>countOutsideQuotes(first,b)-countOutsideQuotes(first,a))[0];
 if(countOutsideQuotes(first,delimiter)<1)throw Error('Tableau CSV invalide : sépare les colonnes avec des points-virgules.');
 const records=[];let record=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){cell+='"';i++;}
   else if(!cell.trim()||quoted)quoted=!quoted;
   else cell+='"';
  }else if(c===delimiter&&!quoted){record.push(cell.trim());cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;record.push(cell.trim());
   if(record.some(v=>v!==''))records.push(record);record=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('Une cellule du CSV contient des guillemets non fermés.');
 record.push(cell.trim());if(record.some(v=>v!==''))records.push(record);
 return records;
}
const canonical=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
function parseImport(input){
 const records=parseDelimited(input);
 if(records.length<2)throw Error('Le tableau doit contenir un en-tête et au moins une ligne.');
 const headers=records[0].map(canonical);
 const find=(names)=>headers.findIndex(h=>names.includes(h));
 const cols={
  kind:find(['type','categorie','category','kind']),
  code:find(['code','reference','ref','id']),
  title:find(['titre','intitule','evenement','title','nom','libelle']),
  start:find(['debut','date debut','date de debut','start','date','starts on']),
  end:find(['fin','date fin','date de fin','end','ends on'])
 };
 if(cols.start<0||cols.title<0)throw Error('Colonnes requises : titre et debut. Utilise le modèle CSV proposé.');
 if(records.length>501)throw Error('Maximum 500 lignes par importation.');
 const result=new Map(),errors=[];
 for(let i=1;i<records.length;i++){
  const rec=records[i],get=key=>cols[key]<0?'':(rec[cols[key]]||'').trim();
  try{
   const kind=canonical(get('kind'));
   if(kind&&!['inventaire','inventory','inv','evenement','event','operation','commercial'].includes(kind))throw Error('type inconnu');
   const inventory=['inventaire','inventory','inv'].includes(kind);
   const start=parseDate(get('start'));
   const end=parseDate(get('end'))||(!get('end')?start:'');
   if(!start||!end)throw Error('date invalide (utilise AAAA-MM-JJ ou JJ/MM/AAAA)');
   const row=inventory?inventoryRow(start):storeRow(get('title'),start,end,get('code'),true);
   result.set(row.id,row);
  }catch(e){errors.push('Ligne '+(i+1)+' : '+(e.message||'invalide'));}
 }
 if(errors.length)throw Error(errors.slice(0,6).join(' · ')+(errors.length>6?' · …':''));
 if(!result.size)throw Error('Aucun événement à importer.');
 return [...result.values()];
}
function renderPreview(){
 const box=$('planningImportPreview');box.replaceChildren();
 if(!pendingImport?.length){box.hidden=true;$('planningImportConfirm').disabled=true;return;}
 box.hidden=false;$('planningImportConfirm').disabled=false;
 const summary=document.createElement('strong');summary.textContent=pendingImport.length+' élément(s) prêt(s) à importer';box.append(summary);
 const note=document.createElement('p');note.textContent='Les lignes ayant le même code seront mises à jour. Les autres événements seront conservés.';box.append(note);
 for(const r of pendingImport.slice(0,6)){
  const line=document.createElement('div');line.className='planning-preview-row';
  line.textContent=(r.kind==='inventory'?'Inventaire':r.title)+' · '+dateLabel(r.starts_on)+(r.ends_on!==r.starts_on?' au '+dateLabel(r.ends_on):'');box.append(line);
 }
 if(pendingImport.length>6){const more=document.createElement('small');more.textContent='… et '+(pendingImport.length-6)+' autres';box.append(more);}
}
$('planningImportFile').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{if(file.size>500000)throw Error('Fichier trop volumineux (500 Ko maximum).');
  $('planningImportText').value=await file.text();pendingImport=null;renderPreview();status('Fichier chargé. Clique sur « Vérifier le tableau ».');
 }catch(err){status(err.message,true);}
});
$('planningImportText').addEventListener('input',()=>{pendingImport=null;renderPreview();});
$('planningImportPreviewButton').addEventListener('click',()=>{
 try{pendingImport=parseImport($('planningImportText').value);renderPreview();status('Tableau vérifié. Confirme l’importation pour enregistrer les données.');}
 catch(e){pendingImport=null;renderPreview();status(e.message,true);}
});
$('planningImportConfirm').addEventListener('click',()=>{
 if(!pendingImport?.length)return;
 const data=[...pendingImport];
 mutate(async()=>{
  for(let i=0;i<data.length;i+=50){
   const {error}=await client.from('inventory_push_events').upsert(data.slice(i,i+50),{onConflict:'id'});
   if(error)throw Error('Importation interrompue après '+i+' ligne(s) : '+error.message);
  }
  pendingImport=null;$('planningImportText').value='';$('planningImportFile').value='';renderPreview();
 },data.length+' élément(s) importé(s). Le planning public est actualisé.');
});
$('planningTemplate').addEventListener('click',()=>{
 const content='\uFEFFtype;code;titre;debut;fin\r\n';
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='modele-planning-inventaires-u.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
});
async function checkAdmin(u){
 const generation=++authGeneration;authorized=false;card.hidden=true;
 if(!u||!client)return;
 try{
  const {data,error}=await client.from('inventory_planning_admins').select('user_id').eq('user_id',u.id).maybeSingle();
  if(error)throw error;
  if(generation!==authGeneration||!data)return;
  authorized=true;card.hidden=false;await loadRows();
  status('Planning connecté à Supabase. Tes modifications sont partagées avec tous les utilisateurs.');
 }catch(e){if(generation===authGeneration){card.hidden=true;console.info('Gestion du planning indisponible',e?.message||e);}}
}
async function init(){
 try{
  if(!window.InventairesAuth?.getClient)return;
  client=await window.InventairesAuth.getClient();
  const {data}=await client.auth.getUser();await checkAdmin(data?.user||null);
  client.auth.onAuthStateChange((_event,session)=>{
   queueMicrotask(()=>{checkAdmin(session?.user||null);});
  });
  window.addEventListener('online',()=>{if(authorized)loadRows().catch(e=>status(e.message,true));});
 }catch(e){console.info('Administration du planning non disponible',e?.message||e);}
}
init();
})();
