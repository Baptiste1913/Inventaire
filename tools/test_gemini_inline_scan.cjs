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

const result=section.slice(section.indexOf('<div id="iuGeminiEmptyResult"'));
const ids=['iuGeminiProductName','iuGeminiNetDisplay','iuGeminiTareDisplay',
 'iuGeminiProductRate','iuGeminiGrossDisplay'];
for(const id of ids){
 assert(result.includes('id="'+id+'"'),'Champ de résultat : '+id);
 assert(html.split('id="'+id+'"').length===2,'Aucun identifiant dupliqué : '+id);
}
const l1=result.indexOf('id="iuGeminiProductName"');
const l2=result.indexOf('class="iu-gemini-result-facts"');
const l3=result.indexOf('class="iu-gemini-gross-panel"');
assert(l1>0&&l2>l1&&l3>l2,'Article centré, valeurs secondaires, puis brut');
assert(section.indexOf('id="iuGeminiLabOutput"')<
 section.indexOf('id="iuGeminiLabelAlert"')&&
 section.indexOf('id="iuGeminiLabelAlert"')<section.indexOf('id="iuGeminiEmptyResult"'),
 'L’étiquette numérique et le voyant précèdent le résultat');
assert(result.includes('id="iuGeminiNext"')&&result.includes('Nouvelle<br>pesée'),
 'Même bouton Nouvelle pesée à droite du brut');
assert(result.includes('Prix au kilo')&&result.includes('Poids net')&&result.includes('Tare')&&
 result.includes('Poids brut à vérifier'),'Trois lignes de résultat présentes');
assert(result.includes('iu-result-glow-shell')&&result.includes('result iu-result-compact'),
 'Fond, relief et animations du résultat de pesée classique conservés');
assert(!result.includes('copy-btn')&&!section.includes('iuGeminiCopyGross')&&
 !js.includes('copyGross?.addEventListener'),'Le bouton Copier a entièrement disparu');
assert(section.includes('<div id="iuGeminiLabOutput" class="iu-gemini-lab-result" hidden>'),
 'Étiquette virtuelle initialement cachée');
const displayStart=js.indexOf('function display(result,wallMs){');
const displayEnd=js.indexOf("analyze.addEventListener('click'",displayStart);
const display=js.slice(displayStart,displayEnd);
assert(display.includes('frame.append(label)')&&display.includes('output.hidden=false')&&
 display.includes("productName.textContent=name"),
 'Le produit et son étiquette s’affichent automatiquement après lecture');
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
assert(styles.includes('.iu-gemini-result-facts')&&styles.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),
 'Trois valeurs alignées sur la deuxième ligne');
assert(styles.includes('#iuGeminiProductBar')&&styles.includes('text-align:center!important'),
 'Nom centré en première ligne');
assert(styles.includes('.iu-gemini-gross-panel')&&styles.includes('font-size:clamp(20px,5.6vw,25px)'),
 'Brut contrasté en dernière ligne, sans typographie excessive');
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
assert(a>0&&b>a,'Calcul brut / tare / net isolable');
const nodes=Object.fromEntries(['gross','tare','net','hint'].map(n=>[n,{textContent:''}]));
const ctx={
 window:{IUWeighScanContext:()=>({tareGrams:554})},
 latestLabelFields:null,emptyResult:{classList:{toggle(){}}},
 resultGross:nodes.gross,resultTare:nodes.tare,
 resultNet:nodes.net,resultHint:nodes.hint,
 formatWeight:g=>(g/1000).toFixed(3).replace('.',',')+' kg',Number
};
const refresh=vm.runInNewContext(js.slice(a,b)+';refreshResultCard',ctx);
assert.equal(refresh(),null,'Brut inconnu avant lecture');
assert.equal(nodes.tare.textContent,'0,554 kg');
ctx.latestLabelFields={weightGrams:1058};
assert.equal(refresh(),504,'Brut 1,058 - tare 0,554 = net 0,504');
assert.equal(nodes.gross.textContent,'1,058');
assert.equal(nodes.net.textContent,'0,504 kg');
ctx.window.IUWeighScanContext=()=>({tareGrams:700});
assert.equal(refresh(),358,'Changement du panier recalculé');
console.log('Gemini v41.68 : réglages et switch, panier compact, résultat 3 lignes, caméra OCR et validation OK.');
