#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true, debug: false });
const defaultBackupDir = path.resolve(root) === '/opt/shopeasy' ? '/opt/shopeasy/backups' : path.join(root, '..', 'ShopEasy-backups');
const outputDir = path.resolve(String(process.env.OFFSITE_BACKUP_DIR || defaultBackupDir).trim());
const host = String(process.env.OFFSITE_SSH_HOST || 'ubuntu@JOUW_PUBLIEKE_IP').trim();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `shopeasy-offsite-${timestamp}.jsonl.gz.enc`;
const outputPath = path.join(outputDir, filename);
const checksumPath = `${outputPath}.sha256`;

function powershellScpSource(remoteHost, remotePath) {
  // These are OpenSSH host/alias values, never command-line options or shell text.
  if (!/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?(?:[A-Za-z0-9_][A-Za-z0-9_.-]*|\[[0-9A-Fa-f:]+\])$/.test(remoteHost)) {
    throw new Error('OFFSITE_SSH_HOST must be an SSH host or user@host, without shell characters.');
  }
  if (/[\u0000-\u001f\u007f"]/.test(remotePath)) throw new Error('The backup directory must not contain control characters or double quotes.');
  // OpenSSH 9+ uses SFTP: protect literal path characters from its glob matching,
  // then quote the entire source as one non-expanding PowerShell argument.
  const literalPath = remotePath.replace(/[\\*?\[\]{}]/g, character => `\\${character}`);
  return `'${`${remoteHost}:${literalPath}`.replace(/'/g, "''")}'`;
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function runBackup() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'backup-database.mjs'), '--output', outputPath], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`backup-database.mjs exited with code ${code}`)));
  });
}

try {
  if (!String(process.env.BACKUP_ENCRYPTION_KEY || '').trim()) {
    throw new Error('BACKUP_ENCRYPTION_KEY ontbreekt. Bewaar een willekeurige 32-byte sleutel apart van de back-up.');
  }
  const archiveSource = powershellScpSource(host, outputPath);
  const checksumSource = powershellScpSource(host, checksumPath);
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  await runBackup();
  const stat = fs.lstatSync(outputPath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 32) throw new Error('Encrypted backup output is not a valid regular file.');
  fs.chmodSync(outputPath, 0o600);
  const digest = await sha256File(outputPath);
  fs.writeFileSync(checksumPath, `${digest}  ${filename}\n`, { mode: 0o600 });
  fs.chmodSync(checksumPath, 0o600);

  console.log('Versleutelde SQLite/logische back-up klaar.');
  console.log(`Bestand: ${outputPath}`);
  console.log(`SHA-256: ${digest}`);
  console.log('Download in Windows PowerShell met OpenSSH 9 of nieuwer (standaard SFTP; gebruik geen -O):');
  console.log(`scp -i "$env:USERPROFILE\\.ssh\\id_ed25519" -- ${archiveSource} .`);
  console.log(`scp -i "$env:USERPROFILE\\.ssh\\id_ed25519" -- ${checksumSource} .`);
  console.log('Bewaar BACKUP_ENCRYPTION_KEY apart van beide gedownloade bestanden.');
} catch (error) {
  console.error(`Offsite-back-up mislukt: ${String(error?.message || 'onbekende fout').slice(0, 300)}`);
  process.exitCode = 1;
}
