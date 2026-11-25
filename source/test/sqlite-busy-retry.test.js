import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const retrySource = serverSource.match(/function isRetryableSqliteBusy\(error\) \{[\s\S]*?\n\}\nasync function withBusyRetry\(operation, attempts=6\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(retrySource, 'src/server.js must contain the checkout SQLITE_BUSY classifier and retry helper');

function loadRetryHelper(setTimeoutImplementation = setTimeout) {
  return vm.runInNewContext(`(() => { ${retrySource}; return withBusyRetry; })()`, {
    setTimeout: setTimeoutImplementation
  });
}

const withBusyRetry = loadRetryHelper();

test('checkout retries a direct SQLITE_BUSY code and returns the successful attempt', async () => {
  let attempts = 0;
  const result = await withBusyRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('database busy'), { code: 'SQLITE_BUSY' });
    return 'order-committed';
  }, 3);

  assert.equal(result, 'order-committed');
  assert.equal(attempts, 2);
});

test('checkout retries a generic libSQL error whose message identifies a COMMIT SQLITE_BUSY', async () => {
  let attempts = 0;
  const result = await withBusyRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(
        new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'),
        { code: 'LIBSQL_ERROR' }
      );
    }
    return 'committed-after-retry';
  }, 3);

  assert.equal(result, 'committed-after-retry');
  assert.equal(attempts, 2);
});

test('checkout retry classifier follows a nested cause from a commit wrapper', async () => {
  let attempts = 0;
  const result = await withBusyRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const cause = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
      throw new Error('commit failed', { cause });
    }
    return 'ok';
  }, 3);

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('checkout retry classifier follows libSQL originalError wrappers', async () => {
  let attempts = 0;
  const result = await withBusyRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = Object.assign(new Error('native transaction error'), { code: 'LIBSQL_ERROR' });
      error.originalError = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
      throw error;
    }
    return 'ok';
  }, 3);

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('checkout does not retry a non-SQLite error and preserves the original error', async () => {
  let attempts = 0;
  const originalError = new Error('validation failed');

  await assert.rejects(
    withBusyRetry(async () => {
      attempts += 1;
      throw originalError;
    }, 6),
    error => error === originalError
  );
  assert.equal(attempts, 1);
});

test('checkout stops after the configured maximum attempts and throws the final COMMIT error', async () => {
  let attempts = 0;
  const finalError = Object.assign(
    new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'),
    { code: 'LIBSQL_ERROR' }
  );

  await assert.rejects(
    withBusyRetry(async () => {
      attempts += 1;
      throw finalError;
    }, 3),
    error => error === finalError
  );
  assert.equal(attempts, 3);
});

test('checkout retry backoff increases exponentially between attempts', async () => {
  const delays = [];
  const immediateTimer = (callback, milliseconds) => {
    delays.push(milliseconds);
    queueMicrotask(callback);
    return { unref() {} };
  };
  const retryWithObservedTimers = loadRetryHelper(immediateTimer);
  let attempts = 0;

  const result = await retryWithObservedTimers(async () => {
    attempts += 1;
    if (attempts < 5) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    return 'ok';
  }, 5);

  assert.equal(result, 'ok');
  assert.equal(attempts, 5);
  assert.deepEqual(delays, [25, 50, 100, 200]);
});
