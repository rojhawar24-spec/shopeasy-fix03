import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readShopFilters } from '../src/shop-filters.js';
import { csrfRecoveryPath, verifyCsrf } from '../src/security.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('invalid price filters fail closed and preserve the entered value for correction', () => {
  const invalid = readShopFilters({ minPrice: 'abc', maxPrice: '50', stock: '1' }, 'EUR');
  assert.equal(invalid.priceRangeInvalid, true);
  assert.equal(invalid.minPrice, 'abc');
  assert.equal(invalid.minPriceCents, null);
  assert.equal(invalid.maxPriceCents, null);
  assert.equal(invalid.inStockOnly, true);
});

test('price filters parse locale decimal commas and reject reversed ranges atomically', () => {
  const comma = readShopFilters({ minPrice: '12,50', maxPrice: '25,00' }, 'EUR');
  assert.equal(comma.minPriceCents, 1250);
  assert.equal(comma.maxPriceCents, 2500);
  assert.equal(comma.priceRangeInvalid, false);

  const reversed = readShopFilters({ minPrice: '30', maxPrice: '20' }, 'EUR');
  assert.equal(reversed.priceRangeInvalid, true);
  assert.equal(reversed.minPriceCents, null);
  assert.equal(reversed.maxPriceCents, null);
});

test('expired CSRF requests land on a safe GET route and never replay the POST', () => {
  const cases = [
    [{ path: '/checkout', body: {} }, '/checkout?notice=security-refresh'],
    [{ path: '/cart/update', body: {} }, '/cart?notice=security-refresh'],
    [{ path: '/order-lookup', body: {} }, '/order-lookup?notice=security-refresh'],
    [{ path: '/checkout/success/cancel', body: { orderId: '47' } }, '/checkout/success?order=47&notice=security-refresh'],
    [{ path: '/account/order/12/returns', body: {} }, '/account/order/12?notice=security-refresh'],
    [{ path: '/order/21/return-request', body: {} }, '/order-lookup?notice=security-refresh']
  ];
  for (const [req, expected] of cases) assert.equal(csrfRecoveryPath(req), expected);

  let redirect;
  let nextCalled = false;
  const req = { method: 'POST', path: '/checkout', body: { _csrf: 'expired' }, session: { csrf: 'fresh' }, get: () => undefined };
  const res = { redirect: (status, url) => { redirect = { status, url }; } };
  verifyCsrf(req, res, () => { nextCalled = true; });
  assert.deepEqual(redirect, { status: 303, url: '/checkout?notice=security-refresh' });
  assert.equal(nextCalled, false);
});

test('product list and result count apply the same effective-price and stock filters', () => {
  const db = read('src/db.js');
  const listStart = db.indexOf('export async function listProducts(');
  const countStart = db.indexOf('export async function countProducts(');
  const availabilityStart = db.indexOf('const productAvailabilitySql =');
  const list = db.slice(listStart, countStart);
  const count = db.slice(countStart, availabilityStart);
  for (const source of [list, count]) {
    assert.match(source, /availablePriceSql/);
    assert.match(source, /minPriceCents/);
    assert.match(source, /maxPriceCents/);
    assert.match(source, /inStockOnly/);
    assert.match(source, /productAvailabilitySql/);
  }
  assert.match(list, /gallery_image_2/);
  assert.match(list, /gallery_image_3/);
});

