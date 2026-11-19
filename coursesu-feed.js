/* Inventaires U v40.69 - adaptateur pour flux de prix autorise (pas de scraping Courses U) */
(()=>{
 'use strict';
 const root=document.getElementById('iuCoursesPilot');
 if(!root)return;
 const host=root.querySelector('.iu-courses-body');
 if(!host)return;
 const STORAGE='iu-coursesu-price-pilot-v1',CONFIG='iu-coursesu-authorized-feed-v1';
 const SOURCE_STORE='superu-saintgermain',DAY=86400000;
 const card=document.createElement('section');
 card.className='iu-courses-feed';
 card.innerHTML='<h3>Actualisation des prix au kilo</h3>'+
 '<p>Source autorisée uniquement. Le prix à la pièce ne sera jamais utilisé pour estimer le poids. Aucun prix Courses U n’est extrait directement.</p>'+
 '<label for="iuCoursesFeedUrl">URL HTTPS du flux de prix autorisé</label>'+
 '<input id="iuCoursesFeedUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://exemple.fr/tarifs.json">'+
 '<label class="iu-courses-feed-check"><input type="checkbox" id="iuCoursesFeedAuto">Vérification automatique à l’ouverture (au maximum une fois par jour)</label>'+
 '<div class="iu-courses-feed-actions"><button type="button" id="iuCoursesFeedSave">Enregistrer la source</button><button type="button" id="iuCoursesFeedRefresh">Actualiser</button></div>'+
 '<p id="iuCoursesFeedStatus" role="status" aria-live="polite">Aucun flux de prix autorisé configuré.</p>'+
 '<details><summary>Format JSON accepté</summary><pre>{ "type": "inventaires-u-authorized-prices", "schemaVersion": 1, "storeId": "superu-saintgermain", "updatedAt": "2026-11-18T20:00:00Z", "articles": [ { "plu": "916", "eanPrefix": "2824059", "salesUnit": "piece", "pricePerPiece": 0.54, "pricePerKg": 2.69, "pricePerKgUnit": "EUR/kg" } ] }</pre></details>';
 host.insertBefore(card,host.children[1]||null);
 const $=id=>document.getElementById(id),urlField=$('iuCoursesFeedUrl'),check=$('iuCoursesFeedAuto'),
 status=$('iuCoursesFeedStatus'),saveButton=$('iuCoursesFeedSave'),refreshButton=$('iuCoursesFeedRefresh');
 function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}}
 function validUrl(s){
  try{
   const u=new URL(String(s||'').trim());
   if(u.protocol!=='https:'||u.username||u.password||u.hash||u.hostname==='localhost')return null;
   return u.href;
  }catch(_){return null}
 }
 function cents(value){
  const s=String(value??'').trim().replace(',','.');
  if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(s))return null;
  const n=Math.round(Number(s)*100);
  return n>=1&&n<=99999?n:null;
 }
 function interpret(feed,local){
  if(feed?.type!=='inventaires-u-authorized-prices'||feed.schemaVersion!==1)
   throw Error('Format non reconnu.');
  if(feed.storeId!==SOURCE_STORE)throw Error('Magasin incorrect : mise à jour bloquée.');
  const t=Date.parse(feed.updatedAt);
  if(!Number.isFinite(t)||t>Date.now()||Date.now()-t>DAY)
   throw Error('Le flux doit être daté de moins de 24 heures.');
  if(!Array.isArray(feed.articles)||feed.articles.length>10000)
   throw Error('Liste des articles invalide.');
  const allItems=[...(window.IUEanPrices?.feedItems()||[]),...local.items];
  const byReference=new Map(allItems.map(item=>[item.plu+'|'+item.eanPrefix,item]));
  const used=new Set(),duplicates=new Set(),accepted=[];
  for(const data of feed.articles){
   const key=String(data?.plu??'')+'|'+String(data?.eanPrefix??'');
   if(used.has(key))duplicates.add(key);
   used.add(key);
  }
  let ignored=0,missingKg=0;
  for(const data of feed.articles){
   const plu=String(data?.plu??''),prefix=String(data?.eanPrefix??''),key=plu+'|'+prefix,item=byReference.get(key);
   if(!item||duplicates.has(key)){ignored++;continue}
   const unit=String(data.pricePerKgUnit??'').trim().toLowerCase();
   const value=['eur/kg','€/kg'].includes(unit)?cents(data.pricePerKg):null;
   if(value===null){missingKg++;continue}
   accepted.push({item,value});
  }
  return {accepted,ignored,missingKg,time:t};
 }
 function loaded(){
  const saved=read(STORAGE),local=saved&&Array.isArray(saved.items)?saved:{items:[],prices:{}};
  if(!local.items.length&&!window.IUEanPrices?.feedItems().length)
   throw Error('Importe les tarifs de Saint-Germain ou charge le catalogue DIGI.');
  if(!local.feedPrices||typeof local.feedPrices!=='object'||Array.isArray(local.feedPrices))local.feedPrices={};
  if(!local.prices||typeof local.prices!=='object'||Array.isArray(local.prices))local.prices={};
  return local;
 }
 function apply(feed,local){
  const result=interpret(feed,local);
  const pilotKeys=new Set(local.items.map(item=>item.plu+'|'+item.eanPrefix));
  let done=0,blocked=0;
  for(const entry of result.accepted){
   const prefix=entry.item.eanPrefix,plu=String(entry.item.plu),pilotEntry=local.prices[plu];
   const candidates=[local.feedPrices[prefix],pilotEntry].filter(p=>p?.eanPrefix===prefix&&(!p.plu||p.plu===plu));
   const old=candidates.sort((a,b)=>Number(b.checkedAt||0)-Number(a.checkedAt||0))[0],oldCents=cents(old?.price);
   if(old&&Number(old.checkedAt)>result.time){blocked++;continue}
   if(oldCents!==null&&Math.abs(entry.value-oldCents)/oldCents>0.20){blocked++;continue}
   const history=Array.isArray(old?.history)?old.history.slice(-9):[];
   if(oldCents!==null&&oldCents!==entry.value)
    history.push({price:old.price,checkedAt:old.checkedAt,origin:old.origin||'manual'});
   local.feedPrices[prefix]={plu,eanPrefix:prefix,price:(entry.value/100).toFixed(2),
    confirmed:true,checkedAt:result.time,origin:'authorized-feed',history:history.slice(-10)};
   if(pilotKeys.has(plu+'|'+prefix))local.prices[plu]=local.feedPrices[prefix];
   done++;
  }
  localStorage.setItem(STORAGE,JSON.stringify(local));
  window.dispatchEvent(new Event('iu-coursesu-prices-updated'));
  return done+' tarif(s) en €/kg reçu(s) · '+blocked+' relevé(s) antérieur(s) ou forte(s) variation(s) bloqué(s) · '+
   result.missingKg+' sans prix €/kg · '+result.ignored+' hors correspondance exacte.';
 }
 const conf=read(CONFIG);
 if(validUrl(conf?.url)){urlField.value=conf.url;check.checked=conf.enabled===true}
 let busy=false;
 async function update(auto){
  if(busy)return;
  const cfg=read(CONFIG),endpoint=validUrl(cfg?.url);
  if(!endpoint){status.textContent='Aucun flux autorisé configuré : actualisation automatique indisponible.';return}
  if(auto&&(!cfg.enabled||Date.now()-Number(cfg.lastAttempt||0)<DAY))return;
  try{loaded()}catch(e){status.textContent=e.message;return}
  busy=true;refreshButton.disabled=true;status.textContent='Lecture du flux tarifaire…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   cfg.lastAttempt=Date.now();localStorage.setItem(CONFIG,JSON.stringify(cfg));
   const response=await fetch(endpoint,{mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',
    headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok)throw Error('HTTP '+response.status);
   if(Number(response.headers.get('content-length'))>512000)throw Error('Fichier trop volumineux.');
   const body=await response.text();
   if(body.length>512000)throw Error('Fichier trop volumineux.');
   if(read(CONFIG)?.url!==endpoint)throw Error('La source a changé pendant la lecture.');
   const message=apply(JSON.parse(body),loaded());
   const current=read(CONFIG);if(current?.url===endpoint)localStorage.setItem(CONFIG,JSON.stringify({...current,lastSuccess:Date.now()}));
   status.textContent='Flux accepté : '+message;
  }catch(e){
   status.textContent='Aucun prix modifié : '+String(e?.message||'source inaccessible').slice(0,140)+
    '. Le flux doit être autorisé, au format JSON et accessible par CORS.';
  }finally{clearTimeout(timer);busy=false;refreshButton.disabled=false}
 }
 saveButton.addEventListener('click',()=>{
  const url=validUrl(urlField.value);
  if(!url){status.textContent='Adresse HTTPS invalide (sans identifiant ni mot de passe).';return}
  try{
   const old=read(CONFIG),same=old?.url===url;
   localStorage.setItem(CONFIG,JSON.stringify({url,enabled:check.checked,lastAttempt:same?old.lastAttempt||0:0}));
   status.textContent='Source enregistrée localement. '+(check.checked?'Vérification quotidienne activée.':'Vérification automatique désactivée.');
  }catch(_){status.textContent='Stockage indisponible.'}
 });
 refreshButton.addEventListener('click',()=>{void update(false)});
 $('iuCoursesLoadLocal')?.addEventListener('click',()=>{setTimeout(()=>{void update(true)},300)});
 if(conf?.enabled&&validUrl(conf.url))setTimeout(()=>{void update(true)},500);
})();
