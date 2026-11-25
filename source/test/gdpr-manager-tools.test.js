import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const server=read('src/server.js');
const db=read('src/db.js');
const view=read('views/admin/gdpr.ejs');
const limited=read('views/admin/limited-dashboard.ejs');

test('GDPR page and both actions are explicitly Manager-only and CSRF-protected',()=>{
  assert.match(server,/app\.get\('\/admin\/gdpr',requireManager/);
  assert.match(server,/app\.post\('\/admin\/gdpr\/export',requireManager,verifyCsrf/);
  assert.match(server,/app\.post\('\/admin\/gdpr\/delete',requireManager,verifyCsrf/);
  assert.match(server,/exportGdprCustomerData/);
  assert.match(server,/deleteGdprCustomerData/);
  assert.match(server,/listGdprAuditLogs\(150\)/);
  assert.match(server,/createAudit\(req\.user\.id,'gdpr_customer_export'/);
});

test('Manager page offers JSON export, explicit DELETE confirmation, and the last 150 GDPR actions',()=>{
  assert.match(view,/action="\/admin\/gdpr\/export"/);
  assert.match(view,/action="\/admin\/gdpr\/delete"/);
  assert.match(view,/name="_csrf"/);
  assert.match(view,/name="confirmation"[^>]*required[^>]*pattern="DELETE"/);
  assert.match(view,/Export customer data/);
  assert.match(view,/Delete customer data/);
  assert.match(view,/View audit log/);
  assert.match(view,/gdpr-audit-log/);
  assert.match(view,/150/);
});

test('customer export includes the six requested data groups without credential/session secrets',()=>{
  assert.match(db,/export async function exportGdprCustomerData/);
  assert.match(db,/const \{customer,\.\.\.groups\}=data/);
  assert.match(db,/return \{exported_at:new Date\(\)\.toISOString\(\),user:customer,\.\.\.groups\}/);
  for(const key of ['customer:user?','identity:{email}','orders:ordersWithItems','order_items:orderItems','wishlist,','uploads:[],','sessions']) assert.ok(db.includes(key),`missing export data group: ${key}`);
  assert.match(db,/SELECT id,email,role,full_name,terms_accepted_at,created_at FROM users/);
  assert.doesNotMatch(db.slice(db.indexOf('async function resolveGdprTarget'),db.indexOf('export async function listOrders')),/SELECT \* FROM sessions/);
  assert.match(db,/Current uploaded_assets are shared storefront media owned by the store/);
  const resolver=db.slice(db.indexOf('async function resolveGdprTarget'),db.indexOf('export async function listOrders'));
  assert.match(resolver,/SELECT created_at,expires_at,cart_json,wishlist_json,coupon_code,cart_revision,checkout_quote_json FROM sessions/);
  assert.doesNotMatch(resolver,/SELECT [^\n]*csrf_token/);
});

test('customer deletion is transactional, rejects unresolved orders without stock mutation, and audits before commit',()=>{
  const start=db.indexOf('export async function deleteGdprCustomerData');
  const end=db.indexOf('export async function listOrders',start);
  const source=db.slice(start,end);
  assert.ok(start>=0 && end>start,'delete function must be present');
  assert.match(source,/db\.transaction\('write'\)/);
  assert.match(source,/GDPR_OPEN_ORDERS/);
  assert.match(source,/GDPR_OPEN_RETURNS/);
  assert.doesNotMatch(source,/UPDATE products SET (?:stock|reserved_stock)=/);
  assert.ok(source.indexOf('GDPR_OPEN_ORDERS')<source.indexOf('DELETE FROM sessions'));
  assert.match(source,/DELETE FROM sessions WHERE user_id=\?/);
  assert.match(source,/DELETE FROM orders WHERE id=\?/);
  assert.match(source,/DELETE FROM users WHERE id=\? AND role='customer'/);
  assert.match(source,/INSERT INTO audit_logs\(user_id,action,target_type,target_id,meta_json\)/);
  assert.match(source,/await tx\.commit\(\)/);
  assert.match(source,/await tx\.rollback\(\)/);
});

test('GDPR audit query is limited to the latest 150 export/delete actions',()=>{
  const start=db.indexOf('export async function listGdprAuditLogs');
  const end=db.indexOf('function parseGdprJson',start);
  const source=db.slice(start,end);
  assert.match(source,/gdpr_customer_export/);
  assert.match(source,/gdpr_customer_delete/);
  assert.match(source,/ORDER BY a\.created_at DESC,a\.id DESC LIMIT \?/);
  assert.match(source,/Math\.min\(150/);
});

test('restricted Admin dashboard does not expose Manager GDPR tools',()=>{
  assert.doesNotMatch(limited,/\/admin\/gdpr/);
});
