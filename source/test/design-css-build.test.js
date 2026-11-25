import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicCssDir = path.join(root, 'public', 'css');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const legacyFiles = [
  'style.css', 'design-v10.css', 'design-v11.css', 'design-v12.css', 'design-v13.css',
  'design-v14.css', 'design-v15.css', 'design-v16.css', 'design-v17-overrides.css',
  'design-v17.css', 'storefront-theme.css', 'product-gallery-manager-polish.css'
];

test('runtime compiles five readable design sources to two assets around the dynamic shop theme', () => {
  const publicCss = fs.readdirSync(publicCssDir).filter(name => name.endsWith('.css')).sort();
  assert.deepEqual(publicCss, ['app.css','design-foundation.min.css','design-polish.min.css','design-tokens.css','editorial-2027.css','research-polish-2027.css','retail-2027.css']);
  const header = read('views/partials/header.ejs');
  const preview = read('PREVIEW.html');
  for(const name of ['design-foundation.min.css','design-polish.min.css']){
    assert.ok(header.includes(`/css/${name}?v=`), `runtime missing ${name}`);
    assert.ok(preview.includes(`./public/css/${name}?v=`), `preview missing ${name}`);
  }
  assert.match(header,/\/theme\/shop\.css\?v=/);
  assert.doesNotMatch(header + preview, /(?:style|design-v(?:10|11|12|13|14|15|16|17)(?:-overrides)?|storefront-theme|product-gallery-manager-polish)\.css/);
});

test('historical CSS fixtures are test-only and are not copied into public assets', () => {
  for (const name of legacyFiles) {
    assert.ok(fs.existsSync(path.join(root, 'test', 'fixtures', 'legacy-css', name)), `missing preserved regression fixture ${name}`);
    assert.ok(!fs.existsSync(path.join(publicCssDir, name)), `legacy stylesheet ${name} must not be shipped publicly`);
  }
});

test('design CSS build command verifies every current versioned layer and its preview equivalent', () => {
  const script = read('scripts/build-design-css.mjs');
  assert.match(script, /versioned static layers/);
  assert.match(script, /duplicates\.size/);
  assert.match(script, /\/theme\/shop\.css/);
  assert.doesNotMatch(script, /design-v17-overrides|Imported legacy layer/);
});
