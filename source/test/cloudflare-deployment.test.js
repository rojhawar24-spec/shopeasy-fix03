import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Cloudflare deployment uses free-first host/static assets without a billable object-store binding', () => {
  const wrangler = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(wrangler.main, './cloudflare-worker-entry.mjs');
  assert.match(read('cloudflare-worker-entry.mjs'), /export \{ default \} from ['"]\.\/\.cloudflare-build\/src\/worker\.js['"]/);
  assert.equal(wrangler.assets.binding, 'ASSETS');
  assert.equal(wrangler.r2_buckets, undefined);
  assert.ok(wrangler.vars.CLOUDFLARE_WORKER === '1');
  assert.equal(wrangler.vars.NODE_ENV, 'production');
  assert.equal(wrangler.vars.AI_ENABLED, 'false');
});

test('Cloudflare bundle uses libSQL web client and starts Express exactly once', () => {
  const build = read('scripts/build-cloudflare.mjs');
  assert.match(build, /@libsql\/client\/web/);
  assert.match(build, /await import\('\.\/server\.js'\)/);
  assert.match(build, /httpServerHandler\(\{ port: 3000 \}\)/);
  assert.doesNotMatch(build, /app\.listen\(3000\)/, 'the wrapper must not start a second Express listener');
  assert.doesNotMatch(build, /processEnv\.CLOUDFLARE_WORKER = '1'/, 'Worker mode must come from Wrangler vars, not mutate the process env');
});

test('Cloudflare stores uploads in Turso BLOBs and does not require R2 or Vercel-only paths', () => {
  const build = read('scripts/build-cloudflare.mjs');
  const server = read('src/server.js');
  const db = read('src/db.js');
  assert.match(build, /TURSO_DATABASE_URL/);
  assert.match(build, /TURSO_AUTH_TOKEN/);
  assert.match(server, /INSERT INTO uploaded_assets\(path,content_type,data\)/);
  assert.match(server, /SELECT content_type,data FROM uploaded_assets WHERE path=\?/);
  assert.doesNotMatch(server, /SHOP_IMAGES|external_assets/);
  assert.doesNotMatch(read('wrangler.jsonc'), /r2_buckets|SHOP_IMAGES/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS asset_storage_quota/);
});


test('image uploads cannot delete newly committed assets after a follow-up failure', () => {
  const server = read('src/server.js');
  assert.match(server, /let productCommitted=false/);
  assert.match(server, /if\(!productCommitted\) for\(const uploaded of new Set\(newUploadedImages\)\)/);
  assert.match(server, /if\(productCommitted\) return res\.status\(500\)/);
  assert.match(server, /let storyCommitted=false/);
  assert.match(server, /savedImage && !storyCommitted/);
  assert.match(server, /Old product image cleanup; metadata retained for recovery/);
  assert.match(server, /Old story image cleanup; metadata retained for recovery/);
});

test('uploaded-asset deletion refunds quota atomically and retries embedded SQLite busy/locked writes', () => {
  const server = read('src/server.js');
  const db = read('src/db.js');
  assert.match(server, /async function withBusyRetry/);
  assert.match(server, /DELETE FROM uploaded_assets WHERE path=\?/);
  assert.doesNotMatch(server, /SELECT length\(data\) AS size_bytes FROM uploaded_assets/);
  assert.match(db, /CREATE TRIGGER IF NOT EXISTS uploaded_assets_quota_after_delete/);
  assert.match(db, /COALESCE\(length\(OLD\.data\),0\)/);
  assert.match(db, /AFTER DELETE ON uploaded_assets/);
});

test('Turso BLOB upload quota reserves before insert and does not undercount ambiguous writes', () => {
  const server = read('src/server.js');
  assert.match(server, /UPDATE asset_storage_quota SET used_bytes=used_bytes\+\? WHERE id=1 AND used_bytes\+\?<=max_bytes/);
  assert.match(server, /INSERT INTO uploaded_assets\(path,content_type,data\)/);
  assert.match(server, /if\(!confirmed\) await run\('UPDATE asset_storage_quota SET used_bytes=MAX\(0,used_bytes-\?\) WHERE id=1'/);
  assert.match(read('src/db.js'), /max_bytes INTEGER NOT NULL DEFAULT 2147483648/);
  assert.match(read('src/db.js'), /image_quota_reconciled_v272/);
});
