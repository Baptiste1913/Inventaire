/* Recalculate after edits to the PWA, before publishing a version.
   Usage from any directory: node tools/update-resource-metadata.cjs */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const match=/const CORE = \[([\s\S]*?)\];/.exec(read('sw.js'));
if(!match)throw Error('Liste CORE introuvable');
const names=[...new Set([...match[1].matchAll(/'\.\/([^']*)'/g)].map(x=>x[1].split('?')[0]||'index.html').concat('sw.js'))].sort();
const sum=names.filter(p=>p!=='version.json').reduce((n,p)=>n+fs.statSync(path.join(root,p)).size,0);
const v=JSON.parse(read('version.json'));
v.assets=names.length;v.resourceScope='pwa-local-v1';v.bytes=0;
const serialize=()=>JSON.stringify(v,null,2)+'\n';
for(let i=0;i<5;i++)v.bytes=sum+Buffer.byteLength(serialize(),'utf8');
if(v.bytes!==sum+Buffer.byteLength(serialize(),'utf8'))throw Error('Taille du manifeste non stabilisée');
fs.writeFileSync(path.join(root,'version.json'),serialize());
console.log(v.assets+' ressources locales · '+v.bytes+' octets');
