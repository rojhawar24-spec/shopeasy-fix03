import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildTotpUri,
  decryptTotpSecret,
  encryptTotpSecret,
  findRecoveryCodeHashIndex,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCodes,
  parseRecoveryCodeHashes,
  totpAtStep,
  totpAtTime,
  verifyTotpCode
} from '../src/mfa.js';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('TOTP complies with the RFC 6238 SHA-1 six-digit vector and rejects expired/replayed codes', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totpAtTime(secret, 59_000), '287082');
  assert.equal(verifyTotpCode(secret, '287082', 59_000), 1);
  assert.equal(verifyTotpCode(secret, '287082', 150_000), null, 'a code outside the ±1-step window is expired');
  assert.equal(verifyTotpCode(secret, '287082', 59_000, 1), null, 'the same time step cannot be reused');
  assert.equal(verifyTotpCode(secret, 'not-six-digits', 59_000), null);
  assert.match(totpAtStep(secret, 1), /^\d{6}$/);
});

test('TOTP seeds are encrypted with AES-256-GCM and fail closed without a dedicated 32-byte key', () => {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  try {
    delete process.env.MFA_ENCRYPTION_KEY;
    assert.throws(() => encryptTotpSecret(generateTotpSecret()), { code: 'MFA_ENCRYPTION_KEY_NOT_CONFIGURED' });
    process.env.MFA_ENCRYPTION_KEY = 'ab'.repeat(32);
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    assert.notEqual(encrypted, secret);
    assert.equal(decryptTotpSecret(encrypted), secret);

    // Tamper with an authenticated byte (the GCM tag), not a random Base64URL
    // tail character whose unused bits can decode to the original bytes.
    const tamperedTag = encrypted.split('.');
    tamperedTag[2] = `${tamperedTag[2][0] === 'A' ? 'B' : 'A'}${tamperedTag[2].slice(1)}`;
    assert.throws(() => decryptTotpSecret(tamperedTag.join('.')), /MFA_SECRET_DECRYPTION_FAILED/);

    // Reject alternate, non-canonical encodings even when Base64URL would
    // otherwise decode their unused trailing bits to the same ciphertext.
    const nonCanonical = encrypted.split('.');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const finalIndex = alphabet.indexOf(nonCanonical[3].at(-1));
    assert.notEqual(finalIndex, -1);
    const alternateIndex = (finalIndex & 0b111100) | ((finalIndex + 1) & 0b11);
    nonCanonical[3] = `${nonCanonical[3].slice(0, -1)}${alphabet[alternateIndex]}`;
    assert.notEqual(nonCanonical[3], encrypted.split('.')[3]);
    assert.throws(() => decryptTotpSecret(nonCanonical.join('.')), /MFA_SECRET_DECRYPTION_FAILED/);
  } finally {
    if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previous;
  }
});

test('each Manager receives eight high-entropy recovery codes stored only as SHA-256 hashes and usable once', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){5}$/.test(code)));
  const hashes = parseRecoveryCodeHashes(hashRecoveryCodes(codes));
  assert.equal(hashes.length, 8);
  assert.ok(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)));
  assert.equal(findRecoveryCodeHashIndex(codes[2], hashes), 2);
  const afterUse = hashes.filter((_, index) => index !== 2);
  assert.equal(findRecoveryCodeHashIndex(codes[2], afterUse), -1, 'a removed hash means the recovery code cannot be reused');
  assert.equal(findRecoveryCodeHashIndex('not-a-recovery-code', hashes), -1);
  assert.notEqual(hashes[2], codes[2]);
});

