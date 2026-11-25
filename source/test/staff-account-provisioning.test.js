import test from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staffScript = fs.readFileSync(path.join(root, 'scripts/create-staff.mjs'), 'utf8');
const authSource = fs.readFileSync(path.join(root, 'src/auth.js'), 'utf8');
const passwordSource = fs.readFileSync(path.join(root, 'src/password-hashing.js'), 'utf8');
const { hashPassword } = await import('../src/password-hashing.js');

test('staff account CLI imports password hashing from the module that actually exports it', async () => {
  assert.match(passwordSource, /export\s+async\s+function\s+hashPassword\s*\(/);
  assert.doesNotMatch(authSource, /export\s+(?:async\s+)?function\s+hashPassword\s*\(/);
  assert.match(staffScript, /import\s*\{\s*hashPassword\s*\}\s*from\s*['"]\.\.\/src\/password-hashing\.js['"]/);
  assert.doesNotMatch(staffScript, /hashPassword\s*\}\s*=\s*await import\(['"]\.\.\/src\/auth\.js['"]\)/);
  const encoded = await hashPassword('Strong-Manager-Test-2026');
  assert.match(encoded, /^pbkdf2\$600000\$sha256\$/);
});

test('staff provisioning requires an explicit database target and uses a hidden terminal password', () => {
  assert.match(staffScript, /TURSO_DATABASE_URL/);
  assert.match(staffScript, /TURSO_AUTH_TOKEN/);
  assert.match(staffScript, /options\.includes\('--local'\)/);
  assert.match(staffScript, /localDatabasePath = path\.join\(root, 'data', 'shop\.db'\)/);
  assert.match(staffScript, /delete process\.env\.TURSO_DATABASE_URL/);
  assert.match(staffScript, /delete process\.env\.SHOP_DATABASE_URL/);
  assert.match(staffScript, /process\.env\.DATABASE_URL = pathToFileURL\(localDatabasePath\)\.href/,
    'local mode must pin the primary database setting to the checked local SQLite file');
  assert.match(staffScript, /delete process\.env\.DATABASE_URL/,
    'explicit remote mode must remove a conflicting primary DATABASE_URL');
  assert.match(staffScript, /No local database fallback is allowed unless --local is explicitly supplied/);
  assert.match(staffScript, /role !== 'manager'/);
  assert.match(staffScript, /restricted Admin accounts must be created from the Manager screen/);
  assert.match(staffScript, /role='manager' LIMIT 1/);
  assert.match(staffScript, /stdin\.setRawMode\(true\)/);
  assert.match(staffScript, /Passwords do not match/);
  assert.match(staffScript, /getUserAuthByEmail\(email\)/);
  assert.match(staffScript, /Target database \(credentials omitted\)/);
  assert.match(staffScript, /targetConfirmation !== targetLabel/);
  assert.match(staffScript, /roleConfirmation !== role\.toUpperCase\(\)/);
  assert.ok(staffScript.indexOf("await import('../src/db.js')") > staffScript.indexOf('if (password !== confirm)'), 'DB schema initialization must not run until target, role and passwords have been confirmed');
  assert.ok(staffScript.indexOf("await import('../src/database.js')") > staffScript.indexOf('if (password !== confirm)'), 'database client must not be loaded until all interactive input is valid');
  assert.match(staffScript, /process\.env\.SHOP_DATABASE_URL = databaseUrl/);
  assert.match(staffScript, /process\.env\.TURSO_AUTH_TOKEN = authToken/);
});


test('staff CLI rejects bad target/role and non-interactive password entry before importing database modules', () => {
  const baseEnv = {
    ...process.env,
    TURSO_DATABASE_URL: 'libsql://example.turso.io',
    TURSO_AUTH_TOKEN: 'test-only-not-a-real-token',
    NODE_ENV: 'test'
  };
  const runCli = input => spawnSync(process.execPath, [path.join(root, 'scripts/create-staff.mjs'), 'manager'], {
    cwd: root,
    env: baseEnv,
    input,
    encoding: 'utf8',
    timeout: 5000
  });

  const badTarget = runCli('wrong-target\n');
  assert.equal(badTarget.status, 1);
  assert.match(badTarget.stderr, /Database target confirmation did not match/);
  assert.doesNotMatch(`${badTarget.stdout}\n${badTarget.stderr}`, /ERR_MODULE_NOT_FOUND|Cannot find package/);

  const badRole = runCli('libsql://example.turso.io\nADMIN\n');
  assert.equal(badRole.status, 1);
  assert.match(badRole.stderr, /Role confirmation did not match/);
  assert.doesNotMatch(`${badRole.stdout}\n${badRole.stderr}`, /ERR_MODULE_NOT_FOUND|Cannot find package/);

  const noTerminal = runCli('libsql://example.turso.io\nMANAGER\nTest Manager\ntest-manager@example.test\n');
  assert.equal(noTerminal.status, 1);
  assert.match(noTerminal.stderr, /real interactive terminal is required/);
  assert.doesNotMatch(`${noTerminal.stdout}\n${noTerminal.stderr}`, /ERR_MODULE_NOT_FOUND|Cannot find package/);
});


test('explicit local provisioning refuses a missing database and never silently falls through to configured Turso credentials', () => {
  const baseEnv = {
    ...process.env,
    TURSO_DATABASE_URL: 'libsql://example.turso.io',
    TURSO_AUTH_TOKEN: 'test-only-not-a-real-token',
    SHOP_DATABASE_URL: 'libsql://other.example.turso.io',
    NODE_ENV: 'test'
  };
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/create-staff.mjs'), 'manager', '--local'], {
    cwd: root,
    env: baseEnv,
    input: 'deliberately-wrong-target\n',
    encoding: 'utf8',
    timeout: 5000
  });
  const localDb = path.join(root, 'data', 'shop.db');
  if (fs.existsSync(localDb) && fs.statSync(localDb).size > 0) {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Database target confirmation did not match/);
  } else {
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Local database file not found/);
  }
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /ERR_MODULE_NOT_FOUND|Cannot find package/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Staff account created/);
});
