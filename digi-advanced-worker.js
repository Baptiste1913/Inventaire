'use strict';
importScripts('./digi-advanced-model.js?v=42.51','./digi-advanced-core.js?v=42.51','./gemini-label-geometry.js?v=42.33');
let busy=false;
self.onmessage=async({data:m})=>{
 const {id,kind}=m||{};
 if(!Number.isSafeInteger(id))return;
 if(kind==='warm'){try{self.IUDigiAdvancedCore.warm();self.postMessage({id,ready:true});}catch(_){self.postMessage({id,error:'model'});}return;}
 if(kind!=='read'||busy||!m.photo){self.postMessage({id,result:null});return;}
 busy=true;
 try{self.postMessage({id,result:await self.IUDigiAdvancedCore.read(m.photo,m.hint)});}
 catch(_){self.postMessage({id,result:null});}
 finally{busy=false;}
};
