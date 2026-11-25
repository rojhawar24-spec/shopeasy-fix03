import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');

test('server imports every direct database helper it calls', () => {
  const match = source.match(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/database\.js['"];?$/m);
  assert.ok(match, 'src/server.js must have an explicit named import from database.js');
  const imported = new Set(match[1].split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  for (const helper of ['getRow', 'getRows', 'run']) {
    assert.ok(imported.has(helper), `src/server.js calls ${helper} but does not import it from database.js`);
  }
  assert.match(source, /getRows\('SELECT UPPER\(currency\) AS currency,COUNT\(\*\) AS c FROM orders GROUP BY UPPER\(currency\) ORDER BY UPPER\(currency\)'\)/,
    'orders currency queries should remain covered by the direct database-helper import contract');
});
