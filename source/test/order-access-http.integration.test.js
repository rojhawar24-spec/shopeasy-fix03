import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

// These requests exercise the actual Express middleware/routes against a new
// SQLite database. Session/token values remain private and are never asserted
// as printable strings: failure output must not contain their values or HTML.
test('order lookup and return HTTP routes enforce account ownership or guest bearer proof', { timeout: 30_000 }, async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-order-access-http-'));
  const previous={...process.env};
  let store;
  let server;
  try {
    for(const name of Object.keys(process.env)) {
      if(/DATABASE|TURSO|MOLLIE|RESEND|PEPPOL|MANAGER|MFA|^AI_|SECRET|TOKEN|PASSWORD|API_KEY|^BASE_URL$/.test(name)) delete process.env[name];
    }
    Object.assign(process.env,{
      NODE_ENV:'test',
      DATABASE_URL:pathToFileURL(path.join(directory,'orders.db')).href,
      CLOUDFLARE_WORKER:'0',
      SEED_DEMO_DATA:'false',
      RATE_LIMIT_BACKEND:'memory-single-instance',
      TRUST_PROXY:'0',
      BASE_URL:'https://order-access.example.test'
    });
    store=await import('../src/db.js');
    const {DUMMY_PASSWORD_HASH,hashPassword}=await import('../src/password-hashing.js');
    const email='owner@order-access.example.test';
    const legacyPassword=crypto.randomBytes(9).toString('base64url');
    const ownerId=Number(await store.createUser(email,await hashPassword(legacyPassword),'customer','Disposable order owner'));
    const otherId=Number(await store.createUser('other@order-access.example.test',DUMMY_PASSWORD_HASH,'customer','Disposable other account'));
    const privateName='PRIVATE-ORDER-ACCESS-FIXTURE-PURCHASE';
    const productId=await store.adminCreateOrUpdateProduct({
      name:privateName,slug:'private-order-access-fixture',sku:'ORDER-ACCESS-TEST',
      shortDescription:'Disposable fixture',description:'Disposable fixture',imageUrl:'',galleryImages:[],
      priceCents:1200,costPriceCents:500,salePriceCents:null,automaticDiscountPercent:0,
      stock:20,reorderLevel:1,categoryId:null,tags:'',featured:false,active:true,variants:[]
    });
    const guestToken=crypto.randomBytes(32).toString('base64url');
    const wrongToken=crypto.randomBytes(32).toString('base64url');
    async function createOrder(userId,orderEmail,token=null) {
      const order=await store.createOrderAtomic({
        userId,email:orderEmail,customerPhone:'+442079460001',
        guestAccessTokenHash:token?crypto.createHash('sha256').update(token).digest('hex'):null,
        items:[{productId,quantity:1}],
        shipping:{name:'Disposable buyer',address:'1 Test Street',city:'London',postalCode:'SW1A1AA',country:'United Kingdom'},
        currency:'EUR',paymentProvider:'cash_on_delivery',clientToken:crypto.randomBytes(32).toString('base64url'),
        termsAcceptedAt:new Date().toISOString(),termsLocale:'en',termsPolicyHash:'disposable-fixture'
      });
      await store.default.execute({sql:"UPDATE orders SET status='completed',updated_at=datetime('now') WHERE id=?",args:[order.orderId]});
      const item=(await store.default.execute({sql:'SELECT id FROM order_items WHERE order_id=?',args:[order.orderId]})).rows[0];
      return {id:Number(order.orderId),itemId:Number(item.id),email:orderEmail};
    }
    const registered=await createOrder(ownerId,email);
    const guest=await createOrder(null,'guest@order-access.example.test',guestToken);
    async function session(userId=null) {
      const sid=await store.createSession(userId);
      const csrf=crypto.randomBytes(24).toString('base64url');
      await store.setSessionCsrf(sid,csrf);
      return {cookie:`sid=${sid}`,csrf};
    }
    const anonymous=await session();
    const owner=await session();
    const other=await session(otherId);
    const {default:app}=await import('../src/server.js');
    server=app.listen(0,'127.0.0.1');
    await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`;
    async function post(route,actor,fields={},extraCookie='') {
      const response=await fetch(base+route,{
        method:'POST',redirect:'manual',
        headers:{cookie:actor.cookie+(extraCookie?`; ${extraCookie}`:''),'content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({_csrf:actor.csrf,...fields})
      });
      return {response,html:await response.text()};
    }
    function lookup(actor,order,proof='',extraCookie='') {
      return post('/order-lookup',actor,{orderNumber:String(order.id),email:order.email,guestAccessToken:proof},extraCookie);
    }
    function requestReturn(actor,order,proof='',extraCookie='') {
      return post(`/order/${order.id}/return-request`,actor,{
        email:order.email,guestAccessToken:proof,orderItemId:String(order.itemId),quantity:'1',
        requestType:'refund',reasonCode:'other',note:'Disposable access-control regression'
      },extraCookie);
    }
    async function returnCount(order) {
      return Number((await store.default.execute({sql:'SELECT COUNT(*) AS c FROM order_returns WHERE order_id=?',args:[order.id]})).rows[0].c);
    }
    async function assertLookupDenied(actor,order,proof='') {
      const result=await lookup(actor,order,proof);
      assert.equal(result.response.status,200,'denied lookup retains its generic response status');
      assert.equal(result.html.includes(privateName),false,'denied lookup must not expose the purchase');
      assert.equal(result.html.includes(`action="/order/${order.id}/return-request"`),false,'denied lookup must not expose a return form');
    }
    async function assertReturnDenied(actor,order,proof='') {
      const result=await requestReturn(actor,order,proof);
      assert.equal(result.response.status,404,'unauthorized return must be denied');
      assert.equal(await returnCount(order),0,'denied return must not create a record');
    }

    await t.test('an existing customer can still sign in with a legacy 12-character password',async()=>{
      assert.equal(legacyPassword.length,12);
      const result=await post('/login',owner,{email,password:legacyPassword,next:'/account'});
      assert.equal(result.response.status,303,'new-password policy must not invalidate an existing password');
      const sessionCookie=result.response.headers.getSetCookie().find(value=>value.startsWith('sid='));
      assert.equal(Boolean(sessionCookie),true,'successful login rotates the session cookie');
      owner.cookie=sessionCookie.split(';')[0];
      const response=await fetch(base+'/session/csrf',{headers:{cookie:owner.cookie},redirect:'manual'});
      assert.equal(response.status,200);
      owner.csrf=(await response.json()).csrf;
      assert.equal(typeof owner.csrf,'string');
      assert.equal(owner.csrf.length>20,true);
    });
    await t.test('anonymous email/order knowledge does not expose a registered purchase or create a return',async()=>{
      await assertLookupDenied(anonymous,registered);
      await assertReturnDenied(anonymous,registered);
    });
    await t.test('another authenticated customer cannot access or return the registered purchase',async()=>{
      await assertLookupDenied(other,registered);
      await assertReturnDenied(other,registered);
    });
    await t.test('the authenticated owner can view the purchase and persist its return request',async()=>{
      const result=await lookup(owner,registered);
      assert.equal(result.response.status,200);
      assert.equal(result.html.includes(privateName),true,'owner sees the expected purchase');
      const returned=await requestReturn(owner,registered);
      assert.equal(returned.response.status,200);
      const rows=(await store.default.execute({sql:'SELECT user_id,status FROM order_returns WHERE order_id=?',args:[registered.id]})).rows;
      assert.equal(rows.length,1);
      assert.equal(Number(rows[0].user_id),ownerId);
      assert.equal(rows[0].status,'requested');
    });
    await t.test('guest email/order knowledge without bearer proof does not expose its purchase',async()=>{
      await assertLookupDenied(anonymous,guest);
    });
    await t.test('incorrect guest bearer proof is rejected for lookup and return',async()=>{
      await assertLookupDenied(anonymous,guest,wrongToken);
      await assertReturnDenied(anonymous,guest,wrongToken);
    });
    await t.test('valid guest proof in a POST enables cookie-protected lookup and return without account attribution',async()=>{
      const result=await lookup(anonymous,guest,guestToken);
      assert.equal(result.response.status,200);
      assert.equal(result.html.includes(privateName),true,'guest sees the expected purchase');
      assert.equal(result.html.includes(guestToken),false,'manual bearer must not be echoed into HTML or navigation URLs');
      const guestCookie=result.response.headers.getSetCookie().find(value=>value.startsWith(`guest_order_${guest.id}=`));
      assert.equal(Boolean(guestCookie),true,'validated bearer becomes a browser cookie');
      assert.equal(/;\s*Path=\/(?:;|$)/i.test(guestCookie),true,'guest proof cookie reaches lookup/return routes');
      assert.equal(/;\s*HttpOnly/i.test(guestCookie),true,'scripts must not read guest bearer cookies');
      assert.equal(/;\s*SameSite=Lax/i.test(guestCookie),true);
      const returned=await requestReturn(anonymous,guest,'',guestCookie.split(';')[0]);
      assert.equal(returned.response.status,200);
      const rows=(await store.default.execute({sql:'SELECT user_id,status FROM order_returns WHERE order_id=?',args:[guest.id]})).rows;
      assert.equal(rows.length,1);
      assert.equal(rows[0].user_id,null,'guest return is not attributed to an arbitrary account');
      assert.equal(rows[0].status,'requested');
    });
    await t.test('the existing guest-order cookie authorizes lookup without entering its proof again',async()=>{
      const result=await lookup(anonymous,guest,'',`guest_order_${guest.id}=${guestToken}`);
      assert.equal(result.response.status,200);
      assert.equal(result.html.includes(privateName),true);
      assert.equal(result.html.includes(guestToken),false,'cookie bearer is not copied into response HTML');
    });
    await t.test('a signed-in customer holding valid guest proof can still access that guest order',async()=>{
      const result=await lookup(other,guest,guestToken);
      assert.equal(result.response.status,200);
      assert.equal(result.html.includes(privateName),true);
    });
    await t.test('a guest proof never substitutes for ownership of an account-owned order',async()=>{
      await assertLookupDenied(anonymous,registered,guestToken);
    });
    await t.test('opening an existing guest confirmation migrates its scoped proof to a root cookie',async()=>{
      const response=await fetch(base+`/checkout/success?order=${guest.id}`,{
        headers:{cookie:`${anonymous.cookie}; guest_order_${guest.id}=${guestToken}`},redirect:'manual'
      });
      await response.arrayBuffer();
      assert.equal(response.status,200);
      const guestCookie=response.headers.getSetCookie().find(value=>value.startsWith(`guest_order_${guest.id}=`)&&/;\s*Path=\/(?:;|$)/i.test(value));
      assert.equal(Boolean(guestCookie),true,'existing confirmation proof must remain usable after the upgrade');
      assert.equal(/;\s*HttpOnly/i.test(guestCookie),true);
      assert.equal(/;\s*SameSite=Lax/i.test(guestCookie),true);
    });
    await t.test('early missing-CSRF error pages are private/no-store and retain a fresh form token',async()=>{
      const result=await post('/register',anonymous,{_csrf:'',email:'unused@order-access.example.test'});
      assert.equal(result.response.status,403);
      assert.equal(/private/.test(result.response.headers.get('cache-control')||''),true);
      assert.equal(/no-store/.test(result.response.headers.get('cache-control')||''),true);
      assert.equal(result.response.headers.get('pragma'),'no-cache');
      assert.equal(/name="_csrf" value="[^"]+"/.test(result.html),true);
    });
    await t.test('Manager privacy routes require explicit financial retention choices and expose the correct result',async()=>{
      const managerId=await store.createUser('privacy-manager@order-access.example.test',DUMMY_PASSWORD_HASH,'manager','Disposable privacy Manager');
      // Fixture represents an already enrolled Manager; actual TOTP enrollment
      // is covered separately by the browser workflow, not by this setup.
      await store.setManagerMfaSecret(managerId,'opaque-disposable-fixture');
      await store.activateManagerMfa(managerId,{lastTotpStep:0,recoveryHashes:'[]',expectedSecret:'opaque-disposable-fixture'});
      const manager=await session(managerId);
      const customerId=await store.createUser('privacy-buyer@order-access.example.test',DUMMY_PASSWORD_HASH,'customer','Disposable financial customer');
      await store.setSetting('feature_gift_cards_enabled','1');
      const card=await store.issueGiftCard({amountCents:5000,currency:'EUR',managerId});
      const created=await store.createOrderAtomic({userId:customerId,email:'privacy-buyer@order-access.example.test',customerPhone:'+442079460001',
        items:[{productId,quantity:1}],shipping:{name:'Disposable customer',address:'1 Test Street',city:'London',postalCode:'SW1A1AA',country:'United Kingdom'},
        currency:'EUR',paymentProvider:'gift_card',giftCardCode:card.code,clientToken:crypto.randomBytes(32).toString('base64url'),
        termsAcceptedAt:new Date().toISOString(),termsLocale:'en',termsPolicyHash:'disposable-policy'});
      for(const status of ['processing','shipped','completed'])assert.equal(await store.setOrderStatus(created.orderId,status,managerId),true);
      const before=await store.getOrder(created.orderId);
      const ledgerBefore=(await store.default.execute({sql:'SELECT id,order_id,event,amount_cents FROM gift_card_ledger WHERE order_id=?',args:[created.orderId]})).rows;
      const formResponse=await fetch(base+'/admin/gdpr',{headers:{cookie:manager.cookie+'; shop_lang=ckb'}});
      const formHtml=await formResponse.text();
      assert.equal(formResponse.status,200);
      assert.equal(formHtml.includes('کەمکردنەوەی داتای کەسی'),true);
      for(const name of ['privacyMode','retentionPolicyReference','retentionAcknowledged'])assert.equal(formHtml.includes(`name="${name}"`),true);
      const denied=await post('/admin/gdpr/delete',other,{customerId:String(customerId),confirmation:'DELETE'});
      assert.equal(denied.response.status,403);
      const deletion=await post('/admin/gdpr/delete',manager,{customerId:String(customerId),confirmation:'DELETE'});
      assert.equal(deletion.response.status,400);
      assert.equal(deletion.html.includes('Financial ledger records prevent deletion.'),true);
      const missingAck=await post('/admin/gdpr/delete',manager,{customerId:String(customerId),confirmation:'DELETE',privacyMode:'minimize-retain-financial',retentionPolicyReference:'DISPOSABLE-TEST-POLICY'});
      assert.equal(missingAck.response.status,400);
      assert.equal(Boolean(await store.getUserAuthByEmail('privacy-buyer@order-access.example.test')),true);
      const minimized=await post('/admin/gdpr/delete',manager,{customerId:String(customerId),confirmation:'DELETE',privacyMode:'minimize-retain-financial',retentionAcknowledged:'on',retentionPolicyReference:'DISPOSABLE-TEST-POLICY'});
      assert.equal(minimized.response.status,303);
      assert.equal(minimized.response.headers.get('location'),'/admin/gdpr?minimized=1');
      const retained=await store.getOrder(created.orderId);
      assert.equal(retained.user_id,null);assert.equal(retained.shipping_address,'');assert.equal(Number(retained.total_cents),Number(before.total_cents));
      assert.equal(Boolean(await store.getUserAuthByEmail('privacy-buyer@order-access.example.test')),false);
      assert.deepEqual((await store.default.execute({sql:'SELECT id,order_id,event,amount_cents FROM gift_card_ledger WHERE order_id=?',args:[created.orderId]})).rows,ledgerBefore);
      const audit=(await store.listGdprAuditLogs(150)).find(row=>row.target_id===String(customerId)&&row.action==='gdpr_customer_delete');
      assert.equal(JSON.parse(audit.meta_json).retention_policy_reference,'DISPOSABLE-TEST-POLICY');
    });
  } finally {
    if(server) {
      server.closeAllConnections();
      await new Promise(resolve=>server.close(resolve));
    }
    if(store) store.default.close();
    for(const name of Object.keys(process.env)) if(!(name in previous)) delete process.env[name];
    Object.assign(process.env,previous);
    fs.rmSync(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  }
});
