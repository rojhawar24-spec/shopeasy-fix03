import crypto from 'node:crypto';
import { isValidCurrency, currencyMinorUnitDigits, currencyMinorUnitFactor } from '../security.js';

export const PAYMENT_MODES = Object.freeze({ CASH_ON_DELIVERY: 'cash_on_delivery', CASH_AND_CARD: 'cash_and_card' });
export const PAYMENT_PROVIDER_IDS = Object.freeze(['none', 'mollie', 'paytabs', 'fib', 'iyzico', 'zaincash', 'stripe']);

// Seller/merchant country is independent of customer delivery destinations. Keep
// the merchant country explicit because provider onboarding eligibility is a legal
// and settlement decision, not something the storefront should guess.
export const MERCHANT_COUNTRY_OPTIONS = Object.freeze([
  ['','Select the legal merchant country'],['SY','Syria'],['IQ','Iraq'],['TR','Türkiye'],
  ['BE','Belgium'],['NL','Netherlands'],['DE','Germany'],['FR','France'],['GB','United Kingdom'],
  ['AT','Austria'],['BG','Bulgaria'],['HR','Croatia'],['CY','Cyprus'],['CZ','Czechia'],['DK','Denmark'],
  ['EE','Estonia'],['FI','Finland'],['GR','Greece'],['HU','Hungary'],['IS','Iceland'],['IE','Ireland'],
  ['IT','Italy'],['LV','Latvia'],['LI','Liechtenstein'],['LT','Lithuania'],['LU','Luxembourg'],
  ['MT','Malta'],['NO','Norway'],['PL','Poland'],['PT','Portugal'],['RO','Romania'],['SK','Slovakia'],
  ['SI','Slovenia'],['ES','Spain'],['SE','Sweden'],['CH','Switzerland'],['AE','United Arab Emirates'],
  ['SA','Saudi Arabia'],['EG','Egypt'],['JO','Jordan'],['KW','Kuwait'],['OM','Oman'],['US','United States'],
  ['CA','Canada'],['AU','Australia']
].map(([code,label]) => Object.freeze({ code, label })));

export const MOLLIE_MERCHANT_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','CH','GB'
]);

// Mollie's published online card-currency list, checked against its current
// card-payment documentation on 2026-10-30. Keep this narrower than the store's
// general ISO currency list: a currency may be valid for pricing but unsupported
// for Mollie card settlement. BGN is deliberately excluded: Mollie states that
// BGN payment creation stopped on 2026-01-01 after Bulgaria adopted EUR.
// Sources: https://www.mollie.com/payments/credit-card
// https://help.mollie.com/hc/nl/articles/31737893124626-Overgang-van-Bulgaarse-Lev-BGN-naar-Euro-EUR-wat-je-moet-weten
export const MOLLIE_CARD_CURRENCIES = new Set([
  'AED','AUD','CAD','CHF','CZK','DKK','EUR','GBP','HKD','HUF','ILS','ISK','JPY','NOK','NZD','PHP','PLN','RON','RUB','SEK','SGD','USD','ZAR'
]);

