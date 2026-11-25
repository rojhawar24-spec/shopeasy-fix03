import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('active release documentation points to the current 2.8.95 QA report', async () => {
  const [readme, audit, quickStart, managerGuide, releaseVerification, cloudflareGuide, staffGuide] = await Promise.all([
    'README.md', 'AUDIT-REPORT.md', 'QUICK-START-AND-ENV.md', 'MANAGER-GUIDE.md',
    'RELEASE-VERIFICATION.md', 'CLOUDFLARE-DEPLOYMENT.md', 'STAFF-ACCOUNTS.md'
  ].map((file) => readFile(path.join(root, file), 'utf8')));
  assert.match(readme, /^# ShopEasy 2\.8\.95/m);
  assert.match(audit, /ShopEasy 2\.8\.95/);
  assert.match(audit, /QA-REPORT-2.8.95\.md/);
  assert.match(audit, /PRE-SALE-RISK-AUDIT-2026-10-18\.md/);
  for (const doc of [quickStart, managerGuide, releaseVerification, cloudflareGuide, staffGuide]) {
    assert.doesNotMatch(doc, /\b2\.8\.40\b/, 'active guide should not present 2.8.40 as current');
  }
});
