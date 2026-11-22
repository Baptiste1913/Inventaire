'use strict';
// v41.65 — Le scanner compact est la carte Gemini elle-même, pas un mode
// séparé. Reconnaissance et validation manuelle ne doivent pas régresser.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

assert(html.includes('<section id="iuGeminiLab" class="card calc-card iu-gemini-standalone"'),
 'Le scanner reste le bloc Gemini de la page d’accueil');
assert(html.includes('Nouvelle pesée avec Gemini'),'Le titre d’origine est conservé');
assert(!html.includes('id="iuGeminiFocusExit"')&&
 !html.includes('class="iu-gemini-focus-heading"'),
 'Plus de bouton retour ni de titre de sous-page');
assert(html.includes('iu-gemini-star-badge iu-gemini-title-badge'),
 'Pastille Gemini toujours visible');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version),
 'Cache-busting des scripts dans la page');
assert(sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version),
 'Cache-busting cohérent dans le Service Worker');

assert(!js.includes("document.body.classList.add('iu-gemini-focus')")&&
 !js.includes('function enterFocus()')&&!js.includes('function leaveFocus()'),
 'Aucune activation d’un mode d’affichage à chaque scan');
assert(!js.includes('focusActive'),'Aucun état artificiel de mode');
assert(js.includes('function updateCardState(nextState)')&&
 js.includes('panel.dataset.scanState='),
 'Les étapes recherche, analyse et résultat sont internes au bloc');
assert(js.includes("updateCardState('search')")&&
 js.includes("updateCardState('working')")&&
 js.includes("updateCardState(proposal?'review':'retry')"),
 'L’état de la carte reste cohérent avant et après chaque lecture');
assert(js.includes('function scannerCardVisible()')&&
 js.includes('panel.getClientRects().length>0'),
 'Le scanner auto ne tourne pas quand le bloc est masqué');
assert(js.includes("nextWeigh?.addEventListener('click'")&&
 js.includes('window.IUGeminiSaveWeigh('),
 'L’enregistrement reste lié au vrai bouton Valider et suivante');
assert(!js.includes("nextWeigh?.scrollIntoView")&&
 !js.includes("panel.scrollIntoView")&&
 !js.includes("cameraShell.scrollIntoView"),
 'Aucun défilement automatique introduit par le scanner');
const displayStart=js.indexOf('function display(result,wallMs){');
const displayEnd=js.indexOf("analyze.addEventListener('click'",displayStart);
const display=js.slice(displayStart,displayEnd);
assert(display.includes("addMetric('Brut'")&&
 display.includes("addMetric('Tare'")&&display.includes("addMetric('Net'"),
 'Le brut, la tare et le net restent réunis dans une ligne compacte');
assert(display.includes("frame.append(label)")&&display.includes('output.hidden=false'),
 'L’étiquette DIGI complète apparaît automatiquement, sans clic');

const marker='/* v41.65 — Le bloc Gemini est nativement compact';
const index=css.indexOf(marker);
assert(index>0,'Les styles compacts font partie de la carte permanente');
const compact=css.slice(index);
assert(!compact.includes('body.iu-gemini-focus')&&
 !css.includes('html body.iu-gemini-focus'),
 'Les styles ne dépendent plus d’une classe sur la page');
assert(!compact.includes('height:100dvh!important')&&
 !compact.includes('position:fixed!important'),
 'La carte ne se substitue plus à la page entière');
assert(!compact.includes('#iuQuickDock.iu-quick-dock {\n display:none!important'),
 'Le dock principal de l’accueil reste disponible');
assert(compact.includes('min-height:36px!important;')&&
 compact.includes('font-size:12px!important;'),
 'Les chiffres et les blocs Brut/Tare/Net sont moins hauts');
assert(compact.includes('#iuGeminiLabOutput > .iu-result-glow-shell')&&
 compact.includes('display:none!important;'),
 'Le grand panneau de poids redondant est masqué');
assert(compact.includes('width:min(100%,310px)!important;')&&
 compact.includes('aspect-ratio:1372/1088!important;'),
 'L’étiquette reste visible et proportionnée');
assert(compact.includes('height:46px!important;')&&
 compact.includes('.iu-gemini-weigh-entry'),
 'Le bouton Valider est raccourci et placé sous l’étiquette');
assert(compact.includes('order:3!important;')&&
 compact.includes('#iuGeminiOptions'),'Les options Gemini restent accessibles');
assert(compact.includes('scroll-margin-bottom:calc('),
 'Un espace évite que le dock recouvre la validation');
console.log('Scanner Gemini natif : bloc permanent, pas de mode, étiquette et validation préservées.');
