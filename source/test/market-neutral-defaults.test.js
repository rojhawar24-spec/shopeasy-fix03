import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertDesignDelivery} from './helpers/design-delivery-contract.mjs';
import { DEFAULT_STORE_NAME, DEFAULT_STORE_CURRENCY, DEFAULT_STORE_TIMEZONE, DEFAULT_UI_LOCALE, getStoreName, getDefaultUiLocale, getStoreTimezone, getIntlLocaleForUi } from '../src/store-config.js';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('fresh installs use neutral defaults and leave client market details configurable', () => {
  assert.equal(DEFAULT_STORE_NAME, 'ShopEasy Store');
  assert.equal(DEFAULT_STORE_CURRENCY, 'EUR');
  assert.equal(DEFAULT_STORE_TIMEZONE, 'UTC');
  assert.equal(DEFAULT_UI_LOCALE, 'en');
  for (const file of ['.env.example', 'wrangler.jsonc', 'wrangler.staging.jsonc']) {
    const text = read(file);
    assert.match(text, /STORE_NAME["=:\s]+["']?ShopEasy (?:Store|Test Store)/);
    assert.match(text, /STORE_CURRENCY["=:\s]+["']?EUR/);
    assert.match(text, /DEFAULT_LOCALE["=:\s]+["']?en/);
    assert.match(text, /STORE_TIMEZONE["=:\s]+["']?UTC/);
  }
});

test('store config normalizes blank/invalid values without hard-wiring a country', () => {
  assert.equal(getStoreName(''), DEFAULT_STORE_NAME);
  assert.equal(getStoreName('  Example Boutique  '), 'Example Boutique');
  assert.equal(getDefaultUiLocale('AR'), 'ar');
  assert.equal(getDefaultUiLocale('ckb'), 'ckb');
  assert.equal(getDefaultUiLocale('nl'), 'nl');
  assert.equal(getIntlLocaleForUi('nl'), 'nl-BE');
  assert.equal(getStoreTimezone(''), 'UTC');
  assert.equal(getStoreTimezone('not/a-time-zone'), 'UTC');
  assert.equal(getStoreTimezone('Europe/Brussels'), 'Europe/Brussels');
  assert.equal(getStoreTimezone('Asia/Baghdad'), 'Asia/Baghdad');
});

test('selected UI language does not force a country-specific region', () => {
  assert.equal(getIntlLocaleForUi('en'), 'en-GB');
  assert.equal(getIntlLocaleForUi('ar'), 'ar');
  assert.equal(getIntlLocaleForUi('ckb'), 'ckb');
  const server = read('src/server.js');
  const db = read('src/db.js');
  const header = read('views/partials/header.ejs');
  const checkout = read('views/checkout.ejs');
  assert.match(server, /getStoreTimezone\(process\.env\.STORE_TIMEZONE\)/);
  assert.match(server, /getIntlLocaleForUi\(locale\)/);
  assert.match(db, /getStoreName\(process\.env\.STORE_NAME\)/);
  assertDesignDelivery();
  assert.doesNotMatch(server + db + header + checkout, /لمسة للجمال|iraq-beauty\.css|Asia\/Baghdad|\+964/);
});

test('generic preview explains sample products/prices and avoids a fixed market identity', () => {
  const preview = read('PREVIEW.html');
  assert.match(preview, /lang="en-GB" dir="ltr"/);
  assert.match(preview, /Static preview only/);
  assert.match(preview, /sample products and EUR prices/);
  assert.match(preview, /Before launch:.*configure your shop name/s);
  for (const item of ['Accessories','Home','Everyday items','Technology']) assert.ok(preview.includes(item));
  assert.doesNotMatch(preview, /لمسة للجمال|Iraq|Baghdad|IQD|perfume|skincare|ar-IQ/);
});
