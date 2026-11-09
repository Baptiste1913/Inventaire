/* Inventaires U V33.33 — Chaque motif SVG est vectoriel et reste indépendant.
 * Le repère de référence est 1920 × 1080, comme le schéma de l'utilisateur.
 * Le placement répartit les motifs en conservant leurs proportions et leurs
 * coordonnées relatives, sans les ramener au centre sur écrans étroits.
 */
(() => {
  'use strict';
  const ORIGINAL_WIDTH = 1920;
  const ORIGINAL_HEIGHT = 1080;

  function init() {
    const hero = document.querySelector('.intro');
    const board = hero?.querySelector('.produce-composition');
    if (!hero || !board) return;
    const motifs = Array.from(board.querySelectorAll(':scope > g'));
    if (!motifs.length) return;

    // Mesure une seule fois, avant toute transformation, dans le repère d'origine.
    const pieces = motifs.map((element) => {
      const { x, y, width, height } = element.getBBox();
      return { element, x, y, width, height };
    });

    let queued = false;
    const layout = () => {
      queued = false;
      const { width: W, height: H } = hero.getBoundingClientRect();
      if (W <= 0 || H <= 0) return;
      const scale = Math.min(W / ORIGINAL_WIDTH, H / ORIGINAL_HEIGHT);
      // 1 unité dans le viewBox vaut 1 pixel CSS ; pas de déformation SVG.
      board.setAttribute('viewBox', `0 0 ${W} ${H}`);
      board.setAttribute('preserveAspectRatio', 'none');
      for (const { element, x, y, width, height } of pieces) {
        const availableX = W - width * scale;
        const availableY = H - height * scale;
        const originalX = ORIGINAL_WIDTH - width;
        const originalY = ORIGINAL_HEIGHT - height;
        // Conserve les positions du schéma à rapport 16:9 ; adapte l'espace
        // entre les pièces au ratio du bandeau sans changer leur géométrie.
        const newX = originalX > 0 ? (x / originalX) * availableX : x * scale;
        const newY = originalY > 0 ? (y / originalY) * availableY : y * scale;
        const dx = newX - x * scale;
        const dy = newY - y * scale;
        element.setAttribute('transform', `translate(${dx.toFixed(4)} ${dy.toFixed(4)}) scale(${scale.toFixed(6)})`);
      }
    };
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(layout);
    };
    schedule();
    if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(hero);
    else window.addEventListener('resize', schedule, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else init();
})();
