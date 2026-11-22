'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

assert(html.includes('<section id="iuGeminiLab" class="card calc-card iu-gemini-standalone"'),
 'La carte Gemini reste sur la page d’accueil');
assert(html.includes('Nouvelle pesée avec Gemini')&&
 html.includes('iu-gemini-star-badge iu-gemini-title-badge'),
 'Titre et pastille Gemini inchangés');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version)&&
 sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version),
 'HTML et service worker rechargent cette version');

const classic=html.slice(html.indexOf('<div aria-live="polite" class="result iu-result-compact">'));
const gemini=html.slice(html.indexOf('<div id="iuGeminiEmptyResult"'),
 html.indexOf('<div id="iuGeminiLabOutput"'));
for(const phrase of ['iu-result-glow-shell','iu-result-glow-field',
 'result iu-result-compact','iu-result-light-field iu-welcome-dot-wave',
 'iu-result-weights','result-heading','net-line','result-subtitle','copy-btn']){
 assert(classic.includes(phrase),'Référence classique manquante : '+phrase);
 assert(gemini.includes(phrase),'Même composant visuel Gemini manquant : '+phrase);
}
assert(gemini.includes('Brut <strong id="iuGeminiGrossDisplay">— kg</strong>')&&
 gemini.includes('Tare <strong id="iuGeminiTareDisplay">— kg</strong>')&&
 gemini.includes('<span>Poids net</span>')&&
 gemini.includes('<strong id="iuGeminiNetDisplay">—</strong>'),
 'Brut, tare et net sont dans un seul bloc présent dès le chargement');
assert(!gemini.includes('aria-hidden="true" class="iu-gemini-empty-result"'),
 'Le résultat initial ne doit plus être masqué aux lecteurs d’écran');
const product=html.slice(html.indexOf('id="iuGeminiProductBar"'),
 html.indexOf('<div class="iu-weigh-entry iu-gemini-weigh-entry">'));
assert(product.includes('hidden')&&product.includes('iuGeminiProductName'),
 'Article affiché seulement après reconnaissance');
assert(html.includes('<div id="iuGeminiLabOutput" class="iu-gemini-lab-result" hidden>'),
 'L’étiquette DIGI ne doit pas être visible avant l’analyse');

const displayStart=js.indexOf('function display(result,wallMs){');
const displayEnd=js.indexOf("analyze.addEventListener('click'",displayStart);
const display=js.slice(displayStart,displayEnd);
assert(display.includes('frame.append(label)')&&display.includes('output.hidden=false'),
 'L’étiquette reconstituée s’affiche automatiquement');
assert(!display.includes("add(output,'div','iu-result-glow-shell'")&&
 !display.includes("add(output,'div','iu-gemini-focus-summary'"),
 'Aucun deuxième résultat de poids ajouté après reconnaissance');
assert(display.includes('refreshResultCard()')&&display.includes('productBar.hidden=false'),
 'Le résultat unique et le nom de l’article sont renseignés lors d’une lecture');
assert(js.includes('function refreshResultCard()')&&
 js.includes('function refreshCorrectedLabel(){\n  refreshResultCard();'),
 'Le changement de panier recalcule brut, tare, net et étiquette');
assert(js.includes('if(productBar)productBar.hidden=true')&&
 js.includes("updateCardState('search')"),
 'Le bouton Suivante rétablit l’affichage de départ sans l’étiquette');
assert(js.includes("nextWeigh?.addEventListener('click'")&&
 js.includes('window.IUGeminiSaveWeigh('),
 'Seule la validation explicite enregistre une pesée');
assert(js.includes('if(cameraStream&&cameraMode===\'auto\')armAutoScanner(true)'),
 'Après validation, le scanner se réarme sur le même flux vidéo');
assert(js.includes('autoNeedsChange=Boolean(autoChangeReference)')&&
 js.includes('autoStableCount>=4&&now-autoStableSince>=650'),
 'Changement de scène et stabilité empêchent les doublons automatiques');
