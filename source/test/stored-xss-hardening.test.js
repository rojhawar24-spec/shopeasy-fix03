import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../src/security.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('HTML escaping neutralizes tag, attribute, ampersand and quote injection', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert(1)"> & 'x'`),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;x&#39;'
  );
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(42), '42');
});

test('all raw category option builders escape category names and slugs', () => {
  const categories = read('views/admin/categories.ejs');
  const productForm = read('views/admin/product-form.ejs');
  const shop = read('views/shop.ejs');
  const server = read('src/server.js');
  assert.match(server, /app\.locals\.escapeHtml = escapeHtml/, 'Express must expose the escaping helper to rendered templates');
  assert.match(server, /res\.locals\.escapeHtml = escapeHtml/, 'explicit render locals must also contain the escaping helper');
  assert.match(categories, /escapeHtml\(c\.name\)/, 'manager parent selector must escape stored category names');
  assert.match(productForm, /escapeHtml\(c\.name\)/, 'product form category selector must escape stored category names');
  assert.match(shop, /escapeHtml\(c\.name\)/, 'public category selector must escape stored category names');
  assert.match(shop, /value=\"\$\{escapeHtml\(c\.slug\)\}\"/, 'public category selector must escape the option value');
  assert.doesNotMatch(categories, /\$\{c\.name\}<\/option>/, 'unescaped category name is forbidden in raw HTML');
  assert.doesNotMatch(productForm, /\$\{c\.name\}<\/option>/, 'unescaped category name is forbidden in raw HTML');
  assert.doesNotMatch(shop, /\$\{c\.name\}<\/option>/, 'unescaped category name is forbidden in raw HTML');
  assert.match(categories, /seen\.has\(childId\)/, 'descendant scan must stop if legacy category data contains a cycle');
  assert.match(categories, /parentOptions\(parentId,depth,seen=new Set\(\)\)/, 'category parent choices must be cycle-safe');
  assert.match(productForm, /productCategoryOptions\(parentId,depth,seen=new Set\(\)\)/, 'product category choices must be cycle-safe');
  assert.match(shop, /shopCategoryOptions\(parentId,depth,seen=new Set\(\)\)/, 'shop category filter must be cycle-safe');
});

test('wishlist failures can display feedback on product detail and product cards', () => {
  const app = read('public/js/app.js');
  assert.match(app, /button\.closest\('\.product-card, \.product-detail'\)/);
  assert.match(app, /feedbackScope\.matches\('\.product-card'\)\) feedbackScope\.append\(feedback\)/);
  assert.match(app, /button\.insertAdjacentElement\('afterend', feedback\)/);
  assert.match(app, /Could not update wishlist\. Please try again\./);
});
