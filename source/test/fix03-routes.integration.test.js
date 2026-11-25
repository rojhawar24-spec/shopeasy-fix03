import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-fix03-routes-'));
for(const key of Object.keys(process.env))if(/DATABASE|TURSO|MOLLIE|RESEND|PEPPOL|MANAGER|MFA|^AI_|SECRET|TOKEN|PASSWORD|API_KEY|^BASE_URL$/.test(key))delete process.env[key];
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:pathToFileURL(path.join(dir,'test.sqlite')).href,CLOUDFLARE_WORKER:'0',SEED_DEMO_DATA:'false',TEST_IMAGE_STORAGE_IN_DATABASE:'1',RATE_LIMIT_BACKEND:'memory-single-instance',TRUST_PROXY:'1',BASE_URL:'https://synthetic.example.test',MOLLIE_API_KEY:'test_Fix03NeverSent',MOLLIE_TEST_CHECKOUT_ENABLED:'true',ORDER_CONFIRMATION_EMAILS:'0',ORDER_STATUS_EMAILS:'0'});
const d=await import('../src/db.js');
const {run,getRow,getRows,db}=await import('../src/database.js');
const manager=await d.createUser('fix03-manager@example.test','synthetic-unused','manager','Synthetic Manager');
await run('UPDATE users SET mfa_enabled=1 WHERE id=?',[manager]);
const customer=await d.createUser('fix03-customer@example.test','synthetic-unused','customer','Synthetic Customer');
const restrictedAdmin=await d.createUser('fix03-admin@example.test','synthetic-unused','admin','Synthetic Admin');
const policy='Synthetic test policy only. No actual store sales, provider requests or customer transactions are permitted in this isolated fixture.';
await d.setSettings(Object.entries({store_name:'Synthetic FIX03 Store',support_email:'support@example.test',business_phone:'+32470123456',enterprise_number:'0123456789',legal_name:'Synthetic Test',business_address:'Test Street 1',privacy_policy:policy,terms_policy:policy,shipping_policy:policy,returns_policy:policy,prices_include_tax:'1',delivery_countries:'Belgium',payment_mode:'cash_and_card',payment_provider:'mollie',payment_merchant_country:'BE',shipping_fee_cents:'0',currency_price_review_required:'0'}));
let sequence=0;
async function product(stock=20){const n=++sequence;return Number((await run('INSERT INTO products(name,slug,sku,price_cents,cost_price_cents,stock) VALUES(?,?,?,?,?,?)',[`Synthetic ${n}`,`fix03-route-${n}`,`FIX03-HTTP-${n}`,1000,400,stock])).lastInsertRowid);}
async function session(userId=null){const sid=await d.createSession(userId),csrf=crypto.randomBytes(24).toString('base64url');await d.setSessionCsrf(sid,csrf);return {sid,csrf,cookie:`sid=${sid}`,ip:`198.51.100.${(++sequence%240)+1}`};}
await product(100); // A separate product keeps launch readiness true for last-unit scenarios.
const {default:app}=await import('../src/server.js');
const server=app.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`,originalFetch=globalThis.fetch;
let paymentMode='open',paymentCalls=[],mailMode='sent',mailCalls=[];
globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target.startsWith('https://api.mollie.com/v2/')){
    paymentCalls.push({body:options.body,key:options.headers?.['Idempotency-Key']});
    if(paymentMode==='failure')throw new Error('SYNTHETIC_PROVIDER_TRANSPORT_FAILURE');
    const body=JSON.parse(options.body),id='tr_Fix03'+body.metadata.shopEasyOrderId;
    return new Response(JSON.stringify({id,mode:'test',status:'open',amount:body.amount,metadata:body.metadata,_links:{checkout:{href:`https://checkout.mollie.com/fix03/${id}`}}}),{headers:{'content-type':'application/json'}});
  }
  if(target==='https://api.resend.com/emails'){
    mailCalls.push({body:options.body,key:options.headers?.['Idempotency-Key']});
    return new Response(JSON.stringify(mailMode==='sent'?{id:'synthetic-message-id'}:{error:'synthetic-unavailable'}),{status:mailMode==='sent'?200:503,headers:{'content-type':'application/json'}});
  }
  if(target.startsWith(base+'/'))return originalFetch(url,options);
  throw new Error('EXTERNAL_NETWORK_FORBIDDEN_IN_TEST');
};
test.after(async()=>{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));await db.close();fs.rmSync(dir,{recursive:true,force:true});});
async function request(route,actor,fields=null){
  const response=await fetch(base+route,{redirect:'manual',method:fields?'POST':'GET',headers:{...(actor?{cookie:actor.cookie,'x-forwarded-for':actor.ip}:{}),...(fields?{'content-type':'application/x-www-form-urlencoded'}:{})},...(fields?{body:new URLSearchParams({_csrf:actor?.csrf||'',...fields})}:{})});
  return {status:response.status,location:response.headers.get('location'),html:await response.text()};
}
async function fieldsFor(actor,id){await d.saveSessionCart(actor.sid,[{productId:id,quantity:1}]);const state=await d.getSession(actor.sid);return {customerEmail:'fix03-buyer@example.test',customerPhone:'+32470123456',shippingName:'Synthetic Buyer',shippingAddress:'Test Street 1',shippingCity:'Brussels',shippingPostalCode:'1000',shippingCountry:'Belgium',paymentMethod:'card',termsAccepted:'on',idempotencyKey:state.checkout_idempotency_key,guestAccessToken:state.checkout_guest_token};}
async function fixtureOrder({userId=null,provider='cash_on_delivery',status='pending',quantity=1}={}){
  const productId=await product(Math.max(20,quantity)),token=crypto.randomBytes(32).toString('base64url');
  const created=await d.createOrderAtomic({userId,email:'fixture@example.test',guestAccessTokenHash:userId?null:crypto.createHash('sha256').update(token).digest('hex'),items:[{productId,quantity}],shipping:{name:'Fixture Buyer',address:'Test Street 1',city:'Brussels',postalCode:'1000',country:'Belgium'},customerPhone:'+32470123456',clientToken:crypto.randomBytes(24).toString('base64url'),paymentProvider:provider,paymentCredentialFingerprint:provider==='mollie'?'a'.repeat(64):'',bankTransferDetails:provider==='bank_transfer'?{bankName:'Synthetic bank',accountHolder:'Synthetic holder',account:'12345678'}:null,termsAcceptedAt:new Date().toISOString()});
  if(status!=='pending')await run('UPDATE orders SET status=? WHERE id=?',[status,created.orderId]);
  return {order:await d.getOrder(created.orderId),productId,token};
}

