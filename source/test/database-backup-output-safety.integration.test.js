import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {Writable} from 'node:stream';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {assertSafeBackupOutput, restoreCompressedBackup, sha256File, writeCompressedBackup} from '../src/services/database-backup.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const url=filename=>pathToFileURL(filename).href;
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-backup-output-'));
  const filename=path.join(directory,'source.db');
  const client=createClient({url:url(filename)});
  await client.executeMultiple("CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT); CREATE TABLE orders(id INTEGER PRIMARY KEY,product_id INTEGER REFERENCES products(id),amount INTEGER); INSERT INTO products VALUES(1,'Synthetic'); INSERT INTO orders VALUES(1,1,1250);");
  t.after(()=>{client.close();fs.rmSync(directory,{recursive:true,force:true});});
  const key=crypto.randomBytes(32).toString('base64');
  return {directory,filename,client,key};
}

test('backup writer refuses an existing database, unrelated file and directory without moving or replacing them',async t=>{
  const f=await fixture(t);
  const before=fs.readFileSync(f.filename);
  await assert.rejects(writeCompressedBackup(f.client,{outputPath:f.filename,uploadsDir:'',encryptionKey:f.key}),/BACKUP_DESTINATION_NOT_BACKUP|BACKUP_OUTPUT_IS_SOURCE_DATABASE/);
  assert.equal(digest(fs.readFileSync(f.filename)),digest(before));
  assert.equal((await f.client.execute('SELECT amount FROM orders WHERE id=1')).rows[0].amount,1250);
  const unrelated=path.join(f.directory,'unrelated.txt');fs.writeFileSync(unrelated,'keep unrelated content');
  await assert.rejects(writeCompressedBackup(f.client,{outputPath:unrelated,uploadsDir:'',encryptionKey:f.key}),/BACKUP_DESTINATION_NOT_BACKUP/);
  assert.equal(fs.readFileSync(unrelated,'utf8'),'keep unrelated content');
  const directory=path.join(f.directory,'existing-directory');fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'sentinel'),'keep directory');
  await assert.rejects(writeCompressedBackup(f.client,{outputPath:directory,uploadsDir:'',encryptionKey:f.key}),/BACKUP_DESTINATION_NOT_REGULAR_FILE/);
  assert.equal(fs.readFileSync(path.join(directory,'sentinel'),'utf8'),'keep directory');
  assert.ok(!fs.readdirSync(f.directory).some(name=>name.includes('.previous-')||name.endsWith('.lock')||name.includes('.tmp-')));
});

test('backup can replace a recognised encrypted pair and preserves that pair after a stream/export failure',async t=>{
  const f=await fixture(t),outputPath=path.join(f.directory,'valid.enc');
  await writeCompressedBackup(f.client,{outputPath,uploadsDir:'',encryptionKey:f.key});
  await f.client.execute('INSERT INTO orders VALUES(2,1,2450)');
  const written=await writeCompressedBackup(f.client,{outputPath,uploadsDir:'',encryptionKey:f.key});
  assert.equal(written.lockCleanupFailed,false);
  assert.equal(await sha256File(outputPath),written.sha256);
  assert.equal(fs.readFileSync(outputPath+'.sha256','utf8').split(/\s+/)[0],written.sha256);
  const target=createClient({url:url(path.join(f.directory,'restored.db'))});
  try {
    await restoreCompressedBackup(target,{inputPath:outputPath,confirmRestore:true,encryptionKey:f.key});
    assert.equal((await target.execute('SELECT count(*) AS n FROM orders')).rows[0].n,2);
  }finally{target.close();}
  const original=fs.readFileSync(outputPath),sidecar=fs.readFileSync(outputPath+'.sha256');
  const broken={async execute(){throw Error('INJECTED_EXPORT_FAILURE');}};
  await assert.rejects(writeCompressedBackup(broken,{outputPath,uploadsDir:'',encryptionKey:f.key}),/INJECTED_EXPORT_FAILURE/);
  assert.deepEqual(fs.readFileSync(outputPath),original);
  assert.deepEqual(fs.readFileSync(outputPath+'.sha256'),sidecar);
  assert.ok(!fs.readdirSync(f.directory).some(name=>name.includes('.previous-')||name.endsWith('.lock')||name.includes('.tmp-')));
});

