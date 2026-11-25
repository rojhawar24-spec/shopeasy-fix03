import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function read(path) { return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'); }
function dict(path, endPattern) {
  const source = read(path);
  const match = source.match(new RegExp(`const dictionary = (\\{[\\s\\S]*\\});\\s*\\n\\s*${endPattern}`));
  assert.ok(match, `${path} dictionary exists`);
  return JSON.parse(match[1]);
}
function load(locale) {
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
  vm.runInNewContext(read('public/js/i18n.js'), { window, document, Element: ElementMock, NodeFilter: { SHOW_TEXT: 4 } });
  return window.ShopEasyI18n;
}

const master = dict('public/js/i18n.js', 'const normalize');
const ckbRuntime = dict('public/js/i18n-ckb.js', 'const normalizeWhitespace');
const arRuntime = dict('public/js/i18n-ar.js', 'const normalizeWhitespace');
const nlRuntime = dict('public/js/i18n-nl.js', 'const normalizeWhitespace');
const critical = [
  'MANAGER SECURITY','Set up your authenticator','This is the first sign-in for this Manager account. Two-factor authentication is required before store management can open. Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password or another TOTP app, or enter the setup key manually below.',
  'Download QR code (PNG)','In your authenticator app, choose the option to enter a setup key manually, then enter this key. Keep it private and do not send it to anyone.',
  'Verify and activate MFA','The browser Back button does not cancel a security challenge. Use this button to safely end this sign-in attempt.',
  'Reset two-factor authentication','Manager accounts cannot remain without MFA. This action turns off the current enrollment, revokes all sessions and requires a fresh authenticator setup the next time you sign in.',
  'MFA ACTIVATED','Save your recovery codes','Each recovery code can be used once if you cannot access your authenticator app. These codes are shown only now. Store them somewhere private and separate from your password.',
  'Do not share these codes. ShopEasy stores only SHA-256 hashes, not the displayed codes.','Continue to Manager dashboard',
  'GDPR tools','Low-stock alerts','No low-stock products.','Product gallery','Check the image gallery below to confirm the cover photo is stored. If the selected photo is not listed there, it did not save as a product image.',
  'Minimum price:','Maximum price:','Thoughtful products, clear prices and cash on delivery.','Payment options shown at checkout.',
  'Mollie payment ID','Open the stored Mollie checkout','Provider-reported chargeback total:','Provider-reported refund total:','Stored Mollie reference:',
  '+ Add combination','Delete image','Customer requests','Returns, exchanges & refunds','You save on this order.',
  'Recorded {amount}. Verify the real transfer separately.','Customer requests from delivered orders appear here.',
  'Mollie’s published merchant-country list does not include Syria and Stripe prohibits direct or indirect dealings involving Syria. Keep COD active unless a regulated provider explicitly confirms your actual legal business and settlement setup in writing.',
  'Add to cart','Choose your options','Delivery cost','Pay on delivery','Availability checked','Delivery & returns',
  'Your security check expired before this action was accepted. Nothing was submitted again. Review the bag, then continue with a fresh secure form.'
];

test('ShopEasy has complete key parity and synchronised runtime packs for English, Sorani, Arabic and Dutch', () => {
  const keys = Object.keys(master.en).sort();
  assert.deepEqual(Object.keys(master.ckb).sort(), keys);
  assert.deepEqual(Object.keys(master.ar).sort(), keys);
  assert.deepEqual(Object.keys(master.nl).sort(), keys);
  for (const key of keys) {
    if (!['123456','WELCOME10'].includes(key)) {
      assert.notEqual(master.ckb[key], key, `Sorani translation is missing: ${key}`);
      if (key !== 'العربية') assert.notEqual(master.ar[key], key, `Arabic translation is missing: ${key}`);
    }
    assert.equal(ckbRuntime.ckb[key], master.ckb[key], `Sorani runtime mismatch: ${key}`);
    assert.equal(arRuntime.ar[key], master.ar[key], `Arabic runtime mismatch: ${key}`);
    assert.equal(nlRuntime.nl[key], master.nl[key], `Dutch runtime mismatch: ${key}`);
  }
  assert.deepEqual(keys.filter(key => master.ckb[key] === key).sort(), ['123456','WELCOME10']);
  assert.deepEqual(keys.filter(key => master.ar[key] === key).sort(), ['123456','WELCOME10','العربية']);
  assert.deepEqual(keys.filter(key => master.nl[key] === key).sort(), ['01 · PRODUCT','123456','Account','Account:','Code','Code *','Contact','Cookies','Filter','Live','Manager','Marketing','Minimum','OK','Percentage','Privacy','PRODUCT','Product','S, M, L','Slug','Status','Status:','Tags','Type','WELCOME10','العربية','product','{count} product','{count}/50','Variant'].sort());
});

test('security, account recovery, storefront and Manager missing-copy gaps are translated in both RTL packs', () => {
  for (const phrase of critical) {
    assert.ok(master.nl[phrase], `Dutch key missing: ${phrase}`);
    assert.notEqual(master.nl[phrase], phrase, `Dutch text untranslated: ${phrase}`);
    assert.ok(master.ckb[phrase], `Sorani key missing: ${phrase}`);
    assert.ok(master.ar[phrase], `Arabic key missing: ${phrase}`);
    assert.notEqual(master.ckb[phrase], phrase, `Sorani text untranslated: ${phrase}`);
    assert.notEqual(master.ar[phrase], phrase, `Arabic text untranslated: ${phrase}`);
  }
});

test('dynamic date, reason, fee, quantity and payment values survive all translated locales', () => {
  const scenarios = [
    ['Previous cancellation request was rejected on 31/10/2026. Reason: customer asked.', /31\/10\/2026/, /customer asked/],
    ['Requested: 31/10/2026. Decide before shipping.', /31\/10\/2026/],
    ['Configured standard fee: €4.50. Any regional override is confirmed at checkout.', /€4\.50/],
    ['Only 3 available. Change the quantity to 3 or less, then update.', /3/],
    ['Payment method: mollie. Provider references and final status are verified server-side.', /mollie/]
  ];
  for (const locale of ['ckb','ar','nl']) {
    const i18n = load(locale);
    for (const [input, ...patterns] of scenarios) {
      const output = i18n.translate(input);
      assert.notEqual(output, input, `${locale} did not translate dynamic message: ${input}`);
      for (const pattern of patterns) assert.match(output, pattern, `${locale} lost interpolated value in ${output}`);
    }
  }
});

test('RTL metadata and cache-busted language assets are wired for both supported RTL languages', () => {
  const header = read('views/partials/header.ejs');
  const footer = read('views/partials/footer.ejs');
  // French is now a selectable, explicitly partial locale. A historical
  // four-language-only regex was rejecting the current correct five-language
  // HTML metadata, although Sorani and Arabic remained RTL throughout.
  assert.match(header, /locale==='ckb'\?'ckb':locale==='ar'\?'ar':locale==='nl'\?'nl-BE':locale==='fr'\?'fr-BE':'en-GB'/);
  assert.match(header, /\['ckb','ar'\]\.includes\(locale\)\?'rtl':'ltr'/);
  for(const code of ['ar','ckb','nl','fr']) {
    assert.match(footer,new RegExp(`i18n-${code}\\.js\\?v=[^"\\s]+`),`versioned translation asset missing: ${code}`);
  }
});
