/* Inventaires U v42.30 — analyse de netteté locale et sélection de frames.
 * Aucun réseau, aucun OCR. Les images restent dans la mémoire vive Safari.
 * Le poids, le prix et l'EAN ne sont jamais estimés par cet outil.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiFrameQuality=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const expectedZones={
  ean:{x:.29,y:.61,w:.30,h:.20},
  weight:{x:.47,y:.43,w:.12,h:.12},
  rate:{x:.30,y:.43,w:.12,h:.12}
 };
 function clamp(v,min=0,max=1){return Math.max(min,Math.min(max,v))}
 function region(frameGray,width,height,box,kind){
  if(!box||![box.x,box.y,box.w,box.h].every(Number.isFinite))
   return {score:0,laplacian:0,contrast:0};
  const left=Math.max(1,Math.floor(clamp(box.x)*width));
  const top=Math.max(1,Math.floor(clamp(box.y)*height));
  const right=Math.min(width-1,Math.ceil(clamp(box.x+box.w)*width));
  const bottom=Math.min(height-1,Math.ceil(clamp(box.y+box.h)*height));
  if(right-left<5||bottom-top<5)return {score:0,laplacian:0,contrast:0};
  let lap=0,gradient=0,sum=0,sumSquares=0,clipped=0,count=0;
  for(let y=top;y<bottom;y++){
   for(let x=left;x<right;x++){
    const i=y*width+x,p=frameGray[i];
    const dx=Math.abs(p-frameGray[i-1]),dy=Math.abs(p-frameGray[i-width]);
    lap+=Math.abs(4*p-frameGray[i-1]-frameGray[i+1]-
      frameGray[i-width]-frameGray[i+width]);
    // Le code-barres présente surtout des transitions verticales nettes.
    // Les caractères du poids et du prix demandent les deux orientations.
    gradient+=kind==='ean'?(dx*.8+dy*.2):(dx+dy)/2;
    sum+=p;sumSquares+=p*p;
    if(p<6||p>249)clipped++;
    count++;
   }
  }
  const contrast=Math.sqrt(Math.max(0,sumSquares/count-Math.pow(sum/count,2)));
  const sharpness=lap/count,edges=gradient/count;
  const clip=clipped/count;
  const texture=clamp((sharpness-1)/36);
  const strokes=clamp((edges-1)/21);
  const tonal=clamp((contrast-4)/60);
  // Éviter qu'une zone surexposée ou vide soit prise pour un texte net.
  const exposure=clip>.8?.64:clip>.55?.83:1;
  return {score:clamp((.52*texture+.32*strokes+.16*tonal)*exposure),
   laplacian:sharpness,contrast,edges};
 }
 function frameDistance(a,b){
  if(!a||!b||a.length!==b.length)return Infinity;
  let total=0,n=0;
  for(let i=0;i<a.length;i+=7){total+=Math.abs(a[i]-b[i]);n++}
  return total/Math.max(1,n);
 }
 function evaluate(imageData,zones=null,previous=null){
  const width=imageData?.width,height=imageData?.height,data=imageData?.data;
  if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<40||height<25||!data||data.length!==width*height*4)
   return {score:0,usable:false,regions:{ean:0,weight:0,rate:0},
    gray:null,motion:Infinity};
  const gray=new Uint8Array(width*height);
  for(let i=0,j=0;i<gray.length;i++,j+=4)
   gray[i]=(77*data[j]+150*data[j+1]+29*data[j+2])>>>8;
  const boxes=zones||expectedZones;
  const ean=region(gray,width,height,boxes.ean||expectedZones.ean,'ean');
  const weight=region(gray,width,height,boxes.weight||expectedZones.weight,'weight');
  const rate=region(gray,width,height,boxes.rate||expectedZones.rate,'rate');
  const motion=frameDistance(gray,previous);
  // Le score porte sur les trois champs variables critiques, pas sur
  // le fond contrasté ou les titres de l'étiquette.
  const score=clamp(.46*ean.score+.29*weight.score+.25*rate.score-
   (Number.isFinite(motion)?Math.max(0,motion-9)*.0017:0));
  const regional={ean:ean.score,weight:weight.score,rate:rate.score};
  return {score,regions:regional,gray,motion,width,height,zones:boxes,
   usable:score>=.30&&ean.score>=.20&&weight.score>=.15&&rate.score>=.15};
 }
 // Deux étiquettes peuvent avoir le même fond blanc : le changement de
 // barres EAN ou de chiffres doit compter plus que le fond hors étiquette.
 function regionDistance(left,right,box){
  const width=left.width,height=left.height;
  if(width!==right.width||height!==right.height||
     !Number.isInteger(width)||!Number.isInteger(height))return Infinity;
  const x0=Math.max(0,Math.floor(box.x*width)),x1=Math.min(width,Math.ceil((box.x+box.w)*width));
  const y0=Math.max(0,Math.floor(box.y*height)),y1=Math.min(height,Math.ceil((box.y+box.h)*height));
  let difference=0,count=0;
  for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
   const i=y*width+x;
   difference+=Math.abs(left.gray[i]-right.gray[i]);count++;
  }
  return count?difference/count:Infinity;
 }
 function sameScene(left,right,limit=23){
  if(!left?.gray||!right?.gray||
     frameDistance(left.gray,right.gray)>limit)return false;
  // Un fond blanc peut masquer le retrait complet de l'étiquette :
  // la disparition de ses contours invalide immédiatement la comparaison.
  for(const key of ['ean','weight','rate']){
   if(Math.abs((left.regions?.[key]||0)-(right.regions?.[key]||0))>.55)
    return false;
  }
  if(Number.isInteger(left.width)&&Number.isInteger(right.width)&&
     left.zones&&right.zones){
   const regional=.46*regionDistance(left,right,left.zones.ean)+
    .29*regionDistance(left,right,left.zones.weight)+
    .25*regionDistance(left,right,left.zones.rate);
   if(!Number.isFinite(regional)||regional>31)return false;
  }
  return true;
 }
 // L'option de secours n'utilise une capture antérieure que très récente
 // et visuellement proche de la photo actuelle. Une autre étiquette,
 // une autre orientation ou un retour caméra annule ce tampon.
 function choose(candidates,current,now=0){
  if(!current)return null;
  let best=current;
  for(const candidate of candidates||[]){
   if(!candidate||candidate===current||candidate.epoch!==current.epoch)continue;
   const age=Math.abs(now-candidate.at);
   if(!(age<=360)||!sameScene(current.rating,candidate.rating))continue;
   if((candidate.rating?.score||0)>(best.rating?.score||0)+.012)
    best=candidate;
  }
  return best;
 }
 return Object.freeze({evaluate,frameDistance,sameScene,choose,expectedZones});
});
