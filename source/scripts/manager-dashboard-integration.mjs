import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { responseCookie, responseCookieHeader, responseSetCookieHeaders } from './http-test-cookies.mjs';

// Use a temporary file DB instead of :memory: so transaction-backed integration checks
// test persistent state rather than driver-specific in-memory transaction behavior.
const parentCleanup = process.env.SHOPEASY_INTEGRATION_PARENT_CLEANUP === '1';
const testDataDir = process.env.SHOPEASY_INTEGRATION_DATA_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'shopeasy-integration-'));
const testDatabaseUrl = pathToFileURL(path.join(testDataDir, 'integration.db')).href;
process.env.DATABASE_URL = testDatabaseUrl;
delete process.env.SHOP_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.TRUST_PROXY = '1';
process.env.TEST_IMAGE_STORAGE_IN_DATABASE = '1';
process.env.VERCEL = '0';
process.env.AWS_LAMBDA_FUNCTION_NAME = '';
process.env.CLOUDFLARE_WORKER = '0';
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
process.env.MANAGER_NAME = 'Manager Smoke Test';
process.env.MANAGER_EMAIL = 'manager-smoke@example.test';
process.env.MANAGER_PASSWORD = `Smoke-${crypto.randomBytes(24).toString('hex')}-Safe`;
process.env.BASE_URL = 'https://shop.example.test';
process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
// Keep this integration deterministic and local: do not let a developer's .env
// accidentally enable real registration-verification email delivery in the test.
process.env.RESEND_API_KEY = 'test-disabled';
process.env.EMAIL_FROM = 'disabled';

const { db } = await import('../src/database.js');
const data = await import('../src/db.js');
const { sessionCookieName } = await import('../src/auth.js');
const { hashPassword, verifyPassword } = await import('../src/password-hashing.js');
const { registrationNotice } = await import('../src/registration-copy.js');
const { totpAtTime, totpAtStep, decryptTotpSecret } = await import('../src/mfa.js');

// Let bootstrap create the first Manager from the explicitly configured test credentials; do not seed a conflicting customer email.
const { default: app } = await import('../src/server.js');

// Verify Manager bootstrap state directly before the HTTP login flow so a dashboard 403
// can never be an opaque provisioning/session regression.
const bootstrapRow = await db.execute({ sql: 'SELECT id,email,role FROM users WHERE email=?', args: [process.env.MANAGER_EMAIL] });
assert.equal(bootstrapRow.rows?.[0]?.role, 'manager', 'bootstrap must create the configured full-access Manager without an Admin bootstrap account');

