(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.INVENTAIRES_AUTH_CONFIG||{};
const KEYS=["inventaires-u-v2", "inventaires-u-history-v1", "inventaires-u-sessions-v1", "inventaires-u-weight-mode-v1", "inventaires-u-warning-limit-v1", "inventaires-u-duplicate-confirm-v1"];
const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')&&typeof cfg.supabaseAnonKey==='string'&&cfg.supabaseAnonKey.length>20;
let client=null,user=null,busy=false,lastSynced=null,localBaseline=null,interval=null,activeProvider=null,remoteBaseline=null,lastSuccessAt=null;
const RECOVERY_PREFIX='inventaires-u-recovery-v1:';
function recoveryKeys(scope=scopeId()){
 return Object.keys(localStorage).filter(k=>k.startsWith(RECOVERY_PREFIX)).filter(k=>{
  try{return JSON.parse(localStorage.getItem(k)).scope===scope;}catch{return false;}
 }).sort().reverse();
}
function preserveRecovery(label,data){
 try{
  const scope=scopeId(),key=RECOVERY_PREFIX+Date.now()+':'+Math.random().toString(36).slice(2)+':'+label;
  localStorage.setItem(key,JSON.stringify({label,date:new Date().toISOString(),scope,data}));
  for(const old of recoveryKeys(scope).slice(12))localStorage.removeItem(old);
  if($('recoveryCard')?.open)showRecoveries();
  return true;
 }catch(e){console.warn('Impossible de conserver une copie de sécurité',e);return false;}
}
function backupSummary(data){
 try{
  const ss=JSON.parse(data[KEYS[2]]||'{}').sessions||[];
  const bb=JSON.parse(data[KEYS[0]]||'[]');
  return `${ss.length} inventaire(s) · ${bb.length} panier(s)`;
 }catch{return 'Contenu non disponible';}
}
function mergeWorkspaces(local,remote){
 // Merge by immutable weighing IDs; never silently overwrite a modified weighing.
 const result={...local};let additions=0;
 try{
  const leftB=JSON.parse(local[KEYS[0]]||'[]'),rightB=JSON.parse(remote[KEYS[0]]||'[]');
  if(!Array.isArray(leftB)||!Array.isArray(rightB))return null;
  const basketIds=new Map(leftB.map(x=>[x.id,x]));
  for(const b of rightB){const old=basketIds.get(b.id);if(old){if(JSON.stringify(old)!==JSON.stringify(b))return null;}else{leftB.push(b);basketIds.set(b.id,b);additions++;}}
  result[KEYS[0]]=JSON.stringify(leftB);
  const left=JSON.parse(local[KEYS[2]]||'{"sessions":[],"activeId":null}');
  const right=JSON.parse(remote[KEYS[2]]||'{"sessions":[],"activeId":null}');
  if(!Array.isArray(left.sessions)||!Array.isArray(right.sessions))return null;
  const sessions=new Map(left.sessions.map(x=>[x.id,x]));
  for(const incoming of right.sessions){
   const existing=sessions.get(incoming.id);
   if(!existing){left.sessions.push(incoming);sessions.set(incoming.id,incoming);additions++;continue;}
   if(!Array.isArray(existing.entries)||!Array.isArray(incoming.entries))return null;
   // A deletion or contradictory edit cannot be inferred safely from two snapshots.
   const entries=new Map(existing.entries.map(e=>[e.id,e]));
   for(const e of incoming.entries){const old=entries.get(e.id);if(old){if(JSON.stringify(old)!==JSON.stringify(e))return null;}else{existing.entries.push(e);entries.set(e.id,e);additions++;}}
   if(existing.startedAt!==incoming.startedAt)return null;
   // Completion or pause state differences require user resolution.
   for(const k of ['endedAt','pausedAt','pausedMs'])if(existing[k]!==incoming[k])return null;
  }
  if(left.activeId&&right.activeId&&left.activeId!==right.activeId)return null;
  left.activeId=left.activeId||right.activeId||null;
  result[KEYS[2]]=JSON.stringify(left);
  for(const key of KEYS.slice(3)){
   if(local[key]!==remote[key]&&local[key]!==null&&remote[key]!==null)return null;
   result[key]=local[key]??remote[key];
  }
  const lh=JSON.parse(local[KEYS[1]]||'[]'),rh=JSON.parse(remote[KEYS[1]]||'[]');
  if(!Array.isArray(lh)||!Array.isArray(rh))return null;
  const ids=new Set(lh.map(x=>x.id));for(const h of rh)if(!ids.has(h.id)){lh.push(h);ids.add(h.id);}
  lh.sort((a,b)=>b.at-a.at);result[KEYS[1]]=JSON.stringify(lh.slice(0,15));
  return {data:result,additions};
 }catch{return null;}
}

const IMPORT_KEY='inventaires-u-guest-import-claimed-v2';
const providerFor=u=>u?.app_metadata?.provider==='google'?'google':null;
const accountId=(u,provider)=>u.id+':'+provider;
// Separate guest and authenticated workspaces. Legacy app keys remain the active workspace.
const SCOPE_KEY='inventaires-u-active-scope-v1',GUEST_KEY='inventaires-u-guest-workspace-v1',ACCOUNT_PREFIX='inventaires-u-account-workspace-v1:';
const scopeId=()=>localStorage.getItem(SCOPE_KEY)||'guest';
const workspaceKey=id=>id==='guest'?GUEST_KEY:ACCOUNT_PREFIX+id;
function readWorkspace(id){try{const raw=localStorage.getItem(workspaceKey(id));return raw?JSON.parse(raw):null;}catch{return null;}}
function writeWorkspace(id,data){localStorage.setItem(workspaceKey(id),JSON.stringify(data));}
function saveActive(){const data=snapshot();writeWorkspace(scopeId(),data);window.InventairesIDB?.put(scopeId(),data).catch(e=>console.warn('Copie IndexedDB indisponible',e));}
function applyWorkspace(data){const previous=snapshot();try{for(const key of KEYS){const val=data?.[key]??null;if(val===null)localStorage.removeItem(key);else localStorage.setItem(key,val);}}catch(e){for(const key of KEYS){try{if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);}catch{}}throw e;}}
function switchWorkspace(id,initial=null){if(scopeId()===id)return false;saveActive();const next=readWorkspace(id)||initial||Object.fromEntries(KEYS.map(k=>[k,null]));applyWorkspace(next);writeWorkspace(id,snapshot());localStorage.setItem(SCOPE_KEY,id);window.scrollTo(0,0);location.reload();return true;}
// Save a copy of the pre-existing local data as the guest workspace on upgrade.
try{if(!localStorage.getItem(SCOPE_KEY)){writeWorkspace('guest',snapshot());localStorage.setItem(SCOPE_KEY,'guest');}}catch(e){console.warn('Workspace initialization',e);}

