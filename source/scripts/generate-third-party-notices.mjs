#!/usr/bin/env node
/** Offline, deterministic notice collector. See third-party/README.md. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'THIRD-PARTY-NOTICES.generated.txt');
const unresolved = [], review = [], absentOptional = [];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const packageName = relative => relative.slice(relative.lastIndexOf('node_modules/') + 13);
const isNotice = name => /^(?:licen[cs]e|copying|notice|copyright)(?:$|[._ -])|^third[-_ ]?party.*notice/i.test(name);

function safePath(base, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\')) throw new Error('invalid relative path');
  const target = path.resolve(base, relative);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error(`path escapes source directory: ${relative}`);
  let current = base;
  for (const segment of path.relative(base, target).split(path.sep)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`symlink source rejected: ${relative}`);
  }
  return target;
}
function checkedFile(record, base = root) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw new Error('missing SHA-256 for notice/evidence');
  const file = safePath(base, record.file || record.path);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== record.sha256) throw new Error(`SHA-256 mismatch: ${path.relative(root, file)}`);
  if (!bytes.toString('utf8').trim()) throw new Error(`empty notice/evidence: ${record.file || record.path}`);
  return bytes;
}
const readCheckedJson = record => JSON.parse(checkedFile(record).toString('utf8'));
function noticeFiles(packageDir, relative = '') {
  const files = [];
  for (const item of fs.readdirSync(path.join(packageDir, relative), { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const rel = path.join(relative, item.name);
    if (item.isSymbolicLink()) {
      if (isNotice(item.name)) throw new Error(`symlink notice rejected: ${rel}`);
    } else if (item.isDirectory()) files.push(...noticeFiles(packageDir, rel));
    else if (item.isFile() && isNotice(item.name)) files.push(rel);
  }
  return files.sort();
}
function identity(pkg, name, version) {
  if (pkg.name !== name || pkg.version !== version) throw new Error(`installed identity mismatch: expected ${name}@${version}; found ${pkg.name}@${pkg.version}`);
}
function localFiles(directory, relative = '') {
  const files = [];
  for (const item of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    const rel = path.join(relative, item.name);
    if (item.isSymbolicLink()) throw new Error(`symlink inside first-party source rejected: ${rel}`);
    if (item.isDirectory()) files.push(...localFiles(directory, rel));
    else if (item.isFile()) files.push(rel);
  }
  return files.sort();
}
function firstPartyLink(relative, metadata, record, lock) {
  if (record?.kind !== 'first-party-local' || record.rightsStatus !== 'UNKNOWN') throw new Error('local linked component needs explicit first-party provenance and UNKNOWN rights');
  if (!metadata.resolved?.startsWith('vendor/') || record.sourcePath !== metadata.resolved || record.alias !== packageName(relative)) throw new Error('first-party source/alias mapping differs from lock');
  const target = lock.packages[metadata.resolved];
  if (!target || target.name !== record.name || target.version !== record.version || target.license !== 'UNLICENSED' || record.declaredLicense !== 'UNLICENSED') throw new Error('first-party lock identity or UNLICENSED status mismatch');
  const sourceDir = safePath(root, metadata.resolved);
  const sourcePackage = readJson(path.join(sourceDir, 'package.json'));
  identity(sourcePackage, record.name, record.version);
  if (sourcePackage.private !== true || sourcePackage.license !== 'UNLICENSED') throw new Error('first-party package must remain private/UNLICENSED');
  if (!Array.isArray(record.sourceFiles) || !record.sourceFiles.length) throw new Error('first-party source file hashes missing');
  const expectedFiles = record.sourceFiles.map(file => file.path).sort();
  if (!expectedFiles.includes('package.json') || !expectedFiles.includes(sourcePackage.main) || !expectedFiles.includes('PROVENANCE.md') || JSON.stringify(localFiles(sourceDir)) !== JSON.stringify(expectedFiles)) throw new Error('first-party source file set differs from reviewed provenance');
  safePath(root, path.dirname(relative));
  const installedDir = path.join(root, relative);
  // npm's alias symlink is accepted only for the explicitly recorded local target.
  if (fs.lstatSync(installedDir).isSymbolicLink() && fs.realpathSync(installedDir) !== fs.realpathSync(sourceDir)) throw new Error('installed first-party link target differs from lock');
  identity(readJson(path.join(installedDir, 'package.json')), record.name, record.version);
  if (JSON.stringify(localFiles(installedDir)) !== JSON.stringify(expectedFiles)) throw new Error('installed first-party file set differs from reviewed source');
  for (const file of record.sourceFiles) { checkedFile(file, sourceDir); checkedFile(file, installedDir); }
  return record.sourceFiles;
}

let lock, provenance;
try {
  lock = readJson(path.join(root, 'package-lock.json'));
  provenance = readJson(path.join(root, 'third-party/provenance.json'));
  if (provenance.schemaVersion !== 1 || !provenance.packages || Array.isArray(provenance.packages)) throw new Error('unsupported provenance format');
} catch (error) {
  fs.writeFileSync(output, `THIRD-PARTY NOTICES — UNRESOLVED\nCannot validate lock/provenance: ${error.message}\n`);
  console.error(`Notice generation failed: ${error.message}`);
  process.exit(1);
}
const entries = Object.entries(lock.packages || {}).filter(([relative]) => relative.startsWith('node_modules/')).sort(([a], [b]) => a.localeCompare(b, 'en'));
if (!entries.length || JSON.stringify(entries.map(([relative]) => relative).sort()) !== JSON.stringify(Object.keys(provenance.packages).sort())) unresolved.push('Lock package set differs from third-party/provenance.json; review and recapture notices.');
const lines = [
  `THIRD-PARTY NOTICES — ShopEasy ${lock.version}`,
  `Provenance captured: ${provenance.capturedAt}`, '',
  'Offline notice snapshots for all locked packages, including optional packages absent on this platform.',
  'Installed package identity and registered notice-source hashes are checked. Supplementary texts are version-bound and SHA-256 checked.',
  'Hashes check recorded texts; they do not re-verify every installed tarball or embedded/native component.',
  'This bundle is not a ShopEasy license grant, proof of ownership, or legal clearance. See RIGHTS-CLEARANCE-REGISTER.md and third-party/README.md.', '',
];
let captured = 0, covered = 0, firstParty = 0;
for (const [relative, metadata] of entries) {
  const name = packageName(relative), record = provenance.packages[relative];
  const target = metadata.link ? lock.packages[metadata.resolved] : metadata;
  const label = metadata.link ? `${target?.name || name}@${target?.version || 'UNKNOWN'} (installed as ${name})` : `${name}@${metadata.version}`;
  lines.push('='.repeat(78), label, `Lock entry: ${relative}`, `Declared lock license: ${target?.license || 'NOASSERTION'}`, `Locked source: ${metadata.resolved || 'NOASSERTION'}`, `Lock integrity: ${metadata.link ? 'local source hashes below' : metadata.integrity || 'NOASSERTION'}`);
  try {
    if (metadata.link) {
      const files = firstPartyLink(relative, metadata, record, lock);
      lines.push('Component status: FIRST-PARTY LOCAL REPLACEMENT — not the registry package or its ISC license.', 'Source identity and all shipped local-file SHA-256 hashes: verified.', 'Existing first-party grant/ownership: UNKNOWN. Private/UNLICENSED; root LICENSE.txt remains draft-only.', ...files.map(file => `Local source: ${record.sourcePath}/${file.path}; SHA-256: ${file.sha256}`), 'This row records provenance and an open first-party rights gate; it is not an external license grant.', '');
      firstParty++;
      continue;
    }
    if (!record) throw new Error('no provenance record for this lock entry');
    for (const [field, expected] of Object.entries({ name, version: metadata.version, integrity: metadata.integrity, resolved: metadata.resolved, optional: Boolean(metadata.optional), declaredLicense: metadata.license || 'NOASSERTION' })) {
      if (record[field] !== expected) throw new Error(`provenance ${field} differs from locked entry`);
    }
    const packageDir = safePath(root, relative), installedPath = path.join(packageDir, 'package.json');
    const installedExists = fs.existsSync(installedPath);
    if (installedExists) {
      identity(readJson(installedPath), name, metadata.version);
      lines.push(`Installed identity: verified ${label}`);
      if (JSON.stringify(noticeFiles(packageDir)) !== JSON.stringify(record.installedNoticeFiles)) throw new Error('installed license/notice file set differs from reviewed provenance');
    } else if (!metadata.optional) throw new Error('required installed package/package.json missing; run npm ci before generating');
    else {
      absentOptional.push(label);
      lines.push('Installed identity: optional package absent; exact-package snapshot and companion license checked below.');
    }
    if (record.packageSource) {
      identity(readCheckedJson(record.packageSource.packageJsonSnapshot), name, metadata.version);
      if (record.packageSource.locked_integrity_verified !== true) throw new Error('exact tarball SRI evidence missing');
      lines.push(`Exact tarball evidence: ${record.packageSource.tarball_url}`, `Captured tarball SHA-256: ${record.packageSource.tarball_sha256}`, 'Locked tarball SRI verified at capture: true');
    }
    if (!installedExists && !record.packageSource) throw new Error('optional package missing exact-package source evidence');
    if (!Array.isArray(record.texts)) throw new Error('invalid text list');
    // Check the entire entry before emitting any of its texts.
    const texts = record.texts.map(text => {
      const bytes = checkedFile(text), source = text.source;
      if (installedExists && text.installedSource) checkedFile(text.installedSource, packageDir);
      if (!source || typeof source.kind !== 'string') throw new Error('notice source kind missing');
      if (source.kind === 'pinned-upstream-license' && (!/^[a-f0-9]{40}$/.test(source.gitHead || '') || !source.url?.includes(`/${source.gitHead}/`) || source.gitHead !== record.packageSource?.gitHead)) throw new Error('upstream license is not pinned to exact-package gitHead');
      if (source.kind === 'version-matched-companion-license') {
        const companion = lock.packages[source.lockedPath];
        if (!companion || companion.version !== source.version || companion.integrity !== source.integrity) throw new Error('companion package lock mismatch');
        const snapshot = readCheckedJson(source.packageJsonSnapshot), companionDir = safePath(root, source.lockedPath);
        identity(snapshot, source.package, source.version);
        identity(readJson(path.join(companionDir, 'package.json')), source.package, source.version);
        if (sha256(fs.readFileSync(path.join(companionDir, 'package.json'))) !== source.packageJsonSnapshot.sha256) throw new Error('installed companion mapping differs from reviewed mapping');
        if (snapshot.optionalDependencies?.[name] !== metadata.version || !Object.values(snapshot.neon?.targets || {}).includes(name)) throw new Error('companion does not map exact native version');
        if (sha256(fs.readFileSync(safePath(companionDir, source.path))) !== text.sha256) throw new Error('installed companion license differs from captured license');
      }
      return { text, bytes };
    });
    for (const { text, bytes } of texts) {
      lines.push('', `--- ${text.label} ---`, `Text source: ${JSON.stringify(text.source)}`, `Text SHA-256: ${text.sha256}`, '', bytes.toString('utf8').replace(/\s+$/, ''));
      captured++;
    }
    if (texts.length) covered++;
    if (record.reviewRequired) {
      review.push(`${label}: ${record.reviewRequired}`);
      lines.push('', `REVIEW REQUIRED: ${record.reviewRequired}`);
    }
    if (record.unresolved) {
      if (record.missingTextEvidence?.pinnedTree) checkedFile(record.missingTextEvidence.pinnedTree);
      throw new Error(record.unresolved);
    }
    if (!texts.length) throw new Error('no full license/notice text captured');
  } catch (error) {
    unresolved.push(`${label}: ${error.message}`);
    lines.push('', `NOTICE TEXT STATUS: UNRESOLVED — ${error.message}`);
  }
  lines.push('');
}
lines.push('='.repeat(78), 'GENERATION SUMMARY', `Lockfile package entries: ${entries.length}`, `Third-party package entries: ${entries.filter(([, metadata]) => !metadata.link).length}`, `First-party linked entries (rights UNKNOWN): ${firstParty}`, `Entries with captured license/notice texts: ${covered}`, `License/notice texts copied: ${captured}`, `Optional packages absent on this platform (included above): ${absentOptional.length}`, `Unresolved package/license entries: ${unresolved.length}`, `Native binary review gates still open: ${review.length}`);
if (absentOptional.length) lines.push('', 'OPTIONAL PACKAGES ABSENT ON THIS PLATFORM — INCLUDED ABOVE:', ...absentOptional.map(entry => `- ${entry}`));
if (unresolved.length) lines.push('', 'UNRESOLVED ITEMS — DO NOT TREAT THIS NOTICE BUNDLE AS COMPLETE:', ...unresolved.map(entry => `- ${entry}`));
if (review.length) lines.push('', 'NATIVE REVIEW GATES — COMPANION LICENSE CAPTURE IS NOT A FULL EMBEDDED-COMPONENT AUDIT:', ...review.map(entry => `- ${entry}`));
lines.push('', 'First-party source, branding, illustrations, generated imagery and contract rights remain subject to RIGHTS-CLEARANCE-REGISTER.md. The draft LICENSE.txt grants no rights.');
fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, output)}`);
console.log(`Package entries: ${entries.length}; first-party links (rights UNKNOWN): ${firstParty}; entries with texts: ${covered}; texts copied: ${captured}; optional absent: ${absentOptional.length}; unresolved: ${unresolved.length}; native review gates: ${review.length}`);
if (unresolved.length) process.exitCode = 1;
