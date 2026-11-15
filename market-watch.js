/* V37.64 — Veille de marché : uniquement événements vérifiables et récents.
   Les pénuries ne sont jamais inférées d'une variation de prix. */
(function(){
'use strict';
const box=document.getElementById('iuMarketWidget');
const list=document.getElementById('iuMarketList');
const headline=document.getElementById('iuMarketHeadline');
const pill=document.getElementById('iuMarketBadge');
const foot=document.getElementById('iuMarketFoot');
const extra=document.getElementById('iuMarketMore');
const extraList=document.getElementById('iuMarketMoreItems');
if(!box||!list||!headline||!pill||!foot||!extra||!extraList)return;
const DAY=86400000,now=Date.now(),WINDOW=10;
const cacheKey='iu_market_watch_last_verified_v1';
const trustedUrl=(value,type)=>{
 try{
  const url=new URL(value);
  if(url.protocol!=='https:')return null;
  const hosts=type==='recall'?['rappel.conso.gouv.fr']:
   type==='price'?['agridata.ec.europa.eu','rnm.franceagrimer.fr']:
   ['franceagrimer.fr','www.franceagrimer.fr','agriculture.gouv.fr','www.agriculture.gouv.fr','draaf.grand-est.agriculture.gouv.fr'];
  return hosts.includes(url.hostname)?url.href:null;
 }catch(_){return null;}
};
const stamp=x=>{const time=Date.parse(String(x||''));return Number.isFinite(time)?time:NaN;};
const fresh=(x,days=WINDOW)=>{const t=stamp(x);return Number.isFinite(t)&&t<=now+DAY&&t>=now-days*DAY;};
const txt=(x,max=110)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,max);
const status={
 recalls:false,prices:false,shortages:false
};
const node=(tag,cls,value)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(value!=null)el.textContent=value;
 return el;
};
const dateFr=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'';};
function normalize(items,kind){
 if(!Array.isArray(items))return [];
 return items.filter(x=>x&&typeof x==='object'&&x.type===kind&&fresh(x.date,WINDOW)&&trustedUrl(x.url,kind)&&txt(x.title)).map(x=>{
   const url=trustedUrl(x.url,kind);
   const change=Number(x.change);
   if(kind==='price'&&(!Number.isFinite(change)||Math.abs(change)<20))return null;
   return {type:kind,title:txt(x.title,85),desc:txt(x.description,140),date:x.date,
     url,change:kind==='price'?change:0,id:txt(x.id||x.url,220)};
 }).filter(Boolean);
}
function itemView(x){
 const a=node('a','iu-market-item iu-market-item-'+x.type);
 a.href=x.url;a.target='_blank';a.rel='noopener noreferrer';
 const symbol=node('span','iu-market-symbol',x.type==='recall'?'!':x.type==='shortage'?'!':'↗');
 symbol.setAttribute('aria-hidden','true');
 const body=node('span','iu-market-item-copy');
 body.append(node('strong','',x.title),node('small','',x.desc||dateFr(x.date)));
 const chip=node('span','iu-market-chip',
   x.type==='price'?(x.change>0?'+':'')+new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1}).format(x.change)+' %':
   x.type==='recall'?'Rappel':'Pénurie');
 a.append(symbol,body,chip);
 const sr=node('span','iu-market-sr','Ouvrir la source officielle · '+dateFr(x.date));
 a.append(sr);
 return a;
}
function show(data,available){
 list.replaceChildren();extraList.replaceChildren();extra.hidden=true;
 const alerts=[
  ...normalize(data.recalls,'recall'),
  ...normalize(data.shortages,'shortage'),
  ...normalize(data.prices,'price')
 ].sort((a,b)=>{
  const priority={recall:0,shortage:1,price:2};
  return priority[a.type]-priority[b.type]||stamp(b.date)-stamp(a.date);
 });
 // Limiter les doublons de fiches, pas les vraies alertes distinctes.
 const seen=new Set();const items=alerts.filter(x=>{
  const key=x.type+':'+x.id;
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
 const recentChecks=(data.checks&&typeof data.checks==='object')?data.checks:{};
 status.recalls=fresh(recentChecks.recalls,3);
 status.prices=fresh(recentChecks.prices,3);
 status.shortages=fresh(recentChecks.shortages,3);
 if(items.length){
   headline.textContent='À surveiller dans le rayon';
   pill.textContent=items.length+' info'+(items.length>1?'s':'');
   pill.classList.add('has-alerts');
   items.slice(0,2).forEach(x=>list.append(itemView(x)));
   if(items.length>2){
     extra.hidden=false;
     extra.querySelector('summary').textContent='Voir '+(items.length-2)+' autre'+(items.length>3?'s':'')+' information'+(items.length>3?'s':'');
     items.slice(2,10).forEach(x=>extraList.append(itemView(x)));
   }
 }else{
   pill.classList.remove('has-alerts');pill.textContent='Veille';
   headline.textContent='Actualité du rayon';
   let message='Aucune alerte récente confirmée dans les sources vérifiées.';
   if(!status.recalls&&!status.prices)message='Aucune donnée récente vérifiable pour le moment.';
   list.append(node('p','iu-market-empty',message));
 }
 const caveats=[];
 if(!status.recalls)caveats.push('rappels non actualisés');
 if(!status.prices)caveats.push('cours non actualisés');
 if(!status.shortages)caveats.push('pénuries non surveillées');
 foot.textContent=caveats.length?'Vérification limitée : '+caveats.join(' · '):'Sources officielles vérifiées récemment';
 if(!available&&!items.length)foot.textContent='Connexion nécessaire pour actualiser la veille.';
}
function loadLocal(){
 try{return JSON.parse(localStorage.getItem(cacheKey)||'null');}catch(_){return null;}
}
function saveLocal(data){
 try{localStorage.setItem(cacheKey,JSON.stringify(data));}catch(_){}
}
function liveRecalls(){
 const base='https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records';
 const url=new URL(base);
 url.searchParams.set('where','sous_categorie_produit = "fruits et légumes"');
 url.searchParams.set('order_by','date_publication DESC');
 url.searchParams.set('limit','70');
 return fetch(url.toString(),{cache:'no-store',mode:'cors'}).then(r=>{
   if(!r.ok)throw new Error('RappelConso '+r.status);
   return r.json();
 }).then(data=>{
   if(!Array.isArray(data.results))throw new Error('Format RappelConso inattendu');
   const seen=new Set(),result=[];
   for(const row of data.results){
     if(!row||String(row.sous_categorie_produit||'').toLowerCase()!=='fruits et légumes'||!fresh(row.date_publication))continue;
     const id=txt(row.numero_fiche||row.rappel_guid||row.id,120);
     const url=trustedUrl(row.lien_vers_la_fiche_rappel,'recall');
     const title=txt(row.libelle||row.modeles_ou_references,85);
     if(!url||!title||!id||seen.has(id))continue;
     seen.add(id);
     result.push({type:'recall',id,title,
       description:txt([row.marque_produit,row.risques_encourus||row.motif_rappel].filter(Boolean).join(' · '),140),
       date:row.date_publication,url});
   }
   return result;
 });
}
async function load(){
 const local=loadLocal();
 if(local)show(local,false);
 try{
   const resp=await fetch('./market-watch.json?fresh='+Math.floor(Date.now()/600000),{cache:'no-store'});
   if(!resp.ok)throw Error('Fichier de veille indisponible');
   const value=await resp.json();
   if(!value||value.schema!==1||!Array.isArray(value.recalls)||!Array.isArray(value.prices))throw Error('Structure incorrecte');
   const merged={...value,checks:value.checks||{}};
   // Avant la première collecte serveur, essayer l'API publique directement.
   if(!fresh(merged.checks.recalls,3)){
     try{
       merged.recalls=await liveRecalls();
       merged.checks.recalls=new Date().toISOString();
     }catch(_){}
   }
   show(merged,true);saveLocal(merged);
 }catch(_){
   if(!local){
     const data={schema:1,recalls:[],prices:[],shortages:[],checks:{}};
     try{data.recalls=await liveRecalls();data.checks.recalls=new Date().toISOString();show(data,true);saveLocal(data);}
     catch(__){show(data,false);}
   }
 }
}
load();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-now>20*60*1000)load();});
})();
