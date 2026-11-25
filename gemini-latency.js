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
 // Consume already-settled jobs in priority order and wake up as soon
 // as any other job settles. One deadline, not one timeout per engine.
 async function collect({tasks,consume,ready,deadline,current=()=>true,now=()=>performance.now()}){
  const seen=new Set();let count=0;
  while(current()){
   const entries=tasks().filter(([,task])=>task&&!seen.has(task));
   for(const [key,task] of entries){
    if(!task.done)continue;
    seen.add(task);count++;consume(key,task.value);
    if(!current())return {count,reason:'stale'};
   }
   if(ready())return {count,reason:'ready'};
   const pending=tasks().filter(([,task])=>task&&!seen.has(task)&&!task.done);
   const remaining=deadline-now();
   if(!pending.length){
    if(tasks().some(([,task])=>task&&!seen.has(task)&&task.done))continue;
    return {count,reason:'settled'};
   }
   if(remaining<=0)return {count,reason:'deadline'};
   let timer;
   await Promise.race([...pending.map(([,task])=>task.promise),new Promise(resolve=>{timer=setTimeout(resolve,remaining);})]);
   clearTimeout(timer);
  }
  return {count,reason:'stale'};
 }
 return Object.freeze({track,until,collect});
});
