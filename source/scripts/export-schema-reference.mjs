#!/usr/bin/env node
// Create a schema reference from application startup in a disposable local database.
// This script never opens the source tree's .env or database and does not install dependencies.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
function option(name, fallback) {
  const position = args.indexOf(name);
  if (position === -1) return fallback;
  if (!args[position + 1] || args[position + 1].startsWith('--')) throw new Error(`Missing ${name} value`);
  return args[position + 1];
}
const sourceRoot = path.resolve(option('--source-root', path.join(path.dirname(scriptPath), '..')));
const outputPath = path.resolve(option('--output', path.join(sourceRoot, 'database-schema.json')));
const packageJson = JSON.parse(await fs.readFile(path.join(sourceRoot, 'package.json'), 'utf8'));
const sourceFiles = [];
async function inventory(directory, relative = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const item = path.join(directory, entry.name);
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await inventory(item, name);
    else if (entry.isFile()) {
      const bytes = await fs.readFile(item);
      sourceFiles.push({ path: `src/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw new Error(`Source inventory refuses nonregular entry: ${item}`);
  }
}
await inventory(path.join(sourceRoot, 'src'));
for (const filename of ['package.json', 'package-lock.json']) {
  const bytes = await fs.readFile(path.join(sourceRoot, filename));
  sourceFiles.push({ path: filename, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
sourceFiles.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const aggregateSha256 = createHash('sha256').update(sourceFiles.map(file => `${file.sha256}  ${file.path}\n`).join('')).digest('hex');
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'shopeasy-schema-'));
let db;
try {
  // Copy only source. Startup can create data/ beneath this temporary root safely.
  await fs.cp(path.join(sourceRoot, 'src'), path.join(temporaryRoot, 'src'), { recursive: true });
  for (const file of sourceFiles.filter(item => item.path.startsWith('src/'))) {
    const copiedBytes = await fs.readFile(path.join(temporaryRoot, file.path));
    if (createHash('sha256').update(copiedBytes).digest('hex') !== file.sha256) {
      throw new Error(`Source changed while copying: ${file.path}; rerun after edits finish`);
    }
  }
  await fs.writeFile(path.join(temporaryRoot, 'package.json'), '{"type":"module"}\n');
  await fs.symlink(path.join(sourceRoot, 'node_modules'), path.join(temporaryRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  // This standalone process uses an explicit environment before any application import.
  const cleanEnvironment = {
    PATH: process.env.PATH || '',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    NODE_ENV: 'test',
    DATABASE_URL: pathToFileURL(path.join(temporaryRoot, 'schema.sqlite')).href,
    SEED_DEMO_DATA: 'false',
    STORE_NAME: 'Disposable schema fixture',
    STORE_CURRENCY: 'EUR',
    PRICES_INCLUDE_TAX: 'false'
  };
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, cleanEnvironment);
  ({ default: db } = await import(pathToFileURL(path.join(temporaryRoot, 'src', 'db.js')).href));
  const rows = async sql => (await db.execute(sql)).rows.map(row => ({ ...row }));
  const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
  const objects = await rows("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name");
  const tables = [];
  for (const table of objects.filter(item => item.type === 'table' && !item.name.startsWith('sqlite_'))) {
    const indexes = [];
    for (const index of await rows('PRAGMA index_list(' + quote(table.name) + ')')) {
      indexes.push({ ...index,
        sql: objects.find(item => item.type === 'index' && item.name === index.name)?.sql ?? null,
        columns: await rows('PRAGMA index_info(' + quote(index.name) + ')'),
        extendedColumns: await rows('PRAGMA index_xinfo(' + quote(index.name) + ')')
      });
    }
    tables.push({ name: table.name, sql: table.sql,
      columns: await rows('PRAGMA table_info(' + quote(table.name) + ')'),
      extendedColumns: await rows('PRAGMA table_xinfo(' + quote(table.name) + ')'),
      foreignKeys: await rows('PRAGMA foreign_key_list(' + quote(table.name) + ')'),
      indexes
    });
  }
  const schema = {
    sqliteVersion: (await rows('SELECT sqlite_version() AS version'))[0].version,
    foreignKeysEnabled: Number((await rows('PRAGMA foreign_keys'))[0].foreign_keys) === 1,
    journalMode: (await rows('PRAGMA journal_mode'))[0].journal_mode,
    integrityCheck: await rows('PRAGMA integrity_check'),
    foreignKeyCheck: await rows('PRAGMA foreign_key_check'),
    internalTables: objects.filter(item => item.type === 'table' && item.name.startsWith('sqlite_')),
    tables,
    views: objects.filter(item => item.type === 'view'),
    triggers: objects.filter(item => item.type === 'trigger')
  };
  if (!schema.foreignKeysEnabled || schema.foreignKeyCheck.length || schema.integrityCheck.some(row => row.integrity_check !== 'ok')) {
    throw new Error('Disposable schema integrity checks failed');
  }
  const counts = {
    applicationTables: schema.tables.length,
    columns: schema.tables.reduce((total, table) => total + table.columns.length, 0),
    indexes: schema.tables.reduce((total, table) => total + table.indexes.length, 0),
    explicitIndexes: schema.tables.reduce((total, table) => total + table.indexes.filter(index => index.origin === 'c').length, 0),
    foreignKeyRows: schema.tables.reduce((total, table) => total + table.foreignKeys.length, 0),
    triggers: schema.triggers.length,
    views: schema.views.length
  };
  const result = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    source: { packageName: packageJson.name, packageVersion: packageJson.version, aggregateSha256, files: sourceFiles },
    generation: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      command: [process.execPath, scriptPath, ...args],
      workingDirectory: process.cwd(),
      method: 'Copy and hash-check src only; use explicit clean process environment; import actual application db.js with @libsql/client into a disposable file database; query sqlite_master and PRAGMA; remove temporary tree.',
      databaseInputs: 'New local SQLite only; no source .env, existing database, remote provider, or virtual environment read.',
      applicationSourceModified: false,
      dependenciesInstalled: false
    },
    counts,
    ...schema
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: outputPath, sourceSha256: aggregateSha256, ...counts, integrityCheck: 'ok', foreignKeyViolations: 0 }));
} finally {
  if (db) db.close();
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
