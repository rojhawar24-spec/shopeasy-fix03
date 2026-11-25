import test from 'node:test';
import assert from 'node:assert/strict';
import { ORDER_EMAIL_RETRY_WINDOW_MS } from '../src/order-email-delivery-rules.js';
import { store, run, getRow, user, manager, product, order, complete, cleanup } from './fix03-commerce-fixture.mjs';

test.after(cleanup);
const fingerprint = 'a'.repeat(64);
const payload = (to, label = 'Synthetic original') => JSON.stringify({ from: 'Synthetic <orders@example.test>', to: [to], subject: label, html: `<p>${label}</p>`, text: label }, null, 2);
async function fixture() {
  const created = await order(await product());
  const current = await store.getOrder(created.orderId);
  return { id: created.orderId, email: current.email, payload: payload(current.email) };
}
const claim = (fixture, extra = {}, limit = 100) => store.claimOrderEmailDelivery(fixture.id, 'confirmation', 'confirmation', extra.email || fixture.email, limit, { payload: extra.payload || fixture.payload, providerFingerprint: extra.providerFingerprint || fingerprint });
const permitRetry = fixture => run('UPDATE order_email_deliveries SET next_attempt_at_ms=0 WHERE order_id=?', [fixture.id]);
async function reconcile(fixture, options) {
  const row=(await store.getOrderEmailDeliveries(fixture.id))[0];
  return store.reconcileOrderEmailDelivery(fixture.id,'confirmation',{expectedGeneration:Number(row.generation),expectedAttemptCount:Number(row.attempt_count),...options});
}

test('COM-007 failed delivery retries the identical payload, recipient and provider key with a new attempt token', async () => {
  const f = await fixture(), first = await claim(f);
  assert.equal(first.claimed, true);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: first.claimToken, sent: false, errorCode: 'SYNTHETIC_FAILURE' }), true);
  assert.equal((await claim(f)).reason, 'retry-later');
  await permitRetry(f);
  const changedEmail = 'changed-recipient@example.test';
  const second = await claim(f, { email: changedEmail, payload: payload(changedEmail, 'Changed store and order status') });
  assert.equal(second.claimed, true);
  assert.equal(second.attempt, 2);
  assert.equal(second.payload, f.payload);
  assert.equal(second.idempotencyKey, first.idempotencyKey);
  assert.notEqual(second.claimToken, first.claimToken);
  assert.equal((await store.getOrderEmailDeliveries(f.id))[0].recipient_email, f.email);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: first.claimToken, sent: true }), false);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: second.claimToken, sent: true, providerMessageId: 'synthetic-message' }), true);
  assert.ok((await store.getOrder(f.id)).confirmation_email_sent_at);
  assert.equal((await claim(f)).reason, 'already-sent');
});

test('COM-007 simultaneous claims and expired-lease recovery admit one sender and reject stale completion', async () => {
  const f = await fixture();
  const starts = await Promise.all(Array.from({ length: 6 }, () => claim(f)));
  assert.equal(starts.filter(result => result.claimed).length, 1);
  const original = starts.find(result => result.claimed);
  assert.ok(starts.filter(result => !result.claimed).every(result => result.reason === 'in-progress'));
  assert.equal(await reconcile(f, { managerUserId: manager.id, outcome: 'not-sent' }), false);
  await run('UPDATE order_email_deliveries SET lease_expires_at_ms=? WHERE order_id=?', [Date.now() - 1, f.id]);
  const retries = await Promise.all([claim(f), claim(f)]);
  assert.equal(retries.filter(result => result.claimed).length, 1);
  const retry = retries.find(result => result.claimed);
  assert.equal(retry.payload, original.payload);
  assert.equal(retry.idempotencyKey, original.idempotencyKey);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: original.claimToken, sent: false }), false);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: retry.claimToken, sent: true }), true);
});

