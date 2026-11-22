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
const outlineZone=(name)=>{
 const match=js.match(new RegExp("\\['"+name+"'\\s*,\\s*([.0-9]+),\\s*([.0-9]+),\\s*([.0-9]+),\\s*([.0-9]+)\\]"));
 assert(match,'Zone DIGI présente : '+name);
 return match.slice(1).map(Number);
};
const [barcodeX,barcodeY,barcodeW,barcodeH]=outlineZone('barcode');
const [totalX,totalY,totalW,totalH]=outlineZone('total');
assert(barcodeY===totalY&&barcodeH===totalH,
 'Le code-barres a exactement la hauteur et le bas du prix à payer');
for(const kind of ['rate','weight','date']){
 const [, ,w,h]=outlineZone(kind);
 const originals={rate:[.266,.187],weight:[.269,.187],date:[.299,.187]};
 assert(Math.abs(w/originals[kind][0]-.67)<.008&&
  Math.abs(h/originals[kind][1]-.67)<.008,
  kind+' réduit de 33 % sur les deux axes');
}
const [productX,productY,productW,productH]=outlineZone('product');
assert(Math.abs(productW/.895-.85)<.005&&
 Math.abs(productH/.183-.85)<.005,'Libellé réduit de 15 %');
assert(Math.abs((productX+productW/2)-(.058+.895/2))<.003&&
 Math.abs((productY+productH/2)-(.271+.183/2))<.003,
 'Libellé toujours centré dans son ancienne zone');
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
// v41.86 : mêmes dimensions et recadrage que le scanner OCR classique.
const classicCss=require('node:fs').readFileSync('weigh-scan-inline.css','utf8');
const cameraMatch=css.slice(css.indexOf('/* v41.86 — Mêmes dimensions'));
assert(cameraMatch.length>1200,'Correctif OCR chargé en fin de feuille Gemini');
assert(classicCss.includes('height:184px !important')&&
 classicCss.includes('height:160px !important'),
 'Le scanner OCR utilise effectivement les hauteurs 184 et 160 pixels');
assert(cameraMatch.includes('height:184px!important')&&
 cameraMatch.includes('height:160px!important')&&
 cameraMatch.includes('max-height:160px!important'),
 'Même hauteur de caméra que l’OCR classique en standard et sur iPhone');
assert(classicCss.includes('border-radius:16px !important')&&
 cameraMatch.includes('border-radius:16px!important'),
 'Même rayon des coins que la fenêtre OCR');
assert(cameraMatch.includes('width:100%!important')&&
 cameraMatch.includes('padding:9px!important')&&
 cameraMatch.includes('padding:8px!important')&&
 cameraMatch.includes('margin:0!important'),
 'Largeur et marges intérieures calquées sur l’OCR classique');
assert(cameraMatch.includes('aspect-ratio:auto!important')&&
 !cameraMatch.includes('width:calc(100% + 12px)')&&
 !cameraMatch.includes('aspect-ratio:var(--iu-gemini-exact-aspect'),
 'Fin de la caméra forcée au ratio DIGI et du débordement artificiel');
assert(cameraMatch.includes('video#iuGeminiVideo')&&
 cameraMatch.includes('object-fit:cover!important')&&
 cameraMatch.includes('object-position:center center!important'),
 'Caméra cadrée et remplie comme le flux de l’OCR classique');
assert(html.includes('gemini-lab.css?v='+version)&&
 html.includes('gemini-lab.js?v='+version)&&
 sw.includes('gemini-lab.css?v='+version)&&
 sw.includes('gemini-lab.js?v='+version),
 'Les ressources Gemini suivent bien la version PWA active');
// v41.87 — le même moteur Canvas anime le contour OCR et Gemini.
const lightEngine=require('node:fs').readFileSync('weigh-light.js','utf8');
assert(section.includes('class="iu-weight-light iu-gemini-outline-light"')&&
 section.includes('id="iuGeminiExactGuide"'),
 'Canvas de lumière permanent à l’intérieur du repère DIGI');
assert(lightEngine.includes("overlay.id==='iuGeminiCameraShell'")&&
 lightEngine.includes("?'.iu-gemini-camera-exact-guide':'.iu-weigh-scan-guide'")&&
 lightEngine.includes('function drawRibbon(')&&
 lightEngine.includes('function illuminate('),
 'Un seul moteur de filaments nacrés partagé par le poids OCR et l’étiquette IA');
assert(lightEngine.includes("overlay.dataset.state==='scanning'")&&
 lightEngine.includes('reduceMotion?.matches'),
 'Animation conditionnée à la caméra active et aux préférences de mouvement');
