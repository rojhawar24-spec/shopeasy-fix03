import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from '../src/password-hashing.js';
import { canCancelOpenOrder, canRequestOrderCancellation, hasPendingCancellationRequest } from '../src/order-cancellation-rules.js';
import { store, run, getRows, getRow, user, manager, bank, product, variant, order, complete, returnRequest, action, cleanup, unique } from './fix03-commerce-fixture.mjs';

test.after(cleanup);

async function receivedExchange({ stock = 10, withVariant = false, restock = true } = {}) {
  const productId = await product({ stock }), variantId = withVariant ? await variant(productId, { stock }) : null;
  const created = await order(productId, { items: [{ productId, variantId, quantity: 1 }] });
  await complete(created.orderId);
  const returnId = await returnRequest(created.orderId, { requestType: 'exchange' });
  assert.equal((await action(returnId, 'approve')).changed, true);
  assert.equal((await action(returnId, 'receive', { restock })).changed, true);
  const inventory = () => variantId ? store.getProductVariantById(variantId) : store.getProductById(productId);
  return { productId, variantId, returnId, inventory };
}

for (const withVariant of [false, true]) {
  test(`COM-003 like-for-like ${withVariant ? 'variant' : 'base product'} dispatch consumes replacement exactly once`, async () => {
    const fixture = await receivedExchange({ withVariant });
    assert.equal((await fixture.inventory()).stock, 10);
    const outcomes = await Promise.all(Array.from({ length: 5 }, () => action(fixture.returnId, 'dispatch_exchange', { refundReference: 'SYNTHETIC-TRACKING' })));
    assert.equal(outcomes.filter(result => result.changed).length, 1);
    assert.equal((await fixture.inventory()).stock, 9);
    assert.equal((await fixture.inventory()).reserved_stock, 0);
    assert.equal((await action(fixture.returnId, 'complete_exchange')).changed, true);
    assert.equal((await fixture.inventory()).stock, 9);
    assert.equal((await getRow('SELECT status FROM return_requests WHERE id=?', [fixture.returnId])).status, 'completed');
  });
}

test('COM-003 dispatch preserves stock promised to another order and rolls back transition on shortage', async () => {
  const fixture = await receivedExchange({ stock: 1, restock: true });
  await order(fixture.productId);
  assert.deepEqual(await action(fixture.returnId, 'dispatch_exchange', { refundReference: 'SYNTHETIC-TRACKING' }), { changed: false, reason: 'insufficient-stock' });
  assert.equal((await fixture.inventory()).stock, 1);
  assert.equal((await fixture.inventory()).reserved_stock, 1);
  assert.equal((await store.getOrderReturn(fixture.returnId)).status, 'item_received');
  assert.equal((await getRow('SELECT status FROM return_requests WHERE id=?', [fixture.returnId])).status, 'item_received');
});

test('COM-003 a non-restocked return still consumes a separate replacement; missing inventory cannot dispatch', async () => {
  const fixture = await receivedExchange({ stock: 3, restock: false });
  assert.equal((await fixture.inventory()).stock, 2);
  assert.equal((await action(fixture.returnId, 'dispatch_exchange', { refundReference: 'SYNTHETIC-TRACKING' })).changed, true);
  assert.equal((await fixture.inventory()).stock, 1);
  const missing = await receivedExchange({ withVariant: true });
  await run('DELETE FROM product_variants WHERE id=?', [missing.variantId]);
  assert.equal((await action(missing.returnId, 'dispatch_exchange', { refundReference: 'SYNTHETIC-TRACKING' })).changed, false);
  assert.equal((await store.getOrderReturn(missing.returnId)).status, 'item_received');
});

test('COM-003 database failure after replacement debit rolls the inventory and both return records back', async () => {
  const fixture = await receivedExchange();
  await assert.rejects(store.processOrderReturn({ returnId: fixture.returnId, action: 'dispatch_exchange', managerUserId: 999999999, refundReference: 'SYNTHETIC-TRACKING' }), /FOREIGN KEY/);
  assert.equal((await fixture.inventory()).stock, 10);
  assert.equal((await store.getOrderReturn(fixture.returnId)).status, 'item_received');
  assert.equal((await getRow('SELECT status FROM return_requests WHERE id=?', [fixture.returnId])).status, 'item_received');
});

