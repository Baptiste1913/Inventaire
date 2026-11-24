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
assert(css.includes(':is(#iuGeminiDuplicateConfirm,#iuGeminiCatalogConfirm).iu-gemini-duplicate-overlay[hidden]'));
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
// v42.42 — libellés Gemini, erreur simplifiée, style de fin de session
// et apparition en glissant au-dessus de la barre de navigation.
assert(html.includes('<span class="section-kicker">SERVICE U / CALCUL IA</span>'));
assert(html.includes('id="iu-gemini-section-title">Nouvelle pesée via Gemini</h2>'));
assert(html.includes('<span class="iu-gemini-title-text">Gemini</span>'));
assert(!html.includes('<span class="iu-gemini-title-text">IA</span>'));
const alertCode=between(' function setLabelAlert(state,message){',' function duplicateForCurrent(){');
const originalError='Lecture non validable · Poids lu sur l’étiquette manquant ou invalide.';
assert(alertCode.includes("?'Données incertaines':message"));
assert(js.includes("return {error:'Poids lu sur l’étiquette manquant ou invalide.'}"),
 'Le diagnostic métier n’est pas dégradé en changeant le texte');
const alertPanel={dataset:{state:'idle'},classList:{toggle(){}},hidden:true};
const alertText={textContent:''};
const alertEnv={labelAlert:alertPanel,labelAlertText:alertText,active:false,
 showDetectedIndicator:()=>{}};
vm.runInNewContext(alertCode+';setLabelAlert',alertEnv);
assert.equal(alertEnv.setLabelAlert('warning',originalError),undefined);
assert.equal(alertText.textContent,'Données incertaines',
 'Le message de poids erroné est court pour les utilisateurs');
alertEnv.setLabelAlert('warning','Tare trop élevée · change de panier');
assert.equal(alertText.textContent,'Tare trop élevée · change de panier',
 'Les autres erreurs restent explicites');
assert(css.includes('animation:iuGeminiDuplicateRiseV4242 .48s'),
 'Animation de remontée du doublon présente');
assert(css.includes('padding:10px 14px calc(82px + max(3px'),
 'La popup est placée au-dessus du dock et de la safe area iOS');
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),
 'Mêmes dimensions de boutons que la fin d’inventaire');
assert(css.includes('background:linear-gradient(145deg,#fff 0%,#f8fafb 35%,#e7edf1 100%)!important'),
 'Même fond neumorphique que le bloc Fin d’inventaire');
assert(css.includes('body.is-focus-mode .app > #iuGeminiDuplicateConfirm'),
 'La popup ne doit pas être masquée lors d’une session active');
assert(css.includes('font-size:12.5px!important')&&css.includes('color:#83909a!important'),
 'Légende du brut +2px et couleur de la confidentialité');
assert(css.includes('font-size:clamp(23px,6.3vw,28px)!important')&&
 css.includes('font-weight:900!important'),
 'Le poids brut doit être plus grand et plus gras');

console.log('OK : popup doublon volontaire, annulation sans sauvegarde, états et position du viseur');
