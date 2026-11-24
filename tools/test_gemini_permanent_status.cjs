'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8'),html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('gemini-lab.css','utf8');
const start=js.indexOf(' function setLabelAlert(state,message){'),end=js.indexOf(' function validateResult(result)',start);
const classes=new Set(),light={dataset:{state:'idle'},classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},hidden:true};
const label={textContent:''},camera={dataset:{state:'idle'}},state={active:false,retainedSavedLabel:false,file:null,proposal:null,latestLabelFields:null,lastAnalysisError:null,lastSaveError:null,lastReadProblem:null,lastRawResult:null};
const api=new Function('labelAlert','labelAlertText','cameraShell','state','window','showDetectedIndicator','catalogProposalCurrent','with(state){'+js.slice(start,end)+';return {setLabelAlert,refreshLabelAlert,refreshCameraAlert};}')(light,label,camera,state,{IUWeighScanContext:()=>({tareGrams:100}),IUGeminiDuplicateInfo:()=>({duplicate:false})},()=>{},()=>true);
function expect(type,word){assert.equal(light.dataset.state,type);assert.equal(label.textContent,word);assert.equal(light.hidden,false);assert(label.textContent.split(/\s+/).length<=3);}
api.refreshLabelAlert();expect('idle','Caméra désactivée');
camera.dataset.state='scanning';api.refreshCameraAlert();expect('idle','Caméra active');
state.active=true;api.refreshLabelAlert();expect('working','Analyse…');
state.active=false;state.file={};state.latestLabelFields={weightGrams:1058};state.proposal={ean:'0203476013844',grams:1058,plu:3476};
api.refreshLabelAlert();expect('success','Étiquette prête');assert(light.title.includes('PLU 3476'));
camera.dataset.state='idle';api.refreshCameraAlert();expect('success','Étiquette prête');
for(const [type,msg,result,short] of [['warning','Doublon détecté · validation nécessaire','duplicate','Doublon détecté'],['warning','Lecture non validable · Poids lu sur l’étiquette manquant ou invalide.','warning','Données incertaines'],['warning','Tare trop élevée · change de panier','warning','Tare trop élevée'],['warning','Analyse trop longue · réessaie cette photo','warning','Erreur réseau'],['success','Pesée enregistrée','success','Pesée enregistrée'],['warning','Configure la clé Gemini','warning','Clé Gemini requise']]){api.setLabelAlert(type,msg);expect(result,short);assert.equal(light.title,msg);}
state.file=state.proposal=state.latestLabelFields=null;api.refreshCameraAlert();expect('idle','Caméra désactivée');
const pos=html.indexOf('id="iuGeminiLabelAlert"');assert(html.indexOf('id="iuGeminiCameraShell"')<pos&&pos<html.indexOf('class="iu-result-glow-shell iu-gemini-label-shell"'));assert.equal((html.match(/id="iuGeminiLabelAlert"/g)||[]).length,1);
assert(!html.slice(pos,html.indexOf('</div>',pos)).includes(' hidden'));assert(css.includes('min-height:40px!important'));assert(css.includes('> #iuGeminiLabelAlert.is-duplicate {'));
console.log('OK : indicateur permanent, états courts, diagnostic et caméra, doublon orange.');

