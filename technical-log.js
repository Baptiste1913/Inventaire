/* Inventaires U V33.89 — local diagnostics without personal/error payloads. */
(()=>{'use strict';
 const KEY='iu:technical-errors:v1', MAX=50, DAYS=7, allowed=new Set(['script','promise','worker','hosting','service','update','storage']);
 const now=()=>Date.now(); let errors=[];let storageEnabled=true;
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))errors=saved;}catch{storageEnabled=false;}
 function trim(){const limit=now()-DAYS*86400000; errors=errors.filter(e=>e&&allowed.has(e.type)&&Number.isFinite(e.at)&&e.at>=limit).slice(-MAX);}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(errors));storageEnabled=true;}catch{storageEnabled=false;}}
 function changed(){window.dispatchEvent(new Event('iu-technical-log-change'));}
 function add(type){if(!allowed.has(type))return;
  trim();const last=errors[errors.length-1];
  // Avoid flooding diagnostics on reconnect or repeated service checks.
  if(last?.type===type&&now()-last.at<30000){last.count=Math.min(999,(last.count||1)+1);last.at=now();}
  else errors.push({type,at:now(),count:1});trim();persist();changed();
 }
 function clear(){errors=[];persist();changed();}
 function items(){trim();return errors.slice().reverse().map(e=>({...e}));}
 window.IUTechnicalLog=add;
 window.IUTechnicalLogAPI={items,clear,get storageEnabled(){return storageEnabled;}};
 window.addEventListener('error',e=>{if(e.target!==window&&e.target?.tagName){add('script');return;}add('script');},true);
 window.addEventListener('unhandledrejection',()=>add('promise'));
 trim();persist();
})();
