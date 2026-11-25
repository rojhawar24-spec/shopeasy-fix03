import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
const view=(name)=>fs.readFileSync(path.join(root,'views',`${name}.ejs`),'utf8');

test('new-order stock conflicts redirect safely after owned-payment recovery checks',()=>{
  assert.match(server,/if\(summary\.hasStockIssues&&!recoveryOrder\)return res\.redirect\(303,'\/cart\?stockMessage=changed'\)/);
  assert.doesNotMatch(server,/\.render\('cart',\{\.\.\.summary,couponMessage:'',stockMessage:'changed'\}\)/);
  const branches=[...server.matchAll(/if\(summary\.hasStockIssues&&!resumedExistingOrder\)\{\s*(const cleanCart=[\s\S]*?return res\.redirect\(303,'\/cart\?stockMessage=changed'\);)\s*\}/g)];
  assert.equal(branches.length,1);
  assert.ok(server.indexOf('resumedExistingOrder=existing')<server.indexOf('if(summary.hasStockIssues&&!resumedExistingOrder)'));
});

test('stock guard preserves new-order quantities while leaving an owned reservation untouched',async()=>{
  const branch=server.match(/if\(summary\.hasStockIssues&&!resumedExistingOrder\)\{\s*(const cleanCart=[\s\S]*?return res\.redirect\(303,'\/cart\?stockMessage=changed'\);)\s*\}/)?.[1];
  assert.ok(branch);
  const handler=new Function('summary','resumedExistingOrder','saveSessionCart','req','res',`return (async()=>{if(summary.hasStockIssues&&!resumedExistingOrder){${branch}}return 'no-conflict';})();`);
  const calls=[];
  const res={redirect:(status,url)=>{calls.push(['redirect',status,url]);return 'redirected';},render:()=>{throw new Error('Should not render cart directly');}};
  const summary={hasStockIssues:true,items:[{productId:7,variantId:3,quantity:2},{productId:8,quantity:1}]};
  const result=await handler(summary,null,async(sid,cart)=>{calls.push(['save',sid,cart]);},{sessionId:'example'},res);
  assert.equal(result,'redirected');
  assert.deepEqual(calls,[['save','example',[{productId:7,variantId:3,quantity:2},{productId:8,quantity:1}]],['redirect',303,'/cart?stockMessage=changed']]);
  const neverSave=()=>{throw new Error('Recovery must not rewrite the cart');};
  assert.equal(await handler(summary,{id:17},neverSave,{},res),'no-conflict');
  assert.equal(await handler({hasStockIssues:false,items:[]},null,neverSave,{},res),'no-conflict');
});

test('the order lookup GET has safe missing-response defaults, including returnRequested',()=>{
  assert.match(server,/const defaults=\{[^\n]*returnRequested:false,bankTransferInfo:null/);
  assert.match(server,/app\.get\('\/order-lookup'/);
  assert.match(view('order-lookup'),/if\(typeof returnRequested!=='undefined' && returnRequested\)/);
  assert.doesNotThrow(()=>new Function('locals',"with(locals){return typeof returnRequested!=='undefined' && returnRequested;}")({}));
});

test('error response checkout form receives the missing security notice safely',()=>{
  assert.match(server,/const checkoutView=\{[^\n]*securityNotice:false\};/);
  assert.match(view('checkout'),/if\(typeof securityNotice!=='undefined' && securityNotice\)/);
});

test('failed customer return request preserves bank transfer snapshot and does not mask original error',()=>{
  assert.match(server,/render\('order',\{order,bankTransferInfo:parseBankTransferSnapshot\(order\.payment_instructions_snapshot\),orderHistory,returns,cancelResult:'',securityNotice:false,returnError:/);
  assert.match(view('order'),/typeof bankTransferInfo!=='undefined' && bankTransferInfo/);
});

test('every page that conditionally displays a security notice tolerates missing optional data',()=>{
  for(const name of ['cart','checkout','order','order-lookup','shop','success']){
    const source=view(name);
    assert.doesNotMatch(source,/if\(securityNotice\)/,`${name} should not assume data was loaded`);
    assert.match(source,/if\(typeof securityNotice!=='undefined' && securityNotice\)/,name);
  }
});
