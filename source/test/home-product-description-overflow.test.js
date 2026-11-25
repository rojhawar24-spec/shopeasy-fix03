import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('homepage hero prefers the real newest catalogue product image when no custom hero is selected',()=>{
  const home=read('views/home.ejs');
  const server=read('src/server.js');
  const css=read('test/fixtures/legacy-css/design-v17.css');
  assert.match(home,/safeImageUrl\(heroProduct\.image_url\)/);
  assert.doesNotMatch(home,/hero-editorial\.webp|hero-studio\.svg/);
  assert.match(server,/getSetting\('hero_image',''\)/);
  assert.match(server,/sort:'newest',limit:32/);
  assert.match(home,/heroProduct\.name/);
  assert.match(home,/heroProduct\.image_url/);
  assert.match(home,/class="v17-spotlight-details"/);
  assert.match(home,/id="new-arrivals"/);
  assert.match(server,/const newProducts=latestProducts\.filter/);
  assert.match(css,/\.v17-spotlight-details p[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css,/\.v17-spotlight-details p[\s\S]*?line-height:\s*1\.6/);
});

test('product-card descriptions stay inside narrow cards even when text has no spaces',()=>{
  const card=read('views/partials/product-card.ejs');
  const css=read('test/fixtures/legacy-css/design-v14.css');
  assert.match(card,/class="product-blurb" data-no-translate><%= product\.short_description %><\/p>/);
  assert.match(css,/\.product-card-signature \.product-blurb[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(css,/\.product-card-signature \.product-blurb[\s\S]*?overflow-wrap:\s*anywhere/);
});

test('product detail descriptions stay inside the copy column for long unspaced text',()=>{
  const detail=read('views/product.ejs');
  const css=read('test/fixtures/legacy-css/design-v14.css');
  assert.match(detail,/class="detail-description" data-no-translate><%= product\.description %><\/p>/);
  assert.match(css,/\.detail-description \{ max-width: 100%; color: var\(--muted\); overflow-wrap: anywhere; word-break: normal; \}/);
});
