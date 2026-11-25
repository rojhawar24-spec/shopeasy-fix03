import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';
import { encodeBackupRow, decodeBackupRow, writeCompressedBackup, restoreCompressedBackup, sha256File } from '../src/services/database-backup.js';

test('encrypted backups round-trip ArrayBuffer BLOBs from the installed libSQL SQLite driver',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-backup-libsql-'));
  const source=createClient({url:pathToFileURL(path.join(directory,'source.db')).href});
  const target=createClient({url:pathToFileURL(path.join(directory,'target.db')).href});
  t.after(()=>{source.close();target.close();fs.rmSync(directory,{recursive:true,force:true});});
  await source.executeMultiple(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL);
    CREATE TABLE products(id INTEGER PRIMARY KEY,stock INTEGER NOT NULL,price_cents INTEGER NOT NULL);
    CREATE TABLE orders(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),total_cents INTEGER NOT NULL);
    CREATE TABLE uploaded_assets(path TEXT PRIMARY KEY,content_type TEXT NOT NULL,data BLOB NOT NULL);
    INSERT INTO users VALUES(1,'synthetic@example.test');
    INSERT INTO products VALUES(1,7,1999);
    INSERT INTO orders VALUES(1,1,3998);
  `);
  const bytes=Buffer.from([0,255,128,1,0,254,13,10]);
  await source.execute({sql:'INSERT INTO uploaded_assets VALUES(?,?,?)',args:['/uploads/0123456789abcdef0123456789abcdef.png','image/png',new Uint8Array(bytes)]});
  const driverBlob=(await source.execute('SELECT data FROM uploaded_assets')).rows[0].data;
  assert.ok(driverBlob instanceof ArrayBuffer,'exercise the actual driver BLOB representation');
  assert.deepEqual(Buffer.from(driverBlob),bytes);
  const outputPath=path.join(directory,'backup.jsonl.gz.enc');
  const encryptionKey=randomBytes(32).toString('base64');
  const backup=await writeCompressedBackup(source,{outputPath,uploadsDir:'',encryptionKey});
  assert.equal(fs.readFileSync(outputPath).subarray(0,8).toString(),'SHEBKP01');
  assert.equal(await sha256File(outputPath),backup.sha256);
  const restored=await restoreCompressedBackup(target,{inputPath:outputPath,confirmRestore:true,encryptionKey});
  assert.equal(restored.restoredRows,4);
  const restoredBlob=(await target.execute('SELECT data FROM uploaded_assets')).rows[0].data;
  assert.ok(restoredBlob instanceof ArrayBuffer);
  assert.deepEqual(Buffer.from(restoredBlob),bytes);
  assert.deepEqual({...((await target.execute('SELECT stock,price_cents FROM products')).rows[0])},{stock:7,price_cents:1999});
  assert.equal((await target.execute('SELECT total_cents FROM orders')).rows[0].total_cents,3998);
  assert.equal((await target.execute('PRAGMA foreign_key_check')).rows.length,0);
});

test('backup codecs preserve byte offsets and lengths of binary views',()=>{
  const backing=new Uint8Array([17,0,255,128,34,35]);
  const values={arrayBuffer:backing.buffer,typed:backing.subarray(1,4),dataView:new DataView(backing.buffer,1,3),buffer:Buffer.from(backing.buffer,1,3),empty:new Uint8Array(backing.buffer,2,0)};
  const decoded=decodeBackupRow(JSON.parse(JSON.stringify(encodeBackupRow(values))));
  assert.deepEqual(Buffer.from(decoded.arrayBuffer),Buffer.from(backing));
  for(const name of ['typed','dataView','buffer'])assert.deepEqual(Buffer.from(decoded[name]),Buffer.from([0,255,128]),name);
  assert.equal(decoded.empty.byteLength,0);
});

test('backup codecs reject unsupported object values before serialization can discard them',()=>{
  for(const value of [{}, {nested:'value'},new Map([['key','value']]),new Set([1])]){
    assert.throws(()=>encodeBackupRow({value}),/BACKUP_UNSUPPORTED_VALUE_TYPE/);
  }
});
