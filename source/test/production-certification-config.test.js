import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('staging certification names the required credentials as Manager and explains legacy aliases', () => {
  const script = read('scripts/production-certification.mjs');
  const env = read('.env.example');
  const runbook = read('STAGING-QA-RUNBOOK.md');
  assert.match(script, /STAGING_MANAGER_EMAIL/);
  assert.match(script, /STAGING_MANAGER_PASSWORD/);
  assert.match(script, /process\.env\.STAGING_ADMIN_EMAIL/);
  assert.match(script, /process\.env\.STAGING_ADMIN_PASSWORD/);
  assert.match(script, /Authenticated Manager gate/);
  for (const key of ['STAGING_MANAGER_EMAIL', 'STAGING_MANAGER_PASSWORD']) {
    assert.match(env, new RegExp(`^# ${key}=$`, 'm'), `${key} must have an empty commented staging example`);
  }
  assert.match(env, /Staging certification only:[\s\S]*?Do not copy these values into the production service environment\./);
  const activeKeys = [...env.matchAll(/^([A-Z_][A-Z_0-9]*)\s*=/gm)].map(match => match[1]);
  assert.ok(activeKeys.every(key => !key.startsWith('STAGING_')), 'production template must keep staging-only inputs inactive');
  assert.match(runbook, /STAGING_MANAGER_EMAIL/);
  assert.match(runbook, /STAGING_MANAGER_PASSWORD/);
});
