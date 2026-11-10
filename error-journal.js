/* Inventaires U V33.89 — privacy-preserving, device-local error journal UI. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),list=$('iuErrorList');if(!list)return;
 const labels={script:'Erreur de chargement ou d’exécution',promise:'Opération asynchrone interrompue',worker:'Service PWA indisponible',hosting:'Vérification de l’hébergement impossible',service:'Service distant indisponible',update:'Activation de mise à jour non confirmée',storage:'Stockage local indisponible'};
 const api=()=>window.IUTechnicalLogAPI;
 function render(){const rows=api()?.items()||[];$('iuErrorCount').textContent=String(rows.reduce((n,r)=>n+(r.count||1),0));
  list.replaceChildren();if(!rows.length){const p=document.createElement('p');p.className='iu-error-empty';p.textContent='Aucun incident technique enregistré sur cet appareil.';list.append(p);return;}
  rows.forEach(e=>{const row=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('span');
   row.className='iu-error-row';name.textContent=(labels[e.type]||'Incident technique')+(e.count>1?' · ×'+e.count:'');
   date.textContent=new Date(e.at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});row.append(name,date);list.append(row);});
 }
 $('iuErrorClear').addEventListener('click',()=>{api()?.clear();render();});
 $('iuErrorExport').addEventListener('click',()=>{const entries=api()?.items()||[];
  const payload={app:'Inventaires U',kind:'local-technical-errors',version:'33.90',generated:new Date().toISOString(),entries};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='inventaires-u-journal-technique.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 window.addEventListener('iu-technical-log-change',render);render();
})();
