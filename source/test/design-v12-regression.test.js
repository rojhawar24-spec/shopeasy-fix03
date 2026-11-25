import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('admin action controls no longer turn table cells into flex columns', () => {
  const css = read('test/fixtures/legacy-css/style.css') + '\n' + read('test/fixtures/legacy-css/design-v12.css');
  assert.match(css, /td\.table-actions\s*\{[^}]*display:\s*table-cell\s*!important/s);
  assert.match(css, /\.table-action-group\s*\{[^}]*display:\s*flex/s);
  for (const file of ['views/admin/products.ejs', 'views/admin/categories.ejs', 'views/admin/stories.ejs', 'views/admin/coupons.ejs']) {
    const view = read(file);
    assert.match(view, /<td class="table-actions">\s*(?:<span class="table-mobile-label">[\s\S]*?<\/span>\s*)?<div class="table-action-group">/s, `${file} must keep actions inside the action cell`);
    assert.match(view, /<\/div>\s*<\/td>/s, `${file} must close its action group inside the table cell`);
  }
  const products = read('views/admin/products.ejs');
  assert.match(products, /<colgroup>[\s\S]*products-col-actions/);
  assert.match(products, /manager-price-details/);
  assert.match(products, /manager-stock-count/);
  assert.doesNotMatch(products, /No completed sales yet/);
});

test('Current cart, product and checkout copy is customer-facing and retains secure actions',()=>{
  assertOrderFlowCopy();
});

test('successful Add to cart returns to a safe shopping page with a success notice', () => {
  const server = read('src/server.js');
  const start = server.indexOf("app.post('/cart/add'");
  const end = server.indexOf("app.post('/cart/update'", start);
  const route = server.slice(start, end);
  assert.match(route, /await commitCartIntent\(req,cart=>/);
  assert.match(route, /if\(existing\)existing\.quantity=nextQty/);
  assert.match(route, /return res\.redirect\(303,cartAddReturnPath\(req,p\.slug\)\);/);
  assert.match(server,/function cartAddReturnPath\(req,slug\)/);
  assert.match(server,/u\.searchParams\.set\('added','1'\)/);
  assert.match(server,/const allowed=u\.pathname==='\/' \|\| u\.pathname==='\/shop'/);
  assert.match(read('views/product.ejs'),/Added to your bag/);
  assert.match(read('views/shop.ejs'),/Continue shopping/);
  assert.match(read('views/home.ejs'),/View bag/);
  assert.match(read('views/product.ejs'), /method="post" action="\/cart\/add"/);
  assert.match(read('views/partials/product-card.ejs'), /href="\/product\//);
  assert.match(read('views/partials/product-card.ejs'), /View product/);
  assert.doesNotMatch(read('views/partials/product-card.ejs'), /action="\/cart\/add"/);
});

test('cart and checkout render every distinct cart line so multiple products are purchased together', () => {
  const cart = read('views/cart.ejs');
  const checkout = read('views/checkout.ejs');
  const server = read('src/server.js');
  assert.match(cart, /items\.forEach\(i=>/);
  assert.match(cart, /i\.product\.id/);
  assert.match(cart, /formatPrice\(total,currency\)/);
  assert.match(checkout, /summary\.items\.forEach\(i=>/);
  assert.match(checkout, /summary\.items\.reduce\(\(count,item\)=>count\+Number\(item\.quantity\|\|0\),0\)/);
  assert.match(server, /createOrderAtomic\(\{[\s\S]*items:summary\.items/);
  assert.match(server, /cart\.push\(\{productId:id,/);
});
