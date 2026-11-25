import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const luminance = hex => {
  const channels = hex.replace('#', '').match(/.{2}/g).map(pair => parseInt(pair, 16) / 255);
  const [r, g, b] = channels.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (foreground, background) => {
  const [high, low] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('V10 uses a consistent high-contrast palette and readable sizing for retail actions', () => {
  const css = read('test/fixtures/legacy-css/design-v10.css');
  for (const rule of [
    '--accent: #354cc9', '--accent-dark: #263aa8', '--bg: #f6f7fb',
    '.product-card-signature h3 {', 'font-size: 16px',
    '.product-card-signature .product-main-cta {', 'min-height: 46px',
    '.checkout-place-order {', '.admin-nav a {',
    '@media (max-width: 760px)', '@media (max-width: 480px)',
    '@media (prefers-reduced-motion: reduce)', '@media (forced-colors: active)',
    ':focus-visible'
  ]) assert.ok(css.includes(rule), `V10 design rule missing: ${rule}`);
  assert.doesNotMatch(css, /font-size:\s*[1-9]px\s*;/, 'V10 must not introduce tiny sub-10px text');
  assert.ok(contrast('#ffffff', '#354cc9') >= 4.5, 'white primary-button text should meet 4.5:1 contrast');
  assert.ok(contrast('#ffffff', '#263aa8') >= 4.5, 'white hover-button text should meet 4.5:1 contrast');
  assert.ok(contrast('#58657a', '#ffffff') >= 4.5, 'muted text on white should meet 4.5:1 contrast');
});

test('V10 retains responsive layouts and RTL support across shopping and administration', () => {
  const css = read('test/fixtures/legacy-css/design-v10.css');
  for (const selector of [
    '.hero {', '.category-grid {', '.product-grid, .product-grid-signature',
    '.shop-controls {', '.product-detail-v5 {', '.cart-layout-v5', '.checkout-layout-v5',
    '.checkout-summary-v5', '.auth-card', '.order-status-panel', '.admin-grid',
    '.admin-nav', '.table-wrap', '.mobile-bottom-nav', 'html[dir="rtl"]'
  ]) assert.ok(css.includes(selector), `V10 surface rule missing: ${selector}`);
  assert.match(css, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /html\[lang\^="ckb"\] body, html\[lang="ar"\] body/);
  assert.match(css, /@media \(max-width: 1020px\)[\s\S]*?\.menu-toggle \{ display: inline-flex/);
  assert.match(css, /\.nav-links\.open \{ display: flex; \}/);
  assert.match(css, /\.mobile-search \{ display: block; \}/);
});

test('V10 is visual-only and does not alter server routes, price or cash-on-delivery behavior', () => {
  const header = read('views/partials/header.ejs');
  const checkout = read('views/checkout.ejs');
  const product = read('views/partials/product-card.ejs');
  assert.match(header, /action="\/language"/);
  assert.match(checkout, /action="\/checkout"/);
  assert.match(checkout, /name="_csrf"/);
  assert.match(product, /href="\/product\/<%= encodeURIComponent\(product\.slug\) %>"/);
  assert.match(product, /product-main-cta/);
  assert.doesNotMatch(product, /action="\/cart\/add"/);
  assert.match(product, /app\.locals\.effectivePrice\(product\)/);
  assert.match(read('src/server.js'), /Cash on delivery|cash-on-delivery|cash_on_delivery/i);
});
