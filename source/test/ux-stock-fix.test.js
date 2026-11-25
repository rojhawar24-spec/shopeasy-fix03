import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('restock endpoint and database update only add stock to the existing item',()=>{
  const server=read('src/server.js');
  const db=read('src/db.js');
  const form=read('views/admin/product-form.ejs');
  const begin=server.indexOf("app.post('/admin/products/restock'");
  const end=server.indexOf("app.post('/admin/products/archive'",begin);
  assert.ok(begin>=0&&end>begin,'stock-only route is present');
  const route=server.slice(begin,end);
  assert.match(route,/restockProduct\(productId,amount\)/);
  assert.match(route,/restockProductVariant\(variantId,amount\)/);
  assert.doesNotMatch(route,/moneyCents|price_cents|cost_price_cents|req\.body\.price|req\.body\.costPrice/);
  assert.match(db,/UPDATE products\s+SET stock=stock\+\?, updated_at=datetime\('now'\)\s+WHERE id=\? AND stock<=100000000-\?/);
  assert.match(form,/Add stock without changing the product/);
  assert.match(form,/this quick action does not ask for any prices/);
});

test('price guidance separates regular price, optional sale price and automatic discount',()=>{
  const form=read('views/admin/product-form.ejs');
  const server=read('src/server.js');
  assert.match(form,/for example 32,80 or 32\.80/);
  assert.match(form,/Optional\. Use a price lower than the regular price\. Leave blank when there is no sale\./);
  assert.match(form,/this discount applies only to this product/);
  assert.match(server,/SALE_PRICE:'Sale price is optional, but when entered it must be greater than zero and lower than the regular price/);
  assert.match(read('src/security.js'),/export const moneyCents/);
});

test('cart makes each discount step and per-item discounted price clear',()=>{
  const cart=read('views/cart.ejs');
  assert.match(cart,/Subtotal before discounts/);
  assert.match(cart,/Automatic product discounts/);
  assert.match(cart,/Discount code/);
  assert.match(cart,/Delivery/);
  assert.match(cart,/Order total/);
  assert.match(cart,/formatPrice\(i\.basePrice,currency\)/);
  assert.match(cart,/formatPrice\(i\.price,currency\)/);
  assert.match(cart,/Continue shopping/);
  assert.match(cart,/saves you/);
});

test('pending orders do not have a configurable time limit and show relative age',()=>{
  const server=read('src/server.js');
  const db=read('src/db.js');
  const settings=read('views/admin/settings.ejs');
  const order=read('views/admin/order-cash.ejs');
  assert.doesNotMatch(server,/reservation_hours|reservationHours|reservationMinutes/);
  assert.doesNotMatch(db,/isValidReservationMinutes|reservationMinutes=/);
  assert.doesNotMatch(settings,/Time reserved for a new order|reservationHours|Pending-order stock hold/);
  assert.match(order,/There is no automatic time limit/);
  assert.match(server,/app\.locals\.formatRelativeTime/);
});

test('new price/category helper strings are available in English, Sorani, Arabic and Dutch dictionaries',()=>{
  const master=JSON.parse(read('public/js/i18n.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/)[1]);
  const ckb=JSON.parse(read('public/js/i18n-ckb.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const ar=JSON.parse(read('public/js/i18n-ar.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const nl=JSON.parse(read('public/js/i18n-nl.js').match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/)[1]);
  const phrases=[
    '0 means no extra discount. If set, this discount applies only to this product and is applied after the sale price (when a sale is active).',
    'Optional. Choose a parent only for a subcategory, such as Mugs under Homeware. Leave it as Top-level category for a main group.',
    'Optional. Paste a public HTTPS image link. Leave blank to use the default category image.',
    'Lower numbers appear earlier in the shop.',
    'Show this category in the shop',
  ];
  for(const phrase of phrases){
    assert.equal(typeof master.en[phrase],'string',`English missing: ${phrase}`);
    assert.equal(typeof master.ckb[phrase],'string',`Sorani master missing: ${phrase}`);
    assert.equal(typeof master.ar[phrase],'string',`Arabic master missing: ${phrase}`);
    assert.notEqual(ckb.ckb[phrase],phrase,`Sorani runtime translation missing: ${phrase}`);
    assert.notEqual(ar.ar[phrase],phrase,`Arabic runtime translation missing: ${phrase}`);
    assert.notEqual(nl.nl[phrase],phrase,`Dutch runtime translation missing: ${phrase}`);
  }
});
