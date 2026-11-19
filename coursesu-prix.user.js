// ==UserScript==
// @name        Inventaires U – relever les prix du Drive
// @namespace   https://inventaires-u.com/
// @version     1.0.0
// @description Transmettre les prix au kilo des articles affichés dans Safari.
// @match       https://www.coursesu.com/p/*
// @match       https://www.coursesu.com/c/*
// @match       https://www.coursesu.com/recherche*
// @require     https://inventaires-u.com/coursesu-releve.js?v=40.72
// @run-at      document-idle
// @grant       none
// ==/UserScript==
(() => {
  'use strict';
  const origin = 'https://www.coursesu.com';
  if (window.top !== window.self || location.origin !== origin || !window.IUCoursesCapture ||
      !/^\/(?:c\/|p\/|recherche(?:\/|$))/.test(location.pathname) || document.getElementById('iu-drive-transfer')) return;
  const link = document.createElement('a');
  link.id = 'iu-drive-transfer'; link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.textContent = 'Relever les prix pour Inventaires U';
  Object.assign(link.style,{position:'fixed',right:'12px',bottom:'max(16px,env(safe-area-inset-bottom))',
    zIndex:'2147483646',borderRadius:'18px',border:'1px solid #d4e2e9',background:'#fff',color:'#123d4a',
    boxShadow:'0 2px 12px #0002',padding:'10px 14px',font:'600 14px system-ui',cursor:'pointer',maxWidth:'88vw'});
  link.href = 'https://inventaires-u.com/#tarifs';
  link.addEventListener('click',event => {
    const batch = window.IUCoursesCapture.capture();
    if (!batch?.articles.length) {
      event.preventDefault();link.textContent = 'Aucun €/kg visible · choisir le magasin ou ouvrir la fiche';return;
    }
    const selected = new URLSearchParams({drive:JSON.stringify(batch)}).toString();
    if (selected.length > 60000) {
      event.preventDefault();link.textContent = 'Ouvre un sous-rayon pour transmettre moins de produits à la fois';return;
    }
    link.href = 'https://inventaires-u.com/#tarifs?' + selected;
  });
  document.body.append(link);

  const app = 'https://inventaires-u.com', parent = window.opener;
  if (!parent) return;
  let request = null, observer = null, delay = 0, expires = 0, last = '';
  function stop() {
    observer?.disconnect(); observer = null; clearTimeout(delay); clearTimeout(expires); request = null;
  }
  function read() {
    if (!request) return;
    const batch = window.IUCoursesCapture.capture();
    const onProduct = location.pathname.startsWith('/p/');
    const item = batch?.articles.find(p=>p.article === request.article) || (onProduct && batch?.articles.length === 1 ? batch.articles[0] : null);
    if (!item) return;
    const key = item.article+'|'+item.kgCentimes;
    if (last === key) return;
    last = key;
    parent.postMessage({type:'iu-drive-price',token:request.token,date:batch.date,item},app);
  }
  window.addEventListener('message',event => {
    if (event.origin !== app || event.source !== parent) return;
    const msg = event.data;
    if (msg?.type === 'iu-drive-received' && request && msg.token === request.token) {
      stop();link.textContent = 'Tarif transmis · reviens dans Inventaires U';return;
    }
    if (msg?.type !== 'iu-drive-read' || typeof msg.article !== 'string' || msg.article.length > 24 ||
        typeof msg.token !== 'string' || msg.token.length > 80) return;
    stop(); request = {article:msg.article,token:msg.token}; last = '';
    read();
    const main = document.querySelector('main,[role="main"],#main,#pdpMain') || document.body;
    observer = new MutationObserver(()=>{clearTimeout(delay);delay=setTimeout(read,300);});
    observer.observe(main,{subtree:true,childList:true,characterData:true});
    expires = setTimeout(stop,120000);
  });
  window.addEventListener('pagehide',stop);
  parent.postMessage({type:'iu-drive-ready'},app);
})();
