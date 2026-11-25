import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewsRoot = path.join(root, 'views');
const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
// MFA setup intentionally has a small page-specific script so QR controls do not
// get coupled to all storefront interactions. Validate handlers in that script too.
const mfaSetupJs = fs.readFileSync(path.join(root, 'public/js/mfa-setup.js'), 'utf8');
const retailJs = fs.readFileSync(path.join(root, 'public/js/retail-2027.js'), 'utf8');
const photoZoomJs = fs.readFileSync(path.join(root, 'public/js/product-photo-zoom.js'), 'utf8');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() && file.endsWith('.ejs') ? [file] : [];
  });
}

const templates = walk(viewsRoot).map((file) => ({
  file,
  source: fs.readFileSync(file, 'utf8'),
}));

// EJS expressions can contain `>` before the real HTML tag terminator. Skip
// `<% ... %>` blocks so the scanner inspects the complete HTML opening tag.
function openingTags(source, tagName) {
  const out = [];
  const startPattern = new RegExp(`<${tagName}\\b`, 'gi');
  for (const match of source.matchAll(startPattern)) {
    let index = match.index + match[0].length;
    while (index < source.length) {
      if (source.startsWith('<%', index)) {
        const end = source.indexOf('%>', index + 2);
        if (end < 0) break;
        index = end + 2;
        continue;
      }
      if (source[index] === '>') {
        out.push({ index: match.index, tag: source.slice(match.index, index + 1) });
        break;
      }
      index += 1;
    }
  }
  return out;
}

test('EJS templates do not nest HTML forms', () => {
  const nested = [];
  for (const template of templates) {
    let depth = 0;
    const tokens = [
      ...[...template.source.matchAll(/<form\b[^>]*>/gis)].map((match) => ({ index: match.index, type: 'open' })),
      ...[...template.source.matchAll(/<\/form\s*>/gis)].map((match) => ({ index: match.index, type: 'close' })),
    ].sort((a, b) => a.index - b.index);

    for (const token of tokens) {
      if (token.type === 'open') {
        if (depth > 0) nested.push(`${path.relative(root, template.file)}:${template.source.slice(0, token.index).split('\n').length}`);
        depth += 1;
      } else {
        depth = Math.max(0, depth - 1);
      }
    }
  }
  assert.deepEqual(nested, [], `Nested forms are invalid HTML and can send buttons to the wrong action:\n${nested.join('\n')}`);
});

