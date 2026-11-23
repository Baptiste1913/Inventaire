'use strict';
// v42.29 : vérifier le parcours de sauvegarde courant, les protections
// anti-doublon et la séparation de l'analyse, sans supposer l'ancienne UI.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
function between(start,end){
 const a=js.indexOf(start),b=js.indexOf(end,a);
 assert(a>=0&&b>a,'Bloc manquant : '+start);
 return js.slice(a,b);
}
const analysis=between("analyze.addEventListener('click'","function refreshTorch()");
const next=between("nextWeigh?.addEventListener('click'","openCamera.addEventListener('click'");
const capture=between("capture.addEventListener('click'","document.addEventListener('visibilitychange'");
const save=between("function saveVerifiedProposal({","function announceSaveError(");
assert(!analysis.includes('IUGeminiSaveWeigh('),
 'Une reconnaissance IA ne sauvegarde jamais une pesée');
assert(next.includes('validationState()')&&next.includes('saveVerifiedProposal('),
 'Le bouton Nouvelle pesée valide avant de sauvegarder');
assert(capture.includes('saveVerifiedProposal({')&&capture.includes('priorWasSavable'),
 'Le geste de capture n’enregistre que la pesée précédente déjà validée');
assert(capture.includes("cv.toBlob(resolve,'image/jpeg',.86)"),
 'La capture photo est distincte de la sauvegarde');
assert(capture.includes('const chosen=await chooseSharpCameraFrame(frameEpoch);'),
 'Le déclencheur choisit le cliché le plus net avant la requête Gemini');
assert(js.includes('const crop=cameraCaptureCrop(video.videoWidth,video.videoHeight,'),
 'Le cadrage vidéo reste en haute résolution');
assert(save.includes('catalogProposalCurrent()'),
 'La référence DIGI est revalidée juste avant la sauvegarde');
assert(save.includes('plu:proposal.plu')&&save.includes('catalogPrefix:proposal.catalogPrefix'),
 'L’enregistrement porte le PLU et le préfixe officiels');
assert(save.includes('window.IUGeminiSaveWeigh({')&&
 save.includes('confirmDuplicate:duplicate&&confirmDuplicate'),
 'Les doublons nécessitent une confirmation volontaire');
assert(app.includes('if(duplicate&&payload?.confirmDuplicate!==true)'),
 'La validation des doublons est répétée dans la fonction de stockage');
assert(app.includes("const digi=window.IUDigiCatalogLookup?.resolve(ean);"),
 'La donnée catalogue n’est pas acceptée sur parole');
assert(app.includes('corrected!==expected||payload?.correctedTotalCents!==correctedTotal'),
 'Le code-barres recalculé est contrôlé avant écriture');
assert(html.includes('gemini-lab.js?v='+version));
const catalogAssetVersion=(html.match(/digi-catalog-lookup\\.js\\?v=([\\d.]+)/)||[])[1];
assert(Boolean(catalogAssetVersion),'L’identité DIGI doit être disponible');
assert(sw.includes('digi-catalog-lookup.js?v='+catalogAssetVersion),
 'Cache DIGI et HTML utilisent le même fichier');
assert(js.includes('todayForVirtualLabel()'));
assert(!html.includes('id="iuGeminiCopyGross"'));
console.log('OK : aucune sauvegarde implicite, catalogue DIGI, tare, EAN et doublons protégés');
