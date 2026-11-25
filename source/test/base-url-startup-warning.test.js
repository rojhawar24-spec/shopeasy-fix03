import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePublicBaseUrl, warnIfProductionBaseUrlMisconfigured } from '../src/startup-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production BASE_URL warnings are emitted safely and are silent outside production', () => {
  const productionWarnings = [];
  const productionResult = warnIfProductionBaseUrlMisconfigured({
    nodeEnv: 'production',
    baseUrl: 'http://localhost:3000',
    warn: (message) => productionWarnings.push(message)
  });

  assert.equal(productionWarnings.length, 2);
  assert.equal(productionResult.length, 2);
  assert.match(productionWarnings[0], /BASE_URL must start with https:\/\//);
  assert.match(productionWarnings[1], /localhost.*Secure-cookie sessions/i);
  assert.ok(productionWarnings.every((message) => !message.includes('http://localhost:3000')));

  const publicHttpWarnings = [];
  warnIfProductionBaseUrlMisconfigured({
    nodeEnv: 'production',
    baseUrl: 'http://shop.example.test',
    warn: (message) => publicHttpWarnings.push(message)
  });
  assert.equal(publicHttpWarnings.length, 1);
  assert.match(publicHttpWarnings[0], /https:\/\//);

  const validProductionWarnings = [];
  warnIfProductionBaseUrlMisconfigured({
    nodeEnv: 'production',
    baseUrl: 'https://shop.example.test',
    warn: (message) => validProductionWarnings.push(message)
  });
  assert.deepEqual(validProductionWarnings, []);

  const malformedOriginWarnings = [];
  warnIfProductionBaseUrlMisconfigured({
    nodeEnv: 'production',
    baseUrl: 'https://shop.example.test/tenant/path',
    warn: (message) => malformedOriginWarnings.push(message)
  });
  assert.equal(malformedOriginWarnings.length, 1);
  assert.match(malformedOriginWarnings[0], /valid public HTTPS origin/i);

  const developmentWarnings = [];
  const developmentResult = warnIfProductionBaseUrlMisconfigured({
    nodeEnv: 'development',
    baseUrl: 'http://localhost:3000',
    warn: (message) => developmentWarnings.push(message)
  });
  assert.deepEqual(developmentWarnings, []);
  assert.deepEqual(developmentResult, []);

  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(server, /warnIfProductionBaseUrlMisconfigured\(\{\s*nodeEnv:\s*process\.env\.NODE_ENV,\s*baseUrl:\s*process\.env\.BASE_URL/s);
});

test('public URL resolver fails closed in production and never trusts the Host header for token links', () => {
  assert.equal(resolvePublicBaseUrl({nodeEnv:'production',baseUrl:'https://shop.example.test'}), 'https://shop.example.test');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'production',baseUrl:'http://shop.example.test',requestProtocol:'https',requestHost:'attacker.example'}), '');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'production',baseUrl:'https://localhost:3000',requestProtocol:'https',requestHost:'attacker.example'}), '');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'production',baseUrl:'',requestProtocol:'https',requestHost:'attacker.example'}), '');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'production',baseUrl:'https://user:pass@shop.example.test'}), '');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'staging',baseUrl:'',requestProtocol:'https',requestHost:'attacker.example'}), '');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'production',baseUrl:'https://shop.example.test/path'}), '');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'development',baseUrl:'',requestProtocol:'http',requestHost:'localhost:3000'}), 'http://localhost:3000');
  assert.equal(resolvePublicBaseUrl({nodeEnv:'development',baseUrl:'',requestProtocol:'https',requestHost:'evil.example/path'}), '');
});
