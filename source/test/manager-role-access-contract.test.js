import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integration = fs.readFileSync(path.join(root, 'scripts/manager-dashboard-integration.mjs'), 'utf8');

test('HTTP manager integration bootstraps a full-access Manager without a default Admin', () => {
  assert.match(integration, /data\.createUser\([\s\S]{0,200}?['"]manager['"]/);
  assert.match(integration, /role, 'manager', 'the test account must be a genuine manager, not an admin'/);
  assert.match(integration, /MANAGER ACCOUNT/);
});

test('HTTP Manager integration checks full-access routes', () => {
  for (const page of ['/admin/staff', '/admin/categories', '/admin/products', '/admin/stories', '/admin/orders', '/admin/coupons', '/admin/customers', '/admin/branding']) {
    assert.ok(integration.includes(`'${page}'`), `expected manager-allowed route assertion for ${page}`);
  }
  for (const page of ['/admin/staff', '/admin/audit', '/admin/license', '/admin/settings']) assert.ok(integration.includes(`'${page}'`), `expected Manager full-access route assertion for ${page}`);
  assert.match(integration, /Manager direct POST to Settings must save successfully/);
  assert.match(integration, /Manager Settings POST must persist the submitted legal name/);
});

test('HTTP integration explicitly verifies Admin overview-only access and denied-write non-mutation', () => {
  assert.match(integration, /limited-admin-smoke@example\.test/);
  assert.match(integration, /Store overview access/);
  for (const route of ['/admin/products','/admin/products/new','/admin/categories','/admin/orders','/admin/stories','/admin/stories/new','/admin/coupons','/admin/customers','/admin/branding','/admin/settings','/admin/license','/admin/audit']) assert.ok(integration.includes(`'${route}'`), `expected Admin denial check for ${route}`);
  assert.match(integration, /Admin settings POST must be forbidden/);
  assert.match(integration, /Admin must not submit/);
  assert.match(integration, /Manager may change its own login email/);
  assert.match(integration, /Manager may change its own login password/);
  assert.match(integration, /forbidden Admin Settings POST must not mutate data/);
});
