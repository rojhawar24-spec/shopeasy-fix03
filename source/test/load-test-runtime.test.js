import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfiguration, runLoadTest } from '../scripts/load-test.mjs';

async function server(t, handler) {
  const instance = http.createServer(handler).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { instance.once('listening', resolve); instance.once('error', reject); });
  t.after(async () => { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); });
  return 'http://127.0.0.1:' + instance.address().port;
}

test('load configuration rejects zero/NaN/fractional counts and credential-bearing targets before making requests', () => {
  for (const value of ['0', '-1', 'NaN', '1.5', 'Infinity', '1001', '']) {
    assert.throws(() => loadConfiguration({ LOAD_CLIENTS: value }));
    assert.throws(() => loadConfiguration({ LOAD_ROUNDS: value }));
  }
  for (const value of ['https://private-user:private-pass@example.test', 'https://example.test/?secret=private', 'https://example.test/path', 'file:///tmp/a']) assert.throws(() => loadConfiguration({ BASE_URL: value }));
  const script = fileURLToPath(new URL('../scripts/load-test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { BASE_URL: 'https://private-user:private-pass@example.test' } });
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout + result.stderr, /private-user|private-pass/);
});

test('actual load measurement waits for response bodies rather than headers', async t => {
  const base = await server(t, (request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    if (['/health', '/ready'].includes(request.url)) return response.end('ready');
    response.flushHeaders();
    setTimeout(() => response.end('delayed synthetic response body'), 100);
  });
  const result = await runLoadTest({ base, clients: 2, rounds: 2 });
  assert.equal(result.requests, 4);
  assert.equal(result.completedResponses, 4);
  assert.equal(result.errors, 0);
  assert.ok(result.p50Ms >= 80, 'body delay must be included in reported latency');
  assert.deepEqual(result.statusCodes, { 200: 4 });
});

test('readiness failure blocks all actual measured requests', async t => {
  const seen = [];
  const base = await server(t, (request, response) => { seen.push(request.url); response.statusCode = request.url === '/ready' ? 503 : 200; response.end(); });
  const result = await runLoadTest({ base, clients: 2, rounds: 2 });
  assert.equal(result.skipped, true);
  assert.equal(result.requests, 0);
  assert.deepEqual(seen, ['/health', '/ready']);
});

test('HTTP throttling, server failures and aborted bodies remain errors instead of successful latency samples', async t => {
  const base = await server(t, (request, response) => {
    if (['/health', '/ready'].includes(request.url)) return response.end('ready');
    if (request.url === '/') { response.statusCode = 429; return response.end('synthetic limit'); }
    if (request.url === '/shop') { response.statusCode = 500; return response.end('synthetic failure'); }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.flushHeaders();
  });
  const result = await runLoadTest({ base, clients: 1, rounds: 3 }, { requestTimeoutMs: 100 });
  assert.equal(result.requests, 3);
  assert.equal(result.completedResponses, 2);
  assert.equal(result.errors, 3);
  assert.equal(result.rateLimitedResponses, 1);
  assert.equal(result.serverErrorResponses, 1);
  assert.equal(result.networkErrors, 1);
  assert.deepEqual(result.statusCodes, { 200: 1, 429: 1, 500: 1 });
});
