import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import express from 'express';
import helmet from 'helmet';
import { createStaticAssetCompression } from '../src/static-asset-compression.js';

const shippedPublic = fileURLToPath(new URL('../public/', import.meta.url));
async function fixture(t, { isProd = false, seed = true } = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'shopeasy-static-http-'));
  const publicRoot = path.join(temporary, 'public');
  await fs.mkdir(publicRoot);
  if (seed) {
    for (const directory of ['css', 'js']) await fs.cp(path.join(shippedPublic, directory), path.join(publicRoot, directory), { recursive: true });
  } else {
    for (const directory of ['css', 'js']) await fs.mkdir(path.join(publicRoot, directory));
  }
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"] } } }));
  app.use((req, res, next) => { res.vary('Origin'); next(); });
  app.use(createStaticAssetCompression({ publicRoot, isProd }));
  // Use the real fallback: a symlink refusal must not leak via express.static.
  app.use(express.static(publicRoot, { index: false, maxAge: isProd ? '7d' : 0 }));
  app.get('/account', (req, res) => res.set('Cache-Control', 'no-store').set('Set-Cookie', 'fixture=synthetic; HttpOnly').type('html').send('<p>Personal fixture</p>'));
  app.get('/csrf', (req, res) => res.set('Cache-Control', 'no-store').json({ csrf: 'synthetic-fixture-value' }));
  app.get('/error', (req, res) => res.status(500).set('Cache-Control', 'no-store').send('Synthetic error'));
  app.use((error, req, res, next) => {
    if (error.headers) res.set(error.headers);
    res.status(error.status || 500).set('Cache-Control', 'no-store').end();
  });
  app.use((req, res) => res.status(404).set('Cache-Control', 'no-store').send('Not found'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  });
  return { temporary, publicRoot, request: (url, headers = {}, method = 'GET') => request(server.address().port, url, headers, method) };
}

function request(port, url, headers, method) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: '127.0.0.1', port, path: url, method, headers, agent: false }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function hasVary(response) {
  const values = response.headers.vary.toLowerCase().split(',').map(value => value.trim());
  assert.ok(values.includes('origin'));
  assert.ok(values.includes('accept-encoding'));
}

test('all 21 shipped CSS/JS files preserve exact bytes over actual plain and gzip HTTP responses', async t => {
  const { publicRoot, request } = await fixture(t, { isProd: true });
  let count = 0;
  for (const directory of ['css', 'js']) {
    for (const filename of await fs.readdir(path.join(publicRoot, directory))) {
      const expected = await fs.readFile(path.join(publicRoot, directory, filename));
      const url = `/${directory}/${filename}?revision=fixture`;
      const plain = await request(url, { 'Accept-Encoding': 'identity' });
      const zipped = await request(url, { 'Accept-Encoding': 'gzip' });
      assert.equal(plain.status, 200, url);
      assert.equal(zipped.status, 200, url);
      assert.equal(plain.headers['content-encoding'], undefined);
      assert.equal(zipped.headers['content-encoding'], 'gzip');
      assert.deepEqual(plain.bytes, expected, url);
      assert.deepEqual(gunzipSync(zipped.bytes), expected, url);
      const br = await request(url, { 'Accept-Encoding': 'br' });
      assert.equal(br.status, 200);
      assert.equal(br.headers['content-encoding'], 'br');
      assert.deepEqual(brotliDecompressSync(br.bytes), expected, url);
      assert.ok(br.bytes.length < expected.length, url);
      assert.notEqual(br.headers.etag, zipped.headers.etag);
      assert.notEqual(br.headers.etag, plain.headers.etag);
      hasVary(br);
      assert.equal(Number(plain.headers['content-length']), expected.length);
      assert.equal(Number(zipped.headers['content-length']), zipped.bytes.length);
      assert.ok(zipped.bytes.length < expected.length, url);
      assert.notEqual(zipped.headers.etag, plain.headers.etag);
      assert.match(zipped.headers.etag, /^"sha256-/);
      assert.equal(zipped.headers['last-modified'], plain.headers['last-modified']);
      assert.equal(zipped.headers['cache-control'], 'public, max-age=604800');
      assert.equal(zipped.headers['content-type'], directory === 'css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8');
      assert.equal(zipped.headers['content-security-policy'], plain.headers['content-security-policy']);
      assert.ok(zipped.headers['content-security-policy'].includes("script-src 'self'"));
      assert.equal(zipped.headers['set-cookie'], undefined);
      hasVary(plain); hasVary(zipped);
      count++;
    }
  }
  assert.equal(count, 21);
});

test('negotiation respects explicit exclusions, quality, wildcard, identity and malformed values', async t => {
  const { request } = await fixture(t);
  const gzip = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  const br = await request('/css/app.css', { 'Accept-Encoding': 'br' });
  const smallest = br.bytes.length <= gzip.bytes.length ? 'br' : 'gzip';
  const cases = [
    [undefined, 'plain'], ['', 'plain'], ['br', 'br'], ['gzip', 'gzip'], ['GZIP; Q=1', 'gzip'],
    ['x-gzip', 'gzip'], ['gzip;q=0', 'plain'], ['gzip;q=0, *;q=1', 'br'],
    ['gzip;q=0.5', 'plain'], ['gzip;q=0.5, identity;q=0.3', 'gzip'], ['*;q=1', smallest],
    ['*;q=0.5, identity;q=0', smallest], ['*;q=0, identity;q=0.5', 'plain'],
    ['gzip;q=0, identity;q=0', 'refused'], ['*;q=0', 'refused'], ['br, identity;q=0', 'br'],
    ['gzip;q=0, *;q=1, identity;q=0', 'br'], ['gzip;q=2', 'plain'], ['gzip;q=1.001', 'plain'],
    ['gzip;q=bogus', 'plain'], ['br;q=0, gzip', 'gzip'], ['gzip, br', smallest], ['br;q=0.5, gzip;q=1', 'gzip'], ['br;q=0, gzip;q=0, identity;q=0', 'refused'], ['br;q=0, *;q=1', 'gzip'], ['br;q=0.9, identity;q=0.1', 'br'], ['gzip;q=1, gzip;q=0', 'plain'], ['gzip;q=1;extra=yes', 'plain']
  ];
  for (const [encoding, expected] of cases) {
    const response = await request('/css/app.css', encoding === undefined ? {} : { 'Accept-Encoding': encoding });
    assert.equal(response.status, expected === 'refused' ? 406 : 200, String(encoding));
    assert.equal(response.headers['content-encoding'], expected === 'gzip' ? 'gzip' : expected === 'br' ? 'br' : undefined, String(encoding));
    if (expected === 'refused') {
      assert.equal(response.bytes.length, 0);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers.etag, undefined);
    }
    hasVary(response);
  }
});

