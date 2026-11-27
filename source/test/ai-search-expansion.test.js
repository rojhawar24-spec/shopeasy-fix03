import test from 'node:test';
import assert from 'node:assert/strict';
import { aiEnabled, expandProductSearchQueries } from '../src/services/ai.js';

test('AI catalog search returns only bounded alternative phrases and caches the query', async () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let sentBody = null;
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_BASE_URL = 'https://ai.example.test/v1';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'test';
    globalThis.fetch = async (url, options) => {
      calls += 1;
      sentBody = JSON.parse(options.body);
      assert.equal(url, 'https://ai.example.test/v1/chat/completions');
    assert.equal(options.redirect, 'error', 'provider redirects must not be followed');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ queries: ['waterproof jacket', 'rain coat', 'rain coat', 'winter boots', 'irrelevant'] }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    assert.equal(aiEnabled(), true);
    const first = await expandProductSearchQueries('jacket for rainy weather', 'en');
    const second = await expandProductSearchQueries('jacket for rainy weather', 'en');
    assert.deepEqual(first, ['waterproof jacket', 'rain coat', 'winter boots']);
    assert.deepEqual(second, first);
    assert.equal(calls, 1, 'the same submitted query should use the short-lived cache');
    const promptText = sentBody.messages.map(message => String(message.content)).join('\n');
    assert.match(promptText, /jacket for rainy weather/);
    assert.doesNotMatch(promptText, /customer address|payment|order history/i);
    assert.equal(sentBody.max_tokens, 120);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});


