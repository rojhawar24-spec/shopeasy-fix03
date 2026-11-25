import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';
import { parseLocalRedirect } from '../src/local-navigation.js';
import { canCancelOpenOrder, canRequestOrderCancellation, hasPendingCancellationRequest } from '../src/order-cancellation-rules.js';

const source = name => fs.readFileSync(new URL(`../views/${name}.ejs`, import.meta.url), 'utf8');
const view = (name, locals = {}) => ejs.render(source(name), { include: () => '', ...locals });
const plain = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const item = (id, size) => ({ id, product_name: 'Home', variant_name: 'Colour', variant_value: 'Red', variant_name_2: 'Size', variant_value_2: size, quantity: 1 });
const items = [item(1, 'Small'), item(2, 'Large')];
const common = {
  locale: 'en', customerText: value => value, csrf: 'synthetic-csrf', currency: 'EUR', storeTimeZone: 'UTC',
  formatPrice: value => String(value), formatMoneyInput: value => String(value), formatDateTimeDisplay: value => value || '',
  formatRelativeTime: value => value, safeImageUrl: value => value, orderHistory: [], returns: [],
  cancelResult: '', returnResult: '', bankTransferInfo: null, isGuestOrder: false, isOwner: true,
  providerPaymentMessage: 'pending', cancelled: false,
  canCancelOpenOrder, canRequestOrderCancellation, hasPendingCancellationRequest, parseLocalRedirect
};
const order = (status, provider, more = {}) => ({ id: 1, user_id: 1, status, payment_provider: provider,
  items: [], currency: 'EUR', created_at: '2026-11-24T00:00:00Z', total_cents: 1000,
  subtotal_cents: 1000, shipping_cents: 0, shipping_name: 'Test customer', ...more });

