#!/usr/bin/env node
import '../src/load-environment.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/database.js';
import { writeCompressedBackup, assertSafeBackupOutput } from '../src/services/database-backup.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function readFlag(name){const index=args.indexOf(name);return index>=0?args[index+1]||'':null;}
const output=readFlag('--output')||process.env.BACKUP_OUTPUT||path.join(root,'..','ShopEasy-backups',`shopeasy-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.jsonl.gz.enc`);
const maxEnv=Number.parseInt(process.env.BACKUP_MAX_BYTES||String(512*1024*1024),10);
const maxBytes=Number.isFinite(maxEnv)?Math.min(Math.max(maxEnv,10*1024*1024),2*1024*1024*1024):512*1024*1024;
const batchEnv=Number.parseInt(process.env.BACKUP_BATCH_SIZE||'200',10);
const batchSize=Number.isFinite(batchEnv)?Math.min(Math.max(batchEnv,1),200):200;
try {
  if(!String(process.env.BACKUP_ENCRYPTION_KEY||'').trim()) throw new Error('Set BACKUP_ENCRYPTION_KEY before creating backups. Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))" and store it separately from the backup.');
  assertSafeBackupOutput(path.resolve(output));
  // One read-only transaction keeps database rows on a stable snapshot while pages are exported. WAL lets local writers progress during the backup.
  const snapshot=await db.transaction('read');
  let result;
  try { result=await writeCompressedBackup(snapshot,{outputPath:path.resolve(output),uploadsDir:path.join(root,'public','uploads'),maxBytes,batchSize,encryptionKey:process.env.BACKUP_ENCRYPTION_KEY}); await snapshot.commit(); }
  catch(error){try{await snapshot.rollback();}catch{} throw error;}
  console.log('ShopEasy logical backup finished.');
  console.log(`File: ${result.path}`);
  console.log(`Compressed bytes: ${result.sizeBytes}`);
  console.log(`SHA-256: ${result.sha256}`);
  if(result.lockCleanupFailed)console.warn('Backup file and checksum are published, but lock cleanup needs operator review before another backup. Do not remove a lock while another backup is active.');
  console.log('Encryption: AES-256-GCM; database BLOB images and safe-named public/uploads files are included. Keep the backup, checksum and BACKUP_ENCRYPTION_KEY encrypted/off-host and separate from each other; test restoration into a separate empty database.');
} catch(error) {
  console.error(`Backup failed: ${String(error?.message||'unknown error').slice(0,240)}`);
  process.exitCode=1;
} finally {
  try{await db.close();}catch{}
}
