/* Inventaires U v40.69 - prototype prix Courses U, strictement local */
(()=>{
 'use strict';
 const target=document.querySelector('.iu-error-panel');
 if(!target)return;
 const root=document.createElement('section');
 root.id='iuCoursesPilot';root.className='iu-ean-admin-section iu-courses-pilot';
 root.innerHTML='<header class="iu-admin-planning-header"><div><h3>Essai tarifs Courses U</h3><p>10 références · prix au kilo et décodage EAN, sans modifier les pesées.</p></div></header>'+
 '<div class="iu-courses-body"><p class="iu-courses-note">Prototype : les prix ne sont pas récupérés automatiquement. Vérifie la correspondance du produit et le prix au kilo sur le Drive du magasin avant de l’utiliser.</p>'+
 '<button type="button" class="iu-courses-btn iu-courses-main-btn" id="iuCoursesLoadLocal">Utiliser mon catalogue DIGI</button>'+
 '<p id="iuCoursesLoadStatus" class="iu-courses-note" role="status" aria-live="polite">Appuie ici pour charger automatiquement 10 références depuis ton catalogue DIGI déjà importé sur cet appareil.</p>'+
 '<details class="iu-courses-optional-import"><summary>Importer un JSON d’essai (facultatif)</summary><input type="file" id="iuCoursesFile" accept=".json,application/json"></details>'+
 '<p id="iuCoursesSummary" class="iu-courses-summary" role="status">Charge le fichier de test pour commencer.</p><div id="iuCoursesList" class="iu-courses-list"></div>'+
 '<form id="iuCoursesForm" class="iu-courses-form" hidden><label for="iuCoursesEAN">Tester un code-barres DIGI</label>'+
 '<div class="iu-courses-inline"><input id="iuCoursesEAN" type="text" inputmode="numeric" maxlength="13" autocomplete="off" placeholder="2824059003151" required><button type="submit">Estimer le poids</button></div>'+
 '<p id="iuCoursesResult" role="status"></p></form>'+
 '<button id="iuCoursesExport" type="button" class="iu-courses-btn" hidden>Exporter les vérifications</button>'+
 '<p class="iu-courses-note">Aucun prix n’est inventé ou téléchargé automatiquement. Les estimations sont expérimentales ; ne pas les utiliser comme poids mesuré.</p></div>';
 target.before(root);
 const $=id=>document.getElementById(id);
 const key='iu-coursesu-price-pilot-v1',fallback='https://www.coursesu.com/drive-superu-saintgermain';
 const load=()=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};
 const safeUrl=s=>{try{const u=new URL(String(s||''));return u.protocol==='https:'&&u.hostname==='www.coursesu.com'?u.href:''}catch(_){return ''}};
 const parsePrice=s=>{const t=String(s??'').trim().replace(',','.');if(!/^\d{1,3}(\.\d{1,2})?$/.test(t))return null;const n=Math.round(Number(t)*100);return n>=1&&n<=99999?n:null};
 const euro=n=>Number(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
 const kg=n=>Number(n).toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})+' kg';
 const node=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e};
 let items=[],prices={},store=fallback;
 function validate(input){
  if(input?.type!=='inventaires-u-coursesu-pilot'||input.schemaVersion!==1||!Array.isArray(input.items)||input.items.length<1||input.items.length>20)throw Error('Fichier d’essai invalide.');
  const unique=new Set();
  const result=input.items.map(x=>{
   const plu=String(x?.plu||''),prefix=String(x?.eanPrefix||''),name=String(x?.name||'').trim();
   if(!/^\d{1,8}$/.test(plu)||!/^(?:02|2\d)\d{5}$/.test(prefix)||!name||unique.has(prefix))throw Error('PLU, nom ou préfixe EAN invalide ou répété.');
   unique.add(prefix);
   const price=Number(x.ulisPriceAtExport);
   return {plu,eanPrefix:prefix,name:name.slice(0,140),ulisPriceAtExport:Number.isFinite(price)&&price>0&&price<1000?price:null,
    candidate:safeUrl(x.courseUUrlCandidate||x.candidate)};
  });
  return result;
 }
 function save(){
  try{localStorage.setItem(key,JSON.stringify({items,prices,store}));return true}
  catch(_){$('iuCoursesSummary').textContent='Sauvegarde locale impossible : stockage insuffisant.';return false}
 }
 function updateSummary(){
  const count=items.filter(a=>prices[a.plu]?.eanPrefix===a.eanPrefix&&prices[a.plu]?.confirmed).length;
  $('iuCoursesSummary').textContent=items.length+' articles · '+count+' tarif(s) disponibles · '+items.reduce((n,a)=>n+(prices[a.plu]?.origin==='authorized-feed'?1:0),0)+' depuis un flux autorisé.';
 }
 function render(){
  const host=$('iuCoursesList');host.replaceChildren();
  $('iuCoursesForm').hidden=!items.length;$('iuCoursesExport').hidden=!items.length;
  items.forEach(article=>{
   const saved=prices[article.plu]?.eanPrefix===article.eanPrefix?prices[article.plu]:null;
   const box=node('div','iu-courses-product');
   const heading=node('div','iu-courses-heading');heading.append(node('strong','',article.name),node('small','', 'PLU '+article.plu+' · EAN '+article.eanPrefix));
   box.append(heading,node('p','iu-courses-export-price',article.ulisPriceAtExport===null?'Prix Ulis inconnu':'Prix Ulis à l’export : '+euro(article.ulisPriceAtExport)+'/kg (historique)'));
   const link=node('a','iu-courses-link',article.candidate?'Voir une fiche candidate Courses U':'Chercher sur le Drive Saint-Germain');
   link.href=article.candidate||store;link.target='_blank';link.rel='noopener noreferrer';
   box.append(link,node('small','iu-courses-explain',article.candidate?'Fiche candidate à confirmer, pas un rapprochement garanti.':'Aucun lien produit exact confirmé.'));
   const label=node('label','iu-courses-price-label','Prix Courses U constaté (€/kg)');
   const input=node('input');input.type='text';input.inputMode='decimal';input.placeholder='Ex. 2,99';input.autocomplete='off';
   input.value=saved?.price?String(saved.price).replace('.',','):'';
   label.append(input);box.append(label);
   const checklabel=node('label','iu-courses-check');
   const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=!!saved?.confirmed;
   checklabel.append(checkbox,node('span','','Même article et tarif du bon magasin vérifiés'));
   box.append(checklabel);
   const button=node('button','iu-courses-btn','Enregistrer ce tarif');button.type='button';
   const feedback=node('p','iu-courses-feedback',saved?.checkedAt?(saved.origin==='authorized-feed'?'Flux autorisé du ':'Vérifié manuellement le ')+new Date(saved.checkedAt).toLocaleString('fr-FR'):'Pas encore vérifié.');
   button.addEventListener('click',()=>{
    const cents=parsePrice(input.value);
    if(cents===null||!checkbox.checked){feedback.textContent='Vérifie le prix au kilo et coche la confirmation de correspondance.';return}
    const previous=prices[article.plu],history=Array.isArray(previous?.history)?previous.history.slice(-9):[];
    if(previous?.price&&previous.price!==(cents/100).toFixed(2))history.push({price:previous.price,checkedAt:previous.checkedAt,origin:previous.origin||'manual'});
    prices[article.plu]={eanPrefix:article.eanPrefix,price:(cents/100).toFixed(2),confirmed:true,checkedAt:Date.now(),origin:'manual',history:history.slice(-10)};
    if(save()){feedback.textContent='Tarif enregistré sur cet appareil : '+euro(cents/100)+'/kg.';updateSummary()}
   });
   box.append(button,feedback);host.append(box);
  });
  updateSummary();
 }
 const stored=load();
 if(stored&&Array.isArray(stored.items)){
  try{items=validate({type:'inventaires-u-coursesu-pilot',schemaVersion:1,items:stored.items});store=safeUrl(stored.store)||fallback;
   prices=stored.prices&&typeof stored.prices==='object'&&!Array.isArray(stored.prices)?stored.prices:{};render()}
  catch(_){items=[];prices={}}
 }

 // V40.68 : plus de fichier JSON de test à récupérer. Reprendre le catalogue DIGI
 // déjà présent sur cet appareil ; ne jamais importer ni publier son contenu sur GitHub.
 function loadFromDIGI(){
  const info=$('iuCoursesLoadStatus');
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem('iu-plu-catalogue-local-v1')||'null')}
  catch(_){info.textContent='Impossible de lire le catalogue DIGI local.';return}
  let candidates=[];
  if(Array.isArray(raw?.articles)){
   const seen=new Set();
   raw.articles.forEach(rec=>{
    const plu=String(rec?.plu??rec?.PLU??'').trim();
    const name=String(rec?.libelle??rec?.name??rec?.['Libellé']??'').trim();
    const prefix=String(rec?.eanPrefix??rec?.ean_prefix??rec?.Gencod??'').trim();
    const eanPrefix=/^\d{13}$/.test(prefix)&&prefix.endsWith('000000')?prefix.slice(0,7):prefix;
    if(!/^\d{1,8}$/.test(plu)||!/^(?:02|2\d)\d{5}$/.test(eanPrefix)||!name||seen.has(eanPrefix))return;
    seen.add(eanPrefix);
    candidates.push({plu,eanPrefix,name,active:rec.actif===true||rec.actif==='Oui'});
   });
  }
  let usingExamples=false;
  if(!candidates.length){
   usingExamples=true;
   candidates=[
    {plu:'916',eanPrefix:'2824059',name:'Banane Cavendish',active:true},
    {plu:'8325',eanPrefix:'0205655',name:'Courgette',active:true},
    {plu:'9694',eanPrefix:'2412955',name:'Clémentine à feuilles',active:true}
   ];
  }
  const priority=['916','8325','9694','5706','2215'];
  candidates.sort((a,b)=>{
   const pa=priority.indexOf(a.plu),pb=priority.indexOf(b.plu);
   if((pa>=0)!==(pb>=0))return pa>=0?-1:1;
   if(pa>=0&&pb>=0)return pa-pb;
   if(a.active!==b.active)return a.active?-1:1;
   return a.name.localeCompare(b.name,'fr');
  });
  const chosen=candidates.slice(0,10);
  // Retenir les tarifs déjà vérifiés lorsque la même référence revient.
  const nextPrices={};
  chosen.forEach(x=>{
   if(prices[x.plu]?.eanPrefix===x.eanPrefix)nextPrices[x.plu]=prices[x.plu];
  });
  items=validate({type:'inventaires-u-coursesu-pilot',schemaVersion:1,items:chosen});
  prices=nextPrices;store=fallback;
  if(!save())return;
  render();
  info.textContent=usingExamples?
   'Catalogue DIGI non trouvé sur cet appareil : 3 articles exemples chargés. Pour disposer des 10 articles de ton propre catalogue, importe d’abord ton catalogue DIGI dans la rubrique précédente.':
   chosen.length+' articles chargés directement depuis ton catalogue DIGI local. Aucun fichier supplémentaire nécessaire.';
  $('iuCoursesPilot').scrollIntoView({behavior:'smooth',block:'start'});
 }
 $('iuCoursesLoadLocal').addEventListener('click',()=>{
  try{loadFromDIGI()}
  catch(e){$('iuCoursesLoadStatus').textContent='Chargement impossible : '+String(e?.message||'erreur inconnue').slice(0,100)}
 });

 window.addEventListener('iu-coursesu-prices-updated',()=>{
  const fresh=load();
  if(!fresh||!Array.isArray(fresh.items)||!fresh.prices||typeof fresh.prices!=='object')return;
  prices=fresh.prices;render();
 });
 $('iuCoursesFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(file.size>102400){$('iuCoursesSummary').textContent='Fichier trop volumineux.';return}
  try{
   const data=JSON.parse(await file.text()),next=validate(data),old=prices;
   const filtered={};next.forEach(x=>{if(old[x.plu]?.eanPrefix===x.eanPrefix)filtered[x.plu]=old[x.plu]});
   items=next;prices=filtered;store=safeUrl(data.storeUrl)||fallback;
   if(save())render();
  }catch(e){$('iuCoursesSummary').textContent='Import refusé : '+String(e.message||'format inconnu').slice(0,110)}
 });
 function validEAN(code){
  if(!/^\d{13}$/.test(code))return false;
  let sum=0;for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2===0?1:3);
  return (10-sum%10)%10===Number(code[12]);
 }
 function decode(code){
  if(!validEAN(code))return 'EAN-13 invalide : vérifie le code lu.';
  const article=items.find(x=>x.eanPrefix===code.slice(0,7));
  if(!article)return 'Produit absent des dix références du test.';
  const p=prices[article.plu];
  if(!p?.confirmed||p.eanPrefix!==article.eanPrefix||parsePrice(p.price)===null)return article.name+' : prix Courses U non vérifié, poids non estimé.';
  const age=Date.now()-Number(p.checkedAt);
  if(!Number.isFinite(age)||age<0||age>24*3600000)return article.name+' : prix vérifié depuis plus de 24 h, nouvelle vérification nécessaire.';
  const amount=Number(code.slice(7,12))/655.957,price=Number(p.price);
  const euroRounded=Math.round(amount*100)/100;
  const estimated=amount/price,low=Math.max(0,(euroRounded-.005)/price),high=(euroRounded+.005)/price;
  return article.name+' · montant estimé '+euro(euroRounded)+' · '+euro(price)+'/kg · poids estimé '+kg(estimated)+' (intervalle indicatif '+kg(low)+' à '+kg(high)+'). Confirme sur l’étiquette ; aucune pesée ajoutée.';
 }
 $('iuCoursesForm').addEventListener('submit',event=>{
  event.preventDefault();$('iuCoursesResult').textContent=decode($('iuCoursesEAN').value.replace(/[\s-]/g,''));
 });
 $('iuCoursesExport').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({type:'inventaires-u-coursesu-pilot-results',exportedAt:new Date().toISOString(),store,items,prices},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='bilan-test-coursesu.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
})();
