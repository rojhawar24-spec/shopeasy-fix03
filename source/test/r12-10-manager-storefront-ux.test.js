import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const dictionary = () => {
  const source = read('public/js/i18n.js');
  const start = source.indexOf('const dictionary = ') + 'const dictionary = '.length;
  const marker = source.indexOf('const normalizeWhitespace', start);
  const end = source.lastIndexOf(';', marker);
  assert.ok(start > 0 && end > start, 'translation dictionary boundary should exist');
  return JSON.parse(source.slice(start, end).trim());
};

test('all Manager pages share one grouped navigation instead of a dashboard-only sidebar', () => {
  const nav = read('views/partials/admin-nav.ejs');
  const dashboard = read('views/admin/dashboard.ejs');
  assert.match(nav, /WORKSPACE/);
  assert.match(nav, /CATALOGUE/);
  assert.match(nav, /SALES/);
  assert.match(nav, /PROMOTIONS/);
  assert.match(nav, /STORE CONTENT/);
  assert.match(nav, /MANAGER TOOLS/);
  assert.match(dashboard, /include\('\.\.\/partials\/admin-nav'\)/);
  assert.doesNotMatch(dashboard, /manager-dashboard-sidebar|manager-flow|STORE MANAGEMENT/);
  for (const file of fs.readdirSync(new URL('../views/admin/', import.meta.url)).filter(name => name.endsWith('.ejs') && !['limited-dashboard.ejs','dashboard.ejs'].includes(name))) {
    const source = read(`views/admin/${file}`);
    if (source.includes('admin-nav')) assert.match(source, /include\('\.\.\/partials\/admin-nav'\)/, `${file} uses the shared navigation`);
  }
});

test('catalogue cards open product details and never add to the bag directly', () => {
  const card = read('views/partials/product-card.ejs');
  assert.match(card, /href="\/product\//);
  assert.match(card, /View product/);
  assert.doesNotMatch(card, /action="\/cart\/add"/);
  assert.doesNotMatch(card, /product-card-thumbnails|product-image-corner/);
  assert.doesNotMatch(read('public/css/app.css'), /product-card-thumbnails|product-image-corner/);
});

test('product inventory editor explains simple stock versus customer-selectable options', () => {
  const form = read('views/admin/product-form.ejs');
  assert.match(form, /Do customers need to choose an option before buying\?/);
  assert.match(form, /Most products have one stock quantity/);
  assert.match(form, /Generate the combinations/);
  assert.match(form, /Total available across all options/);
  assert.match(form, /data-variant-label-one/);
  assert.match(form, /variant-row-advanced/);
  assert.match(form, /First option name/);
  assert.match(form, /Second option name/);
  assert.match(form, /data-option-two-values-field/);
});

test('settings has separate checkout readiness and saved configuration summary headings', () => {
  const settings = read('views/admin/settings.ejs');
  assert.match(settings, /BEFORE CUSTOMERS CAN ORDER/);
  assert.match(settings, /CURRENT STORE CONFIGURATION/);
  assert.match(settings, /Edit any field, then select Save settings/);
});


test('grouped Manager navigation has translated labels in all supported locales', () => {
  const d = dictionary();
  const labels = ['WORKSPACE','CATALOGUE','SALES','PROMOTIONS','STORE CONTENT','MANAGER TOOLS','Overview','Products','Categories','Orders','Returns','Customers','Discounts','Stories','Storefront','Settings','Staff & account','Audit trail','Privacy tools','License','View shop ↗'];
  for (const locale of ['en','nl','ckb','ar']) {
    for (const label of labels) assert.equal(typeof d[locale][label], 'string', `${locale}: missing ${label}`);
  }
  for (const locale of ['nl','ckb','ar']) {
    for (const label of labels) assert.notEqual(d[locale][label], label, `${locale}: untranslated ${label}`);
  }
});
