/* Inventaires U v40.74 — OCR poids DIGI : champ complet, tolérance mouvement et lecture rapide.
   Lab isolé : ne peut jamais enregistrer de pesée. */
(() => {
  'use strict';
  const core=window.IUFastWeightCore, section=document.getElementById('iuLabelLabSection');
  if(!core||!section||document.getElementById('iuFastWeightLab'))return;
  const panel=document.createElement('details');
  panel.id='iuFastWeightLab';panel.className='iu-fast-lab';
  panel.innerHTML=[
    '<summary><span><strong>Scanner rapide du poids · essai IA</strong><small>Étiquette entière · gratuit · aucune pesée enregistrée</small></span></summary>',
    '<div class="iu-fast-lab-content"><p>Présente une seule étiquette devant la caméra, sans avoir à viser précisément les chiffres.',
    ' La recherche du poids utilise une large zone de l’image et fonctionne localement sur ton iPhone.</p>',
    '<div class="iu-fast-lab-actions"><button type="button" data-start>Ouvrir le scanner</button>',
    '<button type="button" data-stop hidden>Fermer la caméra</button>',
    '<button type="button" data-next hidden>Étiquette suivante</button>',
    '<label class="iu-fast-lab-file">Tester une photo<input type="file" accept="image/*" data-photo></label></div>',
    '<div class="iu-fast-camera" data-camera hidden>',
    '<video autoplay playsinline muted aria-label="Caméra visant une étiquette complète"></video>',
    '<div class="iu-fast-frame" aria-hidden="true"><div class="iu-fast-target" data-target></div></div></div>',
    '<p class="iu-fast-status" data-status role="status" aria-live="polite">Ouvre la caméra ou sélectionne une photo.</p>',
    '<div class="iu-fast-result" data-result hidden><small>Poids net détecté · vérification obligatoire</small>',
    '<strong data-value>—</strong><div class="iu-fast-meta" data-meta></div></div>',
    '<p>Les mouvements légers sont tolérés, mais les lectures contradictoires sont refusées.',
    ' Vérifie les trois décimales avant toute saisie. Aucune valeur n’est appliquée automatiquement.</p></div>'
  ].join('');
  section.insertBefore(panel,section.querySelector('#iuLabelLab'));
  const $=q=>panel.querySelector(q);
  const startBtn=$('[data-start]'),stopBtn=$('[data-stop]'),nextBtn=$('[data-next]');
  const fileInput=$('[data-photo]'),camera=$('[data-camera]'),video=camera.querySelector('video');
  const guide=$('.iu-fast-frame'),status=$('[data-status]'),result=$('[data-result]');
  const value=$('[data-value]'),meta=$('[data-meta]');
  const consensus=core.newConsensus();
  let stream=null,worker=null,loader=null,token=0,running=false,starting=false,photoReading=false;
  let mode='11',pass=0,startAt=0,durations=[],possible=null;
  const fmt=grams=>(grams/1000).toFixed(3).replace('.',',')+' kg';
  const say=(s,error=false)=>{if(status.textContent!==s)status.textContent=s;status.dataset.error=String(error);};
  const reset=()=>{consensus.reset();pass=0;durations=[];possible=null;result.hidden=true;nextBtn.hidden=true;};
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]||0;

  // On affiche le champ COMPLET de la caméra (pas le centre zoomé/coupé).
  // L'OCR utilise les pixels originaux du flux, pas la petite prévisualisation.
  function syncGuide(){
    const vw=video.videoWidth,vh=video.videoHeight,cw=camera.clientWidth,ch=camera.clientHeight;
    if(!vw||!vh||!cw||!ch)return;
    const scale=Math.min(cw/vw,ch/vh),w=vw*scale,h=vh*scale;
    Object.assign(guide.style,{
      position:'absolute',boxSizing:'border-box',aspectRatio:'auto',transform:'none',
      left:(cw-w)/2+w*.025+'px',top:(ch-h)/2+h*.05+'px',
      width:w*.95+'px',height:h*.9+'px'
    });
  }
  video.addEventListener('loadedmetadata',syncGuide);
  window.addEventListener('resize',syncGuide,{passive:true});

  async function engine(){
    if(worker)return worker;
    if(loader)return loader;
    loader=(async()=>{
      if(!window.Tesseract?.createWorker){
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          script.async=true;script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
          script.onload=()=>window.Tesseract?.createWorker?resolve():reject(Error('IA non initialisée'));
          script.onerror=()=>reject(Error('IA non téléchargeable'));
          document.head.append(script);
        });
      }
      const w=await window.Tesseract.createWorker('eng',1,{});
      await w.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'0123456789,.kKgG '});
      mode='11';worker=w;return w;
    })().catch(e=>{loader=null;throw e;});
    return loader;
  }

  const regions=[
    // Rapide : bande centrale large. Plus besoin d'aligner exactement le poids.
    {x:.03,y:.18,w:.94,h:.66,psm:'11',size:1220,contrast:false,kind:0},
    // Vérification indépendante : contraste et cadrage différents.
    {x:.06,y:.24,w:.88,h:.58,psm:'11',size:1370,contrast:true,kind:1},
    // Secours quand l'étiquette bouge ou se trouve vers un bord.
    {x:.02,y:.025,w:.96,h:.95,psm:'11',size:1450,contrast:false,kind:2},
    {x:.03,y:.12,w:.94,h:.75,psm:'11',size:1350,contrast:true,kind:3}
  ];
  function frameImage(choice){
    const vw=video.videoWidth,vh=video.videoHeight;
    if(!vw||!vh)return null;
    const sx=Math.floor(vw*choice.x),sy=Math.floor(vh*choice.y);
    const sw=Math.min(vw-sx,Math.ceil(vw*choice.w)),sh=Math.min(vh-sy,Math.ceil(vh*choice.h));
    if(sw<30||sh<20)return null;
    const canvas=document.createElement('canvas');
    // Un texte éloigné ne doit plus être réduit à 620 px comme dans v40.73.
    const targetW=Math.min(choice.size,Math.max(850,Math.round(sw*1.2)));
    canvas.width=targetW;canvas.height=Math.round(targetW*sh/sw);
    const ctx=canvas.getContext('2d',{willReadFrequently:!!choice.contrast});
    if(!ctx)return null;
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    if(choice.contrast){
      const frame=ctx.getImageData(0,0,canvas.width,canvas.height),d=frame.data;
      for(let i=0;i<d.length;i+=4){
        const gray=d[i]*.299+d[i+1]*.587+d[i+2]*.114;
        const v=Math.max(0,Math.min(255,(gray-128)*1.36+137));
        d[i]=d[i+1]=d[i+2]=v;
      }
      ctx.putImageData(frame,0,0);
    }
    return canvas;
  }

  async function readImage(image,id,psm){
    const w=await engine();
    if(id!==token)return null;
    if(mode!==psm){await w.setParameters({tessedit_pageseg_mode:psm});mode=psm;}
    const began=performance.now(),ocr=await w.recognize(image);
    const duration=performance.now()-began;
    if(id!==token)return null;
    durations.push(duration);
    if(durations.length>14)durations.shift();
    return {grams:core.readWeight(ocr?.data?.text),confidence:Number(ocr?.data?.confidence)||0};
  }
  function found(grams,photo){
    running=false;result.hidden=false;nextBtn.hidden=photo||!stream;
    value.textContent=fmt(grams);
    meta.textContent='OCR médian : '+Math.round(median(durations))+' ms · détection : '
      +Math.round(performance.now()-startAt)+' ms · '+(photo?'photo':'caméra');
    say('Poids proposé : vérifie les trois décimales avant utilisation.');
    try{navigator.vibrate?.(25);}catch(_){}
  }

  async function loop(id){
    while(running&&id===token&&stream&&panel.open&&!document.hidden){
      if(!section.getClientRects().length){stop(true);return;}
      const choice=regions[pass%regions.length],canvas=frameImage(choice);
      if(!canvas){say('Stabilise la caméra face à une seule étiquette.');await new Promise(r=>setTimeout(r,100));continue;}
      try{
        const reading=await readImage(canvas,id,choice.psm);
        if(id!==token||!running)return;
        const vote=consensus.observe(reading?.grams,reading?.confidence,choice.kind,performance.now());
        if(vote.accepted){found(reading.grams,false);return;}
        if(vote.conflict){
          say('Deux poids différents détectés. Stabilise légèrement le téléphone.');
        }else if(reading?.grams!=null){
          possible=reading.grams;
          say('Poids possible : '+fmt(reading.grams)+' · contrôle '+vote.count+'/'+vote.needed+'…');
        }else{
          say(possible ? 'Poids repéré : '+fmt(possible)+' · recherche d’une confirmation…'
            : 'Recherche du poids net dans toute l’étiquette…');
        }
      }catch(_){
        if(id===token) say('Lecture difficile. Conserve l’étiquette dans le cadre.',true);
      }
      pass++;
      if(id!==token||!running)return;
      // La reconnaissance est séquentielle ; aucun délai long n'est ajouté.
      await new Promise(r=>setTimeout(r,18));
    }
  }
  function stop(quiet=false){
    token++;running=false;starting=false;
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
    video.srcObject=null;camera.hidden=true;startBtn.hidden=false;stopBtn.hidden=true;nextBtn.hidden=true;
    if(!quiet)say('Caméra arrêtée.');
  }
  async function start(){
    if(starting||stream||photoReading)return;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
      say('Caméra indisponible. Ouvre Inventaires U en HTTPS dans Safari.',true);return;
    }
    const id=++token;starting=true;startBtn.disabled=true;reset();
    say('Initialisation de la caméra et du moteur IA…');
    try{
      // Demander une définition élevée pour lire les petites étiquettes à distance.
      const request=navigator.mediaDevices.getUserMedia({audio:false,video:{
        facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},
        frameRate:{ideal:24,max:30}
      }});
      const loading=engine();void loading.catch(()=>{});
      const source=await request;
      if(id!==token||!panel.open){source.getTracks().forEach(t=>t.stop());return;}
      stream=source;video.srcObject=source;camera.hidden=false;
      await video.play();syncGuide();await loading;
      if(id!==token)return;
      startBtn.hidden=true;stopBtn.hidden=false;running=true;startAt=performance.now();
      say('Prêt : présente l’étiquette entière, même un peu plus loin.');
      void loop(id);
    }catch(error){
      if(id!==token)return;
      stop(true);
      say(error?.name==='NotAllowedError'?'Autorisation caméra refusée.'
        :'Caméra ou IA indisponible. Premier téléchargement : connexion nécessaire.',true);
    }finally{starting=false;startBtn.disabled=false;}
  }
  function next(){
    if(!stream||running)return;
    reset();running=true;startAt=performance.now();
    say('Étiquette suivante : reste à distance confortable.');
    void loop(++token);
  }
  async function photo(file){
    if(!file||!file.type.startsWith('image/')||file.size>20*1024*1024){
      say('Choisis une photo de moins de 20 Mo.',true);return;
    }
    if(photoReading)return;
    photoReading=true;stop(true);reset();const id=++token;
    say('Analyse de la photo…');
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      const scale=Math.min(1,2200/Math.max(img.naturalWidth,img.naturalHeight));
      const full=document.createElement('canvas');
      full.width=Math.max(1,Math.round(img.naturalWidth*scale));
      full.height=Math.max(1,Math.round(img.naturalHeight*scale));
      full.getContext('2d').drawImage(img,0,0,full.width,full.height);
      startAt=performance.now();
      const reading=await readImage(full,id,'11');
      if(id!==token)return;
      if(reading?.grams==null){
        say('Poids absent ou plusieurs étiquettes visibles : recadre sur une étiquette.',true);return;
      }
      found(reading.grams,true);
    }catch(_){if(id===token)say('Photo non reconnue. Essaie de cadrer une seule étiquette.',true);}
    finally{URL.revokeObjectURL(url);photoReading=false;}
  }
  startBtn.addEventListener('click',()=>{void start();});
  stopBtn.addEventListener('click',()=>stop());
  nextBtn.addEventListener('click',next);
  fileInput.addEventListener('change',()=>{const f=fileInput.files?.[0];fileInput.value='';if(f)void photo(f);});
  panel.addEventListener('toggle',()=>{if(!panel.open)stop(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop(true);});
  window.addEventListener('pagehide',()=>{
    stop(true);
    const old=worker;worker=null;loader=null;
    if(old)void old.terminate().catch(()=>{});
  });
})();
