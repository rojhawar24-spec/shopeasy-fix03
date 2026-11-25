import test from 'node:test';
import assert from 'node:assert/strict';
import { sendEmailVerificationEmail } from '../src/services/email.js';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM
};
const originalFetch = globalThis.fetch;

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
}

test('verification mail rejects HTTP URLs in production before making a network request', async () => {
  try {
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test_not_real';
    process.env.EMAIL_FROM = 'ShopEasy <verify@example.test>';
    let called = false;
    globalThis.fetch = async () => { called = true; return new Response('{}', {status: 200}); };
    await assert.rejects(
      sendEmailVerificationEmail({email:'customer@example.test',token:'x'.repeat(43),verifyUrl:'http://shop.example.test/verify-email?token='+'x'.repeat(43)}),
      /EMAIL_VERIFICATION_INVALID_LINK/
    );
    assert.equal(called, false);
  } finally { restoreEnvironment(); }
});

test('verification mail rejects localhost and credential-bearing links', async () => {
  try {
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test_not_real';
    process.env.EMAIL_FROM = 'ShopEasy <verify@example.test>';
    let calls = 0;
    globalThis.fetch = async () => { calls++; return new Response('{}', {status: 200}); };
    for (const verifyUrl of [
      'https://localhost:3000/verify-email?token='+'x'.repeat(43),
      'https://user:pass@shop.example.test/verify-email?token='+'x'.repeat(43),
      'https://shop.example.test/other?token='+'x'.repeat(43)
    ]) {
      await assert.rejects(
        sendEmailVerificationEmail({email:'customer@example.test',token:'x'.repeat(43),verifyUrl}),
        /EMAIL_VERIFICATION_INVALID_LINK/
      );
    }
    assert.equal(calls, 0);
  } finally { restoreEnvironment(); }
});

test('verification mail accepts a valid HTTPS public-origin link', async () => {
  try {
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test_not_real';
    process.env.EMAIL_FROM = 'ShopEasy <verify@example.test>';
    let requestBody = null;
    globalThis.fetch = async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({id:'test-message-id'}), {status: 200, headers:{'content-type':'application/json'}});
    };
    const result = await sendEmailVerificationEmail({email:'customer@example.test',token:'x'.repeat(43),verifyUrl:'https://shop.example.test/verify-email?token='+'x'.repeat(43)});
    assert.equal(result.sent, true);
    assert.match(requestBody.text, /https:\/\/shop\.example\.test\/verify-email\?/);
  } finally { restoreEnvironment(); }
});
