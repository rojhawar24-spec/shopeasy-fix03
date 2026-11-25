import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Also safe when invoked directly without npm's isolated test launcher.
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-upload-quota-'));
process.env.DATABASE_URL=pathToFileURL(path.join(directory,'quota.db')).href;
process.env.SHOP_DATABASE_URL=process.env.DATABASE_URL;
process.env.NODE_ENV='test';process.env.CLOUDFLARE_WORKER='0';process.env.SEED_DEMO_DATA='false';
delete process.env.TURSO_DATABASE_URL;delete process.env.TURSO_AUTH_TOKEN;
const {default:db}=await import('../src/db.js');
const {getRow,run}=await import('../src/database.js');
after(()=>{db.close();fs.rmSync(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100});});

async function deleteWithBusyRetry(path) {
  for (let attempt=0;;attempt++) {
    try {
      const result=await run('DELETE FROM uploaded_assets WHERE path=?',[path]);
      return result.changes>0;
    } catch(error) {
      const code=String(error?.code||error?.rawCode||'').toUpperCase();
      if (!['SQLITE_BUSY','SQLITE_LOCKED','5','6'].includes(code) || attempt>=7) throw error;
      await new Promise(resolve=>setTimeout(resolve,25*(2**attempt)));
    }
  }
}

test('image quota deletion refunds bytes exactly once through an atomic DELETE trigger', async () => {
  const path = `/uploads/${'a'.repeat(32)}.png`;
  await run('DELETE FROM uploaded_assets WHERE path=?', [path]);
  await run('UPDATE asset_storage_quota SET used_bytes=0 WHERE id=1');
  await run('INSERT INTO uploaded_assets(path,content_type,data) VALUES(?,?,?)', [path, 'image/png', new Uint8Array(100)]);
  await run('UPDATE asset_storage_quota SET used_bytes=100 WHERE id=1');

  const trigger=await getRow("SELECT name FROM sqlite_master WHERE type='trigger' AND name='uploaded_assets_quota_after_delete'");
  assert.equal(trigger?.name,'uploaded_assets_quota_after_delete');

  // Exercise two callers at once. The helper in server.js retries embedded SQLite
  // busy/locked responses, while the trigger makes the quota refund exactly-once.
  const [first,second]=await Promise.all([deleteWithBusyRetry(path),deleteWithBusyRetry(path)]);
  assert.equal([first,second].filter(Boolean).length,1);
  assert.equal(Number((await getRow('SELECT used_bytes FROM asset_storage_quota WHERE id=1')).used_bytes),0);
  assert.equal(await getRow('SELECT path FROM uploaded_assets WHERE path=?', [path]), undefined);

  const serverSource = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const helper = serverSource.slice(serverSource.indexOf('async function withBusyRetry'), serverSource.indexOf('async function safeProductImage'));
  assert.match(helper, /withBusyRetry/);
  assert.match(helper, /DELETE FROM uploaded_assets/);
  assert.doesNotMatch(helper, /SELECT length\(data\)/);
  assert.doesNotMatch(helper, /UPDATE asset_storage_quota SET used_bytes=MAX\(0,used_bytes-\?\)/);

  const dbSource=fs.readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
  assert.match(dbSource,/CREATE TRIGGER IF NOT EXISTS uploaded_assets_quota_after_delete/);
  assert.match(dbSource,/COALESCE\(length\(OLD\.data\),0\)/);

  await run('DELETE FROM uploaded_assets WHERE path=?', [path]);
  await run('UPDATE asset_storage_quota SET used_bytes=0 WHERE id=1');
});
