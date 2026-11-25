import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const productView = fs.readFileSync(path.join(root, 'views/product.ejs'), 'utf8');

test('only Manager receives private product lifecycle data and product management controls', () => {
  assert.match(server, /const isManager=String\(req\.user\?\.role\|\|''\)\.trim\(\)\.toLowerCase\(\)==='manager'/);
  assert.match(server, /const managerProduct=isManager\?await getProductById\(product\.id\):null/);
  assert.match(productView, /if\(isManager && managerProduct\)/);
  assert.match(productView, /action="\/admin\/products\/archive"/);
  assert.match(productView, /action="\/admin\/products\/delete"/);
});
