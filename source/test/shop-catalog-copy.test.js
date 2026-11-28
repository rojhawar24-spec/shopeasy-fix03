import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { customerText } from '../src/customer-page-copy.js';

const keys = [
  'Category path', 'All categories', 'Filters', 'Sort', 'Newest',
  'Price: low to high', 'Price: high to low', 'Name: A–Z', 'Refine selection',
  'Close filters', 'Category', 'Search categories', 'e.g. clothing, homeware, accessories',
  'Price range', 'Min', 'Max', 'Any', 'Show results', 'Remove category:', 'Remove search:',
  'Remove sorting', 'Sort:', 'Remove minimum price', 'Min:', 'Remove maximum price',
  'Max:', 'Clear all', 'No products found.', 'Try fewer words, another category or a different sort order.',
  'Reset shop', 'Filter products', 'Category not found', 'This category is not available.',
  'When submitted, AI may expand your query with synonyms. Only search terms are sent to the configured AI service; results always come from your active catalog.',
  'Check the minimum and maximum prices. Use the correct decimal precision for the store currency, and make sure the maximum is not below the minimum. No price filter was applied.',
  'AI expanded your search. Results show real active products from this store only.',
  'Your security check expired. No change was submitted. Please use the fresh form on this page.'
];

test('catalog controls and error messages have translations in all five non-English store locales', () => {
  for (const locale of ['nl', 'fr', 'ckb', 'ar', 'kmr']) {
    for (const key of keys) {
      const value = customerText(locale, key);
      assert.ok(typeof value === 'string' && value.trim(), locale + ': ' + key);
      if (!(locale === 'nl' && key === 'Filters')) {
        assert.notEqual(value, key, locale + ': untranslated ' + key);
      }
    }
  }
  for (const key of keys) assert.equal(customerText('en', key), key);
});

const template = readFileSync(new URL('../views/shop.ejs', import.meta.url), 'utf8');
const start = template.indexOf('const shopCategoryPath = ');
const end = template.indexOf('%>', start);
assert.ok(start >= 0 && end > start, 'shop URL helpers must exist');
const helper = template.slice(start, end);
const railHelper = template.match(/function categoryFilterHref\(slug\)\{[^\n]*?\}\s*%>/)?.[0].replace(/\s*%>$/, '');
assert.ok(railHelper, 'category navigation URL helper must exist');

function urls(categoryInfo, filters) {
  return runInNewContext(helper + '\n' + railHelper + '\n({remove: shopFilterUrlWithout, select: categoryFilterHref, sortPath: shopCategoryPath})', {
    _categoryInfo: categoryInfo, shopFilterState: filters, URLSearchParams, encodeURIComponent
  });
}

test('direct category filter removal and sorting keep the category route', () => {
  const state = {category:'clothing',search:'shirt & coat',sort:'price_low',minPrice:'5',maxPrice:'40',stock:'1'};
  const direct = urls({slug:'clothing'}, state);
  assert.equal(direct.sortPath, '/category/clothing');
  const removed = new URL(direct.remove('minPrice'), 'https://store.example');
  assert.equal(removed.pathname, '/category/clothing');
  assert.equal(removed.searchParams.has('category'), false);
  assert.equal(removed.searchParams.has('minPrice'), false);
  assert.equal(removed.searchParams.get('maxPrice'), '40');
  assert.equal(removed.searchParams.get('search'), 'shirt & coat');
  assert.equal(removed.searchParams.get('sort'), 'price_low');
  assert.equal(removed.searchParams.get('stock'), '1');
  const all = new URL(direct.remove('category'), 'https://store.example');
  assert.equal(all.pathname, '/shop');
  assert.equal(all.searchParams.has('category'), false);
  assert.equal(all.searchParams.get('search'), 'shirt & coat');
  const child = new URL(direct.select('shirts'), 'https://store.example');
  assert.equal(child.pathname, '/category/shirts');
  assert.equal(child.searchParams.get('stock'), '1');
  assert.equal(child.searchParams.has('category'), false);
  assert.equal(new URL(direct.select(''), 'https://store.example').pathname, '/shop');
});

test('general shop retains query-based category navigation', () => {
  const general = urls(null, {category:'clothing',search:'shirt',stock:'1'});
  assert.equal(general.sortPath, '/shop');
  const removed = new URL(general.remove('stock'), 'https://store.example');
  assert.equal(removed.pathname, '/shop');
  assert.equal(removed.searchParams.get('category'), 'clothing');
  assert.equal(removed.searchParams.has('stock'), false);
  const selected = new URL(general.select('homeware'), 'https://store.example');
  assert.equal(selected.pathname, '/shop');
  assert.equal(selected.searchParams.get('category'), 'homeware');
  assert.equal(selected.searchParams.get('search'), 'shirt');
});
