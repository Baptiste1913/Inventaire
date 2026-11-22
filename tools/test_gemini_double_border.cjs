'use strict';
// Contrôle de fidélité du double contour Gemini au bouton Démarrer un inventaire.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const base=fs.readFileSync('style.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

const start=html.indexOf('<section id="iuGeminiLab"');
const firstControl=html.indexOf('<div class="card-heading">',start);
assert(start>=0&&firstControl>start,'Section Gemini trouvée');
const header=html.slice(start,firstControl);
assert(header.includes('<span class="iu-gemini-frame-gradient" aria-hidden="true"></span>'),
 'Anneau extérieur décoratif présent avant le contenu');
assert(header.includes('<span class="iu-gemini-frame-surface" aria-hidden="true"></span>'),
 'Liseré intérieur présent avant le contenu');
assert.equal((html.match(/class="iu-gemini-frame-gradient"/g)||[]).length,1,
 'Un seul contour extérieur par carte');
assert.equal((html.match(/class="iu-gemini-frame-surface"/g)||[]).length,1,
 'Un seul contour intérieur par carte');

const reference=base.indexOf('/* V37.25 — Une seule silhouette');
assert(reference>=0,'Style de référence du bouton Démarrer présent');
const sourceRule=base.slice(reference,reference+3500);
assert(sourceRule.includes('#startSession.primary-btn.session-btn'),
 'Style de référence lié au vrai bouton');
assert(sourceRule.includes('inset:0!important')&&sourceRule.includes('inset:1px!important'),
 'Le bouton de référence utilise 0 px + 1 px');
assert(sourceRule.includes('border-radius:14px!important')&&sourceRule.includes('border-radius:13px!important'),
 'Le bouton de référence utilise des coins concentriques');
assert(sourceRule.includes('border:1px solid #007583!important'),
 'Le bouton de référence possède un liseré intérieur');

const section=css.indexOf('/* v41.60 — Double contour EXACTEMENT');
assert(section>=0,'Règles Gemini des deux contours présentes');
const frame=css.slice(section);
const outerStart=frame.indexOf('> .iu-gemini-frame-gradient {');
const innerStart=frame.indexOf('> .iu-gemini-frame-surface {',outerStart);
assert(outerStart>=0&&innerStart>outerStart,'Les deux couches sont définies dans l’ordre');
const outer=frame.slice(outerStart,innerStart);
const inner=frame.slice(innerStart,frame.indexOf('/* Empêcher les deux couches',innerStart));
assert(frame.includes('main.app > section#iuGeminiLab'),
 'Contours strictement réservés au bloc IA');
assert(outer.includes('inset:0!important;')&&inner.includes('inset:1px!important;'),
 'Écart entre les couches exactement identique au bouton Démarrer');
assert(outer.includes('border-radius:20px!important')&&inner.includes('border-radius:19px!important'),
 'Coins concentriques adaptés au rayon de la carte');
assert(inner.includes('border:1px solid transparent!important;'),
 'Liseré intérieur d’un pixel conservé');
assert(['#ed4d55','#f9c017','#0cb768','#3287fe'].every(color=>outer.includes(color)),
 'Contour extérieur : les couleurs rouge, jaune, vert et bleu viennent du logo fourni');
assert(['#ed4d55','#f9c017','#0cb768','#3287fe'].every(color=>inner.includes(color)),
 'Contour intérieur : même palette que le logo Gemini');
assert(outer.includes('at 0% 0%')&&outer.includes('at 0% 50%')&&outer.includes('at 0% 100%'),
 'Le côté gauche va du rouge (haut) au jaune (milieu) et au vert (bas)');
assert(outer.includes('ellipse 81% 46%')&&outer.includes('ellipse 85% 37%')&&outer.includes('ellipse 83% 45%'),
 'Les halos sont concentrés sur la gauche, laissant le bord droit majoritairement bleu');
assert(outer.includes('#3287fe!important;')&&inner.includes('linear-gradient(#3287fe,#3287fe)'),
 'La base du bord droit est bleu Gemini');
assert(inner.includes('padding-box')&&inner.includes('border-box'),
 'Surface perle et liseré Gemini distincts');
assert(outer.includes('-3px -3px 7px rgba(255,255,255,.98)')&&
 outer.includes('4px 5px 11px rgba(91,148,155,.28)'),
 'Relief neumorphique identique à celui du bouton Démarrer');
assert(frame.includes(':not(.iu-gemini-frame-gradient):not(.iu-gemini-frame-surface)'),
 'Les champs, boutons et résultats restent au-dessus du contour');
assert(frame.includes('pointer-events:none!important;'),
 'Les couches sont non interactives');
assert(frame.includes('@media(forced-colors:active)'),
 'Bordure compatible avec les contrastes renforcés');
assert(!outer.includes('animation:')&&!inner.includes('animation:'),'Les contours restent fixes ; seul le voyant d’alerte est animé');
const badge=html.match(/<span class="iu-gemini-star-badge iu-gemini-title-badge"[^>]*>([\s\S]*?)<span class="iu-gemini-title-text">Gemini<\/span><\/span>/);
assert(badge,'Pastille Gemini présente dans la section');
const svg=badge[1];
assert(svg.includes('class="iu-gemini-brand-mark"')&&svg.includes('viewBox="-1 -1 102 102"'),
 'Icône vectorielle complète avec marge de sécurité pour les pointes');
assert(svg.includes('width="14" height="14"'),
 'Icône Gemini de même hauteur que le logo Google de Connecté (14 px)');
assert(svg.includes('C52 1.2')&&svg.includes('C1.2 48.2'),
 'Forme Gemini avec les quatre extrémités arrondies');
assert(['#ed4d55','#f9c017','#0cb768','#3287fe'].every(color=>svg.includes(color)),
 'Couleurs de l’icône reprises de l’image Gemini');
assert(svg.includes('gradientUnits="userSpaceOnUse"')&&
 svg.includes('iuGeminiTop')&&svg.includes('iuGeminiLeft')&&svg.includes('iuGeminiBottom'),
 'Icône avec transitions spatiales, pas simple dégradé linéaire');
const badgeCssIndex=frame.indexOf('/* v41.61 — Retour de la pastille Gemini en haut à droite.');
assert(badgeCssIndex>0,'Règles de positionnement de la pastille ajoutées');
const badgeCss=frame.slice(badgeCssIndex);
assert(badgeCss.includes('position:absolute!important;')&&
 badgeCss.includes('top:14px!important;')&&badgeCss.includes('right:16px!important;'),
 'Pastille remise en haut à droite du bloc');
assert(badgeCss.includes('width:14px!important;')&&
 badgeCss.includes('height:14px!important;')&&badgeCss.includes('overflow:visible!important;'),
 'Les pointes ne sont plus coupées et la hauteur du logo est 14 px');
assert(frame.includes(':not(.iu-gemini-hidden-photo-input):not(.iu-gemini-title-badge)'),
 'La règle de positionnement des autres éléments n’écrase plus celle de la pastille');
assert(html.includes('gemini-lab.css?v='+version)&&sw.includes('gemini-lab.css?v='+version),
 'Versions CSS PWA et HTML synchronisées');
console.log('Gemini : pastille en haut à droite, icône non coupée de 14 px, contour rouge-jaune-vert à gauche et bleu à droite ; vérifications réussies.');
