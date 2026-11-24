/* Inventaires U 42.43 — chiffres EAN locaux en secours des barres.
 * Ne charge aucune dépendance : moteur Tesseract fourni par l'appelant
 * ou TextDetector natif. Deux découpes concordantes, contrôle EAN-13.
 * L'appelant vérifie le catalogue DIGI et les montants avant validation.
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
   confidence:Number(confidence),confirmed:false,ambiguous:false}:
   found.size>1?{source:'printed-ocr',ambiguous:true}:null;
 }
 function roi(hint){
  const label=hint?.labelRect;
  const calibrated=label?.paper&&root?.IUGeminiLabelGeometry?.zoneRect(label,['barcode','ean'],.025);
  if(calibrated)return calibrated;
  if(label?.source==='paper-outline'&&label.w>.40&&label.h>.30)
   return {x:label.x+.01*label.w,y:label.y+.70*label.h,
    w:label.w*.84,h:label.h*.29};
  // Sans cadre de papier certain, seule la zone basse centrale de
  // l'ancienne étiquette DIGI est proposée, sans autre agrandissement.
  return {x:.025,y:.67,w:.67,h:.315};
 }
 function partialPattern(text,confidence){
  if(typeof text!=='string'||Number(confidence)<80)return null;
  const masks=new Set();
  for(const line of text.split(/[\r\n]+/)){
   const normalized=line.trim().replace(/[ \t\u00a0\u202f-]/g,'');
   if(/^[0-9?]{13}$/.test(normalized)&&normalized.includes('?')&&
      normalized.replace(/\?/g,'').length>=6)masks.add(normalized);
  }
  return masks.size===1?[...masks][0]:null;
 }
 function promote(first,second){
  // Une seule OCR, même avec une clé EAN correcte, est une piste non
  // confirmée : ne jamais compléter des chiffres par déduction.
  if(first?.ambiguous||second?.ambiguous)
   return {source:'printed-ocr',confirmed:false,ambiguous:true};
  if(first?.ean13&&second?.ean13&&first.ean13!==second.ean13)
   return {source:'printed-ocr',confirmed:false,ambiguous:true};
  const one=first?.ean13?first:second;
  if(!one?.ean13){
   const a=first?.pattern,b=second?.pattern;
   if(a&&b){const f=root?.IURecognitionCore?.fuse(a,b);if(f&&!f.conflict)return {pattern:f.pattern,source:'printed-ocr',confirmed:false};}
   return null;
  }
  const consistent=first?.ean13===second?.ean13&&
   first?.confidence>=80&&second?.confidence>=80;
  return {...one,source:'printed-ocr',confirmed:Boolean(consistent),
   ambiguous:false,evidenceCount:consistent?2:1,
   confidence:consistent?Math.min(first.confidence,second.confidence):
    one.confidence};
 }
 async function read(photo,{engine=null,TextDetector=null,hint=null,
   verifyTwice=false}={}){
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
   const cv=document.createElement('canvas');
   const ctx=cv.getContext('2d');
   if(!ctx)return null;
   const detector=!engine&&TextDetector?new TextDetector():null;
   async function recognizeBand(topFraction,heightFraction,enhance=false){
    const top=Math.round(ch*topFraction);
    const sourceHeight=Math.round(ch*heightFraction);
    const scale=Math.min(2,1700/cw);
    cv.width=Math.max(1,Math.round(cw*scale));
    cv.height=Math.max(1,Math.round(sourceHeight*scale));
    // Les chiffres sont imprimés SOUS les barres : une bande basse
    // évite de demander à l'OCR de décoder les traits verticaux.
    if('filter' in ctx)ctx.filter=enhance?'grayscale(1) contrast(1.6)':'none';
    ctx.drawImage(bmp,x,y+top,cw,sourceHeight,0,0,cv.width,cv.height);
    if('filter' in ctx)ctx.filter='none';
    if(engine?.recognize){
     const result=await engine.recognize(cv);
     return parse(result?.data?.text,result?.data?.confidence)||
      (partialPattern(result?.data?.text,result?.data?.confidence)?
       {pattern:partialPattern(result.data.text,result.data.confidence),source:'printed-ocr',confidence:result.data.confidence}:null);
    }
    if(detector){
     const lines=await detector.detect(cv);
     return parse((lines||[]).map(item=>item.rawValue||'').join('\n'));
    }
    return null;
   }
   if(!verifyTwice){
    // API d'origine conservée pour les consommateurs existants.
    cv.width=Math.max(1,Math.round(cw*Math.min(1,1500/Math.max(cw,ch))));
    cv.height=Math.max(1,Math.round(ch*Math.min(1,1500/Math.max(cw,ch))));
    ctx.drawImage(bmp,x,y,cw,ch,0,0,cv.width,cv.height);
    if(engine?.recognize){
     const result=await engine.recognize(cv);
     return parse(result?.data?.text,result?.data?.confidence);
    }
    if(detector){
     const lines=await detector.detect(cv);
     return parse((lines||[]).map(item=>item.rawValue||'').join('\n'));
    }
    return null;
   }
   // La reconnaissance en deux bandes n'est utilisée qu'après échec
   // du décodage optique, sur UNE seule photo, jamais en rafale.
   let configured=false;
   if(engine?.setParameters){
    try{
     await engine.setParameters({tessedit_char_whitelist:'0123456789',
      tessedit_pageseg_mode:'7'});
     configured=true;
    }catch(_){/* Ne jamais bloquer la lecture pour ce paramètre. */}
   }
   try{
    const first=await recognizeBand(.45,.53);
    const second=await recognizeBand(.27,.71,true);
    return promote(first,second);
   }finally{
    // Ce moteur est partagé avec l'OCR local de l'application.
    // Réinitialiser avant toute nouvelle reconnaissance d'étiquette.
    if(configured)try{
     await engine.setParameters({tessedit_char_whitelist:'',
      tessedit_pageseg_mode:'3'});
    }catch(_){}
   }
  }catch(_){return null;}
  finally{try{bmp?.close?.()}catch(_){}}
 }
 return Object.freeze({valid,parse,roi,read,promote,partialPattern});
});
