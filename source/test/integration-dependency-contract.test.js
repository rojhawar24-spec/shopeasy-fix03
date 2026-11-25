import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('integration dependencies are declared, lockfile-pinned, and never silently skipped', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  for (const name of ['ejs', '@libsql/client', '@libsql/core']) {
    assert.ok(pkg.dependencies[name], `${name} must remain a direct runtime dependency`);
    const locked = lock.packages[`node_modules/${name}`];
    assert.ok(locked?.version && locked?.integrity && locked?.resolved, `${name} must be versioned and integrity-pinned in package-lock.json`);
    assert.equal(lock.packages[''][`dependencies`][name], pkg.dependencies[name], `${name} root lock dependency must match package.json`);
  }
  assert.equal(pkg.scripts.pretest, 'node scripts/check-test-dependencies.mjs');
  assert.match(pkg.scripts['test:integration'], /scripts\/check-test-dependencies\.mjs[\s\S]*manager-dashboard\.integration[\s\S]*product-variants\.integration[\s\S]*template-syntax[\s\S]*upload-quota\.integration/);
  const checker = fs.readFileSync(path.join(root, 'scripts/check-test-dependencies.mjs'), 'utf8');
  assert.match(checker, /No tests were skipped or marked as passed/);
  assert.match(checker, /npm ci/);

  // Validate that the preflight reports missing installs honestly in this runtime,
  // while also supporting the normal installed-dependencies case on developer PCs.
  const require = createRequire(import.meta.url);
  const missing = Object.keys(pkg.dependencies).filter(name => { try { require.resolve(name==='@libsql/core'?'@libsql/core/config':name); return false; } catch { return true; } });
  const result = spawnSync(process.execPath, ['scripts/check-test-dependencies.mjs'], { cwd: root, encoding: 'utf8' });
  if (missing.length) {
    assert.notEqual(result.status, 0, 'preflight must fail if a declared dependency is missing');
    assert.match(`${result.stdout}\n${result.stderr}`, /Test preflight failed/);
    for (const name of missing) assert.ok(`${result.stdout}\n${result.stderr}`.includes(name), `missing dependency ${name} should be reported`);
  } else {
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Test dependency preflight passed/);
  }
});
