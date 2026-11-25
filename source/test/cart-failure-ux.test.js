import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('recoverable cart add errors return to a relevant page instead of rendering a generic error page',()=>{
 const s=read('src/server.js');
 const add=s.slice(s.indexOf("app.post('/cart/add'"),s.indexOf("app.post('/cart/update'"));
 assert.match(s,/function safeCartError\(value\)[\s\S]*\['unavailable','option','quantity','stock'\]/);
 assert.match(add,/res\.redirect\(303,'\/shop\?cartError=unavailable'\)/);
 assert.match(add,/\?cartError=quantity/);
 assert.match(add,/\?cartError=option/);
 assert.match(add,/if\(availableStock<=0\|\|nextQty>availableStock\)throw new Error\('CART_STOCK'\)/);
 assert.match(add,/catch\(error\)\{return cartIntentFailure\(req,res,error,p\.slug\);\}/);
 const helper=s.slice(s.indexOf('function cartIntentFailure('),s.indexOf("app.post('/cart/add'"));
 const feedback=vm.runInNewContext(`${helper}; cartIntentFailure`,{},{timeout:1000});
 for(const [code,expected] of [['CART_STOCK','stock'],['CART_QUANTITY','quantity']]){
  let destination;
  feedback({}, {locals:{locale:'en'},redirect:(status,url)=>{destination={status,url};}},new Error(code),'sample product');
  assert.deepEqual(destination,{status:303,url:`/product/sample%20product?cartError=${expected}`});
 }
 assert.doesNotMatch(add,/res\.status\(400\)\.render\('error'/);
});

test('cart update stock and option conflicts preserve the bag and show an actionable message',()=>{
 const s=read('src/server.js');
 const update=s.slice(s.indexOf("app.post('/cart/update'"),s.indexOf("app.post('/cart/remove'"));
 assert.match(update,/res\.redirect\(303,'\/cart\?cartError=option'\)/);
 assert.match(update,/res\.redirect\(303,'\/cart\?cartError=stock'\)/);
 const cart=read('views/cart.ejs');
 assert.match(cart,/role="alert" aria-live="assertive"/);
 assert.match(cart,/The requested option is no longer available/);
 assert.match(cart,/Stock changed before we could update your bag/);
});

test('product errors appear next to the relevant action, are allowlisted and localized in all supported languages',()=>{
 const product=read('views/product.ejs'), shop=read('views/shop.ejs'), cart=read('views/cart.ejs'), i18n=read('public/js/i18n.js');
 assert.match(product,/cart-action-error/);
 assert.match(shop,/cart-action-error/);
 assert.match(cart,/cart-action-error/);
 const start=i18n.indexOf('const dictionary = ')+ 'const dictionary = '.length;
 const marker=i18n.indexOf('const normalizeWhitespace',start);
 const end=i18n.lastIndexOf(';',marker);
 const dict=JSON.parse(i18n.slice(start,end).trim());
 const required=['This product is no longer available. Please browse the shop for current products.','Choose an available option before adding this product to your bag.','Check the quantity and try again.','Stock changed before we could add this item. Please review current availability.','The requested option is no longer available. Please remove it and choose another option.'];
 for(const key of required) for(const locale of ['en','ckb','ar','nl']) assert.ok(dict[locale][key],`missing ${locale} error message: ${key}`);
 assert.deepEqual(Object.keys(dict.en).sort(),Object.keys(dict.ckb).sort());
 assert.deepEqual(Object.keys(dict.en).sort(),Object.keys(dict.ar).sort());
});

test('unexpected errors offer safe recovery destinations instead of a dead end',()=>{
 const e=read('views/error.ejs');
 for(const target of ['/shop','/cart','/']) assert.ok(e.includes(`href="${target}"`),`missing recovery target ${target}`);
 assert.match(e,/error-guidance/);
 assert.match(e,/We could not complete that action/);
});
