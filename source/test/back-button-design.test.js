import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const template = await readFile(new URL('../views/partials/back-button.ejs', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/css/app.css', import.meta.url), 'utf8');
const polish = await readFile(new URL('../public/css/research-polish-2027.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');

test('back link uses safe deterministic destination, not browser history or a stale checkout form',()=>{
  for(const locale of ['nl','en','ckb','ar','fr'])assert.ok(template.includes(`${locale}:`));
  for(const name of ['Terug naar winkelmandje','Back to bag','Retour au panier','گەڕانەوە بۆ سەبەتە','العودة إلى السلة'])assert.ok(template.includes(name));
  assert.match(template,/const backDestination =/);
  assert.match(template,/requested\)/);
  assert.match(template,/href="<%= backDestination %>"/);
  assert.match(template,/aria-label="<%= backLabel %>"/);
  assert.doesNotMatch(template,/data-smart-back|history\.back/);
  assert.doesNotMatch(app,/history\.back\(\)/);
  assert.match(css,/\.back-button:focus-visible/);
  assert.match(css,/html\[dir="rtl"\] \.back-button::before/);
  assert.match(polish,/\.product-return-navigation/);
  assert.match(polish,/\.page-back/);
});
