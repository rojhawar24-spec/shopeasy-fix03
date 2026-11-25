import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../${name}`, import.meta.url),'utf8');

test('storefront uses system font stacks without external font requests or font file dependencies',()=>{
 const css=read('public/css/app.css')+'\n'+read('public/css/design-tokens.css');
 const head=read('views/partials/header.ejs');
 assert.doesNotMatch(css,/https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/i);
 assert.doesNotMatch(css,/@font-face/);
 assert.doesNotMatch(head,/<link rel="preload" href="\/fonts\//);
 assert.match(css,/--font-sorani/);assert.match(css,/--font-arabic/);
 assert.match(css,/system-ui/);
});
