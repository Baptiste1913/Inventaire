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
const CALENDAR_MOTION_MS=560;
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
   closeTimer=setTimeout(()=>{calendar.open=false;expanded.style.maxHeight='';expanded.style.opacity='';closeTimer=null;},CALENDAR_MOTION_MS);
  }else{
   calendar.open=true;calendar.classList.add('calendar-expanded');
   expanded.style.maxHeight='0px';expanded.style.opacity='0';
   expanded.getBoundingClientRect();
   expanded.style.maxHeight=expanded.scrollHeight+'px';expanded.style.opacity='1';
   setTimeout(()=>{if(calendar.open&&!closeTimer)expanded.style.maxHeight='';},CALENDAR_MOTION_MS);
  }
 });
}
// Export iCalendar local : alertes natives du calendrier, sans promesse de push web.
const reminderDays=document.getElementById('reminderDays'),reminderHour=document.getElementById('reminderHour');
try{const prefs=JSON.parse(localStorage.getItem('inventaires-u-reminders-v1')||'{}');if(['1','3','7'].includes(String(prefs.days)))reminderDays.value=String(prefs.days);if(['09','18'].includes(String(prefs.hour)))reminderHour.value=String(prefs.hour);}catch(_){}
function saveReminderPrefs(){try{localStorage.setItem('inventaires-u-reminders-v1',JSON.stringify({days:reminderDays.value,hour:reminderHour.value}));}catch(_){}}
reminderDays?.addEventListener('change',saveReminderPrefs);reminderHour?.addEventListener('change',saveReminderPrefs);
function icsDate(date){return date.getFullYear()+String(date.getMonth()+1).padStart(2,'0')+String(date.getDate()).padStart(2,'0');}
function escapeICS(text){return String(text).replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');}
document.getElementById('reminderExport')?.addEventListener('click',()=>{
 saveReminderPrefs();const days=Number(reminderDays.value),hour=Number(reminderHour.value),now=new Date();
 const rows=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Inventaires U//Rappels inventaires//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Inventaires U - Inventaires prévus'];
 // 24 prochains mois, sans doubler les dates prévues à cheval sur deux mois.
 const seen=new Set();for(let i=0;i<24;i++){const y=now.getFullYear()+Math.floor((now.getMonth()+i)/12),m=(now.getMonth()+i)%12,d=planned(y,m),key=icsDate(d);if(seen.has(key)||d<new Date(now.getFullYear(),now.getMonth(),now.getDate()))continue;seen.add(key);
 const start=new Date(d.getFullYear(),d.getMonth(),d.getDate(),hour,0,0),end=new Date(start.getTime()+3600000);
 const stamp=v=>icsDate(v)+'T'+String(v.getHours()).padStart(2,'0')+'0000';
 rows.push('BEGIN:VEVENT','UID:inventaires-u-'+y+'-'+m+'@inventaires-u','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),'SUMMARY:'+escapeICS('Inventaire Fruits et Légumes — '+monthNames[m]+' '+y),'DESCRIPTION:'+escapeICS('Date prévisionnelle : lundi le plus proche du 1er du mois. Vérifier auprès du magasin.'),'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Rappel inventaire Fruits et Légumes','TRIGGER:-P'+days+'D','END:VALARM','END:VEVENT');}
 rows.push('END:VCALENDAR');const blob=new Blob([rows.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Inventaires-U-Rappels.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 const help=document.getElementById('reminderHelp');if(help)help.textContent='Fichier calendrier créé. Ouvre-le puis importe les événements sur ton iPhone. Les alertes dépendent des réglages de notification de Calendrier. Si tu changes les dates ou les rappels, réimporte un calendrier actualisé.';
});
document.getElementById('calendarPrev')?.addEventListener('click',()=>{year--;render();});
document.getElementById('calendarNext')?.addEventListener('click',()=>{year++;render();});updateNext();render();
})();
