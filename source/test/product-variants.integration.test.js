import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DUMMY_PASSWORD_HASH } from '../src/password-hashing.js';

// Isolate database integration tests from a developer's working storefront.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-variants-'));
process.env.SHOP_DATABASE_URL = pathToFileURL(path.join(tempDir, 'shop.db')).href;
const store = await import('../src/db.js');
const {
  adminCreateOrUpdateProduct, listProductVariants, getProductById, createOrderAtomic,
  getOrder, cancelPendingOrder, cancelOrderBeforeShipping, requestOrderCancellation,
  setOrderStatus, archiveProduct, restoreProduct, permanentlyDeleteArchivedProduct, listProducts, countProducts, listProductImages,
  createUser
} = store;
const db=store.default;
// These tests persist status-attribution fields with users(id) foreign keys.
// Seed one real Manager fixture instead of passing nonexistent hard-coded IDs (5/9).
const managerActorId = await createUser(
  'variant-test-manager@example.test',
  DUMMY_PASSWORD_HASH,
  'manager',
  'Variant Integration Manager'
);
let sequence = 0;

function productData({name, slug, sku, stock=0, variants=[], imageUrl='', galleryImages=[imageUrl], variantOptionName='Size', variantOptionName2=''}) {
  return {
    name, slug, shortDescription:'Integration test item', description:'Temporary automated integration-test product.',
    imageUrl, galleryImages, priceCents:1200, costPriceCents:500, salePriceCents:null, saleStart:null, saleEnd:null,
    automaticDiscountPercent:0, sku, stock, reorderLevel:2, categoryId:null, tags:'test',
    featured:false, active:true, variants, variantOptionName, variantOptionName2
  };
}
function orderData(items) {
  sequence++;
  return {
    userId:null, email:'buyer@example.test', customerPhone:'+32412345678', items,
    shipping:{name:'Test Buyer',address:'1 Test Street',city:'Brussels',postalCode:'1000',country:'BE'},
    shippingCents:0,currency:'EUR',paymentProvider:'cash_on_delivery',
    clientToken:`variant-test-token-${String(sequence).padStart(24,'0')}`,
    termsAcceptedAt:new Date().toISOString(),termsLocale:'en',termsPolicyHash:'test-policy-hash',reservationMinutes:1440
  };
}
async function createOrder(items) { return createOrderAtomic(orderData(items)); }

 test('variant inventory is separate per size; selection is required; cancellation releases exactly that option', async () => {
  const productId = await adminCreateOrUpdateProduct(productData({name:'Test Runner Shoe',slug:'test-runner-shoe',sku:'TEST-SHOE',variants:[{value:'42',stock:3},{value:'43',stock:5}]}));
  const variants = await listProductVariants(productId);
  assert.equal(variants.length,2);
  assert.deepEqual(variants.map(v=>[v.option_value,Number(v.available_stock)]),[['42',3],['43',5]]);
  const product = await getProductById(productId);
  assert.equal(Number(product.available_stock),8);
  assert.equal(Number(product.variant_count),2);

  await assert.rejects(createOrder([{productId,quantity:1}]),{message:'VARIANT_REQUIRED'});
  assert.equal(Number((await listProductVariants(productId)).find(v=>v.option_value==='42').reserved_stock),0);

  const variant42=variants.find(v=>v.option_value==='42');
  const order=await createOrder([{productId,variantId:Number(variant42.id),quantity:2}]);
  let refreshed=(await listProductVariants(productId)).find(v=>v.option_value==='42');
  assert.equal(Number(refreshed.reserved_stock),2);
  assert.equal(Number(refreshed.available_stock),1);
  assert.equal(await archiveProduct(productId),false,'a product must not archive while a variant reservation exists');
  await assert.rejects(adminCreateOrUpdateProduct({...productData({name:'Test Runner Shoe',slug:'test-runner-shoe',sku:'TEST-SHOE',variants:[{value:'42',stock:3},{value:'43',stock:5}]}),id:productId,active:false}),{message:'RESERVED_PRODUCT_VISIBILITY'});
  assert.equal(Number((await getProductById(productId)).active),1,'editing visibility cannot bypass archive guard');
  const managerProduct=(await listProducts({onlyActive:false,status:'active',search:'Test Runner Shoe',limit:20})).find(p=>Number(p.id)===productId);
  assert.equal(Number(managerProduct?.reserved_inventory_total),2,'manager list must show variant-level reservations, not only base stock reservations');
  const savedOrder=await getOrder(order.orderId);
  assert.equal(savedOrder.items[0].variant_value,'42');
  assert.match(savedOrder.items[0].sku,/^VAR-/);

  assert.equal(await cancelPendingOrder(order.orderId,'Test cancellation','customer'),true);
  refreshed=(await listProductVariants(productId)).find(v=>v.option_value==='42');
  assert.equal(Number(refreshed.reserved_stock),0);
  assert.equal(Number(refreshed.stock),3);
  assert.equal((await getOrder(order.orderId)).status,'cancelled');
 });

