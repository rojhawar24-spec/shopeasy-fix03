import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { store, db, run, getRow, getRows, product, order, complete, cleanup } from './fix03-commerce-fixture.mjs';

test.after(cleanup);

test('COM-005/007 PERF-001 forward upgrade preserves legacy orders and delivery rows, then restores indexed queries', async () => {
  const productId = await product({ price: 12100, cost: 5000 });
  const created = await order(productId, { taxIncluded: true, taxCents: 2100, taxRateBps: 2100 });
  await complete(created.orderId);
  const current = await store.getOrder(created.orderId);
  await run("INSERT INTO order_email_deliveries(order_id,event_key,event_type,status,recipient_email,error_code) VALUES(?,'confirmation','confirmation','failed',?,'LEGACY_FAILURE')", [created.orderId, current.email]);
  // Reconstruct the pre-fix schema while keeping native data and all unrelated
  // tables/triggers. The next isolated process must apply real startup migrations.
  for (const name of ['payload_json', 'provider_fingerprint', 'provider_idempotency_key', 'claim_token', 'attempt_count', 'first_attempt_at_ms', 'lease_expires_at_ms', 'next_attempt_at_ms', 'attempt_day', 'attempts_today', 'needs_reconciliation', 'generation']) {
    await db.execute(`ALTER TABLE order_email_deliveries DROP COLUMN ${name}`);
  }
  await db.execute('ALTER TABLE orders DROP COLUMN product_tax_cents');
  await db.execute('DROP INDEX idx_order_items_product');
  const code = `const d=await import('./src/db.js');const order=await d.getOrder(${created.orderId});
    const stats=await d.getDashboardStats();const emails=await d.getOrderEmailDeliveries(${created.orderId});
    const index=(await d.default.execute("PRAGMA index_list(order_items)")).rows.some(x=>x.name==='idx_order_items_product');
    console.log(JSON.stringify({total:order.total_cents,productTax:order.product_tax_cents,profit:stats.accounting.gross_profit_cents,email:emails[0],index}));await d.default.close();`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('../', import.meta.url), env: { ...process.env }, encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL' });
  assert.equal(result.error, undefined, 'migration child must complete within its external watchdog');
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(observed.total, 12100);
  assert.equal(observed.productTax, null);
  assert.equal(observed.profit, 5000);
  assert.equal(observed.email.error_code, 'LEGACY_FAILURE');
  assert.equal(observed.email.status, 'failed');
  assert.equal(observed.email.attempt_count, 1);
  assert.equal(observed.index, true);
  assert.equal((await getRow('SELECT COUNT(*) AS count FROM order_email_deliveries')).count, 1);
  assert.deepEqual(await getRows('PRAGMA foreign_key_check'), []);
});
