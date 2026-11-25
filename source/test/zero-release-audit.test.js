import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (['node_modules','data','.git','.cloudflare-build','.wrangler'].includes(entry.name)) continue; walk(full, out); }
    else out.push(full);
  }
  return out;
}

test('zero audit: production source contains no development/debug primitives', () => {
  const files = [
    ...walk(path.join(root, 'src')),
    ...walk(path.join(root, 'public')),
  ].filter((file) => /\.(?:js|mjs|cjs)$/.test(file));

  const banned = [
    /\bdebugger\b/,
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\binnerHTML\s*=/,
  ];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const relative = path.relative(root, file);
    for (const pattern of banned) {
      assert.doesNotMatch(text, pattern, `${relative} contains ${pattern}`);
    }
    if (relative === path.join('src', 'server.js')) {
      assert.doesNotMatch(text, /\bconsole\.log\s*\(/, 'server.js must not contain console.log');
    }
  }
});

test('zero audit: search-result DOM construction has no duplicate append operation', () => {
  const app = read('public/js/app.js');
  assert.equal((app.match(/link\.append\(image, copy\);/g) || []).length, 1);
  assert.doesNotMatch(app, /link\.append\(image, copy\);\s*link\.append\(image, copy\);/);
});

test('zero audit: release version metadata is aligned and stale release refs are absent', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, '2.8.95');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(fs.existsSync(path.join(root, '.env.example')), true, '.env.example must be shipped as the safe configuration template');

  const expectedFiles = [
    'README.md', 'AUDIT-REPORT.md', 'PRE-SALE-RISK-AUDIT-2026-10-18.md', 'QA-REPORT-2.8.95.md', 'RELEASE-MANIFEST-2.8.95.txt',
    'VERIFICATION-SUMMARY-2.8.95.txt', 'DATABASE-BACKUP-RESTORE.md', 'RELEASE-VERIFICATION.md', 'PREVIEW.html', 'LICENSE.txt', 'CHANGELOG.md',
    'API-REFERENCE.md', 'QUICK-START-AND-ENV.md', 'THIRD-PARTY-NOTICES.md', 'ASSET-PROVENANCE-REGISTER.md', 'RIGHTS-CLEARANCE-REGISTER.md', 'MANAGER-GUIDE.md', 'SECURITY.md', 'ShopEasy-PRE-SALE-AUDIT-AND-REMEDIATION-PLAN-2026-10-19.md',
    'CLOUDFLARE-DEPLOYMENT.md', 'STAFF-ACCOUNTS.md', 'RIGHTS-CLEARANCE-REGISTER.md', 'THIRD-PARTY-NOTICES.md', 'ASSET-PROVENANCE-REGISTER.md', '.env.example', 'package-lock.json', 'vercel.json', 'scripts/reject-vercel-deploy.mjs',
  ];
  for (const relative of expectedFiles) {
    assert.ok(fs.existsSync(path.join(root, relative)), `${relative} is missing`);
  }

  assert.match(read('vercel.json'), /reject-vercel-deploy/, 'Vercel must fail at build time with an explicit supported-host explanation');
  assert.equal(fs.existsSync(path.join(root, 'api')), false, 'unsupported Vercel API adapter directory must be removed');

  for (const obsolete of ['IRAQ-BEAUTY-STORE-SETUP.md', 'IRAQ-BEAUTY-QA-REPORT.md', 'FINAL-QA-REPORT-2.8.45.md', 'HARD-REPAIR-REPORT-2026-10-16.md', 'QA-REPORT-2.8.46.md']) {
    assert.equal(fs.existsSync(path.join(root, obsolete)), false, `${obsolete} should not ship in the generic starter`);
  }

  for (const name of fs.readdirSync(root)) {
    assert.doesNotMatch(name, /^QA-REPORT-2\.8\.(?!95\.md$)\d+\.md$/, `stale QA snapshot should not ship: ${name}`);
    assert.doesNotMatch(name, /^RELEASE-MANIFEST-2\.8\.(?!95\.txt$)\d+\.txt$/, `stale release manifest should not ship: ${name}`);
    assert.doesNotMatch(name, /^VERIFICATION-SUMMARY-2\.8\.(?!95\.txt$)\d+\.txt$/, `stale verification summary should not ship: ${name}`);
  }

  for (const file of walk(root)) {
    const relative = path.relative(root, file);
    if (relative.startsWith(`node_modules${path.sep}`) || relative.startsWith(`data${path.sep}`)) continue;
    if (!/\.(?:md|txt|html|json|mjs|js|ejs|css|yml|yaml|ps1|txt|cjs)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /2\.8\.(?:28|29|30)\b/, `${relative} contains stale 2.8.x release reference`);
  }
});

