import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const productsView = fs.readFileSync(path.join(root, 'views/admin/products.ejs'), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))];
  assert.ok(matches.length, `Missing CSS rule: ${selector}`);
  return matches.at(-1)[1];
}

test('order timeline keeps labels and explanations on distinct readable rows', () => {
  const block = rule('.timeline-step > div');
  assert.match(block, /display:\s*grid/);
  assert.match(block, /gap:\s*var\(--space-4\)/);
  assert.match(css, /\.timeline-step > div > strong,[\s\S]*?display:\s*block/);
});

test('order product rows keep image, description and price in bounded columns', () => {
  assert.match(css, /\.order-product-row\s*\{[^}]*grid-template-columns:\s*5rem minmax\(0, 1fr\) auto/s);
  assert.match(css, /@media \(max-width: 359px\) \{[\s\S]*?\.order-product-row\s*\{[^}]*grid-template-columns:\s*3\.5rem minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.order-product-price\s*\{[^}]*white-space:\s*nowrap/s);
});

test('delivery identity and order history metadata have explicit vertical rhythm', () => {
  assert.match(rule('.delivery-person > div'), /display:\s*grid/);
  assert.match(rule('.order-history-list > li'), /display:\s*grid/);
  assert.match(rule('.order-history-list > li > div'), /display:\s*grid/);
});

test('product table identity is separated and mobile overflow is communicated accessibly', () => {
  assert.match(rule('.table-product > div'), /display:\s*grid/);
  assert.match(css, /\.table-scroll-hint\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media\s*\(max-width:\s*639px\)\s*\{[\s\S]*?\.table-scroll-hint\s*\{\s*display:\s*block/s);
  assert.match(productsView, /class="panel table-wrap admin-products-table-wrap" role="region" tabindex="0" aria-label=/);
  assert.match(productsView, /class="table-scroll-hint" role="note"/);
  for (const phrase of ['Productlijst — horizontaal scrollbaar', 'بۆ بینینی هەموو وردەکارییەکانی بەرهەم', 'مرّر أفقيًا', 'Scroll horizontally to view all product details.']) {
    assert.ok(productsView.includes(phrase), `Missing localized table accessibility copy: ${phrase}`);
  }
});

test('historic order totals keep labels and money in separate bounded columns', () => {
  assert.match(css, /\.order-total-box > div:not\(\.grand-total\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.order-total-box > div:not\(\.grand-total\) > strong\s*\{[^}]*white-space:\s*nowrap/s);
});

test('mobile Manager navigation is a single accessible horizontal strip', () => {
  assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*?\.admin-nav\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.admin-nav > \.admin-nav-group > a\s*\{[^}]*min-block-size:\s*40px/s);
});
