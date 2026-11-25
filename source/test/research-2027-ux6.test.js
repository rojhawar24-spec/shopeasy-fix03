import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_APPEARANCE, APPEARANCE_SWITCHES, normalizeAppearance } from '../src/store-appearance.js';
import { assertDesignDelivery } from './helpers/design-delivery-contract.mjs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css = read('public/css/research-polish-2027.css');

test('active filter chips are optional, default enabled and stored through validated Manager flags',()=>{
 assert.equal(APPEARANCE_SWITCHES.filterChips,true);
 assert.equal(DEFAULT_APPEARANCE.filterChips,true);
 assert.equal(normalizeAppearance({filterChips:'0'}).filterChips,false);
 assert.equal(normalizeAppearance({filterChips:'1'}).filterChips,true);
 assert.match(read('views/admin/appearance.ejs'),/\['filterChips','Active filter summary'/);
 assert.match(read('src/server.js'),/Object\.keys\(APPEARANCE_SWITCHES\)/);
});
test('filters are displayed with individual remove URLs and a clear-all action',()=>{
 const shop=read('views/shop.ejs');
 assert.match(shop,/appearance\.filterChips/);
 for(const key of ['category','search','sort','minPrice','maxPrice','stock'])
  assert.ok(shop.includes("shopFilterUrlWithout('"+key+"')"),key);
 assert.match(shop,/class="active-filter-bar"/);
 assert.match(shop,/class="active-filter-clear" href="<%= _categoryInfo/);
 assert.match(shop,/encodeURIComponent\(_categoryInfo\.slug\)/);
});
test('selected filter URLs are server-rendered and text escapes through EJS',()=>{
 const shop=read('views/shop.ejs');
 assert.match(shop,/href="<%= shopFilterUrlWithout\('search'\) %>"/);
 assert.match(shop,/aria-label="<%= locale===/);
 assert.doesNotMatch(shop,/innerHTML|new Function|eval\(/);
});
test('light, dark, RTL and reduced motion share tokens, without CSS !important',()=>{
 for(const feature of ['--brand-primary','--canvas','--paper','--text','--line','var(--ink-accent)','data-theme="dark"','dir="rtl"','prefers-reduced-motion',':focus-visible'])
  assert.ok((css+read('public/css/design-tokens.css')).includes(feature),feature);
 assert.doesNotMatch(css,/!important/);
});
test('both previews load new CSS and lack mystery OK submit button',()=>{
 assertDesignDelivery();
 for(const page of ['PREVIEW.html','PREVIEW-MANAGER.html']){
  assert.doesNotMatch(read(page),/>OK<\/button>/);
  assert.match(read(page),/data-design-preview-theme/);
 }
});
test('live header has no visible OK, preserves CSRF, language and Manager route links',()=>{
 const header=read('views/partials/header.ejs');
 assert.doesNotMatch(header,/>OK<\/button>/);
 assert.match(header,/name="_csrf" value="<%= csrf %>"/);
 assert.match(header,/action="\/language" method="post"/);
 assert.match(header,/data-theme-toggle/);
 assertDesignDelivery();
});
test('purchase flow keeps CSRF, idempotency and legally explicit payment obligation',()=>{
 const checkout=read('views/checkout.ejs');
 for(const str of ['name="_csrf"','name="idempotencyKey"','name="termsAccepted"','Order with obligation to pay','action="/checkout"'])
  assert.ok(checkout.includes(str),str);
 assert.match(read('views/cart.ejs'),/action="\/cart\/update"/);
 assert.match(read('views/product.ejs'),/action="\/cart\/add"/);
});
test('product page prefers accurate checkout-method copy over suggesting one method only',()=>{
 const product=read('views/product.ejs');
 assert.match(product,/Payment options/);
 assert.match(product,/See available methods at checkout/);
 assert.match(product,/data-product-main-image/);
 assert.match(product,/fetchpriority="high"/);
});
test('new CSS is self hosted and does not inject scripts, remote images or web fonts',()=>{
 assert.doesNotMatch(css,/@import|url\s*\(\s*['"]?https?:|javascript:/i);
 assert.doesNotMatch(css,/position:\s*fixed[^}]*\.theme-toggle-inline/);
});
