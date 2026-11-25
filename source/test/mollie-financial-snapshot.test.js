import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseMollieFinancialSnapshot } from '../src/services/payment-providers.js';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Mollie financial snapshot parses refunds and chargebacks in the order currency', () => {
  assert.deepEqual(parseMollieFinancialSnapshot({
    amountRefunded:{currency:'EUR',value:'12.34'},
    amountChargedBack:{currency:'EUR',value:'2.50'}
  }, 'EUR'), {refundedCents:1234,chargedBackCents:250});
});

test('Mollie financial snapshot preserves a missing refund total and treats absent chargeback amount as zero', () => {
  assert.deepEqual(parseMollieFinancialSnapshot({status:'paid'}, 'EUR'), {refundedCents:null,chargedBackCents:0});
});

test('Mollie financial snapshot preserves provider-reported refund above the original payment amount', () => {
  // Mollie documents that amountRefunded may exceed amount for return-shipping reimbursement.
  assert.deepEqual(parseMollieFinancialSnapshot({
    amountRefunded:{currency:'EUR',value:'105.00'},
    amountChargedBack:{currency:'EUR',value:'0.00'}
  }, 'EUR'), {refundedCents:10500,chargedBackCents:0});
  const db=read('../src/db.js');
  assert.match(db,/Mollie explicitly allows amountRefunded to exceed the original payment/);
  assert.doesNotMatch(db,/refundedCents!==null&&refundedCents>total/);
});

test('Mollie financial snapshot correctly handles zero-decimal currencies', () => {
  assert.deepEqual(parseMollieFinancialSnapshot({
    amountRefunded:{currency:'JPY',value:'10'},
    amountChargedBack:{currency:'JPY',value:'0'}
  }, 'JPY'), {refundedCents:10,chargedBackCents:0});
});

test('Mollie financial snapshot rejects currency mismatch, malformed amounts, and unsupported currency', () => {
  assert.throws(() => parseMollieFinancialSnapshot({amountRefunded:{currency:'USD',value:'1.00'}}, 'EUR'), /FINANCIAL_CURRENCY_MISMATCH/);
  assert.throws(() => parseMollieFinancialSnapshot({amountChargedBack:{currency:'EUR',value:'-1.00'}}, 'EUR'), /FINANCIAL_AMOUNT_INVALID|PAYMENT_AMOUNT_INVALID/);
  assert.throws(() => parseMollieFinancialSnapshot({amountRefunded:{currency:'EUR',value:'1.001'}}, 'EUR'), /PAYMENT_AMOUNT_INVALID/);
  assert.throws(() => parseMollieFinancialSnapshot({}, 'IQD'), /PAYMENT_CURRENCY_UNSUPPORTED/);
});

test('Mollie financial amounts are persisted only after order/payment validation and visible in manager order page', () => {
  const providers=read('../src/services/payment-providers.js');
  const db=read('../src/db.js');
  const server=read('../src/server.js');
  const schema=db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS orders'),db.indexOf('CREATE INDEX IF NOT EXISTS idx_orders_user_created'));
  const apply=server.slice(server.indexOf('async function applyMolliePaymentState'),server.indexOf('async function storeLaunchConfig'));
  const view=read('../views/admin/order.ejs');
  assert.match(schema,/provider_amount_refunded_cents INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema,/provider_amount_charged_back_cents INTEGER NOT NULL DEFAULT 0/);
  assert.match(db,/ensureColumn\('orders','provider_financials_checked_at'/);
  assert.match(db,/PAYMENT_PROVIDER_FINANCIAL_AMOUNT_EXCEEDS_ORDER/);
  assert.match(db,/String\(order\.currency\|\|''\)\.trim\(\)\.toUpperCase\(\)!==expectedCurrency/);
  assert.match(server,/if\(!validateMolliePaymentForOrder\(payment,order\)\) throw new Error\('PAYMENT_REFERENCE_MISMATCH'\);[\s\S]*?parseMollieFinancialSnapshot/);
  assert.match(apply,/refreshMollieFinancialSnapshot\(order,payment,null\)/);
  assert.match(server,/app\.post\('\/admin\/orders\/refresh-mollie-financials',requireManager,verifyCsrf/);
  assert.match(server,/refreshMollieFinancialSnapshot\(order,payment,req\.user\.id\)/);
  assert.match(server,/await getMolliePayment\(order\.payment_reference,/);
  assert.match(server.slice(server.indexOf('async function refreshMollieFinancialSnapshot'),server.indexOf('async function applyMolliePaymentState')),/provider_payment_financials_changed/);
  assert.match(view,/class="btn btn-dark">Refresh Mollie financial status/);
  assert.match(view,/Provider-reported refund total/);
  assert.match(view,/Provider-reported chargeback total/);
  assert.match(view,/does not automatically change the order status/);
  assert.match(providers,/export function parseMollieFinancialSnapshot/);
});
