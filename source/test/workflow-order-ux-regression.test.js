import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('COD order details show absolute store-local date and relative time together',()=>{
  const detail=read('views/admin/order-cash.ejs');
  assert.match(detail,/formatDateTimeDisplay\(order\.created_at,storeTimeZone\) %>\s*·\s*<%= formatRelativeTime\(order\.created_at\) %>/);
});

test('manager overview explains the settings/products/currency workflow and shows placed time',()=>{
  const dashboard=read('views/admin/dashboard.ejs');
  assert.match(dashboard,/A missing product, country or policy keeps checkout closed/);
  assert.match(dashboard,/Review store settings/);
  assert.match(dashboard,/Add your first product/);
  assert.match(dashboard,/formatDateTimeDisplay\(o\.created_at,storeTimeZone\)/);
  assert.match(dashboard,/Manage order →/);
});

test('product edit warns about mandatory price review after a currency change',()=>{
  const view=read('views/admin/product-form.ejs'),server=read('src/server.js');
  assert.match(view,/currencyPriceReviewRequiredSafe=typeof currencyPriceReviewRequired!=='undefined'&&Boolean\(currencyPriceReviewRequired\)/, 'product form safely normalizes an optional currency-review local');
  assert.match(view,/if\(currencyPriceReviewRequiredSafe\)/, 'currency-review warning uses the safe local in normal and error renders');
  assert.match(view,/Checkout is disabled until you review the new-currency amounts/);
  assert.match(view,/Store currency/);
  assert.match(server,/currencyPriceReviewRequired:await getSetting\('currency_price_review_required','0'\)==='1'/);
});

test('legacy pending orders have an explicit, guarded COD acceptance action and cancellation action',()=>{
  const detail=read('views/admin/order.ejs'),db=read('src/db.js'),server=read('src/server.js');
  assert.match(detail,/action="\/admin\/orders\/confirm-legacy-cod"/);
  assert.match(detail,/reconcile-mollie-payment/);
  assert.match(detail,/Cancel legacy order/);
  assert.doesNotMatch(detail, /Cancel pending order &amp; release stock/);
  assert.match(db,/export async function confirmLegacyPendingOrderAsCod/);
  assert.match(db,/LEGACY_ORDER_HAS_PAYMENT_DETAILS/);
  assert.match(db,/LEGACY_ORDER_RESERVATION_UNSAFE/);
  assert.match(server,/app\.post\('\/admin\/orders\/confirm-legacy-cod',requireManager,verifyCsrf/);
});

test('checkout clearly explains an empty delivery-country allow-list and disables its selector',()=>{
  const checkout=read('views/checkout.ejs'),server=read('src/server.js');
  assert.match(checkout,/This store is still getting ready and cannot take orders yet/);
  assert.match(checkout,/deliveryCountries\.length===0\?'disabled':''/);
  assert.match(server,/if\(!matchedCountry\) return res\.status\(400\)/);
});

test('new manager workflow uses existing localized setup and currency-review phrases',()=>{
  const main=read('public/js/i18n.js'),ckb=read('public/js/i18n-ckb.js'),ar=read('public/js/i18n-ar.js');
  for(const phrase of ['A missing product, country or policy keeps checkout closed. It must never prevent you from saving business details and configuration drafts.','Checkout is disabled until you review the new-currency amounts.']) { assert.ok(main.includes(phrase)); assert.ok(ckb.includes(phrase)); assert.ok(ar.includes(phrase)); }
});
