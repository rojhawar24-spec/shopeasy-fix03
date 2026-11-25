import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allocateCouponDiscountAcrossItems, maxRefundForRequestCents, availableRefundMaximumCents } from '../src/order-return-rules.js';
import { moneyCents } from '../src/security.js';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const database = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');

test('coupon allocation exactly conserves the order discount and item net totals', () => {
  const result = allocateCouponDiscountAcrossItems({
    items: [{ id: 1, totalCents: 100 }, { id: 2, totalCents: 200 }, { id: 3, totalCents: 300 }],
    discountCents: 17
  });
  assert.ok(result);
  assert.equal(result.reduce((sum, row) => sum + row.couponShareCents, 0), 17);
  assert.equal(result.reduce((sum, row) => sum + row.netCents, 0), 583);
  assert.deepEqual(result.map(row => row.id), [1, 2, 3]);
  assert.ok(result.every(row => row.netCents >= 0 && row.couponShareCents >= 0));
});

test('coupon allocation resolves fractional minor-unit ties deterministically by item ID', () => {
  const result = allocateCouponDiscountAcrossItems({
    items: [{ id: 9, totalCents: 1 }, { id: 2, totalCents: 1 }],
    discountCents: 1
  });
  assert.deepEqual(result.map(({ id, couponShareCents, netCents }) => ({ id, couponShareCents, netCents })), [
    { id: 2, couponShareCents: 1, netCents: 0 },
    { id: 9, couponShareCents: 0, netCents: 1 }
  ]);
});

test('coupon allocation fails closed on malformed or excessive discounts', () => {
  assert.equal(allocateCouponDiscountAcrossItems({ items: [], discountCents: 0 }), null);
  assert.equal(allocateCouponDiscountAcrossItems({ items: [{ id: 1, totalCents: 10 }], discountCents: 11 }), null);
  assert.equal(allocateCouponDiscountAcrossItems({ items: [{ id: 1, totalCents: -1 }], discountCents: 0 }), null);
  assert.equal(allocateCouponDiscountAcrossItems({ items: [{ id: 1, totalCents: 10 }, { id: 1, totalCents: 10 }], discountCents: 0 }), null);
});

test('refund input is interpreted using the original order currency, not current store settings', () => {
  const start = server.indexOf("app.post('/admin/returns/:id/action'");
  const end = server.indexOf("app.get('/admin/coupons'", start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(route, /const before=await getOrderReturn\(returnId\)/);
  assert.match(route, /const currency=String\(before\.currency\|\|DEFAULT_STORE_CURRENCY\)\.toUpperCase\(\)/);
  assert.match(route, /moneyCents\(req\.body\.refundAmount,currency\)/);
  assert.doesNotMatch(route, /getSetting\('currency',DEFAULT_STORE_CURRENCY\)/);
  assert.equal(moneyCents('12.00', 'EUR'), 1200);
  assert.equal(moneyCents('12.000', 'IQD'), 12000);
});

test('recorded refunds are capped by the order item net of its coupon allocation', () => {
  const start = database.indexOf('export async function processOrderReturn(');
  const end = database.indexOf('export async function listUserOrders(', start);
  const functionSource = database.slice(start, end);
  assert.match(functionSource, /o\.discount_cents/);
  assert.match(functionSource, /allocateCouponDiscountAcrossItems/);
  assert.match(functionSource, /itemTotalCents:netItemTotalCents/);
  assert.match(functionSource, /alreadyForItem\+amount>netItemTotalCents/);
  assert.equal(maxRefundForRequestCents({ itemTotalCents: 90, purchasedQuantity: 1, requestedQuantity: 1 }), 90);
});


test('displayed refund maximum deducts prior item/order refunds and fails closed on bad ledger data', () => {
  assert.equal(availableRefundMaximumCents({requestMaximumCents:5000,itemNetTotalCents:9000,itemRefundedCents:4500,orderTotalCents:20000,orderRefundedCents:8000}), 4500);
  assert.equal(availableRefundMaximumCents({requestMaximumCents:5000,itemNetTotalCents:9000,itemRefundedCents:1000,orderTotalCents:20000,orderRefundedCents:18000}), 2000);
  assert.equal(availableRefundMaximumCents({requestMaximumCents:5000,itemNetTotalCents:9000,itemRefundedCents:9000,orderTotalCents:20000,orderRefundedCents:20000}), 0);
  assert.equal(availableRefundMaximumCents({requestMaximumCents:5000,itemNetTotalCents:9000,itemRefundedCents:-1,orderTotalCents:20000,orderRefundedCents:0}), 0);
  assert.match(database,/COALESCE\(SUM\(refund_amount_cents\),0\) AS refunded_cents/);
  assert.match(database,/availableRefundMaximumCents\(/);
});