test('zero audit: release package policy is checked without confusing installed dependencies with shipped state', () => {
  // A normal npm test run happens after `npm ci`, so node_modules is expected in
  // the working tree. Release hygiene is validated by preflight and, when the
  // exact archive is supplied, by inspecting that archive directly.
  const archive = process.env.SHOPEASY_RELEASE_ARCHIVE;
  if (!archive) {
    const gitignore = read('.gitignore');
    if (fs.existsSync(path.join(root, '.env'))) assert.match(gitignore, /^\.env$/m, 'local .env must be ignored');
    if (fs.existsSync(path.join(root, 'data'))) assert.match(gitignore, /^data\/$/m, 'local data directory must be ignored');
    return;
  }
  assert.equal(fs.existsSync(archive), true, `release archive not found: ${archive}`);
  const listing = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
  const shippedPaths = new Set(listing.split(/\r?\n/).filter(Boolean));
  assert.ok(shippedPaths.has('.env.example'), '.env.example safe configuration template must be present in the release archive');
  assert.ok(shippedPaths.has('QUICK-START-AND-ENV.md'), 'release must ship the setup instructions that refer to .env.example');
  for (const forbidden of ['node_modules/', 'data/shop.db', '.env', '.cloudflare-build/', '.wrangler/']) {
    const escaped = forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactPath = forbidden.endsWith('/') ? new RegExp(`(?:^|/)${escaped}`) : new RegExp(`(?:^|/)${escaped}$`);
    assert.doesNotMatch(listing, exactPath, `${forbidden} must not ship`);
  }
  const releaseDocs = listing.split(/\r?\n/).filter(Boolean);
  for (const pathName of releaseDocs.filter(name => /(?:^|\/)QA-REPORT-2\.8\.\d+\.md$/.test(name))) {
    assert.ok(pathName === 'QA-REPORT-2.8.95.md' || (pathName.startsWith('docs/qa/r26-release-metadata/') || pathName.startsWith('docs/qa/r27-release-metadata/')), `old QA report must be moved to history: ${pathName}`);
  }
  for (const pathName of releaseDocs.filter(name => /(?:^|\/)RELEASE-MANIFEST-2\.8\.\d+\.txt$/.test(name))) {
    assert.ok(pathName === 'RELEASE-MANIFEST-2.8.95.txt' || (pathName.startsWith('docs/qa/r26-release-metadata/') || pathName.startsWith('docs/qa/r27-release-metadata/')), `old release manifest must be moved to history: ${pathName}`);
  }
  for (const pathName of releaseDocs.filter(name => /(?:^|\/)VERIFICATION-SUMMARY-2\.8\.\d+\.txt$/.test(name))) {
    assert.ok(pathName === 'VERIFICATION-SUMMARY-2.8.95.txt' || (pathName.startsWith('docs/qa/r26-release-metadata/') || pathName.startsWith('docs/qa/r27-release-metadata/')), `old verification summary must be moved to history: ${pathName}`);
  }
});


test('Oracle deployment validates the local persistent database mode and rejects remote aliases', async () => {
  const { validateDeployment } = await import('../scripts/validate-deployment.mjs');
  const source = read('.env.example');
  assert.match(source, /^DATABASE_URL=file:\.\/data\/shop\.db$/m);
  const configured = source.replace(/^NODE_ENV=.*$/m, 'NODE_ENV=production')
    .replace(/^BASE_URL=.*$/m, 'BASE_URL=https://shop.example.com')
    .replace(/^TRUST_PROXY=.*$/m, 'TRUST_PROXY=1')
    .replace(/^MFA_ENCRYPTION_KEY=.*$/m, `MFA_ENCRYPTION_KEY=${'a'.repeat(64)}`);
  const caddy = 'shop.example.com {\n reverse_proxy 127.0.0.1:3000\n}\n';
  assert.deepEqual(validateDeployment(configured, caddy), { baseUrl: 'https://shop.example.com' });
  for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SHOP_DATABASE_URL']) {
    // Replace a documented empty value, or add the key if it is platform-only.
    const keyLine = new RegExp(`^${key}=.*$`, 'm');
    const incompatible = keyLine.test(configured) ? configured.replace(keyLine, `${key}=fixture-remote-value`) : configured + `${key}=fixture-remote-value\n`;
    assert.throws(() => validateDeployment(incompatible, caddy), /remote aliases/i, key);
  }
  assert.throws(() => validateDeployment(configured.replace('DATABASE_URL=file:./data/shop.db', 'DATABASE_URL=file:./data/other.db'), caddy), /DATABASE_URL/);
});

// This intentionally stops at the runtime precondition with fake host commands.
// It proves the real shell workflow does not create locks/releases or read .env
// when its Node runtime fails; it performs no real deployment or service action.
test('Oracle deployment refuses an unsupported Node runtime before installation mutations', { skip: process.platform === 'win32' }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-deploy-precondition-'));
  try {
    const app = path.join(temporary, 'app'), bin = path.join(temporary, 'bin');
    fs.mkdirSync(app); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(app, '.env'), 'private sentinel must remain unread and unchanged');
    const archive = path.join(temporary, 'candidate.zip'); fs.writeFileSync(archive, 'not reached');
    for (const name of ['id', 'node', 'npm', 'systemctl', 'curl', 'caddy', 'flock', 'runuser', 'sha256sum', 'stat']) {
      const body = ['id', 'stat'].includes(name) ? 'printf "0\\n"\n' : name === 'node' ? 'exit 7\n' : 'exit 99\n';
      fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n' + body, { mode: 0o755 });
    }
    const before = fs.readdirSync(app);
    const result = spawnSync('bash', [path.join(root, 'deploy.sh'), archive, '0'.repeat(64)], {
      env: { PATH: bin + path.delimiter + process.env.PATH, APP_DIR: app }, encoding: 'utf8'
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Node\.js >=24\.22\.2 <25/);
    assert.deepEqual(fs.readdirSync(app), before);
    assert.equal(fs.readFileSync(path.join(app, '.env'), 'utf8'), 'private sentinel must remain unread and unchanged');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
