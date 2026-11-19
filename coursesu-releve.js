/* Lecture d'un tarif explicitement affiché sur une fiche ou une étiquette. */
(() => {
  'use strict';
  function kiloPrices(value) {
    const text = String(value || '').replace(/[\u00a0\u202f]/g, ' ')
      .replace(/(^|[^\d.,])(\d{1,3})\s*€\s*(\d{2})\b(?![.,]\d)/g, '$1$2,$3 €');
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
  function capturePage(pricesInText) {
    const here = new URL(location.href);
    if (here.origin !== 'https://www.coursesu.com' || !/^\/(?:c\/|p\/|recherche(?:\/|$))/.test(here.pathname)) return null;
    const visible = node => !!node?.getClientRects().length && !node.closest('[hidden],[aria-hidden="true"]') &&
      getComputedStyle(node).visibility !== 'hidden';
    const product = href => {
      try {
        const u = new URL(href,here);
        const id = /^\/p\/[^/]+\/(\d+)\.html\/?$/.exec(u.pathname)?.[1];
        return id && u.origin === here.origin ? {article:id,url:u.origin+u.pathname} : null;
      } catch { return null; }
    };
    const main = document.querySelector('main,[role="main"],#main,#pdpMain') || document.body;
    const idsIn = node => new Set([...node.querySelectorAll('a[href*="/p/"]')].map(a => product(a.href)?.article).filter(Boolean));
    const seen = new Map(), discovered = new Set(), dispute = new Set();
    const add = (p,name,amounts) => {
      if (!p || !name) return;
      discovered.add(p.article);
      if (amounts.length > 1) dispute.add(p.article);
      if (amounts.length !== 1 || dispute.has(p.article)) return;
      const previous = seen.get(p.article);
      if (previous && previous.kgCentimes !== amounts[0]) { dispute.add(p.article); return; }
      seen.set(p.article,{...p,nom:name.replace(/\s+/g,' ').trim().slice(0,145),kgCentimes:amounts[0]});
    };
    const pageProduct = product(here.href);
    if (pageProduct) {
      const title = main.querySelector('h1,.product-name,[itemprop="name"]');
      if (!title || !visible(title)) return null;
      discovered.add(pageProduct.article);
      const selected = window.getSelection();
      const selection = selected?.toString().trim();
      const selectedArea = selected?.anchorNode?.parentElement;
      let amounts = [];
      if (selection && selectedArea && main.contains(selectedArea) && !selectedArea.closest('aside,nav,footer')) {
        const otherCard = selectedArea.closest('.product-tile,[data-pid],article,li');
        if (!otherCard || [...idsIn(otherCard)].every(id => id === pageProduct.article)) amounts = pricesInText(selection);
      } else {
        let parent = title.parentElement;
        while (parent && main.contains(parent)) {
          if ([...idsIn(parent)].some(id => id !== pageProduct.article)) break;
          if (visible(parent)) {
            amounts = pricesInText(parent.innerText);
            if (amounts.length) break;
          }
          if (parent === main) break;
          parent = parent.parentElement;
        }
      }
      add(pageProduct,title.innerText.trim(),amounts);
    } else {
      for (const link of main.querySelectorAll('a[href*="/p/"]')) {
        const p = product(link.href);
        if (!p || !visible(link) || link.closest('aside,nav,footer')) continue;
        discovered.add(p.article);
        const anchorName = link.innerText.trim() || link.querySelector('img')?.alt?.trim() || link.getAttribute('aria-label') || link.title;
        let area = link.parentElement;
        while (area && area !== main) {
          const ids = idsIn(area);
          if (ids.size !== 1 || !ids.has(p.article)) break;
          const amounts = pricesInText(area.innerText);
          if (amounts.length) {
            const title = area.querySelector('.product-name,.pdp-link,h2,h3,[itemprop="name"]');
            add(p,(title && visible(title) ? title.innerText.trim() : '') || anchorName,amounts);
            break;
          }
          area = area.parentElement;
        }
      }
    }
    for (const id of dispute) seen.delete(id);
    const articles = [...seen.values()];
    return {type:'inventaires-u-page-coursesu',schemaVersion:1,
      date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date()),
      articles,unpriced:discovered.size-articles.length};
  }
  function batchShortcut() {
    return 'const page = (' + capturePage.toString() + ')(' + kiloPrices.toString() + ');' +
      "completion(page?.articles.length ? JSON.stringify(page) : 'Aucun prix au kilo lisible. Sélectionne le magasin et ouvre la fiche du produit ou le rayon.');";
  }
  window.IUCoursesCapture = {kiloPrices, capture:() => capturePage(kiloPrices), batchShortcut, shortcut: () => '(' + readSafariPage.toString() + ')(' + kiloPrices.toString() + ');'};
})();
