/* Do not execute application code before the authoritative IndexedDB data is loaded. */
(async()=>{try{
 await window.InventairesIDB.init();
 for(const file of ['auth.js','app.js']){
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./'+file+'?v=34.2';s.onload=resolve;s.onerror=()=>reject(Error('Chargement impossible : '+file));document.head.appendChild(s);});
 }
}catch(e){console.error('Démarrage V34 interrompu',e);document.body.insertAdjacentHTML('afterbegin','<div role="alert" style="padding:20px;background:#fff1f0;color:#8b1515;font-weight:bold">Impossible de charger IndexedDB. Aucune donnée n’a été modifiée. Vérifie le stockage du navigateur et recharge la page.</div>');}})();
