'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
// La version JS suit la version PWA ; les autres actifs (CSS notamment)
 // gardent leur cachebuster indépendant tant que leur contenu ne change pas.
const cssAssetVersion=(html.match(/gemini-lab\.css\?v=([\d.]+)/)||[])[1];
assert(html.includes('gemini-lab.js?v='+version)&&Boolean(cssAssetVersion));
assert(sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+cssAssetVersion));
const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),
 html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
assert(section.includes('id="iuGeminiCameraShell" class="iu-gemini-camera-shell iu-weigh-scan-inline" data-state="idle"'),
 'Le viseur est ouvert mais ne demande pas la permission caméra');
assert(!section.includes('id="iuGeminiCameraShell" class="iu-gemini-camera-shell iu-weigh-scan-inline" hidden'),
 'Le cadre vidéo n’est plus caché au démarrage');
assert(section.includes('id="iuGeminiCameraIdle"')&&section.includes('Caméra désactivée')&&
 !section.includes('iu-gemini-camera-idle-icon'),
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
assert(js.includes("if(!proposal&&!output.querySelector('.iu-gemini-printed-label'))showBlankLabel();"),
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
assert(js.includes('const scale=.82*Math.min((stage.width-8)/guideSize.width,')&&
 js.includes('(stage.height-8)/guideSize.height);'),
 'Repère réduit de 18 % uniformément, sans déformation');
assert(css.includes('.iu-gemini-outline-label > .iu-gemini-outline-rect')&&
 css.includes('background:transparent!important;'),
 'Les cadres sont des contours vides et translucides');
assert(css.includes('background:linear-gradient(145deg,#d9f0ff 0%,#8fcefa 100%)!important'),
 'Flash actif visuellement plus prononcé');
// v41.86 : mêmes dimensions et recadrage que le scanner OCR classique.
const classicCss=require('node:fs').readFileSync('weigh-scan-inline.css','utf8');
const cameraMatch=css.slice(css.indexOf('/* v41.86 — Mêmes dimensions'),css.indexOf('/* v41.87 — Filaments'));
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
assert(html.includes('gemini-lab.css?v='+cssAssetVersion)&&
 html.includes('gemini-lab.js?v='+version)&&
 sw.includes('gemini-lab.css?v='+cssAssetVersion)&&
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
const lightAssetVersion=(html.match(/weigh-light\.js\?v=([\d.]+)/)||[])[1];
assert(html.includes('weigh-light.js?v='+lightAssetVersion)&&
 sw.includes('weigh-light.js?v='+lightAssetVersion),
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
 js.includes('const used=setPhoto(nextPhoto,{confirmed:true});')&&js.includes('if(!analyze.disabled){'),
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
const buttonVisuals=css.slice(css.indexOf('/* v41.95 — boutons Caméra/Galerie'),css.indexOf('/* v41.96 — Sélecteur élargi'));
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
 section.includes('<path d="M5 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/>'),
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
// v41.97 — centres géométriques communs des deux parties de l'icône.
assert(section.includes('<path d="M12 3v11"/>')&&
 section.includes('<path d="m7 9 5 5 5-5"/>')&&
 section.includes('<path d="M5 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/>')&&
 !section.includes('<path d="M4 17v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3"/>'),
 'Bac x5–x19 centré sur x12 comme la flèche d’importation');
// v42.00 — bouton 32px visuellement identique, mais dans le coin bas gauche.
const headerStart=section.indexOf('class="iu-gemini-camera-header iu-weigh-scan-header"');
const closeIndex=section.indexOf('id="iuGeminiCloseCamera"');
const torchIndex=section.indexOf('id="iuGeminiTorch"');
const headerEnd=section.indexOf('</header>',headerStart);
const shutterIndex=section.indexOf('id="iuGeminiCapture"');
assert(headerStart>0&&closeIndex>headerStart&&torchIndex>closeIndex&&
 shutterIndex>headerEnd&&shutterIndex<section.indexOf('class="iu-gemini-scan-controls"')&&
 (section.match(/id="iuGeminiCapture"/g)||[]).length===1,
 'Capture sortie de la colonne haute et placée dans le viseur');
assert(section.includes('class="iu-weigh-scan-close iu-gemini-capture iu-gemini-shutter"')&&
 section.includes('aria-label="Photographier et analyser cette étiquette"')&&
 !section.includes('>Analyser cette étiquette</button>'),
 'Même classe visuelle que Fermer avec capture accessible et manuelle');
assert(js.includes("capture.addEventListener('click',async()=>{")&&
 !js.includes('capture.textContent=')&&
 js.includes("let cameraMode='manual',autoTimer=0"),
 'Aucune modification de la logique de déclenchement');
const shutterStyle=css.slice(css.indexOf('/* v42.00 — déclencheur en BAS GAUCHE'));
for(const value of [
 'position:absolute!important','left:5px!important','bottom:5px!important',
 'width:32px!important','height:32px!important','border-radius:11px!important',
 'border:1px solid rgba(255,255,255,.86)!important',
 'background:linear-gradient(145deg,#f9fbfc,#e8eff4)!important',
 '2px 3px 9px rgba(27,43,52,.19)',
 'width:20px!important','height:20px!important']){
 assert(shutterStyle.includes(value),'Déclencheur bas gauche, taille et relief : '+value);
}
assert(shutterStyle.includes('[data-state="idle"]')&&
 shutterStyle.includes(':disabled')&&
 shutterStyle.includes('z-index:6!important'),
 'Masquage caméra inactive, verrouillage et empilement préservés');
// v42.01 : enveloppe caméra plus arrondie et compacte verticalement.
const cameraShellRules=css.slice(css.indexOf('/* v42.01 — enveloppe de la caméra'),
 css.indexOf('/* v42.02 — géométrie caméra'));
assert(cameraShellRules.length>300&&
 cameraShellRules.includes('border-radius:20px!important')&&
 cameraShellRules.includes('padding-top:9px!important')&&
 cameraShellRules.includes('padding-bottom:9px!important')&&
 cameraShellRules.includes('padding-top:8px!important')&&
 cameraShellRules.includes('padding-bottom:8px!important'),
 'Cadre extérieur de caméra : coins 20px et marges uniformes sur les quatre côtés');
assert(cameraShellRules.includes('padding-left:9px!important')&&
 cameraShellRules.includes('padding-right:9px!important')&&
 cameraShellRules.includes('padding-left:8px!important')&&
 cameraShellRules.includes('padding-right:8px!important'),
 'Marges horizontales et largeur utile du viseur conservées');
assert(!cameraShellRules.includes('.iu-gemini-camera-stage')&&
 !cameraShellRules.includes('#iuGeminiCapture')&&
 !cameraShellRules.includes('height:184px')&&
 !cameraShellRules.includes('height:160px'),
 'Dimensions, contrôles et capture de la caméra non modifiés');
// v42.02 — même rayon que l'étiquette, état inactif épuré, modèle visible en chargement.
assert(css.includes('> .iu-gemini-label-shell > #iuGeminiLabelPanel.iu-gemini-label-panel {')&&
 css.includes('border-radius:20px!important'),
 'Le modèle de l’étiquette virtuelle utilise bien 20px');
const cameraIdleCss=css.slice(css.indexOf('/* v42.02 — géométrie caméra'));
assert(cameraIdleCss.includes('font-size:16px!important')&&
 cameraIdleCss.includes('font-weight:800!important')&&
 cameraIdleCss.includes('justify-content:center!important')&&
 cameraIdleCss.includes('text-align:center!important'),
 'Caméra désactivée centré, plus grand et gras');
assert(section.includes('<span>Caméra désactivée</span>')&&
 !section.includes('iu-gemini-camera-idle-icon')&&
 js.includes("cameraIdle?.addEventListener('click',startCamera)"),
 'Aucune icône au repos et zone tactile d’activation préservée');
assert(js.includes('showBlankLabel();networkTime.textContent=')&&
 js.includes('output.hidden=false;networkTime.textContent=')&&
 !js.includes('output.hidden=true;'),
 'Étiquette virtuelle toujours visible pendant la photo et le chargement réseau');
// v42.03 — marge intérieure symétrique et flash sans lueur bleue.
const cameraGeometry=css.slice(css.indexOf('/* v42.01 — enveloppe de la caméra'),css.indexOf('/* v42.02 — géométrie caméra'));
assert(cameraGeometry.includes('padding-top:9px!important')&&
 cameraGeometry.includes('padding-bottom:9px!important')&&
 cameraGeometry.includes('padding-left:9px!important')&&
 cameraGeometry.includes('padding-right:9px!important')&&
 cameraGeometry.includes('padding-top:8px!important')&&
 cameraGeometry.includes('padding-bottom:8px!important')&&
 cameraGeometry.includes('padding-left:8px!important')&&
 cameraGeometry.includes('padding-right:8px!important'),
 'Marges intérieures égales sur les quatre côtés, sur tous les iPhone');
const cameraRefresh=css.slice(css.indexOf('/* v42.03 — marge intérieure uniforme'));
assert(cameraRefresh.includes('margin:3px 0 1px!important')&&
 cameraRefresh.includes('color:#d43e50!important')&&
 cameraRefresh.includes('stroke:currentColor!important'),
 'Bloc rapproché des éléments voisins et déclencheur rouge contrasté');
assert(cameraRefresh.includes('#iuGeminiTorch.iu-weigh-scan-torch:is(.is-on,[aria-pressed="true"])')&&
 cameraRefresh.includes('inset 0 -1px 2px rgba(33,107,170,.12)!important')&&
 cameraRefresh.includes('filter:none!important')&&
 !cameraRefresh.includes('0 0 0 2px rgba(40,145,235')&&
 !cameraRefresh.includes('0 3px 14px rgba(34,122,214'),
 'Flash actif : fond bleu conservé, halo et lueur éliminés');
// v42.04 — flash bleu plein sans recolorer le bouton, moins d'espace sous le panier.
const flashV4204=css.slice(css.indexOf('/* v42.04 — Flash actif'));
assert(flashV4204.includes('#iuGeminiTorch.iu-weigh-scan-torch:is(.is-on,[aria-pressed="true"]) > svg')&&
 flashV4204.includes('fill:currentColor!important')&&
 flashV4204.includes('fill:none!important')&&
 flashV4204.includes('stroke:currentColor!important'),
 'L’éclair se remplit de bleu seulement quand le flash est actif');
assert(flashV4204.includes('background:linear-gradient(145deg,#fafbfc,#ebeff2)!important')&&
 flashV4204.includes('color:#2588c7!important')&&
 flashV4204.includes('2px 3px 8px rgba(35,51,64,.12)!important')&&
 flashV4204.includes('filter:none!important'),
 'Le verre du flash reste inchangé et aucun halo lumineux ne revient');
assert(flashV4204.includes('margin-bottom:3px!important')&&
 flashV4204.includes('margin-top:1px!important')&&
 !flashV4204.includes('height:60px!important')&&
 !flashV4204.includes('height:184px!important'),
 'Moins de marge sous le panier sans modifier la taille des contrôles ni du viseur');
// v42.05 — contrôle compact et effet verre renforcé, sans toucher à l'étiquette.
const compactPanelCss=css.slice(css.indexOf('/* v42.05 — Le panneau commun'));
assert(compactPanelCss.includes('rgba(255,255,255,.16)')&&
 compactPanelCss.includes('rgba(255,255,255,.23)')&&
 compactPanelCss.includes('backdrop-filter:blur(18px) saturate(105%)!important'),
 'Panneau de contrôle nettement plus translucide, halo et trame préservés');
assert(compactPanelCss.includes('height:54px!important')&&
 compactPanelCss.includes('min-height:54px!important')&&
 compactPanelCss.includes('max-height:54px!important')&&
 compactPanelCss.includes('> .iu-gemini-gross-row > .iu-gemini-gross-panel')&&
 compactPanelCss.includes('> button#iuGeminiNext.new-weigh-btn.iu-gemini-confirm-next'),
 'Poids brut et bouton Nouvelle pesée réduits à la même hauteur de 54px');
assert(compactPanelCss.includes('border:1px solid rgba(214,224,231,.95)!important')&&
 compactPanelCss.includes('border-radius:14px!important')&&
 compactPanelCss.includes('background-image:linear-gradient(145deg,#fff 0%,#f8fafb 34%,#e9eff3 100%)!important')&&
 compactPanelCss.includes('2px 3px 7px rgba(146,166,179,.16)')&&
 compactPanelCss.includes('.is-ready:not(:disabled)')&&
 compactPanelCss.includes(':active:not(:disabled)'),
 'Nouvelle pesée identique aux boutons Caméra/Import y compris prêt et touché');
assert(section.includes('id="iuGeminiNext"')&&
 js.includes("nextWeigh?.addEventListener('click',()=>{"),
 'Enregistrement de la pesée inchangé');
// v42.06 — réessais transitoires bornés : pas d'écritures ni de capture ajoutées.
assert(js.includes('async function requestGeminiWithRecovery(')&&
 js.includes('const unreadable=status===422||')&&
 !js.includes('maxAttempts=2;')&&
 !js.includes('attempt<maxAttempts')&&
 js.includes("throw Error('Étiquette non lue · réessaie cette photo')"),
 'Une seule requête par tentative et erreurs de lecture distinctes');
assert(js.includes("if([401,403].includes(status)||[401,403].includes(providerStatus))")&&
 js.includes("attempts.delete(selectedModel);")&&
 js.includes('analyze.disabled=!file||!pilotKey.value.trim()||active;'),
 'Refus d’accès sans deuxième appel, photo conservée');
assert(js.includes("signal.addEventListener('abort',onAbort,{once:true})")&&
 js.includes("signal.removeEventListener('abort',onAbort)")&&
 js.includes("id!==generation")&&
 js.includes("body=JSON.stringify({type:'iu-gemini-label-test'"),
 'Même photo réutilisée, délais annulables et générations protégées');
assert(js.includes("const received=await requestGeminiWithRecovery(")&&
 js.includes("const saveReady=Boolean(validationState());")&&
 js.includes("nextWeigh?.addEventListener('click',()=>{")&&
 js.includes("if(c.arithmeticConsistent!==true")===false,
 'Une requête par tentative ; pas de validation automatique');
// v42.16 — retour au chemin Gemini 42.06 sans perte des contrôles.
assert(js.includes('const focused=width*.88')&&
 js.includes('width:{ideal:1920},height:{ideal:1080}')&&
 js.includes('Math.min(1,1600/Math.max(crop.width,crop.height))')&&
 js.includes("cv.toBlob(resolve,'image/jpeg',.90)"),'Capture initiale 42.06 restaurée');
assert(js.includes('const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight))')&&
 js.includes('for(const quality of [.88,.80,.72,.64,.56])')&&
 !js.includes('jpegCanvasBlob(')&&
 !js.includes('photoDecodeCache')&&
 !js.includes('independentLocalReadingFor(')&&
 !js.includes('localCheckWithin(')&&
 !js.includes('previewPending')&&
 !js.includes('warmGeminiConnection()'),
 'JPEG 42.06 restauré, OCR manuel et préchargements supplémentaires retirés');
assert(js.includes('const received=await requestGeminiWithRecovery(')&&
 js.includes('display(validated,performance.now()-start);')&&
 !js.includes('const second=await requestGeminiWithRecovery('),
 'Une analyse unique avec validation et EAN indépendants');
assert(js.includes('const arithmeticOk=Math.abs(Math.round(grams*rate/1000)-total)<=1')&&
 js.includes('eanCheck(ean.slice(0,12))!==ean[12]'),
 'Vérifications prix et EAN non diminuées');
assert(js.includes("setLabelAlert('success','étiquette prête');")&&
 js.includes("setLabelAlert('warning','Doublon détecté · confirme ou ignore');")&&
 js.includes("dateValue.title='Date du jour — non reconnue sur la photo'"),
 'Textes récents et date d’emballage virtuelle conservés');
// v42.09 — indications entre brut et étiquette, duplicata exact, cohérence visuelle.
const grossPos=section.indexOf('id="iuGeminiEmptyResult"');
const alertPos=section.indexOf('id="iuGeminiLabelAlert"');
const virtualPos=section.indexOf('id="iuGeminiLabOutput"');
assert(grossPos>0&&grossPos<alertPos&&alertPos<virtualPos&&
 (section.match(/id="iuGeminiLabelAlert"/g)||[]).length===1&&
 section.includes('id="iuGeminiLabelAlertText"'),
 'Le statut accessible est bien placé entre le brut et l’étiquette virtuelle');
assert(js.includes("setLabelAlert('warning','Doublon détecté · confirme ou ignore');")&&
 !js.includes('tu peux la valider à nouveau'),
 'Message de doublon remplacé exactement');
const geminiVisuals=css.slice(css.indexOf('/* v42.09 — Indications'));
assert(geminiVisuals.includes('order:1!important')&&
 geminiVisuals.includes('order:2!important')&&
 geminiVisuals.includes('font-size:13.5px!important')&&
 geminiVisuals.includes('font-weight:850!important')&&
 geminiVisuals.includes('color:#28343d!important')&&
 geminiVisuals.includes('linear-gradient(145deg,#fff 0%,#f8fafb 34%,#e5ebef 100%)'),
 'Même palette gris perle, alignement et typographie que Démarrer un inventaire');
assert(geminiVisuals.includes('right:5px!important')&&
 geminiVisuals.includes('bottom:5px!important')&&
 geminiVisuals.includes('width:32px!important')&&
 geminiVisuals.includes('height:32px!important')&&
 geminiVisuals.includes('border-radius:11px!important')&&
 geminiVisuals.includes('color:#1a9e6d!important')&&
 geminiVisuals.includes('rgba(27,43,52,.19)')&&
 geminiVisuals.includes('.iu-weigh-scan-detected-indicator[hidden]'),
 'Coche validée : même forme et relief que les trois commandes du viseur');
assert(js.includes('const confirmed=canSave&&!duplicateForCurrent()&&!cameraShell.hidden;')&&
 js.includes('if(detected?.hidden)revealDetectedIndicator(latestLabelFields);')&&
 js.includes('resetDetectedIndicator();')&&
 js.includes("nextWeigh?.addEventListener('click',()=>{"),
 'Le témoin ne valide jamais un résultat incomplet ni un doublon, enregistrement manuel');
// v42.10 — témoin caché avant lecture, fond vert et coche blanche.
const badgeV4210=css.slice(css.indexOf('/* v42.10 — témoin vert'));
assert(section.includes('id="iuGeminiDetected"')&&
 section.includes('role="status" hidden')&&
 section.includes('stroke-width="2.5"'),
 'Témoin par défaut caché et trait plus fin');
assert(badgeV4210.includes('rgba(34,155,115,.96)')&&
 badgeV4210.includes('rgba(19,120,94,.95)')&&
 badgeV4210.includes('stroke:#fff!important')&&
 badgeV4210.includes('stroke-width:2.5!important'),
 'Fond vert historique et coche blanche fine');
assert(badgeV4210.includes('> #iuGeminiDetected.iu-weigh-scan-detected-indicator[hidden] {')&&
 badgeV4210.includes('display:none!important')&&
 badgeV4210.includes('visibility:hidden!important')&&
 badgeV4210.includes('[data-state="idle"] .iu-gemini-camera-stage.iu-weigh-scan-camera'),
 'Masquage de priorité identique au display:flex initial');
// v42.16 — Worker Gemini restauré à son contrat stable.
const server=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
assert(server.includes("generationConfig:{temperature:0,maxOutputTokens:1024,responseMimeType:'application/json'}")&&
 !server.includes('geminiLabelJsonSchema')&&
 !server.includes('schemaUnavailableUntil')&&
 !server.includes('responseJsonSchema'),
 'Worker Gemini v42.06 restauré sans format expérimental');
assert(js.includes('const unreadable=status===422||')&&
 js.includes('const saveReady=Boolean(validationState());'),
 'Réseau traité en une seule requête et enregistrement manuel');
// v42.13 : voyant compact, mêmes marges et marqueurs de sécurité conservés.
const compactGreen=css.slice(css.indexOf('/* v42.13 — coche réduite'));
assert(compactGreen.includes('right:5px!important')&&
 compactGreen.includes('bottom:5px!important')&&
 compactGreen.includes('width:27px!important')&&
 compactGreen.includes('min-width:27px!important')&&
 compactGreen.includes('max-width:27px!important')&&
 compactGreen.includes('height:27px!important')&&
 compactGreen.includes('min-height:27px!important')&&
 compactGreen.includes('max-height:27px!important')&&
 compactGreen.includes('width:17px!important')&&
 compactGreen.includes('height:17px!important'),
 'Témoin vert réduit, éloignement des bords inchangé');
assert(js.includes("setLabelAlert('success','étiquette prête');")&&
 !js.includes('Étiquette prête · vérifie le poids brut avant de valider'),
 'Message succès simplifié');
assert(js.includes('virtualDate.textContent=todayForVirtualLabel();')&&
 js.includes("add(dateBox,'strong','iu-gemini-label-number',todayForVirtualLabel())"),
 'Date civile locale affichée sur étiquette virtuelle à création et mise à jour');
assert(js.includes("nextWeigh?.addEventListener('click',()=>{")&&
 js.includes("const confirmed=canSave&&!duplicateForCurrent()&&!cameraShell.hidden;")&&
 css.includes('> #iuGeminiDetected.iu-weigh-scan-detected-indicator[hidden] {'),
 'Validation volontaire et masquage des étiquettes non valides conservés');
// v42.16 — nouveaux visuels et reprise de photo conservés.
assert(html.includes('gemini-lab.js?v='+version)&&
 sw.includes('gemini-lab.js?v='+version)&&
 !sw.includes('gemini-image-worker.js')&&
 !js.includes('imageEncoderWorker'), 'Cache PWA avec lecteur stable');
assert(js.includes('function hasSavableProposal(){')&&
 js.includes('const locked=Boolean(frameCaptureBusy||(!active&&localOcrBusy));')&&
 js.includes('const priorWasSavable=Boolean(correctedCurrentProposal());')&&
 js.includes('const nextPhoto=new File([blob]')&&
 js.includes('if(priorWasSavable){')&&
 js.includes('generation++;abort?.abort();abort=null;active=false;file=null;'),
 'Correction du blocage de la reprise avec tare invalide préservée');
assert(js.includes("nextWeigh?.addEventListener('click',()=>{")&&
 js.includes('const canSave=Boolean(corrected)&&!active;')&&
 js.includes('const confirmed=canSave&&!duplicateForCurrent()&&!cameraShell.hidden;'),
 'Contrôle métier et validation manuelle préservés');
// v42.17 — capture réelle, échec relançable et validation bloquée.
assert(section.includes('id="iuGeminiCameraStill"')&&section.includes('id="iuGeminiFrameState"')&&
 !section.includes('id="iuGeminiPhotoContext"')&&
 !section.includes('id="iuGeminiLabPreview"')&&
 section.includes('id="iuGeminiReplacePrompt"'),
 'Photo figée, miniature et détails redondants retirés');
assert(js.includes('setAnalysisCameraClosed(true);')&&js.includes('setAnalysisCameraClosed(false);')&&
 js.includes('lastReadProblem=verified.error||null;')&&
 js.includes('const unreadable=status===422||')&&
 !js.includes('window.confirm('),'Erreurs précises et pas de pop-up bloquante');
assert(js.includes("const caption=active?'…':duplicate?'Confirmer doublon'")&&
 js.includes("if(digits)digits.textContent=labelReady?corrected.ean:'CODE EN ATTENTE';")&&
 js.includes('else bars.replaceChildren();')&&
 js.includes('const canSave=Boolean(corrected)&&!active;'),
 'Bouton explicite et absence de code-barres fictif en cas de tare incorrecte');
assert(css.includes('/* v42.18 — parcours rapide')&&
 css.includes('> #iuGeminiAnalyze,')&&
 css.includes('#iuGeminiFrameState .iu-gemini-progress-spinner')&&
 css.includes('#iuGeminiReplacePrompt[hidden]'),
 'Scanner simplifié à une action principale et progression discrète');
assert((css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length,'CSS équilibré');
// v42.18 — correction de la tare et classification des erreurs de reconnaissance.
assert(!section.includes('id="iuGeminiLabPreview"')&&
 section.includes('id="iuGeminiAnalyze" hidden disabled')&&
 js.includes('analyze.hidden=true;')&&
 js.includes("labelAlert.hidden=type==='idle'&&!message;"),
 'Miniature supprimée, bouton caché, aucune alerte par défaut');
assert(js.includes('function needsBasketChange(){')&&
 js.includes("geminiBasket.showPicker?.();")&&
 js.includes("needsBasketChange()?'Changer panier'")&&
 js.includes("if(file&&(lastReadProblem||lastAnalysisError||(!proposal&&latestLabelFields)))"),
 'Corriger la tare sans nouvelle analyse ou relire la photo en échec');
assert(js.includes("setLabelAlert('success',saved.duplicate?'Doublon confirmé':'Pesée enregistrée');")&&
 js.includes('const canSave=Boolean(corrected)&&!active;')&&
 js.includes('if(labelReady)renderEanBars(bars,corrected.ean);')&&
 js.includes('else bars.replaceChildren();'),
 'Enregistrement volontaire et code-barres après validation');
assert(server.includes('let providerAnswered=false;')&&
 server.includes('model},422,origin)')&&
 server.includes('abort.signal.aborted?504:providerAnswered?422:503'),
 'Le Worker distingue lecture non reconnue, délai et panne fournisseur');
// v42.19 — caméra fermée uniquement durant l'analyse et reprise rapide.
assert(js.includes('const scale=.82*Math.min(')&&
 js.includes('setAnalysisCameraClosed(true);')&&
 js.includes('active=false;abort=null;setAnalysisCameraClosed(false);')&&
 js.includes("if(track?.readyState==='live')track.enabled=false;")&&
 js.includes("track.enabled=true;")&&
 js.includes('if(analysisCameraClosed)return;')&&
 js.includes('setAnalysisCameraClosed(false,{resume:false});'),
 'Le repère est plus petit et la piste est arrêtée/reprise sans getUserMedia supplémentaire');
assert(css.includes('/* v42.19 — viseur réellement fermé')&&
 css.includes('[data-state="analyzing"]')&&
 css.includes('> #iuGeminiFrameState.iu-gemini-frame-state[hidden]')&&
 css.includes('display:none!important;visibility:hidden!important;'),
 'Analyse cachée au repos, état de caméra fermé en traitement');
assert(js.includes("cameraShell.dataset.state='scanning';\n   video.srcObject=cameraStream;")&&
 js.includes("void startCamera();")&&
 js.includes('if(resume&&wasLive&&cameraStream&&track?.readyState!=='),
 'Reprise Safari après arrière-plan et piste terminée');
// v42.21 — un geste : sauvegarde avant une nouvelle lecture uniquement
// après acquisition de la photo, doublons à confirmation explicite.
const app=fs.readFileSync('app.js','utf8');
assert(js.includes('const nextPhoto=new File([blob]')&&
 js.indexOf('const nextPhoto=new File([blob]')<
 js.indexOf('const saved=saveVerifiedProposal({\n     confirmDuplicate:duplicateBefore,fromCapture:true')&&
 js.includes('if(!saved?.ok){announceSaveError(saved);return;}')&&
 js.includes('const used=setPhoto(nextPhoto,{confirmed:true});'),
 'Nouvelle photo capturée avant enregistrement, échec protégé');
assert(js.includes('function saveVerifiedProposal(')&&
 js.includes('confirmDuplicate:duplicate&&confirmDuplicate')&&
 js.includes('duplicateSkip?.addEventListener(')&&
 js.includes("capture.dataset.action=duplicated?'confirm-duplicate'"),
 'Déclencheur avec confirmation volontaire, option Ignorer');
assert(app.includes('x.pricePerKgCents===rate&&x.originalTotalCents===total')&&
 app.includes("if(duplicate&&payload?.confirmDuplicate!==true)")&&
 app.includes('duplicateConfirmed:duplicate&&payload?.confirmDuplicate===true')&&
 app.includes("confirmed.textContent='Doublon confirmé'"),
 'Comparaison EAN, brut, prix et historique des doublons explicites');
assert(js.includes('identity&&identity===lastSavedImportedPhoto')&&
 js.includes('frameGeneration!==generation')&&
 js.includes("priorBasket!==$('basketSelect')?.value"),
 'Photo importée répétée et changements pendant capture pris en charge');
assert(section.includes('id="iuGeminiDuplicateSkip"')&&
 css.includes('/* v42.21 — un seul déclencheur')&&
 css.includes('#iuGeminiDuplicateSkip.iu-gemini-duplicate-skip[hidden]'),
 'Alerte doublon discrète et compacte');
// v42.22 — lecture EAN indépendant, ciblage et cohérence arithmétique.
const eanSource=fs.readFileSync('gemini-ean.js','utf8');
assert(html.includes('gemini-ean.js?v='+version)&&
 sw.includes('gemini-ean.js?v='+version)&&
 css.includes('/* v42.22 — récupération ciblée')&&
 section.includes('id="iuGeminiRepair"')&&
 section.includes('id="iuGeminiRepairRead"')&&
 section.includes('id="iuGeminiRepairValue"'),
 'Décodeur local précaché, correcteur à champs compact disponible');
assert(js.includes('const arithmeticOk=Math.abs(Math.round(grams*rate/1000)-total)<=1;')&&
 !js.includes('if(!arithmeticOk||c.arithmeticConsistent!==true)')&&
 js.includes('function reconcileBarcode(result,reading)')&&
 js.includes('function fieldsChecks(fields)')&&
 js.includes('reconcileBarcode(combined,localBarcode)'),
 'Tolérance d’un centime et EAN indépendamment contrôlé');
assert(js.includes('barcodeJob=Promise.resolve().then')&&
 js.includes('window.IUGeminiEAN.cropIfSafe(file,readFast)')&&
 js.includes('const received=await requestGeminiWithRecovery(')&&
 js.includes('targetField);')&&
 js.includes('repairRead?.addEventListener(')&&
 js.includes('repairApply?.addEventListener('),
 'Photo inchangée en fallback, relecture ciblée et correction manuelle');
assert(js.includes("setLabelAlert('success','étiquette prête');")&&
 js.includes("const caption=active?'…':duplicate?'Confirmer doublon'")&&
 js.includes("if(active){setLabelAlert('idle','');return;}")&&
 !js.includes("if(active){setLabelAlert('working','Analyse…');return;}"),
 'Un seul indicateur Analyse dans le viseur');
assert(app.includes('manualCorrectedFields:editedFields')&&
 app.includes("audit.textContent='Valeur vérifiée'")&&
 app.includes('if(session)return (session.entries||[]).find(match)||null;'),
 'Correction tracée, doublons limités à l’inventaire en cours');
assert(server.includes('RELECTURE CIBLÉE')&&
 server.includes('Math.abs(Math.round(weightGrams*pricePerKgCents/1000)-totalCents)<=1')&&
 server.includes('focusField:focus'),
 'Worker source supporte relecture ciblée et tolérance un centime');
assert(eanSource.includes('function decode95(bits)')&&
 eanSource.includes('function lineCode(values)')&&
 eanSource.includes('function suggestLabelCrop(')&&
 eanSource.includes('if(confirmed.length>1)return {ambiguous:true'),
 'EAN optique hors-ligne, clé stricte et cadrage prudent');
console.log('Gemini v42.22 : OCR indépendant, relecture ciblée et sécurité de pesée OK.');
