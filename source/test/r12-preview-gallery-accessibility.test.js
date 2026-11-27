import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('static product preview gallery thumbnail has a name and a selected state',()=>{
  const source=readFileSync(new URL('../PREVIEW-PRODUCT-R6.html',import.meta.url),'utf8');
  assert.match(source, /class="product-gallery-thumbnail"[^>]*aria-label="View product photo 1"[^>]*aria-pressed="true"/);
});
test('live product gallery controls name each photograph and expose selected state',()=>{
  const source=readFileSync(new URL('../views/product.ejs',import.meta.url),'utf8');
  assert.match(source,/data-gallery-image[\s\S]*?aria-label="<%= \(\{[^}]*kmr:[^}]*\}\)\[locale\]\|\|'Product photo' %> <%= index\+1 %>"/);
  assert.match(source,/aria-pressed=/);
});
