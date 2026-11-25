import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { DUMMY_PASSWORD_HASH } from '../src/password-hashing.js';

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-catalog-privacy-release-'));
const database=path.join(directory,'fixture.db');
process.env.DATABASE_URL=pathToFileURL(database).href;
process.env.SHOP_DATABASE_URL=process.env.DATABASE_URL;
process.env.CLOUDFLARE_WORKER='0';
process.env.SEED_DEMO_DATA='false';
process.env.MANAGER_EMAIL='';
process.env.MANAGER_PASSWORD='';
const store=await import('../src/db.js');
const db=store.default;
const managerId=await store.createUser('privacy-manager@example.test',DUMMY_PASSWORD_HASH,'manager','Test Manager');
await store.setSetting('feature_gift_cards_enabled','1');
let sequence=0;
after(()=>{db.close();fs.rmSync(directory,{recursive:true,force:true});});

async function rows(sql,args=[]) { return (await db.execute({sql,args})).rows; }
async function first(sql,args=[]) { return (await rows(sql,args))[0]; }
async function product(extra={}) {
  const number=++sequence;
  return store.adminCreateOrUpdateProduct({name:`Release product ${number}`,slug:`release-product-${number}`,sku:`RELEASE-${number}`,
    shortDescription:'Disposable fixture',description:'Synthetic local test only',imageUrl:'',galleryImages:[],priceCents:1000,costPriceCents:400,
    salePriceCents:null,automaticDiscountPercent:0,stock:12,reorderLevel:2,categoryId:null,tags:'',featured:false,active:true,variants:[],...extra});
}
async function customerOrder({gift=true,completed=false}={}) {
  const number=++sequence;
  const email=`privacy-buyer-${number}@example.test`;
  const customerId=await store.createUser(email,DUMMY_PASSWORD_HASH,'customer',`Disposable Buyer ${number}`);
  const productId=await product();
  const card=gift?await store.issueGiftCard({amountCents:5000,currency:'EUR',managerId}):null;
  const created=await store.createOrderAtomic({userId:customerId,email,customerPhone:'+442079460001',
    items:[{productId,quantity:1}],shipping:{name:`Disposable Buyer ${number}`,address:'1 Synthetic Street',city:'London',postalCode:'SW1A 1AA',country:'GB'},
    currency:'EUR',paymentProvider:gift?'gift_card':'cash_on_delivery',giftCardCode:card?.code||'',
    clientToken:`release-privacy-${String(++sequence).padStart(24,'0')}`,termsAcceptedAt:new Date().toISOString(),termsLocale:'en',termsPolicyHash:'test-only-policy'});
  if(completed) {
    assert.equal(await store.setOrderStatus(created.orderId,'processing',managerId),true);
    assert.equal(await store.setOrderStatus(created.orderId,'shipped',managerId),true);
    if(!gift) await db.execute({sql:"UPDATE orders SET payment_reference='cash_received:test-only' WHERE id=?",args:[created.orderId]});
    assert.equal(await store.setOrderStatus(created.orderId,'completed',managerId),true);
  }
  return {customerId,email,productId,card,...created};
}
const policy={actorUserId:managerId,mode:'minimize-retain-financial',retentionAcknowledged:true,retentionPolicyReference:'TEST-POLICY-2026-001'};

