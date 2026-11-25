import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Manager low-stock rows calculate available stock after reservations per inventory row', () => {
  const db = read('src/db.js');
  const start = db.indexOf('export async function listLowStockInventory(limit=30) {');
  const end = db.indexOf('\n}\n\nexport async function getDashboardStats()', start);
  assert.ok(start >= 0 && end > start, 'low-stock inventory query must exist');
  const query = db.slice(start, end);
  assert.match(query, /MAX\(p\.stock-p\.reserved_stock,0\) AS available_stock/);
  assert.match(query, /MAX\(pv\.stock-pv\.reserved_stock,0\) AS available_stock/);
  assert.match(query, /NOT EXISTS\(SELECT 1 FROM product_variants pv WHERE pv\.product_id=p\.id AND pv\.active=1\)/);
  assert.match(query, /JOIN product_variants pv ON pv\.product_id=p\.id WHERE p\.active=1 AND pv\.active=1/);
  assert.match(query, /MAX\(pv\.stock-pv\.reserved_stock,0\)<=p\.reorder_level/);
  assert.match(query, /MAX\(p\.stock-p\.reserved_stock,0\)<=p\.reorder_level/);
  assert.match(query, /ORDER BY available_stock ASC,product_name COLLATE NOCASE LIMIT \?/);
});

test('Manager dashboard low-stock count uses the same base-product versus active-variant rules', () => {
  const db = read('src/db.js');
  const dashboard = db.slice(db.indexOf('export async function getDashboardStats() {'), db.indexOf('\n}\n\nexport async function listCategories', db.indexOf('export async function getDashboardStats() {')));
  assert.match(dashboard, /SELECT COUNT\(\*\) AS count FROM \(SELECT p\.id FROM products p WHERE p\.active=1 AND NOT EXISTS/);
  assert.match(dashboard, /SELECT pv\.id FROM product_variants pv JOIN products p ON p\.id=pv\.product_id WHERE p\.active=1 AND pv\.active=1/);
  assert.match(dashboard, /MAX\(p\.stock-p\.reserved_stock,0\)<=p\.reorder_level/);
  assert.match(dashboard, /MAX\(pv\.stock-pv\.reserved_stock,0\)<=p\.reorder_level/);
});

test('Manager dashboard explains the reserved-stock calculation and labels the available quantity', () => {
  const view = read('views/admin/dashboard.ejs');
  assert.match(view, /Available stock is physical stock minus reserved quantities\. Variant rows are checked individually\./);
  assert.match(view, /<th\b[^>]*\bscope="col"[^>]*>Available<\/th>/);
  assert.match(view, /row\.available_stock/);
  assert.match(view, /row\.reorder_level/);
});
