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
assert(js.includes("copy.setAttribute('aria-label','Copier le poids brut"),'La copie porte sur le brut vérifié');
assert(html.includes('Nouvelle pesée avec Gemini'),'Titre Gemini explicite');
assert(html.includes('Poids brut à vérifier'),'Poids brut en grand');
assert(html.includes('Poids net calculé'),'Poids net secondaire');
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
assert(html.includes('iu-gemini-auto-disclosure'),'La transmission automatique de la photo doit être annoncée');
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
assert.equal(svg.attrs.viewBox,'0 0 126 83');
const printed=svg.children.filter(node=>node.name==='text');
const digits=printed.filter(node=>node.attrs.class!=='iu-gemini-ean-plu');
assert.equal(digits.length,13,'Les 13 chiffres visibles');
assert.equal(digits.sort((a,b)=>Number(a.attrs.x)-Number(b.attrs.x)).map(node=>node.textContent).join(''),
 original,'Ordre exact 0 + 203476 + 013844');
assert.equal(printed.find(node=>node.attrs.class==='iu-gemini-ean-plu').textContent,
 '3476','PLU vertical conforme à la photo');
const bars=svg.children.filter(node=>node.name==='rect');
assert(bars.length>30&&bars.length<70,'Seulement les modules noirs');
assert(bars.some(node=>node.attrs.height==='61')&&bars.some(node=>node.attrs.height==='52'),
 'Barres de garde prolongées');
render(holder,'0203476013845');
assert.equal(holder.children.length,0,'EAN avec mauvais checksum non dessiné');

console.log('Gemini : analyse automatique, date du jour, EAN DIGI et validation manuelle vérifiés.');
