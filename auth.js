(()=>{'use strict';
const $=id=>document.getElementById(id),cfg=window.INVENTAIRES_AUTH_CONFIG||{};
const KEYS=["inventaires-u-v2", "inventaires-u-history-v1", "inventaires-u-sessions-v1", "inventaires-u-weight-mode-v1", "inventaires-u-warning-limit-v1", "inventaires-u-duplicate-confirm-v1"];
const configured=()=>/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'')&&typeof cfg.supabaseAnonKey==='string'&&cfg.supabaseAnonKey.length>20;
let client=null,user=null,busy=false,lastSynced=null,localBaseline=null,interval=null;
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
const status=msg=>{$('cloudStatus').textContent=msg;};
function snapshot(){const out={};for(const key of KEYS){try{out[key]=localStorage.getItem(key);}catch{out[key]=null;}}return out;}
const serialize=o=>JSON.stringify(o);
const empty=o=>Object.values(o).every(v=>v===null);
function restore(data){if(!data||typeof data!=='object'||KEYS.some(k=>!(k in data)||!(typeof data[k]==='string'||data[k]===null)))throw Error('Sauvegarde cloud invalide.');
  // Store a complete rollback copy before touching any user data.
  const previous=snapshot();try{for(const key of KEYS){if(data[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,data[key]);}}catch(err){for(const key of KEYS){try{if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]);}catch{}}throw err;}
  localBaseline=serialize(data);saveActive();status('Données récupérées. Actualisation nécessaire.');location.reload();}
