import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createZip, readZip, extractZip } from '../scripts/release-archive.mjs';
import { releaseFiles, hashFiles, writeChecksumManifest, isolatedEnvironment, safeReleasePath } from '../scripts/release-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function temporary() { return fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-finalizer-test-')); }
function write(directory, relative, content) { const destination = path.join(directory, relative); fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, content); }
function verifyManifest(directory) {
  const manifest = new Map(fs.readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map(line => [line.slice(66), line.slice(0, 64)]));
  const actual = hashFiles(directory, releaseFiles(directory).filter(name => name !== 'SHA256SUMS.txt'));
  assert.deepEqual(manifest, actual, 'manifest must cover exact final files, with current hashes');
}
function oneZip(directory) {
  const source = path.join(directory, 'source'); fs.mkdirSync(source);
  write(source, 'alpha.txt', 'alpha-content');
  const archive = path.join(directory, 'sample.zip');
  createZip(source, ['alpha.txt'], archive);
  return fs.readFileSync(archive);
}
function zipOffsets(bytes) {
  const end = bytes.length - 22, directory = bytes.readUInt32LE(end + 16);
  const local = bytes.readUInt32LE(directory + 42);
  return { end, directory, local, localName: local + 30, centralName: directory + 46 };
}

// These tests use real ZIP bytes and extraction, not source-text assertions.
test('final generated files and their current hashes survive an actual ZIP round trip', () => {
  const temporaryDirectory = temporary();
  try {
    const source = path.join(temporaryDirectory, 'source'); fs.mkdirSync(source);
    write(source, '.env.example', 'PASSWORD=\n'); write(source, 'src/application.js', 'export const ready = true;\n');
    writeChecksumManifest(source);
    const staleManifest = fs.readFileSync(path.join(source, 'SHA256SUMS.txt'), 'utf8');
    write(source, 'FINAL-VERIFICATION-REPORT.json', JSON.stringify({ checks: [{ exit_code: 0 }], rights: 'UNKNOWN' }));
    write(source, 'THIRD-PARTY-NOTICES.md', 'Final installed dependency notices\n');
    writeChecksumManifest(source);
    assert.notEqual(fs.readFileSync(path.join(source, 'SHA256SUMS.txt'), 'utf8'), staleManifest);
    verifyManifest(source);
    const before = hashFiles(source, releaseFiles(source));
    const archive = path.join(temporaryDirectory, 'release.zip');
    const listing = createZip(source, releaseFiles(source), archive);
    assert.equal(fs.readFileSync(archive).readUInt32LE(0), 0x04034b50, 'a real ZIP local header is required');
    assert.deepEqual(listing.map(entry => entry.path), releaseFiles(source));
    assert.ok(listing.some(entry => entry.path === 'FINAL-VERIFICATION-REPORT.json'));
    for (const entry of listing) assert.equal(entry.sha256, before.get(entry.path));
    const extracted = path.join(temporaryDirectory, 'extracted');
    assert.deepEqual(extractZip(archive, extracted), releaseFiles(source));
    verifyManifest(extracted);
    assert.deepEqual(hashFiles(extracted, releaseFiles(extracted)), before);
    assert.deepEqual(hashFiles(source, releaseFiles(source)), before, 'packaging must preserve source bytes');
    assert.throws(() => extractZip(archive, extracted), /empty/i, 'existing extracted files must never be overwritten');
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('archive extraction rejects traversal paths, CRC tampering, links and case collisions before writing', () => {
  const temporaryDirectory = temporary();
  try {
    const original = oneZip(temporaryDirectory), offsets = zipOffsets(original);
    const malicious = [];
    const traversal = Buffer.from(original);
    Buffer.from('../bad.js').copy(traversal, offsets.localName); Buffer.from('../bad.js').copy(traversal, offsets.centralName);
    malicious.push(traversal);
    const badCrc = Buffer.from(original); badCrc.writeUInt32LE(0, offsets.directory + 16); malicious.push(badCrc);
    const link = Buffer.from(original); link.writeUInt32LE(0xa1ff0000, offsets.directory + 38); malicious.push(link);
    // Construct a second central entry using the first file's local data, with
    // its duplicate name: duplicates must be rejected even with matching CRC.
    const central = original.subarray(offsets.directory, offsets.end), doubledEnd = Buffer.from(original.subarray(offsets.end));
    doubledEnd.writeUInt16LE(2, 8); doubledEnd.writeUInt16LE(2, 10); doubledEnd.writeUInt32LE(central.length * 2, 12);
    malicious.push(Buffer.concat([original.subarray(0, offsets.directory), central, central, doubledEnd]));
    const secondLocal = Buffer.from(original.subarray(0, offsets.directory));
    Buffer.from('ALPHA.TXT').copy(secondLocal, 30);
    const secondCentral = Buffer.from(central); Buffer.from('ALPHA.TXT').copy(secondCentral, 46);
    secondCentral.writeUInt32LE(offsets.directory, 42);
    const caseEnd = Buffer.from(doubledEnd); caseEnd.writeUInt32LE(offsets.directory * 2, 16);
    malicious.push(Buffer.concat([original.subarray(0, offsets.directory), secondLocal, central, secondCentral, caseEnd]));
    for (let index = 0; index < malicious.length; index++) {
      const destination = path.join(temporaryDirectory, `rejected-${index}`);
      assert.throws(() => extractZip(malicious[index], destination));
      assert.equal(fs.existsSync(destination), false, 'unsafe input must fail before extraction creates files');
    }
    const mismatch = Buffer.from(original); mismatch.writeUInt16LE(1, offsets.local + 6);
    assert.throws(() => readZip(mismatch), /header|flag|encrypt|mismatch/i, 'local flags cannot contradict central flags');
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('extraction never follows a symlink destination and archive creation never reads source links', { skip: process.platform === 'win32' }, () => {
  const temporaryDirectory = temporary();
  try {
    const original = oneZip(temporaryDirectory);
    const outside = path.join(temporaryDirectory, 'outside'); fs.mkdirSync(outside);
    const destination = path.join(temporaryDirectory, 'destination'); fs.symlinkSync(outside, destination, 'dir');
    assert.throws(() => extractZip(original, destination), /link|real.*directory/i);
    assert.deepEqual(fs.readdirSync(outside), []);
    const linkedParent = path.join(temporaryDirectory, 'linked-parent'); fs.symlinkSync(outside, linkedParent, 'dir');
    assert.throws(() => extractZip(original, path.join(linkedParent, 'nested')), /link|real.*directory/i);
    assert.deepEqual(fs.readdirSync(outside), []);
    const source = path.join(temporaryDirectory, 'source');
    fs.symlinkSync(path.join(source, 'alpha.txt'), path.join(source, 'linked.txt'));
    assert.throws(() => createZip(source, ['linked.txt'], path.join(temporaryDirectory, 'linked.zip')), /link|regular file/i);
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('release source validation refuses private state without opening or modifying it', () => {
  const temporaryDirectory = temporary();
  try {
    for (const relative of ['.env', 'data/shop.db', 'backups/snapshot.enc', '.venv/pyvenv.cfg', '.qa-venv/pyvenv.cfg', '.qa-tools/package.json', 'qa-output/browser-results.json', 'qa-output-security/browser-results.json', 'public/uploads/customer.jpg']) {
      const source = path.join(temporaryDirectory, digest(relative)); fs.mkdirSync(source);
      write(source, '.env.example', 'MANAGER_PASSWORD=\n'); write(source, relative, 'private sentinel');
      const before = fs.readFileSync(path.join(source, relative));
      assert.throws(() => releaseFiles(source), /private|temporary/i, relative);
      assert.deepEqual(fs.readFileSync(path.join(source, relative)), before);
    }
    for (const value of ['../escape', '/absolute', 'C:/drive', 'path\\escape', 'dir/CON.txt', 'dir/trailing.', 'dir/trailing ', 'dir//double']) assert.equal(safeReleasePath(value), false, value);
    assert.equal(safeReleasePath('docs/clean-name.md'), true);
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('verification subprocesses receive no inherited database, credentials, Node hooks or virtual environment', () => {
  const isolated = isolatedEnvironment({
    PATH: '/safe/bin', HOME: '/private-home', NODE_ENV: 'production', NODE_OPTIONS: '--import=evil.mjs',
    DATABASE_URL: 'file:/production.db', TURSO_DATABASE_URL: 'libsql://production', TURSO_AUTH_TOKEN: 'private-token',
    MANAGER_PASSWORD: 'private-password', BACKUP_ENCRYPTION_KEY: 'private-key', VIRTUAL_ENV: '/production/venv',
    RESEND_API_KEY: 'private-key', STAGING_MANAGER_PASSWORD: 'private-password', npm_config_userconfig: '/production/.npmrc'
  });
  assert.equal(isolated.PATH, '/safe/bin'); assert.equal(isolated.NODE_ENV, 'test');
  assert.equal(isolated.SEED_DEMO_DATA, 'false'); assert.equal(isolated.AI_ENABLED, 'false');
  for (const name of ['NODE_OPTIONS', 'DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'MANAGER_PASSWORD', 'BACKUP_ENCRYPTION_KEY', 'VIRTUAL_ENV', 'RESEND_API_KEY', 'STAGING_MANAGER_PASSWORD', 'npm_config_userconfig']) assert.equal(name in isolated, false, name);
});

test('production start wrapper sets NODE_ENV before application bootstrap in a real subprocess', () => {
  const temporaryDirectory = temporary();
  try {
    write(temporaryDirectory, 'package.json', '{"type":"module"}');
    write(temporaryDirectory, 'scripts/start-production.mjs', fs.readFileSync(path.join(root, 'scripts/start-production.mjs')));
    write(temporaryDirectory, 'src/bootstrap.js', `if(process.env.NODE_ENV!=='production')throw new Error('bootstrap saw wrong mode');console.log(process.env.NODE_ENV);`);
    const result = spawnSync(process.execPath, [path.join(temporaryDirectory, 'scripts/start-production.mjs')], { encoding: 'utf8', env: { ...isolatedEnvironment(), NODE_ENV: 'development' } });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), 'production');
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

function workflowFixture(temporaryDirectory, { failure = false, privateFile = false } = {}) {
  const source = path.join(temporaryDirectory, 'source'), bin = path.join(temporaryDirectory, 'bin');
  fs.mkdirSync(source); fs.mkdirSync(bin);
  for (const relative of ['scripts/verify-and-package.mjs', 'scripts/release-files.mjs', 'scripts/release-archive.mjs']) write(source, relative, fs.readFileSync(path.join(root, relative)));
  write(source, 'package.json', '{"name":"isolated-workflow-fixture","version":"1.0.0","type":"module"}\n');
  write(source, 'package-lock.json', '{"name":"isolated-workflow-fixture","version":"1.0.0"}\n');
  write(source, '.env.example', 'PASSWORD=\n'); write(source, 'THIRD-PARTY-NOTICES.md', 'before staged generation\n');
  // The real orchestration runs these fixture programs, which verify exact hash
  // coverage. Mock npm gates let this test check packaging/failure semantics
  // without claiming to run the application suite or a registry audit.
  write(source, 'scripts/verify-release-files.mjs', `import fs from 'node:fs';import path from 'node:path';import {releaseFiles,hashFiles} from './release-files.mjs';const root=process.cwd();const sums=new Map(fs.readFileSync(path.join(root,'SHA256SUMS.txt'),'utf8').trim().split('\\n').map(line=>[line.slice(66),line.slice(0,64)]));const actual=hashFiles(root,releaseFiles(root).filter(name=>name!=='SHA256SUMS.txt'));if(sums.size!==actual.size||[...actual].some(([name,hash])=>sums.get(name)!==hash))throw Error('manifest stale');console.log('fixture manifest passed');`);
  write(source, 'scripts/template-audit.mjs', 'console.log("fixture templates gate");\n');
  if (failure) write(source, 'fail-test-gate', 'fixture failure requested\n');
  writeChecksumManifest(source);
  if (privateFile) write(source, '.env', 'private-production-sentinel');
  const mockNpm = `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);if(args[0]==='test'&&fs.existsSync('fail-test-gate')){console.error('fixture test failure');process.exit(19);}if(args.join(' ')==='run licenses:generate')fs.writeFileSync('THIRD-PARTY-NOTICES.md','generated in private staging copy\\n');console.log('mock npm gate: '+args.join(' '));\n`;
  fs.writeFileSync(path.join(bin, 'npm'), mockNpm, { mode: 0o755 });
  const output = path.join(temporaryDirectory, 'output');
  return { source, output, run: () => spawnSync(process.execPath, [path.join(source, 'scripts/verify-and-package.mjs'), '--output', output], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    env: { ...isolatedEnvironment(), PATH: bin + path.delimiter + process.env.PATH, NODE_ENV: 'production', DATABASE_URL: 'file:/must-never-be-used.db', MANAGER_PASSWORD: 'private-inherited-sentinel' }
  }) };
}

test('non-mutating package workflow runs all gates, packages the final generated report and verifies real archive hashes', { skip: process.platform === 'win32' }, () => {
  const temporaryDirectory = temporary();
  try {
    const fixture = workflowFixture(temporaryDirectory), before = hashFiles(fixture.source, releaseFiles(fixture.source));
    const result = fixture.run();
    assert.ifError(result.error); assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(hashFiles(fixture.source, releaseFiles(fixture.source)), before);
    assert.equal(fs.readFileSync(path.join(fixture.source, 'THIRD-PARTY-NOTICES.md'), 'utf8'), 'before staged generation\n');
    const contents = JSON.parse(fs.readFileSync(path.join(fixture.output, 'CONTENTS.json'), 'utf8'));
    const archive = path.join(fixture.output, contents.archive), archiveBytes = fs.readFileSync(archive);
    assert.equal(contents.sha256, digest(archiveBytes));
    assert.equal(fs.readFileSync(archive + '.sha256', 'utf8').split('  ')[0], digest(archiveBytes));
    const entries = readZip(archive);
    assert.deepEqual(contents.files.map(entry => entry.path), entries.map(entry => entry.name));
    for (const entry of contents.files) assert.equal(entry.sha256, digest(entries.find(value => value.name === entry.path).data));
    const extracted = path.join(temporaryDirectory, 'unpacked'); extractZip(archive, extracted); verifyManifest(extracted);
    assert.equal(fs.readFileSync(path.join(extracted, 'THIRD-PARTY-NOTICES.md'), 'utf8'), 'generated in private staging copy\n');
    const report = JSON.parse(fs.readFileSync(path.join(extracted, 'FINAL-VERIFICATION-REPORT.json'), 'utf8'));
    for (const name of ['Complete test suite', 'All dependency advisories', 'Production dependency advisories', 'Exact installed third-party notices']) assert.ok(report.checks.some(check => check.name === name && check.exit_code === 0), name);
    assert.match(JSON.stringify(report), /UNKNOWN|NOT TESTED/);
    const log = JSON.parse(fs.readFileSync(path.join(fixture.output, 'verification-log.json'), 'utf8'));
    assert.equal(log.label, 'VERIFIED');
    assert.equal(log.archive.sha256, contents.sha256);
    assert.ok(log.results.some(entry => entry.name === 'Actual ZIP re-extraction integrity' && entry.exit_code === 0));
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('a failed gate stops the workflow, retains failure evidence and creates no accepted ZIP', { skip: process.platform === 'win32' }, () => {
  const temporaryDirectory = temporary();
  try {
    const fixture = workflowFixture(temporaryDirectory, { failure: true }), before = hashFiles(fixture.source, releaseFiles(fixture.source));
    const result = fixture.run();
    assert.ifError(result.error); assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /FAILED.*Complete test suite|Complete test suite.*failed|Complete test suite.*did not complete/i);
    assert.doesNotMatch(result.stdout, /VERIFIED: Complete test suite/);
    assert.deepEqual(hashFiles(fixture.source, releaseFiles(fixture.source)), before);
    assert.deepEqual(fs.readdirSync(fixture.output).filter(name => /\.zip(?:\.partial)?$/.test(name)), []);
    const log = JSON.parse(fs.readFileSync(path.join(fixture.output, 'verification-log.json'), 'utf8'));
    assert.equal(log.results.at(-1).exit_code, 19);
    assert.notEqual(log.label, 'VERIFIED');
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});

test('the package workflow refuses a source containing live .env without touching it or creating output', { skip: process.platform === 'win32' }, () => {
  const temporaryDirectory = temporary();
  try {
    const fixture = workflowFixture(temporaryDirectory, { privateFile: true });
    const result = fixture.run();
    assert.ifError(result.error); assert.notEqual(result.status, 0); assert.match(result.stderr, /private|temporary/i);
    assert.equal(fs.readFileSync(path.join(fixture.source, '.env'), 'utf8'), 'private-production-sentinel');
    assert.equal(fs.existsSync(fixture.output), false);
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});


test('an existing output directory is rejected without rewriting prior release evidence', { skip: process.platform === 'win32' }, () => {
  const temporaryDirectory = temporary();
  try {
    const fixture = workflowFixture(temporaryDirectory);
    fs.mkdirSync(fixture.output);
    write(fixture.output, 'verification-log.json', 'earlier verification evidence');
    write(fixture.output, 'existing-release.zip', 'earlier archive sentinel');
    const result = fixture.run();
    assert.ifError(result.error); assert.notEqual(result.status, 0);
    assert.match(result.stderr, /already exists/i);
    assert.equal(fs.readFileSync(path.join(fixture.output, 'verification-log.json'), 'utf8'), 'earlier verification evidence');
    assert.equal(fs.readFileSync(path.join(fixture.output, 'existing-release.zip'), 'utf8'), 'earlier archive sentinel');
    assert.deepEqual(fs.readdirSync(fixture.output).sort(), ['existing-release.zip', 'verification-log.json']);
  } finally { fs.rmSync(temporaryDirectory, { recursive: true, force: true }); }
});
