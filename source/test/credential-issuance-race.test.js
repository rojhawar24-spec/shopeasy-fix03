import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

// The normal test runner uses the actual libSQL driver. An offline audit can
// execute this same test in a disposable source copy with a SQLite adapter.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-credential-race-'));
for(const k of Object.keys(process.env)) if(/DATABASE|TURSO|MOLLIE|RESEND|PEPPOL|MANAGER|MFA|^AI_|SECRET|TOKEN|PASSWORD|API_KEY|^BASE_URL$/.test(k)) delete process.env[k];
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:pathToFileURL(path.join(dir,'test.sqlite')).href,CLOUDFLARE_WORKER:'0',SEED_DEMO_DATA:'false'});
const d=await import('../src/db.js');
const a=await import('../src/auth.js');
const {hashPassword}=await import('../src/password-hashing.js');
const {getRow}=await import('../src/database.js');
const oldPassword='Synthetic old credential 918!',newPassword='Synthetic new credential 825!';
const oldHash=await hashPassword(oldPassword),newHash=await hashPassword(newPassword);
let serial=0;
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
async function user(role='customer',verified=true){const email=`race-${++serial}@example.test`;const id=await d.createUser(email,oldHash,role,'Test',null,verified);return {id,email,role};}
async function verified(u){const v=await a.authenticate(u.email,oldPassword);assert.ok(v);return v.credentialProof??{passwordHash:oldHash,email:u.email,role:u.role};}
async function guest(){const sessionId=await d.createSession();return {sessionId,session:await d.getSession(sessionId)};}
function response(){return {cookies:[],cookie(_name,id){this.cookies.push(id);}};}
async function count(u){return Number((await getRow('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?',[u.id])).n);}
async function reset(u){const token=digest('reset-'+u.id);assert.equal(await d.createPasswordResetToken(u.id,token,Date.now()+60000),true);assert.equal((await d.resetPasswordWithCode(u.email,token,newHash)).ok,true);}
async function challenge(u,proof,mode='setup'){const req=await guest();await d.createMfaLoginChallenge(req.sessionId,{userId:u.id,mode,expiresAtMs:Date.now()+60000,credentialProof:proof});return req;}
async function enable(u){assert.equal(await d.setManagerMfaSecret(u.id,'synthetic-opaque-secret'),true);assert.equal(await d.activateManagerMfa(u.id,{lastTotpStep:1,recoveryHashes:'[]',expectedSecret:'synthetic-opaque-secret'}),true);}
test.after(async()=>{await d.default.close();fs.rmSync(dir,{recursive:true,force:true});});

