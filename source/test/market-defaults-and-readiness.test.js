import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatDateTimeDisplay, formatDateTimeLocal, dateTimeLocalToISOString } from '../src/security.js';
import { DEFAULT_STORE_TIMEZONE, getIntlLocaleForUi, getStoreTimezone } from '../src/store-config.js';
import { evaluateLaunchReadiness } from '../src/launch-gate.js';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('store time helpers default to UTC and accept an explicitly configured market time zone', () => {
  assert.equal(DEFAULT_STORE_TIMEZONE, 'UTC');
  assert.equal(getStoreTimezone(''), 'UTC');
  assert.equal(getStoreTimezone('Europe/Brussels'), 'Europe/Brussels');
  const instant = '2026-01-15T12:00:00.000Z';
  assert.equal(formatDateTimeLocal(instant), '2026-01-15T12:00');
  assert.equal(dateTimeLocalToISOString('2026-01-15T12:00'), instant);
  assert.match(formatDateTimeDisplay(instant, undefined, 'en-GB'), /12:00/);
  assert.equal(formatDateTimeLocal(instant, 'Asia/Baghdad'), '2026-01-15T15:00');
  assert.equal(dateTimeLocalToISOString('2026-01-15T15:00', 'Asia/Baghdad'), instant);
});

test('currency and date formatting support regional locales when explicitly requested', () => {
  assert.equal(getIntlLocaleForUi('ar'), 'ar');
  assert.equal(getIntlLocaleForUi('ckb'), 'ckb');
  const security = read('src/security.js');
  assert.match(security, /'en-GB','en','ckb','ar','nl-BE','fr-BE','fr','ckb-IQ','ar-IQ'/);
  const price = new Intl.NumberFormat('ar-IQ', { style: 'currency', currency: 'IQD' }).format(65500);
  assert.match(price, /د\.ع\./);
  const date = formatDateTimeDisplay('2026-10-15T12:00:00.000Z', 'Asia/Baghdad', 'ar-IQ');
  assert.ok(date);
});


test('checkout remains blocked until catalog prices are reviewed after a currency change', () => {
  const completeSimplifiedSetup = {
    mode: 'simplified_cod', storeName: 'Example Store', supportEmail: 'owner@example.com',
    policies: { terms: 'These are the store terms, reviewed for this store.' },
    shippingConfigured: true, deliveryCountriesConfigured: true, sellableProductCount: 1
  };
  assert.equal(evaluateLaunchReadiness(completeSimplifiedSetup), true);
  assert.equal(evaluateLaunchReadiness({ ...completeSimplifiedSetup, currencyReviewComplete: false }), false);
  assert.equal(evaluateLaunchReadiness({ ...completeSimplifiedSetup, currencyReviewComplete: true }), true);
});

test('postal code remains optional for destinations that do not use it', () => {
  const checkout = read('views/checkout.ejs');
  const server = read('src/server.js');
  const postalField = checkout.match(/<label><%= customerText\("Postal code"\) %>[\s\S]*?<\/label>/)?.[0] || '';
  assert.ok(postalField, 'postal-code field must exist');
  assert.doesNotMatch(postalField, /\brequired\b/);
  assert.match(postalField, /Optional when your delivery destination does not use postal codes/);
  assert.doesNotMatch(postalField, /Iraq|عێراق|العراق/);
  assert.match(server, /\[shipping\.name,shipping\.address,shipping\.city,shipping\.country\]\.some\(v=>!v\)/);
  assert.match(server, /shipping\.postalCode\.length>20/);
  assert.doesNotMatch(server, /Object\.values\(shipping\)\.some\(v=>!v\)/);
});

