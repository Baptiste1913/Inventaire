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
// La caméra doit garantir que la lecture n'est jamais enregistrée sans clic.
const js=require('node:fs').readFileSync('gemini-lab.js','utf8');
assert(js.includes('void readLocalFrame(quality)'), 'La boucle vidéo appelle l’OCR local');
assert(js.includes('localReader.matchTwo(localCandidate,parsed)'),'Deux lectures requises');
assert(js.includes('sendOcrFallback(canvas,valid)'),'Gemini déclenché seulement en secours');
assert(js.includes("if(!pilotKey.value.trim()){") &&
 js.includes('Aucune image envoyée : configure la clé Cloudflare'),
 'Sans clé Cloudflare, aucun envoi distant');
assert(js.includes("nextWeigh?.addEventListener('click'") &&
 js.includes('window.IUGeminiSaveWeigh('),
 'Un clic reste obligatoire pour enregistrer la pesée');
assert(js.includes('autoNeedsChange=Boolean(autoChangeReference)') &&
 js.includes('autoFrameDistance(quality.pixels,autoChangeReference)>18'),
 'Ne pas re-déclencher une analyse sur la même étiquette après validation');
assert(!js.includes('autoStableCount>=4&&now-autoStableSince>=650'),
 'Ancien verrou de visée trop sensible supprimé');
console.log('OCR hybride : cas réels, EAN, arithmétique, deux lectures et secours contrôlé OK.');
