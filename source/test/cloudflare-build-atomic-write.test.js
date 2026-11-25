import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Cloudflare build never deletes the published output tree and atomically replaces generated files', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'build-cloudflare.mjs'), 'utf8');
  assert.match(source, /function atomicWriteFile\(destination, content\)/);
  assert.match(source, /fs\.renameSync\(tempPath, destination\)/);
  assert.match(source, /copyTree\(path\.join\(root, 'src'\), path\.join\(output, 'src'\)\)/);
  assert.match(source, /atomicWriteFile\(dbPath, database\)/);
  assert.match(source, /atomicWriteFile\(path\.join\(output, 'src', 'worker\.js'\), workerSource\)/);
  assert.doesNotMatch(source, /fs\.rmSync\(output,\s*\{\s*recursive:\s*true/,
    'removing the published directory makes concurrent readers observe ENOENT');
});
