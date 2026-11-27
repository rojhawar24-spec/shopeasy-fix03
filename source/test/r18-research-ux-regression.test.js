import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertDesignDelivery} from './helpers/design-delivery-contract.mjs';
// file:// URL .pathname is not a filesystem path on Windows. It produces
// /C:/... and preserves %20 in folder names such as 'ShopEasy-FIX5 (3)'.
const root = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(root,p),'utf8');

test('R18 filter disclosure keeps server GET route and every real input',()=>{
  const src=read('views/shop.ejs');
  assert.match(src,/data-shop-filter-toggle[^>]*|data-shop-filter-toggle/);
  assert.match(src,/id="shop-filter-form" class="shop-controls" method="get" action="\/shop"/);
  for (const name of ['category','sort','search','minPrice','maxPrice','stock']) assert.match(src,new RegExp(`name="${name}"`));
  assert.match(src,/<div class="shop-results">/);
  assert.match(src,/data-shop-filter-toggle/);
  assert.match(src,/class="active-filter-bar"/);
});

test('R18 mobile filters progressively disclose without locking non-JS browsing',()=>{
 const js=read('public/js/app.js'),css=read('public/css/research-polish-2027.css');
 assert.match(js,/body\.classList\.add\('shop-filters-js-ready'\)/);
 assert.match(js,/panel\.hidden=!open/);
 assert.match(js,/toggle\.setAttribute\('aria-expanded',String\(open\)\)/);
 assert.match(js,/lockBackground\(\);close\?\.focus\(\)/);
 assert.match(js,/if\(event\.key==='Escape'\)\{event\.preventDefault\(\);setOpen\(false\)/);
 assert.match(css,/body\.is-storefront-app\.shop-filters-js-ready \.shop-filter-refined>\.shop-filter-toolbar \.shop-filter-toggle\{display:inline-flex/);
 assert.match(css,/\.shop-controls\[hidden\][^}]*display:none/);
});

test('R18 cart stepper uses existing CSRF-protected update form and bounded quantities',()=>{
 const cart=read('views/cart.ejs'),js=read('public/js/app.js');
 assert.match(cart,/action="\/cart\/update"/);
 assert.match(cart,/name="_csrf" value="<%= csrf %>"/);
 assert.match(cart,/data-cart-qty-step="-1"/);
 assert.match(cart,/data-cart-qty-step="1"/);
 assert.match(cart,/min="1" max="<%= Math\.min\(99,i\.availableStock\) %>"/);
 assert.match(js,/form\.requestSubmit\(\)/);
 assert.match(js,/Math\.max\(min, Math\.min\(max, current \+ delta\)\)/);
});

test('R18 layout supports RTL, reduced motion and balanced cookie actions',()=>{
 const css=read('public/css/research-polish-2027.css'),f=read('views/partials/footer.ejs');
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.shop-filter-mobile-bar/);
 assert.match(css,/grid-template-columns:minmax\(248px,292px\) minmax\(0,1fr\)/);
 assert.match(css,/\.cookie-consent-actions > button/);
 assert.match(f,/data-cookie-reject/);
 assert.match(f,/data-cookie-accept/);
});

test('R18 styling is from a versioned local stylesheet and all existing design files exist',()=>{
 const {manifest,versions}=assertDesignDelivery();
 assert.deepEqual(manifest.bundles[1].sources.map(source=>source.path),['public/css/research-polish-2027.css']);
 assert.ok(versions.get('/css/design-polish.min.css'));
});
