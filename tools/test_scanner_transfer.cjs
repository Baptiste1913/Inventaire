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
assert.match(html,/weigh-scan-inline\.css\?v=40\.83/);
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
assert.match(html,/weigh-scan-inline\.css\?v=40\.83/);
assert.match(scanner,/if\(!resumeScan\(\)\)void startCamera\(\)/);
assert.match(scanner,/if\(stream&&worker\)\{resumeScan\(\);return;\}/,
 'Réutiliser le flux et le moteur déjà ouverts');

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
console.log('Tests scanner v40.80 : sauvegarde Nouvelle pesée, échecs de stockage, avertissements, statut et design : OK');
