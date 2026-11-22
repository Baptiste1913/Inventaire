'use strict';
// v41.68 — cohérence avec les réglages de la pesée classique,
// réglage Auto persistant, choix du panier compact et résultat en 3 lignes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const ocr=fs.readFileSync('weigh-scan-inline.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(html.includes('gemini-lab.css?v='+version)&&html.includes('gemini-lab.js?v='+version) &&
 sw.includes('gemini-lab.css?v='+version)&&sw.includes('gemini-lab.js?v='+version),
 'HTML et Service Worker utilisent la même version');
const sectionStart=html.indexOf('<section id="iuGeminiLab"');
const sectionEnd=html.indexOf('</section>',sectionStart);
const section=html.slice(sectionStart,sectionEnd);
assert(sectionStart>=0&&sectionEnd>sectionStart,'Carte Gemini inchangée');
assert(section.includes('iu-gemini-frame-gradient')&&section.includes('iu-gemini-title-badge'),
 'Double contour et logo Gemini conservés');

const prefs=section.indexOf('class="weigh-preferences iu-gemini-preferences"');
const options=section.indexOf('id="iuGeminiOptions"');
const basket=section.indexOf('id="iuGeminiBasketSelect"');
assert(prefs>=0&&options>prefs&&basket>options,'Réglages Auto/Cloudflare au-dessus du panier');
assert(section.includes('class="weigh-preferences-head iu-gemini-preferences-head"')&&
 section.includes('class="weigh-preferences-title"'),'Mêmes classes de réglages que la pesée classique');
assert(section.includes('type="checkbox" id="iuGeminiAutoToggle" role="switch" checked'),
 'Capture automatique par défaut, interrupteur accessible');
assert(section.includes('Clé privée du pilote Cloudflare')&&
 section.includes('id="iuGeminiSaveKey"')&&section.includes('id="iuGeminiForgetKey"'),
 'Clé Cloudflare modifiable et effaçable dans le même bloc');
assert(section.includes('iu-gemini-basket-stack')&&
 section.includes('id="iuGeminiBasketTare"'),'Tare placée sous le choix de panier');
for(const id of ['iuGeminiCameraShortcut','iuGeminiModePhoto']){
 const p=section.indexOf('id="'+id+'"');
 assert(p>=0&&section.slice(p-120,p+140).includes('iu-weigh-scan-toggle new-weigh-btn'),
 'Bouton utilisant les classes exactes du scanner classique : '+id);
}
assert(!section.includes('id="iuGeminiAutoMode"')&&!section.includes('id="iuGeminiManualMode"'),
 'Les boutons Auto/Manuel ne prennent plus de place sous la caméra');
assert(section.includes('id="iuGeminiAutoScanState"'),'État de capture toujours visible');

const grossRow=section.slice(section.indexOf('<div id="iuGeminiEmptyResult"'),
 section.indexOf('<div id="iuGeminiLabOutput"'));
assert(grossRow.includes('id="iuGeminiGrossDisplay"')&&
 grossRow.includes('id="iuGeminiNext"')&&
 grossRow.includes('Nouvelle<br>pesée'),
 'Rangée brute et bouton conservés et visibles dès l’ouverture');
assert(grossRow.includes('iu-gemini-gross-row')&&grossRow.includes('iu-gemini-gross-panel'),
 'Visuel du brut et bouton conservés');
for(const field of ['iuGeminiProductName','iuGeminiProductRate','iuGeminiNetDisplay','iuGeminiTareDisplay']){
 assert(!section.includes('id="'+field+'"'),'Pas de résultat dupliqué : '+field);
}
assert(!grossRow.includes('iu-result-glow-shell')&&!grossRow.includes('iu-result-compact'),
 'Ancien grand bloc résultat totalement supprimé');
assert(section.indexOf('id="iuGeminiEmptyResult"')<
 section.indexOf('id="iuGeminiLabOutput"')&&
 section.indexOf('id="iuGeminiLabOutput"')<
 section.indexOf('id="iuGeminiLabelAlert"'),
 'Brut et bouton au-dessus de l’étiquette, voyant juste après');
assert(section.includes('class="iu-gemini-alert-led"'),
 'Voyant gris/vert/rouge conservé');
assert(!section.includes('iuGeminiCopyGross')&&!js.includes('copyGross?.addEventListener'),
 'Pas de bouton Copier');
assert(section.includes('<div id="iuGeminiLabOutput" class="iu-gemini-lab-result">')&&
 section.includes('iu-gemini-printed-label iu-gemini-label-placeholder'),
 'Étiquette virtuelle vierge visible dès le lancement');