test('actual exclusive destination lock refuses a concurrent writer and is removed after success',async t=>{
  const f=await fixture(t),outputPath=path.join(f.directory,'concurrent.enc');
  let reached,release;
  const firstReached=new Promise(resolve=>{reached=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  let paused=false;
  const slow={async execute(query){if(!paused){paused=true;reached();await gate;}return f.client.execute(query);}};
  const first=writeCompressedBackup(slow,{outputPath,uploadsDir:'',encryptionKey:f.key});
  await firstReached;
  try{await assert.rejects(writeCompressedBackup(f.client,{outputPath,uploadsDir:'',encryptionKey:f.key}),/BACKUP_DESTINATION_BUSY/);}finally{release();}
  const result=await first;
  assert.equal(await sha256File(outputPath),result.sha256);
  assert.equal(fs.existsSync(outputPath+'.lock'),false);
});

test('asynchronous output stream errors reject through the pipeline and clean the owned lock and temporary files',async t=>{
  const f=await fixture(t),outputPath=path.join(f.directory,'stream-error.enc');
  const original=fs.createWriteStream;
  fs.createWriteStream=()=>new Writable({write(_bytes,_encoding,callback){callback(Error('INJECTED_OUTPUT_WRITE_FAILURE'));}});
  syncBuiltinESMExports();
  try {
    await assert.rejects(writeCompressedBackup(f.client,{outputPath,uploadsDir:'',encryptionKey:f.key}),/INJECTED_OUTPUT_WRITE_FAILURE/);
  } finally {fs.createWriteStream=original;syncBuiltinESMExports();}
  assert.equal(fs.existsSync(outputPath),false);
  assert.equal(fs.existsSync(outputPath+'.sha256'),false);
  assert.ok(!fs.readdirSync(f.directory).some(name=>name.endsWith('.lock')||name.includes('.tmp-')));
});

test('source database, WAL, SHM and rollback journal names are refused for every configured local source alias',async t=>{
  const f=await fixture(t);
  const names=['DATABASE_URL','SHOP_DATABASE_URL','TURSO_DATABASE_URL'];
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try {
    for(const name of names)delete process.env[name];
    for(const name of names) {
      process.env[name]=url(f.filename);
      for(const suffix of ['','-wal','-shm','-journal'])assert.throws(()=>assertSafeBackupOutput(f.filename+suffix),/BACKUP_OUTPUT_IS_SOURCE_DATABASE/);
      delete process.env[name];
    }
  } finally {for(const name of names)if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}
});

test('backup CLI refuses source and SQLite sidecar outputs before a backup transaction or publication',async t=>{
  const f=await fixture(t),runtime=path.join(f.directory,'runtime');
  fs.mkdirSync(runtime);fs.cpSync(path.join(root,'src'),path.join(runtime,'src'),{recursive:true});
  fs.mkdirSync(path.join(runtime,'scripts'));for(const file of ['backup-database.mjs','legacy-backup-backend.mjs']) fs.copyFileSync(path.join(root,'scripts',file),path.join(runtime,'scripts',file));
  fs.copyFileSync(path.join(root,'package.json'),path.join(runtime,'package.json'));
  fs.symlinkSync(path.join(root,'node_modules'),path.join(runtime,'node_modules'),process.platform==='win32'?'junction':'dir');
  const env={};for(const name of ['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','LANG'])if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{NODE_ENV:'test',SEED_DEMO_DATA:'false',DATABASE_URL:url(f.filename),BACKUP_ENCRYPTION_KEY:f.key});
  for(const suffix of ['','-wal','-shm','-journal']) {
    const result=spawnSync(process.execPath,['scripts/backup-database.mjs','--output',f.filename+suffix],{cwd:runtime,env,encoding:'utf8',timeout:15000});
    assert.ifError(result.error);assert.equal(result.status,1);
    assert.ok(result.stderr.includes('BACKUP_OUTPUT_IS_SOURCE_DATABASE'),'CLI must explicitly refuse a source/sidecar output');
    assert.ok(!(result.stdout+result.stderr).includes(f.key),'key values are never output');
  }
  assert.equal((await f.client.execute('SELECT amount FROM orders WHERE id=1')).rows[0].amount,1250);
});
