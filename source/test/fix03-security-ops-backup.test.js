import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@libsql/client';
import {writeCompressedBackup,restoreCompressedBackup} from '../src/services/database-backup.js';
import {getLicenseInfo} from '../src/license.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const run=promisify(execFile),name='b'.repeat(32)+'.png',assetPath='/uploads/'+name;
const bytes=fs.readFileSync(new URL('./fixtures/r19-sample.png',import.meta.url));
async function fixture(t) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-fix03-backup-'));
  const sourcePath=path.join(directory,'source.db'),source=createClient({url:pathToFileURL(sourcePath).href});
  const target=createClient({url:pathToFileURL(path.join(directory,'target.db')).href});
  t.after(()=>{source.close();target.close();fs.rmSync(directory,{recursive:true,force:true});});
  await source.executeMultiple('CREATE TABLE products(id INTEGER PRIMARY KEY,image_url TEXT);CREATE TABLE orders(id INTEGER PRIMARY KEY);CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE uploaded_assets(path TEXT PRIMARY KEY,content_type TEXT,data BLOB);');
  const uploads=path.join(directory,'uploads');fs.mkdirSync(uploads);
  return {directory,sourcePath,source,target,uploads,key:crypto.randomBytes(32).toString('base64'),output:path.join(directory,'snapshot.enc')};
}

test('COM006 logo-only missing upload rejects backup before publishing any archive/checksum',async t=>{
  const f=await fixture(t);await f.source.execute({sql:'INSERT INTO settings VALUES(?,?)',args:['appearance_logo',assetPath]});
  await assert.rejects(writeCompressedBackup(f.source,{outputPath:f.output,uploadsDir:f.uploads,encryptionKey:f.key}),/BACKUP_REFERENCED_UPLOAD_MISSING/);
  assert.equal(fs.existsSync(f.output),false);assert.equal(fs.existsSync(f.output+'.sha256'),false);
});

for(const storage of ['filesystem','database']) {
  test(`COM006 logo-only ${storage} asset survives an encrypted backup and restore`,async t=>{
    const f=await fixture(t);await f.source.execute({sql:'INSERT INTO settings VALUES(?,?)',args:['appearance_logo',assetPath]});
    if(storage==='filesystem')fs.writeFileSync(path.join(f.uploads,name),bytes);
    else await f.source.execute({sql:'INSERT INTO uploaded_assets VALUES(?,?,?)',args:[assetPath,'image/png',new Uint8Array(bytes)]});
    await writeCompressedBackup(f.source,{outputPath:f.output,uploadsDir:f.uploads,encryptionKey:f.key});
    const restored=path.join(f.directory,'restored-uploads');
    await restoreCompressedBackup(f.target,{inputPath:f.output,uploadsDir:restored,encryptionKey:f.key,confirmRestore:true});
    assert.equal((await f.target.execute("SELECT value FROM settings WHERE key='appearance_logo'")).rows[0].value,assetPath);
    const actual=storage==='filesystem'?fs.readFileSync(path.join(restored,name)):Buffer.from((await f.target.execute('SELECT data FROM uploaded_assets')).rows[0].data);
    assert.deepEqual(actual,bytes);
  });
}

test('COM006 missing logo on a later backup preserves the previous encrypted backup pair',async t=>{
  const f=await fixture(t);await f.source.execute({sql:'INSERT INTO settings VALUES(?,?)',args:['appearance_logo',assetPath]});fs.writeFileSync(path.join(f.uploads,name),bytes);
  await writeCompressedBackup(f.source,{outputPath:f.output,uploadsDir:f.uploads,encryptionKey:f.key});
  const archive=fs.readFileSync(f.output),checksum=fs.readFileSync(f.output+'.sha256');fs.unlinkSync(path.join(f.uploads,name));
  await assert.rejects(writeCompressedBackup(f.source,{outputPath:f.output,uploadsDir:f.uploads,encryptionKey:f.key}),/BACKUP_REFERENCED_UPLOAD_MISSING/);
  assert.deepEqual(fs.readFileSync(f.output),archive);assert.deepEqual(fs.readFileSync(f.output+'.sha256'),checksum);
  assert.equal(fs.readdirSync(f.directory).some(value=>value.endsWith('.lock')||value.includes('.tmp-')),false);
});

test('COM006 malformed local logo references are not silently ignored',async t=>{
  const f=await fixture(t);await f.source.execute({sql:'INSERT INTO settings VALUES(?,?)',args:['appearance_logo','/uploads/../outside.png']});
  await assert.rejects(writeCompressedBackup(f.source,{outputPath:f.output,uploadsDir:f.uploads,encryptionKey:f.key}),/BACKUP_INVALID_UPLOAD_REFERENCE/);
});

async function offsiteFixture(t) {
  const f=await fixture(t),runtime=path.join(f.directory,'runtime');
  fs.mkdirSync(path.join(runtime,'scripts'),{recursive:true});fs.mkdirSync(path.join(runtime,'src','services'),{recursive:true});
  for(const relative of ['package.json','scripts/backup-offsite.mjs','scripts/backup-database.mjs','scripts/legacy-backup-backend.mjs','src/load-environment.js','src/database.js','src/local-sqlite-transaction-queue.js','src/services/database-backup.js'])fs.copyFileSync(path.join(root,relative),path.join(runtime,relative));
  fs.symlinkSync(path.join(root,'node_modules'),path.join(runtime,'node_modules'),process.platform==='win32'?'junction':'dir');
  const env={};for(const key of ['PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','LANG'])if(process.env[key])env[key]=process.env[key];
  Object.assign(env,{NODE_ENV:'test',CLOUDFLARE_WORKER:'0',DATABASE_URL:pathToFileURL(f.sourcePath).href,BACKUP_ENCRYPTION_KEY:f.key,OFFSITE_SSH_HOST:'audit@example.test'});
  return {...f,runtime,env};
}

