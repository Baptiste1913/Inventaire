'use strict';
// v41.67 — Gemini : résultat unifié et viseur identique à l'OCR classique.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const ocr=fs.readFileSync('weigh-scan-inline.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

assert(html.includes('<section id="iuGeminiLab" class="card calc-card iu-gemini-standalone"'),
 'Gemini reste dans la carte de la page d’accueil');
assert(html.includes('Nouvelle pesée avec Gemini')&&
 html.includes('iu-gemini-star-badge iu-gemini-title-badge'),
 'Le titre et la pastille Gemini restent intacts');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version)&&
 sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version),
 'Les ressources sont synchronisées avec le cache PWA');
const result=html.slice(html.indexOf('<div id="iuGeminiEmptyResult"'),
 html.indexOf('<div id="iuGeminiLabOutput"'));
const classic=html.slice(html.indexOf('<div aria-live="polite" class="result iu-result-compact">'));
for(const cls of ['iu-result-glow-shell','iu-result-glow-field','result iu-result-compact',
 'iu-result-light-field iu-welcome-dot-wave','iu-result-weights','result-heading','net-line','copy-btn']){
 assert(result.includes(cls),'Même structure de résultat classique : '+cls);
 assert(classic.includes(cls),'Composant classique manquant : '+cls);
}
for(const field of ['iuGeminiProductBar','iuGeminiProductName','iuGeminiProductRate',
 'iuGeminiGrossDisplay','iuGeminiTareDisplay','iuGeminiNetDisplay']){
 assert(result.includes('id="'+field+'"'),field+' doit faire partie du résultat UNIQUE');
 assert(html.split('id="'+field+'"').length===2,'Pas de duplicata : '+field);
}
assert(result.includes('Poids net <strong id="iuGeminiNetDisplay">— kg</strong>')&&
 result.includes('Tare <strong id="iuGeminiTareDisplay">— kg</strong>')&&
 result.includes('Poids brut à vérifier')&&
 result.includes('<strong id="iuGeminiGrossDisplay">—</strong>'),
 'Le brut est privilégié, le net et la tare restent secondaires');
assert(result.includes('id="iuGeminiCopyGross"')&&
 result.includes('id="iuGeminiProductBar"')&&result.includes('hidden'),
 'Nom et prix intégrés au résultat ; la copie concerne le brut');
assert(html.includes('<div id="iuGeminiLabOutput" class="iu-gemini-lab-result" hidden>'),
 'Étiquette invisible tant qu’aucune analyse n’a eu lieu');

const displayStart=js.indexOf('function display(result,wallMs){');
const displayEnd=js.indexOf("analyze.addEventListener('click'",displayStart);
const display=js.slice(displayStart,displayEnd);
assert(display.includes('frame.append(label)')&&display.includes('output.hidden=false'),
 'Étiquette DIGI automatiquement visible après lecture');
assert(!display.includes("add(output,'div','iu-result-glow-shell'")&&
 !display.includes("add(output,'div','iu-gemini-focus-summary'"),
 'Aucun second résultat du poids après lecture');
assert(display.includes('refreshResultCard()')&&display.includes('productBar.hidden=false'),
 'Nom, tarif et poids sont mis à jour dans le panneau commun');
assert(js.includes("nextWeigh?.addEventListener('click'")&&
 js.includes('window.IUGeminiSaveWeigh(')&&
 js.includes('if(cameraStream&&cameraMode===\'auto\')armAutoScanner(true)'),
 'Enregistrement seulement au clic ; reprise automatique après validation');
assert(js.includes('autoNeedsChange=Boolean(autoChangeReference)')&&
 js.includes('autoStableCount>=4&&now-autoStableSince>=650'),
 'Attente du changement d’étiquette pour éviter les doublons');
assert(js.includes('function requestContinuousFocus(source)')&&
 js.includes("requestContinuousFocus(obtained)"),
 'Mise au point continue facultative comme dans l’OCR');
