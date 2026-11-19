const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../fast-weight-core.js');
const cases = [
  ['Poids net 0,904 kg · 0,99 €/kg',904],
  ['0.102 kg',102],
  ['Poids net 0,098 kg · 19.11.2026',98],
  ['12,345 kg',12345],
  ['0,102 kg / 0,102 kg',102],
  ['0,99 €/kg et 0,10 €',null],
  ['0,098 kg / 0,102 kg',null],
  ['2824059000662',null],
  ['0,000 kg',null],
  ['9,999 €/kg',null],
  ['0,102',null],
  ['50,000 kg',null],
];
for (const [src,expected] of cases) {
  assert.equal(core.readWeight(src),expected,'Cas : '+src);
}
const vote = core.newConsensus();
assert.equal(vote.observe(904,90,0,1000).accepted,false);
assert.equal(vote.observe(904,91,1,1100).accepted,true);
vote.reset();
assert.equal(vote.observe(904,60,0,1200).accepted,false);
assert.equal(vote.observe(903,70,1,1300).accepted,false);
assert.equal(vote.observe(904,70,0,1400).accepted,false);
assert.equal(vote.observe(904,70,1,1500).accepted,false);
assert.equal(vote.observe(904,70,0,1600).accepted,true);
assert.equal(vote.observe(null,90,1,1700).accepted,false);
const rect=core.mapGuideToVideo(1280,720,360,450,140,180,120,70);
assert.ok(rect && rect.x>=0 && rect.y>=0 && rect.x+rect.width<=1280 && rect.y+rect.height<=720);
assert.equal(core.mapGuideToVideo(0,720,360,450,140,180,120,70),null);
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
for (const file of ['fast-weight-core.js','fast-weight-lab.js','fast-weight-lab.css']) {
  assert.ok(html.includes(file+'?v=40.73'),'Index sans '+file);
  assert.ok(sw.includes(file+'?v=40.73'),'Hors ligne sans '+file);
}
console.log('OK : 12 exemples, vote multi-images, guide caméra, assets PWA');
