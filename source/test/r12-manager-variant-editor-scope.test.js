import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script = readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');

test('Manager variant editor shares label synchronizer with dynamically created rows',()=>{
  const creator=script.indexOf('const createVariantRow =');
  const synchronizer=script.indexOf('const syncVariantLabels =');
  const editor=script.indexOf('if (variantEditor) {',creator);
  assert.ok(creator>=0&&synchronizer>creator&&editor>synchronizer,'synchronizer must be in the lexical scope of createVariantRow, before the editor initializer');
  assert.match(script.slice(creator,synchronizer),/input\.addEventListener\('input',\s*\(\) => \{ updateVariantRows\(\); syncVariantLabels\(\); \}\)/);
  assert.match(script.slice(synchronizer,editor),/data-variant-label-one/);
});
