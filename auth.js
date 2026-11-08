(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.INVENTAIRES_AUTH_CONFIG||{};
const KEYS=["inventaires-u-v2", "inventaires-u-history-v1", "inventaires-u-sessions-v1", "inventaires-u-weight-mode-v1", "inventaires-u-warning-limit-v1", "inventaires-u-duplicate-confirm-v1"];
const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')&&typeof cfg.supabaseAnonKey==='string'&&cfg.supabaseAnonKey.length>20;
let client=null,user=null,busy=false,lastSynced=null,localBaseline=null,interval=null,activeProvider=null;
const RECOVERY_PREFIX='inventaires-u-recovery-v1:';
function preserveRecovery(label,data){try{const key=RECOVERY_PREFIX+Date.now()+':'+label;localStorage.setItem(key,JSON.stringify({label,date:new Date().toISOString(),scope:scopeId(),data}));const keys=Object.keys(localStorage).filter(k=>k.startsWith(RECOVERY_PREFIX)).sort();for(const old of keys.slice(0,-12))localStorage.removeItem(old);return true;}catch(e){console.warn('Impossible de conserver une copie de sécurité',e);return false;}}
const IMPORT_KEY='inventaires-u-guest-import-claimed-v2';
const providerFor=u=>u?.app_metadata?.provider==='google'?'google':null;
const accountId=(u,provider)=>u.id+':'+provider;
// Separate guest and authenticated workspaces. Legacy app keys remain the active workspace.
const SCOPE_KEY='inventaires-u-active-scope-v1',GUEST_KEY='inventaires-u-guest-workspace-v1',ACCOUNT_PREFIX='inventaires-u-account-workspace-v1:';
const scopeId=()=>localStorage.getItem(SCOPE_KEY)||'guest';
const workspaceKey=id=>id==='guest'?GUEST_KEY:ACCOUNT_PREFIX+id;
function readWorkspace(id){try{const raw=localStorage.getItem(workspaceKey(id));return raw?JSON.parse(raw):null;}catch{return null;}}
function writeWorkspace(id,data){localStorage.setItem(workspaceKey(id),JSON.stringify(data));}
function saveActive(){writeWorkspace(scopeId(),snapshot());}
function applyWorkspace(data){const previous=snapshot();try{for(const key of KEYS){const val=data?.[key]??null;if(val===null)localStorage.removeItem(key);else localStorage.setItem(key,val);}}catch(e){for(const key of KEYS){try{if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);}catch{}}throw e;}}
function switchWorkspace(id,initial=null){if(scopeId()===id)return false;saveActive();const next=readWorkspace(id)||initial||Object.fromEntries(KEYS.map(k=>[k,null]));applyWorkspace(next);writeWorkspace(id,snapshot());localStorage.setItem(SCOPE_KEY,id);location.reload();return true;}
// Save a copy of the pre-existing local data as the guest workspace on upgrade.
try{if(!localStorage.getItem(SCOPE_KEY)){writeWorkspace('guest',snapshot());localStorage.setItem(SCOPE_KEY,'guest');}}catch(e){console.warn('Workspace initialization',e);}

const feedback=msg=>{$('accountFeedback').textContent=msg||'';};
const isMissingSession=e=>/auth session missing|session missing/i.test(String(e?.message||''));
const status=msg=>{$('cloudStatus').textContent=msg;};
function snapshot(){const out={};for(const key of KEYS){try{out[key]=localStorage.getItem(key);}catch{out[key]=null;}}return out;}
const serialize=o=>JSON.stringify(o);
const empty=o=>Object.values(o).every(v=>v===null);
function restore(data){if(!data||typeof data!=='object'||KEYS.some(k=>!(k in data)||!(typeof data[k]==='string'||data[k]===null)))throw Error('Sauvegarde cloud invalide.');
  // Store a complete rollback copy before touching any user data.
  const previous=snapshot();if(!preserveRecovery('avant-restauration',previous))throw Error('Espace de stockage saturé : exporte tes données avant de restaurer.');try{for(const key of KEYS){if(data[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,data[key]);}}catch(err){for(const key of KEYS){try{if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);}catch{}}throw err;}
  localBaseline=serialize(data);saveActive();status('Données récupérées. Actualisation nécessaire.');location.reload();}
