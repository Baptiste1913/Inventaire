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
 function jpeg(base64){
  if(typeof base64!=='string'||base64.length%4)throw Error('Base64 invalide');
  const decoded=atob(base64),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  if(bytes[0]!==255||bytes[1]!==216)throw Error('JPEG invalide');
  return bytes;
 }
 function pack(payload){
  const {imageBase64,detailImageBase64,...fields}=payload;
  const a=jpeg(imageBase64),b=detailImageBase64?jpeg(detailImageBase64):new Uint8Array(0);
  if(a.length<75||a.length>525000||b.length>127500||
     (b.length&&b.length<75)||a.length+b.length>562500)throw Error('Taille JPEG invalide');
  const meta=new TextEncoder().encode(JSON.stringify({...fields,imageBytes:a.length,detailBytes:b.length}));
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
 function observe(result){binary=result?.transport==='binary-v1';}
 function reset(){binary=false;}
 return Object.freeze({prepare,observe,reset,pack});
});
