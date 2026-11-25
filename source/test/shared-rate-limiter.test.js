import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopEasyRateLimiter } from '../src/rate-limit-durable-object.js';
import { createShopRateLimiter } from '../src/shared-rate-limiter.js';

class FakeStorage {
  constructor() { this.values = new Map(); this.alarmAt = null; this.queue = Promise.resolve(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { return this.values.delete(key); }
  async setAlarm(value) { this.alarmAt = Number(value instanceof Date ? value.getTime() : value); }
  async transaction(callback) {
    let release;
    const previous = this.queue;
    this.queue = new Promise(resolve => { release = resolve; });
    await previous;
    const tx = {
      get: async key => this.values.get(key),
      put: async (key, value) => this.values.set(key, structuredClone(value)),
      delete: async key => this.values.delete(key)
    };
    try { return await callback(tx); } finally { release(); }
  }
}
function createObject() {
  const storage = new FakeStorage();
  const state = { storage };
  return { object: new ShopEasyRateLimiter(state, {}), storage };
}
async function consume(object, limit, windowMs=60_000) {
  return object.fetch(new Request('https://rate-limit.internal/consume', {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({limit,windowMs})
  }));
}

test('Durable Object allows at most the configured requests in a window', async () => {
  const {object} = createObject();
  const first=await consume(object,2);
  assert.equal(first.status,200);
  assert.equal((await first.json()).allowed,true);
  const second=await consume(object,2);
  assert.equal(second.status,200);
  assert.equal((await second.json()).allowed,true);
  const third=await consume(object,2);
  assert.equal((await third.json()).allowed,false);
});

test('Durable Object counter is atomic under concurrent requests', async () => {
  const {object} = createObject();
  const results = await Promise.all(Array.from({length:50},()=>consume(object,7)));
  const payloads=await Promise.all(results.map(r=>r.json()));
  assert.equal(payloads.filter(p=>p.allowed).length,7);
  assert.equal(payloads.filter(p=>!p.allowed).length,43);
});

test('Durable Object rejects invalid configuration, oversized body and wrong endpoint', async () => {
  const {object} = createObject();
  const invalid=await object.fetch(new Request('https://rate-limit.internal/consume',{method:'POST',body:JSON.stringify({limit:0,windowMs:1000})}));
  assert.equal(invalid.status,400);
  const huge=await object.fetch(new Request('https://rate-limit.internal/consume',{method:'POST',body:'x'.repeat(2048)}));
  assert.equal(huge.status,413);
  const missing=await object.fetch(new Request('https://rate-limit.internal/wrong',{method:'POST',body:'{}'}));
  assert.equal(missing.status,404);
});

test('Durable Object rolls over to a fresh time window', async () => {
  const {object} = createObject();
  const original=Date.now;
  try {
    Date.now=()=>120_000;
    assert.equal((await (await consume(object,1,60_000)).json()).allowed,true);
    assert.equal((await (await consume(object,1,60_000)).json()).allowed,false);
    Date.now=()=>180_000;
    assert.equal((await (await consume(object,1,60_000)).json()).allowed,true);
  } finally { Date.now=original; }
});

test('Cloudflare limiter middleware uses binding and emits 429 after limit', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  let count=0;
  const storage=createObject();
  globalThis.__SHOP_CF_ENV={ SHOP_RATE_LIMITER: {
    idFromName: key => key,
    get: () => ({fetch: async (_url, init) => { count++; return storage.object.fetch(new Request('https://rate-limit.internal/consume',init)); }})
  }};
  const middleware=createShopRateLimiter({name:'login-test',windowMs:60_000,max:1,message:'too many',fallback:()=>{throw new Error('memory fallback must not be used on Workers');},isCloudflareWorker:true});
  const req={ip:'203.0.113.10',headers:{},get(name){return this.headers[name.toLowerCase()];}};
  function responseMock(){
    return {statusCode:200,headers:{},body:null,set(k,v){this.headers[k]=v;return this;},type(v){this.contentType=v;return this;},status(v){this.statusCode=v;return this;},send(v){this.body=v;return this;}};
  }
  try {
    let nextCount=0;
    const first=responseMock();
    await middleware(req,first,()=>{nextCount++;});
    assert.equal(first.statusCode,200);
    assert.equal(nextCount,1);
    const second=responseMock();
    await middleware(req,second,()=>{nextCount++;});
    assert.equal(second.statusCode,429);
    assert.equal(second.body,'too many');
    assert.equal(nextCount,1);
    assert.equal(count,2);
    assert.equal(second.headers['Retry-After'] !== undefined,true);
  } finally {
    if (originalEnv===undefined) delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});

test('Cloudflare limiter fails closed when Durable Object binding is missing', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  globalThis.__SHOP_CF_ENV={};
  const middleware=createShopRateLimiter({name:'general-test',windowMs:60_000,max:1,message:'too many',fallback:()=>{throw new Error('must fail closed');},isCloudflareWorker:true});
  const req={ip:'203.0.113.11',headers:{},get(){return null;}};
  const res={statusCode:200,status(v){this.statusCode=v;return this;},type(v){this.contentType=v;return this;},send(v){this.body=v;return this;}};
  try {
    await middleware(req,res,()=>{throw new Error('next must not run');});
    assert.equal(res.statusCode,503);
    assert.match(res.body,/Request protection is temporarily unavailable/);
  } finally {
    if (originalEnv===undefined) delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});


test('Durable Object alarm reschedules an unexpired counter and deletes it after expiry', async () => {
  const {object,storage} = createObject();
  const original=Date.now;
  try {
    Date.now=()=>120_000;
    await consume(object,1,60_000);
    assert.ok(storage.values.has('counter'));
    Date.now=()=>150_000;
    await object.alarm();
    assert.equal(storage.values.has('counter'),true);
    assert.equal(storage.alarmAt,181_000);
    Date.now=()=>182_000;
    await object.alarm();
    assert.equal(storage.values.has('counter'),false);
  } finally { Date.now=original; }
});

test('separate client IPs receive separate rate-limit buckets', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  const objects=new Map();
  globalThis.__SHOP_CF_ENV={ SHOP_RATE_LIMITER: {
    idFromName: key => key,
    get: id => {
      if (!objects.has(id)) objects.set(id,createObject().object);
      const object=objects.get(id);
      return {fetch: (_url,init) => object.fetch(new Request('https://rate-limit.internal/consume',init))};
    }
  }};
  const middleware=createShopRateLimiter({name:'login-isolation',windowMs:60_000,max:1,message:'too many',fallback:()=>{throw new Error('memory fallback must not be used on Workers');},isCloudflareWorker:true});
  const reqFor=ip=>({ip,headers:{},get(name){return this.headers[name.toLowerCase()];}});
  const responseMock=()=>({statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},type(){return this;},status(v){this.statusCode=v;return this;},send(v){this.body=v;return this;}});
  try {
    let next=0;
    const a=responseMock(); await middleware(reqFor('203.0.113.21'),a,()=>next++);
    const b=responseMock(); await middleware(reqFor('203.0.113.22'),b,()=>next++);
    const aAgain=responseMock(); await middleware(reqFor('203.0.113.21'),aAgain,()=>next++);
    assert.equal(a.statusCode,200);
    assert.equal(b.statusCode,200);
    assert.equal(aAgain.statusCode,429);
    assert.equal(next,2);
  } finally {
    if (originalEnv===undefined) delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});


test('Cloudflare limiter fails closed when its Durable Object request fails', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  globalThis.__SHOP_CF_ENV={ SHOP_RATE_LIMITER: {
    idFromName: key => key,
    get: () => ({fetch: async () => { throw new Error('simulated binding outage'); }})
  }};
  const middleware=createShopRateLimiter({name:'general-outage-test',windowMs:60_000,max:1,message:'too many',fallback:()=>{throw new Error('must not use in-memory fallback');},isCloudflareWorker:true});
  const req={ip:'203.0.113.31',headers:{},get(){return null;}};
  const res={statusCode:200,status(v){this.statusCode=v;return this;},type(){return this;},send(v){this.body=v;return this;}};
  try {
    await middleware(req,res,()=>{throw new Error('next must not run');});
    assert.equal(res.statusCode,503);
    assert.match(res.body,/Request protection is temporarily unavailable/);
  } finally {
    if (originalEnv===undefined) delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});

test('Cloudflare limiter fails closed when no trustworthy client IP is available', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  globalThis.__SHOP_CF_ENV={ SHOP_RATE_LIMITER: {
    idFromName: key => key,
    get: () => ({fetch: async () => { throw new Error('should not be called'); }})
  }};
  const middleware=createShopRateLimiter({name:'missing-ip-test',windowMs:60_000,max:1,message:'too many',fallback:()=>{throw new Error('must not use in-memory fallback');},isCloudflareWorker:true});
  const req={ip:'',headers:{},get(){return null;}};
  const res={statusCode:200,status(v){this.statusCode=v;return this;},type(){return this;},send(v){this.body=v;return this;}};
  try {
    await middleware(req,res,()=>{throw new Error('next must not run');});
    assert.equal(res.statusCode,503);
    assert.match(res.body,/Request protection is temporarily unavailable/);
  } finally {
    if (originalEnv===undefined) delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});


test('Durable Object computes the rate window after waiting for its storage transaction', async () => {
  const {object,storage} = createObject();
  const original=Date.now;
  let unlock;
  let entered;
  const blockerEntered = new Promise(resolve => { entered=resolve; });
  const hold = new Promise(resolve => { unlock=resolve; });
  try {
    Date.now=()=>120_000;
    const blockingTransaction=storage.transaction(async () => {
      entered();
      await hold;
    });
    await blockerEntered;
    const delayedRequest=consume(object,1,60_000);
    Date.now=()=>180_000;
    unlock();
    await blockingTransaction;
    const response=await delayedRequest;
    const payload=await response.json();
    assert.equal(payload.allowed,true);
    assert.equal(payload.resetAt,240);
    assert.equal(storage.values.get('counter').windowStart,180_000);
  } finally { Date.now=original; }
});


test('Cloudflare optional AI limiter falls back without blocking ordinary catalog search', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  const storage=createObject();
  globalThis.__SHOP_CF_ENV={ SHOP_RATE_LIMITER: {
    idFromName: key => key,
    get: () => ({fetch: async (_url, init) => storage.object.fetch(new Request('https://rate-limit.internal/consume',init))})
  }};
  const middleware=createShopRateLimiter({
    name:'ai-search-soft-limit',windowMs:900_000,max:1,message:'AI limit reached',
    fallback:()=>{throw new Error('memory fallback must not be used on Workers');},
    isCloudflareWorker:true,
    onLimit:(req,res,next)=>{req.aiSearchRateLimited=true;return next();}
  });
  const req={ip:'203.0.113.44',headers:{},get(name){return this.headers[name.toLowerCase()];}};
  function responseMock(){return {statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},type(v){this.contentType=v;return this;},status(v){this.statusCode=v;return this;},send(v){this.body=v;return this;}};}
  try {
    let nextCount=0;
    const first=responseMock();
    await middleware(req,first,()=>{nextCount++;});
    assert.equal(first.statusCode,200);
    const second=responseMock();
    await middleware(req,second,()=>{nextCount++;});
    assert.equal(second.statusCode,200,'AI quota must not block normal catalog search');
    assert.equal(req.aiSearchRateLimited,true);
    assert.equal(nextCount,2);
    assert.equal(second.body,undefined);
  } finally {
    if(originalEnv===undefined)delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});


test('optional AI limiter degrades to ordinary search when the shared limiter is unavailable', async () => {
  const originalEnv=globalThis.__SHOP_CF_ENV;
  globalThis.__SHOP_CF_ENV={};
  const middleware=createShopRateLimiter({
    name:'ai-search-fallback',windowMs:900_000,max:3,message:'AI limit reached',
    fallback:()=>{throw new Error('memory fallback must not be used on Workers');},
    isCloudflareWorker:true,
    onUnavailable:(req,res,next)=>{req.aiSearchRateLimited=true;return next();}
  });
  const req={ip:'203.0.113.45',headers:{},get(){return null;}};
  const res={statusCode:200,status(value){this.statusCode=value;return this;},type(value){this.contentType=value;return this;},send(value){this.body=value;return this;}};
  try {
    let nextCount=0;
    await middleware(req,res,()=>{nextCount++;});
    assert.equal(res.statusCode,200);
    assert.equal(req.aiSearchRateLimited,true);
    assert.equal(nextCount,1);
  } finally {
    if(originalEnv===undefined)delete globalThis.__SHOP_CF_ENV;
    else globalThis.__SHOP_CF_ENV=originalEnv;
  }
});