export const PAYMENT_PROVIDER_DIRECTORY = Object.freeze([
  Object.freeze({
    id:'mollie', name:'Mollie', region:'EEA · Switzerland · United Kingdom', kind:'Card checkout',
    integrated:true, onboardingUrl:'https://www.mollie.com/signup', supportUrl:'https://help.mollie.com/',
    docsUrl:'https://docs.mollie.com/reference/create-payment',
    note:'Card checkout is enabled only after eligible merchant-country, supported-currency, public HTTPS URL and API-key checks pass.'
  }),
  Object.freeze({
    id:'paytabs', name:'PayTabs', region:'Supported Middle East markets, including Iraq subject to onboarding', kind:'Card gateway',
    integrated:false, onboardingUrl:'https://merchant.paytabs.com/merchant/register', supportUrl:'https://support.paytabs.com/en/support/solutions/articles/60000716345-merchant-s-onboarding-journey',
    docsUrl:'https://ai.paytabs.com/en/onboarding-documentation/', note:'Iraq is on PayTabs’ published supported-country list, subject to merchant onboarding and KYC. This build has no PayTabs transaction adapter.'
  }),
  Object.freeze({
    id:'fib', name:'First Iraqi Bank (FIB)', region:'Iraq', kind:'Bank payment gateway',
    integrated:false, onboardingUrl:'https://fib.iq/fib-payment-gateway/', supportUrl:'https://fib.iq/',
    docsUrl:'https://fib.iq/fib-payment-gateway/', contactInfo:'Official FIB contact: customer_care@fib.iq · phone 6977 within Iraq.',
    contactEmail:'customer_care@fib.iq', contactPhone:'6977', contactPhoneLabel:'6977 · call from within Iraq',
    note:'Official gateway information only; merchant API credentials and a tested adapter are required before activation.'
  }),
  Object.freeze({
    id:'iyzico', name:'iyzico', region:'Türkiye, subject to merchant approval', kind:'Card / Virtual POS',
    integrated:false, onboardingUrl:'https://www.iyzico.com/en/business/signup', supportUrl:'https://www.iyzico.com/en/support/contact-us',
    docsUrl:'https://docs.iyzico.com/en/payment-methods/checkoutform/cf-implementation',
    contactPhone:'+90 216 599 01 00', contactPhoneLabel:'+90 216 599 01 00 · Türkiye',
    note:'Contact/onboarding directory only; no iyzico transactions are enabled by this ShopEasy build.'
  }),
  Object.freeze({
    id:'zaincash', name:'ZainCash', region:'Iraq', kind:'Wallet / local payments',
    integrated:false, onboardingUrl:'https://docs.zaincash.iq/', supportUrl:'https://docs.zaincash.iq/',
    docsUrl:'https://docs.zaincash.iq/', note:'Local wallet rather than a general card gateway; onboarding and live credentials are required. This build does not initiate ZainCash payments.'
  }),
  Object.freeze({
    id:'stripe', name:'Stripe', region:'Supported merchant countries only', kind:'Card checkout',
    integrated:false, onboardingUrl:'https://stripe.com/global', supportUrl:'https://support.stripe.com/',
    docsUrl:'https://stripe.com/legal/restricted-businesses', note:'Not integrated in this build. Stripe prohibits direct or indirect dealings involving Syria; do not use another country to bypass eligibility.'
  })
]);

export function normalizePaymentMode(value) {
  return value === PAYMENT_MODES.CASH_AND_CARD ? PAYMENT_MODES.CASH_AND_CARD : PAYMENT_MODES.CASH_ON_DELIVERY;
}

export function normalizePaymentProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PAYMENT_PROVIDER_IDS.includes(normalized) ? normalized : 'none';
}

