import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');

test('indexes that depend on migrated category and product-variant columns are created after migrations', () => {
  const schemaStart = source.indexOf('await executeMultiple(`');
  const schemaEnd = source.indexOf('`);', schemaStart);
  assert.ok(schemaStart >= 0 && schemaEnd > schemaStart, 'initial schema block should exist');
  const initialSchema = source.slice(schemaStart, schemaEnd);
  assert.doesNotMatch(initialSchema, /idx_categories_parent_sort/);
  assert.doesNotMatch(initialSchema, /idx_product_variants_product_active/);

  const migrationLoop = source.indexOf('for (const migration of forwardMigrations) await ensureColumn');
  const categoryIndex = source.indexOf('CREATE INDEX IF NOT EXISTS idx_categories_parent_sort');
  const variantIndex = source.indexOf('CREATE INDEX IF NOT EXISTS idx_product_variants_product_active');
  assert.ok(migrationLoop >= 0 && categoryIndex > migrationLoop && variantIndex > migrationLoop,
    'legacy columns must be migrated before dependent indexes are created');
  for (const column of ['option_name', 'option_name_2', 'option_value_2', 'image_url', 'reserved_stock', 'sort_order', 'active', 'updated_at']) {
    assert.match(source, new RegExp(`table:'product_variants', column:'${column}'`));
  }
});

test('migration identifier validation allows numeric suffixes used by variant columns', () => {
  assert.match(source, /!\/\^\[a-z_\]\[a-z0-9_\]\*\$\/i\.test\(table\)/);
  assert.match(source, /!\/\^\[a-z_\]\[a-z0-9_\]\*\$\/i\.test\(column\)/);
  for (const column of ['option_name_2', 'option_value_2', 'variant_name_2', 'variant_value_2']) {
    assert.match(source, new RegExp(`column:'${column}'`));
    assert.match(column, /^[a-z_][a-z0-9_]*$/i);
  }
  assert.doesNotMatch('2variant_name', /^[a-z_][a-z0-9_]*$/i, 'leading digits remain invalid');
});

