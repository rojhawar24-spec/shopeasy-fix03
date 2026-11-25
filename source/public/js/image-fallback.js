/* ShopEasy V17 — truthful, local-only image fallback chain. Missing imagery uses a neutral placeholder, never stock hero art. */
(() => {
  'use strict';
  const DEFAULTS = Object.freeze({
    hero: ['/assets/product-placeholder.svg'],
    product: ['/assets/product-placeholder.svg'],
    story: ['/assets/story.svg']
  });

  const normalize = (value) => {
    try { return new URL(value, document.baseURI).href; }
    catch { return ''; }
  };

  const validLocalPath = (value) => {
    const raw = String(value || '').trim();
    if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
    if (raw.startsWith('./') && !raw.includes('\\')) {
      try {
        const url = new URL(raw, document.baseURI);
        if (url.origin === window.location.origin || window.location.protocol === 'file:') return url.href;
      } catch { /* Ignore malformed fallback path. */ }
    }
    return '';
  };

  const candidatesFor = (image) => {
    const explicit = validLocalPath(image.getAttribute('data-fallback-src'));
    const secondary = validLocalPath(image.getAttribute('data-fallback-secondary-src'));
    const group = image.closest('.stage-image, .branding-hero-preview') ? 'hero'
      : image.closest('[data-story-viewer], .story-card, .story-bubble, .stories-row, .story-grid, .table-story') ? 'story'
      : image.closest('.product-media, .product-media-column, .product-visual-v5, .product-visual-v6, .cart-product-image, .order-product-thumb, .checkout-summary-item, .product-gallery-editor-item, .table-product, .category-card-media, .category-context-image, .preview-card') ? 'product'
      : '';
    const values = [explicit, secondary, ...(group ? DEFAULTS[group] : [])].filter(Boolean);
    return [...new Set(values.map(normalize).filter(Boolean))];
  };

  const handleImageError = (image) => {
    if (!(image instanceof HTMLImageElement)) return;
    const candidates = candidatesFor(image);
    if (!candidates.length) return;
    const failedUrl = normalize(image.currentSrc || image.src || '');
    if (!failedUrl) return;
    const failed = new Set(String(image.dataset.fallbackFailedUrls || '').split('\n').filter(Boolean));
    failed.add(failedUrl);
    image.dataset.fallbackFailedUrls = [...failed].join('\n');
    const next = candidates.find(candidate => candidate !== failedUrl && !failed.has(candidate));
    if (!next) {
      image.classList.add('is-image-fallback-exhausted');
      image.dispatchEvent(new CustomEvent('shopeasy:image-fallback-exhausted', { bubbles: true }));
      return;
    }
    image.classList.add('is-image-fallback');
    image.dataset.activeFallbackUrl = next;
    image.src = next;
    image.dispatchEvent(new CustomEvent('shopeasy:image-fallback', { bubbles: true }));
  };

  document.addEventListener('error', (event) => handleImageError(event.target), true);

  // The script is deferred. Images can fail before the listener is installed, so inspect
  // already-completed failed images once after attaching the delegated listener.
  for (const image of document.querySelectorAll('img')) {
    if (image instanceof HTMLImageElement && image.complete && image.naturalWidth === 0) handleImageError(image);
  }

  // Variant/gallery/story interactions can replace src after a fallback. A successful
  // non-fallback load must restore normal styling and clear that failed URL history.
  document.addEventListener('load', (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const loadedUrl = normalize(image.currentSrc || image.src || '');
    const activeFallback = normalize(image.dataset.activeFallbackUrl || '');
    if (!loadedUrl || (activeFallback && loadedUrl === activeFallback)) return;
    image.classList.remove('is-image-fallback', 'is-image-fallback-exhausted');
    delete image.dataset.activeFallbackUrl;
    delete image.dataset.fallbackFailedUrls;
  }, true);
})();
