'use strict';
// 41.74 : halos diffusés au-delà du panneau mais bornés au bloc Gemini,
// étiquette ivoire neumorphique et filet Gemini amincis.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const classic=fs.readFileSync('result-card.css','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
assert(html.includes('gemini-lab.css?v='+version)&&
 sw.includes('gemini-lab.css?v='+version),'Style déployé avec cache PWA');

const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),
 html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
const shell=section.indexOf('class="iu-result-glow-shell iu-gemini-label-shell"');
const glow=section.indexOf('class="iu-result-glow-field iu-gemini-label-glow-field"');
const panel=section.indexOf('id="iuGeminiLabelPanel"');
const pattern=section.indexOf('class="iu-result-light-field iu-welcome-dot-wave"',panel);
const gross=section.indexOf('id="iuGeminiEmptyResult"',panel);
const label=section.indexOf('id="iuGeminiLabOutput"',gross);
const warning=section.indexOf('id="iuGeminiLabelAlert"',label);
assert(shell>0&&glow>shell&&panel>glow&&pattern>panel&&
 gross>pattern&&label>gross&&warning>label,
 'Le fond lumineux précède une surface unique poids, étiquette et voyant');
assert(section.includes('class="iu-gemini-label-panel result iu-result-compact"'),
 'Surface du panneau identique au résultat de la pesée classique');
for(const cls of ['iu-home-glow-red','iu-gemini-glow-yellow','iu-home-glow-green','iu-home-glow-blue']){
 assert(section.includes('class="iu-home-glow-orb '+cls+'"'),'Orbe Gemini présent : '+cls);
}
assert(classic.includes('.result.iu-result-compact')&&
 classic.includes('.iu-result-glow-field > .iu-home-glow-orb')&&
 classic.includes('.iu-result-light-field'),
 'Le rendu classique réel est partagé, pas recréé indépendamment');
const custom=css.slice(css.indexOf('/* v41.73 — panneau étiquette Gemini'));
assert(custom.length>3500,'Styles de la nouvelle étiquette chargés');
assert(custom.includes('iuHomeBackdropRed 10s')&&
 custom.includes('iuHomeBackdropBlue 13s')&&
 custom.includes('iuHomeBackdropGreen 17s'),
 'Mêmes animations lentes que le résultat classique');
assert(custom.includes('blur(25px)')&&classic.includes('blur(25px)'),
 'Même diffusion des orbes');
assert(classic.includes('rgba(243,65,124,.57)')&&
 custom.includes('rgba(237,77,85,.228)'),
 'Rouge Gemini : 40 % de la puissance du rouge classique');
assert(classic.includes('rgba(48,155,238,.55)')&&
 custom.includes('rgba(50,135,254,.22)')&&
 custom.includes('rgba(249,192,23,.22)'),
 'Bleu et jaune Gemini : 40 % de la puissance du bleu classique');
assert(classic.includes('rgba(21,184,150,.54)')&&
 custom.includes('rgba(12,183,104,.216)'),
 'Vert Gemini : 40 % de la puissance du vert classique');
for(const selector of ['.iu-home-glow-red','.iu-gemini-glow-yellow',
 '.iu-home-glow-green','.iu-home-glow-blue']){
 assert(custom.includes(' > '+selector+' {')||custom.includes(' '+selector+' {'),
 'Disposition du halo prévue : '+selector);
}
assert(custom.includes('left:auto!important;right:-16%!important')&&
 custom.includes('height:115%!important'),
 'Grand halo bleu à droite du cadre');
assert(custom.includes('top:25%!important')&&
 custom.includes('bottom:-20%!important'),
 'Jaune au centre gauche, vert en bas gauche');
assert(custom.includes('rgba(255,255,255,.54)')&&
 classic.includes('rgba(255,255,255,.54)')&&
 custom.includes('blur(27px) saturate(109%)'),
 'Mêmes fond et verre de résultat classique');
assert(custom.includes('iu-welcome-dot-wave')===false &&
 section.includes('iu-welcome-dot-wave'),
 'Trame héritée du vrai composant classique, sans doublons');

const border=custom.slice(custom.indexOf('.iu-gemini-gross-panel::before'));
const inner=custom.slice(custom.indexOf('.iu-gemini-gross-panel::after {'));
assert(border.includes('inset:0!important')&&inner.includes('inset:1px!important'),
 'Contour dégradé double concentrique comme la carte Gemini');
for(const color of ['#ed4d55','#f9c017','#0cb768','#3287fe']){
 assert(border.includes(color)&&inner.includes(color),
 'Même couleur sur les deux contours : '+color);
}
assert(inner.includes('padding-box')&&inner.includes('border-box'),
 'Surface et bordure distinctes, même procédé que le contour Gemini IA');
assert(section.includes('id="iuGeminiGrossDisplay"')&&
 section.includes('id="iuGeminiNext"')&&
 section.includes('class="iu-gemini-label-alert is-idle"'),
 'Poids, validation et alertes conservés');
assert(js.includes('frameCaptureBusy||localOcrBusy||active||proposal')&&
 js.includes('capture.disabled=locked')&&
 js.includes('if(saved?.ok){\n   resetReading();'),
 'Analyse verrouillée jusqu’à Nouvelle pesée');

/* Régressions v41.74 : ces règles terminales doivent primer sur v41.73. */
const latest=css.slice(css.indexOf('/* v41.74 — diffusion'));
assert(latest.length>2600,'Les styles v41.74 doivent être présents');
assert(latest.includes('section#iuGeminiLab.card.calc-card.iu-gemini-standalone {\n overflow:hidden!important;'),
 'Seul le bloc Gemini complet doit limiter les halos');
