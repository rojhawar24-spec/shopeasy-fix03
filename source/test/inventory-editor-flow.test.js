import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('simple products can set stock without sizes or variants', () => {
  const form = read('views/admin/product-form.ejs');
  const server = read('src/server.js');
  assert.match(form, /name="stock" required/);
  assert.match(form, /Quantity in stock/);
  assert.match(form, /You do not need to create a size to track stock/);
  assert.match(form, /Sizes and other options are only needed when customers must choose one/);
  assert.match(form, /name="variantValue"/);
  assert.match(form, /name="variantValue2"/);
  assert.match(form, /data-generate-matrix/);
  assert.match(form, /name="galleryImages"/);
  const app = read('public/js/app.js');
  assert.match(app, /variantFields\.querySelectorAll\('input,select,textarea,button'\)\.forEach\(control => \{ control\.disabled = !enabled; \}\)/);
  assert.match(server, /const stock=hasVariants\?0:parseCartQuantity\(req\.body\.stock\)/);
  assert.doesNotMatch(form, /Build any depth/);
});

test('product save refreshes stale same-origin CSRF token and server still validates it', () => {
  const form = read('views/admin/product-form.ejs');
  const app = read('public/js/app.js');
  const server = read('src/server.js');
  const security = read('src/security.js');
  assert.match(form, /data-refresh-csrf/);
  assert.match(app, /fetch\('\/session\/csrf'/);
  assert.match(server, /app\.get\('\/session\/csrf'/);
  assert.match(server, /verifyCsrf,async\(req,res\)=>/);
  assert.match(security, /timingSafeEqual/);
  assert.match(security, /Form security check expired/);
});

test('manager dashboard uses clear store-management language and real tasks', () => {
  const dashboard = read('views/admin/dashboard.ejs');
  const categories = read('views/admin/categories.ejs');
  assert.match(dashboard, /Manage your store/);
  assert.match(dashboard, /Products/);
  assert.match(dashboard, /inventory/);
  assert.doesNotMatch(categories, /Build any depth/);
});
