import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLaunchReadiness } from '../src/launch-gate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('draft settings do not require products, delivery countries or complete policies to save', () => {
  const route = read('src/server.js');
  const view = read('views/admin/settings.ejs');
  assert.match(route, /Incomplete business details, missing products, and missing delivery countries may be saved as a draft; launch requirements block checkout, not saving/);
  assert.match(view, /not before you save a draft/i);
  assert.match(view, /missing product, country or policy keeps checkout closed/i);
  assert.match(route, /saveStoreSettingsWithCurrency\(settingsEntries/);
});

test('currency can change with catalogue/coupons and must match every historical order currency', () => {
  const route = read('src/server.js');
  const db = read('src/db.js');
  assert.match(route, /currencyChangeNeedsReview=currencyProductsCount>0\|\|currencyCouponsCount>0/);
  assert.match(route, /allowAmountRescale:true/);
  assert.match(db, /SELECT UPPER\(currency\) AS currency,COUNT\(\*\) AS c FROM orders GROUP BY UPPER\(currency\)/);
  assert.match(db, /orderCurrencies\.some\(row=>String\(row\.currency\|\|''\)\.toUpperCase\(\)!==newCode\)/);
  assert.match(db, /rescaleMinorUnitAmount\(product\.price_cents,oldCode,newCode\)/);
  assert.match(db, /const changeNeedsPriceReview=newCode!==oldCode&&\(scaledProductCount>0\|\|scaledCouponCount>0\)/);
  assert.match(route, /currencyChangeBlockedByOrders/);
});

test('Standard and simplified COD setup have materially different launch gates', () => {
  const gate = read('src/launch-gate.js');
  const settings = read('views/admin/settings.ejs');
  const app = read('public/js/app.js');
  assert.match(gate, /setupMode\s*===\s*SIMPLIFIED_COD_MODE/);
  assert.match(gate, /minimumCustomerTermsLength/);
  assert.match(gate, /enterpriseNumber/);
  assert.match(settings, /data-market-setup-summary="standard"/);
  assert.match(settings, /data-market-setup-summary="simplified_cod"/);
  assert.match(app, /updateMarketSetupPreview/);
  assert.match(app, /summary\.hidden = summary\.dataset\.marketSetupSummary !== mode/);
  assert.match(app, /marketSetupRequiredIndicators/);
  assert.match(app, /policyProfileNotes/);
});

test('profile selection changes launch readiness in real decision logic', () => {
  const shared = {
    storeName: 'Demo shop', supportEmail: 'shop@example.com', businessPhone: '+32123456789',
    shippingConfigured: true, deliveryCountriesConfigured: true, sellableProductCount: 1,
    currencyReviewComplete: true
  };
  assert.equal(evaluateLaunchReadiness({ ...shared, mode: 'simplified_cod', policies: { terms: 'Clear customer terms of more than twenty chars.' } }), true);
  assert.equal(evaluateLaunchReadiness({ ...shared, mode: 'standard', policies: { terms: 'Clear customer terms of more than twenty chars.' } }), false);
  assert.equal(evaluateLaunchReadiness({ ...shared, mode: 'standard', legalName: 'Demo Ltd', businessAddress: '1 Demo Street', enterpriseNumber: 'REG-123', pricesIncludeTax: true, policies: true }), true);
});

test('product deletion is direct only with no order history/reservation; history-safe archive/restore remains', () => {
  const db = read('src/db.js');
  const route = read('src/server.js');
  const view = read('views/admin/products.ejs');
  assert.match(db, /export async function permanentlyDeleteProduct\(id\)/);
  assert.match(db, /PRODUCT_HAS_RESERVED_STOCK/);
  assert.match(db, /PRODUCT_HAS_ORDER_HISTORY/);
  assert.match(db, /SELECT id,cart_json,wishlist_json FROM sessions/);
  assert.match(db, /const nextCart = cart\.filter/);
  assert.match(db, /const nextWishlist = wishlist\.filter/);
  assert.match(db, /NOT EXISTS\(SELECT 1 FROM order_items oi WHERE oi\.product_id=products\.id\)/);
  assert.match(db, /export async function permanentlyDeleteArchivedProduct\(id\)/);
  assert.match(route, /app\.post\('\/admin\/products\/delete'/);
  assert.match(view, /Delete permanently/);
  assert.match(view, /p\.order_item_count\|\|0\)===0/);
  assert.match(view, /p\.reserved_inventory_total \?\? p\.reserved_stock/);
  assert.match(view, /Restore/);
});


test('uploaded-image cleanup retains assets still referenced by products, stories or categories', () => {
  const server = read('src/server.js');
  const start = server.indexOf('async function uploadedAssetIsReferenced(value, tx = null) {');
  const end = server.indexOf('async function safeProductImage(req) {', start);
  assert.ok(start >= 0 && end > start, 'shared uploaded-asset cleanup helper must exist');
  const cleanup = server.slice(start, end);
  for (const table of ['products', 'stories', 'categories']) assert.match(cleanup, new RegExp(`FROM ${table} WHERE image_url=\?`));
  assert.match(cleanup, /if\(await uploadedAssetIsReferenced\(value\)\) return/);
  assert.match(cleanup, /const tx=await db\.transaction\('write'\)/);
  assert.match(cleanup, /uploadedAssetIsReferenced\(value,tx\)/);
});

test('admin-facing revised copy is provided in English, Sorani, Arabic and Dutch dictionaries', () => {
  const main = read('public/js/i18n.js');
  const ckb = read('public/js/i18n-ckb.js');
  const ar = read('public/js/i18n-ar.js');
  const nl = read('public/js/i18n-nl.js');
  for (const phrase of ['Preview: Standard / full setup','Preview: Simplified local cash-on-delivery','Permanently delete this product? This cannot be undone. Products with order history must be retained.','LAUNCH CHECK · affects checkout only, not saving settings']) {
    assert.ok(main.includes(phrase), `main dictionary missing ${phrase}`);
    assert.ok(ckb.includes(phrase), `Sorani dictionary missing ${phrase}`);
    assert.ok(ar.includes(phrase), `Arabic dictionary missing ${phrase}`);
  }
});
