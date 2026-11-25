import test from 'node:test';
import assert from 'node:assert/strict';
import { installLocalSqliteTransactionQueue } from '../src/local-sqlite-transaction-queue.js';

function fakeClient({ failBeginAt = 0, failCommitAt = 0, failCommitTransactionAt = 0, failRollback = false } = {}) {
  let beginCount = 0;
  let commitCount = 0;
  let closeCount = 0;
  let activeWrites = 0;
  let maxActiveWrites = 0;
  const client = {
    async transaction(mode = 'write') {
      beginCount += 1;
      if (beginCount === failBeginAt) throw Object.assign(new Error('begin failed'), { code: 'SQLITE_BUSY' });
      const write = mode === 'write' || mode === 'deferred';
      if (write) {
        activeWrites += 1;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      }
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (write) activeWrites -= 1;
      };
      return {
        mode,
        async execute() { return { rows: [] }; },
        async commit() {
          commitCount += 1;
          if (commitCount === failCommitAt || (failCommitTransactionAt > 0 && beginCount === failCommitTransactionAt)) throw Object.assign(new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'), { code: 'LIBSQL_ERROR' });
          finish();
        },
        async rollback() {
          if (failRollback) throw new Error('rollback failed');
          finish();
        },
        async close() { closeCount += 1; finish(); }
      };
    },
    stats() { return { beginCount, commitCount, closeCount, activeWrites, maxActiveWrites }; }
  };
  return installLocalSqliteTransactionQueue(client);
}

test('local write transaction lifetimes never overlap and second write starts after commit', async () => {
  const client = fakeClient();
  const first = await client.transaction('write');
  let secondStarted = false;
  const secondPromise = client.transaction('write').then(tx => { secondStarted = true; return tx; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(secondStarted, false, 'second write must wait until the first transaction closes');
  await first.commit();
  const second = await secondPromise;
  assert.equal(client.stats().maxActiveWrites, 1);
  await second.commit();
  assert.equal(client.stats().activeWrites, 0);
});

test('failed native transaction start releases the slot for the next write', async () => {
  const client = fakeClient({ failBeginAt: 1 });
  await assert.rejects(client.transaction('write'), /begin failed/);
  const next = await client.transaction('write');
  await next.commit();
  assert.equal(client.stats().activeWrites, 0);
});

test('failed commit rolls back the native transaction and releases the write slot', async () => {
  const client = fakeClient({ failCommitTransactionAt: 1 });
  const first = await client.transaction('write');
  await assert.rejects(first.commit(), error => error.code === 'LIBSQL_ERROR' && /SQLITE_BUSY: cannot commit transaction - SQL statements in progress/.test(error.message) && error.retryableSqliteBusy === true);
  assert.equal(client.stats().activeWrites, 0);
  assert.equal(client.stats().commitCount, 4, 'persistent COMMIT contention must stop after the initial attempt and three retries');
  assert.equal(client.stats().closeCount, 1, 'failed commit must close its native transaction even after rollback succeeds');
  const second = await client.transaction('write');
  await second.commit();
  assert.equal(client.stats().activeWrites, 0);
});

test('failed rollback closes the native transaction before releasing the slot', async () => {
  const client = fakeClient({ failRollback: true });
  const first = await client.transaction('write');
  await assert.rejects(first.rollback(), /rollback failed/);
  assert.equal(client.stats().activeWrites, 0);
  const second = await client.transaction('write');
  await second.commit();
  assert.equal(client.stats().activeWrites, 0);
});

test('read transactions do not wait for the local write slot', async () => {
  const client = fakeClient();
  const write = await client.transaction('write');
  const read = await client.transaction('read');
  assert.equal(read.mode, 'read');
  await read.commit();
  await write.commit();
  assert.equal(client.stats().activeWrites, 0);
});

test('database adapter imports the local queue installer before applying it', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/database.js', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*installLocalSqliteTransactionQueue\s*\}\s*from\s*['"]\.\/local-sqlite-transaction-queue\.js['"]/);
  assert.ok(source.indexOf('import { installLocalSqliteTransactionQueue') < source.indexOf('installLocalSqliteTransactionQueue(rawClient)'));
});
