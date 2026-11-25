import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirs = ['src', 'scripts', 'public/js', 'test', 'generated', 'qa', 'vendor'];
const rootExtensions = new Set(['.js', '.mjs', '.cjs']);
const sourceExtensions = new Set(['.js', '.mjs', '.cjs']);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(absolute));
    else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const files = [];
// Include root-level JS/MJS entrypoints too (for example cloudflare-worker-entry.mjs).
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && rootExtensions.has(path.extname(entry.name))) {
    files.push(path.join(root, entry.name));
  }
}
for (const relativeDir of sourceDirs) {
  const absoluteDir = path.join(root, relativeDir);
  files.push(...await collectSourceFiles(absoluteDir));
}
files.sort();

let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    process.stderr.write(`\nSyntax check failed: ${path.relative(root, file)}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stderr.write(result.stdout);
  }
}

if (failures > 0) {
  process.stderr.write(`\nSyntax check failed for ${failures} of ${files.length} JS/MJS/CJS files.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Syntax check passed: all ${files.length} JS/MJS/CJS files (root entrypoints plus ${sourceDirs.join(', ')}).\n`);
}
