import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = text => createHash('sha256').update(text).digest('hex');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-notices-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const write = (relative, data) => {
    const file = path.join(dir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  };
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts/generate-third-party-notices.mjs'), path.join(dir, 'scripts/generate-third-party-notices.mjs'));
  const name = 'sample-mit', version = '1.0.0', relative = `node_modules/${name}`;
  const metadata = { version, license: 'MIT', resolved: 'https://example.invalid/sample.tgz', integrity: 'sha512-test' };
  const lock = { version: 'test', packages: { '': {}, [relative]: metadata } };
  const text = 'Copyright Example Fixture\nPermission notice fixture.\n';
  const record = { name, version, integrity: metadata.integrity, resolved: metadata.resolved, optional: false, declaredLicense: 'MIT', installedNoticeFiles: ['LICENSE'], texts: [{ file: 'third-party/LICENSE.txt', label: 'LICENSE', sha256: hash(text), source: { kind: 'installed-package', path: 'LICENSE' }, installedSource: { path: 'LICENSE', sha256: hash(text) } }] };
  const provenance = { schemaVersion: 1, capturedAt: 'test', packages: { [relative]: record } };
  write(`${relative}/package.json`, { name, version });
  write(`${relative}/LICENSE`, text); write('third-party/LICENSE.txt', text);
  const save = () => { write('package-lock.json', lock); write('third-party/provenance.json', provenance); };
  const run = () => {
    save();
    const result = spawnSync(process.execPath, ['scripts/generate-third-party-notices.mjs'], { cwd: dir, encoding: 'utf8' });
    return { ...result, output: fs.readFileSync(path.join(dir, 'THIRD-PARTY-NOTICES.generated.txt'), 'utf8') };
  };
  return { dir, write, lock, record, provenance, run, text, relative };
}

