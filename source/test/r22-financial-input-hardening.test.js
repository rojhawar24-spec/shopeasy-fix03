import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { moneyCents, isValidCurrency } from '../src/security.js';
import { parseCartQuantity } from '../src/cart-form-inputs.js';

test('money conversion never interprets duplicated or structured fields as prices', () => {
  for (const value of [ ['1', '25'], ['1.25'], ['10'], { value: '5.00' }, { toString: () => '25.00' }, true, false, NaN, Infinity, null, undefined]) {
    assert.equal(moneyCents(value, 'EUR'), null, `invalid price accepted: ${typeof value}`);
  }
  assert.equal(moneyCents('1,25', 'EUR'), 125);
  assert.equal(moneyCents('5.00', 'EUR'), 500);
  assert.equal(moneyCents(5, 'EUR'), 500);
  assert.equal(moneyCents('25.125', 'IQD'), 25125);
});

test('currency does not accept duplicate request parameters', () => {
  for (const value of [ ['EUR'], ['EUR','USD'], { code:'EUR' }, 42, null ]) {
    assert.equal(isValidCurrency(value), false);
  }
  assert.equal(isValidCurrency('EUR'), true);
});

test('inventory and percentage integers reject array and alternate numeric notation', () => {
  for (const value of [ ['20'], ['1','0'], {}, '1e2', '0x10', '1.2', '', '-1', '   ', 1.5, Number.NaN ]) {
    assert.equal(parseCartQuantity(value), null);
  }
  assert.equal(parseCartQuantity('0'), 0);
  assert.equal(parseCartQuantity('150'), 150);
  assert.equal(parseCartQuantity('00002'), 2);
});

test('product, inventory, coupon and bundle forms validate numeric inputs before accepting them', () => {
  const source=fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(source, /costRaw=req\.body\.costPrice, saleRaw=req\.body\.salePrice/);
  assert.match(source, /typeof saleRaw !== 'string'\) throw new Error\('SALE_PRICE'\)/);
  assert.match(source, /automaticDiscountPercent=parseCartQuantity\(req\.body\.automaticDiscountPercent\)/);
  assert.match(source, /const stock=hasVariants\?0:parseCartQuantity\(req\.body\.stock\),reorderLevel=parseCartQuantity\(req\.body\.reorderLevel\)/);
  assert.match(source, /const stock=parseCartQuantity\(rawStock\)/);
  assert.match(source, /const amount=parseCartQuantity\(req\.body\.quantity\)/);
  assert.match(source, /type==='fixed'\?moneyCents\(req\.body\.value,storeCurrency\):parseCartQuantity\(req\.body\.value\)/);
  assert.match(source, /productIds:\[parseCartProductId\(req\.body\.productIdA\),parseCartProductId\(req\.body\.productIdB\)\]/);
});
