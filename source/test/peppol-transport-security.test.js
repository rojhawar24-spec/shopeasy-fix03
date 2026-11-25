import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRecommand } from '../src/services/peppol-recommand.js';

const request={companyId:'company-qa',key:'key_transport_test',secret:'local-only-test-secret',payload:{documentType:'invoice',document:{buyer:{name:'Test buyer'}}}};
const encoder=new TextEncoder();

test('Peppol invoice requests reject redirects and keep the fixed provider endpoint',async()=>{
  let captured;
  const result=await requestRecommand({...request,fetchImpl:async(url,options)=>{
    captured={url,options};
    return new Response(JSON.stringify({success:true,id:'document-1'}),{status:200});
  }});
  assert.equal(result.ok,true);
  assert.equal(captured.url,'https://app.recommand.eu/api/v1/company-qa/generate');
  assert.equal(captured.options.redirect,'error');
  assert.equal(captured.options.method,'POST');
  assert.deepEqual(JSON.parse(captured.options.body),request.payload);
});

test('a followed or manual redirect response is rejected before parsing invoice results',async()=>{
  for(const response of [{redirected:true,status:200},{redirected:false,status:307},{status:302}]) {
    let read=false;
    await assert.rejects(requestRecommand({...request,fetchImpl:async()=>({...response,text:async()=>{read=true;return '{"success":true}';}})}),/PEPPOL_REDIRECT_REJECTED/);
    assert.equal(read,false);
  }
});

test('an oversized declared Peppol response is cancelled before reading',async()=>{
  let cancelled=false,read=false;
  await assert.rejects(requestRecommand({...request,fetchImpl:async()=>({status:200,headers:new Headers({'content-length':'200001'}),body:{cancel:async()=>{cancelled=true;}},text:async()=>{read=true;return '';}})}),/PEPPOL_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled,true);
  assert.equal(read,false);
});

test('an undeclared oversized streamed Peppol response stops and cancels at the byte limit',async()=>{
  let cancelled=false;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(new Uint8Array(150_000));controller.enqueue(new Uint8Array(60_000));},
    cancel(){cancelled=true;}
  });
  await assert.rejects(requestRecommand({...request,fetchImpl:async()=>new Response(stream,{status:200})}),/PEPPOL_RESPONSE_TOO_LARGE/);
  assert.equal(cancelled,true);
  assert.equal(stream.locked,false);
});

test('streamed response parsing counts UTF-8 bytes rather than JavaScript characters',async()=>{
  const text=JSON.stringify({success:true,xml:'ڕ'.repeat(100_000)});
  assert.ok(text.length<200_000);
  assert.ok(encoder.encode(text).byteLength>200_000);
  await assert.rejects(requestRecommand({...request,fetchImpl:async()=>new Response(text,{status:200})}),/PEPPOL_RESPONSE_TOO_LARGE/);
});

test('a valid multichunk UTF-8 response preserves generated XML',async()=>{
  const xml='<Invoice>کڕیار</Invoice>';
  const bytes=encoder.encode(JSON.stringify({success:true,id:'document-2',xml}));
  // Split in the middle of a multibyte sequence as real network frames can do.
  const split=bytes.findIndex(byte=>byte>127)+1;
  const stream=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,split));controller.enqueue(bytes.slice(split));controller.close();}});
  const result=await requestRecommand({...request,fetchImpl:async()=>new Response(stream,{status:200})});
  assert.equal(result.generatedXml,xml);
  assert.equal(result.reference,'document-2');
});

test('invalid UTF-8 and invalid JSON responses fail closed',async()=>{
  for(const body of [new Uint8Array([0xff,0xfe]),'{invalid']) {
    await assert.rejects(requestRecommand({...request,fetchImpl:async()=>new Response(body,{status:200})}),/PEPPOL_INVALID_RESPONSE/);
  }
});

test('text-only adapters retain response validation and the same byte ceiling',async()=>{
  const response=await requestRecommand({...request,fetchImpl:async()=>({ok:true,status:200,text:async()=>'{"success":true,"id":"legacy-adapter"}'})});
  assert.equal(response.reference,'legacy-adapter');
  await assert.rejects(requestRecommand({...request,fetchImpl:async()=>({ok:true,status:200,text:async()=>'ڕ'.repeat(100_001)})}),/PEPPOL_RESPONSE_TOO_LARGE/);
});

test('provider validation failures remain bounded structured failures',async()=>{
  const result=await requestRecommand({...request,send:true,fetchImpl:async()=>new Response(JSON.stringify({success:false,errors:['Rejected invoice']}),{status:422})});
  assert.deepEqual(result,{ok:false,httpStatus:422,errors:['Rejected invoice']});
});