function render(){const name=user?(user.user_metadata?.full_name||user.user_metadata?.name||user.email||'Connecté'):'Non connecté';$('accountActionLabel').textContent=user?'Mon compte':'Connexion';$('accountSummaryStatus').textContent=user?'Connecté':'Non connecté';$('accountSummaryStatus').classList.toggle('is-connected',!!user);$('accountProfileName').textContent=name;$('accountProfileHint').textContent=user?(user.email||'Compte synchronisé'):'Mode local · Données sur cet appareil';$('accountStatusDot').classList.toggle('is-connected',!!user);const avatar=$('accountAvatarImage');const avatarUrl=user&&(user.user_metadata?.avatar_url||user.user_metadata?.picture);let validAvatar=false;try{validAvatar=!!avatarUrl&&new URL(avatarUrl).protocol==='https:';}catch{}avatar.hidden=!validAvatar;avatar.parentElement.classList.toggle('has-photo',validAvatar);if(validAvatar&&avatar.src!==avatarUrl)avatar.src=avatarUrl;else if(!validAvatar)avatar.removeAttribute('src');$('accountCard').title=user?name:'Ouvrir les options de connexion';$('accountSignedOut').hidden=!!user;$('accountSignedIn').hidden=!user;$('accountIdentity').textContent=user?name:'';if(!user)status('Stockage local uniquement');}
async function sb(){if(client)return client;if(!configured())throw Error('Supabase doit être configuré dans auth-config.js.');if(!navigator.onLine)throw Error('Connexion Internet nécessaire.');const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');client=mod.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{flowType:'pkce',detectSessionInUrl:true,autoRefreshToken:true,persistSession:true}});return client;}
async function readRemote(){const {data,error}=await client.from('provider_backups').select('data,updated_at').eq('user_id',user.id).eq('provider',activeProvider).maybeSingle();if(error)throw error;return data;}
async function upload(local){const targetUser=user?.id,targetProvider=activeProvider;if(!targetUser||targetProvider!=='google')throw Error('Connexion Google nécessaire.');const {error}=await client.from('provider_backups').upsert({user_id:targetUser,provider:targetProvider,data:local},{onConflict:'user_id,provider'});if(error)throw error;if(user?.id!==targetUser||activeProvider!==targetProvider)throw Error('Le compte a changé pendant la synchronisation.');lastSynced=serialize(local);localBaseline=lastSynced;saveActive();if(serialize(snapshot())!==lastSynced){status('Modifications en attente de synchronisation');return;}status('Synchronisé');feedback('Sauvegarde cloud à jour.');}
function askConflict(remote){$('cloudConflict').hidden=false;$('cloudConflict').dataset.payload=JSON.stringify(remote);status('Choix nécessaire : données locales et cloud différentes');feedback('Choisis les données à conserver. Aucune donnée ne sera écrasée sans ton accord.');}
async function reconcile(){if(!user||busy||!navigator.onLine)return false;busy=true;try{const local=snapshot(),ls=serialize(local),remote=await readRemote();if(!remote){if(empty(local)){status('Espace vierge · aucune donnée à sauvegarder');lastSynced=ls;return true;}status('Première sauvegarde…');await upload(local);$('cloudConflict').hidden=true;return true;}
const rs=serialize(remote.data);if(ls===rs){lastSynced=rs;localBaseline=ls;status('Synchronisé');$('cloudConflict').hidden=true;return true;}
if(lastSynced===rs){await upload(local);$('cloudConflict').hidden=true;return true;}
if(lastSynced===ls){restore(remote.data);return true;}
if(empty(local)){restore(remote.data);return true;}
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
  user=null;activeProvider=null;lastSynced=null;localBaseline=null;clearInterval(interval);
  sessionStorage.setItem('inventaires-u-logout-feedback','Déconnexion réussie');
  if(switchWorkspace('guest'))return;
  render();feedback('Déconnexion réussie');sessionStorage.removeItem('inventaires-u-logout-feedback');
 }catch(e){feedback(e.message||'Déconnexion impossible.');}
 finally{$('accountLogout').disabled=false;}
}
async function activateUser(u){
  if(!u){activeProvider=null;if(scopeId()!=='guest'){switchWorkspace('guest');return true;}user=null;render();return false;}
  const provider=providerFor(u);if(provider!=='google')throw Error('Cette version accepte uniquement la connexion Google.');const id=accountId(u,provider);
  if(scopeId()===id){user=u;activeProvider=provider;render();return false;}
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
async function init(){render();const logoutMessage=sessionStorage.getItem('inventaires-u-logout-feedback');if(logoutMessage){feedback(logoutMessage);sessionStorage.removeItem('inventaires-u-logout-feedback');}if(!configured()){feedback('Configure Supabase dans auth-config.js.');return;}try{const s=await sb();const {data:{user:u},error}=await s.auth.getUser();if(error&&!isMissingSession(error))throw error;if(await activateUser(u))return;if(user)await reconcile();s.auth.onAuthStateChange((event,session)=>{queueMicrotask(async()=>{try{const previous=user?accountId(user,activeProvider):null;if(await activateUser(session?.user||null))return;if(user&&accountId(user,activeProvider)!==previous){lastSynced=null;await reconcile();}}catch(e){feedback(e.message||'Changement de compte impossible.');}});});interval=setInterval(()=>{try{saveActive();}catch{}if(user&&$('cloudConflict').hidden)reconcile();},12000);window.addEventListener('online',()=>reconcile());document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)reconcile();});window.addEventListener('pagehide',()=>{try{saveActive();}catch{}});}catch(e){if(isMissingSession(e)){if(scopeId()!=='guest')switchWorkspace('guest');else{user=null;render();}return;}feedback(e.message||'Authentification indisponible.');}}
$('accountGoogle').addEventListener('click',()=>connect('google'));$('accountAvatarImage').addEventListener('error',()=>{const avatar=$('accountAvatarImage');avatar.hidden=true;avatar.parentElement.classList.remove('has-photo');});
$('accountLogout').addEventListener('click',logout);
$('cloudKeepLocal').addEventListener('click',async()=>{if(!user||busy)return;busy=true;try{const remote=JSON.parse($('cloudConflict').dataset.payload);if(!preserveRecovery('cloud-avant-remplacement',remote))throw Error('Impossible de créer la copie de sécurité.');await upload(snapshot());$('cloudConflict').hidden=true;}catch(e){feedback(e.message);}finally{busy=false;}});
$('cloudUseRemote').addEventListener('click',()=>{try{restore(JSON.parse($('cloudConflict').dataset.payload));}catch(e){feedback(e.message);}});
init();
})();