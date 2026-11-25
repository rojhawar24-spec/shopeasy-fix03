import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { canCancelOpenOrder, canRequestOrderCancellation } from '../src/order-cancellation-rules.js';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('checkout retries transient SQLite busy/locked errors around order creation', () => {
  const marker = "created=await withBusyRetry(() => createOrderAtomic(";
  assert.ok(server.includes(marker), 'checkout must retry transient database locks during order creation');
});

test('checkout exposes actionable messages for invalid session and quantity errors', () => {
  assert.match(server, /INVALID_IDEMPOTENCY:'Checkout session expired/);
  assert.match(server, /INVALID_QUANTITY:'Please check the product quantities/);
  assert.match(server, /logOperationalFailure\('Checkout order creation',err\)/);
});

test('checkout blocks stale stock quantities instead of silently reducing the requested order', () => {
  const cartItems = server.slice(server.indexOf('async function cartItems'), server.indexOf('async function cartSummary'));
  const cartSummary = server.slice(server.indexOf('async function cartSummary'), server.indexOf('function boundedPage'));
  const cartTemplate = fs.readFileSync(new URL('../views/cart.ejs', import.meta.url), 'utf8');

  assert.match(cartItems, /const quantity=qty;/);
  assert.doesNotMatch(cartItems, /Math\.min\(qty,availableStock\)/);
  assert.match(cartItems, /quantity_exceeds_stock/);
  assert.match(cartSummary, /hasStockIssues:stockIssues\.length>0/);
  assert.match(server, /if\(summary\.hasStockIssues&&!recoveryOrder\)return res\.redirect\(303,'\/cart\?stockMessage=changed'\)/);
  const checkoutPost=server.slice(server.indexOf("app.post('/checkout'"),server.indexOf("app.get('/checkout/success'"));
  const stockGate=checkoutPost.indexOf('if(summary.hasStockIssues&&!resumedExistingOrder)');
  assert.ok(stockGate>0, 'new checkouts retain the stock gate');
  for (const [marker, message] of [
    ['if(prior&&!ownsPrior)', 'ownership is checked before considering an existing reservation'],
    ['if(!sameIntent)', 'changed checkout intent cannot reuse a reservation'],
    ['resumedExistingOrder=existing', 'a verified existing reservation is resolved before fresh-stock checks']
  ]) {
    const position = checkoutPost.indexOf(marker);
    assert.ok(position >= 0 && position < stockGate, message);
  }
  assert.ok(stockGate<checkoutPost.indexOf('created=await withBusyRetry(() => createOrderAtomic('), 'new order creation still follows the stock gate');
  assert.match(cartTemplate, /i\.availableStock[\s\S]*available/);
  assert.match(cartTemplate, /locale==='nl'\?'Nog maar '/);
  assert.match(cartTemplate, /items\.length&&!hasStockIssues/);
});

test('non-user-triggered pending-order cancellation is attributed to the system', () => {
  const database = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  assert.match(database, /cancelPendingOrder\(id, reason='', actor='system', actorUserId=null\)/);
  assert.match(database, /order\.status==='pending'\s*&&\s*order\.payment_provider==='mollie'/, 'pending card orders are not manually canceled while a provider request may be in flight');
  assert.match(database, /Only a provider-confirmed terminal status may close it automatically/);
  assert.match(database, /rotateSessionCheckoutCredentials\(id, expectedCurrentKey=null\)/);
  assert.match(database, /AND checkout_idempotency_key=\?/);
  assert.match(server, /rotateSessionCheckoutCredentials\(req\.sessionId,activeCheckoutKey\)/, 'canceled checkout token rotation must be compare-and-swap to avoid concurrent retry races');
  assert.doesNotMatch(database, /Checkout reservation expired|Reservation expired before manager acceptance/);
  assert.doesNotMatch(server, /Expired checkout reservation/);
  assert.doesNotMatch(server, /cancelPendingOrder\(prior\.id,'Checkout cart changed before retry','system'\)/, 'a token-linked order cannot be auto-cancelled on retry after an uncertain provider result');
  assert.match(server, /cardAttemptNeedsReconciliation=Boolean\(created\?\.orderId&&selectedPaymentProvider==='mollie'\)/);
  assert.match(server, /if\(created\?\.orderId&&!cardAttemptNeedsReconciliation\) await cancelPendingOrder\(created\.orderId,'Checkout completion failed after order reservation','system'\)/, 'only a non-card order may be auto-cancelled by the generic checkout catch');
  assert.match(server, /cancelCustomerOrder\(order,reason,req\.user\.id,\{guest:false\}\)/);
  assert.match(server, /cancelPendingOrder\(order\.id,reason,'customer',userId\)/);
});


test('manager Mollie reconciliation re-fetches and validates the provider payment before any state change', () => {
  const database = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../views/admin/order.ejs', import.meta.url), 'utf8');
  assert.match(server, /app\.post\('\/admin\/orders\/reconcile-mollie-payment',requireManager,verifyCsrf/);
  assert.match(server, /getMolliePayment\(paymentId,\{apiKey:process\.env\.MOLLIE_API_KEY,nodeEnv:paymentNodeEnvironment\(\)\}\)/);
  assert.match(server, /validateMolliePaymentForOrder\(payment,candidate\)/);
  assert.match(server, /attachReconciledMolliePaymentReference\(id,payment\.id,checkoutUrl\)/);
  assert.match(database, /export async function attachReconciledMolliePaymentReference/);
  assert.match(database, /payment_credential_fingerprint TEXT NOT NULL DEFAULT ''/);
  assert.match(database, /ensureColumn\('orders','payment_credential_fingerprint'/);
  assert.match(database, /payment_credential_fingerprint,client_token/);
  assert.match(database, /PAYMENT_CREDENTIAL_FINGERPRINT_REQUIRED/);
  assert.match(server, /buildMollieCredentialFingerprint\(process\.env\.MOLLIE_API_KEY\)/);
  assert.match(server, /existing\.payment_credential_fingerprint!==currentCredentialFingerprint/);
  assert.match(server, /PAYMENT_CREDENTIAL_FINGERPRINT_REQUIRED/);
  assert.match(database, /payment_reference IS NULL OR payment_reference='' OR payment_reference=\?/);
  assert.match(view, /reconcile-mollie-payment/);
  assert.match(view, /Verify payment with Mollie/);
  assert.doesNotMatch(view, /Cancel pending order &amp; release stock/);
});


test('Mollie webhook recovers an early provider event using only validated order metadata', () => {
  const start = server.indexOf("app.post('/payments/mollie/webhook'");
  const end = server.indexOf("app.get('/checkout'", start);
  const webhook = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'webhook route must be present');
  assert.match(webhook, /payment\?\.metadata\?\.shopEasyOrderId/);
  assert.match(webhook, /candidate\.status==='pending'&&candidate\.payment_provider==='mollie'/);
  assert.match(webhook, /validateMolliePaymentForOrder\(payment,\{\.\.\.candidate,payment_reference:paymentId\}\)/);
  assert.match(webhook, /attachReconciledMolliePaymentReference\(candidate\.id,paymentId,checkoutUrl\)/);
  assert.match(webhook, /Mollie webhook order lookup\/recovery/);
  assert.match(webhook, /No verified matching order means there is no safe mutation/);
});


test('Mollie paid callbacks do not fail after fulfilment has advanced beyond paid', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const start = server.indexOf('async function applyMolliePaymentState');
  const end = server.indexOf('async function storeLaunchConfig', start);
  const apply = server.slice(start, end);
  assert.match(apply, /if\(\['paid','processing','shipped','completed'\]\.includes\(String\(order\.status\|\|''\)\)\) return 'paid'/);
  assert.match(apply, /refreshMollieFinancialSnapshot\(order,payment,null\)/);
});

test('Manager reconciliation accepts authorized payments but never treats them as paid', () => {
  const start = server.indexOf("app.post('/admin/orders/reconcile-mollie-payment'");
  const end = server.indexOf("app.post('/admin/orders/confirm-legacy-cod'", start);
  const route = server.slice(start, end);
  assert.match(route, /'open','pending','authorized','paid','canceled','expired','failed'/);
  assert.match(server, /\['paid','pending','authorized','canceled','expired','failed'\]\.includes/);
  const paymentService = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(paymentService, /if\(\['open','pending'\]\.includes\(state\)\) return 'pending'/);
  assert.match(paymentService, /if\(state==='authorized'\) return 'authorized'/);
});


test('early webhook recovery can safely fill the same payment reference URL without overwriting another attempt', () => {
  const database = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  const start = database.indexOf('export async function updatePendingOrderPaymentDetails');
  const end = database.indexOf('export async function attachReconciledMolliePaymentReference', start);
  const update = database.slice(start, end);
  assert.match(update, /payment_reference IS NULL OR payment_reference='' OR payment_reference=\?/);
  assert.match(update, /payment_url IS NULL OR payment_url='' OR payment_url=\?/);
  assert.match(update, /existing\.payment_reference===safeReference&&existing\.payment_url===parsedUrl\.toString\(\)/);
  assert.match(server, /paymentAlreadyResolved=Boolean\(currentOrder&&/);
  assert.match(server, /currentOrder\.payment_reference===payment\.id/);
  assert.match(server, /if\(paymentAlreadyResolved\) return res\.redirect\(303,`\/checkout\/success\?order=\$\{created\.orderId\}`\)/);
});


test('processing cancellation requests are limited to unpaid COD and Manager can review them', () => {
  const database = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  const accountView = fs.readFileSync(new URL('../views/order.ejs', import.meta.url), 'utf8');
  const managerView = fs.readFileSync(new URL('../views/admin/order.ejs', import.meta.url), 'utf8');
  const start = database.indexOf('export async function requestOrderCancellation');
  const end = database.indexOf('export async function decideOrderCancellationRequest', start);
  const request = database.slice(start, end);
  assert.match(request, /status='processing' AND payment_provider='cash_on_delivery'/);
  assert.match(request, /status='pending' AND payment_provider='bank_transfer'/);
  assert.doesNotMatch(request, /status='processing' OR/);
  assert.match(request, /canRequestOrderCancellation\(order\)/);
  assert.match(accountView, /canRequestOrderCancellation\(order\)/);
  assert.match(accountView, /canCancelOpenOrder\(order\)/);
  assert.equal(canRequestOrderCancellation({status:'processing',payment_provider:'cash_on_delivery'}),true);
  assert.equal(canRequestOrderCancellation({status:'pending',payment_provider:'bank_transfer'}),true);
  for(const provider of ['mollie','bank_transfer','gift_card']) assert.equal(canRequestOrderCancellation({status:'processing',payment_provider:provider}),false);
  assert.equal(canRequestOrderCancellation({status:'processing',payment_provider:'cash_on_delivery',cancellation_requested_at:'2026-11-24',cancellation_request_decision:'pending'}),false);
  assert.equal(canCancelOpenOrder({status:'pending',payment_provider:'mollie'}),false);
  assert.match(managerView, /order\.status === 'processing' && order\.cancellation_requested_at && order\.cancellation_request_decision === 'pending'/);
  assert.match(managerView, /Approve cancellation &amp; release stock/);
  assert.match(managerView, /Do not cancel or release stock until the payment has been refunded/);
});
