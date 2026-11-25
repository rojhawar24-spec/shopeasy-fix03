import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const prefix="app.post('/cart/coupon',couponLimiter,async(req,res)=>{";
const start=server.indexOf(prefix);
const end=server.indexOf('\n});',start+prefix.length);
assert.ok(start>=0&&end>start);
const source=server.slice(start+prefix.length,end);

function couponHandler({subtotal,bundleDiscount,minimum}) {
  const writes=[];
  const handler=vm.runInNewContext(`(async(req,res)=>{${source}\n})`,{
    cleanText:(value,max)=>String(value??'').trim().slice(0,max),
    getCoupon:async()=>({code:'NEW',min_subtotal_cents:minimum}),
    cartSummary:async()=>({subtotal,bundleDiscount}),
    saveSessionCoupon:async(...args)=>writes.push(args)
  });
  return {handler,writes};
}

test('coupon missing its minimum after a bundle leaves an existing valid coupon in place',async()=>{
  const {handler,writes}=couponHandler({subtotal:2000,bundleDiscount:600,minimum:1500});
  const req={body:{code:'NEW'},sessionId:'session',session:{coupon:'EXISTING'}};
  const redirects=[];
  await handler(req,{redirect:(status,target)=>redirects.push({status,target})});
  assert.deepEqual(redirects,[{status:303,target:'/cart?couponMessage=minimum'}]);
  assert.equal(req.session.coupon,'EXISTING');
  assert.deepEqual(writes,[]);
});

test('coupon exactly meeting its minimum after the bundle is applied',async()=>{
  const {handler,writes}=couponHandler({subtotal:2000,bundleDiscount:600,minimum:1400});
  const req={body:{code:'NEW'},sessionId:'session',session:{coupon:'EXISTING'}};
  let target;
  await handler(req,{redirect:(_status,url)=>target=url});
  assert.equal(target,'/cart?couponMessage=applied');
  assert.equal(req.session.coupon,'NEW');
  assert.deepEqual(writes,[['session','NEW']]);
});

test('minimum checks without bundles retain the normal coupon behaviour',async()=>{
  const {handler,writes}=couponHandler({subtotal:1500,bundleDiscount:0,minimum:1500});
  const req={body:{code:'NEW'},sessionId:'session',session:{coupon:null}};
  await handler(req,{redirect:()=>{}});
  assert.equal(req.session.coupon,'NEW');
  assert.deepEqual(writes,[['session','NEW']]);
});
