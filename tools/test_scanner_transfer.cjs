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
assert.match(scanner,/anchor\.insertAdjacentElement\('afterend',overlay\)/,'Le scanner se trouve dans la carte de pesée');
assert.doesNotMatch(scanner,/document\.body\.classList\.add\('iu-weigh-scan-open'\)/,'Pas de panneau plein écran');
assert.match(style,/\.iu-weigh-scan-overlay\.iu-weigh-scan-inline\[hidden\]/,'La mini fenêtre se ferme proprement');
assert.match(html,/weigh-scan-inline\.css\?v=40\.77/);
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
console.log('Tests scanner v40.77 : négatifs, historique, contrôle manuel, caméra réutilisée : OK');
