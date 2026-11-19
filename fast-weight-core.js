/* Inventaires U — poids DIGI : règles de validation indépendantes du moteur OCR. */
(function (root, build) {
  'use strict';
  const api = build();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IUFastWeightCore = api;
})(typeof globalThis === 'object' ? globalThis : null, function () {
  'use strict';
  const MAX_GRAMS = 30000;
  const asText = v => String(v ?? '').replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[oO](?=\s*[,\.]?\s*\d)/g, '0')
    .replace(/(\d)\s*([,.])\s*(\d)/g, '$1$2$3');

  function readWeight(text) {
    const source = asText(text);
    const matches = [];
    // Un poids DIGI possède toujours trois décimales ET l'unité kg.
    // Ne jamais accepter un nombre isolé, un prix au kilo ou une date.
    const pattern = /(^|[^\d\w.,€\/])([0-9]{1,2})\s*([,.])\s*([0-9]{3})\s*k\s*g\b/gi;
    for (const match of source.matchAll(pattern)) {
      const grams = Number(match[2]) * 1000 + Number(match[4]);
      if (Number.isSafeInteger(grams) && grams >= 1 && grams <= MAX_GRAMS) {
        matches.push(grams);
      }
    }
    // Une photo avec deux étiquettes différentes est ambiguë et doit être rejetée.
    const unique = [...new Set(matches)];
    return unique.length === 1 ? unique[0] : null;
  }

  function newConsensus() {
    let votes = [];
    return {
      reset() { votes = []; },
      observe(grams, confidence, variant, now) {
        const t = Number.isFinite(now) ? now : Date.now();
        // Les échecs ponctuels (mouvement, reflet) n'effacent pas les mesures récentes.
        // On laisse seulement tomber les observations devenues anciennes.
        votes = votes.filter(v => t - v.time < 1650);
        if (!Number.isSafeInteger(grams) || grams < 1 || grams > MAX_GRAMS ||
            !Number.isFinite(confidence) || confidence < 62) {
          return {accepted:false,count:0,needed:2};
        }
        votes.push({grams, variant, confidence, time:t});
        if (votes.length > 9) votes.shift();
        const same = votes.filter(v => v.grams === grams);
        const other = votes.filter(v => v.grams !== grams);
        // Toute lecture contradictoire récente interdit une validation silencieuse.
        if (other.length) return {accepted:false,count:same.length,needed:3,conflict:true};
        const independent = new Set(same.map(v => v.variant)).size >= 2;
        const age = same.length ? same.at(-1).time-same[0].time : 0;
        const strong = same.length >= 2 && same.every(v => v.confidence >= 89);
        const needed = strong ? 2 : 3;
        return {accepted:same.length >= needed && independent && age >= 105,
          count:same.length,needed};
      }
    };
  }

  // Carte les dimensions du guide CSS sur le flux vidéo en object-fit:cover.
  function mapGuideToVideo(videoWidth, videoHeight, rectWidth, rectHeight, x, y, width, height) {
    if (![videoWidth,videoHeight,rectWidth,rectHeight,x,y,width,height].every(Number.isFinite) ||
        videoWidth <= 0 || videoHeight <= 0 || rectWidth <= 0 || rectHeight <= 0 || width <= 0 || height <= 0) return null;
    const scale = Math.max(rectWidth / videoWidth, rectHeight / videoHeight);
    const cropX = (videoWidth * scale - rectWidth) / 2;
    const cropY = (videoHeight * scale - rectHeight) / 2;
    const left = Math.max(0, (x + cropX) / scale);
    const top = Math.max(0, (y + cropY) / scale);
    const right = Math.min(videoWidth, (x + width + cropX) / scale);
    const bottom = Math.min(videoHeight, (y + height + cropY) / scale);
    if (right - left < 16 || bottom - top < 8) return null;
    return {x:left,y:top,width:right-left,height:bottom-top};
  }
  return Object.freeze({readWeight,newConsensus,mapGuideToVideo});
});
