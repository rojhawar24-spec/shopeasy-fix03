import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DUMMY_PASSWORD_HASH } from '../src/password-hashing.js';

// Exercise real SQLite transactions without using a developer or production DB.
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-gift-commerce-'));
process.env.DATABASE_URL=pathToFileURL(path.join(directory,'shop.db')).href;
process.env.SHOP_DATABASE_URL=process.env.DATABASE_URL;
process.env.CLOUDFLARE_WORKER='0';
process.env.SEED_DEMO_DATA='false';
process.env.MANAGER_EMAIL='';
process.env.MANAGER_PASSWORD='';
const store=await import('../src/db.js');
const db=store.default;
const managerId=await store.createUser('gift-test-manager@example.test',DUMMY_PASSWORD_HASH,'manager','Gift Commerce Test Manager');
await store.setSetting('feature_gift_cards_enabled','1');
// Card IDs and order IDs are independent sequences; never authorize fulfilment
// by assuming that a card ID is also the payment's order reference.
await store.issueGiftCard({amountCents:500,currency:'EUR',managerId});
let sequence=0;
after(()=>{db.close();fs.rmSync(directory,{recursive:true,force:true});});

async function product({stock=7,variants=[]}={}) {
  const number=++sequence;
  return store.adminCreateOrUpdateProduct({
    name:`Gift fixture ${number}`,slug:`gift-fixture-${number}`,sku:`GIFT-FIXTURE-${number}`,
    shortDescription:'Disposable test product',description:'Local transaction test fixture',
    imageUrl:'',galleryImages:[],priceCents:1200,costPriceCents:500,salePriceCents:null,
    automaticDiscountPercent:0,stock,reorderLevel:2,categoryId:null,tags:'',featured:false,active:true,
    variants,variantOptionName:'Size',variantOptionName2:''
  });
}
async function order(items) {
  const card=await store.issueGiftCard({amountCents:10000,currency:'EUR',managerId});
  const created=await store.createOrderAtomic({
    userId:null,email:'gift-test-buyer@example.test',customerPhone:'+32412345678',items,
    shipping:{name:'Test Buyer',address:'1 Test Street',city:'Brussels',postalCode:'1000',country:'BE'},
    currency:'EUR',paymentProvider:'gift_card',giftCardCode:card.code,
    clientToken:`gift-commerce-${String(++sequence).padStart(24,'0')}`,
    termsAcceptedAt:new Date().toISOString(),termsLocale:'en',termsPolicyHash:'test-policy'
  });
  return {...created,card};
}
async function ship(orderId) {
  assert.equal(await store.setOrderStatus(orderId,'processing',managerId),true);
  assert.equal(await store.setOrderStatus(orderId,'shipped',managerId),true);
}
async function deliveredReturn() {
  const productId=await product();
  const created=await order([{productId,quantity:1}]);
  await ship(created.orderId);
  assert.equal(await store.setOrderStatus(created.orderId,'completed',managerId),true);
  const persisted=await store.getOrder(created.orderId);
  const returnId=await store.createOrderReturnRequest({orderId:created.orderId,userId:null,orderItemId:persisted.items[0].id,quantity:1,requestType:'refund',reason:'Customer refund requested'});
  assert.equal((await store.processOrderReturn({returnId,action:'approve',managerUserId:managerId})).changed,true);
  return {...created,returnId};
}
async function cardBalance(id) {
  return Number((await db.execute({sql:'SELECT balance_cents FROM gift_cards WHERE id=?',args:[id]})).rows[0].balance_cents);
}

test('gift-card fulfilment atomically consumes base and variant reservations exactly once',async()=>{
  const simple=await product({stock:7});
  const variantProduct=await product({variants:[{value:'Small',stock:6}]});
  const variant=(await store.listProductVariants(variantProduct))[0];
  const created=await order([{productId:simple,quantity:2},{productId:variantProduct,variantId:Number(variant.id),quantity:3}]);
  assert.notEqual(Number(created.card.id),created.orderId);
  assert.equal((await store.getOrder(created.orderId)).status,'paid');
  assert.equal(Number((await store.getProductById(simple)).reserved_stock),2);
  await ship(created.orderId);
  assert.equal(await store.setOrderStatus(created.orderId,'completed',managerId),true);
  const base=await store.getProductById(simple);
  const option=(await store.listProductVariants(variantProduct))[0];
  assert.equal(Number(base.stock),5);
  assert.equal(Number(base.reserved_stock),0);
  assert.equal(Number(option.stock),3);
  assert.equal(Number(option.reserved_stock),0);
  assert.equal(await store.setOrderStatus(created.orderId,'completed',managerId),false);
  assert.equal(Number((await store.getProductById(simple)).stock),5);
});

