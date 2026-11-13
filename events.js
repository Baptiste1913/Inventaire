/* Inventaires U V33.35 — calendrier partagé : Supabase est la source de vérité.
   events-data.js est uniquement le secours de première installation / hors ligne. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
// V36.11 — Le volet Événements est animé par app.js.
let moreAnimation=null;
const fallback=window.INVENTAIRES_U_EVENTS||{inventories:[],events:[]};
const CACHE='inventaires-u-planning-cache-v33.35';
const date=s=>new Date(s+'T12:00:00');
const long=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const short=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'});
const month=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'});
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
let lastRefresh=0,loading=false;
function readCache(){try{const o=JSON.parse(localStorage.getItem(CACHE)||'null');return Array.isArray(o?.inventories)&&Array.isArray(o?.events)?o:null;}catch{return null;}}
function render(data){
 const now=new Date();now.setHours(0,0,0,0);
 const next=(data.inventories||[]).map(date).filter(d=>Number.isFinite(d.getTime())).sort((a,b)=>a-b).find(d=>d>=now);
 $('calendarNextDate').textContent=next?cap(long.format(next)):'Date à confirmer';
 const countdown=$('calendarNextCountdown');
 if(countdown){
  if(!next){countdown.hidden=true;countdown.textContent='';}
  else {
   // Jours calendaires (UTC) : ne varie pas lors des changements d'heure à Paris.
   const days=Math.round((Date.UTC(next.getFullYear(),next.getMonth(),next.getDate())-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
   countdown.textContent=days===0?"Aujourd’hui":days===1?"Demain":`Dans ${days} jours`;
   countdown.hidden=false;
  }
 }
 $('eventsMonthHeading').textContent='ÉVÉNEMENTS · '+month.format(now).toLocaleUpperCase('fr-FR');
 const endOfMonth=new Date(now.getFullYear(),now.getMonth()+1,0,23,59);
 const current=(data.events||[]).filter(e=>date(e.start)<=endOfMonth&&date(e.end)>=now).sort((a,b)=>{
  const aLive=date(a.start)<=now,bLive=date(b.start)<=now;
  return Number(bLive)-Number(aLive)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title,'fr');
 });
 const first=$('eventsFirst'),more=$('eventsMoreList'),button=$('eventsMoreButton'),label=$('eventsMoreLabel');
 if(moreAnimation){const old=moreAnimation;moreAnimation=null;old.cancel();}
  more.removeAttribute('style');first.replaceChildren();more.replaceChildren();more.hidden=true;more.classList.remove('is-open');
 button.hidden=true;button.setAttribute('aria-expanded','false');
 function item(e){
  const node=document.createElement('div');node.className='events-entry';
  const live=date(e.start)<=now;node.classList.add(live?'events-entry-live':'events-entry-upcoming');
  const badge=document.createElement('span');badge.className='events-state';badge.textContent=live?'En cours':'À venir';
  const name=document.createElement('strong');name.textContent=e.title;
  const period=document.createElement('span');period.className='events-period';
  period.textContent=e.start===e.end?short.format(date(e.start)):'Du '+short.format(date(e.start))+' au '+short.format(date(e.end));
  node.append(badge,name,period);return node;
 }
 if(!current.length){const empty=document.createElement('p');empty.className='events-empty';empty.textContent='Aucun événement en cours ou à venir ce mois-ci.';first.append(empty);}
 else{first.append(item(current[0]));current.slice(1).forEach(e=>more.append(item(e)));}
 if(current.length>1){
  button.hidden=false;label.textContent='Voir les '+(current.length-1)+' autres événements';
  button.onclick=()=>{
   const open=button.getAttribute('aria-expanded')!=='true';
   const from=more.hidden?0:more.getBoundingClientRect().height;
   more.style.height=from+'px';more.style.overflow='hidden';
   if(moreAnimation){const previous=moreAnimation;moreAnimation=null;previous.cancel();}
   button.setAttribute('aria-expanded',String(open));
   label.textContent=open?'Masquer les autres événements':'Voir les '+(current.length-1)+' autres événements';
   more.hidden=false;more.classList.toggle('is-open',open);
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||typeof more.animate!=='function'){
    more.hidden=!open;more.style.removeProperty('height');more.style.removeProperty('overflow');return;
   }
   more.style.height='auto';const to=open?more.scrollHeight:0;more.style.height=from+'px';
   if(Math.abs(to-from)<1){
    more.hidden=!open;more.style.removeProperty('height');more.style.removeProperty('overflow');return;
   }
   const duration=Math.round(Math.min(480,Math.max(300,250+8*Math.sqrt(Math.abs(to-from)))));
   const motion=more.animate([{height:from+'px'},{height:to+'px'}],
    {duration,easing:'cubic-bezier(.23,.72,.24,1)',fill:'both'});
   moreAnimation=motion;
   motion.onfinish=()=>{
    if(moreAnimation!==motion)return;
    moreAnimation=null;more.style.height=to+'px';motion.cancel();
    more.hidden=!open;
    more.style.removeProperty('height');more.style.removeProperty('overflow');
   };
  };
 }
}
function rowsToData(rows){return {
 inventories:rows.filter(r=>r.enabled&&r.kind==='inventory').map(r=>r.starts_on),
 events:rows.filter(r=>r.enabled&&r.kind==='store').map(r=>({id:r.id,title:r.title,start:r.starts_on,end:r.ends_on}))
};}
async function refresh(force=false){
 if(loading||!navigator.onLine||(!force&&Date.now()-lastRefresh<30000))return;
 loading=true;
 try{
  const auth=window.InventairesAuth;if(!auth?.getClient)return;
  const client=await auth.getClient();
  const {data,error}=await client.from('inventory_push_events').select('id,kind,title,starts_on,ends_on,enabled').eq('enabled',true).order('starts_on').limit(1000);
  if(error)throw error;
  const next=rowsToData(data||[]);localStorage.setItem(CACHE,JSON.stringify(next));render(next);lastRefresh=Date.now();
 }catch(e){console.info('Planning en mode local (synchronisation indisponible)',e?.message||e);}
 finally{loading=false;}
}
render(readCache()||fallback);
window.InventairesPlanning={refresh,render};
refresh(true);
window.addEventListener('online',()=>refresh(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},120000);
})();
