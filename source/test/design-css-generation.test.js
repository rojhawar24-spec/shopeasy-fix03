import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-design-css-'));
  for (const relative of ['scripts/build-design-css.mjs', 'views/partials/header.ejs', 'PREVIEW.html', 'PREVIEW-MANAGER.html', ...['app.css', 'design-tokens.css', 'retail-2027.css', 'editorial-2027.css', 'research-polish-2027.css'].map(name => 'public/css/' + name)]) {
    const destination = path.join(directory, relative); fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, run: (...args) => spawnSync(process.execPath, ['scripts/build-design-css.mjs', ...args], { cwd: directory, encoding: 'utf8' }) };
}

test('CSS build is deterministic, preserves all source fingerprints and refuses stale output', t => {
  const { directory, run } = fixture(t);
  const first = run(); assert.equal(first.status, 0, first.stderr);
  const manifestFile = path.join(directory, 'generated/design-css-manifest.json');
  const manifest = fs.readFileSync(manifestFile);
  const bundles = JSON.parse(manifest).bundles;
  assert.equal(bundles.length, 2);
  assert.deepEqual(bundles.map(bundle => bundle.sources.length), [4, 1]);
  for (const bundle of bundles) {
    assert.equal(hash(fs.readFileSync(path.join(directory, bundle.output))), bundle.sha256);
    for (const source of bundle.sources) assert.equal(hash(fs.readFileSync(path.join(directory, source.path))), source.sha256);
    assert.ok(bundle.bytes < bundle.inputBytes);
    assert.deepEqual(bundle.warnings, []);
  }
  assert.equal(run('--check').status, 0);
  assert.equal(run().status, 0);
  assert.deepEqual(fs.readFileSync(manifestFile), manifest);
  fs.appendFileSync(path.join(directory, 'public/css/app.css'), '\n/*! Copyright synthetic audit notice */\n/* Synthetic licence notice retained in distributed CSS */\n');
  assert.equal(run('--check').status, 1, 'an edited authoring source invalidates the build manifest');
  assert.equal(run().status, 0);
  assert.notDeepEqual(fs.readFileSync(manifestFile), manifest);
  const compiled = fs.readFileSync(path.join(directory, 'public/css/design-foundation.min.css'), 'utf8');
  assert.ok(compiled.includes('/*! Copyright synthetic audit notice */'));
  assert.ok(compiled.includes('/* Synthetic licence notice retained in distributed CSS */'));
  assert.equal(run('--check').status, 0);
});

test('CSS build refuses a runtime cascade that would move the configured theme', t => {
  const { directory, run } = fixture(t);
  const filename = path.join(directory, 'views/partials/header.ejs');
  fs.writeFileSync(filename, fs.readFileSync(filename, 'utf8').replace('/theme/shop.css?', '/theme/moved.css?'));
  const result = run(); assert.equal(result.status, 1);
  assert.match(result.stderr, /cascade order/);
  assert.equal(fs.existsSync(path.join(directory, 'generated/design-css-manifest.json')), false);
});

test('CSS build refuses source symlinks without publishing generated files', { skip: process.platform === 'win32' }, t => {
  const { directory, run } = fixture(t);
  const filename = path.join(directory, 'public/css/app.css');
  fs.unlinkSync(filename);
  fs.symlinkSync(path.join(root, 'public/css/app.css'), filename);
  const result = run(); assert.equal(result.status, 1);
  assert.match(result.stderr, /regular stylesheet/);
  assert.equal(fs.existsSync(path.join(directory, 'generated/design-css-manifest.json')), false);
});