test('TOTP enrollment URI contains issuer, account, algorithm, digits and period', () => {
  const uri = buildTotpUri('JBSWY3DPEHPK3PXP', 'manager@example.test', 'ShopEasy');
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=ShopEasy/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

test('MFA invalid codes return HTTP 400 and QR dependency is integrity-pinned', () => {
  const server = read('src/server.js');
  const qrHelper = read('src/mfa-qr.js');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const qrPackage = lock.packages['node_modules/qrcode-generator'];

  assert.match(
    server,
    /if\s*\(!valid\)\s*\{\s*res\.status\(400\);\s*return renderMfaVerify\(/,
    'invalid, expired and replayed MFA codes must not render as HTTP 200'
  );
  assert.match(server, /import\s*\{\s*createMfaQr\s*\}\s*from\s*'\.\/mfa-qr\.js'/,
    'the Manager route must use the shared QR helper tested by the QR decoder suite');
  assert.match(qrHelper, /import\s*\{\s*qrcode\s+as\s+QRCodeGenerator\s*\}\s*from\s*'qrcode-generator'/,
    'qrcode-generator 2.x exposes a named ESM export, not a default export');
  assert.equal(pkg.dependencies['qrcode-generator'], '2.0.4');
  assert.equal(lock.packages[''].dependencies['qrcode-generator'], '2.0.4');
  assert.equal(qrPackage.version, '2.0.4');
  assert.equal(qrPackage.resolved, 'https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz');
  assert.match(qrPackage.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(lock.packages['node_modules/qr'], undefined, 'the old QR package without integrity must not remain locked');
});

test('Manager MFA challenge explains first-time QR setup and provides a CSRF-protected cancel path', () => {
  const server = read('src/server.js');
  const setup = read('views/mfa-setup.ejs');
  const verify = read('views/mfa-verify.ejs');
  const login = read('views/login.ejs');

  assert.match(server, /challenge && !\[.*'\/mfa\/cancel'.*'\/logout'.*\]\.includes\(req\.path\)/,
    'a challenge must allow its explicit cancellation route instead of redirecting it to setup');
  assert.match(server, /app\.post\('\/mfa\/cancel',verifyCsrf,async\(req,res\)=>/,
    'cancelling an MFA challenge must be a CSRF-protected POST');
  assert.match(server, /res\.redirect\(303,'\/login\?mfa=cancelled'\)/,
    'cancellation must return the user to the sign-in page');
  assert.match(setup, /first sign-in for this Manager account/i,
    'the QR page must explain why sign-in reached setup');
  assert.match(setup, /<form[^>]+action="\/mfa\/cancel"/);
  assert.match(setup, /name="_csrf"/);
  assert.match(setup, /Cancel sign-in and return to login/);
  assert.match(verify, /<form[^>]+action="\/mfa\/cancel"/);
  assert.match(login, /signInCancelled/);
  assert.match(server, /req\.query\.mfa==='expired'\?'Your five-minute sign-in security challenge expired/);
  assert.match(server, /if\(!challenge\) return res\.redirect\(303,'\/login\?mfa=expired'\)/);
});

test('Manager MFA routes, CSRF guards, session revocation and idempotent SQLite migration are wired', () => {
  const server = read('src/server.js');
  const auth = read('src/auth.js');
  const db = read('src/db.js');
  for (const route of ["app.get('/mfa/setup'", "app.post('/mfa/setup'", "app.get('/mfa/verify'", "app.post('/mfa/verify'", "app.get('/mfa/disable'", "app.post('/mfa/disable'"]) {
    assert.ok(server.includes(route), `missing route ${route}`);
  }
  assert.match(server, /app\.post\('\/mfa\/setup',verifyCsrf,/);
  assert.match(server, /app\.post\('\/mfa\/verify',verifyCsrf,/);
  assert.match(server, /app\.post\('\/mfa\/disable',verifyCsrf,/);
  assert.match(server, /MFA_MAX_ATTEMPTS = 5/);
  assert.match(server, /MFA_RATE_WINDOW_MS = 15 \* 60 \* 1000/);
  assert.match(auth, /Number\(req\.user\.mfa_enabled\)\s*!==\s*1/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS mfa_login_challenges/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS mfa_rate_limits/);
  for (const column of ['mfa_secret', 'mfa_enabled', 'mfa_recovery_codes_hash', 'mfa_last_totp_step']) {
    assert.match(db, new RegExp(`ensureColumn\\('users','${column}'`));
  }
  assert.match(db, /DELETE FROM sessions WHERE user_id=\?['"]?\s*,\s*\[userId\]/);
  assert.match(db, /DELETE FROM sessions WHERE id IN \(SELECT session_id FROM mfa_login_challenges WHERE user_id=\?\)/, 'activation/disable must revoke pending MFA challenge sessions too');
  const disableStart = db.indexOf('export async function disableManagerMfa');
  const disableEnd = db.indexOf('export async function consumeMfaAttempt', disableStart);
  const disableFunction = db.slice(disableStart, disableEnd);
  assert.match(disableFunction, /DELETE FROM sessions WHERE id IN \(SELECT session_id FROM mfa_login_challenges WHERE user_id=\?\)/, 'disable must revoke challenge sessions before deleting their challenge rows');
  const activationStart = db.indexOf('export async function activateManagerMfa');
  const activationEnd = db.indexOf('export async function updateManagerTotpStep', activationStart);
  assert.ok(activationStart >= 0 && activationEnd > activationStart);
  assert.ok(disableStart >= 0 && disableEnd > disableStart);
  for(const [name,source] of [['activation',db.slice(activationStart,activationEnd)],['disable',disableFunction]]){
    const pendingDeletion = /DELETE FROM sessions WHERE id IN \(SELECT session_id FROM mfa_login_challenges WHERE user_id=\?\)/g;
    assert.equal([...source.matchAll(pendingDeletion)].length,1,`${name} must revoke pending challenge sessions exactly once`);
    assert.ok(source.indexOf('DELETE FROM sessions WHERE id IN') < source.indexOf('DELETE FROM mfa_login_challenges WHERE user_id=?'),`${name} must revoke pending sessions before their challenge references are deleted`);
    assert.match(source,/db\.transaction\('write'\)/,`${name} must keep revocations in its write transaction`);
  }
  assert.match(db, /export async function setSessionExpiresAt/);
  assert.match(server, /setSessionExpiresAt\(sid,expiresAt\)/);
});
