import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('test/fixtures/legacy-css/design-v13.css');
const luminance = hex => {
  const channels = hex.replace('#', '').match(/.{2}/g).map(pair => parseInt(pair, 16) / 255);
  const [r, g, b] = channels.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
};
const contrast = (fg, bg) => {
  const [high, low] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (high + .05) / (low + .05);
};

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('V13 uses a quiet green-neutral palette with readable high-contrast primary actions', () => {
  for (const token of [
    '--bg: #f7f9f6', '--ink: #172820', '--accent: #216044',
    '.product-card-signature:hover', '.category-card-image:hover',
    '.form-stack input:focus', '.site-footer', '@media (max-width: 760px)',
    '@media (max-width: 380px)', '@media (prefers-reduced-motion: reduce)',
    '@media (forced-colors: active)', 'html[dir="rtl"]'
  ]) assert.ok(css.includes(token), `missing design rule: ${token}`);
  assert.ok(contrast('#ffffff', '#216044') >= 4.5, 'white on primary action must meet WCAG AA contrast');
  assert.ok(contrast('#ffffff', '#174832') >= 4.5, 'white on hover action must meet WCAG AA contrast');
  assert.doesNotMatch(css, /font-size:\s*[1-9]px\s*;/, 'design must not introduce tiny text');
});

test('V13 is presentation-only and preserves checkout, locale direction and current test coverage', () => {
  const css = read('test/fixtures/legacy-css/design-v13.css');
  const checkout = read('views/checkout.ejs');
  const header = read('views/partials/header.ejs');
  assert.match(checkout, /action="\/checkout"/);
  assert.match(checkout, /name="_csrf"/);
  assert.match(header, /dir="<%= \['ckb','ar','kmr'\]\.includes\(locale\)\?'rtl':'ltr' %>"/);
  assert.match(css, /html\[dir="rtl"\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});