const displayStart=js.indexOf('function display(result,wallMs){');
const displayEnd=js.indexOf("analyze.addEventListener('click'",displayStart);
const display=js.slice(displayStart,displayEnd);
assert(display.includes('frame.append(label)')&&display.includes('output.hidden=false'),
 'L’étiquette virtuelle complète s’affiche automatiquement après lecture');
assert(display.includes("add(label,'div','iu-gemini-label-name',name)")&&
 display.includes('iu-gemini-label-rate')&&display.includes('iu-gemini-label-gross'),
 'Nom, prix et poids restent entièrement sur l’étiquette virtuelle');
assert(js.includes("nextWeigh?.addEventListener('click'")&&
 js.includes('window.IUGeminiSaveWeigh(')&&
 js.includes("if(cameraStream&&cameraMode==='auto')armAutoScanner(true);"),
 'Validation humaine nécessaire, scanner réarmé sans fermer la caméra');
assert(js.includes('function updateGeminiBasketTare()')&&
 js.includes('geminiTare.textContent=')&&js.includes('copy.textContent='),
 'Panier synchronisé avec la pesée classique et tare affichée séparément');
assert(js.includes("autoToggle?.addEventListener('change'")&&
 js.includes("localStorage.setItem(capturePreferenceKey,next)")&&
 js.includes("selectCameraMode(cameraMode);"),
 'Le mode Auto/Manuel est commandé et mémorisé par le switch');

const styles=css.slice(css.indexOf('/* v41.68 — Réglages Gemini regroupés'));
assert(styles.length>2500,'Styles v41.68 présents');
assert(styles.includes('.iu-gemini-preferences.weigh-preferences')&&
 styles.includes('#iuGeminiOptions.iu-gemini-options'),
 'Panneau commun et options repliables');
assert(styles.includes('input:checked + .iu-gemini-switch-track')&&
 styles.includes('translateX(16px)'),'Interrupteur avec état visuel actif');
assert(styles.includes('height:44px!important')&&styles.includes('border:1px solid #d7e2e9')&&
 styles.includes('border-radius:12px!important')&&styles.includes('linear-gradient(140deg,#fff,#edf3f7)'),
 'Boutons de même taille et style que le Scanner OCR');
assert(styles.includes('.iu-gemini-gross-panel')&&
 styles.includes('font-size:clamp(20px,5.6vw,25px)'),
 'Brut compact mais visible');
const lean=css.slice(css.indexOf('/* v41.71 — suppression de la fiche résultat'));
assert(lean.includes('> #iuGeminiEmptyResult > .iu-gemini-gross-row')&&
 lean.includes('order:0!important')&&lean.includes('order:1!important')&&
 lean.includes('order:2!important'),'Nouvel ordre visuel et espacement compact');
assert(lean.includes('margin:0!important')&&lean.includes('min-height:64px!important'),
 'Rangée optimisée en hauteur');
assert(!styles.includes('position:fixed!important'),'Aucun mode scanner séparé');

const cameraRules=css.slice(css.indexOf('/* v41.67 — Gemini : même géométrie'),
 css.indexOf('/* v41.68 — Réglages Gemini regroupés'));
assert(cameraRules.includes('height:184px!important')&&
 cameraRules.includes('height:160px!important')&&
 cameraRules.includes('inset:52% auto auto 37%!important'),
 'Viseur de même taille et repères que le scanner OCR classique');
assert(ocr.includes('height:184px !important;')&&
 ocr.includes('height:160px !important;'),'Référence caméra OCR présente');

const a=js.indexOf('function refreshResultCard(){');
const b=js.indexOf(' refreshResultCard();',a);
assert(a>0&&b>a,'Rendu du brut isolable');
const nodes={gross:{textContent:''}};
const ctx={
 latestLabelFields:null,
 emptyResult:{classList:{toggle(){}}},
 resultGross:nodes.gross, Number
};
const refresh=vm.runInNewContext(js.slice(a,b)+';refreshResultCard',ctx);
refresh();
assert.equal(nodes.gross.textContent,'—','Poids inconnu avant lecture');
ctx.latestLabelFields={weightGrams:1058};
refresh();
assert.equal(nodes.gross.textContent,'1,058','Poids brut affiché');
ctx.latestLabelFields=null;
refresh();
assert.equal(nodes.gross.textContent,'—','Rangée réinitialisée après validation');
console.log('Gemini v41.71 : rangée brut avant étiquette et alertes, sans fiche redondante, caméra et validation OK.');
