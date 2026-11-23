'use strict';
const assert=require('node:assert/strict');
const ocr=require('../gemini-local-ocr.js');
// Représentations de véritables étiquettes DIGI fournies durant le projet.
// Les tests n'envoient aucune image et ne dépendent pas du réseau.
const carotte=[
 'SUPER U',
 '10120 ST GERMAIN',
 'CAROTTE',
 'Prix unitaire  Poids net  Date d’emballage',
 '1,99€/Kg  1,058 kg  20.11.2026',
 '0 203476 013844',
 'PRIX A PAYER 2,11€'
].join('\n');
const banane=[
 'SUPER U','10120 ST GERMAIN','BANANE CAVENDISH',
 '0,99€/kg','0,488 kg',
 '2 824059 003151',
 'PRIX A PAYER 0,48€'
].join('\n');
const carrot=ocr.parse(carotte,{confidence:90});
assert.deepEqual(carrot?.fields,{
 name:'CAROTTE',weightGrams:1058,pricePerKgCents:199,
 totalCents:211,ean13:'0203476013844'
});
assert.equal(carrot.checks.arithmeticConsistent,true);
assert.equal(carrot.checks.eanChecksumValid,true);
assert.equal(carrot.source,'local');
assert(ocr.parse(banane,{confidence:88})?.fields.name==='BANANE CAVENDISH');
assert(ocr.matchTwo(carrot,ocr.parse(carotte,{confidence:79})),
 'Une lecture locale ne peut être acceptée qu’après deux décodages concordants');
assert(!ocr.matchTwo(carrot,ocr.parse(banane,{confidence:90})),
 'Deux articles différents ne peuvent pas se confirmer l’un l’autre');
assert.equal(ocr.parse(carotte,{confidence:40}),null,'Confiance OCR trop faible : refus');
assert.equal(ocr.parse(carotte.replace('2,11€','2,19€'),{confidence:90}),null,
 'Refuser un prix qui ne correspond pas au produit poids × tarif');
assert.equal(ocr.parse(carotte.replace('013844','013845'),{confidence:90}),null,
 'Checksum EAN différent : refus');
assert.equal(ocr.parse(carotte.replace('013844','013844'),{confidence:90,barcode:'0203476013844'}).fields.ean13,
 '0203476013844','EAN décodé et OCR identiques');
assert.equal(ocr.parse(carotte,{confidence:90,barcode:'2824059003151'}),null,
 'Un code barre décodé différent du texte OCR bloque la lecture');
assert.equal(ocr.parse(carotte.replace('0 203476 013844',''),{confidence:90}),null,
 'Absence d’EAN : impossible de valider une pesée locale');
assert.equal(ocr.parse(carotte.replace('CAROTTE','CAROTTE\nBANANE CAVENDISH'),{confidence:90}),null,
 'Deux noms d’articles sur la même image : demander Gemini, pas deviner');
assert.equal(ocr.parse(carotte.replace('1,99€/Kg','Prix : non reconnu'),{confidence:90}),null,
 'Tarif au kilo absent : aucune valeur inférée');
assert.equal(ocr.parse(carotte.replace('2,11€','2,10€'),{confidence:90}),null,
 'Arithmétique locale exacte exigée');
assert.equal(ocr.eanValid('0203476013844'),true);
assert.equal(ocr.eanValid('0203476013845'),false);
// Le module OCR local est conservé pour le contrôle des étiquettes,
// mais la reconnaissance IA principale v42 est Gemini, jamais un
// raccourci de pesée automatique par deux OCR locaux.
const js=require('node:fs').readFileSync('gemini-lab.js','utf8');
assert(js.includes("providerSelect?.value==='hydrogen'?hydrogenModel:fixedModel"),
 'Gemini reste le moteur par défaut, Mistral est activé manuellement');
assert(js.includes("cameraMode='manual';"),
 'La prise de photo manuelle reste explicite');
assert(js.includes('sendOcrFallback(canvas,valid)'),
 'Une photo du mode expérimental passe également par Gemini');
assert(js.includes("nextWeigh?.addEventListener('click'") &&
 js.includes('window.IUGeminiSaveWeigh('),
 'Aucune sauvegarde ne contourne la validation manuelle');
assert(js.includes('IUDigiCatalogLookup?.resolve'),
 'Le module OCR ne remplace pas le catalogue DIGI');
console.log('OK : OCR local prudent et priorité Gemini, validation humaine');