test('conditional requests use selected-representation validators and preserve date precedence', async t => {
  const { request } = await fixture(t);
  for (const encoding of ['identity', 'gzip', 'br']) {
    const initial = await request('/js/app.js', { 'Accept-Encoding': encoding });
    const headers = { 'Accept-Encoding': encoding, 'If-None-Match': initial.headers.etag };
    for (const value of [initial.headers.etag, `W/${initial.headers.etag}`, `"unrelated", W/${initial.headers.etag}`, '*']) {
      const response = await request('/js/app.js', { ...headers, 'If-None-Match': value });
      assert.equal(response.status, 304);
      assert.equal(response.bytes.length, 0);
      assert.equal(response.headers.etag, initial.headers.etag);
      assert.equal(response.headers['last-modified'], initial.headers['last-modified']);
      assert.equal(response.headers['content-length'], undefined);
      hasVary(response);
    }
    assert.equal((await request('/js/app.js', { 'Accept-Encoding': encoding, 'If-Modified-Since': initial.headers['last-modified'] })).status, 304);
    assert.equal((await request('/js/app.js', { 'Accept-Encoding': encoding, 'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' })).status, 200);
    assert.equal((await request('/js/app.js', { 'Accept-Encoding': encoding, 'If-Modified-Since': 'invalid' })).status, 200);
    assert.equal((await request('/js/app.js', { ...headers, 'If-None-Match': '"mismatch"', 'If-Modified-Since': 'Thu, 01 Jan 2099 00:00:00 GMT' })).status, 200);
    assert.equal((await request('/js/app.js', { ...headers, 'Cache-Control': 'no-cache' })).status, 200);
  }
  const gzip = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  assert.equal((await request('/css/app.css', { 'Accept-Encoding': 'identity', 'If-None-Match': gzip.headers.etag })).status, 200);
});

test('HEAD exposes the same representation and conditional status without a body', async t => {
  const { request } = await fixture(t);
  for (const encoding of ['identity', 'gzip', 'br']) {
    const get = await request('/css/app.css', { 'Accept-Encoding': encoding });
    const head = await request('/css/app.css', { 'Accept-Encoding': encoding }, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.bytes.length, 0);
    for (const header of ['content-type', 'content-encoding', 'content-length', 'etag', 'last-modified', 'vary', 'cache-control']) assert.equal(head.headers[header], get.headers[header], header);
    const conditional = await request('/css/app.css', { 'Accept-Encoding': encoding, 'If-None-Match': get.headers.etag }, 'HEAD');
    assert.equal(conditional.status, 304);
    assert.equal(conditional.bytes.length, 0);
  }
});

