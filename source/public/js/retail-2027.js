/* ShopEasy 2027: progressive enhancement only. No network libraries, trackers or
   writes to order, payment, auth or customer-data endpoints. */
(() => {
  'use strict';
  const safeSession = {
    read(key) { try {return JSON.parse(sessionStorage.getItem(key)||'null');} catch {return null;} },
    write(key,value) {try {sessionStorage.setItem(key,JSON.stringify(value));}catch{/* browser storage blocked */}}
  };
  const safeLocal = {
    read(key) {try {return localStorage.getItem(key);}catch {return null;}},
    write(key,value) {try {localStorage.setItem(key,value);}catch{/* private mode */}}
  };
  const safeProductHref = value => typeof value==='string' && /^\/product\/[a-zA-Z0-9_%\-\.]+(?:\?[^#<>]*)?$/.test(value) ? value : '';
  const safeImageHref = value => typeof value==='string' && (/^\/(?:assets|uploads)\/[a-z0-9_\-./]+$/i.test(value) || /^https:\/\/[a-z0-9.-]+(?:\:[0-9]{1,5})?\/[^<>]*$/i.test(value)) ? value : '/assets/product-placeholder.svg';
  const text = (tag,value,className) => {const el=document.createElement(tag);el.textContent=String(value??'');if(className)el.className=className;return el;};
  const sellerText = (tag,value,className) => {
    const element=text(tag,value,className);
    element.setAttribute('data-no-translate','');
    element.setAttribute('translate','no');
    return element;
  };
  const q = selector => document.querySelector(selector);
  const setSellerText = (selector,value) => {
    const element=q(selector);
    if (!element) return;
    // Protect the destination before MutationObserver sees the inserted seller text.
    element.setAttribute('data-no-translate','');
    element.setAttribute('translate','no');
    element.textContent=String(value??'');
  };

  // HOME ARRIVALS START
  // Pausing switches to a single, horizontally scrollable set of real products.
  // The duplicate set exists only for the seamless rightward animation.
  const arrivalSection = q('#new-arrivals');
  const arrivalRibbon = arrivalSection?.querySelector('.arrival-ribbon');
  const arrivalTrack = arrivalRibbon?.querySelector('.arrival-ribbon-track');
  const arrivalPause = arrivalSection?.querySelector('[data-arrival-pause]');
  const arrivalCopy = arrivalTrack?.querySelector('[data-arrival-copy]');
  if (arrivalRibbon && arrivalTrack && arrivalPause && arrivalCopy) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const label = arrivalPause.closest('label');
    let manual = null;
    const syncArrivalMotion = () => {
      const next = arrivalPause.checked || reducedMotion.matches;
      if (label) label.title = arrivalPause.checked
        ? arrivalPause.dataset.resumeLabel : arrivalPause.dataset.pauseLabel;
      if (manual === next) return;
      if (next) {
        const offset = Math.max(0, arrivalRibbon.getBoundingClientRect().left
          - arrivalTrack.getBoundingClientRect().left);
        arrivalTrack.style.animation = 'none';
        arrivalTrack.style.transform = 'none';
        arrivalTrack.style.willChange = 'auto';
        arrivalRibbon.style.overflowX = 'auto';
        arrivalCopy.style.display = 'none';
        arrivalRibbon.scrollLeft = Math.min(offset,
          Math.max(0, arrivalRibbon.scrollWidth - arrivalRibbon.clientWidth));
      } else {
        arrivalRibbon.scrollLeft = 0;
        for (const property of ['animation', 'transform', 'will-change']) {
          arrivalTrack.style.removeProperty(property);
        }
        arrivalRibbon.style.removeProperty('overflow-x');
        arrivalCopy.style.removeProperty('display');
      }
      manual = next;
    };
    arrivalPause.addEventListener('change', syncArrivalMotion);
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', syncArrivalMotion);
    else reducedMotion.addListener?.(syncArrivalMotion);
    // Duplicate links remain pointer-clickable, but must not receive focus and
    // collapse the moving row before the visitor can follow the product link.
    arrivalCopy.addEventListener('mousedown', event => {
      if (event.target.closest('a')) event.preventDefault();
    });
    arrivalRibbon.addEventListener('focusout', event => {
      if (!manual && !arrivalRibbon.contains(event.relatedTarget)) arrivalRibbon.scrollLeft = 0;
    });
    syncArrivalMotion();
  }
  // HOME ARRIVALS END

  // User-initiated theme preference; not analytics and never sent to the server.
  const themeButtons=[...document.querySelectorAll('[data-theme-toggle]')];
  if(themeButtons.length){
    const setTheme = mode => {
      const dark=mode==='dark';
      if(dark)document.documentElement.dataset.theme='dark';else delete document.documentElement.dataset.theme;
      for(const button of themeButtons){
        const language=String(document.documentElement.lang||'en').split('-')[0];
        const labels={kmr:['دۆخێ رووناک بکاربینە','دۆخێ تاری بکاربینە'],en:['Use light mode','Use dark mode'],ckb:['دۆخی ڕوون بەکاربهێنە','دۆخی تاریک بەکاربهێنە'],ar:['استخدام الوضع الفاتح','استخدام الوضع الداكن'],nl:['Lichte modus gebruiken','Donkere modus gebruiken'],fr:['Activer le mode clair','Activer le mode sombre']};
        const label=(labels[language]||labels.en)[dark?0:1];
        button.setAttribute('data-no-translate','');
        const icon=button.querySelector('[data-theme-icon]');
        if(icon) {
          if(!icon.querySelector('svg')) icon.textContent=dark?'☀':'☾';
        }
        else button.textContent=dark?'☀':'☾';
        button.setAttribute('aria-pressed',String(dark));
        const labelNode=button.querySelector('[data-theme-label]');
        if(labelNode) labelNode.textContent=label;
        button.setAttribute('aria-label',label);
        button.title=label;
      }
      document.documentElement.style.colorScheme=dark?'dark':'light';
      const chromeTheme=q('meta[name="theme-color"]');if(chromeTheme)chromeTheme.content=dark?'#101713':'#F7F6F2';
    };
    setTheme(safeLocal.read('shopeasy-theme-2027')==='dark'?'dark':'light');
    for(const button of themeButtons){
      button.addEventListener('click',()=>{
        const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
        safeLocal.write('shopeasy-theme-2027',next);
        setTheme(next);
      });
    }
  }

  // The language selector is submitted once by app.js; a second listener here
  // caused duplicate POST requests on one change.

  const quickView=q('[data-quick-dialog]');
  if(quickView && typeof quickView.showModal==='function'){
    let opener=null;
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-quick-view]');
      if(!button)return;
      const url=safeProductHref(button.dataset.quickUrl);
      if(!url)return;
      opener=button;
      const img=q('[data-quick-photo]');
      img.setAttribute('data-no-translate','');
      img.src=safeImageHref(button.dataset.quickImage);img.alt=button.dataset.quickName||'';
      setSellerText('[data-quick-title]',button.dataset.quickName);
      setSellerText('[data-quick-category]',button.dataset.quickCategory);
      setSellerText('[data-quick-price]',button.dataset.quickPrice);
      q('[data-quick-stock]').textContent=Number(button.dataset.quickStock)>0 ? 'Availability confirmed on product page':'Currently out of stock';
      q('[data-quick-link]').href=url;
      quickView.showModal();q('[data-quick-close]').focus();
    });
    q('[data-quick-close]').addEventListener('click',()=>quickView.close());
    quickView.addEventListener('click',event=>{if(event.target===quickView)quickView.close();});
    quickView.addEventListener('close',()=>opener?.focus());
  }
  // Explicit compare action is the only writer to the session list. No server tracking.
  const compareTray=q('[data-compare-tray]');
  if(compareTray){
    const compareCopy={
      en:{compare:'Compare +',remove:'Remove −',action:'Remove'},
      fr:{compare:'Comparer +',remove:'Retirer −',action:'Retirer'},
      nl:{compare:'Vergelijken +',remove:'Verwijderen −',action:'Verwijderen'},
      ar:{compare:'مقارنة +',remove:'إزالة −',action:'إزالة'},
      ckb:{compare:'بەراوردکردن +',remove:'سڕینەوە −',action:'سڕینەوە'}
    }[String(document.documentElement.lang||'en').split('-')[0]];
    const labels=compareCopy||{compare:'Compare +',remove:'Remove −',action:'Remove'};
    const storageKey='shopeasy-compare-2027';
    let items=Array.isArray(safeSession.read(storageKey))?safeSession.read(storageKey).filter(item=>safeProductHref(item?.url)).slice(0,3):[];
    const compareButton=q('[data-compare-open]'),compareList=q('[data-compare-list]');
    const view=q('[data-compare-dialog]');
    function render(){
      compareTray.hidden=items.length===0;compareList.replaceChildren();
      q('[data-compare-count]').textContent=String(items.length);
      document.querySelectorAll('[data-compare-add]').forEach(button=>{
        const active=items.some(item=>item.url===button.dataset.compareUrl);
        button.setAttribute('aria-pressed',String(active));
        const label=button.querySelector('[data-compare-label]');
        if(label)label.textContent=active?labels.remove:labels.compare;
      });
      for(const item of items){
        const button=document.createElement('button');button.type='button';
        const symbol=text('span','× ');symbol.setAttribute('aria-hidden','true');
        button.append(symbol,text('span',`${labels.action} `,'sr-only'),sellerText('span',item.name));
        button.addEventListener('click',()=>{items=items.filter(p=>p.url!==item.url);safeSession.write(storageKey,items);render();});
        compareList.append(button);
      }
    }
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-compare-add]');if(!button)return;
      const url=safeProductHref(button.dataset.compareUrl);if(!url)return;
      if(items.some(item=>item.url===url))items=items.filter(item=>item.url!==url);
      else {if(items.length>=3){q('[data-compare-note]').textContent='Choose up to three products. Remove one first.';return;}
        items.push({url,name:String(button.dataset.compareName||'Product').slice(0,150),price:String(button.dataset.comparePrice||'').slice(0,80),image:safeImageHref(button.dataset.compareImage)});
      }
      q('[data-compare-note]').textContent='';safeSession.write(storageKey,items);render();
    });
    if(compareButton&&view&&typeof view.showModal==='function'){
      compareButton.addEventListener('click',()=>{
        const container=q('[data-compare-columns]');container.replaceChildren();
        for(const item of items){
          const cell=document.createElement('div');cell.className='compare-product';
          const img=document.createElement('img');img.src=safeImageHref(item.image);img.width=100;img.height=120;img.loading='lazy';img.alt='';
          const link=sellerText('a',item.name);link.href=item.url;
          cell.append(img,link,sellerText('strong',item.price));container.append(cell);
        }
        view.showModal();q('[data-compare-close]').focus();
      });
      q('[data-compare-close]').addEventListener('click',()=>view.close());
      view.addEventListener('click',event=>{if(event.target===view)view.close();});
    }
    render();
  }

  // A session-only customer convenience; individual items are not sent externally.
  const recentWrapper=q('[data-recently-viewed]');
  if(recentWrapper){
    const key='shopeasy-recent-2027';
    let recent=Array.isArray(safeSession.read(key))?safeSession.read(key).filter(item=>safeProductHref(item?.url)).slice(0,6):[];
    const product=q('[data-recent-product]');
    if(product){
      const url=safeProductHref(product.dataset.recentUrl);
      if(url){
        recent=[{url,name:String(product.dataset.recentName||'').slice(0,150),price:String(product.dataset.recentPrice||'').slice(0,80),image:safeImageHref(product.dataset.recentImage)},...recent.filter(item=>item.url!==url)].slice(0,6);
        safeSession.write(key,recent);
      }
    }
    const region=q('[data-recent-items]');region.replaceChildren();
    const currentUrl=product?.dataset.recentUrl||'';
    for(const item of recent.filter(item=>item.url!==currentUrl)){
      const link=document.createElement('a');link.href=item.url;
      const image=document.createElement('img');image.src=safeImageHref(item.image);image.alt='';image.width=200;image.height=150;image.loading='lazy';
      link.append(image,sellerText('strong',item.name),sellerText('span',item.price));region.append(link);
    }
    recentWrapper.hidden=region.children.length===0;
  }


  // Accessible drawer: the original /cart link still works if script/fetch fails.
  const drawer=q('[data-cart-drawer]');
  if(drawer && typeof drawer.showModal==='function'){
    let opener=null;
    let requestVersion=0;
    let controller=null;
    const close=q('[data-cart-drawer-close]');
    const list=q('[data-cart-drawer-items]'),status=q('[data-cart-drawer-message]'),total=q('[data-cart-drawer-total]');
    const checkout=q('[data-cart-drawer-checkout]');
    const fmt=(value,currency)=>{
      const code=String(currency||'EUR').trim().toUpperCase();
      const pinnedDigits={IQD:3,BHD:3,JOD:3,KWD:3,OMR:3,TND:3,CLP:0,ISK:0,JPY:0,KRW:0,VND:0};
      let digits=pinnedDigits[code]??2;
      try{
        if(!Object.hasOwn(pinnedDigits,code)) digits=new Intl.NumberFormat('en',{style:'currency',currency:code}).resolvedOptions().maximumFractionDigits;
        return new Intl.NumberFormat(document.documentElement.lang||'en',{style:'currency',currency:code,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value/10**digits);
      }catch{return `${(value/10**digits).toFixed(digits)} ${code}`;}
    };
    const invalidateRequest=()=>{requestVersion++;controller?.abort();list.removeAttribute('aria-busy');};
    const closeDrawer=()=>{invalidateRequest();drawer.close();};
    document.addEventListener('click',async event=>{
      const link=event.target.closest('[data-cart-drawer-trigger]');
      if(!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button!==0)return;
      event.preventDefault();opener=link;
      invalidateRequest();
      const version=requestVersion;
      controller=new AbortController();
      if(!drawer.open)drawer.showModal();
      close.focus();list.replaceChildren();list.setAttribute('aria-busy','true');total.textContent='';status.hidden=false;status.textContent='Loading cart…';
      checkout.hidden=true;checkout.href='/cart';
      try{
        const response=await fetch('/api/cart/preview',{credentials:'same-origin',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Request failed');
        const data=await response.json();
        if(version!==requestVersion || !drawer.open)return;
        if(!Array.isArray(data.items))throw new Error('Invalid cart response');
        status.textContent=data.items.length?'':'Your bag is currently empty.';
        const lines=[];
        for(const item of data.items){
          const line=document.createElement('li');line.append(sellerText('strong',item.name),text('span',` × ${item.quantity}`),sellerText('strong',fmt(item.total,data.currency)));
          lines.push(line);
        }
        list.replaceChildren(...lines);
        total.textContent=data.items.length?`Total before address-specific adjustments: ${fmt(data.total,data.currency)}`:'';
        checkout.hidden=!!data.hasStockIssues || data.items.length===0;
        checkout.href=data.checkoutHref==='/checkout'?'/checkout':'/cart';
      }catch(error){if(version===requestVersion && drawer.open && error?.name!=='AbortError')status.textContent='Cart preview is unavailable. Open your bag to continue.';}
      finally{if(version===requestVersion)list.removeAttribute('aria-busy');}
    });
    close.addEventListener('click',closeDrawer);
    drawer.addEventListener('click',event=>{if(event.target===drawer)closeDrawer();});
    drawer.addEventListener('cancel',invalidateRequest);
    drawer.addEventListener('close',()=>{
      if(drawer.open)return;
      invalidateRequest();
      // Mobile navigation closes when its cart link opens the drawer. Return to
      // the visible navigation control rather than a link now hidden inside it.
      const target=opener?.getClientRects().length ? opener
        : opener?.closest('[data-nav]') ? q('[data-menu-toggle]') : null;
      if(target?.getClientRects().length)target.focus();
    });
  }
  // Privacy-preserving suggestion: browser language only; no IP lookup/geolocation.
  const languagePrompt=q('[data-language-suggestion]');
  if(languagePrompt){
    const storageKey='shopeasy-language-suggestion-dismissed';
    const current=(document.documentElement.lang||'en').split('-')[0].toLowerCase();
    const preferred=(navigator.languages||[navigator.language||'en'])
      .map(lang=>String(lang).split('-')[0].toLowerCase())
      .find(lang=>lang!==current && [...q('[data-language-suggestion] select').options].some(option=>option.value===lang));
    // Region codes are hints from browser preferences, not IP geolocation.
    // They must never set a checkout country, shipping price, VAT or payment method.
    const browserLocale=(navigator.languages||[navigator.language||'']).find(value=>/^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?-[A-Za-z]{2}(?:-|$)/.test(String(value)));
    const region=browserLocale?.match(/^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})(?:-|$)/)?.[1]?.toUpperCase();
    const regionNode=q('[data-country-suggestion]');
    if(region && regionNode){
      let displayName=region;
      try {displayName=new Intl.DisplayNames([document.documentElement.lang||'en'],{type:'region'}).of(region)||region;}catch{}
      regionNode.textContent=`Your browser suggests ${displayName} (${region}). This is not a delivery or tax selection.`;
      regionNode.hidden=false;
    }
    if((preferred || (region && regionNode)) && safeSession.read(storageKey)!==true){
      if(preferred)q('[data-language-suggestion] select').value=preferred;
      languagePrompt.hidden=false;
    }
    q('[data-language-suggestion-dismiss]').addEventListener('click',()=>{
      safeSession.write(storageKey,true);languagePrompt.hidden=true;
    });
  }

  // The sticky shortcut uses the original purchase form (with original CSRF and variants).
  const mobilePurchase=q('[data-purchase-focus]');
  if(mobilePurchase){
    const buy=q('form[data-product-variant-form]');
    if(!buy)mobilePurchase.closest('.product-mobile-purchase')?.remove();
    else mobilePurchase.addEventListener('click',()=>{
      buy.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
      const control=buy.querySelector('select:not(:disabled),button[type="submit"]:not(:disabled)');
      control?.focus({preventScroll:true});
    });
  }
})();
