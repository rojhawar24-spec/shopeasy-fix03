// Progressive enhancement: show the selected real product photo at full size.
// Without JS, the ordinary link opens the main photo in a new tab.
(() => {
  'use strict';
  const link = document.querySelector('[data-product-photo-expand]');
  const dialog = document.querySelector('[data-product-photo-dialog]');
  const large = dialog?.querySelector('[data-product-photo-large]');
  const main = document.querySelector('[data-product-main-image]');
  const close = dialog?.querySelector('[data-product-photo-close]');
  if (!link || !dialog || !large || !main || !close) return;
  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (typeof dialog.showModal !== 'function') return;
    event.preventDefault();
    // The selected size/colour or gallery thumbnail may have updated main.src.
    // Show that exact image rather than an unrelated placeholder/stock photo.
    large.src = main.currentSrc || main.src;
    large.alt = main.alt || '';
    if (!dialog.open) dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => link.focus());
})();
