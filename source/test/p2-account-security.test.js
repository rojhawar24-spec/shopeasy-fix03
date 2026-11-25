import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registrationNotice} from '../src/registration-copy.js';
const server=fs.readFileSync('src/server.js','utf8');
const db=fs.readFileSync('src/db.js','utf8');
const auth=fs.readFileSync('src/auth.js','utf8');
const email=fs.readFileSync('src/services/email.js','utf8');
const lookup=fs.readFileSync('views/order-lookup.ejs','utf8');
test('registration stays pending and issues hashed 24-hour verification tokens only when Resend is enabled',()=>{
  const register=server.slice(server.indexOf("app.post('/register'"),server.indexOf("app.get('/verify-email'"));
  assert.match(register,/createEmailVerificationToken\(userId,tokenHash,Date\.now\(\)\+24\*60\*60\*1000\)/);
  assert.match(register,/createHash\('sha256'\)\.update\(token\)\.digest\('hex'\)/);
  assert.match(register,/if\(emailEnabled\(\)\)[\s\S]*sendEmailVerificationEmail/);
  assert.match(db,/CREATE TABLE IF NOT EXISTS email_verification_tokens/);
  assert.ok(register.includes("createUser(email,passwordHash,'customer',fullName,new Date().toISOString(),false)"),'every public registration must remain pending until ownership verification');
  assert.doesNotMatch(register,/await login\(/,'a registration response must never authenticate its caller');
});
test('verification requires a read-only challenge followed by token and original password with one-time CAS',()=>{
  const get=server.slice(server.indexOf("app.get('/verify-email'"),server.indexOf("app.post('/verify-email'"));
  const post=server.slice(server.indexOf("app.post('/verify-email'"),server.indexOf("app.post('/verify-email/resend'"));
  assert.match(get,/getEmailVerificationChallenge/);assert.doesNotMatch(get,/await verifyEmailToken\(/);
  assert.match(post,/emailVerificationConfirmLimiter,verifyCsrf/);
  assert.match(post,/verifyPassword\(password,challenge\.passwordHash\)/);
  assert.match(post,/verifyEmailToken\(tokenHash,\{expectedPasswordHash:challenge\.passwordHash\}\)/);
  assert.match(db,/DELETE FROM email_verification_tokens WHERE token_hash=\?/);
  assert.match(db,/Number\(row\.expires_at_ms\)<=Date\.now\(\)/);
});
test('resend verification has IP and per-account cooldown with a generic response',()=>{assert.match(server,/emailVerificationResendLimiter/);assert.match(db,/now-Number\(existing\.latest\)<60_000/);assert.match(server,/If this account needs verification, a message will be sent shortly/);});
test('registration duplicate and password reset responses do not disclose account existence',()=>{
  const register=server.slice(server.indexOf("app.post('/register'"),server.indexOf("app.get('/verify-email'"));
  assert.match(register,/const notice=registrationNotice\(res\.locals\.locale,emailEnabled\(\)\)/);
  assert.equal((register.match(/render\(res,'login',\{\.\.\.registrationLocals,mode:'login',fullName:'',notice\}\)/g)||[]).length,3,'new registrations, known duplicates and uniqueness races must use the same neutral response');
  assert.match(registrationNotice('en',true),/^If this email address can be used, check your inbox/);
  assert.match(registrationNotice('en',false),/^If this email address can be used, contact the store to verify your identity and privately agree a new password/);
  assert.match(server,/return res\.status\(200\)\.render\('forgot-password',\{sent:true,email,next,error:null\}\)/);
});
test('registration, verification resend and password reset avoid provider-latency account enumeration',()=>{
  const register=server.slice(server.indexOf("app.post('/register'"),server.indexOf("app.get('/verify-email'"));
  const resend=server.slice(server.indexOf("app.post('/verify-email/resend'"),server.indexOf("app.post('/logout'"));
  const forgot=server.slice(server.indexOf("app.post('/forgot-password'"),server.indexOf("app.get('/order-lookup'"));
  assert.ok(register.indexOf('passwordHash=await hashPassword(password)')<register.indexOf('getUserAuthByEmail(email)'),'registration must pay the same expensive password-hash cost before checking for duplicate addresses');
  assert.match(register,/void \(async\(\)=>[\s\S]*?sendEmailVerificationEmail/);
  assert.match(resend,/void \(async\(\)=>[\s\S]*?sendEmailVerificationEmail/);
  assert.match(forgot,/void \(async\(\)=>[\s\S]*?sendPasswordResetCodeEmail/);
  assert.doesNotMatch(forgot,/if\(issued\)\s*await sendPasswordResetCodeEmail/);
});
test('customer login refuses unverified accounts using the neutral login failure',()=>{assert.match(auth,/Number\(row\.email_verification_required\)===1 && !row\.email_verified_at/);assert.match(server,/Email or password does not match/);});
test('failed login limits use a per-email hash and block after ten failures',()=>{assert.match(server,/createHash\('sha256'\)\.update\(email\)\.digest\('hex'\)/);assert.match(db,/if\(attempts>=10\)blocked=Math\.max\(blocked,now\+windowMs\)/);assert.match(db,/CREATE TABLE IF NOT EXISTS account_login_limits/);});
test('sessions enforce two-hour idle and thirty-day absolute limits',()=>{assert.match(db,/idleMs=2\*60\*60\*1000/);assert.match(db,/absoluteMs=30\*24\*60\*60\*1000/);assert.match(auth,/maxAge:2\*60\*60\*1000/);});
test('order lookup requires order number and case-insensitive email match',()=>{assert.match(server,/app\.post\('\/order-lookup',orderLookupLimiter,verifyCsrf/);assert.match(db,/lower\(email\)=lower\(\?\)/);assert.match(lookup,/name="orderNumber"/);assert.match(lookup,/name="email"/);});
test('order lookup is rate-limited and requires proof before rendering matched details',()=>{assert.match(server,/makeRateLimiter\('order-lookup',\{windowMs:15\*60\*1000,max:10/);assert.match(server,/if\(!order\|\|!canAccessOrder\(req,order\)\)return res\.status\(200\)\.render\('order-lookup'/);assert.match(lookup,/order\.items\.forEach/);});
test('return workflow stores requests in canonical and mirrored return_requests tables',()=>{assert.match(db,/CREATE TABLE IF NOT EXISTS return_requests/);assert.match(db,/INSERT INTO return_requests\(id,order_id,order_item_id,user_id,request_type,quantity,reason,status,created_at,updated_at\)/);assert.match(server,/app\.post\('\/order\/:id\/return-request',returnRequestLimiter,verifyCsrf/);});
test('return receipt and manager decisions send transactional email when configured',()=>{assert.match(server,/status:'requested'/);assert.match(server,/status:action==='approve'\?'approved':'rejected'/);assert.match(email,/export async function sendReturnRequestEmail/);});

test('verification links use a validated public origin and enforce HTTPS in production',()=>{assert.match(server,/const base=siteBase\(req\)/);assert.doesNotMatch(server,/String\(process\.env\.BASE_URL\|\|`\$\{req\.protocol\}:\/\/\$\{req\.get\('host'\)\}`\)/);assert.match(email,/secureInProduction/);assert.match(email,/u\.protocol==='https:'/);});
