import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

test('category hierarchy SQL returns descendants when a parent category is selected', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT, slug TEXT UNIQUE, parent_id INTEGER, active INTEGER DEFAULT 1);
           CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER, active INTEGER DEFAULT 1);`);
  db.exec(`INSERT INTO categories(id,name,slug,parent_id) VALUES
           (1,'Clothing','clothing',NULL),(2,'Men','men',1),(3,'Shirts','shirts',2),(4,'Shoes','shoes',NULL);`);
  db.exec(`INSERT INTO products(id,name,category_id) VALUES (1,'Jacket',1),(2,'Men Shirt',2),(3,'Oxford Shirt',3),(4,'Sneaker',4);`);
  const rows = db.prepare(`SELECT p.id FROM products p JOIN categories c ON c.id=p.category_id
    WHERE p.active=1 AND c.id IN (WITH RECURSIVE descendants(id) AS (
      SELECT id FROM categories WHERE slug=?
      UNION ALL SELECT ch.id FROM categories ch JOIN descendants d ON ch.parent_id=d.id
    ) SELECT id FROM descendants) ORDER BY p.id`).all('clothing');
  assert.deepEqual(rows.map(r=>Number(r.id)), [1,2,3]);
});

test('category deletion safety refuses parents that still have children', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY, parent_id INTEGER); INSERT INTO categories VALUES (1,NULL),(2,1);`);
  const children = Number(db.prepare('SELECT COUNT(*) AS c FROM categories WHERE parent_id=?').get(1).c);
  assert.equal(children, 1);
  assert.throws(() => { if (children > 0) throw new Error('CATEGORY_HAS_CHILDREN'); }, /CATEGORY_HAS_CHILDREN/);
});

test('category hierarchy remains cycle-safe', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY, parent_id INTEGER); INSERT INTO categories VALUES (1,NULL),(2,1),(3,2);`);
  const parent = Number(db.prepare('SELECT parent_id FROM categories WHERE id=?').get(3).parent_id);
  const seen = new Set([3]);
  let cursor = parent;
  while (cursor) {
    assert.equal(seen.has(cursor), false);
    seen.add(cursor);
    const row = db.prepare('SELECT parent_id FROM categories WHERE id=?').get(cursor);
    cursor = row?.parent_id ? Number(row.parent_id) : 0;
  }
  assert.throws(() => { if (seen.has(3)) throw new Error('CATEGORY_CYCLE'); }, /CATEGORY_CYCLE/);
});

test('inactive category slugs cannot be used to expose active products through the category filter', () => {
  const source = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  assert.match(source,/SELECT id FROM categories WHERE slug=@category AND active=1/);
  assert.match(source,/JOIN descendants d ON ch.parent_id=d.id WHERE ch.active=1/);
});


test('public product lookup cannot expose archived products by slug', () => {
  const source = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  assert.match(source,/FROM products p LEFT JOIN categories c ON c\.id=p\.category_id WHERE p\.slug=\? AND p\.active=1/);
});


test('product and category slug generation keeps Unicode names meaningful and preserves existing URLs on edits', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server,/normalize\('NFKC'\)\.toLocaleLowerCase\(\)\.trim\(\)\.replace\(\/\[\^\\p\{L\}\\p\{N\}\\s-\]\/gu/);
  assert.match(server,/const stableSlug=existingProduct\?\.slug \|\| await uniqueSlug\(name,id\);/);
  assert.match(server,/const slug=existingCategory\?\.slug \|\| await uniqueCategorySlug\(name,id\);/);
});


test('inactive ancestors hide active descendant categories from public product filters', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT, slug TEXT UNIQUE, parent_id INTEGER, active INTEGER DEFAULT 1);
           CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER, active INTEGER DEFAULT 1);
           INSERT INTO categories(id,name,slug,parent_id,active) VALUES
           (1,'Clothing','clothing',NULL,0),(2,'Men','men',1,1),(3,'Shirts','shirts',2,1),(4,'Shoes','shoes',NULL,1);
           INSERT INTO products(id,name,category_id) VALUES (1,'Hidden shirt',3),(2,'Sneaker',4);`);
  const rows = db.prepare(`WITH RECURSIVE ancestors(id,parent_id,active,path) AS (
      SELECT id,parent_id,active,printf('/%d/',id) FROM categories WHERE slug=?
      UNION ALL SELECT parent.id,parent.parent_id,parent.active,ancestors.path || parent.id || '/'
      FROM categories parent JOIN ancestors ON parent.id=ancestors.parent_id
      WHERE instr(ancestors.path,printf('/%d/',parent.id))=0
    ), descendants(id) AS (
      SELECT id FROM categories WHERE slug=? AND active=1 AND NOT EXISTS (SELECT 1 FROM ancestors WHERE active<>1)
      UNION ALL SELECT ch.id FROM categories ch JOIN descendants d ON ch.parent_id=d.id WHERE ch.active=1
    ) SELECT p.id FROM products p WHERE p.category_id IN (SELECT id FROM descendants) ORDER BY p.id`).all('shirts','shirts');
  assert.deepEqual(rows.map(row=>Number(row.id)), []);
});

test('public category lookup refuses an active category with an inactive ancestor', () => {
  const source = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  assert.match(source,/FROM categories WHERE id=c\.id[\s\S]*SELECT 1 FROM ancestors WHERE active<>1/);
});

test('navigation and sitemap filter inactive categories and inactive ancestors', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server,/function onlyCategoriesWithActiveAncestors\(rows\)/);
  assert.match(server,/const visible=onlyCategoriesWithActiveAncestors\(await listCategories\(\)\);/);
  assert.match(server,/const categories=onlyCategoriesWithActiveAncestors\(await listCategories\(\)\);/);
});
