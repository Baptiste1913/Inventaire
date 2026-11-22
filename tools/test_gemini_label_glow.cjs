'use strict';
// 41.73 : l'étiquette Gemini réutilise la carte de résultat classique
// (verre, ombre, trame, halos animés), mais réorganise leurs 4 couleurs.
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
 custom.includes('rgba(237,77,85,.57)'),
 'Rouge Gemini en haut gauche : puissance 0,57 du rouge classique');
assert(classic.includes('rgba(48,155,238,.55)')&&
 custom.includes('rgba(50,135,254,.55)')&&
 custom.includes('rgba(249,192,23,.55)'),
 'Bleu Gemini à droite et jaune à gauche : puissance 0,55 du bleu classique');
assert(classic.includes('rgba(21,184,150,.54)')&&
 custom.includes('rgba(12,183,104,.54)'),
 'Vert en bas gauche : puissance 0,54 du vert classique');
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
console.log('Gemini 41.73 : carte classique, halos RGBY d’intensité identique et double contour du brut conformes.');
