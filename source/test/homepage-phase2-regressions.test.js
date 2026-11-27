import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('homepage requests enough active products for an eight-card primary catalogue row', () => {
  const server = read('src/server.js');
  assert.match(server, /listProducts\(\{onlyActive:true,sort:'featured',limit:48,offset:0\}\)/);
  assert.match(server, /listProducts\(\{onlyActive:true,sort:'newest',limit:32,offset:0\}\)/);
  assert.match(server, /const products=\[\.\.\.ordinary,\.\.\.arrivals\]\.slice\(0,8\)/);
  assert.match(server,/const catalogue=\[\.\.\.new Map/);
  assert.match(server, /const newProducts=latestProducts\.filter\(isRecentlyAddedProduct\)\.slice\(0,12\)/);
});

test('homepage keeps Stories on their dedicated page and keeps customer service information below the catalogue', () => {
  const home = read('views/home.ejs');
  assert.doesNotMatch(home, /class="container section stories-section"/);
  assert.doesNotMatch(home, /include\('partials\/story-viewer'\)/);
  assert.ok(home.indexOf("if (newProducts && newProducts.length)")>=0);
  assert.ok(home.indexOf('class="container shop-service-strip"')>home.indexOf('product-grid-signature'));
  assert.match(home, /href="\/shipping-returns"/);
});

test('homepage trust row contains four localized customer-information items', () => {
  const home = read('views/home.ejs');
  const start = home.indexOf('class="container shop-service-strip"');
  const end = home.indexOf('</section>', start);
  const trust = home.slice(start, end);
  assert.equal((trust.match(/<strong>/g) || []).length, 4);
  for (const phrase of ['گەڕانی ئاسان', 'نرخی ڕوون', 'پارەدان لە کاتی گەیاندن', 'سیاسەتی ڕوون', 'Easy discovery', 'Clear pricing', 'Cash on delivery', 'Clear policies']) {
    assert.ok(trust.includes(phrase), `Missing localized trust item: ${phrase}`);
  }
});

test('four-item trust strip adapts across desktop, tablet and mobile breakpoints', () => {
  const css = read('test/fixtures/legacy-css/design-v17.css');
  assert.match(css, /\.trust-row\.trust-row-four\s*\{\s*grid-template-columns:repeat\(4,minmax\(0,1fr\)\);\s*\}/);
  assert.match(css, /@media \(max-width: 1040px\)\s*\{\s*\.trust-row\.trust-row-four\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\s*\}\s*\}/);
  assert.match(css, /@media \(max-width: 620px\)\s*\{\s*\.trust-row\.trust-row-four\s*\{\s*grid-template-columns:minmax\(0,1fr\);\s*\}\s*\}/);
  assert.match(css, /@media \(max-width: 820px\)\s*\{[\s\S]*?\.v17-home-visual \{ order:-1; \}/);
  assert.match(css, /@media \(max-width: 1040px\)\s*\{[\s\S]*?\.category-grid \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\); \}/);
  assert.match(css, /@media \(max-width: 620px\)\s*\{[\s\S]*?\.category-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
});