for(const directoryName of [null,'custom-backups','custom spaces','quotes \' $name (x); [literal] `tick']) {
  test(`OPS002 actual offsite CLI prints literal configured ${directoryName??'default'} download paths`,async t=>{
    const f=await offsiteFixture(t),destination=path.join(f.directory,directoryName??'ShopEasy-backups');
    if(directoryName!==null)f.env.OFFSITE_BACKUP_DIR=destination;
    const result=await run(process.execPath,[path.join(f.runtime,'scripts/backup-offsite.mjs')],{cwd:f.runtime,env:f.env,timeout:15000});
    const files=fs.readdirSync(destination).filter(value=>value.endsWith('.enc'));assert.equal(files.length,1);
    const archive=path.join(destination,files[0]);assert.equal(fs.readFileSync(archive).subarray(0,8).toString(),'SHEBKP01');
    const hash=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');assert.equal(fs.readFileSync(archive+'.sha256','utf8').split(/\s+/)[0],hash);
    const commands=result.stdout.split('\n').filter(line=>line.startsWith('scp '));assert.equal(commands.length,2);
    for(const [i,command] of commands.entries()) {
      const quoted=command.match(/ -- '((?:[^']|'')*)' \.$/);assert.ok(quoted,'one non-expanding PowerShell source argument');
      const source=quoted[1].replace(/''/g,"'").replace(/\\([\\*?\[\]{}])/g,'$1');
      assert.equal(source,'audit@example.test:'+archive+(i?'.sha256':''));
    }
    assert.match(result.stdout,/OpenSSH 9/);assert.equal(result.stdout.includes(f.key),false);assert.equal(result.stderr.includes(f.key),false);
  });
}

test('OPS002 unsafe SSH host and control-character or double-quote directory are rejected before creating output',async t=>{
  const f=await offsiteFixture(t),destination=path.join(f.directory,'not-created');
  for(const changes of [{OFFSITE_SSH_HOST:'host; Write-Output unsafe',OFFSITE_BACKUP_DIR:destination},{OFFSITE_BACKUP_DIR:destination+'\nsecond-line'},{OFFSITE_BACKUP_DIR:destination+'"quoted'}]) {
    await assert.rejects(run(process.execPath,[path.join(f.runtime,'scripts/backup-offsite.mjs')],{cwd:f.runtime,env:{...f.env,...changes},timeout:15000}),error=>{
      assert.equal(error.code,1);assert.equal(error.stdout.includes('scp '),false);assert.equal(error.stderr.includes(f.key),false);return true;
    });
  }
  assert.equal(fs.existsSync(destination),false);assert.equal(fs.existsSync(destination+'\nsecond-line'),false);assert.equal(fs.existsSync(destination+'"quoted'),false);
});

test('OPS002 local SFTP transfer honors the printed literal path with spaces, quotes and metacharacters',{
  skip:!(fs.existsSync('/usr/bin/scp')&&fs.existsSync('/usr/lib/openssh/sftp-server'))
},async t=>{
  const f=await offsiteFixture(t),destination=path.join(f.directory,"local ' $dollar; [brackets] {braces} *star ?question `tick");
  const result=await run(process.execPath,[path.join(f.runtime,'scripts/backup-offsite.mjs')],{cwd:f.runtime,env:{...f.env,OFFSITE_BACKUP_DIR:destination},timeout:15000});
  const commands=result.stdout.split('\n').filter(line=>line.startsWith('scp '));
  const download=path.join(f.directory,'download');fs.mkdirSync(download);
  for(const command of commands) {
    const argument=command.match(/ -- '((?:[^']|'')*)' \.$/)[1].replace(/''/g,"'");
    // -D runs a local SFTP subsystem over stdin/stdout; no SSH, DNS or network.
    await run('/usr/bin/scp',['-q','-D','/usr/lib/openssh/sftp-server','--',argument,download],{env:f.env,timeout:15000});
  }
  const files=fs.readdirSync(destination);assert.equal(files.length,2);
  for(const filename of files)assert.deepEqual(fs.readFileSync(path.join(download,filename)),fs.readFileSync(path.join(destination,filename)));
});

test('OPS003 nonexistent civil dates do not become configured license metadata',()=>{
  const metadata={LICENSED_TO:'Synthetic owner',LICENSOR_NAME:'Synthetic licensor',LICENSE_EMAIL:'owner@example.test',LICENSE_KEY:'x'.repeat(32)};
  for(const date of ['2026-02-31','2026-02-30','2026-02-29','1900-02-29','2100-02-29','2026-04-31','2026-06-31','2026-09-31','2026-11-31','2026-00-01','2026-13-01','2026-01-00','2026-01-32','2026-2-01','2026-02-01T00:00:00Z']) {
    const info=getLicenseInfo({...metadata,LICENSE_DATE:date});assert.equal(info.dateFormatValid,false,date);assert.equal(info.configured,false,date);assert.equal(info.licenseDate,'');
  }
  for(const date of ['0001-01-01','2000-02-29','2024-02-29','2026-02-28','2026-04-30','2026-12-31','9999-12-31']) {
    const info=getLicenseInfo({...metadata,LICENSE_DATE:date});assert.equal(info.dateFormatValid,true,date);assert.equal(info.configured,true,date);assert.equal(info.status,'metadata-configured-unverified');assert.equal(info.licenseDate,date);
  }
});
