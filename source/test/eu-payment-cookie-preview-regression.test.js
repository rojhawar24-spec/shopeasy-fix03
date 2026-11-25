import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const server = read('src/server.js');
const payments = read('src/services/payment-providers.js');
const checkout = read('views/checkout.ejs');
const header = read('views/partials/header.ejs');
const footer = read('views/partials/footer.ejs');
const cookiePage = read('views/cookies.ejs');
const appJs = read('public/js/app.js');
const css = read('public/css/app.css');
const preview = read('PREVIEW.html');

function cookieConsentSource() {
  const start = appJs.indexOf('// Cookie preferences are strictly first-party.');
  const end = appJs.indexOf('// Back links navigate to explicit same-site destinations.', start);
  assert.ok(start >= 0 && end > start, 'cookie-consent controller block must be easy to audit');
  return appJs.slice(start, end);
}

test('cookie policy route is a real storefront page and is included in the sitemap', () => {
  assert.match(server, /app\.get\('\/cookies',\(req,res\)=>render\(res,'cookies'/);
  assert.match(server, /paths=\[[^\]]*'\/cookies'/);
  assert.match(header, /'\/cookies'/);
  assert.match(cookiePage, /cookieCopy\s*=\s*\{/);
  assert.match(cookiePage, /en:\{/);
  assert.match(cookiePage, /nl:\{/);
  assert.match(cookiePage, /ckb:\{/);
  assert.match(cookiePage, /ar:\{/);
  assert.match(cookiePage, /not legal certification|جێگرەوەی پێداچوونەوەی یاسایی نییە|ليست مراجعة قانونية/);
});

test('cookie preferences are first-party, optional categories start off, and choices expire after 180 days', () => {
  const block = cookieConsentSource();
  assert.match(footer, /data-cookie-banner hidden/);
  assert.match(footer, /data-cookie-accept/);
  assert.match(footer, /data-cookie-reject/);
  assert.match(footer, /data-cookie-customize/);
  assert.match(footer, /data-cookie-open/);
  assert.match(block, /shopeasy-cookie-choice-v1/);
  assert.match(block, /180 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(block, /localStorage\.setItem/);
  assert.match(block, /cookieBanner\.dataset\.storageUnavailable/);
  assert.match(block, /if \(!persisted\)/);
  assert.match(block, /No optional trackers are present in this build/);
  assert.doesNotMatch(block, /document\.cookie|createElement\(['"]script['"]\)|\.appendChild\(.*script/i);
  assert.doesNotMatch(footer, /<script[^>]+src=["']https?:/i, 'no remote analytics or advertising scripts may load from the footer');
  assert.match(footer, /class="btn btn-light" data-cookie-accept/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*?\.cookie-consent-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test('necessary/session and language storage are disclosed without claiming all storage is optional', () => {
  assert.match(cookiePage, /shop_lang/);
  assert.match(cookiePage, /localStorage/);
  assert.match(cookiePage, /session cookie|کوکیی سەشن|ملف تعريف الجلسة/i);
  assert.match(cookiePage, /does not load third-party analytics|هیچ کۆدی دەرەکیی ئامار|لا يحمّل أدوات تحليلات/);
  assert.match(footer, /Necessary storage supports your account, basket and security/);
});

test('Mollie production card mode is gated by eligible merchant country and explicit live approval', () => {
  assert.match(payments, /MOLLIE_MERCHANT_COUNTRIES/);
  assert.match(payments, /explicitlyApprovedLiveMerchant = production && liveKey && liveMerchantApproved === true/);
  assert.match(payments, /live_merchant_approval_required/);
  assert.match(server, /MOLLIE_LIVE_CHECKOUT_APPROVED==='true'/);
  assert.match(read('.env.example'), /MOLLIE_LIVE_CHECKOUT_APPROVED=false/);
  assert.match(payments, /merchantCountry/);
  assert.doesNotMatch(checkout, /name="(?:cardNumber|card_number|cvv|cvc|expiry)"/i);
  assert.match(checkout, /Mollie’s secure hosted checkout/);
});

test('European customers and legal merchant eligibility are treated as separate concepts', () => {
  assert.match(payments, /Seller\/merchant country is independent of customer delivery destinations/);
  assert.match(payments, /MOLLIE_MERCHANT_COUNTRIES = new Set/);
  assert.match(payments, /'BE'/);
  assert.match(payments, /'GB'/);
  assert.match(payments, /'CH'/);
  assert.match(payments, /MOLLIE_CARD_CURRENCIES = new Set/);
  assert.match(payments, /'EUR'/);
  assert.match(payments, /'USD'/);
  const cardCurrencies = payments.match(/export const MOLLIE_CARD_CURRENCIES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  assert.match(cardCurrencies, /'RUB'/);
  assert.doesNotMatch(cardCurrencies, /'UAH'|'BGN'/, 'unsupported UAH and discontinued BGN must remain unavailable for Mollie card payments');
  assert.match(payments, /merchant_country_not_supported/);
  assert.match(payments, /currency_not_supported/);
});

test('static preview uses general-retail artwork and has a responsive, accessible search/header', () => {
  assert.match(preview, /class=\"site-header\"/);
  assert.match(preview, /class=\"container nav-row\"/);
  assert.match(preview, /class=\"search-box storefront-search\"/);
  assert.match(read('public/css/app.css'), /\.sr-only \{ position: absolute/);
  for (const asset of ['preview-backpack.svg','preview-lamp.svg','preview-bottle.svg','preview-cable.svg']) {
    assert.match(preview, new RegExp(asset.replaceAll('.', '\\.'), 'g'));
    assert.ok(fs.existsSync(new URL(`../public/assets/${asset}`, import.meta.url)), `${asset} should exist`);
  }
  assert.doesNotMatch(preview, /public\/assets\/product-[1-4]\.svg/);
  assert.match(read('public/css/app.css'), /@media \(max-width: 639px\)/);
  assert.match(read('public/css/app.css'), /@media \(min-width: 640px\) and \(max-width: 1023px\)/);
  assert.match(preview, /aria-live="polite"/);
});

test('payment choice cards use the active design tokens and become readable on narrow screens', () => {
  assert.match(css, /\.payment-choice\s*\{[^}]*border:\s*var\(--border\)/);
  assert.match(css, /\.payment-choice:has\(input:checked\)/);
  assert.match(css, /\.payment-choice input\s*\{[^}]*accent-color:\s*var\(--blue\)/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*?\.payment-choice\s*\{[^}]*grid-template-columns/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Payment settings and hosted card checkout.'), css.indexOf('/* Public provider contacts')), /var\(--border-color|var\(--ink,/);
});
