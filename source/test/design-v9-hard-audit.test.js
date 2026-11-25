import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('V9 is the last design layer and defines a single legible retail palette', () => {
  const css = read('test/fixtures/legacy-css/style.css');
  const layer = css.lastIndexOf('ShopEasy V9 — unified visual system');
  assert.ok(layer > 0, 'V9 final design layer is present');
  const final = css.slice(layer);
  for (const rule of [
    '--accent: #4e5be8', '--accent-dark: #3442c7', '--radius-lg: 22px',
    '.product-card-signature .product-main-cta { width: 100%; min-height: 48px',
    '.btn, .btn-dark, .btn-mint, .btn-light, .btn-danger { min-height: 48px',
    '.product-card-signature .product-details-link { display: none; }',
    '@media (prefers-reduced-motion: reduce)', '@media (forced-colors: active)',
    'table { border-collapse: separate; border-spacing: 0; }'
  ]) assert.ok(final.includes(rule), `V9 rule missing: ${rule}`);
});

test('product cards expose one clear primary action; image and product name remain the detail links', () => {
  const card = read('views/partials/product-card.ejs');
  assert.match(card, /href="\/product\/<%= encodeURIComponent\(product\.slug\) %>" class="product-image"/);
  assert.match(card, /<h3 data-no-translate><a href="\/product\/<%= encodeURIComponent\(product\.slug\) %>"><%= product\.name %><\/a><\/h3>/);
  assert.match(card, /class="btn btn-dark btn-small product-main-cta"/);
  assert.doesNotMatch(card, /class="product-details-link"/);
});

test('checkout contact hints are international and do not imply guest-account recovery', () => {
  const checkout = read('views/checkout.ejs');
  assert.match(checkout, /placeholder="<%= customerText\("International number"\) %>"/);
  assert.match(checkout, /Include the full international number with country calling code\./);
  assert.match(checkout, /Used to identify your order if you contact the store\./);
  assert.doesNotMatch(checkout, /Used for order records and account recovery\./);
});

test('new checkout helper copy has matching English, Sorani, Arabic and Dutch translations', () => {
  const source = read('public/js/i18n.js');
  const start = source.indexOf('const dictionary = ') + 'const dictionary = '.length;
  const marker = source.indexOf('const normalizeWhitespace', start);
  const end = source.lastIndexOf(';', marker);
  assert.ok(start > 0 && end > start, 'dictionary block can be isolated');
  const dictionary = JSON.parse(source.slice(start, end).trim());
  for (const key of ['Used to identify your order if you contact the store.', 'Include the full international number with country calling code.', 'International number']) {
    assert.ok(dictionary.en[key]);
    assert.ok(dictionary.ckb[key] && dictionary.ckb[key] !== key);
    assert.ok(dictionary.ar[key] && dictionary.ar[key] !== key);
    assert.ok(dictionary.nl[key] && dictionary.nl[key] !== key);
  }
  assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.ckb).sort());
  assert.deepEqual(Object.keys(dictionary.en).sort(), Object.keys(dictionary.ar).sort());
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

