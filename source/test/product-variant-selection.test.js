import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectedAvailableVariantId } from '../src/product-variants.js';

const variants = [
  { id: 11, available_stock: 0 },
  { id: 12, available_stock: '4' },
  { id: 13, available_stock: 2 },
];

test('sold-out options cannot be preselected from a query string', () => {
  assert.equal(selectedAvailableVariantId(variants, '11'), null);
  assert.equal(selectedAvailableVariantId(variants, '12'), 12);
  assert.equal(selectedAvailableVariantId(variants, '13'), 13);
});

test('variant selector rejects malformed, fractional, negative and unknown IDs', () => {
  for (const candidate of ['', null, undefined, 'abc', '12x', '1.5', '-12', '0', '999']) {
    assert.equal(selectedAvailableVariantId(variants, candidate), null, `candidate ${String(candidate)}`);
  }
});

test('variant selector fails closed on missing data and invalid stock', () => {
  assert.equal(selectedAvailableVariantId(null, '12'), null);
  assert.equal(selectedAvailableVariantId([{ id: 1, available_stock: 'NaN' }], '1'), null);
  assert.equal(selectedAvailableVariantId([{ id: 1, available_stock: -3 }], '1'), null);
  assert.equal(selectedAvailableVariantId([{ id: 1, available_stock: 0.5 }], '1'), null);
});

test('product page labels the variant purchase action and browser logic validates option stock', () => {
  const product = fs.readFileSync(new URL('../views/product.ejs', import.meta.url), 'utf8');
  const browser = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(product, /data-variant-submit/);
  assert.match(product, /data-product-variant-form/);
  assert.match(product, /data-option-one-select/);
  assert.match(product, /data-option-two-select/);
  assert.match(browser, /const available = Boolean\(chosen\) && availableStock > 0/);
  assert.match(browser, /submit\.disabled = !available/);
  assert.match(browser, /quantity\.disabled = !available/);
  assert.match(browser, /normalize\(item\.value\) === one && normalize\(item\.value2 \|\| ''\) === two/);
});
