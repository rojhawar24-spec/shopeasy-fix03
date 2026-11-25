import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseLegacyVariantRows } from '../src/product-variants.js';

test('legacy product variants retain valid sizes with exact whole-number stock', () => {
  assert.deepEqual(parseLegacyVariantRows('S | 12\nM | 0'), [
    { value: 'S', value2: '', stock: 12, sku: '', imageUrl: '' },
    { value: 'M', value2: '', stock: 0, sku: '', imageUrl: '' }
  ]);
});

test('legacy product stock rejects disguised values, malformed rows and repeated form parameters', () => {
  for (const raw of ['M | 1e2', 'M | ', 'M | 1.5', 'M | -1', 'M | 100000001',
    'M | Infinity', 'M | 2 | extra', 'X'.repeat(81) + ' | 1', ['M | 1']]) {
    assert.throws(() => parseLegacyVariantRows(raw), { message: 'VARIANT_VALIDATION' });
  }
});

test('product save route actually validates old variant-row fields before persisting them', () => {
  const src = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(src, /variants=parseLegacyVariantRows\(req\.body\.variantRows\)/);
});
