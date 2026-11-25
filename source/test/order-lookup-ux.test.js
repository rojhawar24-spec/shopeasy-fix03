import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const jsonFromScript = (file) => {
  const source = read(file);
  const match = source.match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/);
  assert.ok(match, `${file} dictionary should remain parseable`);
  return JSON.parse(match[1]);
};

test('guest order lookup is reachable from footer and excluded from search indexing', () => {
  assert.match(read('views/partials/footer.ejs'), /href="\/order-lookup"><%= footerText\('Track an order'\) %><\/a>/);
  assert.match(read('views/partials/footer.ejs'), /'Track an order': 'Suivre une commande'/);
  assert.match(read('views/partials/header.ejs'), /privatePrefixes = \[[^\]]*'\/order-lookup'/);
});

test('order lookup uses a single correct delivery label for each order state', () => {
  const view = read('views/order-lookup.ejs');
  assert.match(view, /deliveryText=order\.status==='completed'\?'Delivered'/);
  assert.match(view, /A delivery date has not yet been confirmed by the store or carrier\./);
  assert.doesNotMatch(view, /3[–-]5 business days/);
});

test('sensitive guest order lookup and return responses are marked no-store', () => {
  const server = read('src/server.js');
  const lookupStart = server.indexOf("app.post('/order-lookup'");
  const lookupEnd = server.indexOf("app.post('/order/:id/return-request'", lookupStart);
  const lookup = server.slice(lookupStart, lookupEnd);
  const returnStart = lookupEnd;
  const returnEnd = server.indexOf("app.get('/account'", returnStart);
  const returns = server.slice(returnStart, returnEnd);
  assert.match(lookup, /res\.set\('Cache-Control','no-store'\)/);
  assert.match(lookup, /res\.set\('Pragma','no-cache'\)/);
  assert.match(returns, /res\.set\('Cache-Control','no-store'\)/);
  assert.match(returns, /res\.set\('Pragma','no-cache'\)/);
});

test('lookup and return copy has matching English, Sorani, Arabic and Dutch dictionary entries', () => {
  const master = jsonFromScript('public/js/i18n.js');
  const ckb = jsonFromScript('public/js/i18n-ckb.js');
  const ar = jsonFromScript('public/js/i18n-ar.js');
  const nl = jsonFromScript('public/js/i18n-nl.js');
  const keys = Object.keys(master.en).sort();
  assert.deepEqual(keys, Object.keys(master.ckb).sort());
  assert.deepEqual(keys, Object.keys(master.ar).sort());
  assert.deepEqual(keys, Object.keys(master.nl).sort());
  assert.deepEqual(keys, Object.keys(nl.nl).sort());
  const required = [
    'ORDER SUPPORT','Track an order','Enter both your order number and the email address used at checkout.',
    'Order number','Find order','We could not find an order matching those details.',
    'Your return request was sent to the store for review.','Status:','Received','Payment recorded',
    'Preparing','Shipped','Delivered','Cancelled','Delivery status:','Estimated delivery:',
    'Not available','A delivery date has not yet been confirmed by the store or carrier.','Items','Total:',
    'Request a return','Item','Choose an item','Request type','Refund review','Damaged item',
    'Wrong item received','Not as described','Changed my mind','Additional details (optional)',
    'Send return request','Choose a valid reason and try again.',
    'The return request could not be submitted. Check the item and quantity, or contact the store.'
  ];
  for (const key of required) {
    assert.ok(Object.hasOwn(master.en, key), `master English key missing: ${key}`);
    assert.ok(Object.hasOwn(master.ckb, key), `master Sorani key missing: ${key}`);
    assert.ok(Object.hasOwn(master.ar, key), `master Arabic key missing: ${key}`);
    assert.ok(Object.hasOwn(ckb.ckb, key), `served Sorani bundle key missing: ${key}`);
    assert.ok(Object.hasOwn(ar.ar, key), `served Arabic bundle key missing: ${key}`);
  }
});
