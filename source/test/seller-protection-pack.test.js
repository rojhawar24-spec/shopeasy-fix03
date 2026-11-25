import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('seller-protection pack includes terms, privacy, cookies, DPA and purchase agreement in all three locales', () => {
  for (const doc of ['terms', 'privacy', 'cookies', 'dpa', 'purchase-agreement']) {
    for (const locale of ['en', 'ckb', 'ar']) {
      assert.ok(fs.existsSync(path.join(root, 'SELLER-PROTECTION-PACK', 'legal', doc, `${locale}.md`)), `${doc}/${locale}.md missing`);
    }
  }
});

test('legal templates warn that they require completion/review and do not claim automatic compliance', () => {
  const privacy = read('SELLER-PROTECTION-PACK/legal/privacy/en.md');
  const cookies = read('SELLER-PROTECTION-PACK/legal/cookies/en.md');
  const dpa = read('SELLER-PROTECTION-PACK/legal/dpa/en.md');
  assert.match(privacy, /does not create GDPR\/CCPA compliance/i);
  assert.match(cookies, /policy alone is not a consent-management system/i);
  assert.match(dpa, /only if the software seller actually processes personal data/i);
});

test('license metadata is Manager-only, key is not rendered, and the package still marks license draft', () => {
  const server = read('src/server.js');
  const view = read('views/admin/license.ejs');
  const license = read('LICENSE.txt');
  assert.match(server, /app\.get\('\/admin\/license',requireManager/);
  assert.doesNotMatch(view, /licenseInfo\.licenseKey|licenseInfo\.key\b/);
  assert.match(license, /DRAFT ONLY — NOT AN EFFECTIVE LICENSE/);
  assert.match(read('src/license.js'), /does not prove ownership/i);
});
