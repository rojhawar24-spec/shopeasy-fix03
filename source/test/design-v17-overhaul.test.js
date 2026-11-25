import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('D1 never uses editorial stock art as a live homepage or product fallback',()=>{
  const home=read('views/home.ejs');
  const server=read('src/server.js');
  const fallback=read('public/js/image-fallback.js');
  const branding=read('views/admin/branding.ejs');
  assert.doesNotMatch(home,/hero-editorial\.webp|hero-studio\.svg/);
  assert.doesNotMatch(branding,/hero-editorial\.webp|hero-studio\.svg|default editorial hero/i);
  assert.doesNotMatch(fallback,/hero-editorial\.webp|hero-studio\.svg/);
  assert.match(server,/const heroProduct=latestProducts\.find\(hasRealProductImage\)\|\|null/);
  assert.match(server,/getSetting\('hero_image_mode','catalogue'\)/);
  assert.match(server,/savedHeroImageMode==='custom'/);
  assert.match(server,/const heroImageMode=removeHeroImage\?'catalogue':uploadedHeroImage\?'custom'/);
  assert.match(server,/\['hero_image_mode',heroImageMode\]/);
  assert.match(server,/if\(!candidate \|\|.*hero-editorial/);
  assert.match(home,/v17-empty-spotlight/);
  assert.match(home,/data-fallback-src="\/assets\/product-placeholder\.svg"/);
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('product image upload still stores a validated image and provides a success confirmation path',()=>{
  const server=read('src/server.js');
  const form=read('views/admin/product-form.ejs');
  const preview=read('public/js/product-image-preview.js');
  assert.match(server,/upload\.fields\(\[\{name:'image',maxCount:1\}/);
  assert.match(server,/return safeImagePath\(primaryFile\.buffer,primaryFile\.mimetype\)/);
  assert.match(server,/const savedId=await adminCreateOrUpdateProduct\(data\)/);
  assert.match(server,/`\/admin\/products\/\$\{savedId\}\/edit\?saved=1`/);
  assert.match(form,/data-product-cover-preview/);
  assert.match(form,/saved/);
  assert.match(form,/Product saved/);
  assert.match(preview,/input\.files = transfer\.files/);
});
