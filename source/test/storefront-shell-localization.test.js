import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {storefrontShellText,STOREFRONT_SHELL_KEYS} from '../src/storefront-shell-copy.js';
import {pageText} from '../src/home-login-copy.js';
import {customerText} from '../src/customer-page-copy.js';
const locales=['en','nl','fr','ckb','ar','kmr'];
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('shared storefront shell labels have nonempty translations for all six languages',()=>{
  assert.equal(new Set(STOREFRONT_SHELL_KEYS).size,STOREFRONT_SHELL_KEYS.length);
  for(const key of STOREFRONT_SHELL_KEYS)for(const locale of locales){
    const value=storefrontShellText(locale,key);
    assert.ok(typeof value==='string'&&value.trim(),locale+': '+key);
    assert.equal(storefrontShellText(locale,' '+key+' '),' '+value+' ');
    assert.ok(pageText(locale,key).trim());
    assert.ok(customerText(locale,key).trim());
  }
  for(const translate of [pageText,customerText]){
    assert.equal(translate('nl','A seller name {custom}',{custom:'not an interface string'}),'A seller name {custom}');
    for(const locale of locales.slice(1))assert.notEqual(translate(locale,'Necessary storage supports your account, basket and security. Analytics and marketing stay off by default.'),'Necessary storage supports your account, basket and security. Analytics and marketing stay off by default.');
  }
});
test('public shell retains translated accessible controls without JavaScript',()=>{
  const header=read('views/partials/header.ejs'),footer=read('views/partials/footer.ejs'),shop=read('views/shop.ejs');
  for(const key of ['Skip to content','Open search','Close search','Open navigation','Primary navigation','Language'])assert.ok(header.includes("pageText('"+key+"')"),key);
  assert.match(footer,/id="cookie-consent-description"><%= footerText\('Necessary storage supports/);
  assert.doesNotMatch(footer,/class="container newsletter-section"/);
  assert.match(shop,/id="shop-filter-form" class="shop-controls" method="get"/);
  assert.doesNotMatch(shop,/id="shop-filter-form"[^>]*hidden/);
  assert.match(read('public/js/app.js'),/lockBackground\(\);close\?\.focus\(\)/);
});
