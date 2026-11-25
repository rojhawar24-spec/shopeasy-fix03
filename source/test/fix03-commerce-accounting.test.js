import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { allocateOrderAccounting, addAccountingAmounts } from '../src/order-accounting.js';
import { store, db, run, getRow, getRows, product, order, complete, cleanup, unique, manager } from './fix03-commerce-fixture.mjs';

test.after(cleanup);
const accounting = async () => (await store.getDashboardStats()).accounting;
const listed = async id => (await store.listProducts({ search: (await store.getProductById(id)).sku, onlyActive: false })).find(row => row.id === id);

test('COM-004 actual coupon sale yields the same 1,000 profit on dashboard and product', async () => {
  const productId = await product({ price: 10000, cost: 4000 }), code = `FIX03-COUPON-${unique()}`;
  await store.adminCreateOrUpdateCoupon({ code, type: 'percent', value: 50, minSubtotalCents: 0, active: true });
  const before = await accounting(), created = await order(productId, { coupon: code });
  await complete(created.orderId);
  const after = await accounting();
  assert.equal(created.total, 5000);
  assert.equal(after.gross_profit_cents - before.gross_profit_cents, 1000);
  assert.equal((await listed(productId)).product_gross_profit_cents, 1000);
});

test('COM-004 bundle and coupon remainders allocate fairly across products, including a filtered page', async () => {
  const a = await product({ price: 101, cost: 60 }), b = await product({ price: 103, cost: 61 }), code = `FIX03-MIXED-${unique()}`;
  await store.setSetting('feature_bundle_enabled', '1');
  await store.setSetting('bundle_rules_json', JSON.stringify([{ productIds: [a, b], discountPercent: 50 }]));
  await store.adminCreateOrUpdateCoupon({ code, type: 'fixed', value: 1, minSubtotalCents: 0, active: true });
  const before = await accounting();
  let created;
  try { created = await order(a, { items: [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }], coupon: code }); }
  finally { await store.setSetting('feature_bundle_enabled', '0'); }
  await complete(created.orderId);
  assert.equal(created.bundleDiscount, 50);
  assert.equal(created.discount, 1);
  assert.equal(created.total, 153);
  assert.equal((await accounting()).gross_profit_cents - before.gross_profit_cents, 32);
  assert.equal((await listed(a)).product_gross_profit_cents, 16);
  assert.equal((await listed(b)).product_gross_profit_cents, 16);
});

test('COM-005 included configured tax is excluded from native product and dashboard profit', async () => {
  const productId = await product({ price: 12100, cost: 5000 }), before = await accounting();
  const created = await order(productId, { taxCents: 2100, taxRateBps: 2100, taxIncluded: true });
  await complete(created.orderId);
  assert.equal((await store.getOrder(created.orderId)).product_tax_cents, 2100);
  assert.equal((await accounting()).gross_profit_cents - before.gross_profit_cents, 5000);
  assert.equal((await listed(productId)).product_gross_profit_cents, 5000);
});

test('COM-005 shipping tax is allocated separately and the numeric snapshot survives privacy minimization', async () => {
  const productId = await product({ price: 12100, cost: 5000 }), before = await accounting();
  const created = await order(productId, { shippingCents: 1210, taxCents: 2310, taxRateBps: 2100, taxIncluded: true, taxRuleSnapshot: 'BE | Synthetic City | 1000 | 21.00% | shipping taxable: yes' });
  await complete(created.orderId);
  assert.equal((await store.getOrder(created.orderId)).product_tax_cents, 2100);
  assert.equal((await accounting()).gross_profit_cents - before.gross_profit_cents, 5000);
  // A pre-migration row has no numeric snapshot; minimization must preserve it
  // before clearing the address-bearing rule text.
  await run('UPDATE orders SET product_tax_cents=NULL WHERE id=?', [created.orderId]);
  const current = await store.getOrder(created.orderId);
  await store.deleteGdprCustomerData({ email: current.email }, { actorUserId: manager.id, mode: 'minimize-retain-financial', retentionAcknowledged: true, retentionPolicyReference: 'SYNTHETIC-POLICY' });
  const retained = await store.getOrder(created.orderId);
  assert.equal(retained.tax_rule_snapshot, '');
  assert.equal(retained.product_tax_cents, 2100);
  assert.equal((await accounting()).gross_profit_cents - before.gross_profit_cents, 5000);
});

test('COM-005 exclusive tax never reduces product revenue twice; non-taxable shipping stays outside profit', async () => {
  for (const included of [false, true]) {
    const productId = await product({ price: included ? 12100 : 10000, cost: 5000 }), before = await accounting();
    const created = await order(productId, { shippingCents: 1000, taxCents: 2100, taxRateBps: 2100, taxIncluded: included, taxRuleSnapshot: 'BE | * | * | 21.00% | shipping taxable: no' });
    await complete(created.orderId);
    assert.equal((await accounting()).gross_profit_cents - before.gross_profit_cents, 5000);
    assert.equal((await listed(productId)).product_gross_profit_cents, 5000);
  }
});

test('COM-004 unknown historical cost excludes the same complete order on both reporting surfaces', async () => {
  const known = await product({ price: 100, cost: 20 }), unknown = await product({ price: 100, cost: null }), before = await accounting();
  const created = await order(known, { items: [{ productId: known, quantity: 1 }, { productId: unknown, quantity: 1 }] });
  await complete(created.orderId);
  const after = await accounting();
  assert.equal(after.gross_profit_cents, before.gross_profit_cents);
  assert.equal(after.completed_orders_missing_cost, before.completed_orders_missing_cost + 1);
  for (const id of [known, unknown]) {
    const row = await listed(id);
    assert.equal(row.product_gross_profit_cents, 0);
    assert.equal(row.sold_units_missing_cost, 1);
  }
});

