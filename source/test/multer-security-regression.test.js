import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

test('Multer upload filter stays synchronous (workaround for CVE-2026-113872 after upgrade)', () => {
  const match = server.match(/fileFilter\s*:\s*\(req\s*,\s*file\s*,\s*cb\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*\n\s*\}\s*\);/);
  assert.ok(match, 'expected the upload filter to be defined inline');
  assert.doesNotMatch(match[1], /\basync\b|\bawait\b/);
  assert.match(match[1], /return\s+cb\(new Error\('INVALID_IMAGE_TYPE'\)\)/);
  assert.match(match[1], /return\s+cb\(null\s*,\s*true\)/);
});

test('Multer dependency metadata stays consistent between package.json and lockfile', () => {
  assert.equal(packageJson.dependencies.multer, lock.packages[''].dependencies.multer);
  assert.equal(lock.packages['node_modules/multer'].version, packageJson.dependencies.multer);
});