test('FIX03 UI-006: checkout renders both option axes for otherwise identical items', () => {
  const template = source('checkout'), start = template.indexOf('<div class="checkout-summary-products">');
  const end = template.indexOf('<div class="rule">', start);
  const summary = { items: items.map(i => ({ product: { name: i.product_name, image_url: '/assets/product-placeholder.svg' },
    variant: { option_name: i.variant_name, option_value: i.variant_value, option_name_2: i.variant_name_2, option_value_2: i.variant_value_2 },
    quantity: 1, automaticDiscountPercent: 0, total: 1000 })) };
  const html = ejs.render(template.slice(start, end), { ...common, summary });
  assert.match(plain(html), /Colour: Red · Size: Small/); assert.match(plain(html), /Colour: Red · Size: Large/);
});
test('FIX03 UI-006: guest lookup and return selector preserve full purchased variant identity', () => {
  const html = view('order-lookup', { ...common, order: order('completed', 'cash_on_delivery', { items, returnable: true }), error: '', lookupEmail: 'guest@example.test' });
  const labels = [...html.matchAll(/<option value="[12]"[^>]*>([\s\S]*?)<\/option>/g)].map(match => plain(match[1]));
  assert.equal(labels.length, 2); assert.match(labels[0], /Colour: Red · Size: Small/); assert.match(labels[1], /Colour: Red · Size: Large/);
  const list = html.match(/<ul>([\s\S]*?)<\/ul>/)[1];
  assert.match(plain(list), /Size: Small/); assert.match(plain(list), /Size: Large/);
});
test('FIX03 UI-006: quick-restock names and accessible descriptions distinguish both axes and SKU', () => {
  const template = source('admin/product-form').split('\n').find(line => line.includes('class="form-section restock-panel"'));
  const html = ejs.render(template, { currentVariants: items.map(i => ({ id: i.id, option_name: i.variant_name,
    option_value: i.variant_value, option_name_2: i.variant_name_2, option_value_2: i.variant_value_2, sku: `RED-${i.variant_value_2}`, available_stock: 5, reserved_stock: 1 })),
    product: { id: 1 }, csrf: common.csrf, restockErrorSafe: null, restockedSafe: false });
  assert.match(plain(html), /Colour: Red · Size: Small · RED-Small/); assert.match(plain(html), /Colour: Red · Size: Large · RED-Large/);
  for (const id of [1, 2]) { assert.ok(html.includes(`id="restock-variant-${id}"`)); assert.ok(html.includes(`aria-describedby="restock-variant-${id}"`)); }
});
test('FIX03 UI-006: account and confirmation return selectors retain their complete-label controls', () => {
  for (const page of ['order', 'success']) {
    const fragment = source(page).match(/<select name="orderItemId"[\s\S]*?<\/select>/)[0];
    const html = ejs.render(fragment, { ...common, order: { items }, copy: { returnItem: 'Item' } });
    assert.match(plain(html), /Size: Small/); assert.match(plain(html), /Size: Large/);
  }
});
test('FIX03 UI-005: merchant brand, legal name and category fragments are explicitly protected', () => {
  const fragments = [
    [source('partials/header').match(/<span class="brand-word"[\s\S]*?<\/span>/)[0], { storeName: 'Home' }],
    [source('partials/footer').match(/<strong[^>]*><%= storeName %><\/strong>/)[0], { storeName: 'Home' }],
    [source('partials/footer').match(/<strong[^>]*><%= legalName %><\/strong>/)[0], { legalName: 'Home' }],
    [source('product').match(/<span class="eyebrow"[^>]*><%= product.category_name %><\/span>/)[0], { product: { category_name: 'Home' } }]
  ];
  for (const [fragment, locals] of fragments) {
    const html = ejs.render(fragment, locals);
    assert.match(html, /translate="no"/); assert.match(html, /data-no-translate/); assert.equal(plain(html), 'Home');
  }
});
test('FIX03 UI-008: safe back targets keep queries and fragments and use their pathname label', () => {
  for (const target of ['/login?next=%2Fproduct%2Faudit-shirt', '/shop?search=red%20shoe#results', '/a/../login?next=%2Fshop']) {
    const html = view('partials/back-button', { locale: 'en', fallback: target, parseLocalRedirect });
    const href = html.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
    const expected = parseLocalRedirect(target);
    assert.equal(href, expected.pathname + expected.search + expected.hash);
    if (expected.pathname === '/login') assert.match(plain(html), /Back to sign in/);
  }
});
test('FIX03 UI-008: cross-origin, normalized protocol-relative and control-character back targets fail closed', () => {
  for (const target of ['https://untrusted.invalid/', '//untrusted.invalid/', '/\\untrusted.invalid/', '/a/..//untrusted.invalid', '/%2e//untrusted.invalid', '/a/%2e%2e//untrusted.invalid', '/\tuntrusted.invalid']) {
    const html = view('partials/back-button', { locale: 'en', fallback: target, parseLocalRedirect });
    assert.match(html, /href="\/shop"/);
  }
});
test('FIX03 UI-009: both directions preserve product status, category and encoded search', () => {
  const html = view('admin/products', { products: [], categories: [], search: 'red & blue', category: 'summer', status: 'archived', page: 2, total: 101, hasPrev: true, hasNext: true, notice: null, locale: 'en', user: { role: 'manager' } });
  const links = [...html.matchAll(/href="(\/admin\/products\?page=[^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&'), 'https://test.invalid'));
  assert.deepEqual(links.map(url => url.searchParams.get('page')), ['1', '3']);
  for (const url of links) { assert.equal(url.searchParams.get('status'), 'archived'); assert.equal(url.searchParams.get('search'), 'red & blue'); assert.equal(url.searchParams.get('category'), 'summer'); }
});
test('FIX03 UI-010: account and guest confirmation actions follow the shared cancellation policy', () => {
  const cases = [['pending', 'cash_on_delivery', true], ['pending', 'bank_transfer', true], ['pending', 'mollie', false],
    ['processing', 'cash_on_delivery', true], ['processing', 'bank_transfer', false], ['processing', 'mollie', false],
    ['processing', 'gift_card', false], ['paid', 'mollie', false], ['shipped', 'cash_on_delivery', false], ['completed', 'cash_on_delivery', false]];
  for (const [status, provider, formExpected] of cases) {
    const current = order(status, provider);
    for (const page of ['order', 'success']) {
      const html = view(page, { ...common, order: current, isGuestOrder: page === 'success' });
      assert.equal(/action="(?:\/account\/order\/1\/cancel|\/checkout\/success\/cancel)"/.test(html), formExpected, `${page} ${status} ${provider}`);
    }
  }
});
test('FIX03 UI-010: actual pending requests suppress duplicate forms, while rejected requests may be resubmitted', () => {
  for (const decision of ['pending', 'rejected']) {
    const current = order('processing', 'cash_on_delivery', { cancellation_requested_at: '2026-11-24T00:00:00Z', cancellation_request_decision: decision });
    for (const page of ['order', 'success']) {
      const html = view(page, { ...common, order: current });
      assert.equal(/action="\/account\/order\/1\/cancel"/.test(html), decision === 'rejected', `${page}: ${decision}`);
    }
  }
});
test('FIX03 UI-010: stale request-notice parameters cannot claim an unrecorded cancellation request', () => {
  for (const page of ['order', 'success']) {
    const html = view(page, { ...common, order: order('processing', 'mollie'), cancelResult: 'already-requested' });
    assert.match(plain(html), /order status changed/i);
    assert.doesNotMatch(plain(html), /already (?:requested cancellation|being reviewed)/i);
  }
});
test('FIX03 UI-011: local recovery composes with exactly one main-content target', () => {
  const main = source('partials/header').split('\n').find(line => line.startsWith('<main '));
  const html = view('local-manager-recovery', { title: 'Local Manager recovery', error: null, success: null, managerFound: true,
    managerName: 'Test Manager', managerEmail: 'manager@example.test', loginStatus: 'Available', csrf: common.csrf,
    include: name => name === 'partials/header' ? ejs.render(main, { isAdminRoute: false }) : '' });
  assert.equal([...html.matchAll(/\bid="main-content"/g)].length, 1);
});
test('FIX03 UI-RISK-03: shipping meter has a stable visible name and threshold description', () => {
  const fragment = source('cart').split('\n').find(line => line.includes('if(appearance.freeShipping'));
  const html = ejs.render(fragment, { ...common, appearance: { freeShipping: true, freeShippingMinimum: 1000 }, items: [{}], subtotal: 500 });
  assert.match(html, /<strong id="shipping-progress-label">Progress toward/);
  assert.match(html, /<meter aria-labelledby="shipping-progress-label" aria-describedby="shipping-progress-detail" min="0" max="1000" value="500"/);
  assert.match(html, /id="shipping-progress-detail"/); assert.match(plain(html), /Threshold: 1000/);
});
function returnRecord(id) {
  return { id, order_id: id, product_name: `Product ${id}`, variant_name: 'Colour', variant_value: 'Red', variant_name_2: 'Size', variant_value_2: 'Large',
    customer_email: 'synthetic@example.test', created_at: '2026-11-24T00:00:00Z', status: 'completed', request_type: 'return', quantity: 1, purchased_quantity: 1,
    unit_price_cents: 1000, currency: 'EUR', total_cents: 1000, reason: 'Synthetic fixture' };
}
test('FIX03 UI-RISK-04: the 101st filtered return remains reachable through page links', () => {
  const all = Array.from({ length: 101 }, (_, i) => returnRecord(101 - i));
  const locals = { ...common, user: { role: 'manager' }, resultMessage: '', status: 'completed', pageSize: 100, total: 101, pages: 2 };
  const first = view('admin/returns', { ...locals, returns: all.slice(0, 100), page: 1 });
  const second = view('admin/returns', { ...locals, returns: all.slice(100), page: 2 });
  assert.equal([...first.matchAll(/class="panel section-topless returns-request-card"/g)].length, 100);
  assert.match(first, /rel="next" href="\/admin\/returns\?page=2&amp;pageSize=100&amp;status=completed"/);
  assert.match(second, /id="return-title-1"/);
  assert.match(second, /rel="prev" href="\/admin\/returns\?page=1&amp;pageSize=100&amp;status=completed"/);
  assert.doesNotMatch(second, /rel="next"/); assert.match(plain(second), /1 of 101 shown/);
});
test('FIX03 UI-RISK-04: an empty queue has a recoverable filter and page 1 of 1', () => {
  const html = view('admin/returns', { ...common, user: { role: 'manager' }, resultMessage: '', status: 'requested', returns: [], page: 1, pageSize: 100, total: 0, pages: 1 });
  assert.match(plain(html), /No return requests/); assert.match(plain(html), /Page 1 of 1/); assert.doesNotMatch(html, /rel="(?:prev|next)"/);
});
test('FIX03 COM-003 UI: replacement dispatch identifies the unchanged variant and stock debit', () => {
  const row = { ...returnRecord(1), status: 'item_received', request_type: 'exchange' };
  const html = view('admin/returns', { ...common, user: { role: 'manager' }, resultMessage: '', status: 'item_received', returns: [row], page: 1, pageSize: 100, total: 1, pages: 1 });
  assert.match(plain(html), /same product and variant/); assert.match(plain(html), /deducts this quantity/);
  assert.match(plain(html), /Product 1 · Colour: Red · Size: Large × 1/);
});
const customerLocals = {
  ...common, user: { role: 'manager' }, search: '', total: 3, page: 1, hasPrev: false, hasNext: false,
  customers: [
    { id: 1, email: 'pending@example.test', created_at: '', email_verification_required: 1, email_verified_at: null, password_hash: 'NEVER-RENDER-THIS' },
    { id: 2, email: 'verified@example.test', created_at: '', email_verification_required: 1, email_verified_at: '2026-11-24' },
    { id: 3, email: 'existing@example.test', created_at: '', email_verification_required: 0, email_verified_at: null }
  ]
};
test('FIX03 SEC-004 UI: only pending ownership records offer Manager approval with new blank password fields', () => {
  const html = view('admin/customers', customerLocals);
  assert.equal([...html.matchAll(/action="\/admin\/customers\/\d+\/approve-registration"/g)].length, 1);
  assert.match(html, /action="\/admin\/customers\/1\/approve-registration"/);
  assert.match(html, /name="identityConfirmed" value="yes" required/);
  for (const name of ['password', 'confirmPassword']) {
    const tag = html.match(new RegExp(`<input type="password" name="${name}"[^>]*>`))[0];
    assert.match(tag, /autocomplete="new-password"/); assert.match(tag, /required minlength="15" maxlength="200"/); assert.doesNotMatch(tag, /\bvalue=/);
  }
  assert.doesNotMatch(html, /NEVER-RENDER-THIS/); assert.match(plain(html), /Never approve an unknown registration using its original password/);
});
test('FIX03 SEC-004 UI: restricted Admin rendering does not expose the approval form', () => {
  const html = view('admin/customers', { ...customerLocals, user: { role: 'admin' } });
  assert.doesNotMatch(html, /approve-registration/); assert.doesNotMatch(html, /type="password"/);
});
test('FIX03 SEC-004 UI: approval guidance and generic notices render in all five locales without sensitive values', () => {
  const guidance = new Set(), notices = new Set();
  for (const locale of ['en', 'nl', 'fr', 'ar', 'ckb']) {
    const html = view('admin/customers', { ...customerLocals, locale, registrationResult: 'invalid-password' });
    guidance.add(plain(html.match(/id="registration-guidance-1">([\s\S]*?)<\/p>/)[1]));
    notices.add(plain(html.match(/role="status"[^>]*>([\s\S]*?)<\/div>/)[1]));
    assert.doesNotMatch(html, /NEVER-RENDER-THIS/);
  }
  assert.equal(guidance.size, 5); assert.equal(notices.size, 5);
});

test('FIX03 SEC-004 UI: email verification requires an explicit password POST and ignores unsolicited registration', () => {
  const titles = new Set(), guidance = new Set();
  for (const locale of ['en', 'nl', 'fr', 'ar', 'ckb']) {
    const html = view('verify-email', { ...common, locale, token: 'synthetic-verification-token', error: null, password: 'NEVER-RENDER-THIS', email: 'private-address@example.test' });
    assert.match(html, /method="post" action="\/verify-email" data-submit-once/);
    assert.match(html, /name="_csrf" value="synthetic-csrf"/);
    assert.match(html, /type="hidden" name="token" value="synthetic-verification-token"/);
    assert.match(html, /type="password" name="password" autocomplete="current-password"[^>]*required/);
    assert.doesNotMatch(html.match(/<input[^>]*type="password"[^>]*>/)[0], /\bvalue=/);
    assert.doesNotMatch(html, /NEVER-RENDER-THIS|private-address@example\.test/);
    assert.doesNotMatch(html, /role="alert"/);
    titles.add(plain(html.match(/<h1>([\s\S]*?)<\/h1>/)[1]));
    guidance.add(plain(html.match(/id="verify-email-unsolicited">([\s\S]*?)<\/p>/)[1]));
    if (locale === 'en') {
      assert.match(plain(html), /Opening this page does not activate an account/);
      assert.match(plain(html), /If you did not register, ignore this message and do not continue/);
    }
  }
  assert.equal(titles.size, 5); assert.equal(guidance.size, 5);
});

test('FIX03 SEC-004 UI: verification errors stay generic and localized without exposing passwords or raw error details', () => {
  const invalidNotices = new Set(), unavailableNotices = new Set();
  for (const locale of ['en', 'nl', 'fr', 'ar', 'ckb']) {
    const invalid = view('verify-email', { ...common, locale, token: '\"><script>synthetic-injection</script>', error: 'PRIVATE-ERROR-DETAIL', password: 'NEVER-RENDER-THIS' });
    assert.doesNotMatch(invalid, /<script>|PRIVATE-ERROR-DETAIL|NEVER-RENDER-THIS/);
    assert.match(invalid, /name="token" value="&#34;&gt;&lt;script&gt;synthetic-injection&lt;\/script&gt;"/);
    invalidNotices.add(plain(invalid.match(/role="alert">([\s\S]*?)<\/div>/)[1]));
    const unavailable = view('verify-email', { ...common, locale, token: 'synthetic-verification-token', error: 'Verification is temporarily unavailable. Please try again later.' });
    unavailableNotices.add(plain(unavailable.match(/role="alert">([\s\S]*?)<\/div>/)[1]));
  }
  assert.equal(invalidNotices.size, 5); assert.equal(unavailableNotices.size, 5);
});

test('FIX03 COM-007 UI: sent records have no retry and uncertain records require explicit provider reconciliation', () => {
  const html = view('partials/order-email-deliveries', { ...common, user: { role: 'manager' }, order: { id: 7 }, emailResult: '', emailDeliveries: [
    { event_key: 'confirmation', event_type: 'confirmation', status: 'sent', attempt_count: 1, provider_message_id: 'synthetic-provider-id' },
    { event_key: 'status:processing', event_type: 'status', status: 'failed', attempt_count: 2, error_code: 'PROVIDER_REJECTED' },
    { event_key: 'status:shipped', event_type: 'status', status: 'failed', attempt_count: 1, generation: 3, error_code: 'TIMEOUT', needs_reconciliation: true },
    { event_key: 'status:completed', event_type: 'status', status: 'sending', attempt_count: 1 }
  ] });
  const retries = [...html.matchAll(/<form method="post" action="\/admin\/orders\/7\/email\/retry"[\s\S]*?<\/form>/g)].map(match => match[0]);
  assert.equal(retries.length, 3); assert.doesNotMatch(retries[0], /\bdisabled/); assert.match(retries[1], /\bdisabled/);
  assert.doesNotMatch(html, /name="eventKey" value="confirmation"/);
  assert.match(plain(html), /status:processing/); assert.match(plain(html), /status:shipped/);
  assert.match(plain(html), /synthetic-provider-id/); assert.match(plain(html), /In progress/);
  const reconciliation = html.match(/<form method="post" action="\/admin\/orders\/7\/email\/reconcile"[\s\S]*?<\/form>/)[0];
  assert.match(reconciliation, /name="outcome" required/); assert.match(reconciliation, /option value="sent"/); assert.match(reconciliation, /option value="not-sent"/);
  assert.match(reconciliation, /name="providerChecked" value="yes" required/);
  assert.match(reconciliation, /type="hidden" name="expectedGeneration" value="3" required/);
  assert.match(reconciliation, /type="hidden" name="expectedAttemptCount" value="1" required/);
  assert.match(reconciliation, /name="providerMessageId" maxlength="200" autocomplete="off"/);
  assert.match(plain(html), /Never guess after a timeout/); assert.match(plain(html), /does not send an email/);
  assert.match(plain(html), /PROVIDER_REJECTED/); assert.match(plain(html), /TIMEOUT/);
});
test('FIX03 COM-007 UI: read-only roles get no email actions and templates tolerate missing delivery locals', () => {
  const html = view('partials/order-email-deliveries', { ...common, user: { role: 'admin' }, order: { id: 7 }, emailDeliveries: [{ event_key: 'confirmation', status: 'failed', needs_reconciliation: true }] });
  assert.doesNotMatch(html, /<form/);
  const empty = view('partials/order-email-deliveries', { ...common, user: { role: 'manager' }, order: { id: 7 } });
  assert.match(plain(empty), /No order email attempts/);
  for (const name of ['admin/order', 'admin/order-cash']) assert.ok(source(name).includes("include('../partials/order-email-deliveries'"));
});
test('FIX03 COM-007 UI: reconciliation guidance and non-sending outcome notice cover five locales', () => {
  const guidance = new Set(), notices = new Set();
  for (const locale of ['en', 'nl', 'fr', 'ar', 'ckb']) {
    const html = view('partials/order-email-deliveries', { ...common, locale, user: { role: 'manager' }, order: { id: 7 }, emailResult: 'reconciled', emailDeliveries: [{ event_key: 'confirmation', status: 'failed', needs_reconciliation: true }] });
    guidance.add(plain(html.match(/id="email-reconciliation-0">([\s\S]*?)<\/p>/)[1]));
    notices.add(plain(html.match(/role="status">([\s\S]*?)<\/div>/)[1]));
  }
  assert.equal(guidance.size, 5); assert.equal(notices.size, 5);
});
