/* v42.48 — lossless binary JPEG transport, negotiated per page session.
 * Old Workers get the same JSON body as before. No extra network calls,
 * automatic replays, image recompression or persistent photo cache. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiTransport=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 let binary=false;
 const views=new WeakMap();
 function wrapJPEG(blob){
  if(!blob||typeof blob.arrayBuffer!=='function'||blob.size<75)return null;
  const view=Object.freeze({length:4*Math.ceil(blob.size/3)});
  views.set(view,{blob,encoded:null});
  if(!binary)void base64(view).catch(()=>{});
  return view;
 }
 function viewOf(value){return value&&typeof value==='object'?views.get(value):null;}
 async function base64(value){
  const view=viewOf(value);if(!view)return value;
  if(!view.encoded)view.encoded=new Promise((resolve,reject)=>{
   const reader=new FileReader();reader.onerror=()=>reject(Error('JPEG illisible'));
   reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(view.blob);
  }).catch(error=>{view.encoded=null;throw error;});
  return view.encoded;
 }
 async function binaryPart(value){
  const view=viewOf(value);if(!view)return jpeg(value);
  const header=new Uint8Array(await view.blob.slice(0,2).arrayBuffer());
  if(header[0]!==255||header[1]!==216)throw Error('JPEG invalide');
  return view.blob;
 }
 function jpeg(base64){
  if(typeof base64!=='string'||base64.length%4)throw Error('Base64 invalide');
  const decoded=atob(base64),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  if(bytes[0]!==255||bytes[1]!==216)throw Error('JPEG invalide');
  return bytes;
 }
 function pack(payload){
  const {imageBase64,detailImageBase64,...fields}=payload;
  return packet(fields,jpeg(imageBase64),detailImageBase64?jpeg(detailImageBase64):new Uint8Array(0));
 }
 function packet(fields,a,b){
  const al=a.size??a.length,bl=b.size??b.length;
  if(al<75||al>525000||bl>127500||(bl&&bl<75)||al+bl>562500)throw Error('Taille JPEG invalide');
  const meta=new TextEncoder().encode(JSON.stringify({...fields,imageBytes:al,detailBytes:bl}));
  if(meta.length>16384)throw Error('Métadonnées trop longues');
  const header=new Uint8Array(4);new DataView(header.buffer).setUint32(0,meta.length);
  const body=new Blob([header,meta,a,b],{type:'application/octet-stream'});
  return {body,contentType:'application/octet-stream',size:body.size};
 }
 function prepare(payload){
  if(binary){try{return pack(payload)}catch(_){/* Exact JSON fallback before sending. */}}
  const body=JSON.stringify(payload);
  return {body,contentType:'application/json',size:typeof TextEncoder==='function'?new TextEncoder().encode(body).length:body.length};
 }
 async function prepareAsync(payload){
  const {imageBase64,detailImageBase64,...fields}=payload;
  if(binary){try{
   const [a,b]=await Promise.all([binaryPart(imageBase64),detailImageBase64?binaryPart(detailImageBase64):new Uint8Array(0)]);
   return packet(fields,a,b);
  }catch(_){/* Legacy JSON, no second HTTP request. */}}
  const [a,b]=await Promise.all([base64(imageBase64),base64(detailImageBase64)]);
  const body=JSON.stringify({...fields,imageBase64:a,...(b?{detailImageBase64:b}:{})});
  return {body,contentType:'application/json',size:typeof TextEncoder==='function'?new TextEncoder().encode(body).length:body.length};
 }
 function observe(result){binary=result?.transport==='binary-v1';}
 function reset(){binary=false;}
 return Object.freeze({prepare,prepareAsync,wrapJPEG,observe,reset,pack});
});
