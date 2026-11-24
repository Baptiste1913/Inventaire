/* PaddleOCR opt-in : le modèle reste dans un Worker dédié de même origine.
 * ESM du SDK officiel versionné. En cas d'incompatibilité, l'application
 * désactive l'expérimentation et conserve Gemini + ZXing. */
let engine=null;
self.onmessage=async ({data:m})=>{
 const {id,kind}=m||{};
 try{
  if(kind==='init'){
   const {PaddleOCR}=await import('https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm');
   engine=await PaddleOCR.create({lang:'en',ocrVersion:'PP-OCRv5',worker:false,
    textDetectionBatchSize:1,textRecognitionBatchSize:2,
    ortOptions:{backend:m.backend,simd:true,numThreads:self.crossOriginIsolated?2:1,
     wasmPaths:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/'}});
   await engine.initialize?.();
   self.postMessage({id,result:true});
  }else if(kind==='predict'&&engine&&m.image){
   const result=await engine.predict(m.image,{textRecScoreThresh:.90});
   self.postMessage({id,result:result.map(r=>({items:r.items,metrics:r.metrics,runtime:r.runtime}))});
  }else throw Error('OCR non initialisé');
 }catch(_){self.postMessage({id,error:'PaddleOCR indisponible'});}
};
