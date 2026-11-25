import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/password-hashing.js';
import { store, run, getRow, getRows, unique, cleanup } from './fix03-commerce-fixture.mjs';

test.after(cleanup);
const originalPassword = 'Synthetic-Registration-Password-1!';
const originalHash = await hashPassword(originalPassword);
const changedHash = await hashPassword('Synthetic-Changed-Password-2!');
const newToken = () => crypto.randomBytes(32).toString('hex');
async function fixture({ role = 'customer', verified = false, expiresAt = Date.now() + 60000 } = {}) {
  const email = `fix03-verification-${unique()}@example.test`;
  const userId = await store.createUser(email, originalHash, role, 'Synthetic Verification', null, verified);
  const tokenHash = newToken();
  assert.equal((await store.createEmailVerificationToken(userId, tokenHash, expiresAt)).created, true);
  return { email, userId, tokenHash };
}
const tokenRow = tokenHash => getRow('SELECT * FROM email_verification_tokens WHERE token_hash=?', [tokenHash]);

test('SEC-004 verification challenge is read-only and missing or mismatched password proof consumes nothing', async () => {
  const f = await fixture();
  const originalToken = await tokenRow(f.tokenHash);
  const originalUser = await store.getUserAuthByEmail(f.email);
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.deepEqual(await store.getEmailVerificationChallenge(f.tokenHash), { userId: f.userId, passwordHash: originalHash });
  }
  assert.equal((await store.verifyEmailToken(f.tokenHash)).ok, false);
  for (const expectedPasswordHash of [undefined, '', changedHash, 1]) {
    assert.equal((await store.verifyEmailToken(f.tokenHash, { expectedPasswordHash })).ok, false);
  }
  assert.deepEqual(await tokenRow(f.tokenHash), originalToken);
  assert.deepEqual(await store.getUserAuthByEmail(f.email), originalUser);
});

test('SEC-004 valid token and password proof activate exactly once under concurrent submissions', async () => {
  const f = await fixture();
  const challenge = await store.getEmailVerificationChallenge(f.tokenHash);
  assert.equal(await verifyPassword(originalPassword, challenge.passwordHash), true);
  const results = await Promise.all(Array.from({ length: 6 }, () => store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: challenge.passwordHash })));
  assert.deepEqual(results.filter(result => result.ok), [{ ok: true, userId: f.userId }]);
  assert.equal(results.filter(result => !result.ok).length, 5);
  const current = await store.getUserAuthByEmail(f.email);
  assert.equal(current.password_hash, originalHash);
  assert.equal(current.email_verification_required, 0);
  assert.ok(current.email_verified_at);
  assert.equal(await tokenRow(f.tokenHash), undefined);
  assert.equal(await store.getEmailVerificationChallenge(f.tokenHash), null);
  assert.equal((await store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: originalHash })).ok, false);
  assert.equal((await getRows('SELECT id FROM sessions WHERE user_id=?', [f.userId])).length, 0);
});

test('SEC-004 password change between challenge and activation rejects the stale proof without consuming its token', async () => {
  const f = await fixture();
  const stale = await store.getEmailVerificationChallenge(f.tokenHash);
  assert.equal(await store.updateUserPassword(f.userId, changedHash, { expectedPasswordHash: originalHash }), true);
  const before = await tokenRow(f.tokenHash);
  assert.equal((await store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: stale.passwordHash })).ok, false);
  assert.deepEqual(await tokenRow(f.tokenHash), before);
  assert.equal((await store.getUserAuthByEmail(f.email)).email_verification_required, 1);
  const fresh = await store.getEmailVerificationChallenge(f.tokenHash);
  assert.equal(fresh.passwordHash, changedHash);
  assert.deepEqual(await store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: fresh.passwordHash }), { ok: true, userId: f.userId });
});

test('SEC-004 expiry or token replacement after the challenge prevents stale activation', async () => {
  const expired = await fixture();
  const challenge = await store.getEmailVerificationChallenge(expired.tokenHash);
  await run('UPDATE email_verification_tokens SET expires_at_ms=? WHERE token_hash=?', [Date.now() - 1, expired.tokenHash]);
  const expiredToken = await tokenRow(expired.tokenHash);
  assert.equal(await store.getEmailVerificationChallenge(expired.tokenHash), null);
  assert.equal((await store.verifyEmailToken(expired.tokenHash, { expectedPasswordHash: challenge.passwordHash })).ok, false);
  assert.deepEqual(await tokenRow(expired.tokenHash), expiredToken);
  assert.equal((await store.getUserAuthByEmail(expired.email)).email_verification_required, 1);

  const replaced = await fixture();
  const old = await store.getEmailVerificationChallenge(replaced.tokenHash);
  await run('UPDATE email_verification_tokens SET created_at_ms=? WHERE token_hash=?', [Date.now() - 120000, replaced.tokenHash]);
  const currentToken = newToken();
  assert.equal((await store.createEmailVerificationToken(replaced.userId, currentToken, Date.now() + 60000)).created, true);
  const currentTokenRow = await tokenRow(currentToken);
  assert.equal((await store.verifyEmailToken(replaced.tokenHash, { expectedPasswordHash: old.passwordHash })).ok, false);
  assert.deepEqual(await tokenRow(currentToken), currentTokenRow);
  assert.deepEqual(await store.verifyEmailToken(currentToken, { expectedPasswordHash: originalHash }), { ok: true, userId: replaced.userId });
});

test('SEC-004 verification cannot alter active customers or staff, even with matching token and password hash', async () => {
  for (const options of [{ verified: true }, { role: 'admin' }, { role: 'manager' }]) {
    const f = await fixture(options);
    const before = await store.getUserAuthByEmail(f.email), beforeToken = await tokenRow(f.tokenHash);
    assert.equal(await store.getEmailVerificationChallenge(f.tokenHash), null);
    assert.equal((await store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: originalHash })).ok, false);
    assert.deepEqual(await store.getUserAuthByEmail(f.email), before);
    assert.deepEqual(await tokenRow(f.tokenHash), beforeToken);
  }
  for (const tokenHash of ['', null, undefined, 'missing-synthetic-token']) {
    assert.equal(await store.getEmailVerificationChallenge(tokenHash), null);
    assert.equal((await store.verifyEmailToken(tokenHash, { expectedPasswordHash: originalHash })).ok, false);
  }
});

test('SEC-004 token-consumption failure rolls account activation back atomically', async () => {
  const f = await fixture();
  await run("CREATE TRIGGER fix03_block_token_delete BEFORE DELETE ON email_verification_tokens BEGIN SELECT RAISE(ABORT,'FIX03_SYNTHETIC_TOKEN_DELETE_FAILURE'); END");
  try {
    await assert.rejects(() => store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: originalHash }), /FIX03_SYNTHETIC_TOKEN_DELETE_FAILURE/);
    const pending = await store.getUserAuthByEmail(f.email);
    assert.equal(pending.email_verification_required, 1);
    assert.equal(pending.email_verified_at, null);
    assert.ok(await tokenRow(f.tokenHash));
  } finally {
    await run('DROP TRIGGER fix03_block_token_delete');
  }
  assert.deepEqual(await store.verifyEmailToken(f.tokenHash, { expectedPasswordHash: originalHash }), { ok: true, userId: f.userId });
});
