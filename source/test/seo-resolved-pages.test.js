import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIndexableSeoLinks, resolveCatalogueSeoPagination} from '../src/seo-locales.js';
import {buildProductStructuredData} from '../src/product-structured-data.js';
import {isPrivateStorefrontPath, privatePageRobotsHeader} from '../src/robots-policy.js';

test('catalogue metadata uses the actual last page after an excessive request is bounded',()=>{
  const requested=buildIndexableSeoLinks({baseUrl:'https://store.example',pathname:'/shop',locale:'fr',enabledLocales:['en','fr','ckb'],defaultLocale:'en',pageNumber:999});
  const resolved=resolveCatalogueSeoPagination({...requested,pageNumber:2});
  assert.equal(resolved.canonical,'https://store.example/shop?lang=fr&page=2');
  assert.equal(resolved.alternates.find(link=>link.hreflang==='en').href,'https://store.example/shop?page=2');
  assert.equal(resolved.alternates.find(link=>link.hreflang==='ckb').href,'https://store.example/shop?lang=ckb&page=2');
  assert.equal(resolved.alternates.find(link=>link.hreflang==='x-default').href,'https://store.example/shop?page=2');
});

test('a single-page category removes a stale page parameter while preserving non-English default conventions',()=>{
  const requested=buildIndexableSeoLinks({baseUrl:'https://store.example',pathname:'/category/shoes',locale:'en',enabledLocales:['nl','en'],defaultLocale:'nl',pageNumber:8});
  const resolved=resolveCatalogueSeoPagination({...requested,pageNumber:1});
  assert.equal(resolved.canonical,'https://store.example/category/shoes?lang=en');
  assert.equal(resolved.alternates.find(link=>link.hreflang==='nl').href,'https://store.example/category/shoes');
  assert.equal(resolved.alternates.find(link=>link.hreflang==='x-default').href,'https://store.example/category/shoes');
});

test('resolved pagination does not invent public URLs or include mismatched alternate paths',()=>{
  assert.deepEqual(resolveCatalogueSeoPagination({canonical:'',pageNumber:2}),{canonical:'',alternates:[]});
  assert.deepEqual(resolveCatalogueSeoPagination({canonical:'https://store.example/account',pageNumber:2}),{canonical:'',alternates:[]});
  const resolved=resolveCatalogueSeoPagination({canonical:'https://store.example/shop',pageNumber:2,alternates:[
    {hreflang:'en',href:'https://attacker.example/shop'},
    {hreflang:'fr',href:'https://store.example/account?lang=fr'}
  ]});
  assert.equal(resolved.canonical,'https://store.example/shop?page=2');
  assert.deepEqual(resolved.alternates,[]);
});

test('a product with supported variants omits schema instead of throwing without an absolute public URL',()=>{
  const data={product:{name:'Fixture shoe',sku:'SHOE'},currency:'EUR',price:'19.99',variants:[
    {id:1,sku:'SHOE-42',option_name:'Size',option_value:'42',available_stock:1}
  ]};
  for(const productUrl of ['',undefined,'/product/shoe','http://store.example/product/shoe','https://user:secret@store.example/product/shoe','https://store.example/product/shoe#fragment']) {
    assert.equal(buildProductStructuredData({...data,productUrl}),null,productUrl);
  }
  const schema=buildProductStructuredData({...data,productUrl:'https://store.example/product/shoe?lang=fr'});
  assert.equal(schema['@type'],'ProductGroup');
  assert.equal(schema.hasVariant[0].offers.url,'https://store.example/product/shoe?lang=fr&variant=1');
});

test('case-insensitive authentication and private-page route aliases remain excluded at HTTP level',()=>{
  for(const path of ['/LOGIN','/Register','/ACCOUNT/security','/Admin/Orders','/CHECKOUT','/Order-Lookup','/MFA/verify','/Payments/mollie/webhook']) {
    assert.equal(isPrivateStorefrontPath(path),true,path);
    let header;
    let continued=false;
    privatePageRobotsHeader({path},{set:(name,value)=>{assert.equal(name,'X-Robots-Tag');header=value;}},()=>{continued=true;});
    assert.match(header,/noindex/);
    assert.equal(continued,true);
  }
  assert.equal(isPrivateStorefrontPath('/product/account-wallet'),false);
});