test('legacy category and product-variant tables can receive the columns before indexes are built', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL);
    CREATE TABLE product_variants (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, option_value TEXT NOT NULL, sku TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0);
  `);
  const ensureColumn = (table, column, sql) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) db.exec(sql);
  };
  ensureColumn('categories', 'parent_id', 'ALTER TABLE categories ADD COLUMN parent_id INTEGER');
  ensureColumn('categories', 'active', 'ALTER TABLE categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  ensureColumn('categories', 'sort_order', 'ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  ensureColumn('product_variants', 'option_name', "ALTER TABLE product_variants ADD COLUMN option_name TEXT NOT NULL DEFAULT 'Size'");
  ensureColumn('product_variants', 'reserved_stock', 'ALTER TABLE product_variants ADD COLUMN reserved_stock INTEGER NOT NULL DEFAULT 0');
  ensureColumn('product_variants', 'sort_order', 'ALTER TABLE product_variants ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  ensureColumn('product_variants', 'active', 'ALTER TABLE product_variants ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  ensureColumn('product_variants', 'updated_at', "ALTER TABLE product_variants ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  assert.doesNotThrow(() => db.exec('CREATE INDEX idx_categories_parent_sort ON categories(parent_id, active, sort_order, name)'));
  assert.doesNotThrow(() => db.exec('CREATE INDEX idx_product_variants_product_active ON product_variants(product_id, active, sort_order)'));
  db.close();
});

test('production error logging emits safe diagnostics and never logs raw exception messages', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /\[ShopEasy\] Unhandled request error/);
  assert.match(server, /safeCode/);
  assert.match(server, /safeName/);
  assert.match(server, /safeRoute/);
  assert.doesNotMatch(server, /Unhandled request error; details suppressed in production logs/);
  const handlerStart = server.indexOf('app.use((err,req,res,next)=>');
  const handlerEnd = server.indexOf('async function bootstrapManager()', handlerStart);
  const handler = server.slice(handlerStart, handlerEnd);
  const productionBranch = handler.slice(handler.indexOf('if (isProd) {'), handler.indexOf('} else console.error(err);'));
  assert.ok(productionBranch.includes('safeCode') && productionBranch.includes('safeName'));
  assert.ok(!productionBranch.includes('console.error(err)'));
});


test('variant migration rebuilds the legacy one-option unique key and creates product image gallery storage', () => {
  assert.match(source, /Existing releases imposed UNIQUE\(product_id, option_value\)/);
  assert.match(source, /CREATE TABLE product_variants_v289_migration/);
  assert.match(source, /UNIQUE\(product_id, option_value COLLATE NOCASE, option_value_2 COLLATE NOCASE\)/);
  assert.match(source, /SELECT id,product_id,option_name,option_value,COALESCE\(option_name_2,''\),COALESCE\(option_value_2,''\),sku,stock,reserved_stock,COALESCE\(image_url,''\),sort_order,active,created_at,updated_at FROM product_variants/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS product_images/);
  assert.match(source, /INSERT OR IGNORE INTO product_images\(product_id,image_url,alt_text,sort_order,is_primary\)/);
  assert.match(source, /export async function listProductImages/);
});


test('new variant table constraint allows the same size in different colours but rejects duplicate combinations', () => {
  const db = new DatabaseSync(':memory:');
  const match = source.match(/CREATE TABLE IF NOT EXISTS product_variants \(([\s\S]*?)\n\);/);
  assert.ok(match, 'new variant table SQL should be available');
  db.exec(`CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);`);
  db.exec(`CREATE TABLE product_variants (${match[1]});`);
  db.exec(`INSERT INTO products(id,name) VALUES(1,'Shirt')`);
  const insert=db.prepare('INSERT INTO product_variants(product_id,option_name,option_value,option_name_2,option_value_2,sku,stock) VALUES(?,?,?,?,?,?,?)');
  insert.run(1,'Colour','Red','Size','S','RED-S',2);
  insert.run(1,'Colour','Blue','Size','S','BLUE-S',3);
  assert.throws(() => insert.run(1,'Colour','Red','Size','S','RED-S-2',9));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM product_variants').get().c,2);
  db.close();
});


test('legacy orders table receives the checkout client token column and unique index', () => {
  assert.match(source, /ensureColumn\('orders','client_token','ALTER TABLE orders ADD COLUMN client_token TEXT'\)/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_token_unique ON orders\(client_token\)/);
  const migrationPosition = source.indexOf("await ensureColumn('orders','client_token'");
  const lookupPosition = source.indexOf('export async function getOrderByClientToken');
  assert.ok(migrationPosition >= 0 && lookupPosition > migrationPosition,
    'the legacy column migration must run before the checkout token lookup can be used');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, email TEXT NOT NULL)');
  const ensureColumn = (table, column, sql) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) db.exec(sql);
  };
  ensureColumn('orders','client_token','ALTER TABLE orders ADD COLUMN client_token TEXT');
  db.exec("CREATE UNIQUE INDEX idx_orders_client_token_unique ON orders(client_token) WHERE client_token IS NOT NULL AND client_token <> ''");
  db.prepare('INSERT INTO orders(id,email,client_token) VALUES(?,?,?)').run(1,'one@example.test','checkout-token-1');
  db.prepare('INSERT INTO orders(id,email,client_token) VALUES(?,?,?)').run(2,'two@example.test',null);
  db.prepare('INSERT INTO orders(id,email,client_token) VALUES(?,?,?)').run(3,'three@example.test',null);
  assert.equal(db.prepare('SELECT * FROM orders WHERE client_token=?').all('not-present').length,0,
    'the checkout idempotency lookup works after the legacy column migration');
  assert.throws(() => db.prepare('INSERT INTO orders(id,email,client_token) VALUES(?,?,?)').run(4,'four@example.test','checkout-token-1'));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,3);
  db.close();
});