async function main() {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const cleanup = async () => {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await db.close();
    if (!parentCleanup) {
      // On Windows, libSQL/SQLite may still hold the file briefly after close().
      // The npm test wrapper supplies a parent-owned temp directory and removes it
      // only after this child process has fully exited.
      await fs.rm(testDataDir,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    } else {
      console.log(`Integration test cleanup delegated to parent process: ${testDataDir}`);
    }
  };

  try {

  const base = `http://127.0.0.1:${server.address().port}`;

  // Treat each independent authentication scenario as a separate test client. The
  // integration flow deliberately submits five invalid-password requests earlier;
  // reusing that same source IP for every later scenario would consume the real
  // per-IP /login budget (max 10) and make the MFA scenarios fail with HTTP 429
  // before reaching their intended assertions. Production rate limiting is unchanged.
  let loginScenarioIpOctet = 10;
  async function startManagerChallenge(email,password,{rememberMe=false}={}) {
    const scenarioIp = `198.51.100.${loginScenarioIpOctet++}`;
    const page=await fetch(`${base}/login`);
    const html=await page.text();
    const csrf=html.match(/name="_csrf" value="([^"]+)"/)?.[1];
    const anonymousCookie=responseCookie(page.headers);
    assert.ok(csrf,'login form should contain a CSRF token');
    assert.ok(anonymousCookie,'login page should issue an anonymous session');
    const response=await fetch(`${base}/login`,{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded',cookie:anonymousCookie,'x-forwarded-for':scenarioIp},
      body:new URLSearchParams({_csrf:csrf,email,password,...(rememberMe?{rememberMe:'on'}:{})}),
      redirect:'manual'
    });
    assert.equal(response.status,303,'valid Manager password should create an MFA challenge');
    const location=response.headers.get('location');
    assert.ok(['/mfa/setup','/mfa/verify'].includes(location),`unexpected Manager MFA path: ${location}`);
    const issuedSessionCookies = responseSetCookieHeaders(response.headers)
      .filter(value => value.trim().startsWith(`${sessionCookieName()}=`));
    assert.equal(issuedSessionCookies.length,1,'session rotation must replace the anonymous cookie instead of emitting ambiguous duplicate session cookies');
    const challengeCookie=responseCookie(response.headers,sessionCookieName());
    assert.ok(challengeCookie,'MFA challenge must issue a short-lived session cookie');
    const challengeSessionId=challengeCookie.slice(challengeCookie.indexOf('=')+1);
    const challengeSession=await db.execute({sql:'SELECT expires_at FROM sessions WHERE id=?',args:[challengeSessionId]});
    assert.equal(challengeSession.rows?.length,1,'MFA challenge must have a database session');
    const challengeExpiry=Number(challengeSession.rows[0].expires_at);
    assert.ok(challengeExpiry>Date.now()&&challengeExpiry<=Date.now()+5*60*1000,
      'MFA challenge database session must expire within five minutes, even after cart/wishlist/coupon state is copied');
    return {response,location,challengeCookie};
  }

  async function challengePage(path,cookie) {
    const page=await fetch(`${base}${path}`,{headers:{cookie}});
    assert.equal(page.status,200,`${path} challenge page should load`);
    const html=await page.text();
    const csrf=html.match(/name="_csrf" value="([^"]+)"/)?.[1];
    assert.ok(csrf,`${path} must include CSRF protection`);
    const secret=html.match(/id="manual-secret"[^>]*>([A-Z2-7]+)</)?.[1]||null;
    return {html,csrf,secret};
  }

  async function submitMfa(path,cookie,csrf,code) {
    return fetch(`${base}${path}`,{
      method:'POST',
      headers:{cookie,'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:csrf,code}),
      redirect:'manual'
    });
  }

  // Pick a TOTP time step that has not already been consumed by enrollment or a
  // prior login. The server intentionally rejects replay of the setup code, so
  // using Date.now() blindly can make this integration test flaky within 30s.
  // If the last accepted step is already current+1, wait for the RFC ±1 window
  // to advance until a new unused step becomes valid.
  async function freshTotpCode(secret,userId) {
    const deadline=Date.now()+65_000;
    while(Date.now()<deadline) {
      const row=await data.getUserMfaById(Number(userId));
      assert.ok(row&&Number(row.mfa_enabled)===1,'Manager MFA must remain enabled while creating a fresh test code');
      const currentStep=Math.floor(Date.now()/30_000);
      const lastStep=row.mfa_last_totp_step===null||row.mfa_last_totp_step===undefined?-1:Number(row.mfa_last_totp_step);
      const candidateStep=Math.max(currentStep,lastStep+1);
      if(candidateStep<=currentStep+1) {
        return {code:totpAtStep(secret,candidateStep),step:candidateStep};
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error('Could not obtain an unused TOTP code inside the allowed ±1-step window within 65 seconds');
  }

  async function logoutManager(cookie) {
    const csrfResponse=await fetch(`${base}/session/csrf`,{headers:{cookie,accept:'application/json'}});
    assert.equal(csrfResponse.status,200);
    const {csrf}=await csrfResponse.json();
    const response=await fetch(`${base}/logout`,{
      method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:csrf}),redirect:'manual'
    });
    assert.equal(response.status,303,'logout should revoke the authenticated session');
  }
  const forwardedLogin = await fetch(`${base}/login`, {
    headers: {
      Forwarded: 'for=203.0.113.8;proto=https;host=shop.example.test',
      'x-forwarded-for': '203.0.113.8'
    }
  });
  assert.equal(forwardedLogin.status, 200);

  const invalidCsrf = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: 'invalid-token', email: 'invalid@example.test', password: 'Not-a-real-password-123' })
  });
  assert.equal(invalidCsrf.status, 403);
  assert.match(await invalidCsrf.text(), /security/i);

  const originLoginPage = await fetch(`${base}/login`);
  const originLoginHtml = await originLoginPage.text();
  const originCsrf = originLoginHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const originCookie = responseCookie(originLoginPage.headers);
  const deploymentOriginLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: originCookie,
      origin: 'https://shop.example.test'
    },
    body: new URLSearchParams({ _csrf: originCsrf, email: 'origin-smoke@example.test', password: 'Not-a-real-password-123' })
  });
  assert.equal(deploymentOriginLogin.status, 200);
  const deploymentOriginLoginHtml = await deploymentOriginLogin.text();
  assert.match(deploymentOriginLoginHtml, /Email or password does not match/);
  assert.match(deploymentOriginLoginHtml, /value="origin-smoke@example\.test"/);

  const requestHostOriginLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: originCookie,
      origin: base
    },
    body: new URLSearchParams({ _csrf: originCsrf, email: 'origin-smoke@example.test', password: 'Not-a-real-password-123' })
  });
  assert.equal(requestHostOriginLogin.status, 200);
  assert.match(await requestHostOriginLogin.text(), /Email or password does not match/);

  const projectDeploymentOriginLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: originCookie,
      origin: 'https://preview.shop.example.test'
    },
    body: new URLSearchParams({ _csrf: originCsrf, email: 'origin-smoke@example.test', password: 'Not-a-real-password-123' })
  });
  assert.equal(projectDeploymentOriginLogin.status, 200);
  assert.match(await projectDeploymentOriginLogin.text(), /Email or password does not match/);

  const canonicalShopOriginLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: originCookie,
      origin: 'https://shop.example.test'
    },
    body: new URLSearchParams({ _csrf: originCsrf, email: 'origin-smoke@example.test', password: 'Not-a-real-password-123' })
  });
  assert.equal(canonicalShopOriginLogin.status, 200);
  assert.match(await canonicalShopOriginLogin.text(), /Email or password does not match/);

  const rejectedOrigin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: originCookie,
      origin: 'https://attacker.example'
    },
    body: new URLSearchParams({ _csrf: originCsrf, email: 'origin-smoke@example.test', password: 'Not-a-real-password-123' })
  });
  assert.equal(rejectedOrigin.status, 200);
  assert.match(await rejectedOrigin.text(), /Email or password does not match/);

  const crossSiteWithoutCsrf = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: originCookie,
      origin: 'https://attacker.example'
    },
    body: new URLSearchParams({ _csrf: 'invalid-token', email: 'origin-smoke@example.test', password: 'Not-a-real-password-123' }),
    redirect: 'manual'
  });
  assert.equal(crossSiteWithoutCsrf.status, 303, 'an invalid nonempty token is rejected into a fresh form');
  assert.equal(crossSiteWithoutCsrf.headers.get('x-request-id'), null, 'CSRF rejection never reaches authentication');
  const csrfRecoveryUrl = new URL(crossSiteWithoutCsrf.headers.get('location'), base);
  assert.equal(csrfRecoveryUrl.pathname, '/login');
  assert.equal(csrfRecoveryUrl.searchParams.get('notice'), 'security-refresh');
  assert.ok(!csrfRecoveryUrl.href.includes('Not-a-real-password-123'));
  const missingCsrf = await fetch(`${base}/login`, {
    method:'POST', headers:{'content-type':'application/x-www-form-urlencoded',cookie:originCookie},
    body:new URLSearchParams({email:'origin-smoke@example.test',password:'Not-a-real-password-123'}), redirect:'manual'
  });
  assert.equal(missingCsrf.status,403,'missing-token posts remain rejected');

  const anonymousDashboard = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(anonymousDashboard.status, 302);
  assert.equal(anonymousDashboard.headers.get('location'), '/login?next=%2Fadmin');

  // A legacy Manager session must be revoked as soon as MFA is activated.
  const legacyManagerSession = await data.createSession(bootstrapRow.rows[0].id);
  assert.ok(await data.getSession(legacyManagerSession));
  // A parallel, password-authenticated but not yet completed MFA challenge must be revoked too.
  const pendingChallengeSession = await data.createSession(null, 5 * 60 * 1000);
  await data.setSessionCsrf(pendingChallengeSession, crypto.randomBytes(24).toString('base64url'));
  const pendingChallengeAuth=await data.getUserAuthByEmail(process.env.MANAGER_EMAIL);
  await data.createMfaLoginChallenge(pendingChallengeSession,{
    credentialProof:{passwordHash:pendingChallengeAuth.password_hash,email:pendingChallengeAuth.email,role:pendingChallengeAuth.role},
    userId:bootstrapRow.rows[0].id,mode:'setup',rememberMe:false,nextPath:'/admin',expiresAtMs:Date.now()+5*60*1000
  });

  // A first-time Manager may cancel enrollment, but cannot skip MFA while keeping
  // the authenticated challenge alive. Explicit cancellation must clear the short-
  // lived challenge session and return to the normal sign-in page.
  const cancellableChallenge=await startManagerChallenge(process.env.MANAGER_EMAIL,process.env.MANAGER_PASSWORD);
  assert.equal(cancellableChallenge.location,'/mfa/setup','first Manager login must require authenticator enrollment');
  const cancellableSetup=await challengePage('/mfa/setup',cancellableChallenge.challengeCookie);
  const cancelResponse=await fetch(`${base}/mfa/cancel`,{
    method:'POST',
    headers:{cookie:cancellableChallenge.challengeCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:cancellableSetup.csrf}),
    redirect:'manual'
  });
  assert.equal(cancelResponse.status,303,'MFA cancellation must use a post/redirect/get response');
  assert.equal(cancelResponse.headers.get('location'),'/login?mfa=cancelled','MFA cancellation must return to login');
  const cancelledSessionId=cancellableChallenge.challengeCookie.slice(cancellableChallenge.challengeCookie.indexOf('=')+1);
  assert.equal(await data.getSession(cancelledSessionId),null,'cancelling MFA must destroy the pending challenge session');
  const loginAfterCancel=await fetch(`${base}/login?mfa=cancelled`,{headers:{cookie:cancellableChallenge.challengeCookie}});
  assert.equal(loginAfterCancel.status,200);
  assert.match(await loginAfterCancel.text(),/Sign-in was cancelled/,'the login page must explain that sign-in was cancelled');

  const firstChallenge=await startManagerChallenge(process.env.MANAGER_EMAIL,process.env.MANAGER_PASSWORD,{rememberMe:true});
  assert.equal(firstChallenge.location,'/mfa/setup','first Manager login must require authenticator enrollment');
  assert.match(responseCookieHeader(firstChallenge.response.headers),/Max-Age=300/i,'pending MFA challenge cookie must expire after five minutes');
  const setup=await challengePage('/mfa/setup',firstChallenge.challengeCookie);
  assert.ok(setup.secret,'setup page must expose a manual TOTP secret alongside the QR code');
  assert.match(setup.html,/data:image\/svg\+xml;base64,/,'setup page must render the QR code image');
  const csrfBypassAttempt=await submitMfa('/mfa/verify',firstChallenge.challengeCookie,'invalid-csrf-token',totpAtTime(setup.secret));
  assert.equal(csrfBypassAttempt.status,403,'MFA activation must reject an invalid CSRF token');
  const setupActivation=await submitMfa('/mfa/verify',firstChallenge.challengeCookie,setup.csrf,totpAtTime(setup.secret));
  assert.equal(setupActivation.status,200,'a valid six-digit TOTP must activate MFA');
  const recoveryHtml=await setupActivation.text();
  assert.match(recoveryHtml,/Save your recovery codes/);
  const recoveryCodes=[...recoveryHtml.matchAll(/<li><code>([A-F0-9-]+)<\/code><\/li>/g)].map(match=>match[1]);
  assert.equal(recoveryCodes.length,8,'activation must display exactly eight one-time recovery codes');
  const managerSetCookie=responseCookieHeader(setupActivation.headers);
  assert.match(managerSetCookie,/Max-Age=7200/i,'authenticated Manager session must follow the two-hour idle-cookie policy; a legacy remember-me field cannot extend it');
  let managerCookie=managerSetCookie.split(';')[0];
  assert.ok(managerCookie,'MFA activation must issue a new authenticated session cookie');
  assert.equal(await data.getSession(legacyManagerSession),null,'MFA activation must revoke every old Manager session');
  assert.equal(await data.getSession(pendingChallengeSession),null,'MFA activation must revoke all pending challenge sessions as well');

  const dashboard = await fetch(`${base}/admin`, { headers: { cookie: managerCookie } });
  if (dashboard.status !== 200) {
    const dashboardBody = await dashboard.text();
    const sessionId = managerCookie.split('=', 2)[1] || '';
    const sessionRow = sessionId ? await db.execute({ sql: 'SELECT user_id FROM sessions WHERE id=?', args: [sessionId] }) : { rows: [] };
    const authRow = sessionRow.rows?.[0]?.user_id ? await db.execute({ sql: 'SELECT id,email,role FROM users WHERE id=?', args: [sessionRow.rows[0].user_id] }) : { rows: [] };
    console.error('Manager dashboard auth failed:', { status: dashboard.status, body: dashboardBody.slice(0, 500), sessionUser: sessionRow.rows?.[0] || null, authUser: authRow.rows?.[0] || null });
  }
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /<h1>Manage your store<\/h1>/);
  assert.match(dashboardHtml, /href="\/admin\/products"/);
  assert.match(dashboardHtml, /Recent orders/);
  const settingsPage = await fetch(`${base}/admin/settings`, { headers: { cookie: managerCookie } });
  assert.equal(settingsPage.status,200);
  let settingsHtml=await settingsPage.text();
  assert.match(settingsHtml,/SETUP & INTEGRATIONS/);
  // This is the Settings route, not the dashboard. Assert its own title and
  // the current profile-specific launch checklist; the dashboard heading is
  // already verified against the separate /admin response above.
  assert.match(settingsHtml, /<h1>Store settings<\/h1>/);
  assert.match(settingsHtml, /BEFORE CUSTOMERS CAN ORDER/);
  assert.match(settingsHtml,/At least one in-stock product/);
  assert.match(settingsHtml,/No automatic order-confirmation email, shipping email or manager notification is sent unless those separate features are configured and verified\./);

  // Test fail-closed login verification: an old code is rejected, a current code succeeds,
  // and recovery codes are consumed atomically and cannot be reused.
  const activeManagerRow=await data.getUserMfaById(bootstrapRow.rows[0].id);
  const activeTotpSecret=decryptTotpSecret(activeManagerRow.mfa_secret);
  await logoutManager(managerCookie);
  const verifyChallenge=await startManagerChallenge(process.env.MANAGER_EMAIL,process.env.MANAGER_PASSWORD);
  assert.equal(verifyChallenge.location,'/mfa/verify','an enrolled Manager should be prompted for TOTP after password login');
  const verifyPage=await challengePage('/mfa/verify',verifyChallenge.challengeCookie);
  const expiredCode=totpAtTime(activeTotpSecret,Date.now()-120000);
  const expiredAttempt=await submitMfa('/mfa/verify',verifyChallenge.challengeCookie,verifyPage.csrf,expiredCode);
  assert.equal(expiredAttempt.status,400,'a TOTP code outside the allowed time window must be rejected');
  const nextTotpStep=Math.floor(Date.now()/30000)+1;
  const wrongCode=totpAtStep(activeTotpSecret,nextTotpStep+1000);
  const wrongAttempt=await submitMfa('/mfa/verify',verifyChallenge.challengeCookie,verifyPage.csrf,wrongCode);
  assert.equal(wrongAttempt.status,400,'a wrong six-digit TOTP must be rejected');
  const validTotp=await freshTotpCode(activeTotpSecret,bootstrapRow.rows[0].id);
  const validAttempt=await submitMfa('/mfa/verify',verifyChallenge.challengeCookie,verifyPage.csrf,validTotp.code);
  assert.equal(validAttempt.status,303,'a fresh unused TOTP code inside the allowed time window should complete login');
  assert.equal(validAttempt.headers.get('location'),'/admin');
  const secondManagerCookie=responseCookie(validAttempt.headers);
  assert.ok(secondManagerCookie,'successful MFA login should issue a new authenticated session');
  await logoutManager(secondManagerCookie);
  const recoveryChallenge=await startManagerChallenge(process.env.MANAGER_EMAIL,process.env.MANAGER_PASSWORD);
  const recoveryPage=await challengePage('/mfa/verify',recoveryChallenge.challengeCookie);
  const invalidRecoveryAttempt=await submitMfa('/mfa/verify',recoveryChallenge.challengeCookie,recoveryPage.csrf,'FFFF-FFFF-FFFF-FFFF-FFFF-FFFF');
  assert.equal(invalidRecoveryAttempt.status,400,'an unknown recovery code must fail closed');
  const recoveryAttempt=await submitMfa('/mfa/verify',recoveryChallenge.challengeCookie,recoveryPage.csrf,recoveryCodes[0]);
  assert.equal(recoveryAttempt.status,303,'an unused recovery code should allow sign-in');
  const recoveryLoginCookie=responseCookie(recoveryAttempt.headers);
  assert.ok(recoveryLoginCookie);
  await logoutManager(recoveryLoginCookie);
  const usedRecoveryChallenge=await startManagerChallenge(process.env.MANAGER_EMAIL,process.env.MANAGER_PASSWORD);
  const usedRecoveryPage=await challengePage('/mfa/verify',usedRecoveryChallenge.challengeCookie);
  const usedRecoveryAttempt=await submitMfa('/mfa/verify',usedRecoveryChallenge.challengeCookie,usedRecoveryPage.csrf,recoveryCodes[0]);
  assert.equal(usedRecoveryAttempt.status,400,'a recovery code must fail after its first successful use');
  const reauthTotp=await freshTotpCode(activeTotpSecret,bootstrapRow.rows[0].id);
  const reauthAttempt=await submitMfa('/mfa/verify',usedRecoveryChallenge.challengeCookie,usedRecoveryPage.csrf,reauthTotp.code);
  assert.equal(reauthAttempt.status,303,'a fresh unused TOTP step should work after a used recovery code is rejected');
  managerCookie=responseCookie(reauthAttempt.headers);
  assert.ok(managerCookie,'Manager must have a fresh live session for subsequent integration assertions');
  const refreshedSettingsPage=await fetch(`${base}/admin/settings`,{headers:{cookie:managerCookie}});
  assert.equal(refreshedSettingsPage.status,200);
  settingsHtml=await refreshedSettingsPage.text();



  // Real HTTP regression: submit the same complete business-identity/settings form
  // a manager uses in the browser. This catches parser, CSRF, validation, batch-write
  // and audit-response failures that source-only tests cannot see.
  const settingsCsrf=settingsHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(settingsCsrf,'settings page must expose a CSRF token');
  const settingsForm=new URLSearchParams({
    _csrf:settingsCsrf,
    legalName:'Smoke Test Business BV',
    businessAddress:'1 Test Street, 1000 Brussels, Belgium',
    supportEmail:'support-smoke@example.test',
    businessPhone:'+32 400 00 00',
    enterpriseNumber:'BE-SMOKE-12345',
    vatNumber:'BE0123456789',
    currency:'EUR',
    shippingFee:'0',
    deliveryCountries:'Exampleland\nExample Republic',
    pricesIncludeTax:'on',
    privacyPolicy:'We use customer information only to fulfil orders and provide support for this test shop.',
    privacyPolicyCkb:'ئێمە زانیارییەکانی کڕیار تەنها بۆ جێبەجێکردنی داواکاری بەکاردەهێنین.',
    privacyPolicyAr:'نستخدم معلومات العملاء فقط لتنفيذ الطلبات وتقديم الدعم المطلوب لهذا المتجر.',
    termsPolicy:'Orders are accepted under the store terms and customers pay cash when their goods are delivered.',
    shippingPolicy:'The store arranges delivery to supported countries and contacts the customer when the order is ready.',
    returnsPolicy:'Customers can contact the store about returns and refunds according to the published store policy.'
  });
  // Incomplete policy content is allowed to persist as a draft; this must not
  // block setup work, and the draft must never be shown to storefront visitors.
  const draftSettingsForm=new URLSearchParams(settingsForm);
  draftSettingsForm.set('privacyPolicy','Too short');
  const draftSettingsSave=await fetch(`${base}/admin/settings`,{
    method:'POST',
    headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:draftSettingsForm,
    redirect:'manual'
  });
  assert.equal(draftSettingsSave.status,303,'incomplete policy settings should save as a draft instead of being rejected');
  assert.equal(draftSettingsSave.headers.get('location'),'/admin/settings?saved=1');
  assert.equal(await data.getSetting('privacy_policy',''),'Too short','the draft text should be persisted for later editing');
  const publicPrivacyPage=await fetch(`${base}/privacy`);
  assert.equal(publicPrivacyPage.status,200);
  assert.doesNotMatch(await publicPrivacyPage.text(),/Too short/,'an incomplete privacy-policy draft must not be exposed publicly');

  const settingsSave=await fetch(`${base}/admin/settings`,{
    method:'POST',
    headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:settingsForm,
    redirect:'manual'
  });
  assert.equal(settingsSave.status,303,'complete manager settings form should save successfully');
  assert.equal(settingsSave.headers.get('location'),'/admin/settings?saved=1');
  assert.equal(await data.getSetting('legal_name',''),'Smoke Test Business BV');
  assert.equal(await data.getSetting('business_address',''),'1 Test Street, 1000 Brussels, Belgium');
  assert.equal(await data.getSetting('support_email',''),'support-smoke@example.test');
  assert.equal(await data.getSetting('business_phone',''),'+32 400 00 00');
  assert.equal(await data.getSetting('enterprise_number',''),'BE-SMOKE-12345');
  assert.equal(await data.getSetting('currency',''),'EUR');
  assert.equal(await data.getSetting('shipping_fee_cents',''),'0');
  assert.equal(await data.getSetting('delivery_countries',''),'Exampleland\nExample Republic');
  assert.equal(await data.getSetting('prices_include_tax',''),'1');
  assert.equal(await data.getSetting('privacy_policy_ckb',''),'ئێمە زانیارییەکانی کڕیار تەنها بۆ جێبەجێکردنی داواکاری بەکاردەهێنین.');
  assert.equal(await data.getSetting('privacy_policy_ar',''),'نستخدم معلومات العملاء فقط لتنفيذ الطلبات وتقديم الدعم المطلوب لهذا المتجر.');

  // Exercise a second isolated role='manager' user to verify the allow/deny matrix independently.
  const staffManagerEmail = 'staff-manager-smoke@example.test';
  const staffManagerPassword = 'Manager-role-integration-2026-safe';
  const staffManagerId = await data.createUser(
    staffManagerEmail,
    await hashPassword(staffManagerPassword),
    'manager',
    'Manager Role Smoke Test',
    null
  );
  const staffManagerRow = await db.execute({
    sql: 'SELECT id, email, role FROM users WHERE id=?',
    args: [staffManagerId]
  });
  assert.equal(staffManagerRow.rows?.[0]?.role, 'manager', 'the test account must be a genuine manager, not an admin');

  const staffMfaChallenge=await startManagerChallenge(staffManagerEmail,staffManagerPassword);
  assert.equal(staffMfaChallenge.location,'/mfa/setup','a new Manager must enrol in MFA before dashboard access');
  const staffSetup=await challengePage('/mfa/setup',staffMfaChallenge.challengeCookie);
  assert.ok(staffSetup.secret);
  const staffActivation=await submitMfa('/mfa/verify',staffMfaChallenge.challengeCookie,staffSetup.csrf,totpAtTime(staffSetup.secret));
  assert.equal(staffActivation.status,200,'a second Manager can activate MFA');
  assert.match(await staffActivation.text(),/Save your recovery codes/);
  const staffManagerCookie=responseCookie(staffActivation.headers);
  assert.ok(staffManagerCookie,'MFA activation should establish a valid Manager session');

  // Admins must be created inside the Manager-only UI, not through .env or a direct CLI.
  const rateLimitManagerEmail='mfa-rate-limit-smoke@example.test';
  const rateLimitManagerPassword='MFA-rate-limit-integration-2026-safe';
  await data.createUser(rateLimitManagerEmail,await hashPassword(rateLimitManagerPassword),'manager','MFA Rate Limit Test',null);
  const rateLimitChallenge=await startManagerChallenge(rateLimitManagerEmail,rateLimitManagerPassword);
  assert.equal(rateLimitChallenge.location,'/mfa/setup');
  const rateLimitSetup=await challengePage('/mfa/setup',rateLimitChallenge.challengeCookie);
  for(let attempt=1;attempt<=5;attempt++){
    const bad=await submitMfa('/mfa/verify',rateLimitChallenge.challengeCookie,rateLimitSetup.csrf,'not-a-valid-code');
    assert.equal(bad.status,400,`MFA invalid attempt ${attempt} should be rejected without blocking earlier than five attempts`);
  }
  const sixthAttempt=await submitMfa('/mfa/verify',rateLimitChallenge.challengeCookie,rateLimitSetup.csrf,'not-a-valid-code');
  assert.equal(sixthAttempt.status,429,'the sixth MFA attempt in the same 15-minute window must be rate-limited');

  const limitedAdminEmail='limited-admin-smoke@example.test';
  const limitedAdminPassword='Admin-limited-integration-2026-safe';
  const staffPage=await fetch(`${base}/admin/staff`,{headers:{cookie:staffManagerCookie}});
  assert.equal(staffPage.status,200,'a Manager can open the staff/account screen');
  const staffHtml=await staffPage.text();
  assert.match(staffHtml,/Create an Admin account/);
  assert.match(staffHtml,/action="\/admin\/staff\/create-admin"/);
  assert.match(staffHtml,/action="\/admin\/staff\/update-email"/);
  assert.match(staffHtml,/action="\/admin\/staff\/change-password"/);
  const staffCsrf=staffHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(staffCsrf,'Manager staff screen must include CSRF tokens');
  const createAdminResponse=await fetch(`${base}/admin/staff/create-admin`,{
    method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:staffCsrf,fullName:'Limited Admin Smoke Test',email:limitedAdminEmail,password:limitedAdminPassword,confirmPassword:limitedAdminPassword}),
    redirect:'manual'
  });
  assert.equal(createAdminResponse.status,303,'Manager can create a restricted Admin');
  assert.equal(createAdminResponse.headers.get('location'),'/admin/staff?adminCreated=1');
  const createdAdminRow=await data.getUserAuthByEmail(limitedAdminEmail);
  assert.equal(createdAdminRow?.role,'admin','Manager-created account must have the restricted admin role');
  assert.equal(createdAdminRow?.full_name,'Limited Admin Smoke Test');
  assert.match(await (await fetch(`${base}/admin/staff`,{headers:{cookie:staffManagerCookie}})).text(),/limited-admin-smoke@example\.test/,'Manager screen lists the new Admin');
  const limitedAdminId=Number(createdAdminRow.id);
  const adminLoginPage=await fetch(`${base}/login`); const adminLoginHtml=await adminLoginPage.text();
  const adminLoginCsrf=adminLoginHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const adminInitialCookie=responseCookie(adminLoginPage.headers);
  assert.ok(adminLoginCsrf&&adminInitialCookie,'admin login page must issue CSRF and session cookie');
  const adminLogin=await fetch(`${base}/login`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:adminInitialCookie},body:new URLSearchParams({_csrf:adminLoginCsrf,email:limitedAdminEmail,password:limitedAdminPassword}),redirect:'manual'});
  assert.equal(adminLogin.status,303,'limited Admin can sign in');
  const limitedAdminCookie=responseCookie(adminLogin.headers); assert.ok(limitedAdminCookie);
  const limitedOverview=await fetch(`${base}/admin`,{headers:{cookie:limitedAdminCookie}});
  assert.equal(limitedOverview.status,200); assert.match(await limitedOverview.text(),/Store overview access/);
  for(const restrictedPath of ['/admin/staff','/admin/products','/admin/products/new','/admin/categories','/admin/orders','/admin/stories','/admin/stories/new','/admin/coupons','/admin/customers','/admin/branding','/admin/settings','/admin/license','/admin/audit']) {
    const denied=await fetch(`${base}${restrictedPath}`,{headers:{cookie:limitedAdminCookie}});
    assert.equal(denied.status,403,`Admin must not access ${restrictedPath}`);
  }
  const adminCsrfResponse=await fetch(`${base}/session/csrf`,{headers:{cookie:limitedAdminCookie,accept:'application/json'}}); assert.equal(adminCsrfResponse.status,200);
  const adminCsrf=(await adminCsrfResponse.json()).csrf; const beforeAdminDeniedWrite=await data.getSetting('legal_name','');
  const beforeAdminCount=Number((await db.execute({sql:"SELECT COUNT(*) AS c FROM users WHERE role='admin'"})).rows?.[0]?.c||0);
  for (const [route,form] of [
    ['/admin/staff/create-admin',{fullName:'Unauthorized',email:'unauthorized-admin@example.test',password:'Unauthorized-Admin-password-2026',confirmPassword:'Unauthorized-Admin-password-2026'}],
    ['/admin/staff/delete-admin',{adminId:'1',currentPassword:limitedAdminPassword}],
    ['/admin/staff/update-email',{newEmail:'unauthorized-manager@example.test',currentPassword:limitedAdminPassword}],
    ['/admin/staff/change-password',{currentPassword:limitedAdminPassword,newPassword:'Unauthorized-New-Password-2026',confirmPassword:'Unauthorized-New-Password-2026'}]
  ]) {
    const denied=await fetch(`${base}${route}`,{method:'POST',headers:{cookie:limitedAdminCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:adminCsrf,...form}),redirect:'manual'});
    assert.equal(denied.status,403,`Admin must not submit ${route}`);
  }
  const adminSettingsWrite=await fetch(`${base}/admin/settings`,{method:'POST',headers:{cookie:limitedAdminCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:adminCsrf,legalName:'UNAUTHORIZED ADMIN CHANGE'}),redirect:'manual'});
  assert.equal(adminSettingsWrite.status,403,'Admin settings POST must be forbidden');
  assert.equal(await data.getSetting('legal_name',''),beforeAdminDeniedWrite,'forbidden Admin Settings POST must not mutate data');
  assert.equal(Number((await db.execute({sql:"SELECT COUNT(*) AS c FROM users WHERE role='admin'"})).rows?.[0]?.c||0),beforeAdminCount,'forbidden Admin staff POSTs must not create accounts');

  // Deletion requires Manager re-authentication, removes only role=admin, and revokes that account's sessions.
  const staffPageBeforeDelete=await fetch(`${base}/admin/staff`,{headers:{cookie:staffManagerCookie}});
  assert.equal(staffPageBeforeDelete.status,200);
  const staffHtmlBeforeDelete=await staffPageBeforeDelete.text();
  assert.match(staffHtmlBeforeDelete,/action="\/admin\/staff\/delete-admin"/);
  const deleteCsrf=staffHtmlBeforeDelete.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(deleteCsrf);
  const wrongPasswordDelete=await fetch(`${base}/admin/staff/delete-admin`,{method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:deleteCsrf,adminId:String(limitedAdminId),currentPassword:'Wrong-Manager-password-2026'}),redirect:'manual'});
  assert.equal(wrongPasswordDelete.status,400,'Admin deletion must require the current Manager password');
  assert.equal((await data.getUserAuthByEmail(limitedAdminEmail))?.role,'admin','wrong Manager password must not delete an Admin');
  const deleteManagerTarget=await fetch(`${base}/admin/staff/delete-admin`,{method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:deleteCsrf,adminId:String(staffManagerId),currentPassword:staffManagerPassword}),redirect:'manual'});
  assert.equal(deleteManagerTarget.status,409,'the role-scoped delete must refuse a Manager ID');
  assert.equal((await data.getUserAuthByEmail(staffManagerEmail))?.role,'manager','Manager must remain untouched after crafted delete ID');
  const deleteAdminResponse=await fetch(`${base}/admin/staff/delete-admin`,{method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:deleteCsrf,adminId:String(limitedAdminId),currentPassword:staffManagerPassword}),redirect:'manual'});
  assert.equal(deleteAdminResponse.status,303,'Manager can remove an Admin after current-password verification');
  assert.equal(deleteAdminResponse.headers.get('location'),'/admin/staff?adminDeleted=1');
  assert.equal((await data.getUserAuthByEmail(limitedAdminEmail)) ?? null,null,'deleted Admin must no longer exist');
  assert.equal(Number((await db.execute({sql:'SELECT COUNT(*) AS c FROM sessions WHERE user_id=?',args:[limitedAdminId]})).rows?.[0]?.c||0),0,'Admin removal must revoke all sessions');
  const deletedAdminOldSession=await fetch(`${base}/admin`,{headers:{cookie:limitedAdminCookie},redirect:'manual'});
  assert.equal(deletedAdminOldSession.status,302,'a removed Admin session must be redirected to sign-in');

  const managerAccountPage = await fetch(`${base}/account`, { headers: { cookie: staffManagerCookie } });
  assert.equal(managerAccountPage.status, 200);
  const managerAccountHtml = await managerAccountPage.text();
  assert.match(managerAccountHtml, /MANAGER ACCOUNT/, 'the account page must identify the correct role');
  assert.match(managerAccountHtml, /href="\/admin"[^>]*>Open manager</, 'the manager account must expose its manager entry point');
  assert.match(managerAccountHtml, /href="\/account\/security"/, 'manager accounts must expose account security');

  const managerAllowedPages = [
    '/admin',
    '/admin/staff',
    '/admin/categories',
    '/admin/products',
    '/admin/products/new',
    '/admin/stories',
    '/admin/stories/new',
    '/admin/orders',
    '/admin/returns',
    '/admin/coupons',
    '/admin/customers',
    '/admin/branding',
    '/admin/audit',
    '/admin/gdpr',
    '/admin/license',
    '/admin/settings'
  ];
  const managerContentMarkers = {
    '/admin': /Manage your store/,
    '/admin/staff': /Staff &amp; Manager account/,
    '/admin/categories': /Categories/,
    '/admin/products': /Products/,
    '/admin/products/new': /Add product/,
    '/admin/stories': /Stories/,
    '/admin/stories/new': /Add story/,
    '/admin/orders': /Orders/,
    '/admin/returns': /Returns, exchanges &amp; refunds/,
    '/admin/coupons': /Discounts/,
    '/admin/customers': /Customers/,
    '/admin/branding': /Storefront appearance/,
    '/admin/audit': /Audit log/,
    '/admin/gdpr': /GDPR tools/,
    '/admin/license': /License metadata/,
    '/admin/settings': /Store settings/,
  };
  for (const pagePath of managerAllowedPages) {
    const response = await fetch(`${base}${pagePath}`, { headers: { cookie: staffManagerCookie } });
    assert.equal(response.status, 200, `manager role should have access to ${pagePath}`);
    const html = await response.text();
    assert.match(html, /<body[^>]*class="is-admin-app"/, `${pagePath} must use the Manager workspace shell`);
    assert.match(html, /<nav class="admin-nav container"/, `${pagePath} must include Manager navigation`);
    assert.match(html, /<main id="main-content" class="admin-main">/, `${pagePath} must include the Manager main region`);
    const workspaceOpen = html.indexOf('<div class="admin-workspace-content" id="manager-page-content">');
    const workspaceClose = html.indexOf('</div><!-- \/.admin-workspace-content -->', workspaceOpen);
    assert.ok(workspaceOpen >= 0 && workspaceClose > workspaceOpen, `${pagePath} must have one complete Manager content wrapper`);
    const marker = managerContentMarkers[pagePath];
    if (marker) {
      const content = html.slice(workspaceOpen, workspaceClose);
      assert.match(content, marker, `${pagePath} must render its actual page content inside the Manager content wrapper, not only the header/navigation`);
    }
  }

  const managerAdditionalPages = ['/admin/audit', '/admin/license', '/admin/settings'];
  for (const pagePath of managerAdditionalPages) {
    const response = await fetch(`${base}${pagePath}`, { headers: { cookie: staffManagerCookie } });
    assert.equal(response.status, 200, `Manager must have full access to ${pagePath}`);
  }

  // A Manager must be able to save Settings with a valid CSRF token and the new value must persist.
  const managerCsrfResponse = await fetch(`${base}/session/csrf`, {
    headers: { cookie: staffManagerCookie, accept: 'application/json' }
  });
  assert.equal(managerCsrfResponse.status, 200);
  const managerCsrf = (await managerCsrfResponse.json()).csrf;
  assert.ok(managerCsrf, 'manager session must have a CSRF token');
  const managerLegalName = 'Manager Settings Integration BV';
  const managerSettingsPost = await fetch(`${base}/admin/settings`, {
    method: 'POST',
    headers: { cookie: staffManagerCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ _csrf: managerCsrf, legalName: managerLegalName }),
    redirect: 'manual'
  });
  assert.equal(managerSettingsPost.status, 303, 'Manager direct POST to Settings must save successfully');
  assert.match(managerSettingsPost.headers.get('location') || '', /^\/admin\/settings\?saved=1/);
  assert.equal(await data.getSetting('legal_name', ''), managerLegalName, 'Manager Settings POST must persist the submitted legal name');

  const productPage = await fetch(`${base}/admin/products/new`, { headers: { cookie: managerCookie } });
  assert.equal(productPage.status, 200);
  const productHtml = await productPage.text();
  assert.match(productHtml, /name="salePrice"/);
  assert.match(productHtml, /Product code \(SKU\)/, 'product form must show the current SKU label');
  assert.match(productHtml, /<summary[^>]*>\s*<strong>Additional details<\/strong>/, 'optional sale/description fields must remain in the additional-details disclosure');
  const productCsrf = productHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(productCsrf, 'product form must have a CSRF token');
  assert.match(productHtml, /data-refresh-csrf/, 'product form must refresh stale browser-session tokens before submit');
  assert.match(productHtml, /Quantity in stock/, 'products without options must show a normal stock quantity field');
  assert.match(productHtml, /You do not need to create a size to track stock/, 'plain inventory must not depend on sizes or variants');
  const csrfRefresh = await fetch(`${base}/session/csrf`, { headers: { cookie: managerCookie, accept: 'application/json' } });
  assert.equal(csrfRefresh.status, 200);
  assert.match(csrfRefresh.headers.get('cache-control') || '', /no-store/i);
  const refreshedCsrf = (await csrfRefresh.json()).csrf;
  assert.equal(refreshedCsrf, productCsrf, 'fresh token endpoint returns the current session token');
  const productName = 'Temporary manager product';
  const productForm = new FormData();
  for (const [key,value] of Object.entries({
    _csrf: productCsrf,
    name: productName,
    sku: '',
    categoryId: '',
    shortDescription: 'Product flow integration test',
    description: 'Temporary product created and deleted by the integration test.',
    tags: 'test',
    price: '12.34',
    costPrice: '3.00',
    salePrice: '',
    automaticDiscountPercent: '0',
    saleStart: '',
    saleEnd: '',
    stock: '2',
    reorderLevel: '5',
    imageUrl: '',
    active: 'on'
  })) productForm.set(key,value);
  // Use the genuine 640x640 PNG fixture. A 12-byte PNG signature was never
  // a valid image, and the upload validator correctly rejects it as HTTP 400.
  const smokePng = await fs.readFile(new URL('../test/fixtures/r19-sample.png',import.meta.url));
  productForm.set('image',new Blob([smokePng],{type:'image/png'}),'smoke.png');
  const invalidProductForm = new FormData();
  for (const [key,value] of productForm.entries()) invalidProductForm.append(key,value);
  invalidProductForm.set('salePrice','99.99');
  const rejectedProduct = await fetch(`${base}/admin/products/save`, {
    method: 'POST',
    headers: { cookie: managerCookie },
    body: invalidProductForm,
    redirect: 'manual'
  });
  assert.equal(rejectedProduct.status,400);
  const rejectedHtml = await rejectedProduct.text();
  assert.match(rejectedHtml,/value="12\.34"/);
  assert.match(rejectedHtml,/value="99\.99"/);
  assert.match(rejectedHtml,/Sale price is optional, but when entered it must be greater than zero and lower than the regular price\./);
  // A spoofed/truncated PNG must still be rejected. This regression checks
  // that fixing the smoke test never weakens real upload validation.
  const malformedImageForm = new FormData();
  for(const [key,value] of productForm.entries()) malformedImageForm.append(key,value);
  malformedImageForm.set('image',new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'}),'invalid.png');
  const rejectedImage = await fetch(`${base}/admin/products/save`,{
    method:'POST',headers:{cookie:managerCookie},body:malformedImageForm,redirect:'manual'
  });
  assert.equal(rejectedImage.status,400,'truncated image must be rejected rather than saved');
  assert.match(await rejectedImage.text(),/Use a valid JPG, PNG or WebP image up to 2 MiB/);
  const saveProduct = await fetch(`${base}/admin/products/save`, {
    method: 'POST',
    headers: { cookie: managerCookie },
    body: productForm,
    redirect: 'manual'
  });
  assert.equal(saveProduct.status, 303,`Valid uploaded PNG and valid product fields must save; got HTTP ${saveProduct.status}: ${(await saveProduct.clone().text()).match(/class="alert[^"]*"[^>]*>([^<]+)/)?.[1]||'no alert text'}`);
  const productQuery = await db.execute({ sql: 'SELECT id,image_url,sku,slug,stock,reserved_stock FROM products WHERE name=?', args: [productName] });
  const createdProduct = productQuery.rows[0];
  assert.ok(createdProduct);
  const savedProductLocation = saveProduct.headers.get('location');
  assert.equal(
    savedProductLocation,
    `/admin/products/${createdProduct.id}/edit?saved=1`,
    'successful product save returns to the edited product and requests a saved confirmation'
  );
  const savedProductPage = await fetch(new URL(savedProductLocation, base), { headers: { cookie: managerCookie } });
  assert.equal(savedProductPage.status, 200, 'saved-product redirect target must render');
  assert.match(await savedProductPage.text(), /product-save-confirmation[\s\S]*Product saved(?: successfully)?\./, 'successful save must show an accessible confirmation on the edited product page');
  assert.equal(Number(createdProduct.stock), 2, 'simple product stock is saved without requiring any variants');
  assert.equal(Number(createdProduct.reserved_stock), 0);
  assert.match(createdProduct.sku,/^TEMPORARY-MANAGER-PRODUCT(?:-\d+)?$/);
  assert.match(createdProduct.image_url,/^\/uploads\/[a-f0-9]{32}\.png$/);
  const restockEditPage=await fetch(`${base}/admin/products/${createdProduct.id}/edit`,{headers:{cookie:managerCookie}});
  assert.equal(restockEditPage.status,200);
  const restockHtml=await restockEditPage.text();
  const restockCsrf=restockHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(restockCsrf,'edit page should provide a CSRF token for the stock-only form');
  const beforeRestock=await db.execute({sql:'SELECT id,sku,price_cents,cost_price_cents,stock,reserved_stock FROM products WHERE id=?',args:[createdProduct.id]});
  const restockResponse=await fetch(`${base}/admin/products/restock`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:restockCsrf,id:String(createdProduct.id),quantity:'3'}),redirect:'manual'});
  assert.equal(restockResponse.status,303,'stock-only restock should not require product prices');
  assert.equal(restockResponse.headers.get('location'),`/admin/products/${createdProduct.id}/edit?restocked=1`);
  const afterRestock=await db.execute({sql:'SELECT id,sku,price_cents,cost_price_cents,stock,reserved_stock FROM products WHERE id=?',args:[createdProduct.id]});
  assert.equal(Number(afterRestock.rows[0].stock),Number(beforeRestock.rows[0].stock)+3,'restock adds quantity only');
  assert.equal(afterRestock.rows[0].sku,beforeRestock.rows[0].sku,'restock does not alter the SKU');
  assert.equal(Number(afterRestock.rows[0].price_cents),Number(beforeRestock.rows[0].price_cents),'restock does not alter the selling price');
  assert.equal(Number(afterRestock.rows[0].cost_price_cents),Number(beforeRestock.rows[0].cost_price_cents),'restock does not alter purchase cost');
  // Follow the exact redirect returned by the restock route. The success banner
  // is rendered only when the `restocked=1` query flag is present.
  const restockLocation=restockResponse.headers.get('location');
  assert.ok(restockLocation, 'successful restock must provide a redirect location');
  const restockedPage=await fetch(new URL(restockLocation,base),{headers:{cookie:managerCookie}});
  assert.equal(restockedPage.status,200,'restock redirect target should render the edited product');
  const restockedHtml=await restockedPage.text();
  assert.match(restockedHtml,/Stock added successfully\./,'successful restock must show the current localized-source success copy');
  assert.match(restockedHtml,/The same product, SKU, price and order history were kept\./,'success copy should confirm the existing product and its history were preserved');
  // Product lifecycle is tested over real HTTP, not only against repository helpers.
  // A manager must be able to archive, find, restore and safely delete a no-history item.
  const lifecycleProductId=await data.adminCreateOrUpdateProduct({
    name:'Temporary lifecycle product',slug:'temporary-lifecycle-product',shortDescription:'Lifecycle integration test',description:'No order history; may be deleted after archive.',imageUrl:'',priceCents:1500,costPriceCents:500,salePriceCents:null,saleStart:null,saleEnd:null,automaticDiscountPercent:0,sku:'TEMP-LIFECYCLE-PRODUCT',stock:3,reorderLevel:0,categoryId:null,tags:'integration',featured:false,active:true,variants:[],variantOptionName:'Size'
  });
  let lifecyclePage=await fetch(`${base}/admin/products?status=active`,{headers:{cookie:managerCookie}});
  assert.equal(lifecyclePage.status,200);
  let lifecycleHtml=await lifecyclePage.text();
  assert.match(lifecycleHtml,/name="status"/,'product manager must include an explicit status filter');
  let lifecycleCsrf=lifecycleHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(lifecycleCsrf);
  // A reserved product must be visibly blocked in both the list and the editor.
  await db.execute({sql:'UPDATE products SET reserved_stock=1 WHERE id=?',args:[lifecycleProductId]});
  const reservedList=await (await fetch(`${base}/admin/products?status=active`,{headers:{cookie:managerCookie}})).text();
  const reservedRow=reservedList.match(/<tr>[\s\S]*?<\/tr>/g).find(row=>row.includes('Temporary lifecycle product'));
  assert.ok(reservedRow);
  assert.match(reservedRow,/<button[^>]*disabled[^>]*>Hide from shop<\/button>/);
  const reservedEdit=await (await fetch(`${base}/admin/products/${lifecycleProductId}/edit`,{headers:{cookie:managerCookie}})).text();
  assert.match(reservedEdit,/id="visibility-reserved-note"/);
  assert.match(reservedEdit,/name="active" value="on"/);
  const deniedArchive=await fetch(`${base}/admin/products/archive`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:lifecycleCsrf,id:String(lifecycleProductId)}),redirect:'manual'});
  assert.equal(deniedArchive.status,303);
  assert.match(deniedArchive.headers.get('location')||'',/notice=reserved/);
  assert.equal(Number((await data.getProductById(lifecycleProductId)).active),1);
  await db.execute({sql:'UPDATE products SET reserved_stock=0 WHERE id=?',args:[lifecycleProductId]});
  let lifecycleAction=await fetch(`${base}/admin/products/archive`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:lifecycleCsrf,id:String(lifecycleProductId)}),redirect:'manual'});
  assert.equal(lifecycleAction.status,303);
  assert.match(lifecycleAction.headers.get('location')||'',/status=archived&notice=archived/);
  assert.equal(Number((await data.getProductById(lifecycleProductId)).active),0);
  lifecyclePage=await fetch(`${base}/admin/products?status=archived`,{headers:{cookie:managerCookie}});
  assert.equal(lifecyclePage.status,200);
  lifecycleHtml=await lifecyclePage.text();
  assert.match(lifecycleHtml,/Restore this product\?/,'archived product must have a visible restore action');
  assert.match(lifecycleHtml,/Delete permanently/,'no-history archived product must have a visible permanent delete action');
  lifecycleCsrf=lifecycleHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  lifecycleAction=await fetch(`${base}/admin/products/restore`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:lifecycleCsrf,id:String(lifecycleProductId)}),redirect:'manual'});
  assert.equal(lifecycleAction.status,303);
  assert.match(lifecycleAction.headers.get('location')||'',/status=active&notice=restored/);
  assert.equal(Number((await data.getProductById(lifecycleProductId)).active),1);
  lifecyclePage=await fetch(`${base}/admin/products?status=active`,{headers:{cookie:managerCookie}});
  lifecycleCsrf=(await lifecyclePage.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  lifecycleAction=await fetch(`${base}/admin/products/archive`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:lifecycleCsrf,id:String(lifecycleProductId)}),redirect:'manual'});
  assert.equal(lifecycleAction.status,303);
  lifecyclePage=await fetch(`${base}/admin/products?status=archived`,{headers:{cookie:managerCookie}});
  lifecycleHtml=await lifecyclePage.text();
  lifecycleCsrf=lifecycleHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  lifecycleAction=await fetch(`${base}/admin/products/delete`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:lifecycleCsrf,id:String(lifecycleProductId),returnStatus:'archived'}),redirect:'manual'});
  assert.equal(lifecycleAction.status,303);
  assert.equal(lifecycleAction.headers.get('location'),'/admin/products?status=archived&notice=deleted','delete should return to the archived filter where the action was taken');
  assert.equal(await data.getProductById(lifecycleProductId),undefined,'safe no-history product should be permanently removed');
  const deletedNoticePage=await fetch(new URL(lifecycleAction.headers.get('location'),base),{headers:{cookie:managerCookie}});
  assert.equal(deletedNoticePage.status,200,'delete redirect should land on a working product list');
  assert.match(await deletedNoticePage.text(),/Product permanently deleted\./,'manager must receive explicit feedback after deletion');

  const cartAdd = await fetch(`${base}/cart/add`, {
    method: 'POST',
    headers: { cookie: managerCookie, 'content-type': 'application/x-www-form-urlencoded', referer: `${base}/shop` },
    body: new URLSearchParams({ _csrf: productCsrf, productId: String(createdProduct.id), quantity: '1' }),
    redirect: 'manual'
  });
  assert.equal(cartAdd.status,303);
  assert.equal(cartAdd.headers.get('location'),'/shop?added=1', 'successful add-to-cart returns to the same-origin shop page with success feedback');
  const savedCart = await fetch(`${base}/cart`, { headers: { cookie: managerCookie } });
  assert.match(await savedCart.text(),/Temporary manager product/);
  for (const route of ['/', '/shop', `/product/${createdProduct.slug}`, '/admin/products']) {
    const renderedPage = await fetch(`${base}${route}`, { headers: { cookie: managerCookie } });
    assert.equal(renderedPage.status,200,`${route} should render with a product in the catalog`);
    if(route.startsWith('/product/')) assert.match(await renderedPage.text(),/application\/ld\+json/,'product detail should expose Product structured data');
  }
  const cashSettings={
    payment_mode:'cash_on_delivery',support_email:'support@example.test',business_phone:'+32 400 00 00',enterprise_number:'0123456789',
    legal_name:'Test Shop BV',business_address:'1 Test Street, Brussels',prices_include_tax:'1',shipping_fee_cents:'0',delivery_countries:'Belgium',
    privacy_policy:'We use customer information only to fulfil orders and provide requested support.',
    terms_policy:'Orders are paid in cash to the manager when goods are delivered to the customer.',
    shipping_policy:'The manager contacts customers to arrange local delivery of available products.',
    returns_policy:'Customers can contact the store within fourteen days to discuss returns or issues.'
  };
  await Promise.all(Object.entries(cashSettings).map(([key,value])=>data.setSetting(key,value)));
  const cashSettingsPage=await fetch(`${base}/admin/settings`,{headers:{cookie:managerCookie}});
  assert.equal(cashSettingsPage.status,200);
  assert.match(await cashSettingsPage.text(),/Cash on delivery only/);
  // A malformed delivery-country draft must not discard unrelated valid settings.
  // The previously saved delivery allow-list is retained and checkout remains gated
  // according to persisted values; the manager receives an explicit warning.
  const settingsCsrfPage=await fetch(`${base}/admin/settings`,{headers:{cookie:managerCookie}});
  assert.equal(settingsCsrfPage.status,200);
  const settingsCsrfHtml=await settingsCsrfPage.text();
  const settingsCsrfForCountryWarning=settingsCsrfHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(settingsCsrfForCountryWarning,'settings page must expose a CSRF token');
  const invalidCountriesDraft=await fetch(`${base}/admin/settings`,{
    method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      _csrf:settingsCsrfForCountryWarning,marketSetupMode:'simplified_cod',currency:'EUR',shippingFee:'0.00',
      legalName:'Updated Test Shop BV',businessAddress:'2 Updated Test Street, Brussels',
      supportEmail:'support@example.test',businessPhone:'+32 400 00 00',enterpriseNumber:'0123456789',vatNumber:'',
      pricesIncludeTax:'on',deliveryCountries:'Belgium\nInvalid🙂',
      privacyPolicy:'We use customer information only to fulfil orders and provide requested support.',
      termsPolicy:'Orders are paid in cash to the manager when goods are delivered to the customer.',
      shippingPolicy:'The manager contacts customers to arrange local delivery of available products.',
      returnsPolicy:'Customers can contact the store within fourteen days to discuss returns or issues.'
    }),redirect:'manual'
  });
  assert.equal(invalidCountriesDraft.status,303,'invalid country text alone must not block saving other valid settings');
  assert.equal(invalidCountriesDraft.headers.get('location'),'/admin/settings?saved=1&deliveryCountriesWarning=1');
  assert.equal(await data.getSetting('legal_name',''),'Updated Test Shop BV','unrelated setting should persist despite the invalid country list');
  assert.equal(await data.getSetting('market_setup_mode',''),'simplified_cod','selected setup profile should persist');
  assert.equal(await data.getSetting('delivery_countries',''),'Belgium','previous valid delivery allow-list must be preserved');
  const savedWithCountryWarning=await fetch(`${base}${invalidCountriesDraft.headers.get('location')}`,{headers:{cookie:managerCookie}});
  assert.equal(savedWithCountryWarning.status,200);
  const savedWithCountryWarningHtml=await savedWithCountryWarning.text();
  assert.match(savedWithCountryWarningHtml,/Settings saved, delivery countries not changed/);
  assert.match(savedWithCountryWarningHtml,/previous delivery-country list was preserved/);
  const cashCheckoutPage=await fetch(`${base}/checkout`,{headers:{cookie:managerCookie}});
  assert.equal(cashCheckoutPage.status,200);
  const cashCheckoutHtml=await cashCheckoutPage.text();
  assert.match(cashCheckoutHtml,/Pay in cash when your order is delivered\./, 'checkout must explain the configured cash-on-delivery method using the current customer-facing copy');
  // This integration setup has no regional pricing rules, so the current CTA is the explicit payment-obligation label (not the retired 'Place order' copy).
  assert.match(cashCheckoutHtml,/class="checkout-place-label"[^>]*>Order with obligation to pay<\/span>/, 'checkout must render the legally explicit payment-obligation action');
  assert.doesNotMatch(cashCheckoutHtml,/Checkout is not live yet/);
  const cashCsrf=cashCheckoutHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const cashIdempotencyKey=cashCheckoutHtml.match(/name="idempotencyKey" value="([^"]+)"/)?.[1];
  const placedCashOrder=await fetch(`${base}/checkout`,{
    method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:cashCsrf,idempotencyKey:cashIdempotencyKey,customerPhone:'+32 400 00 00',shippingName:'Customer Test',shippingAddress:'1 Test Street',shippingCity:'Brussels',shippingPostalCode:'1000',shippingCountry:'Belgium',termsAccepted:'on'}),
    redirect:'manual'
  });
  assert.equal(placedCashOrder.status,303);
  const cashOrderId=Number(placedCashOrder.headers.get('location')?.match(/order=(\d+)/)?.[1]);
  assert.ok(cashOrderId>0);
  const placedOrder=await data.getOrder(cashOrderId);
  assert.equal(placedOrder.status,'pending');
  assert.equal(placedOrder.payment_provider,'cash_on_delivery');
  assert.equal(placedOrder.reservation_expires_at, null, 'new pending orders must not receive an automatic expiry timestamp');
  assert.equal(placedOrder.payment_provider,'cash_on_delivery');
  assert.equal(Number((await data.getDashboardStats()).orders.revenue),0);
  const orderConfirmation=await fetch(`${base}${placedCashOrder.headers.get('location')}`,{headers:{cookie:managerCookie}});
  assert.match(await orderConfirmation.text(),/Pay cash only when it is delivered/);
  const pendingInventory=await db.execute({sql:'SELECT stock,reserved_stock FROM products WHERE id=?',args:[createdProduct.id]});
  assert.equal(Number(pendingInventory.rows[0].stock),5);
  assert.equal(Number(pendingInventory.rows[0].reserved_stock),1);
  const cashManagerPage=await fetch(`${base}/admin/orders/${cashOrderId}`,{headers:{cookie:managerCookie}});
  assert.equal(cashManagerPage.status,200);
  assert.match(await cashManagerPage.text(),/Accept order/);
  for(const status of ['processing','shipped','completed']){
    const updated=await fetch(`${base}/admin/orders/status`,{
      method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:cashCsrf,id:String(cashOrderId),status}),redirect:'manual'
    });
    assert.equal(updated.status,303);
  }
  const completedCashOrder=await data.getOrder(cashOrderId);
  assert.equal(completedCashOrder.status,'completed');
  assert.equal(completedCashOrder.payment_reference,`cash_received:${cashOrderId}`);
  const settledInventory=await db.execute({sql:'SELECT stock,reserved_stock FROM products WHERE id=?',args:[createdProduct.id]});
  assert.equal(Number(settledInventory.rows[0].stock),4);
  assert.equal(Number(settledInventory.rows[0].reserved_stock),0);
  assert.equal(Number((await data.getDashboardStats()).orders.revenue),1234);
  const guestProductPage=await fetch(`${base}/product/${createdProduct.slug}`);
  const guestProductHtml=await guestProductPage.text();
  const guestCookie=responseCookie(guestProductPage.headers);
  const guestCsrf=guestProductHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(guestCookie&&guestCsrf);
  const guestAdd=await fetch(`${base}/cart/add`,{method:'POST',headers:{cookie:guestCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:guestCsrf,productId:String(createdProduct.id),quantity:'1'}),redirect:'manual'});
  assert.equal(guestAdd.status,303);
  const guestCheckoutPage=await fetch(`${base}/checkout`,{headers:{cookie:guestCookie}});
  assert.equal(guestCheckoutPage.status,200);
  const guestCheckoutHtml=await guestCheckoutPage.text();
  assert.match(guestCheckoutHtml,/name="customerEmail" required/);
  assert.match(guestCheckoutHtml,/Enter your email address/);
  const guestCheckoutCsrf=guestCheckoutHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const guestAccessToken=guestCheckoutHtml.match(/name="guestAccessToken" value="([^"]+)"/)?.[1];
  const guestIdempotencyKey=guestCheckoutHtml.match(/name="idempotencyKey" value="([^"]+)"/)?.[1];
  const guestOrderResponse=await fetch(`${base}/checkout`,{method:'POST',headers:{cookie:guestCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:guestCheckoutCsrf,guestAccessToken,idempotencyKey:guestIdempotencyKey,customerEmail:'walk-in@example.test',customerPhone:'+32 401 00 00',shippingName:'Walk In',shippingAddress:'2 Guest Street',shippingCity:'Brussels',shippingPostalCode:'1000',shippingCountry:'Belgium',termsAccepted:'on'}),redirect:'manual'});
  assert.equal(guestOrderResponse.status,303);
  const guestOrderId=Number(guestOrderResponse.headers.get('location')?.match(/order=(\d+)/)?.[1]);
  assert.ok(guestOrderId>0);
  const guestOrder=await data.getOrder(guestOrderId);
  assert.equal(guestOrder.user_id,null);
  assert.equal(guestOrder.email,'walk-in@example.test');
  assert.equal(guestOrder.shipping_address,'2 Guest Street');
  assert.equal(guestOrder.payment_provider,'cash_on_delivery');
  const guestOrderAccess=String(guestOrderResponse.headers.get('set-cookie')||'').match(/guest_order_\d+=[^;]+/)?.[0];
  assert.ok(guestOrderAccess);
  const guestConfirmation=await fetch(`${base}${guestOrderResponse.headers.get('location')}`,{headers:{cookie:`${guestCookie}; ${guestOrderAccess}`}});
  assert.equal(guestConfirmation.status,200);
  assert.match(await guestConfirmation.text(),/Pay cash only when it is delivered/);
  const managerCanSeeGuestOrder=await fetch(`${base}/admin/orders/${guestOrderId}`,{headers:{cookie:managerCookie}});
  assert.equal(managerCanSeeGuestOrder.status,200);
  const managerGuestHtml=await managerCanSeeGuestOrder.text();
  assert.match(managerGuestHtml,/walk-in@example\.test/);
  assert.match(managerGuestHtml,/2 Guest Street/);
  assert.match(managerGuestHtml,/Accept order/);
  const declineGuestOrder=await fetch(`${base}/admin/orders/status`,{method:'POST',headers:{cookie:managerCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:cashCsrf,id:String(guestOrderId),status:'cancelled'}),redirect:'manual'});
  assert.equal(declineGuestOrder.status,303);
  assert.equal((await data.getOrder(guestOrderId)).status,'cancelled');
  const uploadedImage = await fetch(`${base}${createdProduct.image_url}`);
  assert.equal(uploadedImage.status,200);
  assert.equal(uploadedImage.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await uploadedImage.arrayBuffer()),smokePng,'served product image must preserve the complete valid PNG upload');
  assert.equal(await data.archiveProduct(Number(createdProduct.id)),true);
  assert.equal((await data.getProductById(Number(createdProduct.id))).active,0);
  const retainedProduct=await db.execute({sql:'SELECT id,active,image_url FROM products WHERE id=?',args:[createdProduct.id]});
  assert.equal(retainedProduct.rows.length,1);
  assert.equal(Number(retainedProduct.rows[0].active),0);
  assert.equal(retainedProduct.rows[0].image_url,createdProduct.image_url);

  const customerEmail = 'customer-smoke@example.test';
  const customerPassword = 'Customer-strong-test-password-2026';
  const approvedCustomerPassword = 'Customer-approved-private-password-2026';
  const registrationPage = await fetch(`${base}/register`);
  const registrationHtml = await registrationPage.text();
  assert.match(registrationHtml,/Create your account/);
  assert.match(registrationHtml,/name="fullName"/);
  assert.match(registrationHtml,/name="confirmPassword"/);
  assert.match(registrationHtml,/name="termsAccepted"/);
  assert.match(registrationHtml,/action="\/register"/);
  assert.match(registrationHtml,/Use 15–200 characters/);
  assert.match(registrationHtml,/name="password"[^>]*minlength="15"/);
  const registrationCsrf = registrationHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const registrationCookie = responseCookie(registrationPage.headers);
  const invalidRegistration = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: registrationCookie },
    body: new URLSearchParams({ _csrf: registrationCsrf, fullName:'Customer Test', email: customerEmail, password:'short', confirmPassword:'short', termsAccepted:'on' })
  });
  assert.equal(invalidRegistration.status,200);
  const invalidRegistrationHtml = await invalidRegistration.text();
  assert.match(invalidRegistrationHtml,/password with 15–200 characters that is not common or repeated/);
  assert.match(invalidRegistrationHtml,/value="customer-smoke@example\.test"/);
  const mismatchedPasswords = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: registrationCookie },
    body: new URLSearchParams({ _csrf: registrationCsrf, fullName:'Customer Test', email:customerEmail, password:customerPassword, confirmPassword:'Different-strong-password-2026', termsAccepted:'on' })
  });
  assert.match(await mismatchedPasswords.text(),/The passwords do not match/);
  const missingConsent = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: registrationCookie },
    body: new URLSearchParams({ _csrf: registrationCsrf, fullName:'Customer Test', email:customerEmail, password:customerPassword, confirmPassword:customerPassword })
  });
  assert.match(await missingConsent.text(),/Accept the Terms &amp; Conditions and Privacy Policy/);
  const registration = await fetch(`${base}/register`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: registrationCookie
    },
    body: new URLSearchParams({ _csrf: registrationCsrf, fullName:'Customer Test', email: customerEmail, password:customerPassword, confirmPassword:customerPassword, termsAccepted:'on' }),
    redirect: 'manual'
  });
  assert.equal(registration.status,200,'offline registration must return the neutral pending response');
  assert.equal(registration.headers.get('location'),null,'pending registration must not redirect to an authenticated destination');
  const acceptedRegistrationHtml=await registration.text();
  const genericRegistrationNotice=registrationNotice('en',false);
  assert.ok(acceptedRegistrationHtml.includes(genericRegistrationNotice));
  const pendingAccountPage=await fetch(`${base}/account`,{headers:{cookie:registrationCookie},redirect:'manual'});
  assert.equal(pendingAccountPage.status,302,'registration must not authenticate the anonymous session');
  const savedCustomer = await data.getUserAuthByEmail(customerEmail);
  assert.equal(savedCustomer.full_name,'Customer Test');
  assert.ok(savedCustomer.terms_accepted_at);
  assert.equal(Number(savedCustomer.email_verification_required),1,'offline registration must await a trusted ownership decision');
  assert.equal(savedCustomer.email_verified_at,null);
  const pendingLogin=await fetch(`${base}/login`,{
    method:'POST',headers:{cookie:registrationCookie,'content-type':'application/x-www-form-urlencoded','x-forwarded-for':'203.0.113.52'},
    body:new URLSearchParams({_csrf:registrationCsrf,email:customerEmail,password:customerPassword,next:'/checkout'}),redirect:'manual'
  });
  assert.equal(pendingLogin.status,200,'pending credentials must not authenticate');
  assert.match(await pendingLogin.text(),/Email or password does not match/);

  const duplicateRegistrationPage = await fetch(`${base}/register`);
  const duplicateRegistrationCsrf = (await duplicateRegistrationPage.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  const duplicateRegistrationCookie = responseCookie(duplicateRegistrationPage.headers);
  const duplicateRegistration = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: duplicateRegistrationCookie, 'x-forwarded-for':'203.0.113.50' },
    body: new URLSearchParams({ _csrf: duplicateRegistrationCsrf, fullName:'Customer Test', email: customerEmail, password:customerPassword, confirmPassword:customerPassword, termsAccepted:'on' })
  });
  assert.equal(duplicateRegistration.status,200);
  const duplicateRegistrationHtml = await duplicateRegistration.text();
  assert.ok(duplicateRegistrationHtml.includes(genericRegistrationNotice),
    'duplicate registration must use the same neutral response as a new registration');
  assert.notEqual(duplicateRegistration.headers.get('location'), '/account',
    'a duplicate registration must not obtain an authenticated session');

  // Approve through the same guarded HTTP workflow used by an MFA-authenticated
  // Manager, with identity confirmation and a replacement credential.
  const approvalPage=await fetch(`${base}/admin/customers?search=${encodeURIComponent(customerEmail)}`,{headers:{cookie:staffManagerCookie}});
  assert.equal(approvalPage.status,200);
  const approvalHtml=await approvalPage.text();
  assert.match(approvalHtml,new RegExp(`action="/admin/customers/${savedCustomer.id}/approve-registration"`));
  const approvalCsrf=approvalHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(approvalCsrf);
  const approval=await fetch(`${base}/admin/customers/${savedCustomer.id}/approve-registration`,{
    method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:approvalCsrf,identityConfirmed:'yes',password:approvedCustomerPassword,confirmPassword:approvedCustomerPassword}),redirect:'manual'
  });
  assert.equal(approval.status,303);
  assert.equal(approval.headers.get('location'),'/admin/customers?registration=approved');
  const approvedCustomer=await data.getUserAuthByEmail(customerEmail);
  assert.equal(Number(approvedCustomer.email_verification_required),0);
  assert.ok(approvedCustomer.email_verified_at);
  assert.equal(await verifyPassword(customerPassword,approvedCustomer.password_hash),false,'the registrant-chosen password must not survive manual approval');
  assert.equal(await verifyPassword(approvedCustomerPassword,approvedCustomer.password_hash),true);
  const obsoletePasswordLogin=await fetch(`${base}/login`,{
    method:'POST',headers:{cookie:registrationCookie,'content-type':'application/x-www-form-urlencoded','x-forwarded-for':'203.0.113.52'},
    body:new URLSearchParams({_csrf:registrationCsrf,email:customerEmail,password:customerPassword,next:'/checkout'}),redirect:'manual'
  });
  assert.equal(obsoletePasswordLogin.status,200);
  assert.match(await obsoletePasswordLogin.text(),/Email or password does not match/);
  const approvedCustomerLogin=await fetch(`${base}/login`,{
    method:'POST',headers:{cookie:registrationCookie,'content-type':'application/x-www-form-urlencoded','x-forwarded-for':'203.0.113.52'},
    body:new URLSearchParams({_csrf:registrationCsrf,email:customerEmail,password:approvedCustomerPassword,next:'/checkout'}),redirect:'manual'
  });
  assert.equal(approvedCustomerLogin.status,303);
  assert.equal(approvedCustomerLogin.headers.get('location'),'/checkout','verified customer login must preserve checkout intent');
  const newlyRegisteredCookie=responseCookie(approvedCustomerLogin.headers);
  assert.ok(newlyRegisteredCookie,'verified customer login must rotate the session');
  const registeredLandingPage=await fetch(`${base}/account`,{headers:{cookie:newlyRegisteredCookie}});
  assert.equal(registeredLandingPage.status,200);
  const registeredLandingHtml=await registeredLandingPage.text();
  assert.match(registeredLandingHtml,/customer-smoke@example\.test/);

  // Keep the full storefront path covered after the new approval gate.
  assert.equal(await data.restoreProduct(Number(createdProduct.id)),true);
  const approvedCustomerCsrf=registeredLandingHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const customerAdd=await fetch(`${base}/cart/add`,{
    method:'POST',headers:{cookie:newlyRegisteredCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:approvedCustomerCsrf,productId:String(createdProduct.id),quantity:'1'}),redirect:'manual'
  });
  assert.equal(customerAdd.status,303);
  const approvedCheckout=await fetch(`${base}/checkout`,{headers:{cookie:newlyRegisteredCookie}});
  assert.equal(approvedCheckout.status,200);
  const approvedCheckoutHtml=await approvedCheckout.text();
  const approvedCheckoutCsrf=approvedCheckoutHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const approvedCheckoutKey=approvedCheckoutHtml.match(/name="idempotencyKey" value="([^"]+)"/)?.[1];
  assert.ok(approvedCheckoutCsrf&&approvedCheckoutKey);
  const approvedOrderResponse=await fetch(`${base}/checkout`,{
    method:'POST',headers:{cookie:newlyRegisteredCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:approvedCheckoutCsrf,idempotencyKey:approvedCheckoutKey,customerPhone:'+32 402 00 00',shippingName:'Customer Test',shippingAddress:'3 Verified Street',shippingCity:'Brussels',shippingPostalCode:'1000',shippingCountry:'Belgium',termsAccepted:'on'}),redirect:'manual'
  });
  assert.equal(approvedOrderResponse.status,303);
  const approvedOrderId=Number(approvedOrderResponse.headers.get('location')?.match(/order=(\d+)/)?.[1]);
  assert.ok(approvedOrderId>0);
  const approvedOrder=await data.getOrder(approvedOrderId);
  assert.equal(Number(approvedOrder.user_id),Number(savedCustomer.id));
  assert.equal(approvedOrder.email,customerEmail);
  assert.equal(approvedOrder.payment_provider,'cash_on_delivery');
  const approvedOrderPage=await fetch(`${base}${approvedOrderResponse.headers.get('location')}`,{headers:{cookie:newlyRegisteredCookie}});
  assert.equal(approvedOrderPage.status,200);
  assert.match(await approvedOrderPage.text(),/Pay cash only when it is delivered/);

  const newlyRegisteredLogout = await fetch(`${base}/logout`,{
    method:'POST',redirect:'manual',
    headers:{'content-type':'application/x-www-form-urlencoded',cookie:newlyRegisteredCookie},
    body:new URLSearchParams({_csrf: (await (await fetch(`${base}/account`,{headers:{cookie:newlyRegisteredCookie}})).text()).match(/name="_csrf" value="([^"]+)"/)?.[1] || ''})
  });
  assert.equal(newlyRegisteredLogout.status,303);
  assert.equal(newlyRegisteredLogout.headers.get('location'),'/');
  const afterLogout = await fetch(`${base}/account`,{headers:{cookie:newlyRegisteredCookie},redirect:'manual'});
  assert.equal(afterLogout.status,302,'the old authenticated session must no longer open Account');
  assert.match(afterLogout.headers.get('location')||'',/^\/login\?next=/);

  const customerLoginPage = await fetch(`${base}/login?next=%2Fadmin`);
  const customerCsrf = (await customerLoginPage.text()).match(/name="_csrf" value="([^"]+)"/)?.[1];
  const customerInitialCookie = responseCookie(customerLoginPage.headers);
  const customerLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: customerInitialCookie,
      'x-forwarded-for':'203.0.113.51'
    },
    body: new URLSearchParams({
      _csrf: customerCsrf,
      email: customerEmail,
      password: approvedCustomerPassword,
      next: '/admin'
    }),
    redirect: 'manual'
  });
  assert.equal(customerLogin.status, 303);
  assert.equal(customerLogin.headers.get('location'), '/account');
  assert.match(responseCookieHeader(customerLogin.headers),/Max-Age=7200/i,'customer session cookie must match the two-hour idle timeout');
  const customerSession = responseCookie(customerLogin.headers);
  const registeredAccount = await fetch(`${base}/account`, {
    headers: { cookie: customerSession || `${sessionCookieName()}=invalid` }
  });
  assert.equal(registeredAccount.status, 200, 'new customer can open the account page after explicitly signing in');
  assert.match(await registeredAccount.text(), /customer-smoke@example\.test/);
  const customerDashboard = await fetch(`${base}/admin`, {
    headers: { cookie: customerSession || `${sessionCookieName()}=invalid` },
    redirect: 'manual'
  });
  assert.equal(customerDashboard.status, 403);

  // Verify the signed-in Manager can change the login email and password from its own panel.
  const managerSettingsPage=await fetch(`${base}/admin/staff`,{headers:{cookie:staffManagerCookie}});
  assert.equal(managerSettingsPage.status,200);
  const managerSettingsHtml=await managerSettingsPage.text();
  const managerSettingsCsrf=managerSettingsHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(managerSettingsCsrf);
  const updatedManagerEmail='staff-manager-updated@example.test';
  const managerEmailChange=await fetch(`${base}/admin/staff/update-email`,{
    method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:managerSettingsCsrf,newEmail:updatedManagerEmail,currentPassword:staffManagerPassword}),redirect:'manual'
  });
  assert.equal(managerEmailChange.status,303,'Manager may change its own login email after current-password verification');
  assert.equal(managerEmailChange.headers.get('location'),'/admin/staff?emailChanged=1');
  assert.equal((await data.getUserAuthByEmail(staffManagerEmail)) ?? null,null,'old Manager email must no longer authenticate');
  assert.equal((await data.getUserAuthByEmail(updatedManagerEmail))?.role,'manager');

  const managerSettingsPageAfterEmail=await fetch(`${base}/admin/staff`,{headers:{cookie:staffManagerCookie}});
  assert.equal(managerSettingsPageAfterEmail.status,200,'the current Manager session remains valid after its own email change');
  const managerSettingsAfterEmailHtml=await managerSettingsPageAfterEmail.text();
  assert.match(managerSettingsAfterEmailHtml,/staff-manager-updated@example\.test/);
  const managerPasswordCsrf=managerSettingsAfterEmailHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const updatedManagerPassword='Manager-Changed-Strong-Password-2026';
  const managerPasswordChange=await fetch(`${base}/admin/staff/change-password`,{
    method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:managerPasswordCsrf,currentPassword:staffManagerPassword,newPassword:updatedManagerPassword,confirmPassword:updatedManagerPassword}),redirect:'manual'
  });
  assert.equal(managerPasswordChange.status,303,'Manager may change its own login password after current-password verification');
  assert.equal(managerPasswordChange.headers.get('location'),'/admin/staff?passwordChanged=1');
  const updatedManagerAuth=await data.getUserAuthByEmail(updatedManagerEmail);
  assert.ok(await verifyPassword(updatedManagerPassword,updatedManagerAuth.password_hash),'new Manager password hash must validate');
  assert.equal(await verifyPassword(staffManagerPassword,updatedManagerAuth.password_hash),false,'old Manager password must stop validating');

  // Disable MFA only after re-authenticating with the current password and a fresh TOTP.
  // A parallel pending MFA challenge must also lose its backing anonymous session.
  const pendingDisableSession=await data.createSession(null,5*60*1000);
  await data.setSessionCsrf(pendingDisableSession,crypto.randomBytes(24).toString('base64url'));
  await data.createMfaLoginChallenge(pendingDisableSession,{
    credentialProof:{passwordHash:updatedManagerAuth.password_hash,email:updatedManagerAuth.email,role:updatedManagerAuth.role},
    userId:Number(updatedManagerAuth.id),mode:'verify',rememberMe:false,nextPath:'/admin',expiresAtMs:Date.now()+5*60*1000
  });
  const disablePage=await fetch(`${base}/mfa/disable`,{headers:{cookie:staffManagerCookie}});
  assert.equal(disablePage.status,200,'active Manager can open the MFA reset page');
  const disableHtml=await disablePage.text();
  const disableCsrf=disableHtml.match(/name="_csrf" value="([^"]+)"/)?.[1];
  assert.ok(disableCsrf,'MFA reset form must include a CSRF token');
  const currentMfaRow=await data.getUserMfaById(Number(updatedManagerAuth.id));
  const currentMfaSecret=decryptTotpSecret(currentMfaRow.mfa_secret);
  const disableTotp=await freshTotpCode(currentMfaSecret,Number(updatedManagerAuth.id));
  const disableCode=disableTotp.code;
  const disableResponse=await fetch(`${base}/mfa/disable`,{
    method:'POST',headers:{cookie:staffManagerCookie,'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({_csrf:disableCsrf,password:updatedManagerPassword,code:disableCode}),redirect:'manual'
  });
  assert.equal(disableResponse.status,303,'MFA reset requires valid current password and TOTP');
  assert.equal(disableResponse.headers.get('location'),'/login?mfa=required');
  assert.equal(await data.getSession(pendingDisableSession),null,'MFA reset must revoke parallel challenge sessions too');
  assert.equal(Number((await data.getUserMfaById(Number(updatedManagerAuth.id))).mfa_enabled),0,'MFA reset must disable current enrollment and require setup again');
  } finally {
    await cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