test('concurrent category reparenting rejects the second cycle-forming update',async()=>{
  const a=await store.createCategory('Race category A','release-race-a');
  const b=await store.createCategory('Race category B','release-race-b');
  const results=await Promise.allSettled([
    store.updateCategory(a,'Race category A','release-race-a',{parentId:b}),
    store.updateCategory(b,'Race category B','release-race-b',{parentId:a})
  ]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const rejected=results.find(result=>result.status==='rejected');
  assert.match(rejected.reason.message,/CATEGORY_CYCLE/);
  const current=await rows('SELECT id,parent_id FROM categories WHERE id IN (?,?) ORDER BY id',[a,b]);
  assert.equal(Number(current[0].parent_id)===b&&Number(current[1].parent_id)===a,false);
});

test('legacy cyclic categories cannot make actual catalogue list/count recurse forever',()=>{
  return (async()=>{
    const a=await store.createCategory('Legacy cycle A','release-legacy-a');
    const b=await store.createCategory('Legacy cycle B','release-legacy-b');
    await product({categoryId:a});await product({categoryId:b});
    await db.execute({sql:'UPDATE categories SET parent_id=? WHERE id=?',args:[b,a]});
    await db.execute({sql:'UPDATE categories SET parent_id=? WHERE id=?',args:[a,b]});
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./helpers/r27-category-cycle-query.mjs',import.meta.url)),database,'release-legacy-a'],{
      env:{...process.env},encoding:'utf8',timeout:5000,killSignal:'SIGKILL'
    });
    assert.equal(result.error,undefined,'cyclic catalogue query must finish within its external watchdog');
    assert.equal(result.status,0,'cyclic query child must complete successfully');
    const summary=JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.deepEqual(summary,{listed:2,count:2,uniqueIds:2});
    await assert.rejects(store.createCategory('Rejected legacy child','release-legacy-child',{parentId:a}),/CATEGORY_CYCLE/);
    // An operator can repair the legacy hierarchy with an ordinary root reparent.
    await store.updateCategory(a,'Legacy cycle A','release-legacy-a',{parentId:null});
    assert.equal((await store.listProducts({category:'release-legacy-a'})).length,2);
  })();
});

test('same-day sale starts/ends agree between display, SQL price, filters, count and sort',async()=>{
  const now=new Date('2026-11-13T12:00:00.500Z');
  const category=await store.createCategory('Sale boundary fixtures','release-sale-boundaries');
  const active=await product({categoryId:category,salePriceCents:500,saleStart:'2026-11-13T11:00:00.000Z',saleEnd:'2026-11-13T13:00:00.000Z'});
  const ended=await product({categoryId:category,salePriceCents:300,saleStart:null,saleEnd:'2026-11-13T10:00:00.000Z'});
  const starting=await product({categoryId:category,salePriceCents:400,saleStart:now.toISOString(),saleEnd:null});
  const ending=await product({categoryId:category,salePriceCents:600,saleStart:null,saleEnd:now.toISOString()});
  const future=await product({categoryId:category,salePriceCents:100,saleStart:'2026-11-13T12:00:00.501Z',saleEnd:null});
  const justEnded=await product({categoryId:category,salePriceCents:200,saleStart:null,saleEnd:'2026-11-13T12:00:00.499Z'});
  const all=await store.listProducts({category:'release-sale-boundaries',sort:'price_low',now});
  for(const row of all)assert.equal(Number(row.available_price),store.effectivePrice(row,now));
  assert.deepEqual(all.slice(0,3).map(row=>Number(row.id)),[starting,active,ending]);
  const filtered=await store.listProducts({category:'release-sale-boundaries',maxPriceCents:600,now});
  assert.deepEqual(new Set(filtered.map(row=>Number(row.id))),new Set([active,starting,ending]));
  assert.equal(await store.countProducts({category:'release-sale-boundaries',maxPriceCents:600,now}),3);
  for(const id of [ended,future,justEnded])assert.equal(Number(all.find(row=>Number(row.id)===id).available_price),1000);
});

test('legacy SQLite UTC timestamps and explicit timezone offsets use the same sale instant',async()=>{
  const id=await product({salePriceCents:500});
  const now=new Date('2026-11-13T12:00:00.000Z');
  for(const [start,end,expected] of [
    ['', '', 500],
    ['2026-11-13 11:00:00','2026-11-13 13:00:00',500],
    ['2026-11-13T13:00:00+01:00','2026-11-13T14:00:00+01:00',500],
    ['2026-11-13T13:00:00+00:00',null,1000],
    ['invalid-date',null,1000]
  ]) {
    await db.execute({sql:'UPDATE products SET sale_start=?,sale_end=? WHERE id=?',args:[start,end,id]});
    const row=(await store.listProducts({search:(await store.getProductById(id)).sku,now})).find(row=>Number(row.id)===id);
    assert.equal(Number(row.available_price),expected);
    assert.equal(store.effectivePrice(row,now),expected);
  }
});

