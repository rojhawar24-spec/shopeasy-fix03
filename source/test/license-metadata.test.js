import test from 'node:test';
import assert from 'node:assert/strict';
import { getLicenseInfo } from '../src/license.js';

test('license metadata: missing values do not create a valid status', () => {
  const info = getLicenseInfo({});
  assert.equal(info.configured, false);
  assert.equal(info.status, 'incomplete');
  assert.ok(info.missing.includes('LICENSE_KEY'));
});

test('license metadata: complete format is marked configured but explicitly unverified', () => {
  const info = getLicenseInfo({
    LICENSOR_NAME: 'Example Licensor', LICENSED_TO: 'Example Customer', LICENSE_EMAIL: 'license@example.invalid',
    LICENSE_KEY: 'Abcdefghijklmnopqrstuvwx12345678', LICENSE_DATE: '2026-10-16', LICENSE_TYPE: 'single-storefront'
  });
  assert.equal(info.configured, true);
  assert.equal(info.status, 'metadata-configured-unverified');
  assert.match(info.note, /does not prove ownership/i);
  assert.equal(Object.hasOwn(info, 'key'), false);
});

test('license metadata: malformed key/date/type are rejected without throwing', () => {
  const info = getLicenseInfo({ LICENSOR_NAME:'X', LICENSED_TO:'Y', LICENSE_EMAIL:'x@y.invalid', LICENSE_KEY:'short', LICENSE_DATE:'not-a-date', LICENSE_TYPE:'multi-store' });
  assert.equal(info.configured, false);
  assert.equal(info.keyFormatValid, false);
  assert.equal(info.dateFormatValid, false);
  assert.equal(info.licenseType, 'unknown');
});