assert(js.includes("const outlineLight=exactGuide.querySelector('.iu-gemini-outline-light')")&&
 js.includes('exactGuide.replaceChildren(guideSnapshot,outlineLight)'),
 'Le Canvas n’est pas détruit lors du rafraîchissement du gabarit');
assert(css.includes('/* v41.87 — Filaments nacrés')&&
 css.includes('canvas.iu-gemini-outline-light')&&
 css.includes('inset:-6px!important')&&
 css.includes('pointer-events:none!important'),
 'Canvas Retina transparent et sans interaction posé sur le contour extérieur');
assert(html.includes('weigh-light.js?v='+version)&&
 sw.includes('weigh-light.js?v='+version),
 'Nouveau moteur lumineux rechargé en PWA et en Safari');
// v41.89 — retour au trait initial et contraste renforcé avec les
// quatre couleurs EXACTES du contour du bloc de pesée Gemini.
assert(lightEngine.includes('const contourBoost=0;')&&
 lightEngine.includes('ctx.lineWidth=widthPx+contourBoost')&&
 (lightEngine.match(/\(widthPx\+contourBoost\)\*p\.envelope\/2/g)||[]).length===2,
 'Épaisseur d’origine restaurée sur les filaments et les rubans');
assert(lightEngine.includes('config.opacity*(isGemini?.69:.27)')&&
 lightEngine.includes('config.opacity*(isGemini?.95:.81)')&&
 lightEngine.includes('isGemini?3.1:2.3'),
 'Couleurs Gemini plus intenses avec la largeur du trait inchangée');
for(const color of ['#ed4d55','#f9c017','#0cb768','#3287fe']){
 assert(css.includes(color),'Couleur du bloc principal présente dans la feuille : '+color);
 assert(lightEngine.includes("tint:'"+color+"'"),
  'Contour animé utilise la même teinte exacte que le bloc : '+color);
}
assert(!lightEngine.includes("tint:'#9769d5'")&&
 !lightEngine.includes("tint:'#e66bb8'"),
 'Anciennes teintes violette et rose abandonnées');
assert(lightEngine.includes("tint:'#44d4ae'")&&
 lightEngine.includes("tint:'#c4315b'")&&
 lightEngine.includes('   return;\n  }\n  // Reflets bleu, émeraude et rubis'),
 'Moteur OCR classique conservé derrière la branche dédiée Gemini');
// v41.90 : en-tête Gemini strictement aligné sur le bloc Calcul.
assert(section.includes('<span class="section-kicker">SERVICE U / PESÉE VIA IA</span>')&&
 section.includes('<h2 id="iu-gemini-section-title">Nouvelle pesée via Gemini</h2>'),
 'Les deux nouveaux titres Gemini sont exacts');
assert(html.includes('<span class="section-kicker">SERVICES U / CALCUL</span><h2 id="calc-title">Nouvelle pesée</h2>'),
 'L’en-tête du calcul classique reste inchangé');
const headingCss=css.slice(css.indexOf('/* v41.90 — même hiérarchie'));
assert(headingCss.length>1000&&headingCss.includes('margin:0 0 20px!important')&&
 headingCss.includes('gap:4px!important'),
 'Marges verticales et espacement identiques aux titres Calcul');
assert(headingCss.includes('font-size:10.5px!important')&&
 headingCss.includes('color:#73818a!important')&&
 headingCss.includes('-webkit-text-fill-color:#73818a!important')&&
 headingCss.includes('white-space:nowrap!important')&&
 headingCss.includes('max-width:100%!important'),
 'Service U / Pesée via IA sur une ligne avec la taille et teinte du Calcul');
assert(headingCss.includes('font-size:17px!important')&&
 headingCss.includes('font-size:16px!important')&&
 headingCss.includes('color:#20252b!important')&&
 headingCss.includes('letter-spacing:-.45px!important'),
 'Titre principal Gemini calqué sur Nouvelle pesée, y compris petit écran');
// v41.91 : capture exclusivement manuelle et tiroir Cloudflare natif.
assert(!section.includes('id="iuGeminiAutoToggle"')&&
 !section.includes('class="weigh-preferences iu-gemini-preferences"')&&
 !section.includes('id="iuGeminiAutoReset"'),
 'Choix Auto et cadre de réglages disparus du bloc Gemini');
assert(section.includes('id="iuGeminiOptions" class="v22-settings calc-alerts weigh-preferences-alerts iu-gemini-options"')&&
 section.indexOf('id="iuGeminiOptions"')>section.indexOf('id="iu-gemini-section-title"')&&
 section.indexOf('id="iuGeminiOptions"')<section.indexOf('id="iuGeminiBasketSelect"'),
 'Accès Cloudflare remonté entre titre et panier');
