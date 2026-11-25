import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyCents, isSafeUrl, isSafeLocalPath, assertUploadSignature, isStrongEnoughPassword, isValidCurrency, currencyMinorUnitDigits, currencyMinorUnitFactor, formatMoneyInput, dateTimeLocalToISOString, formatDateTimeLocal } from '../src/security.js';
let aiModule = null;
try { aiModule = await import('../src/services/ai.js'); }
catch (error) {
  if (!(error?.code === 'ERR_MODULE_NOT_FOUND' && String(error?.message || '').includes('src/services/ai.js'))) throw error;
}


test('moneyCents handles euro-style input safely', () => {
  assert.equal(moneyCents('12.50'), 1250);
  assert.equal(moneyCents('12,50'), 1250);
  assert.equal(moneyCents('1.234,50'), 123450);
  assert.equal(moneyCents('1,234.50'), 123450);
  assert.equal(moneyCents('1 234,50'), 123450);
  assert.equal(moneyCents('12.999'), 1299900, 'a three-digit grouped EUR amount is interpreted as a thousands separator');
  assert.equal(moneyCents('12,34,56'), null);
  assert.equal(moneyCents('-5'), null);
});


test('currency minor units are correct for EUR, IQD, AED and USD', () => {
  assert.equal(isValidCurrency('IQD'), true);
  assert.equal(isValidCurrency('AED'), true);
  assert.equal(currencyMinorUnitDigits('IQD'), 3);
  assert.equal(currencyMinorUnitFactor('IQD'), 1000);
  assert.equal(currencyMinorUnitDigits('AED'), 2);
  assert.equal(moneyCents('25', 'IQD'), 25000);
  assert.equal(moneyCents('25.00', 'IQD'), 25000);
  assert.equal(moneyCents('25.125', 'IQD'), 25125);
  assert.equal(moneyCents('27.50', 'AED'), 2750);
  assert.equal(moneyCents('25', 'USD'), 2500);
  assert.equal(formatMoneyInput(25000, 'IQD'), '25.000');
  assert.equal(formatMoneyInput(2750, 'AED'), '27.50');
});

test('URL validation blocks protocol-relative, javascript and insecure URLs', () => {
  assert.equal(isSafeUrl('/shop'), true);
  assert.equal(isSafeUrl('/product/item?x=1'), true);
  assert.equal(isSafeUrl('//evil.example'), false);
  assert.equal(isSafeUrl('/\\\\evil.example'), false);
  assert.equal(isSafeUrl('https://example.com'), true);
  assert.equal(isSafeUrl('https://'), false);
  assert.equal(isSafeUrl('https://user:pass@example.com'), false);
  assert.equal(isSafeUrl('http://example.com'), false);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeLocalPath('/account?x=1'), true);
  assert.equal(isSafeLocalPath('//evil.example'), false);
  assert.equal(isSafeLocalPath('https://evil.example'), false);
});

test('upload signatures match their declared MIME type', () => {
  assert.equal(assertUploadSignature(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]), 'image/png'), true);
  assert.equal(assertUploadSignature(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
});

test('password and checkout country policy helpers are explicit', () => {
  assert.equal(isStrongEnoughPassword('short'), false);
  assert.equal(isStrongEnoughPassword('A-secure-password-1234'), true);
});

test('AI feature stays optional and disabled without provider configuration', () => {
  if (!aiModule) { assert.equal(aiModule, null); return; }
  const previous={node:process.env.NODE_ENV,enabled:process.env.AI_ENABLED,base:process.env.AI_BASE_URL,key:process.env.AI_API_KEY,model:process.env.AI_MODEL};
  delete process.env.AI_ENABLED; delete process.env.AI_BASE_URL; delete process.env.AI_API_KEY; delete process.env.AI_MODEL;
  assert.equal(aiModule?.aiEnabled?.() ?? false,false);
  process.env.AI_ENABLED='true';
  assert.equal(aiModule?.aiEnabled?.() ?? false,false);
  process.env.AI_BASE_URL='https://ai.example.com'; process.env.AI_API_KEY='test'; process.env.AI_MODEL='model';
  assert.equal(aiModule?.aiEnabled?.() ?? false,true);
  process.env.NODE_ENV='production'; process.env.AI_BASE_URL='http://ai.example.com';
  assert.equal(aiModule?.aiEnabled?.() ?? false,false);
  if(previous.enabled===undefined) delete process.env.AI_ENABLED; else process.env.AI_ENABLED=previous.enabled;
  if(previous.base===undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL=previous.base;
  if(previous.key===undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY=previous.key;
  if(previous.model===undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL=previous.model;
  if(previous.node===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=previous.node;
});

test('currency validation rejects malformed or unsupported display currencies', () => {
  assert.equal(isValidCurrency('EUR'), true);
  assert.equal(isValidCurrency('USD'), true);
  assert.equal(isValidCurrency('EURO'), false);
  assert.equal(isValidCurrency('ZZZ'), false);
});


test('store timezone conversion round-trips across standard and daylight time', () => {
  for (const value of ['2026-01-15T12:30','2026-07-15T12:30']) {
    const iso = dateTimeLocalToISOString(value, 'Europe/Brussels');
    assert.ok(iso);
    assert.equal(formatDateTimeLocal(iso, 'Europe/Brussels'), value);
  }
});

test('hosted Mollie card checkout keeps card data off ShopEasy and verifies payments server-side', async () => {
  const fs = await import('node:fs');
  const assert = await import('node:assert/strict');
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const provider = fs.readFileSync(new URL('../src/services/payment-providers.js', import.meta.url), 'utf8');
  const checkout = fs.readFileSync(new URL('../views/checkout.ejs', import.meta.url), 'utf8');
  assert.match(provider, /https:\/\/api\.mollie\.com\/v2\//);
  assert.match(provider, /parseCheckoutUrl/);
  assert.match(provider, /validateMolliePaymentForOrder/);
  assert.match(server, /getMolliePayment/);
  assert.match(server, /markProviderOrderPaid/);
  assert.match(server, /paymentWebhookLimiter/);
  assert.match(server, /requestedPaymentMethod==='card'&&!payments\.status\.checkoutCardEnabled/);
  assert.doesNotMatch(checkout, /name="(?:cardNumber|card_number|cvv|cvc|expiry)"/i);
  assert.doesNotMatch(server, /stripe|webhooks\/stripe|createStripeCheckout/i);
});


test('nonexistent daylight-saving wall times are rejected instead of normalized', () => {
  assert.equal(dateTimeLocalToISOString('2026-03-29T02:30','Europe/Brussels'), null);
});
