'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('gemini-lab.js','utf8');
const start=js.indexOf(' function saveAndRetainCurrentWeigh(){'),end=js.indexOf(" nextWeigh?.addEventListener('click',()=>{",start);
const handlerStart=js.indexOf(" capture.addEventListener('click',async()=>{"),handlerEnd=js.indexOf(" document.addEventListener('visibilitychange'",handlerStart);
const handler=js.slice(handlerStart,handlerEnd);
async function scenario({duplicate=false,saveOk=true,cameraFail=false,valid=true,raceDuplicate=false}={}){
 const events=[];let click;
 const oldLabel={grams:1058};
 const state={proposal:oldLabel,latestLabelFields:oldLabel,file:{},retainedSavedLabel:false,active:false,frameCaptureBusy:false,localOcrBusy:false,duplicateDialogOpen:false,catalogDialogOpen:false,cameraStream:{},cameraShell:{hidden:false,dataset:{state:'scanning'}},document:{hidden:false},video:{videoWidth:100,videoHeight:100},generation:1,cameraEpoch:1,autoCapturePending:false,autoLocked:false,autoSuspended:false,lastPhotoWasAuto:false,autoLastCaptured:null,autoLastFrame:null,qualityEngine:null,
 capture:{addEventListener(k,fn){click=fn;}},
 $:()=>({value:'normal'}),hasSavableProposal(){return valid&&!!state.proposal;},
 duplicateForCurrent(){return duplicate;},openDuplicateConfirm(){events.push('duplicate');state.duplicateDialogOpen=true;},
 saveVerifiedProposal(){events.push('save');return {ok:saveOk&&!raceDuplicate,duplicate:raceDuplicate};},
 announceSaveError(){events.push('save-error');},retainSavedWeigh(saved){events.push('retain');state.retainedSavedLabel=saved.duplicate?'Doublon confirmé':'Pesée enregistrée';state.proposal=null;state.file=null;state.generation++;},resetReading(){events.push('clear');state.retainedSavedLabel=false;state.proposal=null;state.file=null;state.latestLabelFields=null;state.generation++;},
 setLabelAlert(){},say(){},refreshCaptureButton(){},clearAutoTimer(){},setAutoHint(){},refreshLabelAlert(){},labelAlert:{dataset:{}},
 chooseSharpCameraFrame:async()=>{events.push('capture');if(cameraFail)throw Error('camera');return {canvas:{width:100,height:100,toBlob(resolve){resolve({size:100});}}};},
 File:class{},setPhoto(){events.push('new-photo');return true;}
 };
 new Function('state','with(state){'+js.slice(start,end)+handler+'}')(state);
 await click();
 assert.equal(state.frameCaptureBusy,false);
 return {events,state,oldLabel,click};
}
(async()=>{
 let r=await scenario();assert.deepEqual(r.events,['save','retain','capture','clear','new-photo']);
 assert.equal(r.state.proposal,null);
 r=await scenario({cameraFail:true});assert.deepEqual(r.events,['save','retain','capture']);assert.equal(r.state.proposal,null);assert.equal(r.state.latestLabelFields,r.oldLabel);assert.equal(r.state.retainedSavedLabel,'Pesée enregistrée');
 await r.click();assert.deepEqual(r.events,['save','retain','capture','capture']);
 r=await scenario({saveOk:false});assert.deepEqual(r.events,['save','save-error']);assert.equal(r.state.proposal,r.oldLabel);
 r=await scenario({duplicate:true});assert.deepEqual(r.events,['duplicate']);assert.equal(r.state.proposal,r.oldLabel);
 r=await scenario({raceDuplicate:true});assert.deepEqual(r.events,['save','duplicate']);assert.equal(r.state.proposal,r.oldLabel);
 r=await scenario({valid:false});assert.deepEqual(r.events,['capture','clear','new-photo']);
 r=await scenario({valid:false,cameraFail:true});assert.deepEqual(r.events,['capture']);assert.equal(r.state.proposal,r.oldLabel);
 assert(js.slice(end,handlerStart).includes('const saved=saveAndRetainCurrentWeigh();'));
 console.log('OK : enregistrement avant photo, étiquette conservée jusqu’à nouvelle capture, doublons et échecs protégés.');
})().catch(error=>{console.error(error);process.exitCode=1;});
