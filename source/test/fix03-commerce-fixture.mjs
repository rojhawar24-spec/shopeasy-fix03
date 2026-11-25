import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Every importing test file runs in its own Node test process and owns this DB.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-fix03-commerce-'));
for (const key of Object.keys(process.env)) {
  if (/DATABASE|TURSO|MOLLIE|RESEND|PEPPOL|MANAGER|MFA|^AI_|SECRET|TOKEN|PASSWORD|API_KEY|^BASE_URL$/.test(key)) delete process.env[key];
}
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: pathToFileURL(path.join(directory, 'test.sqlite')).href, CLOUDFLARE_WORKER: '0', SEED_DEMO_DATA: 'false' });
globalThis.fetch = async () => { throw new Error('FIX03_EXTERNAL_NETWORK_FORBIDDEN'); };
export const store = await import('../src/db.js');
export const { db, run, getRow, getRows } = await import('../src/database.js');
let sequence = 0;
export const unique = () => ++sequence;
export async function user(role = 'customer') {
  const email = `fix03-${unique()}@example.test`;
  return { id: await store.createUser(email, 'synthetic-unused-hash', role, 'Synthetic Fixture'), email };
}
export const manager = await user('manager');
export const bank = { bankName: 'Synthetic Bank', accountHolder: 'Synthetic Store', account: '12345678' };
export async function product({ price = 1000, cost = 400, stock = 20 } = {}) {
  const id = unique();
  return (await run('INSERT INTO products(name,slug,sku,price_cents,cost_price_cents,stock) VALUES(?,?,?,?,?,?)', [`Synthetic ${id}`, `fix03-${id}`, `FIX03-${id}`, price, cost, stock])).lastInsertRowid;
}
export async function variant(productId, { stock = 20, value = 'Small', value2 = '' } = {}) {
  return (await run("INSERT INTO product_variants(product_id,option_name,option_value,option_name_2,option_value_2,sku,stock) VALUES(?,'Size',?,'Colour',?,?,?)", [productId, value, value2, `FIX03-V-${unique()}`, stock])).lastInsertRowid;
}
export async function order(productId, extra = {}) {
  const id = unique();
  return store.createOrderAtomic({ userId: null, email: `fix03-order-${id}@example.test`, customerPhone: '+32470123456', items: [{ productId, quantity: 1 }], shipping: { name: 'Synthetic Buyer', address: 'Fixture Street 1', city: 'Test City', postalCode: '1000', country: 'BE' }, currency: 'EUR', clientToken: `fix03-commerce-checkout-${id}`, termsAcceptedAt: new Date().toISOString(), ...extra });
}
export async function complete(orderId) {
  for (const status of ['processing', 'shipped', 'completed']) assert.equal(await store.setOrderStatus(orderId, status, manager.id), true);
  return store.getOrder(orderId);
}
export async function returnRequest(orderId, { quantity = 1, requestType = 'refund', itemIndex = 0 } = {}) {
  const current = await store.getOrder(orderId);
  return store.createOrderReturnRequest({ orderId, userId: current.user_id, orderItemId: current.items[itemIndex].id, quantity, requestType, reason: 'Synthetic regression request' });
}
export const action = (returnId, action, extra = {}) => store.processOrderReturn({ returnId, action, managerUserId: manager.id, ...extra });
export async function cleanup() {
  await db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
