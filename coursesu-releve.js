/* Lecture d'un tarif explicitement affiché sur une fiche ou une étiquette. */
(() => {
  'use strict';
  function kiloPrices(value) {
    const text = String(value || '').replace(/[\u00a0\u202f]/g, ' ')
      .replace(/(^|[^\d.,])(\d{1,3})\s*€(\d{2})\b(?![.,]\d)/g, '$1$2,$3 €');
    const patterns = [
      /(?:^|[^\d.,])(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:€|EUR)\s*(?:\/|par\s+|le\s+)\s*(?:kg|kilo(?:gramme)?)\b/gi,
      /(?:prix\s+(?:au|par)\s+(?:kg|kilo(?:gramme)?)|(?:le|au)\s+kilo(?:gramme)?)\s*[:=]?\s*(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:€|EUR)(?!\d)/gi
    ];
    const found = new Set();
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const cents = Math.round(Number(match[1].replace(',', '.')) * 100);
        if (cents > 0 && cents <= 99999) found.add(cents);
      }
    }
    return [...found];
  }

  // Le raccourci opère uniquement sur le texte visible de la fiche déjà ouverte.
  function readSafariPage(pricesInText) {
    const address = new URL(location.href);
    const product = /^\/p\/[^/]+\/(\d+)\.html\/?$/.exec(address.pathname);
    if (address.protocol !== 'https:' || address.hostname !== 'www.coursesu.com' || !product) {
      return completion('Ouvre la fiche du produit sur www.coursesu.com.');
    }
    const selected = window.getSelection()?.toString().trim();
    const main = document.querySelector('main, [role="main"], #pdpMain');
    const title = (main?.querySelector('h1') || document.querySelector('h1'))?.innerText?.trim();
    const block = main?.querySelector('#product-content, .product-content, [itemprop="offers"]');
    const prices = pricesInText(selected || block?.innerText || '');
    if (!title || prices.length !== 1) {
      return completion('Sélectionne la ligne qui affiche le prix en €/kg du produit, puis relance le raccourci.');
    }
    const date = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris'}).format(new Date());
    completion(JSON.stringify({type:'inventaires-u-fiche-coursesu', article:product[1],
      nom:title.slice(0,145), date, kgCentimes:prices[0], url:address.origin + address.pathname}));
  }
  window.IUCoursesCapture = {kiloPrices, shortcut: () => '(' + readSafariPage.toString() + ')(' + kiloPrices.toString() + ');'};
})();
