import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {parseCartProductId,parseCartVariantId,parseCartQuantity} from '../src/cart-form-inputs.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('adding the same product repeatedly cannot create a cart line above the 99-unit checkout limit',async()=>{
  const server=read('src/server.js');
  const add=server.slice(server.indexOf("app.post('/cart/add'"),server.indexOf("app.post('/cart/update'"));
  assert.match(add,/if\(nextQty>99\)throw new Error\('CART_QUANTITY'\)/);
  assert.match(add,/catch\(error\)\{return cartIntentFailure\(req,res,error,p\.slug\);\}/);
  let persisted=[],handler;
  const responses=[];
  const source=server.slice(server.indexOf('async function commitCartIntent('),server.indexOf("app.post('/cart/update'"));
  vm.runInNewContext(source,{
    app:{post:(_path,...handlers)=>{handler=handlers.at(-1);}},cartLimiter:()=>{},
    parseCartProductId,parseCartVariantId,parseCartQuantity,cleanText:value=>String(value??'').trim(),
    getProductById:async()=>({id:7,slug:'same-product',active:1,available_stock:200}),listProductVariants:async()=>[],
    mutateSessionCart:async(_id,mutation)=>{const next=mutation(structuredClone(persisted));persisted=structuredClone(next);return{cart:next,cart_revision:1};},
    cartAddReturnPath:()=>'/product/same-product?added=1'
  },{timeout:1000});
  const request={body:{productId:'7',quantity:'1'},sessionId:'fixture-only',session:{}};
  const response={locals:{locale:'en'},redirect:(status,url)=>{responses.push({status,url});}};
  for(let count=0;count<100;count++)await handler(request,response);
  assert.equal(responses.filter(result=>result.url.endsWith('?added=1')).length,99);
  assert.deepEqual(responses.at(-1),{status:303,url:'/product/same-product?cartError=quantity'});
  assert.deepEqual(persisted,[{productId:7,quantity:99}]);
  const items=server.slice(server.indexOf('async function cartItems'),server.indexOf('async function cartSummary'));
  assert.doesNotMatch(items,/qty<1\|\|qty>99\).*continue/);
  assert.match(items,/qty>99\) stockIssue='quantity_exceeds_limit'/);
  assert.match(read('views/cart.ejs'),/Reduce the quantity to 99 or less and update/);
  assert.match(read('views/product.ejs'),/You can add up to 99 of the same product option/);
  assert.match(read('views/shop.ejs'),/You can add up to 99 of the same product option/);
});

test('failed coupon attempts preserve an already active coupon and removal is explicit',()=>{
  const server=read('src/server.js');
  const route=server.slice(server.indexOf("app.post('/cart/coupon'"),server.indexOf("app.get('/login'",server.indexOf("app.post('/cart/coupon'")));
  assert.match(route,/if\(action==='remove'\)/);
  assert.match(route,/if\(!coupon\) return res\.redirect\(303,'\/cart\?couponMessage=invalid'\)/);
  assert.match(route,/if\(couponBase<coupon\.min_subtotal_cents\) return res\.redirect\(303,'\/cart\?couponMessage=minimum'\)/);
  assert.match(route,/const couponBase=summary\.subtotal-summary\.bundleDiscount/);
  const validation=route.slice(route.indexOf('const code='),route.indexOf('req.session.coupon=code;'));
  assert.doesNotMatch(validation,/req\.session\.coupon=null/);
  const cart=read('views/cart.ejs');
  assert.match(cart,/name="action" value="remove"/);
  assert.match(cart,/Your existing code/);
  assert.match(cart,/if\(items\.length\)\{/);
});

test('product feedback banners span both columns and transient status query strings do not replay on refresh',()=>{
  assert.match(read('test/fixtures/legacy-css/design-v13.css'),/\.product-detail-v5 > \.cart-added-success,[\s\S]*grid-column: 1 \/ -1/);
  const app=read('public/js/app.js');
  for(const key of ['added','cartError','couponMessage','restocked','restockError']) assert.ok(app.includes(`'${key}'`),`missing one-time query cleanup for ${key}`);
});

test('restock success copy says stock was added while product identity and order history were retained',()=>{
  assert.match(read('views/admin/product-form.ejs'),/Stock added successfully\. The same product, SKU, price and order history were kept\./);
  const route=read('src/server.js').slice(read('src/server.js').indexOf("app.post('/admin/products/restock'"),read('src/server.js').indexOf("app.post('/admin/products/archive'"));
  assert.match(route,/restockProduct\(productId,amount\)/);
  assert.match(route,/restockProductVariant\(variantId,amount\)/);
  assert.doesNotMatch(route,/req\.body\.price|req\.body\.costPrice|price_cents|cost_price_cents/);
});

test('category helper copy explains optional images and category display order in plain language',()=>{
  const categories=read('views/admin/categories.ejs');
  assert.match(categories,/Category image \(optional\)/);
  assert.match(categories,/Leave this blank to use the default image/);
  assert.match(categories,/Display order \(lower numbers first\)/);
  assert.match(categories,/A smaller number makes this category appear earlier in the shop/);
});

test('price preview follows the configured currency precision and refuses malformed decimal groups',()=>{
  const app=read('public/js/app.js');
  assert.match(app,/const currencyDigits = currencyFractionDigits\(currency\)/);
  assert.match(app,/IQD:3/);
  assert.match(app,/fraction\.length > currencyDigits/);
  assert.match(read('src/security.js'),/fractionRaw\.length>digits/);
});