const cameraStyle=css.match(/\.calc-card \.iu-gemini-camera-shell\.iu-weigh-scan-inline\s*\{([^}]+)\}/)[1];
const statusStyle=css.slice(css.indexOf('/* v42.78')).match(/> #iuGeminiLabelAlert\.iu-gemini-label-alert\s*\{([^}]+)\}/)[1];
for(const property of ['border','background','box-shadow']){
 const read=s=>s.match(new RegExp('(?:^|[;\\s])'+property+':([^;]+);'))[1].replace(/\\s+/g,'');
 assert.equal(read(statusStyle),read(cameraStyle),'Même '+property+' que le cadre caméra');
}
assert(statusStyle.includes('border-radius:13px!important'));
assert(css.includes('animation:iu-v3559-session-glow 2.25s ease-in-out infinite!important'));
assert(css.includes('--iu-alert-dot:#9caab3')&&css.includes('--iu-alert-dot:#34bd8a')&&css.includes('--iu-alert-dot:#e45465')&&css.includes('--iu-alert-dot:#d9a960'));
const idle=html.match(/<button type="button" id="iuGeminiCameraIdle"[\s\S]*?<\/button>/)[0];
assert(idle.includes('iu-gemini-camera-off-icon')&&idle.includes('fill="#fff"')&&idle.includes('aria-label="Activer la caméra, actuellement désactivée"'));
assert(!idle.includes('>Caméra désactivée<'));
assert(idle.includes('id="iuGeminiLoadingChrome"')&&idle.includes('aria-hidden="true"'));
assert(js.includes("cameraIdle.setAttribute('aria-label','Analyse en cours')")&&!js.includes("if(title)title.textContent='Analyse…';"));
assert(css.includes('width:48px!important;height:48px!important')&&css.includes('#iuGeminiCameraShell[data-state="analyzing"] .iu-gemini-camera-stage > #iuGeminiCameraIdle.iu-gemini-camera-idle > canvas#iuGeminiLoadingChrome'));
console.log('OK : cadre identique, halo partagé, icône blanche et analyse préservée.');

assert(statusStyle.includes('margin:3px 0!important'));
assert(css.includes('> #iuGeminiLabelAlert + .iu-result-glow-shell.iu-gemini-label-shell {\n margin-top:1px!important;'));
assert(css.includes('margin:3px 0 1px!important;'));
assert(css.includes('width:32px!important;height:32px!important;flex:none!important;fill:#fff!important;'));
assert(idle.includes('width="32" height="32"'));
console.log('OK : coins 13 px, marges verticales équilibrées, icône 32 px.');

assert(css.includes(':not(:where(#iuGeminiLabStatus)):not(#iuGeminiOuterChrome)'));
const diagnostic=css.slice(css.indexOf('/* v42.80')).match(/> #iuGeminiLabStatus\.iu-gemini-lab-status:not\(:empty\)\s*\{([^}]+)\}/)[1];
assert(diagnostic.includes('position:absolute!important')&&diagnostic.includes('clip-path:inset(50%)!important'));
console.log('OK : diagnostic hors flux dans tous les états, espace stable.');

const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
assert(section.includes('>SERVICES U / CALCUL AI</span><h2 id="iu-gemini-section-title">Nouvelle pesée AI</h2>'));
assert(section.includes('id="iuGeminiAIChrome"')&&!section.includes('iu-gemini-title-text')&&!section.includes('iu-gemini-brand-mark'));
const resultEnd=section.indexOf('</article>',section.indexOf('id="iuGeminiLabelPanel"'));
assert(resultEnd>0&&section.indexOf('id="iuGeminiRepair"')>resultEnd);
assert(/<div id="iuGeminiRepair"[^>]* hidden>/.test(section));
for(const id of ['iuGeminiRepairField','iuGeminiRepairRead','iuGeminiRepairEdit','iuGeminiRepairManual','iuGeminiRepairValue','iuGeminiRepairApply'])assert.equal((section.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
const repairStyle=css.slice(css.indexOf('/* v42.84')).match(/> #iuGeminiRepair\.iu-gemini-repair\s*\{([^}]+)\}/)[1];
for(const property of ['border','border-radius','background','box-shadow']){
 const read=s=>s.match(new RegExp('(?:^|[;\\s])'+property+':([^;]+);'))[1].replace(/\\s+/g,'');
 assert.equal(read(repairStyle),read(statusStyle));
}
assert(repairStyle.includes('margin:4px 0 3px!important'));
assert(css.includes('> #iuGeminiRepair.iu-gemini-repair[hidden] {\n display:none!important;'));
console.log('OK : identité AI et commandes de correction sous le résultat, surface et marges harmonisées.');

assert(section.includes('class="iu-gemini-ai-logo" width="26" height="26"'));
assert(css.includes('width:32px!important;height:32px!important;min-height:32px!important'));
assert(section.includes('<div class="iu-gemini-repair-select-wrap"><svg class="iu-gemini-repair-chevron"'));
const repairRules=css.slice(css.indexOf('/* v42.85'));
const basketStyle=css.match(/\.iu-gemini-basket-stack > \.iu-basket-select-wrap\.iu-gemini-select-wrap\s*\{([^}]+)\}/)[1];
const nextStyle=css.match(/> \.iu-gemini-gross-row > button#iuGeminiNext\.new-weigh-btn\.iu-gemini-confirm-next\s*\{([^}]+)\}/)[1];
const selectStyle=repairRules.match(/> \.iu-gemini-repair-select-wrap\s*\{([^}]+)\}/)[1];
const buttonsStyle=repairRules.match(/> :is\(button#iuGeminiRepairRead,button#iuGeminiRepairEdit\)\s*\{([^}]+)\}/)[1];
const prop=(s,k)=>s.match(new RegExp('(?:^|[;\\s])'+k+':([^;]+);'))[1].replace(/\\s+/g,'');
for(const k of ['border','border-radius','background-color','background-image','box-shadow','transition']){
 assert.equal(prop(selectStyle,k),prop(basketStyle,k),k+' panier');
 assert.equal(prop(buttonsStyle,k),prop(nextStyle,k),k+' Nouvelle pesée');
}
assert.equal(prop(selectStyle,'height'),prop(buttonsStyle,'height'));
assert(repairRules.includes('appearance:none!important;-webkit-appearance:none!important'));
console.log('OK : pastille 32 px, logo réduit, surfaces exactes et sélection native.');

state.retainedSavedLabel=true;state.latestLabelFields={weightGrams:1058};state.proposal=null;state.file=null;
api.refreshLabelAlert();expect('success','Doublon confirmé');
state.retainedSavedLabel=false;state.latestLabelFields=null;api.refreshLabelAlert();expect('idle','Caméra désactivée');

assert(section.includes('<div class="iu-basket-select-wrap"><select id="iuGeminiBasketSelect"'));
assert(!section.includes('iuGeminiBasketName')&&!section.includes('iuGeminiBasketTare'));
assert(!section.includes('id="iuGeminiCameraShortcut"'));
const classicNative=css.slice(css.indexOf('/* v42.88')).match(/> select#iuGeminiBasketSelect\s*\{([^}]+)\}/)[1];
for(const k of ['border','border-radius','background-color','background-image','box-shadow','transition'])assert.equal(prop(classicNative,k).replace(/\s+/g,''),prop(basketStyle,k).replace(/\s+/g,''));
assert(classicNative.includes('height:60px!important;min-height:60px!important;max-height:60px!important'));
assert(classicNative.includes('opacity:1!important;appearance:auto!important;-webkit-appearance:menulist!important'));
assert(js.includes('Array.from(classicBasket.options,option=>option.cloneNode(true))'));
assert(js.includes("classicBasket.dispatchEvent(new Event('change',{bubbles:true}))"));
console.log('OK : panier natif classique, options et tare synchronisées, accès caméra unique.');

const spacing=css.slice(css.indexOf('/* v42.88'),css.indexOf('/* v42.89'));
assert(spacing.includes('align-items:stretch!important;gap:6px!important'));
assert(spacing.includes('.iu-gemini-scan-row {gap:5px!important;}'));
console.log('OK : espacement optique panier/import réduit, dimensions conservées.');

const last=css.slice(css.indexOf('/* v42.90'));
assert(!css.slice(css.indexOf('/* v42.89')).includes('rgba(255,255,255,.64) 54%'));
assert(last.includes('background:linear-gradient(145deg,#fff 0%,#f8fafb 34%,#e5ebef 100%)'));
assert(section.includes('M3 6L8 11L13 6')&&last.includes('::after {content:none!important;display:none!important;}'));
assert(section.includes('id="iuGeminiRepairApply"><canvas class="iu-weight-light iu-gemini-repair-light"'));
assert(last.includes('padding:14px 16px!important;border:1px solid #dce1e5!important'));
assert(last.includes('border-radius:13px!important;background:#f8f9fa!important'));
assert(last.includes('font-size:16px!important'));
assert(last.includes('box-shadow:0 0 0 3px rgba(101,115,125,.10)!important;outline:none!important'));
assert(last.includes('align-items:stretch!important;gap:8px!important')&&last.includes('align-self:stretch!important'));
assert(last.includes('margin:4px 0 0!important'));
{
 const hooks={},panel={hidden:true},manual={hidden:true},field={value:'ean',addEventListener:(k,f)=>hooks.change=f};
 let focuses=0;
 const input={value:'',focus(){focuses++},select(){}};
 const edit={addEventListener:(k,f)=>hooks.edit=f};
 const state={active:false,file:{},lastRawResult:{},lastReadProblem:'total',repairFocus:null,latestLabelFields:{totalCents:100,weightGrams:504,ean13:'0203476006556'}};
 const start=js.indexOf(' function refreshRepairPanel()'),end=js.indexOf(" repairApply?.addEventListener('click'",start);
 const api=new Function('state','repairPanel','repairManual','repairField','repairValue','repairEdit','fieldForProblem','with(state){'+js.slice(start,end)+';return {refreshRepairPanel};}')(state,panel,manual,field,input,edit,x=>x);
 api.refreshRepairPanel();assert(!panel.hidden&&!manual.hidden);assert.equal(input.value,'1.00');assert.equal(focuses,0);
 field.value='weight';hooks.change();assert.equal(input.value,'0.504');assert(!manual.hidden);
 input.value='0.700';api.refreshRepairPanel();assert.equal(input.value,'0.700');assert.equal(field.value,'weight');
 hooks.edit();assert.equal(focuses,1);assert.equal(input.value,'0.700');
 field.value='ean';hooks.change();assert.equal(input.inputMode,'numeric');
 state.active=true;api.refreshRepairPanel();assert(panel.hidden&&manual.hidden);
 state.active=false;api.refreshRepairPanel();assert(!panel.hidden&&!manual.hidden);assert.equal(input.value,'1.00');
}
console.log('OK : champ visible dès erreur, changement de champ, saisie préservée, aucun focus automatique.');
