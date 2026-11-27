// Product gallery: progressive enhancement, real product images only.
(() => {
  'use strict';
  const root = document.querySelector('[data-product-gallery]');
  const main = root?.querySelector('[data-product-main-image]');
  const link = root?.querySelector('[data-product-photo-expand]');
  const dialog = root?.querySelector('[data-product-photo-dialog]');
  const large = dialog?.querySelector('[data-product-photo-large]');
  const close = dialog?.querySelector('[data-product-photo-close]');
  const stage = main?.parentElement;
  if (!root || !main || !link || !dialog || !large || !close || !stage) return;
  const thumbs = [...root.querySelectorAll('[data-gallery-image]')].filter(b => b.dataset.imageUrl);
  const lang = document.documentElement.lang.split('-')[0];
  const rtl = document.documentElement.dir === 'rtl';
  const words = ({
    nl:['Vorige foto','Volgende foto','Foto','Variantfoto','van'],
    fr:['Photo précédente','Photo suivante','Photo','Photo de variante','sur'],
    ar:['الصورة السابقة','الصورة التالية','صورة','صورة الخيار','من'],
    ckb:['وێنەی پێشوو','وێنەی دواتر','وێنە','وێنەی جۆر','لە'],
    kmr:['وێنەیێ بەرێ','وێنەیێ پاشێ','وێنە','وێنەیێ جۆری','ژ'],
    en:['Previous photo','Next photo','Photo','Variant photo','of']
  })[lang] || ['Previous photo','Next photo','Photo','Variant photo','of'];
  const abs = url => { try { return new URL(url, location.href).href; } catch { return ''; } };
  const motion = () => document.body.dataset.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const current = () => abs(main.getAttribute('src') || '');
  const index = () => thumbs.findIndex(b => abs(b.dataset.imageUrl) === current());
  const counters = [];
  let displayed = main.complete && main.naturalWidth ? current() : '';
  let layer = null, sequence = 0, latest = current();
  let dialogSequence = 0;
  const removeLayer = () => { if (layer) { layer.remove(); layer = null; } };
  const warm = new Set();
  const preload = () => {
    if (thumbs.length < 2 || navigator.connection?.saveData) return;
    const i = index();
    for (const n of new Set([(i+1+thumbs.length)%thumbs.length,(i-1+thumbs.length)%thumbs.length])) {
      const url = abs(thumbs[n].dataset.imageUrl);
      if (!url || warm.has(url) || url === current()) continue;
      warm.add(url);
      const img = new Image(); img.decoding = 'async'; img.fetchPriority = 'low'; img.src = url;
    }
  };
  const syncDialog = () => {
    if (!dialog.open) return;
    const n = ++dialogSequence, url = current();
    if (abs(large.getAttribute('src') || '') === url) { large.alt = main.alt || ''; return; }
    large.src = url; large.alt = main.alt || '';
    if (motion() && large.animate) {
      (large.decode ? large.decode() : Promise.resolve()).then(() => {
        if (n === dialogSequence && dialog.open && motion()) large.animate([{opacity:.55,transform:'scale(.985)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease-out'});
      }).catch(() => {});
    }
  };
  const sync = () => {
    const i = index();
    link.href = current();
    thumbs.forEach((b,n) => {
      b.classList.toggle('is-active', n === i);
      b.setAttribute('aria-pressed', String(n === i));
    });
    for (const c of counters) c.textContent = i < 0 ? words[3] : (i+1) + ' / ' + thumbs.length;
    syncDialog();
    preload();
  };
  const changed = () => {
    const url = current();
    sync();
    if (url === latest) return;
    latest = url;
    const token = ++sequence;
    if (displayed && displayed !== url && motion() && !layer) {
      layer = document.createElement('img');
      layer.className = 'product-gallery-outgoing';
      layer.alt = ''; layer.setAttribute('aria-hidden','true'); layer.draggable = false;
      layer.src = displayed; stage.append(layer);
    }
    const finish = () => {
      if (token !== sequence || current() !== url || !main.naturalWidth) return;
      displayed = url;
      if (!layer) return;
      const outgoing = layer;
      if (!motion() || !outgoing.animate) { removeLayer(); return; }
      const effect = outgoing.animate([{opacity:1},{opacity:0}],{duration:300,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});
      effect.finished.catch(() => {}).then(() => {
        if (layer === outgoing && token === sequence) removeLayer();
        else if (layer === outgoing) { effect.cancel(); }
      });
    };
    if (main.decode) main.decode().then(finish).catch(() => { if (token === sequence) removeLayer(); });
    else if (main.complete) finish();
    else main.addEventListener('load',finish,{once:true});
  };
  const go = delta => {
    if (thumbs.length < 2) return;
    const i = index();
    const next = i < 0 ? (delta > 0 ? 0 : thumbs.length-1) : (i+delta+thumbs.length)%thumbs.length;
    thumbs[next].click(); // Existing cart/variant gallery state stays authoritative.
    const strip = thumbs[next].parentElement, b = thumbs[next];
    const a = strip.getBoundingClientRect(), r = b.getBoundingClientRect();
    if (r.left < a.left || r.right > a.right) strip.scrollBy({left:r.left < a.left ? r.left-a.left-8 : r.right-a.right+8,behavior:motion()?'smooth':'auto'});
  };
  const makeNav = (parent, name) => {
    if (thumbs.length < 2) return;
    const nav = document.createElement('div'); nav.className = 'product-gallery-nav ' + name;
    const create = delta => {
      const b = document.createElement('button'); b.type='button';
      b.className = 'product-gallery-arrow ' + (delta < 0?'is-prev':'is-next');
      b.setAttribute('aria-label', words[delta < 0 ? 0 : 1]);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','22');svg.setAttribute('height','22');svg.setAttribute('aria-hidden','true');
      const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',(delta<0)!==rtl?'M19 12H5m7-7-7 7 7 7':'M5 12h14m-7-7 7 7-7 7');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.8');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);b.append(svg);b.title=words[delta<0?0:1];
      b.addEventListener('click',()=>go(delta)); return b;
    };
    const count = document.createElement('span'); count.className='product-gallery-count';
    count.setAttribute('role','status'); count.setAttribute('aria-live','polite'); count.setAttribute('aria-atomic','true');
    counters.push(count); nav.append(create(-1),count,create(1)); parent.append(nav);
  };
  makeNav(stage.parentElement,'is-stage');
  makeNav(large.parentElement,'is-dialog');
  if (thumbs.length > 1) {
    root.classList.add('has-multiple-photos');
    thumbs.forEach((b,n) => b.setAttribute('aria-label', words[2]+' '+(n+1)+' '+words[4]+' '+thumbs.length));
    const key = e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !['ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault(); go((e.key==='ArrowRight' ? 1 : -1)*(rtl?-1:1));
    };
    root.addEventListener('keydown',key);
    const swipe = el => {
      let start = null;
      el.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch' && e.isPrimary && !e.target.closest('button,a')) start={x:e.clientX,y:e.clientY,id:e.pointerId};
      },{passive:true});
      el.addEventListener('pointerup', e => {
        if (!start || e.pointerId!==start.id) return;
        const dx=e.clientX-start.x,dy=e.clientY-start.y; start=null;
        if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.4) go((dx<0?1:-1)*(rtl?-1:1));
      },{passive:true});
      el.addEventListener('pointercancel',()=>{start=null;},{passive:true});
    };
    swipe(stage); swipe(large);
  }
  main.addEventListener('load',()=>{ if (!displayed) displayed=current(); });
  main.addEventListener('error',removeLayer);
  new MutationObserver(changed).observe(main,{attributes:true,attributeFilter:['src','alt']});
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    large.src = current(); large.alt = main.alt || '';
    if (!dialog.open) dialog.showModal();
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{++dialogSequence;link.focus();});
  sync();
})();
