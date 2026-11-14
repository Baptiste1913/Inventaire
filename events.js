/* Inventaires U V37.09 — Planning public Supabase et calendrier mensuel.
   Les données en cache restent consultables hors ligne ; aucune API
   supplémentaire n'est appelée pour afficher la page Événements. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const fallback=window.INVENTAIRES_U_EVENTS||{inventories:[],events:[]};
const CACHE='inventaires-u-planning-cache-v33.35';
const date=s=>new Date(String(s)+'T12:00:00');
const long=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const short=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'});
const month=new Intl.DateTimeFormat('fr-FR',{month:'long'});
const fullMonth=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'});
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const today=()=>{const d=new Date();d.setHours(12,0,0,0);return d;};
const dayKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const eventEnd=e=>date(e.end||e.start);
const intersects=(e,start,end)=>date(e.start)<=end&&eventEnd(e)>=start;
const datePeriod=e=>e.start===(e.end||e.start)?cap(short.format(date(e.start))):'Du '+short.format(date(e.start))+' au '+short.format(eventEnd(e));
const countLabel=n=>n+' événement'+(n>1?'s':'');
const daysBetween=(from,to)=>Math.round((Date.UTC(to.getFullYear(),to.getMonth(),to.getDate())-Date.UTC(from.getFullYear(),from.getMonth(),from.getDate()))/86400000);
const eventKey=e=>String(e.id??[e.title,e.start,e.end||e.start].join('|'));
const statusClass=(e,now)=>eventEnd(e)<now?'is-past':date(e.start)<=now?'is-live':'is-upcoming';
// V37.12 — Deux seules catégories visibles, sans effacer les données du planning.
const TYPE_COLORS={inventory:'#2b9a74',purchase:'#d65050'};
const powerPurchase=event=>{
 const normalized=String(event.title||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[\u2018\u2019]/g,"'").toUpperCase();
 return /10\s*%\s*POUVOIR\s+D['\s]*ACHAT/.test(normalized);
};
const kindName=event=>event.kind==='inventory'?'Inventaire':'10 % Pouvoir d’achat';
const accent=event=>TYPE_COLORS[event.kind]||TYPE_COLORS.purchase;
const sorted=rows=>[...rows].sort((a,b)=>a.start.localeCompare(b.start)||String(a.title||'').localeCompare(String(b.title||''),'fr'));
const usable=rows=>(Array.isArray(rows)?rows:[]).filter(e=>e&&typeof e.title==='string'&&Number.isFinite(date(e.start).getTime())&&Number.isFinite(eventEnd(e).getTime())&&eventEnd(e)>=date(e.start));
const calendarItems=data=>{
 const purchases=usable(data?.events).filter(powerPurchase).map(e=>({...e,kind:'purchase'}));
 const inventories=[...new Set(Array.isArray(data?.inventories)?data.inventories:[])]
  .filter(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(date(value).getTime()))
  .map(value=>({id:'inventory:'+value,title:'Inventaire Fruits et Légumes',
   start:value,end:value,kind:'inventory'}));
 return sorted([...purchases,...inventories]);
};
let lastRefresh=0,loading=false;
let latestData=fallback;
let calendarCursor=new Date(today().getFullYear(),today().getMonth(),1,12);
let selectedKey=dayKey(today()),firstOpen=true;
function readCache(){try{const o=JSON.parse(localStorage.getItem(CACHE)||'null');return Array.isArray(o?.inventories)&&Array.isArray(o?.events)?o:null;}catch{return null;}}
function eventStatus(e,now){
 if(eventEnd(e)<now)return ['Terminé','is-past'];
 if(date(e.start)<=now)return ['En cours','is-live'];
 return ['À venir','is-upcoming'];
}
function makeEventRow(e,now,accent){
 const row=document.createElement('article');row.className='iu-events-list-row';
 row.style.setProperty('--iu-event-accent',accent);
 const main=document.createElement('div');main.className='iu-events-list-main';
 const title=document.createElement('strong');title.textContent=e.title;
 const period=document.createElement('span');period.textContent=datePeriod(e);
 const pill=document.createElement('span');
 const [status,cls]=eventStatus(e,now);
 pill.className='iu-events-row-state is-'+e.kind+' '+cls;
 pill.textContent=kindName(e);
 pill.setAttribute('aria-label',kindName(e)+' · '+status);
 main.append(title,period);row.append(main,pill);return row;
}
function fillRows(container,rows,now,empty,accent){
 if(!container)return;
 container.replaceChildren();
 if(!rows.length){
  const p=document.createElement('p');p.className='iu-events-empty';p.textContent=empty;
  container.append(p);return;
 }
 for(const e of sorted(rows))container.append(makeEventRow(e,now,accent(e)));
}
function makeOtherRow(e,now){
 const row=document.createElement('article');
 row.className='iu-events-list-row iu-events-other-row';
 const main=document.createElement('div');main.className='iu-events-list-main';
 const name=document.createElement('strong');name.textContent=e.title;
 const period=document.createElement('span');period.textContent=datePeriod(e);
 const [status,cls]=eventStatus(e,now);
 const pill=document.createElement('span');pill.className='iu-events-row-state iu-events-other-state '+cls;
 pill.textContent=status;
 main.append(name,period);row.append(main,pill);
 return row;
}
function renderPage(){
 if(!$('eventsCalendarGrid'))return;
 const now=today(),events=calendarItems(latestData);
 const coming=events.filter(e=>eventEnd(e)>=now).sort((a,b)=>{
  const activeA=date(a.start)<=now,activeB=date(b.start)<=now;
  return Number(activeB)-Number(activeA)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title,'fr');
 });
 const lead=coming[0],leadState=$('eventsFeatureState');
 if(lead){
  const [status,cls]=eventStatus(lead,now);
  $('eventsFeatureHeading').textContent=lead.title;
  $('eventsFeaturePeriod').textContent=datePeriod(lead);
  leadState.textContent=status;
  leadState.className='iu-events-feature-state '+cls+(lead.kind==='purchase'?' is-purchase':' is-inventory');
  leadState.hidden=false;
  const remaining=daysBetween(now,status==='En cours'?eventEnd(lead):date(lead.start));
  const countdown=$('eventsFeatureCountdown'),message=$('eventsFeatureCountdownText');
  if(countdown&&message){
   message.textContent=status==='En cours'
    ?remaining===0?'Se termine aujourd’hui':remaining===1?'Se termine demain':'Se termine dans '+remaining+' jours'
    :remaining===0?'Commence aujourd’hui':remaining===1?'Commence demain':'Commence dans '+remaining+' jours';
   countdown.classList.toggle('is-live',status==='En cours');
   countdown.classList.toggle('is-purchase',lead.kind==='purchase');
   countdown.hidden=false;
  }
 }else{
  $('eventsFeatureHeading').textContent='Aucune date à venir';
  $('eventsFeaturePeriod').textContent='Les prochains inventaires et opérations 10 % apparaîtront ici dès leur publication.';
  leadState.hidden=true;
  const countdown=$('eventsFeatureCountdown');if(countdown)countdown.hidden=true;
 }
 const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
 const first=new Date(y,m,1,12),last=new Date(y,m+1,0,12);
 const monthEvents=sorted(events.filter(e=>intersects(e,first,last)));
 // Les catégories gardent toujours les mêmes couleurs, quel que soit le mois.
 $('eventsCalendarTitle').textContent=cap(fullMonth.format(first));
 const nInventories=monthEvents.filter(e=>e.kind==='inventory').length;
 const nPurchases=monthEvents.length-nInventories;
 $('eventsCalendarSummary').textContent=nInventories+' inventaire'+(nInventories>1?'s':'')+
  ' · '+nPurchases+' opération'+(nPurchases>1?'s':'')+' 10 %';
 $('eventsAgendaHeading').textContent='Agenda de '+month.format(first);
 $('eventsAgendaCount').textContent=countLabel(monthEvents.length);
 const grid=$('eventsCalendarGrid');grid.replaceChildren();
 const offset=(first.getDay()+6)%7;
 const cells=Math.ceil((offset+last.getDate())/7)*7;
 const forDay=day=>{
  const rows=events.filter(e=>intersects(e,day,day));
  return ['inventory','purchase'].map(kind=>rows.filter(e=>e.kind===kind)
   .sort((a,b)=>a.start.localeCompare(b.start)||eventKey(a).localeCompare(eventKey(b)))[0]).filter(Boolean);
 };
 for(let i=0;i<cells;i++){
  const day=new Date(y,m,1-offset+i,12);
  const key=dayKey(day),inMonth=day.getMonth()===m;
  const matches=events.filter(e=>intersects(e,day,day));
  const button=document.createElement('button');button.type='button';
  button.className='iu-events-calendar-day';
  if(!inMonth)button.classList.add('is-outside');
  if(matches.length)button.classList.add('has-events');
  const visible=forDay(day);
  const hiddenCount=Math.max(0,matches.length-visible.length);
  if(key===dayKey(now)){button.classList.add('is-today');button.setAttribute('aria-current','date');}
  if(key===selectedKey)button.classList.add('is-selected');
  button.style.gridColumn=String(i%7+1);
  button.style.gridRow=String(Math.floor(i/7)+1);
  button.setAttribute('aria-pressed',String(key===selectedKey));
  button.setAttribute('aria-label',cap(long.format(day))+' · '+countLabel(matches.length)+
   (matches.length?' · '+sorted(matches).slice(0,2).map(e=>e.title).join(', ')+(matches.length>2?' et autres':''):'')+
   (key===dayKey(now)?' · Aujourd’hui':'')+(key===selectedKey?' · Date sélectionnée':''));
  const num=document.createElement('span');num.className='iu-events-day-number';num.textContent=String(day.getDate());
  const ribbons=document.createElement('span');
  ribbons.className='iu-events-day-ribbons';
  ribbons.setAttribute('aria-hidden','true');
  // L'inventaire garde son point vert. Les périodes 10 % sont dessinées
  // UNE SEULE FOIS au-dessus de la grille, jamais dans chaque case.
  for(const event of visible.filter(e=>e.kind==='inventory')){
   const ribbon=document.createElement('span');
   ribbon.className='iu-events-day-ribbon is-kind-inventory';
   ribbon.style.setProperty('--iu-event-accent',accent(event));
   ribbons.append(ribbon);
  }
  button.append(num,ribbons);
  if(hiddenCount){
   const marker=document.createElement('span');
   marker.className='iu-events-day-marker is-multi';
   marker.setAttribute('aria-hidden','true');
   const count=document.createElement('span');count.className='iu-events-day-count';
   count.textContent='+'+String(hiddenCount);
   marker.append(count);button.append(marker);
  }
  button.addEventListener('click',event=>{
   selectedKey=key;
   if(day.getMonth()!==calendarCursor.getMonth()||day.getFullYear()!==calendarCursor.getFullYear()){
    calendarCursor=new Date(day.getFullYear(),day.getMonth(),1,12);
   }
   renderPage();
   if(event.detail===0){
    const chosen=[...$('eventsCalendarGrid').querySelectorAll('.iu-events-calendar-day')].find(el=>el.getAttribute('aria-pressed')==='true');
    chosen?.focus({preventScroll:true});
   }
  });
  grid.append(button);
 }
 // Une couche unique pour toutes les périodes 10 %. Elle ne participe
 // pas au placement des cases et reste toujours AU-DESSUS de la sélection.
 // Cela évite sur Safari les deux rendus superposés et les segments coupés.
 const gridOverlay=document.createElement('div');
 gridOverlay.className='iu-events-week-overlay';
 gridOverlay.setAttribute('aria-hidden','true');
 gridOverlay.style.setProperty('--iu-calendar-weeks',String(cells/7));
 const purchaseDays=Array.from({length:cells},(_,i)=>{
  const d=new Date(y,m,1-offset+i,12);
  // Les jours du mois précédent/suivant ne portent pas de trait : leur
  // opération apparaîtra quand l'utilisateur affichera leur propre mois.
  return d.getMonth()===m&&events.some(e=>e.kind==='purchase'&&intersects(e,d,d));
 });
 let barCount=0;
 for(let week=0;week<cells/7;week++){
  for(let col=0;col<7;){
   if(!purchaseDays[week*7+col]){col++;continue;}
   const from=col;
   while(col<7&&purchaseDays[week*7+col])col++;
   const bar=document.createElement('span');
   bar.className='iu-events-week-bar';
   bar.style.gridColumn=(from+1)+' / '+(col+1);
   bar.style.gridRow=String(week+1);
   bar.style.setProperty('--iu-event-accent',TYPE_COLORS.purchase);
   gridOverlay.append(bar);
   barCount++;
  }
 }
 if(barCount)grid.append(gridOverlay);
 const selected=date(selectedKey);
 $('eventsSelectedDate').textContent=cap(long.format(selected));
 const dayEvents=sorted(events.filter(e=>intersects(e,selected,selected)));
 $('eventsSelectedCount').textContent=countLabel(dayEvents.length);
 fillRows($('eventsSelectedList'),dayEvents,now,'Aucun inventaire ni opération 10 % pour cette date.',accent);
 fillRows($('eventsAgendaList'),monthEvents,now,'Aucun inventaire ni opération 10 % prévu ce mois-ci.',accent);

 // Les autres opérations ne sont pas perdues : elles restent accessibles
 // dans leur propre volet, sans apparaître sur la grille prioritaire.
 const others=sorted(usable(latestData.events).filter(e=>!powerPurchase(e)&&intersects(e,first,last)));
 const otherCount=$('eventsOtherCount'),otherSubtitle=$('eventsOtherSubtitle'),otherList=$('eventsOtherList');
 if(otherCount)otherCount.textContent=countLabel(others.length);
 if(otherSubtitle)otherSubtitle.textContent='Autres opérations en '+month.format(first);
 if(otherList){
  otherList.replaceChildren();
  if(!others.length){
   const empty=document.createElement('p');empty.className='iu-events-empty';
   empty.textContent='Aucun autre événement prévu pour ce mois.';
   otherList.append(empty);
  }else{
   for(const e of others)otherList.append(makeOtherRow(e,now));
  }
 }
}
function preparePage(){
 if(firstOpen){
  const now=today();
  const upcoming=calendarItems(latestData).filter(e=>eventEnd(e)>=now).sort((a,b)=>{
   const aLive=date(a.start)<=now,bLive=date(b.start)<=now;
   return Number(bLive)-Number(aLive)||a.start.localeCompare(b.start);
  });
  const next=upcoming[0]&&date(upcoming[0].start)>now?date(upcoming[0].start):now;
  calendarCursor=new Date(next.getFullYear(),next.getMonth(),1,12);
  selectedKey=dayKey(next);firstOpen=false;
 }
 renderPage();
}
function changeMonth(direction){
 calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+direction,1,12);
 const first=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth(),1,12);
 const last=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,0,12);
 const next=sorted(calendarItems(latestData).filter(e=>intersects(e,first,last)))[0];
 selectedKey=dayKey(next?(date(next.start)<first?first:date(next.start)):first);
 renderPage();
}
function render(data){
 latestData=data||fallback;
 const now=today();
 const next=(latestData.inventories||[]).map(date).filter(d=>Number.isFinite(d.getTime())).sort((a,b)=>a-b).find(d=>d>=now);
 $('calendarNextDate').textContent=next?cap(long.format(next)):'Date à confirmer';
 const countdown=$('calendarNextCountdown');
 if(countdown){
  if(!next){countdown.hidden=true;countdown.textContent='';}
  else{
   const days=Math.round((Date.UTC(next.getFullYear(),next.getMonth(),next.getDate())-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);
   countdown.textContent=days===0?"Aujourd’hui":days===1?"Demain":'Dans '+days+' jours';
   countdown.hidden=false;
  }
 }
 $('eventsMonthHeading').textContent='Événements en '+month.format(now);
 renderPage();
}
function rowsToData(rows){return {
 inventories:rows.filter(r=>r.enabled&&r.kind==='inventory').map(r=>r.starts_on),
 events:rows.filter(r=>r.enabled&&r.kind==='store').map(r=>({id:r.id,title:r.title,start:r.starts_on,end:r.ends_on||r.starts_on}))
};}
async function refresh(force=false){
 if(loading||!navigator.onLine||(!force&&Date.now()-lastRefresh<30000))return;
 loading=true;
 try{
  const auth=window.InventairesAuth;if(!auth?.getClient)return;
  const client=await auth.getClient();
  const {data,error}=await client.from('inventory_push_events').select('id,kind,title,starts_on,ends_on,enabled').eq('enabled',true).order('starts_on').limit(1000);
  if(error)throw error;
  const next=rowsToData(data||[]);
  localStorage.setItem(CACHE,JSON.stringify(next));render(next);lastRefresh=Date.now();
 }catch(e){console.info('Planning en mode local (synchronisation indisponible)',e?.message||e);}
 finally{loading=false;}
}
$('eventsCalendarPrevious')?.addEventListener('click',()=>changeMonth(-1));
$('eventsCalendarNext')?.addEventListener('click',()=>changeMonth(1));
$('eventsCalendarToday')?.addEventListener('click',()=>{
 const now=today();calendarCursor=new Date(now.getFullYear(),now.getMonth(),1,12);
 selectedKey=dayKey(now);renderPage();
});
render(readCache()||fallback);
window.InventairesPlanning={refresh,render,renderPage,preparePage};
refresh(true);
window.addEventListener('online',()=>refresh(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},120000);
})();