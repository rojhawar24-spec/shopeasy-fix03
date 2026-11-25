import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { allocateCouponDiscountAcrossItems, maxRefundForRequestCents, availableRefundMaximumCents } from '../src/order-return-rules.js';

const database=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');

function loadFunction(name, next, context) {
  const prefix=`export async function ${name}(`;
  const start=database.indexOf(prefix);
  const end=database.indexOf(`export async function ${next}(`,start+prefix.length);
  assert.ok(start>=0&&end>start);
  const source=database.slice(start,end).replace(/^export /,'');
  return vm.runInNewContext(`(()=>{${source};return ${name};})()`,context);
}

function harness({manualRefunded=0,tenderRefunded=0}={}) {
  const writes=[];
  const tx={commit:async()=>writes.push('commit'),rollback:async()=>writes.push('rollback')};
  const row={id:8,order_id:11,order_item_id:3,gift_card_id:7,payment_provider:'gift_card',
    request_type:'refund',status:'approved',order_status:'completed',quantity:1,purchased_quantity:1,
    product_id:1,variant_id:null,item_total_cents:1000,total_cents:1000,discount_cents:0,bundle_discount_cents:0};
  const sum=(sql,value)=>{
    const result={amount:value,refunded_cents:value,tender_refunded_cents:value};
    for (const match of sql.matchAll(/\bAS\s+([A-Za-z_][A-Za-z_0-9]*)/gi)) result[match[1]]=value;
    return result;
  };
  const context={
    db:{transaction:async()=>tx},
    getRow:async(sql)=>{
      if(sql.includes('FROM order_returns r JOIN orders'))return row;
      if(sql.includes('FROM orders WHERE id='))return {...row,id:11,status:'completed'};
      if(sql.includes('FROM order_returns')&&/SUM\(/.test(sql))return sum(sql,manualRefunded);
      if(sql.includes('FROM gift_card_ledger')&&sql.includes("event='redeem'"))return {amount_cents:1000};
      if(sql.includes('FROM gift_card_ledger')&&sql.includes("event='refund'"))return /SUM\(/.test(sql)?sum(sql,tenderRefunded):(tenderRefunded?{id:55}:null);
      throw Error(`Unexpected query: ${sql}`);
    },
    getRows:async()=>[{id:3,total_cents:1000}],
    run:async(sql)=>{writes.push(sql);return {changes:1};},
    allocateCouponDiscountAcrossItems,maxRefundForRequestCents,availableRefundMaximumCents
  };
  return {context,writes};
}

test('full gift credit is refused after a cash/manual refund without mutating either ledger',async()=>{
  const {context,writes}=harness({manualRefunded:100});
  const refund=loadFunction('refundGiftCardOrderCredit','claimPeppolSubmission',context);
  await assert.rejects(refund({orderId:11,managerId:2,reason:'Customer return confirmed'}));
  assert.ok(!writes.some(value=>value.startsWith('UPDATE')||value.startsWith('INSERT')));
  assert.ok(writes.includes('rollback'));
});

test('cash/manual refund is refused after the original tender has already been fully credited',async()=>{
  const {context,writes}=harness({tenderRefunded:1000});
  const refund=loadFunction('processOrderReturn','listUserOrders',context);
  const result=await refund({returnId:8,action:'record_refund',managerUserId:2,refundAmountCents:100,refundMethod:'cash'});
  assert.equal(result.changed,false);
  assert.ok(!writes.some(value=>value.startsWith('UPDATE')||value.startsWith('INSERT')));
});

test('ordinary full gift-credit refund still commits once when no other refund was recorded',async()=>{
  const {context,writes}=harness();
  const refund=loadFunction('refundGiftCardOrderCredit','claimPeppolSubmission',context);
  const result=await refund({orderId:11,managerId:2,reason:'Customer return confirmed'});
  assert.equal(result.refunded,true);
  assert.equal(result.amountCents,1000);
  assert.equal(writes.filter(value=>value==='commit').length,1);
});

test('repeating an already-issued gift-credit refund remains idempotent',async()=>{
  const {context,writes}=harness({tenderRefunded:1000});
  const refund=loadFunction('refundGiftCardOrderCredit','claimPeppolSubmission',context);
  const result=await refund({orderId:11,managerId:2,reason:'Customer return confirmed'});
  assert.equal(result.alreadyRefunded,true);
  assert.ok(!writes.some(value=>value.startsWith('UPDATE')||value.startsWith('INSERT')));
});

test('displayed refund maximum uses the combined ledger and allows only the remaining amount',()=>{
  assert.equal(availableRefundMaximumCents({requestMaximumCents:1000,itemNetTotalCents:1000,orderTotalCents:1000,tenderRefundedCents:1000}),0);
  assert.equal(availableRefundMaximumCents({requestMaximumCents:1000,itemNetTotalCents:1000,itemRefundedCents:100,orderTotalCents:1000,orderRefundedCents:100,tenderRefundedCents:700}),200);
  assert.equal(availableRefundMaximumCents({requestMaximumCents:1000,itemNetTotalCents:1000,orderTotalCents:1000,tenderRefundedCents:-1}),0);
});