test('unsafe gift-card stock completion rolls back every item and preserves shipped status',async()=>{
  const first=await product({stock:4});
  const second=await product({stock:4});
  const created=await order([{productId:first,quantity:1},{productId:second,quantity:1}]);
  await ship(created.orderId);
  await db.execute({sql:'UPDATE products SET reserved_stock=0 WHERE id=?',args:[second]});
  await assert.rejects(store.setOrderStatus(created.orderId,'completed',managerId),/STOCK_INTEGRITY/);
  const unchanged=await store.getProductById(first);
  assert.equal(Number(unchanged.stock),4);
  assert.equal(Number(unchanged.reserved_stock),1);
  assert.equal((await store.getOrder(created.orderId)).status,'shipped');
});

test('manual item refund prevents a second full gift-credit refund in the SQL ledger',async()=>{
  const created=await deliveredReturn();
  const result=await store.processOrderReturn({returnId:created.returnId,action:'record_refund',managerUserId:managerId,refundAmountCents:100,refundMethod:'cash'});
  assert.equal(result.changed,true);
  const balance=await cardBalance(created.card.id);
  await assert.rejects(store.refundGiftCardOrderCredit({orderId:created.orderId,managerId,reason:'Customer refund confirmed'}),/REFUND|refund/);
  assert.equal(await cardBalance(created.card.id),balance);
  const ledger=await store.getGiftCardLedger(created.card.id);
  assert.equal(ledger.filter(row=>row.event==='refund').length,0);
});

test('credited gift tender prevents a later manual refund and sets the displayed ceiling to zero',async()=>{
  const created=await deliveredReturn();
  const credited=await store.refundGiftCardOrderCredit({orderId:created.orderId,managerId,reason:'Customer refund confirmed'});
  assert.equal(credited.refunded,true);
  assert.equal(await cardBalance(created.card.id),10000);
  const duplicate=await store.refundGiftCardOrderCredit({orderId:created.orderId,managerId,reason:'Customer refund confirmed'});
  assert.equal(duplicate.alreadyRefunded,true);
  const refused=await store.processOrderReturn({returnId:created.returnId,action:'record_refund',managerUserId:managerId,refundAmountCents:100,refundMethod:'bank_transfer'});
  assert.equal(refused.changed,false);
  const requests=await store.listOrderReturnRequests({});
  assert.equal(Number(requests.find(row=>Number(row.id)===created.returnId).refund_max_cents),0);
  assert.equal((await store.getGiftCardLedger(created.card.id)).filter(row=>row.event==='refund').length,1);
});

test('racing manual and gift-credit refunds cannot jointly exceed the paid order amount',async()=>{
  const created=await deliveredReturn();
  const outcomes=await Promise.allSettled([
    store.refundGiftCardOrderCredit({orderId:created.orderId,managerId,reason:'Concurrent refund request'}),
    store.processOrderReturn({returnId:created.returnId,action:'record_refund',managerUserId:managerId,refundAmountCents:100,refundMethod:'cash'})
  ]);
  const giftLedger=await store.getGiftCardLedger(created.card.id);
  const giftRefunded=giftLedger.filter(row=>row.event==='refund').reduce((sum,row)=>sum+Number(row.amount_cents),0);
  const manual=(await db.execute({sql:'SELECT COALESCE(SUM(refund_amount_cents),0) AS amount FROM order_returns WHERE order_id=? AND refund_recorded_at IS NOT NULL',args:[created.orderId]})).rows[0];
  assert.ok(giftRefunded+Number(manual.amount)<=created.total);
  assert.ok(outcomes.some(result=>result.status==='fulfilled'&&(result.value.refunded===true||result.value.changed===true)));
  assert.equal(giftRefunded>0&&Number(manual.amount)>0,false);
});
