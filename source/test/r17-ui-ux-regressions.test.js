import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const product = read('views/admin/product-form.ejs');
const shop = read('views/shop.ejs');
const cart = read('views/cart.ejs');
const footer = read('views/partials/footer.ejs');
const app = read('public/js/app.js');
const css = read('public/css/research-polish-2027.css');

test('R17 product editor keeps independent stock and SKU fields per option', () => {
  for (const attr of ['name="variantValue"','name="variantStock"','name="variantSku"','data-variant-row','data-variant-remove','data-variant-add','data-variant-count','data-variant-total-stock'])
    assert.ok(product.includes(attr), attr);
  assert.match(product, /class="variant-row variant-row-matrix"/);
  assert.match(css, /body\.is-admin-app \.variant-row-matrix \{display:grid/);
  assert.match(css, /data-variant-label-two\]\[hidden\]/);
});
test('R17 image gallery retains genuine upload and existing-image deletion actions', () => {
  assert.match(product, /name="image" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(product, /name="galleryImages" accept="image\/jpeg,image\/png,image\/webp" multiple/);
  assert.match(product, /name="galleryImageUrls"/);
  assert.match(product, /action="\/admin\/products\/[^\"]*\/images\//);
  assert.match(css, /\.product-upload-card input\[type=file\]/);
});
test('R17 catalogue filters submit once and preserve live category and sort inputs', () => {
  assert.match(shop, /<form id="shop-filter-form" class="shop-controls" method="get" action="\/shop"/);
  assert.match(shop, /name="category"/);
  assert.match(shop, /name="sort"/);
  assert.match(shop, /name="search"/);
  assert.match(shop, /name="minPrice"/);
  assert.match(shop, /name="maxPrice"/);
  assert.match(shop, /name="stock"/);
  assert.equal((shop.match(/<button type="submit" class="btn btn-dark">Search<\/button>/g)||[]).length, 0);
  assert.match(shop, /class="shop-filters-heading"/);
});
test('R17 cart retains price, quantity, coupon, removal and checkout actions', () => {
  for (const action of ['/cart/update','/cart/remove','/cart/coupon']) assert.ok(cart.includes(`action="${action}"`), action);
  assert.match(cart, /class="cart-line-total"/);
  assert.match(cart, /class="summary-row total"/);
  assert.match(cart, /class="btn btn-dark btn-wide checkout-btn cart-primary-action" href="\/checkout" data-cart-studio-checkout/);
  assert.match(css, /body\.is-storefront-app \.cart-list-v5 \.cart-item \{display:grid/);
});
test('R17 consent remains off by default and can be reset from preferences', () => {
  assert.match(footer, /data-cookie-banner hidden/);
  assert.match(footer, /data-cookie-reject/);
  assert.match(footer, /data-cookie-accept/);
  assert.match(footer, /data-cookie-open/);
  assert.match(footer, /data-cookie-reset/);
  assert.match(app, /cookieConsent = readCookieConsent\(\);\s*cookieBanner\.hidden = Boolean\(cookieConsent\)/);
  assert.match(app, /localStorage\.removeItem\(COOKIE_STORAGE_KEY\)/);
});
test('R17 Manager does not display customer storefront footer or cookie controls', () => {
  assert.match(footer, /if\(isAdminRoute\)\{ %><div class="manager-quiet-footer"/);
  assert.match(footer, /<% } else \{ %><footer class="site-footer">/);
  assert.match(footer, /<\/footer><% } %>/);
  assert.match(css, /body\.is-admin-app \.manager-quiet-footer/);
});
test('R17 design has responsive and RTL-safe mobile layouts without !important', () => {
  for (const selector of ['@media(max-width:760px)','@media(max-width:430px)','prefers-reduced-motion','grid-template-columns','minmax(0,1fr)']) assert.ok(css.includes(selector), selector);
  assert.doesNotMatch(css,/!important/);
  const latestStyle = /design-polish\.min\.css\?v=(2027-r\d+(?:\.[A-Za-z0-9_-]+)?)/;
  const headerVersion=read('views/partials/header.ejs').match(latestStyle)?.[1];
  assert.ok(headerVersion,'current stylesheet has a cache version');
  assert.equal(read('PREVIEW.html').match(latestStyle)?.[1],headerVersion);
  assert.equal(read('PREVIEW-MANAGER.html').match(latestStyle)?.[1],headerVersion);
  // Any JS behaviour change must invalidate the cached live app for returning users.
  const appVersion=footer.match(/\/js\/app\.js\?v=(2027-r\d+(?:\.[A-Za-z0-9_-]+)?)/)?.[1];
  assert.equal(appVersion,headerVersion,'app.js and the stylesheet must ship with the same release cache version');
});
