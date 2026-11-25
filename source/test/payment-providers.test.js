import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PAYMENT_MODES, PAYMENT_PROVIDER_DIRECTORY, MOLLIE_MERCHANT_COUNTRIES,
  getPaymentProviderStatus, isPublicHttpsBaseUrl, normalizePaymentMode,
  normalizePaymentProvider, formatProviderAmount, parseProviderAmount,
  createMollieCardPayment, getMolliePayment, validateMolliePaymentForOrder, buildMollieIdempotencyKey, buildMollieCredentialFingerprint
} from '../src/services/payment-providers.js';

const valid = {
  mode: PAYMENT_MODES.CASH_AND_CARD,
  provider: 'mollie',
  merchantCountry: 'BE',
  currency: 'EUR',
  apiKey: 'live_example123',
  baseUrl: 'https://shop.example.com',
  nodeEnv: 'production',
  liveMerchantApproved: true
};

test('COD is the default and unknown settings fail back to a safe value', () => {
  assert.equal(normalizePaymentMode('unexpected'), PAYMENT_MODES.CASH_ON_DELIVERY);
  assert.equal(normalizePaymentProvider('unexpected'), 'none');
  const status = getPaymentProviderStatus({ mode: 'cash_on_delivery', provider: 'none' });
  assert.equal(status.checkoutCardEnabled, false);
  assert.equal(status.status, 'cod_only');
});

test('Mollie card checkout requires a supported legal merchant country, currency, public HTTPS and production live key', () => {
  assert.equal(MOLLIE_MERCHANT_COUNTRIES.has('BE'), true);
  assert.equal(MOLLIE_MERCHANT_COUNTRIES.has('SY'), false);
  assert.equal(getPaymentProviderStatus(valid).checkoutCardEnabled, true);
  const withoutLiveApproval = getPaymentProviderStatus({ ...valid, liveMerchantApproved: false });
  assert.equal(withoutLiveApproval.checkoutCardEnabled, false);
  assert.equal(withoutLiveApproval.status, 'live_merchant_approval_required');
  assert.equal(withoutLiveApproval.checks.liveMerchantApproved, false);
  assert.equal(getPaymentProviderStatus({ ...valid, merchantCountry: 'SY' }).checkoutCardEnabled, false);
  assert.equal(getPaymentProviderStatus({ ...valid, currency: 'IQD' }).checkoutCardEnabled, false);
  assert.equal(getPaymentProviderStatus({ ...valid, baseUrl: 'http://shop.example.com' }).checkoutCardEnabled, false);
  assert.equal(getPaymentProviderStatus({ ...valid, apiKey: 'test_example123' }).checkoutCardEnabled, false);
  assert.equal(getPaymentProviderStatus({ ...valid, nodeEnv: 'development' }).checkoutCardEnabled, false);
});

test('test credentials are allowed only when staging explicitly opts in and never in production', () => {
  const testConfig = { ...valid, apiKey: 'test_example123', nodeEnv: 'development' };
  assert.equal(getPaymentProviderStatus(testConfig).checkoutCardEnabled, false);
  assert.equal(getPaymentProviderStatus({ ...testConfig, testCheckoutEnabled: true }).checkoutCardEnabled, true);
  assert.equal(getPaymentProviderStatus({ ...testConfig, nodeEnv: 'production', testCheckoutEnabled: true }).checkoutCardEnabled, false);
  assert.equal(getPaymentProviderStatus({ ...valid, liveMerchantApproved: false, apiKey: 'live_example123' }).checkoutCardEnabled, false);
});

test('public URL policy rejects localhost, IP addresses, credential URLs and non-HTTPS', () => {
  assert.equal(isPublicHttpsBaseUrl('https://shop.example.com'), true);
  assert.equal(isPublicHttpsBaseUrl('http://shop.example.com'), false);
  assert.equal(isPublicHttpsBaseUrl('https://localhost:3000'), false);
  assert.equal(isPublicHttpsBaseUrl('https://127.0.0.1'), false);
  assert.equal(isPublicHttpsBaseUrl('https://user:pass@shop.example.com'), false);
  assert.equal(isPublicHttpsBaseUrl('https://shop.example.com/path'), false);
});

