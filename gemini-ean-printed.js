/* Inventaires U 42.33 — vérification OCR facultative des chiffres EAN imprimés.
 * Ne charge aucune dépendance OCR : utilise une instance locale déjà prête
 * (Tesseract) ou TextDetector si disponible. Ne remplace JAMAIS le décodage
 * optique des barres ni une seconde lecture Gemini obligatoire.
 */
(function(root,factory){
 'use strict';
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiPrintedEAN=api;
})(typeof window!=='undefined'?window:null,function(root){
 'use strict';
 function valid(code){
  if(!/^\d{13}$/.test(String(code||'')))return false;
  let sum=0;
  for(let i=0;i<12;i++)sum+=Number(code[i])*(i%2?3:1);
  return Number(code[12])===(10-sum%10)%10;
 }
 function parse(text,confidence=100){
  if(typeof text!=='string'||text.length>12000||
     !(Number(confidence)>=50))return null;
  const found=new Set();
  for(const line of text.normalize('NFKC').split(/[\r\n]+/)){
   const trimmed=line.trim();
   // Un numéro doit se trouver SEUL sur une ligne de chiffres :
   // ne pas concaténer poids, prix et date pour obtenir 13 chiffres.
   if(!/^[\d \t\u00a0\u202f-]{13,35}$/.test(trimmed))continue;
   const ean=trimmed.replace(/\D/g,'');
   if(ean.length===13&&valid(ean))found.add(ean);
  }
  return found.size===1?{ean13:[...found][0],source:'printed-ocr',
   confirmed:false,ambiguous:false}:
   found.size>1?{source:'printed-ocr',ambiguous:true}:null;
 }
 function roi(hint){
  const label=hint?.labelRect;
  if(label?.source==='paper-outline'&&label.w>.40&&label.h>.30)
   return {x:label.x+.01*label.w,y:label.y+.70*label.h,
    w:label.w*.84,h:label.h*.29};
  // Sans cadre de papier certain, seule la zone basse centrale de
  // l'ancienne étiquette DIGI est proposée, sans autre agrandissement.
  return {x:.025,y:.67,w:.67,h:.315};
 }
 async function read(photo,{engine=null,TextDetector=null,hint=null}={}){
  if(!photo||!engine&&!TextDetector)return null;
  if(typeof createImageBitmap!=='function'||
     typeof document==='undefined')return null;
  let bmp=null;
  try{
   bmp=await createImageBitmap(photo);
   if(!bmp||bmp.width<400||bmp.height<300)return null;
   const z=roi(hint);
   const x=Math.round(z.x*bmp.width),y=Math.round(z.y*bmp.height);
   const cw=Math.round(z.w*bmp.width),ch=Math.round(z.h*bmp.height);
   if(x<0||y<0||cw<200||ch<50||x+cw>bmp.width||y+ch>bmp.height)return null;
   const scale=Math.min(1,1500/Math.max(cw,ch));
   const cv=document.createElement('canvas');
   cv.width=Math.max(1,Math.round(cw*scale));
   cv.height=Math.max(1,Math.round(ch*scale));
   const ctx=cv.getContext('2d');
   if(!ctx)return null;
   ctx.drawImage(bmp,x,y,cw,ch,0,0,cv.width,cv.height);
   if(engine?.recognize){
    const result=await engine.recognize(cv);
    return parse(result?.data?.text,result?.data?.confidence);
   }
   if(TextDetector){
    const detector=new TextDetector();
    const lines=await detector.detect(cv);
    return parse((lines||[]).map(item=>item.rawValue||'').join('\n'));
   }
   return null;
  }catch(_){return null}
  finally{try{bmp?.close?.()}catch(_){}}
 }
 return Object.freeze({valid,parse,roi,read});
});
