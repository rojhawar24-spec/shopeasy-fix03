import fs from 'node:fs';
import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip, createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Transform } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BACKUP_FORMAT = 'shopeasy-logical-backup';
export const BACKUP_FORMAT_VERSION = 1;
const ENCRYPTED_MAGIC = Buffer.from('SHEBKP01');
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const safeUploadName = name => /^[a-f0-9]{32}\.(?:png|jpg|webp)$/i.test(String(name || ''));

export function quoteSqlIdentifier(value) {
  const text=String(value||'');
  if(!text || text.includes('\0')) throw new Error('BACKUP_INVALID_IDENTIFIER');
  return `"${text.replace(/"/g,'""')}"`;
}
function encodeValue(value) {
  if(value instanceof ArrayBuffer) return {__shopeasy_blob_v1__:Buffer.from(value).toString('base64')};
  if(ArrayBuffer.isView(value)) return {__shopeasy_blob_v1__:Buffer.from(value.buffer,value.byteOffset,value.byteLength).toString('base64')};
  if(value && typeof value==='object' && typeof value.toJSON==='function') return encodeValue(value.toJSON());
  if(typeof value==='bigint') return {__shopeasy_bigint_v1__:String(value)};
  if(value && typeof value==='object') throw new Error('BACKUP_UNSUPPORTED_VALUE_TYPE');
  return value;
}
function decodeValue(value) {
  if(value && typeof value==='object' && typeof value.__shopeasy_blob_v1__==='string' && Object.keys(value).length===1) return new Uint8Array(Buffer.from(value.__shopeasy_blob_v1__,'base64'));
  if(value && typeof value==='object' && typeof value.__shopeasy_bigint_v1__==='string' && Object.keys(value).length===1) return BigInt(value.__shopeasy_bigint_v1__);
  return value;
}
export const encodeBackupRow = row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,encodeValue(value)]));
export const decodeBackupRow = row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,decodeValue(value)]));

