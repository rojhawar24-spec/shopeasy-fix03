import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currencyMinorUnitDigits, currencyMinorUnitFactor, moneyCents, formatMoneyInput } from '../src/security.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('market currency supports zero-, two- and three-decimal currencies without assuming euro cents', () => {
  assert.equal(currencyMinorUnitDigits('IQD'), 3);
  assert.equal(currencyMinorUnitFactor('IQD'), 1000);
  assert.equal(moneyCents('25', 'IQD'), 25000);
  assert.equal(moneyCents('25.00', 'IQD'), 25000);
  assert.equal(moneyCents('25.125', 'IQD'), 25125);
  const sypDigits = new Intl.NumberFormat('en', { style:'currency', currency:'SYP' }).resolvedOptions().maximumFractionDigits;
  assert.equal(currencyMinorUnitDigits('SYP'), sypDigits);
  assert.equal(moneyCents(sypDigits===0?'125':'125.50', 'SYP'), sypDigits===0?125:12550);
  assert.equal(currencyMinorUnitDigits('EUR'), 2);
  assert.equal(moneyCents('25.00', 'EUR'), 2500);
  assert.equal(currencyMinorUnitDigits('AED'), 2);
  assert.equal(moneyCents('25.00', 'AED'), 2500);
  assert.equal(currencyMinorUnitDigits('BHD'), 3);
  assert.equal(moneyCents('1.234', 'BHD'), 1234);
  assert.equal(moneyCents('1.2345', 'BHD'), null);
  assert.equal(formatMoneyInput(25000, 'IQD'), '25.000');
  assert.equal(formatMoneyInput(1234, 'BHD'), '1.234');
});

test('all manager price inputs use the selected currency precision', () => {
  const product = read('views/admin/product-form.ejs');
  const coupons = read('views/admin/coupons.ejs');
  const settings = read('views/admin/settings.ejs');
  for (const source of [product, coupons, settings]) {
    assert.match(source, /formatMoneyInput\(1,currency\)/);
  }
  assert.match(product, /data-shop-currency="<%= currency %>"/);
  assert.match(coupons, /data-coupon-currency="<%= currency %>"/);
  assert.match(read('public/js/app.js'), /maximumFractionDigits/);
});

test('currency changes with products and coupons, matching historical order currency keeps one-currency reports valid', () => {
  const server = read('src/server.js');
  const settings = read('views/admin/settings.ejs');
  const db = read('src/db.js');
  const scale = read('src/currency-scale.js');
  assert.match(server, /currencyProductsCount=Number\(productsCount\?\.c\|\|0\)/);
  assert.match(server, /currencyCouponsCount=Number\(couponsCount\?\.c\|\|0\)/);
  assert.match(server, /currencyOrdersCount=currencyOrderCurrencies\.reduce\(\(sum,row\)=>sum\+row\.count,0\)/);
  assert.match(server, /currencyChangedWithAmounts/);
  assert.match(server, /currency_price_review_required=currencyChangedWithAmounts\?'1'/);
  assert.match(server, /allowAmountRescale:true/);
  assert.doesNotMatch(server, /body\.confirmCurrencyChangeWithProducts/,'existing products/coupons must not block saving a selected currency');
  assert.match(server, /currencyChangeBlockedByOrders/,'historical orders are checked separately to avoid mixed-currency aggregates');
  assert.match(settings, /Existing order currencies:/);
  assert.match(settings, /Store currency must match every historical order currency/);
  assert.doesNotMatch(settings, /currencyChangeBlockedByOrders\?'disabled aria-disabled="true"'/, 'currency selector stays enabled to correct a legacy currency mismatch');
  assert.match(settings, /fixed coupon values and coupon minimum-order amounts/);
  assert.match(settings, /EUR 89\.00 is scaled to IQD 89\.000/);
  assert.doesNotMatch(settings, /name="confirmCurrencyChangeWithProducts"/);
  assert.match(db, /rescaleMinorUnitAmount/);
  assert.match(db, /UPDATE coupons SET value=\?,min_subtotal_cents=\? WHERE id=\?/);
  assert.doesNotMatch(db, /CURRENCY_LOCKED/);
  assert.match(db, /CURRENCY_CHANGE_HAS_ORDERS/);
  assert.match(db, /await tx\.commit\(\)/);
  assert.match(db, /await tx\.rollback\(\)/);
  assert.match(scale, /CURRENCY_SCALE_OVERFLOW/);
  const saveStart=db.indexOf('export async function saveStoreSettingsWithCurrency');
  const saveEnd=db.indexOf('export async function createAudit',saveStart);
  const transactionSave=db.slice(saveStart,saveEnd);
  assert.doesNotMatch(transactionSave,/Promise\.all/,'transaction statements must run sequentially on one connection');
});

