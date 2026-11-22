'use strict';
// Garde-fous pour la pesée Gemini : l'analyse ne doit jamais enregistrer une pesée.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
const analyzeStart=js.indexOf("analyze.addEventListener('click'");
const analyzeEnd=js.indexOf('function refreshTorch()',analyzeStart);
const confirmStart=js.indexOf("nextWeigh?.addEventListener('click'");
const confirmEnd=js.indexOf("openCamera.addEventListener('click'",confirmStart);
assert(analyzeStart>0&&analyzeEnd>analyzeStart,'Le parcours analyse doit être présent');
assert(confirmStart>0&&confirmEnd>confirmStart,'Le bouton de validation doit être présent');
const analyze=js.slice(analyzeStart,analyzeEnd);
const confirm=js.slice(confirmStart,confirmEnd);
assert(!analyze.includes('IUGeminiSaveWeigh('),'Aucune sauvegarde pendant l’analyse');
assert(confirm.includes('window.IUGeminiSaveWeigh('),'La sauvegarde exige le clic de validation');
assert(confirm.indexOf('validationState()')<confirm.indexOf('window.IUGeminiSaveWeigh('),'Recalculer la tare juste avant de sauvegarder');
assert(confirm.includes('resetReading();'),'La prochaine lecture se prépare après validation');
assert(js.includes("if(proposal&&!window.confirm("),'Ne pas écraser silencieusement une lecture non validée');
assert(js.includes("copyNet?.addEventListener('click'")&&
 html.includes('id="iuGeminiCopyNet"'),
 'Le bouton Copier de la carte classique copie le poids net calculé');
assert(html.includes('Nouvelle pesée avec Gemini'),'Titre Gemini explicite');
assert(html.includes('Brut <strong id="iuGeminiGrossDisplay"')&&
 html.includes('Tare <strong id="iuGeminiTareDisplay"'),
 'Le brut et la tare figurent dans la même carte');
assert(html.includes('<span>Poids net</span>')&&
 html.includes('<strong id="iuGeminiNetDisplay">—</strong>'),
 'Poids net en grand comme dans la pesée classique');
assert(html.includes('id="iuGeminiNext"')&&html.includes('Valider<br>et suivante'),'Bouton unique de validation');
assert(!html.includes('id="iuGeminiTransfer"'),'Ancien double parcours supprimé');
assert(js.includes('iu-gemini-label-frame')&&!js.includes('iu-gemini-details'),'Étiquette miniature directement visible');
assert(html.includes('gemini-lab.js?v='+version)&&html.includes('gemini-lab.css?v='+version),'Assets versionnés dans la page');
assert(sw.includes('gemini-lab.js?v='+version)&&sw.includes('gemini-lab.css?v='+version),'Assets versionnés dans le cache PWA');

const css=fs.readFileSync('gemini-lab.css','utf8');
const vm=require('node:vm');
const photoStart=js.indexOf('function setPhoto(chosen){');
const photoEnd=js.indexOf("photo.addEventListener('change'",photoStart);
const photoSection=js.slice(photoStart,photoEnd);
assert(photoSection.includes('analyze.click();'),'La capture ou l’import déclenche l’analyse automatiquement');
assert(photoSection.includes('!pilotKey.value.trim()'),'Sans clé pilote, aucune analyse ne démarre');
assert(js.includes('todayForVirtualLabel()'),'La date du jour est affichée sur la maquette');
assert(!js.includes('const rawDate=fields.packagingDate'),'La date ancienne de la photo ne doit pas être recopiée');
assert(!html.includes('class="iu-gemini-auto-disclosure"'),'Le long texte du mode Auto est retiré');
assert(html.includes('id="iuGeminiOptions"')&&html.includes('Clé d’accès et confidentialité'),'Les réglages de confidentialité restent accessibles');
assert(css.includes('v41.50 — Pastille Gemini restaurée')&&css.includes('display:inline-flex!important'),'Pastille Gemini restaurée');