test('If-Match and If-Unmodified-Since preconditions are honored without caching errors', async t => {
  const { request } = await fixture(t);
  const initial = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  for (const headers of [
    { 'If-Match': '"mismatch"' }, { 'If-Match': `W/${initial.headers.etag}` },
    { 'If-Unmodified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' }
  ]) {
    const response = await request('/css/app.css', { 'Accept-Encoding': 'gzip', ...headers });
    assert.equal(response.status, 412);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.bytes.length, 0);
  }
  assert.equal((await request('/css/app.css', { 'Accept-Encoding': 'gzip', 'If-Match': initial.headers.etag, 'If-Unmodified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT' })).status, 200);
  assert.equal((await request('/css/app.css', { 'Accept-Encoding': 'gzip', 'If-Match': '*' })).status, 200);
});

test('Range and If-Range use existing identity static behavior, with Vary and exclusions', async t => {
  const { publicRoot, request } = await fixture(t);
  const expected = await fs.readFile(path.join(publicRoot, 'css/app.css'));
  const ranged = await request('/css/app.css', { 'Accept-Encoding': 'gzip', Range: 'bytes=3-17' });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers['content-encoding'], undefined);
  assert.equal(ranged.headers['content-range'], `bytes 3-17/${expected.length}`);
  assert.deepEqual(ranged.bytes, expected.subarray(3, 18));
  hasVary(ranged);
  const mismatch = await request('/css/app.css', { Range: 'bytes=3-17', 'If-Range': '"mismatch"', 'Accept-Encoding': 'gzip' });
  assert.equal(mismatch.status, 200);
  assert.deepEqual(mismatch.bytes, expected);
  assert.equal((await request('/css/app.css', { Range: 'bytes=3-17', 'Accept-Encoding': 'gzip, identity;q=0' })).status, 406);
  assert.equal((await request('/css/app.css', { Range: 'bytes=999999999-' })).status, 416);
});

test('development responses remain immediately revalidatable', async t => {
  const { request } = await fixture(t);
  for (const encoding of ['gzip', 'identity', 'br']) assert.equal((await request('/css/app.css', { 'Accept-Encoding': encoding })).headers['cache-control'], 'public, max-age=0');
});

test('literal allowlist excludes HTML, personal, error, CSRF and other file types', async t => {
  const { publicRoot, request } = await fixture(t);
  await fs.writeFile(path.join(publicRoot, 'index.html'), '<p>Static HTML fixture</p>');
  await fs.writeFile(path.join(publicRoot, 'css/new.css'), 'p { color: red; }');
  await fs.writeFile(path.join(publicRoot, 'js/config.json'), '{"fixture":true}');
  for (const url of ['/account', '/csrf', '/error', '/index.html', '/css/new.css', '/js/config.json']) {
    const response = await request(url, { 'Accept-Encoding': 'gzip' });
    assert.equal(response.headers['content-encoding'], undefined, url);
    assert.equal(response.headers.vary, 'Origin', url);
    if (['/account', '/csrf', '/error'].includes(url)) assert.equal(response.headers['cache-control'], 'no-store');
  }
  const posted = await request('/css/app.css', { 'Accept-Encoding': 'gzip' }, 'POST');
  assert.equal(posted.status, 404);
  assert.equal(posted.headers['content-encoding'], undefined);
});

test('invalid, encoded, nested and nonexistent paths preserve safe static/404 fallback', async t => {
  const { temporary, publicRoot, request } = await fixture(t);
  await fs.writeFile(path.join(temporary, 'outside.css'), 'NON_PUBLIC_FIXTURE');
  for (const url of ['/css/missing.css', '/css/../outside.css', '/css/%2e%2e/%2e%2e/outside.css', '/css/%2e%2e%2f%2e%2e%2foutside.css', '/css/..%5coutside.css', '/js/nested/app.js', '/css/app.css%00']) {
    const response = await request(url, { 'Accept-Encoding': 'gzip' });
    assert.ok([400, 404].includes(response.status), `${url}: ${response.status}`);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.ok(!response.bytes.includes(Buffer.from('NON_PUBLIC_FIXTURE')));
  }
  // Existing static accepts these benign forms; neither is compressed by this module.
  for (const url of ['/css/%61pp.css', '//css/app.css']) {
    const response = await request(url, { 'Accept-Encoding': 'gzip' });
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-encoding'], undefined);
    assert.deepEqual(response.bytes, await fs.readFile(path.join(publicRoot, 'css/app.css')));
  }
});

