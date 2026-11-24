'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8'),html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('gemini-lab.css','utf8');
const start=js.indexOf(' function setLabelAlert(state,message){'),end=js.indexOf(' function validateResult(result)',start);
const classes=new Set(),light={dataset:{state:'idle'},classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},hidden:true};
const label={textContent:''},camera={dataset:{state:'idle'}},state={active:false,file:null,proposal:null,latestLabelFields:null,lastAnalysisError:null,lastSaveError:null,lastReadProblem:null,lastRawResult:null};
const api=new Function('labelAlert','labelAlertText','cameraShell','state','window','showDetectedIndicator','catalogProposalCurrent','with(state){'+js.slice(start,end)+';return {setLabelAlert,refreshLabelAlert,refreshCameraAlert};}')(light,label,camera,state,{IUWeighScanContext:()=>({tareGrams:100}),IUGeminiDuplicateInfo:()=>({duplicate:false})},()=>{},()=>true);
function expect(type,word){assert.equal(light.dataset.state,type);assert.equal(label.textContent,word);assert.equal(light.hidden,false);assert(label.textContent.split(/\s+/).length<=3);}
api.refreshLabelAlert();expect('idle','Caméra désactivée');
camera.dataset.state='scanning';api.refreshCameraAlert();expect('idle','Caméra active');
state.active=true;api.refreshLabelAlert();expect('working','Analyse…');
state.active=false;state.file={};state.latestLabelFields={weightGrams:1058};state.proposal={ean:'0203476013844',grams:1058,plu:3476};
api.refreshLabelAlert();expect('success','Étiquette prête');assert(light.title.includes('PLU 3476'));
camera.dataset.state='idle';api.refreshCameraAlert();expect('success','Étiquette prête');
for(const [type,msg,result,short] of [['warning','Doublon détecté · validation nécessaire','duplicate','Doublon détecté'],['warning','Lecture non validable · Poids lu sur l’étiquette manquant ou invalide.','warning','Données incertaines'],['warning','Tare trop élevée · change de panier','warning','Tare trop élevée'],['warning','Analyse trop longue · réessaie cette photo','warning','Erreur réseau'],['success','Pesée enregistrée','success','Pesée enregistrée'],['warning','Configure la clé Gemini','warning','Clé Gemini requise']]){api.setLabelAlert(type,msg);expect(result,short);assert.equal(light.title,msg);}
state.file=state.proposal=state.latestLabelFields=null;api.refreshCameraAlert();expect('idle','Caméra désactivée');
const pos=html.indexOf('id="iuGeminiLabelAlert"');assert(html.indexOf('id="iuGeminiCameraShell"')<pos&&pos<html.indexOf('class="iu-result-glow-shell iu-gemini-label-shell"'));assert.equal((html.match(/id="iuGeminiLabelAlert"/g)||[]).length,1);
assert(!html.slice(pos,html.indexOf('</div>',pos)).includes(' hidden'));assert(css.includes('min-height:40px!important'));assert(css.includes('> #iuGeminiLabelAlert.is-duplicate {'));
console.log('OK : indicateur permanent, états courts, diagnostic et caméra, doublon orange.');

