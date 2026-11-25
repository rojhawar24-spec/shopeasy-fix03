import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyManagerLoginRedirect, validStagingMfaCode } from '../scripts/staging-manager-auth.mjs';

test('Manager staging sign-in accepts only the MFA challenge, never a direct authenticated redirect', () => {
  assert.equal(classifyManagerLoginRedirect('/mfa/verify'), 'verify');
  assert.equal(classifyManagerLoginRedirect('/mfa/setup'), 'setup');
  for (const value of ['/admin', '/admin/settings', '//host/mfa/verify', 'https://host/mfa/verify', '/mfa/verify?bypass=1', '', null, []]) {
    assert.equal(classifyManagerLoginRedirect(value), 'invalid');
  }
});

test('Manager staging MFA field accepts only the app code or a standard recovery-code shape', () => {
  for (const value of ['123456', '000000', 'ABC1-DEF2-AB12-CD34-EF56-1234', 'A'.repeat(24)]) assert.equal(validStagingMfaCode(value), true);
  for (const value of ['', '12', '1111111', ['123456'], '1e5', '111 111', 'token', 'X'.repeat(24)]) assert.equal(validStagingMfaCode(value), false);
});

test('Staging certification exercises MFA before checking Manager dashboard; no credentials cannot certify', () => {
  const s = readFileSync(new URL('../scripts/production-certification.mjs', import.meta.url), 'utf8');
  const runbook = readFileSync(new URL('../STAGING-QA-RUNBOOK.md', import.meta.url), 'utf8');
  assert.ok(s.indexOf("const challenge = classifyManagerLoginRedirect(loginLocation)") < s.indexOf("const admin = await request('/admin');"));
  assert.match(s, /request\('\/mfa\/verify',[\s\S]*method: 'POST'/);
  assert.match(s, /STAGING_MANAGER_MFA_CODE/);
  assert.match(s, /process\.exitCode = 2/);
  assert.match(runbook, /STAGING_MANAGER_MFA_CODE/);
});
