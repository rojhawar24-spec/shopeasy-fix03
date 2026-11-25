import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOrderNotificationEmail,sendPreparedOrderNotificationEmail,sendOrderNotificationEmail} from '../src/services/email.js';

const originalFetch=globalThis.fetch;
const originalKey=process.env.RESEND_API_KEY,originalFrom=process.env.EMAIL_FROM;
process.env.RESEND_API_KEY='re_fix03_synthetic_never_sent';
process.env.EMAIL_FROM='Synthetic Shop <test@example.test>';
let requests=[];
globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),'https://api.resend.com/emails');
  requests.push(options);
  return new Response(JSON.stringify({id:'synthetic-provider-id'}),{headers:{'content-type':'application/json'}});
};
test.after(()=>{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=originalKey;
  if(originalFrom===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=originalFrom;
});
const fixture=(currency='EUR',total=1234)=>({order:{id:17,email:'customer@example.test',status:'pending',currency,total_cents:total,payment_provider:'cash_on_delivery'},items:[{product_name:'Synthetic item',quantity:1,total_cents:total,variant_name:'Size',variant_value:'XL',variant_name_2:'Colour',variant_value_2:'Blue'}],storeName:'Synthetic Shop',locale:'en'});

test('UI-003 order email uses explicit zero, two and three currency digits',async()=>{
  for(const [currency,minor,formatted] of [['JPY',1234,'1,234'],['EUR',1234,'12.34'],['IQD',1234,'1.234'],['IQD',1001,'1.001']]){
    const prepared=await prepareOrderNotificationEmail(fixture(currency,minor));
    const payload=JSON.parse(prepared.payload);
    assert.ok(payload.html.includes(formatted),currency+' HTML');
    assert.ok(payload.text.includes(formatted),currency+' text');
  }
});
test('UI-003 order email fallback preserves major units and configured precision',async()=>{
  const original=Intl.NumberFormat;
  Intl.NumberFormat=function(){throw new Error('Synthetic unavailable locale formatter');};
  try {
    const payload=JSON.parse((await prepareOrderNotificationEmail(fixture('IQD',1234))).payload);
    assert.ok(payload.html.includes('1.234 IQD'));assert.ok(payload.text.includes('1.234 IQD'));
  } finally {Intl.NumberFormat=original;}
});
test('COM-007 retry sends the exact stored body and key after order/store changes',async()=>{
  requests=[];
  const inputs=fixture(),prepared=await prepareOrderNotificationEmail(inputs);
  const first=await sendPreparedOrderNotificationEmail(prepared);
  inputs.order.status='shipped';inputs.storeName='Changed store';
  process.env.EMAIL_FROM='Changed Sender <changed@example.test>';
  const changed=await prepareOrderNotificationEmail(inputs);
  assert.notEqual(changed.payload,prepared.payload);
  const second=await sendPreparedOrderNotificationEmail(prepared);
  assert.equal(first.sent,true);assert.equal(second.sent,true);
  assert.equal(requests.length,2);
  assert.equal(requests[0].body,requests[1].body);
  assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
  assert.equal(requests[1].redirect,'error');
});
test('COM-007 a changed provider credential blocks replay before transport',async()=>{
  const prepared=await prepareOrderNotificationEmail(fixture());
  const key=process.env.RESEND_API_KEY,count=requests.length;
  process.env.RESEND_API_KEY='re_different_synthetic_account';
  try{await assert.rejects(sendPreparedOrderNotificationEmail(prepared),/ORDER_EMAIL_CREDENTIAL_CHANGED/);}finally{process.env.RESEND_API_KEY=key;}
  assert.equal(requests.length,count);
});
test('COM-007 malformed stored payloads and provider keys fail before transport',async()=>{
  const prepared=await prepareOrderNotificationEmail(fixture()),count=requests.length;
  for(const payload of ['{',JSON.stringify({from:'bad',to:[],subject:'x',html:'x',text:'x'}),JSON.stringify({...JSON.parse(prepared.payload),bcc:['other@example.test']})])await assert.rejects(sendPreparedOrderNotificationEmail({...prepared,payload}),/ORDER_EMAIL_INVALID_PAYLOAD/);
  await assert.rejects(sendPreparedOrderNotificationEmail({...prepared,idempotencyKey:'unsafe\nkey'}),/ORDER_EMAIL_INVALID_PAYLOAD/);
  assert.equal(requests.length,count);
});
test('COM-007 provider failure stays distinguishable from a successful send',async()=>{
  const goodFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response('{}',{status:503});
  try{await assert.rejects(sendOrderNotificationEmail(fixture()),/ORDER_EMAIL_SEND_FAILED/);}finally{globalThis.fetch=goodFetch;}
});
test('order email remains disabled when sender credentials are absent',async()=>{
  const key=process.env.RESEND_API_KEY,count=requests.length;
  delete process.env.RESEND_API_KEY;
  try{assert.deepEqual(await sendOrderNotificationEmail(fixture()),{sent:false,skipped:true});}finally{process.env.RESEND_API_KEY=key;}
  assert.equal(requests.length,count);
});
