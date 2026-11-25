import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('V15 Phase 5 preserves a visible keyboard focus indicator on controls and invalid fields', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /:where\(input, select, textarea, button\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--v15-ring\)/s);
  assert.match(css, /\[aria-invalid="true"\]:focus-visible\s*\{[^}]*outline-color:\s*var\(--v15-danger\)/s);
});

test('V15 Phase 5 keeps form controls and uploaded files inside narrow layouts', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /:where\(\.form-stack, \.form-section, \.checkout-form-v5, \.admin-filters\) input\[type="file"\]\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /:where\(\.form-stack, \.form-section, \.checkout-form-v5, \.admin-filters\) :where\(input, select, textarea\)\s*\{\s*max-width:\s*100%/s);
});

test('V15 Phase 5 constrains dialog media and scroll height for small screens', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /:where\(dialog, \[role="dialog"\]\)\s*\{[^}]*max-height:\s*min\(88dvh, 900px\)[^}]*overflow:\s*auto/s);
  assert.match(css, /:where\(dialog, \[role="dialog"\]\) :where\(img, video, canvas, iframe\)\s*\{\s*max-width:\s*100%/s);
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