assert(js.includes("track?.readyState==='live'")&&js.includes('video.srcObject=cameraStream;'),
 'Une caméra déjà autorisée est réutilisée, sans rouvrir la permission');
assert(js.includes('function requestContinuousFocus(source)')&&
 js.includes("caps.focusMode.includes('continuous')")&&
 js.includes("requestContinuousFocus(obtained)"),
 'La mise au point continue est demandée si disponible comme dans l’OCR classique');
assert(!js.includes('focusActive')&&!js.includes("document.body.classList.add('iu-gemini-focus')"),
 'Aucun écran spécial ou mode de pesée introduit');
assert(!js.includes('nextWeigh?.scrollIntoView')&&!js.includes('panel.scrollIntoView'),
 'Pas de défilement automatique à chaque pesée');

const cssStart=css.indexOf('/* v41.65 — Le bloc Gemini est nativement compact');
const relevant=css.slice(cssStart);
assert(cssStart>0&&relevant.includes('/* v41.66 — Même composant résultat'),
 'Mise en page intégrée à la carte Gemini');
assert(relevant.includes('#iuGeminiEmptyResult {\n display:block!important;'),
 'Le résultat commun est visible avant le premier scan');
assert(relevant.includes('#iuGeminiProductBar[hidden]')&&
 relevant.includes('display:none!important;'),
 'Le nom d’article disparaît bien après validation');
assert(!relevant.includes('body.iu-gemini-focus')&&
 !relevant.includes('position:fixed!important'),
 'Pas de plein écran ni de mode artificiel');
assert(relevant.includes('order:1!important;')&&relevant.includes('order:2!important;'),
 'L’étiquette complète précède le vrai bouton Valider');
assert(relevant.includes('width:min(100%,310px)!important;')&&
 relevant.includes('aspect-ratio:1372/1088!important;'),
 'Proportions de l’étiquette DIGI et du code-barres conservées');
assert(relevant.includes('order:3!important;')&&
 relevant.includes('#iuGeminiOptions'), 'Options Gemini toujours accessibles');

// Vérification calculatoire sans appel réseau ni caméra.
const a=js.indexOf('function refreshResultCard(){');
const b=js.indexOf("copyNet?.addEventListener('click'",a);
assert(a>0&&b>a,'Fonction d’affichage de poids isolable');
const nodes=Object.fromEntries(['gross','tare','net','hint','copy'].map(n=>[n,{textContent:'',disabled:true,dataset:{}}]));
const context={window:{IUWeighScanContext:()=>({tareGrams:554})},
 latestLabelFields:null,
 resultGross:nodes.gross,resultTare:nodes.tare,resultNet:nodes.net,
 resultHint:nodes.hint,copyNet:nodes.copy,
 formatWeight:g=>(g/1000).toFixed(3).replace('.',',')+' kg',
 Number};
const refresh=vm.runInNewContext(js.slice(a,b)+';refreshResultCard',context);
assert.equal(refresh(),null,'Sans photo le résultat net est indéfini');
assert.equal(nodes.gross.textContent,'— kg');
assert.equal(nodes.tare.textContent,'0,554 kg');
assert.equal(nodes.net.textContent,'—');
assert.equal(nodes.copy.disabled,true);
context.latestLabelFields={weightGrams:1058};
assert.equal(refresh(),504,'1,058 brut - 0,554 tare = 0,504 net');
assert.equal(nodes.gross.textContent,'1,058 kg');
assert.equal(nodes.net.textContent,'0,504');
assert.equal(nodes.copy.disabled,false);
context.window.IUWeighScanContext=()=>({tareGrams:700});
assert.equal(refresh(),358,'Le changement de tare recalcule le net sans photographie');
context.latestLabelFields=null;
assert.equal(refresh(),null,'Nouvelle pesée réinitialise la carte');
assert.equal(nodes.net.textContent,'—');
console.log('Gemini : résultat classique permanent, copie du net, recalcul de tare et scanner continu vérifiés.');
