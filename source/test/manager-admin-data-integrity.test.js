import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { optionalFormId, validId } from '../src/security.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('manager create/edit forms fail closed for malformed IDs instead of turning edits into creates', () => {
  for (const fileAndSignature of [
    ['src/server.js', "const id=optionalFormId(req.body.id),name=cleanText(req.body.name,80);"],
    ['src/server.js', "const id=optionalFormId(req.body.id);\n    const existingProduct=id?await getProductById(id):null;"],
    ['src/server.js', "const id=optionalFormId(req.body.id);\n    previousImage=id?(await getStory(id))?.image_url||null:null;"],
    ['src/server.js', "const id=optionalFormId(req.body.id),code=cleanText(req.body.code,40).toUpperCase()"],
    ['src/server.js', "const parentId=optionalFormId(req.body.parentId);"],
    ['src/server.js', "const categoryId=optionalFormId(req.body.categoryId);"],
    ['src/server.js', "const productId=optionalFormId(req.body.productId);"],
    ['src/server.js', "const variantId=optionalFormId(req.body.variantId);"],
  ]) assert.ok(read(fileAndSignature[0]).includes(fileAndSignature[1]), `missing strict optional ID handling: ${fileAndSignature[1]}`);
  assert.match(read('src/security.js'), /export function optionalFormId\(value\)/);
  assert.match(read('src/server.js'), /INVALID_ID:'This product form contains an invalid ID/);
  assert.match(read('src/server.js'), /INVALID_ID:'This category form contains an invalid ID/);
  assert.match(read('src/server.js'), /INVALID_ID: 'This story form contains an invalid ID/);
  assert.match(read('src/server.js'), /const id=validId\(req\.body\.id\)\?Number\(req\.body\.id\):null,status=/);
  assert.match(read('src/server.js'), /app\.get\('\/admin\/orders\/:id'.*validId\(req\.params\.id\)/);
  assert.match(read('src/server.js'), /app\.get\('\/admin\/products\/:id\/edit'.*validId\(req\.params\.id\)/);
  const server = read('src/server.js');
  const storyDelete = server.slice(server.indexOf("app.post('/admin/stories/delete'"), server.indexOf("app.get('/admin/orders'", server.indexOf("app.post('/admin/stories/delete'")));
  assert.ok(storyDelete.includes('validId(req.body.id)?Number(req.body.id):null'));
  assert.ok(server.includes("app.get('/admin/orders/:id'"));
  assert.ok(server.includes("app.get('/admin/products/:id/edit'"));
  assert.match(read('views/admin/stories.ejs'), /typeof error !== 'undefined' && error/);
  assert.match(read('src/server.js'), /Select a valid coupon before deleting/);
  assert.match(read('src/server.js'), /Select a valid category before deleting/);
  assert.match(server, /if\(!\['fixed','percent'\]\.includes\(requestedType\)\) throw new Error\('VALIDATION'\)/, 'unsupported coupon types must be rejected rather than silently changed to percent');
  assert.match(server, /BRANDING_READBACK_MISMATCH/, 'branding Save must verify persisted values before showing success');
  assert.match(server, /if\(!changed\) return res\.redirect\(303,`\/admin\/orders\/\$\{id\}\?statusError=order`\)/, 'every failed order status transition must show an error');
  assert.match(server, /statusError=cancel-request/, 'failed cancellation-request decisions must be visible to the manager');
  assert.match(read('src/db.js'), /export async function deleteCoupon\(id\) \{ return \(await run\('DELETE FROM coupons WHERE id=\?',\[id\]\)\)\.changes===1; \}/);
  assert.match(read('src/db.js'), /export async function deleteStory\(id\) \{ return \(await run\('DELETE FROM stories WHERE id=\?',\[id\]\)\)\.changes===1; \}/);
  const legacyStart=read('src/db.js').indexOf('export async function confirmLegacyPendingOrderAsCod');
  const legacyEnd=read('src/db.js').indexOf('export async function setOrderStatus', legacyStart);
  const legacy=read('src/db.js').slice(legacyStart,legacyEnd);
  assert.match(legacy, /SUM\(oi\.quantity\) AS quantity/);
  assert.match(legacy, /pv\.id=oi\.variant_id AND pv\.product_id=oi\.product_id/);
});

test('optionalFormId accepts only blank create IDs or safe positive IDs', () => {
  assert.equal(optionalFormId(undefined), null);
  assert.equal(optionalFormId(null), null);
  assert.equal(optionalFormId(''), null);
  assert.equal(optionalFormId('1'), 1);
  assert.equal(optionalFormId('0002'), 2);
  for (const bad of [' ', '0', '-1', '1.5', '1e2', 'Infinity', '9007199254740992', ['1'], ['1', '2'], { id: 1 }]) {
    assert.throws(() => optionalFormId(bad), /INVALID_ID/, `should reject malformed ID ${JSON.stringify(bad)}`);
  }
  assert.equal(validId(['1']), false);
  assert.equal(validId('1e2'), false);
  assert.equal(validId('42'), true);
});

test('simple-product restock SQL refuses to mutate base stock while active variants exist', () => {
  const source = read('src/db.js');
  const start = source.indexOf('export async function restockProduct(id, quantity)');
  const end = source.indexOf('export async function restockProductVariant', start);
  assert.ok(start >= 0 && end > start, 'restockProduct implementation must be present');
  const helper = source.slice(start, end);
  assert.match(helper, /NOT EXISTS\(SELECT 1 FROM product_variants pv WHERE pv\.product_id=products\.id AND pv\.active=1\)/);

  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY, stock INTEGER NOT NULL, updated_at TEXT DEFAULT '');
             CREATE TABLE product_variants(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, stock INTEGER NOT NULL, active INTEGER NOT NULL);
             INSERT INTO products(id,stock) VALUES(1, 0), (2, 4);
             INSERT INTO product_variants VALUES(10, 1, 8, 1), (20, 2, 3, 0);`);
    const update = db.prepare(`UPDATE products SET stock=stock+?, updated_at=datetime('now')
      WHERE id=? AND stock<=100000000-?
        AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=products.id AND pv.active=1)`);
    assert.equal(update.run(5, 1, 5).changes, 0, 'base stock must not increase for a product with active variants');
    assert.equal(Number(db.prepare('SELECT stock FROM products WHERE id=1').get().stock), 0);
    assert.equal(update.run(5, 2, 5).changes, 1, 'simple stock product can still be restocked');
    assert.equal(Number(db.prepare('SELECT stock FROM products WHERE id=2').get().stock), 9);
  } finally {
    db.close();
  }
});

test('pending COD acceptance aggregates duplicate order lines before verifying exact product/variant reservations', () => {
  const source = read('src/db.js');
  const start = source.indexOf('async function acceptPendingCashOnDeliveryOrder(id');
  const end = source.indexOf('async function completeCashOnDeliveryOrder(id', start);
  assert.ok(start >= 0 && end > start, 'transactional COD acceptance helper must exist');
  const helper = source.slice(start, end);
  assert.match(helper, /Number\(item\.reserved_stock\)<Number\(item\.quantity\)/);
  assert.match(helper, /SUM\(oi\.quantity\) AS quantity/);
  assert.match(helper, /GROUP BY oi\.product_id,oi\.variant_id,p\.reserved_stock,pv\.reserved_stock/);
  assert.match(helper, /pv\.id=oi\.variant_id AND pv\.product_id=oi\.product_id/);

  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY, reserved_stock INTEGER NOT NULL);
      CREATE TABLE product_variants(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, reserved_stock INTEGER NOT NULL);
      CREATE TABLE order_items(order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, variant_id INTEGER, quantity INTEGER NOT NULL);
      INSERT INTO products VALUES(1, 0), (2, 0);
      INSERT INTO product_variants VALUES(10, 2, 5);
      INSERT INTO order_items VALUES(100, 1, NULL, 2), (101, 1, 10, 1), (102, 2, 10, 3), (102, 2, 10, 3);`);
    const getItems = db.prepare(`SELECT oi.product_id,oi.variant_id,SUM(oi.quantity) AS quantity,
      CASE WHEN oi.variant_id IS NULL THEN p.reserved_stock ELSE pv.reserved_stock END AS reserved_stock
      FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_variants pv ON pv.id=oi.variant_id AND pv.product_id=oi.product_id
      WHERE oi.order_id=? GROUP BY oi.product_id,oi.variant_id,p.reserved_stock,pv.reserved_stock`);
    const base = getItems.all(100);
    assert.equal(base[0].reserved_stock, 0, 'missing base reservation must remain unaccepted');
    db.prepare('UPDATE products SET reserved_stock=2 WHERE id=1').run();
    assert.equal(getItems.all(100)[0].reserved_stock, 2, 'matching base reservation can be verified');
    const mismatchedVariant = getItems.all(101);
    assert.equal(mismatchedVariant[0].reserved_stock, null, 'variant belonging to another product must not satisfy the reservation check');
    const duplicatedLines = getItems.all(102);
    assert.equal(duplicatedLines.length, 1, 'duplicate order lines must be aggregated by product and variant');
    assert.equal(duplicatedLines[0].quantity, 6, 'reservation check must compare the sum of duplicate line quantities');
    assert.ok(duplicatedLines[0].quantity > duplicatedLines[0].reserved_stock, 'duplicate rows whose combined quantity exceeds reservation must be rejected');
  } finally {
    db.close();
  }
});

