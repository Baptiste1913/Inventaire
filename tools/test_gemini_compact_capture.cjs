'use strict';
// v41.72 — commandes dans le cadre d'étiquette et verrou de la capture.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version)&&
 sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version),
 'Mêmes versions dans HTML et cache PWA');
const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),
 html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
const containerStart=section.indexOf('id="iuGeminiLabelPanel"');
const gross=section.indexOf('id="iuGeminiEmptyResult"');
const label=section.indexOf('id="iuGeminiLabOutput"');
const alert=section.indexOf('id="iuGeminiLabelAlert"');
const end=section.indexOf('</section>');
assert(containerStart>=0&&gross>containerStart&&label>gross&&alert>label,
 'Brut, Nouvelle pesée, étiquette et alerte sont dans le même cadre');
assert(end===-1||end>alert,'Tous les éléments restent dans le cadre Gemini');
assert(section.includes('id="iuGeminiNext"')&&section.includes('Nouvelle<br>pesée'),
 'Nouvelle pesée reste visible sous la caméra');
assert(section.includes('id="iuGeminiCapture"')&&
 section.includes('>Analyser cette étiquette</button>'),
 'Le bouton manuel a le libellé demandé');
assert(!section.includes('Capturer maintenant')&&!section.includes('Capturer cette étiquette'),
 'Aucun ancien libellé de capture');
const rules=css.slice(css.indexOf('/* v41.72 — une SEULE surface'));
assert(rules.length>3000,'Styles du cadre unifié présents');
assert(rules.includes('> #iuGeminiLabelPanel.iu-gemini-label-panel')&&
 rules.includes('> #iuGeminiLabelPanel > #iuGeminiEmptyResult')&&
 rules.includes('> #iuGeminiLabelPanel > #iuGeminiLabOutput:not([hidden])')&&
 rules.includes('> #iuGeminiLabelPanel > #iuGeminiLabelAlert'),
 'Les trois composants utilisent le même cadre extérieur');
assert(rules.includes('width:min(100%,328px)!important')&&
 rules.includes('aspect-ratio:1372/1088!important'),
 'Étiquette DIGI lisible, non miniaturisée');
assert(rules.includes('min-height:41px!important')&&
 rules.includes('data-scan-state="review"')&&
 rules.includes('#iuGeminiCapture:disabled'),
 'Le bouton est visible et tactilement accessible lorsque disponible, même après lecture');

const a=js.indexOf('function refreshCaptureButton(){');
const b=js.indexOf('function updateButton(){',a);
assert(a>0&&b>a,'Gestion du verrou centralisée');
const input={
 frameCaptureBusy:false,localOcrBusy:false,active:false,proposal:null,
 capture:{disabled:true,title:'',attributes:{},
  setAttribute(key,value){this.attributes[key]=value;}}
};
const update=vm.runInNewContext(js.slice(a,b)+';refreshCaptureButton',input);
update();
assert.equal(input.capture.disabled,false,'Au départ, la capture est autorisée');
assert.equal(input.capture.title,'Analyser cette étiquette');
input.frameCaptureBusy=true;update();
assert.equal(input.capture.disabled,true,'Pas de double capture simultanée');
input.frameCaptureBusy=false;input.localOcrBusy=true;update();
assert.equal(input.capture.disabled,true,'Pas de capture pendant l’OCR local');
input.localOcrBusy=false;input.active=true;update();
assert.equal(input.capture.disabled,true,'Pas de capture pendant une requête Gemini');
input.active=false;input.proposal={ean:'0203476013844'};update();
assert.equal(input.capture.disabled,true,'Étiquette reconnue bloquée jusqu’à Nouvelle pesée');
assert(input.capture.title.includes('Nouvelle pesée'),'Le verrou indique comment débloquer');
input.proposal=null;update();
assert.equal(input.capture.disabled,false,'Après enregistrement, la capture est réactivée');
assert.equal(input.capture.attributes['aria-disabled'],'false');
const capture=js.slice(js.indexOf("capture.addEventListener('click'"),
 js.indexOf("document.addEventListener('visibilitychange'",js.indexOf("capture.addEventListener('click'")));
assert(capture.includes('if(frameCaptureBusy||localOcrBusy||active||proposal)return;'),
 'Aucune prise de vue ne démarre pendant l’étiquette courante');
assert(!capture.includes('generation++')&&!capture.includes('abort?.abort()'),
 'Un second clic ne peut plus annuler l’analyse précédente');
assert(js.includes("if(capture)capture.textContent='Analyser cette étiquette'"),
 'Le texte est identique en modes Auto et Manuel');
assert(js.includes("if(saved?.ok){\n   resetReading();"),
 'Après Nouvelle pesée, la lecture est remise à zéro');
assert(js.includes('function resetProposal(){')&&
 js.includes('refreshCaptureButton();'),
 'Le verrou se relâche après réinitialisation');
assert(js.includes("if(!proposal){")&&
 js.includes('Lecture incomplète · reprends l’étiquette'),
 'Une lecture incomplète peut être réanalysée sans blocage permanent');
console.log('Gemini 41.72 : cadre commun, bouton permanent, verrou pendant lecture puis déverrouillage après Nouvelle pesée OK.');
