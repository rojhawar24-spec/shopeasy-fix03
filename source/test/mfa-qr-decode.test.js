import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { createMfaQr } from '../src/mfa-qr.js';
import { buildTotpUri } from '../src/mfa.js';

test('production MFA QR decodes to the exact expected otpauth URI', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const email = 'manager@example.test';
  const expectedUri = 'otpauth://totp/ShopEasy:manager%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=ShopEasy&algorithm=SHA1&digits=6&period=30';
  assert.equal(buildTotpUri(secret, email, 'ShopEasy'), expectedUri, 'provisioning URI must match the expected TOTP format');

  // Same helper used by src/server.js for the live setup page.
  const qr = createMfaQr(expectedUri);
  assert.match(qr.svg, /^<svg\b/i);
  assert.match(qr.svg, /fill="#ffffff"/i, 'SVG must contain an explicit white background');
  assert.ok(qr.svg.indexOf('fill="#ffffff"') < qr.svg.search(/<(?:path|polygon)\b/i), 'white background must be painted before dark QR modules');
  assert.ok(qr.moduleCount > 0, 'QR must contain a non-empty module matrix');
  assert.equal(qr.errorCorrectionLevel, 'M', 'QR must use medium error correction');
  assert.equal(qr.quietZoneModules, 4, 'QR must reserve at least four quiet-zone modules');

  // Rasterize the matrix from the production helper with a four-module quiet zone.
  const quietZone = 4;
  const pixelsPerModule = 8;
  const dimension = (qr.moduleCount + quietZone * 2) * pixelsPerModule;
  const data = new Uint8ClampedArray(dimension * dimension * 4);
  for (let y = 0; y < dimension; y += 1) {
    for (let x = 0; x < dimension; x += 1) {
      const moduleX = Math.floor(x / pixelsPerModule) - quietZone;
      const moduleY = Math.floor(y / pixelsPerModule) - quietZone;
      const inModules = moduleX >= 0 && moduleY >= 0 && moduleX < qr.moduleCount && moduleY < qr.moduleCount;
      const dark = inModules && qr.isDark(moduleY, moduleX);
      const offset = (y * dimension + x) * 4;
      const color = dark ? 0 : 255;
      data[offset] = color;
      data[offset + 1] = color;
      data[offset + 2] = color;
      data[offset + 3] = 255;
    }
  }
  const decoded = jsQR(data, dimension, dimension);
  assert.ok(decoded, 'independent QR decoder must recognize the production QR matrix');
  assert.equal(decoded.data, expectedUri, 'decoded payload must exactly match the expected provisioning URI');
});
