import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

test('backend state changes preserve concurrent intent and roll back security failures', async t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-backend-state-test-'));
  const inherited={...process.env};
  let store,server;
  const originalError=console.error;
  console.error=()=>{};
  try {
    for(const name of Object.keys(process.env))if(/DATABASE|TURSO|MOLLIE|RESEND|PEPPOL|MANAGER|MFA|^AI_|SECRET|TOKEN|PASSWORD|API_KEY|^BASE_URL$|NODE_OPTIONS/.test(name))delete process.env[name];
    Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:pathToFileURL(path.join(temporary,'synthetic.sqlite')).href,CLOUDFLARE_WORKER:'0',SEED_DEMO_DATA:'false',RATE_LIMIT_BACKEND:'memory-single-instance',TRUST_PROXY:'0',BASE_URL:'https://state-test.example.test'});
    store=await import('../src/db.js');
    const {hashPassword,verifyPassword,DUMMY_PASSWORD_HASH}=await import('../src/password-hashing.js');
    const password=crypto.randomBytes(24).toString('base64url'),nextPassword=crypto.randomBytes(24).toString('base64url');
    const manager=Number(await store.createUser('manager@state-test.example.test',await hashPassword(password),'manager','Synthetic Manager'));
    const customer=Number(await store.createUser('customer@state-test.example.test',await hashPassword(password),'customer','Synthetic Customer'));
    const pending=Number(await store.createUser('pending@state-test.example.test',DUMMY_PASSWORD_HASH,'customer','Synthetic Pending',null,false));
    await store.default.execute({sql:'UPDATE users SET mfa_enabled=1 WHERE id=?',args:[manager]});
    const products=[];
    for(let n=1;n<=2;n++)products.push(Number(await store.adminCreateOrUpdateProduct({name:`Synthetic state ${n}`,slug:`synthetic-state-${n}`,sku:`STATE-${n}`,shortDescription:'Synthetic',description:'Synthetic',imageUrl:'',galleryImages:[],priceCents:1000,costPriceCents:100,salePriceCents:null,automaticDiscountPercent:0,stock:20,reorderLevel:1,categoryId:null,tags:'',featured:false,active:true,variants:[]})));
    const session=async(userId=null)=>{const sid=await store.createSession(userId),csrf=crypto.randomBytes(24).toString('base64url');await store.setSessionCsrf(sid,csrf);return {sid,csrf,cookie:`sid=${sid}`};};
    const guest=await session(),customerCurrent=await session(customer),managerCurrent=await session(manager);
    await session(customer);await session(manager);
    const {default:app}=await import('../src/server.js');
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`;
    const request=async(route,actor,fields=null)=>{
      const response=await fetch(base+route,{redirect:'manual',method:fields?'POST':'GET',headers:{cookie:actor.cookie,...(fields?{'content-type':'application/x-www-form-urlencoded'}:{})},...(fields?{body:new URLSearchParams({_csrf:actor.csrf,...fields})}:{})});
      return {status:response.status,location:response.headers.get('location'),html:await response.text()};
    };
    const row=async sid=>(await store.default.execute({sql:'SELECT * FROM sessions WHERE id=?',args:[sid]})).rows[0];
    const countSessions=async userId=>Number((await store.default.execute({sql:'SELECT COUNT(*) AS n FROM sessions WHERE user_id=?',args:[userId]})).rows[0].n);
    function forceTwoSessionReads(){
      const native=store.default.execute.bind(store.default);let arrivals=0,release;
      const gate=new Promise(resolve=>{release=resolve;});
      const timeout=setTimeout(()=>release(),5000);timeout.unref();
      store.default.execute=async query=>{
        const value=await native(query);const sql=typeof query==='string'?query:query.sql;
        if(/^SELECT \* FROM sessions WHERE id=/.test(sql)&&arrivals<2){arrivals++;if(arrivals===2)release();await gate;}
        return value;
      };
      return ()=>{clearTimeout(timeout);store.default.execute=native;assert.equal(arrivals,2,'both actual requests must read their session snapshot before either proceeds');};
    }

    await t.test('French branding reuses the complete locale label registry',async()=>{
      const response=await request('/admin/branding',managerCurrent);
      assert.equal(response.status,200);
      assert.equal(/<div class="form-section" lang="fr-BE"[\s\S]*?<h2><span data-no-translate>([^<]*)/.exec(response.html)?.[1],'French');
    });
    await t.test('two actual concurrent add routes preserve both product intents',async()=>{
      const restore=forceTwoSessionReads();let responses;
      try{responses=await Promise.all(products.map(id=>request('/cart/add',guest,{productId:String(id),quantity:'1'})));}finally{restore();}
      assert.deepEqual(responses.map(x=>x.status),[303,303]);
      const cart=JSON.parse((await row(guest.sid)).cart_json);
      assert.equal(cart.length,2);assert.ok(products.every(id=>cart.some(item=>item.productId===id&&item.quantity===1)));
    });
    await t.test('parallel same-product adds accumulate quantities instead of last-write-wins',async()=>{
      const actor=await session();
      const responses=await Promise.all(Array.from({length:8},()=>request('/cart/add',actor,{productId:String(products[0]),quantity:'1'})));
      assert.ok(responses.every(x=>x.status===303&&x.location?.includes('added=1')));
      assert.deepEqual(JSON.parse((await row(actor.sid)).cart_json),[{productId:products[0],quantity:8}]);
    });
    await t.test('concurrent update and remove preserve unrelated latest changes',async()=>{
      await store.saveSessionCart(guest.sid,products.map(productId=>({productId,quantity:3})));
      const restore=forceTwoSessionReads();let responses;
      try{responses=await Promise.all([request('/cart/update',guest,{productId:String(products[0]),quantity:'5'}),request('/cart/remove',guest,{productId:String(products[1])})]);}finally{restore();}
      assert.deepEqual(responses.map(x=>x.status),[303,303]);
      assert.deepEqual(JSON.parse((await row(guest.sid)).cart_json),[{productId:products[0],quantity:5}]);
    });
    await t.test('unchanged cart and coupon writes preserve revision, quote and checkout bearers',async()=>{
      let before=await row(guest.sid);
      await store.saveSessionCheckoutQuote(guest.sid,{id:'synthetic-checkout-quote',createdAt:Date.now(),cartRevision:Number(before.cart_revision)});
      before=await row(guest.sid);
      assert.equal(await store.saveSessionCart(guest.sid,JSON.parse(before.cart_json)),false);
      assert.equal(await store.saveSessionCoupon(guest.sid,null),false);
      const response=await request('/cart',guest);assert.equal(response.status,200);
      const after=await row(guest.sid);
      for(const name of ['cart_json','cart_revision','checkout_quote_json','checkout_idempotency_key','checkout_guest_token'])assert.equal(after[name]===before[name],true,`${name} must not change on a read/no-op`);
    });
    await t.test('stale cart normalization and coupon clearing cannot overwrite a newer tab',async()=>{
      await store.saveSessionCoupon(guest.sid,'OLD');const stale=await row(guest.sid);
      await store.mutateSessionCart(guest.sid,cart=>[...cart,{productId:products[1],quantity:2}]);
      await store.saveSessionCoupon(guest.sid,'NEW');
      await store.saveSessionCheckoutQuote(guest.sid,{id:'new-tab-quote',cartRevision:Number((await row(guest.sid)).cart_revision)});
      const current=await row(guest.sid);
      assert.equal(await store.saveSessionCart(guest.sid,[],{expectedRevision:Number(stale.cart_revision),expectedCartJson:stale.cart_json}),false);
      assert.equal(await store.saveSessionCoupon(guest.sid,null,{expectedRevision:Number(stale.cart_revision),expectedCouponCode:'OLD'}),false);
      const after=await row(guest.sid);
      for(const name of ['cart_json','cart_revision','coupon_code','checkout_quote_json','checkout_idempotency_key'])assert.equal(after[name]===current[name],true,`${name} must retain the newer tab state`);
      await store.saveSessionCoupon(guest.sid,null);
    });
    await t.test('real cart normalization removes missing product lines once and invalidates their old quote',async()=>{
      await store.mutateSessionCart(guest.sid,cart=>[...cart,{productId:123456789,quantity:1}]);
      await store.saveSessionCheckoutQuote(guest.sid,{id:'before-normalization-quote',cartRevision:Number((await row(guest.sid)).cart_revision)});
      const before=await row(guest.sid);
      const response=await request('/cart',guest);assert.equal(response.status,200);
      const after=await row(guest.sid);
      assert.equal(JSON.parse(after.cart_json).some(item=>item.productId===123456789),false);
      assert.equal(Number(after.cart_revision),Number(before.cart_revision)+1);assert.equal(after.checkout_quote_json,'');
    });
    await t.test('archived product lines remain visible for explicit customer removal',async()=>{
      await store.default.execute({sql:'UPDATE products SET active=0 WHERE id=?',args:[products[1]]});
      const before=await row(guest.sid),response=await request('/cart',guest),after=await row(guest.sid);
      assert.equal(response.status,200);assert.equal(after.cart_json===before.cart_json,true);assert.equal(Number(after.cart_revision),Number(before.cart_revision));
      assert.equal(JSON.parse(after.cart_json).some(item=>item.productId===products[1]),true);
      await store.default.execute({sql:'UPDATE products SET active=1 WHERE id=?',args:[products[1]]});
    });
    await t.test('full cart fails explicitly rather than claiming an unpersisted addition',async()=>{
      const actor=await session();const full=Array.from({length:50},(_,i)=>({productId:10000+i,quantity:1}));await store.saveSessionCart(actor.sid,full);
      const response=await request('/cart/add',actor,{productId:String(products[0]),quantity:'1'});
      assert.equal(response.status,409);assert.ok(response.html.includes('50 different product options'));
      assert.deepEqual(JSON.parse((await row(actor.sid)).cart_json),full);
    });
    await t.test('actual concurrent verification requests create one token and enforce cooldown',async()=>{
      const issued=await Promise.all(Array.from({length:8},()=>store.createEmailVerificationToken(pending,crypto.randomBytes(32).toString('hex'),Date.now()+60000)));
      assert.equal(issued.filter(x=>x.created).length,1);
      assert.equal(Number((await store.default.execute({sql:'SELECT COUNT(*) AS n FROM email_verification_tokens WHERE user_id=?',args:[pending]})).rows[0].n),1);
    });
    await t.test('a verification insert failure preserves the previous usable token',async()=>{
      await store.default.execute({sql:'UPDATE email_verification_tokens SET created_at_ms=? WHERE user_id=?',args:[Date.now()-120000,pending]});
      const before=(await store.default.execute({sql:'SELECT token_hash FROM email_verification_tokens WHERE user_id=?',args:[pending]})).rows[0];
      await store.default.execute(`CREATE TRIGGER fail_verification_insert BEFORE INSERT ON email_verification_tokens BEGIN SELECT RAISE(ABORT,'RELEASE_TEST_TOKEN_FAILURE'); END`);
      try{await assert.rejects(()=>store.createEmailVerificationToken(pending,crypto.randomBytes(32).toString('hex'),Date.now()+60000),/RELEASE_TEST_TOKEN_FAILURE/);}finally{await store.default.execute('DROP TRIGGER fail_verification_insert');}
      const after=(await store.default.execute({sql:'SELECT token_hash FROM email_verification_tokens WHERE user_id=?',args:[pending]})).rows[0];
      assert.equal(Boolean(after)&&after.token_hash===before.token_hash,true);
    });
    await t.test('customer password and all session revocations roll back together on DELETE failure',async()=>{
      await store.default.execute(`CREATE TRIGGER fail_customer_revoke BEFORE DELETE ON sessions WHEN OLD.user_id=${customer} BEGIN SELECT RAISE(ABORT,'RELEASE_TEST_REVOKE_FAILURE'); END`);
      try{
        const response=await request('/account/security',customerCurrent,{currentPassword:password,newPassword:nextPassword,confirmPassword:nextPassword});assert.equal(response.status,500);
        const account=await store.getUserAuthByEmail('customer@state-test.example.test');
        assert.equal(await verifyPassword(password,account.password_hash),true);assert.equal(await verifyPassword(nextPassword,account.password_hash),false);assert.equal(await countSessions(customer),2);
      }finally{await store.default.execute('DROP TRIGGER fail_customer_revoke');}
    });
    await t.test('successful customer password change keeps only the current session',async()=>{
      const response=await request('/account/security',customerCurrent,{currentPassword:password,newPassword:nextPassword,confirmPassword:nextPassword});assert.equal(response.status,303);
      const account=await store.getUserAuthByEmail('customer@state-test.example.test');assert.equal(await verifyPassword(nextPassword,account.password_hash),true);assert.equal(await countSessions(customer),1);assert.equal(Boolean(await row(customerCurrent.sid)),true);
      assert.equal(await store.updateUserPassword(customer,await hashPassword(password),{keepSessionId:customerCurrent.sid,expectedPasswordHash:DUMMY_PASSWORD_HASH}),false,'stale credential proof must not authorize another change');
      assert.equal(await verifyPassword(nextPassword,(await store.getUserAuthByEmail('customer@state-test.example.test')).password_hash),true);
    });
    await t.test('Manager email failure is atomic and is not falsely labelled duplicate email',async()=>{
      await store.default.execute(`CREATE TRIGGER fail_manager_revoke BEFORE DELETE ON sessions WHEN OLD.user_id=${manager} BEGIN SELECT RAISE(ABORT,'RELEASE_TEST_REVOKE_FAILURE'); END`);
      try{
        const response=await request('/admin/staff/update-email',managerCurrent,{currentPassword:password,newEmail:'changed@state-test.example.test'});
        assert.equal(response.status,500);assert.equal(response.html.includes('already used by another account'),false);
        assert.equal(Boolean(await store.getUserAuthByEmail('manager@state-test.example.test')),true);assert.equal(Boolean(await store.getUserAuthByEmail('changed@state-test.example.test')),false);assert.equal(await countSessions(manager),2);
      }finally{await store.default.execute('DROP TRIGGER fail_manager_revoke');}
    });
    await t.test('a genuine duplicate Manager email reports409 without a credential/session change',async()=>{
      const response=await request('/admin/staff/update-email',managerCurrent,{currentPassword:password,newEmail:'customer@state-test.example.test'});
      assert.equal(response.status,409);assert.equal(response.html.includes('already used by another account'),true);assert.equal(Boolean(await store.getUserAuthByEmail('manager@state-test.example.test')),true);assert.equal(await countSessions(manager),2);
    });
    const pendingManager=await session();
    const pendingAuth=await store.getUserAuthByEmail('manager@state-test.example.test');
    await store.createMfaLoginChallenge(pendingManager.sid,{credentialProof:{passwordHash:pendingAuth.password_hash,email:pendingAuth.email,role:pendingAuth.role},userId:manager,mode:'verify',expiresAtMs:Date.now()+60000});
    await t.test('successful Manager email replacement atomically revokes other authenticated and pending MFA sessions',async()=>{
      const response=await request('/admin/staff/update-email',managerCurrent,{currentPassword:password,newEmail:'changed@state-test.example.test'});assert.equal(response.status,303);
      assert.equal(Boolean(await store.getUserAuthByEmail('manager@state-test.example.test')),false);assert.equal(Boolean(await store.getUserAuthByEmail('changed@state-test.example.test')),true);
      assert.equal(await countSessions(manager),1);assert.equal(Boolean(await row(managerCurrent.sid)),true);assert.equal(Boolean(await row(pendingManager.sid)),false);
    });
    await t.test('Manager password revocation failure preserves credentials and all sessions',async()=>{
      await session(manager);
      await store.default.execute(`CREATE TRIGGER fail_manager_revoke BEFORE DELETE ON sessions WHEN OLD.user_id=${manager} BEGIN SELECT RAISE(ABORT,'RELEASE_TEST_REVOKE_FAILURE'); END`);
      try{
        const response=await request('/admin/staff/change-password',managerCurrent,{currentPassword:password,newPassword:nextPassword,confirmPassword:nextPassword});assert.equal(response.status,500);
        assert.equal(await verifyPassword(password,(await store.getUserAuthByEmail('changed@state-test.example.test')).password_hash),true);assert.equal(await countSessions(manager),2);
      }finally{await store.default.execute('DROP TRIGGER fail_manager_revoke');}
    });
    await t.test('successful Manager password replacement keeps only the current authenticated session',async()=>{
      const response=await request('/admin/staff/change-password',managerCurrent,{currentPassword:password,newPassword:nextPassword,confirmPassword:nextPassword});assert.equal(response.status,303);
      assert.equal(await verifyPassword(nextPassword,(await store.getUserAuthByEmail('changed@state-test.example.test')).password_hash),true);assert.equal(await countSessions(manager),1);
    });
    await t.test('default/local recovery password replacement revokes all sessions atomically',async()=>{
      await store.updateUserPassword(manager,await hashPassword(password));assert.equal(await countSessions(manager),0);
      assert.equal(await verifyPassword(password,(await store.getUserAuthByEmail('changed@state-test.example.test')).password_hash),true);
    });
    await t.test('confirmed or in-flight stock-alert consent survives anonymous repeat requests; sent alerts can opt in again',async()=>{
      const engagement=await import('../src/customer-engagement.js');
      const ticket=await engagement.createStockAlert(products[0],'stock@state-test.example.test');assert.equal(await engagement.confirmStockAlert(ticket.token),true);
      const repeated=await engagement.createStockAlert(products[0],'stock@state-test.example.test');assert.equal(repeated.send,false);
      let stockRow=(await store.default.execute({sql:'SELECT id,status FROM stock_alerts WHERE product_id=?',args:[products[0]]})).rows[0];assert.equal(stockRow.status,'confirmed');
      const claimed=await engagement.claimStockAlerts(products[0]);assert.equal(claimed.length,1);
      assert.equal((await engagement.createStockAlert(products[0],'stock@state-test.example.test')).send,false);
      stockRow=(await store.default.execute({sql:'SELECT id,status FROM stock_alerts WHERE product_id=?',args:[products[0]]})).rows[0];assert.equal(stockRow.status,'sending');
      await engagement.finishStockAlert(stockRow.id,true);
      const renewed=await engagement.createStockAlert(products[0],'stock@state-test.example.test');assert.equal(renewed.send,true);assert.equal(await engagement.confirmStockAlert(renewed.token),true);
    });
  } finally {
    if(server){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
    if(store)await store.default.close();
    fs.rmSync(temporary,{recursive:true,force:true});
    for(const name of Object.keys(process.env))if(!(name in inherited))delete process.env[name];Object.assign(process.env,inherited);
    console.error=originalError;
  }
});
