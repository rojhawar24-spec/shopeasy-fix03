import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('V15 supplies consistent interaction, responsive, RTL/LTR and reduced-motion behavior', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  for (const rule of [
    '--v15-bg:', '--v15-brand:', '--v15-ink:', '--v15-border:',
    '.product-card-signature', '.product-visual-v5', '.stage-image', '.category-card-media',
    '.cart-layout-v5', '.checkout-layout-v5', '.story-grid', '.admin-nav', '.table-wrap',
    'min-height: 44px', 'html[dir="rtl"]', '@media (max-width: 760px)',
    '@media (max-width: 430px)', '@media (prefers-reduced-motion: reduce)', '@media (forced-colors: active)'
  ]) assert.ok(css.includes(rule), `V15 CSS is missing required coverage: ${rule}`);
  assert.doesNotMatch(css, /font-size:\s*[1-9]px\s*;/, 'V15 should not introduce text smaller than 10px');
  assert.match(css, /:focus-visible/);
});

test('Touch devices show a product-image action without relying on hover', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /@media\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*?\.product-card-signature \.product-image-corner\s*\{[^}]*display:\s*inline-flex;[^}]*opacity:\s*1;[^}]*transform:\s*none;/);
});

test('Image fallback chain is local-only, bounded and avoids repeat loops', () => {
  const js = read('public/js/image-fallback.js');
  for (const required of ['data-fallback-src', 'data-fallback-secondary-src', 'fallbackFailedUrls', 'new Set', 'candidates.find', 'shopeasy:image-fallback-exhausted', 'activeFallbackUrl', 'classList.remove(']) {
    assert.ok(js.includes(required), `fallback safety mechanism missing: ${required}`);
  }
  assert.match(js, /raw\.startsWith\('\/'\) && !raw\.startsWith\('\/\/'\)/);
  assert.match(js, /raw\.startsWith\('\.\/'\)/);
  assert.match(js, /image\.dataset\.fallbackFailedUrls = \[\.\.\.failed\]\.join\('\\n'\)/);
});

