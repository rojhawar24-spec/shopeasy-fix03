import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateBundleDiscount,normalizeBundleRules} from '../src/bundle-promotions.js';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertDesignDelivery} from './helpers/design-delivery-contract.mjs';

const rules=[{productIds:[1,2],discountPercent:20}];

test('R11: bundle promotion honours the price of each selected variant unit',()=>{
 const lines=[{productId:1,price:1000,quantity:1},{productId:1,price:3000,quantity:1},{productId:2,price:5000,quantity:2}];
 const result=calculateBundleDiscount(lines,rules);
 assert.equal(result.discountCents,800);
 assert.equal(result.applied[0].count,2);
});

test('R11: bundle discount is independent of cart line order',()=>{
 const lines=[{productId:1,price:1000,quantity:1},{productId:1,price:3000,quantity:1},{productId:2,price:5000,quantity:2}];
 const a=calculateBundleDiscount(lines,rules);
 const b=calculateBundleDiscount([...lines].reverse(),rules);
 assert.deepEqual(a,b);
});

test('R11: bundle discount never exceeds the total of paired cheaper units',()=>{
 const lines=[{productId:1,price:100,quantity:1},{productId:1,price:10000,quantity:1},{productId:2,price:5000,quantity:1}];
 assert.equal(calculateBundleDiscount(lines,rules).discountCents,20);
});

test('R11: rules do not stack over the same product',()=>{
 const input=[{productIds:[1,2],discountPercent:20},{productIds:[2,3],discountPercent:50}];
 assert.equal(normalizeBundleRules(input).length,1);
});

test('R11: safe integer money amounts are enforced when aggregating bundles',()=>{
 assert.throws(()=>calculateBundleDiscount([{productId:1,price:Number.MAX_SAFE_INTEGER,quantity:2},{productId:2,price:Number.MAX_SAFE_INTEGER,quantity:2}],rules));
});

test('R11: both checkout quote and atomic order use the same bundle pricing module',async()=>{
 const {readFileSync}=await import('node:fs');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const db=readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
 assert.match(server,/calculateBundleDiscount\(normalized,bundleRules\)/);
 assert.match(db,/calculateBundleDiscount\(normalized\.map\(line=>/);
});

test('R11: Manager recent orders reserve a full mobile grid row for email',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../public/css/research-polish-2027.css',import.meta.url),'utf8');
 assert.match(css,/admin-dashboard-table td:nth-child\(2\)\s*\{\s*grid-column:1 \/ -1/);
});

test('R11: all active runtime design layers are validated by the source build check',async()=>{
 assertDesignDelivery();
 const check=spawnSync(process.execPath,['scripts/build-design-css.mjs','--check'],{cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8'});
 assert.equal(check.status,0,check.stdout+check.stderr);
});
