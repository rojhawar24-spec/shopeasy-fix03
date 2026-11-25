import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('current deployment docs match the Manager bootstrap contract in src/server.js', () => {
  const server = read('src/server.js');
  const env = read('.env.example');
  const cloudflare = read('CLOUDFLARE-DEPLOYMENT.md');
  const runbook = read('STAGING-QA-RUNBOOK.md');
  const quickStart = read('QUICK-START-AND-ENV.md');

  for (const key of ['MANAGER_NAME', 'MANAGER_EMAIL', 'MANAGER_PASSWORD']) {
    assert.ok(server.includes(`process.env.${key}`), `runtime bootstrap must read ${key}`);
    assert.match(env, new RegExp(`^${key}=`, 'm'), `.env.example must define ${key}`);
    assert.ok(cloudflare.includes(key), `deployment instructions must mention ${key}`);
    assert.ok(runbook.includes(key), `staging instructions must mention ${key}`);
    assert.ok(quickStart.includes(key), `local quick start must mention ${key}`);
  }
  assert.doesNotMatch(env, /^ADMIN_EMAIL=/m, 'new installs must not bootstrap Admin from ADMIN_EMAIL');
  assert.doesNotMatch(env, /^ADMIN_PASSWORD=/m, 'new installs must not bootstrap Admin from ADMIN_PASSWORD');
  assert.doesNotMatch(cloudflare, /secret put ADMIN_(?:EMAIL|PASSWORD)/, 'production deployment must not provision an Admin as the owner');
  assert.doesNotMatch(runbook, /first admin bootstrap|staging admin password/i, 'staging runbook must describe Manager-first bootstrap');
  assert.match(runbook, /Staging Manager password/);
  assert.match(runbook, /first Manager bootstrap/i);
  assert.match(quickStart, /legacy.*ADMIN_EMAIL.*ADMIN_PASSWORD|ADMIN_EMAIL.*ADMIN_PASSWORD.*legacy/i);
});

test('active release labels and current QA report are aligned to 2.8.95', () => {
  const version = '2.8.95';
  const runbook = read('STAGING-QA-RUNBOOK.md');
  assert.equal(JSON.parse(read('package.json')).version, version);
  assert.equal(JSON.parse(read('package-lock.json')).version, version);
  for (const name of ['README.md','AUDIT-REPORT.md','CLOUDFLARE-DEPLOYMENT.md','STAGING-QA-RUNBOOK.md','MANAGER-GUIDE.md','STAFF-ACCOUNTS.md','API-REFERENCE.md','RELEASE-VERIFICATION.md']) {
    const content = read(name);
    assert.ok(content.includes(version), `${name} must identify the current release where it presents an active version`);
  }
  const settings = read('views/admin/settings.ejs');
  assert.match(settings, /data-release-version="2\.8\.95">Build 2\.8\.95/);
  assert.doesNotMatch(runbook, /2\.8\.66/, 'staging runbook must not present the old version as current');
  assert.doesNotMatch(read('MANAGER-GUIDE.md'), /Version: ShopEasy 2\.8\.83/);
  assert.doesNotMatch(read('STAFF-ACCOUNTS.md'), /Staff accounts — ShopEasy 2\.8\.80/);
  assert.doesNotMatch(settings, /data-release-version="2\.8\.77"|Build 2\.8\.77/);
  assert.ok(fs.existsSync(path.join(root, `QA-REPORT-${version}.md`)));
  assert.ok(fs.existsSync(path.join(root, `RELEASE-MANIFEST-${version}.txt`)));
  assert.ok(fs.existsSync(path.join(root, `VERIFICATION-SUMMARY-${version}.txt`)));
  assert.match(read('CLOUDFLARE-DEPLOYMENT.md'), /QA-REPORT-2\.8\.95\.md/);
  assert.match(read('README.md'), /QA-REPORT-2\.8\.95\.md/);
});
