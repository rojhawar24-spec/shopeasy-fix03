#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const missing = [];
// @libsql/core intentionally exposes named subpaths rather than a root module.
// Check the actual public entry point used by database.js instead of treating
// an absent package-root export as a missing installation.
const entrypoints = { '@libsql/core': '@libsql/core/config' };
for (const dependency of Object.keys(pkg.dependencies || {})) {
  try { require.resolve(entrypoints[dependency] || dependency); }
  catch { missing.push(dependency); }
}
if (missing.length) {
  console.error(`Test preflight failed: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} declared in package.json but not installed or resolvable.`);
  console.error('No tests were skipped or marked as passed. From the project root, run `npm ci` using a working connection to the npm registry, then run `npm test` again.');
  process.exitCode = 1;
} else {
  console.log(`Test dependency preflight passed: all ${Object.keys(pkg.dependencies || {}).length} direct dependencies resolve.`);
}