test('category deletion SQL refuses a parent with children and permits deletion after children are moved', () => {
  const source = read('src/db.js');
  const start = source.indexOf('export async function deleteCategory(id)');
  const end = source.indexOf('export async function listProducts', start);
  assert.ok(start >= 0 && end > start, 'transactional category delete implementation must exist');
  const helper = source.slice(start, end);
  assert.match(helper, /db\.transaction\('write'\)/);
  const deleteSql = `DELETE FROM categories WHERE id=? AND NOT EXISTS(SELECT 1 FROM categories child WHERE child.parent_id=categories.id)`;
  assert.match(helper, /DELETE FROM categories WHERE id=\?[\s\S]*?AND NOT EXISTS\(SELECT 1 FROM categories child WHERE child\.parent_id=categories\.id\)/);

  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE categories(id INTEGER PRIMARY KEY, parent_id INTEGER); INSERT INTO categories VALUES(1,NULL),(2,1);');
    const remove = db.prepare(deleteSql);
    assert.equal(remove.run(1).changes, 0, 'parent category cannot be deleted while a child references it');
    assert.equal(remove.run(2).changes, 1, 'leaf category can be deleted');
    assert.equal(remove.run(1).changes, 1, 'parent can be deleted once it has no children');
  } finally {
    db.close();
  }
});
