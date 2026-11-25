import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCsrf } from '../src/security.js';

function submit({body={},header,sessionToken='current-session-csrf',path='/login',method='POST'}={}) {
  const calls=[];
  const req={method,path,body,session:{csrf:sessionToken},get:()=>header};
  const res={
    status(code){calls.push({kind:'status',code});return this;},
    render(view,model){calls.push({kind:'render',view,model});return this;},
    redirect(code,url){calls.push({kind:'redirect',code,url});return this;}
  };
  verifyCsrf(req,res,()=>calls.push({kind:'next'}));
  return {calls,req};
}

test('stale Login CSRF redirects to a fresh GET without replaying the password',()=>{
  const {calls,req}=submit({body:{_csrf:'expired-session-csrf',email:'  customer@example.test  ',next:'/checkout?from=cart#payment',password:'must-never-appear',rememberMe:'on'}});
  assert.equal(calls.length,1);
  assert.equal(calls[0].kind,'redirect');
  assert.equal(calls[0].code,303);
  const target=new URL(calls[0].url,'https://shop.invalid');
  assert.equal(target.pathname,'/login');
  assert.equal(target.searchParams.get('notice'),'security-refresh');
  assert.equal(target.searchParams.get('next'),'/checkout?from=cart#payment');
  assert.equal(target.searchParams.get('email'),'customer@example.test');
  assert.deepEqual([...target.searchParams.keys()].sort(),['email','next','notice']);
  assert.ok(!calls[0].url.includes('must-never-appear'));
  assert.equal(req.session.csrf,'current-session-csrf','keep the current session token for the fresh form');
});

test('a current Login CSRF token permits exactly one continuation',()=>{
  assert.deepEqual(submit({body:{_csrf:'current-session-csrf'}}).calls,[{kind:'next'}]);
});

test('stale Login tokens from headers use the same safe recovery',()=>{
  const {calls}=submit({header:'old-token',body:{next:'/admin/orders'}});
  assert.equal(calls[0].kind,'redirect');
  assert.equal(new URL(calls[0].url,'https://shop.invalid').searchParams.get('next'),'/admin/orders');
});

for (const token of [undefined,'',[],['old-token'],{value:'old-token'},123]) {
  test(`missing or malformed Login token remains rejected: ${JSON.stringify(token)}`,()=>{
    const {calls}=submit({body:{_csrf:token,next:'/checkout'}});
    assert.equal(calls[0].kind,'status');
    assert.equal(calls[0].code,403);
    assert.equal(calls[1].kind,'render');
    assert.equal(calls[1].view,'error');
    assert.ok(!calls.some(call=>call.kind==='next'||call.kind==='redirect'));
  });
}

test('missing expected session CSRF is rejected rather than recovering with an invalid form',()=>{
  const {calls}=submit({body:{_csrf:'old-token'},sessionToken:null});
  assert.equal(calls[0].code,403);
  assert.ok(!calls.some(call=>call.kind==='next'||call.kind==='redirect'));
});

for (const next of ['https://outside.example','//outside.example','/\\outside.example','/%2f%2foutside.example','/cart%0aSet-Cookie:x','/cart\n//outside.example','/shop?'+ 'x'.repeat(201),['/checkout'],{path:'/checkout'}]) {
  test(`stale Login drops unsafe return destination: ${JSON.stringify(next)}`,()=>{
    const {calls}=submit({body:{_csrf:'old-token',next}});
    const target=new URL(calls[0].url,'https://shop.invalid');
    assert.equal(target.origin,'https://shop.invalid');
    assert.equal(target.searchParams.get('next'),'/account');
  });
}

test('recovery bounds email, strips control characters and encodes untrusted text',()=>{
  const email='\u0000"><img src=x onerror=alert(1)> '+ 'x'.repeat(200);
  const {calls}=submit({body:{_csrf:'old-token',email,next:'/checkout'}});
  const target=new URL(calls[0].url,'https://shop.invalid');
  assert.equal(target.searchParams.get('email').length,120);
  assert.ok(!target.searchParams.get('email').includes('\u0000'));
  assert.ok(!calls[0].url.includes('<img'));
});

test('recovery drops a repeated or structured email field',()=>{
  for (const email of [['a@example.test'],{value:'a@example.test'}]) {
    const {calls}=submit({body:{_csrf:'old-token',email}});
    assert.equal(new URL(calls[0].url,'https://shop.invalid').searchParams.has('email'),false);
  }
});

test('other routes retain their existing CSRF rejection and recovery behaviour',()=>{
  const account=submit({body:{_csrf:'old-token'},path:'/account/security'}).calls;
  assert.equal(account[0].code,403);
  assert.equal(account[1].view,'error');
  const cart=submit({body:{_csrf:'old-token'},path:'/cart/update'}).calls;
  assert.deepEqual(cart,[{kind:'redirect',code:303,url:'/cart?notice=security-refresh'}]);
  assert.deepEqual(submit({method:'GET'}).calls,[{kind:'next'}]);
});
