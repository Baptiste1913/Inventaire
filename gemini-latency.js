/* v42.47 — shared deadlines and settled results without sleeping. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.IUGeminiLatency=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function track(promise){
  const task={done:false,value:null,promise:null};
  task.promise=Promise.resolve(promise).catch(()=>null).then(value=>{
   task.value=value??null;task.done=true;return task.value;
  });
  return task;
 }
 function until(task,deadline,now=()=>performance.now()){
  if(!task)return Promise.resolve(null);
  if(task.done)return Promise.resolve(task.value);
  const remaining=Math.max(0,deadline-now());
  if(!remaining)return Promise.resolve(null);
  return new Promise(resolve=>{
   const timer=setTimeout(()=>resolve(null),remaining);
   task.promise.then(value=>{clearTimeout(timer);resolve(value);});
  });
 }
 return Object.freeze({track,until});
});
