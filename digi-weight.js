/* Étiquettes à montant variable de la balance de Saint-Germain, vérifiées sur les étiquettes du rayon. */
(() => {
  'use strict';
  function amountCents(code, prefix) {
    if (!/^(?:02|2\d)\d{11}$/.test(code) || code.length !== 13 || prefix !== code.slice(0,7)) return null;
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
    if ((10 - sum % 10) % 10 !== Number(code[12])) return null;
    const encoded = Number(code.slice(7,12));
    // Une conversion arrondie sur cinq chiffres pour un montant déjà arrondi au centime.
    const cents = Math.round(encoded * 100000 / 655957);
    if (!cents || Math.round(cents * 655957 / 100000) !== encoded) return null;
    return cents;
  }
  function estimate(code, prefix, kgCents) {
    const total = amountCents(code,prefix);
    if (total === null || !Number.isInteger(kgCents) || kgCents < 1 || kgCents > 99999) return null;
    const low = Math.max(1,Math.ceil((2*total-1)*500/kgCents));
    const high = Math.ceil((2*total+1)*500/kgCents)-1;
    if (high < low) return null;
    const grams = Math.max(low,Math.min(high,Math.round(total*1000/kgCents)));
    return {total,grams,low,high};
  }
  window.IUDigiWeight = {amountCents,estimate};
})();
