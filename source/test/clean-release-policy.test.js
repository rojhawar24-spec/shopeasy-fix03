import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = rel => fs.existsSync(path.join(root, rel));

test('clean handover omits only superseded, unreferenced R6 preview copies', () => {
  for (const rel of ['PREVIEW-CART-R6.html', 'PREVIEW-CHECKOUT-R6.html', 'PREVIEW-ORDER-R6.html']) {
    assert.equal(exists(rel), false, `${rel} is an unused historical artifact`);
  }
  for (const rel of ['PREVIEW.html', 'PREVIEW-MANAGER.html', 'PREVIEW-PRODUCT-R6.html', 'PREVIEW-CART-R7.html']) {
    assert.equal(exists(rel), true, `${rel} is retained for active QA`);
  }
});

test('clean handover preserves source, deployment checks and commercial rights warnings', () => {
  for (const rel of ['src/server.js', 'src/db.js', 'views/home.ejs', 'public/css/app.css', 'scripts/verify-release-files.mjs', 'Dockerfile', 'deploy.sh', 'LICENSE.txt']) {
    assert.ok(exists(rel), `${rel} must be present`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:package'], 'node scripts/verify-release-files.mjs');
  assert.equal(pkg.license, 'UNLICENSED');
  assert.match(fs.readFileSync(path.join(root, 'RIGHTS-CLEARANCE-REGISTER.md'), 'utf8'), /NOT CLEARED FOR COMMERCIAL RESALE/);
});
