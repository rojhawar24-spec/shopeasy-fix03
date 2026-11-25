import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-fix02-'));
for(const k of Object.keys(process.env)) if(/DATABASE|TURSO|MOLLIE|RESEND|PEPPOL|MANAGER|MFA|^AI_|SECRET|TOKEN|PASSWORD|API_KEY|^BASE_URL$/.test(k)) delete process.env[k];
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:pathToFileURL(path.join(dir,'test.sqlite')).href,CLOUDFLARE_WORKER:'0',SEED_DEMO_DATA:'false'});
const d=await import('../src/db.js');
let serial=0;
async function manager(){const id=await d.createUser(`fix02-${++serial}@example.test`,'synthetic-test-hash','manager','Test Manager',null,true);assert.equal(await d.setManagerMfaSecret(id,'opaque-original'),true);return id;}
const activate=(id,expectedSecret)=>d.activateManagerMfa(id,{lastTotpStep:17,recoveryHashes:'[]',expectedSecret});
test.after(async()=>{await d.default.close();fs.rmSync(dir,{recursive:true,force:true});});
test('stale verified enrollment secret cannot activate a replacement',async()=>{
  const id=await manager();const verified=(await d.getUserMfaById(id)).mfa_secret;
  assert.equal(await d.setManagerMfaSecret(id,'opaque-replacement'),true);
  assert.equal(await activate(id,verified),false);
  const row=await d.getUserMfaById(id);assert.equal(row.mfa_enabled,0);assert.equal(row.mfa_secret,'opaque-replacement');
  assert.equal(await activate(id,row.mfa_secret),true);
});
test('missing expected enrollment secret fails closed',async()=>{
  const id=await manager();assert.equal(await activate(id,undefined),false);assert.equal((await d.getUserMfaById(id)).mfa_enabled,0);
});
test('exact verified enrollment activates once and persists its accepted step',async()=>{
  const id=await manager();assert.equal(await activate(id,'opaque-original'),true);
  assert.equal(await activate(id,'opaque-original'),false);
  const row=await d.getUserMfaById(id);assert.equal(row.mfa_enabled,1);assert.equal(row.mfa_last_totp_step,17);assert.equal(row.mfa_secret,'opaque-original');
});
