import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertDesignDelivery } from './helpers/design-delivery-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function allEjs(dir = path.join(root, 'views')) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...allEjs(full));
    else if (entry.isFile() && entry.name.endsWith('.ejs')) found.push(full);
  }
  return found;
}

test('Manager settings and customer order templates have syntactically balanced EJS and JS', () => {
  const proc = spawnSync(process.execPath, ['scripts/template-audit.mjs'], { cwd: root, encoding: 'utf8', timeout: 30000 });
  assert.equal(proc.status, 0, `${proc.stdout}\n${proc.stderr}`);
  assert.ok(allEjs().some(file => path.relative(root,file)==='views/partials/ui-icon.ejs'), 'the new controlled icon partial is included in the real template inventory');
  assert.match(proc.stdout, new RegExp(`\\b${allEjs().length} EJS templates inspected\\b`));
});

test('Manager bank-transfer status expression is correctly closed', () => {
  const settings = read('views/admin/settings.ejs');
  assert.match(settings, /class="integration <%= bankTransferReady\?'highlight':'' %>"/);
});

test('order cancellation text uses valid JavaScript string syntax for apostrophes', () => {
  const source = read('views/order.ejs');
  assert.match(source, /:"Your cancellation request is waiting for the store's decision\."\) %>/);
});

test('no EJS template contains an inline style attribute under strict CSP', () => {
  for (const file of allEjs()) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\sstyle\s*=/i, path.relative(root, file));
  assert.match(read('views/admin/gift-cards.ejs'), /class="gift-card-code-wrap"/);
  assert.match(read('public/css/app.css'), /\.gift-card-code-wrap\s*\{/);
});

test('all referenced local CSS files in the page head exist', () => {
  assertDesignDelivery();
});

test('automatic discounts, bundle discounts and coupons cannot be subtracted in the wrong order', () => {
  const db = read('src/db.js');
  assert.match(db, /const couponBase = subtotalBeforeAutomaticDiscount - automaticDiscount - bundleDiscount;/);
  assert.match(db, /couponDiscount = Math\.min\(couponDiscount, couponBase\);/);
  assert.match(db, /const itemsAfterDiscount = subtotal - automaticDiscount - bundleDiscount - couponDiscount;/);
});

test('checkout has explicit payment obligation labels in Dutch, English and French', () => {
  const checkout = read('views/checkout.ejs');
  assert.match(checkout, /Order with obligation to pay/);
  assert.match(checkout, /Bestelling met betalingsverplichting/);
  assert.match(checkout, /Commande avec obligation de paiement/);
});

test('supported UI locales include the five configured languages', () => {
  assert.match(read('src/store-config.js'), /Object\.freeze\(\['en', 'ckb', 'ar', 'nl', 'fr'\]\)/);
});
