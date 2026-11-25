import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSettingsCurrency, resolveDeliveryCountries, readSettingsStringField, isCurrencySensitiveCoupon, CURRENCY_SENSITIVE_COUPON_WHERE } from '../src/settings-inputs.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');


test('settings draft accepts an omitted currency field by retaining the current valid currency', () => {
  assert.deepEqual(resolveSettingsCurrency({}, 'EUR'), { value: 'EUR', valid: true, supplied: false });
  assert.deepEqual(resolveSettingsCurrency({ currency: '' }, 'IQD'), { value: 'IQD', valid: true, supplied: true, blank: true });
});

test('settings reject a submitted unsupported currency instead of silently changing it', () => {
  const result = resolveSettingsCurrency({ currency: 'XXX' }, 'EUR');
  assert.equal(result.value, 'XXX');
  assert.equal(result.valid, false);
});

test('settings draft permits an explicitly empty delivery-country list while launch remains separately gated', () => {
  assert.deepEqual(resolveDeliveryCountries({ deliveryCountries: '' }, ''), {
    value: '', normalized: [], valid: true, supplied: true
  });
});

test('settings draft preserves previously configured delivery countries if an older form omits the field', () => {
  assert.deepEqual(resolveDeliveryCountries({}, 'Iraq\nSyria'), {
    value: 'Iraq\nSyria', normalized: ['Iraq', 'Syria'], valid: true, supplied: false
  });
});

test('settings reject malformed countries and duplicate/array-shaped field values', () => {
  assert.equal(resolveDeliveryCountries({ deliveryCountries: 'Iraq; Syria' }, '').valid, false);
  assert.equal(resolveDeliveryCountries({ deliveryCountries: ['Iraq', 'Syria'] }, '').valid, false);
});

test('missing delivery fee preserves current value while explicit empty fee can be handled as zero by route', () => {
  assert.deepEqual(readSettingsStringField({}, 'shippingFee', '12.50', 80), {
    value: '12.50', valid: true, supplied: false
  });
  assert.deepEqual(readSettingsStringField({ shippingFee: '' }, 'shippingFee', '12.50', 80), {
    value: '', valid: true, supplied: true
  });
  assert.equal(readSettingsStringField({ shippingFee: ['12.50'] }, 'shippingFee', '12.50', 80).valid, false);
});

test('reported Settings draft case validates with EUR already saved and no delivery countries configured', () => {
  const currency = resolveSettingsCurrency({ deliveryCountries: '' }, 'EUR');
  const countries = resolveDeliveryCountries({ deliveryCountries: '' }, '');
  assert.equal(currency.value, 'EUR');
  assert.equal(currency.valid, true);
  assert.equal(countries.value, '');
  assert.equal(countries.valid, true);
});

test('only fixed discounts and money-denominated coupon minimums require currency rescaling', () => {
  assert.equal(isCurrencySensitiveCoupon({ type: 'percent', min_subtotal_cents: 0 }), false);
  assert.equal(isCurrencySensitiveCoupon({ type: 'fixed', min_subtotal_cents: 0 }), true);
  assert.equal(isCurrencySensitiveCoupon({ type: 'percent', min_subtotal_cents: 2500 }), true);
  assert.equal(isCurrencySensitiveCoupon({ type: 'percent', minSubtotalCents: 2500 }), true);
  assert.equal(CURRENCY_SENSITIVE_COUPON_WHERE, "type = 'fixed' OR min_subtotal_cents > 0");
  const server = read('src/server.js');
  const db = read('src/db.js');
  assert.match(server, /CURRENCY_SENSITIVE_COUPON_WHERE/);
  assert.match(db, /CURRENCY_SENSITIVE_COUPON_WHERE/);
});