test('manager-approved cancellation releases a reserved variant, but COD completion consumes it', async () => {
  const productId = await adminCreateOrUpdateProduct(productData({name:'Test Option Bag',slug:'test-option-bag',sku:'TEST-BAG',variants:[{value:'Small',stock:4},{value:'Large',stock:6}]}));
  const variants = await listProductVariants(productId);
  const large=variants.find(v=>v.option_value==='Large');

  const cancelOrder=await createOrder([{productId,variantId:Number(large.id),quantity:2}]);
  assert.equal(await setOrderStatus(cancelOrder.orderId,'processing',managerActorId),true);
  assert.equal(await requestOrderCancellation(cancelOrder.orderId,'Customer changed their mind',null),true);
  assert.equal(await setOrderStatus(cancelOrder.orderId,'cancelled',managerActorId),true);
  let current=(await listProductVariants(productId)).find(v=>v.option_value==='Large');
  assert.equal(Number(current.reserved_stock),0);
  assert.equal(Number(current.stock),6);
  assert.equal((await getOrder(cancelOrder.orderId)).cancellation_request_decision,'approved');

  const deliveryOrder=await createOrder([{productId,variantId:Number(large.id),quantity:3}]);
  assert.equal(await setOrderStatus(deliveryOrder.orderId,'processing',managerActorId),true);
  assert.equal(await setOrderStatus(deliveryOrder.orderId,'shipped',managerActorId),true);
  assert.equal(await setOrderStatus(deliveryOrder.orderId,'completed',managerActorId),true);
  current=(await listProductVariants(productId)).find(v=>v.option_value==='Large');
  assert.equal(Number(current.stock),3);
  assert.equal(Number(current.reserved_stock),0);
  assert.equal((await getOrder(deliveryOrder.orderId)).status,'completed');
 });


test('manager can accept a pending COD order regardless of its age', async () => {
  const productId = await adminCreateOrUpdateProduct(productData({name:'Older Pending Order Item',slug:'older-pending-order-item',sku:'TEST-OLD-PENDING',stock:2}));
  const order = await createOrder([{productId,quantity:1}]);
  await store.default.execute({sql:"UPDATE orders SET reservation_expires_at=? WHERE id=?",args:[new Date(Date.now()-17*24*60*60*1000).toISOString(),order.orderId]});
  assert.equal(await setOrderStatus(order.orderId,'processing',managerActorId),true);
  assert.equal((await getOrder(order.orderId)).status,'processing');
  assert.equal(Number((await getProductById(productId)).reserved_stock),1);
});


