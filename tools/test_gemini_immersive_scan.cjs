'use strict';
// Vue Gemini immersive : interaction une-main sans scroll, aperçu DIGI toujours
// visible après reconnaissance, jamais d'enregistrement automatique.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

assert(html.includes('id="iuGeminiFocusExit"'),'Sortie de vue scanner accessible');
assert(html.includes('class="iu-gemini-focus-heading">Scanner Gemini</strong>'),
 'En-tête court, distinct du titre habituel qui reste conservé');
assert(html.includes('<h2 id="iu-gemini-section-title">Nouvelle pesée avec Gemini</h2>'),
 'Titre normal Gemini conservé hors scanner');
assert(html.includes('class="iu-gemini-title-badge"')||
 html.includes('iu-gemini-star-badge iu-gemini-title-badge'),
 'La pastille Gemini colorée reste présente');
assert(html.includes('gemini-lab.css?v='+version)&&html.includes('gemini-lab.js?v='+version),
 'La PWA HTML a les nouveaux cache-busters');
assert(sw.includes('gemini-lab.css?v='+version)&&sw.includes('gemini-lab.js?v='+version),
 'Le service worker a les cache-busters cohérents');

const focusStart=js.indexOf('function enterFocus(){');
const focusEnd=js.indexOf('function selectReadingMode(',focusStart);
assert(focusStart>0&&focusEnd>focusStart,'Cycle de vie de la vue plein écran');
const focus=js.slice(focusStart,focusEnd);
assert(focus.includes("document.body.classList.add('iu-gemini-focus')"),
 "Le mode immersif est activé uniquement à l'ouverture");
assert(focus.includes("document.body.classList.remove('iu-gemini-focus')"),
 "L'utilisateur peut revenir à la page habituelle");
assert(focus.includes('track.enabled=false')&&focus.includes('video.pause()'),
 'Le scanner ne continue pas de filmer lorsque la vue est quittée');
assert(focus.includes("focusExit?.addEventListener('click',leaveFocus)"),
 'Bouton retour branché');
assert(js.includes('enterFocus();')&&js.includes("updateFocusState('working')")&&
 js.includes("updateFocusState(proposal?'review':'retry')")&&
 js.includes("updateFocusState('error')"),
 'Transitions Recherche/Analyse/Résultat/Erreur présentes');
assert(js.includes("updateFocusState('search')"),
 'Après validation, le scanner revient à la recherche');
const displayStart=js.indexOf('function display(result,wallMs){');
const displayEnd=js.indexOf("analyze.addEventListener('click'",displayStart);
const display=js.slice(displayStart,displayEnd);
assert(display.includes("add(output,'div','iu-gemini-focus-summary'"),
 'Résumé compact toujours créé avec les données Gemini');
assert(display.includes("addMetric('Brut'")&&display.includes("addMetric('Tare'")&&
 display.includes("addMetric('Net'"), 'Brut/Tare/Net visibles ensemble');
assert(display.includes("frame.append(label)")&&display.includes('output.hidden=false'),
 'L’étiquette virtuelle complète reste visible par défaut sans clic');
assert(!display.includes('label.hidden=true'),'Ne pas masquer l’étiquette');
assert(js.includes("output.querySelector('.iu-gemini-focus-net-value')"),
 'Le résumé est recalculé en même temps que la tare');
assert(focus.includes('if(cameraStarting){cameraEpoch++;cameraStarting=false;openCamera.disabled=false;}'),
 'Une autorisation caméra encore en attente est annulée si l’utilisateur quitte la vue');
assert(display.includes("updateFocusState(proposal?'review':'retry')"),
 'Une lecture invalide conserve l’étiquette et offre une nouvelle capture');
assert(js.includes('if(lastPhotoWasAuto&&proposal&&!focusActive)')&&
 js.includes('if(!focusActive)requestAnimationFrame('),
 'Les anciens défilements automatiques sont désactivés en mode scanner');
assert(js.includes('window.IUGeminiSaveWeigh(')&&
 js.includes("nextWeigh?.addEventListener('click'"),
 'Une validation explicite est toujours indispensable');
const autoTickStart=js.indexOf('function autoTick(){');
const autoTickEnd=js.indexOf('function selectCameraMode(',autoTickStart);
assert(js.slice(autoTickStart,autoTickEnd).includes('!focusActive'),
 'La détection automatique cesse dès la sortie du scanner');

const immersive=css.slice(css.indexOf('/* v41.63 — Vue « Scanner Gemini »'));
assert(immersive.length>2000,'Styles immersifs installés');
assert(immersive.includes('position:fixed!important;')&&
 immersive.includes('height:100dvh!important;')&&
 immersive.includes('overscroll-behavior:contain!important;'),
 'Véritable surface plein écran, sans défilement de la page');
assert(immersive.includes('#iuQuickDock.iu-quick-dock {display:none!important;}'),
 'La barre de navigation ne masque plus le résultat');
assert(immersive.includes('data-scan-state="review"')&&
 immersive.includes('height:70px!important;max-height:70px!important;'),
 'Le viseur se réduit après lecture');
assert(immersive.includes('.iu-gemini-focus-summary')&&
 immersive.includes('.iu-gemini-focus-metrics'),
 'La vue est reconstruite autour des poids utiles');
assert(immersive.includes('.iu-gemini-label-frame > .iu-gemini-printed-label')&&
 immersive.includes('aspect-ratio:1372/1088!important;'),
 'Les proportions de la maquette DIGI et de son EAN restent intactes');
assert(!immersive.includes('transform:scale('),'Pas de compression CSS des chiffres');
assert(immersive.includes('width:min(100%,306px,calc(100dvh - 448px))'),
 'Étiquette adaptée à la hauteur visible de l’iPhone');
assert(immersive.includes('#iuGeminiNext')&&
 immersive.includes('bottom:calc(env(safe-area-inset-bottom,0px) + 12px)!important;'),
 'Le vrai bouton Valider et suivante est fixé au-dessus de la zone de sécurité');
assert(immersive.includes('position:absolute!important;')&&
 immersive.includes('#iuGeminiLab#iuGeminiLab'),
 'La barre de validation surclasse les anciennes règles position:relative');
assert(immersive.includes('overflow-y:auto!important;'),
 'Les petits écrans peuvent toujours accéder à l’étiquette complète');
console.log('Scanner immersif : caméra, Brut/Tare/Net, étiquette DIGI visible et validation fixe vérifiés.');
