#!/usr/bin/env node
import '../src/load-environment.js';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { fileURLToPath } from 'node:url';
import { restoreCompressedBackup, resolveFileUrl, sha256File, fileUrlForPath, sameDatabaseTarget } from '../src/services/database-backup.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function readFlag(name){const index=args.indexOf(name);return index>=0?args[index+1]||'':null;}
const inputPath=readFlag('--backup')||process.env.RESTORE_BACKUP;
const targetUrl=String(process.env.RESTORE_DATABASE_URL||'').trim();
const targetToken=String(process.env.RESTORE_DATABASE_AUTH_TOKEN||'').trim();
const encryptionKey=String(process.env.BACKUP_ENCRYPTION_KEY||'').trim();
const confirmed=args.includes('--confirm-restore');
if(!inputPath){console.error('Restore failed: specify --backup path/to/backup.jsonl.gz.enc or RESTORE_BACKUP.');process.exit(2);}
if(!encryptionKey){console.error('Restore refused: BACKUP_ENCRYPTION_KEY is required. Use the original 32-byte key; it cannot be recovered from the backup.');process.exit(2);}
if(!targetUrl){console.error('Restore failed: set RESTORE_DATABASE_URL to a new, empty target database. Do not point it at the live customer database.');process.exit(2);}
if(!confirmed){console.error('Restore refused: review the target URL and append --confirm-restore. Existing target data is never overwritten.');process.exit(2);}
const targetFile=resolveFileUrl(targetUrl);
// Protect every database URL that can select the running application source.
// DATABASE_URL is the primary Node/Oracle setting; SHOP_DATABASE_URL is a
// backward-compatible alias; TURSO_DATABASE_URL is used by Cloudflare Workers.
const configuredSources=[process.env.DATABASE_URL,process.env.SHOP_DATABASE_URL,process.env.TURSO_DATABASE_URL].map(value=>String(value||'').trim()).filter(Boolean);
const currentFile=fileUrlForPath(path.join(root,'data','shop.db'));
const targetIsConfiguredSource=configuredSources.some(source=>sameDatabaseTarget(targetUrl,source));
const targetIsDefaultLocal=Boolean(targetFile&&sameDatabaseTarget(targetUrl,currentFile));
if(targetIsConfiguredSource||targetIsDefaultLocal){console.error('Restore refused: target URL resolves to a configured source database. Use a different empty staging database.');process.exit(2);}
const backupPath=path.resolve(inputPath);
if(!fs.existsSync(backupPath)){console.error('Restore failed: backup file does not exist.');process.exit(2);}
const checksumPath=`${backupPath}.sha256`;
if(!fs.existsSync(checksumPath)){console.error('Restore refused: backup .sha256 file is missing. Recreate the backup or verify its checksum out of band.');process.exit(2);}
const checksumLine=fs.readFileSync(checksumPath,'utf8').trim();
const expected=checksumLine.split(/\s+/)[0];
const actual=await sha256File(backupPath);
if(!/^[a-f0-9]{64}$/i.test(expected)||actual!==expected.toLowerCase()){console.error('Restore refused: SHA-256 checksum verification failed.');process.exit(2);}
if(targetFile)fs.mkdirSync(path.dirname(targetFile),{recursive:true});
const client=createClient({url:targetUrl,authToken:targetToken||undefined});
try {
  const result=await restoreCompressedBackup(client,{inputPath:backupPath,uploadsDir:String(process.env.RESTORE_UPLOADS_DIR||'').trim(),confirmRestore:confirmed,encryptionKey});
  console.log('ShopEasy restore finished into the separate target database.');
  console.log(`Backup created: ${result.header.createdAt} (ShopEasy ${result.header.appVersion})`);
  console.log(`Rows restored: ${result.restoredRows}`);
  console.log(`Tables: ${result.restoredTables}; indexes/triggers/views: ${result.restoredIndexesAndTriggers}; filesystem image files: ${result.restoredFiles}`);
  console.log('Run ShopEasy against the restored target in private staging and verify login, orders, return records and image URLs before any cutover.');
} catch(error) {
  console.error(`Restore failed: ${String(error?.message||'unknown error').slice(0,300)}`);
  console.error('A failed restore may leave a partial target. Do not connect the live store to it; discard that target and retry with a fresh empty database.');
  process.exitCode=1;
} finally {try{await client.close();}catch{}}
