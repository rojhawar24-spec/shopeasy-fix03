import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('RTL/LTR structure and functional storefront hooks remain present', () => {
  const header = read('views/partials/header.ejs');
  const home = read('views/home.ejs');
  const checkout = read('views/checkout.ejs');
  assert.match(header, /dir="<%= \['ckb','ar','kmr'\]\.includes\(locale\)\?'rtl':'ltr' %>"/);
  assert.match(header, /data-search-toggle/);
  assert.match(home, /href="\/shop"/);
  assert.match(checkout, /name="paymentMethod" value="cash_on_delivery"/);
  assert.match(checkout, /data-submit-once/);
});
