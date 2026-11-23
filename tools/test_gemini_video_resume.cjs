'use strict';
// v42.26 : la reconnaissance ne doit plus reconfigurer la vidéo Safari entre
// deux photos. Contrôle du cycle sur un flux simulé, sans caméra ni réseau.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('gemini-lab.js','utf8');
const a=source.indexOf('let analysisCameraClosed=false,restoreCameraAfterAnalysis=false;');
const b=source.indexOf('function clearReplacePrompt(){',a);
assert(a>0&&b>a,'Cycle de vie du viseur IA présent');
const lifecycle=source.slice(a,b);
const track={readyState:'live',enabled:true};
const cameraStream={getVideoTracks:()=>[track]};
const events={pauses:0,plays:0,bindings:0,qualityStops:0,qualityStarts:0};
const video={
 paused:false,
 _srcObject:cameraStream,
 get srcObject(){return this._srcObject;},
 set srcObject(value){events.bindings++;this._srcObject=value;},
 pause(){events.pauses++;this.paused=true;},
 play(){events.plays++;this.paused=false;return Promise.resolve();}
};
const title={textContent:'Caméra désactivée'};
const cameraIdle={
 disabled:false,
 setAttribute(){},
 querySelector:()=>title
};
const cameraStill={hidden:true,removeAttribute(){}};
const cameraStage={classList:{remove(){}}};
const cameraShell={hidden:false,dataset:{state:'scanning'}};
const panel={hidden:false};
const document={hidden:false};
const context={video,cameraStream,cameraShell,cameraStage,cameraStill,
 cameraIdle,frameState:{hidden:true},panel,document,
 cameraPausedInBackground:false,
 stopQualityMonitor(){events.qualityStops++},
 startQualityMonitor(){events.qualityStarts++},
 startCamera(){throw Error('Une requête de permissions ne doit pas être nécessaire')},
 say(){},Promise};
const set=vm.runInNewContext(lifecycle+';setAnalysisCameraClosed',context);
for(let i=0;i<3;i++){
 set(true);
 assert.equal(track.enabled,true,'Caméra toujours active pendant le traitement');
 assert.equal(events.pauses,0,'Pas de pause native pendant le traitement');
 assert.equal(cameraShell.dataset.state,'analyzing');
 set(false);
 assert.equal(cameraShell.dataset.state,'scanning');
 assert.equal(events.plays,0,'Ne pas relancer Safari après une simple analyse');
 assert.equal(events.bindings,0,'Ne pas rebrancher la piste après une simple analyse');
}
track.enabled=false;
video.paused=true;
set(true);
set(false);
assert.equal(track.enabled,true,'Récupération possible après arrière-plan');
assert.equal(events.plays,1,'Reprise seulement si vidéo réellement suspendue');
assert.equal(events.bindings,0,'La piste autorisée est réutilisée');
assert(events.qualityStops>=4&&events.qualityStarts>=3,
 'Le tampon photo est suspendu puis repris sans redémarrer la piste Safari');
assert(source.includes('for(const track of cameraStream.getVideoTracks())track.enabled=false;'),
 'La mise en arrière-plan coupe toujours le flux');
assert(source.includes("cameraShell.dataset.state='idle'"),
 'La fermeture volontaire garde son état initial');
assert(source.includes('cameraCaptureCrop(video.videoWidth,video.videoHeight,'),
 'Capture haute résolution et cadrage préservés');
console.log('OK : caméra iPhone sans redémarrage après lecture, reprise fond sûre');
