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


test('shopping assistant redacts email, phone, IBAN and street-address data from the outbound prompt', async () => {
  const keys = ['AI_ENABLED', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'NODE_ENV'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let sentBody = null;
  try {
    process.env.AI_ENABLED = 'true';
    process.env.AI_BASE_URL = 'https://ai.example.test/v1';
    process.env.AI_API_KEY = 'unit-test-key';
    process.env.AI_MODEL = 'unit-test-model';
    process.env.NODE_ENV = 'test';
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.redirect, 'error', 'provider redirects must not be followed');
      sentBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A rain jacket is a good choice.' } }] }), { status: 200 });
    };
    const answer = await (await import('../src/services/ai.js')).shoppingAssistant(
      'I need a coat. Email me at person@example.test and call +32 471 23 45 67. IBAN BE68 5390 0754 7034. Deliver to Rue de la Loi 16.',
      [{ name: 'Rain jacket', short_description: 'Waterproof shell. Contact owner@example.test at Rue de la Loi 16.', available_price: 5900, available_stock: 2, stock: 4, reserved_stock: 2, slug: 'rain-jacket' }],
      'EUR'
    );
    const userPrompt = sentBody.messages.find(message => message.role === 'user')?.content || '';
    assert.equal(answer, 'A rain jacket is a good choice.');
    assert.doesNotMatch(userPrompt, /person@example\.test|\+32 471 23 45 67|BE68 5390 0754 7034/);
    assert.match(userPrompt, /\[email removed\]/);
    assert.match(userPrompt, /\[phone number removed\]/);
    assert.match(userPrompt, /\[IBAN removed\]/);
    assert.match(userPrompt, /\[street address removed\]/);
    assert.doesNotMatch(userPrompt, /Rue de la Loi 16/i);
    assert.match(userPrompt, /Rain jacket/);
    assert.match(userPrompt, /\[email removed\]/);
    assert.match(userPrompt, /\[street address removed\]/);
    assert.doesNotMatch(userPrompt, /owner@example\.test|Rue de la Loi 16/i);
    const localAddressAnswer = await (await import('../src/services/ai.js')).shoppingAssistant(
      'أريد حذاء. عنواني شارع 60 متري أربيل، اتصل بي.',
      [],
      'EUR'
    );
    const localAddressPrompt = sentBody.messages.find(message => message.role === 'user')?.content || '';
    assert.equal(localAddressAnswer, 'A rain jacket is a good choice.');
    assert.doesNotMatch(localAddressPrompt, /شارع 60 متري أربيل/);
    assert.match(localAddressPrompt, /\[street address removed\]/);
    assert.match(userPrompt, /price_minor_units\":5900/);
    assert.match(userPrompt, /currency\":\"EUR\"/);
    assert.match(userPrompt, /available_stock\":2/);
    assert.doesNotMatch(userPrompt, /reserved_stock|\"stock\":4/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

test('shopping assistant rejects a message when redaction removes the entire content', async () => {
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
    await assert.rejects(
      () => (async () => {
        const { shoppingAssistant } = await import('../src/services/ai.js');
        return shoppingAssistant('person@example.test', []);
      })(),
      /AI_MESSAGE_REDACTED/
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
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
