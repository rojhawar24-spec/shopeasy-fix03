import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const rootBlock = css.match(/:root\s*\{([^}]*)\}/s)?.[1] ?? '';
const token = (name) => rootBlock.match(new RegExp(`${name}\\s*:\\s*([^;]+)`))?.[1]?.trim() ?? '';
function rgb(hex) {
  const value = hex.replace('#', '').trim();
  assert.match(value, /^[\da-f]{6}$/i, `expected a six-digit hex color, got ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}
function luminance(hex) {
  const channels = rgb(hex).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('E2 accent text and inverse CTA meet WCAG AA contrast', () => {
  assert.ok(contrast(token('--accent-strong'), token('--canvas')) >= 4.5);
  assert.ok(contrast(token('--accent-strong'), token('--paper')) >= 4.5);
  assert.ok(contrast('#FFFFFF', token('--accent-strong')) >= 4.5);
  assert.ok(contrast(token('--focus'), token('--canvas')) >= 3);
});

test('form-control boundaries remain visible on white surfaces', () => {
  assert.ok(contrast(token('--control'), token('--paper')) >= 3);
  assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\), select, textarea \{[^}]*border: 1px solid var\(--control\)/);
});

test('E2 radius hierarchy is consistent and every radius token is used', () => {
  assert.equal(token('--radius'), '14px');
  assert.equal(token('--radius-sm'), '10px');
  assert.equal(token('--radius-xs'), '7px');
  assert.equal(token('--pill'), '999px');
  for (const name of ['--radius', '--radius-sm', '--radius-xs', '--pill']) assert.match(css, new RegExp(`var\\(${name}\\)`));
});

test('catalogue and product detail photography preserve complete product images', () => {
  assert.match(css, /\.product-image img\s*\{[^}]*object-fit: contain/s);
  assert.match(css, /\.product-visual > img, \.product-visual-v5 > img, \.product-visual-v6 > img\s*\{[^}]*object-fit: contain/s);
  assert.match(css, /\.product-gallery-thumbnail img\s*\{[^}]*object-fit: contain/s);
});

test('mobile catalogue keeps two readable columns and product text legible', () => {
  assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*?\.product-grid, \.shop-grid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.product-title-block h3 \{ font-size: 14px; line-height: 1\.35; \}/);
  assert.match(css, /\.price\.price-premium \{ font-size: 16px; \}/);
  assert.match(css, /\.product-card-meta-row \{[^}]*font-size: 13px;[^}]*\}/);
});
