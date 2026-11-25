import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Cloudflare authentication deployment guard blocks incompatible PBKDF2 runtime', () => {
  const result = spawnSync(process.execPath, ['scripts/preflight-cloudflare-auth.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /rejects PBKDF2 iteration counts above 100,000/i);
  assert.match(result.stderr, /Do not lower the password-hash work factor/i);
});

test('Cloudflare deploy and dry-run commands run the guard before Wrangler', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const name of ['dev:cloudflare', 'dev:cloudflare:staging', 'deploy:cloudflare', 'deploy:cloudflare:staging', 'dry-run:cloudflare', 'dry-run:cloudflare:staging']) {
    assert.match(pkg.scripts[name], /preflight:cloudflare-auth/);
    assert.ok(pkg.scripts[name].indexOf('preflight:cloudflare-auth') < pkg.scripts[name].indexOf('wrangler'));
  }
});

test('Docker deployment explicitly opts into the documented single-instance limiter', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /RATE_LIMIT_BACKEND=memory-single-instance/);
});
