/* Tests de régression : lecture de l'étiquette => brut, sans addition de tare.
   Exécutés sans caméra et sans données d'inventaire réelles. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js','utf8');
const scanner = fs.readFileSync('weigh-scan.js','utf8');
const html = fs.readFileSync('index.html','utf8');
const style = fs.readFileSync('weigh-scan-inline.css','utf8');

const start = app.indexOf('window.IUWeighScanDraft=labelGrams=>{');
const end = app.indexOf('\n};',start);
assert.ok(start > 0 && end > start,'La fonction de préremplissage doit exister');
const transfer = app.slice(start,end+3);

function simulate(grams, tare, entryMode='kg') {
  const input={value:'',inputCount:0,dispatchEvent(){this.inputCount++;}};
  const banner={hidden:true};
  const nodes={grossWeight:input,iuScannedDraftNotice:banner};
  const win={IUWeighScanContext:()=>({tareGrams:tare,entryMode})};
  const env={
    window:win,
    $:id=>nodes[id],
    Number, String,
    fmt:g=>(g/1000).toFixed(3),
    clearTimeout:()=>{},
    Event:class {constructor(type){this.type=type;}},
    flushPending:()=>true,
    clearWeigh:()=>{},
    scannerDraft:false,
    scannerDraftUI:()=>{banner.hidden=false;},
    autoSaveTimer:null,
  };
  vm.createContext(env);
  vm.runInContext(transfer,env);
  const accepted=win.IUWeighScanDraft(grams);
  return {accepted,input,banner,net:grams-tare};
}

let res=simulate(904,200);
assert.equal(res.accepted,true);
assert.equal(res.input.value,'0.904','Le brut doit rester le poids imprimé de 0,904 kg');
assert.equal(res.net,704,'Le net attendu est 904g - 200g');
assert.equal(res.input.inputCount,1,'Le calcul de pesée doit être rafraîchi');
assert.equal(res.banner.hidden,false,'Le brouillon non enregistré doit être affiché');
res=simulate(142,0,'g');
assert.equal(res.input.value,'142','Le mode rapide conserve les grammes');
res=simulate(98,0);
assert.equal(res.input.value,'0.098','Un poids léger reste à trois décimales');
res=simulate(0,100);
assert.equal(res.accepted,false,'Un poids nul est refusé');
assert.match(app,/netGrams=gross-b\.tare/,'La pesée classique soustrait la tare');
assert.match(app,/if\(scannerDraft\)return false/,'Une lecture scanner ne se sauvegarde pas silencieusement');
assert.match(scanner,/\(row\|\|anchor\)\.insertAdjacentElement\('afterend',overlay\)/,'Le scanner reste sous la ligne panier + bouton');
assert.doesNotMatch(scanner,/document\.body\.classList\.add\('iu-weigh-scan-open'\)/,'Pas de panneau plein écran');
assert.match(style,/\.iu-weigh-scan-overlay\.iu-weigh-scan-inline\[hidden\]/,'La mini fenêtre se ferme proprement');
assert.match(html,/weigh-scan-inline\.css\?v=\d+\.\d+/);
assert.match(html,/aria-expanded="false" aria-controls="iuWeighScanOverlay"/);

// Calcul réel de l'application pour 142g - 554g = -412g.
const calcStart=app.indexOf('function calculate(){');
const calcEnd=app.indexOf('\n}\nfunction refreshActionButtons()',calcStart);
assert.ok(calcStart>0&&calcEnd>calcStart,'La fonction calculate doit être accessible');
const elements={
  grossWeight:{value:'0.142'},
  basketSelect:{value:'b1'},
  grossDisplay:{textContent:''},
  tareDisplay:{textContent:''},
  errorMessage:{textContent:''},
  netDisplay:{textContent:'—',classList:{add(){},remove(){}},offsetWidth:0},
  resultHint:{textContent:''},
  copyBtn:{disabled:true}
};
const calcEnv={
  $:id=>elements[id], baskets:[{id:'b1',tare:554}],
  parseWeight:t=>Math.round(Number(t)*1000),
  fmt:g=>(g/1000).toFixed(3),netGrams:null,
  renderWarning:()=>false,refreshActionButtons:()=>{},
};
vm.createContext(calcEnv);
vm.runInContext(app.slice(calcStart,calcEnd+2),calcEnv);
vm.runInContext('calculate()',calcEnv);
assert.equal(calcEnv.netGrams,-412);
assert.equal(elements.netDisplay.textContent,'-0.412');
assert.equal(elements.errorMessage.textContent,'','Une valeur négative autorisée ne doit pas déclencher d’erreur');
assert.match(elements.resultHint.textContent,/Mode essai/);

// Charger une pesée négative ne doit pas l'effacer de l'historique ou du bilan.
const cleanStart=app.indexOf('function cleanWeigh(x){');
const cleanEnd=app.indexOf('\n}',cleanStart);
assert.ok(cleanStart>0&&cleanEnd>cleanStart);
const cleanEnv={Number,String,uid:()=> 'id'};
vm.createContext(cleanEnv);
vm.runInContext(app.slice(cleanStart,cleanEnd+2),cleanEnv);
const valid=vm.runInContext('cleanWeigh({id:"neg1",at:100, gross:142,tare:554,net:-412,name:"Panier"})',cleanEnv);
assert.ok(valid,'La pesée négative cohérente est conservée');
assert.equal(valid.net,-412);
assert.equal(vm.runInContext('cleanWeigh({id:"bad",at:100, gross:142,tare:554,net:-400})',cleanEnv),null,
  'Un poids net incohérent reste rejeté');
assert.match(app,/window\.IUWeighScanPrepareNext=\(\)=>/,'Le scanner peut passer à la pesée suivante');
const showStart=scanner.indexOf('function showProposal(grams){');
const showEnd=scanner.indexOf('function evaluateObservation(',showStart);
assert.ok(showStart>0&&showEnd>showStart);
assert.doesNotMatch(scanner.slice(showStart,showEnd),/close\(\)/,'Une détection ne doit pas fermer la caméra');
assert.match(scanner,/getCapabilities\(\)/,'Détection du focus compatible navigateur');
assert.match(scanner,/focusMode:'continuous'/,'Focus continu optionnel');
assert.match(scanner,/iu-weigh-scan-saved/,'Passage à l’étiquette suivante après validation');

// v40.78 : même bloc pour brut, tare, net ; pas de panneau orange.
assert.match(html,/class="result iu-result-compact"/);
assert.match(html,/id="iuScannedDraftNotice" class="iu-result-confirm" hidden/);
assert.doesNotMatch(html,/id="iuScannedDraftNotice" class="v22-warning"/);
assert.equal((html.match(/id="grossWeight"/g)||[]).length,1);
assert.equal((html.match(/id="grossDisplay"/g)||[]).length,1);
assert.equal((html.match(/id="netDisplay"/g)||[]).length,1);
const scanButtonIndex=html.indexOf('id="iuWeighScanToggle"');
const entryIndex=html.indexOf('class="iu-weigh-entry"');
const resultIndex=html.indexOf('class="result iu-result-compact"');
assert.ok(scanButtonIndex<entryIndex && entryIndex<resultIndex,
 'Champ brut directement entre scanner et bloc de résultat');
const resultEnd=html.indexOf('</div>\n<p aria-live="polite" class="weigh-status"',resultIndex);
assert.ok(resultEnd>resultIndex);
const resultHTML=html.slice(resultIndex,resultEnd);
for(const id of ['grossDisplay','tareDisplay','netDisplay','iuScannedDraftConfirm']){
 assert.ok(resultHTML.includes('id="'+id+'"'),id+' doit être intégré au résultat');
}
assert.match(style,/\.calc-card \.iu-result-compact \.iu-result-weights/);
assert.doesNotMatch(app,/Poids de l’étiquette dans Brut : vérifie ou corrige, puis valide\. Le Net est calculé après déduction de la tare\./);
assert.match(scanner,/proposal\.hidden=transferred/,'Le scanner évite de dupliquer le résultat central');
assert.match(scanner,/window\.addEventListener\('iu-weigh-scan-next'/,
 'Le lecteur reçoit un événement pour la prochaine pesée');

// Tests v40.79 : « Nouvelle pesée » enregistre la lecture AVANT
// d'effacer le champ, puis relance l'OCR sans redémarrer la caméra.
const commitStart=app.indexOf('function commitScannerDraft(){');
const nextStart=app.indexOf('function newWeigh(){',commitStart);
const nextEnd=app.indexOf('\nfunction beginGroup()',nextStart);
assert.ok(commitStart>0&&nextStart>commitStart&&nextEnd>nextStart);
const simulatedSource=app.slice(commitStart,nextEnd);
function simulateNext({failSave=false,anomaly=false,scannerDraft=true}={}){
 const env={
  scannerDraft,
  netGrams:-300,
  grossWeightText:'0.254',
  currentWeighId:null,
  scannerDraftUI(){},
  renderWarning:()=>anomaly,
  clearWeighSavedStyle(){},
  saved:[],
  calls:{cleared:0,flushed:0,focused:0,keptStatus:false},
  window:{dispatched:[],dispatchEvent(event){this.dispatched.push(event.type);}},
  Event:class {constructor(type){this.type=type;}},
  $:id=>id==='iuWeighScanOverlay'?{hidden:false}:
    id==='grossWeight'?{get value(){return env.grossWeightText}}:
    id==='weighStatus'?{textContent:''}:null,
  saveCurrentWeigh(){
   if(failSave)return false;
   env.saved.push(env.grossWeightText);
   env.currentWeighId='weigh-id-1';
   return true;
  },
  clearWeigh(keepSuccess=false){
   env.calls.cleared++;
   env.calls.keptStatus=keepSuccess;
   env.scannerDraft=false;
   env.grossWeightText='';
   env.currentWeighId=null;
  },
  flushPending(){env.calls.flushed++;return true;},
  focusGrossWithoutScroll(){env.calls.focused++}
 };
 vm.createContext(env);
 vm.runInContext(simulatedSource,env);
 vm.runInContext('newWeigh()',env);
 return env;
}
let next=simulateNext();
assert.deepEqual(next.saved,['0.254'],'Le brut OCR doit être enregistré avant effacement');
assert.equal(next.calls.cleared,1,'Champ effacé après sauvegarde');
assert.equal(next.calls.keptStatus,true,'Conserver le bandeau de succès après effacement');
assert.equal(next.calls.flushed,0,'Pas de sauvegarde via le chemin manuel');
assert.equal(next.calls.focused,0,'Pas de clavier affiché en lecture continue');
assert.deepEqual(next.window.dispatched,['iu-weigh-scan-saved','iu-weigh-scan-next']);
next=simulateNext({failSave:true});
assert.equal(next.scannerDraft,true,'Échec stockage : garder le brouillon à corriger');
assert.equal(next.grossWeightText,'0.254','Échec stockage : préserver la valeur reconnue');
assert.equal(next.calls.cleared,0);
assert.equal(next.window.dispatched.length,0,'Échec stockage : ne pas passer au suivant');
next=simulateNext({anomaly:true});
assert.equal(next.saved.length,0,'Avertissement : aucune sauvegarde silencieuse');
assert.equal(next.calls.cleared,0,'Avertissement : conserver le champ');
next=simulateNext({scannerDraft:false});
assert.equal(next.calls.flushed,1,'Garder la trajectoire manuelle');
assert.equal(next.calls.cleared,1);

assert.doesNotMatch(html,/id="iuEanWeighOpen"/,
 'Le raccourci code-barres doit être retiré de la zone de pesée');
assert.match(app,/classList\.add\('v22-message','is-complete'\)/,
 'Reprendre les classes de la confirmation « Inventaire terminé »');
assert.match(app,/className='session-complete-title'/,
 'Reprendre la structure de la confirmation d’inventaire');
assert.match(style,/#weighStatus\.v22-message\.is-complete/,
 'Espacer le bandeau de succès');
assert.match(style,/linear-gradient\(148deg,#f9fbfd/,
 'Accorder la carte caméra au style bleu-gris de l’application');
assert.match(html,/weigh-scan-inline\.css\?v=\d+\.\d+/);
assert.match(scanner,/if\(!resumeScan\(\)\)void startCamera\(\)/);
assert.match(scanner,/if\(stream&&\(!existingTrack\|\|existingTrack\.readyState!=='live'\)\)stopTracks\(\)/,
 'Ne fermer que les flux caméra réellement interrompus');
assert.match(scanner,/if\(!resumeScan\(\)\)void startCamera\(\)/,
 'Réutiliser le flux et le moteur quand ils sont encore ouverts');

assert.match(html,/class="iu-basket-scan-row"/,'Panier et scanner sur une ligne');
assert.match(html,/class="iu-basket-select-wrap"><select id="basketSelect"/);
assert.match(html,/id="iuWeighScanToggle"[^>]*aria-label="Scanner le poids de l’étiquette"/);
const scannerButton=html.match(/<button id="iuWeighScanToggle"[\s\S]*?<\/button>/)?.[0]||'';
assert.ok(scannerButton.includes('<svg'),'Bouton accessible par icône');
assert.doesNotMatch(scannerButton,/<span>/,'Le scanner ne doit plus avoir de texte visible');
assert.match(style,/\.calc-card \.iu-basket-scan-row\s*\{/);
assert.match(style,/\.calc-card \.iu-basket-select-wrap #basketSelect\s*\{/);
assert.match(style,/\.calc-card \.iu-basket-scan-row \.iu-weigh-scan-option #iuWeighScanToggle\s*\{/);
assert.match(html,/class="iu-weigh-scan-toggle new-weigh-btn"/);
assert.match(html,/stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/);
assert.match(style,/#iuWeighScanToggle\.new-weigh-btn svg/);
assert.match(html,/id="iuWeighScanTorch"/,'Flash dans le lecteur de poids');
assert.match(scanner,/getCapabilities\?\.\(\)\.torch===true/,'Torche seulement si prise en charge');
assert.match(scanner,/applyConstraints\(\{advanced:\[\{torch:on\}\]\}\)/,'Activation et désactivation via la piste caméra');
assert.match(scanner,/torchBtn\.hidden=!track/,'Masquer le flash sur appareil incompatible');
assert.match(scanner,/torchEnabled=false;torchBusy=false;/,'Éteindre et réinitialiser à la fermeture');
assert.match(style,/\.iu-weigh-scan-torch\.is-on/,'État visuel flash activé');
assert.doesNotMatch(html,/Vise le poids imprimé en kg/);
assert.doesNotMatch(scanner,/Vise le poids imprimé en kg/);
assert.match(style,/height:184px !important/);
assert.match(style,/height:160px !important/);
assert.match(style,/\.iu-weigh-scan-status:empty/);
assert.match(html,/class="iu-weigh-label-template"/);
assert.match(html,/class="iu-weigh-label-barcode"/);
assert.match(html,/class="iu-weigh-label-price"/);
assert.match(style,/\.iu-weigh-scan-inline \.iu-weigh-label-template/);
assert.match(style,/\.iu-weigh-scan-inline \.iu-weigh-label-metadata/);

// v40.87 : contraste local limité aux images envoyées à Tesseract.
const filterStart=scanner.indexOf('function improveOcrImage(image){');
const filterEnd=scanner.indexOf('function cropFrame(adaptive){',filterStart);
assert.ok(filterStart>0&&filterEnd>filterStart,'Le filtre OCR adaptatif est défini');
const filterEnv={Float64Array,Uint32Array,Math};
vm.createContext(filterEnv);
vm.runInContext(scanner.slice(filterStart,filterEnd)+'\nthis.filter=improveOcrImage;',filterEnv);
const fw=100,fh=40,rgba=new Uint8ClampedArray(fw*fh*4);
for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
 const i=(y*fw+x)*4;
 const background=155+Math.round(40*x/(fw-1));
 const print=(x>=32&&x<53&&y>=14&&y<26)?-52:0;
 rgba[i]=rgba[i+1]=rgba[i+2]=background+print;rgba[i+3]=255;
}
const before=Uint8ClampedArray.from(rgba);
const filtered=filterEnv.filter({width:fw,height:fh,data:rgba});
const pix=(data,x,y)=>data[(y*fw+x)*4];
assert.equal(filtered.data,rgba,'Transformation sans nouvelle allocation de pixels');
assert.equal(rgba[(17*fw+36)*4+3],255,'Le canal alpha est préservé');
assert.equal(rgba[(17*fw+36)*4],rgba[(17*fw+36)*4+1],'Niveaux de gris sur le crop');
assert.ok(pix(rgba,36,17)<pix(rgba,58,17),'Texte plus sombre que le fond');
assert.ok(pix(rgba,58,17)-pix(rgba,36,17)>pix(before,58,17)-pix(before,36,17),
 'Renforcement modéré du contraste texte / papier');
assert.ok(Math.abs(pix(rgba,10,2)-pix(rgba,90,2))<
 Math.abs(pix(before,10,2)-pix(before,90,2)),
 'Compensation des différences de luminosité du papier');
assert.match(scanner,/const canvas=cropFrame\(variant===0\)/,
 'Traitement adaptatif au premier essai');
assert.match(scanner,/if\(adaptive\)\{/,'Second essai OCR sans filtre');
assert.doesNotMatch(scanner,/filter:\s*contrast\(/,
 'Ne pas modifier la caméra affichée');

// v40.88 : guide aligné avec l'image analysée, boutons accolés et bloc compact.
const scannerHeader=html.slice(html.indexOf('<header class="iu-weigh-scan-header">'),
 html.indexOf('</header>',html.indexOf('<header class="iu-weigh-scan-header">')));
assert.match(scannerHeader,/id="iuWeighScanClose"[\s\S]*id="iuWeighScanTorch"/,
 'Fermer et flash côte à côte dans l’en-tête');
assert.doesNotMatch(scannerHeader,/Lecture du poids en direct|Caméra prête pour plusieurs étiquettes/,
 'Supprimer les textes visibles de l’en-tête');
const scannerCamera=html.slice(html.indexOf('<div class="iu-weigh-scan-camera">'),
 html.indexOf('<div class="iu-weigh-scan-bottom">'));
assert.doesNotMatch(scannerCamera,/id="iuWeighScanTorch"/,
 'Le flash ne doit plus masquer l’aperçu');
assert.match(scannerCamera,/id="iuWeighScanStatus"/,
 'Les messages importants restent accessibles dans la caméra');
assert.match(html,/class="iu-weigh-label-store"/,'Repère magasin en haut à droite');
assert.match(style,/inset:52% auto auto 37% !important/,'Recentrage vertical de la zone poids');
assert.match(style,/width:26% !important/,'Zone poids resserrée');
assert.match(scanner,/const videoRect=video\.getBoundingClientRect\(\),guideRect=guide\.getBoundingClientRect\(\)/,
 'Le crop suit le repère OCR affiché');
assert.match(scanner,/const x=Math\.max\(0,guideRect\.left-videoRect\.left\)/,
 'Découpage OCR basé sur les coordonnées réelles du guide');
assert.doesNotMatch(scanner,/const x=cw\*\.23,y=ch\*\.42/,
 'Plus de cadrage OCR figé à l’ancienne position');
assert.match(style,/\.iu-weigh-scan-bottom:has\(/,
 'La marge inférieure est retirée sauf si une action de secours est nécessaire');
assert.match(style,/\.iu-weigh-scan-camera \.iu-weigh-scan-status:not\(\.is-error\)/,
 'Statut normal masqué, erreurs conservées');
const scanOverlayHTML=html.slice(html.indexOf('id="iuWeighScanOverlay"'),
 html.indexOf('id="iuEanOverlay"'));
assert.doesNotMatch(scanOverlayHTML,/Poids détecté\.|Lecture du poids en direct|Caméra prête pour plusieurs étiquettes/,
 'Aucun texte de lecture superflu dans le lecteur OCR');
assert.doesNotMatch(scanner,/Poids détecté\.|Pesée enregistrée · caméra prête\./,
 'Pas de statut superflu');
assert.match(html,/weigh-scan-inline\.css\?v=\d+\.\d+/);
assert.match(html,/weigh-scan\.js\?v=\d+\.\d+/);
console.log('Tests scanner v40.80 : sauvegarde Nouvelle pesée, échecs de stockage, avertissements, statut et design : OK');
