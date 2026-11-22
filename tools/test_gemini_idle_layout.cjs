'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version));
assert(sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version));
const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),
 html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
assert(section.includes('id="iuGeminiCameraShell" class="iu-gemini-camera-shell iu-weigh-scan-inline" data-state="idle"'),
 'Le viseur est ouvert mais ne demande pas la permission caméra');
assert(!section.includes('id="iuGeminiCameraShell" class="iu-gemini-camera-shell iu-weigh-scan-inline" hidden'),
 'Le cadre vidéo n’est plus caché au démarrage');
assert(section.includes('id="iuGeminiCameraIdle"')&&section.includes('Activer la caméra'),
 'Bouton explicite dans le cadre vide, activation volontaire');
assert(section.includes('id="iuGeminiLabOutput" class="iu-gemini-lab-result"')&&
 section.includes('iu-gemini-label-placeholder'),
 'Le modèle d’étiquette vierge apparaît dès le lancement');
assert(section.includes('id="iuGeminiGrossDisplay">—</strong>'),
 'Poids brut vide par défaut');
const blank=section.slice(section.indexOf('iu-gemini-label-placeholder'),section.indexOf('</article>',section.indexOf('iu-gemini-label-placeholder')));
assert(blank.includes('Prix unitaire')&&blank.includes('Poids net')&&blank.includes('Date d’emballage'));
assert(blank.includes('PRIX A PAYER')&&blank.includes('iu-gemini-label-bars'));
assert(!blank.includes('<svg')&&!/\d{13}/.test(blank),'Aucun EAN fictif sur l’étiquette vierge');
assert(js.includes('const blankLabelNodes=Array.from(output?.childNodes||[],node=>node.cloneNode(true))')&&
 js.includes('function showBlankLabel()')&&js.includes('output.replaceChildren(...blankLabelNodes.map(node=>node.cloneNode(true)))'),
 'Le modèle vierge est restitué sans reconstruire de fausses données');
assert(js.includes('function resetReading(){')&&
 js.includes('showBlankLabel();networkTime.textContent='),
 'Nouvelle pesée restaure le modèle vierge');
assert(js.includes('function stopCamera(){')&&js.includes("cameraShell.dataset.state='idle';\n  cameraShell.hidden=false;"),
 'Fermer la caméra laisse le cadre visible sans piste vidéo');
assert(js.includes("cameraIdle?.addEventListener('click',startCamera)")&&
 js.includes("shortcut?.addEventListener('click',()=>{"),
 'La caméra ne démarre que par un appui explicite');
assert(js.includes('if(output.hidden&&!proposal)showBlankLabel();'),
 'Échec de reconnaissance : retrouver une étiquette vierge');
assert(js.includes('if(cameraStream&&cameraMode===\'auto\')armAutoScanner(true)'),
 'L’enchaînement automatique des pesées reste fonctionnel');
const added=css.slice(css.indexOf('/* v41.77 — contour Gemini'));
assert(added.length>2500);
assert(added.includes('inset:.75px!important')&&
 added.includes('border:.5px solid transparent!important'),
 'Double contour Gemini global plus fin');
assert(added.includes('opacity:.45!important'),'Lumières réduites au rôle de détail');
assert(added.includes('.iu-gemini-camera-shell[data-state="idle"] .iu-gemini-camera-stage video')&&
 added.includes('visibility:hidden!important'),'Vidéo cachée tant qu’inactive');
assert(added.includes('.iu-gemini-camera-idle:focus-visible')&&
 added.includes(':not([data-state="idle"]) .iu-gemini-camera-idle'),
 'Bouton de caméra accessible et absent en streaming');
assert(added.includes('.iu-gemini-label-placeholder .iu-gemini-label-bars')&&
 added.includes('background:linear-gradient(180deg,rgba(95,107,117,.10)'),
 'EAN vierge avec guide neutre, sans fausse donnée');
// v41.79 : le gabarit caméra vient du vrai DOM de l'étiquette.
assert(section.includes('id="iuGeminiExactGuide"')&&
 !section.includes('iu-gemini-camera-label-map')&&
 !section.includes('iu-gemini-map-middle'),
 'Plus de repère indépendant aux proportions arbitraires');
assert(js.includes("const source=output.querySelector('.iu-gemini-printed-label.iu-gemini-label-placeholder')")&&
 js.includes('const copy=source.cloneNode(true)')&&
 js.includes('getComputedStyle(sourceNodes[i])')&&
 js.includes("const scale=.88*Math.min((stage.width-18)/guideSize.width,"),
 'Le repère reprend les styles et proportions exacts de l’étiquette imprimée');
assert(css.includes('aspect-ratio:var(--iu-gemini-exact-aspect, 1372 / 1088)!important')&&
 css.includes('.iu-gemini-camera-stage .iu-weigh-scan-guide {\n display:none!important;'),
 'Le viseur conserve le ratio DIGI et retire les faux repères superposés');
// v41.80 : scanner compact, sans aplat ni distorsion de l'étiquette.
assert(css.includes('height:156px!important;')&&css.includes('height:142px!important;'),
 'La caméra est plus basse sur tous les formats iPhone');
assert(js.includes("const scale=.88*Math.min((stage.width-18)/guideSize.width,")&&
 js.includes("(stage.height-18)/guideSize.height);"),
 'Réduction uniforme du repère à 88 % sans déformation');
assert(js.includes("target.style.setProperty('-webkit-text-fill-color','transparent','important')")&&
 js.includes("target.style.setProperty('-webkit-text-stroke','1px rgba(255,255,255,.85)','important')")&&
 js.includes("target.style.setProperty('background','transparent','important')"),
 'Caractères évidés et fonds supprimés sur la copie du modèle DIGI');
assert(js.includes("bar.setAttribute('fill','none')")&&
 js.includes("bar.setAttribute('stroke','rgba(255,255,255,.72)')")&&
 !js.includes("'repeating-linear-gradient(90deg,rgba(255,255,255,.56)"),
 'Les barres de guidage sont des contours et non des barres pleines');
assert((css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length,'CSS équilibré');
console.log('Gemini v41.80 : cadre compact, repère DIGI proportionnel et contours évidés OK.');
