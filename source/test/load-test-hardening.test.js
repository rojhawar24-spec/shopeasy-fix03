import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'scripts/load-test.mjs'), 'utf8');

test('load test refuses to measure when health and readiness are not both HTTP 200', () => {
  assert.match(source, /for \(const endpoint of \['\/health','\/ready'\]\)/);
  assert.match(source, /requests:0, errors:0/);
  assert.match(source, /skipped:true/);
});

test('load test output separates deliberate 429 throttling from server and network errors', () => {
  assert.match(source, /rateLimitedResponses/);
  assert.match(source, /clientErrorResponses/);
  assert.match(source, /serverErrorResponses/);
  assert.match(source, /networkErrors/);
  assert.match(source, /statusCodes/);
  assert.match(source, /p50Ms/);
  assert.match(source, /p95Ms/);
  assert.match(source, /p99Ms/);
});
