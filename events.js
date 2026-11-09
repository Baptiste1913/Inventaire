(()=>{'use strict';
const data=window.INVENTAIRES_U_EVENTS||{inventories:[],events:[]};
const date=s=>new Date(s+'T12:00:00');
const today=new Date();today.setHours(0,0,0,0);
const dateLong=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const dateShort=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'});
const monthLong=new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'});
const titleCase=s=>s.charAt(0).toUpperCase()+s.slice(1);
const next=(data.inventories||[]).map(date).sort((a,b)=>a-b).find(d=>d>=today);
document.getElementById('calendarNextDate').textContent=next?titleCase(dateLong.format(next)):'Date à confirmer';
const heading=document.getElementById('eventsMonthHeading');heading.textContent='ÉVÉNEMENTS À VENIR · '+monthLong.format(today).toLocaleUpperCase('fr-FR');
const monthStart=new Date(today.getFullYear(),today.getMonth(),1),monthEnd=new Date(today.getFullYear(),today.getMonth()+1,0,23,59);
const current=(data.events||[]).filter(e=>date(e.start)<=monthEnd&&date(e.end)>=today).sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title,'fr'));
function item(e){const node=document.createElement('div');node.className='events-entry';const name=document.createElement('strong');name.textContent=e.title;const period=document.createElement('span');period.textContent=e.start===e.end?dateShort.format(date(e.start)):'Du '+dateShort.format(date(e.start))+' au '+dateShort.format(date(e.end));node.append(name,period);return node;}
const first=document.getElementById('eventsFirst'),more=document.getElementById('eventsMoreList'),button=document.getElementById('eventsMoreButton'),label=document.getElementById('eventsMoreLabel');
if(!current.length){const empty=document.createElement('p');empty.className='events-empty';empty.textContent='Aucun autre événement annoncé pour ce mois.';first.append(empty);}else{first.append(item(current[0]));current.slice(1).forEach(e=>more.append(item(e)));}
if(current.length>1){button.hidden=false;label.textContent='Voir les '+(current.length-1)+' autres événements';button.addEventListener('click',()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));label.textContent=open?'Masquer les autres événements':'Voir les '+(current.length-1)+' autres événements';if(open){more.hidden=false;requestAnimationFrame(()=>more.classList.add('is-open'));}else{more.classList.remove('is-open');setTimeout(()=>{if(button.getAttribute('aria-expanded')==='false')more.hidden=true;},560);}});}
const card=document.getElementById('inventoryCalendar'),summary=card.querySelector('summary'),expanded=card.querySelector('.inventory-calendar-expanded');let timer=null;
summary.addEventListener('click',e=>{e.preventDefault();clearTimeout(timer);if(card.open){expanded.style.maxHeight=expanded.scrollHeight+'px';expanded.getBoundingClientRect();card.classList.remove('calendar-expanded');expanded.style.maxHeight='0px';expanded.style.opacity='0';timer=setTimeout(()=>{card.open=false;expanded.style.maxHeight='';expanded.style.opacity='';},560);}else{card.open=true;card.classList.add('calendar-expanded');expanded.style.maxHeight='0px';expanded.style.opacity='0';expanded.getBoundingClientRect();expanded.style.maxHeight=expanded.scrollHeight+'px';expanded.style.opacity='1';timer=setTimeout(()=>{if(card.open)expanded.style.maxHeight='';},560);}});
})();
