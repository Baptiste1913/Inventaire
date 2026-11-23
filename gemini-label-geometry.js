/* Inventaires U v42.31 — repérage prudent d'une étiquette claire.
 * Utilisé UNIQUEMENT pour une vue secondaire. La photo pleine reste intacte.
 * Lorsque les contours sont ambigus, retour à l'ancien recadrage central.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiLabelGeometry=api;
})(typeof window!=='undefined'?window:(typeof self!=='undefined'?self:null),function(){
 'use strict';
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function longestRun(scores,threshold,minLength,center){
  let best=null,from=-1;
  for(let i=0;i<=scores.length;i++){
   if(i<scores.length&&scores[i]>=threshold){if(from<0)from=i;continue;}
   if(from>=0){
    const length=i-from;
    const middle=(from+i)/2;
    const value=length-(Math.abs(middle-center)*.32);
    if(length>=minLength&&(!best||value>best.value))
     best={from,to:i,value};
    from=-1;
   }
  }
  return best;
 }
 function detect(imageData){
  const {width:w,height:h,data}=imageData||{};
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<100||h<70||
    !data||data.length!==w*h*4)return null;
  const light=new Uint8Array(w*h),luminance=new Uint8Array(w*h);
  for(let i=0,j=0;i<light.length;i++,j+=4){
   const r=data[j],g=data[j+1],b=data[j+2];
   const lum=(77*r+150*g+29*b)>>>8;
   luminance[i]=lum;
   light[i]=lum>=174&&Math.max(r,g,b)-Math.min(r,g,b)<58?1:0;
  }
  // Une étiquette imprimée claire dans un environnement plus sombre
  // forme une région rectangulaire assez large dans la zone centrale.
  const row=[];
  for(let y=0;y<h;y++){
   let bright=0,total=0;
   for(let x=Math.floor(w*.12);x<Math.ceil(w*.88);x+=2){
    bright+=light[y*w+x];total++;
   }
   row.push(bright/Math.max(total,1));
  }
  // Les lignes noires des barres traversent momentanément le papier
  // clair. Combler UNIQUEMENT ces creux encore lumineux, jamais une
  // vraie séparation sombre entre deux étiquettes voisines.
  const softened=row.slice();
  for(let y=1;y<h-1;){
   if(row[y]>=.48){y++;continue;}
   const from=y;
   while(y<h-1&&row[y]<.48)y++;
   const gap=y-from;
   if(gap<=Math.ceil(h*.13)&&row[from-1]>=.48&&row[y]>=.48&&
      row.slice(from,y).every(value=>value>=.22))
    for(let j=from;j<y;j++)softened[j]=.49;
  }
  const yrun=longestRun(softened,.48,Math.ceil(h*.33),h/2);
  if(!yrun)return null;
  const col=[];
  const top=Math.max(0,yrun.from+Math.floor((yrun.to-yrun.from)*.12));
  const bottom=Math.min(h,yrun.to-Math.floor((yrun.to-yrun.from)*.12));
  for(let x=0;x<w;x++){
   let bright=0,total=0;
   for(let y=top;y<bottom;y+=2){bright+=light[y*w+x];total++;}
   col.push(bright/Math.max(total,1));
  }
  const xrun=longestRun(col,.61,Math.ceil(w*.43),w/2);
  if(!xrun)return null;
  let x0=xrun.from,y0=yrun.from,x1=xrun.to,y1=yrun.to;
  const rw=x1-x0,rh=y1-y0;
  if(rw<w*.48||rh<h*.37||rw>w*.95||rh>h*.95)return null;
  const ratio=(rw/w)/(rh/h);
  if(ratio<.62||ratio>2.5)return null;
  const centerX=(x0+x1)/(2*w),centerY=(y0+y1)/(2*h);
  if(Math.abs(centerX-.5)>.26||Math.abs(centerY-.5)>.25)return null;
  let inner=0,ni=0,outer=0,no=0;
  for(let y=0;y<h;y+=3)for(let x=0;x<w;x+=3){
   const v=luminance[y*w+x];
   const inside=x>x0+rw*.14&&x<x1-rw*.14&&y>y0+rh*.12&&y<y1-rh*.12;
   const beyond=x<x0-3||x>x1+3||y<y0-3||y>y1+3;
   if(inside){inner+=v;ni++;}
   else if(beyond){outer+=v;no++;}
  }
  // Sur fond très clair ou si la bordure est invisible, il serait
  // dangereux de recadrer davantage : conserver l'ancienne vue.
  if(ni<12||no<10||inner/ni-outer/no<23)return null;
  const mx=Math.max(3,rw*.07),my=Math.max(3,rh*.09);
  x0=clamp(x0-mx,0,w);y0=clamp(y0-my,0,h);
  x1=clamp(x1+mx,0,w);y1=clamp(y1+my,0,h);
  // Refuser les extractions qui risquent de supprimer des bordures.
  if(x0<2||y0<2||x1>w-2||y1>h-2)return null;
  return {x:x0/w,y:y0/h,w:(x1-x0)/w,h:(y1-y0)/h,source:'paper-outline'};
 }
 // Une lecture optique certaine fournit une autre estimation. Nous ne
 // l'utilisons que si l'étiquette calculée reste totalement dans l'image.
 function opticalCrop(reading,width,height){
  const native=reading?.confirmed&&!reading.ambiguous&&reading?.bounds;
  if(!native||!(width>0&&height>0))return null;
  if(Math.abs(reading.bounds.slope||0)>.075)return null;
  const bar=reading.bounds,right=bar.right,left=bar.left;
  const barWidth=right-left;
  if(!(barWidth>.24&&barWidth<.48))return null;
  const lw=barWidth/.51,lh=lw*width/(height*1.26);
  const mx=lw*.12,my=lh*.12;
  const x=left-.025*lw-mx,y=bar.y-.79*lh-my;
  const w=lw+mx*2,h=lh+my*2;
  if(w<.48||h<.38||w>.94||h>.94||
   x<.015||y<.015||x+w>.985||y+h>.985)return null;
  return {x,y,w,h,source:'verified-optical'};
 }
 // Seul un EAN physiquement inclus dans le papier détecté peut
 // bénéficier d'un repositionnement dynamique. L'EAN doit être dans
 // la partie basse, sans chevaucher le prix imprimé à droite.
 function barcodeWithinLabel(reading,rect){
  const b=reading?.bounds;
  if(!reading?.confirmed||reading.ambiguous||reading.source!=='optical'||
     rect?.source!=='paper-outline'||!b||
     !(rect.w>.40&&rect.h>.30)||!Number.isFinite(b.left)||
     !Number.isFinite(b.right)||!Number.isFinite(b.y)||
     !Number.isFinite(b.slope)||Math.abs(b.slope)>.17)return false;
  const cx=((b.left+b.right)/2-rect.x)/rect.w;
  const y=(b.y-rect.y)/rect.h;
  const bw=(b.right-b.left)/rect.w;
  return cx>=.15&&cx<=.79&&y>=.53&&y<=.96&&
   bw>=.23&&bw<=.83&&b.left>=rect.x-.015&&
   b.right<=rect.x+rect.w+.015;
 }
 function crop(imageData,reading=null){
  const w=imageData?.width,h=imageData?.height;
  const optical=opticalCrop(reading,w,h);
  return optical||detect(imageData);
 }
 return Object.freeze({detect,opticalCrop,crop,barcodeWithinLabel});
});
