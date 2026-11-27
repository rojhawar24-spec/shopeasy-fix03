import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('home page is shopper-first and does not expose manager/control-room messaging', () => {
  const home = read('views/home.ejs');
  const categories=home.indexOf('class="home-category-rail"');
  const products=home.indexOf('product-grid-signature');
  const services=home.indexOf('class="container shop-service-strip"');
  assert.ok(categories>=0&&categories<products&&products<services);
  assert.doesNotMatch(home, /CONTROL ROOM|Manage products, prices|Server-verified pricing|Secure session|Prices, stock and discounts are verified by the server/i);
  assert.match(home, /الدفع عند الاستلام/);
  assert.match(home, /راجع معلومات الشحن والإرجاع/);
  assert.match(home, /class="service-item service-link" href="\/shipping-returns"/);
});

test('catalog result summary is customer-facing instead of implementation detail', () => {
  const shop = read('views/shop.ejs');
  assert.match(shop, /Find your favourites\. Explore, compare and shop at your own pace\./);
  assert.match(shop, /shop-mobile-result-count[\s\S]*?<%= resultCount %>/);
  assert.doesNotMatch(shop, /shopServerNote|shop-server-note|Prices and availability update from the server/);
});

test('V8 style system covers the major public, order and manager surfaces', () => {
  const css = read('test/fixtures/legacy-css/style.css');
  for (const selector of [
    '.hero-stage {', '.category-card-image {', '.product-card-signature .product-image {',
    '.product-visual-v6 img, .product-visual-v5 img {', '.shop-controls {', '.cart-layout-v5 {',
    '.payment-method-card {', '.checkout-place-order {', '.order-status-panel, .order-items-card',
    '.auth-card {', '.site-footer {', '.mobile-bottom-nav {', '.admin-nav {', '.stat-card {',
    'html[dir="rtl"] body', '@media (max-width: 760px)', '@media (max-width: 420px)',
    '@media (prefers-reduced-motion: reduce)'
  ]) assert.ok(css.includes(selector), `Missing site-wide design rule: ${selector}`);
  assert.match(css, /--accent:\s*#234fd4/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /:focus-visible/);
});

test('redesign preserves customer actions, route targets and CSRF protection', () => {
  const [header, product, cart, checkout, order, footer] = [
    'views/partials/header.ejs','views/product.ejs','views/cart.ejs','views/checkout.ejs','views/order.ejs','views/partials/footer.ejs'
  ].map(read);
  for (const [source, route] of [[header,'/language'],[header,'/shop'],[product,'/cart/add'],[cart,'/cart/update'],[cart,'/cart/remove'],[cart,'/checkout'],[checkout,'/checkout'],[order,'/account/order/']]) {
    assert.ok(source.includes(route), `Missing expected route/hook: ${route}`);
  }
  for (const [source, label] of [[header,'header'],[product,'product'],[cart,'cart'],[checkout,'checkout'],[order,'order']]) {
    assert.match(source, /name="_csrf"/, `CSRF field missing in ${label}`);
  }
});

test('fallback homepage branding is customer-oriented in all supported languages', () => {
  const server = read('src/server.js');
  assert.match(server, /GOOD FINDS, MADE SIMPLE/);
  assert.match(server, /Explore useful finds, clear prices and an easy way to order/);
  assert.match(server, /بەرهەمی باش، بە ئاسانی/);
  assert.match(server, /منتجات مميزة، واختيار أسهل/);
  assert.match(server, /يناسب يومك/);
  assert.doesNotMatch(server, /عناية مختارة|جمالك يبدأ/, 'generic defaults must not hard-code a beauty-product store');
  assert.doesNotMatch(server, /checkout that verifies the important details on the server/);
});
