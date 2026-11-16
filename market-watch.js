/* V37.79 — Tableau de bord compact : offre France et rappels fournisseurs/U pertinents. */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
if(!byId('iuMarketWidget'))return;
const ui={
 supplyCount:byId('iuSupplyCount'),supplyPreview:byId('iuSupplyPreview'),
 recallCount:byId('iuRecallCount'),recallPreview:byId('iuRecallPreview'),
 supplyList:byId('iuSupplyList'),recallList:byId('iuRecallList'),
 updated:byId('iuMarketUpdated'),details:byId('iuMarketDetails'),
 listButton:byId('iuDashListButton'),listLabel:byId('iuDashListLabel'),
 drawer:byId('iuMarketDetailsList'),
 featured:byId('iuDashFeature'),featureKicker:byId('iuDashFeatureKicker'),
 featureTitle:byId('iuDashFeatureTitle'),featureSummary:byId('iuDashFeatureSummary')
};
/* V37.85 — La veille est visible par défaut.
   Le tiroir des détails anime sa hauteur réelle (et non une grille 0fr/1fr
   contenant une zone défilante), pour une fermeture réversible sur Safari. */
/* V37.88 — Fenêtre native identique au tutoriel des notifications.
   La liste est hors du bandeau, mais ses données et liens sont inchangés. */
/* V38.53 — La liste ouvre maintenant une vraie page, comme Administration.
   Les mêmes listes et les mêmes critères de veille restent utilisés. */
const drawerReady=ui.details&&ui.listButton&&ui.listLabel&&ui.drawer;
let listCount=0;
function updateListButton(){
 if(!drawerReady)return;
 ui.listLabel.textContent='Voir la liste'+(listCount?' ('+listCount+')':'');
}
if(drawerReady){
 ui.listButton.addEventListener('click',()=>window.IUOpenAlertsPage?.());
 updateListButton();
}
/* V38.59 — Filtres visuels et tri purement local des listes déjà vérifiées.
   Aucun changement aux critères officiels, à la cache ou à la carte d'accueil. */
