import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const readJson = (name) => JSON.parse(read(name));
const atLeast = (version, minimum) => {
  const actual = String(version || '').split('.').map(Number);
  const expected = minimum.split('.').map(Number);
  if (actual.length < 3 || actual.some((part) => !Number.isFinite(part))) return false;
  for (let i = 0; i < 3; i += 1) {
    if ((actual[i] || 0) > (expected[i] || 0)) return true;
    if ((actual[i] || 0) < (expected[i] || 0)) return false;
  }
  return true;
};

test('P1-4 pins Express 5.3.0 and Helmet 8.3.0 with an integrity-verified npm lockfile', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.equal(pkg.dependencies.express, '5.3.0');
  assert.equal(pkg.dependencies.helmet, '8.3.0');
  assert.equal(lock.packages[''].dependencies.express, '5.3.0');
  assert.equal(lock.packages[''].dependencies.helmet, '8.3.0');
  assert.equal(lock.packages['node_modules/express'].version, '5.3.0');
  assert.equal(lock.packages['node_modules/express'].resolved, 'https://registry.npmjs.org/express/-/express-5.3.0.tgz');
  assert.match(lock.packages['node_modules/express'].integrity || '', /^sha512-[A-Za-z0-9+/]+={0,2}$/,
    'run the documented npm lockfile refresh before testing; do not guess Express tarball integrity');
  assert.equal(lock.packages['node_modules/helmet'].version, '8.3.0');
  assert.match(lock.packages['node_modules/helmet'].integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(pkg.dependencies.multer, '2.5.0');
  assert.equal(pkg.dependencies['express-rate-limit'], '8.7.5');
  assert.equal(pkg.dependencies.ejs, '7.0.2');
  assert.equal(pkg.dependencies['@libsql/client'], '^0.18.0');
});

test('Express 5.3 required transitive contracts remain supported after direct dependency updates', () => {
  const lock = readJson('package-lock.json');
  const express = lock.packages['node_modules/express'];
  assert.equal(express.dependencies['body-parser'], '^2.3.0');
  assert.equal(express.dependencies['content-disposition'], '^2.0.1');
  assert.equal(express.dependencies['content-type'], '^2.0.0');
  assert.equal(express.dependencies['proxy-addr'], '^2.0.8');
  assert.equal(express.dependencies.qs, '^6.16.0');
  // npm can hoist these packages or keep them under Express. Check in Node's
  // actual resolution order rather than assuming one exact lockfile path.
  const resolvedFromExpress = (name) =>
    lock.packages[`node_modules/express/node_modules/${name}`] ||
    lock.packages[`node_modules/${name}`];
  const contentDisposition = resolvedFromExpress('content-disposition');
  const contentType = resolvedFromExpress('content-type');
  assert.ok(contentDisposition && atLeast(contentDisposition.version, '2.0.1') && Number(String(contentDisposition.version).split('.')[0]) === 2,
    'Express must resolve content-disposition ^2.0.1 at its nested path or the root');
  assert.ok(contentType && Number(String(contentType.version).split('.')[0]) === 2,
    'Express must resolve content-type ^2.0.0 at its nested path or the root');
  const bodyParser = resolvedFromExpress('body-parser');
  const qs = resolvedFromExpress('qs');
  assert.ok(bodyParser && atLeast(bodyParser.version, '2.4.0'),
    `Express must resolve body-parser >=2.4.0 to include GHSA-27r3-jxmh-p828; found ${bodyParser?.version || 'missing'}`);
  assert.equal(lock.packages['node_modules/proxy-addr'].version, '2.0.8');
  assert.ok(qs && atLeast(qs.version, '6.16.1'),
    `Express must resolve qs >=6.16.1 to include GHSA-6pq8-jhm2-2vcw; found ${qs?.version || 'missing'}`);
  assert.equal(lock.packages['node_modules/multer'].version, '2.5.0');
  assert.equal(lock.packages['node_modules/express-rate-limit'].version, '8.7.5');
});

test('Express 5 migration contract stays explicit for redirects, response APIs, body parsing, uploads and Helmet CSP', () => {
  const server = read('src/server.js');
  const auth = read('src/auth.js');
  assert.match(server, /express\.urlencoded\(\{\s*extended:\s*false\s*,\s*limit:\s*['"]2mb['"]\s*\}\)/);
  assert.match(server, /express\.json\(\{\s*limit:\s*['"]128kb['"]\s*\}\)/);
  assert.doesNotMatch(`${server}\n${auth}`, /\.redirect\(\s*['"]back['"]\s*\)/);
  assert.doesNotMatch(`${server}\n${auth}`, /\.send\(\s*\d{3}\s*,/);
  assert.match(server, /multer\.memoryStorage\(\)/);
  assert.match(server, /app\.use\(helmet\(\{/);
  assert.match(server, /contentSecurityPolicy:\s*\{\s*directives:\s*\{/);
  assert.match(server, /upgradeInsecureRequests:\s*isProd\s*\?\s*\[\]\s*:\s*null/);
});
