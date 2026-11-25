import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewsRoot = path.join(root, 'views');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(file));
    else if (entry.isFile() && entry.name.endsWith('.ejs')) out.push(file);
  }
  return out;
}

test('all EJS templates compile before any manager/customer request can render them', () => {
  const files = walk(viewsRoot).sort();
  assert.ok(files.length >= 10, `Expected at least 10 EJS templates; found ${files.length}`);
  for (const file of files) {
    assert.doesNotThrow(() => ejs.compile(fs.readFileSync(file, 'utf8')), `EJS syntax error in ${path.relative(root, file)}`);
  }
});
