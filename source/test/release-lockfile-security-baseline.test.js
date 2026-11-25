import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

function locked(name) {
  const entry = lock.packages?.[`node_modules/${name}`];
  assert.ok(entry, `${name} must have a top-level lock entry`);
  assert.match(entry.resolved || '', /^https:\/\/registry\.npmjs\.org\//, `${name} must resolve from the official npm registry`);
  assert.match(entry.integrity || '', /^sha512-[A-Za-z0-9+/]+={0,2}$/, `${name} must have a SHA-512 integrity value`);
  return entry;
}

test('package and lockfile metadata match this ShopEasy release', () => {
  assert.equal(pkg.version, '2.8.95');
  assert.equal(lock.version, pkg.version);
  assert.ok(lock.lockfileVersion >= 3);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.equal(pkg.engines?.node, '>=24.22.2 <25');
});

test('security-sensitive parser, query-string and upload dependencies meet the current release baseline', () => {
  assert.equal(locked('body-parser').version, '2.4.0');
  assert.equal(locked('qs').version, '6.17.1');
  assert.equal(locked('multer').version, '2.5.0');
  assert.equal(locked('express').version, '5.3.0');
  assert.equal(locked('helmet').version, '8.3.0');
  assert.ok(locked('body-parser').dependencies.qs.includes('6.16.1'));
});

test('the lockfile contains no stale vulnerable top-level parser/query-string versions', () => {
  assert.notEqual(locked('body-parser').version, '2.3.0');
  assert.notEqual(locked('qs').version, '6.16.0');
});
