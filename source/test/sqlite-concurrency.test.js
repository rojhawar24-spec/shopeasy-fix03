import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { installLocalSqliteTransactionQueue } from '../src/local-sqlite-transaction-queue.js';

// Use an isolated, real SQLite file. The transient SQLITE_BUSY is injected at
// the driver boundary deterministically; the successful attempts execute the
// real createOrderAtomic implementation against SQLite.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-sqlite-concurrency-'));
const databasePath = path.join(tempDir, 'shop.db');
for (const key of ['SHOP_DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'CLOUDFLARE_WORKER']) delete process.env[key];
process.env.DATABASE_URL = pathToFileURL(databasePath).href;

const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const retrySource = serverSource.match(/function isRetryableSqliteBusy\(error\) \{[\s\S]*?\n\}\nasync function withBusyRetry\(operation, attempts=6\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(retrySource, 'src/server.js must contain the checkout SQLITE_BUSY classifier and retry helper');
const withBusyRetry = vm.runInNewContext(`(() => { ${retrySource}; return withBusyRetry; })()`, { setTimeout });

let store;
let database;
let productId;
let checkoutResults;
const tokenA = 'sqlite-concurrency-token-checkout-a-001';
const tokenB = 'sqlite-concurrency-token-checkout-b-002';

before(async () => {
  store = await import('../src/db.js');
  database = store.default;
  const journal = await database.execute('PRAGMA journal_mode');
  assert.equal(String(journal.rows?.[0]?.journal_mode || '').toLowerCase(), 'wal',
    'file-backed SQLite must use WAL so a read lock cannot strand a COMMIT');
  productId = await store.adminCreateOrUpdateProduct({
    name: 'SQLite Concurrency Test Product',
    slug: 'sqlite-concurrency-test-product',
    shortDescription: 'Concurrency integration fixture',
    description: 'Temporary test product for simultaneous checkout transactions.',
    imageUrl: '',
    galleryImages: [],
    priceCents: 1200,
    costPriceCents: 400,
    salePriceCents: null,
    saleStart: null,
    saleEnd: null,
    automaticDiscountPercent: 0,
    sku: 'SQLITE-CONCURRENCY-001',
    stock: 2,
    reorderLevel: 0,
    categoryId: null,
    tags: 'test',
    featured: false,
    active: true,
    variants: [],
    variantOptionName: 'Size',
    variantOptionName2: ''
  });
});

after(async () => {
  try { await database?.close?.(); } catch {}
  // On Windows, SQLite sidecar/file handles can be released a moment after close.
  // Retry deletion rather than turning successful assertions into EPERM teardown failures.
  await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
});

function checkoutData(clientToken, chosenProductId = productId) {
  return {
    userId: null,
    email: 'sqlite-concurrency@example.test',
    customerPhone: '+32412345678',
    items: [{ productId: chosenProductId, quantity: 1 }],
    shipping: { name: 'Concurrent Buyer', address: '1 Test Street', city: 'Brussels', postalCode: '1000', country: 'BE' },
    shippingCents: 0,
    currency: 'EUR',
    paymentProvider: 'cash_on_delivery',
    clientToken,
    termsAcceptedAt: new Date().toISOString(),
    termsLocale: 'en',
    termsPolicyHash: 'sqlite-concurrency-test-policy'
  };
}

test('production retry helper retries BEGIN and wrapped COMMIT SQLITE_BUSY failures', async () => {
  let attempts = 0;
  const result = await withBusyRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    if (attempts === 2) throw Object.assign(new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'), { code: 'LIBSQL_ERROR' });
    return 'checkout-committed';
  }, 4);
  assert.equal(result, 'checkout-committed');
  assert.equal(attempts, 3, 'the entire checkout operation must be replayed after a wrapped COMMIT busy error');

  let exhaustedAttempts = 0;
  await assert.rejects(withBusyRetry(async () => {
    exhaustedAttempts += 1;
    throw Object.assign(new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'), { code: 'LIBSQL_ERROR' });
  }, 4), /SQLITE_BUSY/);
  assert.equal(exhaustedAttempts, 4, 'persistent checkout SQLITE_BUSY gets one initial attempt plus at most three retries');
});

test('two simultaneous local SQLite checkouts retry a wrapped SQLITE_BUSY at COMMIT', async () => {
  // Inject the same wrapped error libSQL can report at COMMIT. The transaction
  // itself, rollback, retry, order inserts, and stock reservations still use the
  // real file-backed SQLite database. This targets COMMIT specifically instead
  // of depending on platform-specific timing for an independent writer lock.
  const originalTransaction = database.transaction;
  let injectedCommitBusy = false;
  let commitBusyObserved = false;

  database.transaction = async function injectCommitBusyOnce(mode = 'write', ...args) {
    const tx = await originalTransaction.call(this, mode, ...args);
    return new Proxy(tx, {
      get(target, property) {
        if (property === 'commit') {
          return async (...commitArgs) => {
            if (!injectedCommitBusy) {
              injectedCommitBusy = true;
              commitBusyObserved = true;
              throw Object.assign(
                new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'),
                { code: 'LIBSQL_ERROR' }
              );
            }
            const commit = Reflect.get(target, property, target);
            return commit(...commitArgs);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };

  try {
    checkoutResults = await Promise.all([
      withBusyRetry(() => store.createOrderAtomic(checkoutData(tokenA)), 4),
      withBusyRetry(() => store.createOrderAtomic(checkoutData(tokenB)), 4)
    ]);
  } finally {
    database.transaction = originalTransaction;
  }

  assert.ok(commitBusyObserved, 'the wrapped SQLITE_BUSY COMMIT error must be injected');
  assert.ok(injectedCommitBusy, 'the first checkout commit must trigger the retry path');
  assert.equal(checkoutResults.length, 2);
  assert.ok(checkoutResults.every(result => Number.isInteger(result.orderId) && result.orderId > 0));
});

test('concurrent checkouts never reserve more stock than available', async () => {
  assert.ok(checkoutResults, 'the concurrent checkout test must run first');
  const query = await database.execute({sql:'SELECT stock,reserved_stock FROM products WHERE id=?',args:[productId]});
  assert.equal(query.rows.length,1,'the concurrency fixture product must still exist');
  const result=query.rows[0];
  const stock = Number(result.stock);
  const reserved = Number(result.reserved_stock);
  assert.ok(stock >= 0, `stock must be non-negative, got ${stock}`);
  assert.ok(reserved >= 0, `reserved stock must be non-negative, got ${reserved}`);
  assert.ok(reserved <= stock, `reserved stock (${reserved}) must not exceed stock (${stock})`);
  assert.equal(stock - reserved, 0, 'two successful quantity-one checkouts should reserve the two available units');
});

test('each concurrent checkout creates exactly one order and one order item', async () => {
  const tokens = [tokenA, tokenB];
  for (const token of tokens) {
    const orders = await database.execute({sql:'SELECT COUNT(*) AS count FROM orders WHERE client_token=?',args:[token]});
    assert.equal(Number(orders.rows[0]?.count), 1, `client token ${token} must resolve to exactly one order`);
    const itemRows = await database.execute({sql:'SELECT COUNT(*) AS count FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.client_token=?',args:[token]});
    assert.equal(Number(itemRows.rows[0]?.count), 1, `order token ${token} must have exactly one matching order item`);
  }
  const total = await database.execute({sql:'SELECT COUNT(*) AS count FROM orders WHERE client_token IN (?,?)',args:tokens});
  assert.equal(Number(total.rows[0]?.count), 2, 'two idempotency tokens must create exactly two orders, with no duplicate order');
});

async function createConcurrencyProduct(suffix, stock) {
  return store.adminCreateOrUpdateProduct({
    name: `SQLite Regression Product ${suffix}`,
    slug: `sqlite-regression-product-${suffix}`,
    shortDescription: 'Regression fixture',
    description: 'Temporary product for SQLite retry regression tests.',
    imageUrl: '',
    galleryImages: [],
    priceCents: 1200,
    costPriceCents: 400,
    salePriceCents: null,
    saleStart: null,
    saleEnd: null,
    automaticDiscountPercent: 0,
    sku: `SQLITE-REG-${suffix.toUpperCase()}`,
    stock,
    reorderLevel: 0,
    categoryId: null,
    tags: 'test',
    featured: false,
    active: true,
    variants: [],
    variantOptionName: 'Size',
    variantOptionName2: ''
  });
}

test('regression: two concurrent checkouts both create orders after SQLite contention', async () => {
  const id = await createConcurrencyProduct('both-orders', 2);
  const tokens = [
    'sqlite-regression-both-order-token-a-2026',
    'sqlite-regression-both-order-token-b-2026'
  ];
  const results = await Promise.all(tokens.map(token =>
    withBusyRetry(() => store.createOrderAtomic(checkoutData(token, id)), 4)
  ));
  assert.equal(results.length, 2);
  assert.ok(results.every(result => Number.isInteger(result.orderId) && result.orderId > 0));
  const rows = await database.execute({
    sql: 'SELECT client_token,COUNT(*) AS count FROM orders WHERE client_token IN (?,?) GROUP BY client_token',
    args: tokens
  });
  assert.equal(rows.rows.length, 2, 'both distinct checkouts must have persisted orders');
  assert.ok(rows.rows.every(row => Number(row.count) === 1), 'each checkout token must persist exactly one order');
});

test('regression: a transient SQLITE_BUSY from COMMIT retries COMMIT and then succeeds', async () => {
  let commitAttempts = 0;
  let rollbackAttempts = 0;
  let closeAttempts = 0;
  const client = {
    async transaction() {
      return {
        async commit() {
          commitAttempts += 1;
          if (commitAttempts === 1) {
            throw Object.assign(new Error('SQLITE_BUSY: cannot commit transaction'), { code: 'LIBSQL_ERROR' });
          }
          return { ok: true };
        },
        async rollback() { rollbackAttempts += 1; },
        async close() { closeAttempts += 1; }
      };
    }
  };
  installLocalSqliteTransactionQueue(client);
  const tx = await client.transaction('write');
  const result = await tx.commit();
  assert.deepEqual(result, { ok: true });
  assert.equal(commitAttempts, 2, 'one initial COMMIT plus one retry is expected');
  assert.equal(rollbackAttempts, 0, 'successful retry must not rollback');
  assert.equal(closeAttempts, 0, 'successful retry must not close the transaction as failed');
});

test('regression: concurrent checkouts never make stock or reserved stock negative', async () => {
  const id = await createConcurrencyProduct('single-unit', 1);
  const tokens = [
    'sqlite-regression-single-stock-token-a-2026',
    'sqlite-regression-single-stock-token-b-2026'
  ];
  const outcomes = await Promise.allSettled(tokens.map(token =>
    withBusyRetry(() => store.createOrderAtomic(checkoutData(token, id)), 4)
  ));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1,
    'only one checkout can reserve the single available unit');
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1,
    'the competing checkout must be rejected when stock is exhausted');
  const query = await database.execute({
    sql: 'SELECT stock,reserved_stock FROM products WHERE id=?', args: [id]
  });
  assert.equal(query.rows.length, 1);
  const stock = Number(query.rows[0].stock);
  const reserved = Number(query.rows[0].reserved_stock);
  assert.ok(stock >= 0, `stock must stay non-negative, got ${stock}`);
  assert.ok(reserved >= 0, `reserved stock must stay non-negative, got ${reserved}`);
  assert.ok(reserved <= stock, `reserved stock (${reserved}) cannot exceed stock (${stock})`);
});

test('regression: retrying the same client token never creates a duplicate order', async () => {
  const id = await createConcurrencyProduct('idempotent', 2);
  const token = 'sqlite-regression-idempotency-token-2026-0001';
  const first = await store.createOrderAtomic(checkoutData(token, id));
  await assert.rejects(
    store.createOrderAtomic(checkoutData(token, id)),
    error => error?.message === 'IDEMPOTENCY_EXISTS'
  );
  const orders = await database.execute({
    sql: 'SELECT COUNT(*) AS count FROM orders WHERE client_token=?', args: [token]
  });
  const items = await database.execute({
    sql: 'SELECT COUNT(*) AS count FROM order_items WHERE order_id=?', args: [first.orderId]
  });
  assert.equal(Number(orders.rows[0]?.count), 1, 'idempotency token must have exactly one order');
  assert.equal(Number(items.rows[0]?.count), 1, 'persisted order must have exactly one order item');
});

test('regression: COMMIT stops after three retries, rolls back, closes and releases the writer slot', async () => {
  let transactionNumber = 0;
  let firstCommitAttempts = 0;
  let rollbackAttempts = 0;
  let closeAttempts = 0;
  let secondTransactionCommitted = false;
  const client = {
    async transaction() {
      transactionNumber += 1;
      const number = transactionNumber;
      return {
        async commit() {
          if (number === 1) {
            firstCommitAttempts += 1;
            throw Object.assign(
              new Error('SQLITE_BUSY: cannot commit transaction - SQL statements in progress'),
              { code: 'LIBSQL_ERROR' }
            );
          }
          secondTransactionCommitted = true;
          return { ok: true };
        },
        async rollback() { if (number === 1) rollbackAttempts += 1; },
        async close() { if (number === 1) closeAttempts += 1; }
      };
    }
  };
  installLocalSqliteTransactionQueue(client);
  const failedTx = await client.transaction('write');
  await assert.rejects(failedTx.commit(), /SQLITE_BUSY/);
  assert.equal(firstCommitAttempts, 4, 'one initial COMMIT plus at most three retries');
  assert.equal(rollbackAttempts, 1, 'exhausted COMMIT retries must rollback exactly once');
  assert.equal(closeAttempts, 1, 'failed transaction must close exactly once');
  assert.equal(transactionNumber, 1, 'no extra transaction should be opened by the queue itself');

  const nextTx = await client.transaction('write');
  await nextTx.commit();
  assert.equal(secondTransactionCommitted, true, 'writer slot must be released after rollback/close');
});

