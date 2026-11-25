import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const checkout = fs.readFileSync(new URL('../views/checkout.ejs', import.meta.url), 'utf8');

test('generic render defaults define checkout recovery URL for launch-gate errors', () => {
  assert.match(server, /const defaults=\{[^}]*checkoutRecoveryUrl:null/);
});

test('checkout template safely omits recovery link when no recovery URL was supplied', () => {
  assert.match(checkout, /typeof checkoutRecoveryUrl !== 'undefined' && checkoutRecoveryUrl/);
});
