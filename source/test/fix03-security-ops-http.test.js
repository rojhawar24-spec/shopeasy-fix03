import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';

// The isolated launcher supplies a disposable local database. This suite checks
// production middleware over loopback HTTP, not TLS or a deployed environment.
const activePassword='Active-Customer-Credentials-2026!';
const pendingPassword='Untrusted-Registration-Pass-2026!';
const approvedPassword='Fresh-Approved-Customer-Pass-2026!';
const activeEmail='active@fix03-security.example.test';
const pendingEmail='pending@fix03-security.example.test';
let store,server,base,ids,passwords,pendingId;
const originalFetch=globalThis.fetch;
const previousEnv={...process.env};
const cookieName='__Host-sid';

before(async()=>{
  Object.assign(process.env,{NODE_ENV:'production',PORT:'0',CLOUDFLARE_WORKER:'0',SEED_DEMO_DATA:'false',RATE_LIMIT_BACKEND:'memory-single-instance',TRUST_PROXY:'0',BASE_URL:'https://fix03-security.example.test',MFA_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex')});
  for(const key of ['RESEND_API_KEY','EMAIL_FROM','MANAGER_EMAIL','MANAGER_PASSWORD','MOLLIE_API_KEY','AI_API_KEY'])delete process.env[key];
  globalThis.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(url.hostname!=='127.0.0.1')throw new Error('FIX03_EXTERNAL_NETWORK_DISABLED');
    return originalFetch(input,options);
  };
  const listen=http.Server.prototype.listen;
  http.Server.prototype.listen=function(...args){server=this;const callback=args.find(arg=>typeof arg==='function');return listen.call(this,0,'127.0.0.1',callback);};
  try {await import('../src/server.js');}finally{http.Server.prototype.listen=listen;}
  if(!server.listening)await once(server,'listening');
  base=`http://127.0.0.1:${server.address().port}`;
  store=await import('../src/db.js');passwords=await import('../src/password-hashing.js');
  const hash=await passwords.hashPassword(activePassword);
  ids={customer:await store.createUser(activeEmail,hash,'customer','Synthetic Customer'),admin:await store.createUser('admin@fix03-security.example.test',hash,'admin','Synthetic Admin'),manager:await store.createUser('manager@fix03-security.example.test',hash,'manager','Synthetic Manager'),unenrolled:await store.createUser('unenrolled@fix03-security.example.test',hash,'manager','Synthetic Unenrolled')};
  await store.default.execute({sql:'UPDATE users SET mfa_enabled=1 WHERE id=?',args:[ids.manager]});
});

after(async()=>{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(store)await store.default.close();
  globalThis.fetch=originalFetch;
  for(const key of Object.keys(process.env))if(!(key in previousEnv))delete process.env[key];
  Object.assign(process.env,previousEnv);
});

async function actor(role=null) {
  const sid=await store.createSession(role?ids[role]:null),csrf=crypto.randomBytes(24).toString('base64url');
  await store.setSessionCsrf(sid,csrf);return {sid,csrf,cookie:`${cookieName}=${sid}`};
}
async function request(route,a,{body,rawCookie,method=body?'POST':'GET'}={}) {
  const headers={cookie:rawCookie??a?.cookie??''};
  if(body)headers['content-type']='application/x-www-form-urlencoded';
  const response=await fetch(base+route,{method,headers,body:body?new URLSearchParams({_csrf:a.csrf,...body}):undefined,redirect:'manual'});
  return {status:response.status,headers:response.headers,html:await response.text()};
}
const sessionCookies=response=>response.headers.getSetCookie().filter(value=>value.startsWith(`${cookieName}=`));

for(const value of ['j:{"invalid":true}','j:["fake"]','j:true','j:null','j:123','j:"fake"','\0corrupt','x'.repeat(1000),'Z'.repeat(43)]) {
  test(`SEC002 production cookie recovery: ${value.length>60?'oversized/unknown token':JSON.stringify(value)}`,async()=>{
    const response=await request('/login',null,{rawCookie:`${cookieName}=${encodeURIComponent(value)}`});
    assert.equal(response.status,200);assert.doesNotMatch(response.html,/ReferenceError|TypeError|\/workspace\//);
    const cookies=sessionCookies(response);assert.equal(cookies.length,1);
    const sid=decodeURIComponent(cookies[0].split(';')[0].slice(cookieName.length+1));assert.match(sid,/^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(sid,value);const session=await store.getSession(sid);assert.equal(session.user_id,null);assert.ok(session.csrf);
    assert.match(cookies[0],/; HttpOnly/);assert.match(cookies[0],/; Secure/);assert.match(cookies[0],/; SameSite=Lax/);assert.match(cookies[0],/; Path=\//);assert.doesNotMatch(cookies[0],/; Domain=/i);
  });
}

test('SEC002 existing valid production session keeps its identity and authenticated user',async()=>{
  const a=await actor('customer'),response=await request('/account',a);
  assert.equal(response.status,200);assert.equal(sessionCookies(response)[0].split(';')[0],a.cookie);
  assert.equal((await store.getSession(a.sid)).user_id,ids.customer);
});

for(const route of ['/logout','/language','/newsletter/subscribe']) {
  test(`SEC001 production invalid CSRF ${route} returns 403 without mutation or stack disclosure`,async()=>{
    const a=await actor('customer');
    const before=(await store.default.execute('SELECT count(*) AS n FROM newsletter_subscriptions')).rows[0].n;
    const response=await request(route,a,{body:{_csrf:'incorrect-token',language:'nl',email:'csrf@fix03-security.example.test',consent:'on'}});
    assert.equal(response.status,403);assert.doesNotMatch(response.html,/ReferenceError|TypeError|seoAlternateLinks is not defined|\/workspace\//);
    assert.equal((await store.getSession(a.sid)).user_id,ids.customer);
    assert.equal((await store.default.execute('SELECT count(*) AS n FROM newsletter_subscriptions')).rows[0].n,before);
    assert.equal(response.headers.getSetCookie().some(value=>/^ui_locale=|^language=/.test(value)),false);
  });
}

test('SEC004 new and existing registration have identical public response/session behavior while offline',async()=>{
  const fresh=await actor(),existing=await actor();
  const fields={fullName:'Synthetic Registration',password:pendingPassword,confirmPassword:pendingPassword,termsAccepted:'on'};
  const newResult=await request('/register',fresh,{body:{...fields,email:pendingEmail}});
  const duplicate=await request('/register',existing,{body:{...fields,email:activeEmail}});
  for(const response of [newResult,duplicate]){assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(response.html.includes(pendingPassword),false);}
  const normalize=(html,email,csrf)=>html.replaceAll(email,'<EMAIL>').replaceAll(csrf,'<CSRF>');
  assert.equal(normalize(newResult.html,pendingEmail,fresh.csrf),normalize(duplicate.html,activeEmail,existing.csrf));
  assert.equal((await store.getSession(fresh.sid)).user_id,null);assert.equal((await store.getSession(existing.sid)).user_id,null);
  const pending=await store.getUserAuthByEmail(pendingEmail);pendingId=Number(pending.id);
  assert.equal(pending.email_verified_at,null);assert.equal(pending.email_verification_required,1);
  assert.equal(await passwords.verifyPassword(activePassword,(await store.getUserAuthByEmail(activeEmail)).password_hash),true);
  assert.equal(await passwords.verifyPassword(pendingPassword,(await store.getUserAuthByEmail(activeEmail)).password_hash),false);
});

test('SEC004 pending registration and wrong existing credentials remain indistinguishable at login',async()=>{
  const pending=await actor(),existing=await actor();
  const a=await request('/login',pending,{body:{email:pendingEmail,password:pendingPassword}});
  const b=await request('/login',existing,{body:{email:activeEmail,password:pendingPassword}});
  assert.equal(a.status,200);assert.equal(b.status,200);
  const normalize=(html,email,csrf)=>html.replaceAll(email,'<EMAIL>').replaceAll(csrf,'<CSRF>');
  assert.equal(normalize(a.html,pendingEmail,pending.csrf),normalize(b.html,activeEmail,existing.csrf));
  assert.equal((await store.getSession(pending.sid)).user_id,null);
});

for(const [role,expected] of [[null,302],['customer',403],['admin',403],['unenrolled',303]]) {
  test(`SEC004 approval rejects ${role??'anonymous'} without activating or replacing credentials`,async()=>{
    const a=await actor(role),before=await store.getUserAuthByEmail(pendingEmail);
    const response=await request(`/admin/customers/${pendingId}/approve-registration`,a,{body:{identityConfirmed:'yes',password:approvedPassword,confirmPassword:approvedPassword}});
    assert.equal(response.status,expected);
    if(role==='unenrolled')assert.equal(response.headers.get('location'),'/login?mfa=required');
    const after=await store.getUserAuthByEmail(pendingEmail);assert.equal(after.password_hash,before.password_hash);assert.equal(after.email_verified_at,null);
  });
}

test('SEC004 Manager approval rejects invalid CSRF, missing identity confirmation and invalid replacement passwords',async()=>{
  const a=await actor('manager');
  for(const [body,status,location] of [
    [{_csrf:'wrong',identityConfirmed:'yes',password:approvedPassword,confirmPassword:approvedPassword},403,null],
    [{password:approvedPassword,confirmPassword:approvedPassword},303,'confirmation-required'],
    [{identityConfirmed:'yes',password:'short',confirmPassword:'short'},303,'invalid-password'],
    [{identityConfirmed:'yes',password:approvedPassword,confirmPassword:approvedPassword+'mismatch'},303,'invalid-password'],
    [{identityConfirmed:'yes',password:pendingPassword,confirmPassword:pendingPassword},303,'invalid-password']
  ]) {
    const response=await request(`/admin/customers/${pendingId}/approve-registration`,a,{body});
    assert.equal(response.status,status);if(location)assert.equal(response.headers.get('location'),`/admin/customers?registration=${location}`);
    assert.equal((await store.getUserAuthByEmail(pendingEmail)).email_verified_at,null);
  }
});

test('SEC004 approval replaces untrusted credentials, revokes pending access and audits without secrets',async()=>{
  const a=await actor('manager'),staleSession=await store.createSession(pendingId);
  const tokenHash=crypto.createHash('sha256').update('synthetic-unused-verification-token').digest('hex');
  await store.createEmailVerificationToken(pendingId,tokenHash,Date.now()+60000);
  const response=await request(`/admin/customers/${pendingId}/approve-registration`,a,{body:{identityConfirmed:'yes',password:approvedPassword,confirmPassword:approvedPassword}});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/admin/customers?registration=approved');
  const row=await store.getUserAuthByEmail(pendingEmail);assert.equal(row.email_verification_required,0);assert.ok(row.email_verified_at);
  assert.equal(await passwords.verifyPassword(pendingPassword,row.password_hash),false);assert.equal(await passwords.verifyPassword(approvedPassword,row.password_hash),true);
  assert.equal(await store.getSession(staleSession),null);assert.equal((await store.verifyEmailToken(tokenHash)).ok,false);
  const log=(await store.default.execute({sql:"SELECT * FROM audit_logs WHERE action='customer_registration_approved' AND target_id=?",args:[String(pendingId)]})).rows;
  assert.equal(log.length,1);assert.equal(Number(log[0].user_id),Number(ids.manager));
  for(const secret of [pendingPassword,approvedPassword,row.password_hash]){assert.equal(JSON.stringify(log).includes(secret),false);assert.equal(response.html.includes(secret),false);assert.equal(response.headers.get('location').includes(secret),false);}
  const oldLogin=await request('/login',await actor(),{body:{email:pendingEmail,password:pendingPassword}});assert.equal(oldLogin.status,200);
  const newLogin=await request('/login',await actor(),{body:{email:pendingEmail,password:approvedPassword}});assert.equal(newLogin.status,303);assert.equal(newLogin.headers.get('location'),'/account');
  const replay=await request(`/admin/customers/${pendingId}/approve-registration`,a,{body:{identityConfirmed:'yes',password:'Different-Strong-Passphrase-2026!',confirmPassword:'Different-Strong-Passphrase-2026!'}});
  assert.equal(replay.headers.get('location'),'/admin/customers?registration=unavailable');
  assert.equal((await store.getUserAuthByEmail(pendingEmail)).password_hash,row.password_hash);
});

async function verificationFixture() {
  const email=`verification-${crypto.randomBytes(8).toString('hex')}@fix03-security.example.test`;
  const passwordHash=await passwords.hashPassword(pendingPassword);
  const userId=await store.createUser(email,passwordHash,'customer','Synthetic Mail Recipient',new Date().toISOString(),false);
  const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');
  await store.createEmailVerificationToken(userId,tokenHash,Date.now()+24*60*60*1000);
  return {email,passwordHash,userId,token,tokenHash,actor:await actor()};
}

test('SEC004 email-link GET is read-only and does not activate an unsolicited pending registration',async()=>{
  const f=await verificationFixture();
  const before=await store.getUserAuthByEmail(f.email);
  const tokenBefore=(await store.default.execute({sql:'SELECT * FROM email_verification_tokens WHERE token_hash=?',args:[f.tokenHash]})).rows;
  for(let visit=0;visit<2;visit++){
    const response=await request('/verify-email?token='+f.token,f.actor);
    assert.equal(response.status,200);assert.match(response.html,/form[^>]*method="post"[^>]*action="\/verify-email"/);
    assert.match(response.html,/name="password"/);assert.match(response.html,/name="_csrf" value="[^"]+"/);
    assert.match(response.html,/If you did not register/);
    assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    for(const secret of [f.passwordHash,pendingPassword,f.email])assert.equal(response.html.includes(secret),false);
  }
  assert.deepEqual(await store.getUserAuthByEmail(f.email),before);
  assert.deepEqual((await store.default.execute({sql:'SELECT * FROM email_verification_tokens WHERE token_hash=?',args:[f.tokenHash]})).rows,tokenBefore);
  assert.equal((await store.getSession(f.actor.sid)).user_id,null);
});

test('SEC004 email confirmation needs valid CSRF, token and original password without consuming failed proof',async()=>{
  const f=await verificationFixture();
  const badCsrf=await request('/verify-email',f.actor,{body:{_csrf:'wrong',token:f.token,password:pendingPassword}});
  assert.equal(badCsrf.status,403);
  const tokenOnly=await request('/verify-email',f.actor,{body:{token:f.token,password:'Recipient-does-not-know-original!'}});
  assert.equal(tokenOnly.status,400);assert.match(tokenOnly.html,/This verification could not be completed/);
  const passwordOnly=await request('/verify-email',f.actor,{body:{token:'z'.repeat(43),password:pendingPassword}});
  assert.equal(passwordOnly.status,400);assert.match(passwordOnly.html,/This verification could not be completed/);
  for(const response of [badCsrf,tokenOnly,passwordOnly])assert.equal(response.html.includes(pendingPassword),false);
  assert.equal((await store.getUserAuthByEmail(f.email)).email_verified_at,null);
  assert.ok(await store.getEmailVerificationChallenge(f.tokenHash));
  assert.equal((await store.getSession(f.actor.sid)).user_id,null);
});

test('SEC004 rightful email token and original password activate once without automatic authentication',async()=>{
  const f=await verificationFixture();
  const response=await request('/verify-email',f.actor,{body:{token:f.token,password:pendingPassword}});
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/login?verified=1');
  const user=await store.getUserAuthByEmail(f.email);assert.ok(user.email_verified_at);assert.equal(user.email_verification_required,0);assert.equal(user.password_hash,f.passwordHash);
  assert.equal((await store.getSession(f.actor.sid)).user_id,null);
  assert.equal(await store.getEmailVerificationChallenge(f.tokenHash),null);
  assert.equal((await request('/verify-email?token='+f.token,f.actor)).status,400);
  assert.equal((await request('/verify-email',f.actor,{body:{token:f.token,password:pendingPassword}})).status,400);
  const login=await request('/login',f.actor,{body:{email:f.email,password:pendingPassword}});
  assert.equal(login.status,303);assert.equal(login.headers.get('location'),'/account');
});

test('SEC004 concurrent pending-password change rejects stale HTTP verification proof atomically',async()=>{
  const f=await verificationFixture(),changed=await passwords.hashPassword(approvedPassword);
  const native=store.default.execute.bind(store.default);let interleaved=0;
  store.default.execute=async query=>{
    const result=await native(query),sql=typeof query==='string'?query:query.sql;
    if(!interleaved&&sql.includes('SELECT t.user_id,u.password_hash FROM email_verification_tokens t')&&query.args?.[0]===f.tokenHash){
      interleaved++;
      await native({sql:'UPDATE users SET password_hash=? WHERE id=?',args:[changed,f.userId]});
    }
    return result;
  };
  let response;
  try{response=await request('/verify-email',f.actor,{body:{token:f.token,password:pendingPassword}});}
  finally{store.default.execute=native;}
  assert.equal(interleaved,1,'password changes after the actual challenge read, before its commit');
  assert.equal(response.status,400);
  const user=await store.getUserAuthByEmail(f.email);assert.equal(user.email_verified_at,null);assert.equal(user.password_hash,changed);
  assert.ok(await store.getEmailVerificationChallenge(f.tokenHash));
});

test('SEC004 email verification honors a persistent account failure block without consuming the token',async()=>{
  const f=await verificationFixture(),key=crypto.createHash('sha256').update(`email-verification:${f.userId}`).digest('hex');
  for(let i=0;i<10;i++)await store.recordAccountLoginFailure(key);
  const response=await request('/verify-email',f.actor,{body:{token:f.token,password:pendingPassword}});
  assert.equal(response.status,429);assert.match(response.html,/This verification could not be completed/);
  assert.equal((await store.getUserAuthByEmail(f.email)).email_verified_at,null);assert.ok(await store.getEmailVerificationChallenge(f.tokenHash));
});

test('SEC004 email confirmation IP attempts are bounded by a separate rate limiter',async()=>{
  const f=await verificationFixture();let blocked=null;
  for(let i=0;i<11;i++){
    const response=await request('/verify-email',f.actor,{body:{token:'q'.repeat(43),password:'Unrelated-password-2026!'}});
    if(response.status===429){blocked=response;break;}
    assert.equal(response.status,400);
  }
  assert.ok(blocked);assert.match(blocked.html,/Too many verification attempts/);assert.ok(Number(blocked.headers.get('retry-after'))>0);
  assert.equal((await store.getUserAuthByEmail(f.email)).email_verified_at,null);assert.ok(await store.getEmailVerificationChallenge(f.tokenHash));
});

test('SEC004 verification mail in all supported locales explains original-password proof and unsolicited-message handling',async()=>{
  const {sendEmailVerificationEmail}=await import('../src/services/email.js');
  const priorFetch=globalThis.fetch,priorKey=process.env.RESEND_API_KEY,priorFrom=process.env.EMAIL_FROM;
  const sent=[];
  process.env.RESEND_API_KEY='re_synthetic_verification_copy';process.env.EMAIL_FROM='Synthetic <shop@example.test>';
  globalThis.fetch=async(input,options)=>{
    assert.equal(String(input),'https://api.resend.com/emails');sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({id:'synthetic-mail-id'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    for(const locale of ['en','nl','fr','ar','ckb'])await sendEmailVerificationEmail({email:'synthetic-recipient@example.test',token:'t'.repeat(43),verifyUrl:'https://fix03-security.example.test/verify-email?token='+'t'.repeat(43),locale});
  }finally{
    globalThis.fetch=priorFetch;
    for(const [key,value] of [['RESEND_API_KEY',priorKey],['EMAIL_FROM',priorFrom]])if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  const proofWords=[/password you chose when registering/,/wachtwoord in dat je bij de registratie koos/,/mot de passe choisi lors de votre inscription/,/كلمة المرور التي اخترتها عند التسجيل/,/وشەی نهێنییە بنووسە کە لە کاتی تۆماربوون/];
  const ignoreWords=[/did not create this account, ignore/,/niet zelf aangemaakt, negeer/,/n’avez pas créé ce compte, ignorez/,/لم تنشئ هذا الحساب بنفسك، فتجاهل/,/خۆت ئەم هەژمارەت دروست نەکردووە/];
  assert.equal(sent.length,5);
  for(let i=0;i<sent.length;i++){assert.match(sent[i].text,proofWords[i]);assert.match(sent[i].text,ignoreWords[i]);assert.equal(sent[i].text.includes(pendingPassword),false);}
});