test('every non-submit button in EJS has a matching app.js interaction handler', () => {
  const missing = [];
  const homeLoginJs = fs.readFileSync(path.join(root, 'public/js/home-login.js'), 'utf8');
  const handlers = [
    { attribute: 'data-password-toggle', handler: /toggle\.addEventListener\('click'/, source:'home-login' },
    { attribute: 'data-story-open', handler: /storyButtons\.forEach\([\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-story-close', handler: /close\.addEventListener\('click'/ },
    { attribute: 'data-story-prev', handler: /previous\.addEventListener\('click'/ },
    { attribute: 'data-story-next', handler: /next\.addEventListener\('click'/ },
    { attribute: 'data-cart-qty-step', handler: /querySelectorAll\('\.cart-qty-stepper \[data-cart-qty-step\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-shop-filter-toggle', handler: /toggle\.addEventListener\('click'/ },
    { attribute: 'data-menu-toggle', handler: /menu\.addEventListener\('click'/ },
    { attribute: 'data-search-toggle', handler: /searchToggle\.addEventListener\('click'/ },
    { attribute: 'data-search-close', handler: /mobileSearchClose\?\.addEventListener\('click'/ },
    { attribute: 'data-wishlist-toggle', handler: /querySelectorAll\('\[data-wishlist-toggle\]'\)/ },
    { attribute: 'data-ai-ask', handler: /ask\.addEventListener\('click'/ },
    { attribute: 'data-print-order', handler: /querySelectorAll\('\[data-print-order\]'\)/ },
    { attribute: 'data-smart-back', handler: /querySelectorAll\('\[data-smart-back\]'\)/ },
    { attribute: 'data-variant-remove', handler: /querySelectorAll\('\[data-variant-remove\]'\)/ },
    { attribute: 'data-variant-add', handler: /querySelector\('\[data-variant-add\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-variant-preset', handler: /querySelectorAll\('\[data-variant-preset\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-generate-matrix', handler: /querySelector\('\[data-generate-matrix\]'\)\?\.addEventListener\('click'/ },
    { attribute: 'data-gallery-image', handler: /querySelectorAll\('\[data-gallery-image\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-cookie-open', handler: /querySelectorAll\('\[data-cookie-open\]'\)[\s\S]*?addEventListener\('click', openCookiePreferences\)/ },
    { attribute: 'data-cookie-accept', handler: /querySelectorAll\('\[data-cookie-accept\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-cookie-reject', handler: /querySelectorAll\('\[data-cookie-reject\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-cookie-customize', handler: /querySelectorAll\('\[data-cookie-customize\]'\)[\s\S]*?addEventListener\('click', openCookiePreferences\)/ },
    { attribute: 'data-cookie-close', handler: /querySelectorAll\('\[data-cookie-close\]'\)[\s\S]*?addEventListener\('click'/ },
    { attribute: 'data-cookie-save', handler: /querySelector\('\[data-cookie-save\]'\)\?\.addEventListener\('click'/ },
    { attribute: 'data-cookie-reset', handler: /querySelector\('\[data-cookie-reset\]'\)\?\.addEventListener\('click'/ },
    { attribute: 'class="nav-category-trigger"', handler: /trigger\.addEventListener\('click'/ },
    // These progressive-enhancement controls are handled in retail-2027.js,
    // which is loaded by the shared footer; they must not be treated as dead buttons.
    { attribute: 'data-cart-drawer-close', handler: /const closeDrawer=\(\)=>\{invalidateRequest\(\);drawer\.close\(\);\};[\s\S]*?close\.addEventListener\('click',closeDrawer\)/, source:'retail' },
    { attribute: 'data-language-suggestion-dismiss', handler: /data-language-suggestion-dismiss[\s\S]*?addEventListener\('click'/, source:'retail' },
    { attribute: 'data-quick-close', handler: /data-quick-close[\s\S]*?addEventListener\('click'/, source:'retail' },
    { attribute: 'data-compare-open', handler: /compareButton\.addEventListener\('click'/, source:'retail' },
    { attribute: 'data-compare-close', handler: /data-compare-close[\s\S]*?addEventListener\('click'/, source:'retail' },
    { attribute: 'data-theme-toggle', handler: /themeButtons[\s\S]*?button\.addEventListener\('click'/, source:'retail' },
    { attribute: 'data-product-photo-close', handler: /close\.addEventListener\('click',\s*\(\)\s*=>\s*dialog\.close\(\)\)/, source:'photo-zoom' },
    { attribute: 'data-quick-view', handler: /closest\('\[data-quick-view\]'\)/, source:'retail' },
    { attribute: 'data-compare-add', handler: /closest\('\[data-compare-add\]'\)/, source:'retail' },
    { attribute: 'data-purchase-focus', handler: /mobilePurchase[\s\S]*?addEventListener\('click'/, source:'retail' },

  ];
  const pageSpecificHandlers = [
    { attribute: 'id="mfa-download-qr"', handler: /downloadButton\.addEventListener\('click'/ },
    { attribute: 'id="mfa-copy-key"', handler: /copyButton\.addEventListener\('click'/ },
  ];

  for (const template of templates) {
    for (const match of openingTags(template.source, 'button')) {
      const tag = match.tag;
      if (!/\btype\s*=\s*(["'])button\1/i.test(tag)) continue;
      if (/\bdisabled(?:\s|>|$)/i.test(tag)) continue;
      const registered = handlers.some(({ attribute, handler, source }) => tag.includes(attribute) && handler.test(source === 'home-login' ? homeLoginJs : source === 'photo-zoom' ? photoZoomJs : source === 'retail' ? retailJs : appJs))
        || pageSpecificHandlers.some(({ attribute, handler }) => tag.includes(attribute) && handler.test(mfaSetupJs));
      if (!registered) {
        const line = template.source.slice(0, match.index).split('\n').length;
        missing.push(`${path.relative(root, template.file)}:${line} ${tag.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Buttons without a known frontend click handler:\n${missing.join('\n')}`);
});

test('quick-restock forms are independent from product-save and refresh CSRF before submitting', () => {
  const productForm = fs.readFileSync(path.join(viewsRoot, 'admin/product-form.ejs'), 'utf8');
  const firstRestock = productForm.indexOf('action="/admin/products/restock"');
  const productSave = productForm.indexOf('action="/admin/products/save"');
  assert.ok(firstRestock >= 0, 'variant quick-restock action should exist');
  assert.ok(productSave > firstRestock, 'quick-restock controls must be outside and before the product-save form');
  assert.equal((productForm.match(/action="\/admin\/products\/restock"[^>]*data-refresh-csrf/g) || []).length, 2,
    'both variant and regular-product restock forms should refresh their CSRF token');
  assert.equal((productForm.match(/action="\/admin\/products\/save"/g) || []).length, 1,
    'there should be exactly one product-save form');
});

test('static preview search, mobile menu and clear-search buttons have click/submit handlers', () => {
  const preview = fs.readFileSync(path.join(root, 'PREVIEW.html'), 'utf8');
  assert.match(preview, /id="preview-search-form"/);
  assert.match(preview, /querySelector\('#preview-search-form'\)/);
  assert.match(preview, /form\?\.addEventListener\('submit'/);
  assert.match(preview, /data-menu-toggle/);
  assert.match(preview, /menu\?\.addEventListener\('click'/);
  assert.match(preview, /id="preview-clear-search"/);
  assert.match(preview, /querySelector\('#preview-clear-search'\)\?\.addEventListener\('click'/);
});
