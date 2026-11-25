import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@libsql/client';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.cwd() !== projectRoot) {
  console.error('Run this command from the ShopEasy project root (the folder containing package.json).');
  process.exit(2);
}

await import('../src/load-environment.js');
const configuredUrl = String(process.env.DATABASE_URL || process.env.SHOP_DATABASE_URL || '').trim();
const fallbackDatabase = path.join(projectRoot, 'data', 'shop.db');
const effectiveUrl = configuredUrl || pathToFileURL(fallbackDatabase).href;
const localFileDatabase = /^file:/i.test(effectiveUrl);
if (!localFileDatabase) {
  console.error('DATABASE_URL is not a local SQLite file URL. This diagnostic will not open a remote database.');
  process.exit(2);
}

// Resolve the existing file before opening it: diagnostics must never create an
// empty database when DATABASE_URL points to a misspelled or missing path.
const databasePath = fileURLToPath(new URL(effectiveUrl, pathToFileURL(`${projectRoot}${path.sep}`)));
if (!fs.existsSync(databasePath) || !fs.statSync(databasePath).isFile()) {
  console.error('The configured local SQLite file does not exist. No database was opened.');
  process.exit(2);
}

// Use the raw client rather than src/database.js so this read-only tool does not
// change PRAGMA journal_mode or install the application transaction queue.
const db = createClient({ url: effectiveUrl });
let failures = 0;
const report = (label, ok, detail = '') => {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const required = {
  orders: [
    'id','status','payment_provider','payment_reference','client_token','guest_access_token_hash',
    'email','customer_phone','subtotal_cents','automatic_discount_cents','discount_cents','total_cents',
    'currency','shipping_name','shipping_address','shipping_city','shipping_postal_code','shipping_country',
    'shipping_cents','tax_cents','tax_rate_bps','tax_included','tax_rule_snapshot','shipping_rule_snapshot',
    'customer_note','terms_accepted_at','terms_locale','terms_policy_hash','reservation_expires_at','payment_url'
  ],
  sessions: [
    'id','user_id','cart_json','wishlist_json','created_at','expires_at','last_activity_at','absolute_expires_at',
    'csrf_token','coupon_code','cart_revision','checkout_quote_json','checkout_idempotency_key','checkout_guest_token'
  ],
  products: ['id','name','sku','active','price_cents','stock','reserved_stock'],
  product_variants: ['id','product_id','option_value','sku','stock','reserved_stock','active'],
  order_items: ['id','order_id','product_id','product_name','sku','quantity','unit_price_cents','total_cents'],
  settings: ['key','value'],
  users: ['id','email','role','mfa_secret','mfa_enabled','mfa_recovery_codes_hash','mfa_last_totp_step'],
  mfa_login_challenges: ['session_id','user_id','expires_at_ms','mode','remember_me','next_path','created_at_ms'],
  mfa_rate_limits: ['user_id','source_hash','window_started_at_ms','attempts']
};

try {
  const integrity = await db.execute('PRAGMA quick_check');
  const integrityValue = String(integrity.rows?.[0]?.quick_check || Object.values(integrity.rows?.[0] || {})[0] || 'unknown');
  report('SQLite quick_check', integrityValue.toLowerCase() === 'ok', integrityValue);

  const tableResult = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
  const tables = new Set(tableResult.rows.map(row => String(row.name)));
  for (const [table, columns] of Object.entries(required)) {
    if (!tables.has(table)) {
      report(`Table ${table}`, false, 'table is missing');
      continue;
    }
    const info = await db.execute(`PRAGMA table_info('${table}')`);
    const actual = new Set(info.rows.map(row => String(row.name)));
    const missing = columns.filter(column => !actual.has(column));
    report(`Schema ${table}`, missing.length === 0, missing.length ? `missing columns: ${missing.join(', ')}` : `${columns.length} required columns present`);
  }

  if (tables.has('orders')) {
    const indexes = await db.execute("PRAGMA index_list('orders')");
    let uniqueClientTokenIndex = false;
    for (const index of indexes.rows) {
      if (Number(index.unique) !== 1) continue;
      const name = String(index.name || '').replace(/'/g, "''");
      const info = await db.execute(`PRAGMA index_info('${name}')`);
      if (info.rows.some(row => String(row.name) === 'client_token')) uniqueClientTokenIndex = true;
    }
    report('Unique checkout idempotency index', uniqueClientTokenIndex, uniqueClientTokenIndex ? 'client_token is protected by a unique index' : 'orders.client_token is not protected by a unique index');
    const orders = await db.execute('SELECT COUNT(*) AS count FROM orders');
    report('Orders table readable', true, `${Number(orders.rows?.[0]?.count || 0)} total order record(s); no customer details displayed`);
  }

  const foreignKeys = await db.execute('PRAGMA foreign_key_check');
  report('Foreign-key integrity', foreignKeys.rows.length === 0, foreignKeys.rows.length === 0 ? 'no violations' : `${foreignKeys.rows.length} violation(s)`);
  const journal = await db.execute('PRAGMA journal_mode');
  const journalMode = String(journal.rows?.[0]?.journal_mode || Object.values(journal.rows?.[0] || {})[0] || 'unknown');
  report('SQLite journal mode', journalMode.toLowerCase() === 'wal', journalMode);
} catch (error) {
  failures += 1;
  console.error('[FAIL] Diagnostic query failed:', error?.message || error?.name || 'Unknown error');
} finally {
  try { await db.close(); } catch (error) {
    failures += 1;
    console.error('[FAIL] Database close failed:', error?.code || error?.name || 'Unknown error');
  }
}

if (failures) {
  console.error(`\nCheckout database diagnostic finished with ${failures} failure(s).`);
  process.exitCode = 1;
} else {
  console.log('\nCheckout database diagnostic passed. This verifies schema/integrity only; it does not place an order.');
}