test('variantless products keep simple stock, reject fake option IDs, and cannot be archived during a reservation', async () => {
  const simpleId=await adminCreateOrUpdateProduct(productData({name:'Test Flower Bunch',slug:'test-flower-bunch',sku:'TEST-FLOWERS',stock:7}));
  const simple=await getProductById(simpleId);
  assert.equal(Number(simple.variant_count),0);
  assert.equal(Number(simple.available_stock),7);
  await assert.rejects(createOrder([{productId:simpleId,variantId:999999,quantity:1}]),{message:'VARIANT_UNAVAILABLE'});

  const order=await createOrder([{productId:simpleId,quantity:2}]);
  const afterReservation=await getProductById(simpleId);
  assert.equal(Number(afterReservation.reserved_stock),2);
  assert.equal(await archiveProduct(simpleId),false);
  await assert.rejects(adminCreateOrUpdateProduct({...productData({name:'Test Flower Bunch',slug:'test-flower-bunch',sku:'TEST-FLOWERS',stock:7}),id:simpleId,active:false}),{message:'RESERVED_PRODUCT_VISIBILITY'});
  assert.equal(Number((await getProductById(simpleId)).active),1);
  assert.equal(await cancelOrderBeforeShipping(order.orderId,'Customer cancellation',managerActorId),true);
  const afterCancel=await getProductById(simpleId);
  assert.equal(Number(afterCancel.reserved_stock),0);
  assert.equal(Number(afterCancel.stock),7);
  assert.equal(await archiveProduct(simpleId),true);
});

test('active variant options stay unique and historical order options are snapshotted', async () => {
  const productId=await adminCreateOrUpdateProduct(productData({name:'Test Bottle',slug:'test-bottle',sku:'TEST-BOTTLE',variants:[{value:'500ml',stock:2},{value:'1L',stock:3}]}));
  await assert.rejects(adminCreateOrUpdateProduct({...productData({name:'Test Bottle',slug:'test-bottle',sku:'TEST-BOTTLE',variants:[{value:'500ml',stock:2},{value:'500ML',stock:3}]}),id:productId}),{message:'VARIANT_VALIDATION'});
  const variants=await listProductVariants(productId);
  const bottle=variants.find(v=>v.option_value==='500ml');
  const order=await createOrder([{productId,variantId:Number(bottle.id),quantity:1}]);
  await adminCreateOrUpdateProduct({...productData({name:'Test Bottle Updated',slug:'test-bottle-updated',sku:'TEST-BOTTLE',variants:[{value:'500ml',stock:2},{value:'1L',stock:3}]}),id:productId});
  const saved=await getOrder(order.orderId);
  assert.equal(saved.items[0].variant_name,'Size');
  assert.equal(saved.items[0].variant_value,'500ml');
  await cancelPendingOrder(order.orderId,'test cleanup','system');
});


test('colour × size variant matrix gives each combination its own SKU, stock and image; gallery and order snapshots persist', async () => {
  const main='/assets/test-shirt-main.svg';
  const side='/assets/test-shirt-side.svg';
  const red='/assets/test-shirt-red.svg';
  const id=await adminCreateOrUpdateProduct(productData({
    name:'Matrix Shirt',slug:'matrix-shirt',sku:'TEST-MATRIX-SHIRT',imageUrl:main,
    galleryImages:[main,side,red],variantOptionName:'Colour',variantOptionName2:'Size',
    variants:[
      {value:'Red',value2:'S',sku:'MATRIX-RED-S',stock:2,imageUrl:red},
      {value:'Red',value2:'M',sku:'MATRIX-RED-M',stock:4,imageUrl:red},
      {value:'Red',value2:'L',sku:'MATRIX-RED-L',stock:6,imageUrl:''},
      {value:'Blue',value2:'S',sku:'MATRIX-BLUE-S',stock:3,imageUrl:side},
      {value:'Blue',value2:'M',sku:'MATRIX-BLUE-M',stock:5,imageUrl:side},
      {value:'Blue',value2:'L',sku:'MATRIX-BLUE-L',stock:7,imageUrl:''},
    ]
  }));
  const variants=await listProductVariants(id);
  assert.equal(variants.length,6,'same size may be repeated across different colours');
  assert.deepEqual(variants.map(v=>`${v.option_value}/${v.option_value_2}`).sort(),['Blue/L','Blue/M','Blue/S','Red/L','Red/M','Red/S']);
  assert.deepEqual(variants.map(v=>[v.sku,Number(v.available_stock)]).sort((a,b)=>a[0].localeCompare(b[0])),[
    ['MATRIX-BLUE-L',7],['MATRIX-BLUE-M',5],['MATRIX-BLUE-S',3],['MATRIX-RED-L',6],['MATRIX-RED-M',4],['MATRIX-RED-S',2]
  ]);
  assert.equal(variants.find(v=>v.option_value==='Red'&&v.option_value_2==='M').image_url,red);
  assert.equal(variants.find(v=>v.option_value==='Blue'&&v.option_value_2==='S').image_url,side);
  const gallery=await listProductImages(id);
  assert.equal(gallery.length,3);
  assert.equal(gallery[0].image_url,main);
  assert.equal(Number(gallery[0].is_primary),1);
  assert.equal(gallery.some(image=>image.image_url===side),true);
  assert.equal(gallery.some(image=>image.image_url===red),true);

  const chosen=variants.find(v=>v.option_value==='Red'&&v.option_value_2==='M');
  const order=await createOrder([{productId:id,variantId:Number(chosen.id),quantity:2}]);
  const saved=await getOrder(order.orderId);
  assert.equal(saved.items[0].sku,'MATRIX-RED-M');
  assert.equal(saved.items[0].variant_name,'Colour');
  assert.equal(saved.items[0].variant_value,'Red');
  assert.equal(saved.items[0].variant_name_2,'Size');
  assert.equal(saved.items[0].variant_value_2,'M');
  assert.equal(Number((await listProductVariants(id)).find(v=>v.id===chosen.id).reserved_stock),2);
  assert.equal(await cancelPendingOrder(order.orderId,'matrix test cleanup','system'),true);
});