test('reset committed after password verification prevents fresh customer session',async()=>{const u=await user(),proof=await verified(u),req=await guest(),res=response();await reset(u);await assert.rejects(a.login(req,res,u.id,false,proof),/AUTH_CREDENTIALS_CHANGED/);assert.equal(res.cookies.length,0);assert.equal(await count(u),0);assert.ok(await d.getSession(req.sessionId));assert.equal(await a.authenticate(u.email,oldPassword),null);});
test('session issued first is revoked by subsequent reset',async()=>{const u=await user(),proof=await verified(u),req=await guest(),res=response();await a.login(req,res,u.id,false,proof);assert.equal((await d.getSession(res.cookies[0])).user_id,u.id);await reset(u);assert.equal(await d.getSession(res.cookies[0]),null);});
test('new password works after reset; cart, wishlist and coupon survive rotation',async()=>{const u=await user(),req=await guest(),res=response();await reset(u);const v=await a.authenticate(u.email,newPassword);assert.ok(v);await d.saveSessionCart(req.sessionId,[{productId:1,quantity:2}]);await d.saveSessionWishlist(req.sessionId,[1,2]);await d.saveSessionCoupon(req.sessionId,'test');req.session=await d.getSession(req.sessionId);await a.login(req,res,u.id,false,v.credentialProof??{passwordHash:newHash,email:u.email,role:u.role});const s=await d.getSession(res.cookies[0]);assert.equal(s.user_id,u.id);assert.deepEqual(s.cart,req.session.cart);assert.deepEqual(s.wishlist,[1,2]);assert.equal(s.coupon,'TEST');assert.equal(await d.getSession(req.sessionId),null);assert.ok(s.csrf);});
test('missing proof fails closed without issuing cookie',async()=>{const u=await user(),req=await guest(),res=response();await assert.rejects(a.login(req,res,u.id),/AUTH_CREDENTIAL_PROOF_REQUIRED/);assert.equal(await count(u),0);assert.equal(res.cookies.length,0);});
test('wrong role or email cannot issue authenticated session',async()=>{const u=await user(),proof=await verified(u),req=await guest();for(const bad of [{...proof,role:'admin'},{...proof,email:'other@example.test'}])await assert.rejects(a.login(req,response(),u.id,false,bad),/AUTH_CREDENTIALS_CHANGED/);assert.equal(await count(u),0);});
test('pending customer cannot bypass verification with a credential snapshot',async()=>{const u=await user('customer',false),req=await guest();await assert.rejects(a.login(req,response(),u.id,false,{passwordHash:oldHash,email:u.email,role:u.role}),/AUTH_CREDENTIALS_CHANGED/);});
test('stale manager password cannot create MFA challenge after password replacement',async()=>{const u=await user('manager'),proof=await verified(u),req=await guest();await d.updateUserPassword(u.id,newHash);await assert.rejects(d.createMfaLoginChallenge(req.sessionId,{userId:u.id,mode:'setup',expiresAtMs:Date.now()+60000,credentialProof:proof}),/AUTH_CREDENTIALS_CHANGED/);assert.equal(await d.getMfaLoginChallenge(req.sessionId),undefined);});
test('pending MFA challenge created first is revoked by password replacement',async()=>{const u=await user('manager'),proof=await verified(u),req=await challenge(u,proof);assert.ok(await d.getMfaLoginChallenge(req.sessionId));await d.updateUserPassword(u.id,newHash);assert.equal(await d.getMfaLoginChallenge(req.sessionId),undefined);assert.equal(await d.getSession(req.sessionId),null);});
test('stale manager MFA completion cannot issue session after password replacement',async()=>{const u=await user('manager');await enable(u);const proof=await verified(u),req=await challenge(u,proof,'verify'),snapshot=await d.getMfaLoginChallenge(req.sessionId);await d.updateUserPassword(u.id,newHash);const res=response();await assert.rejects(a.login(req,res,u.id,false,snapshot.credentialProof??proof),/AUTH_CREDENTIALS_CHANGED/);assert.equal(res.cookies.length,0);assert.equal(await count(u),0);});
test('manager setup cannot mutate secret or activate MFA after password replacement',async()=>{const u=await user('manager'),proof=await verified(u);await d.setManagerMfaSecret(u.id,'original');const req=await challenge(u,proof),snapshot=await d.getMfaLoginChallenge(req.sessionId);await d.updateUserPassword(u.id,newHash);assert.equal(await d.setManagerMfaSecret(u.id,'replacement',snapshot.credentialProof??proof),false);assert.equal(await d.activateManagerMfa(u.id,{lastTotpStep:1,recoveryHashes:'[]',expectedSecret:'original',credentialProof:snapshot.credentialProof??proof}),false);const row=await d.getUserMfaById(u.id);assert.equal(row.mfa_secret,'original');assert.equal(row.mfa_enabled,0);});
test('manager setup can activate and rotate session using current proof',async()=>{const u=await user('manager'),proof=await verified(u);await d.setManagerMfaSecret(u.id,'original',proof);const req=await challenge(u,proof),snapshot=await d.getMfaLoginChallenge(req.sessionId);const saved=snapshot.credentialProof??proof;assert.equal(await d.activateManagerMfa(u.id,{lastTotpStep:1,recoveryHashes:'[]',expectedSecret:'original',credentialProof:saved}),true);const res=response();await a.login(req,res,u.id,false,saved);assert.equal((await d.getSession(res.cookies[0])).user_id,u.id);});
test('manager with MFA disabled cannot issue authenticated session',async()=>{const u=await user('manager'),proof=await verified(u);await assert.rejects(a.login(await guest(),response(),u.id,false,proof),/AUTH_CREDENTIALS_CHANGED/);});
test('credential proofs are excluded from JSON and spread models',async()=>{const u=await user('manager'),v=await a.authenticate(u.email,oldPassword),proof=v.credentialProof??{passwordHash:oldHash,email:u.email,role:u.role};assert.ok(v.credentialProof);assert.equal(JSON.stringify(v).includes(oldHash),false);assert.equal({...v}.credentialProof,undefined);const req=await challenge(u,proof),snapshot=await d.getMfaLoginChallenge(req.sessionId);assert.ok(snapshot.credentialProof);assert.equal(JSON.stringify(snapshot).includes(oldHash),false);assert.equal({...snapshot}.credentialProof,undefined);});