test('file and directory symlinks are refused even after warming the public cache', async t => {
  const { temporary, publicRoot, request } = await fixture(t);
  const outside = path.join(temporary, 'outside.css');
  await fs.writeFile(outside, 'NON_PUBLIC_FIXTURE');
  await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  await fs.unlink(path.join(publicRoot, 'css/app.css'));
  await fs.symlink(outside, path.join(publicRoot, 'css/app.css'));
  let response = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  assert.equal(response.status, 404);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.bytes.length, 0);
  await fs.rename(path.join(publicRoot, 'js'), path.join(temporary, 'outside-js'));
  await fs.symlink(path.join(temporary, 'outside-js'), path.join(publicRoot, 'js'));
  response = await request('/js/app.js', { 'Accept-Encoding': 'identity' });
  assert.equal(response.status, 404);
  assert.equal(response.bytes.length, 0);
});

test('cache invalidates changes, same-size replacement, deletion and recreation', async t => {
  const { publicRoot, request } = await fixture(t);
  const filename = path.join(publicRoot, 'css/app.css');
  const initial = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  const original = await fs.readFile(filename);
  const changed = Buffer.from(original);
  changed[0] = changed[0] === 32 ? 10 : 32;
  const before = await fs.stat(filename);
  await fs.writeFile(filename, changed);
  // Keep mtime and size: ctime/inode checking must still invalidate the prior bytes.
  await fs.utimes(filename, before.atime, before.mtime);
  let response = await request('/css/app.css', { 'Accept-Encoding': 'gzip', 'If-None-Match': initial.headers.etag });
  assert.equal(response.status, 200);
  assert.deepEqual(gunzipSync(response.bytes), changed);
  assert.notEqual(response.headers.etag, initial.headers.etag);
  await fs.writeFile(`${filename}.replacement`, original);
  await fs.rename(`${filename}.replacement`, filename);
  response = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  assert.deepEqual(gunzipSync(response.bytes), original);
  await fs.unlink(filename);
  assert.equal((await request('/css/app.css', { 'Accept-Encoding': 'gzip' })).status, 404);
  await fs.writeFile(filename, 'p { color: blue; }');
  response = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  assert.deepEqual(gunzipSync(response.bytes), Buffer.from('p { color: blue; }'));
});

test('oversized files bypass compression and reject identity exclusion without caching', async t => {
  const { publicRoot, request } = await fixture(t, { seed: false });
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 32);
  await fs.writeFile(path.join(publicRoot, 'css/app.css'), bytes);
  const response = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-encoding'], undefined);
  assert.deepEqual(response.bytes, bytes);
  hasVary(response);
  const refused = await request('/css/app.css', { 'Accept-Encoding': 'gzip, identity;q=0' });
  assert.equal(refused.status, 406);
  assert.equal(refused.headers['cache-control'], 'no-store');
  await fs.writeFile(path.join(publicRoot, 'css/app.css'), 'p { color: green; }');
  const changed = await request('/css/app.css', { 'Accept-Encoding': 'gzip' });
  assert.equal(changed.headers['content-encoding'], 'gzip');
  assert.deepEqual(gunzipSync(changed.bytes), Buffer.from('p { color: green; }'));
});

test('bounded-cache pressure and concurrent cold loads retain exact bytes and no encoding lies', async t => {
  const { publicRoot, request } = await fixture(t, { seed: false });
  const names = ['app.css', 'design-tokens.css', 'editorial-2027.css', 'research-polish-2027.css', 'retail-2027.css'];
  const bodies = new Map();
  for (const [index, name] of names.entries()) {
    const bytes = Buffer.alloc(2 * 1024 * 1024, 65 + index);
    bodies.set(name, bytes);
    await fs.writeFile(path.join(publicRoot, 'css', name), bytes);
  }
  const cold = await Promise.all(names.map(name => request(`/css/${name}`, { 'Accept-Encoding': 'gzip, identity;q=0' })));
  for (const [index, response] of cold.entries()) {
    assert.equal(response.status, 200, 'Every fixed-allowlist cold request waits for its bounded compression job');
    assert.equal(response.headers['content-encoding'], 'gzip');
    assert.deepEqual(gunzipSync(response.bytes), bodies.get(names[index]));
    hasVary(response);
  }
  for (let round = 0; round < 2; round++) {
    for (const name of names) {
      const response = await request(`/css/${name}`, { 'Accept-Encoding': 'gzip' });
      assert.equal(response.headers['content-encoding'], 'gzip');
      assert.deepEqual(gunzipSync(response.bytes), bodies.get(name));
    }
  }
  const responses = await Promise.all(names.map(name => request(`/css/${name}`, { 'Accept-Encoding': 'gzip' })));
  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers['content-encoding'] === 'gzip' ? gunzipSync(response.bytes) : response.bytes, bodies.get(names[index]));
    hasVary(response);
  }
});
