import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('image uploads set explicit multipart resource limits', () => {
  const server = read('src/server.js');
  const match = server.match(/const upload=multer\(\{[\s\S]*?\n\}\);/);
  assert.ok(match, 'Multer upload configuration must be explicit');
  const config = match[0];
  for (const rule of [
    /fileSize:\s*2\*1024\*1024/,
    /files:\s*6/,
    /fields:\s*400/,
    /fieldSize:\s*32\*1024/,
    /fieldNameSize:\s*100/,
    /fieldArrayIndexLimit:\s*100/,
    /parts:\s*420/,
    /fieldNestingDepth:\s*10/,
    /headerPairs:\s*100/
  ]) assert.match(config, rule, `missing upload limit ${rule}`);
  assert.match(config, /multer\.memoryStorage\(\)/, 'Uploads must use explicitly bounded memory storage');
  assert.match(config, /image\/jpeg.*image\/png.*image\/webp/, 'Only supported image MIME types are accepted');
});

test('multipart upload routes authenticate staff before parsing request bodies and still validate CSRF', () => {
  const server = read('src/server.js');
  for (const route of ["app.post('/admin/products/save'", "app.post('/admin/stories/save'"]) {
    const start = server.indexOf(route);
    assert.ok(start >= 0, `${route} must exist`);
    const end = server.indexOf('});', start);
    const block = server.slice(start, end > start ? end : start + 600);
    const manager = block.indexOf('requireManager');
    const expectedParser = route.includes('/products/save')
      ? "upload.fields([{name:'image',maxCount:1},{name:'galleryImages',maxCount:MAX_ADDITIONAL_GALLERY_UPLOADS}])"
      : "upload.single('image')";
    const parser = block.indexOf(expectedParser);
    const csrf = block.indexOf('verifyCsrf');
    assert.ok(manager >= 0 && parser > manager && csrf > parser, `${route}: manager auth must run before Multer and CSRF verification must run afterward`);
  }
});

test('multipart limits leave room for all manager product and story form fields', () => {
  const config = read('src/server.js');
  const fieldsLimit = Number(config.match(/fields:\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(fieldsLimit) && fieldsLimit >= 30, 'fields cap must leave room for the manager product editor');
  for (const form of ['views/admin/product-form.ejs', 'views/admin/story-form.ejs']) {
    const names = [...read(form).matchAll(/name="([^"]+)"/g)].map(m => m[1]);
    assert.ok(names.length <= fieldsLimit, `${form} has ${names.length} static named fields, over the ${fieldsLimit} fields cap`);
  }
});