test('default deletion rejects an open COD order and permits deletion after explicit cancellation',async()=>{
  const fixture=await customerOrder({gift:false});
  const before=await store.getProductById(fixture.productId);
  assert.equal(Number(before.reserved_stock),1);
  await assert.rejects(store.deleteGdprCustomerData({customerId:fixture.customerId},{actorUserId:managerId}),/GDPR_OPEN_ORDERS/);
  assert.equal(Number((await store.getProductById(fixture.productId)).reserved_stock),1);
  assert.equal(await store.cancelPendingOrder(fixture.orderId,'Explicit cancellation before eligible deletion'),true);
  const result=await store.deleteGdprCustomerData({customerId:fixture.customerId},{actorUserId:managerId});
  assert.equal(result.ordersDeleted,1);assert.equal(result.accountDeleted,true);assert.equal(result.ordersMinimized,0);
  assert.equal((await rows('SELECT id FROM orders WHERE id=?',[fixture.orderId])).length,0);
  const afterProduct=await store.getProductById(fixture.productId);
  assert.equal(Number(afterProduct.reserved_stock),0);assert.equal(Number(afterProduct.stock),Number(before.stock));
});

test('gift-card default deletion fails clearly before stock or customer mutation',async()=>{
  const fixture=await customerOrder();
  const before=await store.getProductById(fixture.productId);
  await assert.rejects(store.deleteGdprCustomerData({customerId:fixture.customerId},{actorUserId:managerId}),/GDPR_FINANCIAL_RETENTION_REQUIRED/);
  assert.equal((await rows('SELECT id FROM users WHERE id=?',[fixture.customerId])).length,1);
  assert.equal((await rows('SELECT id FROM gift_card_ledger WHERE order_id=?',[fixture.orderId])).length,1);
  assert.equal(Number((await store.getProductById(fixture.productId)).reserved_stock),Number(before.reserved_stock));
});

test('financial minimization requires explicit true acknowledgment and a bounded policy reference',async()=>{
  const fixture=await customerOrder({completed:true});
  for(const acknowledgment of [false,'false',1])await assert.rejects(store.deleteGdprCustomerData({customerId:fixture.customerId},{...policy,retentionAcknowledged:acknowledgment}),/GDPR_RETENTION_ACK_REQUIRED/);
  for(const reference of ['', 'x'.repeat(201), 'bad\nreference'])await assert.rejects(store.deleteGdprCustomerData({customerId:fixture.customerId},{...policy,retentionPolicyReference:reference}),/GDPR_RETENTION_POLICY_REQUIRED/);
  await assert.rejects(store.deleteGdprCustomerData({customerId:fixture.customerId},{...policy,actorUserId:fixture.customerId}),/GDPR_ACTOR_REQUIRED/);
  assert.equal((await rows('SELECT id FROM users WHERE id=?',[fixture.customerId])).length,1);
});

test('open fulfilment and open returns prevent financial minimization without partial changes',async()=>{
  const open=await customerOrder();
  await assert.rejects(store.deleteGdprCustomerData({customerId:open.customerId},policy),/GDPR_OPEN_ORDERS/);
  assert.equal((await store.getOrder(open.orderId)).email,open.email);
  const completed=await customerOrder({completed:true});
  const order=await store.getOrder(completed.orderId);
  const returnId=await store.createOrderReturnRequest({orderId:completed.orderId,userId:completed.customerId,orderItemId:order.items[0].id,quantity:1,requestType:'refund',reason:'Synthetic request'});
  await assert.rejects(store.deleteGdprCustomerData({customerId:completed.customerId},policy),/GDPR_OPEN_RETURNS/);
  assert.equal((await store.getOrder(completed.orderId)).email,completed.email);
  assert.equal((await store.processOrderReturn({returnId,action:'reject',managerUserId:managerId})).changed,true);
  const result=await store.deleteGdprCustomerData({customerId:completed.customerId},policy);
  assert.equal(result.financialRecordsRetained,1);
});

