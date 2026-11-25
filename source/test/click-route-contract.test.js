import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const routes = [...server.matchAll(/app\.(get|post|put|patch|delete)\(\s*(['"])(.*?)\2/g)]
  .map(match => ({ method: match[1].toUpperCase(), path: match[3] }));
const viewsRoot = path.join(root, 'views');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() && file.endsWith('.ejs') ? [file] : [];
  });
}
function pathMatches(route, actual) {
  const expression = '^' + route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z][A-Za-z0-9_]*/g, '[^/]+') + '$';
  return new RegExp(expression).test(actual);
}
function routeExists(method, actual) {
  const pathname = String(actual).split('?')[0];
  return routes.some(route => (route.method === method || (method === 'HEAD' && route.method === 'GET')) && pathMatches(route.path, pathname));
}
const templates = walk(viewsRoot).map(file => ({ file, source: fs.readFileSync(file, 'utf8') }));

test('every literal form action in EJS templates has a matching server route for its method', () => {
  const missing = [];
  for (const template of templates) {
    for (const formMatch of template.source.matchAll(/<form\b[^>]*>/gis)) {
      const tag = formMatch[0];
      const action = tag.match(/\baction\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (!action || !action.startsWith('/') || action.includes('<%')) continue;
      const method = (tag.match(/\bmethod\s*=\s*(["'])(.*?)\1/i)?.[2] || 'GET').toUpperCase();
      if (!routeExists(method, action)) missing.push(`${path.relative(root, template.file)}: ${method} ${action}`);
    }
  }
  assert.deepEqual(missing, [], `Form actions without routes:\n${missing.join('\n')}`);
});

test('every literal internal page link in EJS templates resolves to a route or shipped static asset', () => {
  const missing = [];
  for (const template of templates) {
    for (const linkMatch of template.source.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gis)) {
      const href = linkMatch[2];
      if (!href.startsWith('/') || href.includes('<%') || href === '#') continue;
      if (routeExists('GET', href)) continue;
      if (href.startsWith('/assets/') || href.startsWith('/css/') || href.startsWith('/js/')) {
        const assetPath = path.join(root, 'public', href.replace(/^\//, ''));
        if (fs.existsSync(assetPath)) continue;
      }
      if (href.startsWith('/uploads/')) continue; // Database-backed uploaded assets are not files in the ZIP.
      missing.push(`${path.relative(root, template.file)}: ${href}`);
    }
  }
  assert.deepEqual(missing, [], `Links without routes/assets:\n${missing.join('\n')}`);
});
