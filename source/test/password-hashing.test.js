import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../src/password-hashing.js';

test('new passwords use versioned PBKDF2-SHA256 hashes and can be verified', async () => {
  const password = `Safe-${crypto.randomBytes(24).toString('hex')}-Password`;
  const hash = await hashPassword(password);
  assert.match(hash, /^pbkdf2\$600000\$sha256\$/);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword(`${password}wrong`, hash), false);
});

test('password hashing rejects weak and oversized passwords', async () => {
  await assert.rejects(() => hashPassword('short'), /8–200 characters/);
  await assert.rejects(() => hashPassword('x'.repeat(201)), /8–200 characters/);
});

test('malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('some-long-password', 'not-a-hash'), false);
  assert.equal(await verifyPassword('some-long-password', 'pbkdf2$1$sha256$bad$bad'), false);
});
