import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function filesBelow(directory, extension) {
  const output = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) output.push(...filesBelow(full, extension));
    else if (item.isFile() && full.endsWith(extension)) output.push(full);
  }
  return output;
}
const views = filesBelow(path.join(root, 'views'), '.ejs');
const texts = views.map(file => ({file: path.relative(root, file), contents: fs.readFileSync(file, 'utf8')}));

test('all literal EJS includes resolve to a source view', () => {
  const missing = [];
  for (const {file, contents} of texts) {
    for (const [, relative] of contents.matchAll(/\binclude\(\s*['"]([^'"]+)['"]/g)) {
      const normalized = relative.endsWith('.ejs') ? relative : `${relative}.ejs`;
      if (!fs.existsSync(path.resolve(root, path.dirname(file), normalized))) missing.push(`${file}: ${relative}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('literal local stylesheet, script, font and image paths exist', () => {
  const missing = [];
  for (const {file, contents} of texts) {
    for (const [, asset] of contents.matchAll(/\b(?:src|href)\s*=\s*["'](\/(?:css|js|assets|images|fonts)\/[^"'?<%\s]+)/g)) {
      if (!fs.existsSync(path.join(root, 'public', asset.slice(1)))) missing.push(`${file}: ${asset}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('literal standalone page links have corresponding Express GET routes', () => {
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  const routes = new Set([...server.matchAll(/\bapp\.(?:get|all)\(\s*['"]([^'"]+)['"]/g)].map(match => match[1]));
  const missing = [];
  for (const {file, contents} of texts) {
    for (const [, href] of contents.matchAll(/\bhref\s*=\s*["'](\/[a-z-]+)(?=["'?#])/gi)) {
      if (href.startsWith('/assets') || href.startsWith('/css') || href.startsWith('/js') || href.startsWith('/fonts')) continue;
      if (!routes.has(href)) missing.push(`${file}: ${href}`);
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
