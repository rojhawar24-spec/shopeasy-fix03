import test from 'node:test';
import assert from 'node:assert/strict';
import { isStrongEnoughPassword } from '../src/security.js';
import { hashPassword, verifyPassword } from '../src/password-hashing.js';
import { pageText } from '../src/home-login-copy.js';
import { customerText } from '../src/customer-page-copy.js';

test('new-password policy enforces length without requiring composition tricks',()=>{
  assert.equal(isStrongEnoughPassword('fourteen-word!'),false);
  assert.equal(isStrongEnoughPassword('quiet orchard walks'),true);
  assert.equal(isStrongEnoughPassword('سەوزایی باخچەی ئارام'),true);
  assert.equal(isStrongEnoughPassword('😀'.repeat(8)),false,'UTF-16 pairs must not count as two characters');
  assert.equal(isStrongEnoughPassword('😀🌻🌲🌤️ quiet trail'),true);
  assert.equal(isStrongEnoughPassword('a'.repeat(199)+'Z'),true);
  assert.equal(isStrongEnoughPassword('a'.repeat(200)+'Z'),false);
  assert.equal(isStrongEnoughPassword(null),false);
});

test('new-password policy rejects known examples, repetitions and whitespace padding',()=>{
  for(const candidate of ['passwordpassword',' PasswordPassword ', 'password       ', ' short-password ', 'correct horse battery staple','aaaaaaaaaaaaaaa','abcdabcdabcdabcd','a '.repeat(12),' '.repeat(20),'123456789012345']) {
    assert.equal(isStrongEnoughPassword(candidate),false);
  }
  assert.equal(isStrongEnoughPassword('Quiet orchard trail 2026'),true);
});

test('existing shorter password hashes still verify after policy update',async()=>{
  const legacyPassword='prior-pass-7';
  assert.equal(isStrongEnoughPassword(legacyPassword),false);
  const stored=await hashPassword(legacyPassword);
  assert.equal(await verifyPassword(legacyPassword,stored),true);
  assert.equal(await verifyPassword('different-pass',stored),false);
});

test('new security-flow copy renders in every supported server-side locale',()=>{
  const keys=[
    'Use 15–200 characters. Avoid common or repeated passwords.',
    'Use a password with 15–200 characters that is not common or repeated.',
    'Check your current password and use a new password with 15–200 characters that is not common or repeated.',
    'Guest order access code (if saved)',
    'Order details require proof of access as well as matching order and email details.'
  ];
  for(const locale of ['ckb','ar','nl','fr']) for(const key of keys) {
    assert.notEqual(pageText(locale,key),key,`${locale} security page text`);
    assert.equal(customerText(locale,key),pageText(locale,key),`${locale} shared customer fallback`);
  }
});
