import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildIndexableSeoLinks} from '../src/seo-locales.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('unfiltered second page receives distinct canonical and language alternates',()=>{
  const result=buildIndexableSeoLinks({baseUrl:'https://store.example/',pathname:'/shop',locale:'nl',defaultLocale:'en',enabledLocales:['en','nl'],pageNumber:2});
  assert.equal(result.canonical,'https://store.example/shop?lang=nl&page=2');
  assert.equal(result.alternates.find(l=>l.hreflang==='en').href,'https://store.example/shop?page=2');
  assert.equal(result.alternates.find(l=>l.hreflang==='x-default').href,'https://store.example/shop?page=2');
});
test('invalid page value or product route cannot poison canonical query',()=>{
  const settings={baseUrl:'https://store.example/',pathname:'/product/safe-item',locale:'en',enabledLocales:['en']};
  assert.equal(buildIndexableSeoLinks({...settings,pageNumber:2}).canonical,'https://store.example/product/safe-item');
  assert.equal(buildIndexableSeoLinks({...settings,pathname:'/shop',pageNumber:-5}).canonical,'https://store.example/shop');
  assert.equal(buildIndexableSeoLinks({...settings,pathname:'/shop',pageNumber:10001}).canonical,'https://store.example/shop');
});
test('search, faceted and sorted catalogue URLs are explicitly noindexed',()=>{
  const server=read('src/server.js'),head=read('views/partials/header.ejs');
  assert.match(server,/res\.locals\.seoNoIndex=/);
  assert.match(server,/discoveryParameters\.some\(key=>Object\.hasOwn\(req\.query\|\|\{\},key\)\)/);
  assert.match(head,/typeof seoNoIndex !== 'undefined' && seoNoIndex/);
});
test('product social image uses HTTPS product source and breadcrumb data is escaped',()=>{
  const server=read('src/server.js'),head=read('views/partials/header.ejs');
  assert.match(server,/socialImageUrl=absoluteImageUrl\.startsWith\('https:\/\/'\)/);
  assert.match(server,/serializeJsonLdSafely\(\{'@context':'https:\/\/schema\.org','@type':'BreadcrumbList'/);
  assert.match(head,/breadcrumbJsonLdSafe/);
});
test('only app.js submits language selector, preventing duplicate POST',()=>{
  assert.match(read('public/js/app.js'),/\[data-language-select\].*requestSubmit/s);
  assert.doesNotMatch(read('public/js/retail-2027.js'),/querySelectorAll\('\[data-language-select\]'\)/);
});
test('hidden browser locale prompt stays hidden against authored flex overrides',()=>{
  const css=read('public/css/research-polish-2027.css');
  assert.match(css,/\.language-suggestion\[hidden\]/);
  assert.match(css,/\.language-suggestion\[hidden\],[\s\S]*display:\s*none/);
});
test('all product editor section links point to real section ids',()=>{
  const form=read('views/admin/product-form.ejs');
  for(const section of ['details','pricing','stock','images','visibility']){
    assert.ok(form.includes(`href="#product-${section}"`),section+' anchor');
    assert.ok(form.includes(`id="product-${section}"`),section+' target');
  }
  assert.match(form,/name="active"\s+<%= product\?\.active\?'checked':'' %>/);
});
test('Manager ad readiness panel does not assert official approval',()=>{
  const dashboard=read('views/admin/dashboard.ejs');
  assert.match(dashboard,/GOOGLE ADS & MERCHANT CENTER/);
  assert.match(dashboard,/not Google approval or verification/);
  assert.match(dashboard,/Ads tracking is not enabled by this panel/);
});
test('Google Ads static preflight never injects third party tracking code',()=>{
  assert.match(read('scripts/audit-google-ads.mjs'),/No automatic Google Ads \/ analytics tags/);
  assert.match(read('package.json'),/"audit:ads"/);
  assert.doesNotMatch(read('views/partials/footer.ejs'),/gtag\(|googletagmanager\.com/);
});
test('Manager nav shows accessible current page on promotions and e-invoicing',()=>{
  const nav=read('views/partials/admin-nav.ejs');
  for(const page of ['bundles','gift-cards','newsletter','reviews','e-invoicing']){
    assert.match(nav,new RegExp(`navActive\\('/admin/${page}'\\)[\\s\\S]*aria-current="page"`));
  }
});
test('category Previous and Next pagination stay within the current category route',()=>{
  const template=read('views/shop.ejs');
  for(const direction of ['page-1','page+1']){
    assert.ok(template.includes(`?page=<%= ${direction} %>`));
    assert.match(template,new RegExp(`_categoryInfo\\?'\\/category\\/'\\+encodeURIComponent\\(_categoryInfo\\.slug\\):'\\/shop' %>\\?page=<%= ${direction.replace('+','\\+')} %>`));
  }
  assert.match(read('src/server.js'),/,'stock','category','tag'/);
});
test('manager product writes and financial tools are declared as role-gated routes',()=>{
  const server=read('src/server.js');
  assert.match(server,/app\.post\('\/admin\/products\/save',requireManager,upload\.fields/);
  assert.match(server,/app\.get\('\/admin\/gift-cards',requireManager/);
  assert.match(server,/app\.get\('\/admin\/e-invoicing',requireManager/);
});
test('AI search assistant has a server-side off switch, not merely a hidden button',()=>{
  assert.match(read('src/server.js'),/app\.post\('\/api\/ai\/search-assistant',aiLimiter,async\(req,res\)=>\{\s*if\(!await aiIsEnabled\(\)\)return res\.status\(404\)/);
});
test('login, logout and password recovery use declared limited endpoints',()=>{
  const server=read('src/server.js');
  assert.match(server,/app\.post\('\/login',loginLimiter/);
  assert.match(server,/app\.post\('\/logout',async\(req,res\)=>\{await logout\(req,res\)/);
  assert.match(server,/app\.post\('\/forgot-password',passwordResetLimiter/);
});
test('custom logo is validated as a generated local image path',()=>{
  assert.match(read('src/store-appearance.js'),/\/uploads\\\/\[a-f0-9\]\{32\}/);
  assert.ok(fs.existsSync(path.join(root,'public/assets/logo.svg')));
});
