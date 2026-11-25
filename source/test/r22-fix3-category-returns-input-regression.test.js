import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCartQuantity } from '../src/cart-form-inputs.js';
import { validId } from '../src/security.js';

const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const db=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');

// Type confusion from repeated fields, exponent notation, booleans and
// fractional values must not reach stock, order returns or category ranking.
test('strict whole-number parser rejects malformed category/return quantities',()=>{
  for(const input of [['1'],['1','25'],{},true,false,'1e2','0x10','1.5','-1','Infinity','']){
    assert.equal(parseCartQuantity(input),null,JSON.stringify(input));
  }
  for(const input of ['0','1','99','100000000']) assert.equal(parseCartQuantity(input),Number(input));
});

test('manager category display order is limited to 0–100000000 and explicitly errors',()=>{
  const start=server.indexOf("app.post('/admin/categories/save'");
  const end=server.indexOf("app.post('/admin/categories/delete'",start);
  assert.ok(start>0 && end>start);
  const route=server.slice(start,end);
  assert.match(route,/parseCartQuantity\(sortOrderRaw\)/);
  assert.match(route,/sortOrder===null \|\| sortOrder>100000000/);
  assert.match(route,/CATEGORY_SORT_ORDER:'Display order must/);
  assert.doesNotMatch(route,/Number\(req\.body\.sortOrder\|\|0\)/);
  const dbBlocks=db.slice(db.indexOf('export async function createCategory'),db.indexOf('export async function deleteCategory'));
  assert.equal((dbBlocks.match(/throw new Error\('CATEGORY_SORT_ORDER'\)/g)||[]).length,2);
  assert.doesNotMatch(dbBlocks,/Math\.min\(Math\.max\(Number\(options\.sortOrder\)/);
});

test('all customer order return handlers validate IDs and quantity without coercing repeated values',()=>{
  const guest=server.slice(server.indexOf("app.post('/order/:id/return-request'"),server.indexOf("app.get('/account'"));
  const account=server.slice(server.indexOf("app.post('/account/order/:id/returns'"),server.indexOf("app.post('/payments/mollie/webhook'"));
  const success=server.slice(server.indexOf("app.post('/checkout/success/returns'"),server.indexOf("app.post('/checkout/success/cancel'"));
  assert.match(guest,/validId\(req\.body\.orderItemId\)/);
  for(const route of [guest,account,success]){
    assert.match(route,/parseCartQuantity\(req\.body\.quantity\)/);
    assert.doesNotMatch(route,/quantity=Number\(req\.body\.quantity\)/);
  }
  assert.equal(validId(['10']),false);
  assert.equal(validId('10'),true);
});