test('provider directory gives official onboarding URLs but marks non-Mollie providers as not integrated', () => {
  const byId = new Map(PAYMENT_PROVIDER_DIRECTORY.map(item => [item.id, item]));
  for (const id of ['paytabs', 'fib', 'iyzico', 'zaincash', 'stripe']) {
    assert.equal(byId.get(id)?.integrated, false);
    assert.match(byId.get(id)?.onboardingUrl || '', /^https:\/\//);
    assert.match(byId.get(id)?.supportUrl || '', /^https:\/\//);
  }
  assert.match(byId.get('fib')?.contactInfo || '', /customer_care@fib\.iq/);
  assert.equal(byId.get('fib')?.contactEmail, 'customer_care@fib.iq');
  assert.equal(byId.get('fib')?.contactPhone, '6977');
  assert.equal(byId.get('iyzico')?.contactPhone, '+90 216 599 01 00');
});

test('Mollie amount formatting respects supported zero- and two-decimal currencies and rejects unsupported IQD', () => {
  assert.equal(formatProviderAmount(1234, 'EUR'), '12.34');
  assert.equal(parseProviderAmount('12.34', 'EUR'), 1234);
  assert.equal(formatProviderAmount(1200, 'JPY'), '1200');
  assert.equal(parseProviderAmount('1200', 'JPY'), 1200);
  assert.equal(formatProviderAmount(1234, 'USD'), '12.34');
  assert.equal(parseProviderAmount('12.34', 'USD'), 1234);
  assert.equal(formatProviderAmount(1234, 'RUB'), '12.34');
  assert.equal(parseProviderAmount('12.34', 'RUB'), 1234);
  assert.throws(() => formatProviderAmount(1234, 'UAH'), /PAYMENT_CURRENCY_UNSUPPORTED/);
  assert.throws(() => formatProviderAmount(1234, 'BGN'), /PAYMENT_CURRENCY_UNSUPPORTED/);
  assert.throws(() => formatProviderAmount(12000, 'IQD'), /PAYMENT_CURRENCY_UNSUPPORTED/);
  assert.throws(() => parseProviderAmount('12.123', 'IQD'), /PAYMENT_CURRENCY_UNSUPPORTED/);
  assert.throws(() => parseProviderAmount('12.345', 'EUR'), /PAYMENT_AMOUNT_INVALID/);
  assert.throws(() => formatProviderAmount(0, 'EUR'), /PAYMENT_AMOUNT_INVALID/);
});

test('payment verification refuses mismatched order, reference, provider, metadata, amount or currency', () => {
  const order = { id: 41, payment_provider: 'mollie', payment_reference: 'tr_abcd1234', currency: 'EUR', total_cents: 1234 };
  const payment = { id: 'tr_abcd1234', metadata: { shopEasyOrderId: '41' }, amount: { currency: 'EUR', value: '12.34' } };
  assert.equal(validateMolliePaymentForOrder(payment, order), true);
  assert.equal(validateMolliePaymentForOrder({ ...payment, amount: { currency: 'EUR', value: '99.00' } }, order), false);
  assert.equal(validateMolliePaymentForOrder({ ...payment, amount: { currency: 'USD', value: '12.34' } }, order), false);
  assert.equal(validateMolliePaymentForOrder({ ...payment, metadata: { shopEasyOrderId: '42' } }, order), false);
  assert.equal(validateMolliePaymentForOrder(payment, { ...order, payment_provider: 'cash_on_delivery' }), false);
});

test('production Mollie payment creation independently fails closed without live merchant approval', async () => {
  await assert.rejects(() => createMollieCardPayment({
    orderId: 41, totalMinorUnits: 1234, currency: 'EUR', baseUrl: 'https://shop.example.com',
    apiKey: 'live_example123', nodeEnv: 'production', liveMerchantApproved: false
  }), /PAYMENT_LIVE_MERCHANT_APPROVAL_REQUIRED/);
});

test('manager settings persist private bank contacts and hosted checkout never asks ShopEasy for card details', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const settings = fs.readFileSync(new URL('../views/admin/settings.ejs', import.meta.url), 'utf8');
  const checkout = fs.readFileSync(new URL('../views/checkout.ejs', import.meta.url), 'utf8');
  assert.match(server, /payment_mode:paymentMode/);
  assert.match(server, /payment_provider:paymentProvider/);
  assert.match(server, /bank_contact_name:bankContactName/);
  assert.match(server, /bank_contact_email:bankContactEmail/);
  assert.match(server, /bank_contact_phone:bankContactPhone/);
  assert.match(server, /bank_contact_reference:bankContactReference/);
  assert.match(server, /app\.get\('\/admin\/settings',requireManager/);
  assert.match(settings, /PRIVATE MANAGER NOTES/);
  assert.match(settings, /mailto:<%= provider\.contactEmail %>/);
  assert.match(settings, /href=\"tel:<%= String\(provider\.contactPhone\)\.replace/);
  assert.match(settings, /provider-direct-contacts/);
  assert.doesNotMatch(settings, /name="MOLLIE_API_KEY"|name="apiSecret"/i);
  assert.doesNotMatch(checkout, /name="(?:cardNumber|card_number|cvv|cvc|expiry)"/i);
});


test('Mollie hosted checkout request uses exact server amount, supported locale, safe return URLs and server webhook', async () => {
  const originalFetch = globalThis.fetch;
  let recorded = null;
  globalThis.fetch = async (url, init) => {
    recorded = { url: String(url), init };
    return new Response(JSON.stringify({
      id: 'tr_AbC123xyz',
      mode: 'test',
      status: 'open',
      amount: { currency: 'EUR', value: '12.34' },
      metadata: { shopEasyOrderId: '41' },
      _links: { checkout: { href: 'https://www.mollie.com/checkout/select-method/example' } }
    }), { status: 201, headers: { 'content-type': 'application/json' } });
  };
  try {
    const payment = await createMollieCardPayment({
      orderId: 41, totalMinorUnits: 1234, currency: 'EUR', baseUrl: 'https://shop.example.com',
      apiKey: 'test_example123', nodeEnv: 'development', locale: 'ckb', clientToken: 'abcdefgh12345678_abcdefgh12345678'
    });
    assert.equal(payment.id, 'tr_AbC123xyz');
    assert.equal(payment.checkoutUrl, 'https://www.mollie.com/checkout/select-method/example');
    assert.equal(recorded.url, 'https://api.mollie.com/v2/payments');
    assert.equal(recorded.init.method, 'POST');
    assert.equal(recorded.init.redirect, 'error', 'Mollie API requests must not follow redirects with credentials');
    assert.equal(recorded.init.headers.Authorization, 'Bearer test_example123');
    assert.equal(recorded.init.headers['Idempotency-Key'], buildMollieIdempotencyKey('abcdefgh12345678_abcdefgh12345678'));
    assert.equal(recorded.init.headers['Idempotency-Key'].length, 64);
    const body = JSON.parse(recorded.init.body);
    assert.deepEqual(body.amount, { currency: 'EUR', value: '12.34' });
    assert.equal(body.method, 'creditcard');
    assert.equal(body.locale, 'en_GB');
    assert.equal(body.redirectUrl, 'https://shop.example.com/checkout/success?order=41&payment=return');
    assert.equal(body.cancelUrl, 'https://shop.example.com/checkout/success?order=41&payment=cancelled');
    assert.equal(body.webhookUrl, 'https://shop.example.com/payments/mollie/webhook');
    assert.deepEqual(body.metadata, { shopEasyOrderId: '41' });

    // The Dutch UI is specifically nl-BE in ShopEasy. Mollie explicitly supports
    // nl_BE, so never silently send Belgian Dutch customers to an English page.
    await createMollieCardPayment({
      orderId: 41, totalMinorUnits: 1234, currency: 'EUR', baseUrl: 'https://shop.example.com',
      apiKey: 'test_example123', nodeEnv: 'development', locale: 'nl', clientToken: 'abcdefgh12345678_abcdefgh12345678'
    });
    assert.equal(JSON.parse(recorded.init.body).locale, 'nl_BE');
    // The French locale is supported by Mollie. Check that the French customer
    // is not silently sent to an English hosted payment page.
    await createMollieCardPayment({
      orderId: 41, totalMinorUnits: 1234, currency: 'EUR', baseUrl: 'https://shop.example.com',
      apiKey: 'test_example123', nodeEnv: 'development', locale: 'fr', clientToken: 'abcdefgh12345678_abcdefgh12345678'
    });
    assert.equal(JSON.parse(recorded.init.body).locale, 'fr_BE');
    assert.equal(Object.keys(body).some(key => /card.?number|cvv|cvc|expiry/i.test(key)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Mollie hosted checkout rejects a lookalike domain returned as the checkout URL', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: 'tr_AbC123xyz', mode: 'test', status: 'open', amount: { currency: 'EUR', value: '12.34' },
    metadata: { shopEasyOrderId: '41' },
    _links: { checkout: { href: 'https://www.mollie.com.attacker.example/checkout' } }
  }), { status: 201, headers: { 'content-type': 'application/json' } });
  try {
    await assert.rejects(() => createMollieCardPayment({
      orderId: 41, totalMinorUnits: 1234, currency: 'EUR', baseUrl: 'https://shop.example.com',
      apiKey: 'test_example123', nodeEnv: 'development', clientToken: 'abcdefgh12345678_abcdefgh12345678'
    }), /PAYMENT_PROVIDER_INVALID_RESPONSE/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Mollie checkout URL rejects non-default ports even on a trusted hostname', async () => {
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    id:'tr_AbC123xyz',mode:'test',status:'open',amount:{currency:'EUR',value:'12.34'},
    metadata:{shopEasyOrderId:'41'},_links:{checkout:{href:'https://www.mollie.com:8443/checkout/example'}}
  }),{status:201,headers:{'content-type':'application/json'}});
  try {
    await assert.rejects(()=>createMollieCardPayment({orderId:41,totalMinorUnits:1234,currency:'EUR',baseUrl:'https://shop.example.com',apiKey:'test_example123',clientToken:'abcdefgh12345678_abcdefgh12345678'}),/PAYMENT_PROVIDER_INVALID_RESPONSE/);
  } finally { globalThis.fetch=originalFetch; }
});

test('Mollie status lookup validates the payment ID and reads status from the official API', async () => {
  const originalFetch = globalThis.fetch;
  let recorded = null;
  globalThis.fetch = async (url, init) => {
    recorded = { url: String(url), init };
    return new Response(JSON.stringify({ id: 'tr_AbC123xyz', mode: 'test', status: 'paid' }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const payment = await getMolliePayment('tr_AbC123xyz', { apiKey: 'test_example123', nodeEnv: 'development' });
    assert.equal(payment.status, 'paid');
    assert.equal(recorded.url, 'https://api.mollie.com/v2/payments/tr_AbC123xyz');
    assert.equal(recorded.init.method, 'GET');
    assert.equal(recorded.init.redirect, 'error', 'Mollie API requests must not follow redirects with credentials');
    await assert.rejects(() => getMolliePayment('https://attacker.example/tr_AbC123xyz', {
      apiKey: 'test_example123', nodeEnv: 'development'
    }), /PAYMENT_REFERENCE_INVALID/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('Mollie credential fingerprint is stable, secret-free and changes on key rotation', () => {
  const first=buildMollieCredentialFingerprint('test_example123');
  assert.equal(first,buildMollieCredentialFingerprint('test_example123'));
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.notEqual(first,'test_example123');
  assert.notEqual(first,buildMollieCredentialFingerprint('test_rotated456'));
  assert.notEqual(first,buildMollieCredentialFingerprint('live_example123'));
  assert.throws(()=>buildMollieCredentialFingerprint(''),/PAYMENT_PROVIDER_NOT_CONFIGURED/);
});

test('Mollie idempotency key is stable, opaque, and rejects malformed client tokens', () => {
  const token='abcdefgh12345678_abcdefgh12345678';
  const first=buildMollieIdempotencyKey(token);
  assert.equal(first,buildMollieIdempotencyKey(token));
  assert.equal(first.length,64);
  assert.match(first,/^[a-f0-9]{64}$/);
  assert.notEqual(first,token);
  assert.notEqual(first,buildMollieIdempotencyKey(token+'x'));
  assert.throws(()=>buildMollieIdempotencyKey('short'),/PAYMENT_IDEMPOTENCY_KEY_INVALID/);
});

test('Mollie create validates response mode against the API key and rejects uncertain statuses', async () => {
  const originalFetch=globalThis.fetch;
  const base={id:'tr_AbC123xyz',mode:'live',status:'open',amount:{currency:'EUR',value:'12.34'},metadata:{shopEasyOrderId:'41'},_links:{checkout:{href:'https://www.mollie.com/checkout/example'}}};
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify(base),{status:201,headers:{'content-type':'application/json'}});
    await assert.rejects(()=>createMollieCardPayment({orderId:41,totalMinorUnits:1234,currency:'EUR',baseUrl:'https://shop.example.com',apiKey:'test_example123',clientToken:'abcdefgh12345678_abcdefgh12345678'}),/PAYMENT_PROVIDER_MODE_MISMATCH/);
    globalThis.fetch=async()=>new Response(JSON.stringify({...base,mode:'test',status:'paid'}),{status:201,headers:{'content-type':'application/json'}});
    await assert.rejects(()=>createMollieCardPayment({orderId:41,totalMinorUnits:1234,currency:'EUR',baseUrl:'https://shop.example.com',apiKey:'test_example123',clientToken:'abcdefgh12345678_abcdefgh12345678'}),/PAYMENT_PROVIDER_INVALID_RESPONSE/);
  } finally { globalThis.fetch=originalFetch; }
});

test('Mollie transient API failures are classified safely and conflicts remain retryable', async () => {
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'conflict'}),{status:409,headers:{'content-type':'application/json'}});
    await assert.rejects(()=>createMollieCardPayment({orderId:41,totalMinorUnits:1234,currency:'EUR',baseUrl:'https://shop.example.com',apiKey:'test_example123',clientToken:'abcdefgh12345678_abcdefgh12345678'}),/PAYMENT_PROVIDER_CONFLICT/);
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'rate-limited'}),{status:429,headers:{'content-type':'application/json'}});
    await assert.rejects(()=>createMollieCardPayment({orderId:41,totalMinorUnits:1234,currency:'EUR',baseUrl:'https://shop.example.com',apiKey:'test_example123',clientToken:'abcdefgh12345678_abcdefgh12345678'}),/PAYMENT_PROVIDER_UNAVAILABLE/);
  } finally { globalThis.fetch=originalFetch; }
});

test('Mollie payment status lookups reject mode mismatch', async () => {
  const originalFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({id:'tr_AbC123xyz',mode:'live',status:'paid'}),{status:200,headers:{'content-type':'application/json'}});
    await assert.rejects(()=>getMolliePayment('tr_AbC123xyz',{apiKey:'test_example123',nodeEnv:'development'}),/PAYMENT_PROVIDER_MODE_MISMATCH/);
  } finally { globalThis.fetch=originalFetch; }
});


test('Mollie API response parsing is bounded to 64 KiB', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('x'.repeat(70 * 1024), { status: 200 });
  try {
    await assert.rejects(
      () => getMolliePayment('tr_AbC123xyz', { apiKey: 'test_example123', nodeEnv: 'development' }),
      /PAYMENT_PROVIDER_RESPONSE_TOO_LARGE/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
