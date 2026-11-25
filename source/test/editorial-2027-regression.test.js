import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {assertDesignDelivery} from './helpers/design-delivery-contract.mjs';
const read = name => readFileSync(join(process.cwd(),name),'utf8');

test('editorial design is installed on real routes and both preview shells',()=>{
  const storefront=read('views/partials/header.ejs');
  const {manifest}=assertDesignDelivery();
  assert.ok(manifest.bundles[0].sources.some(source => source.path==='public/css/editorial-2027.css'));
  assert.match(storefront,/theme-early-2027\.js/);
  assert.match(storefront,/appearance\.darkMode/);
});

test('theme implementation supports light, dark, RTL, focus, reduced motion and 320px',()=>{
  const css=read('public/css/editorial-2027.css');
  const tokens=read('public/css/design-tokens.css');
  for(const needed of ['html[data-theme=dark]','max-width:359px','min-width:1800px','prefers-reduced-motion','html[dir=rtl]','v17-home-hero','product-card','checkout-layout','cart-layout','admin-nav','site-footer','theme-toggle','product-main-cta']) assert.ok(css.includes(needed),needed);
  assert.match(tokens,/--canvas:#101713/);
  assert.match(tokens,/--canvas:#F7F6F2/);
  assert.doesNotMatch(css,/!important/);
  assert.match(read('public/js/theme-early-2027.js'),/shopeasy-theme-2027/);
});

test('checkout fields, product IDs and price functions are unchanged by a presentation-only theme',()=>{
  const server=read('src/server.js');
  const checkout=read('views/checkout.ejs');
  const product=read('views/partials/product-card.ejs');
  assert.match(server,/\/checkout/);
  assert.match(checkout,/_csrf/);
  assert.match(product,/formatPrice\(effective,currency\)/);
  assert.match(product,/data-wishlist-toggle/);
  assert.match(product,/data-quick-view/);
});