// Exécuter le traceur EAN SVG de l'application sur l'étiquette réelle de la carotte.
const traceStart=js.indexOf('function renderEanBars(container,ean){');
const traceEnd=js.indexOf('function display(result,wallMs)',traceStart);
assert(traceStart>=0&&traceEnd>traceStart,'Fonction EAN');
const traceSource=js.slice(traceStart,traceEnd).trim();
class FakeSvgNode {
 constructor(name){this.name=name;this.children=[];this.attrs={};
   this.classList={add:value=>{this.attrs.class=value;}};this.textContent='';}
 setAttribute(key,value){this.attrs[key]=value;}
 append(child){this.children.push(child);}
 replaceChildren(...children){this.children=[...children];}
}
const checksum=(first12)=>{
 if(!/^\d{12}$/.test(first12))return null;
 let sum=0;for(let i=0;i<12;i++)sum+=Number(first12[i])*(i%2===0?1:3);
 return String((10-sum%10)%10);
};
const render=vm.runInNewContext('('+traceSource+')',{
 document:{createElementNS:(_,name)=>new FakeSvgNode(name)},eanCheck:checksum
});
const original='0203476013844';
assert.equal(checksum(original.slice(0,12)),original[12],'EAN de la photo valide');
const holder=new FakeSvgNode('div');
render(holder,original);
assert.equal(holder.children.length,1,'Un seul symbole créé');
const svg=holder.children[0];
assert.equal(svg.name,'svg');
assert.equal(svg.attrs.viewBox,'0 0 150 58');
const printed=svg.children.filter(node=>node.name==='text');
const digits=printed.filter(node=>node.attrs.class!=='iu-gemini-ean-plu');
assert.equal(digits.length,13,'Les 13 chiffres visibles');
assert.equal(digits.sort((a,b)=>Number(a.attrs.x)-Number(b.attrs.x)).map(node=>node.textContent).join(''),
 original,'Ordre exact 0 + 203476 + 013844');
const plu=printed.find(node=>node.attrs.class==='iu-gemini-ean-plu');
assert.equal(plu?.textContent,'3476','PLU vertical conforme à la photo');
assert.equal(plu.attrs['text-anchor'],'middle','PLU centré');
assert.equal(plu.attrs['dominant-baseline'],'middle','PLU centré verticalement');
assert.equal(plu.attrs.transform,'translate(5.6 28) rotate(90)','PLU au centre de la hauteur des barres');
assert.equal(plu.attrs['font-size'],'12','PLU plus grand');
const topLine=svg.children.find(node=>node.name==='line');
assert(topLine,'Barre noire horizontale au-dessus de l’EAN');
assert.equal(topLine.attrs.x1,'15','Barre supérieure commence avec les barres');
assert.equal(Number(topLine.attrs.x2),15+95*1.38,'Barre supérieure sur toute la largeur EAN');
const bars=svg.children.filter(node=>node.name==='rect');
assert.equal(bars.every(node=>node.attrs.width==='1.38'),true,'Tous les modules EAN ont une largeur identique');
assert(bars[0].attrs.x==='15','Le premier module commence après le PLU et le premier chiffre');
assert(css.includes('grid-template-columns:minmax(0,1.16fr) minmax(0,1fr)'),
 'Étiquette : nouveau rapport largeur du code / encadré prix');
assert(css.includes('padding:0 7% 3% 5.9%!important;'),
 'Prix unitaire aligné à gauche avec le début des barres');
assert(css.includes('v41.55 — alignement de la légende Poids net à GAUCHE'),
 'La colonne Poids net reste alignée à gauche avec sa valeur');
assert(css.includes('align-self:flex-end!important;text-align:right!important;'),
 'Date alignée par la droite sur le prix à payer');
assert(css.includes('font-size:clamp(14px,5.8cqw,21px)'),
 'Date agrandie pour correspondre aux caractères de la balance');
assert(css.includes('width:min(100%,306px)'),'Étiquette virtuelle élargie');
assert(bars.length>30&&bars.length<70,'Seulement les modules noirs');
assert(bars.some(node=>node.attrs.height==='52')&&bars.some(node=>node.attrs.height==='44'),
 'Barres de garde prolongées');
render(holder,'0203476013845');
assert.equal(holder.children.length,0,'EAN avec mauvais checksum non dessiné');


const retryStart=js.indexOf('if(!response.ok){',analyzeStart);
const retryEnd=js.indexOf('display(result,performance.now()-start);',retryStart);
assert(retryStart>analyzeStart&&retryEnd>retryStart,'Erreur réseau traitée au niveau de la photo');
const retry=js.slice(retryStart,retryEnd);
assert(retry.includes('attempts.delete(selectedModel)'),'Réessai possible si la réponse du Worker est inexploitable');
assert(retry.includes("analyze.textContent='Réessayer l’analyse'"),'Le bouton de réessai doit être visible');
assert(!retry.includes('analyze.click()'),'Aucun réessai automatiquement facturable');
const cropStart=js.indexOf('function cameraCaptureCrop(');
const cropEnd=js.indexOf("capture.addEventListener('click'",cropStart);
const cropFnEnd=js.indexOf('function inspectAutoFrame(frame){',cropStart);
assert(cropStart>0&&cropEnd>cropFnEnd&&cropFnEnd>cropStart,'Recadrage vidéo et lecteur automatique dédiés à la caméra');
const cropSource=js.slice(cropStart,cropFnEnd).trim()+'\n';
const crop=vm.runInNewContext('('+cropSource+')');
const wide=crop(1920,1080,560,300);
assert(wide.width<1920&&wide.height<=1080,'Éliminer les étiquettes voisines sans zoom excessif');
assert(wide.x>0&&wide.y>=0&&wide.x+wide.width<=1920&&wide.y+wide.height<=1080,'Cadrage dans les bornes de la caméra');
const portrait=crop(1280,1920,300,560);
assert(portrait.x>=0&&portrait.y>=0&&portrait.x+portrait.width<=1280&&portrait.y+portrait.height<=1920,
 'Capture verticale conforme au ratio du viseur');