test('COM-003 return receipt refuses inventory outside the safe integer range', async () => {
  const productId = await product(), created = await order(productId);
  await complete(created.orderId);
  const returnId = await returnRequest(created.orderId, { requestType: 'exchange' });
  await action(returnId, 'approve');
  await run('UPDATE products SET stock=? WHERE id=?', [Number.MAX_SAFE_INTEGER, productId]);
  assert.equal((await action(returnId, 'receive', { restock: true })).changed, false);
  assert.equal((await store.getProductById(productId)).stock, Number.MAX_SAFE_INTEGER);
  assert.equal((await store.getOrderReturn(returnId)).status, 'approved');
});

test('COM-008 simultaneous wishlist toggles preserve all additions from the latest stored session', async () => {
  const sessionId = await store.createSession(), ids = await Promise.all(Array.from({ length: 12 }, () => product()));
  const outcomes = await Promise.all(ids.map(id => store.toggleWishlist(sessionId, id)));
  assert.ok(outcomes.every(result => result.saved));
  assert.deepEqual(new Set((await store.getSession(sessionId)).wishlist), new Set(ids));
  await Promise.all([store.toggleWishlist(sessionId, ids[0]), store.toggleWishlist(sessionId, ids[0])]);
  assert.deepEqual(new Set((await store.getSession(sessionId)).wishlist), new Set(ids));
});

test('COM-008 stale products are pruned before capacity checks; sold-out products remain eligible', async () => {
  const sessionId = await store.createSession(), id = await product({ stock: 0 });
  await store.saveSessionWishlist(sessionId, Array.from({ length: 50 }, (_, index) => 1000000 + index));
  assert.deepEqual(await store.toggleWishlist(sessionId, id), { wishlist: [id], saved: true, count: 1, changed: true });
  await run('UPDATE products SET active=0 WHERE id=?', [id]);
  const other = await product();
  assert.deepEqual((await store.toggleWishlist(sessionId, other)).wishlist, [other]);
});

test('COM-008 full wishlist reports capacity without false success and expired session cannot mutate', async () => {
  const sessionId = await store.createSession(), ids = [];
  for (let i = 0; i < 51; i++) ids.push(await product());
  await store.saveSessionWishlist(sessionId, ids.slice(0, 50));
  const result = await store.toggleWishlist(sessionId, ids[50]);
  assert.equal(result.reason, 'limit');
  assert.equal(result.saved, false);
  assert.equal(result.count, 50);
  await run('UPDATE sessions SET expires_at=? WHERE id=?', [Date.now() - 1, sessionId]);
  assert.equal(await store.toggleWishlist(sessionId, ids[0]), null);
});

test('UI-010 shared customer policy and native writer agree across payment/status combinations', async () => {
  const productId = await product();
  const cod = await order(productId);
  assert.equal(canCancelOpenOrder(await store.getOrder(cod.orderId)), true);
  await store.setOrderStatus(cod.orderId, 'processing', manager.id);
  assert.equal(canRequestOrderCancellation(await store.getOrder(cod.orderId)), true);
  assert.equal(await store.requestOrderCancellation(cod.orderId, 'Synthetic cancel request'), true);
  assert.equal(hasPendingCancellationRequest(await store.getOrder(cod.orderId)), true);
  assert.equal(canRequestOrderCancellation(await store.getOrder(cod.orderId)), false);
  assert.equal(await store.requestOrderCancellation(cod.orderId, 'Duplicate request'), false);
  assert.equal(await store.decideOrderCancellationRequest(cod.orderId, 'rejected', manager.id), true);
  assert.equal(canRequestOrderCancellation(await store.getOrder(cod.orderId)), true);
  const bankOrder = await order(productId, { paymentProvider: 'bank_transfer', bankTransferDetails: bank });
  assert.equal(canCancelOpenOrder(await store.getOrder(bankOrder.orderId)), false);
  assert.equal(canRequestOrderCancellation(await store.getOrder(bankOrder.orderId)), true);
  assert.equal(await store.requestOrderCancellation(bankOrder.orderId, 'Check transfer before cancelling'), true);
  assert.equal(await store.confirmBankTransferOrderPaid(bankOrder.orderId, 1000, 'EUR', `FIX03-${unique()}`, manager.id), true);
  assert.equal(await store.setOrderStatus(bankOrder.orderId, 'processing', manager.id), true);
  assert.equal(canRequestOrderCancellation(await store.getOrder(bankOrder.orderId)), false);
  const mollie = await order(productId, { paymentProvider: 'mollie', paymentCredentialFingerprint: 'b'.repeat(64) });
  assert.equal(canCancelOpenOrder(await store.getOrder(mollie.orderId)), false);
  assert.equal(await store.cancelPendingOrder(mollie.orderId, 'Synthetic browser cancel', 'customer'), false);
  assert.equal(await store.requestOrderCancellation(mollie.orderId, 'Synthetic request'), false);
  assert.equal(canRequestOrderCancellation({ status: 'processing', payment_provider: 'cash_on_delivery', cancel_request_status: 'pending' }), false);
});