assert(!js.includes('focusActive')&&!js.includes('nextWeigh?.scrollIntoView'),
 'Aucun mode spécial ou scroll forcé');

const index=css.indexOf('/* v41.67 — Gemini : même géométrie');
assert(index>=0,'Styles de cadrage OCR et résultat fusionné présents');
const styles=css.slice(index);
assert(styles.includes('height:184px!important')&&styles.includes('height:160px!important'),
 'Gemini conserve une hauteur de 184px ou 160px sur petit écran à tous les états');
assert(ocr.includes('height:184px !important;')&&ocr.includes('height:160px !important;'),
 'Ces hauteurs sont celles du scanner OCR classique');
assert(styles.includes('inset:52% auto auto 37%!important;')&&
 styles.includes('width:26%!important;')&&styles.includes('height:16%!important;'),
 'Le cadre du poids retrouve exactement les proportions et la place OCR');
assert(ocr.includes('inset:52% auto auto 37% !important;')&&
 ocr.includes('width:26% !important;')&&ocr.includes('height:16% !important;'),
 'Coordonnées confirmées par les CSS originaux OCR');
assert(styles.includes('inset:6% 14% 6%!important;')&&
 styles.includes('opacity:.47!important;'),
 'Gabarit d’étiquette placé comme dans le viseur OCR');
assert(!styles.includes('height:48px!important')&&!styles.includes('height:76px!important'),
 'Plus de rétrécissement après lecture ou pendant analyse');
assert(styles.includes('.net-line.iu-gemini-gross-line')&&
 styles.includes('border-left:3px solid rgba(18,138,133,.88)')&&
 styles.includes('clamp(25px,6.8vw,32px)'),
 'Seul le brut est mis en valeur par contraste, pas par une police énorme');
assert(styles.includes('#iuGeminiProductBar[hidden]'),'Nom masqué avant reconnaissance');

const a=js.indexOf('function refreshResultCard(){');
const b=js.indexOf("copyGross?.addEventListener('click'",a);
assert(a>0&&b>a,'Fonction de calcul du résultat isolable');
const nodes=Object.fromEntries(['gross','tare','net','hint','copy'].map(n=>[n,{textContent:'',disabled:true,dataset:{}}]));
const context={
 window:{IUWeighScanContext:()=>({tareGrams:554})},
 latestLabelFields:null,
 resultGross:nodes.gross,resultTare:nodes.tare,resultNet:nodes.net,
 resultHint:nodes.hint,copyGross:nodes.copy,
 emptyResult:{classList:{toggle(){}}},
 formatWeight:g=>(g/1000).toFixed(3).replace('.',',')+' kg',
 Number
};
const refresh=vm.runInNewContext(js.slice(a,b)+';refreshResultCard',context);
assert.equal(refresh(),null,'Pas de net sans étiquette');
assert.equal(nodes.gross.textContent,'—');
assert.equal(nodes.tare.textContent,'0,554 kg');
assert.equal(nodes.net.textContent,'— kg');
assert.equal(nodes.copy.disabled,true);
context.latestLabelFields={weightGrams:1058};
assert.equal(refresh(),504,'1,058 brut − 0,554 tare = 0,504 net');
assert.equal(nodes.gross.textContent,'1,058');
assert.equal(nodes.net.textContent,'0,504 kg');
assert.equal(nodes.copy.disabled,false,'Copie du brut activée');
assert.equal(nodes.copy.dataset.grams,'1058','La copie conserve le brut');
context.window.IUWeighScanContext=()=>({tareGrams:700});
assert.equal(refresh(),358,'Le net est recalculé quand le panier change');
context.latestLabelFields=null;
assert.equal(refresh(),null,'Nouvelle pesée remet le résultat à zéro');
assert.equal(nodes.gross.textContent,'—');
console.log('Gemini : résultat unique compact, brut souligné, tarifs intégrés, viseur OCR fixe et validation manuelle.');
