import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());

test('catalog category foundation contains hierarchical manager fields',()=>{
  const db=fs.readFileSync(path.join(root,'src/db.js'),'utf8');
  const admin=fs.readFileSync(path.join(root,'views/admin/categories.ejs'),'utf8');
  const header=fs.readFileSync(path.join(root,'views/partials/header.ejs'),'utf8');
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  const shop=fs.readFileSync(path.join(root,'views/shop.ejs'),'utf8');
  assert.match(db,/parent_id/);
  assert.match(db,/WITH RECURSIVE ancestors[\s\S]*descendants/);
  assert.match(admin,/name=\"parentId\"/);
  assert.match(admin,/name=\"sortOrder\"/);
  assert.match(db,/CATEGORY_HAS_CHILDREN/);
  assert.match(header,/nav-category-menu/);
  assert.match(server,/function onlyCategoriesWithActiveAncestors\(rows\)/);
  assert.match(server,/childCategories=allCategories\.filter/);
  assert.match(shop,/id="subcategory-title"/);
  assert.match(shop,/_childCategories\.forEach\(child=>/);
});

test('category routes are manager-protected and storefront-driven',()=>{
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  assert.match(server,/app\.get\('\/category\/:slug'/);
  assert.match(server,/app\.get\('\/admin\/categories',requireManager/);
  assert.match(server,/app\.post\('\/admin\/categories\/save',requireManager/);
  assert.match(server,/app\.post\('\/admin\/categories\/delete',requireManager/);
});

test('manager and storefront category controls support arbitrary depth instead of a fixed two-level catalog',()=>{
  const admin=fs.readFileSync(path.join(root,'views/admin/categories.ejs'),'utf8');
  const product=fs.readFileSync(path.join(root,'views/admin/product-form.ejs'),'utf8');
  const header=fs.readFileSync(path.join(root,'views/partials/header.ejs'),'utf8');
  const shop=fs.readFileSync(path.join(root,'views/shop.ejs'),'utf8');
  assert.match(admin,/function parentOptions\(parentId,depth(?:,seen=new Set\(\))?\)/);
  assert.match(product,/function productCategoryOptions\(parentId,depth(?:,seen=new Set\(\))?\)/);
  assert.match(header,/function renderNavCategory\(c,depth=0\)/);
  assert.match(shop,/function shopCategoryOptions\(parentId,depth(?:,seen=new Set\(\))?\)/);
  assert.match(admin,/Create clear groups so customers can find products quickly/);
  assert.match(admin,/Optional\. Choose a parent only for a subcategory/);
  assert.match(product,/Choose the category where customers will look for this product/);
  assert.doesNotMatch(admin,/Build any depth/);
});



test('public category counts exclude inactive child categories and inactive products',()=>{
  const db=fs.readFileSync(path.join(root,'src/db.js'),'utf8');
  const start=db.indexOf('export async function listCategories');
  const end=db.indexOf('export async function getCategoryBySlug',start);
  const block=db.slice(start,end);
  assert.ok(block.includes("const productCountWhere=activeOnly?' AND pr.active=1':'';"));
  assert.ok(block.includes("const childCountWhere=activeOnly?' AND ch.active=1':'';"));
  assert.ok(block.includes('WHERE pr.category_id=c.id${productCountWhere}'));
  assert.ok(block.includes('WHERE ch.parent_id=c.id${childCountWhere}'));
});