const stamp=()=>lastSuccessAt?' · Dernière sauvegarde : '+new Date(lastSuccessAt).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'';
const feedback=msg=>{$('accountFeedback').textContent=msg||'';};
const isMissingSession=e=>/auth session missing|session missing/i.test(String(e?.message||''));
// Keep the full status for the diagnostics, while presenting a short, readable
// state and a secondary detail in the compact profile cards.
const status=msg=>{
 const raw=$('cloudStatus');if(raw)raw.textContent=msg;
 const main=$('cloudStatusMain'),detail=$('cloudStatusDetail');
 const synced=msg.startsWith('Synchronisé');
 const tile=main?.closest('.account-storage-cloud');
 if(tile){tile.classList.toggle('is-synced',synced);tile.classList.toggle('is-warning',/attente|nécessaire|différentes|indisponible/i.test(msg));}
 if(main&&detail){
  const sep=' · Dernière sauvegarde : ';
  if(synced&&msg.includes(sep)){
   main.textContent='Synchronisé';
   detail.textContent=msg.split(sep).slice(1).join(sep);
  }else if(synced){
   main.textContent='Synchronisé';detail.textContent='Date de sauvegarde indisponible';
  }else if(msg.startsWith('Choix nécessaire :')){
   main.textContent='Choix nécessaire';detail.textContent='Vérifier les sauvegardes';
  }else if(msg==='Modifications en attente de synchronisation'){
   main.textContent='Synchronisation en attente';detail.textContent='Modifications à enregistrer';
  }else if(msg==='Synchronisation en attente'){
   main.textContent='En attente';detail.textContent='Synchronisation non terminée';
  }else if(msg.startsWith('Actualisation nécessaire')){
   main.textContent='Actualisation nécessaire';detail.textContent='Avant la synchronisation';
  }else if(msg==='Espace vierge · aucune donnée à sauvegarder'){
   main.textContent='Espace vierge';detail.textContent='Aucune sauvegarde à effectuer';
  }else if(msg==='Données récupérées. Actualisation nécessaire.'){
   main.textContent='Données récupérées';detail.textContent='Actualisation nécessaire';
  }else{
   main.textContent=msg;detail.textContent='Statut en cours de vérification';
  }
 }
 renderDashboard();
};
const localStatus=msg=>{
 const raw=$('localSaveStatus');if(raw)raw.textContent=msg;
 const main=$('localSaveMain'),detail=$('localSaveDetail');
 const ok=/Enregistré|Enregistré localement/i.test(msg);
 if(main)main.textContent=ok?'Enregistré':msg;
 if(detail)detail.textContent=ok?'Données disponibles ici':'';
 main?.closest('.account-storage-local')?.classList.toggle('is-warning',!ok);
};
function snapshot(){const out={};for(const key of KEYS){try{out[key]=localStorage.getItem(key);}catch{out[key]=null;}}return out;}
const serialize=o=>JSON.stringify(o);
const empty=o=>Object.values(o).every(v=>v===null);
// V34.20 — Uniquement une référence confirmée par Supabase, jamais une copie
// locale supposée synchronisée. Permet de reprendre après PWA/rechargement.
const SYNC_BASELINE_PREFIX='inventaires-u-confirmed-cloud-v1:';
const baselineKey=()=>SYNC_BASELINE_PREFIX+accountId(user,activeProvider);
function rememberConfirmedBaseline(data){
 if(!user||activeProvider!=='google'||scopeId()!==accountId(user,activeProvider))return;
 try{
  if(!data||KEYS.some(k=>!Object.hasOwn(data,k)||(data[k]!==null&&typeof data[k]!=='string')))return;
  localStorage.setItem(baselineKey(),JSON.stringify({data,at:Date.now()}));
 }catch(e){console.warn('Référence de synchronisation non conservée',e);}
}
function resumeConfirmedBaseline(){
 if(!user||activeProvider!=='google'||scopeId()!==accountId(user,activeProvider))return;
 try{
  const raw=localStorage.getItem(baselineKey());
  if(!raw)return;
  const record=JSON.parse(raw);
  if(!record?.data||KEYS.some(k=>!Object.hasOwn(record.data,k)||(record.data[k]!==null&&typeof record.data[k]!=='string')))return;
  remoteBaseline=record.data;
  lastSynced=serialize(record.data);
  localBaseline=lastSynced;
 }catch(e){console.warn('Référence de synchronisation illisible',e);}
}
function restore(data){if(!data||typeof data!=='object'||KEYS.some(k=>!(k in data)||!(typeof data[k]==='string'||data[k]===null)))throw Error('Sauvegarde cloud invalide.');
  // Store a complete rollback copy before touching any user data.
  const previous=snapshot();if(!preserveRecovery('avant-restauration',previous))throw Error('Espace de stockage saturé : exporte tes données avant de restaurer.');try{for(const key of KEYS){if(data[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,data[key]);}}catch(err){for(const key of KEYS){try{if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);}catch{}}throw err;}
  localBaseline=serialize(data);rememberConfirmedBaseline(data);saveActive();status('Données récupérées. Actualisation nécessaire.');window.scrollTo(0,0);location.reload();}
