// Offline, cross-platform integrity and privacy check for a freshly extracted handover archive.
// Run BEFORE `npm ci`, building Cloudflare assets or creating a local .env/database.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safeReleasePath } from './release-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const required = [
  'package.json', 'package-lock.json', '.env.example', 'LICENSE.txt',
  'RIGHTS-CLEARANCE-REGISTER.md', 'CLEAN-HANDOVER.md',
  'src/bootstrap.js', 'src/server.js', 'src/db.js', 'src/security.js',
  'views/home.ejs', 'public/css/app.css', 'public/js/app.js',
  'generated/cloudflare-views.js', 'Dockerfile', 'deploy.sh', 'backup.sh',
  'FINALIZE-AND-VERIFY-WINDOWS.ps1', 'RELEASE-VERIFY-WINDOWS.ps1',
  'scripts/verify-release-files.mjs', 'scripts/release-files.mjs', 'scripts/release-archive.mjs',
  'scripts/verify-and-package.mjs', 'scripts/prepare-deployment.mjs',
  'scripts/release-layout.mjs', 'scripts/start-production.mjs', 'scripts/validate-deployment.mjs',
  'test/zero-release-audit.test.js'
];
const prohibitedDirectories = new Set(['node_modules', '.git', '.cloudflare-build', '.wrangler', 'backups', 'data', 'history', 'design-previews', '.venv', 'venv', '.qa-venv', '.qa-tools', '__pycache__']);
const prohibitedFiles = /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.netrc|\.pypirc|npm-debug\.log|.*\.(?:pem|p12|pfx|key|sqlite|sqlite3|db|db-wal|db-shm|bak|enc|zip|tmp|log))$/i;
const privateUploadPrefix = 'public/uploads/';
const portableNames = new Set();

function filesIn(directory, prefix = '') {
  const names = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = prefix + entry.name;
    const portableName=rel.normalize('NFC').toLocaleLowerCase('en');
    if(!safeReleasePath(rel)||portableNames.has(portableName))failures.push(`Unsafe or colliding portable path: ${rel}`);
    portableNames.add(portableName);
    if (entry.isSymbolicLink()) { failures.push(`Symbolic link not allowed: ${rel}`); continue; }
    if (entry.isDirectory()) {
      if (prohibitedDirectories.has(entry.name.toLowerCase()) || /^qa-output/i.test(entry.name) || rel.toLowerCase() === 'public/uploads') {
        failures.push(`Private, generated or unsupported archive folder: ${rel}`);
      } else names.push(...filesIn(path.join(directory, entry.name), `${rel}/`));
    } else if (entry.isFile()) {
      if ((prohibitedFiles.test(rel) && rel!=='.env.example') || rel.startsWith(privateUploadPrefix)) failures.push(`Private or temporary file: ${rel}`);
      names.push(rel.replaceAll('\\', '/'));
    } else failures.push(`Unsupported archive entry: ${rel}`);
  }
  return names;
}

const manifestFile = path.join(root, 'SHA256SUMS.txt');
if (!fs.existsSync(manifestFile)) {
  process.stderr.write('FAIL: SHA256SUMS.txt is missing.\n');
  process.exit(1);
}
const expected = new Map();
for (const line of fs.readFileSync(manifestFile, 'utf8').trimEnd().split('\n')) {
  const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
  if (!match) { failures.push(`Invalid checksum manifest line: ${line.slice(0, 80)}`); continue; }
  const [, checksum, rel] = match;
  if (!safeReleasePath(rel) || rel === 'SHA256SUMS.txt') {
    failures.push(`Unsafe manifest path: ${rel}`);
    continue;
  }
  if (expected.has(rel)) failures.push(`Duplicate manifest path: ${rel}`);
  expected.set(rel, checksum);
}
const actualFiles = filesIn(root);
const actualSet = new Set(actualFiles);
for (const rel of required) if (!actualSet.has(rel)) failures.push(`Required release file missing: ${rel}`);
for (const rel of expected.keys()) if (!actualSet.has(rel)) failures.push(`Manifest lists a missing file: ${rel}`);
for (const rel of actualFiles) {
  if (rel === 'SHA256SUMS.txt') continue;
  if (!expected.has(rel)) { failures.push(`Unlisted file: ${rel}`); continue; }
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
  if (checksum !== expected.get(rel)) failures.push(`Checksum mismatch: ${rel}`);
}

// Relative Markdown links must lead to files actually included in the handover.
let inspectedLinks = 0;
for (const rel of actualFiles.filter(p => p.endsWith('.md'))) {
  const file = path.join(root, rel);
  const body = fs.readFileSync(file, 'utf8');
  for (const [, target] of body.matchAll(/\[[^\]\n]+\]\(([^\)\n]+)\)/g)) {
    const raw = target.split(' "')[0].split('#')[0];
    if (!raw || /^(?:https?:|mailto:|tel:|data:|\/|#)/i.test(raw)) continue;
    inspectedLinks++;
    let decoded = raw;
    try { decoded = decodeURIComponent(raw); }
    catch { failures.push(`Malformed Markdown link in ${rel}: ${raw}`); continue; }
    const destination = path.resolve(path.dirname(file), decoded);
    if (!destination.startsWith(root + path.sep) && destination !== root) {
      failures.push(`Markdown path escapes release: ${rel} => ${raw}`);
    } else if (!fs.existsSync(destination)) failures.push(`Broken Markdown link: ${rel} => ${raw}`);
  }
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (pkg.version !== lock.version || pkg.version !== lock.packages?.['']?.version) failures.push('Package/lock version mismatch');
  if (pkg.private !== true || pkg.license !== 'UNLICENSED') failures.push('Commercial license status must not be misrepresented');
  if (!/NOT CLEARED FOR COMMERCIAL RESALE/i.test(fs.readFileSync(path.join(root, 'RIGHTS-CLEARANCE-REGISTER.md'), 'utf8'))) {
    failures.push('Rights-clearance notice missing or changed');
  }
} catch (error) { failures.push(`Invalid release metadata: ${error.message}`); }

if (failures.length) {
  for (const failure of failures) process.stderr.write(`[FAIL] ${failure}\n`);
  process.stderr.write(`FAIL: ${failures.length} package integrity/cleanup issue(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: ${actualFiles.length - 1} checksums, ${inspectedLinks} relative Markdown links, essential files, safe paths and privacy rules.\n`);
  process.stdout.write('NOTE: This verifies archive integrity/cleanup only. It does NOT certify runtime, payments, ownership or legal compliance.\n');
}