assert(section.includes('La caméra ne prend aucune photo automatiquement')&&
 section.includes('id="iuGeminiPilotKey"')&&section.includes('id="iuGeminiForgetKey"'),
 'Description exacte du mode manuel et gestion clé préservées');
assert(js.includes("let cameraMode='manual',autoTimer=0")&&
 js.includes('function selectCameraMode(){')&&js.includes("cameraMode='manual';")&&
 js.includes('selectCameraMode();')&&!js.includes('iu-gemini-auto-capture-v1')&&
 !js.includes("autoToggle?.addEventListener('change'"),
 'Préférence Auto historique ignorée et capture manuelle forcée');
assert(js.includes("capture.addEventListener('click',async()=>{")&&
 js.includes('const used=setPhoto(new File([blob]')&&js.includes('if(!analyze.disabled){'),
 'La prise de photo et l’analyse restent déclenchées volontairement');
const cloudCss=css.slice(css.indexOf('/* v41.91 — Cloudflare'));
assert(cloudCss.length>1700&&cloudCss.includes('margin-bottom:20px!important')&&
 cloudCss.includes('margin:0 0 16px!important')&&cloudCss.includes('order:0!important')&&
 cloudCss.includes('min-height:49px!important')&&cloudCss.includes('border-radius:14px!important')&&
 cloudCss.includes('font-size:12px!important')&&cloudCss.includes('font-size:10.5px!important'),
 'Cloudflare partage les dimensions/typographies et marges des alertes classiques');
// v41.92 : panier Gemini rendu comme le panier classique.
assert(section.includes('for="iuGeminiBasketSelect">Type de panier</label>')&&
 section.includes('class="iu-basket-select-wrap iu-gemini-select-wrap"')&&
 section.includes('class="iu-gemini-basket-display" aria-hidden="true"')&&
 section.includes('id="iuGeminiBasketName"')&&
 section.includes('id="iuGeminiBasketTare"'),
 'Nom et tare réunis dans le champ, avec select natif conservé');
assert(!section.includes('id="iuGeminiBasketTare" class="iu-gemini-basket-tare" aria-live'),
 'Ancienne tare séparée du champ supprimée');
assert(js.includes("geminiName=$('iuGeminiBasketName')")&&
 js.includes("geminiTare=$('iuGeminiBasketTare')")&&
 js.includes("const selected=geminiBasket?.selectedOptions?.[0]")&&
 js.includes('geminiName.textContent=name')&&
 js.includes('geminiTare.textContent=tare')&&
 js.includes("classicBasket.dispatchEvent(new Event('change',{bubbles:true}))"),
 'Nom et tare synchronisés au panier choisi, sans modifier les calculs');
const basketStyles=css.slice(css.indexOf('/* v41.92 — Panier Gemini'));
assert(basketStyles.length>4000&&
 basketStyles.includes('height:60px!important')&&
 basketStyles.includes('height:56px!important')&&
 basketStyles.includes('gap:11px!important')&&
 basketStyles.includes('gap:8px!important')&&
 basketStyles.includes('border-radius:18px!important')&&
 basketStyles.includes('font-size:clamp(14px,3.7vw,17px)!important'),
 'Hauteurs, dimensions, espacements et typographies du panier OCR classique');
assert(basketStyles.includes('opacity:0!important')&&
 basketStyles.includes('cursor:pointer!important')&&
 basketStyles.includes('pointer-events:none!important')&&
 basketStyles.includes(':focus-within'),
 'Sélecteur iOS toujours actif, légende visuelle sans blocage tactile');
assert(basketStyles.includes('linear-gradient(145deg,#f9fbfc,#e8eff4)')&&
 basketStyles.includes('3px 4px 10px rgba(98,126,144,.10)'),
 'Boutons caméra et galerie avec le relief exact du scanner classique');
// v41.93 — le menu iOS garde exactement les tares du panier classique.
assert(js.includes('const options=Array.from(classicBasket.options,option=>option.cloneNode(true));')&&
 !js.includes("copy.textContent=String(copy.textContent||'').replace("),
 'Options Gemini clonées intégralement, suffixes de tares compris');
assert(js.includes('const fullText=String(selected?.textContent')&&
 js.includes('ctx?.basketName||')&&
 js.includes('fullText.replace(/\\s+[—–-]\\s+\\d+')&&
 js.includes('geminiName.textContent=name')&&
 js.includes('geminiTare.textContent=tare'),
 'Nom affiché sans tare dupliquée, tare conservée sous le nom');
