import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const home = read('views/home.ejs');
const shop = read('views/shop.ejs');
const css = read('public/css/app.css');
const footer = read('views/partials/footer.ejs');

test('category links keep their text outside the fixed-aspect-ratio media wrapper', () => {
  assert.doesNotMatch(home, /class="category-card category-card-image/);
  assert.doesNotMatch(shop, /class="category-card category-card-image/);
  assert.match(read('public/css/research-polish-2027.css'),/\.home-category-photo\{[^}]*aspect-ratio:1\/1/);
  assert.doesNotMatch(css, /\.category-card-media,\s*\.category-card-image\s*\{/);
  assert.ok(fs.existsSync(new URL('../public/assets/category-placeholder.svg', import.meta.url)));
  assert.match(home, /c\.image_url \? safeImageUrl\(c\.image_url\) : '\/assets\/category-placeholder\.svg'/, 'homepage category always renders a fallback when no image is configured');
  assert.match(shop, /child\.image_url \? safeImageUrl\(child\.image_url\) : '\/assets\/category-placeholder\.svg'/, 'subcategory card always renders a fallback when no image is configured');
  assert.match(home, /<div class=\"home-category-photo\"><img/);
  assert.match(shop, /<div class=\"home-category-photo\"><img/);
});

test('mobile cookie consent is compact, keeps reject and accept equally available, and clears bottom navigation', () => {
  assert.match(footer, /data-cookie-reject/);
  assert.match(footer, /data-cookie-accept/);
  assert.match(footer, /class="cookie-consent-links"[\s\S]*data-cookie-customize/);
  assert.match(footer, /<div class="cookie-consent-actions"[\s\S]*data-cookie-reject[\s\S]*data-cookie-accept/);
  assert.doesNotMatch(footer.match(/<div class="cookie-consent-actions"[\s\S]*?<\/div>/)?.[0] || '', /data-cookie-customize/, 'customize must not add a third row of actions on small screens');
  assert.match(css, /\.cookie-consent-customize-link\s*\{/);
  assert.match(css, /\.cookie-consent-copy \.eyebrow \{ display:\s*none; \}/, 'mobile consent hides the redundant eyebrow to preserve space for the content and decision buttons');
  assert.match(css, /\.cookie-consent-actions \[data-cookie-reject\]\s*\{\s*grid-column:\s*1;\s*grid-row:\s*1;\s*\}/);
  assert.match(css, /\.cookie-consent-actions \[data-cookie-accept\]\s*\{\s*grid-column:\s*2;\s*grid-row:\s*1;\s*\}/);
  assert.match(css, /max-block-size:\s*min\(48dvh,\s*26rem\)/);
  assert.match(css, /--safe-area-inline-start:\s*env\(safe-area-inset-left,\s*0px\)/);
  assert.match(css, /--safe-area-inline-end:\s*env\(safe-area-inset-right,\s*0px\)/);
  assert.match(css, /:root\[dir="rtl"\]\s*\{[^}]*--safe-area-inline-start:\s*env\(safe-area-inset-right,\s*0px\)[^}]*--safe-area-inline-end:\s*env\(safe-area-inset-left,\s*0px\)/);
  assert.match(css, /inset-inline-start:\s*max\(var\(--space-8\),\s*var\(--safe-area-inline-start\)\)/);
  assert.match(css, /inset-inline-end:\s*max\(var\(--space-8\),\s*var\(--safe-area-inline-end\)\)/);
  assert.match(css, /inset-block-end:\s*calc\(var\(--mobile-bottom-nav-height\)/);
});
