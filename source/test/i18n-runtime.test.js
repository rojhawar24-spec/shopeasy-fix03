import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class ElementMock {
  constructor() { this.attributes = new Map(); }
  matches() { return false; }
  closest() { return null; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelectorAll() { return []; }
}

function load(locale) {
  const window = {};
  const document = {
    documentElement: { lang: locale },
    body: new ElementMock(),
    createTreeWalker() { return { nextNode() { return false; } }; }
  };
  const context = { window, document, Element: ElementMock, NodeFilter: { SHOW_TEXT: 4 } };
  vm.runInNewContext(fs.readFileSync('public/js/i18n.js', 'utf8'), context, { filename: 'public/js/i18n.js' });
  return window.ShopEasyI18n;
}

test('Arabic translates dynamic product, category, coupon and wishlist confirmations without losing the name', () => {
  const i18n = load('ar');
  const product = i18n.translate('Archive Travel Bag? It will be hidden from the shop but kept for historic orders.');
  const category = i18n.translate('Delete category Accessories? Products will become uncategorized.');
  const coupon = i18n.translate('Delete coupon WELCOME10?');
  const wishlist = i18n.translate('Remove Travel Bag from wishlist');
  assert.notEqual(product, 'Archive Travel Bag? It will be hidden from the shop but kept for historic orders.');
  assert.notEqual(category, 'Delete category Accessories? Products will become uncategorized.');
  assert.notEqual(coupon, 'Delete coupon WELCOME10?');
  assert.notEqual(wishlist, 'Remove Travel Bag from wishlist');
  assert.match(product, /Travel Bag/);
  assert.match(category, /Accessories/);
  assert.match(coupon, /WELCOME10/);
  assert.match(wishlist, /Travel Bag/);
  assert.match(i18n.translate('Accept order'), /الطلب/);
});

test('Sorani translates dynamic manager confirmations and all new stock/profit labels', () => {
  const i18n = load('ckb');
  const category = i18n.translate('Delete category Accessories? Products will become uncategorized.');
  const coupon = i18n.translate('Delete coupon WELCOME10?');
  assert.notEqual(category, 'Delete category Accessories? Products will become uncategorized.');
  assert.notEqual(coupon, 'Delete coupon WELCOME10?');
  assert.match(category, /Accessories/);
  assert.match(coupon, /WELCOME10/);
  for (const phrase of ['Purchase cost per unit *','Physical stock *','Estimated gross profit','Send reset code']) {
    assert.notEqual(i18n.translate(phrase), phrase, `missing Sorani translation: ${phrase}`);
  }
});



test('Sorani covers dynamic storefront/admin counts, attributes and terminology without English UI fragments', () => {
  const i18n = load('ckb');
  const cases = [
    ['3 products · Explore →', /٣|3|بەرهەم/, /بگەڕێ/],
    ['2 subcategories · Explore →', /٢|2|ژێرپۆل/, /بگەڕێ/],
    ['Page 4', /پەڕەی/],
    ['5 customers', /کڕیار/],
    ['12 available', /بەردەست/],
    ['8 sold', /فرۆشراو/],
    ['4 reserved', /پاشەکەوتکراو/],
    ['Quantity for Travel Bag', /ژمارەی/, /Travel Bag/],
    ['Add Travel Bag to wishlist', /لیستی دڵخوازەکان/, /Travel Bag/],
    ['Remove Travel Bag from wishlist', /لیستی دڵخوازەکان/, /Travel Bag/],
    ['Payment method: Cash on delivery', /شێوازی پارەدان/, /Cash on delivery/],
    ['Registration: 12345', /تۆمارکردن/, /12345/]
  ];
  for (const [input, ...expected] of cases) {
    const out = i18n.translate(input);
    assert.notEqual(out, input, `missing dynamic Sorani translation: ${input}`);
    for (const rx of expected) assert.match(out, rx, `${input} -> ${out}`);
  }
  assert.doesNotMatch(i18n.translate('Could not update wishlist. Please try again.'), /لیستی ئارەزوو/);
});


test('Sorani CKB terminology and limits remain internally consistent', () => {
  const source = fs.readFileSync('public/js/i18n.js', 'utf8');
  const match = source.match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/);
  assert.ok(match);
  const dict = JSON.parse(match[1]).ckb;
  const values = Object.values(dict).join('\n');
  assert.doesNotMatch(values, /٥\s*MB|\b5\s*MB\b/);
  assert.doesNotMatch(values, /١٢\s*(پیت|وشە|کاراکتەر)/);
  assert.doesNotMatch(values, /\barchive\b/i);
  assert.doesNotMatch(values, /کۆوپۆن|ستۆری|لیستی ئارەزوو/);
  for (const key of Object.keys(dict)) {
    if (/\bcheckout\b/i.test(key) && key !== '02 · PAYMENT & ACCOUNT RECOVERY') {
      assert.doesNotMatch(dict[key], /پارەدان/);
    }
  }
});

