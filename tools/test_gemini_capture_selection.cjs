'use strict';
// Vérifier que le contrôle de netteté vise les bonnes zones et qu'une
// image plus nette de la MÊME étiquette est sélectionnée sans nouveau clic.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../gemini-frame-quality.js');
const js=fs.readFileSync('gemini-lab.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const version=JSON.parse(fs.readFileSync('version.json','utf8')).version;
function slice(begin,end){
 const a=js.indexOf(begin),b=js.indexOf(end,a);
 assert(a>=0&&b>a,'Code scanner absent : '+begin);
 return js.slice(a,b);
}
const zoneSource=slice('function qualityZones(view){','function sampleCameraQuality(){');
const geometry=[['rate',.099,.503,.178,.125],
 ['weight',.382,.503,.180,.125],['barcode',.025,.687,.510,.291]];
const zoneCtx={qualityEngine:engine,
 exactGuide:{getBoundingClientRect:()=>({left:95,top:85,width:248,height:184})}};
const qualityZones=vm.runInNewContext(
 'const labelOutlineZones='+JSON.stringify(geometry)+';'+zoneSource+';qualityZones',zoneCtx);
const boxes=qualityZones({left:0,top:0,width:440,height:330});
for(const field of ['ean','weight','rate']){
 const box=boxes[field];assert(box,'Zone '+field+' présente');
 assert(box.w>.03&&box.h>.03,'Zone assez grande pour lire les caractères');
 assert(box.x>=0&&box.y>=0&&box.x+box.w<=1.001&&box.y+box.h<=1.001,
  'Coordonnées normalisées valides');
}
assert(boxes.ean.y>boxes.weight.y&&boxes.weight.x>boxes.rate.x,
 'Le code-barres est sous le poids et le prix à gauche');
const selectSource=slice('async function chooseSharpCameraFrame(epoch){',
 ' // Lecture vidéo locale : reconnaissance du TEXTE');
const identical=new Uint8Array(2048).fill(140);
function candidate(id,score,usable,at=1000){
 return {canvas:{id},rating:{score,usable,gray:identical,
  regions:{ean:score,weight:score,rate:score}},at,epoch:7};
}
async function simulate(frames,cache,settings={}){
 let index=0,delay=[];const context={
  qualityCandidate(){assert(index<frames.length,'Pas de 4e capture');return frames[index++]},
  qualityEngine:settings.noEngine?null:engine,
  qualityCached:cache||null,cameraEpoch:7,document:{hidden:false},
  cameraStream:{},cameraShell:{dataset:{state:'scanning'}},video:{readyState:3},
  lastSelectedQuality:null,
  setTimeout(callback,ms){
   delay.push(ms);
   if(settings.interrupt)context.cameraEpoch=8;
   callback();
  }
 };
 const select=vm.runInNewContext(selectSource+';chooseSharpCameraFrame',context);
 const result=await select(7);
 return {id:result.canvas.id,delay,count:index};
}
(async()=>{
 const blurry=candidate('clic',.24,false);
 const earlier=candidate('avant',.43,true,940);
 const crisp=candidate('après',.66,true,1085);
 let result=await simulate([blurry,crisp],earlier);
 assert.equal(result.id,'après','La photo la plus nette des 3 est choisie');
 assert.deepEqual(result.delay,[85],'Un seul délai additionnel de 85 ms');
 assert.equal(result.count,2,'Deux prises au plus après le clic');
 result=await simulate([blurry,candidate('autre',.27,true,1085)],earlier);
 assert.equal(result.id,'avant','Tampon antérieur plus net utilisé');
 result=await simulate([candidate('bonne',.73,true)],earlier);
 assert.equal(result.id,'bonne','Une bonne image n’attend pas une nouvelle frame');
 assert.equal(result.count,1);assert.deepEqual(result.delay,[]);
 result=await simulate([blurry],earlier,{interrupt:true});
 assert.equal(result.id,'avant','Caméra suspendue : aucune photo après interruption');
 assert.equal(result.count,1);
 result=await simulate([blurry],earlier,{noEngine:true});
 assert.equal(result.id,'clic','Fallback sans module de netteté');
 const capture=slice("capture.addEventListener('click'",
  "document.addEventListener('visibilitychange'");
 assert(capture.includes('const chosen=await chooseSharpCameraFrame(frameEpoch);'));
 assert.equal((capture.match(/cv.toBlob\(/g)||[]).length,1,
  'Une seule photo JPEG générée et transmise à Gemini');
 assert(js.includes('requestVideoFrameCallback')&&
  js.includes("qualityMonitorId=setTimeout(()=>{"),
  'Suivi léger compatible avec Safari');
 assert(js.includes('if(now-qualityLastSampleAt<(qualityRingLimit===4?100:145))return;'),
  'Fréquence de contrôle bornée');
 assert(js.includes('now-qualityLastCachedAt<(qualityRingLimit===4?105:qualityRingLimit>1?160:360)'),
  'Tampon borné et fréquence adaptative');
 assert(js.includes('const factor=Math.min(1,maxEdge/Math.max(crop.width,crop.height))')&&
  js.includes('fullResolutionCameraFrame(localEdge)'),
  'La photo du clic préserve davantage de pixels sans suréchantillonnage');
 assert(js.includes('blob?.size>490000&&Math.max(cv.width,cv.height)>1920')&&
  js.includes("fallback.toBlob(resolve,'image/jpeg',.86)"),
  'Le budget JPEG historique est rétabli automatiquement en cas de surcharge');
 assert(js.includes('stopQualityMonitor();\n   analysisCameraClosed=true;'),
  'Aucune sélection permanente pendant une analyse Gemini');
 const qualityAssetVersion=(html.match(/gemini-frame-quality\.js\?v=([\d.]+)/)||[])[1];
 assert(qualityAssetVersion&&sw.includes('gemini-frame-quality.js?v='+qualityAssetVersion),
  'Le module de netteté est présent dans la page et le cache PWA');
 assert(html.indexOf('gemini-frame-quality.js?v='+qualityAssetVersion)<
  html.indexOf('gemini-lab.js?v='+version),'Module chargé avant le scanner');
 console.log('OK : meilleure photo EAN/poids/prix, 85 ms maxi, une requête JPEG, Safari');
})().catch(e=>{console.error(e);process.exitCode=1});