assert(latest.includes('> .iu-result-glow-shell.iu-gemini-label-shell {\n overflow:visible!important;'),
 'La coque interne ne coupe pas les couleurs');
assert(latest.includes('inset:-26px -26px -32px!important')&&
 latest.includes('overflow:visible!important')&&
 latest.includes('-webkit-mask-image:none!important')&&
 latest.includes('mask-image:none!important'),
 'Le masque et la découpe abrupte du calque des halos ont disparu');
assert(latest.includes('> #iuGeminiLabelPanel.result.iu-result-compact {\n overflow:hidden!important;'),
 'Les contenus de la surface verre restent bien contenus');

const grossSection=latest.slice(latest.indexOf('/* Cadre du brut'),latest.indexOf('/* Papier numérique'));
assert(grossSection.includes('border-radius:12px!important')&&
 grossSection.includes('inset:1.25px!important'),
 'Contour Gemini légèrement affiné, sans modifier les poids et boutons');
assert(grossSection.includes('border:1px solid rgba(255,255,255,.80)')&&
 grossSection.includes('background:linear-gradient(145deg,#f7f9fa 0%,#eff3f6 56%,#e9eef2 100%)'),
 'Le poids brut possède un cœur monochrome, non coloré');

const labelSection=latest.slice(latest.indexOf('/* Papier numérique'));
assert(labelSection.includes('width:min(100%,300px)!important')&&
 labelSection.includes('max-width:300px!important'),
 'Étiquette légèrement réduite sans effacer les informations');
assert(labelSection.includes('max-width:280px!important')&&
 labelSection.includes('max-width:270px!important'),
 'Largeur adaptée aux petits écrans');
assert(labelSection.includes('#f3f0ea')&&labelSection.includes('#e5e2dc')&&
 labelSection.includes('inset 1px 1px 0 rgba(255,255,255,.73)'),
 'Étiquette monochrome ivoire avec relief neumorphique');
assert(labelSection.includes('filter:none!important')&&
 labelSection.includes('@media(forced-colors:active)'),
 'Les barres EAN restent nettes et le contraste forcé accessible');
assert((css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length,
 'CSS syntaxiquement équilibré');
assert(section.includes('id="iuGeminiGrossDisplay"')&&
 section.includes('id="iuGeminiNext"')&&
 section.includes('id="iuGeminiLabelAlert"')&&
 section.includes('id="iuGeminiLabOutput"'),
 'La capture, la validation, l’étiquette et les alertes restent intactes');

const finalCss=css.slice(css.indexOf('/* v41.75 — reprendre le voyant OCR classique'));
assert(finalCss.includes('width:min(100%,286px)!important')&&
 finalCss.includes('width:min(100%,272px)!important')&&
 finalCss.includes('#f3f3f3')&&finalCss.includes('#ebebeb')&&finalCss.includes('#e2e2e2'),
 'Papier réduit et noir et blanc avec relief conservé');
assert(finalCss.includes('.iu-gemini-scan-controls {')&&
 finalCss.includes('#iuGeminiLabStatus:not(.is-error)'),
 'La ligne de progression est retirée visuellement, les erreurs restent affichées');
assert(section.includes('id="iuGeminiDetected"')&&
 section.includes('class="iu-weigh-scan-detected-indicator"'),
 'Badge de reconnaissance identique à l’OCR classique');
assert(js.includes('function revealDetectedIndicator(fields)')&&
 js.includes('function resetDetectedIndicator()')&&
 js.includes('if(!verified.error&&Number.isSafeInteger(gross)&&gross>0)revealDetectedIndicator(fields)'),
 'Le badge n’apparaît qu’après lecture correcte et disparaît au réarmement');
assert(js.includes('resetDetectedIndicator();\n  localOcrToken++')&&
 js.includes('function stopCamera(){\n  resetDetectedIndicator();'),
 'Pas de coche persistante sur l’étiquette suivante ou caméra fermée');
const surface=css.slice(css.indexOf('/* v41.76 — papier DIGI'));
assert(surface.length>2000,'Style évènement exact chargé');
assert(surface.includes('article.iu-gemini-printed-label.is-ready')&&
 surface.includes('article.iu-gemini-printed-label.is-review'),
 'Même surface pour les états validé et à vérifier');
const expectedEvent=[
 'border:1px solid #d2dbe2!important',
 'border-radius:14px!important',
 'linear-gradient(145deg,#fff 0%,#f8fafb 34%,#e5ebef 100%)!important',
 '-3px -3px 7px rgba(255,255,255,.98)',
 '-6px -6px 13px rgba(255,255,255,.60)',
 '4px 5px 11px rgba(156,173,189,.35)',
 '1px 2px 4px rgba(156,173,189,.18)',
 'inset 1px 1px 0 rgba(255,255,255,.96)'
];
for(const value of expectedEvent)assert(surface.includes(value),
 'Fond, contour et relief repris du bouton Événements : '+value);
assert(surface.includes('background-color:transparent!important')&&
 surface.includes('background:#343a40!important')&&
 surface.includes('color:#171b1e!important'),
 'Fonds des zones internes neutralisés, marque U en gris anthracite');
assert(surface.includes('.iu-gemini-ean-svg')&&surface.includes('filter:none!important'),
 'EAN toujours net, sans filtre de couleur');
assert(surface.includes('width:min(100%,286px)!important')&&
 surface.includes('width:min(100%,260px)!important'),
 'Taille compacte et responsive conservée');
console.log('Gemini v41.76 : étiquette style exact Accéder aux événements, 100 % neutre, EAN net et ancienne logique inchangée.');