test('AI search does not forward obvious email, phone, IBAN-like or street-address input to the provider', async () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_BASE_URL = 'https://ai.example.test/v1';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'test';
    globalThis.fetch = async () => { calls += 1; return new Response('{}'); };
    assert.deepEqual(await expandProductSearchQueries('person@example.test', 'en'), []);
    assert.deepEqual(await expandProductSearchQueries('+32 471 23 45 67', 'nl'), []);
    assert.deepEqual(await expandProductSearchQueries('I need winter boots, call me at +32 471 23 45 67', 'nl'), []);
    assert.deepEqual(await expandProductSearchQueries('BE68 5390 0754 7034', 'nl'), []);
    assert.deepEqual(await expandProductSearchQueries('Rue de la Loi 16, Brussels', 'nl'), []);
    assert.deepEqual(await expandProductSearchQueries('أبحث عن حذاء، عنواني شارع 60 متري أربيل', 'ar'), []);
    assert.deepEqual(await expandProductSearchQueries('پێڵاو بدۆزەرەوە، ناونیشانم شەقامی 60 متری هەولێرە', 'ckb'), []);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('AI search rejects provider JSON responses above the configured byte ceiling', async () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_BASE_URL = 'https://ai.example.test/v1';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'test';
    globalThis.fetch = async () => new Response('x'.repeat(70 * 1024), { status: 200 });
    await assert.rejects(() => expandProductSearchQueries('warm winter coat', 'en'), /AI_RESPONSE_TOO_LARGE/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});


test('shopping assistant rejects private identifiers before any provider request and redacts product metadata', async () => {
  const keys=['AI_ENABLED','AI_BASE_URL','AI_API_KEY','AI_MODEL','NODE_ENV'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  const sent=[];
  try {
    Object.assign(process.env,{AI_ENABLED:'true',AI_BASE_URL:'https://ai.example.test/v1',AI_API_KEY:'unit-test-key',AI_MODEL:'unit-test-model',NODE_ENV:'test'});
    globalThis.fetch=async (_url,options)=>{
      assert.equal(options.redirect,'error');
      sent.push(JSON.parse(options.body));
      return new Response(JSON.stringify({choices:[{message:{content:'A rain jacket is a good choice.'}}]}),{status:200});
    };
    const {shoppingAssistant}=await import('../src/services/ai.js');
    for(const question of [
      'person@example.test',
      'I need a coat. Email me at person@example.test',
      'Find a coat and call +32 471 23 45 67',
      'Find a coat. IBAN BE68 5390 0754 7034.',
      'Find a coat. Deliver to Rue de la Loi 16.',
      'أريد حذاء. عنواني شارع 60 متري أربيل، اتصل بي.'
    ]) await assert.rejects(()=>shoppingAssistant(question,[]),/AI_QUESTION_REJECTED/);
    assert.equal(sent.length,0,'private customer input must never reach an external provider');
    const answer=await shoppingAssistant('Find a waterproof coat',[
      {name:'Rain jacket',short_description:'Waterproof shell. Contact owner@example.test. Phone +32 471 23 45 67. IBAN BE68 5390 0754 7034. Rue de la Loi 16.',available_price:5900,available_stock:2,stock:4,reserved_stock:2,slug:'rain-jacket'},
      {name:'Local product',short_description:'عنواني شارع 60 متري أربيل، اتصل بي.',slug:'local-product'}
    ],'EUR');
    assert.equal(answer,'A rain jacket is a good choice.');
    assert.equal(sent.length,1);
    const prompt=sent[0].messages.find(message=>message.role==='user').content;
    assert.doesNotMatch(prompt,/owner@example\.test|\+32 471 23 45 67|BE68 5390 0754 7034|Rue de la Loi 16|شارع 60 متري أربيل/i);
    for(const label of ['email','phone number','IBAN','street address']) assert.ok(prompt.includes('['+label+' removed]'),label+' redaction missing');
    assert.match(prompt,/Rain jacket/);
    assert.match(prompt,/price_minor_units":5900/);
    assert.match(prompt,/currency":"EUR"/);
    assert.match(prompt,/available_stock":2/);
    assert.doesNotMatch(prompt,/reserved_stock|"stock":4/);
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of keys) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  }
});

test('shopping assistant rejects identifier-only input without contacting the provider', async () => {
  const keys=['AI_ENABLED','AI_BASE_URL','AI_API_KEY','AI_MODEL','NODE_ENV'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  let calls=0;
  try {
    Object.assign(process.env,{AI_ENABLED:'true',AI_BASE_URL:'https://ai.example.test/v1',AI_API_KEY:'unit-test-key',AI_MODEL:'unit-test-model',NODE_ENV:'test'});
    globalThis.fetch=async()=>{calls++;return new Response('{}');};
    const {shoppingAssistant}=await import('../src/services/ai.js');
    await assert.rejects(()=>shoppingAssistant('person@example.test',[]),/AI_QUESTION_REJECTED/);
    assert.equal(calls,0);
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of keys) {if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  }
});

test('shopping assistant enforces the same 64 KiB provider response ceiling', async () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_BASE_URL = 'https://ai.example.test/v1';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'test';
    globalThis.fetch = async () => new Response('x'.repeat(70 * 1024), { status: 200 });
    const { shoppingAssistant } = await import('../src/services/ai.js');
    await assert.rejects(() => shoppingAssistant('Find a rain coat', []), /AI_RESPONSE_TOO_LARGE/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});


test('production AI configuration rejects local, private-IP, non-HTTPS and nonstandard-port provider targets', () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'production';
    for (const base of [
      'http://api.example.com/v1',
      'https://localhost/v1',
      'https://service.internal/v1',
      'https://127.0.0.1/v1',
      'https://10.20.30.40/v1',
      'https://192.168.1.10/v1',
      'https://[::1]/v1',
      'https://api.example.com:8443/v1',
      'https://user:password@api.example.com/v1'
    ]) {
      process.env.AI_BASE_URL = base;
      assert.equal(aiEnabled(), false, `unsafe provider target should be rejected: ${base}`);
    }
    process.env.AI_BASE_URL = 'https://api.openai.com/v1';
    assert.equal(aiEnabled(), true);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});


test('FIX8: AI catalog expansion keeps the selected French locale rather than silently switching to English', async () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let prompt = '';
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_BASE_URL = 'https://ai.example.test/v1';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'test';
    globalThis.fetch = async (_url, options) => {
      prompt = JSON.parse(options.body).messages.find(message => message.role === 'user')?.content || '';
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"queries":["chaussures de randonnée"]}' } }] }), { status: 200 });
    };
    assert.deepEqual(await expandProductSearchQueries('chaussures de marche', 'fr'), ['chaussures de randonnée']);
    assert.match(prompt, /Locale: fr\n/);
    assert.doesNotMatch(prompt, /Locale: en\n/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
