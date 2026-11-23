'use strict';
// v42.41 : popup anti-doublon et indicateur de lecture du viseur.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('gemini-lab.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const app=fs.readFileSync('app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
function between(start,end){
 const i=js.indexOf(start),j=js.indexOf(end,i+start.length);
 assert(i>=0&&j>i,'Bloc attendu : '+start);
 return js.slice(i,j);
}
assert.equal((html.match(/id="iuGeminiDuplicateConfirm"/g)||[]).length,1);
assert(html.includes('role="dialog" aria-modal="true"'));
assert(html.includes('id="iuGeminiDuplicateCancel">Annuler</button>'));
assert(html.includes('id="iuGeminiDuplicateAccept">Valider la pesée</button>'));
assert(!html.includes('id="iuGeminiDuplicateSkip"'),'Ancien bouton Ignorer supprimé');
assert(html.includes('data-indicator-icon="success"'));
assert(html.includes('data-indicator-icon="duplicate"'));
assert(html.includes('data-indicator-icon="error"'));
assert(css.includes('button#iuGeminiCapture.iu-weigh-scan-close.iu-gemini-shutter {\n left:auto!important;\n right:5px!important;'));
assert(css.includes('> #iuGeminiDetected.iu-weigh-scan-detected-indicator {\n left:5px!important;\n right:auto!important;'));
assert(css.includes('data-indicator="duplicate"')&&css.includes('data-indicator="error"'));
assert(css.includes('#iuGeminiDuplicateConfirm.iu-gemini-duplicate-overlay[hidden]'));
const validation=between(' function validationState(){', " $('basketSelect')?.addEventListener('change',validationState);");
assert(validation.includes("showDetectedIndicator('duplicate'"));
assert(validation.includes("showDetectedIndicator('error'"));
assert(validation.includes('revealDetectedIndicator(latestLabelFields)'));
assert(validation.includes('openDuplicateConfirm()'));
assert(validation.includes('generation!==lastDuplicatePromptGeneration'),
 'Une erreur de stockage ne doit pas rouvrir la popup automatiquement');
const next=between(" nextWeigh?.addEventListener('click'", " openCamera.addEventListener('click'");
assert(next.includes('if(duplicateForCurrent()){openDuplicateConfirm();return;}'));
assert(!next.includes('confirmDuplicate:true'),'Aucun passage en force depuis Nouvelle photo');
const capture=between(" capture.addEventListener('click'", " document.addEventListener('visibilitychange'");
assert(capture.includes('if(hasSavableProposal()&&duplicateForCurrent())'));
assert(capture.includes('saveVerifiedProposal({fromCapture:true})'));
assert(!capture.includes('confirmDuplicate:true'),'Le déclencheur ne confirme jamais un doublon');
const actions=between(" function openDuplicateConfirm(){", " nextWeigh?.addEventListener('click'");
assert(actions.includes('saveVerifiedProposal({confirmDuplicate:true})'));
assert(actions.includes("resetReading();"));
assert(actions.includes("duplicateCancel?.addEventListener('click',cancelDuplicateConfirm)"));
assert(app.includes('if(duplicate&&payload?.confirmDuplicate!==true)'),
 'Le stockage refuse encore les doublons sans confirmation');
let focusCount=0,resetCount=0,saveCount=0;
const context={
 active:false,duplicateDialogOpen:false,generation:1,lastDuplicatePromptGeneration:-1,
 duplicateDialog:{hidden:true},
 correctedCurrentProposal:()=>({ean:'ok'}),duplicateForCurrent:()=>true,
 refreshCaptureButton:()=>{},duplicateCancel:{focus:()=>focusCount++},
 resetReading:()=>resetCount++,say:()=>{},cameraStream:null,
 cameraShell:{hidden:false},capture:{focus:()=>{}}
};
vm.createContext(context);
const functions=between(" function openDuplicateConfirm(){"," duplicateCancel?.addEventListener('click'");
vm.runInContext(functions+"\nthis.openPrompt=openDuplicateConfirm;this.cancelPrompt=cancelDuplicateConfirm;",context);
assert.equal(context.openPrompt(),true,'La fenêtre s’ouvre sur un doublon prêt');
assert.equal(context.duplicateDialog.hidden,false);
assert.equal(focusCount,1,'Le choix le plus sûr reçoit le focus');
assert.equal(context.lastDuplicatePromptGeneration,1,'Un seul affichage automatique par photo');
assert.equal(context.openPrompt(),false,'Pas de seconde fenêtre simultanée');
context.cancelPrompt();
assert.equal(context.duplicateDialog.hidden,true,'Annuler referme la fenêtre');
assert.equal(resetCount,1,'Annuler efface le brouillon courant');
assert.equal(saveCount,0,'Annuler ne sauvegarde aucune pesée');
assert(html.indexOf('id="iuGeminiDuplicateConfirm"')<html.indexOf('id="iuGeminiLab"'),
 'La fenêtre doit être hors de la carte caméra pour éviter le clipping');
context.correctedCurrentProposal=()=>null;
assert.equal(context.openPrompt(),false,'Pas de dialogue si pesée invalide');
context.correctedCurrentProposal=()=>({ean:'ok'});
context.duplicateForCurrent=()=>false;
assert.equal(context.openPrompt(),false,'Pas de fenêtre sans doublon');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version));
assert(sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version));
console.log('OK : popup doublon volontaire, annulation sans sauvegarde, états et position du viseur');
