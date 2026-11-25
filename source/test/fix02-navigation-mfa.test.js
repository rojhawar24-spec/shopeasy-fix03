import test from 'node:test';
import assert from 'node:assert/strict';
import {authDestination} from '../src/auth-navigation.js';
import {withSelectedPublicLanguage} from '../src/seo-locales.js';
import {totpAtStep,verifyTotpCode} from '../src/mfa.js';

const localOrigin='https://store.example.test';
const malformed=['/.//example.invalid','/a/..//example.invalid','/%2e//example.invalid','//example.invalid','/\\example.invalid','/\texample.invalid','/a/%2e%2e//example.invalid'];
test('customer post-auth redirects remain local after parsing and serialization',()=>{
  for(const value of malformed) assert.equal(authDestination('customer',value),'/account',value);
  assert.equal(authDestination('customer','/shop?q=red%20shoe#results'),'/shop?q=red%20shoe#results');
  assert.equal(authDestination('customer','/a/../login'),'/account');
  assert.equal(authDestination('manager','/admin/orders'),'/admin/orders');
  assert.equal(authDestination('admin','/shop'),'/admin');
  assert.equal(new URL(authDestination('customer',null,'//example.invalid'),localOrigin).origin,localOrigin);
});
test('language navigation never emits a protocol-relative destination',()=>{
  for(const value of malformed) assert.equal(withSelectedPublicLanguage(value,'nl','en'),'/',value);
  assert.equal(withSelectedPublicLanguage('/shop?page=2','nl','en'),'/shop?page=2&lang=nl');
  assert.equal(withSelectedPublicLanguage('/shop?lang=nl&page=2','en','en'),'/shop?page=2');
  assert.equal(withSelectedPublicLanguage('/account','nl','en'),'/account');
});
test('colliding adjacent TOTP steps consume latest eligible step',()=>{
  const secret='JFXGIZLQMVXGIZLOOQQGC5LENF2CAZTJPB2HK4TFEBXW43DZ';
  const step=2276165,code=totpAtStep(secret,step);
  assert.equal(code,totpAtStep(secret,step+1));
  const first=verifyTotpCode(secret,code,step*30000);
  assert.equal(first,step+1);
  assert.equal(verifyTotpCode(secret,code,step*30000,first),null);
  assert.equal(verifyTotpCode(secret,code,(step+1)*30000,first),null);
});
test('normal TOTP drift and prior-step rejection remain intact',()=>{
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const now=1000;
  for(const step of [now-1,now,now+1]){
    const code=totpAtStep(secret,step);
    assert.equal(verifyTotpCode(secret,code,now*30000),step);
    assert.equal(verifyTotpCode(secret,code,now*30000,step),null);
  }
  assert.equal(verifyTotpCode(secret,totpAtStep(secret,now-2),now*30000),null);
});