test('Every commerce and content image surface has a meaningful fallback', () => {
  const expected = [
    ['views/home.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
        ['views/partials/product-card.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/product.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/shop.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/cart.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/checkout.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/order.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/admin/products.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/admin/product-form.ejs', 'data-fallback-src="/assets/product-placeholder.svg"'],
    ['views/stories.ejs', 'data-fallback-src="/assets/story.svg"'],
    ['views/admin/stories.ejs', 'data-fallback-src="/assets/story.svg"'],
    ['views/partials/story-viewer.ejs', 'data-fallback-src="/assets/story.svg"'],
    ['views/admin/branding.ejs', 'data-fallback-src="/assets/product-placeholder.svg"']
  ];
  for (const [file, marker] of expected) assert.ok(read(file).includes(marker), `${file} missing image fallback contract: ${marker}`);
  assert.ok(fs.existsSync(path.join(root, 'public/assets/hero-editorial.webp')));
  assert.ok(fs.existsSync(path.join(root, 'public/assets/hero-studio.svg')));
  assert.ok(fs.existsSync(path.join(root, 'public/assets/product-placeholder.svg')));
  assert.ok(fs.existsSync(path.join(root, 'public/assets/story.svg')));
});


test('V17 product image selection previews the exact file and the homepage does not substitute stock hero art', () => {
  const js = read('public/js/product-image-preview.js');
  const form = read('views/admin/product-form.ejs');
  const server = read('src/server.js');
  assert.match(form, /data-product-cover-input/);
  assert.match(form, /data-product-cover-preview/);
  assert.match(js, /URL\.createObjectURL\(file\)/);
  assert.match(js, /const MAX_BYTES = 2 \* 1024 \* 1024/);
  assert.match(js, /async function optimizeLargeImage/);
  assert.match(js, /canvas\.toBlob/);
  assert.match(js, /new DataTransfer\(\)/);
  assert.match(js, /input\.files = transfer\.files/);
  assert.match(server, /const heroProduct=latestProducts\.find/);
  assert.match(server, /const rawHeroImage=String\(savedHeroImage\|\|''\)\.trim\(\)/);
  assert.match(server, /const heroImage=\(savedHeroImageMode==='custom'/);
  assert.match(server, /getSetting\('hero_image_mode','catalogue'\)/);
  assert.ok(server.includes("return res.redirect(303,`/admin/products/${savedId}/edit?saved=1`);"));
  assert.match(server, /sort:'newest',limit:32/);
  // R10: intentional Google Merchant safety change: new products start unfeatured.
  assert.match(form, /product\?\.featured\?'checked':''/);
  assert.match(form, /product\?\.active\?'checked':''/);
  assert.match(form, /enctype="multipart\/form-data"/);
  assert.match(form, /Product saved successfully\./);
  assert.match(server, /upload\.fields\(\[\{name:'image',maxCount:1\}/);
  assert.match(server, /return safeImagePath\(primaryFile\.buffer,primaryFile\.mimetype\)/);
  assert.match(server, /const heroImage=\(savedHeroImageMode==='custom'/);
  assert.match(server, /getSetting\('hero_image_mode','catalogue'\)/);
});

test('Product placeholder stays retail-neutral rather than hard-coding a single vertical', () => {
  const svg = read('public/assets/product-placeholder.svg').toLowerCase();
  assert.match(svg, /<svg/);
  assert.match(svg, /viewbox=/);
  assert.doesNotMatch(svg, /perfume|cosmetic|makeup|skincare|عطر|مكياج|عناية/);
});


test('All EJS images declare a fallback unless the image is a logo or generated MFA QR code', () => {
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return entry.isFile() && rel.endsWith('.ejs') ? [rel] : [];
  });
  const extractImgTags = source => {
    const tags = [];
    let cursor = 0;
    while (true) {
      const start = source.indexOf('<img', cursor);
      if (start < 0) break;
      let i = start + 4;
      while (i < source.length) {
        if (source.startsWith('<%', i)) {
          const end = source.indexOf('%>', i + 2);
          i = end < 0 ? source.length : end + 2;
          continue;
        }
        if (source[i] === '>') { tags.push(source.slice(start, i + 1)); i += 1; break; }
        i += 1;
      }
      cursor = i;
    }
    return tags;
  };
  const exceptions = tag => /class="brand-logo"/.test(tag) || /id="mfa-qr-image"/.test(tag) || /src="\/assets\/logo\.svg"/.test(tag) || /src="\.\/public\/assets\/logo\.svg"/.test(tag);
  const missing = [];
  for (const file of walk('views')) {
    for (const tag of extractImgTags(read(file))) {
      if (!tag.includes('data-fallback-src=') && !exceptions(tag)) missing.push(`${file}: ${tag.slice(0, 140)}`);
    }
  }
  assert.deepEqual(missing, [], `Images without a fallback must be reviewed explicitly:\n${missing.join('\n')}`);
});

test('V17 never uses generic editorial artwork as the live homepage fallback', () => {
  const stat = fs.statSync(path.join(root, 'public/assets/hero-editorial.webp'));
  assert.ok(stat.size < 200_000, `Retained legacy asset should remain optimized; found ${stat.size} bytes`);
  const css = read('test/fixtures/legacy-css/design-v17.css');
  assert.match(css, /\.v17-spotlight-image-wrap\s*\{[^}]*height/s);
  const home = read('views/home.ejs');
  assert.match(home, /fetchpriority="high"/);
  assert.match(home, /v17-empty-spotlight/);
  assert.doesNotMatch(home, /hero-editorial\.webp|hero-studio\.svg/);
});


test('Image fallback state machine survives broken primary and secondary assets, then resets for a new variant image', () => {
  const handlers = new Map();
  class MockImage {
    constructor(src, attrs = {}, ancestors = []) {
      this._src = src;
      this.currentSrc = src;
      this.attrs = attrs;
      this.ancestors = new Set(ancestors);
      this.dataset = {};
      this.classes = new Set();
      this.assignments = [];
      this.events = [];
      this.complete = false;
      this.naturalWidth = 1;
      this.classList = {
        add: (...names) => names.forEach(name => this.classes.add(name)),
        remove: (...names) => names.forEach(name => this.classes.delete(name)),
        contains: name => this.classes.has(name)
      };
    }
    get src() { return this._src; }
    set src(value) { this._src = value; this.currentSrc = value; this.assignments.push(value); }
    getAttribute(name) { return this.attrs[name] || null; }
    closest(selector) {
      return selector.split(',').some(part => this.ancestors.has(part.trim().replace(/^\./, '')))
        ? { matched: true } : null;
    }
    dispatchEvent(event) { this.events.push(event.type); return true; }
  }
  class MockCustomEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  const preExistingImages = [];
  const document = { baseURI: 'https://shop.example/products/item', addEventListener: (type, handler) => handlers.set(type, handler), querySelectorAll: () => preExistingImages };
  const window = { location: { href: document.baseURI, origin: 'https://shop.example', protocol: 'https:' } };
  const context = { document, window, URL, HTMLImageElement: MockImage, CustomEvent: MockCustomEvent, Set, String };
  vm.runInNewContext(read('public/js/image-fallback.js'), context, { timeout: 1000 });
  const image = new MockImage('https://cdn.example/item.jpg', { 'data-fallback-src': '/assets/product-placeholder.svg' }, ['product-media']);
  const onError = handlers.get('error');
  const onLoad = handlers.get('load');
  assert.equal(typeof onError, 'function');
  assert.equal(typeof onLoad, 'function');

  onError({ target: image });
  assert.equal(image.src, 'https://shop.example/assets/product-placeholder.svg');
  assert.equal(image.classList.contains('is-image-fallback'), true);
  onError({ target: image });
  assert.equal(image.classList.contains('is-image-fallback-exhausted'), true, 'fallback should stop at the neutral placeholder, not show unrelated hero artwork');
  const assignmentsAfterExhaustion = image.assignments.length;
  onError({ target: image });
  assert.equal(image.assignments.length, assignmentsAfterExhaustion, 'repeated failure after exhausting local fallback candidates must not loop');

  image.src = 'https://cdn.example/new-variant-photo.jpg';
  onLoad({ target: image });
  assert.equal(image.classList.contains('is-image-fallback'), false, 'a successful new gallery/variant image must remove fallback styling');
  assert.equal(image.classList.contains('is-image-fallback-exhausted'), false);
  assert.equal(image.dataset.activeFallbackUrl, undefined);
  assert.equal(image.dataset.fallbackFailedUrls, undefined);
});


test('Deferred fallback script repairs an image that already failed before listeners were attached', () => {
  const handlers = new Map();
  class MockImage {
    constructor() {
      this._src = 'https://cdn.example/missing-hero.webp';
      this.currentSrc = this._src;
      this.complete = true;
      this.naturalWidth = 0;
      this.dataset = {};
      this.attrs = { 'data-fallback-src': '/assets/product-placeholder.svg' };
      this.classes = new Set();
      this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)), contains: name => this.classes.has(name) };
      this.events = [];
    }
    get src() { return this._src; }
    set src(value) { this._src = value; this.currentSrc = value; }
    getAttribute(name) { return this.attrs[name] || null; }
    closest(selector) { return selector.includes('.stage-image') ? {} : null; }
    dispatchEvent(event) { this.events.push(event.type); return true; }
  }
  class MockCustomEvent { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  const failedBeforeInstall = new MockImage();
  const document = { baseURI: 'https://shop.example/', querySelectorAll: () => [failedBeforeInstall], addEventListener: (type, handler) => handlers.set(type, handler) };
  const window = { location: { href: document.baseURI, origin: 'https://shop.example', protocol: 'https:' } };
  vm.runInNewContext(read('public/js/image-fallback.js'), { document, window, URL, HTMLImageElement: MockImage, CustomEvent: MockCustomEvent, Set, String }, { timeout: 1000 });
  assert.equal(failedBeforeInstall.src, 'https://shop.example/assets/product-placeholder.svg');
  assert.equal(failedBeforeInstall.classList.contains('is-image-fallback'), true);
});

test('V15 follow-up protects long data, anchor targets and mobile save controls', () => {
  const css = read('test/fixtures/legacy-css/design-v15.css');
  assert.match(css, /scroll-margin-block-start:\s*7\.5rem/);
  assert.match(css, /\.table-wrap tbody td\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.table-wrap:focus-within\s*\{[^}]*outline:/);
  assert.match(css, /padding-bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.form-actions\s*\{\s*flex-wrap:\s*wrap/);
  assert.match(css, /:where\(\.btn, \.btn-dark,[\s\S]*?\) \{ white-space: normal; overflow-wrap: anywhere; \}/);
});
