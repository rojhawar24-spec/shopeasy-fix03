import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const preview=readFileSync(new URL('../PREVIEW.html',import.meta.url),'utf8');

test('static homepage preview hides empty-search clear control at first render',()=>{
  assert.match(preview, /<button[^>]+id="preview-clear-search"[^>]+hidden>/);
});
test('static homepage preview only reveals clear control when input has a value',()=>{
  assert.match(preview, /clearSearchButton\.hidden\s*=\s*!desktopSearchInput\?\.value/);
  assert.match(preview, /desktopSearchInput\?\.addEventListener\('input', syncClearSearchButton\)/);
  assert.match(preview, /if \(input\) \{ input\.value = ''; input\.focus\(\); \}[\s\S]{0,100}syncClearSearchButton\(\)/);
});
