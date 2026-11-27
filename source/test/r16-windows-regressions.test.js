import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveReleaseRoot } from '../scripts/release-files.mjs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('R16: integration checkout assertion matches the actual legally explicit submit label', () => {
  const checkout = read('views/checkout.ejs');
  const integration = read('scripts/manager-dashboard-integration.mjs');
  assert.ok(checkout.includes('class="checkout-place-label" data-final-label='));
  assert.ok(checkout.includes("(demoCheckoutOnly||pricingRulesActive)&&!quoteReady?'Review delivery & tax →':"));
  assert.match(checkout, /'Order with obligation to pay'\)\) %><\/span>/);
  assert.ok(integration.includes(String.raw`class="checkout-place-label"[^>]*>Order with obligation to pay<\/span>`));
  assert.doesNotMatch(integration, /Order with payment obligation/, 'old English label must not reappear in the HTTP integration test');
});

test('R16: the portable release-root resolver accepts complete root or single-wrapper archives and rejects ambiguous layouts', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'shopeasy-portable-resolver-'));
  const complete = directory => {
    fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'views'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), '{}');
    fs.writeFileSync(path.join(directory, 'package-lock.json'), '{}');
  };
  try {
    const direct = path.join(temporary, 'direct'); complete(direct);
    assert.equal(resolveReleaseRoot(direct), fs.realpathSync(direct));
    const wrapped = path.join(temporary, 'wrapped'), nested = path.join(wrapped, 'ShopEasy-release'); complete(nested);
    assert.equal(resolveReleaseRoot(wrapped), fs.realpathSync(nested));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/release-files.mjs'), 'resolve', wrapped], { encoding: 'utf8' });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), fs.realpathSync(nested));

    const ambiguous = path.join(temporary, 'ambiguous'); complete(path.join(ambiguous, 'one')); complete(path.join(ambiguous, 'two'));
    const deep = path.join(temporary, 'deep'); complete(path.join(deep, 'wrapper', 'ShopEasy'));
    const incomplete = path.join(temporary, 'incomplete'); complete(path.join(incomplete, 'ShopEasy')); fs.rmSync(path.join(incomplete, 'ShopEasy/package-lock.json'));
    const wrongType = path.join(temporary, 'wrong-type'); complete(wrongType); fs.rmSync(path.join(wrongType, 'src'), { recursive: true }); fs.writeFileSync(path.join(wrongType, 'src'), 'not a directory');
    const extra = path.join(temporary, 'extra'); complete(path.join(extra, 'ShopEasy')); fs.writeFileSync(path.join(extra, 'unexpected-file'), 'ambiguous wrapper');
    for (const directory of [ambiguous, deep, incomplete, wrongType, extra]) assert.throws(() => resolveReleaseRoot(directory), /complete|enclosing|source/i, directory);
    const rejected = spawnSync(process.execPath, [path.join(root, 'scripts/release-files.mjs'), 'resolve', ambiguous], { encoding: 'utf8' });
    assert.ifError(rejected.error); assert.notEqual(rejected.status, 0);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