test('notice output preserves full text and is deterministic', t => {
  const f = fixture(t), first = f.run(), second = f.run();
  assert.equal(first.status, 0, first.stderr); assert.equal(first.output, second.output);
  assert.ok(first.output.includes(f.text.trim())); assert.match(first.output, /Unresolved package\/license entries: 0/);
});
test('missing or tampered installed notice fails closed', t => {
  const f = fixture(t);
  f.write(`${f.relative}/LICENSE`, 'modified');
  let r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /SHA-256 mismatch/);
  fs.unlinkSync(path.join(f.dir, f.relative, 'LICENSE'));
  r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /file set differs/);
});
test('missing or tampered supplementary text fails closed', t => {
  const f = fixture(t);
  f.write('third-party/LICENSE.txt', 'modified');
  let r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /SHA-256 mismatch/);
  fs.unlinkSync(path.join(f.dir, 'third-party/LICENSE.txt'));
  r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /UNRESOLVED/);
});
test('installed names and versions must match lock, including nested packages', t => {
  const f = fixture(t);
  f.write(`${f.relative}/package.json`, { name: 'wrong', version: '1.0.0' });
  assert.match(f.run().output, /identity mismatch/);
  f.write(`${f.relative}/package.json`, { name: 'sample-mit', version: '9.0.0' });
  assert.equal(f.run().status, 1);
  const nested = 'node_modules/parent/node_modules/sample-mit';
  f.lock.packages[nested] = f.lock.packages[f.relative]; delete f.lock.packages[f.relative];
  f.provenance.packages[nested] = f.record; delete f.provenance.packages[f.relative];
  f.write(`${nested}/package.json`, { name: 'sample-mit', version: '1.0.0' }); f.write(`${nested}/LICENSE`, f.text);
  assert.equal(f.run().status, 0);
});
test('changed locks and missing required packages fail closed', t => {
  const f = fixture(t); f.lock.packages[f.relative].version = '2.0.0';
  assert.equal(f.run().status, 1);
  f.lock.packages[f.relative].version = '1.0.0';
  fs.unlinkSync(path.join(f.dir, f.relative, 'package.json'));
  const r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /required installed package/);
});
test('absent optional package is included from a version-checked exact-package snapshot', t => {
  const f = fixture(t); f.lock.packages[f.relative].optional = true; f.record.optional = true;
  const snapshot = JSON.stringify({ name: f.record.name, version: f.record.version });
  f.write('third-party/optional-package.json', snapshot);
  f.record.packageSource = { packageJsonSnapshot: { file: 'third-party/optional-package.json', sha256: hash(snapshot) }, locked_integrity_verified: true };
  fs.rmSync(path.join(f.dir, 'node_modules'), { recursive: true });
  const r = f.run(); assert.equal(r.status, 0); assert.match(r.output, /sample-mit@1\.0\.0/);
  assert.match(r.output, /Optional packages absent on this platform \(included above\): 1/);
  assert.ok(r.output.includes(f.text.trim()));
});
test('all reviewed Apache notice files are required, including ThirdPartyNoticeText', t => {
  const f = fixture(t); const additional = 'Additional third-party copyright fixture';
  f.record.installedNoticeFiles.push('ThirdPartyNoticeText.txt');
  f.record.texts.push({ file: 'third-party/extra.txt', label: 'ThirdPartyNoticeText.txt', sha256: hash(additional), source: { kind: 'installed-package' }, installedSource: { path: 'ThirdPartyNoticeText.txt', sha256: hash(additional) } });
  f.write(`${f.relative}/ThirdPartyNoticeText.txt`, additional); f.write('third-party/extra.txt', additional);
  assert.equal(f.run().status, 0);
  fs.unlinkSync(path.join(f.dir, f.relative, 'ThirdPartyNoticeText.txt'));
  const r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /file set differs/);
});
test('malformed provenance overwrites stale output with unresolved status', t => {
  const f = fixture(t); f.run(); f.write('third-party/provenance.json', '{invalid');
  const r = spawnSync(process.execPath, ['scripts/generate-third-party-notices.mjs'], { cwd: f.dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(fs.readFileSync(path.join(f.dir, 'THIRD-PARTY-NOTICES.generated.txt'), 'utf8'), /UNRESOLVED/);
});

function localFixture(t) {
  const f = fixture(t), source = 'vendor/promise-limit';
  const pkg = { name: '@shopeasy/task-limit', version: '1.0.0', license: 'UNLICENSED', private: true, main: 'index.cjs' };
  f.write(`${source}/package.json`, pkg); f.write(`${source}/index.cjs`, 'module.exports = () => {};');
  f.write(`${source}/PROVENANCE.md`, 'New first-party source fixture. Existing rights UNKNOWN; draft only.');
  const sourceFiles = ['PROVENANCE.md', 'index.cjs', 'package.json'].map(file => ({ path: file, sha256: hash(fs.readFileSync(path.join(f.dir, source, file))) }));
  delete f.lock.packages[f.relative]; delete f.provenance.packages[f.relative];
  const relative = 'node_modules/promise-limit';
  f.lock.packages[relative] = { resolved: source, link: true };
  f.lock.packages[source] = { name: pkg.name, version: pkg.version, license: 'UNLICENSED' };
  const record = { kind: 'first-party-local', name: pkg.name, alias: 'promise-limit', version: pkg.version, sourcePath: source, declaredLicense: 'UNLICENSED', rightsStatus: 'UNKNOWN', sourceFiles };
  f.provenance.packages[relative] = record;
  fs.symlinkSync('../vendor/promise-limit', path.join(f.dir, relative));
  return { ...f, source, record, relative };
}
test('local alias verifies actual identity and all files while keeping first-party rights UNKNOWN', t => {
  const f = localFixture(t), r = f.run(); assert.equal(r.status, 0, r.stderr);
  assert.match(r.output, /@shopeasy\/task-limit@1\.0\.0 \(installed as promise-limit\)/);
  assert.match(r.output, /FIRST-PARTY LOCAL REPLACEMENT/);
  assert.match(r.output, /First-party linked entries \(rights UNKNOWN\): 1/);
  assert.match(r.output, /not an external license grant/);
});
test('local replacement tampering or missing provenance fails closed', t => {
  const f = localFixture(t); f.write(`${f.source}/index.cjs`, 'tampered');
  let r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /SHA-256 mismatch/);
  f.write(`${f.source}/index.cjs`, 'module.exports = () => {};');
  fs.unlinkSync(path.join(f.dir, f.source, 'PROVENANCE.md'));
  r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /file set differs/);
});
test('local identity, private status and rights status are checked', t => {
  const f = localFixture(t); f.record.version = '2.0.0';
  assert.equal(f.run().status, 1);
  f.record.version = '1.0.0'; f.record.rightsStatus = 'CLEARED';
  const r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /UNKNOWN rights/);
});
test('local alias symlink must resolve to the locked local source directory', t => {
  const f = localFixture(t); fs.unlinkSync(path.join(f.dir, f.relative));
  fs.symlinkSync('../third-party', path.join(f.dir, f.relative));
  const r = f.run(); assert.equal(r.status, 1); assert.match(r.output, /link target differs/);
});
