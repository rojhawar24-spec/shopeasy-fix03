import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.cwd());
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('manager can increase existing product stock without recreating the product',()=>{
  const server=read('src/server.js');
  const db=read('src/db.js');
  const form=read('views/admin/product-form.ejs');
  const list=read('views/admin/products.ejs');
  assert.match(server,/app\.post\('\/admin\/products\/restock',requireManager,verifyCsrf/);
  assert.match(server,/await restockProduct\(productId,amount\)/);
  assert.match(server,/await restockProductVariant\(variantId,amount\)/);
  assert.match(db,/SET stock=stock\+\?, updated_at=datetime\('now'\)/);
  assert.match(db,/SET stock=stock\+\?, updated_at=datetime\('now'\)/);
  assert.match(form,/Add stock without changing the product/);
  assert.match(form,/action="\/admin\/products\/restock"/);
  assert.match(form,/typeof saved!=='undefined'/);
  assert.match(form,/typeof restockError!=='undefined'/);
  assert.match(list,/\+ Stock/);
  assert.match(server,/app\.post\('\/admin\/products\/restore'/);
  assert.match(server,/app\.post\('\/admin\/products\/delete'/);
});

test('restock is bounded and cannot overflow stock',()=>{
  const db=read('src/db.js');
  assert.match(db,/amount > 100000000/);
  assert.match(db,/stock<=100000000-\?/);
  assert.match(db,/active=1/);
});

test('story click on the dedicated Stories page opens an accessible viewer with direct product purchase action',()=>{
  const home=read('views/home.ejs');
  const stories=read('views/stories.ejs');
  const viewer=read('views/partials/story-viewer.ejs');
  const app=read('public/js/app.js');
  const css=read('test/fixtures/legacy-css/style.css');
  assert.doesNotMatch(home,/data-story-open/, 'homepage intentionally has no Stories carousel');
  assert.doesNotMatch(home,/include\('partials\/story-viewer'\)/, 'homepage does not ship an unused story dialog');
  assert.match(stories,/data-story-open/);
  assert.match(stories,/include\('partials\/story-viewer'\)/);
  assert.match(viewer,/<dialog[^>]+data-story-viewer/);
  assert.match(viewer,/data-story-buy-form/);
  assert.match(viewer,/data-story-product-link/);
  assert.match(app,/showModal\(\)/);
  assert.match(app,/ArrowLeft/);
  assert.match(app,/ArrowRight/);
  assert.match(app,/meta\[name="csrf-token"\]/);
  assert.match(css,/\.story-viewer/);
});

test('active stories expose product stock and variant metadata to the viewer',()=>{
  const db=read('src/db.js');
  assert.match(db,/product_available_stock/);
  assert.match(db,/product_variant_count/);
  assert.match(db,/p\.slug AS product_slug/);
});

test('story viewer does not nest product anchors inside the clickable story card',()=>{
  const home=read('views/home.ejs');
  const stories=read('views/stories.ejs');
  assert.doesNotMatch(home,/<a[^>]+data-story-open[\s\S]*<a\s/);
  assert.doesNotMatch(stories,/<a[^>]+data-story-open[\s\S]*<a\s/);
});
