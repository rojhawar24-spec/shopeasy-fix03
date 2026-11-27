import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_PRODUCT_GALLERY_IMAGES, MAX_ADDITIONAL_GALLERY_UPLOADS, normalizeProductGallery } from '../src/product-images.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('product gallery is unique, keeps the primary first and allows at most six images', () => {
  assert.equal(MAX_PRODUCT_GALLERY_IMAGES, 6);
  assert.equal(MAX_ADDITIONAL_GALLERY_UPLOADS, 5);
  assert.deepEqual(normalizeProductGallery('/uploads/primary.jpg', ['/uploads/a.jpg', '/uploads/a.jpg', '/uploads/b.jpg']), ['/uploads/primary.jpg', '/uploads/a.jpg', '/uploads/b.jpg']);
  assert.equal(normalizeProductGallery('/cover.jpg', Array.from({ length: 5 }, (_, index) => `/gallery-${index}.jpg`)).length, 6);
});

test('product gallery rejects a seventh distinct image instead of silently truncating it', () => {
  assert.throws(() => normalizeProductGallery('/cover.jpg', Array.from({ length: 6 }, (_, index) => `/gallery-${index}.jpg`)), { message: 'IMAGE_GALLERY_LIMIT' });
});

test('product images use square cover-cropped styling for cards, detail, thumbnails, cart and manager previews', () => {
  const css = read('test/fixtures/legacy-css/product-gallery-manager-polish.css');
  for (const selector of ['.product-card-signature .product-image', '.product-visual-v5', '.product-gallery-thumbnail img', '.cart-item .cart-product-image img', '.product-gallery-editor-item > img']) assert.ok(css.includes(selector), `missing image style ${selector}`);
  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /object-fit:\s*cover/);
  assert.match(css, /object-position:\s*center center/);
});

test('product detail gallery keeps a main image and clickable thumbnail controls', () => {
  const template = read('views/product.ejs');
  const script = read('public/js/app.js');
  assert.match(template, /data-product-main-image/);
  assert.match(template, /data-gallery-image/);
  assert.match(script, /querySelectorAll\('\[data-gallery-image\]'\)/);
  assert.match(script, /mainImage\.src = button\.dataset\.imageUrl/);
  assert.match(template, /productImagesForPage\.find\(image=>Number\(image\.is_primary\)===1\)/);
});

test('Multer and the product route cap file uploads at one cover plus five gallery files', () => {
  const server = read('src/server.js');
  assert.match(server, /files:\s*6/);
  assert.match(server, /upload\.fields\(\[\{name:'image',maxCount:1\},\{name:'galleryImages',maxCount:MAX_ADDITIONAL_GALLERY_UPLOADS\}\]\)/);
  assert.match(server, /galleryImageUrls\.length>MAX_ADDITIONAL_GALLERY_UPLOADS/);
  assert.match(server, /normalizeProductGallery\(image,\[\.\.\.keptImages,\.\.\.galleryImageUrls,\.\.\.uploadedGallery\]\)/);
});

test('product image primary uniqueness migration is safe to rerun', () => {
  const db = read('src/db.js');
  assert.match(db, /UPDATE product_images SET is_primary=1 WHERE id IN \([\s\S]*?NOT EXISTS \(SELECT 1 FROM product_images marked/);
  assert.match(db, /UPDATE products SET image_url=\([\s\S]*?WHERE EXISTS \(SELECT 1 FROM product_images WHERE product_id=products\.id AND is_primary=1\)/);
  assert.match(db, /CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary ON product_images\(product_id\) WHERE is_primary=1/);
  assert.match(db, /CREATE TRIGGER IF NOT EXISTS trg_product_images_max_six_insert[\s\S]*?COUNT\(\*\)[\s\S]*?>=6[\s\S]*?RAISE\(ABORT,'IMAGE_GALLERY_LIMIT'\)/);
  assert.match(db, /CREATE TRIGGER IF NOT EXISTS trg_product_images_max_six_move/);
});

test('image deletion checks ownership and last-image protection in one write transaction', () => {
  const db = read('src/db.js');
  assert.match(db, /export async function deleteProductImage\(productId, imageId\)[\s\S]*?transaction\('write'\)/);
  assert.match(db, /WHERE id=\? AND product_id=\?/);
  assert.match(db, /if\(current\.length<=1\) throw new Error\('LAST_PRODUCT_IMAGE'\)/);
  assert.match(db, /UPDATE products SET image_url=\?,updated_at=datetime\('now'\) WHERE id=\?/);
  assert.match(db, /DELETE FROM product_images WHERE id=\? AND product_id=\?/);
  assert.match(db, /UPDATE product_variants SET image_url='',updated_at=datetime\('now'\) WHERE product_id=\? AND image_url=\?/);
  assert.match(db, /tx\.commit\(\)/);
});

test('image deletion route is Manager-only, CSRF-protected and cleans unreferenced uploaded files', () => {
  const server = read('src/server.js');
  assert.match(server, /app\.post\('\/admin\/products\/:productId\/images\/:imageId\/delete',requireManager,verifyCsrf/);
  assert.match(server, /deleteProductImage\(productId,imageId\)/);
  assert.match(server, /deleteUploadedAsset\(result\.deletedImage\.image_url\)/);
  assert.match(server, /galleryNotice=last/);
  assert.match(server, /product_image_deleted/);
});

test('manager product editor has per-image confirmation forms outside the save form', () => {
  const template = read('views/admin/product-form.ejs');
  const saveEnd = template.indexOf('</form>', template.indexOf('id="product-save-form"'));
  const deleteForms = template.indexOf('class="product-image-delete-form-store"');
  assert.ok(saveEnd > -1 && deleteForms > saveEnd, 'delete forms must not be nested inside the save form');
  assert.match(template, /data-delete-product-image/);
  assert.match(template, /form="<%= deleteFormId %>"/);
  assert.match(template, /data-confirm="Delete this image/);
  assert.match(template, /if\(productImagesSafe\.length<=1\)\{ %>disabled aria-disabled="true"/);
});

test('image deletion confirmation is not repeated during CSRF token refresh', () => {
  const script = read('public/js/app.js');
  assert.match(script, /confirmedForCsrfRefresh === '1' && form\.dataset\.csrfRefreshState === 'ready'/);
  assert.match(script, /delete form\.dataset\.confirmedForCsrfRefresh/);
  assert.match(script, /catch \(error\) \{[\s\S]*?delete form\.dataset\.confirmedForCsrfRefresh/);
});

test('active app.css includes gallery and responsive manager dashboard styles', () => {
  const header = read('views/partials/header.ejs');
  const css = read('public/css/app.css');
  const dashboard = read('views/admin/dashboard.ejs');
  assert.match(header, /href="\/css\/design-foundation\.min\.css\?v=[A-Za-z0-9._-]+<%= typeof assetRevision === 'string' \? assetRevision : '' %>"/, "storefront must load the compiled foundation containing app.css with a versioned URL");
  assert.doesNotMatch(header, /href="\/css\/(?:style|design-v17)\.css/);
  assert.match(dashboard, /include\('\.\.\/partials\/admin-nav'\)/);
  assert.doesNotMatch(dashboard, /manager-dashboard-sidebar|manager-dashboard-nav/);
  assert.match(read('views/partials/admin-nav.ejs'), /href="\/admin\/products"/);
  assert.match(css, /\.product-visual-v5/);
  assert.match(css, /\.product-gallery-thumbnail img/);
  assert.match(css, /\.product-gallery-editor-item > img/);
  assert.match(css, /\.manager-dashboard-shell/);
  assert.match(css, /@media \(max-width: 639px\)/);
});
