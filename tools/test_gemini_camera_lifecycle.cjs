'use strict';
// Cadre lumineux Gemini (étiquette entière) et réutilisation des permissions
// caméra : aucune modification du scanner OCR classique.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('gemini-lab.js','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const inline=fs.readFileSync('weigh-scan-inline.css','utf8');
const light=fs.readFileSync('weigh-light.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

assert(html.includes('Place l’étiquette dans le cadre lumineux'),'Caption adaptée au nouveau contour');
assert(html.includes('aria-label="Afficher le viseur Gemini"'),'Raccourci ouvre le viseur');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version),
 'Assets Gemini rafraîchis sur le site');
assert(sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version),
 'Assets Gemini rafraîchis dans la PWA');
const marker='/* v41.59 — Gemini : le contour animé suit maintenant l\'ÉTIQUETTE COMPLÈTE';
assert(css.includes(marker),'Nouvelle géométrie du viseur Gemini présente');
const newCss=css.slice(css.indexOf(marker));
assert(newCss.includes('section#iuGeminiLab'),'Les nouvelles règles ne concernent que Gemini');
assert(newCss.includes('inset:6% 14% 6% 14%!important;'),
 'Le contour animé recouvre la même zone que la silhouette DIGI');
assert(newCss.includes('width:auto!important;')&&newCss.includes('height:auto!important;'),
 'Ne pas conserver la largeur et la hauteur du petit cadre OCR');
assert(newCss.includes('.iu-weigh-label-template')&&newCss.includes('border:0!important;'),
 'Masquer seulement le contour pointillé doublon du gabarit');
assert(newCss.includes('.iu-weight-light'),'Conserver l’animation Canvas');
assert(inline.includes('.iu-weigh-scan-guide'),'Les règles OCR originales restent disponibles');
assert(light.includes('iuGeminiCameraShell')&&light.includes('iuWeighScanOverlay'),
 'Moteur lumineux existant réutilisé pour les deux viseurs');

const start=js.indexOf('async function startCamera(){');
const end=js.indexOf('async function setTorch(',start);
assert(start>0&&end>start,'Démarrage caméra présent');
const startCode=js.slice(start,end);
const reuse=startCode.indexOf("if(cameraStream){");
const obtain=startCode.indexOf('navigator.mediaDevices.getUserMedia(');
assert(reuse>=0&&obtain>reuse,'La réutilisation est testée avant toute demande getUserMedia');
assert(startCode.includes("track?.readyState==='live'")&&startCode.includes('video.srcObject=cameraStream;'),
 'Piste vidéo existante reprise sans redemander la permission');
assert(startCode.includes('cameraShell.hidden=false;')&&startCode.includes('return;')&&
 !startCode.includes('cameraShell.scrollIntoView('),
 'Le raccourci réutilise le viseur sans déplacement automatique de la page');
assert(startCode.includes('stopCamera();'),'Piste terminée nettoyée avant éventuelle réouverture');
const shortcutStart=js.indexOf("shortcut?.addEventListener('click'");
const shortcutEnd=js.indexOf("nextWeigh?.addEventListener('click'",shortcutStart);
assert(shortcutStart>0&&shortcutEnd>shortcutStart,'Action de raccourci présente');
const shortcut=js.slice(shortcutStart,shortcutEnd);
assert(shortcut.includes('startCamera();')&&!shortcut.includes('stopCamera()'),
 'Le raccourci Scanner ne ferme plus la caméra en cours');
const visibilityStart=js.indexOf("document.addEventListener('visibilitychange',()=>");
const visibility=js.slice(visibilityStart);
assert(visibilityStart>0,'Gestion arrière-plan');
assert(visibility.includes('clearAutoTimer();'),'Analyser uniquement au premier plan');
assert(visibility.includes('track.enabled=false'),'Arrêter les images lorsque l’app est masquée');
assert(visibility.includes('track.enabled=true'),'Réactiver la piste existante au retour');
assert(visibility.includes("track.readyState!=='live'"),'Détecter la piste coupée par iOS');
assert(!visibility.includes('getUserMedia('),'Aucune nouvelle demande caméra automatique au retour');
const stopStart=js.indexOf('function stopCamera(){');
const stopEnd=js.indexOf('async function startCamera(){',stopStart);
assert(js.slice(stopStart,stopEnd).includes('track.stop()'),
 'La fermeture explicite libère toujours les pistes');
assert(js.includes('closeCamera.addEventListener(\'click\''),'Bouton de fermeture conservé');
assert(js.includes('window.IUGeminiSaveWeigh('),'Validation de pesée conservée');
console.log('Gemini : contour complet, piste réutilisée, pause arrière-plan et fermeture contrôlés.');
