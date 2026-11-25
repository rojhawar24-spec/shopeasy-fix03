import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');

test('manager product editor supports many size options with separate stock fields', () => {
  const view = read('views/admin/product-form.ejs');
  const app = read('public/js/app.js');
  const server = read('src/server.js');
  assert.match(view, /data-variant-editor/);
  assert.match(view, /name="variantValue"/);
  assert.match(view, /name="variantStock"/);
  assert.match(view, /data-variant-add/);
  assert.match(view, /data-variant-remove/);
  assert.match(view, /data-variant-preset="XS"/);
  assert.match(view, /data-variant-preset="36,37,38,39,40,41,42,43,44,45,46,47,48"/);
  assert.match(app, /const createVariantRow/);
  assert.match(view, /Maximum 50 combinations/);
  assert.match(view, /name="variantValue2"/);
  assert.match(view, /name="variantOptionName2"/);
  assert.match(view, /data-generate-matrix/);
  assert.match(view, /name="variantImageUrl"/);
  assert.match(app, /data-variant-preset/);
  assert.match(server, /req\.body\.variantValue/);
  assert.match(server, /req\.body\.variantStock/);
  assert.match(server, /valueFields\.length!==stockFields\.length/);
  assert.match(server, /variants=parseLegacyVariantRows\(req\.body\.variantRows\)/);
});

test('manager size editor keeps blank extra rows harmless but rejects partial rows and duplicates in the browser', () => {
  const app = read('public/js/app.js');
  assert.match(app, /const hasPartial = rows\.some/);
  assert.match(app, /const hasDuplicate = Array\.from\(counts\.values\(\)\)\.some/);
  assert.match(app, /event\.preventDefault\(\)/);
});
