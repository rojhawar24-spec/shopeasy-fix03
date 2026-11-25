import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [serverSource, dbSource] = await Promise.all([
  readFile(path.join(root, 'src/server.js'), 'utf8'),
  readFile(path.join(root, 'src/db.js'), 'utf8')
]);

test('variant restock route imports the database lookup it calls', () => {
  const dbImport = serverSource.match(/import\s+db\s*,\s*\{([^}]+)\}\s*from\s*['"]\.\/db\.js['"]/s);
  assert.ok(dbImport, 'server.js must have a named database import');
  assert.match(dbImport[1], /\bgetProductVariantById\b/, 'getProductVariantById must be imported from db.js');
  assert.match(dbSource, /export\s+async\s+function\s+getProductVariantById\s*\(/, 'db.js must export the variant lookup');
  assert.match(serverSource, /const\s+variant\s*=\s*await\s+getProductVariantById\(variantId\)/, 'variant restock route must call the imported lookup');
});
