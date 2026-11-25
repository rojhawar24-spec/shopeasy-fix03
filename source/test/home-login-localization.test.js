import test from 'node:test';
import assert from 'node:assert/strict';
import { pageText } from '../src/home-login-copy.js';

test('Home primary action is translated before browser JavaScript runs', () => {
  const expected = {
    nl: 'Bekijk ons assortiment',
    fr: 'Découvrir la collection',
    ar: 'تصفّح المجموعة',
    ckb: 'کۆمەڵە بەرهەمەکان ببینە'
  };
  for (const [locale, translation] of Object.entries(expected)) {
    assert.equal(pageText(locale, 'Shop the collection'), translation);
  }
});

test('Home clear policies means transparent conditions rather than deleting settings', () => {
  assert.equal(pageText('fr', 'Clear policies'), 'Des conditions claires');
  assert.equal(pageText('nl', 'Clear policies'), 'Duidelijke voorwaarden');
  assert.equal(pageText('ar', 'Clear policies'), 'سياسات واضحة');
  assert.equal(pageText('ckb', 'Clear policies'), 'سیاسەتی ڕوون');
});

test('expired sign-in guidance asks for the password again in every supported translation', () => {
  const message = 'Your sign-in form expired. Enter your password again to continue.';
  const expected = {
    nl: 'Je inlogformulier is verlopen. Voer je wachtwoord opnieuw in om verder te gaan.',
    fr: 'Votre formulaire de connexion a expiré. Saisissez à nouveau votre mot de passe pour continuer.',
    ar: 'انتهت صلاحية نموذج تسجيل الدخول. أدخل كلمة المرور مرة أخرى للمتابعة.',
    ckb: 'ماوەی فۆرمی چوونەژوورەوەکەت تەواو بووە. وشەی نهێنییەکەت دووبارە بنووسە بۆ بەردەوامبوون.'
  };
  for (const [locale, translation] of Object.entries(expected)) {
    assert.equal(pageText(locale, message), translation);
  }
  assert.equal(pageText('en', message), message);
});

test('interface translation preserves seller-authored content and surrounding whitespace', () => {
  const sellerText = '  Roj’s London collection — édition 2026  ';
  for (const locale of ['en', 'nl', 'fr', 'ar', 'ckb']) {
    assert.equal(pageText(locale, sellerText), sellerText);
  }
  assert.equal(pageText('fr', '  Contact us  '), '  Nous contacter  ');
});

test('product-card actions and stock counts are localized on the server', () => {
  const expected = {
    nl: ['Snel bekijken', 'Nog maar 3 over', '1 optie', '2 opties', 'Op voorraad'],
    fr: ['Aperçu rapide', 'Plus que 3 disponibles', '1 option', '2 options', 'En stock'],
    ar: ['عرض سريع', 'لم يتبق سوى 3', '1 خيار', '2 خيارات', 'متوفر'],
    ckb: ['بینینی خێرا', 'تەنها 3 دانە ماوە', '1 هەڵبژاردە', '2 هەڵبژاردە', 'بەردەستە']
  };
  for (const [locale, translations] of Object.entries(expected)) {
    assert.deepEqual([
      pageText(locale, 'Quick view'),
      pageText(locale, 'Only {count} left', { count: 3 }),
      pageText(locale, '{count} option', { count: 1 }),
      pageText(locale, '{count} options', { count: 2 }),
      pageText(locale, 'In stock')
    ], translations);
  }
});

test('product names are substituted once and remain literal inside translated labels', () => {
  const name = 'In stock {count} $& — Roj’s <collection>';
  assert.equal(pageText('fr', 'View {name}', { name, count: 8 }), `Voir ${name}`);
  assert.equal(pageText('en', 'View {name}', { name, count: 8 }), `View ${name}`);
  assert.equal(pageText('nl', '  View {name}  ', { name }), `  ${name} bekijken  `);
  assert.equal(pageText('fr', 'View {name}'), 'Voir {name}');
  assert.equal(pageText('fr', 'View {name}', Object.create({ name: 'inherited' })), 'Voir {name}');
});

test('unknown seller copy and object-prototype names are never treated as interface templates', () => {
  const sellerText = 'Roj’s {name} collection';
  assert.equal(pageText('fr', sellerText, { name: 'Replacement' }), sellerText);
  for (const text of ['constructor', 'toString', '__proto__']) {
    assert.equal(pageText('fr', text), text);
  }
});

test('Sorani assistant disclosure retains the complete data-sharing and retention explanation', () => {
  const disclosure = 'Your question and up to 12 public product fields (name, description, current selling price in the store currency, sellable stock after reservations and product slug) are sent to the configured AI provider. Obvious email addresses, phone numbers, IBAN-like values and recognizable street addresses are removed, but not all personal information can be detected automatically. Never enter names, addresses, contact details, account numbers, order details, passwords or payment data. The external AI provider processes submitted text under its own terms and retention policy.';
  const sorani = pageText('ckb', disclosure);
  assert.ok(sorani.length > 500);
  assert.ok(sorani.includes('زۆرترین ١٢ زانیاریی گشتیی بەرهەم'));
  assert.ok(sorani.includes('وشەی نهێنی یان زانیاریی پارەدان مەنووسە'));
  assert.ok(sorani.includes('مەرج و ماوەی هەڵگرتنی خۆی'));
});