async function rows(client,sql,args=[]) {
  const result=await client.execute({sql,args});
  return result.rows.map(row=>({...row}));
}
async function backupSchema(client) {
  const items=await rows(client,`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT GLOB 'sqlite_*' AND type IN ('table','index','trigger','view') ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'trigger' THEN 2 ELSE 3 END,name`);
  for(const item of items.filter(entry=>entry.type==='table')) {
    if(!/^CREATE\s+TABLE\b/i.test(String(item.sql||'').trim())) throw new Error('BACKUP_UNSUPPORTED_TABLE_DDL');
    item.foreignKeys=await rows(client,`PRAGMA foreign_key_list(${quoteSqlIdentifier(item.name)})`);
    const columns=await rows(client,`PRAGMA table_info(${quoteSqlIdentifier(item.name)})`);
    if(!columns.length) throw new Error('BACKUP_TABLE_INFO_UNAVAILABLE');
    item.primaryKeyColumns=columns.filter(column=>Number(column.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(column=>String(column.name));
  }
  return items;
}
function tableInsertOrder(tables) {
  const names=new Set(tables.map(table=>table.name));
  const dependencies=new Map(tables.map(table=>[table.name,new Set((table.foreignKeys||[]).map(fk=>String(fk.table||'')).filter(name=>names.has(name)&&name!==table.name))]));
  const sorted=[];
  while(dependencies.size) {
    const ready=[...dependencies.entries()].filter(([,deps])=>[...deps].every(name=>!dependencies.has(name))).map(([name])=>name).sort();
    if(!ready.length) throw new Error(`BACKUP_FOREIGN_KEY_CYCLE:${[...dependencies.keys()].slice(0,8).join(',')}`);
    for(const name of ready){sorted.push(name);dependencies.delete(name);}
  }
  return sorted;
}
function quoteRowColumns(row) { return Object.keys(row).map(quoteSqlIdentifier).join(','); }

export async function* generateBackupRecords(client,{uploadsDir=path.join(root,'public','uploads'),maxBytes=512*1024*1024,batchSize=200}={}) {
  const schema=await backupSchema(client);
  const tables=schema.filter(item=>item.type==='table');
  if(!tables.some(item=>item.name==='orders')||!tables.some(item=>item.name==='products')) throw new Error('BACKUP_SCHEMA_INCOMPLETE');
  const order=tableInsertOrder(tables);
  let serializedBytes=0, rowCount=0, fileCount=0;
  // Check references from the exact exported snapshot, not from the current
  // live database. A missing asset must fail before the backup is published.
  const referencedUploads=new Set(), archivedUploads=new Set();
  const imageTables=new Set(['products','product_images','product_variants','stories','categories']);
  const uploadName=value=>typeof value==='string'&&value.startsWith('/uploads/')&&safeUploadName(value.slice(9))?value.slice(9):null;
  const rememberReference=value=>{
    if(typeof value!=='string'||!value.startsWith('/uploads/'))return;
    const name=uploadName(value);
    if(!name)throw new Error('BACKUP_INVALID_UPLOAD_REFERENCE');
    referencedUploads.add(name);
  };
  const emit=record=>{
    const line=JSON.stringify(record)+'\n';
    serializedBytes+=Buffer.byteLength(line);
    if(serializedBytes>maxBytes) throw new Error(`BACKUP_MAX_BYTES_EXCEEDED:${maxBytes}`);
    return line;
  };
  yield emit({kind:'header',format:BACKUP_FORMAT,formatVersion:BACKUP_FORMAT_VERSION,appVersion:APP_VERSION,createdAt:new Date().toISOString(),containsDatabaseBlobs:tables.some(item=>item.name==='uploaded_assets'),containsFilesystemUploads:true});
  for(const item of schema) yield emit({kind:'schema',...item});
  for(const name of order) {
    const table=quoteSqlIdentifier(name);
    const keyColumns=tables.find(item=>item.name===name).primaryKeyColumns;
    const orderBy=keyColumns.length?keyColumns.map(quoteSqlIdentifier).join(','):'rowid';
    let offset=0;
    while(true) {
      const pageSize=Math.max(1,Math.min(200,Math.floor(batchSize)||200));
      const batch=await rows(client,`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT ${pageSize} OFFSET ${offset}`);
      if(!batch.length) break;
      for(const row of batch){
        if(imageTables.has(name))rememberReference(row.image_url);
        if(name==='settings'&&['hero_image','appearance_logo'].includes(row.key))rememberReference(row.value);
        if(name==='uploaded_assets'){
          const asset=uploadName(row.path);
          if(asset&&(row.data instanceof ArrayBuffer||ArrayBuffer.isView(row.data))&&row.data.byteLength>0&&['image/jpeg','image/png','image/webp'].includes(row.content_type))archivedUploads.add(asset);
        }
        yield emit({kind:'row',table:name,row:encodeBackupRow(row)});rowCount++;
      }
      offset+=batch.length;
      if(batch.length<pageSize) break;
    }
  }
  if((await rows(client,"SELECT 1 FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'")).length) {
    const sequences=await rows(client,'SELECT name,seq FROM sqlite_sequence');
    if(sequences.length) yield emit({kind:'sequences',rows:sequences});
  }
  if(uploadsDir && fs.existsSync(uploadsDir)) {
    for(const entry of fs.readdirSync(uploadsDir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(!entry.isFile()||!safeUploadName(entry.name)) continue;
      const absolute=path.join(uploadsDir,entry.name);
      const data=fs.readFileSync(absolute);
      if(data.length>2*1024*1024) throw new Error(`BACKUP_UPLOAD_TOO_LARGE:${entry.name}`);
      yield emit({kind:'file',path:`uploads/${entry.name}`,dataBase64:data.toString('base64'),bytes:data.length});
      archivedUploads.add(entry.name);
      fileCount++;
    }
  }
  for(const name of referencedUploads)if(!archivedUploads.has(name))throw new Error(`BACKUP_REFERENCED_UPLOAD_MISSING:${name}`);
  yield emit({kind:'end',rowCount,fileCount,tableCount:tables.length,serializedBytes});
}

export function parseBackupEncryptionKey(value) {
  const text=String(value||'').trim();
  if(/^[a-f0-9]{64}$/i.test(text)) return Buffer.from(text,'hex');
  const key=Buffer.from(text,'base64');
  if(key.length!==32 || key.toString('base64').replace(/=+$/,'')!==text.replace(/=+$/,'')) throw new Error('BACKUP_ENCRYPTION_KEY_REQUIRED: set BACKUP_ENCRYPTION_KEY to a random 32-byte key encoded as base64 or 64 hex characters');
  return key;
}

function sameExistingInode(left,right) {
  try {const a=fs.statSync(left),b=fs.statSync(right);return a.dev===b.dev&&a.ino===b.ino;}catch{return false;}
}
function inspectBackupDestination(filename,{sidecar=false}={}) {
  let info;
  try {info=fs.lstatSync(filename);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw new Error('BACKUP_DESTINATION_NOT_REGULAR_FILE');
  const descriptor=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
  try {
    const size=sidecar?512:ENCRYPTED_MAGIC.length,bytes=Buffer.alloc(size);
    const count=fs.readSync(descriptor,bytes,0,size,0);
    const valid=sidecar?/^[a-f0-9]{64}\s+[^\r\n]+\r?\n?$/i.test(bytes.subarray(0,count).toString('utf8')):count===ENCRYPTED_MAGIC.length&&bytes.equals(ENCRYPTED_MAGIC);
    if(!valid)throw new Error('BACKUP_DESTINATION_NOT_BACKUP: existing unrelated files are never replaced');
  } finally {fs.closeSync(descriptor);}
}
export function assertSafeBackupOutput(outputPath) {
  const finalPath=path.resolve(outputPath),candidates=[finalPath,`${finalPath}.sha256`,`${finalPath}.lock`];
  const sourceUrls=[process.env.DATABASE_URL,process.env.SHOP_DATABASE_URL,process.env.TURSO_DATABASE_URL,fileUrlForPath(path.join(root,'data','shop.db'))].filter(Boolean);
  for(const sourceUrl of sourceUrls) {
    const filename=resolveFileUrl(sourceUrl);if(!filename)continue;
    for(const sourcePath of [filename,`${filename}-wal`,`${filename}-shm`,`${filename}-journal`]) {
      if(candidates.some(candidate=>sameDatabaseTarget(fileUrlForPath(candidate),fileUrlForPath(sourcePath))||sameExistingInode(candidate,sourcePath)))throw new Error('BACKUP_OUTPUT_IS_SOURCE_DATABASE: choose a separate backup filename');
    }
  }
  inspectBackupDestination(finalPath);inspectBackupDestination(`${finalPath}.sha256`,{sidecar:true});
}

export async function writeCompressedBackup(client,{outputPath,uploadsDir=path.join(root,'public','uploads'),maxBytes=512*1024*1024,batchSize=200,encryptionKey=process.env.BACKUP_ENCRYPTION_KEY}={}) {
  if(!outputPath) throw new Error('BACKUP_OUTPUT_REQUIRED');
  const key=parseBackupEncryptionKey(encryptionKey);
  const finalPath=path.resolve(outputPath), directory=path.dirname(finalPath), finalSidecar=`${finalPath}.sha256`;
  assertSafeBackupOutput(finalPath);
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const lockPath=`${finalPath}.lock`;
  let lock;
  try {lock=fs.openSync(lockPath,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw new Error('BACKUP_DESTINATION_BUSY: another writer or a stale backup lock exists');throw error;}
  const lockIdentity=fs.fstatSync(lock);
  const nonce=randomBytes(GCM_NONCE_BYTES);
  const stamp=`${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const temporary=`${finalPath}.tmp-${stamp}`, temporarySidecar=`${temporary}.sha256`;
  const previous=`${finalPath}.previous-${stamp}`, previousSidecar=`${finalSidecar}.previous-${stamp}`;
  const old={data:false,sidecar:false}, published={data:false,sidecar:false};
  const output=createWriteStream(temporary,{flags:'wx',mode:0o600});
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  let prefixWritten=false,result;
  const envelope=new Transform({
    transform(chunk,_encoding,callback){if(!prefixWritten){this.push(Buffer.concat([ENCRYPTED_MAGIC,nonce]));prefixWritten=true;}callback(null,chunk);},
    flush(callback){try{if(!prefixWritten)this.push(Buffer.concat([ENCRYPTED_MAGIC,nonce]));this.push(cipher.getAuthTag());callback();}catch(error){callback(error);}}
  });
  try {
    await pipeline(Readable.from(generateBackupRecords(client,{uploadsDir,maxBytes,batchSize})),createGzip({level:6}),cipher,envelope,output);
    const digest=await sha256File(temporary);
    await fs.promises.writeFile(temporarySidecar,`${digest}  ${path.basename(finalPath)}\n`,{flag:'wx',mode:0o600});
    assertSafeBackupOutput(finalPath);
    // Keep the previously known-good backup and checksum recoverable until both new files are published.
    if(fs.existsSync(finalPath)){await fs.promises.rename(finalPath,previous);old.data=true;}
    if(fs.existsSync(finalSidecar)){await fs.promises.rename(finalSidecar,previousSidecar);old.sidecar=true;}
    await fs.promises.rename(temporary,finalPath);published.data=true;
    await fs.promises.rename(temporarySidecar,finalSidecar);published.sidecar=true;
    if(old.data)await fs.promises.unlink(previous).catch(()=>{});
    if(old.sidecar)await fs.promises.unlink(previousSidecar).catch(()=>{});
    result={path:finalPath,sha256:digest,sizeBytes:fs.statSync(finalPath).size,encrypted:true,lockCleanupFailed:false};
    return result;
  } catch(error) {
    try{if(!output.closed)output.destroy();}catch{}
    try{fs.unlinkSync(temporary);}catch{}
    try{fs.unlinkSync(temporarySidecar);}catch{}
    // Roll back a partially published pair; never discard the last complete backup on an error.
    if(published.data)try{fs.unlinkSync(finalPath);}catch{}
    if(published.sidecar)try{fs.unlinkSync(finalSidecar);}catch{}
    if(old.data&&fs.existsSync(previous))try{fs.renameSync(previous,finalPath);}catch{}
    if(old.sidecar&&fs.existsSync(previousSidecar))try{fs.renameSync(previousSidecar,finalSidecar);}catch{}
    throw error;
  } finally {
    try {
      fs.closeSync(lock);
      const current=fs.lstatSync(lockPath);
      if(current.dev!==lockIdentity.dev||current.ino!==lockIdentity.ino)throw Error('BACKUP_LOCK_IDENTITY_CHANGED');
      fs.unlinkSync(lockPath);
    }catch{if(result)result.lockCleanupFailed=true;}
  }
}

export async function sha256File(filename) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function createBackupDecryptTransform(encryptionKey) {
  const key=parseBackupEncryptionKey(encryptionKey);
  let prefix=Buffer.alloc(0), tail=Buffer.alloc(0), decipher=null, headerRead=false;
  return new Transform({
    transform(chunk,_encoding,callback){
      try {
        let data=Buffer.concat([tail,Buffer.from(chunk)]);tail=Buffer.alloc(0);
        if(!headerRead){
          prefix=Buffer.concat([prefix,data]);
          if(prefix.length<ENCRYPTED_MAGIC.length+GCM_NONCE_BYTES){callback();return;}
          if(!prefix.subarray(0,ENCRYPTED_MAGIC.length).equals(ENCRYPTED_MAGIC))throw new Error('BACKUP_ENCRYPTED_HEADER_INVALID');
          const nonce=prefix.subarray(ENCRYPTED_MAGIC.length,ENCRYPTED_MAGIC.length+GCM_NONCE_BYTES);
          decipher=createDecipheriv('aes-256-gcm',key,nonce);data=prefix.subarray(ENCRYPTED_MAGIC.length+GCM_NONCE_BYTES);prefix=Buffer.alloc(0);headerRead=true;
        }
        if(data.length<=GCM_TAG_BYTES){tail=data;callback();return;}
        const ready=data.subarray(0,data.length-GCM_TAG_BYTES);tail=data.subarray(data.length-GCM_TAG_BYTES);
        const decoded=decipher.update(ready);if(decoded.length)this.push(decoded);callback();
      } catch(error){callback(error);}
    },
    flush(callback){
      try {
        if(!headerRead||!decipher||tail.length!==GCM_TAG_BYTES)throw new Error('BACKUP_ENCRYPTED_TRUNCATED');
        decipher.setAuthTag(tail);const final=decipher.final();if(final.length)this.push(final);callback();
      } catch(error){callback(new Error(`BACKUP_DECRYPT_FAILED: ${error?.message||'authentication-error'}`));}
    }
  });
}

async function* backupLines(filename,{encryptionKey=process.env.BACKUP_ENCRYPTION_KEY}={}) {
  const decrypt=createBackupDecryptTransform(encryptionKey);
  const gunzip=createGunzip();
  const input=createReadStream(filename);
  let streamFailure=null;
  const streamPromise=pipeline(input,decrypt,gunzip);
  // Attach a rejection handler immediately: Transform authentication failures
  // must become a controlled restore error, never an unhandled stream error.
  streamPromise.catch(error=>{streamFailure=error;});
  const lineReader=createInterface({input:gunzip,crlfDelay:Infinity});
  try {
    for await(const line of lineReader) {if(line.trim()) yield JSON.parse(line);}
    await streamPromise;
  } catch(error) {
    lineReader.close();input.destroy();decrypt.destroy();gunzip.destroy();
    await streamPromise.catch(()=>{});
    const cause=streamFailure||error;
    const message=String(cause?.message||'parse-error');
    if(message.startsWith('BACKUP_DECRYPT_FAILED')||message.startsWith('BACKUP_ENCRYPTED_')) throw new Error(message);
    throw new Error(`BACKUP_INVALID_OR_TRUNCATED:${message}`);
  } finally {
    lineReader.close();input.destroy();decrypt.destroy();gunzip.destroy();
    await streamPromise.catch(()=>{});
  }
}

async function execute(client,sql,args=[]) { return client.execute({sql,args}); }
function getUploadTempDirectory(targetDir) {
  const destination=path.resolve(targetDir);
  fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
  return {destination,temp:fs.mkdtempSync(`${destination}.restore-tmp-`),published:[],createdDestination:false};
}
async function assertTargetEmpty(client) {
  const result=await rows(client,"SELECT name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' AND type IN ('table','index','trigger','view') LIMIT 1");
  if(result.length) throw new Error('RESTORE_TARGET_NOT_EMPTY: create a new empty database; restore never overwrites existing customer data');
}

function assertUploadsEmpty(targetDir) {
  const destination=path.resolve(targetDir);
  let current=destination;
  while(true) {
    let info;
    try {info=fs.lstatSync(current);} catch(error) {if(error.code!=='ENOENT')throw error;}
    if(info?.isSymbolicLink()) throw new Error('RESTORE_UPLOADS_LINK_NOT_ALLOWED');
    if(info&&!info.isDirectory()) throw new Error('RESTORE_UPLOADS_DIR_REQUIRED');
    const parent=path.dirname(current);if(parent===current)break;current=parent;
  }
  if(fs.existsSync(destination)&&fs.readdirSync(destination).length) throw new Error('RESTORE_UPLOADS_DIR_NOT_EMPTY');
}

async function discardRestoreUploads(setup) {
  let failed=false;
  for(const entry of [...setup.published].reverse()) {
    try {
      const info=fs.lstatSync(entry.path);
      if(info.dev!==entry.dev||info.ino!==entry.ino){failed=true;continue;}
      await fs.promises.unlink(entry.path);
    } catch(error) {if(error.code!=='ENOENT')failed=true;}
  }
  if(setup.createdDestination) {
    try {await fs.promises.rmdir(setup.destination);}catch(error){if(error.code!=='ENOENT')failed=true;}
  }
  try {await fs.promises.rm(setup.temp,{recursive:true,force:true});}catch{failed=true;}
  if(failed) throw new Error('RESTORE_UPLOAD_CLEANUP_FAILED');
}

export async function restoreCompressedBackup(client,{inputPath,uploadsDir='',confirmRestore=false,encryptionKey=process.env.BACKUP_ENCRYPTION_KEY}={}) {
  if(!confirmRestore) throw new Error('RESTORE_REQUIRES_CONFIRMATION: pass --confirm-restore after checking the target database URL');
  if(!inputPath||!fs.existsSync(inputPath)) throw new Error('RESTORE_BACKUP_NOT_FOUND');
  await assertTargetEmpty(client);
  // Reject occupied or redirected media targets before any schema is created.
  if(uploadsDir)assertUploadsEmpty(uploadsDir);
  if(typeof client.transaction!=='function')throw new Error('RESTORE_TRANSACTION_REQUIRED');
  const iterator=backupLines(path.resolve(inputPath),{encryptionKey});
  let transaction=null,uploadSetup=null,committed=false;
  try {
  const first=await iterator.next();
  const header=first.value;
  if(first.done||header?.kind!=='header'||header.format!==BACKUP_FORMAT||header.formatVersion!==BACKUP_FORMAT_VERSION) throw new Error('RESTORE_UNSUPPORTED_BACKUP_FORMAT');
  const schema=[]; let pending=null;
  while(true){const item=await iterator.next();if(item.done)throw new Error('RESTORE_BACKUP_TRUNCATED');if(item.value.kind!=='schema'){pending=item.value;break;}schema.push(item.value);}
  const tables=schema.filter(item=>item.type==='table');
  if(!tables.some(item=>item.name==='orders')||!tables.some(item=>item.name==='products')) throw new Error('RESTORE_SCHEMA_INCOMPLETE');
  const indexesAndTriggers=schema.filter(item=>['index','trigger','view'].includes(item.type));
  tableInsertOrder(tables);
  transaction=await client.transaction('write');
  // Recheck under the write transaction; a concurrent creator must not turn an
  // initially empty destination into an overwrite target between the checks.
  await assertTargetEmpty(transaction);
  await execute(transaction,'PRAGMA defer_foreign_keys=ON');
  const createdTables=[];
  for(const table of tables) {
    if(typeof table.sql!=='string'||!table.sql.trim().toUpperCase().startsWith('CREATE TABLE')) throw new Error(`RESTORE_INVALID_TABLE_DDL:${table.name}`);
    await execute(transaction,table.sql); createdTables.push(table.name);
  }
  const maxBatch=50; let pendingRows=new Map(),restoredRows=0,restoredFiles=0,expectedFooter=null,sequenceRecords=[];
  const getUploadTemp=()=>{
    if(!uploadsDir) throw new Error('RESTORE_UPLOADS_DIR_REQUIRED: backup includes filesystem images; set RESTORE_UPLOADS_DIR to an empty target directory');
    if(!uploadSetup){assertUploadsEmpty(uploadsDir);uploadSetup=getUploadTempDirectory(uploadsDir);}
    return uploadSetup;
  };
  const flushTable=async(tableName)=>{
    const group=pendingRows.get(tableName);if(!group?.length)return;
    const statements=group.map(row=>{
      const decoded=decodeBackupRow(row),columns=Object.keys(decoded);
      if(!columns.length)throw new Error('RESTORE_EMPTY_ROW');
      const sql=`INSERT INTO ${quoteSqlIdentifier(tableName)} (${columns.map(quoteSqlIdentifier).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`;
      return {sql,args:columns.map(key=>decoded[key]===undefined?null:decoded[key])};
    });
    await transaction.batch(statements);restoredRows+=group.length;pendingRows.set(tableName,[]);
  };
  let currentTable=null;
  const processRecord=async(record)=>{
    if(expectedFooter)throw new Error('RESTORE_RECORD_AFTER_END');
    if(record.kind==='row') {
      if(!createdTables.includes(record.table))throw new Error(`RESTORE_UNKNOWN_TABLE:${record.table}`);
      if(currentTable&&currentTable!==record.table)await flushTable(currentTable);
      currentTable=record.table;
      if(!pendingRows.has(record.table))pendingRows.set(record.table,[]);
      pendingRows.get(record.table).push(record.row);
      if(pendingRows.get(record.table).length>=maxBatch)await flushTable(record.table);
    } else if(record.kind==='sequences') {
      if(!Array.isArray(record.rows))throw new Error('RESTORE_INVALID_SEQUENCES');
      sequenceRecords=record.rows;
    }
    else if(record.kind==='file') {
      const match=String(record.path||'').match(/^uploads\/([a-f0-9]{32}\.(?:png|jpg|webp))$/i);
      if(!match||!safeUploadName(match[1]))throw new Error('RESTORE_UNSAFE_UPLOAD_PATH');
      const encoded=String(record.dataBase64||''),data=Buffer.from(encoded,'base64');
      if(data.toString('base64')!==encoded||!Number.isSafeInteger(record.bytes)||data.length!==record.bytes||data.length>2*1024*1024)throw new Error('RESTORE_UPLOAD_SIZE_MISMATCH');
      const paths=getUploadTemp();
      await fs.promises.writeFile(path.join(paths.temp,match[1]),data,{flag:'wx',mode:0o600});
      restoredFiles++;
    } else if(record.kind==='end') expectedFooter=record;
    else throw new Error('RESTORE_UNKNOWN_RECORD');
  };
    if(pending)await processRecord(pending);
    for await(const record of iterator)await processRecord(record);
    if(currentTable)await flushTable(currentTable);
    if(!expectedFooter||Number(expectedFooter.rowCount)!==restoredRows)throw new Error('RESTORE_ROW_COUNT_MISMATCH');
    if(Number(expectedFooter.fileCount)!==restoredFiles||Number(expectedFooter.tableCount)!==tables.length)throw new Error('RESTORE_OBJECT_COUNT_MISMATCH');
    for(const sequence of sequenceRecords) {
      if(!createdTables.includes(sequence.name))throw new Error('RESTORE_SEQUENCE_UNKNOWN_TABLE');
      if(!Number.isSafeInteger(sequence.seq)||sequence.seq<0)throw new Error('RESTORE_INVALID_SEQUENCE');
      // sqlite_sequence has no UNIQUE(name) constraint; replace the specific
      // counter inside the same transaction without an error-driven fallback.
      await execute(transaction,'DELETE FROM sqlite_sequence WHERE name=?',[sequence.name]);
      await execute(transaction,'INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)',[sequence.name,sequence.seq]);
    }
    for(const item of indexesAndTriggers) {
      if(typeof item.sql!=='string'||!item.sql.trim())continue;
      await execute(transaction,item.sql);
    }
    const foreignKeyErrors=await rows(transaction,'PRAGMA foreign_key_check');
    if(foreignKeyErrors.length)throw new Error(`RESTORE_FOREIGN_KEY_CHECK_FAILED:${foreignKeyErrors.length}`);
    const integrity=await rows(transaction,'PRAGMA integrity_check');
    if(integrity.length!==1||Object.values(integrity[0]).length!==1||String(Object.values(integrity[0])[0]).toLowerCase()!=='ok')throw new Error('RESTORE_INTEGRITY_CHECK_FAILED');
    if(uploadSetup) {
      assertUploadsEmpty(uploadSetup.destination);
      if(!fs.existsSync(uploadSetup.destination)){await fs.promises.mkdir(uploadSetup.destination,{mode:0o700});uploadSetup.createdDestination=true;}
      for(const name of fs.readdirSync(uploadSetup.temp)) {
        const destination=path.join(uploadSetup.destination,name);
        // Same-filesystem exclusive hard links never replace an existing file;
        // the private stage owns the inode used for handled-error cleanup.
        await fs.promises.link(path.join(uploadSetup.temp,name),destination);
        const info=fs.lstatSync(destination);
        uploadSetup.published.push({path:destination,dev:info.dev,ino:info.ino});
      }
    }
    if(uploadSetup)await fs.promises.rm(uploadSetup.temp,{recursive:true,force:true});
    // Complete fallible media cleanup before committing the database. Owned
    // published links can still be removed if this cleanup or commit fails.
    await transaction.commit();committed=true;
    return {header,restoredRows,restoredTables:tables.length,restoredIndexesAndTriggers:indexesAndTriggers.length,restoredFiles};
  } catch(error) {
    let rollbackFailed=false;
    if(transaction&&!committed)try{await transaction.rollback();}catch{rollbackFailed=true;}
    if(uploadSetup&&!committed)try{await discardRestoreUploads(uploadSetup);}catch{rollbackFailed=true;}
    if(rollbackFailed)throw new Error('RESTORE_ROLLBACK_FAILED: discard the separate target and retry; cleanup could not be completed',{cause:error});
    throw error;
  } finally {
    await iterator.return?.();
    if(transaction&&!committed)transaction.close?.();
  }
}

export function resolveFileUrl(value) {
  const input=String(value||'').trim();
  // libSQL accepts relative file: URLs (for example file:./data/shop.db).
  // Normalize them against the process working directory so restore safety
  // checks compare the same physical path as the running application.
  if(/^file:(?:\.\.?\/|[^/])/i.test(input) && !/^file:\/\//i.test(input)) {
    return path.resolve(process.cwd(),input.slice(5));
  }
  try {const url=new URL(input);if(url.protocol!=='file:')return null;return fileURLToPath(url);}catch{return null;}
}
export function fileUrlForPath(value) { return pathToFileURL(path.resolve(value)).href; }

/**
 * Normalize database URL identity while ignoring credentials, query parameters,
 * fragments and trailing slash. These commonly vary without pointing at a
 * different remote database. This is a safety guard, not proof that two unknown
 * provider aliases cannot point to the same physical database.
 */
function canonicalLocalDatabasePath(value) {
  const absolute=path.resolve(value);
  // Resolve symlinks for an existing database file. For a not-yet-created
  // restore target, resolve the nearest existing parent so symlinked data
  // directories cannot disguise the live database path.
  try { return fs.realpathSync.native(absolute); } catch {}
  const suffix=[];
  let ancestor=absolute;
  while (!fs.existsSync(ancestor)) {
    const parent=path.dirname(ancestor);
    if(parent===ancestor) return absolute;
    suffix.unshift(path.basename(ancestor));
    ancestor=parent;
  }
  try { return path.join(fs.realpathSync.native(ancestor),...suffix); }
  catch { return absolute; }
}

export function databaseTargetIdentity(value) {
  const input=String(value||'').trim();
  if(!input) return null;
  const localPath=resolveFileUrl(input);
  if(localPath) {
    let normalized=canonicalLocalDatabasePath(localPath);
    if(process.platform==='win32') normalized=normalized.toLowerCase();
    return `file:${normalized}`;
  }
  try {
    const url=new URL(input);
    if(!url.protocol||!url.hostname) return null;
    const hostname=url.hostname.toLowerCase();
    const port=url.port?`:${url.port}`:'';
    const pathname=(url.pathname||'').replace(/\/+$/,'');
    return `remote:${url.protocol.toLowerCase()}//${hostname}${port}${pathname}`;
  } catch { return null; }
}
export function sameDatabaseTarget(left,right) {
  const a=databaseTargetIdentity(left),b=databaseTargetIdentity(right);
  return Boolean(a&&b&&a===b);
}
