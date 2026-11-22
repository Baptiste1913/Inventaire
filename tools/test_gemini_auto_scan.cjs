'use strict';
// Régression du scanner automatique Gemini : aucun appel Gemini sur les frames,
// au plus une capture par cycle, validation humaine et protections des doublons.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('gemini-lab.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;

for(const id of ['iuGeminiAutoToggle','iuGeminiAutoScanState','iuGeminiAutoReset','iuGeminiCapture'])
 assert(html.includes('id="'+id+'"'),'Contrôle requis : '+id);
assert(!html.includes('Mode Auto : la netteté et la stabilité'),'Texte explicatif supprimé sans modifier le scanner');
assert(source.includes('getImageData(')&&source.includes('capture.click();'),'Le traitement local précède une seule capture');
assert(source.includes('nextWeigh?.addEventListener(\'click\''),'Validation manuelle conservée');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version),
 'Versions synchronisées dans l’application');
assert(css.includes('iu-gemini-scan-controls')&&css.includes('iu-gemini-scan-state'),
 'Modes et témoin du scanner adaptés à l’interface');
assert(css.includes('.iu-gemini-auto-reset[hidden]'),'La reprise est masquée par défaut');

assert(source.includes("source?.name==='etiquette-gemini.jpg'")&&
 source.includes("source.size<=490000")&&
 source.includes("reader.readAsDataURL(source);"),
 'Capture caméra compacte envoyée sans réencodage JPEG ; galerie conserve son traitement');
assert(source.includes('const factor=Math.min(1,1600/Math.max(crop.width,crop.height))'),
 'La capture est limitée à 1600 pixels pour gagner du temps réseau');
const start=source.indexOf('function inspectAutoFrame(frame){');
const end=source.indexOf('function setAutoHint(',start);
assert(start>0&&end>start,'Contrôles de qualité locaux présents');
const {inspectAutoFrame,autoFrameDistance}=vm.runInNewContext(
 '(function(){'+source.slice(start,end)+';return {inspectAutoFrame,autoFrameDistance};})()'
);
function makeFrame(width,height,type){
 const data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let gray=240;
  if(type==='dark')gray=22;
  if(type==='label'){
   const inside=x>width*.12&&x<width*.87&&y>height*.12&&y<height*.88;
   gray=inside
    ?(y>height*.57&&y<height*.78?(x%4<1?20:235):(y%10<3&&x%25<17?30:234))
    :45;
  }
  const i=(y*width+x)*4;
  data[i]=gray;data[i+1]=gray;data[i+2]=gray;data[i+3]=255;
 }
 return {width,height,data};
}
const blank=inspectAutoFrame(makeFrame(176,90,'blank'));
const dark=inspectAutoFrame(makeFrame(176,90,'dark'));
const label=inspectAutoFrame(makeFrame(176,90,'label'));
assert.equal(blank.usable,false,'Fond blanc uni : ne pas analyser');
assert.equal(dark.usable,false,'Photo sombre : ne pas analyser');
assert.equal(label.usable,true,'Étiquette contrastée et texte reconnaissable : acceptée');
assert.equal(autoFrameDistance(label.pixels,label.pixels),0,'Étiquette immobile');
assert(autoFrameDistance(label.pixels,blank.pixels)>11,'Changement d’étiquette détectable');
assert.equal(autoFrameDistance(null,label.pixels),Infinity,'Première image : stabilité non démontrée');

const tickStart=source.indexOf('function autoTick(){');
const tickEnd=source.indexOf('function selectCameraMode(',tickStart);
const tick=source.slice(tickStart,tickEnd);
assert(tickStart>0&&tickEnd>tickStart,'Boucle automatique présente');
assert(tick.includes("video.readyState>=2"),'Attendre la caméra prête');
assert(tick.includes('getImageData('),'Analyse locale basse résolution');
assert(tick.includes('autoStableCount>=4&&now-autoStableSince>=650'),
 'Plusieurs frames stables sont nécessaires avant capture');
assert(tick.includes('!pilotKey.value.trim()'),'Sans clé pilote, aucune capture automatique envoyée');
assert(tick.includes('autoNeedsChange')&&tick.includes('autoFrameDistance(quality.pixels,autoChangeReference)>11'),
 'Après validation, imposer un changement de scène');
assert(tick.includes('autoLocked=true;')&&tick.includes('capture.click();'),
 'Verrouiller avant de déclencher UNE capture');
assert(!tick.includes('fetch(')&&!tick.includes('imageBase64(')&&!tick.includes('IUGeminiSaveWeigh('),
 'Ne jamais appeler Gemini ou enregistrer une pesée depuis la surveillance vidéo');
const captureStart=source.indexOf("capture.addEventListener('click'");
const captureEnd=source.indexOf("document.addEventListener('visibilitychange'",captureStart);
assert(source.slice(captureStart,captureEnd).includes("setPhoto(new File([blob]"),
 'Caméra auto et manuelle utilisent exactement le même parcours de photo');
assert(source.includes("if(cameraStream&&cameraMode==='auto')armAutoScanner(true);"),
 'Réarmement après validation humaine uniquement');
assert(source.includes('autoSuspended=true;autoLocked=true;lastPhotoWasAuto=false;'),
 'Import de galerie ne lance pas la capture live en parallèle');
assert(source.includes("autoToggle?.addEventListener('change'")&&
 source.includes("selectCameraMode(next)")&&
 source.includes("localStorage.setItem(capturePreferenceKey,next)")&&
 html.includes('type="checkbox" id="iuGeminiAutoToggle" role="switch" checked'),
 'Toggle Auto / Manuel dans les réglages, sélection mémorisée');
assert(!html.includes('id="iuGeminiAutoMode"')&&!html.includes('id="iuGeminiManualMode"'),
 'Les boutons Auto / Manuel du viseur ont disparu');
assert(source.includes('clearAutoTimer();clearAutoStability();'),
 'Arrêter le contrôle en fermant la caméra');
const saveStart=source.indexOf("nextWeigh?.addEventListener('click'");
const saveEnd=source.indexOf('openCamera.addEventListener',saveStart);
assert(saveStart>0&&saveEnd>saveStart&&source.slice(saveStart,saveEnd).includes('window.IUGeminiSaveWeigh('),
 'L’enregistrement Gemini demeure une action de validation');
console.log('Scanner Gemini auto : contraste, netteté, stabilité, non-doublon et validation contrôlés.');
