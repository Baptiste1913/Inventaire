(()=>{'use strict';
const data=window.INVENTAIRES_U_EVENTS||{inventories:[],events:[]};
const date=s=>new Date(s+'T12:00:00');
const today=new Date();today.setHours(0,0,0,0);
const dateLong=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const dateShort=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'});
const monthLong=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'});
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const next=(data.inventories||[]).map(date).sort((a,b)=>a-b).find(d=>d>=today);
document.getElementById('calendarNextDate').textContent=next?cap(dateLong.format(next)):'Date à confirmer';
document.getElementById('eventsMonthHeading').textContent='ÉVÉNEMENTS · '+monthLong.format(today).toLocaleUpperCase('fr-FR');
const monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0,23,59);
const current=(data.events||[]).filter(e=>date(e.start)<=monthEnd&&date(e.end)>=today).sort((a,b)=>{
 const aLive=date(a.start)<=today,bLive=date(b.start)<=today;
 return Number(bLive)-Number(aLive)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title,'fr');
});
function item(e){const node=document.createElement('div');node.className='events-entry';
 const live=date(e.start)<=today;node.classList.add(live?'events-entry-live':'events-entry-upcoming');
 const badge=document.createElement('span');badge.className='events-state';badge.textContent=live?'En cours':'À venir';
 const name=document.createElement('strong');name.textContent=e.title;
 const period=document.createElement('span');period.className='events-period';period.textContent=e.start===e.end?dateShort.format(date(e.start)):'Du '+dateShort.format(date(e.start))+' au '+dateShort.format(date(e.end));
 node.append(badge,name,period);return node;}
const first=document.getElementById('eventsFirst'),more=document.getElementById('eventsMoreList'),button=document.getElementById('eventsMoreButton'),label=document.getElementById('eventsMoreLabel');
if(!current.length){const empty=document.createElement('p');empty.className='events-empty';empty.textContent='Aucun événement en cours ou à venir ce mois-ci.';first.append(empty);}
else{first.append(item(current[0]));current.slice(1).forEach(e=>more.append(item(e)));}
if(current.length>1){button.hidden=false;label.textContent='Voir les '+(current.length-1)+' autres événements';let timer;
button.addEventListener('click',()=>{clearTimeout(timer);const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));label.textContent=open?'Masquer les autres événements':'Voir les '+(current.length-1)+' autres événements';
 if(open){more.hidden=false;more.style.maxHeight='0px';more.getBoundingClientRect();more.classList.add('is-open');more.style.maxHeight=more.scrollHeight+'px';timer=setTimeout(()=>{if(button.getAttribute('aria-expanded')==='true')more.style.maxHeight='none';},600);}
 else{more.style.maxHeight=more.scrollHeight+'px';more.getBoundingClientRect();more.classList.remove('is-open');more.style.maxHeight='0px';timer=setTimeout(()=>{if(button.getAttribute('aria-expanded')==='false')more.hidden=true;},600);}
});}
})();
