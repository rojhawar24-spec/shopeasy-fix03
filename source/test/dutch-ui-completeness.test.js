import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
function extract(source, endPattern) {
  const match = source.match(new RegExp(`const dictionary = (\\{[\\s\\S]*\\});\\s*\\n\\s*${endPattern}`));
  assert.ok(match, 'dictionary JSON is present');
  return JSON.parse(match[1]);
}
function runtime(locale) {
  class ElementMock {
    constructor() { this.attributes = new Map(); }
    matches() { return false; }
    closest() { return null; }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelectorAll() { return []; }
  }
  const window = {};
  const document = { documentElement: { lang: locale }, body: new ElementMock(), createTreeWalker() { return { nextNode() { return false; } }; } };
  vm.runInNewContext(read('public/js/i18n-nl.js'), { window, document, Element: ElementMock, NodeFilter: { SHOW_TEXT: 4 } });
  return window.ShopEasyI18n;
}

test('Dutch dictionary and browser runtime contain every current English key', () => {
  const master = extract(read('public/js/i18n.js'), 'const normalize');
  const dutchRuntime = extract(read('public/js/i18n-nl.js'), 'const normalizeWhitespace');
  const enKeys = Object.keys(master.en).sort();
  assert.ok(enKeys.length > 0, 'English dictionary must not be empty');
  assert.deepEqual(Object.keys(master.nl).sort(), enKeys);
  assert.deepEqual(Object.keys(dutchRuntime.nl).sort(), enKeys);
  for (const key of enKeys) assert.equal(dutchRuntime.nl[key], master.nl[key], `runtime mismatch for ${key}`);
});

test('Dutch placeholders are preserved exactly across the complete dictionary', () => {
  const master = extract(read('public/js/i18n.js'), 'const normalize');
  const tokenPattern = /<%=\s*[^%]+?\s*%>|\{[A-Za-z][\w]*\}/g;
  for (const key of Object.keys(master.en)) {
    const sourceTokens = [...key.matchAll(tokenPattern)].map(match => match[0]).sort();
    const translatedTokens = [...master.nl[key].matchAll(tokenPattern)].map(match => match[0]).sort();
    assert.deepEqual(translatedTokens, sourceTokens, `placeholder mismatch: ${key}`);
  }
});

test('Dutch has no accidental exact English fallbacks beyond approved codes, labels and proper terms', () => {
  const master = extract(read('public/js/i18n.js'), 'const normalize');
  const identical = Object.keys(master.en).filter(key => master.nl[key] === key).sort();
  const approved = ['01 · PRODUCT','123456','Account','Account:','Code','Code *','Contact','Cookies','Filter','Live','Manager','Marketing','Minimum','OK','Percentage','Privacy','PRODUCT','Product','S, M, L','Slug','Status','Status:','Tags','Type','WELCOME10','Variant','product','{count} product','{count}/50','العربية'].sort();
  assert.deepEqual(identical, approved);
});

test('all language runtimes translate accessible image alt text', () => {
  for (const locale of ['nl','ar','ckb']) {
    const source = read(`public/js/i18n-${locale}.js`);
    assert.match(source, /'alt'/);
    assert.match(source, /\[alt\]/);
  }
});

test('Dutch locale is exposed as Dutch (Belgium), LTR, and has localized storefront/legal copy', () => {
  const config = read('src/store-config.js');
  const server = read('src/server.js');
  const header = read('views/partials/header.ejs');
  const footer = read('views/partials/footer.ejs');
  const settings = read('views/admin/settings.ejs');
  const home = read('views/home.ejs');
  assert.match(config, /code: 'nl'.*nativeLabel: 'Nederlands'.*dir: 'ltr'/);
  assert.match(config, /if \(locale === 'nl'\) return 'nl-BE'/);
  assert.match(server, /BRANDING_LOCALES = Object.freeze\(\['en','ckb','ar','nl','fr'\]\)/);
  assert.match(server, /privacyPolicyNl/);
  assert.match(server, /termsPolicyNl/);
  assert.match(server, /shippingPolicyNl/);
  assert.match(server, /returnsPolicyNl/);
  assert.match(header, /<option value="nl"[\s\S]*Nederlands/);
  assert.match(header, /locale==='nl'\?'nl-BE':locale==='fr'\?'fr-BE':'en-GB'/);
  assert.match(header, /nl_BE/);
  assert.match(footer, /i18n-nl\.js/);
  assert.match(footer, /Alle rechten voorbehouden\./, 'dynamic licensor copyright suffix is rendered in Dutch');
  assert.match(footer, /locale===\'nl\'[\s\S]*Noodzakelijke opslag ondersteunt je account/);
  assert.match(footer, /Noodzakelijke opslag ondersteunt je account/);
  assert.match(footer, /locale===\'nl\'[\s\S]*De browseropslag is niet beschikbaar/);
  assert.match(settings, /locale.code==='nl'\?'Nl'/);
  assert.match(settings, /Engelse beleidsteksten zijn vereist om de winkel volledig te kunnen activeren/);
  assert.match(settings, /Dutch, Sorani and Arabic translations are optional/);
  assert.match(home, /Er komt iets moois aan/);
});

test('Dutch runtime handles locale metadata and dynamic interpolated values', () => {
  const i18n = runtime('nl-BE');
  assert.equal(i18n.locale, 'nl');
  assert.equal(i18n.translate('Payment method: mollie. Provider references and final status are verified server-side.'), 'Betaalmethode: mollie. Referenties van de aanbieder en de definitieve status worden op de server gecontroleerd.');
  assert.equal(i18n.translate('Previous cancellation request was rejected on 31/10/2026. Reason: CUSTOMER REQUEST'), 'Het vorige annuleringsverzoek is afgewezen op 31/10/2026. Reden: CUSTOMER REQUEST');
  assert.equal(i18n.translate('Remove combination 4'), 'Combinatie 4 verwijderen');
  assert.equal(i18n.translate('Cancel this order?'), 'Deze bestelling annuleren?');
  assert.equal(i18n.translate('QR code for the ShopEasy authenticator setup'), 'QR-code voor de installatie van de verificatie-app van ShopEasy');
  assert.equal(i18n.translate('Delete this image from the product? If it is the main cover, the next image will become the cover. This cannot be undone.'), 'Deze afbeelding van het product verwijderen? Als dit de hoofdfoto is, wordt de volgende afbeelding de hoofdfoto. Dit kan niet ongedaan worden gemaakt.');
  assert.equal(i18n.translate('Country A\nCountry B'), 'Land A\nLand B');
  assert.equal(i18n.translate('Enter discount code'), 'Voer kortingscode in');
});