test('the visible language picker offers English, Sorani, Arabic and Dutch with a neutral English default', () => {
  const header = fs.readFileSync('views/partials/header.ejs', 'utf8');
  const wrangler = fs.readFileSync('wrangler.jsonc', 'utf8');
  const server = fs.readFileSync('src/server.js', 'utf8');
  assert.match(header, /<option value="en"/);
  assert.match(header, /<option value="ckb"/);
  assert.match(header, /<option value="ar"/);
  assert.match(header, /<option value="nl"[\s\S]*Nederlands/);
  assert.match(wrangler, /"DEFAULT_LOCALE": "en"/);
  assert.match(server, /getUiLanguagePreferences\(uiDefaultSetting,uiEnabledSetting/);
  assert.match(server, /acceptedLocales\.has\(cookieLocale\)\?cookieLocale:languagePreferences\.defaultLocale/);
  assert.match(server, /getSetting\('ui_enabled_locales'/);
});

test('Sorani and Arabic dictionaries have no exact English fallback text except literal example/code strings', () => {
  const source = fs.readFileSync('public/js/i18n.js', 'utf8');
  const match = source.match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/);
  assert.ok(match, 'dictionary JSON should be present for auditing');
  const dictionaries = JSON.parse(match[1]);
  const keys = Object.keys(dictionaries.en).sort();
  for (const locale of ['ckb', 'ar']) {
    assert.deepEqual(Object.keys(dictionaries[locale]).sort(), keys, `${locale} dictionary key coverage`);
    const exactFallbacks = keys.filter(key => dictionaries[locale][key] === dictionaries.en[key]);
    assert.deepEqual(exactFallbacks.sort(), ['123456', 'WELCOME10'], `${locale} exact English-value matches`);
  }
});

test('Manager staff page labels and explanations are translated in the actual Sorani and Arabic packs', () => {
  const phrases = [
    'Manager',
    'Manager account',
    'Staff & Manager account',
    'Manage the Manager login and create restricted Admin accounts. Only a signed-in Manager can use this page.',
    'This is the account with full access to products, categories, stock, orders, discounts, stories, customers, storefront settings, audit records and licensing.',
    'Admin accounts can sign in and view the restricted overview only. They cannot create accounts, edit the shop, change settings, or open Manager-only pages. Admin accounts are created here; they are not created from `.env`.',
    'Current Manager password',
    'Update Manager email',
    'Update Manager password',
    'Use a unique password with at least 8 characters. Other active Manager sessions and outstanding password-reset codes will be revoked.'
  ];
  for (const file of ['public/js/i18n-ckb.js', 'public/js/i18n-ar.js']) {
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/);
    assert.ok(match, `${file} dictionary should remain valid JSON`);
    const dictionaries = JSON.parse(match[1]);
    const locale = file.includes('-ckb') ? 'ckb' : 'ar';
    for (const phrase of phrases) {
      assert.ok(dictionaries[locale][phrase], `${locale} missing staff translation: ${phrase}`);
      assert.notEqual(dictionaries[locale][phrase], phrase, `${locale} untranslated staff text: ${phrase}`);
    }
  }
  const sorani = fs.readFileSync('public/js/i18n-ckb.js', 'utf8');
  assert.match(sorani, /"Manager":"بەڕێوەبەر"/);
});

test('settings UI describes regional tax and delivery as manually configured and not legal certification', () => {
  const settings = fs.readFileSync('views/admin/settings.ejs', 'utf8');
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.match(settings, /Regional delivery fee overrides/);
  assert.match(settings, /Regional VAT \/ sales-tax rules/);
  assert.match(settings, /do not discover legal rates, handle every tax category, or certify compliance/);
  assert.match(settings, /Once any tax rule is configured, checkout blocks a destination without a matching rule/);
  assert.match(readme, /city\/postal-prefix delivery-fee overrides/);
  assert.match(readme, /not legal-rate discovery or tax compliance/);
});

test('Dutch translates dynamic checkout and manager phrases without truncating the longest translation', () => {
  const i18n = load('nl-BE');
  const payment = i18n.translate('Payment method: mollie. Provider references and final status are verified server-side.');
  assert.match(payment, /^Betaalmethode: mollie\. Referenties van de aanbieder en de definitieve status worden op de server gecontroleerd\.$/);
  const stock = i18n.translate('Only 3 available. Change the quantity to 3 or less, then update.');
  assert.match(stock, /3/);
  assert.match(stock, /beschikbaar/);
  assert.match(stock, /hoeveelheid/);
  const wishlist = i18n.translate('Add Travel Bag to wishlist');
  assert.match(wishlist, /Travel Bag/);
  assert.match(wishlist, /verlanglijst/);
  const coupon = i18n.translate('Delete coupon WELCOME10?');
  assert.match(coupon, /WELCOME10/);
  assert.match(coupon, /verwijderen/);
});