function renderDashboard(){
 const panel=$('accountDashboard');if(!panel)return;
 panel.hidden=!user;if(!user)return;
 let all=[];try{const parsed=JSON.parse(localStorage.getItem('inventaires-u-sessions-v1')||'{}');all=Array.isArray(parsed.sessions)?parsed.sessions:[];}catch{}
 const completed=all.filter(x=>x&&Number.isFinite(x.startedAt)&&Number.isFinite(x.endedAt)&&x.endedAt>=x.startedAt);
 const entries=completed.flatMap(x=>Array.isArray(x.entries)?x.entries:[]).filter(x=>x&&Number.isSafeInteger(x.net)&&x.net>=0);
 const total=entries.reduce((sum,x)=>sum+x.net,0);
 const durations=completed.map(x=>Math.max(0,x.endedAt-x.startedAt-Math.max(0,Number(x.pausedMs)||0)));
 const avg=durations.length?Math.round(durations.reduce((sum,x)=>sum+x,0)/durations.length/60000):null;
 const number=n=>n.toLocaleString('fr-FR');
 $('dashCompleted').textContent=number(completed.length);
 $('dashWeighs').textContent=number(entries.length);
 $('dashDuration').textContent=avg===null?'—':avg>=60?`${Math.floor(avg/60)} h ${String(avg%60).padStart(2,'0')}`:`${avg} min`;
 $('dashNet').textContent=(total/1000).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})+' kg';
 const totalDuration=durations.reduce((sum,x)=>sum+x,0);
 const pace=entries.length?Math.round(totalDuration/entries.length/1000):null;
 $('dashSecondsPerWeigh').textContent=pace===null?'—':`${pace} s`;
 const trend=$('dashTrend');trend.replaceChildren();
 const plotted=[...completed].filter(x=>Array.isArray(x.entries)&&x.entries.length>0)
  .sort((a,b)=>b.endedAt-a.endedAt).slice(0,6).reverse();
 if(!plotted.length){const empty=document.createElement('p');empty.className='dashboard-empty';empty.textContent='Termine un inventaire pour afficher ton évolution.';trend.append(empty);}
 else{
  const values=plotted.map(x=>Math.round(Math.max(0,x.endedAt-x.startedAt-Math.max(0,Number(x.pausedMs)||0))/x.entries.length/1000));
  const max=Math.max(1,...values);
  plotted.forEach((item,i)=>{
   const column=document.createElement('div');column.className='dashboard-trend-column';
   const value=document.createElement('strong');value.textContent=`${values[i]} s`;
   const track=document.createElement('div');track.className='dashboard-trend-track';
   const fill=document.createElement('div');fill.className='dashboard-trend-fill';fill.style.height=`${Math.max(5,values[i]/max*100)}%`;track.append(fill);
   const label=document.createElement('span');label.textContent=`N° ${i+1}`;
   column.append(value,track,label);trend.append(column);
  });
 }
 const recent=[...completed].sort((x,y)=>y.endedAt-x.endedAt).slice(0,4);
 $('dashRecentCount').textContent=completed.length?`${Math.min(completed.length,4)} affiché${completed.length>1?'s':''}`:'';
 const list=$('dashRecentList');list.replaceChildren();
 if(!recent.length){const p=document.createElement('p');p.className='dashboard-empty';p.textContent='Aucun inventaire terminé pour le moment.';list.append(p);}
 for(const item of recent){
  const row=document.createElement('div');row.className='dashboard-recent-row';
  const info=document.createElement('div'),title=document.createElement('strong'),sub=document.createElement('span'),count=document.createElement('strong');
  title.textContent=new Date(item.endedAt).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
  const valid=(Array.isArray(item.entries)?item.entries:[]).filter(x=>x&&Number.isSafeInteger(x.net)&&x.net>=0);
  sub.textContent=valid.reduce((sum,x)=>sum+x.net,0)/1000+' kg net';
  count.textContent=`${valid.length} pesée${valid.length>1?'s':''}`;
  info.append(title,sub);row.append(info,count);list.append(row);
 }
 const cloud=$('cloudStatus')?.textContent||'';
 const pill=$('dashboardCloudPill');pill.textContent=cloud.includes('Synchronisé')?'Cloud synchronisé':cloud.includes('Choix nécessaire')?'Conflit à résoudre':cloud.includes('attente')?'En attente':'Cloud à vérifier';
 pill.classList.toggle('is-synced',cloud.includes('Synchronisé'));
 pill.classList.toggle('is-warning',/Choix nécessaire|attente|indisponible|échec|erreur/i.test(cloud));
}
function render(){
 const name=user?(user.user_metadata?.full_name||user.user_metadata?.name||user.email||'Mon compte'):'Mon compte';
 const badge=$('accountSummaryStatus');
 badge.textContent=user?'Connecté':'Mode local';
 badge.classList.toggle('is-connected',!!user);
 $('accountProfileName').textContent=name;
 $('accountProfileHint').textContent='';
 $('accountStatusDot').classList.toggle('is-connected',!!user);
 const avatar=$('accountAvatarImage');
 const avatarUrl=user&&(user.user_metadata?.avatar_url||user.user_metadata?.picture);
 let validAvatar=false;
 try{validAvatar=!!avatarUrl&&new URL(avatarUrl).protocol==='https:';}catch{}
 avatar.hidden=!validAvatar;
 avatar.parentElement.classList.toggle('has-photo',validAvatar);
 if(validAvatar&&avatar.src!==avatarUrl)avatar.src=avatarUrl;
 else if(!validAvatar)avatar.removeAttribute('src');
 $('accountCard').title=user?'Ouvrir le compte de '+name:'Ouvrir les options de connexion';
 $('accountSignedOut').hidden=!!user;
 $('accountSignedIn').hidden=!user;
 $('accountIdentity').textContent=user?(user.email||name):'';
 if(!user)status('Stockage local uniquement');
 renderDashboard();
}
async function sb(){if(client)return client;if(!configured())throw Error('Connexion Google indisponible : configuration manquante.');const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');client=mod.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{flowType:'pkce',detectSessionInUrl:true,autoRefreshToken:true,persistSession:true}});return client;}
// Réutiliser le même client Supabase pour le planning public et l'administration.
window.InventairesAuth={getClient:sb,getUser:()=>user};
async function readRemote(){const {data,error}=await client.from('provider_backups').select('data,updated_at').eq('user_id',user.id).eq('provider',activeProvider).maybeSingle();if(error)throw error;return data;}
async function upload(local){
 const targetUser=user?.id,targetProvider=activeProvider;
 if(!targetUser||targetProvider!=='google')throw Error('Connexion Google nécessaire.');
 // Server-side compare-and-swap: no blind upsert that can erase another device's edits.
 const {data,error}=await client.rpc('save_provider_backup_safe',{p_provider:targetProvider,p_expected:remoteBaseline,p_data:local});
 if(error)throw Error('Synchronisation sécurisée indisponible. Installe le script SQL V32 dans Supabase. '+error.message);
 if(data!==true){
  const fresh=await readRemote();
  // Un second appareil a pu écrire exactement le même état entre-temps.
  // Dans ce cas, le refus CAS ne représente pas un conflit de données.
  if(fresh&&serialize(fresh.data)===serialize(local)){
   if(user?.id!==targetUser||activeProvider!==targetProvider)throw Error('Le compte a changé pendant la synchronisation.');
   remoteBaseline=fresh.data;lastSynced=serialize(fresh.data);localBaseline=lastSynced;
   lastSuccessAt=Date.now();rememberConfirmedBaseline(fresh.data);saveActive();
   status(serialize(snapshot())===lastSynced?'Synchronisé'+stamp():'Modifications en attente de synchronisation');
   $('cloudConflict').hidden=true;
   return;
  }
  if(fresh)askConflict(fresh.data);
  throw Error('Le cloud a changé sur un autre appareil. Choisis les données à conserver.');
 }
 if(user?.id!==targetUser||activeProvider!==targetProvider)throw Error('Le compte a changé pendant la synchronisation.');
 remoteBaseline=local;lastSynced=serialize(local);localBaseline=lastSynced;lastSuccessAt=Date.now();rememberConfirmedBaseline(local);saveActive();localStatus('Enregistré sur cet appareil');
 if(serialize(snapshot())!==lastSynced){status('Modifications en attente de synchronisation');return;}
 status('Synchronisé'+stamp());
}

function askConflict(remote){$('cloudConflict').hidden=false;const m=mergeWorkspaces(snapshot(),remote);$('cloudMerge').hidden=!m;$('cloudConflict').dataset.payload=JSON.stringify(remote);status('Choix nécessaire : données locales et cloud différentes');feedback('Choisis les données à conserver. Aucune donnée ne sera écrasée sans ton accord.');}
async function reconcile(){if(!user||busy||!navigator.onLine||!$('cloudConflict').hidden)return false;busy=true;status('Synchronisation en cours…');try{const local=snapshot(),ls=serialize(local),remote=await readRemote();if(!remote){remoteBaseline=null;if(empty(local)){status('Espace vierge · aucune donnée à sauvegarder');lastSynced=ls;return true;}status('Première sauvegarde…');await upload(local);$('cloudConflict').hidden=true;return true;}
// Si une pesée a été enregistrée pendant la requête réseau, ne jamais
// restaurer ou remplacer les données sur la base d'un ancien instantané.
if(serialize(snapshot())!==ls){status('Modifications en attente de synchronisation');return false;}
const rs=serialize(remote.data);if(remoteBaseline===null||lastSynced===null)remoteBaseline=remote.data;if(ls===rs){lastSynced=rs;localBaseline=ls;remoteBaseline=remote.data;lastSuccessAt=Date.now();rememberConfirmedBaseline(remote.data);status('Synchronisé'+stamp());$('cloudConflict').hidden=true;return true;}
if(lastSynced===rs){await upload(local);$('cloudConflict').hidden=true;return true;}
if(lastSynced===ls){remoteBaseline=remote.data;restore(remote.data);return true;}
if(empty(local)){remoteBaseline=remote.data;restore(remote.data);return true;}
askConflict(remote.data);return false;
}catch(e){status('Synchronisation en attente');feedback(e.message||'Erreur de synchronisation.');console.warn('Cloud sync',e);return false;}finally{busy=false;}}
async function connect(provider){if(provider!=='google'){feedback('Connexion non disponible.');return;}feedback('Ouverture de la connexion…');try{const s=await sb();const {error}=await s.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+location.pathname}});if(error)throw error;}catch(e){feedback(e.message||'Connexion impossible.');}}
async function logout(){
 if($('accountLogout').disabled)return;
 $('accountLogout').disabled=true;feedback('Vérification de la sauvegarde avant déconnexion…');
 try{
  const s=await sb();
  if(user){
   if(!navigator.onLine)throw Error('Connexion Internet nécessaire pour sécuriser la sauvegarde avant la déconnexion.');
   // A pending operation must finish before we inspect the final state.
   for(let i=0;busy&&i<40;i++)await new Promise(r=>setTimeout(r,150));
   if(busy)throw Error('Synchronisation en cours. Réessaie dans quelques instants.');
   const ok=await reconcile();
   if(!ok||!$('cloudConflict').hidden)throw Error('La sauvegarde cloud n’est pas confirmée. Réessaie ou résous le conflit avant de te déconnecter.');
   // User edits may have occurred while the upload was in flight.
   if(lastSynced!==serialize(snapshot())){
    const retry=await reconcile();
    if(!retry||lastSynced!==serialize(snapshot()))throw Error('Des modifications restent à synchroniser. Réessaie avant de te déconnecter.');
   }
  }
  const {error}=await s.auth.signOut();if(error&&!isMissingSession(error))throw error;
  user=null;activeProvider=null;lastSynced=null;localBaseline=null;remoteBaseline=null;clearInterval(interval);
  sessionStorage.setItem('inventaires-u-logout-feedback','Déconnexion réussie');
  if(switchWorkspace('guest'))return;
  render();feedback('Déconnexion réussie');sessionStorage.removeItem('inventaires-u-logout-feedback');
 }catch(e){feedback(e.message||'Déconnexion impossible.');}
 finally{$('accountLogout').disabled=false;}
}
async function activateUser(u){
  if(!u){activeProvider=null;if(scopeId()!=='guest'){switchWorkspace('guest');return true;}user=null;render();return false;}
  const provider=providerFor(u);if(provider!=='google')throw Error('Cette version accepte uniquement la connexion Google.');const id=accountId(u,provider);
  if(scopeId()===id){if(!user||user.id!==u.id||activeProvider!==provider){lastSynced=null;remoteBaseline=null;}user=u;activeProvider=provider;if(lastSynced===null)resumeConfirmedBaseline();render();return false;}
  // Never copy a different provider's data, even if Supabase links both identities to one user_id.
  // Verify that the provider-specific database exists BEFORE switching workspaces.
  const {data,error}=await client.from('provider_backups').select('data').eq('user_id',u.id).eq('provider',provider).maybeSingle();
  if(error)throw Error('Configuration cloud incomplète : exécute schema-provider-backups.sql dans Supabase. '+error.message);
  let seed=readWorkspace(id);let shouldClaimGuest=false;
  if(!seed && data?.data)seed=data.data;
  if(!seed){
    const guest=readWorkspace('guest')||(scopeId()==='guest'?snapshot():null);
    let alreadyUsed=!!localStorage.getItem(IMPORT_KEY);
    if(!alreadyUsed){
      // Existing V31.26 Google cloud backups mean guest data was already imported.
      const {data:old,error:oldError}=await client.from('user_backups').select('data').eq('user_id',u.id).maybeSingle();
      if(oldError)throw oldError;
      if(old?.data){alreadyUsed=true;localStorage.setItem(IMPORT_KEY,'legacy-google');}
    }
    if(!alreadyUsed && guest && !empty(guest)){
      seed=guest;shouldClaimGuest=true;
    }
  }
  if(!seed)seed=Object.fromEntries(KEYS.map(k=>[k,null]));
  activeProvider=provider;
  const changed=switchWorkspace(id,seed);
  if(changed&&shouldClaimGuest)localStorage.setItem(IMPORT_KEY,provider+':'+u.id);
  return changed;
}
async function init(){render();const logoutMessage=sessionStorage.getItem('inventaires-u-logout-feedback');if(logoutMessage){feedback(logoutMessage);sessionStorage.removeItem('inventaires-u-logout-feedback');}if(!configured()){feedback('Configure Supabase dans auth-config.js.');return;}try{const s=await sb();const {data:{user:u},error}=await s.auth.getUser();if(error&&!isMissingSession(error))throw error;if(await activateUser(u))return;if(user)await reconcile();s.auth.onAuthStateChange((event,session)=>{queueMicrotask(async()=>{try{const previous=user?accountId(user,activeProvider):null;if(await activateUser(session?.user||null))return;if(user&&accountId(user,activeProvider)!==previous){lastSynced=null;remoteBaseline=null;await reconcile();}}catch(e){feedback(e.message||'Changement de compte impossible.');}});});interval=setInterval(()=>{try{saveActive();localStatus('Enregistré sur cet appareil');}catch{localStatus('Stockage local indisponible');}if(user&&$('cloudConflict').hidden&&lastSynced!==serialize(snapshot()))reconcile();},12000);setInterval(()=>{if(user&&navigator.onLine&&$('cloudConflict').hidden)reconcile();},120000);window.addEventListener('online',()=>reconcile());document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)reconcile();});window.addEventListener('pagehide',()=>{try{saveActive();}catch{}});}catch(e){if(isMissingSession(e)){if(scopeId()!=='guest')switchWorkspace('guest');else{user=null;render();}return;}feedback(navigator.onLine?(e.message||'Authentification indisponible.'):'Mode hors ligne : pesées et données locales disponibles. La connexion Google reprendra avec Internet.');}}
$('accountGoogle').addEventListener('click',()=>connect('google'));$('accountAvatarImage').addEventListener('error',()=>{const avatar=$('accountAvatarImage');avatar.hidden=true;avatar.parentElement.classList.remove('has-photo');});
$('accountLogout').addEventListener('click',logout);
$('cloudKeepLocal').addEventListener('click',async()=>{if(!user||busy)return;busy=true;try{const remote=JSON.parse($('cloudConflict').dataset.payload);if(!preserveRecovery('cloud-avant-remplacement-local',snapshot())||!preserveRecovery('cloud-avant-remplacement-distant',remote))throw Error('Impossible de créer la copie de sécurité.');const current=await readRemote();if(serialize(current?.data)!==serialize(remote)){askConflict(current?.data);throw Error('Le cloud a encore changé. Vérifie les nouvelles données.');}remoteBaseline=remote;await upload(snapshot());$('cloudConflict').hidden=true;}catch(e){feedback(e.message);}finally{busy=false;}});
$('cloudUseRemote').addEventListener('click',async()=>{try{if(busy)return;busy=true;const chosen=JSON.parse($('cloudConflict').dataset.payload);if(!preserveRecovery('cloud-avant-choix-distant',chosen))throw Error('Impossible de conserver la copie cloud.');const current=await readRemote();if(serialize(current?.data)!==serialize(chosen)){askConflict(current?.data);throw Error('Le cloud a changé depuis ton choix. Réessaie.');}remoteBaseline=chosen;restore(chosen);}catch(e){feedback(e.message);}finally{busy=false;}});
function showRecoveries(){
 const list=$('recoveryList');if(!list)return;list.replaceChildren();
 const keys=recoveryKeys();
 if(!keys.length){list.textContent='Aucune copie de récupération disponible.';return;}
 for(const key of keys){let item;try{item=JSON.parse(localStorage.getItem(key));}catch{continue;}
 const row=document.createElement('div');row.className='recovery-row';
 const info=document.createElement('span');info.textContent=(item.label||'Copie')+' · '+new Date(item.date).toLocaleString('fr-FR')+' · '+backupSummary(item.data);
 const btn=document.createElement('button');btn.type='button';btn.textContent='Restaurer';
 btn.addEventListener('click',()=>{if(!confirm('Restaurer cette copie dans l’espace actuel ? Une copie de sécurité sera créée avant.'))return;try{restore(item.data);}catch(e){feedback(e.message);}});
 row.append(info,btn);list.append(row);
 }
}
$('idbRestore')?.addEventListener('click',async()=>{
 try{
  const copy=await window.InventairesIDB?.get(scopeId());
  if(!copy?.data){feedback('Aucune copie IndexedDB disponible pour cet espace.');return;}
  if(!confirm('Restaurer la copie IndexedDB du '+new Date(copy.savedAt).toLocaleString('fr-FR')+' ? Les données actuelles seront sauvegardées avant.'))return;
  restore(copy.data);
 }catch(e){feedback('Impossible de lire la copie IndexedDB : '+e.message);}
});
$('recoveryCard')?.addEventListener('toggle',showRecoveries);
$('cloudMerge').addEventListener('click',async()=>{
 if(!user||busy)return;busy=true;
 try{
  const chosen=JSON.parse($('cloudConflict').dataset.payload);
  const current=await readRemote();if(serialize(current?.data)!==serialize(chosen)){askConflict(current?.data);throw Error('Le cloud a changé. Réessaie.');}
  const merged=mergeWorkspaces(snapshot(),chosen);if(!merged)throw Error('Les données comportent des différences qui nécessitent un choix manuel.');
  if(!preserveRecovery('avant-fusion-local',snapshot())||!preserveRecovery('avant-fusion-cloud',chosen))throw Error('Impossible de conserver les copies de sécurité.');
  remoteBaseline=chosen;await upload(merged.data);restore(merged.data);
 }catch(e){feedback(e.message||'Fusion impossible.');}finally{busy=false;}
});
// Même animation d'accordéon que les réglages d'alertes : le contenu se replie en douceur.
(function animateRecovery(){
 const card=$('recoveryCard');const summary=card?.querySelector(':scope > summary');const body=card?.querySelector(':scope > .recovery-body');
 if(!card||!summary||!body)return;
 let running=null;
 summary.addEventListener('click',event=>{
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  event.preventDefault();
  if(running){running.cancel();running=null;}
  const isOpen=card.open;
  const start=card.getBoundingClientRect().height;
  if(!isOpen)card.open=true;
  const end=isOpen?summary.getBoundingClientRect().height:summary.getBoundingClientRect().height+body.scrollHeight;
  card.style.overflow='hidden';
  running=card.animate([{height:start+'px'},{height:end+'px'}],{duration:380,easing:'cubic-bezier(.22,1,.36,1)'});
  running.onfinish=()=>{card.open=!isOpen;card.style.overflow='';running=null;};
  running.oncancel=()=>{card.style.overflow='';};
 });
})();
let tabChangePending=false;
window.addEventListener('storage',e=>{
 if(!e.key||!KEYS.includes(e.key)||tabChangePending)return;
 tabChangePending=true;
 localStatus('Modifications détectées dans un autre onglet');
 if(user)status('Actualisation nécessaire avant la prochaine synchronisation');
 const dialog=$('otherTabDialog');if(dialog?.showModal)dialog.showModal();
});
$('otherTabReload')?.addEventListener('click',()=>location.reload());
$('otherTabLater')?.addEventListener('click',()=>{$('otherTabDialog')?.close();localStatus('Attention : cet onglet peut contenir des données anciennes');});
// Le suivi du tableau de bord doit rester dans cette closure : user et
// renderDashboard sont privés au module d'authentification.
init();
window.addEventListener('storage',e=>{if(e.key==='inventaires-u-sessions-v1')renderDashboard();});
setInterval(()=>{if(user&&!document.hidden&&!document.body.classList.contains('is-focus-mode')&&$('accountCard')?.open)renderDashboard();},5000);
})();
