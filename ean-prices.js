/* Recherche locale par code balance ou GTIN complet, pour Super U Saint-Germain. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalogueKey = 'iu-catalogue-tarifs-stg-v1';
  const notesKey = 'iu-releves-kg-stg-v1';
  const pilotKey = 'iu-coursesu-price-pilot-v1';
  const store = 'superu-saintgermain';
  const driveUrl = 'https://www.coursesu.com/drive-superu-saintgermain';
  const sourceNames = {etiquette:'Étiquette du magasin', drive:'Courses U · relevé confirmé', flux:'Flux tarifaire du magasin'};
  const parisDate = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris'});
  const euro = new Intl.NumberFormat('fr-FR', {style:'currency', currency:'EUR'});
  const displayDate = value => value.split('-').reverse().join('/');
  const today = () => parisDate.format(new Date());
  const isPrefix = code => /^(?:02|2\d)\d{5}$/.test(code);
  const centsOK = n => Number.isInteger(n) && n > 0 && n <= 99999;
  const isArticleId = value => typeof value === 'string' && /^[A-Za-z0-9]{1,24}$/.test(value);
  const isPlu = value => typeof value === 'string' && /^\d{1,18}$/.test(value);
  let index = null, current = null;

  function dateOK(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today()) return false;
    const time = Date.parse(value + 'T12:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
  }
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch { return null; }
  }
  function normalize(raw, allowPrefix = false) {
    let code = String(raw ?? '').replace(/[\s-]/g,'');
    if (allowPrefix && isPrefix(code)) return code;
    if (!/^(?:\d{8}|\d{12,14})$/.test(code)) return '';
    let sum = 0;
    for (let i = code.length - 2; i >= 0; i--) {
      sum += Number(code[i]) * ((code.length - i) % 2 === 0 ? 3 : 1);
    }
    if ((10 - sum % 10) % 10 !== Number(code.at(-1))) return '';
    if (code.length === 12) code = '0' + code;
    if (code.length === 14 && code[0] === '0') code = code.slice(1);
    return code;
  }

  const noteId = (n,old = false) => [n.code,n.article,n.source,n.date,old ? n.ancienCentimes : n.kgCentimes].join('|');
  function build(data) {
    if (data?.type !== 'inventaires-u-catalogue-tarifs' || data.schemaVersion !== 1 ||
        data.storeId !== store || !dateOK(data.dateExport) || !Array.isArray(data.articles) ||
        !data.articles.length || data.articles.length > 12000 || !Array.isArray(data.releves) || data.releves.length > 24000) {
      throw Error('Catalogue, date ou magasin non reconnu.');
    }
    const groups = new Map(), notes = new Map();
    for (const row of data.articles) {
      if (!row || !row.code || normalize(row.code,true) !== row.code || !isArticleId(row.article) ||
          typeof row.nom !== 'string' || !row.nom.trim() || row.nom.length > 160 || typeof row.actif !== 'boolean' ||
          (row.plu != null && !isPlu(row.plu)) || (row.venteCentimes != null && !centsOK(row.venteCentimes))) {
        throw Error('Référence ou prix de vente invalide.');
      }
      const matches = groups.get(row.code) || [];
      if (matches.some(item => item.article === row.article)) throw Error('Référence en double.');
      matches.push(row);
      groups.set(row.code,matches);
    }
    for (const note of data.releves) {
      if (!note || !['etiquette','drive'].includes(note.source) || !dateOK(note.date) ||
          !centsOK(note.kgCentimes) || !groups.get(note.code)?.some(item => item.article === note.article)) {
        throw Error('Relevé sans unité, référence ou date valide.');
      }
      const list = notes.get(note.code) || [];
      list.push(note); notes.set(note.code,list);
    }
    const corrections = new Map(), rules = data.rectifications ?? [];
    if (!Array.isArray(rules) || rules.length > 24000) throw Error('Liste des rectifications invalide.');
    for (const rule of rules) {
      if (!rule || !centsOK(rule.ancienCentimes) || rule.ancienCentimes === rule.kgCentimes ||
          !dateOK(rule.dateCorrection) || rule.dateCorrection < rule.date ||
          !notes.get(rule.code)?.some(n => noteId(n) === noteId(rule))) throw Error('Rectification sans relevé correspondant.');
      const id = noteId(rule,true);
      if (corrections.has(id) && corrections.get(id).kgCentimes !== rule.kgCentimes) throw Error('Rectifications incompatibles.');
      corrections.set(id,rule);
    }
    for (const rule of rules) {
      if (corrections.has(noteId(rule))) throw Error('Le montant corrigé doit être le tarif retenu.');
    }
    return {data, groups, notes, corrections};
  }
  function database() {
    if (!index) {
      const saved = read(catalogueKey);
      if (saved) { try { index = build(saved); } catch { /* Un nouvel import reste possible. */ } }
    }
    return index;
  }
  function match(code) {
    const db = database();
    let key = code;
    if (!db?.groups.has(code) && code.length === 13 && isPrefix(code.slice(0,7))) key = code.slice(0,7);
    const rows = db?.groups.get(key) || [];
    const localNotes = read(notesKey)?.[key];
    const remembered = Array.isArray(localNotes) ? localNotes.at(-1) : null;
    return {key, row:rows.length === 1 ? rows[0] : null, ambiguous:rows.length > 1,
      remembered: !rows.length && typeof remembered?.nom === 'string' ? {name:remembered.nom,plu:remembered.plu || ''} : null};
  }
  function feedItems() {
    const result = [];
    database()?.groups.forEach((rows, code) => {
      if (rows.length === 1 && rows[0].plu && isPrefix(code)) result.push({eanPrefix:code, plu:rows[0].plu});
    });
    return result;
  }
  function count() {
    const db = database();
    const message = db ? db.groups.size.toLocaleString('fr-FR') + ' codes · export du ' + displayDate(db.data.dateExport)
      : 'Importe le fichier de tarifs de Saint-Germain pour retrouver les références sur cet appareil.';
    $('iuPriceCount').textContent = message; $('iuPriceModalCount').textContent = message;
  }

  function observedPrices(state) {
    const {key,row,plu} = state;
    const imported = (database()?.notes.get(key) || []).filter(n => n.article === row?.article);
    const saved = read(notesKey)?.[key] || [];
    const notes = imported.concat(Array.isArray(saved) ? saved.filter(n => n.article ? n.article === row?.article :
      (!row || (n.plu && n.plu === row.plu))) : []);
    const pilot = read(pilotKey);
    const item = Array.isArray(pilot?.items) && pilot.items.find(i => i.eanPrefix === key && (!plu || String(i.plu) === String(plu)));
    const p = item && pilot.prices?.[item.plu];
    const f = pilot?.feedPrices?.[key];
    for (const entry of [p,f]) {
      if (!entry?.confirmed || entry.eanPrefix !== key || (entry.plu && plu && String(entry.plu) !== String(plu))) continue;
      if (entry.origin !== 'authorized-feed' && pilot.store !== driveUrl) continue;
      const stamp = Number(entry.checkedAt);
      const value = Math.round(Number(entry.price) * 100);
      if (!Number.isFinite(stamp) || stamp <= 0 || stamp > Date.now() || !centsOK(value)) continue;
      notes.push({source:entry.origin === 'authorized-feed' ? 'flux' : 'drive', date:parisDate.format(new Date(stamp)), kgCentimes:value});
    }
    // Afficher le dernier jour disponible par source. Deux montants le même jour restent visibles.
    const corrections = database()?.corrections;
    const sorted = notes.map(n => corrections?.get(noteId({...n,code:key,article:row?.article})) || n)
      .filter(n => Object.hasOwn(sourceNames,n.source) && centsOK(n.kgCentimes) && dateOK(n.date))
      .sort((a,b) => b.date.localeCompare(a.date));
    const dates = new Map(), seen = new Set();
    return sorted.filter(n => {
      if (!dates.has(n.source)) dates.set(n.source,n.date);
      const id = n.source + '|' + n.date + '|' + n.kgCentimes;
      if (dates.get(n.source) !== n.date || seen.has(id)) return false;
      seen.add(id); return true;
    });
  }

  function packRate(row) {
    if (!row || row.plu || isPrefix(row.code) || !centsOK(row.venteCentimes)) return null;
    const name = row.nom.toUpperCase();
    // Grammage unique du conditionnement de vente, jamais celui du carton fournisseur.
    if (!/\b(?:FILET|SACHET|GIRSAC|SAC|BARQUETTE|BARQ|BQ|BO[IÎ]TE|POT|BLISTER|POIDS NET)\b/.test(name) ||
        /[%+±~]|\b(?:ENV|ENVIRON|LOT|VRAC|COLIS|CAISSE|CARTON|PALETTE|CALIBRE|CAL|OFFERT|MINI(?:MUM)?|MAXI(?:MUM)?)\b|\d\s*[/–-]\s*\d|\d\s*[X×]|[X×]\s*\d/i.test(name)) return null;
    const weights = [...name.matchAll(/(?:^|[^A-Z0-9.,])(\d+(?:[.,]\d+)?)\s*(KG|KILOGRAMMES?|GRAMMES?|GR|G)\b/g)];
    if (weights.length !== 1) return null;
    const grams = Number(weights[0][1].replace(',','.')) * (weights[0][2].startsWith('K') ? 1000 : 1);
    if (!Number.isSafeInteger(grams) || grams <= 0) return null;
    const cents = Math.round(row.venteCentimes * 1000 / grams);
    return centsOK(cents) ? {grams,cents} : null;
  }
  function render() {
    if (!current) return;
    const state = current, row = state.row;
    const notes = state.blocked ? [] : observedPrices(state);
    const pack = !state.blocked && packRate(row);
    let headline = 'Prix au kilo à relever';
    if (state.blocked) headline = 'Correspondance à vérifier';
    else if (notes.length) {
      const latest = notes.filter(n => n.date === notes[0].date);
      const different = new Set(latest.map(n => n.kgCentimes)).size > 1;
      headline = different ? 'Tarifs différents pour le ' + displayDate(notes[0].date) :
        euro.format(notes[0].kgCentimes/100) + '/kg' + (notes[0].date < today() ? ' · relevé du ' + displayDate(notes[0].date) : '');
    }
    if (pack && !notes.length) headline = euro.format(pack.cents/100) + '/kg · calcul sur le paquet';
    $('iuPriceValue').textContent = headline;
    const list = $('iuPriceSources');
    list.replaceChildren();
    for (const n of notes) {
      const li = document.createElement('li');
      li.textContent = sourceNames[n.source] + ' · ' + displayDate(n.date) + ' · ' + euro.format(n.kgCentimes/100) + '/kg';
      list.append(li);
    }
    if (pack) {
      const li = document.createElement('li');
      li.textContent = 'Ulis · ' + displayDate(database().data.dateExport) + ' · équivalent de ' + euro.format(pack.cents/100) +
        '/kg si ' + euro.format(row.venteCentimes/100) + ' correspond au paquet de ' + pack.grams.toLocaleString('fr-FR') + ' g indiqué dans le libellé.';
      list.append(li);
    }
    $('iuPriceRetail').textContent = row ? (row.venteCentimes ? 'Ulis · prix de vente ' + euro.format(row.venteCentimes/100) +
      (pack ? '' : ' · unité non précisée') : 'Ulis · prix de vente absent') + ' · ' + displayDate(database().data.dateExport) +
      (row.actif ? '' : ' · article inactif dans l’export') : '';
    $('iuPriceRecord').hidden = state.blocked;
  }

  function show(code, identity, conflict) {
    const found = match(code);
    current = {...found, code, plu:identity?.plu || found.row?.plu || '', name:identity?.name || found.row?.nom || '',
      blocked:conflict || found.ambiguous || !!(found.row?.plu && identity?.plu && found.row.plu !== identity.plu)};
    $('iuPriceRecord').open = false;
    $('iuPriceForm').reset();
    const date = $('iuPriceDate');
    date.value = today(); date.max = date.value;
    $('iuPriceName').value = current.name;
    $('iuPriceNameField').hidden = !!current.name;
    $('iuPricePreview').textContent = '';
    $('iuPriceStoreCheck').checked = false;
    $('iuPriceShop').href = driveUrl;
    const savedNotes = read(notesKey)?.[found.key];
    const knownUrl = Array.isArray(savedNotes) && savedNotes.slice().reverse().find(n => n.source === 'drive' && n.url &&
      (found.row ? n.article === found.row.article : !n.article))?.url;
    const productUrl = safeProduct(knownUrl || found.row?.fiche);
    if (productUrl && (knownUrl || productUrl.id === found.row?.article)) {
      $('iuPriceShop').href = productUrl.url;
      $('iuPriceShop').textContent = 'Ouvrir la fiche Courses U';
    } else if (current.name) {
      const search = new URL('https://www.coursesu.com/recherche');
      search.searchParams.set('q',current.name); $('iuPriceShop').href = search.href;
      $('iuPriceShop').textContent = 'Rechercher cet article sur Courses U';
    } else { $('iuPriceShop').textContent = 'Ouvrir le drive de Saint-Germain'; }
    render();
  }
  function safeProduct(text) {
    try {
      const u = new URL(text);
      const path = /^\/p\/[^/]+\/(\d+)\.html\/?$/.exec(u.pathname);
      if (u.origin === 'https://www.coursesu.com' && !u.username && !u.password && path) return {id:path[1],url:u.origin + u.pathname};
    } catch { /* Lien facultatif. */ }
    return null;
  }
  function draft() {
    const text = $('iuPriceText').value.trim();
    if (!text || text.length > 6000) throw Error('Colle une ligne de prix au kilo ou le relevé du raccourci Safari.');
    let source = $('iuPriceSource').value, date = $('iuPriceDate').value, name = $('iuPriceName').value.trim(), kgCentimes, url;
    if (text.startsWith('{')) {
      const capture = JSON.parse(text);
      const product = safeProduct(capture.url);
      if (capture.type !== 'inventaires-u-fiche-coursesu' || !product || product.id !== capture.article ||
          !centsOK(capture.kgCentimes) || !dateOK(capture.date) || typeof capture.nom !== 'string' || !capture.nom.trim()) {
        throw Error('Relevé de fiche Courses U invalide.');
      }
      if (current.row && product.id !== current.row.article) {
        const inCatalogue = database()?.data.articles.find(row => row.article === product.id);
        if (inCatalogue && inCatalogue.code !== current.key) throw Error('Cette fiche correspond à un autre code du catalogue.');
      }
      source = 'drive'; date = capture.date; kgCentimes = capture.kgCentimes; url = product.url;
      name = capture.nom.trim().slice(0,145);
    } else {
      const amounts = window.IUCoursesCapture.kiloPrices(text);
      if (amounts.length !== 1) throw Error(amounts.length ? 'Plusieurs prix au kilo. Sélectionne la ligne de l’article.'
        : 'Le texte doit préciser un prix au kilo, par exemple « 2,59 €/kg ».');
      kgCentimes = amounts[0];
    }
    if (!['drive','etiquette'].includes(source) || !dateOK(date)) throw Error('Vérifie la source et la date du relevé.');
    return {source,date,kgCentimes,nom:name,article:current.row?.article || '',plu:current.plu,url};
  }
  function preview() {
    $('iuPriceStoreCheck').checked = false;
    try {
      const n = draft();
      $('iuPricePreview').textContent = (n.nom || current?.name || 'Article à identifier') + ' · ' +
        euro.format(n.kgCentimes/100) + '/kg · ' + sourceNames[n.source] + ' · ' + displayDate(n.date) +
        (n.url && current.row && safeProduct(n.url).id !== current.row.article ?
        ' · Vérifie la correspondance avec ' + current.name + ' (identifiant Drive différent).' : '');
    } catch (error) {
      $('iuPricePreview').textContent = error.name === 'SyntaxError' ? 'Relevé JSON incomplet.' : error.message;
    }
  }
  let photoRequest = 0;
  $('iuPricePhoto').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || !current) return;
    const request = ++photoRequest, state = current;
    const field = $('iuPriceText'), status = $('iuPricePreview');
    field.value = ''; $('iuPriceStoreCheck').checked = false;
    status.textContent = 'Lecture de la photo sur cet appareil. Le premier chargement nécessite Internet.';
    try {
      const text = await window.IULabelOCR.readFile(file);
      if (request !== photoRequest || current !== state || field.value) return;
      const amounts = window.IUCoursesCapture.kiloPrices(text);
      if (amounts.length !== 1) throw Error(amounts.length ? 'Plusieurs prix détectés. Recadre la photo sur un seul article.'
        : 'Aucun montant explicite en €/kg reconnu. Recadre le tarif ou colle sa ligne.');
      field.value = (amounts[0]/100).toFixed(2).replace('.',',') + ' €/kg';
      preview();
    } catch (e) {
      if (request === photoRequest && current === state && !field.value) status.textContent = e.message || 'Lecture indisponible. Colle le prix affiché.';
    }
  });
  $('iuPriceForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!current || current.blocked) return;
    try {
      const n = draft();
      const latest = match(current.code);
      if (latest.ambiguous || latest.row?.article !== current.row?.article) throw Error('Le catalogue a changé. Relance la recherche avant de valider.');
      if (!n.nom || n.nom.length > 160) throw Error('Indique le nom figurant sur la fiche ou l’étiquette.');
      if (!$('iuPriceStoreCheck').checked) throw Error('Confirme le produit, le magasin et le tarif affiché.');
      const all = read(notesKey) || {}, key = current.key;
      const old = Array.isArray(all[key]) ? all[key] : [];
      const same = p => p.source === n.source && p.date === n.date && p.article === n.article && p.kgCentimes === n.kgCentimes;
      all[key] = old.filter(p => !same(p)).concat(n).slice(-48);
      localStorage.setItem(notesKey,JSON.stringify(all));
      render(); $('iuPriceRecord').open = false;
      $('iuEanStatus').textContent = 'Tarif enregistré pour ' + key + ' · ' + sourceNames[n.source] + '.';
    } catch (e) { $('iuPricePreview').textContent = e.name === 'QuotaExceededError' ? 'Stockage plein. Le relevé n’a pas été enregistré.' : e.message; }
  });
  for (const id of ['iuPriceText','iuPriceSource','iuPriceDate','iuPriceName']) $(id).addEventListener('input',preview);
  async function importCatalogue(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 5*1024*1024) throw Error('Fichier trop volumineux (5 Mo maximum).');
      const next = build(JSON.parse(await file.text()));
      const previous = read(catalogueKey);
      if (previous?.dateExport > next.data.dateExport) throw Error('Un export plus récent est déjà installé.');
      const seen = new Set(next.data.releves.map(n => noteId(n)));
      for (const n of previous?.releves || []) {
        const id = noteId(n);
        if (!seen.has(id) && next.groups.get(n.code)?.some(row => row.article === n.article)) { next.data.releves.push(n); seen.add(id); }
      }
      for (const r of previous?.rectifications || []) {
        const id = noteId(r,true);
        if (!seen.has(noteId(r)) || next.corrections.has(id)) continue;
        (next.data.rectifications ??= []).push(r);
      }
      const replaced = new Set((next.data.rectifications || []).map(r => noteId(r,true)));
      next.data.releves = next.data.releves.filter(n => !replaced.has(noteId(n)));
      const verified = build(next.data);
      localStorage.setItem(catalogueKey,JSON.stringify(verified.data));
      index = verified; count();
      const message = 'Tarifs disponibles sur cet appareil · ' + verified.notes.size + ' codes avec un relevé au kilo dans le fichier.';
      $('iuPriceImportStatus').textContent = message; $('iuPriceModalStatus').textContent = message;
      window.dispatchEvent(new Event('iu-refresh-ean-lookup'));
      window.dispatchEvent(new Event('iu-coursesu-prices-updated'));
    } catch (e) {
      const message = 'Import impossible. ' + e.message;
      $('iuPriceImportStatus').textContent = message; $('iuPriceModalStatus').textContent = message;
    }
  }
  $('iuPriceFile').addEventListener('change',importCatalogue);
  $('iuPriceModalFile').addEventListener('change',importCatalogue);
  $('iuPriceModalImport').addEventListener('toggle',event=>{if(event.target.open) count()});
  const shortcut = $('iuPriceShortcut');
  $('iuPriceCopy').addEventListener('click', async () => {
    shortcut.value = window.IUCoursesCapture.shortcut();
    try {
      await navigator.clipboard.writeText(shortcut.value);
      $('iuPriceCopyStatus').textContent = 'Script copié.';
    } catch {
      shortcut.hidden = false; shortcut.focus(); shortcut.select();
      $('iuPriceCopyStatus').textContent = 'Copie le texte sélectionné.';
    }
  });
  window.addEventListener('storage', event => {
    if (!event.key || event.key === catalogueKey) { index = null; count(); }
    if (current && !$('iuEanOverlay').hidden && (!event.key || [catalogueKey,notesKey,pilotKey].includes(event.key))) {
      if ($('iuPriceRecord').open) render(); else window.dispatchEvent(new Event('iu-refresh-ean-lookup'));
    }
  });
  window.addEventListener('iu-coursesu-prices-updated',render);
  function correctedPilotPrice(plu,entry,storeUrl) {
    if (!entry?.confirmed || entry.origin === 'authorized-feed' || storeUrl !== driveUrl) return entry;
    const row = match(String(entry.eanPrefix)).row, stamp = Number(entry.checkedAt);
    if (!row || row.plu !== String(plu) || !Number.isFinite(stamp) || stamp <= 0 || stamp > Date.now()) return entry;
    const id = noteId({code:entry.eanPrefix,article:row.article,source:'drive',date:parisDate.format(new Date(stamp)),
      kgCentimes:Math.round(Number(entry.price)*100)});
    const rule = database()?.corrections.get(id);
    return rule ? {...entry,price:(rule.kgCentimes/100).toFixed(2)} : entry;
  }
  window.IUEanPrices = {normalize,match,show,feedItems,correctedPilotPrice};
  // Le catalogue est chargé lors de la première consultation.
  $('iuEanAdminPanel').closest('details')?.addEventListener('toggle',event=>{ if (event.target.open) count(); });
})();