export function isPublicHttpsBaseUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || !hostname.includes('.')) return false;
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) return false;
    if (url.pathname !== '/' || url.search || url.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export function getPaymentProviderStatus({
  mode='cash_on_delivery', provider='none', merchantCountry='', currency='EUR', apiKey='', baseUrl='', nodeEnv='development', testCheckoutEnabled=false, liveMerchantApproved=false
}={}) {
  const normalizedMode = normalizePaymentMode(mode);
  const normalizedProvider = normalizePaymentProvider(provider);
  const country = String(merchantCountry || '').trim().toUpperCase();
  const currencyCode = String(currency || '').trim().toUpperCase();
  const key = String(apiKey || '').trim();
  const production = nodeEnv === 'production';
  const keyLooksValid = /^(?:test|live)_[A-Za-z0-9]+$/.test(key);
  const liveKey = keyLooksValid && key.startsWith('live_');
  const testKey = keyLooksValid && key.startsWith('test_');
  const keyAllowedForEnvironment = production ? liveKey : (testKey || liveKey);
  const explicitlyAllowedTestCheckout = !production && testCheckoutEnabled === true && testKey;
  // A live API key alone is not enough. This extra server-side switch forces the
  // merchant to confirm onboarding, legal entity, settlement account and a controlled
  // provider-approved test before production card checkout can be exposed.
  const explicitlyApprovedLiveMerchant = production && liveKey && liveMerchantApproved === true;
  const liveCheckoutAllowed = explicitlyApprovedLiveMerchant;
  const checks = {
    modeEnabled: normalizedMode === PAYMENT_MODES.CASH_AND_CARD,
    supportedMerchantCountry: normalizedProvider === 'mollie' && MOLLIE_MERCHANT_COUNTRIES.has(country),
    supportedCurrency: normalizedProvider === 'mollie' && isValidCurrency(currencyCode) && MOLLIE_CARD_CURRENCIES.has(currencyCode),
    apiKeyConfigured: keyAllowedForEnvironment,
    publicHttpsUrlConfigured: isPublicHttpsBaseUrl(baseUrl),
    transactionModeAllowed: liveCheckoutAllowed || explicitlyAllowedTestCheckout,
    liveMerchantApproved: !production || explicitlyApprovedLiveMerchant
  };
  const providerKnown = normalizedProvider !== 'none' && PAYMENT_PROVIDER_IDS.includes(normalizedProvider);
  const integrated = normalizedProvider === 'mollie';
  const checkoutCardEnabled = Boolean(integrated && Object.values(checks).every(Boolean));
  let status;
  if (!checks.modeEnabled) status = 'cod_only';
  else if (normalizedProvider === 'none') status = 'provider_not_selected';
  else if (!integrated) status = 'onboarding_only';
  else if (!checks.supportedMerchantCountry) status = 'merchant_country_not_supported';
  else if (!checks.supportedCurrency) status = 'currency_not_supported';
  else if (!checks.apiKeyConfigured) status = 'api_key_missing_or_invalid';
  else if (!checks.publicHttpsUrlConfigured) status = 'public_https_url_required';
  else if (production && liveKey && !checks.liveMerchantApproved) status = 'live_merchant_approval_required';
  else if (!checks.transactionModeAllowed) status = 'live_mode_required';
  else status = 'ready';
  const directoryEntry = PAYMENT_PROVIDER_DIRECTORY.find(item => item.id === normalizedProvider) || null;
  return Object.freeze({
    mode:normalizedMode, provider:normalizedProvider, merchantCountry:country, currency:currencyCode,
    status, checkoutCardEnabled, providerKnown, integrated, checks, directoryEntry,
    message: status === 'ready' ? (production ? 'Live card-checkout configuration checks passed. Confirm your merchant account and card method are fully approved by Mollie; complete a controlled live transaction and verify settlement before opening checkout to all customers.' : 'Staging card checkout is enabled with a test API key. Use provider test cards only; test payments must not be treated as real receipts.')
      : status === 'cod_only' ? 'Cash on delivery is active. Card checkout is kept off.'
      : status === 'provider_not_selected' ? 'Choose a payment provider. Checkout remains cash on delivery until a supported adapter is ready.'
      : status === 'onboarding_only' ? 'This provider is listed for onboarding/contact only. Its payment API is not integrated in this build; checkout remains cash on delivery.'
      : status === 'merchant_country_not_supported' ? 'The selected legal merchant country is not in Mollie’s published merchant-country list. Use a provider that explicitly onboards your real business country.'
      : status === 'currency_not_supported' ? 'The store currency is not in Mollie’s published card-currency list. Change to a supported currency only after reviewing every product, coupon and existing order.'
      : status === 'api_key_missing_or_invalid' ? (production ? 'A valid Mollie live API key is required in the server environment. Never paste it into this settings form.' : 'Use a valid Mollie test key for staging or a live key only in a deliberate production deployment. Never paste keys into this settings form.')
      : status === 'live_merchant_approval_required' ? 'Card checkout remains disabled. After Mollie approves the real merchant account and settlement account, a responsible operator must confirm a controlled payment/settlement test and set MOLLIE_LIVE_CHECKOUT_APPROVED=true in the private production environment. This switch is not a substitute for provider approval.'
      : status === 'live_mode_required' ? 'Card checkout is disabled in this environment. In production, set NODE_ENV=production with a Mollie live key and the separate merchant-approval switch. A test key can be enabled only in a non-production staging environment with MOLLIE_TEST_CHECKOUT_ENABLED=true.'
      : 'Set BASE_URL to the public HTTPS origin of this store so the hosted checkout and provider webhook can return securely.'
  });
}

export function formatProviderAmount(minorUnits, currency) {
  const code = String(currency || '').trim().toUpperCase();
  if (!isValidCurrency(code) || !MOLLIE_CARD_CURRENCIES.has(code)) throw new Error('PAYMENT_CURRENCY_UNSUPPORTED');
  const amount = Number(minorUnits);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('PAYMENT_AMOUNT_INVALID');
  const factor = currencyMinorUnitFactor(code);
  const digits = currencyMinorUnitDigits(code);
  const major = Math.floor(amount / factor);
  const fraction = String(amount % factor).padStart(digits, '0');
  return digits ? `${major}.${fraction}` : String(major);
}

export function parseProviderAmount(value, currency) {
  const code = String(currency || '').trim().toUpperCase();
  if (!isValidCurrency(code) || !MOLLIE_CARD_CURRENCIES.has(code)) throw new Error('PAYMENT_CURRENCY_UNSUPPORTED');
  const digits = currencyMinorUnitDigits(code);
  const text = String(value ?? '');
  const pattern = digits ? new RegExp(`^(0|[1-9]\\d*)(?:\\.(\\d{1,${digits}}))?$`) : /^(0|[1-9]\d*)$/;
  const match = pattern.exec(text);
  if (!match) throw new Error('PAYMENT_AMOUNT_INVALID');
  const whole = Number(match[1]);
  const fraction = digits ? Number(String(match[2] || '').padEnd(digits, '0') || '0') : 0;
  const minor = whole * currencyMinorUnitFactor(code) + fraction;
  if (!Number.isSafeInteger(minor)) throw new Error('PAYMENT_AMOUNT_INVALID');
  return minor;
}

function apiKeyOrThrow(apiKey, nodeEnv) {
  const key = String(apiKey || '').trim();
  if (!/^(?:test|live)_[A-Za-z0-9]+$/.test(key) || (nodeEnv === 'production' && !key.startsWith('live_'))) {
    throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
  }
  return key;
}

function parseCheckoutUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === 'mollie.com' || url.hostname.endsWith('.mollie.com'))) return null;
    return url.toString();
  } catch { return null; }
}

