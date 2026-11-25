#!/usr/bin/env node
// Read-only launch checklist for a single-instance local SQLite installation.
// Never opens/writes a database, prints credentials or claims a backup exists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const entries=fs.existsSync(path.join(root,'.env'))
  ? read('.env').split(/\r?\n/).filter(line=>/^\s*[A-Z_]+\s*=/.test(line)).map(line=>line.trim().match(/^([A-Z_]+)\s*=(.*)$/)).filter(Boolean)
  : read('.env.example').split(/\r?\n/).filter(line=>/^\s*[A-Z_]+\s*=/.test(line)).map(line=>line.trim().match(/^([A-Z_]+)\s*=(.*)$/)).filter(Boolean);
const env=Object.fromEntries(entries.map(([,k,v])=>[k,v.trim().replace(/^['"]|['"]$/g,'')]));
const source=read('src/database.js');
const backup=read('scripts/backup-database.mjs');
const ignore=read('.gitignore');
const pkg=JSON.parse(read('package.json'));
const checks=[];
const add=(name,passed,level='critical')=>checks.push({name,passed,level});
const nodeMatch=process.versions.node.match(/^(\d+)\.(\d+)\.(\d+)/);
const [,major,minor,patch]=nodeMatch.map(Number);
add('Supported Node 24.22.2+ runtime',major===24&&(minor>22||(minor===22&&patch>=2)));
add('Local file-backed SQLite selected',/^file:\.?\//i.test(env.DATABASE_URL||'') && env.CLOUDFLARE_WORKER!=='1');
add('One server instance with in-memory limiter',env.RATE_LIMIT_BACKEND==='memory-single-instance');
add('Local SQLite WAL enabled',source.includes("rawClient.execute('PRAGMA journal_mode = WAL')"));
add('Local SQLite write queue installed',source.includes('installLocalSqliteTransactionQueue(rawClient)'));
add('Private .env, database and uploads ignored from Git',/\.env\b/.test(ignore)&&/data\//.test(ignore)&&/uploads\//.test(ignore));
add('Encrypted logical backup available',/BACKUP_ENCRYPTION_KEY/.test(backup)&&/writeCompressedBackup/.test(backup));
add('No required hosted database subscription',!pkg.dependencies['@prisma/client']&&!pkg.dependencies.pg && /^file:/i.test(env.DATABASE_URL||''));
const status=checks.some(c=>!c.passed&&c.level==='critical')?'NEEDS_ACTION':'STATIC_READY';
console.log(JSON.stringify({status,environment:fs.existsSync(path.join(root,'.env'))?'local .env':'example template only',databaseRowsChecked:false,backupRestoreTested:false,checks},null,2));
if(status==='NEEDS_ACTION') process.exitCode=1;
