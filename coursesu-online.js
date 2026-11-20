/* Inventaires U v41.23 — test en ligne, distinct des pesées. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),root=$('iuEanAdminPanel'),result=$('iuEanResult');
 if(!root||!result||!window.IUDigiWeight)return;
 const KEY='iu-online-lookup-v1',STATS='iu-online-latencies-v1',STORE='superu-saintgermain';
 const read=(k,alt)=>{try{return JSON.parse(localStorage.getItem(k)||'null')||alt}catch(_){return alt}};
 const endpoint=s=>{try{const u=new URL(String(s||'').trim());return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&!['localhost','www.coursesu.com','api.apify.com'].includes(u.hostname)&&u.href.length<450?u.href:''}catch(_){return ''}};
 const euro=v=>Number(v).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
 const admin=document.createElement('section');
 admin.className='iu-ean-admin-section iu-online-admin';admin.id='iuOnlinePilot';
 admin.innerHTML='<header class="iu-admin-planning-header"><div><h3>Essai · Prix Courses U en direct</h3><p>Une recherche en ligne par scan, avec chronomètre réel.</p></div></header>'+
 '<div class="iu-online-panel"><p>Renseigne l’URL HTTPS de ta passerelle de scraping. Les clés API doivent rester sur le serveur, jamais ici.</p>'+
 '<label for="iuOnlineEndpoint">Service de prix</label><input id="iuOnlineEndpoint" type="url" autocomplete="url" placeholder="https://mon-service.workers.dev/lookup">'+
 '<label class="iu-online-toggle"><input id="iuOnlineEnable" type="checkbox" checked> Vérifier le prix à chaque scan</label>'+
 '<button id="iuOnlineSave" type="button" class="iu-ean-admin-open">Enregistrer le service</button>'+
 '<p id="iuOnlineConfig" role="status">Aucun service configuré.</p><p id="iuOnlineStats">Aucun essai chronométré.</p>'+
 '<small>Seuls les tarifs €/kg confirmés du magasin Saint-Germain sont acceptés. Une estimation ne remplace pas une pesée.</small></div>';
 root.after(admin);
 const output=document.createElement('div');output.id='iuOnlineResult';output.className='iu-online-output';
 output.innerHTML='<div class="iu-online-heading"><strong>Résultat du prix en ligne</strong><span id="iuOnlineTimer">—</span></div>'+
 '<p id="iuOnlineMessage" role="status" aria-live="polite">Scanne un code-barres pour rechercher son prix.</p>'+
 '<div id="iuOnlineFacts" hidden><strong id="iuOnlineName"></strong>'+
 '<dl><div><dt>Prix au kilo</dt><dd id="iuOnlinePrice"></dd></div><div><dt>Montant encodé</dt><dd id="iuOnlineAmount"></dd></div>'+
 '<div><dt>Poids estimé</dt><dd id="iuOnlineWeight"></dd></div></dl><small id="iuOnlineSource"></small></div>';
 result.insertBefore(output,$('iuEanLearn'));
 const url=$('iuOnlineEndpoint'),check=$('iuOnlineEnable'),config=$('iuOnlineConfig'),message=$('iuOnlineMessage'),facts=$('iuOnlineFacts'),timer=$('iuOnlineTimer');
 const saved=read(KEY,{});url.value=endpoint(saved.url);check.checked=saved.enabled!==false;
 if(url.value)config.textContent='Service mémorisé dans cet appareil (aucune clé API).';
 function stats(){const values=read(STATS,[]),ok=values.filter(x=>x.ok),sorted=ok.map(x=>x.ms).sort((a,b)=>a-b),median=sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null;
 $('iuOnlineStats').textContent=values.length?values.length+' tests · '+ok.length+' réussites · médiane réussites '+(median===null?'—':(median/1000).toFixed(2)+' s')+' · dernier '+(values.at(-1).ms/1000).toFixed(2)+' s':'Aucun essai chronométré.';
 }
 function record(ms,ok){const v=read(STATS,[]);v.push({ms:Math.round(ms),ok});try{localStorage.setItem(STATS,JSON.stringify(v.slice(-30)))}catch(_){}stats()}
 stats();
 let serial=0,controller=null;
 function cancel(){serial++;if(controller)controller.abort();controller=null;}
 $('iuOnlineSave').addEventListener('click',()=>{const s=endpoint(url.value);if(!s){config.textContent='Adresse HTTPS invalide ou contenant une clé/paramètre.';return}
  try{localStorage.setItem(KEY,JSON.stringify({url:s,enabled:check.checked}));cancel();config.textContent='Service enregistré : le prochain scan interrogera ce serveur.'}
  catch(_){config.textContent='Configuration non enregistrée : stockage indisponible.'}});
 check.addEventListener('change',()=>{const s=read(KEY,{});if(!endpoint(s.url))return;try{localStorage.setItem(KEY,JSON.stringify({...s,enabled:check.checked}))}catch(_){}if(!check.checked)cancel()});
 function checkPrice(row,request){
  if(row?.type!=='inventaires-u-live-price'||row.verified!==true||row.storeId!==STORE||
   row.eanPrefix!==request.eanPrefix||String(row.plu)!==request.plu||row.pricePerKgUnit!=='EUR/kg')
   throw Error('Correspondance produit, magasin ou prix au kilo non confirmé.');
  const timestamp=Date.parse(row.checkedAt),age=Date.now()-timestamp;
  if(!Number.isFinite(timestamp)||age<0||age>86400000)throw Error('Tarif non daté ou trop ancien.');
  if(typeof row.name!=='string'||!row.name.trim()||row.name.length>160)throw Error('Nom du produit absent.');
  const price=Number(row.pricePerKg),cents=Math.round(price*100);
  if(!Number.isFinite(price)||price<=0||price>999||Math.abs(price*100-cents)>0.000001)throw Error('Prix €/kg invalide.');
  if(row.sourceUrl){try{const p=new URL(row.sourceUrl);if(p.hostname!=='www.coursesu.com'||p.protocol!=='https:')throw 1}catch(_){throw Error('Lien produit invalide.')}}
  return {price,cents,name:row.name.trim(),timestamp};
 }
 async function scan(detail){
  const task=++serial;if(controller)controller.abort();controller=null;
  facts.hidden=true;timer.textContent='—';
  const request={code:String(detail.code||''),eanPrefix:String(detail.eanPrefix||''),plu:String(detail.plu||''),name:String(detail.name||'').slice(0,160)};
  if(detail.blocked){message.textContent='Association article ambiguë : aucun prix demandé.';return}
  if(!/^(?:02|2\d)\d{5}$/.test(request.eanPrefix)||!/^\d{1,8}$/.test(request.plu)){message.textContent='Importe et associe le catalogue DIGI avant cet essai.';return}
  const conf=read(KEY,{}),service=endpoint(conf.url);
  if(!service){message.textContent='Configure d’abord une passerelle de prix dans Administrateur.';return}
  if(conf.enabled===false){message.textContent='Vérification en ligne désactivée.';return}
  if(!navigator.onLine){message.textContent='Pas de réseau : continue avec la pesée classique.';return}
  controller=new AbortController();const active=controller,start=performance.now(),delay=setTimeout(()=>active.abort(),12000);
  message.textContent='Recherche du produit et du prix au kilo…';
  try{
   const response=await fetch(service,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},
    body:JSON.stringify({type:'inventaires-u-price-lookup',storeId:STORE,...request}),signal:active.signal});
   if(task!==serial)return;
   if(!response.ok)throw Error('Service HTTP '+response.status);
   const body=await response.text();if(body.length>12000)throw Error('Réponse trop volumineuse.');
   const data=JSON.parse(body);if(data?.error)throw Error(String(data.error).slice(0,110));
   const item=checkPrice(data,request),ms=performance.now()-start;
   if(task!==serial)return;
   record(ms,true);timer.textContent=(ms/1000).toFixed(2)+' s';
   $('iuOnlineName').textContent=item.name;$('iuOnlinePrice').textContent=euro(item.price)+'/kg';
   const weight=request.code.length===13?window.IUDigiWeight.estimate(request.code,request.eanPrefix,item.cents):null;
   const amount=request.code.length===13?window.IUDigiWeight.amountCents(request.code,request.eanPrefix):null;
   $('iuOnlineAmount').textContent=amount===null?'Code complet nécessaire':euro(amount/100);
   $('iuOnlineWeight').textContent=weight?(weight.grams/1000).toFixed(3).replace('.',',')+' kg (plage '+weight.low+'–'+weight.high+' g)':'Code incompatible ou incomplet';
   $('iuOnlineSource').textContent='Tarif du '+new Date(item.timestamp).toLocaleString('fr-FR')+' · aucune pesée enregistrée';
   facts.hidden=false;message.textContent=weight?'Poids estimé depuis le prix récupéré en direct. À vérifier.':'Tarif trouvé, poids non calculable.';
  }catch(e){
   if(task!==serial)return;
   const ms=performance.now()-start;record(ms,false);timer.textContent=(ms/1000).toFixed(2)+' s';
   message.textContent=(active.signal.aborted?'Délai dépassé (12 s).':'Aucun poids calculé : '+String(e.message||'erreur réseau').slice(0,115))+'. Le scanner OCR reste disponible.';
  }finally{clearTimeout(delay);if(task===serial)controller=null}
 }
 window.addEventListener('iu-ean-code-recognized',e=>{void scan(e.detail||{})});
 $('iuEanClose')?.addEventListener('click',cancel);
})();
