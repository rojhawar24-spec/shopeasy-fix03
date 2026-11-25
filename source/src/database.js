import { createClient } from '@libsql/client';
import { expandConfig, isInMemoryConfig } from '@libsql/core/config';
import { installLocalSqliteTransactionQueue } from './local-sqlite-transaction-queue.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unsupportedServerlessTarget = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
if (unsupportedServerlessTarget) {
  throw new Error('This ShopEasy release does not support Vercel/AWS Lambda serverless deployment: its shared rate limiter is provided by Cloudflare Durable Objects. Deploy with Cloudflare Workers + Turso (see CLOUDFLARE-DEPLOYMENT.md), or use a single persistent Node.js instance with RATE_LIMIT_BACKEND=memory-single-instance. Free plans have hard limits and are not unlimited.');
}

const isCloudflareWorker = process.env.CLOUDFLARE_WORKER === '1';
const isRemoteProduction = isCloudflareWorker;

if (isRemoteProduction && (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)) {
  throw new Error('Production database is not configured for Cloudflare Worker. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
}

let url;
let authToken;
if (isRemoteProduction) {
  url = process.env.TURSO_DATABASE_URL;
  authToken = process.env.TURSO_AUTH_TOKEN;
} else if (process.env.DATABASE_URL) {
  // Oracle/persistent Node path: DATABASE_URL takes precedence and can point to a local SQLite file.
  url = String(process.env.DATABASE_URL).trim();
  authToken = /^file:/i.test(url) ? undefined : process.env.TURSO_AUTH_TOKEN;
} else if (process.env.SHOP_DATABASE_URL) {
  // Backward-compatible alias for older local and Turso setups.
  url = process.env.SHOP_DATABASE_URL;
  authToken = process.env.TURSO_AUTH_TOKEN;
} else {
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  url = pathToFileURL(path.join(dataDir, 'shop.db')).href;
}

if (/^file:/i.test(String(url))) {
  // Use the same decoded path as the installed driver. An explicit temporary or
  // external database must not create an unrelated data directory in the source.
  const config=expandConfig({url,authToken},true);
  if(!isInMemoryConfig(config)) fs.mkdirSync(path.dirname(path.resolve(config.path)),{recursive:true});
}
const rawClient = createClient({ url, authToken });
const isLocalFileDatabase = /^file:/i.test(String(url || ''));

// WAL keeps local SQLite readers from blocking a writer's COMMIT and is the
// recommended journal mode for this single-instance file-backed deployment.
// Do not send local SQLite PRAGMAs to the remote Turso/Cloudflare client.
if (isLocalFileDatabase) {
  await rawClient.execute('PRAGMA journal_mode = WAL');
}

// The local-file SQLite adapter uses SQLite in-process. Concurrent transaction
// lifetimes on one client can interleave and strand a failed COMMIT; serialize
// local writes and always release the slot after commit, rollback, or close.
// Remote Turso/Cloudflare keeps the driver's native concurrency behavior.
if (isLocalFileDatabase) installLocalSqliteTransactionQueue(rawClient);

export const db = rawClient;

export async function execute(sql, connection = db) {
  return connection.execute(sql);
}

export async function executeMultiple(sql, connection = db) {
  return connection.executeMultiple(sql);
}

export async function getRow(sql, args = [], connection = db) {
  const result = await connection.execute({ sql, args });
  return result.rows[0] ? { ...result.rows[0] } : undefined;
}

export async function getRows(sql, args = [], connection = db) {
  const result = await connection.execute({ sql, args });
  return result.rows.map(row => ({ ...row }));
}

export async function run(sql, args = [], connection = db) {
  const result = await connection.execute({ sql, args });
  return { changes: Number(result.rowsAffected), lastInsertRowid: Number(result.lastInsertRowid || 0) };
}
