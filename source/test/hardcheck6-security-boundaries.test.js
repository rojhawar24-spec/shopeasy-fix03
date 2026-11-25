import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedAiProviderHost, aiEnabled } from '../src/services/ai.js';
import { isPrivateStorefrontPath, privatePageRobotsHeader } from '../src/robots-policy.js';

test('production AI host allow-list matches exact DNS hostnames only', () => {
  assert.equal(approvedAiProviderHost('api.openai.com'), true);
  assert.equal(approvedAiProviderHost('openrouter.ai'), true);
  assert.equal(approvedAiProviderHost('api.openai.com.evil.example'), false);
  assert.equal(approvedAiProviderHost('localhost'), false);
  assert.equal(approvedAiProviderHost('10.0.0.1'), false);
  assert.equal(approvedAiProviderHost('ai.example.org', 'ai.example.org'), true);
  assert.equal(approvedAiProviderHost('other.example.org', 'ai.example.org'), false);
  assert.equal(approvedAiProviderHost('ai.example.org.attacker.test', 'ai.example.org'), false);
  assert.equal(approvedAiProviderHost('ai.example.org', '*.example.org'), false);
  assert.equal(approvedAiProviderHost('host.internal', 'host.internal'), false);
  assert.equal(approvedAiProviderHost('ai.example.org.', 'ai.example.org'), false);
});

test('production AI fails closed for unapproved providers and query strings', () => {
  const names=['NODE_ENV','AI_ENABLED','AI_BASE_URL','AI_API_KEY','AI_MODEL','AI_ALLOWED_HOSTS'];
  const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    process.env.NODE_ENV='production';
    process.env.AI_ENABLED='true';process.env.AI_API_KEY='test-key';process.env.AI_MODEL='test-model';
    delete process.env.AI_ALLOWED_HOSTS;
    process.env.AI_BASE_URL='https://ai.example.org/v1';
    assert.equal(aiEnabled(),false);
    process.env.AI_ALLOWED_HOSTS='ai.example.org';
    assert.equal(aiEnabled(),true);
    process.env.AI_BASE_URL='https://ai.example.org/v1?redirect=https://attacker.test';
    assert.equal(aiEnabled(),false);
    process.env.AI_BASE_URL='https://api.openai.com/v1';
    assert.equal(aiEnabled(),true);
    process.env.AI_BASE_URL='https://127.0.0.1/v1';
    assert.equal(aiEnabled(),false);
  } finally {
    for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
  }
});

test('only private routes receive a non-index response header', () => {
  const privatePaths=['/login','/mfa/setup','/checkout/success','/admin/orders','/account','/order-lookup','/api/ai/search-assistant','/payments/mollie/webhook','/verify-email'];
  for(const path of privatePaths){
    assert.equal(isPrivateStorefrontPath(path),true);
    let value='';let nextCalled=false;
    privatePageRobotsHeader({path},{set:(name,v)=>{assert.equal(name,'X-Robots-Tag');value=v;}},()=>{nextCalled=true;});
    assert.equal(value,'noindex, nofollow, noarchive');assert.equal(nextCalled,true);
  }
  for(const path of ['/','/shop','/product/example','/privacy','/robots.txt','/sitemap.xml','/logins','/products']){
    assert.equal(isPrivateStorefrontPath(path),false);
    let touched=false;
    privatePageRobotsHeader({path},{set:()=>{touched=true;}},()=>{});
    assert.equal(touched,false);
  }
});
