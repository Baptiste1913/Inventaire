/* V37.79 — Tableau de bord compact : offre France et rappels fournisseurs/U pertinents. */
(function(){
'use strict';
const byId=id=>document.getElementById(id);
if(!byId('iuMarketWidget'))return;
const ui={
 supplyCount:byId('iuSupplyCount'),supplyPreview:byId('iuSupplyPreview'),
 recallCount:byId('iuRecallCount'),recallPreview:byId('iuRecallPreview'),
 supplyList:byId('iuSupplyList'),recallList:byId('iuRecallList'),
 foot:byId('iuMarketFoot'),details:byId('iuMarketDetails'),
 listButton:byId('iuDashListButton'),listLabel:byId('iuDashListLabel'),
 drawer:byId('iuMarketDetailsList'),
 featured:byId('iuDashFeature'),featureKicker:byId('iuDashFeatureKicker'),
 featureTitle:byId('iuDashFeatureTitle'),featureSummary:byId('iuDashFeatureSummary')
};
/* V37.83 — La veille reste disponible sans monopoliser l'écran d'accueil.
   L'ouverture/fermeture est réversible et les éléments masqués sont inertes. */
const homeWatch=byId('iuHomeWatch');
const homeToggle=byId('iuHomeWatchToggle');
const homeReveal=byId('iuHomeWatchReveal');
const homeStatus=byId('iuHomeWatchStatus');
if(homeWatch&&homeToggle&&homeReveal){
 const setHomeWatchOpen=opened=>{
  if(!opened&&homeReveal.contains(document.activeElement))homeToggle.focus();
  homeWatch.classList.toggle('is-open',opened);
  homeToggle.setAttribute('aria-expanded',String(opened));
  homeReveal.setAttribute('aria-hidden',String(!opened));
  if(opened)homeReveal.removeAttribute('inert');
  else homeReveal.setAttribute('inert','');
 };
 homeToggle.addEventListener('click',()=>setHomeWatchOpen(!homeWatch.classList.contains('is-open')));
 setHomeWatchOpen(false);
}
const drawerReady=ui.details&&ui.listButton&&ui.listLabel&&ui.drawer;
let listCount=0;
function updateListButton(){
 if(!drawerReady)return;
 const opened=ui.details.classList.contains('is-open');
 ui.listLabel.textContent=(opened?'Masquer la liste':'Voir la liste')+(listCount?' ('+listCount+')':'');
 ui.listButton.setAttribute('aria-expanded',String(opened));
 ui.drawer.setAttribute('aria-hidden',String(!opened));
 if(opened)ui.drawer.removeAttribute('inert');
 else ui.drawer.setAttribute('inert','');
}
if(drawerReady){
 ui.listButton.addEventListener('click',()=>{
  ui.details.classList.toggle('is-open');
  updateListButton();
 });
 updateListButton();
}
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
   ui.featureKicker.textContent=lead.type==='recall'?'Rappel à vérifier':lead.type==='price'?'Évolution du marché':'Approvisionnement';
   ui.featureTitle.textContent=lead.title;
   ui.featureSummary.textContent=lead.type==='price'?
    ((lead.change>0?'+':'')+lead.change.toLocaleString('fr-FR',{maximumFractionDigits:1})+' % · '+frDate(lead.date)):
    (lead.label||lead.description||'Voir la source')+' · '+frDate(lead.date);
   ui.featured.href=lead.url;
   ui.featured.setAttribute('aria-label',lead.title+' : consulter la source officielle');
  }else{
   ui.featureKicker.textContent='Veille du rayon';
   ui.featureTitle.textContent='Aucune alerte confirmée';
   ui.featureSummary.textContent='Consulte les informations officielles disponibles.';
   ui.featured.href='https://www.franceagrimer.fr/chiffre-et-analyses-economiques/note-de-conjoncture-mensuelle-fruits-legumes-et-pommes-de-terre';
   ui.featured.setAttribute('aria-label','Consulter les informations officielles FranceAgriMer');
  }
 }
 if(homeStatus){
  const count=recalls.length;
  const signals=supplies.length;
  homeStatus.textContent=count?count+' rappel'+(count>1?'s':''):signals?signals+' signal'+(signals>1?'s':''):'Consulter';
  homeStatus.classList.toggle('has-recalls',count>0);
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
 ui.supplyList.replaceChildren();ui.recallList.replaceChildren();
 if(supplies.length)supplies.slice(0,12).forEach(x=>ui.supplyList.append(alertLink(x)));
 else ui.supplyList.append(element('p','iu-dash-empty',
  supplyOK?'Aucun signal récent relevé dans les sources vérifiées.':'Source approvisionnement non actualisée.'));
 if(!recent(checks.prices,4))ui.supplyList.append(element('p','iu-dash-source-note','Cotations de prix indisponibles pour le moment.'));
 if(recalls.length)recalls.slice(0,12).forEach(x=>ui.recallList.append(alertLink(x)));
 else ui.recallList.append(element('p','iu-dash-empty',
  recallOK?'Aucun rappel U ou fournisseur pertinent dans les fiches récentes vérifiées.':'Recherche de rappels non actualisée.'));
 const dates=[checks.supply,checks.recalls].filter(Boolean).map(Date.parse).filter(Number.isFinite);
 const label=dates.length?'Contrôlé le '+frDate(Math.max(...dates)):'Sources officielles';
 const limits=[];
 if(!supplyOK)limits.push('offre à actualiser');
 if(!recallOK)limits.push('rappels à actualiser');
 ui.foot.textContent=label+(limits.length?' · '+limits.join(' · '):' · FranceAgriMer et RappelConso');
 listCount=supplies.length+recalls.length;
 updateListButton();
 if(!connected&&!dates.length)ui.foot.textContent='Connexion nécessaire pour actualiser.';
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
