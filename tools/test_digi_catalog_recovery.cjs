'use strict';
/* v42.44 — rapprochement local DIGI, récupération prudente, guidage Gemini. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let catalog=JSON.stringify({articles:[
 {plu:'3476',libelle:'POIRE SANTA MARIA',eanPrefix:'0203476'},
 {plu:'8325',libelle:'COURGETTE',eanPrefix:'0205655'},
 {plu:'9991',libelle:'BANANE CAVENDISH',eanPrefix:'2453091'}
]});
global.localStorage={getItem:key=>{
 assert.equal(key,'iu-plu-catalogue-local-v1');return catalog;
}};
const digi=require('../digi-catalog-lookup.js');
const js=fs.readFileSync('gemini-lab.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('gemini-lab.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const worker=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
function code(prefix,cents){
 const first=prefix+String(Math.round(cents*655.36/100)).padStart(5,'0');
 let sum=0;for(let i=0;i<12;i++)sum+=Number(first[i])*(i%2?3:1);
 return first+String((10-sum%10)%10);
}
const ean=code('0203476',299);
assert.equal(digi.resolve(ean).name,'POIRE SANTA MARIA');
const autoMask=ean.slice(0,12)+'?';
const manualMask='02034?6'+ean.slice(7,11)+'??';
const badMask='0203476'+'99999'+'?';
assert.equal(autoMask.length,13);
assert.equal(manualMask.length,13);
assert.equal(digi.observedPattern(autoMask),autoMask);
assert.equal(digi.observedPattern('012345678912'),'', 'Ne pas décaler les chiffres d un EAN tronqué');
assert.equal(digi.observedPattern('02a34?6019???'),'');
const suggested=digi.candidates({eanObserved:manualMask,name:'Poire Santa Mara'});
assert.equal(suggested.length,1);
assert.equal(suggested[0].eanPrefix,'0203476');
assert(suggested[0].nameScore>.85,'Le nom peut départager les candidats');
assert.equal(digi.candidates({eanObserved:'02099?60196??',name:'POIRE SANTA MARIA'}).length,0,
 'Un nom approchant ne force JAMAIS un préfixe contradictoire');
const fields={name:'Poire Santa Mara',ean13:null,weightGrams:1000,
 pricePerKgCents:299,totalCents:null};
const auto=digi.reconstruct({fields,eanObserved:autoMask});
assert.equal(auto.kind,'reconstructed');
assert.equal(auto.result.fields.ean13,ean);
assert.equal(auto.result.fields.totalCents,299,'Montant calculable à partir de données lues');
assert.equal(auto.sources.total,'calculated');
assert.equal(auto.sources.weight,'read');
assert.equal(auto.sources.rate,'read');
assert.equal(auto.sources.ean,'calculated-verified');
// Un montant arrondi ne représente PAS un seul EAN de prix.
const ambiguousAmount=digi.reconstruct({fields,eanObserved:ean.slice(0,9)+'????'});
assert.equal(ambiguousAmount.kind,'confirmation');
assert(ambiguousAmount.variantCount>1);
assert.equal(ambiguousAmount.result.fields.ean13,null);
const variants=digi.amountVariants('0203476',299,299,'0203476??????');
assert(variants.length>1&&variants.includes(ean));
const variant=variants.find(x=>x!==ean);
const variantRead=digi.reconstruct({fields,eanObserved:variant.slice(0,12)+'?'});
assert.equal(variantRead.kind,'reconstructed');
assert.equal(variantRead.result.fields.ean13,variant,'Un EAN non canonique réellement compatible est récupérable');
const five=digi.reconstruct({fields,eanObserved:'0203??6'+ean.slice(7)});
assert.equal(five.kind,'confirmation','Préfixe 5/7 et nom concordant : validation humaine');
assert.equal(five.result.fields.ean13,null);
assert.equal(digi.reconstruct({fields:{...fields,name:''},eanObserved:'0203??6'+ean.slice(7)}).kind,'candidate');
assert.equal(digi.reconstruct({fields,eanObserved:variant.slice(0,12)+'?',weakEANSupplement:true}).kind,'confirmation');
assert.equal(digi.reconstruct({fields,eanObserved:'0203???'+ean.slice(7)}).result.fields.ean13,null);
const maybe=digi.reconstruct({fields,eanObserved:manualMask});
assert.equal(maybe.kind,'confirmation','Préfixe 6/7 : pas de sauvegarde directe');
assert.equal(maybe.result.fields.ean13,null,'Le candidat reste en attente');
assert.equal(maybe.proposedEAN,ean);
const approved=digi.reconstruct({fields,eanObserved:manualMask},{allowProbable:true});
assert.equal(approved.result.fields.ean13,ean,'Confirmation humaine volontaire');
assert.equal(approved.sources.ean,'confirmed-by-user');
assert.equal(digi.reconstruct({fields:{...fields,weightGrams:null},
 eanObserved:autoMask}).result.fields.ean13,null,'Jamais de poids deviné');
assert.equal(digi.reconstruct({fields:{...fields,pricePerKgCents:null},
 eanObserved:autoMask}).result.fields.ean13,null,'Jamais de prix/kg deviné');
assert.equal(digi.reconstruct({fields:{...fields,totalCents:180},
 eanObserved:autoMask}).kind,'conflict','Montant réel et calcul incompatibles');
assert.equal(digi.reconstruct({fields,eanObserved:badMask}).kind,'conflict',
 'Une suite de chiffres imprimés contradictoires interdit la reconstruction');
assert.equal(digi.reconstruct({fields:{...fields,ean13:code('0205655',299)},
 eanObserved:autoMask}).kind,'conflict','EAN complet contradictoire refusé');
assert.equal(digi.reconstruct({fields,eanObserved:''}).result.fields.ean13,null,
 'Le seul nom ne fabrique aucun EAN');
assert.equal(digi.reconstruct({fields:{...fields,name:'COURGETTE'},
 eanObserved:autoMask}).kind,'conflict',
 'Nom d un autre article du catalogue = contradiction, pas devinette');
assert.equal(digi.reconstruct({fields,eanObserved:'2453091'+
 code('2453091',299).slice(7,11)+'??'}).result.fields.ean13,null,
 'Famille non-02 : pas de formule de prix supposée');
catalog=JSON.stringify({articles:[
 {plu:'3476',libelle:'POIRE SANTA MARIA',eanPrefix:'0203476'},
 {plu:'1234',libelle:'POIRE AUTRE',eanPrefix:'0203476'}
]});
assert.equal(digi.resolve(ean).status,'ambiguous');
assert.notEqual(digi.reconstruct({fields,eanObserved:autoMask}).kind,'reconstructed',
 'Préfixe associé à plusieurs produits : pas de sélection silencieuse');
catalog=JSON.stringify({articles:[
 {plu:'3476',libelle:'POIRE SANTA MARIA',eanPrefix:'0203476'},
 {plu:'5678',libelle:'POIRE SANTA MARIA',eanPrefix:'0203576'}
]});
assert.notEqual(digi.reconstruct({fields:{...fields,ean13:ean},eanObserved:ean}).kind,'conflict',
 'Deux références partageant un nom ne rendent pas un EAN complet contradictoire');
const generic=digi.reconstruct({fields,eanObserved:'0203??6'+ean.slice(7,12)+'?'});
assert.equal(generic.kind,'candidate','Deux références compatibles : le nom seul ne choisit pas une origine');
catalog=JSON.stringify({articles:[
 {plu:'3476',libelle:'POIRE SANTA MARIA',eanPrefix:'0203476'},
 {plu:'9991',libelle:'BANANE CAVENDISH',eanPrefix:'2453091'}
]});
const guide=digi.recheckPlan({fields,eanObserved:ean.slice(0,9)+'????'});
assert.equal(guide.candidates[0].eanPrefix,'0203476');
assert.deepEqual(guide.positions,[10,11,12,13]);
const typo='0209476'+ean.slice(7);
const near=digi.recheckPlan({fields,eanObserved:typo});
assert(near.candidates.some(c=>c.eanPrefix==='0203476'));
assert(near.positions.includes(4));
assert.equal(digi.reconstruct({fields,eanObserved:typo}).result.fields.ean13,null,
 'Un préfixe proche aide uniquement la relecture');
const other=digi.reconstruct({fields:{...fields,name:'BANANE CAVENDISH'},eanObserved:'245309100123?'});
assert.equal(other.kind,'reconstructed');
assert(other.result.fields.ean13.startsWith('245309100123'));
assert(digi.eanValid(other.result.fields.ean13));
catalog=JSON.stringify({articles:[{plu:'7777',libelle:'NOUVEL ARTICLE',eanPrefix:'0203476'}]});
assert.equal(digi.candidates({eanObserved:ean,name:fields.name})[0].plu,'7777','Cache invalidé par import');
catalog=null;
assert.equal(digi.reconstruct({fields,eanObserved:autoMask}).result.fields.ean13,null,
 'Catalogue absent : pas de nom ou code inventés');
assert.equal(digi.candidates({name:'POIRE SANTA MARIA'}).length,0);
const v=version;
for(const ref of ['gemini-lab.js','digi-catalog-lookup.js','gemini-lab.css']){
 assert(html.includes(ref+'?v='+v));
 assert(sw.includes(ref+'?v='+v));
}
assert(html.includes('id="iuGeminiCatalogConfirm"'));
assert(html.includes('id="iuGeminiCatalogAccept">Confirmer l’article</button>'));
assert(css.includes(':is(#iuGeminiDuplicateConfirm,#iuGeminiCatalogConfirm)'),
 'Même animation et boutons que le popup doublon');
assert(js.includes('function catalogHints(')&&js.includes('function applyCatalogRecovery('));
assert(js.includes('function openCatalogConfirm()'));
assert(js.includes('allowProbable:true'));
assert(js.includes('catalogCandidates:catalogCandidates.slice(0,5)'),
 'Pas de catalogue entier envoyé dans le JSON cloud');
assert(js.includes('catalogHints(combined,localBarcode)'),
 'Les candidats sont envoyés seulement pour la relecture ciblée');
assert(worker.includes('eanObserved')&&worker.includes('catalogCandidates'));
assert(worker.includes('ne complète pas les chiffres EAN par le catalogue'),
 'Le prompt ne doit pas demander à Gemini d halluciner un EAN');
assert(!js.includes('window.IUGeminiSaveWeigh({catalogCandidates'),
 'Les candidats ne sont pas sauvegardés comme preuves');
const app=fs.readFileSync('app.js','utf8');
assert(js.includes('digiEvidence:lastRawResult?.digiRecovery?.sources||null'),
 'La provenance des valeurs doit accompagner la pesée');
assert(app.includes('digiEvidence:evidence,digiRecoveryKind:recoveryKind'),
 'L historique conserve une provenance informative, sans confiance supplémentaire');
assert(app.includes('if(!digi?.ok||digi.plu!==plu||digi.name!==product'),
 'La provenance ne contourne jamais les validations d identité');
assert(js.includes('const unresolvedEAN=(targets.includes'));
assert(js.includes('if(merged.conflict||!merged.pattern||merged.pattern===result.eanObserved)return result;'));
assert(js.includes('checks.secondaryEANConflict=true'));
assert(js.includes('recoveryInterruptedTargets:[...targets]'));
assert(css.includes('small#iuGeminiCatalogDescription')&&css.includes('clip-path:none!important'));
console.log('OK : variantes de montant, préfixes 5/7 à 7/7, confirmation EAN exact, noms partagés et priorité DIGI');