const alertsPage={
 supplySection:byId('iuAlertsSupplySection'),
 recallSection:byId('iuAlertsRecallSection'),
 supplyTotal:byId('iuAlertsSupplyTotal'),
 recallTotal:byId('iuAlertsRecallTotal'),
 sort:byId('iuAlertsSort'),
 filters:[...document.querySelectorAll('#iuAlertsPage [data-iu-alert-filter]')]
};
let alertsFilter='all',alertsSort='relevance';
let alertsLists={supplies:[],recalls:[],supplyOK:false,recallOK:false,priceOK:false};
function sortedAlerts(items){
 if(alertsSort==='relevance')return items;
 const sorted=items.slice();
 if(alertsSort==='alpha')sorted.sort((a,b)=>a.title.localeCompare(b.title,'fr',{sensitivity:'base'})||Date.parse(b.date)-Date.parse(a.date));
 else sorted.sort((a,b)=>alertsSort==='oldest'?Date.parse(a.date)-Date.parse(b.date):Date.parse(b.date)-Date.parse(a.date));
 return sorted;
}
function renderAlertLists(){
 const {supplies,recalls,supplyOK,recallOK,priceOK}=alertsLists;
 if(alertsPage.supplySection)alertsPage.supplySection.hidden=alertsFilter==='recall';
 if(alertsPage.recallSection)alertsPage.recallSection.hidden=alertsFilter==='supply';
 if(alertsPage.supplyTotal)alertsPage.supplyTotal.textContent=supplies.length?String(supplies.length):supplyOK?'0':'—';
 if(alertsPage.recallTotal)alertsPage.recallTotal.textContent=recalls.length?String(recalls.length):recallOK?'0':'—';
 ui.supplyList.replaceChildren();
 ui.recallList.replaceChildren();
 if(supplies.length)sortedAlerts(supplies).slice(0,12).forEach(x=>ui.supplyList.append(alertLink(x)));
 else ui.supplyList.append(element('p','iu-dash-empty',
  supplyOK?'Aucun signal récent relevé dans les sources vérifiées.':'Source approvisionnement non actualisée.'));
 if(!priceOK)ui.supplyList.append(element('p','iu-dash-source-note','Cotations de prix indisponibles pour le moment.'));
 if(recalls.length)sortedAlerts(recalls).slice(0,12).forEach(x=>ui.recallList.append(alertLink(x)));
 else ui.recallList.append(element('p','iu-dash-empty',
  recallOK?'Aucun rappel U ou fournisseur pertinent dans les fiches récentes vérifiées.':'Recherche de rappels non actualisée.'));
}
alertsPage.filters.forEach(button=>button.addEventListener('click',()=>{
 const choice=button.dataset.iuAlertFilter;
 if(!['all','recall','supply'].includes(choice))return;
 alertsFilter=choice;
 alertsPage.filters.forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.iuAlertFilter===choice)));
 renderAlertLists();
}));
alertsPage.sort?.addEventListener('change',()=>{
 const value=alertsPage.sort.value;
 if(!['relevance','newest','oldest','alpha'].includes(value))return;
 alertsSort=value;
 renderAlertLists();
});
const DAY=86400000,LOCAL='iu_market_dashboard_filtered_v2';
const API='https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records';
const text=(v,max=150)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,max);
// Orthographe : initiales et noms propres, sans mettre chaque mot en majuscule.
function typographie(value){
 let result=text(value,180);
 if(!result)return result;
 result=result[0].toLocaleUpperCase('fr-FR')+result.slice(1);
 const names=[
  [/\bsanta\s+maria\b/gi,'Santa Maria'],
  [/\bfranceagrimer\b/gi,'FranceAgriMer'],
  [/\brappelconso\b/gi,'RappelConso'],
  [/\bchampibon\b/gi,'Champibon'],
  [/\bitafrut\b/gi,'Itafrut'],
  [/\bgala\b/gi,'Gala'],
  [/\btahiti\b/gi,'Tahiti'],
  [/\bfrance\b/gi,'France'],
  [/\bespagne\b/gi,'Espagne'],
  [/\bitalie\b/gi,'Italie'],
  [/\bbresil\b/gi,'Brésil'],
  [/\b(?:hyper|super)\s+u\b/gi,m=>m.toLocaleLowerCase('fr-FR').replace(/^./,c=>c.toLocaleUpperCase('fr-FR')).replace(/\bu\b/i,'U')],
  [/\bu\s+express\b/gi,'U Express']
 ];
 for(const [pattern,replacement] of names)result=result.replace(pattern,replacement);
 return result;
}
const recent=(date,days)=>{
 const stamp=Date.parse(String(date||'')),now=Date.now();
 return Number.isFinite(stamp)&&stamp>=now-days*DAY&&stamp<=now+DAY;
};
const frDate=v=>{
 const d=new Date(v);
 return Number.isFinite(d.getTime())?d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'';
};
// Date complète pour la carte principale : « 9 novembre », sans année.
const frLongDate=v=>{
 const d=new Date(v);
 return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',timeZone:'Europe/Paris'}).format(d):'';
};
function validUrl(link,type){
 try{
  const u=new URL(link);
  const hosts=type==='recall'?['rappel.conso.gouv.fr']:
   ['www.franceagrimer.fr','franceagrimer.fr','agridata.ec.europa.eu','rnm.franceagrimer.fr'];
  return u.protocol==='https:'&&hosts.includes(u.hostname)?u.href:null;
 }catch(_){return null;}
}
function isU(distributors){
 const value=text(distributors,1700).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
 const patterns=[
  /\b(?:super|hyper|systeme|cooperative)\s*[- ]?\s*u\b/,
  /\bu\s*[- ]?\s*(?:express|drive|enseigne)\b/,
  /\b(?:magasins?|enseignes?)\s+(?:de\s+|du\s+reseau\s+)?u\b/,
  /\b(?:reseau|reseaux)\s+(?:des?\s+)?(?:magasins?\s+)?u\b/,
  /\bmagasins?\s+utile\b/
 ];
 return patterns.some(p=>p.test(value))||value.split(/[,;|¤\n]/).some(v=>v.trim()==='u');
}
function competitorMentioned(value){
 const plain=text(value,1700).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const patterns=[
  /\bcarrefour\b/,/\b(?:e\.?\s*)?leclerc\b/,/\bauchan\b/,
  /\blidl\b/,/\baldi\b/,/\bintermarche\b/,/\bnetto\b/,
  /\bmonoprix\b/,/\bfranprix\b/,/\bcasino\b/,/\bcora\b/,
  /\b(?:supermarche\s+)?match\b/,/\bpicard\b/,
  /\bgrand\s+frais\b/,/\bbiocoop\b/,/\bnaturalia\b/,
  /\b(?:les\s+)?mousquetaires\b/,/\bpromocash\b/,/\bmetro\b/,/\bcostco\b/
 ];
 return patterns.some(p=>p.test(plain));
}
function relevantRecall(distributors,brand){
 if(competitorMentioned(brand))return false;
 if(isU(distributors))return true;
 return !competitorMentioned(distributors);
}
function entry(obj,type,days){
 if(!obj||obj.type!==type||!recent(obj.date,days))return null;
 const url=validUrl(obj.url,type),title=typographie(text(obj.title,105));
 if(!url||!title)return null;
 if(type==='recall'&&!relevantRecall(obj.distributors,obj.brand))return null;
 const value=Number(obj.change);
 if(type==='price'&&(!Number.isFinite(value)||Math.abs(value)<20))return null;
 return {type,id:text(obj.id||url,220),title,description:typographie(text(obj.description,160)),
  date:obj.date,url,label:text(obj.label,35),change:value,
  scope:type==='recall'?(isU(obj.distributors)?'u':'supplier'):'',
  packaging:text(obj.packaging,80)};
}
function element(tag,cls,content){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(content!=null)e.textContent=content;
 return e;
}
function alertLink(x){
 const a=element('a','iu-dash-alert iu-dash-alert-'+x.type);
 a.href=x.url;a.target='_blank';a.rel='noopener noreferrer';
 const body=element('span','iu-dash-alert-copy');
 body.append(element('strong','',x.title),element('small','',x.description+' · '+frDate(x.date)));
 const tag=x.type==='recall'?(x.scope==='u'?'U':'Fournisseur'):x.type==='price'?
  (x.change>0?'+':'')+x.change.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %':x.label||'Offre réduite';
 a.append(body,element('span','iu-dash-alert-type',typographie(tag)));
 a.setAttribute('aria-label',x.title+' · '+tag+' · Source officielle');
 return a;
}
function unique(items){
 const ids=new Set();
 return items.filter(x=>{
  const id=x.type+':'+x.id;
  if(ids.has(id))return false;
  ids.add(id);return true;
 });
}
function display(data,connected){
 const checks=data.checks&&typeof data.checks==='object'?data.checks:{};
 const supplies=unique([
  ...(Array.isArray(data.supply)?data.supply:[]).map(x=>entry(x,'supply',35)),
  ...(Array.isArray(data.prices)?data.prices:[]).map(x=>entry(x,'price',10))
 ].filter(Boolean)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 const recalls=unique((Array.isArray(data.recalls)?data.recalls:[])
  .map(x=>entry(x,'recall',10)).filter(Boolean))
  .sort((a,b)=>{
   const crate=x=>/\b(caisse|carton|vrac|colis|plateau)\b/i.test(x.packaging)?1:0;
   return crate(b)-crate(a)||Date.parse(b.date)-Date.parse(a.date);
  });
 const lead=recalls[0]||supplies[0]||null;
 if(ui.featured&&ui.featureKicker&&ui.featureTitle&&ui.featureSummary){
  if(lead){
   const dateLabel=frLongDate(lead.date);
   ui.featureTitle.textContent=lead.title;
   ui.featureKicker.textContent=lead.type==='recall'?'':(dateLabel?'• '+dateLabel:'');
   if(lead.type==='recall'){
    // Sous-titre : motif officiel complet, puis date du rappel. Aucun
    // changement artificiel du pluriel « pesticides » dans la source.
    const segments=String(lead.description||'').split(/\s*[·•]\s*/).filter(Boolean);
    const reason=segments.length?segments[segments.length-1]:'Consulter le rappel officiel';
    ui.featureSummary.textContent=typographie(reason)+(dateLabel?' • '+dateLabel:'');
   }else if(lead.type==='price'){
    ui.featureSummary.textContent=(lead.change>0?'+':'')+
     lead.change.toLocaleString('fr-FR',{maximumFractionDigits:1})+' %';
   }else{
    ui.featureSummary.textContent=typographie(lead.description||lead.label||'Voir la source officielle');
   }
   ui.featured.href=lead.url;
   ui.featured.setAttribute('aria-label',ui.featureTitle.textContent+' : consulter la source officielle');
  }else{
   ui.featureKicker.textContent='';
   ui.featureTitle.textContent='Aucune alerte confirmée';
   ui.featureSummary.textContent='Consulte les informations officielles disponibles.';
   ui.featured.href='https://www.franceagrimer.fr/chiffre-et-analyses-economiques/note-de-conjoncture-mensuelle-fruits-legumes-et-pommes-de-terre';
   ui.featured.setAttribute('aria-label','Consulter les informations officielles FranceAgriMer');
  }
 }
 const supplyOK=recent(checks.supply,6)||recent(checks.prices,4);
 const recallOK=recent(checks.recalls,3);
 ui.supplyCount.textContent=supplies.length?String(supplies.length):supplyOK?'0':'—';
 ui.recallCount.textContent=recalls.length?String(recalls.length):recallOK?'0':'—';
 ui.supplyPreview.textContent=supplies.length?
  supplies[0].title+' · '+typographie(supplies[0].label||'Variation du marché'):
  supplyOK?'Aucun signal récent relevé':'Données de marché à vérifier';
 ui.recallPreview.textContent=recalls.length?recalls[0].title:
  recallOK?'Aucun rappel pertinent identifié':'Vérification des distributeurs…';
 alertsLists={supplies,recalls,supplyOK,recallOK,priceOK:recent(checks.prices,4)};
 renderAlertLists();
 /* Horodatage des données, pas de la simple ouverture de l'application.
    Date fournie par la veille publiée ou, si disponible, du contrôle le plus
    récent : ne jamais inventer une heure d'actualisation. */
 const timestamps=[data.generatedAt,checks.recalls,checks.supply,checks.prices]
  .map(value=>Date.parse(String(value||''))).filter(Number.isFinite);
 const latest=timestamps.length?Math.max(...timestamps):NaN;
 if(ui.updated){
  if(Number.isFinite(latest)){
   const date=new Date(latest);
   const localDate=new Intl.DateTimeFormat('fr-FR',{
    day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Paris'
   }).format(date);
   const localTime=new Intl.DateTimeFormat('fr-FR',{
    hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris',hourCycle:'h23'
   }).format(date);
   ui.updated.textContent='Données actualisées le '+localDate+' à '+localTime+'.';
  }else ui.updated.textContent='Date de dernière actualisation indisponible.';
 }
 listCount=supplies.length+recalls.length;
 updateListButton();
}
function cached(){
 try{return JSON.parse(localStorage.getItem(LOCAL)||'null');}catch(_){return null;}
}
function save(data){
 try{localStorage.setItem(LOCAL,JSON.stringify(data));}catch(_){}
}
async function fallback(){
 const url=new URL(API);
 url.searchParams.set('where','sous_categorie_produit = "fruits et légumes"');
 url.searchParams.set('order_by','date_publication DESC');
 url.searchParams.set('limit','100');
 const response=await fetch(url.toString(),{cache:'no-store',mode:'cors'});
 if(!response.ok)throw Error('RappelConso indisponible');
 const json=await response.json();
 if(!Array.isArray(json.results))throw Error('Format inattendu');
 return json.results.filter(x=>x&&recent(x.date_publication,10)&&relevantRecall(x.distributeurs,x.marque_produit))
  .map(x=>({
   type:'recall',id:text(x.numero_fiche||x.rappel_guid||x.id,120),
   title:text(x.libelle||x.modeles_ou_references,105),
   description:text([x.marque_produit,x.risques_encourus||x.motif_rappel].filter(Boolean).join(' · '),160),
   date:x.date_publication,url:validUrl(x.lien_vers_la_fiche_rappel,'recall'),
   distributors:x.distributeurs,brand:x.marque_produit,
   packaging:x.conditionnements,scope:isU(x.distributeurs)?'u':'supplier'
  })).filter(x=>x.url&&x.id&&x.title);
}
let last=0;
async function refresh(){
 if(Date.now()-last<60000)return;
 last=Date.now();
 const previous=cached();
 if(previous)display(previous,false);
 try{
  const r=await fetch('./market-watch.json?fresh='+Math.floor(Date.now()/600000),{cache:'no-store'});
  if(!r.ok)throw Error('veille HTTP '+r.status);
  const data=await r.json();
  if(!data||data.schema!==1||!Array.isArray(data.recalls)||!Array.isArray(data.supply))throw Error('Données invalides');
  data.checks=data.checks||{};
  if(!recent(data.checks.recalls,3)){
   try{data.recalls=await fallback();data.checks.recalls=new Date().toISOString();}catch(_){}
  }
  display(data,true);save(data);
 }catch(_){
  if(!previous)display({supply:[],prices:[],recalls:[],checks:{}},false);
 }
}
refresh();
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&Date.now()-last>20*60000)refresh();
});
})();
