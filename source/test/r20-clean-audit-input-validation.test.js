import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCartProductId, parseCartVariantId, parseCartQuantity } from '../src/cart-form-inputs.js';
import { readShopFilters } from '../src/shop-filters.js';

const source = filename => fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

test('R20: product IDs reject arrays, objects, exponent, hex and empty values before a database lookup', () => {
  const invalid = [[], ['1'], {}, { x: 1 }, '1e0', '0x1', '', '  ', '0', 0, -1, '1.0', '1.2', null, undefined, '9007199254740993'];
  for (const value of invalid) assert.equal(parseCartProductId(value), null, `accepted ${JSON.stringify(value)}`);
  assert.equal(parseCartProductId('42'), 42);
  assert.equal(parseCartProductId(42), 42);
  assert.equal(parseCartProductId('00042'), 42);
});

test('R20: a missing variant is different from a malformed variant', () => {
  for (const empty of [undefined, null, '', '0', 0]) assert.equal(parseCartVariantId(empty), null);
  for (const bad of ['1e0', ['1'], ['0'], {}, '-1', '1.5', 'oops', '00']) assert.equal(Number.isNaN(parseCartVariantId(bad)), true, `accepted ${JSON.stringify(bad)}`);
  assert.equal(parseCartVariantId('23'), 23);
});

test('R20: cart quantities use plain nonnegative integers, not JavaScript coercion', () => {
  for (const bad of ['', ' ', '1e2', '0x2', '1.0', '1.5', -1, '-1', [], ['1'], {}, undefined, null, Infinity]) {
    assert.equal(parseCartQuantity(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
  for (const [raw, expected] of [['0', 0], ['1', 1], ['99', 99], ['100', 100], [0, 0], [3, 3]]) {
    assert.equal(parseCartQuantity(raw), expected);
  }
});

test('R20: EUR/JPY/KWD price filters respect exact store currency precision', () => {
  const cases = [
    ['EUR', '0.009', null, true], ['EUR', '10.999', null, true],
    ['EUR', '12,50', 1250, false], ['EUR', '0.01', 1, false],
    ['JPY', '0.5', null, true], ['JPY', '1.0', null, true], ['JPY', '125', 125, false],
    ['KWD', '0.009', 9, false], ['KWD', '10.999', 10999, false], ['KWD', '0.0009', null, true]
  ];
  for (const [currency, text, cents, invalid] of cases) {
    const result = readShopFilters({ minPrice: text }, currency);
    assert.equal(result.minPriceCents, cents, `${currency}: ${text}`);
    assert.equal(result.priceRangeInvalid, invalid, `${currency}: ${text}`);
  }
});

test('R20: invalid price fields reject the entire range instead of applying one half', () => {
  for (const currency of ['EUR', 'JPY', 'KWD']) {
    const result = readShopFilters({ minPrice: '1.00099', maxPrice: '25', stock: '1' }, currency);
    assert.equal(result.priceRangeInvalid, true);
    assert.equal(result.minPriceCents, null);
    assert.equal(result.maxPriceCents, null);
    assert.equal(result.inStockOnly, true);
  }
});

test('R20: storefront mutations validate form IDs before calling the database and preserve redirects', () => {
  const code = source('src/server.js');
  const snippets = {
    wishlist: code.slice(code.indexOf("app.post('/wishlist/toggle'"), code.indexOf("app.post('/cart/add'")),
    add: code.slice(code.indexOf("app.post('/cart/add'"), code.indexOf("app.post('/cart/update'")),
    update: code.slice(code.indexOf("app.post('/cart/update'"), code.indexOf("app.post('/cart/remove'")),
    remove: code.slice(code.indexOf("app.post('/cart/remove'"), code.indexOf("app.get('/cart'")),
  };
  for (const [name, part] of Object.entries(snippets)) {
    assert.match(part, /parseCartProductId\(req\.body\.productId\)/, name);
    assert.doesNotMatch(part, /Number\(req\.body\.productId\)/, name);
  }
  for (const name of ['add', 'update', 'remove']) {
    assert.match(snippets[name], /parseCartVariantId\(req\.body\.variantId\)/, name);
    const validation=snippets[name].indexOf('Number.isNaN(variantId)');
    const databaseAccess=snippets[name].indexOf(name==='remove'?'commitCartIntent(req':'getProductById(id)');
    assert.ok(validation>=0 && databaseAccess>=0 && validation<databaseAccess,`${name}: malformed variants must be rejected before product lookup or persisted-cart mutation`);
  }
  assert.match(snippets.add, /\?cartError=quantity/);
  assert.match(snippets.update, /\?cartError=quantity/);
  assert.match(snippets.update, /qty===0/);
  assert.match(snippets.remove, /return localRedirect\(req,res,'\/cart'\)/);
});

test('R20: price-filter input uses the store minor unit and feedback covers invalid decimals', () => {
  const server = source('src/server.js');
  const shop = source('views/shop.ejs');
  assert.match(server, /res\.locals\.priceFilterStep =/);
  assert.match(shop, /typeof priceFilterStep !== 'undefined'/);
  assert.match(shop, /correct decimal precision for the store currency/);
  assert.match(shop, /locale==='nl'/);
});