test('UI-RISK04 return count and offset pages use the same status filter', async () => {
  for (let i = 0; i < 5; i++) {
    const created = await order(await product());
    await complete(created.orderId);
    await returnRequest(created.orderId);
  }
  const count = await store.countOrderReturnRequests({ status: 'requested' });
  assert.equal(count, 5);
  const pages = [];
  for (let offset = 0; offset < count; offset += 2) pages.push(...await store.listOrderReturnRequests({ status: 'requested', limit: 2, offset }));
  assert.equal(pages.length, count);
  assert.equal(new Set(pages.map(row => row.id)).size, count);
  assert.ok(pages.every(row => row.status === 'requested'));
  assert.equal(await store.countOrderReturnRequests({ status: 'invalid' }), await store.countOrderReturnRequests());
});

test('SEC-004 only a Manager can approve a pending customer with a fresh server hash', async () => {
  const original = await hashPassword('Original-Synthetic-Password-1!'), replacement = await hashPassword('Replacement-Synthetic-Password-2!');
  const email = `fix03-pending-${unique()}@example.test`;
  const target = await store.createUser(email, original, 'customer', 'Synthetic Pending', null, false);
  const admin = await user('admin'), customer = await user(), active = await user();
  const sessionId = await store.createSession(target);
  await store.createEmailVerificationToken(target, `synthetic-token-${unique()}`, Date.now() + 100000);
  await run('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at_ms,created_at_ms) VALUES(?,?,?,?)', [`synthetic-reset-${unique()}`, target, Date.now() + 100000, Date.now()]);
  for (const actor of [admin.id, customer.id, -1]) assert.equal(await store.approveCustomerRegistration(target, actor, { passwordHash: replacement, expectedPendingPasswordHash: original }), false);
  for (const passwordHash of [undefined, '', original, DUMMY_PASSWORD_HASH, replacement + '$extra', replacement.replace('600000', '599999')]) assert.equal(await store.approveCustomerRegistration(target, manager.id, { passwordHash, expectedPendingPasswordHash: original }), false);
  for (const id of [active.id, admin.id, manager.id]) assert.equal(await store.approveCustomerRegistration(id, manager.id, { passwordHash: replacement, expectedPendingPasswordHash: original }), false);
  assert.equal(await store.approveCustomerRegistration(target, manager.id, { passwordHash: replacement }), false);
  assert.equal(await store.approveCustomerRegistration(target, manager.id, { passwordHash: replacement, expectedPendingPasswordHash: 'stale-hash' }), false);
  assert.equal(await store.approveCustomerRegistration(target, manager.id, { passwordHash: replacement, expectedPendingPasswordHash: original }), true);
  assert.equal(await store.approveCustomerRegistration(target, manager.id, { passwordHash: replacement, expectedPendingPasswordHash: original }), false);
  const approved = await store.getUserAuthByEmail(email);
  assert.equal(await verifyPassword('Original-Synthetic-Password-1!', approved.password_hash), false);
  assert.equal(await verifyPassword('Replacement-Synthetic-Password-2!', approved.password_hash), true);
  assert.equal(approved.email_verification_required, 0);
  assert.ok(approved.email_verified_at);
  assert.equal(await store.getSession(sessionId), null);
  assert.equal((await getRows('SELECT token_hash FROM email_verification_tokens WHERE user_id=?', [target])).length, 0);
  assert.equal((await getRows('SELECT token_hash FROM password_reset_tokens WHERE user_id=?', [target])).length, 0);
  const audit = await getRow("SELECT meta_json FROM audit_logs WHERE action='customer_registration_approved' AND target_id=?", [String(target)]);
  assert.ok(audit);
  assert.equal(audit.meta_json.includes(replacement), false);
  const listed = (await store.listCustomers({ search: email })).find(row => row.id === target);
  assert.equal(listed.email_verification_required, 0);
  assert.ok(listed.email_verified_at);
});
