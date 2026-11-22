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
// v41.83 : sept grandes zones relevées sur une étiquette DIGI complète.
assert(section.includes('id="iuGeminiExactGuide"')&&
 !section.includes('iu-gemini-camera-label-map'),
 'Le repère est toujours le calque léger unique au-dessus de la vidéo');
assert(js.includes("const fullLabel=source.cloneNode(true)")&&
 js.includes("fullLabel.classList.remove('iu-gemini-label-placeholder')")&&
 js.includes("source.parentElement.appendChild(fullLabel)")&&
 js.includes("fullLabel.remove()"),
 'Les proportions proviennent d’une étiquette virtuelle pleine, cachée puis nettoyée');
for(const field of ['CAROTTE','1,99€/kg','0,504 kg','22.11.2026','0203476006556','1,00€']){
 assert(js.includes(field),'Référence DIGI complétée : '+field);
}
const zones=js.match(/^\s*\['(?:store|product|rate|weight|date|barcode|total)',\s*\.[0-9]+,\.[0-9]+,\.[0-9]+,\.[0-9]+\],?$/gm)||[];
assert(zones.length===7,'Exactement sept grands cadres, sans cadres par mot');
for(const kind of ['store','product','rate','weight','date','barcode','total']){
 assert(zones.some(line=>line.includes("'"+kind+"'")),'Zone '+kind+' présente');
}
assert(!js.includes("range.selectNodeContents(element)")&&
 !js.includes("addText('.iu-gemini-label-")&&
 !js.includes("addSample('.iu-gemini-label-"),
 'Les anciens contours autour de chaque mot ont disparu');
assert(js.includes('const scale=Math.min((stage.width-8)/guideSize.width,')&&
 js.includes('(stage.height-8)/guideSize.height);'),
 'Repère uniforme avec marges 4px, sans déformation');
assert(css.includes('.iu-gemini-outline-label > .iu-gemini-outline-rect')&&
 css.includes('background:transparent!important;'),
 'Les cadres sont des contours vides et translucides');
assert(css.includes('background:linear-gradient(145deg,#d9f0ff 0%,#8fcefa 100%)!important'),
 'Flash actif visuellement plus prononcé');
assert((css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length,'CSS équilibré');
console.log('Gemini v41.83 : sept zones DIGI pleine et flash actif plus visible OK.');