const captureBlock=js.slice(cropEnd,js.indexOf("document.addEventListener('visibilitychange'",cropEnd));
assert(captureBlock.includes('cameraCaptureCrop(video.videoWidth'),'Le viseur pilote le recadrage');
assert(captureBlock.includes("cv.toBlob(resolve,'image/jpeg',.90)"),'JPEG haute qualité sans réencodage inutile');
assert(captureBlock.includes("setPhoto(new File([blob]"),'La capture revient au même parcours que la galerie');
const worker=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
assert(worker.includes("maxOutputTokens:1024,responseMimeType:'application/json'"),
 'Prévoir une réponse JSON complète sans tronquer Gemini trop tôt');
assert(worker.includes("candidate?.finishReason==='MAX_TOKENS'"),'Réponse tronquée diagnostiquée');
assert(worker.includes("Réponse Gemini vide."),'Réponse vide diagnostiquée');
assert(worker.includes("Réponse Gemini non exploitable."),'Réponse JSON invalide diagnostiquée');


assert.equal(svg.attrs.preserveAspectRatio,'xMidYMax meet',
 'Les chiffres EAN et le PLU ne sont plus étirés ni écrasés');
assert.equal(digits.every(node=>node.attrs.y==='58'),true,
 'La base des chiffres EAN rejoint le bas du cadre Prix à payer');
assert.equal(digits.every(node=>node.attrs['font-size']==='10.5'),true,
 'Les chiffres EAN gardent une typographie de taille constante');
assert.equal(svg.attrs.viewBox,'0 0 150 58',
 'Le ratio du SVG correspond au bloc de code-barres réduit');
assert.equal(topLine.attrs.y1,'-0.3','Barre horizontale remontée de 1 unité SVG');
assert.equal(topLine.attrs.y2,'-0.3','Les deux extrémités de la barre ont été remontées');
assert(css.includes('height:78%!important;'),'La hauteur du prix et du code est réduite à 78%');
assert(css.includes('> .iu-gemini-label-barcode,')&&
 css.includes('> .iu-gemini-label-total {'),'Le prix et le code partagent exactement la même règle de hauteur');
assert(css.includes('padding-bottom:4.4%!important;'),'Une marge sous les valeurs est ajoutée');
assert(css.includes('align-self:flex-end!important;text-align:right!important;'),
 'Les titres et valeurs du poids/date sont alignés par la droite');
assert(css.includes('transform:translateY(-2px)!important;')&&
 css.includes('font-size:clamp(17px,6.6cqw,28px)!important;'),
 'Le nom du produit est légèrement réduit et remonté');

assert(css.includes('v41.56 — Titre et valeur « Date d\'emballage » au même bord droit.'),
 'Règle de finition de la date présente');
assert(css.includes('width:max-content!important;')&&css.includes('margin-right:0!important;'),
 'Le titre Date d\'emballage et la valeur terminent au même bord droit');
assert(svg.attrs.viewBox==='0 0 150 58'&&svg.attrs.preserveAspectRatio==='xMidYMax meet',
 'Le code préserve les proportions tout en s\'ancrant au bas du cadre');

assert(css.includes('v41.57 — Date : libellé et chiffres démarrent sur le même axe gauche.'),
 'Date : règle du nouvel alignement présente');
assert(css.includes('grid-template-columns:max-content!important;')&&
 css.includes('justify-items:start!important;'),
 'Date : le titre et la valeur partagent une même colonne alignée à gauche');
assert(css.includes('transform:translateX(clamp(6px,2.8cqw,10px))!important;'),
 'Poids net et valeur sont déplacés ensemble vers le centre');
console.log('Gemini : date alignée depuis la gauche, Poids net recentré ; tests réussis.');