function render(){const name=user?(user.user_metadata?.full_name||user.user_metadata?.name||user.email||'Connecté'):'Non connecté';$('accountActionLabel').textContent=user?'Mon compte':'Connexion';$('accountSummaryStatus').textContent=user?'Connecté':'Non connecté';$('accountSummaryStatus').classList.toggle('is-connected',!!user);$('accountProfileName').textContent=name;$('accountProfileHint').textContent=user?(user.email||'Compte synchronisé'):'Mode local · Données sur cet appareil';$('accountStatusDot').classList.toggle('is-connected',!!user);$('accountCard').title=user?name:'Ouvrir les options de connexion';$('accountSignedOut').hidden=!!user;$('accountSignedIn').hidden=!user;$('accountIdentity').textContent=user?name:'';if(!user)status('Stockage local uniquement');}
async function sb(){if(client)return client;if(!configured())throw Error('Supabase doit être configuré dans auth-config.js.');if(!navigator.onLine)throw Error('Connexion Internet nécessaire.');const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');client=mod.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{flowType:'pkce',detectSessionInUrl:true,autoRefreshToken:true,persistSession:true}});return client;}
async function readRemote(){const {data,error}=await client.from('user_backups').select('data,updated_at').eq('user_id',user.id).maybeSingle();if(error)throw error;return data;}
async function upload(local){const {error}=await client.from('user_backups').upsert({user_id:user.id,data:local},{onConflict:'user_id'});if(error)throw error;lastSynced=serialize(local);localBaseline=lastSynced;saveActive();status('Synchronisé');feedback('Sauvegarde cloud à jour.');}
function askConflict(remote){$('cloudConflict').hidden=false;$('cloudConflict').dataset.payload=JSON.stringify(remote);status('Choix nécessaire : données locales et cloud différentes');feedback('Choisis les données à conserver. Aucune donnée ne sera écrasée sans ton accord.');}
async function reconcile(){if(!user||busy||!navigator.onLine)return;busy=true;try{const local=snapshot(),ls=serialize(local),remote=await readRemote();if(!remote){status('Première sauvegarde…');await upload(local);$('cloudConflict').hidden=true;return;}
const rs=serialize(remote.data);if(ls===rs){lastSynced=rs;localBaseline=ls;status('Synchronisé');$('cloudConflict').hidden=true;return;}
if(lastSynced===rs){await upload(local);$('cloudConflict').hidden=true;return;}
if(lastSynced===ls){restore(remote.data);return;}
if(empty(local)){restore(remote.data);return;}
askConflict(remote.data);
}catch(e){status('Synchronisation en attente');feedback(e.message||'Erreur de synchronisation.');console.warn('Cloud sync',e);}finally{busy=false;}}
async function connect(provider){feedback('Ouverture de la connexion…');try{const s=await sb();const {error}=await s.auth.signInWithOAuth({provider,options:{redirectTo:location.origin+location.pathname}});if(error)throw error;}catch(e){feedback(e.message||'Connexion impossible.');}}
async function logout(){if($('accountLogout').disabled)return;$('accountLogout').disabled=true;feedback('Déconnexion en cours…');try{const s=await sb();if(user){await reconcile();if(!$('cloudConflict').hidden)throw Error('Résous le conflit de synchronisation avant de te déconnecter.');}const {error}=await s.auth.signOut();if(error)throw error;user=null;lastSynced=null;localBaseline=null;clearInterval(interval);if(switchWorkspace('guest'))return;render();feedback('Déconnecté : espace local sans compte.');}catch(e){feedback(e.message||'Déconnexion impossible.');}finally{$('accountLogout').disabled=false;}}
async function activateUser(u){
  if(!u){if(scopeId()!=='guest'){switchWorkspace('guest');return true;}user=null;render();return false;}
  if(scopeId()===u.id){user=u;render();return false;}
  // Never treat the previous account's active data as this account's data.
  // On first sign-in, import guest data only into a genuinely empty cloud account.
  const existing=readWorkspace(u.id);
  if(existing){switchWorkspace(u.id);return true;}
  const {data,error}=await client.from('user_backups').select('data').eq('user_id',u.id).maybeSingle();
  if(error)throw error;
  const seed=data?.data||(scopeId()==='guest'?snapshot():readWorkspace('guest'))||Object.fromEntries(KEYS.map(k=>[k,null]));
  switchWorkspace(u.id,seed);return true;
}
async function init(){render();if(!configured()){feedback('Configure Supabase dans auth-config.js.');return;}try{const s=await sb();const {data:{user:u},error}=await s.auth.getUser();if(error)throw error;if(await activateUser(u))return;if(user)await reconcile();s.auth.onAuthStateChange((event,session)=>{queueMicrotask(async()=>{try{const previous=user?.id;if(await activateUser(session?.user||null))return;if(user&&user.id!==previous){lastSynced=null;await reconcile();}}catch(e){feedback(e.message||'Changement de compte impossible.');}});});interval=setInterval(()=>{try{saveActive();}catch{}if(user&&$('cloudConflict').hidden)reconcile();},12000);window.addEventListener('online',()=>reconcile());window.addEventListener('pagehide',()=>{try{saveActive();}catch{}});}catch(e){feedback(e.message||'Authentification indisponible.');}}
$('accountGoogle').addEventListener('click',()=>connect('google'));
$('accountEmailForm').addEventListener('submit',async e=>{e.preventDefault();const email=$('accountEmail').value.trim();if(!email)return;feedback('Envoi du lien de connexion…');$('accountEmailSubmit').disabled=true;try{const s=await sb();const {error}=await s.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname,shouldCreateUser:true}});if(error)throw error;feedback('Si cette adresse peut recevoir des e-mails, un lien de connexion a été envoyé. Consulte aussi les indésirables.');}catch(err){feedback(err.message||'Envoi impossible.');}finally{$('accountEmailSubmit').disabled=false;}});$('accountLogout').addEventListener('click',logout);
$('cloudKeepLocal').addEventListener('click',async()=>{if(!user||busy)return;busy=true;try{await upload(snapshot());$('cloudConflict').hidden=true;}catch(e){feedback(e.message);}finally{busy=false;}});
$('cloudUseRemote').addEventListener('click',()=>{try{restore(JSON.parse($('cloudConflict').dataset.payload));}catch(e){feedback(e.message);}});
$('cloudSyncNow').addEventListener('click',()=>reconcile());init();
})();