test('COM-007 expired idempotency horizon requires explicit reconciliation; Manager can record observed delivery', async () => {
  const f = await fixture();
  await claim(f);
  await run('UPDATE order_email_deliveries SET first_attempt_at_ms=?,lease_expires_at_ms=0 WHERE order_id=?', [Date.now() - ORDER_EMAIL_RETRY_WINDOW_MS - 1, f.id]);
  const result = await claim(f);
  assert.equal(result.reason, 'reconciliation-required');
  assert.equal(result.reconciliationReason, 'ORDER_EMAIL_RETRY_WINDOW_EXPIRED');
  const customer = await user(), admin = await user('admin');
  for (const actor of [customer.id, admin.id]) assert.equal(await reconcile(f, { managerUserId: actor, outcome: 'sent' }), false);
  assert.equal(await reconcile(f, { managerUserId: manager.id, outcome: 'sent', providerMessageId: 'synthetic-confirmed-provider-id' }), true);
  assert.equal((await store.getOrderEmailDeliveries(f.id))[0].status, 'sent');
  assert.equal((await claim(f)).reason, 'already-sent');
});

test('COM-007 changed provider account blocks replay until Manager confirms not sent and starts a new generation', async () => {
  const f = await fixture(), first = await claim(f);
  await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: first.claimToken, sent: false });
  await permitRetry(f);
  const changed = { providerFingerprint: 'b'.repeat(64), payload: payload(f.email, 'New provider generation') };
  assert.equal((await claim(f, changed)).reconciliationReason, 'ORDER_EMAIL_PROVIDER_CHANGED');
  assert.equal(await reconcile(f, { managerUserId: manager.id, outcome: 'not-sent' }), true);
  const next = await claim(f, changed);
  assert.equal(next.claimed, true);
  assert.equal(next.attempt, 1);
  assert.equal(next.payload, changed.payload);
  assert.notEqual(next.idempotencyKey, first.idempotencyKey);
  assert.equal((await store.getOrderEmailDeliveries(f.id))[0].generation, 2);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: first.claimToken, sent: true }), false);
});

test('COM-007 reconciliation rejects missing proof and stale Manager forms after a newer uncertain attempt or generation', async () => {
  const f = await fixture(), first = await claim(f);
  await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: first.claimToken, sent: false, errorCode: 'SYNTHETIC_TIMEOUT' });
  const firstReviewed = { expectedGeneration: 1, expectedAttemptCount: 1 };
  const reconcileReviewed = (reviewed, outcome) => store.reconcileOrderEmailDelivery(f.id, 'confirmation', { managerUserId: manager.id, outcome, ...reviewed });
  for (const proof of [{}, { expectedGeneration: 1 }, { expectedAttemptCount: 1 }, { expectedGeneration: '1', expectedAttemptCount: 1 }]) {
    assert.equal(await reconcileReviewed(proof, 'not-sent'), false);
  }
  await permitRetry(f);
  const second = await claim(f);
  assert.equal(second.attempt, 2);
  await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: second.claimToken, sent: false, errorCode: 'SYNTHETIC_TIMEOUT' });
  const secondSnapshot = await getRow('SELECT * FROM order_email_deliveries WHERE order_id=?', [f.id]);
  for (const outcome of ['sent', 'not-sent']) assert.equal(await reconcileReviewed(firstReviewed, outcome), false);
  assert.deepEqual(await getRow('SELECT * FROM order_email_deliveries WHERE order_id=?', [f.id]), secondSnapshot);
  assert.equal((await store.getOrder(f.id)).confirmation_email_sent_at, null);

  const secondReviewed = { expectedGeneration: 1, expectedAttemptCount: 2 };
  assert.equal(await reconcileReviewed(secondReviewed, 'not-sent'), true);
  const third = await claim(f);
  assert.notEqual(third.idempotencyKey, first.idempotencyKey);
  await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: third.claimToken, sent: false, errorCode: 'SYNTHETIC_TIMEOUT' });
  const thirdSnapshot = await getRow('SELECT * FROM order_email_deliveries WHERE order_id=?', [f.id]);
  assert.equal(thirdSnapshot.generation, 2);
  assert.equal(thirdSnapshot.attempt_count, 1);
  for (const reviewed of [firstReviewed, secondReviewed]) {
    for (const outcome of ['sent', 'not-sent']) assert.equal(await reconcileReviewed(reviewed, outcome), false);
  }
  assert.deepEqual(await getRow('SELECT * FROM order_email_deliveries WHERE order_id=?', [f.id]), thirdSnapshot);
  assert.equal((await store.getOrder(f.id)).confirmation_email_sent_at, null);
  assert.equal(await reconcile(f, { managerUserId: manager.id, outcome: 'sent', providerMessageId: 'synthetic-confirmed-current-generation' }), true);
});

