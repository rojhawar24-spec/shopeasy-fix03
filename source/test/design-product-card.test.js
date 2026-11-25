import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const shop=read('views/shop.ejs');
const home=read('views/home.ejs');
const card=read('views/partials/product-card.ejs');
const css=read('test/fixtures/legacy-css/style.css');
const header=read('views/partials/header.ejs');

function dictionary(){
  const source=read('public/js/i18n.js');
  const start=source.indexOf('const dictionary = ')+('const dictionary = ').length;
  const marker=source.indexOf('const normalizeWhitespace',start);
  const end=source.lastIndexOf(';',marker);
  assert.ok(start>0 && end>start,'i18n dictionary boundary should exist');
  return JSON.parse(source.slice(start,end).trim());
}

function escapeRegex(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function translateLikeRuntime(locale,input){
  const dict=dictionary()[locale];
  const tokenPattern=/<%=\s*[^%]+?\s*%>|\{[A-Za-z][\w]*\}/g;
  const normalize=(v)=>String(v??'').replace(/\s+/g,' ').trim().toLocaleLowerCase('en');
  const exact=new Map(Object.entries(dict).map(([k,v])=>[normalize(k),v]));
  const direct=exact.get(normalize(input));
  if(direct!==undefined) return direct;
  for(const [key,value] of Object.entries(dict)){
    const tokens=[...key.matchAll(tokenPattern)];
    if(!tokens.length) continue;
    let cursor=0;
    const parts=['^\\s*'];
    for(const token of tokens){
      parts.push(escapeRegex(key.slice(cursor,token.index)),'(.+?)');
      cursor=token.index+token[0].length;
    }
    parts.push(escapeRegex(key.slice(cursor)),'\\s*$');
    const match=new RegExp(parts.join(''),'i').exec(String(input));
    if(match){
      let i=1;
      return value.replace(tokenPattern,()=>match[i++] ?? '');
    }
  }
  return input;
}

test('storefront product card uses real catalog data and no invented social proof',()=>{
  assert.ok(shop.includes("partials/product-card"));
  assert.ok(home.includes("partials/product-card"));
  assert.doesNotMatch(shop,/reviewCount|rating|freeShipping|Best Seller/);
  assert.doesNotMatch(card,/reviewCount|rating|freeShipping|Best Seller/);
  assert.ok(card.includes('formatPrice(effective,currency)'));
  assert.ok(card.includes('Number(product.variant_count || 0)'));
  assert.ok(card.includes('Number(product.available_stock || 0)'));
  assert.ok(card.includes('discountPercent'));
  assert.ok(card.includes('effectivePrice'));
  assert.ok(card.includes('data-wishlist-toggle'));
  assert.match(card, /href="\/product\//);
  assert.match(card, /View product/);
  assert.doesNotMatch(card, /action="\/cart\/add"/);
});

test('product-card visible and accessibility strings all have runtime-matching translations',()=>{
  for(const locale of ['ckb','ar']){
    for(const [input,expected] of [
      ['Only 3 left',/3|٣|3/],
      ['In stock',/بەردەست|متوفر/],
      ['Unavailable',/بەردەست نییە|غير متوفر/],
      ['Collection',/کۆمەڵە|المجموعة/],
      ['CATEGORY',/پۆل|الفئة/],
      ['EXPLORE',/بگەڕێ|استكشف/],
      ['Products: 3',/بەرهەم|المنتجات/],
      ['Products: 3 · Explore →',/بەرهەم|المنتجات|بگەڕێ|استكشف/],
      ['Prices and availability update from the server',/نرخ|بەردەست|الأسعار|التوفر/],
      ['View Travel Bag',/Travel Bag/],
    ]){
      const out=translateLikeRuntime(locale,input);
      assert.notEqual(out,input,`${locale}: missing translation for ${input}`);
      assert.match(out,expected,`${locale}: ${input} -> ${out}`);
    }
  }
  assert.ok(card.includes("cardText('Only {count} left', {count:available})"));
  assert.ok(card.includes('if(product.category_name)'));
  assert.doesNotMatch(card,/product\.category_name \|\| 'Collection'/);
  assert.ok(card.includes('class="in-stock"'));
  assert.ok(card.includes("cardText('In stock')"));
  assert.ok(card.includes('class="out-stock"'));
  assert.ok(card.includes("cardText('Unavailable')"));
  assert.ok(shop.includes("'CATEGORY'"));
  assert.ok(shop.includes('>EXPLORE</span>') || shop.includes('EXPLORE'));
  assert.match(shop, /locale === 'ckb' \? `بەرهەم: \${Number\(child\.product_count\|\|0\)}` : locale === 'ar' \? `المنتجات: \${Number\(child\.product_count\|\|0\)}`/);
  assert.match(shop, /locale === 'fr' \? `Produits : \${Number\(child\.product_count\|\|0\)}` : `Products: \${Number\(child\.product_count\|\|0\)}`/);
  assert.match(shop, /Products: \${Number\(child\.product_count\|\|0\)}/);
  assert.ok(shop.includes('Explore by category or search'));
  assert.doesNotMatch(shop,/shopServerNote|shopLocaleLabel|Prices and availability update from the server/);
});

test('category cards expose configured category images when available',()=>{
  assert.ok(home.includes('c.image_url'));
  assert.ok(home.includes('category-card-media'));
  assert.ok(shop.includes('child.image_url'));
});

test('design remains RTL-safe and has a CKB-specific Arabic-script font stack',()=>{
  assert.match(css,/html\[lang\^="ckb"\][\s\S]*?font-family:/);
  assert.match(css,/Noto Naskh Arabic/);
  assert.match(css,/html\[dir="rtl"\] .product-card-footer/);
  assert.match(css,/inset-inline-start/);
  assert.match(css,/inset-inline-end/);
  assert.doesNotMatch(css,/product-card-premium/);
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('dictionary contains the design-refresh keys in all three locales',()=>{
  const d=dictionary();
  const keys=['Product highlights','Collection','CATEGORY','EXPLORE','In stock','Unavailable','Only {count} left','Products: {count}','Products: {count} · Explore →','Prices and availability update from the server','View {name}'];
  for(const key of keys){
    for(const locale of ['en','ckb','ar','nl']) assert.equal(typeof d[locale][key],'string',`${locale}: missing ${key}`);
  }
});