const MAX_MOLLIE_RESPONSE_BYTES = 64 * 1024;

async function readMollieJsonResponse(response) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MOLLIE_RESPONSE_BYTES) {
    await response.body?.cancel?.().catch?.(() => {});
    throw new Error('PAYMENT_PROVIDER_RESPONSE_TOO_LARGE');
  }
  let text;
  if (!response.body?.getReader) {
    text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_MOLLIE_RESPONSE_BYTES) throw new Error('PAYMENT_PROVIDER_RESPONSE_TOO_LARGE');
  } else {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_MOLLIE_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          throw new Error('PAYMENT_PROVIDER_RESPONSE_TOO_LARGE');
        }
        chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
      }
    } finally {
      reader.releaseLock?.();
    }
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    text = new TextDecoder('utf-8', { fatal: true }).decode(combined);
  }
  try { return JSON.parse(text); }
  catch { throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE'); }
}

async function mollieRequest(path, { apiKey, nodeEnv, method='GET', body, idempotencyKey }={}) {
  const key = apiKeyOrThrow(apiKey, nodeEnv);
  if(idempotencyKey!=null && !/^[A-Za-z0-9_-]{16,64}$/.test(String(idempotencyKey))) throw new Error('PAYMENT_IDEMPOTENCY_KEY_INVALID');
  let response;
  try {
    response = await fetch(`https://api.mollie.com/v2/${path}`, {
      method,
      redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(body ? { 'Content-Type':'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key':String(idempotencyKey) } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
  }
  if(response.status===409) throw new Error('PAYMENT_PROVIDER_CONFLICT');
  if(response.status===408||response.status===425||response.status===429) throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
  if (!response.ok) throw new Error(response.status >= 500 ? 'PAYMENT_PROVIDER_UNAVAILABLE' : 'PAYMENT_PROVIDER_REJECTED');
  let data;
  try { data = await readMollieJsonResponse(response); }
  catch(error) {
    if (error?.message === 'PAYMENT_PROVIDER_RESPONSE_TOO_LARGE') throw error;
    throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE');
  return data;
}

export function buildMollieCredentialFingerprint(apiKey) {
  const key=String(apiKey||'').trim();
  if(!/^(?:test|live)_[A-Za-z0-9]+$/.test(key)) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');
  // Store only a one-way fingerprint, never the API credential. Mollie scopes
  // idempotency records to the credential used for the first request; a rotated
  // key must not silently trigger another POST for a payment-unknown order.
  return crypto.createHash('sha256').update(`shopeasy:mollie-credential-fingerprint:v1:${key}`).digest('hex');
}

export function buildMollieIdempotencyKey(clientToken) {
  const token=String(clientToken||'');
  if(!/^[A-Za-z0-9_-]{24,100}$/.test(token)) throw new Error('PAYMENT_IDEMPOTENCY_KEY_INVALID');
  // One ShopEasy client token represents one immutable order intent. Hash it so
  // the provider header has a fixed length and never exposes the browser token.
  return crypto.createHash('sha256').update(`shopeasy:mollie:create-payment:v1:${token}`).digest('hex');
}

function assertMollieModeMatchesKey(payment, apiKey) {
  const expected=String(apiKey||'').startsWith('test_')?'test':'live';
  if(!payment||!['test','live'].includes(String(payment.mode||''))||String(payment.mode)!==expected) throw new Error('PAYMENT_PROVIDER_MODE_MISMATCH');
}

export async function createMollieCardPayment({ orderId, totalMinorUnits, currency, baseUrl, apiKey, clientToken, nodeEnv='development', locale='en', liveMerchantApproved=false }={}) {
  if (nodeEnv === 'production' && liveMerchantApproved !== true) throw new Error('PAYMENT_LIVE_MERCHANT_APPROVAL_REQUIRED');
  if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1) throw new Error('PAYMENT_ORDER_INVALID');
  if (!isPublicHttpsBaseUrl(baseUrl)) throw new Error('PAYMENT_PUBLIC_HTTPS_URL_REQUIRED');
  const currencyCode = String(currency || '').trim().toUpperCase();
  const amount = formatProviderAmount(totalMinorUnits, currencyCode);
  const origin = new URL(String(baseUrl).trim()).origin;
  const id = Number(orderId);
  const safeLocale = ({en:'en_US',ckb:'en_GB',ar:'en_GB',nl:'nl_BE',fr:'fr_BE'})[String(locale || '').toLowerCase()] || 'en_US';
  const payment = await mollieRequest('payments', {
    apiKey, nodeEnv, method:'POST', idempotencyKey:buildMollieIdempotencyKey(clientToken),
    body: {
      amount: { currency:currencyCode, value:amount },
      description: `ShopEasy order #${id}`,
      method: 'creditcard',
      redirectUrl: `${origin}/checkout/success?order=${id}&payment=return`,
      cancelUrl: `${origin}/checkout/success?order=${id}&payment=cancelled`,
      webhookUrl: `${origin}/payments/mollie/webhook`,
      locale: safeLocale,
      metadata: { shopEasyOrderId:String(id) }
    }
  });
  assertMollieModeMatchesKey(payment, apiKey);
  const paymentId = String(payment.id || '');
  const checkoutUrl = parseCheckoutUrl(payment?._links?.checkout?.href);
  if (!/^tr_[A-Za-z0-9]+$/.test(paymentId) || !['open','pending'].includes(String(payment.status||'')) || !checkoutUrl || String(payment.amount?.currency || '').toUpperCase() !== currencyCode || String(payment.amount?.value || '') !== amount || String(payment.metadata?.shopEasyOrderId || '') !== String(id)) {
    throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE');
  }
  return Object.freeze({ id:paymentId, checkoutUrl, status:String(payment.status || 'open'), amount:payment.amount, metadata:payment.metadata });
}

export async function getMolliePayment(paymentId, { apiKey, nodeEnv='development' }={}) {
  const id = String(paymentId || '').trim();
  if (!/^tr_[A-Za-z0-9]+$/.test(id)) throw new Error('PAYMENT_REFERENCE_INVALID');
  const payment = await mollieRequest(`payments/${encodeURIComponent(id)}`, { apiKey, nodeEnv });
  if (String(payment.id || '') !== id) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE');
  assertMollieModeMatchesKey(payment,apiKey);
  return payment;
}

// Mollie's `paid` state is not a complete financial ledger: a payment can later be
// partially/fully refunded or charged back. Normalize only fields actually reported by
// the provider. Missing amountRefunded is preserved by the caller; absence of
// amountChargedBack means the provider reports no current chargeback amount.
export function parseMollieFinancialSnapshot(payment, expectedCurrency) {
  if (!payment || typeof payment !== 'object' || Array.isArray(payment)) throw new Error('PAYMENT_PROVIDER_INVALID_RESPONSE');
  const currency = String(expectedCurrency || '').trim().toUpperCase();
  if (!isValidCurrency(currency) || !MOLLIE_CARD_CURRENCIES.has(currency)) throw new Error('PAYMENT_CURRENCY_UNSUPPORTED');
  const parseOptional = (field, absentValue) => {
    if (payment[field] === undefined || payment[field] === null) return absentValue;
    const amount = payment[field];
    if (!amount || typeof amount !== 'object' || Array.isArray(amount) ||
        String(amount.currency || '').trim().toUpperCase() !== currency) {
      throw new Error('PAYMENT_PROVIDER_FINANCIAL_CURRENCY_MISMATCH');
    }
    const cents = parseProviderAmount(amount.value, currency);
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('PAYMENT_PROVIDER_FINANCIAL_AMOUNT_INVALID');
    return cents;
  };
  return Object.freeze({
    refundedCents: parseOptional('amountRefunded', null),
    chargedBackCents: parseOptional('amountChargedBack', 0)
  });
}

export function validateMolliePaymentForOrder(payment, order) {
  if (!payment || !order || String(payment.id || '') !== String(order.payment_reference || '') || order.payment_provider !== 'mollie') return false;
  if (String(payment.metadata?.shopEasyOrderId || '') !== String(order.id)) return false;
  const currency = String(order.currency || '').toUpperCase();
  if (String(payment.amount?.currency || '').toUpperCase() !== currency || !isValidCurrency(currency)) return false;
  try { return parseProviderAmount(payment.amount?.value, currency) === Number(order.total_cents); }
  catch { return false; }
}
