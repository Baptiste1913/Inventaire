(()=>{'use strict';
const grid=document.getElementById('inventoryCalendarGrid'),yearLabel=document.getElementById('calendarYear');if(!grid||!yearLabel)return;
let year=new Date().getFullYear();const monthNames=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const format=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'});
function planned(y,m){const first=new Date(y,m,1,12);const weekday=first.getDay();const before=(weekday+6)%7;const after=7-before;first.setDate(1+(before<=after?-before:after));return first;}
function render(){yearLabel.textContent=String(year);grid.replaceChildren();const today=new Date();today.setHours(0,0,0,0);
 for(let m=0;m<12;m++){const day=planned(year,m),card=document.createElement('div');card.className='inventory-calendar-month';
 const name=document.createElement('span');name.className='inventory-calendar-name';name.textContent=monthNames[m];
 const date=document.createElement('strong');date.textContent=format.format(day);date.title=day.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const hint=document.createElement('small');hint.textContent=day<today?'Date passée':'À venir';if(day.getTime()===planned(today.getFullYear(),today.getMonth()).getTime())card.classList.add('is-current');
 card.append(name,date,hint);grid.append(card);
 }}
document.getElementById('calendarPrev')?.addEventListener('click',()=>{year--;render();});
document.getElementById('calendarNext')?.addEventListener('click',()=>{year++;render();});render();
})();