test('both shop routes preserve filters for results, counts and next-page checks', () => {
  const server = read('src/server.js');
  const categoryStart = server.indexOf("app.get('/category/:slug'");
  const shopStart = server.indexOf("app.get('/shop'");
  const categoryRoute = server.slice(categoryStart, shopStart);
  const nextRouteStart = server.indexOf("app.get('/search/suggest'");
  const shopRoute = server.slice(shopStart, nextRouteStart);
  for (const route of [categoryRoute, shopRoute]) {
    assert.match(route, /readShopFilters\(req\.query/);
    assert.match(route, /listProducts\(\{\.\.\.productQuery/);
    assert.match(route, /countProducts\(productQuery\)/);
    assert.match(route, /hasNext/);
  }
});

test('delivery messaging is honest and cart total stays payment-method neutral', () => {
  const lookup = read('views/order-lookup.ejs');
  const cart = read('views/cart.ejs');
  const product = read('views/product.ejs');
  const server = read('src/server.js');
  assert.match(lookup, /A delivery date has not yet been confirmed by the store or carrier/);
  assert.doesNotMatch(lookup, /3[–-]5 business days/);
  assert.match(cart, /Order total/);
  assert.doesNotMatch(cart, /Total to pay on delivery/);
  assert.match(product, /shippingDisplay\?\.feeCents/);
  assert.match(server, /getSetting\('shipping_fee_cents'/);
  assert.match(server, /getSetting\('shipping_zone_rules'/);
});

test('recovery notices and new storefront phrases have English, Sorani, Arabic and Dutch copies', () => {
  const master = JSON.parse(read('public/js/i18n.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/)[1]);
  const ckb = JSON.parse(read('public/js/i18n-ckb.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const ar = JSON.parse(read('public/js/i18n-ar.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const nl = JSON.parse(read('public/js/i18n-nl.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const keys = [
    'Your security check expired. The lookup was not submitted. Enter your details again on this secure form.',
    'Your security check expired. No change was submitted. Please use the fresh form on this page.',
    'Your security check expired before this action was accepted. Nothing was submitted again. Review the bag, then continue with a fresh secure form.',
    'Your security check expired. No order was submitted by that expired form. This page has a fresh security token; review your details and submit only once.',
    'Your security check expired. No order update was submitted. Review the current order status before sending another request.',
    'A delivery date has not yet been confirmed by the store or carrier.',
    'Minimum price', 'Maximum price', 'In-stock products only', 'Apply filters', 'Clear filters',
    'Delivery cost', 'Calculated for your delivery location and shown before you confirm the order.',
    'Free delivery is currently configured by this store.', 'Configured standard fee:',
    '. Any regional override is confirmed at checkout.', 'Order total', 'Additional product photos'
  ];
  for (const key of keys) {
    assert.equal(master.en[key], key, `English key missing: ${key}`);
    assert.notEqual(master.ckb[key], key, `Sorani translation missing: ${key}`);
    assert.notEqual(master.ar[key], key, `Arabic translation missing: ${key}`);
    assert.notEqual(master.nl[key], key, `Dutch translation missing: ${key}`);
    assert.equal(nl.nl[key], master.nl[key], `served Dutch bundle differs: ${key}`);
    assert.equal(ckb.ckb[key], master.ckb[key], `served Sorani bundle differs: ${key}`);
    assert.equal(ar.ar[key], master.ar[key], `served Arabic bundle differs: ${key}`);
  }
});

test('active filter chips can be removed individually without losing sort state', () => {
  const shop = read('views/shop.ejs');
  assert.match(shop, /sort:\s*sort\s*\|\|\s*''/);
  assert.match(shop, /shopFilterUrlWithout\('category'\)/);
  assert.match(shop, /shopFilterUrlWithout\('search'\)/);
  assert.match(shop, /shopFilterUrlWithout\('minPrice'\)/);
  assert.match(shop, /shopFilterUrlWithout\('maxPrice'\)/);
  assert.match(shop, /shopFilterUrlWithout\('stock'\)/);
  assert.match(shop, /class="active-filter-bar"/);
  assert.match(shop, /class="active-filter-list"/);
  assert.match(shop, /appearance\.filterChips/);
  assert.match(shop, /class="active-filter-clear"/);
});

test('new delivery and active-filter text is translated in all shipped storefront locales', () => {
  const master = JSON.parse(read('public/js/i18n.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/)[1]);
  const ckb = JSON.parse(read('public/js/i18n-ckb.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const ar = JSON.parse(read('public/js/i18n-ar.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const nl = JSON.parse(read('public/js/i18n-nl.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const keys = [
    'Delivery pricing for your location is not currently available. Contact the store before ordering.',
    'Active filters', 'Category:', 'Search:'
  ];
  for (const key of keys) {
    assert.equal(master.en[key], key, `English key missing: ${key}`);
    assert.notEqual(master.ckb[key], key, `Sorani translation missing: ${key}`);
    assert.notEqual(master.ar[key], key, `Arabic translation missing: ${key}`);
    assert.notEqual(master.nl[key], key, `Dutch translation missing: ${key}`);
    assert.equal(nl.nl[key], master.nl[key], `served Dutch bundle differs: ${key}`);
    assert.equal(ckb.ckb[key], master.ckb[key], `served Sorani bundle differs: ${key}`);
    assert.equal(ar.ar[key], master.ar[key], `served Arabic bundle differs: ${key}`);
  }
});

test('active catalogue chips and responsive layouts have accessible active-CSS rules', () => {
  const css = read('public/css/app.css');
  assert.match(css, /\.active-filter-summary\s*\{/);
  assert.match(css, /\.active-filter-chip:focus-visible\s*\{/);
  assert.match(css, /outline:\s*3px solid var\(--color-focus-ring\)/);
  // E2 deliberately uses four desktop columns, three tablet columns and two mobile columns.
  assert.match(css, /\.product-grid, \.shop-grid \{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(min-width: 640px\) and \(max-width: 1023px\) \{[\s\S]*?\.product-grid \{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*?\.product-grid, \.shop-grid \{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.admin-nav > \.admin-nav-group > a\s*\{[^}]*color:\s*var\(--sidebar-text\)/);
  assert.match(css, /\.site-footer\s*\{/);
});
