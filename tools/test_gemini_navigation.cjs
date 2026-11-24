'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8'),css=fs.readFileSync('gemini-lab.css','utf8');
const start=js.indexOf(' function isWeighingPage(){'),end=js.indexOf(' async function startCamera(){',start);
const classes=new Set(),panel={hidden:false},document={body:{classList:{contains:k=>classes.has(k)}}};
const state={cameraStream:{},cameraStarting:false,analysisCameraClosed:false,proposal:{grams:1058},file:{},duplicate:true,catalog:true};
let stops=0;
Object.assign(state,{stopCamera(){stops++;state.cameraStream=null;state.cameraStarting=false;state.analysisCameraClosed=false;},closeDuplicateConfirm(){state.duplicate=false;},closeCatalogConfirm(){state.catalog=false;}});
const api=new Function('state','panel','document','with(state){'+js.slice(start,end)+';return {isWeighingPage,syncWeighingPage};}')(state,panel,document);
assert(api.isWeighingPage());api.syncWeighingPage();assert.equal(stops,0);
classes.add('is-focus-mode');assert(api.isWeighingPage());api.syncWeighingPage();assert.equal(stops,0);
const proposal=state.proposal,file=state.file;
for(const mode of ['is-admin-mode','is-events-mode','is-alerts-mode','is-account-mode']){
 classes.add(mode);state.cameraStream={};state.duplicate=true;state.catalog=true;
 assert(!api.isWeighingPage());api.syncWeighingPage();assert.equal(state.cameraStream,null);
 assert(!state.duplicate&&!state.catalog);assert.equal(state.proposal,proposal);assert.equal(state.file,file);
 classes.delete(mode);assert(api.isWeighingPage());api.syncWeighingPage();assert.equal(state.cameraStream,null);
}
assert.equal(stops,4);
panel.hidden=true;state.cameraStarting=true;api.syncWeighingPage();assert(!state.cameraStarting);assert.equal(stops,5);
assert(!api.isWeighingPage());panel.hidden=false;assert(api.isWeighingPage());
assert(js.includes("if(!isWeighingPage()||cameraStarting||active)return;"));
assert(js.includes("if(epoch!==cameraEpoch||!isWeighingPage()){"));
assert(js.includes("routeObserver.observe(document.body,{attributes:true,attributeFilter:['class']})"));
assert(css.includes('body:not(:is(.is-admin-mode,.is-events-mode,.is-alerts-mode,.is-account-mode)) main.app > section#iuGeminiLab.card.calc-card.iu-gemini-standalone:not([hidden])'));
assert(css.includes('body:is(.is-admin-mode,.is-events-mode,.is-alerts-mode,.is-account-mode) main.app > section#iuGeminiLab.card.calc-card.iu-gemini-standalone,'));
assert(css.includes('section#iuGeminiLab.card.calc-card.iu-gemini-standalone[hidden] {\n display:none!important;'));
for(const pair of ['width:52.5%!important;height:66%!important','width:54%!important;height:69%!important','width:52.5%!important;height:72%!important'])assert(css.includes(pair));
console.log('OK : accueil et session visibles, quatre sous-pages masquées, caméra arrêtée sans perte de lecture, halos réduits.');
