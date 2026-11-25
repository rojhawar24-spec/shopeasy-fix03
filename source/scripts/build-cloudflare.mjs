#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designCssBuild = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-design-css.mjs')], { encoding: 'utf8' });
if (designCssBuild.stdout) process.stdout.write(designCssBuild.stdout);
if (designCssBuild.stderr) process.stderr.write(designCssBuild.stderr);
if (designCssBuild.status !== 0) {
  process.stderr.write('Design CSS bundle generation failed; refusing to continue the build.\n');
  process.exit(designCssBuild.status || 1);
}
const output = path.join(root, '.cloudflare-build');
const viewsDir = path.join(root, 'views');
const generatedDir = path.join(root, 'generated');

function walk(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.ejs')) found.push(full);
  }
  return found.sort();
}
function atomicWriteFile(destination, content) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(path.dirname(destination), `.${path.basename(destination)}.tmp-`));
  const tempPath = path.join(tempDir, path.basename(destination));
  try {
    fs.writeFileSync(tempPath, content, { flag: 'wx' });
    // Keep the previous file available until the replacement is complete. This is
    // important on Windows, where another test/deploy process may read the build
    // output while a parallel build is publishing its own copy.
    fs.renameSync(tempPath, destination);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) atomicWriteFile(to, fs.readFileSync(from));
  }
}

// Multiple npm/test/deploy processes can build from the same checkout. The
// cross-process lock serializes writers, and per-file atomic replacement keeps
// existing output available to readers while a build publishes new files. Put the
// lock in the OS temp directory so release audits never ship lock metadata.
const buildLockPath = path.join(
  os.tmpdir(),
  `shopeasy-cloudflare-build-${createHash('sha256').update(root).digest('hex').slice(0, 20)}.lock`
);
const buildLockOwnerPath = path.join(buildLockPath, 'owner.json');
const buildLockToken = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const lockWaitCell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const BUILD_LOCK_TIMEOUT_MS = 180_000;
const BUILD_LOCK_MAX_AGE_MS = 180_000;
const BUILD_LOCK_EMPTY_GRACE_MS = 10_000;

