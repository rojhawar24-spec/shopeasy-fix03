import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndexableSeoLinks, indexedLocaleFromQuery, isIndexableStorefrontPath, sitemapLocalePaths, withSelectedPublicLanguage } from '../src/seo-locales.js';

test('four stable canonical/hreflang languages for public products', () => {
  const args={baseUrl:'https://shop.example/',pathname:'/product/test-shoe',locale:'ckb',enabledLocales:['en','ckb','ar','nl'],defaultLocale:'en'};
  const result=buildIndexableSeoLinks(args);
  assert.equal(result.canonical,'https://shop.example/product/test-shoe?lang=ckb');
  assert.deepEqual(result.alternates.map(a=>a.hreflang),['en','ckb','ar','nl','x-default']);
  assert.equal(result.alternates[3].href,'https://shop.example/product/test-shoe?lang=nl');
  assert.equal(result.alternates[4].href,'https://shop.example/product/test-shoe');
});
test('a store that disables Arabic does not advertise Arabic to crawlers', () => {
  const result=buildIndexableSeoLinks({baseUrl:'https://shop.example/',pathname:'/',locale:'ar',enabledLocales:['nl','en'],defaultLocale:'nl'});
  assert.equal(result.canonical,'https://shop.example/');
  assert.deepEqual(result.alternates.map(a=>a.hreflang),['nl','en','x-default']);
});
test('private account and payment paths never expose canonical/hreflang', () => {
  for(const pathname of ['/admin','/checkout','/account/order/123','/payments/mollie/webhook','//other','/product/%2F%2Fmalicious']) {
    const result=buildIndexableSeoLinks({baseUrl:'https://shop.example/',pathname,enabledLocales:['en','nl']});
    assert.deepEqual(result,{canonical:'',alternates:[]},pathname);
    assert.equal(indexedLocaleFromQuery('nl',['en','nl'],pathname),null);
  }
});
test('explicit public language query determines the language; unsupported code ignored', () => {
  assert.equal(indexedLocaleFromQuery('ckb',['en','ckb'],'/product/shirt'),'ckb');
  assert.equal(indexedLocaleFromQuery('ar',['en','ckb'],'/product/shirt'),null);
  assert.equal(indexedLocaleFromQuery(['nl','en'],['en','nl'],'/'),null);
});
test('language switch preserves safe product filters but not external redirects',()=>{
  assert.equal(withSelectedPublicLanguage('/shop?sort=price', 'nl','en'),'/shop?sort=price&lang=nl');
  assert.equal(withSelectedPublicLanguage('/shop?lang=ckb&sort=price','en','en'),'/shop?sort=price');
  assert.equal(withSelectedPublicLanguage('//evil.example/checkout','nl','en'),'/');
  assert.equal(withSelectedPublicLanguage('/checkout','nl','en'),'/checkout');
});
test('sitemaps publish only enabled stable language URLs',()=>{
  const urls=sitemapLocalePaths(['/','/category/shoes','/product/hat'],['en','nl'],'en');
  assert.deepEqual(urls,['/','/?lang=nl','/category/shoes','/category/shoes?lang=nl','/product/hat','/product/hat?lang=nl']);
});
test('indexable EJS header includes alternate hreflang tags and server uses locale query',()=>{
  const header=fs.readFileSync(new URL('../views/partials/header.ejs',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(header,/rel="alternate" hreflang=/);
  assert.match(server,/indexedLocaleFromQuery\(req\.query\?\.lang/);
  assert.match(server,/sitemapLocalePaths\(products\.map/);
});

test('Sorani and Arabic Unicode slugs retain stable international SEO links',()=>{
  for (const slug of ['کەلوپەل','حذاء','ئامێر']) {
    for (const path of [`/product/${slug}`,`/category/${encodeURIComponent(slug)}`]) {
      assert.equal(isIndexableStorefrontPath(path),true,path);
      assert.equal(buildIndexableSeoLinks({baseUrl:'https://store.example/',pathname:path,locale:'ckb',enabledLocales:['en','ckb'],defaultLocale:'en'}).alternates.length,3);
    }
  }
  for (const bad of ['/product/%2Fmalicious','/product/%5Cadmin','/product/%252Fadmin','/product/%00zero','/product/%E0%A4%A','/product/../admin']) {
    assert.equal(isIndexableStorefrontPath(bad),false,bad);
  }
});
test('public pages redirect a stored nondefault language to its stable language URL',()=>{
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/isIndexableStorefrontPath\(req\.path\) && locale!==languagePreferences\.defaultLocale/);
  assert.match(server,/res\.redirect\(302,destination\)/);
  const target=withSelectedPublicLanguage('/product/'+encodeURIComponent('کەلوپەل')+'?variant=15','ckb','en');
  assert.equal(new URL(target,'https://store.example').searchParams.get('lang'),'ckb');
  assert.equal(new URL(target,'https://store.example').searchParams.get('variant'),'15');
});
