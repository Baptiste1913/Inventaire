'use strict';
// Scanner Gemini intégré à la page d'accueil : résultats compacts et
// étiquette DIGI complète sans clic, validation explicite sous l'étiquette.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

assert(html.includes('<section id="iuGeminiLab"'), 'La carte Gemini reste dans le HTML d’accueil');
assert(html.includes('<h2 id="iu-gemini-section-title">Nouvelle pesée avec Gemini</h2>'),
 'Le titre normal de la carte reste visible');
assert(html.includes('iu-gemini-star-badge iu-gemini-title-badge'), 'La pastille Gemini est conservée');
assert(html.includes('gemini-lab.css?v='+version)&&html.includes('gemini-lab.js?v='+version),
 'Assets du site mis à jour');
assert(sw.includes('gemini-lab.css?v='+version)&&sw.includes('gemini-lab.js?v='+version),
 'Cache PWA mis à jour');

const focusStart=js.indexOf('function enterFocus(){');
const focusEnd=js.indexOf('function selectReadingMode(',focusStart);
const focus=js.slice(focusStart,focusEnd);
assert(focus.includes("document.body.classList.add('iu-gemini-focus')"),
 'Le mode compact est activé à la capture ou à l’import');
assert(focus.includes("document.body.classList.remove('iu-gemini-focus')"),
 'La carte retrouve sa présentation normale à la sortie');
assert(js.includes("updateFocusState('search')")&&js.includes("updateFocusState('working')")&&
 js.includes("updateFocusState(proposal?'review':'retry')"),
 'La recherche, l’analyse et la validation ont des états distincts');

const start=js.indexOf('function display(result,wallMs){');
const end=js.indexOf("analyze.addEventListener('click'",start);
const display=js.slice(start,end);
assert(display.includes("add(output,'div','iu-gemini-focus-summary'"),
 'Résumé compact de la pesée ajouté');
assert(display.includes("addMetric('Brut'")&&display.includes("addMetric('Tare'")&&
 display.includes("addMetric('Net'"), 'Les trois poids restent affichés');
assert(display.includes('frame.append(label)')&&display.includes('output.hidden=false'),
 'L’étiquette virtuelle intégrale apparaît automatiquement après analyse');
assert(js.includes("output.querySelector('.iu-gemini-focus-net-value')"),
 'Le poids net est réactualisé avec le panier');
assert(js.includes('window.IUGeminiSaveWeigh(')&&
 js.includes("nextWeigh?.addEventListener('click'"),
 'Seul un clic valide et enregistre la pesée');
assert(js.includes('if(lastPhotoWasAuto&&proposal&&!focusActive)')&&
 js.includes('if(!focusActive)requestAnimationFrame('),
 'Aucun défilement automatique entre les pesées en mode compact');

const marker='/* v41.64 — Scanner Gemini directement dans la carte';
const pos=css.indexOf(marker);
assert(pos>0,'Nouvelle disposition de la carte d’accueil installée');
const section=css.slice(pos);
assert(!section.includes('position:fixed!important;')&&!section.includes('height:100dvh!important;'),
 'Le scanner ne s’ouvre plus dans une interface plein écran');
assert(!section.includes('overflow:hidden!important;overscroll-behavior:none!important;'),
 'Le défilement normal de la page d’accueil reste autorisé');
assert(section.includes('height:auto!important;')&&section.includes('max-height:none!important;'),
 'Le conteneur n’a plus de hauteur artificielle');
assert(section.includes('#iuQuickDock.iu-quick-dock')&&
 section.includes('display:none!important;'), 'Le dock n’obstrue pas le bouton pendant la lecture');
assert(section.includes('height:48px!important;max-height:48px!important;'),
 'Le viseur est réduit après reconnaissance');
assert(section.includes('min-height:36px!important;')&&section.includes('.iu-gemini-focus-metric-value'),
 'Les blocs Brut/Tare/Net utilisent une faible hauteur');
assert(section.includes('#iuGeminiLabOutput > .iu-result-glow-shell')&&
 section.includes('display:none!important;'),
 'L’ancien grand résultat répété n’encombre plus la carte');
assert(section.includes('order:1!important;')&&section.includes('order:2!important;'),
 'Le résultat et l’étiquette précèdent le bouton de validation');
assert(section.includes('width:min(100%,310px)!important;')&&
 section.includes('aspect-ratio:1372/1088!important;'),
 'L’étiquette complète est visible et conserve ses proportions');
assert(section.includes('height:46px!important;min-height:46px!important;'),
 'Le bouton de validation est plus bas et compact');
assert(section.includes('> .iu-gemini-weigh-entry .weight-field')&&
 section.includes('display:none!important;'),
 'Le champ poids brut dupliqué est masqué mais l’information reste dans le résumé');
assert(section.includes('data-scan-state="error"')&&
 section.includes('.iu-gemini-review-row'), 'Une lecture impossible reste relançable manuellement');
assert(!section.includes('transform:scale('),'Les chiffres du code EAN ne sont pas écrasés');
console.log('Gemini en accueil : caméra compacte, Brut/Tare/Net, étiquette visible, validation en dessous.');
