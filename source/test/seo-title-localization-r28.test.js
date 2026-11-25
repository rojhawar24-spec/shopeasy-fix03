import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';
import {customerText} from '../src/customer-page-copy.js';

function head(title, locale, pathname, extra = {}) {
  const source = fs.readFileSync(new URL('../views/partials/header.ejs', import.meta.url), 'utf8');
  const boundary = source.indexOf('</head>');
  assert.ok(boundary > 0);
  return ejs.render(source.slice(0, boundary + 7), {
    title, locale, path: pathname, storeName: 'Audit <Store>', appearance: {darkMode: false},
    isAdminRoute: false, isCheckoutRoute: false, csrf: 'fixture-only', shopLogo: '/assets/logo.svg',
    seoAlternateLinks: [], seoCanonicalUrl: '', seoNoIndex: false,
    safeImageUrl: value => value, customerText: value => customerText(locale, value), ...extra
  });
}

test('static French page titles use the same server translations as page headings', () => {
  for (const [raw, expected, route] of [['Stories', 'Actualités', '/stories'], ['Forgot your password?', 'Mot de passe oublié ?', '/forgot-password']]) {
    const html = head(raw, 'fr', route);
    assert.ok(html.includes(`<title>${expected} · Audit &lt;Store&gt;</title>`), 'French metadata must not fall back to an English interface label');
  }
});

test('merchant product and category names are not translated when they collide with interface labels', () => {
  for (const [route, extra] of [['/product/account', {product: {name: 'Account'}}], ['/category/account', {categoryInfo: {name: 'Account'}}]]) {
    const html = head('Account', 'fr', route, extra);
    assert.ok(html.includes('<title>Account · Audit &lt;Store&gt;</title>'), 'merchant names remain literal');
    assert.ok(!html.includes('<title>Compte'), 'an interface translation cannot rename a merchant product/category');
  }
  assert.ok(head('Account', 'fr', '/account').includes('<title>Compte ·'), 'actual account interface title remains translated');
  assert.ok(head('Product not found', 'fr', '/product/missing').includes('<title>Produit introuvable ·'), 'missing product error remains an interface title');
});

test('cookie metadata uses the localized policy title instead of a stale caller title', () => {
  const source = fs.readFileSync(new URL('../views/cookies.ejs', import.meta.url), 'utf8');
  let metadata;
  ejs.render(source, {locale: 'fr', title: 'Cookie policy', include: (name, data) => {if (name === 'partials/header') metadata = data; return '';}});
  assert.equal(metadata.title, 'Politique des cookies');
});

test('category pages pass their actual merchant category name to the page header', () => {
  const firstLine = fs.readFileSync(new URL('../views/shop.ejs', import.meta.url), 'utf8').split('\n')[0];
  let title;
  ejs.render(firstLine, {categoryInfo: {name: 'Account'}, include: (_name, values) => {title = values.title; return '';}});
  assert.equal(title, 'Account');
});
