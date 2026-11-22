'use strict';
// v41.70 : la pesée vérifiée est enregistrée par « Nouvelle pesée »,
// le doublon est signalé mais autorisé, une mauvaise tare reste bloquante.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const gemini=fs.readFileSync('gemini-lab.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
const sw=fs.readFileSync('sw.js','utf8');

assert(html.includes('gemini-lab.js?v='+version)&&
 html.includes('app.js?v=41.70')&&sw.includes('app.js?v=41.70'),
 'PWA et application rechargées après modification de la logique de sauvegarde');
assert(html.includes('class="iu-gemini-gross-row"')&&
 html.includes('id="iuGeminiNext" class="new-weigh-btn iu-gemini-confirm-next"')&&
 html.includes('＋<span>Nouvelle<br>pesée</span>'),
 'Même libellé, bouton et icône que Nouvelle pesée classique');
const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),
 html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
const label=section.indexOf('id="iuGeminiLabOutput"');
const alert=section.indexOf('id="iuGeminiLabelAlert"');
const result=section.indexOf('id="iuGeminiEmptyResult"');
assert(label>0&&alert>label&&result>alert,
 'Étiquette numérique > voyant > résultat de pesée');
assert(section.includes('class="iu-gemini-alert-led"')&&
 section.includes('data-state="idle"')&&section.includes('Aucune pesée analysée'),
 'Voyant gris présent avant la première pesée');
assert(!gemini.includes('iu-gemini-label-frame-caption')&&
 !gemini.includes('Aperçu simulé · EAN recalculé non vérifié sur Zebra'),
 'La légende de simulation a été remplacée par les alertes');
assert(css.includes('@keyframes iu-gemini-led-success')&&
 css.includes('@keyframes iu-gemini-led-warning')&&
 css.includes('prefers-reduced-motion:reduce'),
 'Voyants animés en vert/rouge, animations désactivées si nécessaire');

const duplicateStart=app.indexOf('function iuGeminiDuplicate(');
const duplicateEnd=app.indexOf('function renderHistory()',duplicateStart);
assert(duplicateStart>0&&duplicateEnd>duplicateStart,'API de doublon et de sauvegarde isolable');
const past={id:'old',source:'gemini',ean13:'0203476013844',gross:1058,
 tare:554,at:Date.now()-3600000};
const localStore={};
const session={entries:[past]};
const env={
 window:{},baskets:[{id:'b1',name:'Panier normal',tare:554}],
 history:[past],sessions:[session],activeSessionId:'s1',
 $:id=>id==='basketSelect'?{value:'b1'}:null,
 getActiveSession:()=>session,
 uid:()=>String(Math.random()),
 Date,Number,Math,
 SESSION_KEY:'sessions',HISTORY_KEY:'history',
 localStorage:{getItem:k=>localStore[k]??null,removeItem:k=>delete localStore[k]},
 safeSetItem:(k,v)=>{localStore[k]=v;},
 renderHistory:()=>{},renderLiveSessionStats:()=>{},renderBackupSummary:()=>{}
};
vm.runInNewContext(app.slice(duplicateStart,duplicateEnd),env);
assert.equal(env.window.IUGeminiDuplicateInfo({ean13:'0203476013844',gross:1058}).duplicate,true,
 'Doublon signalé avant validation');
const payload={
 gross:1058,pricePerKgCents:199,totalCents:211,
 ean13:'0203476013844',correctedEan13:'0203476006556',
 correctedTotalCents:100,product:'CAROTTE'
};
const once=env.window.IUGeminiSaveWeigh(payload);
assert.equal(once.ok,true,'Un doublon validé est enregistré');
assert.equal(once.duplicate,true,'La réponse précise que la validation est un doublon volontaire');
assert.equal(env.history.length,2,'L’historique reçoit bien le doublon');
assert.equal(session.entries.length,2,'La session reçoit également le doublon');
const twice=env.window.IUGeminiSaveWeigh(payload);
assert.equal(twice.ok,true,'Deux validations volontaires successives sont autorisées');
assert.equal(env.history.length,3);
assert.equal(session.entries.length,3);
env.baskets[0].tare=1100;
const bad=env.window.IUGeminiSaveWeigh(payload);
assert.equal(bad.ok,false,'Tare supérieure au poids : aucun enregistrement');
assert.equal(env.history.length,3,'Mauvaise tare : historique inchangé');
assert.equal(session.entries.length,3,'Mauvaise tare : session inchangée');

const alertStart=gemini.indexOf('function setLabelAlert(state,message){');
const alertEnd=gemini.indexOf('function validateResult(result)',alertStart);
assert(alertStart>0&&alertEnd>alertStart,'Moteur de vigilance disponible');
const light={dataset:{state:'idle'},classList:{toggle(){}}};
const text={textContent:''};
const context={
 labelAlert:light,labelAlertText:text,latestLabelFields:null,
 proposal:null,
 window:{IUWeighScanContext:()=>({tareGrams:554}),
   IUGeminiDuplicateInfo:()=>({duplicate:false})},
 Number
};
const alertFns=vm.runInNewContext(
 gemini.slice(alertStart,alertEnd)+'\n({refreshLabelAlert,setLabelAlert})',
 context);
alertFns.refreshLabelAlert();
assert.equal(light.dataset.state,'idle');
assert.equal(text.textContent,'Aucune pesée analysée');
context.latestLabelFields={weightGrams:1058};
context.proposal={ean:'0203476013844',grams:1058};
alertFns.refreshLabelAlert();
assert.equal(light.dataset.state,'success','Vert si pesée vérifiable et non répétée');
context.window.IUGeminiDuplicateInfo=()=>({duplicate:true});
alertFns.refreshLabelAlert();
assert.equal(light.dataset.state,'warning');
assert(text.textContent.includes('déjà été enregistrée'),'Rouge pour une étiquette déjà enregistrée');
context.window.IUGeminiDuplicateInfo=()=>({duplicate:false});
context.window.IUWeighScanContext=()=>({tareGrams:1100});
alertFns.refreshLabelAlert();
assert.equal(light.dataset.state,'warning','Rouge si mauvaise tare');
assert(text.textContent.includes('Mauvais panier'),'Mauvais panier explicitement signalé');
context.latestLabelFields=null;
context.proposal=null;
alertFns.refreshLabelAlert();
assert.equal(light.dataset.state,'idle','Retour au voyant gris après nouvelle pesée');

const handler=gemini.slice(
 gemini.indexOf("nextWeigh?.addEventListener('click'"),
 gemini.indexOf("openCamera.addEventListener('click'"));
assert(handler.includes('validationState()')&&
 handler.indexOf('validationState()')<handler.indexOf('window.IUGeminiSaveWeigh('),
 'Validation de panier obligatoire avant sauvegarde');
assert(handler.includes('resetReading();')&&
 handler.includes('armAutoScanner(true)'),
 'Le même flux vidéo est prêt pour la pesée suivante');
assert(!handler.includes('else if(saved?.duplicate)'),
 'Aucun blocage des doublons après validation volontaire');
console.log('Gemini v41.70 : étiquette, voyant gris/vert/rouge, doublons acceptés, tare bloquante, bouton Nouvelle pesée OK.');
