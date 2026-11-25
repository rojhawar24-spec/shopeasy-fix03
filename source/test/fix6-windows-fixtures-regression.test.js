import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readImageDimensions} from '../src/image-dimensions.js';
import {parseCartQuantity} from '../src/cart-form-inputs.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('FIX6: R18 test suite uses fileURLToPath, not URL.pathname on Windows',()=>{
  const source=read('test/r18-research-ux-regression.test.js');
  assert.match(source,/fileURLToPath\(new URL\('\.\.', import\.meta\.url\)\)/);
  assert.doesNotMatch(source,/new URL\('\.\.', import\.meta\.url\)\.pathname/);
});

test('FIX6: product Manager smoke test uses a real 640px PNG and rejects corrupt images',()=>{
  const image=fs.readFileSync(path.join(root,'test/fixtures/r19-sample.png'));
  assert.deepEqual(readImageDimensions(image,'image/png'),{width:640,height:640});
  assert.equal(readImageDimensions(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]),'image/png'),null);
  const integration=read('scripts/manager-dashboard-integration.mjs');
  assert.match(integration,/fs\.readFile\(new URL\('\.\.\/test\/fixtures\/r19-sample\.png',import\.meta\.url\)\)/);
  assert.match(integration,/rejectedImage\.status,400/);
});

test('FIX6: automatic discount route validates exact integers, not coerced input',()=>{
  const server=read('src/server.js');
  assert.match(server,/automaticDiscountPercent=parseCartQuantity\(req\.body\.automaticDiscountPercent\)/);
  assert.match(server,/automaticDiscountPercent===null\|\|automaticDiscountPercent>90/);
  for(const bad of [['20'],'2e1','5.5','-1','91','']){
    const actual=parseCartQuantity(bad);
    if(bad==='91') assert.equal(actual,91); else assert.equal(actual,null);
  }
  assert.equal(parseCartQuantity('0'),0);
  assert.equal(parseCartQuantity('90'),90);
});