test.after(async () => {
  try { await db.close?.(); } catch {}
  try { fs.rmSync(tempDir,{recursive:true,force:true}); } catch {}
});


test('product lifecycle lists archived products, restores them, and permanently deletes only safe no-history products', async () => {
  const slug='lifecycle-empty-history';
  const id=await adminCreateOrUpdateProduct(productData({name:'Lifecycle Empty History',slug,sku:'TEST-LIFECYCLE-EMPTY',stock:4}));
  assert.equal(await archiveProduct(id),true);
  assert.equal(Number((await getProductById(id)).active),0);
  assert.equal(await store.getProductBySlug(slug),undefined,'archived product must not be public');
  const archived=await listProducts({onlyActive:false,status:'archived',search:'Lifecycle Empty History',limit:20});
  assert.ok(archived.some(p=>Number(p.id)===id));
  assert.equal(Number(archived.find(p=>Number(p.id)===id).order_item_count),0);
  assert.equal(await countProducts({onlyActive:false,status:'archived',search:'Lifecycle Empty History'}),1);
  assert.equal(await countProducts({onlyActive:false,status:'active',search:'Lifecycle Empty History'}),0);
  assert.equal(await restoreProduct(id),true);
  assert.equal(Number((await getProductById(id)).active),1);
  assert.ok(await store.getProductBySlug(slug),'restored product must become public again');
  assert.equal(await countProducts({onlyActive:false,status:'active',search:'Lifecycle Empty History'}),1);
  assert.equal(await archiveProduct(id),true);
  const deleted=await permanentlyDeleteArchivedProduct(id);
  assert.equal(Number(deleted.id),id);
  assert.equal(await getProductById(id),undefined,'safe no-history product can be permanently deleted');
});

test('product permanent deletion refuses all products with order-item history and restore keeps history intact', async () => {
  const id=await adminCreateOrUpdateProduct(productData({name:'Lifecycle Historical Product',slug:'lifecycle-historical-product',sku:'TEST-LIFECYCLE-HISTORY',stock:3}));
  const order=await createOrder([{productId:id,quantity:1}]);
  assert.equal(await cancelPendingOrder(order.orderId,'Lifecycle test cancellation','customer'),true);
  assert.equal(await archiveProduct(id),true);
  await assert.rejects(permanentlyDeleteArchivedProduct(id),{message:'PRODUCT_HAS_ORDER_HISTORY'});
  assert.equal(Number((await getProductById(id)).active),0,'rejected permanent delete must leave the product archived');
  const savedOrder=await getOrder(order.orderId);
  assert.equal(Number(savedOrder.items[0].product_id),id);
  assert.equal(savedOrder.items[0].product_name,'Lifecycle Historical Product');
  assert.equal(await restoreProduct(id),true);
  assert.equal(Number((await getProductById(id)).active),1);
});
