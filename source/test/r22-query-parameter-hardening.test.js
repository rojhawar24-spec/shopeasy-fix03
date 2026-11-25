import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedAvailableVariantId } from '../src/product-variants.js';
import { readShopFilters } from '../src/shop-filters.js';

const variants = [{ id: 12, available_stock: 3 }];

test('variant preselection rejects repeated, structured and non-decimal query IDs', () => {
  for (const invalid of [['12'], ['12', '13'], {id:'12'}, '1.2e1', '0xc', '12.0']) {
    assert.equal(selectedAvailableVariantId(variants, invalid), null);
  }
  assert.equal(selectedAvailableVariantId(variants, '12'), 12);
});

test('price filtering fails closed on duplicate or structured URL query values', () => {
  const duplicate = readShopFilters({minPrice:['1','25'],maxPrice:'30'}, 'EUR');
  assert.equal(duplicate.priceRangeInvalid, true);
  assert.equal(duplicate.minPriceCents, null);
  assert.equal(duplicate.maxPriceCents, null);
  const structured = readShopFilters({minPrice:{raw:'1.25'},maxPrice:'30'}, 'EUR');
  assert.equal(structured.priceRangeInvalid, true);
  assert.equal(structured.maxPriceCents, null);
  const normal = readShopFilters({minPrice:'1,25',maxPrice:'30',stock:'1'}, 'EUR');
  assert.deepEqual([normal.minPriceCents, normal.maxPriceCents, normal.priceRangeInvalid, normal.inStockOnly], [125,3000,false,true]);
});
