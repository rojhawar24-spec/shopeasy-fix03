import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const server=read('src/server.js');

test('R19 new buyer: public category, product, cart and guest checkout endpoints exist',()=>{
  for(const route of ["app.get('/category/:slug'","app.get('/product/:slug'","app.get('/cart'","app.get('/checkout'"]) assert.ok(server.includes(route),route);
  for(const route of ["app.post('/cart/add'","app.post('/cart/update'","app.post('/checkout'"]) assert.ok(server.includes(route),route);
});
test('R19 repeat buyer: account, recovery, order lookup and own orders are guarded',()=>{
  for(const route of ["app.get('/login'","app.post('/login'","app.get('/forgot-password'","app.get('/order-lookup'"])assert.ok(server.includes(route),route);
  assert.match(server,/app\.get\('\/account',requireAuth/);
  assert.match(server,/app\.get\('\/account\/order\/:id',requireAuth/);
});
test('R19 Manager: product upload stays role-gated with CSRF and photo caps',()=>{
  assert.match(server,/app\.get\('\/admin\/products\/new',requireManager/);
  assert.match(server,/app\.post\('\/admin\/products\/save',requireManager,upload\.fields/);
  assert.match(server,/upload\.fields\(\[\{name:'image',maxCount:1\},\{name:'galleryImages',maxCount:MAX_ADDITIONAL_GALLERY_UPLOADS\}\]\),verifyCsrf/);
  assert.ok(server.includes('readImageDimensions(buffer,mime)'));
});
test('R19 restricted Admin: dashboard access is separate from full Manager writes',()=>{
  assert.match(server,/app\.get\('\/admin',requireDashboardAccess/);
  for(const route of ["app.get('/admin/staff',requireManager","app.post('/admin/products/save',requireManager","app.post('/admin/orders/status',requireManager","app.post('/admin/returns/:id/action',requireManager"])assert.ok(server.includes(route),route);
});
test('R19 attacker: important requests have CSRF, throttling, idempotency or safe upload checks',()=>{
  assert.ok(server.includes('app.use(generalLimiter);'));
  assert.ok(server.includes('app.use(csrfToken);'));
  assert.ok(server.includes('verifyCsrf(req,res,next)'));
  assert.match(server,/app\.post\('\/checkout',checkoutDiagnosticStage\('checkout-rate-limit'\),checkoutLimiter/);
  assert.match(server,/if\(!assertUploadSignature\(buffer,mime\) \|\| !readImageDimensions\(buffer,mime\)\) return null/);
});
test('R19 engineer: source provides health, readiness, audits and offline-local runtime',()=>{
  assert.match(server,/app\.get\('\/health'/);
  assert.match(server,/app\.get\('\/ready'/);
  const pkg=JSON.parse(read('package.json'));
  for(const key of ['check','test','audit:static','preflight:release','audit:free-db','audit:images'])assert.ok(pkg.scripts[key],key);
});
test('R19 database: local SQLite WAL, queued transactions and encrypted backups remain',()=>{
  const db=read('src/database.js');
  assert.match(db,/PRAGMA journal_mode = WAL/);
  assert.match(db,/installLocalSqliteTransactionQueue\(rawClient\)/);
  const backup=read('scripts/backup-database.mjs');
  assert.match(backup,/BACKUP_ENCRYPTION_KEY/);
  assert.match(backup,/writeCompressedBackup/);
});
test('R19 UX: proper links, product photos, consent controls and responsive CSS remain',()=>{
  assert.match(read('views/product.ejs'),/data-product-gallery/);
  assert.match(read('views/admin/product-form.ejs'),/data-gallery-stage/);
  assert.match(read('views/partials/footer.ejs'),/data-cookie-reject/);
  assert.match(read('views/partials/footer.ejs'),/data-cookie-save/);
  assert.match(read('public/css/research-polish-2027.css'),/prefers-reduced-motion|body\.is-admin-app \.product-photo-quality-guide/);
});
test('R19 returning customer: full-size product photo uses selected gallery or variant and closes accessibly',()=>{
  const product=read('views/product.ejs');
  const footer=read('views/partials/footer.ejs');
  const zoom=read('public/js/product-photo-zoom.js');
  const css=read('public/css/research-polish-2027.css');
  assert.match(product,/data-product-main-image/);
  assert.match(product,/data-product-photo-expand/);
  assert.match(product,/<dialog[^>]*data-product-photo-dialog/);
  assert.match(product,/data-product-photo-close/);
  assert.match(product,/data-product-photo-large/);
  assert.match(footer,/\/js\/product-photo-zoom\.js/);
  assert.match(zoom,/main\.getAttribute\('src'\) \|\| main\.currentSrc \|\| main\.src/);
  assert.match(zoom,/dialog\.showModal\(\)/);
  assert.match(zoom,/dialog\.addEventListener\('close',\s*\(\)\s*=>\s*\{[^}]*link\.focus\(\)/);
  assert.match(css,/\.product-photo-dialog::backdrop/);
  assert.match(css,/\.product-photo-expand[^\n]*min-height:44px/);
});
