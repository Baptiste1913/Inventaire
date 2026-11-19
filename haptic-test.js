/* Inventaires U v41.11 — diagnostic haptique iOS strictement expérimental.
   N'active aucun haptique pour les pesées réelles : simple comparaison. */
(()=>{
 'use strict';
 const lab=document.getElementById('iuHapticLab');
 const native=document.getElementById('iuHapticNativeSwitch');
 const synthetic=document.getElementById('iuHapticSyntheticSwitch');
 const label=document.getElementById('iuHapticSyntheticLabel');
 const run=document.getElementById('iuHapticAutomatic');
 const result=document.getElementById('iuHapticResult');
 if(!lab||!native||!synthetic||!label||!run||!result)return;
 native.addEventListener('change',()=>{
  result.textContent='Interrupteur activé. As-tu senti un léger retour haptique ? C’est ce qu’il faut comparer avec le test automatique.';
 });
 let timer=null;
 run.addEventListener('click',()=>{
  if(timer!==null)return;
  // Une vraie lecture de poids survient plus tard qu'un geste utilisateur.
  // Le délai permet d'évaluer exactement cette contrainte sur Safari.
  run.disabled=true;
  result.textContent='Simulation en cours : tentative automatique dans une seconde…';
  timer=setTimeout(()=>{
   timer=null;run.disabled=false;
   if(document.hidden||!lab.open)return;
   try{
    // Ancien contournement de WebKit : click() sur le label du switch.
    // Cela peut changer le checkbox même si le moteur haptique ne vibre pas.
    label.click();
   }catch(_){}
   let vibrationApi=false;
   if(typeof navigator.vibrate==='function'){
    try{vibrationApi=navigator.vibrate(35)===true;}catch(_){}
   }
   result.textContent=vibrationApi
    ?'Commande Vibration API envoyée. As-tu senti une vibration ?'
    :'Clic automatique envoyé. Si rien n’a vibré, iOS bloque probablement cette méthode. Le bouton ne peut pas vérifier lui-même la vibration.';
  },1000);
 });
 window.addEventListener('pagehide',()=>{
  if(timer!==null){clearTimeout(timer);timer=null;run.disabled=false;}
 });
})();