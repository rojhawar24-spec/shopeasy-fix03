import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  encodeBackupRow, decodeBackupRow, parseBackupEncryptionKey,
  writeCompressedBackup, restoreCompressedBackup, sha256File, sameDatabaseTarget, databaseTargetIdentity, fileUrlForPath
} from '../src/services/database-backup.js';
import { maxRefundForRequestCents } from '../src/order-return-rules.js';
import * as emailService from '../src/services/email.js';

const testKey = Buffer.alloc(32, 17).toString('base64');
function createNativeClient(db) {
  return {
    async execute(query) {
      const sql=typeof query==='string'?query:query.sql;
      const args=typeof query==='string'?[]:(query.args||[]);
      const head=sql.trimStart().slice(0,30).toUpperCase();
      if(/^(SELECT|PRAGMA|WITH|EXPLAIN)\b/.test(head)) {
        const rows=db.prepare(sql).all(...args).map(row=>({...row}));
        return {rows,rowsAffected:0,lastInsertRowid:0};
      }
      if(/^\s*(CREATE|ALTER|DROP|VACUUM|REINDEX)\b/i.test(sql)) {
        db.exec(sql);return {rows:[],rowsAffected:0,lastInsertRowid:0};
      }
      const result=db.prepare(sql).run(...args);
      return {rows:[],rowsAffected:Number(result.changes||0),lastInsertRowid:result.lastInsertRowid??0};
    },
    async batch(statements) {
      const output=[];
      db.exec('BEGIN');
      try {
        for(const item of statements){
          const result=db.prepare(item.sql).run(...(item.args||[]));
          output.push({rows:[],rowsAffected:Number(result.changes||0),lastInsertRowid:result.lastInsertRowid??0});
        }
        db.exec('COMMIT');return output;
      } catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}
    },
    async transaction() {
      db.exec('BEGIN IMMEDIATE');
      let closed=false;
      const execute=this.execute.bind(this);
      return {
        execute,
        async batch(statements) {const results=[];for(const statement of statements)results.push(await execute(statement));return results;},
        async commit(){db.exec('COMMIT');closed=true;},
        async rollback(){if(!closed)db.exec('ROLLBACK');closed=true;},
        close(){if(!closed)db.exec('ROLLBACK');closed=true;}
      };
    },
    async close(){db.close();}
  };
}
function setupSource(db) {
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT NOT NULL UNIQUE);
    CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,sku TEXT NOT NULL UNIQUE);
    CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,status TEXT NOT NULL,total_cents INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
    CREATE TABLE order_items(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,product_id INTEGER NOT NULL,product_name TEXT NOT NULL,quantity INTEGER NOT NULL,unit_price_cents INTEGER NOT NULL,total_cents INTEGER NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(product_id) REFERENCES products(id));
    CREATE TABLE order_status_history(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,to_status TEXT NOT NULL,FOREIGN KEY(order_id) REFERENCES orders(id));
    CREATE TABLE uploaded_assets(path TEXT PRIMARY KEY,content_type TEXT NOT NULL,data BLOB NOT NULL);
    CREATE TABLE extra_flags(name TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE TRIGGER orders_status_history_test AFTER UPDATE OF status ON orders WHEN NEW.status<>OLD.status BEGIN INSERT INTO order_status_history(order_id,to_status) VALUES(NEW.id,NEW.status); END;
  `);
  db.prepare('INSERT INTO users(email) VALUES(?)').run('customer@example.test');
  db.prepare('INSERT INTO products(name,sku) VALUES(?,?)').run('Jacket','J-1');
  db.prepare('INSERT INTO orders(user_id,status,total_cents) VALUES(1,?,?)').run('shipped',4999);
  db.prepare('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price_cents,total_cents) VALUES(1,1,?,?,?,?)').run('Jacket',1,4999,4999);
  db.prepare('INSERT INTO order_status_history(order_id,to_status) VALUES(1,?)').run('shipped');
  db.prepare('INSERT INTO uploaded_assets(path,content_type,data) VALUES(?,?,?)').run('/uploads/12345678901234567890123456789012.webp','image/webp',Buffer.from([0,1,2,255]));
  db.prepare('INSERT INTO extra_flags(name,value) VALUES(?,?)').run('store_name','ShopEasy');
}

 test('backup row codecs preserve binary blobs and bigint values',()=>{
  const input={label:'x',data:new Uint8Array([0,1,255]),id:123n,nullable:null};
  const restored=decodeBackupRow(JSON.parse(JSON.stringify(encodeBackupRow(input))));
  assert.deepEqual(Buffer.from(restored.data),Buffer.from([0,1,255]));
  assert.equal(restored.id,123n);
  assert.equal(restored.label,'x');
  assert.equal(restored.nullable,null);
});

test('encrypted database + BLOB + filesystem media backup restores into an empty target',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-backup-test-'));
  const source=new DatabaseSync(':memory:');setupSource(source);
  const sourceClient=createNativeClient(source);
  const uploads=path.join(dir,'source-uploads');fs.mkdirSync(uploads);
  const mediaName='abcdefabcdefabcdefabcdefabcdefab.png';
  const mediaBytes=Buffer.from('media-image-data');fs.writeFileSync(path.join(uploads,mediaName),mediaBytes);
  const backupPath=path.join(dir,'shop.jsonl.gz.enc');
  t.after(()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}});
  const written=await writeCompressedBackup(sourceClient,{outputPath:backupPath,uploadsDir:uploads,encryptionKey:testKey,batchSize:2});
  assert.equal(written.encrypted,true);
  assert.equal(fs.existsSync(`${backupPath}.sha256`),true);
  assert.equal(await sha256File(backupPath),written.sha256);
  assert.equal(fs.readFileSync(backupPath).subarray(0,8).toString(),'SHEBKP01');
  assert.equal(fs.readFileSync(backupPath).includes(Buffer.from('customer@example.test')),false,'backup should not expose PII as plain text');

  const target=new DatabaseSync(':memory:');target.exec('PRAGMA foreign_keys=ON');
  const targetClient=createNativeClient(target);
  const restoredUploads=path.join(dir,'restored-uploads');
  const result=await restoreCompressedBackup(targetClient,{inputPath:backupPath,uploadsDir:restoredUploads,confirmRestore:true,encryptionKey:testKey});
  assert.equal(result.restoredRows,7);
  assert.equal(result.restoredFiles,1);
  assert.equal(target.prepare('SELECT email FROM users WHERE id=1').get().email,'customer@example.test');
  assert.equal(target.prepare('SELECT status FROM orders WHERE id=1').get().status,'shipped');
  assert.deepEqual(Buffer.from(target.prepare('SELECT data FROM uploaded_assets WHERE path=?').get('/uploads/12345678901234567890123456789012.webp').data),Buffer.from([0,1,2,255]));
  assert.equal(target.prepare('SELECT COUNT(*) AS c FROM order_status_history').get().c,1,'restore must not run data-changing triggers before restoring source rows');
  assert.equal(fs.readFileSync(path.join(restoredUploads,mediaName)).toString(),'media-image-data');
  target.exec("UPDATE orders SET status='completed' WHERE id=1");
  assert.equal(target.prepare('SELECT to_status FROM order_status_history ORDER BY id DESC LIMIT 1').get().to_status,'completed','restored trigger must operate after schema recreation');
  await sourceClient.close();await targetClient.close();
});

test('backup fail-closed cases preserve a previous known-good backup',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-backup-safe-'));
  t.after(()=>{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}});
  const source=new DatabaseSync(':memory:');setupSource(source);const client=createNativeClient(source);
  const backupPath=path.join(dir,'shop.jsonl.gz.enc');
  await writeCompressedBackup(client,{outputPath:backupPath,uploadsDir:'',encryptionKey:testKey});
  const priorBytes=fs.readFileSync(backupPath),priorSidecar=fs.readFileSync(`${backupPath}.sha256`);
  const incomplete=new DatabaseSync(':memory:');incomplete.exec('CREATE TABLE not_shop(id INTEGER PRIMARY KEY)');
  await assert.rejects(writeCompressedBackup(createNativeClient(incomplete),{outputPath:backupPath,uploadsDir:'',encryptionKey:testKey}),/BACKUP_SCHEMA_INCOMPLETE/);
  assert.deepEqual(fs.readFileSync(backupPath),priorBytes);
  assert.deepEqual(fs.readFileSync(`${backupPath}.sha256`),priorSidecar);
  const nonemptyTarget=new DatabaseSync(':memory:');nonemptyTarget.exec('CREATE TABLE customer_data(id INTEGER)');
  await assert.rejects(restoreCompressedBackup(createNativeClient(nonemptyTarget),{inputPath:backupPath,confirmRestore:true,encryptionKey:testKey}),/RESTORE_TARGET_NOT_EMPTY/);
  const wrongKeyTarget=new DatabaseSync(':memory:');
  await assert.rejects(restoreCompressedBackup(createNativeClient(wrongKeyTarget),{inputPath:backupPath,confirmRestore:true,encryptionKey:Buffer.alloc(32,99).toString('base64')}),/BACKUP_INVALID_OR_TRUNCATED|BACKUP_DECRYPT_FAILED|BACKUP_UNSUPPORTED/);
  assert.equal(wrongKeyTarget.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length,0,'wrong key fails before restore schema creation');
  await client.close();incomplete.close();nonemptyTarget.close();wrongKeyTarget.close();
});

test('order emails render a bounded transaction message but only send through an enabled Resend configuration',async t=>{
  const previousKey=process.env.RESEND_API_KEY,previousFrom=process.env.EMAIL_FROM,previousFetch=globalThis.fetch;
  t.after(()=>{if(previousKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previousKey;if(previousFrom===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=previousFrom;globalThis.fetch=previousFetch;});
  process.env.RESEND_API_KEY='test-key';process.env.EMAIL_FROM='ShopEasy <orders@example.test>';
  let payload;
  globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');payload=JSON.parse(options.body);return {ok:true,json:async()=>({id:'email_123'})};};
  const result=await emailService.sendOrderNotificationEmail({eventType:'confirmation',locale:'ckb',storeName:'Test Store',order:{id:42,status:'pending',email:'buyer@example.test',currency:'EUR',total_cents:2599,payment_provider:'cash_on_delivery'},items:[{product_name:'Red Jacket',quantity:1,total_cents:2599,variant_name:'Colour',variant_value:'Red',variant_name_2:'Size',variant_value_2:'M'}]});
  assert.equal(result.sent,true);
  assert.deepEqual(payload.to,['buyer@example.test']);
  assert.match(payload.subject,/42/);
  assert.match(payload.html,/Red Jacket/);
  assert.match(payload.html,/Red/);
  assert.match(payload.text,/M/);
  assert.ok(payload['does-not-exist']===undefined);
});

test('order notification email stays skipped when Resend configuration is absent',async t=>{
  const previousKey=process.env.RESEND_API_KEY,previousFrom=process.env.EMAIL_FROM,previousFetch=globalThis.fetch;
  t.after(()=>{if(previousKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=previousKey;if(previousFrom===undefined)delete process.env.EMAIL_FROM;else process.env.EMAIL_FROM=previousFrom;globalThis.fetch=previousFetch;});
  delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;
  globalThis.fetch=async()=>{throw new Error('fetch must not be called when email is disabled');};
  const result=await emailService.sendOrderNotificationEmail({order:{id:1,status:'pending',email:'buyer@example.test'}});
  assert.deepEqual(result,{sent:false,skipped:true});
});


test('order email features are explicitly opt-in and the database query enforces daily/idempotent caps',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  const dbSource=fs.readFileSync(path.join(root,'src/db.js'),'utf8');
  const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
  assert.match(env,/^ORDER_CONFIRMATION_EMAILS=0$/m);
  assert.match(env,/^ORDER_STATUS_EMAILS=0$/m);
  assert.match(server,/process\.env\.ORDER_CONFIRMATION_EMAILS==='1'/);
  assert.match(server,/process\.env\.ORDER_STATUS_EMAILS==='1'/);
  assert.match(server,/ORDER_EMAIL_DAILY_LIMIT/);
  assert.match(dbSource,/UNIQUE\(order_id,\s*event_key\)/);
  const claimSource=dbSource.slice(dbSource.indexOf('export async function claimOrderEmailDelivery'),dbSource.indexOf('export async function finishOrderEmailDelivery'));
  const finishSource=dbSource.slice(dbSource.indexOf('export async function finishOrderEmailDelivery'),dbSource.indexOf('export async function getOrderEmailDeliveries'));
  assert.match(claimSource,/SUM\(CASE WHEN attempt_day=\? THEN attempts_today/, 'the daily quota counts retries, not only unique delivery rows');
  assert.match(claimSource,/count>=limit/);
  assert.match(claimSource,/existing\.attempts_today\)\+1/, 'another attempt consumes the same-day quota');
  assert.match(claimSource,/ORDER_EMAIL_RETRY_WINDOW_MS/);
  assert.match(claimSource,/ORDER_EMAIL_MAX_ATTEMPTS/);
  assert.match(finishSource,/WHERE id=\? AND status='sending' AND claim_token=\?/, 'only the owning attempt can finish a lease');
  assert.match(server,/finishOrderEmailDelivery\(order\.id,eventKey,\{claimToken:claim\.claimToken,sent:true/);
  assert.match(server,/finishOrderEmailDelivery\(order\.id,eventKey,\{claimToken:claim\.claimToken,sent:false/);
});

test('order status and return mutations require CSRF and return/refund transitions stay manager controlled',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const server=fs.readFileSync(path.join(root,'src/server.js'),'utf8');
  const dbSource=fs.readFileSync(path.join(root,'src/db.js'),'utf8');
  const accountView=fs.readFileSync(path.join(root,'views/order.ejs'),'utf8');
  const returnView=fs.readFileSync(path.join(root,'views/admin/returns.ejs'),'utf8');
  assert.match(server,/app\.post\('\/account\/order\/:id\/returns',requireAuth,checkoutLimiter,verifyCsrf/);
  assert.match(server,/app\.post\('\/account\/order\/:id\/cancel',requireAuth,checkoutLimiter,verifyCsrf/);
  assert.match(server,/app\.post\('\/admin\/returns\/:id\/action',requireManager,verifyCsrf/);
  assert.match(server,/\['requested','approved','rejected','item_received','exchange_sent','refund_recorded','completed','cancelled'\]\.includes\(status\)/);
  assert.match(dbSource,/oi\.total_cents AS item_total_cents,oi\.quantity AS purchased_quantity FROM order_returns r JOIN orders o/);
  assert.match(dbSource,/amount>maximumForThisRequest/);
  assert.match(dbSource,/alreadyForItem\+amount>netItemTotalCents/);
  assert.match(dbSource,/allocateCouponDiscountAcrossItems/);
  assert.match(returnView,/Maximum for this request after the order discount/);
  assert.match(server,/app\.post\('\/checkout\/success\/returns',checkoutLimiter,verifyCsrf/);
  assert.match(server,/guestOrderTokenMatches\(order,req\.cookies\?\.\[guestOrderCookieName\(order\.id\)\]\)/);
  assert.match(dbSource,/WHERE id=\? AND user_id IS NULL/);
  assert.match(dbSource,/request_type IN \('return','refund','exchange'\)/);
  assert.match(dbSource,/exchangeReference\.length<3/);
  assert.match(returnView,/recording a refund here is an audit record only/);
  assert.match(accountView,/ORDER HISTORY|مێژووی داواکاری/);
  assert.match(accountView,/name="requestType"/);
  assert.match(accountView,/value="exchange"/);
});

test('backup and restore are explicit manual operations and refuse unsafe restore targets',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const backupScript=fs.readFileSync(path.join(root,'scripts/backup-database.mjs'),'utf8');
  const restoreScript=fs.readFileSync(path.join(root,'scripts/restore-database.mjs'),'utf8');
  const backupService=fs.readFileSync(path.join(root,'src/services/database-backup.js'),'utf8');
  const doc=fs.readFileSync(path.join(root,'DATABASE-BACKUP-RESTORE.md'),'utf8');
  assert.match(backupScript,/BACKUP_ENCRYPTION_KEY/);
  assert.match(restoreScript,/--confirm-restore/);
  assert.match(restoreScript,/RESTORE_DATABASE_URL/);
  assert.match(backupService,/aes-256-gcm/i);
  assert.match(backupService,/RESTORE_TARGET_NOT_EMPTY/);
  assert.match(backupService,/BACKUP_MAX_BYTES|DEFAULT_MAX/);
  assert.match(doc,/manual\/on-demand[\s\S]{0,50}not a hosted backup schedule/i);
  assert.match(doc,/free remote database/);
  assert.match(doc,/never test restore on production/i);
});


test('refund cap is computed per requested quantity, not all returns on the same line',()=>{
  assert.equal(maxRefundForRequestCents({itemTotalCents:3000,purchasedQuantity:3,requestedQuantity:1}),1000);
  assert.equal(maxRefundForRequestCents({itemTotalCents:3000,purchasedQuantity:3,requestedQuantity:2}),2000);
  assert.equal(maxRefundForRequestCents({itemTotalCents:100,purchasedQuantity:3,requestedQuantity:1}),34,'fractional minor units round up per request but item/order aggregate caps still apply');
  assert.equal(maxRefundForRequestCents({itemTotalCents:3000,purchasedQuantity:3,requestedQuantity:4}),0);
  assert.equal(maxRefundForRequestCents({itemTotalCents:3000,purchasedQuantity:0,requestedQuantity:1}),0);
  assert.equal(maxRefundForRequestCents({itemTotalCents:-1,purchasedQuantity:3,requestedQuantity:1}),0);
});

test('restore target comparison refuses source URLs with slash/query/case variations',async(t)=>{
  assert.equal(sameDatabaseTarget('libsql://Store-Db.Turso.io/?tls=1','libsql://store-db.turso.io'),true);
  assert.equal(sameDatabaseTarget('libsql://store-db.turso.io','libsql://other-db.turso.io'),false);
  // Construct a valid local file URL for the host OS (drive-letter URLs on Windows).
  const localTarget = fileUrlForPath(path.join(os.tmpdir(),'shopeasy-restore-target-test.db'));
  const otherLocalTarget = fileUrlForPath(path.join(os.tmpdir(),'shopeasy-other-restore-target-test.db'));
  assert.equal(sameDatabaseTarget(localTarget,localTarget),true);
  assert.equal(sameDatabaseTarget(localTarget,otherLocalTarget),false);
  const relativeLocalTarget = `file:./${path.relative(process.cwd(),path.join(process.cwd(),'data','shop.db')).replaceAll('\\','/')}`;
  assert.equal(sameDatabaseTarget(relativeLocalTarget,fileUrlForPath(path.join(process.cwd(),'data','shop.db'))),true,
    'relative file:./ URLs must resolve to the same physical local database as absolute file URLs');

  await t.test('symlinked parent directories resolve to the same local database',async(st)=>{
    const symlinkRoot=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-db-alias-'));
    try {
      const realDirectory=path.join(symlinkRoot,'real');
      const aliasDirectory=path.join(symlinkRoot,'alias');
      fs.mkdirSync(realDirectory);
      const realDatabase=path.join(realDirectory,'shop.db');
      fs.writeFileSync(realDatabase,'test');
      try {
        fs.symlinkSync(realDirectory,aliasDirectory,'dir');
      } catch(error) {
        if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(error?.code)) {
          st.skip('This Windows account cannot create directory symlinks; enable Developer Mode or run with symlink privilege to execute this platform-specific assertion.');
          return;
        }
        throw error;
      }
      assert.equal(sameDatabaseTarget(fileUrlForPath(path.join(aliasDirectory,'shop.db')),fileUrlForPath(realDatabase)),true,
        'restore guard must resolve symlinked parent directories to the same physical database');
      const missingViaAlias=fileUrlForPath(path.join(aliasDirectory,'future.db'));
      const missingReal=fileUrlForPath(path.join(realDirectory,'future.db'));
      assert.equal(sameDatabaseTarget(missingViaAlias,missingReal),true,
        'restore guard must resolve symlinked parents even when the target database does not exist yet');
    } finally {
      fs.rmSync(symlinkRoot,{recursive:true,force:true});
    }
  });
  assert.equal(databaseTargetIdentity('libsql://store-db.turso.io/?authToken=not-the-identity'),'remote:libsql://store-db.turso.io');
});

test('restore refuses the configured primary DATABASE_URL as well as legacy source aliases',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const restoreScript=fs.readFileSync(path.join(root,'scripts/restore-database.mjs'),'utf8');
  assert.match(restoreScript,/\[process\.env\.DATABASE_URL,process\.env\.SHOP_DATABASE_URL,process\.env\.TURSO_DATABASE_URL\]/,
    'restore source guard must include the primary Oracle/local DATABASE_URL');
  assert.match(restoreScript,/targetIsConfiguredSource\|\|targetIsDefaultLocal/);
});

test('Oracle backup wrapper uses the encrypted logical backup and never creates plaintext database dumps',()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const wrapper=fs.readFileSync(path.join(root,'backup.sh'),'utf8');
  const deployment=fs.readFileSync(path.join(root,'DEPLOYMENT.md'),'utf8');
  assert.match(wrapper,/npm run backup:database/);
  assert.match(wrapper,/\.jsonl\.gz\.enc/);
  assert.match(wrapper,/\.sha256/);
  assert.doesNotMatch(wrapper,/sqlite3 .*\.backup|data\/shopeasy\.db/);
  assert.match(deployment,/AES-256-GCM/);
  assert.doesNotMatch(deployment,/sqlite3 `?\.backup`?/);
});
