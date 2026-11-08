(()=>{'use strict';
const grid=document.getElementById('inventoryCalendarGrid'),yearLabel=document.getElementById('calendarYear');if(!grid||!yearLabel)return;
let year=new Date().getFullYear();const monthNames=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const format=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short'});
const longFormat=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function planned(y,m){const first=new Date(y,m,1,12);const weekday=first.getDay();const before=(weekday+6)%7;const after=7-before;first.setDate(1+(before<=after?-before:after));return first;}
function updateNext(){
 const now=new Date();now.setHours(0,0,0,0);
 let next=null;
 for(let y=now.getFullYear()-1;y<=now.getFullYear()+2;y++)for(let m=0;m<12;m++){
  const date=planned(y,m);date.setHours(0,0,0,0);
  if(date>=now&&(!next||date<next.date))next={date,month:m,year:y};
 }
 const dateLabel=document.getElementById('calendarNextDate');
 const monthLabel=document.getElementById('calendarNextMonth');
 if(next&&dateLabel&&monthLabel){dateLabel.textContent=longFormat.format(next.date);monthLabel.textContent=`Inventaire de ${monthNames[next.month].toLowerCase()} ${next.year} · Date prévisionnelle`;}
}
function render(){yearLabel.textContent=String(year);grid.replaceChildren();const today=new Date();today.setHours(0,0,0,0);
 for(let m=0;m<12;m++){const day=planned(year,m),card=document.createElement('div');card.className='inventory-calendar-month';
 const name=document.createElement('span');name.className='inventory-calendar-name';name.textContent=monthNames[m];
 const date=document.createElement('strong');date.textContent=format.format(day);date.title=day.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 const hint=document.createElement('small');hint.textContent=day<today?'Date passée':'À venir';if(day.getTime()===planned(today.getFullYear(),today.getMonth()).getTime())card.classList.add('is-current');
 card.append(name,date,hint);grid.append(card);
 }}
const calendar=document.getElementById('inventoryCalendar');
const summary=calendar?.querySelector('summary');
const expanded=calendar?.querySelector('.inventory-calendar-expanded');
let closeTimer=null;
if(calendar&&summary&&expanded){
 summary.addEventListener('click',event=>{
  event.preventDefault();
  if(closeTimer){clearTimeout(closeTimer);closeTimer=null;}
  if(calendar.open){
   expanded.style.maxHeight=expanded.scrollHeight+'px';
   expanded.getBoundingClientRect();
   calendar.classList.remove('calendar-expanded');
   expanded.style.maxHeight='0px';expanded.style.opacity='0';
   calendar.setAttribute('aria-busy','false');
   closeTimer=setTimeout(()=>{calendar.open=false;expanded.style.maxHeight='';expanded.style.opacity='';closeTimer=null;},360);
  }else{
   calendar.open=true;calendar.classList.add('calendar-expanded');
   expanded.style.maxHeight='0px';expanded.style.opacity='0';
   expanded.getBoundingClientRect();
   expanded.style.maxHeight=expanded.scrollHeight+'px';expanded.style.opacity='1';
   setTimeout(()=>{if(calendar.open&&!closeTimer)expanded.style.maxHeight='';},380);
  }
 });
}
document.getElementById('calendarPrev')?.addEventListener('click',()=>{year--;render();});
document.getElementById('calendarNext')?.addEventListener('click',()=>{year++;render();});updateNext();render();
})();
