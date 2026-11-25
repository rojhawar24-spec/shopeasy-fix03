import test from 'node:test';
import assert from 'node:assert/strict';
import { createMfaQr } from '../src/mfa-qr.js';

test('production MFA QR helper returns SVG with white background and QR modules', () => {
  const uri = 'otpauth://totp/ShopEasy:manager%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=ShopEasy&algorithm=SHA1&digits=6&period=30';
  const qr = createMfaQr(uri);
  assert.match(qr.svg, /^<svg\b/i);
  assert.match(qr.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/i);
  assert.match(qr.svg, /fill="#ffffff"/i);
  assert.match(qr.svg, /(?:<path\b|<rect\b)/i);
  assert.doesNotMatch(qr.svg, /<script\b/i);
  assert.ok(qr.moduleCount > 0);
  assert.equal(qr.errorCorrectionLevel, 'M');
  assert.equal(qr.quietZoneModules, 4);
  assert.equal(typeof qr.isDark, 'function');
});
