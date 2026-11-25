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

test('Current cart, product and checkout copy is customer-facing and retains secure actions',()=>{
  assertOrderFlowCopy();
});

test('Current cart, product and checkout copy is customer-facing and retains secure actions',()=>{
  assertOrderFlowCopy();
});

test('V8/V9 keeps readable product cards and comfortable primary mobile actions', () => {
  const css = read('test/fixtures/legacy-css/style.css');
  assert.match(css, /\.product-card-signature \.product-category \{ font-size: 11px/);
  assert.match(css, /\.product-card-signature \.product-card-meta-row \{ min-height: 24px[^}]*font-size: 12px/);
  assert.match(css, /\.product-card-signature \.product-main-cta \{ min-height: 46px[^}]*font-size: 13px/);
  assert.match(css, /\.product-card-signature \.product-main-cta \{ min-height: 44px; font-size: 12px/);
  assert.match(css, /\.product-card-signature \.product-main-cta \{ min-height: 48px; padding-inline: 11px; font-size: 14px/);
  assert.match(css, /@media \(max-width: 360px\) \{[\s\S]*?\.product-grid-signature \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.checkout-form-v5 input:not\(\[type=checkbox\]\), \.checkout-form-v5 textarea, \.checkout-form-v5 select \{ min-height: 48px; font-size: 16px/);
  assert.match(css, /:where\(a, button, input, textarea, select, summary, \[tabindex\]\):focus-visible/);
});

test('V8 copy has Sorani and Arabic translations', () => {
  const dictionary = read('public/js/i18n.js');
  for (const phrase of [
    'Add your contact details and delivery address to place your order.',
    'We use these details to process your order and arrange delivery. You can pay in cash when it arrives.',
    'The store will review your order and arrange delivery. Please pay in cash when your order arrives.',
    'By continuing, you confirm the order and any payment obligation. Card payments continue on the provider’s secure payment page; cash-on-delivery orders are paid when delivered.',
    'Explore our products, enjoy clear prices and pay on delivery.',
    'Order and delivery details',
    'Used to identify your order if you contact the store.',
    'A cancellation request is already being reviewed by the store.',
    'Track your order',
    'Order received',
    '{count} subcategory · Explore →',
    '{count} product · Explore →'
  ]) assert.ok(dictionary.includes(phrase), `Missing translation key: ${phrase}`);
  const start = dictionary.indexOf('const dictionary = ') + 'const dictionary = '.length;
  const marker = dictionary.indexOf('const normalizeWhitespace', start);
  const end = dictionary.lastIndexOf(';', marker);
  assert.ok(start > 0 && end > start, 'translation dictionary remains parseable JSON');
  const parsed = JSON.parse(dictionary.slice(start, end).trim());
  assert.deepEqual(Object.keys(parsed.en).sort(), Object.keys(parsed.ckb).sort());
  assert.deepEqual(Object.keys(parsed.en).sort(), Object.keys(parsed.ar).sort());
  for (const key of ['Add your contact details and delivery address to place your order.', 'Explore our products, enjoy clear prices and pay on delivery.']) {
    assert.notEqual(parsed.ckb[key], key);
    assert.notEqual(parsed.ar[key], key);
  }
});

test('release source contains no JavaScript debugger statements or console debug/trace/log calls', () => {
  const roots = ['src', 'public/js', 'views'];
  const files = [];
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).forEach(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(?:js|mjs|cjs|ejs)$/.test(entry.name)) files.push(rel);
  });
  roots.forEach(walk);
  const offenders = [];
  for (const file of files) {
    const source = read(file);
    if (/\bdebugger\s*;/.test(source)) offenders.push(`${file}: debugger statement`);
    if (/\bconsole\.(?:log|debug|trace)\s*\(/.test(source)) offenders.push(`${file}: debug console call`);
  }
  assert.deepEqual(offenders, []);
});