test('COM-004/005 exact allocation handles minor-unit remainders, negative profit and safe-integer boundaries', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const totals = [seed * 17 + 1, seed * 13 + 2, seed * 7 + 3], subtotal = totals.reduce((sum, value) => sum + value, 0);
    const discount = seed % subtotal, tax = Math.floor((subtotal - discount) / 6);
    const items = totals.map((total, index) => ({ id: index + 1, product_id: index + 1, quantity: 1, total_cents: total, unit_cost_cents: seed * 2 + index }));
    const result = allocateOrderAccounting({ discount_cents: discount, tax_cents: tax, tax_included: 1, shipping_cents: 0 }, items);
    const expected = BigInt(subtotal) - BigInt(discount) - BigInt(tax) - items.reduce((sum, item) => sum + BigInt(item.unit_cost_cents), 0n);
    assert.equal(BigInt(result.lines.reduce((sum, line) => sum + line.grossProfitCents, 0)), expected);
  }
  const extreme = allocateOrderAccounting({ discount_cents: Number.MAX_SAFE_INTEGER - 1 }, [
    { id: 1, quantity: 1, total_cents: Number.MAX_SAFE_INTEGER - 1, unit_cost_cents: 0 },
    { id: 2, quantity: 1, total_cents: 1, unit_cost_cents: 0 }
  ]);
  assert.equal(extreme.lines.reduce((sum, line) => sum + line.netRevenueCents, 0), 1);
  assert.equal(allocateOrderAccounting({}, [{ id: 1, quantity: 1, total_cents: 0, unit_cost_cents: 1 }]).lines[0].grossProfitCents, -1);
  assert.throws(() => addAccountingAmounts(Number.MAX_SAFE_INTEGER, 1), /MONEY_OVERFLOW/);
  assert.throws(() => allocateOrderAccounting({}, [{ id: 1, quantity: 2, total_cents: 1, unit_cost_cents: Number.MAX_SAFE_INTEGER }]), /MONEY_OVERFLOW/);
});

test('PERF-001 public listing skips order history and native indexed pagination is externally bounded', () => {
  return (async () => {
    const productBase = Number((await getRow('SELECT COALESCE(MAX(id),0) AS id FROM products')).id);
    const orderBase = Number((await getRow('SELECT COALESCE(MAX(id),0) AS id FROM orders')).id);
    const tx = await db.transaction('write');
    try {
      await tx.execute(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x<5000)
        INSERT INTO products(name,slug,sku,price_cents,cost_price_cents,stock)
        SELECT 'Performance fixture '||x,'fix03-performance-'||x,'FIX03-PERF-'||x,1000+x%100,400,10 FROM seq`);
      await tx.execute(`WITH RECURSIVE seq(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM seq WHERE x<10000)
        INSERT INTO orders(email,status,payment_provider,payment_reference,subtotal_cents,total_cents,currency,shipping_name,shipping_address,shipping_city,shipping_postal_code)
        SELECT 'performance-'||x||'@example.test','completed','cash_on_delivery','cash_received:fix03-performance-'||x,1000,1000,'EUR','Synthetic','Synthetic','Synthetic','1000' FROM seq`);
      await tx.execute({ sql: `INSERT INTO order_items(order_id,product_id,product_name,sku,quantity,unit_price_cents,unit_cost_cents,total_cents)
        SELECT o.id,p.id,p.name,p.sku,1,1000,400,1000 FROM orders o JOIN products p ON p.id=?+((o.id-?-1)%5000)+1 WHERE o.id>?`, args: [productBase, orderBase, orderBase] });
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
    const plan = await getRows('EXPLAIN QUERY PLAN SELECT order_id FROM order_items WHERE product_id IN (?,?)', [productBase + 1, productBase + 2]);
    assert.match(plan.map(row => row.detail).join('\n'), /idx_order_items_product/);
    const code = `const d=await import('./src/db.js');
      const options={search:'Performance fixture',limit:24,offset:2376,sort:'price_low'};
      const begin=performance.now();const publicRows=await d.listProducts(options);const publicMs=performance.now()-begin;
      const adminRows=await d.listProducts({...options,onlyActive:false});
      console.log(JSON.stringify({publicMs,publicIds:publicRows.map(x=>x.id),adminIds:adminRows.map(x=>x.id),publicHasAnalytics:publicRows.some(x=>'product_gross_profit_cents'in x),adminHasAnalytics:adminRows.every(x=>Number.isSafeInteger(x.product_gross_profit_cents))}));await d.default.close();`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('../', import.meta.url), env: { ...process.env }, encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL' });
    assert.equal(result.error, undefined, 'catalogue subprocess must complete within its external 15-second watchdog');
    assert.equal(result.status, 0, result.stderr);
    const observed = JSON.parse(result.stdout.trim().split('\n').at(-1));
    assert.equal(observed.publicIds.length, 24);
    assert.deepEqual(observed.publicIds, observed.adminIds);
    assert.equal(observed.publicHasAnalytics, false);
    assert.equal(observed.adminHasAnalytics, true);
    assert.ok(Number.isFinite(observed.publicMs));
  })();
});
