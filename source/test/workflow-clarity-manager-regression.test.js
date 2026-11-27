import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStoredTimestamp } from '../src/security.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('SQLite UTC timestamps are interpreted as UTC and explicit zones remain intact',()=>{
  assert.equal(parseStoredTimestamp('2026-10-18 16:00:00').toISOString(),'2026-10-18T16:00:00.000Z');
  assert.equal(parseStoredTimestamp('2026-10-18T16:00:00Z').toISOString(),'2026-10-18T16:00:00.000Z');
  assert.ok(Number.isNaN(parseStoredTimestamp('not a timestamp').getTime()));
  assert.match(read('src/server.js'),/formatRelativeTime = \(value\)=>\{ const timestamp=parseStoredTimestamp\(value\)\.getTime\(\)/);
});

test('delete action stays visible with a reason and delete cannot silently archive',()=>{
  const server=read('src/server.js'),list=read('views/admin/products.ejs'),edit=read('views/admin/product-form.ejs');
  assert.match(list,/Delete permanently/); assert.match(list,/productHasHistory/); assert.match(edit,/product-danger-zone/);
  const start=server.indexOf("app.post('/admin/products/delete'"); const end=server.indexOf("app.get('/admin/stories'",start);
  assert.doesNotMatch(server.slice(start,end),/await archiveProduct\(id\)/);
});

test('permanent delete returns safely to the manager catalogue filter and shows success feedback',()=>{
 const server=read('src/server.js'),list=read('views/admin/products.ejs'),integration=read('scripts/manager-dashboard-integration.mjs');
 const start=server.indexOf("app.post('/admin/products/delete'"),end=server.indexOf("app.get('/admin/stories'",start),route=server.slice(start,end);
 assert.ok(start>=0&&end>start,'the delete route should remain a distinct handler');
 assert.match(server,/import \{ buildProductDeleteRedirect \} from '\.\/product-list-navigation\.js'/,'delete redirect helper must be imported from the tested module');
 assert.match(route,/typeof req\.body\.returnStatus==='string'/,'only a scalar return status may be considered');
 assert.match(route,/buildProductDeleteRedirect\(requestedReturnStatus,notice\)/,'delete route must use the allow-listed helper');
 assert.doesNotMatch(route,/res\.redirect\(303,\s*req\.body\./,'a submitted field must never become a redirect URL');
 assert.equal((list.match(/name="returnStatus" value="<%= status %>"/g)||[]).length,2,'both active and archived delete forms preserve the current manager filter');
 assert.match(integration,/returnStatus:'archived'/,'the HTTP test submits the archived filter just like the real form');
 assert.match(integration,/Product permanently deleted\\\./,'the HTTP test confirms the success message renders after redirect');
});

test('product detail has option cards plus related products below the main detail',()=>{
 const product=read('views/product.ejs'),app=read('public/js/app.js'),server=read('src/server.js');
 assert.match(product,/data-option-one-select/); assert.match(product,/data-option-two-select/); assert.match(product,/data-product-variant-form/); assert.match(product,/data-gallery-image/); assert.match(product,/You may also like/); assert.match(product,/relatedProducts\.forEach/); assert.match(app,/data-option-one-select/); assert.match(app,/data-gallery-image/); assert.match(server,/relatedProducts/);
 assert.match(product,/if\(isManager && managerProduct\)/); assert.match(product,/action="\/admin\/products\/delete"/); assert.match(product,/action="\/admin\/products\/archive"/); assert.match(server,/isManager\?getProductById\(product\.id\):Promise\.resolve\(null\)/);
});

test('orders have a clear Manage action and legacy pending orders have a safe action',()=>{
 const list=read('views/admin/orders.ejs'),detail=read('views/admin/order.ejs');
 assert.match(list,/Manage order/); assert.match(list,/formatDateTimeDisplay\(o\.created_at,storeTimeZone\)/); assert.match(detail,/Cancel legacy order/);
 assert.match(detail,/Cancel this pending legacy order and release its reserved stock/);
 assert.match(detail,/order\.status === 'pending' && order\.payment_provider === 'mollie'/);
 assert.doesNotMatch(detail,/Cancel pending order &amp; release stock/);
});

test('checkout selects only configured delivery countries and explains the delivery area',()=>{
 const checkout=read('views/checkout.ejs'),server=read('src/server.js');
 assert.match(checkout,/deliveryCountries\.length===1/); assert.match(checkout,/Orders to other countries cannot be placed/); assert.match(server,/if\(!matchedCountry\) return res\.status\(400\)/);
});

test('manager dashboard includes launch readiness and direct next-step links',()=>{
 const route=read('src/server.js'),view=read('views/admin/dashboard.ejs');
 assert.match(route,/getDashboardStats\(\),listOrders\(\{limit:6,offset:0\}\),req\.shopLaunchSnapshot\?\?storeLaunchConfig\(\)/); assert.match(view,/STORE READINESS/); assert.match(view,/Review store settings/); assert.match(view,/Add your first product/);
});