test('COM-007 retry exhaustion remains recoverable by explicit reconciliation without resetting the daily quota', async () => {
  const f = await fixture();
  const used = Number((await getRow("SELECT COALESCE(SUM(CASE WHEN attempt_day=date('now') THEN attempts_today WHEN attempt_day='' AND date(created_at)=date('now') THEN 1 ELSE 0 END),0) AS count FROM order_email_deliveries")).count);
  const limit = used + 3;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const current = await claim(f, {}, limit);
    assert.equal(current.claimed, true);
    assert.equal(current.attempt, attempt);
    assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: current.claimToken, sent: false }), true);
    await permitRetry(f);
  }
  assert.equal((await claim(f, {}, limit)).reason, 'reconciliation-required');
  assert.equal(await reconcile(f, { managerUserId: manager.id, outcome: 'not-sent' }), true);
  assert.equal((await claim(f, {}, limit)).reason, 'daily-limit');
  assert.equal((await claim(f)).claimed, true);
  assert.equal((await getRow('SELECT attempts_today FROM order_email_deliveries WHERE order_id=?', [f.id])).attempts_today, 4);
});

test('COM-007 legacy attempts lacking immutable metadata require reconciliation before any new provider call', async () => {
  const f = await fixture();
  await run("INSERT INTO order_email_deliveries(order_id,event_key,event_type,status,recipient_email) VALUES(?,'confirmation','confirmation','failed',?)", [f.id, f.email]);
  assert.equal((await claim(f)).reconciliationReason, 'ORDER_EMAIL_LEGACY_RECONCILIATION');
  assert.equal(await reconcile(f, { managerUserId: manager.id, outcome: 'not-sent' }), true);
  assert.equal((await claim(f)).claimed, true);
});

test('COM-007 malformed payload or missing attempt token cannot create or finish a delivery', async () => {
  const f = await fixture();
  for (const invalid of ['{}', '[]', '{', payload('another@example.test'), 'x'.repeat(262145)]) {
    assert.equal((await store.claimOrderEmailDelivery(f.id, 'confirmation', 'confirmation', f.email, 100, { payload: invalid, providerFingerprint: fingerprint })).reason, 'invalid');
  }
  assert.equal((await store.getOrderEmailDeliveries(f.id)).length, 0);
  const started = await claim(f);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { sent: true }), false);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: 'wrong', sent: true }), false);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: started.claimToken, sent: true }), true);
});

test('COM-007 Manager metadata never includes replay bodies, keys, fingerprints or lease secrets', async () => {
  const f = await fixture(), started = await claim(f);
  const view = (await store.getOrderEmailDeliveries(f.id))[0];
  for (const key of ['payload_json', 'payload', 'provider_idempotency_key', 'provider_fingerprint', 'claim_token']) assert.equal(key in view, false);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes(started.claimToken), false);
  assert.equal(serialized.includes(started.idempotencyKey), false);
  assert.equal(serialized.includes('Synthetic original'), false);
});

test('COM-001/007 privacy minimization scrubs persisted email replay data and invalidates an old finish token', async () => {
  const f = await fixture();
  await complete(f.id);
  const started = await claim(f);
  await store.deleteGdprCustomerData({ email: f.email }, { actorUserId: manager.id, mode: 'minimize-retain-financial', retentionAcknowledged: true, retentionPolicyReference: 'SYNTHETIC-POLICY' });
  const stored = await getRow('SELECT * FROM order_email_deliveries WHERE order_id=?', [f.id]);
  for (const key of ['recipient_email', 'payload_json', 'provider_fingerprint', 'provider_idempotency_key', 'claim_token']) assert.equal(stored[key], '');
  assert.equal(stored.needs_reconciliation, 1);
  assert.equal(await store.finishOrderEmailDelivery(f.id, 'confirmation', { claimToken: started.claimToken, sent: true }), false);
  assert.equal((await claim(f)).reason, 'reconciliation-required');
});
