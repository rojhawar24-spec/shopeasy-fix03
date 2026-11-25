import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {writeCompressedBackup,restoreCompressedBackup} from '../src/services/database-backup.js';

const privateDirectory=()=>fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-restore-safety-'));
const schemaCount=async client=>Number((await client.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*'")).rows[0].n);
const ownedMedia='abcdefabcdefabcdefabcdefabcdefab.png';
const media=Buffer.from([137,80,78,71,13,10,26,10,0,255,1]);
async function sourceFixture(directory) {
  const source=createClient({url:pathToFileURL(path.join(directory,'source.db')).href});
  await source.executeMultiple(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL);
    CREATE TABLE products(id INTEGER PRIMARY KEY,stock INTEGER NOT NULL,price_cents INTEGER NOT NULL);
    CREATE TABLE orders(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),total_cents INTEGER NOT NULL);
    CREATE TABLE gift_cards(id INTEGER PRIMARY KEY,remaining_cents INTEGER NOT NULL);
    CREATE TABLE gift_card_transactions(id INTEGER PRIMARY KEY,card_id INTEGER REFERENCES gift_cards(id),order_id INTEGER REFERENCES orders(id),amount_cents INTEGER NOT NULL);
    CREATE TABLE uploaded_assets(path TEXT PRIMARY KEY,data BLOB NOT NULL);
    CREATE INDEX idx_order_owner ON orders(user_id);
    CREATE TRIGGER prevent_negative_balance BEFORE UPDATE ON gift_cards WHEN NEW.remaining_cents<0 BEGIN SELECT RAISE(ABORT,'negative balance'); END;
    INSERT INTO users VALUES(1,'synthetic@example.test');
    INSERT INTO products VALUES(1,7,1999);
    INSERT INTO orders VALUES(1,1,3998);
    INSERT INTO gift_cards VALUES(1,6002);
    INSERT INTO gift_card_transactions VALUES(1,1,1,-3998);
  `);
  await source.execute({sql:'INSERT INTO uploaded_assets VALUES(?,?)',args:['/uploads/'+ownedMedia,new Uint8Array(media)]});
  const uploads=path.join(directory,'source-media');fs.mkdirSync(uploads);fs.writeFileSync(path.join(uploads,ownedMedia),media);
  const inputPath=path.join(directory,'backup.enc');const encryptionKey=crypto.randomBytes(32).toString('base64');
  await writeCompressedBackup(source,{outputPath:inputPath,uploadsDir:uploads,encryptionKey});
  return {source,inputPath,encryptionKey};
}
function faulty(client,operation) {
  return {
    execute:client.execute.bind(client),
    async transaction(mode) {
      const transaction=await client.transaction(mode);
      return {
        async execute(query) {
          const sql=typeof query==='string'?query:query.sql;
          if(operation==='fk'&&sql==='PRAGMA foreign_key_check')throw Error('INJECTED_FK_CHECK_FAILURE');
          if(operation==='integrity'&&sql==='PRAGMA integrity_check')throw Error('INJECTED_INTEGRITY_CHECK_FAILURE');
          if(operation==='empty-integrity'&&sql==='PRAGMA integrity_check')return {rows:[]};
          if(operation==='bad-integrity'&&sql==='PRAGMA integrity_check')return {rows:[{integrity_check:'not ok'}]};
          if(operation==='ddl'&&sql.startsWith('CREATE TABLE orders'))throw Error('INJECTED_DDL_FAILURE');
          return transaction.execute(query);
        },
        batch:transaction.batch.bind(transaction),
        async commit(){if(operation==='commit')throw Error('INJECTED_PRECOMMIT_FAILURE');return transaction.commit();},
        rollback:transaction.rollback.bind(transaction),
        close:transaction.close.bind(transaction)
      };
    }
  };
}

test('real libSQL restore preserves financial rows/BLOB/media and rolls back handled pre-commit failures',async t=>{
  const directory=privateDirectory();let fixture;
  t.after(()=>{fixture?.source.close();fs.rmSync(directory,{recursive:true,force:true});});
  fixture=await sourceFixture(directory);
  await t.test('successful restore compares every table and schema object',async()=>{
    const target=createClient({url:pathToFileURL(path.join(directory,'successful.db')).href});
    try {
      const output=path.join(directory,'restored-media');
      const result=await restoreCompressedBackup(target,{...fixture,uploadsDir:output,confirmRestore:true});
      assert.equal(result.restoredRows,6);assert.equal(result.restoredFiles,1);assert.equal(result.restoredTables,6);
      for(const table of ['users','products','orders','gift_cards','gift_card_transactions']) {
        const read=async client=>JSON.stringify((await client.execute(`SELECT * FROM ${table} ORDER BY id`)).rows.map(row=>({...row})));
        assert.equal(await read(target),await read(fixture.source),table);
      }
      assert.deepEqual(Buffer.from((await target.execute('SELECT data FROM uploaded_assets')).rows[0].data),media);
      assert.deepEqual(fs.readFileSync(path.join(output,ownedMedia)),media);
      const schema=async client=>(await client.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' ORDER BY type,name")).rows.map(row=>({...row}));
      assert.deepEqual(await schema(target),await schema(fixture.source));
      assert.equal((await target.execute('PRAGMA foreign_key_check')).rows.length,0);
      assert.deepEqual((await target.execute('PRAGMA integrity_check')).rows.map(row=>({...row})),[{integrity_check:'ok'}]);
      assert.ok(!fs.readdirSync(directory).some(name=>name.startsWith('restored-media.restore-tmp-')));
    } finally {target.close();}
  });
  for(const operation of ['ddl','fk','integrity','empty-integrity','bad-integrity','commit']) await t.test(operation+' refusal rolls back DB and owned media',async()=>{
    const target=createClient({url:pathToFileURL(path.join(directory,operation+'.db')).href});
    const output=path.join(directory,operation+'-media');
    try {
      await assert.rejects(restoreCompressedBackup(faulty(target,operation),{...fixture,uploadsDir:output,confirmRestore:true}));
      assert.equal(await schemaCount(target),0,'a handled failure must not commit even table definitions');
      assert.equal(fs.existsSync(output),false,'owned publication must be undone after failed commit');
      assert.ok(!fs.readdirSync(directory).some(name=>name.startsWith(operation+'-media.restore-tmp-')));
    } finally {target.close();}
  });
  await t.test('occupied media refuses before transaction and preserves existing sentinel',async()=>{
    const target=createClient({url:pathToFileURL(path.join(directory,'occupied.db')).href});
    const output=path.join(directory,'occupied-media');fs.mkdirSync(output);fs.writeFileSync(path.join(output,'sentinel'),'existing data');
    try {
      await assert.rejects(restoreCompressedBackup(target,{...fixture,uploadsDir:output,confirmRestore:true}),/RESTORE_UPLOADS_DIR_NOT_EMPTY/);
      assert.equal(await schemaCount(target),0);assert.equal(fs.readFileSync(path.join(output,'sentinel'),'utf8'),'existing data');
    } finally {target.close();}
  });
  await t.test('wrong encryption key leaves no committed schema or media',async()=>{
    const target=createClient({url:pathToFileURL(path.join(directory,'wrong-key.db')).href});
    const output=path.join(directory,'wrong-key-media');
    try {
      await assert.rejects(restoreCompressedBackup(target,{...fixture,encryptionKey:crypto.randomBytes(32).toString('base64'),uploadsDir:output,confirmRestore:true}));
      assert.equal(await schemaCount(target),0);assert.equal(fs.existsSync(output),false);
    } finally {target.close();}
  });
  await t.test('nonempty database refuses without changing existing rows',async()=>{
    const target=createClient({url:pathToFileURL(path.join(directory,'nonempty.db')).href});
    await target.execute('CREATE TABLE sentinel(value TEXT)');await target.execute("INSERT INTO sentinel VALUES('keep')");
    try {
      await assert.rejects(restoreCompressedBackup(target,{...fixture,confirmRestore:true}),/RESTORE_TARGET_NOT_EMPTY/);
      assert.equal((await target.execute('SELECT value FROM sentinel')).rows[0].value,'keep');assert.equal(await schemaCount(target),1);
    } finally {target.close();}
  });
});

test('backup metadata failures refuse publication and composite WITHOUT ROWID keys round-trip',async t=>{
  const directory=privateDirectory();const fixture=await sourceFixture(directory);
  t.after(()=>{fixture.source.close();fs.rmSync(directory,{recursive:true,force:true});});
  const outputPath=path.join(directory,'extension.enc');
  const broken={async execute(query){if(String(typeof query==='string'?query:query.sql).startsWith('PRAGMA foreign_key_list'))throw Error('INJECTED_SCHEMA_METADATA_FAILURE');return fixture.source.execute(query);}};
  await assert.rejects(writeCompressedBackup(broken,{outputPath,uploadsDir:'',encryptionKey:fixture.encryptionKey}),/INJECTED_SCHEMA_METADATA_FAILURE/);
  assert.equal(fs.existsSync(outputPath),false);
  await fixture.source.executeMultiple("CREATE TABLE external_extension(zone TEXT,code TEXT,value TEXT,PRIMARY KEY(zone,code)) WITHOUT ROWID; INSERT INTO external_extension VALUES('b','1','third'),('a','2','second'),('a','1','first');");
  await writeCompressedBackup(fixture.source,{outputPath,uploadsDir:'',encryptionKey:fixture.encryptionKey,batchSize:1});
  const target=createClient({url:pathToFileURL(path.join(directory,'extension-target.db')).href});
  try {
    await restoreCompressedBackup(target,{inputPath:outputPath,encryptionKey:fixture.encryptionKey,confirmRestore:true});
    assert.deepEqual((await target.execute('SELECT * FROM external_extension ORDER BY zone,code')).rows.map(row=>({...row})),[{zone:'a',code:'1',value:'first'},{zone:'a',code:'2',value:'second'},{zone:'b',code:'1',value:'third'}]);
    assert.equal(await schemaCount(target),7);
  } finally {target.close();}
});
