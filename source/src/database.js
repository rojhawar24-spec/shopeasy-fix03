import { createClient } from '@libsql/client';
import { expandConfig, isInMemoryConfig } from '@libsql/core/config';
import { installLocalSqliteTransactionQueue } from './local-sqlite-transaction-queue.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const unsupportedServerlessTarget = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
export const isPostgresPreview = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'preview' && process.env.SHOP_DB_BACKEND === 'postgres-preview' && process.env.RATE_LIMIT_BACKEND === 'postgres-shared';
if (unsupportedServerlessTarget && !isPostgresPreview) {
  throw new Error('This ShopEasy release does not support Vercel/AWS Lambda serverless deployment: its shared rate limiter is provided by Cloudflare Durable Objects. Deploy with Cloudflare Workers + Turso (see CLOUDFLARE-DEPLOYMENT.md), or use a single persistent Node.js instance with RATE_LIMIT_BACKEND=memory-single-instance. Free plans have hard limits and are not unlimited.');
}

export const isPostgresStaging = isPostgresPreview || process.env.SHOP_DB_BACKEND === 'postgres-staging';
let rawClient;
if (isPostgresStaging) {
  if (!isPostgresPreview && process.env.NODE_ENV !== 'test') throw new Error('PostgreSQL runtime is not release-certified');
  const connectionString = isPostgresPreview ? process.env.SHOP_POSTGRES_URL : process.env.SHOP_POSTGRES_TEST_URL;
  if (!connectionString) throw new Error('Required PostgreSQL connection is missing');
  const endpoint = new URL(connectionString);
  if (!isPostgresPreview && (!['postgres:', 'postgresql:'].includes(endpoint.protocol) || !['localhost','127.0.0.1'].includes(endpoint.hostname) || endpoint.pathname !== '/shopeasy_ci')) throw new Error('PostgreSQL tests require a disposable local shopeasy_ci database');
  if (isPostgresPreview && (endpoint.protocol !== 'postgresql:' || !/^aws-[0-9]+-eu-central-1\.pooler\.supabase\.com$/.test(endpoint.hostname) || endpoint.port !== '6543' || endpoint.username !== 'shopeasy_runtime.vpvxztfqwtczflhxzwuw' || endpoint.pathname !== '/postgres' || !endpoint.password || endpoint.search)) throw new Error('Invalid staging database configuration');
  const {Pool} = await import('pg');
  const {createLegacyBridge} = await import('../postgres/bridge.mjs');
  rawClient = createLegacyBridge(new Pool({connectionString,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:5000,...(isPostgresPreview ? {ssl:{ca:fs.readFileSync(new URL('../postgres/supabase-ca.pem',import.meta.url),'utf8'),rejectUnauthorized:true}} : {})}),{runtime:true});
} else {
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
rawClient = createClient({ url, authToken });
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

}

export const db = rawClient;

export async function execute(sql, connection = db) {
  return connection.execute(sql);
}

export async function executeMultiple(sql, connection = db) {
  return connection.executeMultiple(sql);
}

// PostgreSQL enforces read-only transactions. Do not route side-effecting
// SELECT functions or explicit row locks through this path.
function executeReadQuery(sql, args, connection) {
  const simpleRead = /^\s*SELECT\b/i.test(sql) && !/\b(?:consume_request_limit|pg_advisory\w*|nextval|setval|set_config|FOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE))\b/i.test(sql);
  return isPostgresStaging && connection === db && simpleRead
    ? db.executeRead({sql,args})
    : connection.execute({sql,args});
}

export async function getRow(sql, args = [], connection = db) {
  const result = await executeReadQuery(sql,args,connection);
  return result.rows[0] ? { ...result.rows[0] } : undefined;
}

export async function getRows(sql, args = [], connection = db) {
  const result = await executeReadQuery(sql,args,connection);
  return result.rows.map(row => ({ ...row }));
}

export async function run(sql, args = [], connection = db) {
  const result = await connection.execute({ sql, args });
  return { changes: Number(result.rowsAffected), lastInsertRowid: Number(result.lastInsertRowid || 0) };
}
