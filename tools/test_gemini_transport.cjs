'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const transport=require('../gemini-transport.js');
const worker=fs.readFileSync('workers/coursesu-live-worker.js','utf8');
const ctx={Uint8Array,DataView,TextDecoder,btoa};
vm.runInNewContext(worker.split('export default {')[0]+';this.parse=parseBinary;',ctx);
const a=Buffer.alloc(120000,0x63),b=Buffer.alloc(50000,0x23);
a[0]=b[0]=255;a[1]=b[1]=216;
const payload={type:'iu-gemini-label-test',model:'gemini-3.5-flash-lite',provider:'gemini',mimeType:'image/jpeg',
 imageBase64:a.toString('base64'),detailImageBase64:b.toString('base64'),digiPositions:[4,11],focusFields:['ean']};
(async()=>{
 const legacy=transport.prepare(payload);
 assert.equal(legacy.contentType,'application/json');
 transport.observe({transport:'binary-v1'});
 const packet=transport.prepare(payload);
 assert.equal(packet.contentType,'application/octet-stream');
 assert(packet.size<legacy.size*.76);
 const bytes=new Uint8Array(await packet.body.arrayBuffer());
 const decoded=ctx.parse(bytes);
 assert.equal(decoded.imageBase64,payload.imageBase64);
 assert.equal(decoded.detailImageBase64,payload.detailImageBase64);
 assert.deepEqual(Array.from(decoded.digiPositions),[4,11]);
 assert.throws(()=>ctx.parse(bytes.subarray(0,bytes.length-1)));
 transport.reset();
 assert.equal(transport.prepare(payload).contentType,'application/json');
 console.log('OK : JPEG identique octet par octet, transport négocié, taille réduite, troncature refusée');
})().catch(e=>{console.error(e);process.exitCode=1});
