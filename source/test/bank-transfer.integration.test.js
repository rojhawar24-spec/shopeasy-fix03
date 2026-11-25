import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DUMMY_PASSWORD_HASH } from '../src/password-hashing.js';

// Exercise the real checkout/confirmation/cancellation SQL using an isolated
// SQLite file. Never point this test at the user's live shop.db.
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-bank-transfer-'));
process.env.DATABASE_URL = pathToFileURL(path.join(tempDir, 'shop.db')).href;
for (const key of ['SHOP_DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'CLOUDFLARE_WORKER']) delete process.env[key];

let store;
let database;
let managerId;
let sequence = 0;

before(async () => {
  store = await import('../src/db.js');
  database = store.default;
  managerId = await store.createUser('bank-transfer-manager@example.test', DUMMY_PASSWORD_HASH, 'manager', 'Bank Transfer Test Manager');
});

after(async () => {
  try { await database?.close?.(); } catch {}
  await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

async function createTestProduct(label) {
  sequence += 1;
  return store.adminCreateOrUpdateProduct({
    name: `Bank Transfer Test Product ${label}`,
    slug: `bank-transfer-test-product-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    shortDescription: 'Temporary bank transfer test product',
    description: 'Used only by the isolated bank transfer integration test.',
    imageUrl: '', galleryImages: [], priceCents: 1200, costPriceCents: 400,
    salePriceCents: null, saleStart: null, saleEnd: null,
    automaticDiscountPercent: 0, sku: `BANK-TRANSFER-${sequence}`, stock: 5,
    reorderLevel: 0, categoryId: null, tags: 'test', featured: false, active: true,
    variants: [], variantOptionName: 'Size', variantOptionName2: ''
  });
}

function checkoutData(productId, paymentProvider = 'bank_transfer') {
  sequence += 1;
  return {
    userId: null,
    email: 'buyer@example.test',
    customerPhone: '+32412345678',
    items: [{ productId, quantity: 1 }],
    shipping: { name: 'Test Buyer', address: '1 Test Street', city: 'Brussels', postalCode: '1000', country: 'BE' },
    shippingCents: 0,
    taxCents: 0,
    currency: 'EUR',
    paymentProvider,
    bankTransferDetails: paymentProvider === 'bank_transfer' ? {
      enabled: true, bankName: 'Test Bank', accountHolder: 'ShopEasy Test BV',
      account: 'BE68539007547034', bic: 'GEBABEBB', instructions: 'Use the exact order reference.'
    } : null,
    clientToken: `bank-transfer-test-token-${String(sequence).padStart(4, '0')}`,
    termsAcceptedAt: new Date().toISOString(),
    termsLocale: 'en',
    termsPolicyHash: 'bank-transfer-test-policy'
  };
}

test('bank transfer persists immutable instructions, reserves stock, and requires exact manager reconciliation', async () => {
  const productId = await createTestProduct('confirm');
  const first = await store.createOrderAtomic(checkoutData(productId));
  let order = await store.getOrder(first.orderId);
  assert.equal(order.status, 'pending');
  assert.equal(order.payment_provider, 'bank_transfer');
  assert.equal(await store.setOrderStatus(first.orderId, 'processing', managerId), false,
    'a Manager cannot bypass bank-statement verification via the generic status route');
  const snapshot = JSON.parse(order.payment_instructions_snapshot);
  assert.equal(snapshot.reference, `SHOP-${first.orderId}`);
  assert.equal(snapshot.accountHolder, 'ShopEasy Test BV');
  assert.equal(Number((await store.getProductById(productId)).reserved_stock), 1);

  assert.equal(await store.confirmBankTransferOrderPaid(first.orderId, first.total - 1, 'EUR', 'BANK-REF-001', managerId), false, 'wrong amount cannot mark the order paid');
  assert.equal(await store.confirmBankTransferOrderPaid(first.orderId, first.total, 'USD', 'BANK-REF-001', managerId), false, 'wrong currency cannot mark the order paid');
  assert.equal((await store.getOrder(first.orderId)).status, 'pending');

  assert.equal(await store.confirmBankTransferOrderPaid(first.orderId, first.total, 'EUR', ' bank Ref-001 ', managerId), true);
  order = await store.getOrder(first.orderId);
  assert.equal(order.status, 'paid');
  assert.equal(order.payment_reference, 'bank_transfer:BANKREF-001');
  assert.equal(Number((await store.getProductById(productId)).reserved_stock), 1, 'paid stock remains reserved until fulfilment completes');
  assert.equal(await store.setOrderStatus(first.orderId, 'processing', managerId), true, 'Manager can prepare a manually verified bank-transfer order');
  assert.equal(await store.requestOrderCancellation(first.orderId, 'Please cancel this paid bank transfer', null), false, 'paid bank-transfer orders require an explicit refund/reconciliation workflow, not a cancellation request');
  assert.equal(await store.setOrderStatus(first.orderId, 'cancelled', managerId), false, 'generic cancellation must not release reserved stock for a paid bank-transfer order');
  assert.equal((await store.getOrder(first.orderId)).status, 'processing');
  assert.equal(Number((await store.getProductById(productId)).reserved_stock), 1);
  assert.equal(await store.setOrderStatus(first.orderId, 'shipped', managerId), true, 'a verified bank-transfer order can be shipped');
  assert.equal(await store.setOrderStatus(first.orderId, 'completed', managerId), true, 'completion consumes the exact reserved inventory once');
  const fulfilledProduct = await store.getProductById(productId);
  assert.equal(Number(fulfilledProduct.stock), 4);
  assert.equal(Number(fulfilledProduct.reserved_stock), 0);
  assert.equal(await store.confirmBankTransferOrderPaid(first.orderId, first.total, 'EUR', 'BANK-REF-001', managerId), false, 'a completed order cannot be confirmed twice');
});

test('duplicate bank statement references fail closed and customers cannot directly release pending bank-transfer stock', async () => {
  const productId = await createTestProduct('duplicate');
  const first = await store.createOrderAtomic(checkoutData(productId));
  assert.equal(await store.confirmBankTransferOrderPaid(first.orderId, first.total, 'EUR', 'SHARED-REF-77', managerId), true);

  const second = await store.createOrderAtomic(checkoutData(productId));
  assert.equal(await store.confirmBankTransferOrderPaid(second.orderId, second.total, 'EUR', ' shared-ref-77 ', managerId), false,
    'the same normalized bank statement reference cannot settle a second order');
  assert.equal((await store.getOrder(second.orderId)).status, 'pending');

  assert.equal(await store.cancelPendingOrder(second.orderId, 'Customer request', 'customer'), false,
    'customer cancellation must not immediately release stock while a transfer could be in flight');
  assert.equal(await store.requestOrderCancellation(second.orderId, 'Please cancel this bank transfer order', null), true);
  assert.equal(Number((await store.getProductById(productId)).reserved_stock), 2);
  assert.equal(await store.cancelPendingOrder(second.orderId, 'Bank statement checked; no transfer received', 'manager', managerId), true);
  assert.equal((await store.getOrder(second.orderId)).status, 'cancelled');
  assert.equal(Number((await store.getProductById(productId)).reserved_stock), 1,
    'only the cancelled order reservation is released; the already-paid order remains reserved');
});

test('non-bank checkout rejects injected bank-transfer configuration', async () => {
  const productId = await createTestProduct('cash');
  const data = checkoutData(productId, 'cash_on_delivery');
  await assert.rejects(() => store.createOrderAtomic({ ...data, bankTransferDetails: { account: 'BE68539007547034' } }),
    /BANK_TRANSFER_DETAILS_UNEXPECTED/);
});
