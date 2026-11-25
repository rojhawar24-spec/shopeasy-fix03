import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { switchRelease } from '../scripts/release-layout.mjs';
import { validateDeployment } from '../scripts/validate-deployment.mjs';

function installation() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-layout-test-'));
  for (const name of ['releases/old', 'releases/new', 'data', 'backups', 'public/uploads']) fs.mkdirSync(path.join(directory, name), { recursive: true });
  fs.writeFileSync(path.join(directory, 'releases/old/marker'), 'old');
  fs.writeFileSync(path.join(directory, 'releases/new/marker'), 'new');
  for (const name of ['.env', 'data/shop.db', 'backups/snapshot.enc', 'public/uploads/customer.png']) fs.writeFileSync(path.join(directory, name), `private:${name}`);
  return directory;
}
const privateNames = ['.env', 'data/shop.db', 'backups/snapshot.enc', 'public/uploads/customer.png'];
const snapshot = directory => privateNames.map(name => [name, fs.readFileSync(path.join(directory, name))]);
const unchanged = (directory, before) => { for (const [name, bytes] of before) assert.deepEqual(fs.readFileSync(path.join(directory, name)), bytes, `${name} changed`); };

// This exercises real filesystem renames in a disposable installation; no service,
// production configuration, database client or network endpoint is opened.
test('validated code switch and explicit rollback preserve persistent installation state', () => {
  const app = installation(), before = snapshot(app);
  try {
    const old = path.join(app, 'releases/old'), next = path.join(app, 'releases/new');
    assert.equal(switchRelease(app, old), null);
    assert.equal(fs.realpathSync(path.join(app, 'current')), old);
    assert.equal(switchRelease(app, next), old);
    assert.equal(fs.readFileSync(path.join(app, 'current/marker'), 'utf8'), 'new');
    assert.equal(switchRelease(app, old), next);
    assert.equal(fs.readFileSync(path.join(app, 'current/marker'), 'utf8'), 'old');
    unchanged(app, before);
    assert.deepEqual(fs.readdirSync(app).filter(name => name.startsWith('.current-')), []);
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
});

test('release selection rejects directories outside releases, hidden preparation trees and files', () => {
  const app = installation(), before = snapshot(app);
  try {
    switchRelease(app, path.join(app, 'releases/old'));
    for (const name of ['outside', 'releases/.prepare-abc', 'releases/deep/child']) fs.mkdirSync(path.join(app, name), { recursive: true });
    fs.writeFileSync(path.join(app, 'releases/not-a-directory'), 'invalid');
    for (const name of ['outside', 'releases/.prepare-abc', 'releases/deep/child', 'releases/not-a-directory']) {
      assert.throws(() => switchRelease(app, path.join(app, name)), undefined, name);
      assert.equal(fs.realpathSync(path.join(app, 'current')), path.join(app, 'releases/old'));
    }
    unchanged(app, before);
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
});

test('an existing live directory or an escaping current symlink is never overwritten', () => {
  const app = installation();
  try {
    const current = path.join(app, 'current');
    fs.mkdirSync(current); fs.writeFileSync(path.join(current, 'do-not-touch'), 'preserved');
    assert.throws(() => switchRelease(app, path.join(app, 'releases/new')), /symbolic link/i);
    assert.equal(fs.readFileSync(path.join(current, 'do-not-touch'), 'utf8'), 'preserved');
    fs.rmSync(current, { recursive: true });
    fs.symlinkSync(path.join(app, 'data'), current, 'dir');
    assert.throws(() => switchRelease(app, path.join(app, 'releases/new')), /escapes|outside/i);
    assert.equal(fs.realpathSync(current), path.join(app, 'data'));
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
});

test('readers observe a complete old or new release throughout repeated atomic switches', async () => {
  const app = installation();
  let observer;
  try {
    const old = path.join(app, 'releases/old'), next = path.join(app, 'releases/new');
    switchRelease(app, old);
    const observerCode = `const fs=require('node:fs'),p=require('node:path');const app=process.argv[1];process.stdout.write('ready\\n');let reads=0;const end=Date.now()+350;function check(){try{const marker=fs.readFileSync(p.join(app,'current','marker'),'utf8');if(!['old','new'].includes(marker))throw Error('partial release');reads++;if(Date.now()<end)setImmediate(check);else process.stdout.write(String(reads)+'\\n');}catch(error){console.error(error.message);process.exitCode=1;}}check();`;
    observer = spawn(process.execPath, ['-e', observerCode, app], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    observer.stdout.setEncoding('utf8'); observer.stderr.setEncoding('utf8');
    observer.stdout.on('data', chunk => { output += chunk; });
    observer.stderr.on('data', chunk => { errors += chunk; });
    while (!output.includes('ready\n')) { if (observer.exitCode !== null) assert.fail(errors || 'observer exited early'); await delay(2); }
    for (let index = 0; index < 80; index++) { switchRelease(app, index % 2 ? old : next); await delay(1); }
    const [code] = await once(observer, 'exit');
    assert.equal(code, 0, errors);
    assert.ok(Number(output.trim().split('\n').at(-1)) > 0, output);
  } finally { if (observer && observer.exitCode === null) observer.kill(); fs.rmSync(app, { recursive: true, force: true }); }
});

const validValues = {
  NODE_ENV: 'production', PORT: '3000', BASE_URL: 'https://shop.example.com',
  DATABASE_URL: 'file:./data/shop.db', RATE_LIMIT_BACKEND: 'memory-single-instance',
  CLOUDFLARE_WORKER: '0', TRUST_PROXY: '1', MFA_ENCRYPTION_KEY: 'a'.repeat(64)
};
const environment = overrides => Object.entries({ ...validValues, ...overrides }).map(([name, value]) => `${name}=${value}`).join('\n') + '\n';
const caddy = 'shop.example.com {\n  reverse_proxy 127.0.0.1:3000\n}\n';

test('deployment configuration accepts the documented local persistent database and Manager bootstrap', () => {
  assert.deepEqual(validateDeployment(environment(), caddy), { baseUrl: 'https://shop.example.com' });
  assert.deepEqual(validateDeployment(environment({ MANAGER_EMAIL: 'owner@example.test', MANAGER_PASSWORD: 'Temporary-Test-Password' }), caddy), { baseUrl: 'https://shop.example.com' });
  assert.deepEqual(validateDeployment(environment({ RESEND_API_KEY: 'fixture-key', EMAIL_FROM: 'shop@example.test', RESET_CODE_SECRET: 'a'.repeat(32) }), caddy), { baseUrl: 'https://shop.example.com' });
});

test('deployment configuration fails closed for ambiguous keys, insecure origins and incompatible runtime modes', () => {
  assert.throws(() => validateDeployment(environment() + 'BASE_URL=https://other.example.com\n', caddy), /duplicate/i);
  for (const value of ['', 'http://shop.example.com', 'https://127.0.0.1', 'https://[::1]', 'https://shop.example.com:8443', 'https://user:password@shop.example.com', 'https://shop.example.com/path', 'https://shop.example.com/?x=1', 'https://shop.example.local']) {
    assert.throws(() => validateDeployment(environment({ BASE_URL: value }), caddy), /BASE_URL/i, value);
  }
  for (const overrides of [
    { NODE_ENV: 'development' }, { PORT: '3001' }, { DATABASE_URL: 'file:/tmp/other.db' },
    { RATE_LIMIT_BACKEND: 'memory' }, { TRUST_PROXY: '0' }, { CLOUDFLARE_WORKER: '1' },
    { TURSO_DATABASE_URL: 'libsql://fixture.example.test' }, { TURSO_AUTH_TOKEN: 'fixture-token' },
    { SHOP_DATABASE_URL: 'libsql://fixture.example.test' }
  ]) assert.throws(() => validateDeployment(environment(overrides), caddy));
});

test('deployment configuration enforces account, MFA, recovery and matching HTTPS proxy requirements', () => {
  for (const overrides of [
    { MFA_ENCRYPTION_KEY: '' }, { MFA_ENCRYPTION_KEY: 'g'.repeat(64) },
    { MANAGER_EMAIL: 'owner@example.test' }, { MANAGER_PASSWORD: 'Temporary-Test-Password' },
    { MANAGER_EMAIL: 'bad-email', MANAGER_PASSWORD: 'Temporary-Test-Password' },
    { MANAGER_EMAIL: 'owner@example.test', MANAGER_PASSWORD: 'short' },
    { RESEND_API_KEY: 'fixture-key', RESET_CODE_SECRET: 'short' }
  ]) assert.throws(() => validateDeployment(environment(overrides), caddy));
  for (const config of [
    'other.example.com {\n reverse_proxy 127.0.0.1:3000\n}',
    'shop.example.com {\n reverse_proxy 127.0.0.1:3001\n}',
    'shop.example.com {\n reverse_proxy 127.0.0.1:3000\n}\nother.example.com {\n respond 200\n}'
  ]) assert.throws(() => validateDeployment(environment(), config), /Caddy/i);
});

// Mock command execution here tests the preparation controller's mandatory
// order and failure boundary. The packaging tests separately execute real
// checksum and ZIP programs; full application checks are a separate release gate.
test('deployment preparation removes inherited credentials, runs mandatory gates and stops before pruning after failure', async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-prepare-controller-'));
  try {
    const { pathToFileURL } = await import('node:url');
    for (const name of ['prepare-deployment.mjs', 'release-files.mjs']) {
      const target = path.join(temporaryDirectory, 'scripts', name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(new URL(`../scripts/${name}`, import.meta.url), target);
    }
    const { prepareDeployment } = await import(pathToFileURL(path.join(temporaryDirectory, 'scripts/prepare-deployment.mjs')).href);
    const calls = [];
    assert.throws(() => prepareDeployment(temporaryDirectory, { run(program, args, options) {
      calls.push({ program, args, env: options.env });
      return { status: args[0] === 'test' ? 41 : 0 };
    } }), /failed.*npm test/i);
    assert.ok(calls.some(call => call.args.join(' ') === 'ci --ignore-scripts --no-audit --no-fund'));
    assert.equal(calls.at(-1).args.join(' '), 'test');
    assert.equal(calls.some(call => call.args.includes('--omit=dev')), false, 'production-only install must wait for tests');
    for (const { env } of calls) {
      assert.equal(env.NODE_ENV, 'test');
      for (const key of ['DATABASE_URL', 'TURSO_AUTH_TOKEN', 'MANAGER_PASSWORD', 'BACKUP_ENCRYPTION_KEY', 'NODE_OPTIONS', 'VIRTUAL_ENV']) assert.equal(key in env, false, key);
      assert.ok(env.HOME.includes('shopeasy-deployment-check-'));
    }
    for (const name of ['.cloudflare-build', '.wrangler']) { fs.mkdirSync(path.join(temporaryDirectory, name)); fs.writeFileSync(path.join(temporaryDirectory, name, 'generated'), 'fixture'); }
    const successful = [];
    prepareDeployment(temporaryDirectory, { run(program, args) { successful.push(args.join(' ')); return { status: 0 }; } });
    assert.ok(successful.includes('test'));
    assert.ok(successful.includes('audit --audit-level=low'));
    assert.ok(successful.includes('audit --omit=dev --audit-level=low'));
    assert.ok(successful.indexOf('ci --omit=dev --ignore-scripts --no-audit --no-fund') > successful.indexOf('test'));
    assert.ok(successful.at(-1).includes('check-test-dependencies.mjs'));
    for (const name of ['.cloudflare-build', '.wrangler']) assert.equal(fs.existsSync(path.join(temporaryDirectory, name)), false);
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('the documented Caddy site is accepted while HTTPS-disabling and additional site directives are rejected', () => {
  const template = fs.readFileSync(new URL('../Caddyfile', import.meta.url), 'utf8');
  assert.deepEqual(validateDeployment(environment(), template), { baseUrl: 'https://shop.example.com' });
  for (const unsafe of [
    '{\n auto_https off\n}\n' + caddy,
    '{\n auto_https disable_redirects\n}\n' + caddy,
    caddy + ':80 {\n reverse_proxy 127.0.0.1:3000\n}\n',
    caddy + 'import /etc/caddy/other-sites/*\n',
    caddy.replace('reverse_proxy', 'tls internal\n reverse_proxy'),
    caddy.replace('shop.example.com {', 'http://shop.example.com {'),
    caddy.replace('reverse_proxy', 'import proxy-settings\n reverse_proxy')
  ]) assert.throws(() => validateDeployment(environment(), unsafe), /Caddy/i, unsafe);
});
