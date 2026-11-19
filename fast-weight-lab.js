/* Inventaires U v40.73 — scanner poids IA local, laboratoire sans écriture. */
(() => {
  'use strict';
  const core = window.IUFastWeightCore;
  const section = document.getElementById('iuLabelLabSection');
  if (!core || !section || document.getElementById('iuFastWeightLab')) return;

  const panel = document.createElement('details');
  panel.id = 'iuFastWeightLab';
  panel.className = 'iu-fast-lab';
  panel.innerHTML = [
    '<summary><span><strong>Scanner rapide du poids · essai IA</strong><small>Étiquette entière · gratuit · aucun enregistrement</small></span></summary>',
    '<div class="iu-fast-lab-content">',
    '<p>Cadre une seule étiquette DIGI complète. La lecture privilégie uniquement « Poids net ».',
    ' Aucune connexion à Courses U. L’IA s’exécute sur cet appareil ; le premier chargement exige Internet.</p>',
    '<div class="iu-fast-lab-actions">',
    '<button type="button" data-start>Ouvrir le scanner</button>',
    '<button type="button" data-stop hidden>Fermer la caméra</button>',
    '<button type="button" data-next hidden>Étiquette suivante</button>',
    '<label class="iu-fast-lab-file">Tester une photo<input type="file" accept="image/*" data-photo></label>',
    '</div><div class="iu-fast-camera" data-camera hidden>',
    '<video autoplay playsinline muted aria-label="Caméra destinée au poids net"></video>',
    '<div class="iu-fast-frame" aria-hidden="true"><div class="iu-fast-target" data-target></div></div></div>',
    '<p class="iu-fast-status" data-status role="status" aria-live="polite">Ouvre la caméra ou sélectionne une photo.</p>',
    '<div class="iu-fast-result" data-result hidden><small>Poids net détecté · vérification obligatoire</small>',
    '<strong data-value>—</strong><div class="iu-fast-meta" data-meta></div></div>',
    '<p>Mode laboratoire : aucune pesée n’est ajoutée. Plusieurs poids différents ou une lecture incertaine sont refusés.</p>',
    '</div>'
  ].join('');
  section.insertBefore(panel, section.querySelector('#iuLabelLab'));
  const $ = name => panel.querySelector(name);
  const startBtn = $('[data-start]'), stopBtn = $('[data-stop]'), nextBtn = $('[data-next]');
  const fileInput = $('[data-photo]'), camera = $('[data-camera]');
  const video = camera.querySelector('video'), frame = $('.iu-fast-frame'), target = $('[data-target]');
  const status = $('[data-status]'), result = $('[data-result]'), value = $('[data-value]'), meta = $('[data-meta]');
  const consensus = core.newConsensus();
  let stream = null, worker = null, loader = null, token = 0, running = false;
  let starting = false, readingPhoto = false, mode = '7', attempt = 0, began = 0, durations = [];
  const fmt = grams => (grams / 1000).toFixed(3).replace('.', ',') + ' kg';
  const say = (message, error = false) => {
    if (status.textContent !== message) status.textContent = message;
    status.dataset.error = String(error);
  };
  const reset = () => {consensus.reset(); attempt = 0; durations = []; result.hidden = true; nextBtn.hidden = true;};
  const median = values => {
    const sorted = [...values].sort((a,b) => a-b);
    return sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0;
  };

  async function engine() {
    if (worker) return worker;
    if (loader) return loader;
    loader = (async () => {
      if (!window.Tesseract?.createWorker) {
        await new Promise((resolve, reject) => {
          const node = document.createElement('script');
          node.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
          node.async = true;
          node.onload = () => window.Tesseract?.createWorker ? resolve() : reject(Error('Moteur OCR absent'));
          node.onerror = () => reject(Error('Moteur OCR impossible à télécharger'));
          document.head.appendChild(node);
        });
      }
      const w = await window.Tesseract.createWorker('eng', 1, {});
      await w.setParameters({tessedit_pageseg_mode:'7', tessedit_char_whitelist:'0123456789,.kgKG '});
      mode = '7'; worker = w;
      return w;
    })().catch(error => {loader = null; throw error;});
    return loader;
  }

  function crop(element, enhanced) {
    const viewport = video.getBoundingClientRect(), focus = element.getBoundingClientRect();
    const region = core.mapGuideToVideo(video.videoWidth,video.videoHeight,
      viewport.width,viewport.height,focus.left-viewport.left,focus.top-viewport.top,
      focus.width,focus.height);
    if (!region) return null;
    const image = document.createElement('canvas');
    image.width = 620;
    image.height = Math.max(70,Math.round(image.width * region.height / region.width));
    const ctx = image.getContext('2d',{willReadFrequently:true});
    if (!ctx) return null;
    ctx.drawImage(video,region.x,region.y,region.width,region.height,0,0,image.width,image.height);
    if (enhanced) {
      const pixels = ctx.getImageData(0,0,image.width,image.height);
      for (let i=0;i<pixels.data.length;i+=4) {
        const d=pixels.data,gray=.299*d[i]+.587*d[i+1]+.114*d[i+2];
        const shade=Math.max(0,Math.min(255,(gray-128)*1.4+135));
        d[i]=d[i+1]=d[i+2]=shade;
      }
      ctx.putImageData(pixels,0,0);
    }
    return image;
  }

  async function recognize(image, id, psm) {
    const w = await engine();
    if (id !== token) return null;
    if (mode !== psm) {await w.setParameters({tessedit_pageseg_mode:psm});mode=psm;}
    const at = performance.now(), ocr = await w.recognize(image);
    durations.push(performance.now()-at);
    if (durations.length > 12) durations.shift();
    return {grams:core.readWeight(ocr.data?.text),confidence:Number(ocr.data?.confidence)||0};
  }

  function success(grams, isPhoto) {
    running = false; result.hidden = false; nextBtn.hidden = isPhoto || !stream;
    value.textContent = fmt(grams);
    meta.textContent = 'OCR médian : ' + median(durations) + ' ms · résultat : '
      + Math.round(performance.now()-began) + ' ms · ' + (isPhoto?'photo':'caméra');
    say('Poids détecté. Vérifie toujours les trois décimales sur l’étiquette.');
    try { navigator.vibrate?.(25); } catch (_) {}
  }

  async function loop(id) {
    while (running && id === token && stream && panel.open && !document.hidden) {
      if (!section.getClientRects().length) {stop(true);return;}
      const variant = attempt % 2;
      const full = attempt > 0 && attempt % 7 === 0;
      const image = crop(full ? frame : target, variant === 1);
      if (!image) {say('Place l’étiquette entière dans le cadre blanc.');await new Promise(r=>setTimeout(r,120));continue;}
      try {
        const reading = await recognize(image,id,full?'6':'7');
        if (id !== token || !running) return;
        const vote = consensus.observe(reading?.grams,reading?.confidence,full?2:variant,Date.now());
        if (vote.accepted) {success(reading.grams,false);return;}
        say(reading?.grams == null
          ? 'Recherche du poids… Aligne « Poids net » dans le cadre vert.'
          : 'Poids possible : '+fmt(reading.grams)+' · vérification '+vote.count+'/'+vote.needed+'…');
      } catch (_) {
        if (id === token) {consensus.reset();say('Lecture difficile. Stabilise et rapproche l’étiquette.');}
      }
      attempt++;
      if (id !== token || !running) return;
      await new Promise(r=>setTimeout(r,50));
    }
  }

  function stop(quiet = false) {
    token++;running=false;starting=false;
    if (stream) {stream.getTracks().forEach(t=>t.stop());stream=null;}
    video.srcObject=null;camera.hidden=true;
    startBtn.hidden=false;stopBtn.hidden=true;nextBtn.hidden=true;
    if (!quiet) say('Caméra arrêtée.');
  }
  async function start() {
    if (starting || stream || readingPhoto) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      say('Caméra indisponible. Ouvre le site HTTPS dans Safari.',true);return;
    }
    const id=++token; starting=true;startBtn.disabled=true;reset();
    say('Chargement de la caméra et de l’IA locale…');
    try {
      const cameraPromise = navigator.mediaDevices.getUserMedia({
        audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},
          height:{ideal:720},frameRate:{ideal:15,max:24}}
      });
      const ocrPromise=engine();
      void ocrPromise.catch(()=>{});
      const source=await cameraPromise;
      if (id !== token || !panel.open) {source.getTracks().forEach(t=>t.stop());return;}
      stream=source;video.srcObject=source;camera.hidden=false;
      await video.play();
      await ocrPromise;
      if (id !== token) return;
      startBtn.hidden=true;stopBtn.hidden=false;
      say('Caméra prête. Cadre une seule étiquette DIGI.');
      running=true;began=performance.now();
      void loop(id);
    } catch (error) {
      if (id !== token) return;
      stop(true);
      say(error?.name === 'NotAllowedError'
        ? 'Permission caméra refusée dans Safari.'
        : 'Caméra ou modèle OCR indisponible. Internet est nécessaire au premier chargement.',true);
    } finally {starting=false;startBtn.disabled=false;}
  }
  function next() {
    if (!stream || running) return;
    reset();running=true;began=performance.now();
    say('Présente l’étiquette suivante.');
    void loop(++token);
  }
  async function photo(file) {
    if (!file || !file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      say('Choisis une photo de moins de 20 Mo.',true);return;
    }
    if (readingPhoto) return;
    readingPhoto=true;stop(true);reset();const id=++token;
    say('Reconnaissance de la photo…');
    const url=URL.createObjectURL(file);
    try {
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      began=performance.now();
      const reading=await recognize(canvas,id,'6');
      if (id !== token) return;
      if (reading?.grams == null) {
        say('Poids absent ou étiquettes multiples : essaye une photo recadrée sur une seule étiquette.',true);return;
      }
      success(reading.grams,true);
    } catch (_) {if(id === token)say('Photo non reconnue. Essaie de la recadrer sur une seule étiquette.',true);}
    finally {URL.revokeObjectURL(url);readingPhoto=false;}
  }
  startBtn.addEventListener('click',()=>{void start();});
  stopBtn.addEventListener('click',()=>stop());
  nextBtn.addEventListener('click',next);
  fileInput.addEventListener('change',()=>{const file=fileInput.files?.[0];fileInput.value='';if(file)void photo(file);});
  panel.addEventListener('toggle',()=>{if(!panel.open)stop(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop(true);});
  window.addEventListener('pagehide',()=>{
    stop(true);
    const old=worker;worker=null;loader=null;
    if(old)void old.terminate().catch(()=>{});
  });
})();