test('policy content is stored separately per locale and fallback is disclosed to customers', () => {
  const server = read('src/server.js');
  const settings = read('views/admin/settings.ejs');
  const policy = read('views/policy.ejs');
  const checkout = read('views/checkout.ejs');
  for (const code of ['privacy','terms','shipping','returns']) {
    assert.match(server, new RegExp(`${code}:\\{en:cleanText`));
  }
  assert.match(server, /entries\[`\$\{baseKey\}_ckb`\]/);
  assert.match(server, /entries\[`\$\{baseKey\}_ar`\]/);
  assert.match(server, /entries\[`\$\{baseKey\}_nl`\]/);
  assert.match(settings, /def\.base\+\(locale\.code==='ckb'\?'Ckb':locale\.code==='nl'\?'Nl':locale\.code==='fr'\?'Fr':'Ar'\)/);
  assert.match(settings, /policyLocales\.forEach/);
  assert.match(policy, /policyFallback/);
  assert.match(checkout, /termsFallback/);
});

test('customer cancellation requires ownership and stock release happens once in a write transaction', () => {
  const server = read('src/server.js');
  const db = read('src/db.js');
  assert.match(server, /app\.post\('\/account\/order\/:id\/cancel',requireAuth/);
  assert.match(server, /order\.user_id!==req\.user\.id/);
  assert.match(server, /app\.post\('\/checkout\/success\/cancel'/);
  assert.match(server, /guestOrderTokenMatches\(order,req\.cookies/);
  assert.match(db, /async function cancelOpenOrder/);
  assert.match(db, /const tx = await db\.transaction\('write'\)/);
  assert.match(db, /WHERE id=\? AND status IN \(\$\{placeholders\}\)/);
  assert.match(db, /reserved_stock=reserved_stock-\?/);
  assert.match(db, /if\(released\.changes!==1\) throw new Error\('STOCK_INTEGRITY'\)/);
});

test('customer and manager interfaces distinguish cancellation requests from actual cancellation', () => {
  const order = read('views/order.ejs');
  const success = read('views/success.ejs');
  const managerOrder = read('views/admin/order-cash.ejs');
  assert.match(order, /Request cancellation/);
  assert.match(success, /Request cancellation/);
  assert.match(managerOrder, /Approve cancellation/);
  assert.match(managerOrder, /Reject request/);
});

test('product detail provides currency-aware Product/ProductGroup structured data', () => {
  const server = read('src/server.js');
  const structured = read('src/product-structured-data.js');
  const header = read('views/partials/header.ejs');
  assert.match(server, /buildProductStructuredData/);
  assert.match(server, /selectedVariantId/);
  assert.match(structured, /priceCurrency: currency/);
  assert.match(structured, /schema\.org\/InStock/);
  assert.match(structured, /@type': 'ProductGroup/);
  assert.match(structured, /variesBy/);
  assert.match(structured, /searchParams\.set\('variant'/); // Preserve an existing ?lang query while adding the selected variant.
  assert.match(server, /productJsonLdSafe/);
  assert.match(header, /application\/ld\+json/);
});

test('delivery fee is added once per order and zero is explicitly supported', () => {
  const server = read('src/server.js');
  const db = read('src/db.js');
  const settings = read('views/admin/settings.ejs');
  assert.match(db, /const itemsAfterDiscount = subtotal - automaticDiscount - bundleDiscount - couponDiscount/);
  assert.match(db, /const couponBase = subtotalBeforeAutomaticDiscount - automaticDiscount - bundleDiscount/);
  assert.match(server, /const shippingFeeCents=moneyCents\(effectiveShippingFeeInput,currency\)/);
  assert.match(server, /const effectiveShippingFeeInput=currency!==oldCurrency\?'0':\(submittedShippingFee\.value\|\|'0'\)/);
  assert.match(settings, /Delivery fee per order/);
  assert.match(settings, /Enter 0 for free delivery/);
});

test('minor-unit rescaling for currency changes is exact by precision and clearly not FX conversion', async () => {
  const { rescaleMinorUnitAmount } = await import('../src/currency-scale.js');
  assert.equal(rescaleMinorUnitAmount(8900, 'EUR', 'IQD'), 89000);
  assert.equal(rescaleMinorUnitAmount(89000, 'IQD', 'EUR'), 8900);
  assert.equal(rescaleMinorUnitAmount(1234, 'BHD', 'EUR'), 123);
  assert.equal(rescaleMinorUnitAmount(null, 'EUR', 'IQD'), null);
  assert.equal(rescaleMinorUnitAmount(1, 'EUR', 'IQD', { minPositive:true }), 10);
  assert.throws(() => rescaleMinorUnitAmount(-1, 'EUR', 'IQD'), /CURRENCY_SCALE_OVERFLOW/);
  assert.throws(() => rescaleMinorUnitAmount(Number.MAX_SAFE_INTEGER + 1, 'EUR', 'IQD'), /CURRENCY_SCALE_OVERFLOW/);
});

import { parseShippingZoneRules, parseTaxRules, selectCommerceRule, calculateConfiguredTax } from '../src/commerce-rules.js';

test('regional delivery rules select the most specific city and postal prefix without changing the base fee fallback', () => {
  const parsed = parseShippingZoneRules([
    'Belgium | * | * | 5.00',
    'Belgium | Brussels | 10 | 2.50',
    'Belgium | Brussels | 1000 | 1.25'
  ].join('\n'), 'EUR', ['Belgium']);
  assert.equal(parsed.valid, true, parsed.errors.join('; '));
  assert.equal(selectCommerceRule(parsed.rules, { country:'Belgium', city:'Brussels', postalCode:'1000' }).feeCents, 125);
  assert.equal(selectCommerceRule(parsed.rules, { country:'Belgium', city:'Brussels', postalCode:'1090' }).feeCents, 250);
  assert.equal(selectCommerceRule(parsed.rules, { country:'Belgium', city:'Ghent', postalCode:'9000' }).feeCents, 500);
  assert.equal(selectCommerceRule(parsed.rules, { country:'France', city:'Paris', postalCode:'75001' }), null);
});

test('regional tax rules are explicit seller input, require a matching destination, and calculate tax deterministically', () => {
  const empty = parseTaxRules('', ['Belgium']);
  assert.equal(empty.valid, true);
  assert.equal(selectCommerceRule(empty.rules, { country:'Belgium', city:'Brussels', postalCode:'1000' }), null, 'empty rules must not infer a tax rate');
  const parsed = parseTaxRules([
    'Belgium | * | * | 6 | no',
    'Belgium | Brussels | 10 | 21 | yes',
    'Belgium | Brussels | 1000 | 12.5 | no'
  ].join('\n'), ['Belgium']);
  assert.equal(parsed.valid, true, parsed.errors.join('; '));
  const specific = selectCommerceRule(parsed.rules, { country:'Belgium', city:'Brussels', postalCode:'1000' });
  assert.equal(specific.rateBps, 1250);
  assert.equal(specific.shippingTaxable, false);
  assert.equal(calculateConfiguredTax({ taxableItemsCents:10000, shippingCents:500, rateBps:2100, includesTax:false, shippingTaxable:true }), 2205);
  assert.equal(calculateConfiguredTax({ taxableItemsCents:10000, shippingCents:500, rateBps:2100, includesTax:true, shippingTaxable:true }), 1822);
  assert.equal(selectCommerceRule(parsed.rules, { country:'France', city:'Paris', postalCode:'75001' }), null);
});

test('regional fee and tax rules reject invalid, duplicate, or unapproved destination rules', () => {
  assert.equal(parseShippingZoneRules('France | * | * | 2.00', 'EUR', ['Belgium']).valid, false);
  assert.equal(parseShippingZoneRules('Belgium | * | * | -1', 'EUR', ['Belgium']).valid, false);
  assert.equal(parseTaxRules('Belgium | * | * | 101 | no', ['Belgium']).valid, false);
  assert.equal(parseTaxRules('Belgium | * | * | 21 | maybe', ['Belgium']).valid, false);
  assert.equal(parseTaxRules('Belgium | * | * | 21 | no\nBelgium | * | * | 6 | yes', ['Belgium']).valid, false);
});
