/* Inventaires U — notifications Web Push, par appareil, sans compte Google. */
(()=>{'use strict';
const $=id=>document.getElementById(id),enable=$('pushToggle'),disable=null,test=null,status=$('pushStatus');if(!enable)return;
const guide=$('eventsInstallDialog');
const closeGuide=$('eventsInstallGuideClose');
let closingGuide=false,closeTimer;
function showGuide(){if(!guide||guide.open)return;clearTimeout(closeTimer);closingGuide=false;guide.classList.remove('is-leaving');guide.showModal();}
function hideGuide(){if(!guide?.open||closingGuide)return;closingGuide=true;guide.classList.add('is-leaving');closeTimer=setTimeout(()=>{guide.close();guide.classList.remove('is-leaving');closingGuide=false;},380);}
closeGuide?.addEventListener('click',hideGuide);
guide?.addEventListener('cancel',e=>{e.preventDefault();hideGuide();});
guide?.addEventListener('click',e=>{if(e.target===guide)hideGuide();});
const cfg=window.INVENTAIRES_AUTH_CONFIG||{},base=(cfg.supabaseUrl||'').replace(/\/$/,'')+'/functions/v1/inventory-push',store='inventaires-u-push-device-v1';
let busy=false;
const msg=text=>{status.textContent=text;};
function supported(){return window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;}
function iosNotInstalled(){return /iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.navigator.standalone&&!matchMedia('(display-mode: standalone)').matches;}
function device(){let value;try{value=JSON.parse(localStorage.getItem(store)||'null');}catch(_){}if(!value?.id||!value?.secret){value={id:crypto.randomUUID(),secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')};localStorage.setItem(store,JSON.stringify(value));}return value;}
async function api(action,body={}){const res=await fetch(base+'/'+action,{method:'POST',headers:{'content-type':'application/json','apikey':cfg.supabaseAnonKey||''},body:JSON.stringify(body)});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Erreur serveur ('+res.status+').');return data;}
function bytes(b64){const padding='='.repeat((4-b64.length%4)%4);return Uint8Array.from(atob((b64+padding).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function registration(){return await navigator.serviceWorker.ready;}
async function refresh(){const ok=supported();enable.disabled=busy;let sub=null;if(ok)try{sub=await(await registration()).pushManager.getSubscription();}catch(_){}enable.setAttribute('aria-pressed',String(!!sub));enable.setAttribute('aria-label',sub?'Désactiver les notifications':'Activer les notifications');enable.classList.toggle('is-active',!!sub);const label=enable.querySelector('.events-bell-label');if(label)label.textContent=sub?'Activées':'Activer';if(iosNotInstalled())msg('Installe l’application pour recevoir les notifications.');else if(!ok)msg('Pour recevoir les notifications, utilise l’application installée sur un appareil compatible.');else if(Notification.permission==='denied')msg('Notifications bloquées : autorise-les dans les réglages de ton téléphone.');else if(sub)msg('Notifications activées sur cet appareil.');else msg('Notifications désactivées.');}
async function execute(fn){if(busy)return;busy=true;enable.disabled=true;try{await fn();}catch(e){msg('Échec : '+(e?.message||'erreur inconnue'));}finally{busy=false;await refresh();}}
enable.addEventListener('click',()=>{if(iosNotInstalled()){showGuide();return;}execute(async()=>{if(!supported())throw Error('Notifications non disponibles sur cet appareil.');const reg=await registration();let sub=await reg.pushManager.getSubscription();if(sub){await api('unregister',{...device(),endpoint:sub.endpoint});await sub.unsubscribe();msg('Notifications désactivées sur cet appareil.');return;}if(Notification.permission==='denied')throw Error('Autorisation refusée dans les réglages iOS.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Autorisation non accordée.');const config=await api('config');if(!config.publicKey)throw Error('Configuration VAPID manquante.');sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(config.publicKey)});await api('register',{...device(),subscription:sub.toJSON(),days:7,hour:9});msg('Notifications activées sur cet appareil.');});});
refresh();
})();
