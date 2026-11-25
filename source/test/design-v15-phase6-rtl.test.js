import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('V15 Phase 6 applies explicit RTL alignment to shared navigation and page structures', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /html\[dir="rtl"\] :where\(\.breadcrumbs, \.section-head, \.panel-head, \.panel-heading-v5, \.summary-head, \.summary-heading\)/);
  assert.match(css, /html\[dir="rtl"\] \.nav-links\.open > a/);
});

test('V15 Phase 6 keeps email, phone, URL, password and numeric inputs readable in their natural direction', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /input:not\(\[type="email"\]\):not\(\[type="tel"\]\):not\(\[type="url"\]\):not\(\[type="password"\]\):not\(\[type="number"\]\):not\(\[inputmode="decimal"\]\)/);
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