function sleepSync(ms) {
  Atomics.wait(lockWaitCell, 0, 0, ms);
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function lockIsStale(now = Date.now()) {
  let stat;
  try {
    stat = fs.statSync(buildLockPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw error;
  }

  let owner;
  try {
    owner = JSON.parse(fs.readFileSync(buildLockOwnerPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return now - stat.mtimeMs > BUILD_LOCK_EMPTY_GRACE_MS;
  }

  const age = now - Number(owner.createdAt || stat.mtimeMs);
  // Builds normally take seconds. Reclaim locks left by a crashed process; the hard
  // age limit also handles a PID that Windows has since reused for another process.
  return !processIsAlive(owner.pid) || age > BUILD_LOCK_MAX_AGE_MS;
}

function acquireBuildLock() {
  const startedAt = Date.now();
  while (true) {
    try {
      fs.mkdirSync(buildLockPath);
      try {
        fs.writeFileSync(buildLockOwnerPath, JSON.stringify({
          pid: process.pid,
          token: buildLockToken,
          createdAt: Date.now()
        }), { encoding: 'utf8', flag: 'wx' });
      } catch (error) {
        fs.rmSync(buildLockPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
        throw error;
      }
      return () => {
        try {
          const owner = JSON.parse(fs.readFileSync(buildLockOwnerPath, 'utf8'));
          if (owner.pid === process.pid && owner.token === buildLockToken) {
            fs.rmSync(buildLockPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
          }
        } catch (error) {
          if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    if (lockIsStale()) {
      const stalePath = `${buildLockPath}.stale-${process.pid}-${Date.now()}`;
      try {
        fs.renameSync(buildLockPath, stalePath);
        fs.rmSync(stalePath, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
        continue;
      } catch (error) {
        if (!['ENOENT', 'EEXIST', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
      }
    }

    if (Date.now() - startedAt >= BUILD_LOCK_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for the Cloudflare build lock: ${buildLockPath}`);
    }
    sleepSync(50);
  }
}

const releaseBuildLock = acquireBuildLock();
try {
const files = walk(viewsDir);
if (files.length < 10) throw new Error(`Expected at least 10 EJS views; found ${files.length}. Refusing to build an incomplete template bundle.`);
const entries = files.map(file => [path.relative(viewsDir, file).split(path.sep).join('/'), fs.readFileSync(file, 'utf8')]);
const viewModule = `// Generated by scripts/build-cloudflare.mjs. Do not hand-edit.\nconst views = ${JSON.stringify(Object.fromEntries(entries))};\nexport default Object.freeze(views);\n`;
fs.mkdirSync(generatedDir, { recursive: true });
// Tests and deployment checks may build concurrently with the local Express server.
// Never truncate the imported module in place: another process could observe an empty
// file and fail at module instantiation. Write beside the destination, then atomically
// replace it so readers see either the previous complete module or the new complete one.
const generatedViewsPath = path.join(generatedDir, 'cloudflare-views.js');
const generatedViewsTempDir = fs.mkdtempSync(path.join(generatedDir, '.cloudflare-views-tmp-'));
const generatedViewsTempPath = path.join(generatedViewsTempDir, 'cloudflare-views.js');
try {
  fs.writeFileSync(generatedViewsTempPath, viewModule, { encoding: 'utf8', flag: 'wx' });
  fs.renameSync(generatedViewsTempPath, generatedViewsPath);
} finally {
  fs.rmSync(generatedViewsTempDir, { recursive: true, force: true });
}

// Never remove the published output tree before the replacement has been built.
// The process lock serializes writers, while per-file atomic replacement keeps
// readers from seeing ENOENT/truncated files when another test or deploy builds
// concurrently. Stale, unreferenced files are harmless in this ignored build cache.
fs.mkdirSync(output, { recursive: true });
copyTree(path.join(root, 'src'), path.join(output, 'src'));
copyTree(generatedDir, path.join(output, 'generated'));
copyTree(viewsDir, path.join(output, 'views'));

const dbPath = path.join(output, 'src', 'database.js');
let database = fs.readFileSync(dbPath, 'utf8');
const exportsAt = database.indexOf('export async function execute(');
if (exportsAt < 0) throw new Error('Could not locate database adapter exports; refusing to produce an incomplete Worker build.');
database = `import { createClient } from '@libsql/client/web';\n\nconst url = String(process.env.TURSO_DATABASE_URL || '').trim();\nconst authToken = String(process.env.TURSO_AUTH_TOKEN || '').trim();\nif (!url || !authToken || !/^libsql:\\/\\//i.test(url)) {\n  throw new Error('Cloudflare production database is not configured. Set TURSO_DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN with Wrangler secrets.');\n}\nexport const db = createClient({ url, authToken });\n\n${database.slice(exportsAt)}`;
atomicWriteFile(dbPath, database);

const workerSource = `import { httpServerHandler } from 'cloudflare:node';\nimport { env as cloudflareEnv } from 'cloudflare:workers';\n\n// CLOUDFLARE_WORKER is configured in wrangler.jsonc. server.js owns the one app.listen() call.\nglobalThis.__SHOP_CF_ENV = cloudflareEnv;\nawait import('./server.js');\nexport default httpServerHandler({ port: 3000 });\n`;
atomicWriteFile(path.join(output, 'src', 'worker.js'), workerSource);

// Keep Wrangler's configured main entrypoint at the project root. Wrangler bundles
// npm dependencies from the project package.json; placing the main inside the
// generated .cloudflare-build directory made dependency resolution fail on Windows.
const rootWorkerEntry = `export { default } from './.cloudflare-build/src/worker.js';\nexport { ShopEasyRateLimiter } from './.cloudflare-build/src/rate-limit-durable-object.js';\n`;
atomicWriteFile(path.join(root, 'cloudflare-worker-entry.mjs'), rootWorkerEntry);

const expected = files.length;
const bundle = fs.readFileSync(path.join(generatedDir, 'cloudflare-views.js'), 'utf8');
for (const [name] of entries) if (!bundle.includes(JSON.stringify(name))) throw new Error(`Generated template bundle is missing ${name}`);
console.log(`Cloudflare build source generated: ${files.length} EJS templates bundled; Turso web client selected; SQLite-backed Durable Object rate limiter exported; database BLOB images enabled; no billable object-storage binding required.`);
} finally {
  releaseBuildLock();
}