test('health is liveness-only and readiness performs the database dependency check', () => {
  const server = read('src/server.js');
  const healthStart = server.indexOf("app.get('/health'");
  const readyStart = server.indexOf("app.get('/ready'");
  assert.ok(healthStart >= 0 && readyStart > healthStart);
  const health = server.slice(healthStart, readyStart);
  const ready = server.slice(readyStart, server.indexOf('\n', readyStart));
  assert.doesNotMatch(health, /db\.execute|SELECT 1/);
  assert.match(health, /status\(200\)\.json\(\{ok:true\}\)/);
  assert.match(ready, /db\.execute\('SELECT 1'\)/);
  assert.match(ready, /status\(503\)\.json\(\{ok:false,ready:false\}\)/);
});

test('only the selected Arabic or Sorani translation payload is requested by the live storefront', () => {
  const footer = read('views/partials/footer.ejs');
  const arabicPack = read('public/js/i18n-ar.js');
  const soraniPack = read('public/js/i18n-ckb.js');
  const dutchPack = read('public/js/i18n-nl.js');
  const fullPack = read('public/js/i18n.js');
  assert.match(footer, /locale===\'ar\'[\s\S]*i18n-ar\.js/);
  assert.match(footer, /locale===\'ckb\'[\s\S]*i18n-ckb\.js/);
  assert.match(footer, /locale===\'nl\'[\s\S]*i18n-nl\.js/);
  assert.doesNotMatch(footer, /<script src="\/js\/i18n\.js/);
  // The browser receives these files with HTTP compression in production, so
  // enforce a realistic transfer-size budget instead of raw source bytes.
  const arabicTransferBytes = gzipSync(arabicPack, { level: 9 }).byteLength;
  const soraniTransferBytes = gzipSync(soraniPack, { level: 9 }).byteLength;
  const fullTransferBytes = gzipSync(fullPack, { level: 9 }).byteLength;
  const dutchTransferBytes = gzipSync(read('public/js/i18n-nl.js'), { level: 9 }).byteLength;
  assert.ok(arabicTransferBytes < 70_000, `Arabic compressed payload is ${arabicTransferBytes} bytes`);
  assert.ok(soraniTransferBytes < 70_000, `Sorani compressed payload is ${soraniTransferBytes} bytes`);
  assert.ok(arabicTransferBytes < fullTransferBytes * 0.5);
  const parseDictionary = source => { const match = source.match(/const dictionary = (\{[\s\S]*?\});\s*\n\s*const normalizeWhitespace/); assert.ok(match); return JSON.parse(match[1]); };
  assert.deepEqual(Object.keys(parseDictionary(arabicPack)), ['ar']);
  assert.deepEqual(Object.keys(parseDictionary(soraniPack)), ['ckb']);
  const arabicKeyCount=Object.keys(parseDictionary(arabicPack).ar).length;
  const soraniKeyCount=Object.keys(parseDictionary(soraniPack).ckb).length;
  assert.ok(arabicKeyCount>900,'Arabic runtime pack should retain broad UI coverage');
  const dutchDictionaryMatch=dutchPack.match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/);
  assert.ok(dutchDictionaryMatch,'Dutch runtime dictionary should remain parseable');
  const dutchDictionary=JSON.parse(dutchDictionaryMatch[1]).nl;
  const englishDictionary=parseDictionary(fullPack).en;
  const dutchKeys=Object.keys(dutchDictionary).sort();
  const englishKeys=Object.keys(englishDictionary).sort();
  assert.deepEqual(dutchKeys,englishKeys,'Dutch runtime pack must cover every current English key');
  assert.equal(soraniKeyCount,arabicKeyCount,'Arabic and Sorani runtime packs should stay aligned');
});

test('static preview is generic and not hard-coded to one country or shop category', () => {
  const preview = read('PREVIEW.html');
  assert.match(preview, /Static preview only/);
  assert.match(preview, /no real orders or payments are processed/i);
  assert.match(preview, /id="products"/);
  assert.doesNotMatch(preview, /Iraq|Baghdad|لمسة للجمال|IQD|عطر نسيم الورد|كريم ترطيب يومي/);
});