test('COM-002 guest and owner last-unit retries survive refresh and reuse exact payment intent',async()=>{
  for(const userId of [null,customer]){
    paymentMode='failure';paymentCalls=[];
    const actor=await session(userId),id=await product(1),fields=await fieldsFor(actor,id);
    const first=await request('/checkout',actor,fields);assert.equal(first.status,503);
    const refreshed=await request('/checkout',actor);assert.equal(refreshed.status,200);
    assert.match(refreshed.html,/value="Synthetic Buyer"/);assert.match(refreshed.html,/value="card" checked/);
    paymentMode='open';const retried=await request('/checkout',actor,fields);
    assert.equal(retried.status,303);assert.match(retried.location,/^https:\/\/checkout\.mollie\.com\//);
    assert.equal(paymentCalls.length,2);assert.equal(paymentCalls[0].key,paymentCalls[1].key);assert.equal(paymentCalls[0].body,paymentCalls[1].body);
    assert.equal((await getRows('SELECT id FROM orders WHERE client_token=?',[fields.idempotencyKey])).length,1);
    assert.equal(Number((await getRow('SELECT reserved_stock FROM products WHERE id=?',[id])).reserved_stock),1);
  }
});
test('COM-002 the only sellable product can resume its own final-unit payment',async()=>{
  const originalProducts=await getRows('SELECT id,active FROM products');
  const actor=await session(),id=await product(1),fields=await fieldsFor(actor,id);
  await run('UPDATE products SET active=0 WHERE id<>?',[id]);
  paymentMode='failure';paymentCalls=[];
  try {
    assert.equal((await request('/checkout',actor,fields)).status,503);
    const refreshed=await request('/checkout',actor);
    assert.equal(refreshed.status,200);assert.doesNotMatch(refreshed.html,/<button[^>]*disabled[^>]*>This store cannot accept orders yet/);
    paymentMode='open';const retried=await request('/checkout',actor,fields);
    assert.equal(retried.status,303);assert.match(retried.location,/^https:\/\/checkout\.mollie\.com\//);assert.equal(paymentCalls.length,2);
  } finally {for(const row of originalProducts)await run('UPDATE products SET active=? WHERE id=?',[row.active,row.id]);}
});
test('COM-002 altered intent cannot use a prior reservation or start another provider payment',async()=>{
  paymentMode='failure';paymentCalls=[];
  const actor=await session(),id=await product(1),fields=await fieldsFor(actor,id);
  assert.equal((await request('/checkout',actor,fields)).status,503);
  const changed=await request('/checkout',actor,{...fields,shippingAddress:'Changed address'});
  assert.equal(changed.status,409);assert.equal(paymentCalls.length,1);
  assert.equal((await getRows('SELECT id FROM orders WHERE client_token=?',[fields.idempotencyKey])).length,1);
});
test('COM-002 changed credential and expired retry horizon remain blocked with last-unit stock',async()=>{
  for(const changed of ['credential','age']){
    paymentMode='failure';paymentCalls=[];
    const actor=await session(),id=await product(1),fields=await fieldsFor(actor,id);
    assert.equal((await request('/checkout',actor,fields)).status,503);
    const originalKey=process.env.MOLLIE_API_KEY;
    if(changed==='credential')process.env.MOLLIE_API_KEY='test_Fix03ChangedCredential';
    else await run("UPDATE orders SET created_at=datetime('now','-51 minutes') WHERE client_token=?",[fields.idempotencyKey]);
    try{assert.equal((await request('/checkout',actor,fields)).status,503);assert.equal(paymentCalls.length,1);}finally{process.env.MOLLIE_API_KEY=originalKey;}
  }
});
test('COM-002 a different session cannot consume another order reservation',async()=>{
  paymentMode='failure';paymentCalls=[];
  const first=await session(),id=await product(1),fields=await fieldsFor(first,id);
  assert.equal((await request('/checkout',first,fields)).status,503);
  const outsider=await session(),otherFields=await fieldsFor(outsider,id);
  assert.equal((await request('/checkout',outsider)).location,'/cart?stockMessage=changed');
  const response=await request('/checkout',outsider,otherFields);
  assert.equal(response.status,303);assert.equal(response.location,'/cart?stockMessage=changed');
  assert.equal(paymentCalls.length,1);assert.equal(await d.getOrderByClientToken(otherFields.idempotencyKey),undefined);
});
test('COM-008 native concurrent wishlist requests preserve both writes from one stale session snapshot',async()=>{
  const actor=await session(customer),p=await product(),q=await product(),native=db.execute.bind(db);
  let arrivals=0,release;const gate=new Promise(resolve=>release=resolve),timer=setTimeout(release,3000);
  db.execute=async query=>{const result=await native(query);if(/^SELECT \* FROM sessions WHERE id=/.test(typeof query==='string'?query:query.sql)&&query.args?.[0]===actor.sid&&arrivals<2){if(++arrivals===2)release();await gate;}return result;};
  let responses;try{responses=await Promise.all([request('/wishlist/toggle',actor,{productId:p}),request('/wishlist/toggle',actor,{productId:q})]);}finally{clearTimeout(timer);db.execute=native;}
  assert.equal(arrivals,2);assert.ok(responses.every(response=>response.status===200));
  assert.deepEqual(new Set((await d.getSession(actor.sid)).wishlist),new Set([p,q]));
});
test('UI-010 owner and guest cancellation endpoints report actual policy instead of false already-requested',async()=>{
  for(const userId of [customer,null]){
    for(const [provider,status,expected] of [['cash_on_delivery','pending','cancelled'],['cash_on_delivery','processing','requested'],['bank_transfer','pending','requested'],['bank_transfer','processing','unavailable'],['mollie','processing','unavailable']]){
      const {order,token}=await fixtureOrder({userId,provider,status}),actor=await session(userId);
      if(!userId)actor.cookie+=`; guest_order_${order.id}=${token}`;
      const route=userId?`/account/order/${order.id}/cancel`:'/checkout/success/cancel';
      const response=await request(route,actor,{orderId:order.id,reason:'Synthetic cancellation reason'});
      assert.equal(response.status,303);assert.match(response.location,new RegExp('cancel='+expected+'$'));
      if(expected==='requested')assert.match((await request(route,actor,{orderId:order.id,reason:'Same request'})).location,/cancel=already-requested$/);
      if(expected==='unavailable')assert.equal((await d.getOrder(order.id)).cancellation_request_decision,null);
    }
  }
});
test('UI-RISK-04 all 101 return requests are reachable through bounded filtered pages',async()=>{
  const fixture=await fixtureOrder({status:'completed',quantity:99}),actor=await session(manager),item=fixture.order.items[0],ids=[];
  // Pagination fixture inserts independent historical request rows. Business
  // quantity/state constraints are exercised by the commerce workflow tests.
  for(let i=0;i<101;i++)ids.push(Number((await run("INSERT INTO order_returns(order_id,order_item_id,request_type,quantity,reason,status) VALUES(?,?,'return',1,?,'requested')",[fixture.order.id,item.id,`Synthetic historical request ${i}`])).lastInsertRowid));
  const seen=new Set();
  for(let page=1;page<=3;page++){
    const response=await request(`/admin/returns?status=requested&page=${page}`,actor);assert.equal(response.status,200);
    const pageIds=new Set([...response.html.matchAll(/action="\/admin\/returns\/(\d+)\/action"/g)].map(match=>Number(match[1])));
    assert.equal(pageIds.size,page<3?50:1);for(const id of pageIds)seen.add(id);
    if(page<3){const href=response.html.match(/rel="next" href="([^"]+)"/)?.[1];assert.ok(href);const next=new URL(href.replaceAll('&amp;','&'),base);assert.equal(next.searchParams.get('page'),String(page+1));assert.equal(next.searchParams.get('status'),'requested');}
  }
  assert.deepEqual(seen,new Set(ids));
  const clamped=await request('/admin/returns?status=requested&page=999999',actor);assert.equal(clamped.status,200);
  assert.equal(new Set([...clamped.html.matchAll(/action="\/admin\/returns\/(\d+)\/action"/g)].map(match=>match[1])).size,1);
});
test('COM-006 deleting a product retains a shared appearance logo BLOB and its storage quota',async()=>{
  const image='/uploads/'+'a'.repeat(32)+'.png',bytes=Buffer.from('Synthetic metadata-reference fixture, not an image-validator fixture');
  await run('INSERT INTO uploaded_assets(path,content_type,data) VALUES(?,?,?)',[image,'image/png',bytes]);
  const id=await product();await run('UPDATE products SET image_url=? WHERE id=?',[image,id]);await d.setSetting('appearance_logo',image);
  const before=await getRow('SELECT used_bytes FROM asset_storage_quota WHERE id=1');
  const response=await request('/admin/products/delete',await session(manager),{id});
  assert.equal(response.status,303);assert.match(response.location,/notice=deleted/);
  assert.equal(await d.getProductById(id),undefined);assert.ok(await getRow('SELECT path FROM uploaded_assets WHERE path=?',[image]));
  assert.equal((await getRow('SELECT used_bytes FROM asset_storage_quota WHERE id=1')).used_bytes,before.used_bytes);
});
test('COM-007 Manager retries exact failed mail body and key after order/store changes',async()=>{
  process.env.RESEND_API_KEY='re_synthetic_fix03_only';process.env.EMAIL_FROM='Synthetic <shop@example.test>';process.env.ORDER_CONFIRMATION_EMAILS='1';mailCalls=[];mailMode='failure';
  const actor=await session(),id=await product(),fields={...await fieldsFor(actor,id),paymentMethod:'cash_on_delivery'};
  assert.equal((await request('/checkout',actor,fields)).status,303);
  const order=await d.getOrderByClientToken(fields.idempotencyKey);assert.ok(order);
  const original=mailCalls[0];assert.ok(original);
  await run("UPDATE order_email_deliveries SET next_attempt_at_ms=0 WHERE order_id=?",[order.id]);
  await run("UPDATE orders SET status='processing' WHERE id=?",[order.id]);await d.setSetting('store_name','Changed synthetic name');
  mailMode='sent';const managerActor=await session(manager);
  const retried=await request(`/admin/orders/${order.id}/email/retry`,managerActor,{eventKey:'confirmation'});
  assert.match(retried.location,/email=sent$/);assert.equal(mailCalls.length,2);assert.deepEqual(mailCalls[1],original);
  assert.equal((await d.getOrderEmailDeliveries(order.id))[0].status,'sent');
  assert.match((await request(`/admin/orders/${order.id}/email/retry`,managerActor,{eventKey:'confirmation'})).location,/email=retry-unavailable$/);
  assert.equal(mailCalls.length,2);
  const page=await request(`/admin/orders/${order.id}`,managerActor);assert.equal(page.status,200);assert.doesNotMatch(page.html,/re_synthetic_fix03_only|shopeasy-order-[A-Za-z0-9_-]{20}/);
  process.env.ORDER_CONFIRMATION_EMAILS='0';
});
test('COM-007 changed email provider requires explicit Manager reconciliation before a new key',async()=>{
  process.env.ORDER_CONFIRMATION_EMAILS='1';mailMode='failure';mailCalls=[];
  const actor=await session(),id=await product(),fields={...await fieldsFor(actor,id),paymentMethod:'cash_on_delivery'};
  assert.equal((await request('/checkout',actor,fields)).status,303);
  const order=await d.getOrderByClientToken(fields.idempotencyKey),managerActor=await session(manager),initialKey=mailCalls[0].key;
  process.env.RESEND_API_KEY='re_synthetic_changed_provider';
  const retry=await request(`/admin/orders/${order.id}/email/retry`,managerActor,{eventKey:'confirmation'});
  assert.match(retry.location,/email=retry-unavailable$/);assert.equal(mailCalls.length,1);
  const delivery=(await d.getOrderEmailDeliveries(order.id))[0];assert.equal(Number(delivery.needs_reconciliation),1);
  const route=`/admin/orders/${order.id}/email/reconcile`;
  assert.match((await request(route,managerActor,{eventKey:'confirmation',outcome:'not-sent'})).location,/email=error$/);
  for(const userId of [customer,restrictedAdmin])assert.equal((await request(route,await session(userId),{eventKey:'confirmation',outcome:'not-sent',providerChecked:'yes'})).status,403);
  const reviewed={eventKey:'confirmation',outcome:'not-sent',providerChecked:'yes',expectedGeneration:delivery.generation,expectedAttemptCount:delivery.attempt_count};
  assert.match((await request(route,managerActor,reviewed)).location,/email=reconciled$/);
  assert.match((await request(route,managerActor,reviewed)).location,/email=error$/,'stale review cannot reset a new generation');
  assert.equal(mailCalls.length,1,'reconciliation alone must not send');
  mailMode='sent';assert.match((await request(`/admin/orders/${order.id}/email/retry`,managerActor,{eventKey:'confirmation'})).location,/email=sent$/);
  assert.equal(mailCalls.length,2);assert.notEqual(mailCalls[1].key,initialKey);
  process.env.ORDER_CONFIRMATION_EMAILS='0';
});
test('COM-007 reconciled historical status retry uses its event status after the order advances',async()=>{
  process.env.ORDER_STATUS_EMAILS='1';mailMode='failure';mailCalls=[];
  const fixture=await fixtureOrder({status:'processing'}),managerActor=await session(manager);
  const {prepareOrderNotificationEmail}=await import('../src/services/email.js');
  const prepared=await prepareOrderNotificationEmail({order:fixture.order,eventType:'status',items:fixture.order.items,storeName:'Original synthetic store'});
  const claim=await d.claimOrderEmailDelivery(fixture.order.id,'status:processing','status',fixture.order.email,100,{payload:prepared.payload,providerFingerprint:prepared.providerFingerprint});
  assert.equal(claim.claimed,true);
  await d.finishOrderEmailDelivery(fixture.order.id,'status:processing',{claimToken:claim.claimToken,sent:false,errorCode:'synthetic-failure'});
  const delivery=(await d.getOrderEmailDeliveries(fixture.order.id))[0];
  await run("UPDATE orders SET status='completed' WHERE id=?",[fixture.order.id]);
  const reconciled=await request(`/admin/orders/${fixture.order.id}/email/reconcile`,managerActor,{eventKey:'status:processing',outcome:'not-sent',providerChecked:'yes',expectedGeneration:delivery.generation,expectedAttemptCount:delivery.attempt_count});
  assert.match(reconciled.location,/email=reconciled$/);
  mailMode='sent';const retried=await request(`/admin/orders/${fixture.order.id}/email/retry`,managerActor,{eventKey:'status:processing'});
  assert.match(retried.location,/email=sent$/);assert.equal(mailCalls.length,1);
  const payload=JSON.parse(mailCalls[0].body);assert.match(payload.text,/Current status: Accepted/);assert.doesNotMatch(payload.text,/Current status: Delivered/);
  process.env.ORDER_STATUS_EMAILS='0';
});
test('repair route scenarios preserve database integrity and all declared foreign keys',async()=>{
  assert.deepEqual(await getRows('PRAGMA foreign_key_check'),[]);assert.equal((await getRow('PRAGMA integrity_check')).integrity_check,'ok');
});
