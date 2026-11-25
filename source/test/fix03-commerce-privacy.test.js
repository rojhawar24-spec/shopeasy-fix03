import test from 'node:test';
import assert from 'node:assert/strict';
import { store, run, getRows, getRow, user, manager, bank, product, order, complete, returnRequest, action, cleanup, unique } from './fix03-commerce-fixture.mjs';

test.after(cleanup);
const privacyOptions = mode => ({ actorUserId: manager.id, mode, retentionAcknowledged: true, retentionPolicyReference: 'SYNTHETIC-RETENTION-POLICY' });

for (const mode of ['delete', 'minimize-retain-financial']) {
  test(`COM-001 ${mode} preserves a pending Mollie payment and its last-unit reservation`, async () => {
    const customer = await user(), productId = await product({ stock: 1 });
    const created = await order(productId, { userId: customer.id, email: customer.email, paymentProvider: 'mollie', paymentCredentialFingerprint: 'a'.repeat(64) });
    const reference = `tr_Fix03Privacy${unique()}`;
    await store.updatePendingOrderPaymentDetails(created.orderId, 'mollie', reference, 'https://checkout.mollie.com/synthetic');
    await assert.rejects(store.deleteGdprCustomerData({ customerId: customer.id }, privacyOptions(mode)), /GDPR_OPEN_ORDERS/);
    assert.equal((await store.getOrder(created.orderId)).payment_reference, reference);
    assert.ok(await store.getUserById(customer.id));
    assert.equal((await store.getProductById(productId)).reserved_stock, 1);
    await assert.rejects(order(productId), /INSUFFICIENT_STOCK/);
    // Synthetic provider confirmation remains matchable after rejected deletion.
    assert.equal(await store.markProviderOrderPaid(created.orderId, 'mollie', reference, 1000, 'EUR'), true);
    assert.equal((await store.getOrder(created.orderId)).status, 'paid');
  });

  test(`COM-001 ${mode} rejects open after-sales records without partial deletion`, async () => {
    const customer = await user(), productId = await product();
    const created = await order(productId, { userId: customer.id, email: customer.email });
    await complete(created.orderId);
    const returnId = await returnRequest(created.orderId);
    const before = await store.getProductById(productId);
    await assert.rejects(store.deleteGdprCustomerData({ customerId: customer.id }, privacyOptions(mode)), /GDPR_OPEN_RETURNS/);
    assert.equal((await store.getOrder(created.orderId)).email, customer.email);
    assert.equal((await store.getOrderReturn(returnId)).status, 'requested');
    assert.equal((await store.getProductById(productId)).stock, before.stock);
    assert.equal((await action(returnId, 'reject')).changed, true);
    const result = await store.deleteGdprCustomerData({ customerId: customer.id }, privacyOptions(mode));
    assert.equal(result.accountDeleted, true);
    if (mode === 'delete') assert.equal(await store.getOrder(created.orderId), null);
    else assert.equal((await store.getOrder(created.orderId)).total_cents, 1000);
    assert.equal((await store.getProductById(productId)).stock, before.stock);
  });
}

test('COM-001 full deletion preserves a paid bank order, session and stock', async () => {
  const customer = await user(), productId = await product();
  const session = await store.createSession(customer.id);
  const created = await order(productId, { userId: customer.id, email: customer.email, paymentProvider: 'bank_transfer', bankTransferDetails: bank });
  const reference = `FIX03-PAID-${unique()}`;
  assert.equal(await store.confirmBankTransferOrderPaid(created.orderId, 1000, 'EUR', reference, manager.id), true);
  const before = await store.getProductById(productId);
  await assert.rejects(store.deleteGdprCustomerData({ customerId: customer.id }, privacyOptions('delete')), /GDPR_OPEN_ORDERS/);
  assert.equal((await store.getOrder(created.orderId)).status, 'paid');
  assert.ok(await store.getSession(session));
  assert.equal((await store.getProductById(productId)).reserved_stock, before.reserved_stock);
});

test('COM-001 guest COD deletion requires normal cancellation; it never releases stock itself', async () => {
  const productId = await product({ stock: 1 }), email = `fix03-guest-${unique()}@example.test`;
  const created = await order(productId, { email });
  await assert.rejects(store.deleteGdprCustomerData({ email }, privacyOptions('delete')), /GDPR_OPEN_ORDERS/);
  assert.equal((await store.getProductById(productId)).reserved_stock, 1);
  assert.equal(await store.cancelPendingOrder(created.orderId, 'Synthetic confirmed cancellation'), true);
  const result = await store.deleteGdprCustomerData({ email }, privacyOptions('delete'));
  assert.equal(result.ordersDeleted, 1);
  assert.equal((await store.getProductById(productId)).stock, 1);
  assert.equal((await store.getProductById(productId)).reserved_stock, 0);
});

test('COM-001 full deletion still protects gift-card ledger and unfinished shipment', async () => {
  await store.setSetting('feature_gift_cards_enabled', '1');
  const customer = await user(), productId = await product();
  const card = await store.issueGiftCard({ amountCents: 1000, currency: 'EUR', managerId: manager.id });
  const created = await order(productId, { userId: customer.id, email: customer.email, paymentProvider: 'gift_card', giftCardCode: card.code });
  await assert.rejects(store.deleteGdprCustomerData({ customerId: customer.id }, privacyOptions('delete')), /GDPR_FINANCIAL_RETENTION_REQUIRED/);
  assert.equal((await getRow('SELECT COUNT(*) AS count FROM gift_card_ledger WHERE order_id=?', [created.orderId])).count, 1);
  const other = await user(), pending = await order(productId, { userId: other.id, email: other.email });
  await store.setOrderStatus(pending.orderId, 'processing', manager.id);
  await store.setOrderStatus(pending.orderId, 'shipped', manager.id);
  await assert.rejects(store.deleteGdprCustomerData({ customerId: other.id }, privacyOptions('delete')), /GDPR_OPEN_ORDERS/);
  assert.equal((await store.getOrder(pending.orderId)).status, 'shipped');
});

test('COM-001 native integrity and foreign keys hold after rejected and permitted privacy actions', async () => {
  assert.deepEqual(await getRows('PRAGMA foreign_key_check'), []);
  assert.equal((await getRow('PRAGMA integrity_check')).integrity_check, 'ok');
});