const labelRules=css.slice(css.indexOf('/* v41.92 — Panier Gemini'));
assert(labelRules.includes('margin:4px 0 6px!important')&&
 labelRules.includes('font-family:inherit!important')&&
 labelRules.includes('font-size:12px!important')&&
 labelRules.includes('font-weight:800!important')&&
 labelRules.includes('color:#323c43!important')&&
 labelRules.includes('letter-spacing:0!important')&&
 !labelRules.includes('line-height:1.35!important'),
 'Label panier copie le classique avec marges resserrées 4px/6px');
// v41.94 : même marge haute perçue que le classique et galerie
// rapprochée, avec gain automatique de largeur pour le select.
const compactBasketCss=css.slice(css.indexOf('/* v41.94 — Marges du libellé'));
assert(compactBasketCss.length>450&&
 compactBasketCss.includes('margin-bottom:0!important')&&
 compactBasketCss.includes('margin:10px 0 5px!important'),
 'Tiroir Cloudflare sans cumul des marges ; 10px avant le libellé et 5px après');
assert(compactBasketCss.includes('> .iu-weigh-scan-option.iu-gemini-photo-option')&&
 compactBasketCss.includes('margin-left:-6px!important')&&
 compactBasketCss.includes('margin-left:-4px!important'),
 'Galerie rapprochée de Caméra de 6px ou 4px sur petit écran');
assert(!compactBasketCss.includes('width:60px')&&
 !compactBasketCss.includes('flex-basis:60px')&&
 css.includes('flex:1 1 0!important'),
 'Boutons gardent leur taille, largeur libérée attribuée au select flexible');
// v41.95 : Caméra/Galerie et sélecteur ont exactement le même relief.
const buttonVisuals=css.slice(css.indexOf('/* v41.95 — boutons identiques'));
const selectStyle=css.slice(css.indexOf('/* v41.92 — Panier Gemini'),css.indexOf('/* v41.94 — Marges du libellé'));
for(const visual of [
 'border:1px solid rgba(214,224,231,.95)!important',
 'border-radius:14px!important',
 'background-color:#f5f8fa!important',
 'linear-gradient(145deg,#fff 0%,#f8fafb 34%,#e9eff3 100%)',
 '-2px -2px 5px rgba(255,255,255,.88)',
 '2px 3px 7px rgba(146,166,179,.16)',
 'inset 1px 1px 0 rgba(255,255,255,.96)'
]){
 assert(selectStyle.includes(visual)&&buttonVisuals.includes(visual),
  'Même style de base pour le panier et les deux boutons : '+visual);
}
assert(buttonVisuals.includes(':is(#iuGeminiCameraShortcut,#iuGeminiModePhoto)')&&
 buttonVisuals.includes(':is(:focus-visible,:active)')&&
 buttonVisuals.includes('border-color:#87949d!important')&&
 buttonVisuals.includes('inset 1px 1px 3px rgba(121,140,152,.08)'),
 'Les deux boutons reprennent aussi les reflets du champ actif');
assert(!buttonVisuals.includes('width:')&&!buttonVisuals.includes('height:')&&
 !buttonVisuals.includes('margin-left:')&&
 !buttonVisuals.includes('gap:'),
 'Alignement, dimensions et espacement inchangés');
// v41.96 — nouvel import et place rendue au sélecteur flexible.
assert(section.includes('id="iuGeminiModePhoto"')&&
 section.includes('aria-label="Importer une photo depuis l’appareil"')&&
 section.includes('title="Importer une photo"')&&
 section.includes('<path d="M12 3v11"/>')&&
 section.includes('<path d="m7 9 5 5 5-5"/>')&&
 section.includes('<path d="M4 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/>'),
 'Le bouton Galerie devient Import : flèche vers le bas dans le bac');
assert(!section.includes('aria-label="Choisir une photo dans la galerie"')&&
 section.includes('id="iuGeminiCameraShortcut"')&&
 section.includes('id="iuGeminiBasketSelect"'),
 'Commande caméra et champ panier préservés et Import accessible');
const widthCss=css.slice(css.indexOf('/* v41.96 — Sélecteur élargi'));
assert(widthCss.length>650&&
 widthCss.includes('column-gap:4px!important')&&
 widthCss.includes('gap:4px!important')&&
 widthCss.includes('margin-left:0!important')&&
 widthCss.includes('flex:1 1 0%!important')&&
 widthCss.includes('min-width:0!important'),
 'Espacement 4px, largeur récupérée par le champ flex');
assert(!widthCss.includes('width:60px')&&
 !widthCss.includes('width:56px')&&
 !widthCss.includes('height:60px')&&
 !widthCss.includes('height:56px'),
 'Aucune modification des hauteurs et tailles des deux boutons');
assert((css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length,'CSS équilibré');
console.log('Gemini v41.96 : icône Import et sélecteur élargi avec espacement 4px OK.');
