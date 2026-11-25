import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('product detail prioritizes the real product image and removes fake zoom affordance', () => {
  const product = read('views/product.ejs');
  const css = read('test/fixtures/legacy-css/style.css');
  assert.match(product, /product-visual-v5 product-visual-v6/);
  assert.match(product, /data-product-main-image/);
  assert.doesNotMatch(product, /media-zoom-hint|media-caption|class="media-kicker"/);
  assert.match(css, /\.product-visual-v6 img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.product-copy-v6 h1\s*\{[^}]*font-size:/s);
  assert.match(css, /\.btn-v5-buy\s*\{[^}]*min-height:\s*58px/s);
});

test('checkout has a visible selected COD method and item thumbnails with server-calculated totals', () => {
  const checkout = read('views/checkout.ejs');
  const css = read('public/css/app.css');
  assert.match(checkout, /class="payment-choice/);
  assert.match(checkout, /aria-labelledby="payment-method-heading"/);
  assert.match(checkout, /id="payment-method-title"><%= customerText\("Cash on delivery"\) %>/);
  assert.match(checkout, /safeImageUrl\(i\.product\.image_url\)/);
  assert.match(checkout, /formatPrice\(i\.total,currency\)/);
  assert.match(checkout, /action="\/checkout"/);
  assert.match(checkout, /class="btn btn-mint btn-wide checkout-place-order"/);
  assert.match(checkout, /class="checkout-place-total"><%= formatPrice\(summary.total,currency\) %>/);
  assert.match(css, /\.payment-choice\s*\{/);
  assert.match(css, /\.checkout-summary-item\s*\{/);
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('checkout and product templates keep the existing POST routes and CSRF fields', () => {
  const product = read('views/product.ejs');
  const checkout = read('views/checkout.ejs');
  const cart = read('views/cart.ejs');
  assert.match(product, /method="post" action="\/cart\/add"/);
  assert.match(product, /name="_csrf"/);
  assert.match(checkout, /method="post" action="\/checkout"/);
  assert.match(checkout, /name="_csrf"/);
  assert.match(cart, /href="\/checkout"/);
  assert.match(cart, /formatPrice\(total,currency\)/);
});
