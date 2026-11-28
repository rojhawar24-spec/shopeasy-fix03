(() => {
  // Currency precision follows ISO 4217 minor units. Pin IQD's three digits
  // instead of relying on browser-specific ICU/CLDR data that may report 0.
  const ISO_CURRENCY_DIGITS = Object.freeze({ IQD:3, BHD:3, JOD:3, KWD:3, OMR:3, TND:3, CLP:0, ISK:0, JPY:0, KRW:0, VND:0 });
  const currencyFractionDigits = currency => {
    const code = String(currency || 'EUR').toUpperCase();
    if (Object.hasOwn(ISO_CURRENCY_DIGITS, code)) return ISO_CURRENCY_DIGITS[code];
    try { return new Intl.NumberFormat('en', { style:'currency', currency:code }).resolvedOptions().maximumFractionDigits; }
    catch { return 2; }
  };
  // Messages produced by a POST/redirect/GET are shown once. Remove only the
  // transient message parameters after the server-rendered HTML has been read,
  // so browser refresh does not replay an old success or error notice.
  try {
    const currentUrl = new URL(window.location.href);
    let changed = false;
    for (const key of ['added','cartError','couponMessage','stockMessage','restocked','restockError','saved','currencyKept','currencyChanged','cancelResult']) {
      if (currentUrl.searchParams.has(key)) { currentUrl.searchParams.delete(key); changed = true; }
    }
    if (changed) window.history.replaceState(window.history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  } catch {}

  // Story viewer: large tap targets, keyboard controls and a direct product action.
  const storyButtons = Array.from(document.querySelectorAll('[data-story-open]'));
  const studio=document.querySelector('[data-story-studio]');
  if(studio){
    const preview=document.querySelector('[data-studio-photo]');
    const title=document.querySelector('[data-studio-title]');
    const body=document.querySelector('[data-studio-body]');
    const file=studio.querySelector('[data-studio-file]');
    const filename=studio.querySelector('[data-studio-filename]');
    let objectUrl='';
    const update=()=>{title.textContent=studio.elements.title.value||'Your story title';body.textContent=studio.elements.body.value||'Your story text appears here.';};
    studio.elements.title.addEventListener('input',update);studio.elements.body.addEventListener('input',update);
    file.addEventListener('change',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';const f=file.files[0];if(!f)return;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>2097152){file.value='';filename.textContent='Select a JPG, PNG or WebP under 2 MiB.';return;}objectUrl=URL.createObjectURL(f);preview.src=objectUrl;filename.textContent=f.name;});
    window.addEventListener('pagehide',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl)});
  }
  const cinema=document.querySelector('[data-story-cinema]');
  if(cinema&&storyButtons.length){
    const photo=cinema.querySelector('[data-cinema-photo]'), title=cinema.querySelector('[data-cinema-title]'), body=cinema.querySelector('[data-cinema-body]'), progress=cinema.querySelector('[data-cinema-progress]'), count=cinema.querySelector('[data-cinema-count]'), pause=cinema.querySelector('[data-cinema-pause]');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let index=0,elapsed=0,last=0,frame=0,visible=false,paused=reduced.matches||document.body.dataset.motion==='off';
    const duration=7000;
    function select(i){index=(i+storyButtons.length)%storyButtons.length;elapsed=0;last=0;const item=storyButtons[index];photo.src=item.dataset.storyImage||'/assets/story.svg';photo.alt=item.dataset.storyTitle||'';title.textContent=item.dataset.storyTitle||'';body.textContent=item.dataset.storyBody||'';count.textContent=(index+1)+' / '+storyButtons.length;progress.style.transform='scaleX(0)';storyButtons.forEach((b,j)=>b.classList.toggle('cinema-current',j===index));}
    function tick(now){frame=0;if(!visible||paused||document.hidden||document.querySelector('[data-story-viewer][open]')){last=0;return;}if(last)elapsed+=Math.min(now-last,100);last=now;if(elapsed>=duration)select(index+1);progress.style.transform='scaleX('+Math.min(1,elapsed/duration)+')';frame=requestAnimationFrame(tick);}
    function sync(){cancelAnimationFrame(frame);frame=0;last=0;if(visible&&!paused&&!document.hidden)frame=requestAnimationFrame(tick);}
    function setPaused(value){paused=value;pause.setAttribute('aria-pressed',String(value));pause.setAttribute('aria-label',value?'Play stories':'Pause stories');sync();}
    pause.addEventListener('click',()=>setPaused(!paused));
    cinema.querySelector('[data-cinema-prev]').addEventListener('click',()=>{select(index-1);sync();});
    cinema.querySelector('[data-cinema-next]').addEventListener('click',()=>{select(index+1);sync();});
    cinema.querySelector('[data-cinema-open]').addEventListener('click',()=>storyButtons[index].click());
    document.addEventListener('visibilitychange',sync);
    document.querySelector('[data-story-viewer]')?.addEventListener('close',sync);
    if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.2}).observe(cinema.querySelector('.story-cinema-stage'));else{visible=true;sync();}
    reduced.addEventListener('change',e=>setPaused(e.matches));
    select(0);setPaused(paused||storyButtons.length<2);
    if(storyButtons.length<2){pause.hidden=true;cinema.querySelector('.story-cinema-nav').hidden=true;}
  }
  const storyViewer = document.querySelector('[data-story-viewer]');
  if (storyButtons.length && storyViewer) {
    const image = storyViewer.querySelector('[data-story-image]');
    const title = storyViewer.querySelector('[data-story-title]');
    const body = storyViewer.querySelector('[data-story-body]');
    const expiry = storyViewer.querySelector('[data-story-expiry]');
    const productLink = storyViewer.querySelector('[data-story-product-link]');
    const buyForm = storyViewer.querySelector('[data-story-buy-form]');
    const csrfInput = storyViewer.querySelector('[data-story-csrf]');
    const productInput = storyViewer.querySelector('[data-story-product-id]');
    const customLink = storyViewer.querySelector('[data-story-link]');
    const status = storyViewer.querySelector('[data-story-status]');
    const previous = storyViewer.querySelector('[data-story-prev]');
    const next = storyViewer.querySelector('[data-story-next]');
    const close = storyViewer.querySelector('[data-story-close]');
    let index = 0;
    let lastTrigger = null;

    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    if (csrfInput) csrfInput.value = csrf;
    const locale = window.ShopEasyI18n?.locale || 'en';
    const storyUi = {
      en: {'View & buy':'View & buy','View & choose options':'View & choose options','View product':'View product','Add to bag':'Add to bag','Open story link':'Open story link'},
      ckb: {'View & buy':'بینە و بکڕە','View & choose options':'بینە و هەڵبژاردە هەڵبژێرە','View product':'بینینی بەرهەم','Add to bag':'زیادکردن بۆ سەبەتە','Open story link':'کردنەوەی بەستەری چیرۆک'},
      ar: {'View & buy':'شاهد واشترِ','View & choose options':'شاهد واختر الخيار','View product':'عرض المنتج','Add to bag':'أضف إلى السلة','Open story link':'فتح رابط القصة'}
    }[locale] || {};
    const uiText = value => storyUi[value] || value;

    const openAt = (nextIndex) => {
      index = (nextIndex + storyButtons.length) % storyButtons.length;
      const item = storyButtons[index];
      lastTrigger = item;
      const imageUrl = item.dataset.storyImage || '/assets/story.svg';
      image.src = imageUrl;
      image.alt = item.dataset.storyTitle || '';
      title.textContent = item.dataset.storyTitle || '';
      body.textContent = item.dataset.storyBody || '';
      expiry.textContent = item.dataset.storyExpiry || '';
      status.textContent = '';

      const productUrl = item.dataset.storyProductUrl || '';
      const productId = Number(item.dataset.storyProductId || 0);
      const productStock = Number(item.dataset.storyProductStock || 0);
      const hasVariants = Number(item.dataset.storyProductVariants || 0) > 0;
      const linkUrl = item.dataset.storyLinkUrl || '';

      if (productLink) {
        productLink.hidden = !productUrl || (productStock > 0 && !hasVariants);
        if (productUrl) productLink.href = productUrl;
        productLink.textContent = uiText(hasVariants ? 'View & choose options' : 'View product');
      }
      if (buyForm) {
        buyForm.hidden = !(productUrl && productId && productStock > 0 && !hasVariants);
        if (productInput) productInput.value = productId ? String(productId) : '';
      }
      if (customLink) {
        customLink.hidden = Boolean(productUrl) || !linkUrl;
        if (linkUrl) customLink.href = linkUrl;
      }
      previous.hidden = storyButtons.length < 2;
      next.hidden = storyButtons.length < 2;

      if (typeof storyViewer.showModal === 'function' && !storyViewer.open) storyViewer.showModal();
      else storyViewer.setAttribute('open','');
      close.focus();
    };

    const closeViewer = () => {
      if (typeof storyViewer.close === 'function') storyViewer.close();
      else storyViewer.removeAttribute('open');
      lastTrigger?.focus();
    };

    storyButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        openAt(Number(button.dataset.storyIndex || 0));
      });
    });
    previous.addEventListener('click', () => openAt(index - 1));
    next.addEventListener('click', () => openAt(index + 1));
    close.addEventListener('click', closeViewer);
    storyViewer.addEventListener('click', (event) => {
      if (event.target === storyViewer) closeViewer();
    });
    storyViewer.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') openAt(index - 1);
      if (event.key === 'ArrowRight') openAt(index + 1);
      if (event.key === 'Escape') closeViewer();
    });
  }

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

  // Mobile navigation: keyboard friendly, closes on escape and after navigation.
  const menu = document.querySelector('[data-menu-toggle]');
  const nav = document.querySelector('[data-nav]');
  document.querySelectorAll('.nav-category-menu').forEach((categoryMenu) => {
    const trigger = categoryMenu.querySelector('.nav-category-trigger');
    if (!trigger) return;
    const filter=categoryMenu.querySelector('[data-category-filter]');
    const nodes=Array.from(categoryMenu.querySelectorAll('.nav-category-list > .nav-category-node'));
    const empty=categoryMenu.querySelector('[data-category-empty]');
    if(filter)filter.addEventListener('input',()=>{
      const term=filter.value.normalize('NFKC').trim().toLocaleLowerCase();
      let matches=0;
      for(const node of nodes){const visible=!term||node.textContent.normalize('NFKC').toLocaleLowerCase().includes(term);node.hidden=!visible;if(visible)matches++}
      if(empty)empty.hidden=matches!==0;
    });
    const setCategoryOpen = (open) => {
      categoryMenu.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', String(open));
    };
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      setCategoryOpen(!categoryMenu.classList.contains('open'));
    });
    categoryMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setCategoryOpen(false)));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && categoryMenu.classList.contains('open') &&
          categoryMenu.contains(document.activeElement)) {
        event.preventDefault();
        setCategoryOpen(false);
        trigger.focus();
      }
    });
    document.addEventListener('click', event => { if (!categoryMenu.contains(event.target)) setCategoryOpen(false); });
  });

  if (menu && nav) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      menu.setAttribute('aria-expanded', String(open));
      const label = open ? 'Close navigation' : 'Open navigation';
      menu.setAttribute('aria-label', window.ShopEasyI18n?.translate(label) || label);
      if (open) nav.querySelector('a[href], button:not([disabled])')?.focus();
    };
    menu.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !e.defaultPrevented && nav.classList.contains('is-open') &&
          (nav.contains(document.activeElement) || document.activeElement === menu)) {
        e.preventDefault();
        setOpen(false);
        menu.focus();
      }
    });
    document.addEventListener('click', e => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !menu.contains(e.target)) setOpen(false);
    });
  }

  document.querySelectorAll('[data-language-select]').forEach(select => select.addEventListener('change', () => select.form?.requestSubmit()));

  document.querySelectorAll('[data-print-order]').forEach(button => button.addEventListener('click', () => window.print()));

  document.querySelectorAll('[data-confirm]').forEach(form => form.addEventListener('submit', e => {
    // A data-confirm form that refreshes its CSRF token may submit a second time
    // after the token is fetched. Reuse the user's first confirmation exactly once.
    if (form.dataset.confirmedForCsrfRefresh === '1' && form.dataset.csrfRefreshState === 'ready') {
      delete form.dataset.confirmedForCsrfRefresh;
      return;
    }
    const message = form.getAttribute('data-confirm') || 'Are you sure?';
    if (!window.confirm(message)) {
      e.preventDefault();
      return;
    }
    if (form.matches('form[data-refresh-csrf]')) form.dataset.confirmedForCsrfRefresh = '1';
  }));

  // Storefront mobile search drawer; preserve all existing data-search-* hooks.
  const searchToggle = document.querySelector('[data-search-toggle]');
  const mobileSearch = document.getElementById('mobile-storefront-search');
  const mobileSearchInput = mobileSearch?.querySelector('[data-search-input]');
  const mobileSearchClose = mobileSearch?.querySelector('[data-search-close]');
  const closeMobileSearch = () => {
    if (!searchToggle || !mobileSearch) return;
    mobileSearch.hidden = true;
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.focus();
  };
  if (searchToggle && mobileSearch && mobileSearchInput) {
    searchToggle.addEventListener('click', () => {
      const opening = mobileSearch.hidden;
      mobileSearch.hidden = !opening;
      searchToggle.setAttribute('aria-expanded', String(opening));
      if (opening) mobileSearchInput.focus();
    });
    mobileSearchClose?.addEventListener('click', closeMobileSearch);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !mobileSearch.hidden) closeMobileSearch();
    });
  }

  const searchInputs = document.querySelectorAll('[data-search-input]');
  searchInputs.forEach((input, searchIndex) => {
    const box = input.closest('[data-search-box]');
    const results = box?.querySelector('[data-search-results]');
    if (!box || !results) return;
    const translate = value => window.ShopEasyI18n?.translate(value) || value;
    const listId = results.id || `search-suggestions-${searchIndex + 1}`;
    results.id = listId;
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', input.getAttribute('aria-label') || translate('Search products'));
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-expanded', 'false');
    const announcement = document.createElement('p');
    announcement.className = 'sr-only';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    box.append(announcement);
    let timer;
    let controller;
    let requestVersion = 0;
    let options = [];
    let activeIndex = -1;
    const selectOption = index => {
      activeIndex = index;
      options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
      if (index < 0) input.removeAttribute('aria-activedescendant');
      else {
        input.setAttribute('aria-activedescendant', options[index].id);
        options[index].scrollIntoView?.({ block:'nearest' });
      }
    };
    const closeResults = () => {
      clearTimeout(timer);
      controller?.abort();
      requestVersion++;
      selectOption(-1);
      results.hidden = true;
      results.removeAttribute('aria-busy');
      input.removeAttribute('aria-busy');
      input.setAttribute('aria-expanded', 'false');
      announcement.textContent = '';
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && (!results.hidden || input.getAttribute('aria-busy') === 'true')) {
        event.preventDefault();
        event.stopPropagation();
        closeResults();
        input.removeAttribute('aria-busy');
      } else if (event.key === 'Tab') {
        closeResults();
      } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
        event.preventDefault();
        results.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        const next = event.key === 'ArrowDown'
          ? (activeIndex + 1) % options.length
          : (activeIndex <= 0 ? options.length - 1 : activeIndex - 1);
        selectOption(next);
      } else if (event.key === 'Enter' && !results.hidden && activeIndex >= 0) {
        event.preventDefault();
        window.location.assign(options[activeIndex].href);
      }
    });
    input.addEventListener('input', () => {
      closeResults();
      results.replaceChildren();
      options = [];
      const query = input.value.trim();
      input.removeAttribute('aria-busy');
      if (query.length < 2) return;
      const version = requestVersion;
      input.setAttribute('aria-busy', 'true');
      timer = setTimeout(async () => {
        controller = new AbortController();
        results.setAttribute('aria-busy', 'true');
        try {
          const res = await fetch('/api/search?q=' + encodeURIComponent(query), {
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          });
          const data = await res.json();
          if (version !== requestVersion) return;
          if (!res.ok || !Array.isArray(data.results)) throw new Error('Search failed');
          results.replaceChildren();
          options = data.results.map((item, index) => {
            const link = document.createElement('a');
            link.className = 'search-result';
            link.href = '/product/' + encodeURIComponent(String(item.slug || ''));
            link.id = `${listId}-option-${index + 1}`;
            link.setAttribute('role', 'option');
            link.setAttribute('aria-selected', 'false');
            link.tabIndex = -1;
            const image = document.createElement('img');
            image.src = String(item.image || '/assets/product-placeholder.svg');
            image.alt = '';
            image.width = 72;
            image.height = 90;
            image.loading = 'lazy';
            image.decoding = 'async';
            const copy = document.createElement('span');
            const name = document.createElement('strong');
            name.setAttribute('data-no-translate', '');
            name.setAttribute('translate', 'no');
            name.textContent = String(item.name || '');
            const meta = document.createElement('small');
            meta.setAttribute('data-no-translate', '');
            meta.setAttribute('translate', 'no');
            meta.textContent = String(item.price || '') + (item.discount ? ` · -${Number(item.discount)}%` : '');
            copy.append(name, meta);
            link.append(image, copy);
            results.append(link);
            return link;
          });
          if (!options.length) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = translate('No matching products');
            results.append(empty);
          }
          results.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          announcement.textContent = options.length ? `${options.length} ${translate('Products')}` : translate('No matching products');
        } catch (error) {
          if (version !== requestVersion || error?.name === 'AbortError') return;
          options = [];
          results.replaceChildren();
          const message = document.createElement('div');
          message.className = 'search-error';
          message.textContent = translate('Search is temporarily unavailable. Please try again.');
          results.append(message);
          results.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          announcement.textContent = message.textContent;
        } finally {
          if (version === requestVersion) {
            results.removeAttribute('aria-busy');
            input.removeAttribute('aria-busy');
          }
        }
      }, 160);
    });
    document.addEventListener('click', event => { if (!box.contains(event.target)) closeResults(); });
    box.addEventListener('focusout', event => { if (!box.contains(event.relatedTarget)) closeResults(); });
  });

  document.querySelectorAll('[data-wishlist-toggle]').forEach(button => {
    button.addEventListener('click', async () => {
      const id = button.dataset.productId;
      button.disabled = true;
      try {
        const body = new URLSearchParams({ _csrf: csrf, productId: id });
        const res = await fetch('/wishlist/toggle', {
          method: 'POST',
          headers: { 'x-csrf-token': csrf, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body
        });
        if (res.status === 401 || res.redirected) {
          // An anonymous customer should return to the product/listing they
          // were viewing, not an unrelated account dashboard after sign-in.
          const currentPath = `${window.location.pathname}${window.location.search}`;
          const safeReturn = currentPath.startsWith('/') && !currentPath.startsWith('//') ? currentPath : '/shop';
          window.location.assign(`/login?next=${encodeURIComponent(safeReturn)}`);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Wishlist error');
        const feedbackScope = button.closest('.product-card, .product-detail') || button.parentElement;
        const oldFeedback = feedbackScope?.querySelector('[data-wishlist-feedback]');
        if (oldFeedback) oldFeedback.remove();
        button.classList.toggle('saved', data.saved);
        button.setAttribute('aria-pressed', String(data.saved));
        button.textContent = data.saved ? '♥' : '♡';
        const productName = String(button.dataset.productName || '');
        const wishlistLabel = data.saved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`;
        button.setAttribute('aria-label', window.ShopEasyI18n?.translate(wishlistLabel) || wishlistLabel);
        document.querySelectorAll('[data-wishlist-count]').forEach(el => { el.textContent = data.count; });
      } catch {
        // Keep the previous visual state, but show an accessible, translated message.
        const feedbackScope = button.closest('.product-card, .product-detail') || button.parentElement;
        if (feedbackScope) {
          let feedback = feedbackScope.querySelector('[data-wishlist-feedback]');
          if (!feedback) {
            feedback = document.createElement('p');
            feedback.className = 'action-feedback';
            feedback.dataset.wishlistFeedback = '';
            feedback.setAttribute('role', 'status');
            feedback.setAttribute('aria-live', 'polite');
            if (feedbackScope.matches('.product-card')) feedbackScope.append(feedback);
            else button.insertAdjacentElement('afterend', feedback);
          }
          feedback.textContent = window.ShopEasyI18n?.translate('Could not update wishlist. Please try again.') || 'Could not update wishlist. Please try again.';
        }
      } finally { button.disabled = false; }
    });
  });

  const ask = document.querySelector('[data-ai-ask]');
  const input = document.getElementById('ai-input');
  const answer = document.getElementById('ai-answer');
  if (ask && input && answer) {
    let inFlight = false;
    const run = async () => {
      const message = input.value.trim();
      if (!message || inFlight) return;
      inFlight = true;
      ask.disabled = true;
      answer.setAttribute('aria-busy', 'true');
      answer.textContent = window.ShopEasyI18n?.translate('Thinking…') || 'Thinking…';
      try {
        const res = await fetch('/api/ai/search-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf, 'Accept': 'application/json' },
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (!res.ok) throw new Error('Assistant request failed');
        answer.textContent = data.answer || window.ShopEasyI18n?.translate(data.error) || data.error || 'No answer available.';
      } catch { answer.textContent = window.ShopEasyI18n?.translate('The assistant is unavailable right now.') || 'The assistant is unavailable right now.'; }
      finally { inFlight = false; ask.disabled = false; answer.removeAttribute('aria-busy'); }
    };
    ask.addEventListener('click', run);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
  }

  const priceInput = document.querySelector('[data-price-input]');
  const saleInput = document.querySelector('[data-sale-input]');
  const productDiscountInput = document.querySelector('[name=automaticDiscountPercent]');
  const discountPreview = document.querySelector('[data-discount-preview]');
  const parseMoneyForPreview = raw => {
    let value = String(raw ?? '').normalize('NFKC').trim().replace(/[\u00a0\u202f]/g, ' ');
    const currency = document.querySelector('[data-shop-currency]')?.getAttribute('data-shop-currency') || 'EUR';
    let symbol = '';
    const currencyDigits = currencyFractionDigits(currency);
    try {
      const formatter = new Intl.NumberFormat('en', { style:'currency', currency });
      symbol = formatter.formatToParts(1).find(part => part.type === 'currency')?.value || '';
    } catch {}
    for (const decoration of [...new Set([currency, symbol].filter(Boolean))].sort((a,b) => b.length-a.length)) {
      const escaped = decoration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      value = value.replace(new RegExp(`^${escaped}\\s*`, 'i'), '').replace(new RegExp(`\\s*${escaped}$`, 'i'), '').trim();
    }
    if (!value || !/^[\d., ]+$/.test(value) || value.startsWith(' ') || value.endsWith(' ')) return null;
    const validInteger = part => /^\d+$/.test(part) || /^\d{1,3}(?: \d{3})+$/.test(part) || /^(\d{1,3})([.,])\d{3}(?:\2\d{3})*$/.test(part);
    const comma = value.lastIndexOf(','), dot = value.lastIndexOf('.');
    let normalized = value;
    if (currencyDigits === 0) {
      if (!validInteger(value)) return null;
      normalized = value.replace(/[., ]/g, '');
    } else if (comma >= 0 && dot >= 0) {
      const decimal = comma > dot ? ',' : '.';
      const cut = value.lastIndexOf(decimal);
      const fraction = value.slice(cut + 1), whole = value.slice(0, cut);
      if (!/^\d+$/.test(fraction) || fraction.length < 1 || fraction.length > currencyDigits || !validInteger(whole)) return null;
      normalized = whole.replace(/[., ]/g, '') + '.' + fraction;
    } else if (comma >= 0 || dot >= 0) {
      const separator = comma >= 0 ? ',' : '.';
      const chunks = value.split(separator);
      if (chunks.length > 2) {
        if (!validInteger(value)) return null;
        normalized = value.replace(/[., ]/g, '');
      } else {
        const [whole, fraction = ''] = chunks;
        const grouped = validInteger(value);
        const canBeGrouping = fraction.length === 3 && grouped;
        if (fraction.length > currencyDigits && canBeGrouping) normalized = value.replace(/[., ]/g, '');
        else {
          if (!/^\d+$/.test(fraction) || fraction.length < 1 || fraction.length > currencyDigits || !validInteger(whole)) return null;
          normalized = whole.replace(/[., ]/g, '') + '.' + fraction;
        }
      }
    } else {
      if (!validInteger(value)) return null;
      normalized = value.replace(/[., ]/g, '');
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };
  const updateDiscountPreview = () => {
    if (!priceInput || !saleInput || !productDiscountInput || !discountPreview) return;
    const price = parseMoneyForPreview(priceInput.value);
    const saleText = String(saleInput.value ?? '').trim();
    const sale = saleText ? parseMoneyForPreview(saleText) : null;
    const pct = Number(productDiscountInput.value);
    if (price===null || price <= 0 || (saleText && (sale===null || sale<=0 || sale>=price)) || !Number.isInteger(pct) || pct < 0 || pct > 90) {
      discountPreview.textContent = '';
      return;
    }
    const currency = document.querySelector('[data-shop-currency]')?.getAttribute('data-shop-currency') || 'EUR';
    const digits = currencyFractionDigits(currency);
    const factor = 10 ** digits;
    const priceMinor = Math.round(price * factor);
    const saleMinor = sale !== null ? Math.round(sale * factor) : priceMinor;
    const finalMinor = Math.max(1, Math.floor(saleMinor * (100 - pct) / 100));
    const totalOff = Math.round((1 - finalMinor / Math.max(1, priceMinor)) * 100);
    const rootLocale = String(document.documentElement.lang || 'en-GB').toLowerCase();
    const formatLocale = rootLocale.startsWith('ar') ? 'ar' : rootLocale.startsWith('ckb') ? 'ckb' : 'en-GB';
    let formatted = `${(finalMinor / factor).toFixed(digits)} ${currency}`;
    try { formatted = new Intl.NumberFormat(formatLocale, { style:'currency', currency, minimumFractionDigits:digits, maximumFractionDigits:digits }).format(finalMinor / factor); } catch {}
    const preview = pct > 0 ? `Final customer price preview: ${formatted} · total discount about ${totalOff}%` : 'No automatic item discount.';
    discountPreview.textContent = window.ShopEasyI18n?.translate(preview) || preview;
  };
  priceInput?.addEventListener('input', updateDiscountPreview);
  saleInput?.addEventListener('input', updateDiscountPreview);
  productDiscountInput?.addEventListener('input', updateDiscountPreview);
  updateDiscountPreview();


  document.querySelectorAll('[data-product-variant-form]').forEach(form => {
    const optionOne = form.querySelector('[data-option-one-select]');
    const optionTwo = form.querySelector('[data-option-two-select]');
    const variantIdInput = form.querySelector('[data-selected-variant-id]');
    const quantity = form.querySelector('[data-product-quantity]');
    const submit = form.querySelector('[data-variant-submit]');
    const stockLabel = document.querySelector('[data-product-stock-label]');
    const stockCount = document.querySelector('[data-product-stock-count]');
    const stockDot = document.querySelector('[data-product-stock-dot]');
    const optionNote = form.querySelector('[data-variant-option-note]');
    const mainImage = document.querySelector('[data-product-main-image]');
    let variants = [];
    try { variants = JSON.parse(form.dataset.variantMap || '[]'); } catch { variants = []; }
    if (!optionOne || !variants.length) return;
    const originalAggregateStock = Number(quantity?.dataset.aggregateStock) || 0;
    let manuallySelectedGalleryImage = form.dataset.selectedGalleryImage || '';
    const normalize = value => String(value || '').normalize('NFKC');
    const setMainImage = (url, alt, selectedGalleryUrl='') => {
      if (!mainImage || !url) return;
      mainImage.dataset.gallerySelectionUrl = selectedGalleryUrl || url;
      if (mainImage.getAttribute('src') !== url) mainImage.src = url;
      mainImage.alt = alt || document.querySelector('h1')?.textContent || 'Product image';
      document.querySelectorAll('[data-gallery-image]').forEach(button => {
        const active = button.dataset.imageUrl === (selectedGalleryUrl || url);
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };
    const rebuildOptionTwo = preserve => {
      if (!optionTwo) return;
      const wanted = preserve ? optionTwo.value : '';
      const primary = normalize(optionOne.value);
      const candidates = primary ? variants.filter(item => normalize(item.value) === primary) : variants;
      const values = [...new Set(candidates.map(item => String(item.value2 || '')))].filter(Boolean);
      optionTwo.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.setAttribute('translate', 'no');
      placeholder.setAttribute('data-no-translate', '');
      placeholder.textContent = optionTwo.dataset.choicePlaceholder || `${window.ShopEasyI18n?.translate('Choose ') || 'Choose '}${String(optionTwo.labels?.[0]?.textContent || 'option').trim()}`;
      optionTwo.append(placeholder);
      for (const value of values) {
        const matches = candidates.filter(item => String(item.value2 || '') === value);
        const available = matches.some(item => Number(item.stock) > 0);
        const choice = document.createElement('option');
        choice.value = value;
        choice.setAttribute('translate', 'no');
        choice.setAttribute('data-no-translate', '');
        choice.textContent = available ? value : `${value} · ${window.ShopEasyI18n?.translate('Sold out') || 'Sold out'}`;
        choice.disabled = !available;
        optionTwo.append(choice);
      }
      optionTwo.disabled = !primary || values.length === 0;
      if (wanted && values.includes(wanted) && candidates.some(item => String(item.value2 || '') === wanted && Number(item.stock) > 0)) optionTwo.value = wanted;
      else optionTwo.value = '';
    };
    const updateSelection = () => {
      const one = normalize(optionOne.value);
      const two = normalize(optionTwo?.value || '');
      const complete = Boolean(one) && (!optionTwo || Boolean(two));
      const chosen = complete ? variants.find(item => normalize(item.value) === one && normalize(item.value2 || '') === two) : null;
      const availableStock = chosen && Number.isSafeInteger(Number(chosen.stock)) && Number(chosen.stock) > 0 ? Number(chosen.stock) : 0;
      const available = Boolean(chosen) && availableStock > 0;
      if (variantIdInput) variantIdInput.value = available ? String(chosen.id) : '';
      if (quantity) {
        const max = available ? Math.min(99, availableStock) : 1;
        quantity.max = String(max);
        quantity.disabled = !available;
        if (!available) quantity.value = '1';
        else if (!Number.isInteger(Number(quantity.value)) || Number(quantity.value) < 1 || Number(quantity.value) > max) quantity.value = String(Math.min(max, Math.max(1, Number(quantity.value) || 1)));
      }
      if (submit) {
        submit.disabled = !available;
        const textNode = Array.from(submit.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        const label = available ? 'Add to cart' : (chosen ? 'Sold out' : 'Choose options');
        if (textNode) textNode.textContent = `${window.ShopEasyI18n?.translate(label) || label} `;
      }
      if (stockLabel) stockLabel.textContent = available ? 'In stock' : chosen ? 'Sold out' : (originalAggregateStock > 0 ? 'Choose options' : 'Sold out');
      if (stockCount) stockCount.textContent = available ? `${availableStock} available for this combination` : chosen ? 'This combination is currently unavailable' : `${originalAggregateStock} available in total`;
      if (stockDot) { stockDot.classList.toggle('ok', available || (!complete && originalAggregateStock > 0)); stockDot.classList.toggle('bad', !available && complete || originalAggregateStock <= 0); }
      if (optionNote) {const t=window.ShopEasyI18n?.translate;const tr=x=>t?.(x)||x;optionNote.dataset.state=available?'ready':chosen?'unavailable':'pending';optionNote.textContent=available?tr('In stock')+' · '+availableStock:chosen?tr('Sold out'):tr('Choose options');}
      if (chosen?.imageUrl) setMainImage(chosen.imageUrl, `${document.querySelector('h1')?.textContent || 'Product'} · ${chosen.value}${chosen.value2 ? ` · ${chosen.value2}` : ''}`, chosen.imageUrl);
      else if (form.dataset.selectedGalleryImage || manuallySelectedGalleryImage) {
        manuallySelectedGalleryImage = form.dataset.selectedGalleryImage || manuallySelectedGalleryImage;
        const thumb = Array.from(document.querySelectorAll('[data-gallery-image]')).find(button => button.dataset.imageUrl === manuallySelectedGalleryImage);
        setMainImage(manuallySelectedGalleryImage, thumb?.dataset.imageAlt || '', manuallySelectedGalleryImage);
      } else if (mainImage?.dataset.baseImageUrl) setMainImage(mainImage.dataset.baseImageUrl, mainImage.dataset.baseImageAlt || '');
    };
    optionOne.addEventListener('change', () => { rebuildOptionTwo(false); updateSelection(); });
    optionTwo?.addEventListener('change', updateSelection);
    if (optionTwo) rebuildOptionTwo(true);
    updateSelection();
  });

  // CART CONFIRMATION START
  document.querySelectorAll('[data-cart-confirmation]').forEach(notice=>{
    const close=notice.querySelector('[data-cart-confirmation-close]');
    if(!close)return;
    const continueLink=notice.querySelector('[data-cart-confirmation-continue]');
    let dismissing=false;
    const dismiss=()=>{
      if(dismissing||notice.hidden)return;
      dismissing=true;
      const hadFocus=notice.contains(document.activeElement);
      const finish=()=>{
        notice.hidden=true;
        if(hadFocus&&notice.contains(document.activeElement)){
          const main=document.getElementById('main-content');
          if(main){if(!main.hasAttribute('tabindex'))main.setAttribute('tabindex','-1');main.focus({preventScroll:true});}
        }
        try{const url=new URL(location.href);url.searchParams.delete('added');history.replaceState(history.state,'',url.pathname+url.search+url.hash);}catch{}
      };
      if(document.body.dataset.motion==='off'||matchMedia('(prefers-reduced-motion: reduce)').matches||typeof notice.animate!=='function'){
        finish();return;
      }
      const offset=matchMedia('(max-width: 600px)').matches?'12px':'-12px';
      try{
        const animation=notice.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY('+offset+') scale(.98)'}],{duration:180,easing:'ease-in',fill:'forwards'});
        animation.finished.then(finish,finish);
      }catch{finish();}
    };
    close.hidden=false;close.addEventListener('click',dismiss);
    continueLink?.addEventListener('click',event=>{
      if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
      event.preventDefault();dismiss();
    });
    notice.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();dismiss();}
    });
    notice.classList.add('cart-confirmation-floating');
  });
  // CART CONFIRMATION END
  document.querySelectorAll('.product-detail-studio [data-product-variant-form]').forEach(form=>{
    const quantity=form.querySelector('[data-product-quantity]');
    if(!quantity)return;
    const steps=[...form.querySelectorAll('[data-product-qty-step]')];
    const sync=()=>{const n=Number(quantity.value),min=Number(quantity.min)||1,max=Number(quantity.max)||99;for(const b of steps){b.hidden=false;b.disabled=quantity.disabled||!Number.isInteger(n)||(Number(b.dataset.productQtyStep)<0?n<=min:n>=max);}};
    for(const b of steps)b.addEventListener('click',()=>{if(quantity.disabled||b.disabled)return;const n=Number(quantity.value),min=Number(quantity.min)||1,max=Number(quantity.max)||99;quantity.value=String(Math.min(max,Math.max(min,(Number.isInteger(n)?n:min)+Number(b.dataset.productQtyStep))));quantity.dispatchEvent(new Event('input',{bubbles:true}));});
    quantity.addEventListener('input',sync);quantity.addEventListener('change',sync);form.addEventListener('change',sync);
    new MutationObserver(sync).observe(quantity,{attributes:true,attributeFilter:['disabled','max','min']});sync();
    for(const select of form.querySelectorAll('[data-option-one-select],[data-option-two-select]')){
      const wrapper=select.closest('.product-attribute-select');
      const name=wrapper?.querySelector('.configurator-option-label>span')?.textContent?.trim()||'Options';
      const selected=wrapper?.querySelector('[data-option-selected]');
      const colourField=/^(colou?r|kleur|couleur|farbe|ڕەنگ|لون)$/iu.test(name);
      const choices=document.createElement('div');choices.className='product-option-chips'+(colourField?' is-colour':'');choices.setAttribute('role','group');choices.setAttribute('aria-label',name);
      select.after(choices);
      const colors={black:'#171717',white:'#ffffff',grey:'#808080',gray:'#808080',navy:'#192c50',blue:'#2563eb',red:'#c72b35',green:'#277448',beige:'#e1d2b7',brown:'#79513b',pink:'#ef91b2',purple:'#794ba8',yellow:'#e9c742',orange:'#e98032'};
      const render=()=>{
        const options=[...select.options].filter(o=>o.value);
        const use=options.length>0&&options.length<=24;
        choices.hidden=!use;select.classList.toggle('product-select-enhanced',use);
        if(use){select.setAttribute('tabindex','-1');select.setAttribute('aria-hidden','true');}else{select.removeAttribute('tabindex');select.removeAttribute('aria-hidden');}
        if(selected)selected.textContent=select.value||'';
        const signature=JSON.stringify(options.map(o=>[o.value,o.textContent,o.disabled]));
        if(choices.dataset.signature!==signature){
          choices.dataset.signature=signature;choices.replaceChildren();
          for(const opt of options){
            const button=document.createElement('button');button.type='button';button.dataset.value=opt.value;
            const label=document.createElement('span');label.textContent=opt.textContent;button.append(label);
            if(colourField){const color=opt.value.match(/\((#[0-9a-f]{6})\)$/i)?.[1]||colors[opt.value.trim().toLowerCase()];if(color){const dot=document.createElementNS('http://www.w3.org/2000/svg','svg');dot.setAttribute('viewBox','0 0 24 24');dot.setAttribute('aria-hidden','true');dot.setAttribute('class','product-colour-dot');const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','10');circle.setAttribute('fill',color);circle.setAttribute('stroke','currentColor');circle.setAttribute('stroke-opacity','.28');dot.append(circle);button.prepend(dot);}}
            button.addEventListener('click',()=>{if(button.disabled)return;select.value=button.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));if(document.body.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&button.animate)button.animate([{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});});
            choices.append(button);
          }
        }
        for(const button of choices.children){const opt=options.find(o=>o.value===button.dataset.value);button.disabled=select.disabled||!!opt?.disabled;button.setAttribute('aria-pressed',String(select.value===button.dataset.value));}
      };
      select.addEventListener('change',render);form.addEventListener('change',render);new MutationObserver(render).observe(select,{childList:true,attributes:true,attributeFilter:['disabled']});render();
    }
  });

  document.querySelectorAll('[data-gallery-image]').forEach(button => {
    button.addEventListener('click', () => {
      const mainImage = document.querySelector('[data-product-main-image]');
      if (!mainImage || !button.dataset.imageUrl) return;
      mainImage.dataset.gallerySelectionUrl = button.dataset.imageUrl;
      if (mainImage.getAttribute('src') !== button.dataset.imageUrl) mainImage.src = button.dataset.imageUrl;
      mainImage.alt = button.dataset.imageAlt || 'Product image';
      document.querySelectorAll('[data-gallery-image]').forEach(item => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const variantForm = document.querySelector('[data-product-variant-form]');
      if (variantForm) variantForm.dataset.selectedGalleryImage = button.dataset.imageUrl;
    });
  });

  const variantToggle = document.querySelector('[data-variant-toggle]');
  const variantFields = document.querySelector('[data-variant-fields]');
  const baseStockInput = document.querySelector('[data-base-stock-input]');
  const variantNameInput = document.querySelector('[data-variant-name]');
  const variantNameTwoInput = document.querySelector('[data-variant-name-two]');
  const variantEditor = document.querySelector('[data-variant-editor]');
  const matrixOneInput = document.querySelector('[data-matrix-values-one]');
  const matrixTwoInput = document.querySelector('[data-matrix-values-two]');
  const matrixMessage = document.querySelector('[data-matrix-message]');
  const normalizeOptionKey = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en');
  const variantRowKey = (one, two) => `${normalizeOptionKey(one)}\u0000${normalizeOptionKey(two)}`;
  const updateVariantRows = () => {
    if (!variantEditor) return null;
    const rows = Array.from(variantEditor.querySelectorAll('[data-variant-row]'));
    const counts = new Map();
    rows.forEach(row => {
      const one = row.querySelector('[data-variant-value]')?.value.trim() || '';
      const two = row.querySelector('[data-variant-value-two]')?.value.trim() || '';
      if (one) {
        const key = variantRowKey(one, two);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    rows.forEach((row, index) => {
      const number = row.querySelector('.variant-row-number');
      if (number) number.textContent = String(index + 1);
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', `Product option ${index + 1}`);
      const remove = row.querySelector('[data-variant-remove]');
      if (remove) remove.setAttribute('aria-label', `Remove combination ${index + 1}`);
      const oneInput = row.querySelector('[data-variant-value]');
      const twoInput = row.querySelector('[data-variant-value-two]');
      const one = oneInput?.value.trim() || '';
      const two = twoInput?.value.trim() || '';
      const duplicate = one && counts.get(variantRowKey(one, two)) > 1;
      oneInput?.setCustomValidity(duplicate ? 'This option combination is already used.' : '');
      twoInput?.setCustomValidity(duplicate ? 'This option combination is already used.' : '');
      if (twoInput) twoInput.required = Boolean(variantNameTwoInput?.value.trim());
      const skuInput = row.querySelector('[data-variant-sku]');
      if (skuInput) skuInput.setCustomValidity(skuInput.value.trim() && !/^[A-Z0-9][A-Z0-9._-]{0,59}$/i.test(skuInput.value.trim()) ? 'Use letters, numbers, dots, underscores or hyphens for a SKU.' : '');
    });
    const count = variantEditor.querySelector('[data-variant-count]');
    if (count) count.textContent = `${rows.length}/50`;
    const total = rows.reduce((sum, row) => {
      const raw = row.querySelector('[data-variant-stock]')?.value.trim() || '';
      const n = Number(raw);
      return sum + (raw !== '' && Number.isSafeInteger(n) && n >= 0 ? n : 0);
    }, 0);
    const totalNode = variantEditor.querySelector('[data-variant-total-stock]');
    if (totalNode) totalNode.textContent = Number.isSafeInteger(total) ? total.toLocaleString() : '0';
    const validation = variantEditor.querySelector('[data-variant-validation]');
    const hasDuplicate = Array.from(counts.values()).some(n => n > 1);
    const hasPartial = rows.some(row => {
      const one = row.querySelector('[data-variant-value]')?.value.trim() || '';
      const two = row.querySelector('[data-variant-value-two]')?.value.trim() || '';
      const stock = row.querySelector('[data-variant-stock]')?.value.trim() || '';
      const sku = row.querySelector('[data-variant-sku]')?.value.trim() || '';
      const image = row.querySelector('[data-variant-image]')?.value.trim() || '';
      return (one && stock === '') || (!one && (two !== '' || stock !== '' || sku !== '' || image !== '')) || (variantNameTwoInput?.value.trim() && one && !two) || (!variantNameTwoInput?.value.trim() && two);
    });
    if (validation) validation.textContent = hasDuplicate ? 'Every option combination must be unique.' : hasPartial ? 'Complete every row. When Option name 2 is set, enter a value for both options on every row.' : '';
    return { rows, hasDuplicate, hasPartial };
  };
  const createVariantRow = (initial = {}) => {
    const row = document.createElement('div');
    row.className = 'variant-row variant-row-matrix';
    row.setAttribute('data-variant-row', '');
    const number = document.createElement('div');
    number.className = 'variant-row-number';
    number.setAttribute('aria-hidden', 'true');
    const addInput = (labelText, name, dataName, type='text', value='', placeholder='') => {
      const label = document.createElement('label');
      if (dataName === 'data-variant-value') label.setAttribute('data-variant-label-one', '');
      if (dataName === 'data-variant-value-two') {
        label.setAttribute('data-variant-label-two', '');
        label.hidden = !variantNameTwoInput?.value.trim();
      }
      label.append(document.createTextNode(labelText));
      const input = document.createElement('input');
      input.name = name;
      input.setAttribute(dataName, '');
      input.type = type;
      input.value = String(value ?? '');
      input.placeholder = placeholder;
      input.autocomplete = 'off';
      if (type === 'number') { input.min = '0'; input.max = '100000000'; input.step = '1'; input.inputMode = 'numeric'; }
      if (dataName !== 'data-variant-stock' && dataName !== 'data-variant-image') input.maxLength = dataName === 'data-variant-sku' ? 60 : 80;
      if (dataName === 'data-variant-image') input.maxLength = 500;
      label.append(input);
      row.append(label);
      return input;
    };
    row.append(number);
    addInput(variantNameInput?.value.trim() || 'Size', 'variantValue', 'data-variant-value', 'text', initial.value || '', 'e.g. Red');
    addInput(variantNameTwoInput?.value.trim() || 'Second option', 'variantValue2', 'data-variant-value-two', 'text', initial.value2 || '', 'e.g. M');
    addInput('Stock', 'variantStock', 'data-variant-stock', 'number', initial.stock ?? '0', '0');
    const advanced = document.createElement('details');
    advanced.className = 'variant-row-advanced';
    const summary = document.createElement('summary');
    summary.textContent = 'Optional SKU and image';
    const advancedFields = document.createElement('div');
    advancedFields.className = 'variant-row-advanced-fields';
    advanced.append(summary, advancedFields);
    const skuLabel = document.createElement('label');
    skuLabel.append(document.createTextNode('SKU (optional)'));
    const skuInput = document.createElement('input');
    skuInput.name = 'variantSku'; skuInput.setAttribute('data-variant-sku', ''); skuInput.maxLength = 60; skuInput.autocomplete = 'off'; skuInput.placeholder = 'Auto-generated'; skuInput.value = String(initial.sku || '');
    skuLabel.append(skuInput);
    const imageLabel = document.createElement('label');
    imageLabel.append(document.createTextNode('Image URL (optional)'));
    const imageInput = document.createElement('input');
    imageInput.name = 'variantImageUrl'; imageInput.setAttribute('data-variant-image', ''); imageInput.maxLength = 500; imageInput.autocomplete = 'off'; imageInput.placeholder = 'Gallery or HTTPS image URL'; imageInput.value = String(initial.imageUrl || '');
    const imageHelp = document.createElement('span'); imageHelp.className = 'field-note'; imageHelp.textContent = 'Leave blank to use the main product photo.';
    imageLabel.append(imageInput, imageHelp);
    advancedFields.append(skuLabel, imageLabel);
    row.append(advanced);
    const removeButton = document.createElement('button');
    removeButton.type = 'button'; removeButton.className = 'btn btn-light btn-small variant-remove'; removeButton.setAttribute('data-variant-remove', ''); removeButton.textContent = 'Remove';
    row.append(removeButton);
    row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => { updateVariantRows(); syncVariantLabels(); }));
    removeButton.addEventListener('click', () => {
      const rows = variantEditor.querySelectorAll('[data-variant-row]');
      if (rows.length <= 1) row.querySelectorAll('input').forEach(input => { input.value = ''; });
      else row.remove();
      updateVariantRows();
    });
    return row;
  };
  // Shared by existing rows and rows created dynamically by Add combination
  const syncVariantLabels = () => {
    const firstName = variantNameInput?.value.trim() || 'Size';
    const secondName = variantNameTwoInput?.value.trim() || '';
    variantEditor.querySelectorAll('[data-variant-label-one]').forEach(label => {
      const text = label.firstChild;
      if (text?.nodeType === Node.TEXT_NODE) text.textContent = firstName;
    });
    variantEditor.querySelectorAll('[data-variant-label-two]').forEach(label => {
      const text = label.firstChild;
      if (text?.nodeType === Node.TEXT_NODE) text.textContent = secondName || 'Second option';
      const input = label.querySelector('[data-variant-value-two]');
      label.hidden = !secondName && !(input?.value.trim());
    });
    const matrixOneLabel = document.querySelector('[data-option-one-values-label]');
    const matrixTwoLabel = document.querySelector('[data-option-two-values-label]');
    const matrixTwoField = document.querySelector('[data-option-two-values-field]');
    const hasExistingSecondValues = Boolean(matrixTwoInput?.value.trim()) || Array.from(variantEditor.querySelectorAll('[data-variant-value-two]')).some(input => input.value.trim());
    if (matrixOneLabel) matrixOneLabel.textContent = `${firstName} values`;
    if (matrixTwoLabel) matrixTwoLabel.textContent = `${secondName || 'Second option'} values`;
    if (matrixTwoField) matrixTwoField.hidden = !secondName && !hasExistingSecondValues;
  };
  if (variantEditor) {
    const rowsContainer = variantEditor.querySelector('[data-variant-rows]');
    variantEditor.querySelectorAll('[data-variant-row] input').forEach(input => input.addEventListener('input', updateVariantRows));
    variantEditor.querySelectorAll('[data-variant-remove]').forEach(button => button.addEventListener('click', () => {
      const rows = variantEditor.querySelectorAll('[data-variant-row]');
      const row = button.closest('[data-variant-row]');
      if (!row) return;
      if (rows.length <= 1) row.querySelectorAll('input').forEach(input => { input.value = ''; });
      else row.remove();
      updateVariantRows();
    }));
    variantEditor.querySelector('[data-variant-add]')?.addEventListener('click', () => {
      if (variantEditor.querySelectorAll('[data-variant-row]').length >= 50) {
        if (matrixMessage) matrixMessage.textContent = 'The maximum is 50 variant combinations.';
        return;
      }
      const row = createVariantRow();
      rowsContainer.append(row);
      updateVariantRows();
      row.querySelector('[data-variant-value]')?.focus();
    });

    variantNameTwoInput?.addEventListener('input', () => { updateVariantRows(); syncVariantLabels(); });
    variantNameInput?.addEventListener('input', () => { updateVariantRows(); syncVariantLabels(); });
    variantEditor.querySelectorAll('[data-variant-value-two]').forEach(input => input.addEventListener('input', syncVariantLabels));
    matrixTwoInput?.addEventListener('input', syncVariantLabels);
    const palette=document.querySelector('[data-colour-palette]');
    const colourStatus=document.querySelector('[data-colour-status]');
    const colourKey=v=>/^(colou?r|kleur|couleur|farbe|ڕەنگ|لون)$/iu.test(String(v||'').trim());
    const colourTarget=()=>colourKey(variantNameTwoInput?.value)?matrixTwoInput:colourKey(variantNameInput?.value)?matrixOneInput:null;
    const syncPalette=()=>{if(palette)palette.hidden=!colourTarget();};
    function addColour(value){
      const target=colourTarget();if(!target)return;
      const clean=String(value||'').trim();if(!clean||clean.length>80||clean.includes(','))return;
      const values=target.value.split(',').map(v=>v.trim()).filter(Boolean);
      if(!values.some(v=>normalizeOptionKey(v)===normalizeOptionKey(clean)))values.push(clean);
      target.value=values.join(', ');target.dispatchEvent(new Event('input',{bubbles:true}));
      if(colourStatus)colourStatus.textContent='Colour added to builder. Generate combinations, review stock and save.';
    }
    document.querySelectorAll('[data-colour-preset]').forEach(button=>button.addEventListener('click',()=>{
      const populated=[...variantEditor.querySelectorAll('[data-variant-value]')].some(input=>input.value.trim());
      const only=button.dataset.colourPreset==='colour';
      const first=only?(colourKey(variantNameInput.value)?variantNameInput.value:'Colour'):(variantNameInput.value.trim()||'Size'),second=only?'':(colourKey(variantNameTwoInput.value)?variantNameTwoInput.value:'Colour');
      if(populated&&(normalizeOptionKey(variantNameInput.value)!==normalizeOptionKey(first)||normalizeOptionKey(variantNameTwoInput.value)!==normalizeOptionKey(second))){if(colourStatus)colourStatus.textContent='Existing variants are protected. Keep their option names or edit them manually after reviewing stock.';return;}
      variantNameInput.value=first;variantNameTwoInput.value=second;
      variantNameInput.dispatchEvent(new Event('input',{bubbles:true}));variantNameTwoInput.dispatchEvent(new Event('input',{bubbles:true}));syncPalette();
    }));
    document.querySelectorAll('[data-add-variant-colour]').forEach(b=>b.addEventListener('click',()=>addColour(b.dataset.addVariantColour)));
    document.querySelector('[data-add-custom-colour]')?.addEventListener('click',()=>{const name=document.querySelector('[data-custom-colour-name]')?.value.trim();const hex=document.querySelector('[data-custom-colour-hex]')?.value;if(name&&/^#[0-9a-f]{6}$/i.test(hex))addColour(name+' ('+hex+')');});
    variantNameInput?.addEventListener('input',syncPalette);variantNameTwoInput?.addEventListener('input',syncPalette);syncPalette();
    syncVariantLabels();
    document.querySelector('[data-generate-matrix]')?.addEventListener('click', () => {
      const splitValues = input => String(input?.value || '').split(',').map(value => value.trim()).filter(Boolean);
      const uniqueValues = values => {
        const seen = new Set();
        return values.filter(value => { const key = normalizeOptionKey(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
      };
      const one = uniqueValues(splitValues(matrixOneInput));
      const twoRaw = splitValues(matrixTwoInput);
      const two = uniqueValues(twoRaw);
      const hasSecondName = Boolean(variantNameTwoInput?.value.trim());
      if (!one.length || (hasSecondName && !two.length) || (!hasSecondName && two.length)) {
        if (matrixMessage) matrixMessage.textContent = hasSecondName ? 'Enter values for both options.' : 'Leave the second values field empty unless you have named a second option.';
        return;
      }
      const combos = [];
      for (const value of one) for (const value2 of (hasSecondName ? two : [''])) combos.push({ value, value2 });
      if (combos.length > 50) {
        if (matrixMessage) matrixMessage.textContent = `This produces ${combos.length} combinations; reduce it to 50 or fewer.`;
        return;
      }
      const old = new Map(Array.from(rowsContainer.querySelectorAll('[data-variant-row]')).map(row => [
        variantRowKey(row.querySelector('[data-variant-value]')?.value, row.querySelector('[data-variant-value-two]')?.value),
        { stock:row.querySelector('[data-variant-stock]')?.value || '0', sku:row.querySelector('[data-variant-sku]')?.value || '', imageUrl:row.querySelector('[data-variant-image]')?.value || '' }
      ]));
      rowsContainer.replaceChildren();
      for (const combo of combos) {
        const previous = old.get(variantRowKey(combo.value, combo.value2));
        rowsContainer.append(createVariantRow({ ...combo, ...(previous || {stock:'0',sku:'',imageUrl:''}) }));
      }
      if (matrixMessage) matrixMessage.textContent = `Generated ${combos.length} combination${combos.length===1?'':'s'}. Review stock and SKUs before saving.`;
      updateVariantRows();
    });
    variantEditor.querySelectorAll('[data-variant-preset]').forEach(button => button.addEventListener('click', () => {
      const sizes = String(button.dataset.variantPreset || '').split(',').map(v => v.trim()).filter(Boolean);
      const target = variantNameTwoInput?.value.trim() ? matrixTwoInput : matrixOneInput;
      if (!target) return;
      const current = String(target.value || '').split(',').map(v => v.trim()).filter(Boolean);
      const seen = new Set(current.map(normalizeOptionKey));
      sizes.forEach(value => { if (!seen.has(normalizeOptionKey(value))) { current.push(value); seen.add(normalizeOptionKey(value)); } });
      target.value = current.join(', ');
      document.querySelector('[data-generate-matrix]')?.click();
    }));
    const form = variantEditor.closest('form');
    form?.addEventListener('submit', event => {
      const state = updateVariantRows();
      if (!variantToggle?.checked || !state) return;
      const populated = state.rows.filter(row => row.querySelector('[data-variant-value]')?.value.trim());
      if (state.hasDuplicate || state.hasPartial || !populated.length || populated.length > 50) {
        event.preventDefault();
        variantEditor.querySelector('[data-variant-validation]')?.scrollIntoView({ block:'nearest', behavior:'smooth' });
        variantEditor.querySelector('[data-variant-value]')?.focus();
      }
    });
    updateVariantRows();
  }
  const updateVariantMode = () => {
    if (!variantToggle || !variantFields) return;
    const enabled = variantToggle.checked;
    variantFields.hidden = !enabled;
    variantFields.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = !enabled; });
    if (baseStockInput) baseStockInput.disabled = enabled;
    if (variantNameInput) variantNameInput.required = enabled;
    if (variantNameTwoInput) variantNameTwoInput.required = false;
    const note = document.querySelector('[data-stock-note]');
    if (note) note.textContent = enabled ? 'Stock is managed separately for each combination above.' : 'Enter the number of individual units currently available to sell.';
    if (variantEditor) updateVariantRows();
  };
  variantToggle?.addEventListener('change', updateVariantMode);
  updateVariantMode();

  const galleryUpload = document.querySelector('[data-gallery-upload]');
  if (galleryUpload) {
    const productForm = galleryUpload.closest('form');
    const mainImageUpload = productForm?.querySelector('input[name="image"]');
    const validateGalleryUpload = () => {
      const files = Array.from(galleryUpload.files || []);
      const currentCount = Math.max(0, Number(productForm?.dataset.currentGalleryCount || 0));
      const maxAdditional = Math.max(0, Math.min(5, 6 - currentCount));
      if (files.length > maxAdditional || files.some(file => file.size > 2 * 1024 * 1024)) {
        galleryUpload.setCustomValidity(`Choose no more than ${maxAdditional} additional image(s), up to 2 MiB each. A product can have 6 images in total.`);
      } else galleryUpload.setCustomValidity('');
    };
    galleryUpload.addEventListener('change', validateGalleryUpload);
    mainImageUpload?.addEventListener('change', validateGalleryUpload);
    validateGalleryUpload();
  }

  // Product forms can be restored from browser history after login/session rotation.
  // Refresh the same-origin CSRF token immediately before submission; the server still
  // verifies the token normally and never accepts an absent or invalid one.
  document.querySelectorAll('form[data-refresh-csrf]').forEach(form => {
    form.addEventListener('submit', async event => {
      if (event.defaultPrevented) return;
      if (form.dataset.csrfRefreshState === 'ready') {
        delete form.dataset.csrfRefreshState;
        return;
      }
      if (form.dataset.csrfRefreshState === 'loading') {
        event.preventDefault();
        return;
      }
      const tokenInput = form.querySelector('input[name="_csrf"]');
      if (!tokenInput) return;
      event.preventDefault();
      form.dataset.csrfRefreshState = 'loading';
      const submitter = event.submitter;
      const submitButtons = Array.from(form.querySelectorAll('button[type="submit"],input[type="submit"]'));
      const previouslyDisabled = submitButtons.map(button => button.disabled);
      submitButtons.forEach(button => { button.disabled = true; });
      try {
        const response = await fetch('/session/csrf', {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('Could not refresh the form security token.');
        const data = await response.json();
        if (typeof data.csrf !== 'string' || data.csrf.length < 20) throw new Error('The session has expired. Refresh the page and sign in again.');
        tokenInput.value = data.csrf;
        form.dataset.csrfRefreshState = 'ready';
        submitButtons.forEach((button, index) => { button.disabled = previouslyDisabled[index]; });
        if (submitter && submitter.form === form && !submitter.disabled) form.requestSubmit(submitter);
        else form.requestSubmit();
      } catch (error) {
        delete form.dataset.csrfRefreshState;
        delete form.dataset.confirmedForCsrfRefresh;
        submitButtons.forEach((button, index) => { button.disabled = previouslyDisabled[index]; });
        let status = form.querySelector('[data-csrf-refresh-status]');
        if (!status) {
          status = document.createElement('p');
          status.className = 'alert';
          status.setAttribute('role', 'alert');
          status.setAttribute('data-csrf-refresh-status', '');
          form.prepend(status);
        }
        status.textContent = error instanceof Error ? error.message : 'Could not verify this form. Refresh the page and try again.';
      }
    });
  });

  const couponType = document.querySelector('select[name="type"]');
  const couponValue = document.querySelector('[data-coupon-value]');
  const updateCouponStep = () => {
    if (!couponType || !couponValue) return;
    const currency = document.querySelector('[data-coupon-currency]')?.getAttribute('data-coupon-currency') || 'EUR';
    const digits = currencyFractionDigits(currency);
    couponValue.step = couponType.value === 'fixed' ? String(1 / (10 ** digits)) : '1';
  };
  couponType?.addEventListener('change', updateCouponStep);
  updateCouponStep();

  // Preview both market profiles immediately so they do not look like duplicate
  // settings. The selected profile is persisted only when the manager saves.
  const marketSetupModeSelect = document.querySelector('[data-market-setup-mode-select]');
  const marketSetupPreviewTitle = document.querySelector('[data-market-setup-preview-title]');
  const marketSetupSummaries = Array.from(document.querySelectorAll('[data-market-setup-summary]'));
  const marketSetupRequiredIndicators = Array.from(document.querySelectorAll('[data-profile-required-indicator]'));
  const marketSetupProfileCopy = Array.from(document.querySelectorAll('[data-profile-copy]'));
  const policyProfileNotes = Array.from(document.querySelectorAll('[data-policy-note]'));
  const policyProfileSummaries = Array.from(document.querySelectorAll('[data-policy-summary]'));
  const marketSetupLaunchChecks = Array.from(document.querySelectorAll('[data-launch-check-profile]'));
  const marketDeliveryCountries = document.querySelector('[name="deliveryCountries"]');
  const belgianComplianceNotice = document.querySelector('#belgian-market-compliance');
  // UX preview only: the server independently resolves this compliance gate.
  const includesBelgium = () => String(marketDeliveryCountries?.value || '').split(/\r?\n/).some(country => {
    const normalized = country.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return ['be','belgium','belgie','belgique','belgien','belgio','belgica'].includes(normalized);
  });
  const updateMarketSetupPreview = () => {
    if (!marketSetupModeSelect) return;
    const mode = marketSetupModeSelect.value === 'simplified_cod' && !includesBelgium() ? 'simplified_cod' : 'standard';
    if (belgianComplianceNotice) belgianComplianceNotice.hidden = !includesBelgium();
    if (marketSetupPreviewTitle) {
      const title = mode === 'simplified_cod' ? 'Preview: Simplified local cash-on-delivery' : 'Preview: Standard / full setup';
      marketSetupPreviewTitle.textContent = window.ShopEasyI18n?.translate(title) || title;
    }
    marketSetupSummaries.forEach(summary => { summary.hidden = summary.dataset.marketSetupSummary !== mode; });
    marketSetupRequiredIndicators.forEach(indicator => {
      indicator.hidden = !['both', mode].includes(indicator.dataset.profileRequiredIndicator);
    });
    marketSetupProfileCopy.forEach(copy => { copy.hidden = copy.dataset.profileCopy !== mode; });
    policyProfileNotes.forEach(note => { note.hidden = note.dataset.policyNote !== mode; });
    policyProfileSummaries.forEach(summary => {
      const key = summary.dataset.policySummary;
      summary.hidden = key === 'translations' ? false : key !== mode;
    });
    // The prominent launch checklist must preview the same profile as the
    // dropdown immediately; otherwise managers see contradictory requirements
    // until after Save/reload. This is a preview only, not persisted readiness.
    marketSetupLaunchChecks.forEach(checklist => {
      checklist.hidden = checklist.dataset.launchCheckProfile !== mode;
    });
  };
  marketSetupModeSelect?.addEventListener('change', updateMarketSetupPreview);
  marketDeliveryCountries?.addEventListener('input', updateMarketSetupPreview);
  updateMarketSetupPreview();

  // A manager must be able to save a currency change with existing catalog data.
  // Checkout review is enforced by the server after saving; it must not block Save.
  // Reset the fee because a previous-currency amount cannot be reused safely.
  const storeCurrencySelect = document.querySelector('[data-store-currency-select]');
  const storeShippingFee = document.querySelector('[data-store-shipping-fee]');
  const productCurrencyReview = document.querySelector('#currency-product-review');
  if (storeCurrencySelect) {
    const updateStoreCurrencyUi = () => {
      const hasCurrencyData = storeCurrencySelect.dataset.hasCurrencyData === '1';
      // Keep the impact explanation visible whenever currency-dependent amounts exist.
      // No acknowledgement checkbox blocks saving; checkout review is enforced server-side.
      if (productCurrencyReview) productCurrencyReview.hidden = !hasCurrencyData;
      if (storeShippingFee) {
        const digits = currencyFractionDigits(storeCurrencySelect.value);
        storeShippingFee.step = String(1 / (10 ** digits));
      }
    };
    storeCurrencySelect.addEventListener('change', () => {
      if (storeShippingFee) storeShippingFee.value = '0';
      updateStoreCurrencyUi();
    });
    updateStoreCurrencyUi();
  }

  // Cookie preferences are strictly first-party. No analytics/marketing script
  // is bundled in this release; future integrations must explicitly check this
  // consent record before loading. The preference record itself is stored in
  // localStorage so the consent UI never needs to create an optional cookie.
  const cookieBanner = document.querySelector('[data-cookie-banner]');
  const cookieOverlay = document.querySelector('[data-cookie-preferences]');
  if (cookieBanner && cookieOverlay) {
    const COOKIE_STORAGE_KEY = 'shopeasy-cookie-choice-v1';
    const COOKIE_POLICY_VERSION = 1;
    const COOKIE_CHOICE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
    const cookieDialog = cookieOverlay.querySelector('[role="dialog"]');
    const analyticsInput = cookieOverlay.querySelector('[data-cookie-analytics]');
    const marketingInput = cookieOverlay.querySelector('[data-cookie-marketing]');
    const cookieStatus = cookieOverlay.querySelector('[data-cookie-preferences-status]');
    const cookieBannerStatus = cookieBanner.querySelector('[data-cookie-banner-status]');
    let cookieConsent = null;
    let cookieFocusReturn = null;

    const parseCookieConsent = raw => {
      if (!raw || typeof raw !== 'string') return null;
      try {
        const value = JSON.parse(raw);
        if (!value || value.version !== COOKIE_POLICY_VERSION || !Number.isFinite(value.savedAt)) return null;
        const age = Date.now() - value.savedAt;
        if (age < 0 || age > COOKIE_CHOICE_TTL_MS) return null;
        if (typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean') return null;
        return { version:COOKIE_POLICY_VERSION, savedAt:value.savedAt, necessary:true, analytics:value.analytics, marketing:value.marketing };
      } catch { return null; }
    };
    const readCookieConsent = () => {
      try { return parseCookieConsent(window.localStorage.getItem(COOKIE_STORAGE_KEY)); }
      catch { return null; }
    };
    const syncCookieCheckboxes = () => {
      if (analyticsInput) analyticsInput.checked = Boolean(cookieConsent?.analytics);
      if (marketingInput) marketingInput.checked = Boolean(cookieConsent?.marketing);
    };
    const closeCookiePreferences = ({ restoreFocus = true } = {}) => {
      const wasOpen = !cookieOverlay.hidden;
      cookieOverlay.hidden = true;
      document.body.classList.remove('cookie-preferences-open');
      if (!restoreFocus || !wasOpen) return;
      const available = element => element instanceof HTMLElement && element.isConnected &&
        element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' &&
        !element.closest('[hidden],[inert],[aria-hidden="true"]') && !element.matches(':disabled');
      if (available(cookieFocusReturn) && cookieFocusReturn !== document.body) {
        cookieFocusReturn.focus();
        return;
      }
      // Saving a choice removes the initial banner and its opener. Continue at
      // a visible main-content control rather than leave focus on the body.
      const next = [...document.querySelectorAll('main a[href],main button,main input:not([type="hidden"]),main select,main textarea,main [tabindex]')]
        .find(element => element.tabIndex >= 0 && available(element));
      const fallback = next || [...document.querySelectorAll('[data-cookie-open]')].find(available);
      fallback?.focus();
    };
    const openCookiePreferences = () => {
      cookieFocusReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      syncCookieCheckboxes();
      if (cookieStatus) cookieStatus.textContent = '';
      cookieOverlay.hidden = false;
      document.body.classList.add('cookie-preferences-open');
      cookieDialog?.focus();
    };
    const saveCookieConsent = (analytics, marketing) => {
      cookieConsent = { version:COOKIE_POLICY_VERSION, savedAt:Date.now(), necessary:true, analytics:Boolean(analytics), marketing:Boolean(marketing) };
      let persisted = true;
      try { window.localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookieConsent)); }
      catch { persisted = false; }
      // If storage is unavailable, keep the notice visible and explain why the
      // decision cannot persist. Never silently claim consent was saved.
      if (!persisted) {
        if (cookieBannerStatus) {
          cookieBannerStatus.textContent = cookieBanner.dataset.storageUnavailable || 'Browser storage is unavailable, so this choice cannot be saved.';
          cookieBannerStatus.hidden = false;
        }
        if (cookieStatus) cookieStatus.textContent = cookieBanner.dataset.storageUnavailable || 'Browser storage is unavailable, so this choice cannot be saved.';
        cookieBanner.hidden = false;
        closeCookiePreferences();
        return false;
      }
      if (cookieBannerStatus) { cookieBannerStatus.textContent = ''; cookieBannerStatus.hidden = true; }
      // No optional trackers are present in this build. Do not dynamically load
      // scripts based on acceptance alone; new integrations require separate review.
      cookieBanner.hidden = true;
      closeCookiePreferences();
      return true;
    };

    cookieConsent = readCookieConsent();
    cookieBanner.hidden = Boolean(cookieConsent);
    syncCookieCheckboxes();
    document.querySelectorAll('[data-cookie-open]').forEach(button => button.addEventListener('click', openCookiePreferences));
    document.querySelectorAll('[data-cookie-accept]').forEach(button => button.addEventListener('click', () => saveCookieConsent(true, true)));
    document.querySelectorAll('[data-cookie-reject]').forEach(button => button.addEventListener('click', () => saveCookieConsent(false, false)));
    document.querySelectorAll('[data-cookie-customize]').forEach(button => button.addEventListener('click', openCookiePreferences));
    cookieOverlay.querySelectorAll('[data-cookie-close]').forEach(button => button.addEventListener('click', () => closeCookiePreferences()));
    cookieOverlay.querySelector('[data-cookie-save]')?.addEventListener('click', () => saveCookieConsent(Boolean(analyticsInput?.checked), Boolean(marketingInput?.checked)));
    // Explicitly re-open the initial choice if the visitor wants to review it.
    // Removing the record never enables optional tracking.
    cookieOverlay.querySelector('[data-cookie-reset]')?.addEventListener('click', () => {
      cookieConsent = null;
      try { window.localStorage.removeItem(COOKIE_STORAGE_KEY); } catch { /* storage may be blocked */ }
      syncCookieCheckboxes();
      closeCookiePreferences();
      cookieBanner.hidden = false;
      cookieBanner.querySelector('[data-cookie-reject]')?.focus();
    });
    cookieDialog?.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
      const focusable = Array.from(cookieDialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'))
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden],[inert],[aria-hidden="true"]'));
      if (!focusable.length) { event.preventDefault(); cookieDialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // The dialog itself receives initial focus so its title/description can be
      // announced. Reverse Tab from that non-tabbable container must not escape.
      if (document.activeElement === cookieDialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !cookieOverlay.hidden) closeCookiePreferences();
    });
    window.addEventListener('storage', event => {
      if (event.key !== COOKIE_STORAGE_KEY) return;
      cookieConsent = parseCookieConsent(event.newValue);
      cookieBanner.hidden = Boolean(cookieConsent);
      syncCookieCheckboxes();
    });
  }

  // Back links navigate to explicit same-site destinations. Do not use
  // browser-history navigation might reopen checkout forms or old order steps.

  // Run after validation/CSRF handlers so cancelled submissions are not locked.
  // Restoring history only restores this enhancement; it never submits a form or
  // changes the server-issued order idempotency key, quote, CSRF or guest token.
  document.querySelectorAll('[data-submit-once]').forEach(form => {
    let locked=false;
    let control=null;
    let originalNodes=[];
    let originallyDisabled=false;
    const restoreSubmit = () => {
      if (!locked) return;
      locked=false;
      if (!control) return;
      control.disabled=originallyDisabled;
      control.replaceChildren(...originalNodes);
      control=null;
    };
    form.addEventListener('submit', event => {
      if (event.defaultPrevented || !form.checkValidity()) return;
      if (locked) { event.preventDefault(); return; }
      locked=true;
      control=form.querySelector('button[type="submit"], button:not([type])');
      if (control) {
        originallyDisabled=control.disabled;
        originalNodes=Array.from(control.childNodes);
        control.disabled=true;
        const lang=String(document.documentElement.lang||'en').split('-')[0];
        control.textContent={nl:'Bestelling wordt geplaatst…',ckb:'داواکاری دادەنرێت…',ar:'جارٍ إرسال الطلب…',fr:'Commande en cours…'}[lang]||'Placing order…';
      }
      queueMicrotask(() => { if (event.defaultPrevented) restoreSubmit(); });
    });
    window.addEventListener('pageshow', event => { if (event.persisted) restoreSubmit(); });
  });

})();

/* R18: Progressive catalogue filters and accessible cart quantity controls.
   The existing server-rendered form remains usable without JavaScript. */
(() => {
  const initialize = () => {
    const toggle = document.querySelector('[data-shop-filter-toggle]');
    const panel = document.getElementById('shop-filter-form');
    if (toggle && panel) {
      const overlay=document.querySelector('[data-filter-overlay]');
      const close=panel.querySelector('[data-filter-close]');
      document.body.classList.add('shop-filters-js-ready');
      const setOpen=(open,restore=true)=>{
        panel.hidden=!open;
        if(overlay)overlay.hidden=!open;
        toggle.setAttribute('aria-expanded',String(open));
        document.body.classList.toggle('shop-filter-drawer-open',open);
        if(open){panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');close?.focus();}
        else{panel.removeAttribute('role');panel.removeAttribute('aria-modal');if(restore)toggle.focus();}
      };
      setOpen(false,false);
      toggle.addEventListener('click',()=>setOpen(panel.hidden));
      close?.addEventListener('click',()=>setOpen(false));
      overlay?.addEventListener('click',()=>setOpen(false));
      document.addEventListener('keydown',event=>{
        if(panel.hidden)return;
        if(event.key==='Escape'){event.preventDefault();setOpen(false);}
        if(event.key==='Tab'){
          const items=[...panel.querySelectorAll('a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled])')].filter(el=>el.getClientRects().length);
          if(!items.length)return;
          if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
          else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
        }
      });
      const sort=document.getElementById('sort-filter');
      if(sort)sort.addEventListener('change',()=>sort.form?.requestSubmit());
      const categorySearch=panel.querySelector('[data-filter-category-search]');
      const categorySelect=panel.querySelector('#category-filter');
      if(categorySearch&&categorySelect)categorySearch.addEventListener('input',()=>{
        const term=categorySearch.value.normalize('NFKC').trim().toLocaleLowerCase();
        for(const option of categorySelect.options)option.hidden=!!term&&!!option.value&&!option.selected&&!option.textContent.normalize('NFKC').toLocaleLowerCase().includes(term);
      });
    }
    document.querySelectorAll('.cart-qty-stepper [data-cart-qty-step]').forEach(button => {
      button.addEventListener('click', () => {
        const form = button.closest('form');
        const input = form?.querySelector('input[name="quantity"]');
        if (!input || !form || form.dataset.cartSubmitting === '1') return;
        const current = Number(input.value);
        const min = Number(input.min || 1);
        const max = Number(input.max || 99);
        const delta = Number(button.dataset.cartQtyStep);
        if (!Number.isInteger(current) || !Number.isInteger(delta) || !Number.isFinite(max)) return;
        const next = Math.max(min, Math.min(max, current + delta));
        if (current === next) return;
        if (typeof form.requestSubmit !== 'function') return;
        input.value = String(next);
        form.dataset.cartSubmitting = '1';
        // requestSubmit can be stopped by validation or another submit handler.
        // Keep the duplicate guard only when a submission actually proceeds.
        let submittedEvent = null;
        const observeSubmit = event => { submittedEvent = event; };
        form.addEventListener('submit', observeSubmit);
        try { form.requestSubmit(); }
        finally {
          form.removeEventListener('submit', observeSubmit);
          if (!submittedEvent || submittedEvent.defaultPrevented) delete form.dataset.cartSubmitting;
        }
      });
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      document.querySelectorAll('form[data-cart-submitting]').forEach(form => { delete form.dataset.cartSubmitting; });
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