test('explicit financial minimization removes known contact/access/free text and retains ledger integrity',async()=>{
  const fixture=await customerOrder({completed:true});
  const untouched=await customerOrder({completed:true});
  const marker='SYNTHETIC-CUSTOMER-CONTACT-MARKER';
  const persisted=await store.getOrder(fixture.orderId);
  const returnId=await store.createOrderReturnRequest({orderId:fixture.orderId,userId:fixture.customerId,orderItemId:persisted.items[0].id,quantity:1,requestType:'refund',reason:marker});
  assert.equal((await store.processOrderReturn({returnId,action:'reject',managerUserId:managerId,note:marker})).changed,true);
  await db.execute({sql:`UPDATE orders SET customer_note=?,tax_rule_snapshot=?,shipping_rule_snapshot=?,cancellation_reason=?,cancellation_request_reason=?,payment_instructions_snapshot=?,payment_url=?,guest_access_token_hash=?,last_status_actor_user_id=? WHERE id=?`,args:[marker,marker,marker,marker,marker,marker,marker,marker,fixture.customerId,fixture.orderId]});
  await db.execute({sql:'UPDATE order_returns SET manager_note=?,exchange_tracking_reference=?,refund_reference=? WHERE id=?',args:[marker,marker,'RETAINED-REFUND-REFERENCE',returnId]});
  await db.execute({sql:'UPDATE return_requests SET reason=?,manager_note=? WHERE id=?',args:[marker,marker,returnId]});
  await db.execute({sql:'UPDATE order_status_history SET note=?,actor_user_id=? WHERE order_id=?',args:[marker,fixture.customerId,fixture.orderId]});
  await db.execute({sql:'UPDATE gift_card_ledger SET note=? WHERE order_id=?',args:[marker,fixture.orderId]});
  await db.execute({sql:"INSERT INTO order_email_deliveries(order_id,event_key,event_type,status,recipient_email,provider_message_id,error_code) VALUES(?,'test-confirmation','confirmation','sent',?,?,?)",args:[fixture.orderId,fixture.email,marker,marker]});
  await db.execute({sql:"INSERT INTO sessions(id,user_id,created_at,expires_at,csrf_token) VALUES(?,?,?,?,?)",args:[`test-session-${++sequence}`,fixture.customerId,Date.now(),Date.now()+60000,marker]});
  await db.execute({sql:"INSERT INTO newsletter_subscriptions(email,status,unsubscribe_hash) VALUES(?,'active',?)",args:[fixture.email,`test-unsubscribe-${++sequence}`]});
  await db.execute({sql:"INSERT INTO stock_alerts(product_id,email,status) VALUES(?,?,'confirmed')",args:[fixture.productId,fixture.email]});
  const campaign=await db.execute({sql:'INSERT INTO newsletter_campaigns(subject,body,created_by) VALUES(?,?,?)',args:['Test campaign','Synthetic content',managerId]});
  await db.execute({sql:"INSERT INTO newsletter_deliveries(campaign_id,email,status) VALUES(?,?,'sent')",args:[Number(campaign.lastInsertRowid),fixture.email]});
  await db.execute({sql:"INSERT INTO product_reviews(product_id,user_id,rating,title,body,status) VALUES(?,?,5,?,?,'approved')",args:[fixture.productId,fixture.customerId,marker,marker]});
  const emailHash=crypto.createHash('sha256').update(fixture.email).digest('hex');
  await db.execute({sql:'INSERT INTO account_login_limits(email_hash,window_started_at_ms,attempts) VALUES(?,?,1)',args:[emailHash,Date.now()]});
  await store.createAudit(managerId,'test_customer_action','customer',String(fixture.customerId),{contact:marker});
  await store.createAudit(managerId,'test_order_action','order',String(fixture.orderId),{contact:marker});
  const stockBefore=await store.getProductById(fixture.productId);
  const ledgerBefore=await rows('SELECT id,gift_card_id,order_id,event,amount_cents FROM gift_card_ledger WHERE order_id=?',[fixture.orderId]);
  const cardBefore=await first('SELECT balance_cents FROM gift_cards WHERE id=?',[fixture.card.id]);
  const result=await store.deleteGdprCustomerData({customerId:fixture.customerId},policy);
  assert.equal(result.ordersDeleted,0);assert.equal(result.ordersMinimized,1);assert.equal(result.financialRecordsRetained,1);assert.equal(result.sessionsDeleted,1);assert.equal(result.accountDeleted,true);
  const retained=await first('SELECT * FROM orders WHERE id=?',[fixture.orderId]);
  assert.equal(retained.user_id,null);assert.match(retained.email,/^redacted-[0-9a-f-]+@privacy\.invalid$/);
  for(const key of ['shipping_name','shipping_address','shipping_city','shipping_postal_code','customer_phone','customer_note','tax_rule_snapshot','shipping_rule_snapshot','cancellation_reason','cancellation_request_reason','payment_instructions_snapshot','payment_credential_fingerprint'])assert.equal(retained[key],'',key);
  for(const key of ['guest_access_token_hash','payment_url','client_token','last_status_actor_user_id'])assert.equal(retained[key],null,key);
  assert.equal(Number(retained.total_cents),Number(persisted.total_cents));assert.equal(retained.currency,persisted.currency);assert.equal(retained.shipping_country,persisted.shipping_country);assert.equal(retained.created_at,persisted.created_at);assert.equal(retained.payment_reference,persisted.payment_reference);
  assert.deepEqual(await rows('SELECT id,gift_card_id,order_id,event,amount_cents FROM gift_card_ledger WHERE order_id=?',[fixture.orderId]),ledgerBefore);
  assert.equal(Number((await first('SELECT balance_cents FROM gift_cards WHERE id=?',[fixture.card.id])).balance_cents),Number(cardBefore.balance_cents));
  assert.equal(Number((await store.getProductById(fixture.productId)).stock),Number(stockBefore.stock));
  assert.equal(Number((await store.getProductById(fixture.productId)).reserved_stock),Number(stockBefore.reserved_stock));
  for(const [table,where,value] of [['users','id',fixture.customerId],['sessions','user_id',fixture.customerId],['product_reviews','user_id',fixture.customerId],['newsletter_subscriptions','email',fixture.email],['stock_alerts','email',fixture.email],['newsletter_deliveries','email',fixture.email],['account_login_limits','email_hash',emailHash]])assert.equal((await rows(`SELECT 1 FROM ${table} WHERE ${where}=?`,[value])).length,0,table);
  const related={orders:retained,returns:await rows('SELECT * FROM order_returns WHERE order_id=?',[fixture.orderId]),legacyReturns:await rows('SELECT * FROM return_requests WHERE order_id=?',[fixture.orderId]),history:await rows('SELECT * FROM order_status_history WHERE order_id=?',[fixture.orderId]),email:await rows('SELECT * FROM order_email_deliveries WHERE order_id=?',[fixture.orderId]),ledger:await rows('SELECT * FROM gift_card_ledger WHERE order_id=?',[fixture.orderId]),audit:await rows("SELECT * FROM audit_logs WHERE (target_type='customer' AND target_id=?) OR (target_type='order' AND target_id=?)",[String(fixture.customerId),String(fixture.orderId)])};
  assert.equal(JSON.stringify(related).includes(marker),false);
  assert.equal(JSON.stringify(related).includes(fixture.email),false);
  assert.equal(related.returns[0].refund_reference,'RETAINED-REFUND-REFERENCE');
  const audit=related.audit.find(row=>row.action==='gdpr_customer_delete');
  assert.equal(JSON.parse(audit.meta_json).retention_policy_reference,policy.retentionPolicyReference);
  assert.equal(JSON.parse(audit.meta_json).orders_minimized,1);
  assert.equal((await store.getOrder(untouched.orderId)).email,untouched.email);
  assert.equal((await rows('PRAGMA foreign_key_check')).length,0);
});