const cameraStyle=css.match(/\.calc-card \.iu-gemini-camera-shell\.iu-weigh-scan-inline\s*\{([^}]+)\}/)[1];
const statusStyle=css.slice(css.indexOf('/* v42.78')).match(/> #iuGeminiLabelAlert\.iu-gemini-label-alert\s*\{([^}]+)\}/)[1];
for(const property of ['border','background','box-shadow']){
 const read=s=>s.match(new RegExp('(?:^|[;\\s])'+property+':([^;]+);'))[1].replace(/\\s+/g,'');
 assert.equal(read(statusStyle),read(cameraStyle),'Même '+property+' que le cadre caméra');
}
assert(statusStyle.includes('border-radius:13px!important'));
assert(css.includes('animation:iu-v3559-session-glow 2.25s ease-in-out infinite!important'));
assert(css.includes('--iu-alert-dot:#9caab3')&&css.includes('--iu-alert-dot:#34bd8a')&&css.includes('--iu-alert-dot:#e45465')&&css.includes('--iu-alert-dot:#d9a960'));
const idle=html.match(/<button type="button" id="iuGeminiCameraIdle"[\s\S]*?<\/button>/)[0];
assert(idle.includes('iu-gemini-camera-off-icon')&&idle.includes('fill="#fff"')&&idle.includes('aria-label="Activer la caméra, actuellement désactivée"'));
assert(!idle.includes('>Caméra désactivée<'));
assert(idle.includes('id="iuGeminiLoadingChrome"')&&idle.includes('aria-hidden="true"'));
assert(js.includes("cameraIdle.setAttribute('aria-label','Analyse en cours')")&&!js.includes("if(title)title.textContent='Analyse…';"));
assert(css.includes('width:48px!important;height:48px!important')&&css.includes('#iuGeminiCameraShell[data-state="analyzing"] .iu-gemini-camera-stage > #iuGeminiCameraIdle.iu-gemini-camera-idle > canvas#iuGeminiLoadingChrome'));
console.log('OK : cadre identique, halo partagé, icône blanche et analyse préservée.');

assert(statusStyle.includes('margin:3px 0!important'));
assert(css.includes('> #iuGeminiLabelAlert + .iu-result-glow-shell.iu-gemini-label-shell {\n margin-top:1px!important;'));
assert(css.includes('margin:3px 0 1px!important;'));
assert(css.includes('width:32px!important;height:32px!important;flex:none!important;fill:#fff!important;'));
assert(idle.includes('width="32" height="32"'));
console.log('OK : coins 13 px, marges verticales équilibrées, icône 32 px.');

assert(css.includes(':not(:where(#iuGeminiLabStatus)):not(#iuGeminiOuterChrome)'));
const diagnostic=css.slice(css.indexOf('/* v42.80')).match(/> #iuGeminiLabStatus\.iu-gemini-lab-status:not\(:empty\)\s*\{([^}]+)\}/)[1];
assert(diagnostic.includes('position:absolute!important')&&diagnostic.includes('clip-path:inset(50%)!important'));
console.log('OK : diagnostic hors flux dans tous les états, espace stable.');

const section=html.slice(html.indexOf('<section id="iuGeminiLab"'),html.indexOf('</section>',html.indexOf('<section id="iuGeminiLab"')));
assert(section.includes('>service U / Calcul AI</span><h2 id="iu-gemini-section-title">Nouvelle pesée AI</h2>'));
assert(section.includes('id="iuGeminiAIChrome"')&&!section.includes('iu-gemini-title-text')&&!section.includes('iu-gemini-brand-mark'));
const resultEnd=section.indexOf('</article>',section.indexOf('id="iuGeminiLabelPanel"'));
assert(resultEnd>0&&section.indexOf('id="iuGeminiRepair"')>resultEnd);
assert(/<div id="iuGeminiRepair"[^>]* hidden>/.test(section));
for(const id of ['iuGeminiRepairField','iuGeminiRepairRead','iuGeminiRepairEdit','iuGeminiRepairManual','iuGeminiRepairValue','iuGeminiRepairApply'])assert.equal((section.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
const repairStyle=css.slice(css.indexOf('/* v42.84')).match(/> #iuGeminiRepair\.iu-gemini-repair\s*\{([^}]+)\}/)[1];
for(const property of ['border','border-radius','background','box-shadow']){
 const read=s=>s.match(new RegExp('(?:^|[;\\s])'+property+':([^;]+);'))[1].replace(/\\s+/g,'');
 assert.equal(read(repairStyle),read(statusStyle));
}
assert(repairStyle.includes('margin:4px 0 3px!important'));
assert(css.includes('> #iuGeminiRepair.iu-gemini-repair[hidden] {\n display:none!important;'));
console.log('OK : identité AI et commandes de correction sous le résultat, surface et marges harmonisées.');
