import crypto from 'node:crypto';
import { createSettingsBatcher } from '../postgres/settings-batcher.mjs';
import { giftCardHash, generateGiftCardCode, validGiftCardCode, giftCardCanCover } from './gift-cards.js';
import { db, execute, executeMultiple, getRow, getRows, run, isPostgresStaging } from './database.js';
import { normalizeProductDiscountPercent, applyPercentDiscountCents, requirePurchaseCostCents, safeMinorUnitsAdd, safeMinorUnitsMultiply, safePercentOfMinorUnits } from './pricing.js';
import { isValidPhone, isValidCurrency, currencyMinorUnitFactor, currencyMinorUnitDigits } from './security.js';
import { CURRENCY_SENSITIVE_COUPON_WHERE } from './settings-inputs.js';
import { rescaleMinorUnitAmount } from './currency-scale.js';
import { DEFAULT_STORE_CURRENCY, getStoreName } from './store-config.js';
import { calculateBundleDiscount, normalizeBundleRules } from './bundle-promotions.js';
import { allocateCouponDiscountAcrossItems, maxRefundForRequestCents, availableRefundMaximumCents } from './order-return-rules.js';
import { normalizeProductGallery } from './product-images.js';
import { normalizeBankTransferConfig, buildBankTransferSnapshot, normalizeBankTransactionReference, parseBankTransferSnapshot } from './services/bank-transfer.js';
import { canCancelOpenOrder, canRequestOrderCancellation } from './order-cancellation-rules.js';
import { validCustomerApprovalPasswordHash } from './customer-approval-rules.js';
import { allocateOrderAccounting, addAccountingAmounts } from './order-accounting.js';
import { ORDER_EMAIL_LEASE_MS, ORDER_EMAIL_RETRY_WINDOW_MS, ORDER_EMAIL_MAX_ATTEMPTS, validOrderEmailPayload } from './order-email-delivery-rules.js';

// Group concurrent reads, without retaining settings between batches or caching
// any user/session data. Each missing key retains its caller's own fallback.
const batchedSetting = createSettingsBatcher(async keys => {
  const rows = await getRows('SELECT key,value FROM settings WHERE key IN ('+keys.map(()=>'?').join(',')+')',keys);
  return new Map(rows.map(row=>[row.key,row.value]));
});
const upsertSetting = (key,value) => run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,value]);

if (!isPostgresStaging) {
await execute('PRAGMA foreign_keys = ON');
await executeMultiple(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','manager','admin')),
  terms_accepted_at TEXT,
  email_verified_at TEXT,
  email_verification_required INTEGER NOT NULL DEFAULT 0 CHECK(email_verification_required IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expiry ON password_reset_tokens(expires_at_ms);
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_expiry ON email_verification_tokens(expires_at_ms);
CREATE TABLE IF NOT EXISTS account_login_limits (
  email_hash TEXT PRIMARY KEY,
  window_started_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  blocked_until_ms INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_account_login_blocked ON account_login_limits(blocked_until_ms);
CREATE TABLE IF NOT EXISTS password_reset_cooldowns (
  user_id INTEGER PRIMARY KEY,
  last_requested_at_ms INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  cart_json TEXT NOT NULL DEFAULT '[]',
  wishlist_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL DEFAULT 0,
  absolute_expires_at INTEGER NOT NULL DEFAULT 0,
  csrf_token TEXT,
  coupon_code TEXT,
  cart_revision INTEGER NOT NULL DEFAULT 0 CHECK(cart_revision >= 0),
  checkout_quote_json TEXT NOT NULL DEFAULT '',
  checkout_idempotency_key TEXT NOT NULL DEFAULT '',
  checkout_guest_token TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS mfa_login_challenges (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('setup','verify')),
  remember_me INTEGER NOT NULL DEFAULT 0 CHECK(remember_me IN (0,1)),
  next_path TEXT NOT NULL DEFAULT '/admin',
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user ON mfa_login_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expiry ON mfa_login_challenges(expires_at_ms);
CREATE TABLE IF NOT EXISTS mfa_rate_limits (
  user_id INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  window_started_at_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  PRIMARY KEY(user_id, source_hash),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(parent_id) REFERENCES categories(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  cost_price_cents INTEGER CHECK(cost_price_cents IS NULL OR cost_price_cents >= 0),
  sale_price_cents INTEGER CHECK(sale_price_cents IS NULL OR sale_price_cents >= 0),
  sale_start TEXT,
  sale_end TEXT,
  automatic_discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(automatic_discount_percent >= 0 AND automatic_discount_percent <= 90),
  sku TEXT NOT NULL UNIQUE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK(reserved_stock >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level >= 0),
  category_id INTEGER,
  tags TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at);
CREATE INDEX IF NOT EXISTS idx_products_featured_active ON products(featured, active, created_at DESC);
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  option_name TEXT NOT NULL DEFAULT 'Size',
  option_value TEXT NOT NULL,
  option_name_2 TEXT NOT NULL DEFAULT '',
  option_value_2 TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL UNIQUE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK(reserved_stock >= 0),
  image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, option_value COLLATE NOCASE, option_value_2 COLLATE NOCASE),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, image_url),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_order ON product_images(product_id, is_primary DESC, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_users_role_created ON users(role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
  value INTEGER NOT NULL CHECK(value > 0),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(min_subtotal_cents >= 0),
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  product_id INTEGER,
  published_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_stories_window ON stories(active, published_at, expires_at);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','processing','shipped','completed','cancelled')),
  payment_provider TEXT NOT NULL DEFAULT 'cash_on_delivery',
  payment_credential_fingerprint TEXT NOT NULL DEFAULT '',
  payment_reference TEXT,
  client_token TEXT UNIQUE,
  guest_access_token_hash TEXT,
  subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents >= 0),
  automatic_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(automatic_discount_cents >= 0),
  bundle_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(bundle_discount_cents >= 0),
  gift_card_id INTEGER REFERENCES gift_cards(id),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  shipping_name TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_postal_code TEXT NOT NULL,
  shipping_country TEXT NOT NULL DEFAULT 'BE',
  shipping_cents INTEGER NOT NULL DEFAULT 0 CHECK(shipping_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK(tax_cents >= 0),
  product_tax_cents INTEGER CHECK(product_tax_cents IS NULL OR product_tax_cents >= 0),
  tax_rate_bps INTEGER CHECK(tax_rate_bps IS NULL OR (tax_rate_bps >= 0 AND tax_rate_bps <= 10000)),
  tax_included INTEGER NOT NULL DEFAULT 0 CHECK(tax_included IN (0,1)),
  tax_rule_snapshot TEXT NOT NULL DEFAULT '',
  shipping_rule_snapshot TEXT NOT NULL DEFAULT '',
  customer_note TEXT NOT NULL DEFAULT '',
  terms_accepted_at TEXT,
  terms_locale TEXT NOT NULL DEFAULT 'en',
  terms_policy_hash TEXT,
  cancellation_reason TEXT NOT NULL DEFAULT '',
  cancellation_actor TEXT,
  cancelled_by_user_id INTEGER,
  cancelled_at TEXT,
  cancellation_requested_at TEXT,
  cancellation_request_reason TEXT NOT NULL DEFAULT '',
  cancellation_requested_by_user_id INTEGER,
  cancellation_request_decided_at TEXT,
  cancellation_request_decision TEXT,
  cancellation_request_decided_by_user_id INTEGER,
  reservation_expires_at TEXT,
  payment_url TEXT,
  payment_instructions_snapshot TEXT NOT NULL DEFAULT '',
  confirmation_email_sent_at TEXT,
  provider_amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(provider_amount_refunded_cents >= 0),
  provider_amount_charged_back_cents INTEGER NOT NULL DEFAULT 0 CHECK(provider_amount_charged_back_cents >= 0),
  provider_financials_checked_at TEXT,
  last_status_actor_type TEXT NOT NULL DEFAULT 'system',
  last_status_actor_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_email_created ON orders(email, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_reference ON orders(payment_reference) WHERE payment_reference IS NOT NULL;
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  variant_id INTEGER,
  variant_name TEXT NOT NULL DEFAULT '',
  variant_value TEXT NOT NULL DEFAULT '',
  variant_name_2 TEXT NOT NULL DEFAULT '',
  variant_value_2 TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  unit_cost_cents INTEGER CHECK(unit_cost_cents IS NULL OR unit_cost_cents >= 0),
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_user_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, created_at, id);
CREATE TABLE IF NOT EXISTS order_email_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('confirmation','status')),
  status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')) DEFAULT 'sending',
  recipient_email TEXT NOT NULL,
  provider_message_id TEXT,
  error_code TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '',
  provider_fingerprint TEXT NOT NULL DEFAULT '',
  provider_idempotency_key TEXT NOT NULL DEFAULT '',
  claim_token TEXT NOT NULL DEFAULT '',
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count >= 0),
  first_attempt_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(first_attempt_at_ms >= 0),
  lease_expires_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(lease_expires_at_ms >= 0),
  next_attempt_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(next_attempt_at_ms >= 0),
  attempt_day TEXT NOT NULL DEFAULT '',
  attempts_today INTEGER NOT NULL DEFAULT 1 CHECK(attempts_today >= 0),
  needs_reconciliation INTEGER NOT NULL DEFAULT 0 CHECK(needs_reconciliation IN (0,1)),
  generation INTEGER NOT NULL DEFAULT 1 CHECK(generation >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  UNIQUE(order_id, event_key),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_order_email_deliveries_day ON order_email_deliveries(created_at, status);
CREATE TABLE IF NOT EXISTS order_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  user_id INTEGER,
  request_type TEXT NOT NULL CHECK(request_type IN ('return','exchange','refund')),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','item_received','exchange_sent','refund_recorded','completed','cancelled')),
  manager_note TEXT NOT NULL DEFAULT '',
  refund_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(refund_amount_cents >= 0),
  refund_method TEXT,
  refund_reference TEXT NOT NULL DEFAULT '',
  refund_recorded_at TEXT,
  exchange_tracking_reference TEXT NOT NULL DEFAULT '',
  exchange_shipped_at TEXT,
  restocked_at TEXT,
  processed_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_returns_order_created ON order_returns(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_returns_status_created ON order_returns(status, created_at DESC);
CREATE TABLE IF NOT EXISTS return_requests (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  order_item_id INTEGER NOT NULL,
  user_id INTEGER,
  request_type TEXT NOT NULL CHECK(request_type IN ('return','exchange','refund')),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  manager_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_return_requests_status_created ON return_requests(status, created_at DESC);
CREATE TABLE IF NOT EXISTS uploaded_assets (
  path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asset_storage_quota (
  id INTEGER PRIMARY KEY CHECK(id=1),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes >= 0),
  max_bytes INTEGER NOT NULL DEFAULT 2147483648 CHECK(max_bytes > 0)
);
INSERT OR IGNORE INTO asset_storage_quota(id,used_bytes,max_bytes) VALUES(1,0,2147483648);
-- Deleting an uploaded BLOB must refund quota in the same SQLite statement.
-- This avoids SELECT->DELETE->UPDATE transaction races and prevents SQLITE_BUSY
-- failures from a long-lived read cursor on the embedded SQLite driver. The trigger
-- is idempotent by nature: one DELETE can fire it only once, and a second DELETE
-- affects zero rows and therefore cannot refund the same asset again.
CREATE TRIGGER IF NOT EXISTS uploaded_assets_quota_after_delete
AFTER DELETE ON uploaded_assets
BEGIN
  UPDATE asset_storage_quota
  SET used_bytes=MAX(0,used_bytes-COALESCE(length(OLD.data),0))
  WHERE id=1;
END;
CREATE TABLE IF NOT EXISTS peppol_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  recipient TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('preparing','submitted','reconciliation_required','rejected')),
  provider_reference TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  updated_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS gift_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  original_amount_cents INTEGER NOT NULL CHECK(original_amount_cents > 0),
  balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0 AND balance_cents <= original_amount_cents),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  expires_at TEXT,
  issued_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  FOREIGN KEY(issued_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS gift_card_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_card_id INTEGER NOT NULL,
  order_id INTEGER,
  event TEXT NOT NULL CHECK(event IN ('issue','redeem','refund')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  actor_user_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  UNIQUE(order_id,event),
  FOREIGN KEY(gift_card_id) REFERENCES gift_cards(id) ON DELETE RESTRICT,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_card_ledger_card ON gift_card_ledger(gift_card_id,created_at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
`);

// Optional customer engagement records are separate from payment and order tables.
// All new tables use idempotent DDL and explicit consent / moderation states.
await executeMultiple(`
CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 status TEXT NOT NULL CHECK(status IN ('pending','active','unsubscribed')),
 confirmation_hash TEXT, confirmation_expires_ms INTEGER,
 unsubscribe_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe ON newsletter_subscriptions(unsubscribe_hash);
CREATE TABLE IF NOT EXISTS stock_alerts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 email TEXT NOT NULL COLLATE NOCASE,
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','sending','sent')),
 confirmation_hash TEXT,confirmation_expires_ms INTEGER,notified_at TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(product_id,email)
);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_ready ON stock_alerts(product_id,status);
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 subject TEXT NOT NULL, body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
 campaign_id INTEGER NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
 email TEXT NOT NULL COLLATE NOCASE,
 status TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at TEXT,
 PRIMARY KEY(campaign_id,email)
);
CREATE TABLE IF NOT EXISTS product_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 title TEXT NOT NULL,body TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT,
 UNIQUE(product_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_status ON product_reviews(status,created_at);
CREATE INDEX IF NOT EXISTS idx_product_reviews_public ON product_reviews(product_id,status,created_at);
`);

// Settings writer must exist before startup migrations use it. Keep this declaration
// immediately after schema creation to avoid a temporal-dead-zone failure at startup.
// Idempotent column migration helper. Multiple serverless cold starts can race
// between PRAGMA table_info and ALTER TABLE. Ignore an ALTER error only if a fresh
// schema read proves another instance already added the exact target column.
async function ensureColumn(table,column,sql){
  if(!/^[a-z_][a-z0-9_]*$/i.test(table)||!/^[a-z_][a-z0-9_]*$/i.test(column)) throw new Error('Invalid migration identifier');
  const columns=await getRows(`PRAGMA table_info(${table})`);
  if(columns.some(item=>item.name===column)) return;
  try { await execute(sql); }
  catch(error){
    const refreshed=await getRows(`PRAGMA table_info(${table})`);
    if(!refreshed.some(item=>item.name===column)) throw error;
  }
}

// Backward-compatible migrations for fields added after the original checkout schema.
await ensureColumn('orders','customer_phone',"ALTER TABLE orders ADD COLUMN customer_phone TEXT NOT NULL DEFAULT ''");
await ensureColumn('orders','payment_credential_fingerprint',"ALTER TABLE orders ADD COLUMN payment_credential_fingerprint TEXT NOT NULL DEFAULT ''");
await ensureColumn('orders','automatic_discount_cents',"ALTER TABLE orders ADD COLUMN automatic_discount_cents INTEGER NOT NULL DEFAULT 0");
await ensureColumn('orders','confirmation_email_sent_at','ALTER TABLE orders ADD COLUMN confirmation_email_sent_at TEXT');
await ensureColumn('orders','provider_amount_refunded_cents','ALTER TABLE orders ADD COLUMN provider_amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK(provider_amount_refunded_cents >= 0)');
await ensureColumn('orders','provider_amount_charged_back_cents','ALTER TABLE orders ADD COLUMN provider_amount_charged_back_cents INTEGER NOT NULL DEFAULT 0 CHECK(provider_amount_charged_back_cents >= 0)');
await ensureColumn('orders','provider_financials_checked_at','ALTER TABLE orders ADD COLUMN provider_financials_checked_at TEXT');
// Older local databases may predate checkout idempotency. The checkout POST reads
// orders.client_token before attempting any reservation; CREATE TABLE IF NOT EXISTS
// cannot add that column to an existing orders table, so migrate it explicitly.
await ensureColumn('orders','client_token','ALTER TABLE orders ADD COLUMN client_token TEXT');
// Keep idempotency unique on both fresh and upgraded databases. Multiple NULL/empty
// legacy values remain valid; every new checkout token must be unique.
await execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_token_unique ON orders(client_token) WHERE client_token IS NOT NULL AND client_token <> ''");
await ensureColumn('sessions','checkout_quote_json',"ALTER TABLE sessions ADD COLUMN checkout_quote_json TEXT NOT NULL DEFAULT ''");
await ensureColumn('sessions','checkout_idempotency_key',"ALTER TABLE sessions ADD COLUMN checkout_idempotency_key TEXT NOT NULL DEFAULT ''");
await ensureColumn('sessions','checkout_guest_token',"ALTER TABLE sessions ADD COLUMN checkout_guest_token TEXT NOT NULL DEFAULT ''");
await ensureColumn('users','mfa_secret','ALTER TABLE users ADD COLUMN mfa_secret TEXT');
await ensureColumn('users','mfa_enabled','ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mfa_enabled IN (0,1))');
await ensureColumn('users','mfa_recovery_codes_hash','ALTER TABLE users ADD COLUMN mfa_recovery_codes_hash TEXT');
await ensureColumn('users','mfa_last_totp_step','ALTER TABLE users ADD COLUMN mfa_last_totp_step INTEGER');
await ensureColumn('users','email_verified_at','ALTER TABLE users ADD COLUMN email_verified_at TEXT');
await ensureColumn('users','email_verification_required','ALTER TABLE users ADD COLUMN email_verification_required INTEGER NOT NULL DEFAULT 0 CHECK(email_verification_required IN (0,1))');
await ensureColumn('sessions','last_activity_at','ALTER TABLE sessions ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0');
await ensureColumn('sessions','absolute_expires_at','ALTER TABLE sessions ADD COLUMN absolute_expires_at INTEGER NOT NULL DEFAULT 0');
// Existing accounts default to verification_required=0; only new mail-enabled registrations are pending.
await run('UPDATE sessions SET last_activity_at=? WHERE last_activity_at=0',[Date.now()]);
await run('UPDATE sessions SET absolute_expires_at=created_at+2592000000 WHERE absolute_expires_at=0');

// Small forward-only migrations for databases created by earlier versions.
// A genuine SQL error still fails startup unless another concurrent instance created the column.
const forwardMigrations = [
  { table:'order_email_deliveries', column:'payload_json', sql:"ALTER TABLE order_email_deliveries ADD COLUMN payload_json TEXT NOT NULL DEFAULT ''" },
  { table:'order_email_deliveries', column:'provider_fingerprint', sql:"ALTER TABLE order_email_deliveries ADD COLUMN provider_fingerprint TEXT NOT NULL DEFAULT ''" },
  { table:'order_email_deliveries', column:'provider_idempotency_key', sql:"ALTER TABLE order_email_deliveries ADD COLUMN provider_idempotency_key TEXT NOT NULL DEFAULT ''" },
  { table:'order_email_deliveries', column:'claim_token', sql:"ALTER TABLE order_email_deliveries ADD COLUMN claim_token TEXT NOT NULL DEFAULT ''" },
  { table:'order_email_deliveries', column:'attempt_count', sql:'ALTER TABLE order_email_deliveries ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count >= 0)' },
  { table:'order_email_deliveries', column:'first_attempt_at_ms', sql:'ALTER TABLE order_email_deliveries ADD COLUMN first_attempt_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(first_attempt_at_ms >= 0)' },
  { table:'order_email_deliveries', column:'lease_expires_at_ms', sql:'ALTER TABLE order_email_deliveries ADD COLUMN lease_expires_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(lease_expires_at_ms >= 0)' },
  { table:'order_email_deliveries', column:'next_attempt_at_ms', sql:'ALTER TABLE order_email_deliveries ADD COLUMN next_attempt_at_ms INTEGER NOT NULL DEFAULT 0 CHECK(next_attempt_at_ms >= 0)' },
  { table:'order_email_deliveries', column:'attempt_day', sql:"ALTER TABLE order_email_deliveries ADD COLUMN attempt_day TEXT NOT NULL DEFAULT ''" },
  { table:'order_email_deliveries', column:'attempts_today', sql:'ALTER TABLE order_email_deliveries ADD COLUMN attempts_today INTEGER NOT NULL DEFAULT 1 CHECK(attempts_today >= 0)' },
  { table:'order_email_deliveries', column:'needs_reconciliation', sql:'ALTER TABLE order_email_deliveries ADD COLUMN needs_reconciliation INTEGER NOT NULL DEFAULT 0 CHECK(needs_reconciliation IN (0,1))' },
  { table:'order_email_deliveries', column:'generation', sql:'ALTER TABLE order_email_deliveries ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK(generation >= 1)' },
  { table:'users', column:'full_name', sql:"ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''" },
  { table:'users', column:'terms_accepted_at', sql:'ALTER TABLE users ADD COLUMN terms_accepted_at TEXT' },
  { table:'products', column:'reserved_stock', sql:'ALTER TABLE products ADD COLUMN reserved_stock INTEGER NOT NULL DEFAULT 0' },
  { table:'sessions', column:'wishlist_json', sql:"ALTER TABLE sessions ADD COLUMN wishlist_json TEXT NOT NULL DEFAULT '[]'" },
  { table:'sessions', column:'coupon_code', sql:'ALTER TABLE sessions ADD COLUMN coupon_code TEXT' },
  { table:'sessions', column:'cart_revision', sql:'ALTER TABLE sessions ADD COLUMN cart_revision INTEGER NOT NULL DEFAULT 0 CHECK(cart_revision >= 0)' },
  { table:'orders', column:'reservation_expires_at', sql:'ALTER TABLE orders ADD COLUMN reservation_expires_at TEXT' },
  { table:'orders', column:'shipping_country', sql:"ALTER TABLE orders ADD COLUMN shipping_country TEXT NOT NULL DEFAULT 'BE'" },
  { table:'orders', column:'shipping_cents', sql:"ALTER TABLE orders ADD COLUMN shipping_cents INTEGER NOT NULL DEFAULT 0" },
  { table:'orders', column:'tax_cents', sql:'ALTER TABLE orders ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0' },
  { table:'orders', column:'product_tax_cents', sql:'ALTER TABLE orders ADD COLUMN product_tax_cents INTEGER CHECK(product_tax_cents IS NULL OR product_tax_cents >= 0)' },
  { table:'orders', column:'tax_rate_bps', sql:'ALTER TABLE orders ADD COLUMN tax_rate_bps INTEGER' },
  { table:'orders', column:'tax_included', sql:'ALTER TABLE orders ADD COLUMN tax_included INTEGER NOT NULL DEFAULT 0' },
  { table:'orders', column:'tax_rule_snapshot', sql:"ALTER TABLE orders ADD COLUMN tax_rule_snapshot TEXT NOT NULL DEFAULT ''" },
  { table:'orders', column:'shipping_rule_snapshot', sql:"ALTER TABLE orders ADD COLUMN shipping_rule_snapshot TEXT NOT NULL DEFAULT ''" },
  { table:'orders', column:'customer_note', sql:"ALTER TABLE orders ADD COLUMN customer_note TEXT NOT NULL DEFAULT ''" },
  { table:'orders', column:'terms_accepted_at', sql:'ALTER TABLE orders ADD COLUMN terms_accepted_at TEXT' },
  { table:'orders', column:'gift_card_id', sql:"ALTER TABLE orders ADD COLUMN gift_card_id INTEGER REFERENCES gift_cards(id)" },
  { table:'orders', column:'bundle_discount_cents', sql:"ALTER TABLE orders ADD COLUMN bundle_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(bundle_discount_cents >= 0)" },
  { table:'orders', column:'terms_locale', sql:"ALTER TABLE orders ADD COLUMN terms_locale TEXT NOT NULL DEFAULT 'en'" },
  { table:'orders', column:'terms_policy_hash', sql:'ALTER TABLE orders ADD COLUMN terms_policy_hash TEXT' },
  { table:'orders', column:'cancellation_reason', sql:"ALTER TABLE orders ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT ''" },
  { table:'orders', column:'cancellation_actor', sql:'ALTER TABLE orders ADD COLUMN cancellation_actor TEXT' },
  { table:'orders', column:'cancelled_by_user_id', sql:'ALTER TABLE orders ADD COLUMN cancelled_by_user_id INTEGER' },
  { table:'orders', column:'cancelled_at', sql:'ALTER TABLE orders ADD COLUMN cancelled_at TEXT' },
  { table:'orders', column:'cancellation_requested_at', sql:'ALTER TABLE orders ADD COLUMN cancellation_requested_at TEXT' },
  { table:'orders', column:'cancellation_request_reason', sql:"ALTER TABLE orders ADD COLUMN cancellation_request_reason TEXT NOT NULL DEFAULT ''" },
  { table:'orders', column:'cancellation_requested_by_user_id', sql:'ALTER TABLE orders ADD COLUMN cancellation_requested_by_user_id INTEGER' },
  { table:'orders', column:'cancellation_request_decided_at', sql:'ALTER TABLE orders ADD COLUMN cancellation_request_decided_at TEXT' },
  { table:'orders', column:'cancellation_request_decision', sql:'ALTER TABLE orders ADD COLUMN cancellation_request_decision TEXT' },
  { table:'orders', column:'cancellation_request_decided_by_user_id', sql:'ALTER TABLE orders ADD COLUMN cancellation_request_decided_by_user_id INTEGER' },
  { table:'orders', column:'payment_url', sql:'ALTER TABLE orders ADD COLUMN payment_url TEXT' },
  { table:'orders', column:'payment_instructions_snapshot', sql:"ALTER TABLE orders ADD COLUMN payment_instructions_snapshot TEXT NOT NULL DEFAULT ''" },
  { table:'orders', column:'guest_access_token_hash', sql:'ALTER TABLE orders ADD COLUMN guest_access_token_hash TEXT' },
  { table:'orders', column:'confirmation_email_sent_at', sql:'ALTER TABLE orders ADD COLUMN confirmation_email_sent_at TEXT' },
  { table:'orders', column:'last_status_actor_type', sql:"ALTER TABLE orders ADD COLUMN last_status_actor_type TEXT NOT NULL DEFAULT 'system'" },
  { table:'orders', column:'last_status_actor_user_id', sql:'ALTER TABLE orders ADD COLUMN last_status_actor_user_id INTEGER' },
  { table:'order_returns', column:'exchange_tracking_reference', sql:"ALTER TABLE order_returns ADD COLUMN exchange_tracking_reference TEXT NOT NULL DEFAULT ''" },
  { table:'order_returns', column:'exchange_shipped_at', sql:'ALTER TABLE order_returns ADD COLUMN exchange_shipped_at TEXT' },
  { table:'products', column:'automatic_discount_percent', sql:'ALTER TABLE products ADD COLUMN automatic_discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(automatic_discount_percent >= 0 AND automatic_discount_percent <= 90)' },
  { table:'products', column:'cost_price_cents', sql:'ALTER TABLE products ADD COLUMN cost_price_cents INTEGER CHECK(cost_price_cents IS NULL OR cost_price_cents >= 0)' },
  { table:'products', column:'reorder_level', sql:'ALTER TABLE products ADD COLUMN reorder_level INTEGER NOT NULL DEFAULT 5 CHECK(reorder_level >= 0)' },
  // These fields are required by the variants inventory queries and indexes below.
  // Older databases may already have product_variants without the newer inventory columns.
  { table:'product_variants', column:'option_name', sql:"ALTER TABLE product_variants ADD COLUMN option_name TEXT NOT NULL DEFAULT 'Size'" },
  { table:'product_variants', column:'option_name_2', sql:"ALTER TABLE product_variants ADD COLUMN option_name_2 TEXT NOT NULL DEFAULT ''" },
  { table:'product_variants', column:'option_value_2', sql:"ALTER TABLE product_variants ADD COLUMN option_value_2 TEXT NOT NULL DEFAULT ''" },
  { table:'product_variants', column:'image_url', sql:"ALTER TABLE product_variants ADD COLUMN image_url TEXT NOT NULL DEFAULT ''" },
  { table:'product_variants', column:'reserved_stock', sql:'ALTER TABLE product_variants ADD COLUMN reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK(reserved_stock >= 0)' },
  { table:'product_variants', column:'sort_order', sql:'ALTER TABLE product_variants ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0)' },
  { table:'product_variants', column:'active', sql:'ALTER TABLE product_variants ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))' },
  { table:'product_variants', column:'updated_at', sql:"ALTER TABLE product_variants ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''" },
  { table:'order_items', column:'variant_id', sql:'ALTER TABLE order_items ADD COLUMN variant_id INTEGER' },
  { table:'order_items', column:'variant_name', sql:"ALTER TABLE order_items ADD COLUMN variant_name TEXT NOT NULL DEFAULT ''" },
  { table:'order_items', column:'variant_value', sql:"ALTER TABLE order_items ADD COLUMN variant_value TEXT NOT NULL DEFAULT ''" },
  { table:'order_items', column:'variant_name_2', sql:"ALTER TABLE order_items ADD COLUMN variant_name_2 TEXT NOT NULL DEFAULT ''" },
  { table:'order_items', column:'variant_value_2', sql:"ALTER TABLE order_items ADD COLUMN variant_value_2 TEXT NOT NULL DEFAULT ''" },
  { table:'order_items', column:'unit_cost_cents', sql:'ALTER TABLE order_items ADD COLUMN unit_cost_cents INTEGER CHECK(unit_cost_cents IS NULL OR unit_cost_cents >= 0)' },
  { table:'password_reset_tokens', column:'attempts', sql:'ALTER TABLE password_reset_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0)' },
  { table:'categories', column:'parent_id', sql:'ALTER TABLE categories ADD COLUMN parent_id INTEGER' },
  { table:'categories', column:'description', sql:"ALTER TABLE categories ADD COLUMN description TEXT NOT NULL DEFAULT ''" },
  { table:'categories', column:'image_url', sql:"ALTER TABLE categories ADD COLUMN image_url TEXT NOT NULL DEFAULT ''" },
  { table:'categories', column:'sort_order', sql:'ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0' },
  { table:'categories', column:'active', sql:'ALTER TABLE categories ADD COLUMN active INTEGER NOT NULL DEFAULT 1' }
];
for (const migration of forwardMigrations) await ensureColumn(migration.table,migration.column,migration.sql);

// Expand the return lifecycle without losing existing customer requests in a database
// that may have run an earlier candidate build. The table has no inbound foreign keys.
const orderReturnsTableSchema = await getRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='order_returns'");
if (orderReturnsTableSchema?.sql && !String(orderReturnsTableSchema.sql).includes('exchange_sent')) {
  const tx = await db.transaction('write');
  try {
    await execute(`CREATE TABLE order_returns_v290_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, order_item_id INTEGER NOT NULL, user_id INTEGER,
      request_type TEXT NOT NULL CHECK(request_type IN ('return','exchange','refund')), quantity INTEGER NOT NULL CHECK(quantity > 0),
      reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','item_received','exchange_sent','refund_recorded','completed','cancelled')),
      manager_note TEXT NOT NULL DEFAULT '', refund_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(refund_amount_cents >= 0),
      refund_method TEXT, refund_reference TEXT NOT NULL DEFAULT '', refund_recorded_at TEXT,
      exchange_tracking_reference TEXT NOT NULL DEFAULT '', exchange_shipped_at TEXT, restocked_at TEXT, processed_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    )`,tx);
    await execute(`INSERT INTO order_returns_v290_migration(id,order_id,order_item_id,user_id,request_type,quantity,reason,status,manager_note,refund_amount_cents,refund_method,refund_reference,refund_recorded_at,exchange_tracking_reference,exchange_shipped_at,restocked_at,processed_by_user_id,created_at,updated_at)
      SELECT id,order_id,order_item_id,user_id,request_type,quantity,reason,status,manager_note,refund_amount_cents,refund_method,refund_reference,refund_recorded_at,exchange_tracking_reference,exchange_shipped_at,restocked_at,processed_by_user_id,created_at,updated_at FROM order_returns`,tx);
    await execute('DROP TABLE order_returns',tx);
    await execute('ALTER TABLE order_returns_v290_migration RENAME TO order_returns',tx);
    await execute('CREATE INDEX IF NOT EXISTS idx_order_returns_order_created ON order_returns(order_id,created_at DESC)',tx);
    await execute('CREATE INDEX IF NOT EXISTS idx_order_returns_status_created ON order_returns(status,created_at DESC)',tx);
    await tx.commit();
  } catch(error) {try{await tx.rollback();}catch{} throw error;}
}

// Status history is database-triggered so status changes from every code path are visible
// to the customer; history is written in the same SQLite statement as the status change.
await executeMultiple(`
CREATE TRIGGER IF NOT EXISTS orders_status_history_after_insert
AFTER INSERT ON orders
BEGIN
  INSERT INTO order_status_history(order_id,from_status,to_status,actor_type,actor_user_id,note,created_at)
  VALUES(NEW.id,NULL,NEW.status,COALESCE(NEW.last_status_actor_type,'system'),NEW.last_status_actor_user_id,'Order placed',COALESCE(NEW.created_at,datetime('now')));
END;
CREATE TRIGGER IF NOT EXISTS orders_status_history_after_update
AFTER UPDATE OF status ON orders
WHEN NEW.status<>OLD.status
BEGIN
  INSERT INTO order_status_history(order_id,from_status,to_status,actor_type,actor_user_id,note,created_at)
  VALUES(NEW.id,OLD.status,NEW.status,COALESCE(NEW.last_status_actor_type,'system'),NEW.last_status_actor_user_id,
    CASE WHEN NEW.status='cancelled' THEN COALESCE(NULLIF(NEW.cancellation_reason,''),'Order cancelled') ELSE '' END,
    COALESCE(NEW.updated_at,datetime('now')));
END;
`);
await run(`INSERT INTO order_status_history(order_id,from_status,to_status,actor_type,actor_user_id,note,created_at)
  SELECT o.id,NULL,o.status,COALESCE(o.last_status_actor_type,'system'),o.last_status_actor_user_id,'History initialized from existing order',o.created_at
  FROM orders o WHERE NOT EXISTS(SELECT 1 FROM order_status_history h WHERE h.order_id=o.id)`);

// Existing releases imposed UNIQUE(product_id, option_value), which made the same
// size impossible in two colours. Rebuild only that legacy table in one write
// transaction while preserving IDs/SKUs/reservations/order-item references.
const legacyVariantUnique = /UNIQUE\s*\(\s*product_id\s*,\s*option_value\s+COLLATE\s+NOCASE\s*\)/i;
const compositeVariantUnique = /UNIQUE\s*\(\s*product_id\s*,\s*option_value\s+COLLATE\s+NOCASE\s*,\s*option_value_2\s+COLLATE\s+NOCASE\s*\)/i;
const variantTableSchema = await getRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_variants'");
if (legacyVariantUnique.test(String(variantTableSchema?.sql||''))) {
  const tx = await db.transaction('write');
  try {
    // The initial read may predate another instance's completed upgrade. Recheck
    // after acquiring the write lock, before copying or replacing any table.
    const lockedSchema=String((await getRow("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_variants'",[],tx))?.sql||'');
    if (!legacyVariantUnique.test(lockedSchema)) {
      if (!compositeVariantUnique.test(lockedSchema)) throw new Error('VARIANT_MIGRATION_SCHEMA_UNEXPECTED');
      await tx.commit();
    } else {
    await execute('DROP TABLE IF EXISTS product_variants_v289_migration',tx);
    await execute(`CREATE TABLE product_variants_v289_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      option_name TEXT NOT NULL DEFAULT 'Size',
      option_value TEXT NOT NULL,
      option_name_2 TEXT NOT NULL DEFAULT '',
      option_value_2 TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL UNIQUE,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      reserved_stock INTEGER NOT NULL DEFAULT 0 CHECK(reserved_stock >= 0),
      image_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order >= 0),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, option_value COLLATE NOCASE, option_value_2 COLLATE NOCASE),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    )`,tx);
    await execute(`INSERT INTO product_variants_v289_migration(id,product_id,option_name,option_value,option_name_2,option_value_2,sku,stock,reserved_stock,image_url,sort_order,active,created_at,updated_at)
      SELECT id,product_id,option_name,option_value,COALESCE(option_name_2,''),COALESCE(option_value_2,''),sku,stock,reserved_stock,COALESCE(image_url,''),sort_order,active,created_at,updated_at FROM product_variants`,tx);
    await execute('DROP TABLE product_variants',tx);
    await execute('ALTER TABLE product_variants_v289_migration RENAME TO product_variants',tx);
    await execute('CREATE INDEX IF NOT EXISTS idx_product_variants_product_active ON product_variants(product_id, active, sort_order)',tx);
    await tx.commit();
    }
  } catch (error) {
    try { await tx.rollback(); } catch {}
    // Constraint, storage and copy failures must fail startup. Concurrent
    // completion is handled explicitly under the lock above, not by swallowing errors.
    throw error;
  }
}
// Backfill the legacy product cover as the first gallery item without rewriting product rows.
await run(`INSERT OR IGNORE INTO product_images(product_id,image_url,alt_text,sort_order,is_primary)
  SELECT id,image_url,name,0,1 FROM products WHERE TRIM(COALESCE(image_url,''))<>''`);
await run(`UPDATE product_images SET is_primary=CASE WHEN image_url=(SELECT p.image_url FROM products p WHERE p.id=product_images.product_id) AND TRIM(COALESCE((SELECT p.image_url FROM products p WHERE p.id=product_images.product_id),''))<>'' THEN 1 ELSE 0 END`);
// Legacy rows can exist for a product whose cover URL was blank or stale. Promote
// the first surviving gallery row in that case, before enforcing one primary row.
await run(`UPDATE product_images SET is_primary=1 WHERE id IN (
  SELECT first_image.id FROM product_images first_image
  WHERE NOT EXISTS (SELECT 1 FROM product_images marked WHERE marked.product_id=first_image.product_id AND marked.is_primary=1)
    AND first_image.id=(SELECT candidate.id FROM product_images candidate WHERE candidate.product_id=first_image.product_id ORDER BY candidate.sort_order,candidate.id LIMIT 1)
)`);
await run(`UPDATE products SET image_url=(
  SELECT image_url FROM product_images WHERE product_id=products.id AND is_primary=1 ORDER BY sort_order,id LIMIT 1
) WHERE EXISTS (SELECT 1 FROM product_images WHERE product_id=products.id AND is_primary=1)
  AND (TRIM(COALESCE(image_url,''))='' OR NOT EXISTS (SELECT 1 FROM product_images WHERE product_id=products.id AND image_url=products.image_url))`);
// A product has zero or one explicit primary gallery row. The migration above makes
// existing databases consistent before this idempotent partial unique index is added.
await execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_one_primary ON product_images(product_id) WHERE is_primary=1');
// Enforce the six-image cap in SQLite too, not only in the Manager form/server.
// These triggers are safe to run at every startup and still allow legacy galleries
// with more than six rows to be reduced with the per-image delete action.
await execute(`CREATE TRIGGER IF NOT EXISTS trg_product_images_max_six_insert
  BEFORE INSERT ON product_images
  WHEN (SELECT COUNT(*) FROM product_images WHERE product_id=NEW.product_id)>=6
  BEGIN SELECT RAISE(ABORT,'IMAGE_GALLERY_LIMIT'); END`);
await execute(`CREATE TRIGGER IF NOT EXISTS trg_product_images_max_six_move
  BEFORE UPDATE OF product_id ON product_images
  WHEN NEW.product_id<>OLD.product_id AND (SELECT COUNT(*) FROM product_images WHERE product_id=NEW.product_id)>=6
  BEGIN SELECT RAISE(ABORT,'IMAGE_GALLERY_LIMIT'); END`);
// Indexes that depend on post-schema fields must be created only after all forward
// migrations have completed, otherwise an existing database can fail during startup.
await execute('CREATE INDEX IF NOT EXISTS idx_categories_parent_sort ON categories(parent_id, active, sort_order, name)');
await execute('CREATE INDEX IF NOT EXISTS idx_product_variants_product_active ON product_variants(product_id, active, sort_order)');
await execute('CREATE INDEX IF NOT EXISTS idx_product_images_product_order ON product_images(product_id, is_primary DESC, sort_order, id)');
await run("UPDATE product_variants SET updated_at=datetime('now') WHERE updated_at=''");

// Keep the image BLOB budget below Turso Free's published 5 GB database cap.
// Reconcile one time for databases created by previous versions before enabling uploads.
await run('UPDATE asset_storage_quota SET max_bytes=MIN(max_bytes,2147483648) WHERE id=1');
if ((await getSetting('image_quota_reconciled_v272','0')) !== '1') {
  const imageBytes = Number((await getRow('SELECT COALESCE(SUM(length(data)),0) AS total_bytes FROM uploaded_assets'))?.total_bytes || 0);
  await run('UPDATE asset_storage_quota SET used_bytes=? WHERE id=1',[imageBytes]);
  await upsertSetting('image_quota_reconciled_v272','1');
}

if ((await getSetting('prices_include_tax','')) === '') {
  await upsertSetting('prices_include_tax', process.env.PRICES_INCLUDE_TAX === 'true' ? '1' : '0');
}

// One-time migration from the old storewide setting to each existing product.
// This preserves a previously configured promotion while moving control to per-product discounts.
if ((await getSetting('legacy_storewide_discount_migrated','0')) !== '1') {
  const legacy = Number(await getSetting('automatic_discount_percent','0'));
  const safeLegacy = normalizeProductDiscountPercent(legacy);
  if (safeLegacy > 0) await run('UPDATE products SET automatic_discount_percent=? WHERE automatic_discount_percent=0',[safeLegacy]);
  await upsertSetting('legacy_storewide_discount_migrated', '1');
}

}

const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const escapeLike = value => String(value ?? '').replace(/!/g,'!!').replace(/%/g,'!%').replace(/_/g,'!_');

if (isPostgresStaging) {
  const defaults = new Map([
    ['store_name',getStoreName(process.env.STORE_NAME)],
    ['ai_enabled','0'],['market_setup_mode','standard'],
    ['payment_mode','cash_on_delivery'],['payment_provider','none'],
    ['payment_merchant_country',''],['bank_contact_name',''],
    ['bank_contact_email',''],['bank_contact_phone',''],['bank_contact_reference','']
  ]);
  const keys=[...defaults.keys(),'currency'];
  const existing=new Set((await getRows('SELECT key FROM settings WHERE key IN ('+keys.map(()=>'?').join(',')+')',keys)).map(row=>row.key));
  if(!existing.has('currency')){
    const counts=await Promise.all([getRow('SELECT COUNT(*) AS c FROM products'),getRow('SELECT COUNT(*) AS c FROM orders'),getRow('SELECT COUNT(*) AS c FROM coupons')]);
    const configured=String(process.env.STORE_CURRENCY||DEFAULT_STORE_CURRENCY).toUpperCase();
    defaults.set('currency',counts.some(row=>Number(row?.c||0)>0)?'EUR':(isValidCurrency(configured)?configured:'EUR'));
  }
  const missing=[...defaults].filter(([key])=>!existing.has(key));
  if(missing.length) {
    await db.batch(missing.map(([key,value])=>({sql:'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',args:[key,value]})),'write');
  }
} else {
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['store_name'])) await upsertSetting('store_name', getStoreName(process.env.STORE_NAME));
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['currency'])) {
  // Earlier releases stored prices as EUR minor units without always persisting an explicit currency.
  // If business data already exists, preserve the historical EUR interpretation rather than applying an env var to old money.
  const [products,orders,coupons]=await Promise.all([getRow('SELECT COUNT(*) AS c FROM products'),getRow('SELECT COUNT(*) AS c FROM orders'),getRow('SELECT COUNT(*) AS c FROM coupons')]);
  const hasBusinessData=[products,orders,coupons].some(row=>Number(row?.c||0)>0);
  const configured=String(process.env.STORE_CURRENCY||DEFAULT_STORE_CURRENCY).toUpperCase();
  await upsertSetting('currency',hasBusinessData?'EUR':(isValidCurrency(configured)?configured:'EUR'));
}
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['ai_enabled'])) await upsertSetting('ai_enabled', '0');
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['market_setup_mode'])) await upsertSetting('market_setup_mode', 'standard');
// Payment defaults are inserted once. Never force COD on each startup: doing so would
// silently overwrite a Manager's explicitly saved checkout preference. The runtime
// still keeps card checkout disabled until a supported provider passes all readiness gates.
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['payment_mode'])) await upsertSetting('payment_mode','cash_on_delivery');
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['payment_provider'])) await upsertSetting('payment_provider','none');
if (!await getRow('SELECT 1 FROM settings WHERE key=?',['payment_merchant_country'])) await upsertSetting('payment_merchant_country','');
for (const key of ['bank_contact_name','bank_contact_email','bank_contact_phone','bank_contact_reference']) {
  if (!await getRow('SELECT 1 FROM settings WHERE key=?',[key])) await upsertSetting(key,'');
}

}

if (process.env.SEED_DEMO_DATA === 'true' && Number((await getRow('SELECT COUNT(*) AS c FROM categories')).c) === 0) {
  for (const name of ['New arrivals', 'Accessories', 'Clothing', 'Home', 'Technology']) await run('INSERT INTO categories(name,slug) VALUES(?,?)',[name,slugify(name)]);
}
if (process.env.SEED_DEMO_DATA === 'true' && Number((await getRow('SELECT COUNT(*) AS c FROM products')).c) === 0) {
  const category = async (slug) => (await getRow('SELECT id FROM categories WHERE slug=?',[slug]))?.id || null;
  const insert = `INSERT INTO products(name,slug,short_description,description,image_url,price_cents,sale_price_cents,sale_start,sale_end,sku,stock,category_id,tags,featured,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const start = new Date(Date.now() - 2 * 86400000).toISOString();
  const end = new Date(Date.now() + 10 * 86400000).toISOString();
  await run(insert,['Astra Everyday Backpack','astra-everyday-backpack','A clean everyday carry for work, study and travel.','A versatile everyday backpack designed around a simple silhouette, practical organization and comfortable carry.','/assets/product-1.svg',8900,6900,start,end,'ASTRA-001',24,await category('fashion'),'bag,travel,work',1,1]);
  await run(insert,['Nova Desk Lamp','nova-desk-lamp','Warm, adjustable light for focused work.','A minimal desk light with an adjustable angle and a soft warm mode for evenings.','/assets/product-2.svg',5900,null,null,null,'NOVA-002',40,await category('home'),'desk,home,light',1,1]);
  await run(insert,['Core Stainless Bottle','core-stainless-bottle','Simple, durable and made for daily use.','A reusable stainless bottle with a clean shape and an everyday carry size.','/assets/product-3.svg',3200,2790,null,null,'CORE-003',60,await category('fashion'),'bottle,travel',0,1]);
  await run(insert,['Studio Cable Kit','studio-cable-kit','An organized kit for everyday devices.','A compact cable kit for home and travel organization.','/assets/product-4.svg',2490,null,null,null,'STUDIO-004',18,await category('electronics'),'desk,tech',1,1]);
}

export async function cleanupSessions() {
  const now=Date.now(), idleMs=2*60*60*1000, absoluteMs=30*24*60*60*1000, loginWindowMs=15*60*1000;
  if(isPostgresStaging){
    // One transaction rather than four independently serialized transactions.
    await db.batch([
      {sql:'DELETE FROM sessions WHERE expires_at<=? OR (last_activity_at>0 AND last_activity_at<=?) OR (absolute_expires_at>0 AND absolute_expires_at<=?)',args:[now,now-idleMs,now]},
      {sql:'DELETE FROM account_login_limits WHERE window_started_at_ms<=? AND blocked_until_ms<=?',args:[now-loginWindowMs,now]},
      {sql:'DELETE FROM email_verification_tokens WHERE expires_at_ms<=?',args:[now]},
      {sql:'DELETE FROM password_reset_tokens WHERE expires_at_ms<=?',args:[now]}
    ],'write');
    return;
  }
  await run('DELETE FROM sessions WHERE expires_at<=? OR (last_activity_at>0 AND last_activity_at<=?) OR (absolute_expires_at>0 AND absolute_expires_at<=?)',[now,now-idleMs,now]);
  // Bound the lifetime of ephemeral authentication rows. Without this cleanup,
  // random-email login attempts and abandoned verification/reset links can grow
  // these tables indefinitely on a public store.
  await run('DELETE FROM account_login_limits WHERE window_started_at_ms<=? AND blocked_until_ms<=?',[now-loginWindowMs,now]);
  await run('DELETE FROM email_verification_tokens WHERE expires_at_ms<=?',[now]);
  await run('DELETE FROM password_reset_tokens WHERE expires_at_ms<=?',[now]);
}
export async function createSession(userId = null, maxAgeMs = 2*60*60*1000) {
  const id = crypto.randomBytes(32).toString('base64url');
  const checkoutIdempotencyKey=crypto.randomBytes(32).toString('base64url');
  const checkoutGuestToken=crypto.randomBytes(32).toString('base64url');
  const now=Date.now(), absoluteExpiresAt=now+30*24*60*60*1000, expiresAt=Math.min(now+Math.max(1000,Number(maxAgeMs)||2*60*60*1000),absoluteExpiresAt);
  await run('INSERT INTO sessions(id,user_id,created_at,expires_at,last_activity_at,absolute_expires_at,checkout_idempotency_key,checkout_guest_token) VALUES(?,?,?,?,?,?,?,?)',[id,userId,now,expiresAt,now,absoluteExpiresAt,checkoutIdempotencyKey,checkoutGuestToken]);
  return id;
}
// Authentication grants must be checked in the same SQL statement that creates
// the session. Password replacement and session revocation are atomic writes.
function credentialArgs(proof) {
  if (!proof || typeof proof.passwordHash !== 'string' || !proof.passwordHash ||
      typeof proof.email !== 'string' || !['customer','admin','manager'].includes(proof.role)) {
    throw new Error('AUTH_CREDENTIAL_PROOF_REQUIRED');
  }
  return [proof.passwordHash,proof.email,proof.role];
}
export async function createAuthenticatedSession(userId, proof) {
  const args=credentialArgs(proof);
  const id=crypto.randomBytes(32).toString('base64url');
  const now=Date.now();
  const result=await run(`INSERT INTO sessions(id,user_id,created_at,expires_at,last_activity_at,absolute_expires_at,checkout_idempotency_key,checkout_guest_token)
    SELECT ?,id,?,?,?,?,?,? FROM users WHERE id=? AND password_hash=? AND email=? COLLATE BINARY AND role=?
    AND (role<>'manager' OR COALESCE(mfa_enabled,0)=1)
    AND (role<>'customer' OR email_verification_required=0 OR email_verified_at IS NOT NULL)`,
    [id,now,now+2*60*60*1000,now,now+30*24*60*60*1000,crypto.randomBytes(32).toString('base64url'),crypto.randomBytes(32).toString('base64url'),userId,...args]);
  if(result.changes!==1) throw new Error('AUTH_CREDENTIALS_CHANGED');
  return id;
}
export async function rotateSessionCheckoutCredentials(id, expectedCurrentKey=null) {
  const sessionId=String(id||'');
  if(!sessionId) return null;
  if(expectedCurrentKey!==null&&!/^[A-Za-z0-9_-]{32,64}$/.test(String(expectedCurrentKey))) return null;
  const nextKey=crypto.randomBytes(32).toString('base64url');
  const nextGuest=crypto.randomBytes(32).toString('base64url');
  const now=Date.now();
  const expectedClause=expectedCurrentKey===null?'':' AND checkout_idempotency_key=?';
  const params=[nextKey,nextGuest,now,now+2*60*60*1000,sessionId,now];
  if(expectedCurrentKey!==null) params.push(String(expectedCurrentKey));
  const changed=await run(`UPDATE sessions SET checkout_idempotency_key=?,checkout_guest_token=?,last_activity_at=?,expires_at=MIN(absolute_expires_at,?) WHERE id=? AND expires_at>?${expectedClause}`,params);
  if(changed.changes!==1) return null;
  return {checkout_idempotency_key:nextKey,checkout_guest_token:nextGuest};
}
export async function getSessionCheckoutCredentials(id) {
  const sessionId=String(id||'');
  if(!sessionId) return null;
  const row=await getRow('SELECT checkout_idempotency_key,checkout_guest_token FROM sessions WHERE id=? AND expires_at>?',[sessionId,Date.now()]);
  if(!row || !/^[A-Za-z0-9_-]{32,64}$/.test(String(row.checkout_idempotency_key||'')) || !/^[A-Za-z0-9_-]{32,64}$/.test(String(row.checkout_guest_token||''))) return null;
  return row;
}
export async function setSessionExpiresAt(id, expiresAt) {
  const sessionId = String(id || '');
  const expiry = Number(expiresAt);
  if (!sessionId || !Number.isSafeInteger(expiry) || expiry <= Date.now()) return false;
  return (await run('UPDATE sessions SET expires_at=? WHERE id=?',[expiry,sessionId])).changes === 1;
}
export async function getSession(id) {
  if (!id) return null;
  const now=Date.now(), idleMs=2*60*60*1000, absoluteMs=30*24*60*60*1000;
  const row = await getRow('SELECT * FROM sessions WHERE id=?',[id]);
  if (!row) return null;
  const created=Number(row.created_at)||now, last=Number(row.last_activity_at)||created, absolute=Number(row.absolute_expires_at)||created+absoluteMs;
  if(Number(row.expires_at)<=now || now-last>=idleMs || now>=absolute || now-created>=absoluteMs){await run('DELETE FROM sessions WHERE id=?',[id]);return null;}
  const nextExpiry=Math.min(now+idleMs,absolute);
  if(!/^[A-Za-z0-9_-]{32,64}$/.test(String(row.checkout_idempotency_key||'')) || !/^[A-Za-z0-9_-]{32,64}$/.test(String(row.checkout_guest_token||''))){
    const nextKey=crypto.randomBytes(32).toString('base64url');
    const nextGuest=crypto.randomBytes(32).toString('base64url');
    await run(`UPDATE sessions SET
      checkout_idempotency_key=CASE WHEN length(checkout_idempotency_key) BETWEEN 32 AND 64 AND checkout_idempotency_key NOT GLOB '*[^A-Za-z0-9_-]*' THEN checkout_idempotency_key ELSE ? END,
      checkout_guest_token=CASE WHEN length(checkout_guest_token) BETWEEN 32 AND 64 AND checkout_guest_token NOT GLOB '*[^A-Za-z0-9_-]*' THEN checkout_guest_token ELSE ? END
      WHERE id=?`,[nextKey,nextGuest,id]);
    const checkoutState=await getRow('SELECT checkout_idempotency_key,checkout_guest_token FROM sessions WHERE id=?',[id]);
    row.checkout_idempotency_key=checkoutState?.checkout_idempotency_key||nextKey;
    row.checkout_guest_token=checkoutState?.checkout_guest_token||nextGuest;
  }
  await run('UPDATE sessions SET last_activity_at=?,expires_at=? WHERE id=?',[now,nextExpiry,id]);
  row.last_activity_at=now; row.expires_at=nextExpiry; row.absolute_expires_at=absolute;
  let cart = [];
  try {
    cart = JSON.parse(row.cart_json || '[]');
    if (!Array.isArray(cart)) cart = [];
  } catch { cart = []; }
  let wishlist = [];
  try { wishlist = JSON.parse(row.wishlist_json || '[]'); if (!Array.isArray(wishlist)) wishlist=[]; } catch { wishlist=[]; }
  let checkoutQuote = null;
  try { checkoutQuote = JSON.parse(String(row.checkout_quote_json || '')); if (!checkoutQuote || typeof checkoutQuote !== 'object' || Array.isArray(checkoutQuote)) checkoutQuote = null; } catch { checkoutQuote = null; }
  return { ...row, cart, wishlist, coupon: row.coupon_code || null, csrf: row.csrf_token || null, checkoutQuote };
}
export async function setSessionCsrf(id, token) { await run('UPDATE sessions SET csrf_token=? WHERE id=?',[token, id]); }
function normalizeSessionCart(cart) {
  return (Array.isArray(cart) ? cart : []).filter(x => Number.isSafeInteger(x?.productId) && x.productId > 0 && Number.isSafeInteger(x?.quantity) && x.quantity > 0).slice(0, 50).map(x => { const variantId=Number(x?.variantId); return {productId:x.productId,quantity:x.quantity,...(Number.isSafeInteger(variantId)&&variantId>0?{variantId}: {})}; });
}
export async function saveSessionCart(id, cart, {expectedRevision, expectedCartJson}={}) {
  const safeCart = normalizeSessionCart(cart);
  const serialized=JSON.stringify(safeCart);
  const nextCheckoutKey=crypto.randomBytes(32).toString('base64url');
  const nextGuestToken=crypto.randomBytes(32).toString('base64url');
  const clauses=['id=?','cart_json<>?'], args=[serialized,nextCheckoutKey,nextGuestToken,Date.now(),Date.now()+2*60*60*1000,id,serialized];
  if(expectedRevision!==undefined){
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('CART_REVISION_INVALID');
    clauses.push('cart_revision=?');args.push(expectedRevision);
  }
  if(expectedCartJson!==undefined){clauses.push('cart_json=?');args.push(String(expectedCartJson));}
  // Normalization is not a customer edit: an unchanged cart must preserve its
  // checkout quote/revision, and a stale reader must not overwrite a newer tab.
  return (await run(`UPDATE sessions SET cart_json=?,cart_revision=cart_revision+1,checkout_quote_json='',checkout_idempotency_key=?,checkout_guest_token=?,last_activity_at=?,expires_at=MIN(absolute_expires_at,?) WHERE ${clauses.join(' AND ')}`,args)).changes===1;
}
export async function mutateSessionCart(id, mutation) {
  if(typeof mutation!=='function')throw new TypeError('CART_MUTATION_REQUIRED');
  // Apply intent to the latest persisted cart. The CAS works across connections
  // as well as requests; retrying never reuses the middleware's stale snapshot.
  for(let attempt=0;attempt<32;attempt++){
    const row=await getRow('SELECT cart_json,cart_revision,expires_at FROM sessions WHERE id=?',[id]);
    if(!row||Number(row.expires_at)<=Date.now())return null;
    let current=[];
    try{current=JSON.parse(row.cart_json||'[]');}catch{}
    const next=normalizeSessionCart(mutation(normalizeSessionCart(current)));
    if(JSON.stringify(next)===row.cart_json)return {cart:next,cart_revision:Number(row.cart_revision),changed:false};
    if(await saveSessionCart(id,next,{expectedRevision:Number(row.cart_revision),expectedCartJson:row.cart_json}))return {cart:next,cart_revision:Number(row.cart_revision)+1,changed:true};
  }
  throw new Error('CART_CONCURRENT_CHANGE');
}
export async function saveSessionWishlist(id, wishlist) {
  const safeWishlist = [...new Set((Array.isArray(wishlist) ? wishlist : []).map(Number).filter(Number.isInteger).filter(n => n > 0))].slice(0, 50);
  await run('UPDATE sessions SET wishlist_json=?, last_activity_at=?, expires_at=MIN(absolute_expires_at,?) WHERE id=?',[JSON.stringify(safeWishlist),Date.now(),Date.now()+2*60*60*1000,id]);
}
export async function toggleWishlist(sessionId, productId) {
  const id=Number(productId);
  if(!Number.isSafeInteger(id)||id<1) return {wishlist:[],saved:false,count:0,changed:false,reason:'product-unavailable'};
  const tx=await db.transaction('write');
  try {
    const now=Date.now();
    const session=await getRow('SELECT wishlist_json FROM sessions WHERE id=? AND expires_at>?',[sessionId,now],tx);
    if(!session){await tx.rollback();return null;}
    let parsed=[];
    try{parsed=JSON.parse(session.wishlist_json||'[]');}catch{}
    const current=[...new Set((Array.isArray(parsed)?parsed:[]).map(Number).filter(value=>Number.isSafeInteger(value)&&value>0))].slice(0,50);
    const candidates=[...new Set([...current,id])];
    const active=await getRows(`SELECT id FROM products WHERE active=1 AND id IN (${candidates.map(()=>'?').join(',')})`,candidates,tx);
    const activeIds=new Set(active.map(row=>Number(row.id)));
    const wishlist=current.filter(value=>activeIds.has(value));
    let saved=false,reason;
    const index=wishlist.indexOf(id);
    if(index>=0) wishlist.splice(index,1);
    else if(!activeIds.has(id)) reason='product-unavailable';
    else if(wishlist.length>=50) reason='limit';
    else {wishlist.push(id);saved=true;}
    const serialized=JSON.stringify(wishlist),changed=serialized!==session.wishlist_json;
    if(changed) await run('UPDATE sessions SET wishlist_json=?,last_activity_at=?,expires_at=MIN(absolute_expires_at,?) WHERE id=?',[serialized,now,now+2*60*60*1000,sessionId],tx);
    await tx.commit();
    return {wishlist,saved,count:wishlist.length,changed,...(reason?{reason}:{})};
  } catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function saveSessionCoupon(id, couponCode, {expectedRevision, expectedCouponCode}={}) {
  const safe = couponCode ? String(couponCode).trim().toUpperCase().slice(0,40) : null;
  const nextCheckoutKey=crypto.randomBytes(32).toString('base64url');
  const nextGuestToken=crypto.randomBytes(32).toString('base64url');
  const clauses=["id=?","COALESCE(coupon_code,'')<>COALESCE(?,'')"],args=[safe,nextCheckoutKey,nextGuestToken,Date.now(),Date.now()+2*60*60*1000,id,safe];
  if(expectedRevision!==undefined){
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new Error('CART_REVISION_INVALID');
    clauses.push('cart_revision=?');args.push(expectedRevision);
  }
  if(expectedCouponCode!==undefined){clauses.push("COALESCE(coupon_code,'')=COALESCE(?,'')");args.push(expectedCouponCode);}
  return (await run(`UPDATE sessions SET coupon_code=?,cart_revision=cart_revision+1,checkout_quote_json='',checkout_idempotency_key=?,checkout_guest_token=?,last_activity_at=?,expires_at=MIN(absolute_expires_at,?) WHERE ${clauses.join(' AND ')}`,args)).changes===1;
}
export async function saveSessionCheckoutQuote(id, quote) {
  let serialized = '';
  if (quote && typeof quote === 'object' && !Array.isArray(quote)) {
    serialized = JSON.stringify(quote);
    if (serialized.length > 12000) throw new Error('CHECKOUT_QUOTE_TOO_LARGE');
  }
  await run('UPDATE sessions SET checkout_quote_json=?,last_activity_at=?,expires_at=MIN(absolute_expires_at,?) WHERE id=?',[serialized,Date.now(),Date.now()+2*60*60*1000,id]);
}

// Clear a cart only after a successful order and only if the persisted cart/coupon
// still match the snapshot used by that checkout request. This is a write
// transaction so another tab's more recent cart update is not overwritten.
function sessionCartFingerprint(cart) {
  const grouped = new Map();
  for (const item of (Array.isArray(cart) ? cart : [])) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    const rawVariantId = item?.variantId == null || item?.variantId === '' ? 0 : Number(item.variantId);
    const variantId = rawVariantId === 0 ? 0 : rawVariantId;
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 1 ||
        !Number.isSafeInteger(variantId) || variantId < 0) continue;
    const key = `${productId}:${variantId}`;
    grouped.set(key, (grouped.get(key) || 0) + quantity);
  }
  return [...grouped.entries()].map(([key, quantity]) => `${key}:${quantity}`).sort();
}

export async function clearSessionCartAfterOrder(sessionId, expectedCart, expectedCoupon = null, expectedRevision = null) {
  if (!sessionId || !Array.isArray(expectedCart) || expectedCart.length === 0 || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return false;
  const expectedCartSignature = JSON.stringify(sessionCartFingerprint(expectedCart));
  const normalizeCoupon = value => value ? String(value).trim().toUpperCase().slice(0, 40) : null;
  const couponSnapshot = normalizeCoupon(expectedCoupon);
  const tx = await db.transaction('write');
  try {
    const session = await getRow('SELECT cart_json,coupon_code,cart_revision FROM sessions WHERE id=? AND expires_at>?', [sessionId, Date.now()], tx);
    if (!session) {
      await tx.rollback();
      return false;
    }
    let persistedCart = [];
    try {
      persistedCart = JSON.parse(session.cart_json || '[]');
      if (!Array.isArray(persistedCart)) persistedCart = [];
    } catch {
      persistedCart = [];
    }
    if (Number(session.cart_revision) !== expectedRevision ||
        JSON.stringify(sessionCartFingerprint(persistedCart)) !== expectedCartSignature ||
        normalizeCoupon(session.coupon_code) !== couponSnapshot) {
      await tx.rollback();
      return false;
    }
    const now=Date.now();
    const nextCheckoutKey=crypto.randomBytes(32).toString('base64url');
    const nextGuestToken=crypto.randomBytes(32).toString('base64url');
    const changed = await run(`UPDATE sessions SET cart_json='[]',coupon_code=NULL,checkout_quote_json='',checkout_idempotency_key=?,checkout_guest_token=?,cart_revision=cart_revision+1,last_activity_at=?,expires_at=MIN(absolute_expires_at,?)
      WHERE id=? AND cart_revision=? AND cart_json=? AND COALESCE(coupon_code,'')=COALESCE(?, '')`,
    [nextCheckoutKey,nextGuestToken,now,now+2*60*60*1000,sessionId,expectedRevision,session.cart_json,session.coupon_code],tx);
    if (changed.changes !== 1) {
      await tx.rollback();
      return false;
    }
    await tx.commit();
    return true;
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function setSessionUser(id,userId){const now=Date.now();await run('UPDATE sessions SET user_id=?,last_activity_at=?,expires_at=MIN(absolute_expires_at,?) WHERE id=?',[userId,now,now+2*60*60*1000,id]);}
export async function destroySession(id) { await run('DELETE FROM sessions WHERE id=?',[id]); }

export async function getUserById(id) { return getRow('SELECT id,full_name,email,role,terms_accepted_at,created_at,COALESCE(mfa_enabled,0) AS mfa_enabled FROM users WHERE id=?',[id]); }
export async function getUserAuthByEmail(email) { return getRow('SELECT * FROM users WHERE email=?',[email]); }
export async function getUserMfaById(userId) {
  return getRow('SELECT id,email,role,mfa_secret,COALESCE(mfa_enabled,0) AS mfa_enabled,mfa_recovery_codes_hash,mfa_last_totp_step FROM users WHERE id=?',[userId]);
}
export async function setManagerMfaSecret(userId, encryptedSecret, proof=null) {
  const condition=proof ? ' AND password_hash=? AND email=? COLLATE BINARY AND role=?' : '';
  return (await run("UPDATE users SET mfa_secret=? WHERE id=? AND role='manager' AND COALESCE(mfa_enabled,0)=0"+condition,[String(encryptedSecret),userId,...(proof?credentialArgs(proof):[])])).changes===1;
}
export async function createMfaLoginChallenge(sessionId,{userId,mode,rememberMe=false,nextPath='/admin',expiresAtMs,credentialProof}) {
  if (!['setup','verify'].includes(mode)) throw new Error('INVALID_MFA_CHALLENGE_MODE');
  const args=credentialArgs(credentialProof);
  const now=Date.now();
  const result=await run(`INSERT INTO mfa_login_challenges(session_id,user_id,expires_at_ms,mode,remember_me,next_path,created_at_ms)
    SELECT s.id,u.id,?,?,?,?,? FROM users u JOIN sessions s ON s.id=?
    WHERE u.id=? AND u.password_hash=? AND u.email=? COLLATE BINARY AND u.role=? AND u.role='manager'
    AND s.user_id IS NULL AND s.expires_at>? AND CAST(? AS INTEGER)>CAST(? AS INTEGER)`,[
    Number(expiresAtMs),mode,rememberMe?1:0,String(nextPath||'/admin').slice(0,200),now,String(sessionId),Number(userId),...args,now,Number(expiresAtMs),now
  ]);
  if(result.changes!==1) throw new Error('AUTH_CREDENTIALS_CHANGED');
}
export async function getMfaLoginChallenge(sessionId,now=Date.now()) {
  if (!sessionId) return null;
  const row=await getRow(`SELECT c.session_id,c.user_id,c.expires_at_ms,c.mode,c.remember_me,c.next_path,u.email,u.role,u.password_hash,
      COALESCE(u.mfa_enabled,0) AS mfa_enabled
    FROM mfa_login_challenges c JOIN users u ON u.id=c.user_id
    JOIN sessions s ON s.id=c.session_id
    WHERE c.session_id=? AND c.expires_at_ms>? AND s.expires_at>?`,[String(sessionId),now,now]);
  if (!row) return row;
  const {password_hash,...challenge}=row;
  Object.defineProperty(challenge,'credentialProof',{value:Object.freeze({passwordHash:password_hash,email:row.email,role:row.role})});
  return challenge;
}
export async function deleteMfaLoginChallenge(sessionId) {
  return (await run('DELETE FROM mfa_login_challenges WHERE session_id=?',[String(sessionId)])).changes===1;
}
export async function activateManagerMfa(userId,{lastTotpStep,recoveryHashes,expectedSecret,credentialProof=null}) {
  if (typeof expectedSecret !== 'string' || !expectedSecret) return false;
  const tx=await db.transaction('write');
  try {
    const changed=await run("UPDATE users SET mfa_enabled=1,mfa_recovery_codes_hash=?,mfa_last_totp_step=? WHERE id=? AND role='manager' AND COALESCE(mfa_enabled,0)=0 AND mfa_secret=? COLLATE BINARY"+(credentialProof?" AND password_hash=? AND email=? COLLATE BINARY AND role=?":""),[
      String(recoveryHashes),Number(lastTotpStep),userId,expectedSecret,...(credentialProof?credentialArgs(credentialProof):[])
    ],tx);
    if (changed.changes!==1) { await tx.rollback(); return false; }
    // Revoke authenticated sessions AND anonymous sessions holding pending MFA challenges.
    // Challenge sessions are not user_id-bound, so deleting only sessions WHERE user_id=?
    // would leave their cookies/rows alive after enrollment. The current challenge session
    // is also deleted here; the route creates a fresh authenticated session after commit.
    await run('DELETE FROM sessions WHERE id IN (SELECT session_id FROM mfa_login_challenges WHERE user_id=?)',[userId],tx);
    await run('DELETE FROM sessions WHERE user_id=?',[userId],tx);
    await run('DELETE FROM mfa_login_challenges WHERE user_id=?',[userId],tx);
    await run('DELETE FROM mfa_rate_limits WHERE user_id=?',[userId],tx);
    await tx.commit();
    return true;
  } catch(error) { try { await tx.rollback(); } catch {} throw error; }
}
export async function updateManagerTotpStep(userId,step) {
  return (await run("UPDATE users SET mfa_last_totp_step=? WHERE id=? AND role='manager' AND mfa_enabled=1 AND (mfa_last_totp_step IS NULL OR mfa_last_totp_step < ?)",[Number(step),userId,Number(step)])).changes===1;
}
export async function replaceManagerRecoveryHashes(userId,oldValue,newValue) {
  return (await run("UPDATE users SET mfa_recovery_codes_hash=? WHERE id=? AND role='manager' AND mfa_enabled=1 AND mfa_recovery_codes_hash=?",[String(newValue),userId,String(oldValue)])).changes===1;
}
export async function disableManagerMfa(userId) {
  const tx=await db.transaction('write');
  try {
    const changed=await run("UPDATE users SET mfa_secret=NULL,mfa_enabled=0,mfa_recovery_codes_hash=NULL,mfa_last_totp_step=NULL WHERE id=? AND role='manager' AND mfa_enabled=1",[userId],tx);
    if(changed.changes!==1) { await tx.rollback(); return false; }
    // Revoke both authenticated Manager sessions and anonymous sessions holding
    // password-authenticated MFA challenges before deleting those challenge rows.
    await run('DELETE FROM sessions WHERE id IN (SELECT session_id FROM mfa_login_challenges WHERE user_id=?)',[userId],tx);
    await run('DELETE FROM sessions WHERE user_id=?',[userId],tx);
    await run('DELETE FROM mfa_login_challenges WHERE user_id=?',[userId],tx);
    await run('DELETE FROM mfa_rate_limits WHERE user_id=?',[userId],tx);
    await tx.commit();
    return true;
  } catch(error) { try { await tx.rollback(); } catch {} throw error; }
}
export async function consumeMfaAttempt(userId,sourceAddress,now=Date.now(),windowMs=15*60*1000,maxAttempts=5) {
  // The hard security bound is per account, not per source IP: rotating IPs must not
  // provide extra OTP guesses. sourceAddress stays in the signature for compatibility.
  void sourceAddress;
  const sourceHash=crypto.createHash('sha256').update('mfa-account-wide-limit-v1').digest('hex');
  const row=await getRow(`INSERT INTO mfa_rate_limits(user_id,source_hash,window_started_at_ms,attempts)
    VALUES(?,?,?,1)
    ON CONFLICT(user_id,source_hash) DO UPDATE SET
      window_started_at_ms=CASE WHEN mfa_rate_limits.window_started_at_ms + ? <= ? THEN excluded.window_started_at_ms ELSE mfa_rate_limits.window_started_at_ms END,
      attempts=CASE WHEN mfa_rate_limits.window_started_at_ms + ? <= ? THEN 1 ELSE mfa_rate_limits.attempts + 1 END
    RETURNING attempts,window_started_at_ms`,[Number(userId),sourceHash,Number(now),Number(windowMs),Number(now),Number(windowMs),Number(now)]);
  const attempts=Number(row?.attempts||0);
  return {allowed:attempts>0&&attempts<=Number(maxAttempts),attempts,windowStartedAtMs:Number(row?.window_started_at_ms||now)};
}
export async function clearMfaAttempts(userId,sourceAddress) {
  void sourceAddress;
  await run('DELETE FROM mfa_rate_limits WHERE user_id=?',[Number(userId)]);
}

export async function deleteAdminUser(userId) {
  const id=Number(userId);
  if(!Number.isSafeInteger(id)||id<1) return null;
  const tx=await db.transaction('write');
  try {
    // Never delete by ID alone: the role predicate prevents this helper from
    // deleting the Manager or a customer even if the caller submits a crafted ID.
    const target=await getRow("SELECT id,full_name,email,role FROM users WHERE id=? AND role='admin'",[id],tx);
    if(!target) { await tx.commit(); return null; }
    const result=await run("DELETE FROM users WHERE id=? AND role='admin'",[id],tx);
    if(result.changes!==1) { await tx.rollback(); return null; }
    // Foreign keys cascade the account's sessions, reset tokens and reset cooldown;
    // historical orders keep their snapshots while their user_id becomes NULL.
    await tx.commit();
    return target;
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function promoteBootstrapAdminToManager(userId, fullName) {
  const tx=await db.transaction('write');
  try {
    // Safe one-time migration for the legacy .env-created Admin: only run when
    // no Manager exists and the caller has already verified that Admin's password.
    const existingManager=await getRow("SELECT id FROM users WHERE role='manager' LIMIT 1",[],tx);
    if(existingManager) { await tx.commit(); return false; }
    const changed=(await run("UPDATE users SET role='manager',full_name=? WHERE id=? AND role='admin'",[String(fullName||'Store Manager').slice(0,120),userId],tx)).changes;
    if(changed===1) await run('DELETE FROM password_reset_tokens WHERE user_id=?',[userId],tx);
    await tx.commit();
    return changed===1;
  } catch(error) { try { await tx.rollback(); } catch {} throw error; }
}
async function revokeCredentialSessions(userId,keepSessionId,tx) {
  // Pending MFA sessions are anonymous until challenge completion. Revoke them
  // in the same credential transaction, before deleting the challenge records.
  await run('DELETE FROM sessions WHERE id IN (SELECT session_id FROM mfa_login_challenges WHERE user_id=?) AND id<>?',[userId,keepSessionId||''],tx);
  await run('DELETE FROM mfa_login_challenges WHERE user_id=?',[userId],tx);
  await run('DELETE FROM sessions WHERE user_id=? AND id<>?',[userId,keepSessionId||''],tx);
}
export async function updateUserEmail(userId,email,{keepSessionId='',expectedPasswordHash=null}={}) {
  const tx=await db.transaction('write');
  try {
    // This helper is intentionally limited to the Manager role. Staff email changes
    // require a fresh password check in the route and must never change another role.
    const changed=(await run("UPDATE users SET email=? WHERE id=? AND role='manager' AND (? IS NULL OR password_hash=?)",[String(email||'').trim().toLowerCase(),userId,expectedPasswordHash,expectedPasswordHash],tx)).changes;
    if(changed===1) {
      await run('DELETE FROM password_reset_tokens WHERE user_id=?',[userId],tx);
      await revokeCredentialSessions(userId,keepSessionId,tx);
    }
    await tx.commit();
    return changed===1;
  } catch(error) { try { await tx.rollback(); } catch {} throw error; }
}
export async function updateUserPassword(userId,passwordHash,{keepSessionId='',expectedPasswordHash=null}={}) {
  const tx=await db.transaction('write');
  try {
    const changed=(await run('UPDATE users SET password_hash=? WHERE id=? AND (? IS NULL OR password_hash=?)',[passwordHash,userId,expectedPasswordHash,expectedPasswordHash],tx)).changes;
    if(changed===1) {
      await run('DELETE FROM password_reset_tokens WHERE user_id=?',[userId],tx);
      await revokeCredentialSessions(userId,keepSessionId,tx);
    }
    await tx.commit();
    return changed===1;
  } catch(error) { try { await tx.rollback(); } catch {} throw error; }
}
export async function destroyUserSessionsExcept(userId,keepSessionId) { await run('DELETE FROM sessions WHERE user_id=? AND id<>?',[userId,keepSessionId||'']); }
export async function createPasswordResetToken(userId, tokenHash, expiresAtMs) {
  const tx=await db.transaction('write');
  try {
    const now=Date.now();
    const previous=await getRow('SELECT last_requested_at_ms FROM password_reset_cooldowns WHERE user_id=?',[userId],tx);
    if(previous && now-Number(previous.last_requested_at_ms)<60_000) {
      await tx.commit();
      return false;
    }
    await run('INSERT INTO password_reset_cooldowns(user_id,last_requested_at_ms) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_requested_at_ms=excluded.last_requested_at_ms',[userId,now],tx);
    await run('DELETE FROM password_reset_tokens WHERE user_id=? OR expires_at_ms<=?',[userId,now],tx);
    await run('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at_ms,created_at_ms) VALUES(?,?,?,?)',[tokenHash,userId,expiresAtMs,now],tx);
    await tx.commit();
    return true;
  } catch(error) { await tx.rollback(); throw error; }
}
export async function resetPasswordWithCode(email, submittedHash, passwordHash) {
  const normalized=String(email||'').trim().toLowerCase();
  const tx=await db.transaction('write');
  try {
    const token=await getRow(`SELECT t.token_hash,t.user_id,t.expires_at_ms,t.attempts FROM password_reset_tokens t JOIN users u ON u.id=t.user_id WHERE lower(u.email)=? ORDER BY t.created_at_ms DESC LIMIT 1`,[normalized],tx);
    const now=Date.now();
    if(!token || Number(token.expires_at_ms)<=now || Number(token.attempts||0)>=5) {
      if(token && (Number(token.expires_at_ms)<=now || Number(token.attempts||0)>=5)) await run('DELETE FROM password_reset_tokens WHERE user_id=?',[token.user_id],tx);
      await tx.commit(); return {ok:false,attemptsRemaining:0};
    }
    const stored=Buffer.from(String(token.token_hash||''),'hex');
    const supplied=Buffer.from(String(submittedHash||''),'hex');
    const matches=stored.length===32 && supplied.length===32 && crypto.timingSafeEqual(stored,supplied);
    if(!matches) {
      const attempts=Number(token.attempts||0)+1;
      if(attempts>=5) await run('DELETE FROM password_reset_tokens WHERE user_id=?',[token.user_id],tx);
      else await run('UPDATE password_reset_tokens SET attempts=? WHERE token_hash=?',[attempts,token.token_hash],tx);
      await tx.commit(); return {ok:false,attemptsRemaining:Math.max(0,5-attempts)};
    }
    const changed=(await run('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,token.user_id],tx)).changes;
    if(changed!==1) { await tx.rollback(); return {ok:false,attemptsRemaining:0}; }
    await run('DELETE FROM password_reset_tokens WHERE user_id=?',[token.user_id],tx);
    await run('DELETE FROM sessions WHERE user_id=?',[token.user_id],tx);
    await run('DELETE FROM mfa_login_challenges WHERE user_id=?',[token.user_id],tx);
    await tx.commit(); return {ok:true,userId:Number(token.user_id)};
  } catch(error) { await tx.rollback(); throw error; }
}

export async function createUser(email, passwordHash, role='customer', fullName='', termsAcceptedAt=null, emailVerified=true) {
  const verifiedAt=emailVerified?new Date().toISOString():null;
  return (await run('INSERT INTO users(email,password_hash,role,full_name,terms_accepted_at,email_verified_at,email_verification_required) VALUES(?,?,?,?,?,?,?)',[email,passwordHash,role,fullName,termsAcceptedAt,verifiedAt,emailVerified?0:1])).lastInsertRowid;
}
export async function approveCustomerRegistration(userId,managerId,{passwordHash,expectedPendingPasswordHash}={}) {
  const target=Number(userId),actor=Number(managerId);
  if(!Number.isSafeInteger(target)||target<1||!Number.isSafeInteger(actor)||actor<1||!validCustomerApprovalPasswordHash(passwordHash)||typeof expectedPendingPasswordHash!=='string'||!expectedPendingPasswordHash) return false;
  const tx=await db.transaction('write');
  try {
    const manager=await getRow("SELECT id FROM users WHERE id=? AND role='manager'",[actor],tx);
    const customer=await getRow("SELECT id,password_hash FROM users WHERE id=? AND role='customer' AND email_verification_required=1 AND email_verified_at IS NULL",[target],tx);
    if(!manager||!customer||customer.password_hash!==expectedPendingPasswordHash||!validCustomerApprovalPasswordHash(passwordHash,customer.password_hash)){await tx.rollback();return false;}
    const result=await run("UPDATE users SET password_hash=?,email_verified_at=?,email_verification_required=0 WHERE id=? AND role='customer' AND email_verification_required=1 AND email_verified_at IS NULL AND password_hash=?",[passwordHash,new Date().toISOString(),target,expectedPendingPasswordHash],tx);
    if(result.changes!==1){await tx.rollback();return false;}
    await run('DELETE FROM email_verification_tokens WHERE user_id=?',[target],tx);
    await run('DELETE FROM password_reset_tokens WHERE user_id=?',[target],tx);
    await run('DELETE FROM sessions WHERE user_id=?',[target],tx);
    await run("INSERT INTO audit_logs(user_id,action,target_type,target_id,meta_json) VALUES(?,'customer_registration_approved','customer',?,?)",[actor,String(target),JSON.stringify({manual_identity_confirmation:true,password_replaced:true})],tx);
    await tx.commit();
    return true;
  } catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function createEmailVerificationToken(userId,tokenHash,expiresAtMs) {
  const tx=await db.transaction('write');
  try {
    const now=Date.now();
    const existing=await getRow('SELECT MAX(created_at_ms) AS latest FROM email_verification_tokens WHERE user_id=?',[userId],tx);
    if(existing?.latest && now-Number(existing.latest)<60_000){await tx.commit();return {created:false,reason:'cooldown'};}
    await run('DELETE FROM email_verification_tokens WHERE user_id=?',[userId],tx);
    await run('INSERT INTO email_verification_tokens(token_hash,user_id,expires_at_ms,created_at_ms) VALUES(?,?,?,?)',[tokenHash,userId,expiresAtMs,now],tx);
    await tx.commit();
    return {created:true};
  } catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function getEmailVerificationChallenge(tokenHash) {
  if(typeof tokenHash!=='string'||!tokenHash) return null;
  const row=await getRow(`SELECT t.user_id,u.password_hash FROM email_verification_tokens t
    JOIN users u ON u.id=t.user_id
    WHERE t.token_hash=? AND t.expires_at_ms>? AND u.role='customer'
      AND u.email_verification_required=1 AND u.email_verified_at IS NULL`,[tokenHash,Date.now()]);
  return row?{userId:Number(row.user_id),passwordHash:row.password_hash}:null;
}
export async function verifyEmailToken(tokenHash,{expectedPasswordHash}={}) {
  // The HTTP boundary first verifies the supplied plaintext against this exact
  // pending password hash. A token click alone must never activate a registration.
  if(typeof tokenHash!=='string'||!tokenHash||typeof expectedPasswordHash!=='string'||!expectedPasswordHash) return {ok:false};
  const tx=await db.transaction('write');
  try {
    const row=await getRow(`SELECT t.user_id,t.expires_at_ms,u.password_hash FROM email_verification_tokens t
      JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND u.role='customer'
        AND u.email_verification_required=1 AND u.email_verified_at IS NULL`,[tokenHash],tx);
    if(!row || Number(row.expires_at_ms)<=Date.now() || row.password_hash!==expectedPasswordHash){await tx.rollback();return {ok:false};}
    const changed=await run(`UPDATE users SET email_verified_at=?,email_verification_required=0
      WHERE id=? AND role='customer' AND email_verification_required=1 AND email_verified_at IS NULL
        AND password_hash=? AND EXISTS(SELECT 1 FROM email_verification_tokens t
          WHERE t.token_hash=? AND t.user_id=users.id AND t.expires_at_ms>?)`,[new Date().toISOString(),row.user_id,expectedPasswordHash,tokenHash,Date.now()],tx);
    if(changed.changes!==1){await tx.rollback();return {ok:false};}
    await run('DELETE FROM email_verification_tokens WHERE token_hash=?',[tokenHash],tx);
    await tx.commit();return {ok:true,userId:Number(row.user_id)};
  } catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function getCustomerForVerification(email){return getRow("SELECT id,email,email_verified_at,email_verification_required,role FROM users WHERE email=? AND role='customer'",[String(email||'').trim().toLowerCase()]);}
export async function isAccountLoginBlocked(emailHash) {
  const row=await getRow('SELECT blocked_until_ms FROM account_login_limits WHERE email_hash=?',[emailHash]);
  return Number(row?.blocked_until_ms||0)>Date.now();
}
export async function recordAccountLoginFailure(emailHash) {
  const tx=await db.transaction('write'), now=Date.now(), windowMs=15*60*1000;
  try {
    const row=await getRow('SELECT * FROM account_login_limits WHERE email_hash=?',[emailHash],tx);
    let start=Number(row?.window_started_at_ms||0), attempts=Number(row?.attempts||0), blocked=Number(row?.blocked_until_ms||0);
    if(!row||now-start>=windowMs){start=now;attempts=0;blocked=0;}
    attempts++;
    if(attempts>=10)blocked=Math.max(blocked,now+windowMs);
    await run('INSERT INTO account_login_limits(email_hash,window_started_at_ms,attempts,blocked_until_ms) VALUES(?,?,?,?) ON CONFLICT(email_hash) DO UPDATE SET window_started_at_ms=excluded.window_started_at_ms,attempts=excluded.attempts,blocked_until_ms=excluded.blocked_until_ms',[emailHash,start,attempts,blocked],tx);
    await tx.commit();return {blocked:blocked>now,attempts};
  }catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function clearAccountLoginFailures(emailHash){await run('DELETE FROM account_login_limits WHERE email_hash=?',[emailHash]);}
export async function findOrderForLookup(orderId,email) {
  const row=await getRow('SELECT id,email,status,total_cents,currency,created_at,updated_at,user_id,guest_access_token_hash,payment_provider,payment_instructions_snapshot FROM orders WHERE id=? AND lower(email)=lower(?)',[orderId,String(email||'').trim()]);
  if(!row)return null;
  row.items=await getRows('SELECT id,product_name,sku,variant_name,variant_value,variant_name_2,variant_value_2,quantity,unit_price_cents,total_cents FROM order_items WHERE order_id=? ORDER BY id',[row.id]);
  row.returnable= row.status==='completed';
  return row;
}

export async function listCustomers({limit=50, offset=0, search=''}={}) {
  const params={};
  const conditions=["u.role='customer'"];
  if(search){ const like=`%${escapeLike(String(search).trim().slice(0,120))}%`; conditions.push("(u.email LIKE @likeSearch ESCAPE '!')"); params.likeSearch=like; }
  params.limit=Math.min(Math.max(Number(limit)||50,1),200); params.offset=Math.max(Number(offset)||0,0);
  return getRows(`SELECT u.id,u.email,u.created_at,u.email_verification_required,u.email_verified_at,COUNT(o.id) AS order_count,COALESCE(SUM(CASE WHEN o.status IN ('paid','processing','shipped','completed') AND (o.payment_provider<>'cash_on_delivery' OR o.payment_reference LIKE 'cash_received:%') THEN o.total_cents ELSE 0 END),0) AS lifetime_value_cents,
    (SELECT o2.customer_phone FROM orders o2 WHERE o2.user_id=u.id AND o2.customer_phone<>'' ORDER BY o2.created_at DESC LIMIT 1) AS phone,
    (SELECT o3.shipping_city FROM orders o3 WHERE o3.user_id=u.id ORDER BY o3.created_at DESC LIMIT 1) AS last_city,
    (SELECT o4.shipping_country FROM orders o4 WHERE o4.user_id=u.id ORDER BY o4.created_at DESC LIMIT 1) AS last_country
    FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE ${conditions.join(' AND ')} GROUP BY u.id ORDER BY u.created_at DESC LIMIT @limit OFFSET @offset`,params);
}
export async function countCustomers(search='') {
  if(!search) return Number((await getRow("SELECT COUNT(*) AS c FROM users WHERE role='customer'")).c||0);
  return Number((await getRow("SELECT COUNT(*) AS c FROM users WHERE role='customer' AND email LIKE ? ESCAPE '!'",[`%${escapeLike(String(search).trim().slice(0,120))}%`])).c||0);
}
export async function listLowStockInventory(limit=30) {
  const safeLimit=Math.min(Math.max(Math.floor(Number(limit)||30),1),100);
  return getRows(`SELECT * FROM (
    SELECT p.id AS product_id,p.name AS product_name,p.sku AS product_sku,p.reorder_level,p.stock,p.reserved_stock,MAX(p.stock-p.reserved_stock,0) AS available_stock,'' AS variant_value,'' AS variant_value_2,'' AS variant_sku,'product' AS inventory_type
    FROM products p WHERE p.active=1 AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) AND MAX(p.stock-p.reserved_stock,0)<=p.reorder_level
    UNION ALL
    SELECT p.id AS product_id,p.name AS product_name,pv.sku AS product_sku,p.reorder_level,pv.stock,pv.reserved_stock,MAX(pv.stock-pv.reserved_stock,0) AS available_stock,pv.option_value AS variant_value,pv.option_value_2 AS variant_value_2,pv.sku AS variant_sku,'variant' AS inventory_type
    FROM products p JOIN product_variants pv ON pv.product_id=p.id WHERE p.active=1 AND pv.active=1 AND MAX(pv.stock-pv.reserved_stock,0)<=p.reorder_level
  ) ORDER BY available_stock ASC,product_name COLLATE NOCASE LIMIT ?`,[safeLimit]);
}

async function getCompletedProductAccounting(productIds=null) {
  const accounting={gross_profit_cents:0,completed_orders_missing_cost:0,product_revenue_cents:0};
  const byProduct=new Map();
  if(Array.isArray(productIds)&&productIds.length===0) return {accounting,byProduct};
  const filter=Array.isArray(productIds)?` AND o.id IN (SELECT order_id FROM order_items WHERE product_id IN (${productIds.map(()=>'?').join(',')}))`:'';
  const rows=await getRows(`SELECT o.id AS accounting_order_id,o.discount_cents,o.bundle_discount_cents,o.tax_cents,o.product_tax_cents,o.tax_included,o.tax_rate_bps,o.tax_rule_snapshot,o.shipping_cents,
    oi.id,oi.product_id,oi.quantity,oi.unit_cost_cents,oi.total_cents
    FROM orders o JOIN order_items oi ON oi.order_id=o.id
    WHERE o.status='completed' AND (o.payment_provider<>'cash_on_delivery' OR o.payment_reference LIKE 'cash_received:%')${filter}
    ORDER BY o.id,oi.id`,productIds||[]);
  const orders=new Map();
  for(const row of rows){
    if(!orders.has(Number(row.accounting_order_id))) orders.set(Number(row.accounting_order_id),{order:row,items:[]});
    orders.get(Number(row.accounting_order_id)).items.push(row);
  }
  for(const {order,items} of orders.values()){
    const allocated=allocateOrderAccounting(order,items);
    if(allocated.missingCost) accounting.completed_orders_missing_cost++;
    for(const line of allocated.lines){
      if(!byProduct.has(line.productId)) byProduct.set(line.productId,{sold_quantity:0,product_gross_profit_cents:0,sold_units_missing_cost:0});
      const product=byProduct.get(line.productId);
      product.sold_quantity=addAccountingAmounts(product.sold_quantity,line.quantity);
      if(allocated.missingCost){
        // The whole historical order is excluded, consistently with the dashboard.
        // Mark every affected product incomplete even if its own cost is present.
        product.sold_units_missing_cost=addAccountingAmounts(product.sold_units_missing_cost,line.quantity);
        continue;
      }
      product.product_gross_profit_cents=addAccountingAmounts(product.product_gross_profit_cents,line.grossProfitCents);
      accounting.gross_profit_cents=addAccountingAmounts(accounting.gross_profit_cents,line.grossProfitCents);
      accounting.product_revenue_cents=addAccountingAmounts(accounting.product_revenue_cents,line.netRevenueCents);
    }
  }
  return {accounting,byProduct};
}

export async function getDashboardStats() {
  const [products,orders,customers,stories,accounting,lowStock] = await Promise.all([
    getRow(`SELECT COUNT(*) AS total, SUM(CASE WHEN p.active=1 THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN p.active=1 AND (CASE WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) THEN (SELECT COALESCE(SUM(MAX(pv.stock-pv.reserved_stock,0)),0) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) ELSE MAX(p.stock-p.reserved_stock,0) END)<=0 THEN 1 ELSE 0 END) AS sold_out FROM products p`),
    getRow(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, COALESCE(SUM(CASE WHEN status IN ('paid','processing','shipped','completed') AND (payment_provider<>'cash_on_delivery' OR payment_reference LIKE 'cash_received:%') THEN total_cents ELSE 0 END),0) AS revenue FROM orders`),
    getRow("SELECT COUNT(*) AS total FROM users WHERE role='customer'"),
    getRow("SELECT COUNT(*) AS total, SUM(CASE WHEN active=1 AND datetime(published_at)<=datetime('now') AND datetime(expires_at)>=datetime('now') THEN 1 ELSE 0 END) AS live FROM stories"),
    getCompletedProductAccounting().then(result=>result.accounting),
    getRow(`SELECT COUNT(*) AS count FROM (SELECT p.id FROM products p WHERE p.active=1 AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) AND MAX(p.stock-p.reserved_stock,0)<=p.reorder_level UNION ALL SELECT pv.id FROM product_variants pv JOIN products p ON p.id=pv.product_id WHERE p.active=1 AND pv.active=1 AND MAX(pv.stock-pv.reserved_stock,0)<=p.reorder_level)`)
  ]);
  return { products, orders, customers, stories, accounting, lowStock };
}

export async function listCategories({activeOnly=false}={}) {
  const where=activeOnly?'WHERE c.active=1':'';
  const productCountWhere=activeOnly?' AND pr.active=1':'';
  const childCountWhere=activeOnly?' AND ch.active=1':'';
  return getRows(`SELECT c.*, p.name AS parent_name, p.slug AS parent_slug,
    (SELECT COUNT(*) FROM products pr WHERE pr.category_id=c.id${productCountWhere}) AS product_count,
    (SELECT COUNT(*) FROM categories ch WHERE ch.parent_id=c.id${childCountWhere}) AS child_count
    FROM categories c LEFT JOIN categories p ON p.id=c.parent_id ${where}
    ORDER BY CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END, c.sort_order, c.name COLLATE NOCASE`);
}
export async function getCategoryBySlug(slug,{activeOnly=true}={}) {
  const where=activeOnly?`AND c.active=1 AND NOT EXISTS (
    WITH RECURSIVE ancestors(id,parent_id,active,path) AS (
      SELECT id,parent_id,active,printf('/%d/',id) FROM categories WHERE id=c.id
      UNION ALL
      SELECT parent.id,parent.parent_id,parent.active,ancestors.path || parent.id || '/'
      FROM categories parent JOIN ancestors ON parent.id=ancestors.parent_id
      WHERE instr(ancestors.path,printf('/%d/',parent.id))=0
    ) SELECT 1 FROM ancestors WHERE active<>1
  )`:'';
  return getRow(`SELECT c.*, p.name AS parent_name, p.slug AS parent_slug,
    (SELECT COUNT(*) FROM products pr WHERE pr.category_id=c.id AND pr.active=1) AS product_count,
    (SELECT COUNT(*) FROM categories ch WHERE ch.parent_id=c.id AND ch.active=1) AS child_count
    FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.slug=? ${where}`,[slug]);
}
async function assertValidCategoryParent(id,parentId,connection=db){
  const parent=parentId?await getRow('SELECT id,parent_id FROM categories WHERE id=?',[parentId],connection):null;
  if(parentId && !parent) throw new Error('CATEGORY_PARENT');
  if(id && parentId && Number(id)===Number(parentId)) throw new Error('CATEGORY_CYCLE');
  if(parentId){
    const seen=new Set(id?[Number(id)]:[]); let cursor=Number(parentId);
    while(cursor){
      if(seen.has(cursor)) throw new Error('CATEGORY_CYCLE');
      seen.add(cursor);
      const row=await getRow('SELECT parent_id FROM categories WHERE id=?',[cursor],connection);
      cursor=row?.parent_id?Number(row.parent_id):0;
    }
  }
}
export async function createCategory(name, slug, options={}) {
  const parentId=options.parentId?Number(options.parentId):null;
  const description=String(options.description??'').trim().slice(0,2000);
  const imageUrl=String(options.imageUrl??'').trim().slice(0,500);
  const sortRaw=options.sortOrder === undefined || options.sortOrder === null || options.sortOrder === '' ? 0 : options.sortOrder;
  const sortOrder=typeof sortRaw==='number' ? sortRaw : typeof sortRaw==='string' && /^\d{1,9}$/.test(sortRaw) ? Number(sortRaw) : Number.NaN;
  if(!Number.isSafeInteger(sortOrder) || sortOrder<0 || sortOrder>100000000) throw new Error('CATEGORY_SORT_ORDER');
  const active=options.active===false?0:1;
  const tx=await db.transaction('write');
  try {
    await assertValidCategoryParent(null,parentId,tx);
    const inserted=await run('INSERT INTO categories(name,slug,parent_id,description,image_url,sort_order,active) VALUES(?,?,?,?,?,?,?)',[name,slug,parentId,description,imageUrl,sortOrder,active],tx);
    await tx.commit();
    return Number(inserted.lastInsertRowid);
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function updateCategory(id, name, slug, options={}) {
  const parentId=options.parentId?Number(options.parentId):null;
  const description=String(options.description??'').trim().slice(0,2000);
  const imageUrl=String(options.imageUrl??'').trim().slice(0,500);
  const sortRaw=options.sortOrder === undefined || options.sortOrder === null || options.sortOrder === '' ? 0 : options.sortOrder;
  const sortOrder=typeof sortRaw==='number' ? sortRaw : typeof sortRaw==='string' && /^\d{1,9}$/.test(sortRaw) ? Number(sortRaw) : Number.NaN;
  if(!Number.isSafeInteger(sortOrder) || sortOrder<0 || sortOrder>100000000) throw new Error('CATEGORY_SORT_ORDER');
  const active=options.active===false?0:1;
  if(parentId && Number(parentId)===Number(id)) throw new Error('CATEGORY_CYCLE');
  const tx=await db.transaction('write');
  try {
    await assertValidCategoryParent(id,parentId,tx);
    const changed=(await run('UPDATE categories SET name=?,slug=?,parent_id=?,description=?,image_url=?,sort_order=?,active=? WHERE id=?',[name,slug,parentId,description,imageUrl,sortOrder,active,id],tx)).changes;
    if(changed!==1) throw new Error('NOT_FOUND');
    await tx.commit();
    return Number(id);
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function deleteCategory(id) {
  // Check and delete inside one write transaction so a concurrent child-category
  // creation cannot slip between the child-count check and the DELETE.
  const tx=await db.transaction('write');
  try {
    const current=await getRow('SELECT id FROM categories WHERE id=?',[id],tx);
    if(!current) throw new Error('NOT_FOUND');
    const children=Number((await getRow('SELECT COUNT(*) AS c FROM categories WHERE parent_id=?',[id],tx))?.c||0);
    if(children>0) throw new Error('CATEGORY_HAS_CHILDREN');
    const result=await run(`DELETE FROM categories WHERE id=?
      AND NOT EXISTS(SELECT 1 FROM categories child WHERE child.parent_id=categories.id)`,[id],tx);
    if(result.changes!==1) throw new Error('CATEGORY_HAS_CHILDREN');
    await tx.commit();
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
function buildProductSearchPredicate(search, searchAlternatives, prefix, params) {
  const phrases=[];
  const seen=new Set();
  for (const raw of [search,...(Array.isArray(searchAlternatives)?searchAlternatives:[])]) {
    const phrase=String(raw||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
    const key=phrase.toLocaleLowerCase();
    if (!phrase || seen.has(key)) continue;
    seen.add(key);
    phrases.push(phrase);
    if (phrases.length>=4) break;
  }
  if (!phrases.length) return '';
  const phraseGroups=phrases.map((phrase,phraseIndex)=>{
    const tokens=phrase.split(/\s+/).filter(Boolean).slice(0,6);
    const tokenClauses=tokens.map((token,tokenIndex)=>{
      const name=`${prefix}${phraseIndex}_${tokenIndex}`;
      params[name]=`%${escapeLike(token)}%`;
      return `(p.name LIKE @${name} ESCAPE '!' OR p.short_description LIKE @${name} ESCAPE '!' OR p.description LIKE @${name} ESCAPE '!' OR p.tags LIKE @${name} ESCAPE '!' OR p.sku LIKE @${name} ESCAPE '!')`;
    });
    return tokenClauses.length?`(${tokenClauses.join(' AND ')})`:'';
  }).filter(Boolean);
  return phraseGroups.length?`(${phraseGroups.join(' OR ')})`:'';
}

// Compare actual instants, rather than ISO "T" strings with SQLite's space-
// separated datetime('now'). Bind one timestamp for all price predicates in a query.
const productSalePriceSql = `CASE WHEN p.sale_price_cents IS NOT NULL AND p.sale_price_cents<p.price_cents AND (p.sale_start IS NULL OR p.sale_start='' OR julianday(p.sale_start)<=julianday(@catalogNow)) AND (p.sale_end IS NULL OR p.sale_end='' OR julianday(p.sale_end)>=julianday(@catalogNow)) THEN p.sale_price_cents ELSE p.price_cents END`;

export async function listProducts({search='', searchAlternatives=[], category='', sort='featured', onlyActive=true, featured=false, status='all', minPriceCents=null, maxPriceCents=null, inStockOnly=false, limit=48, offset=0, now=new Date(), includeAnalytics=!onlyActive} = {}) {
  const conditions = [];
  const params = {catalogNow:now.toISOString()};
  if (status === 'active') conditions.push('p.active=1');
  else if (status === 'archived') conditions.push('p.active=0');
  else if (onlyActive) conditions.push('p.active=1');
  const searchPredicate=buildProductSearchPredicate(search,searchAlternatives,'term',params);
  if (searchPredicate) conditions.push(searchPredicate);
  if (category) {
    conditions.push(`c.id IN (WITH RECURSIVE ancestors(id,parent_id,active,path) AS (
      SELECT id,parent_id,active,printf('/%d/',id) FROM categories WHERE slug=@category
      UNION ALL
      SELECT parent.id,parent.parent_id,parent.active,ancestors.path || parent.id || '/'
      FROM categories parent JOIN ancestors ON parent.id=ancestors.parent_id
      WHERE instr(ancestors.path,printf('/%d/',parent.id))=0
    ), descendants(id) AS (
      SELECT id FROM categories WHERE slug=@category AND active=1 AND NOT EXISTS (SELECT 1 FROM ancestors WHERE active<>1)
      UNION
      SELECT ch.id FROM categories ch JOIN descendants d ON ch.parent_id=d.id WHERE ch.active=1
    ) SELECT id FROM descendants)`);
    params.category = category;
  }
  if (featured) conditions.push('p.featured=1');
  const basePriceSql = productSalePriceSql;
  const availablePriceSql = `CASE WHEN (${basePriceSql}) > 0 AND p.automatic_discount_percent > 0 THEN MAX(1, (CAST((${basePriceSql}) AS INTEGER) * (100-p.automatic_discount_percent)) / 100) ELSE (${basePriceSql}) END`;
  if (Number.isSafeInteger(minPriceCents) && minPriceCents >= 0) { conditions.push(`(${availablePriceSql}) >= @minPriceCents`); params.minPriceCents=minPriceCents; }
  if (Number.isSafeInteger(maxPriceCents) && maxPriceCents >= 0) { conditions.push(`(${availablePriceSql}) <= @maxPriceCents`); params.maxPriceCents=maxPriceCents; }
  if (inStockOnly) conditions.push(`(${productAvailabilitySql}) > 0`);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortMap={featured:'p.featured DESC,p.created_at DESC',newest:'p.created_at DESC',price_low:'available_price ASC,p.created_at DESC',price_high:'available_price DESC,p.created_at DESC',name:'p.name COLLATE NOCASE ASC,p.created_at DESC'};
  const order=sortMap[sort]||sortMap.featured;
  params.limit = Math.min(Math.max(Number(limit) || 48, 1), 500);
  params.offset = Math.max(Number(offset) || 0, 0);
  const products=await getRows(`SELECT p.*, c.name AS category_name, c.slug AS category_slug,
    CASE WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1)
      THEN (SELECT COALESCE(SUM(MAX(pv.stock-pv.reserved_stock,0)),0) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1)
      ELSE MAX(p.stock-p.reserved_stock,0) END AS available_stock,
    (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) AS variant_count, ${availablePriceSql} AS available_price,
    (SELECT pi.image_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_primary DESC,pi.sort_order,pi.id LIMIT 1 OFFSET 1) AS gallery_image_2,
    (SELECT pi.image_url FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.is_primary DESC,pi.sort_order,pi.id LIMIT 1 OFFSET 2) AS gallery_image_3,
    CASE WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id)
      THEN (SELECT COALESCE(SUM(pv.reserved_stock),0) FROM product_variants pv WHERE pv.product_id=p.id)
      ELSE COALESCE(p.reserved_stock,0) END AS reserved_inventory_total
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where} ORDER BY ${order} LIMIT @limit OFFSET @offset`,params);
  // Storefront pages never compute management history. Even management queries
  // select the bounded catalogue page first, then batch only its product IDs.
  if(!includeAnalytics||products.length===0) return products;
  const ids=products.map(product=>Number(product.id));
  const [history,completed]=await Promise.all([
    getRows(`SELECT product_id,COUNT(*) AS count FROM order_items WHERE product_id IN (${ids.map(()=>'?').join(',')}) GROUP BY product_id`,ids),
    getCompletedProductAccounting(ids)
  ]);
  const counts=new Map(history.map(row=>[Number(row.product_id),Number(row.count)]));
  return products.map(product=>({...product,order_item_count:counts.get(Number(product.id))||0,
    ...(completed.byProduct.get(Number(product.id))||{sold_quantity:0,product_gross_profit_cents:0,sold_units_missing_cost:0})}));
}
export async function countProducts({search='', searchAlternatives=[], category='', onlyActive=true, status='all', minPriceCents=null, maxPriceCents=null, inStockOnly=false, now=new Date()} = {}) {
  const conditions=[]; const params={};
  if (status === 'active') conditions.push('p.active=1');
  else if (status === 'archived') conditions.push('p.active=0');
  else if (onlyActive) conditions.push('p.active=1');
  const searchPredicate=buildProductSearchPredicate(search,searchAlternatives,'countTerm',params);
  if(searchPredicate) conditions.push(searchPredicate);
  if(category){conditions.push(`c.id IN (WITH RECURSIVE ancestors(id,parent_id,active,path) AS (SELECT id,parent_id,active,printf('/%d/',id) FROM categories WHERE slug=@category UNION ALL SELECT parent.id,parent.parent_id,parent.active,ancestors.path || parent.id || '/' FROM categories parent JOIN ancestors ON parent.id=ancestors.parent_id WHERE instr(ancestors.path,printf('/%d/',parent.id))=0), descendants(id) AS (SELECT id FROM categories WHERE slug=@category AND active=1 AND NOT EXISTS (SELECT 1 FROM ancestors WHERE active<>1) UNION SELECT ch.id FROM categories ch JOIN descendants d ON ch.parent_id=d.id WHERE ch.active=1) SELECT id FROM descendants)`);params.category=category;}
  const basePriceSql = productSalePriceSql;
  const availablePriceSql = `CASE WHEN (${basePriceSql}) > 0 AND p.automatic_discount_percent > 0 THEN MAX(1, (CAST((${basePriceSql}) AS INTEGER) * (100-p.automatic_discount_percent)) / 100) ELSE (${basePriceSql}) END`;
  if(Number.isSafeInteger(minPriceCents)&&minPriceCents>=0){conditions.push(`(${availablePriceSql})>=@minPriceCents`);params.minPriceCents=minPriceCents;}
  if(Number.isSafeInteger(maxPriceCents)&&maxPriceCents>=0){conditions.push(`(${availablePriceSql})<=@maxPriceCents`);params.maxPriceCents=maxPriceCents;}
  if(params.minPriceCents!==undefined||params.maxPriceCents!==undefined) params.catalogNow=now.toISOString();
  if(inStockOnly) conditions.push(`(${productAvailabilitySql})>0`);
  const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
  return Number((await getRow(`SELECT COUNT(*) AS c FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where}`,params)).c||0);
}

const productAvailabilitySql = `CASE WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1)
  THEN (SELECT COALESCE(SUM(MAX(pv.stock-pv.reserved_stock,0)),0) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1)
  ELSE MAX(p.stock-p.reserved_stock,0) END`;
export async function getProductBySlug(slug) {
  return getRow(`SELECT p.*, c.name AS category_name, c.slug AS category_slug, ${productAvailabilitySql} AS available_stock,
    (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) AS variant_count
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=? AND p.active=1`,[slug]);
}
export async function getProductById(id) {
  return getRow(`SELECT p.*, ${productAvailabilitySql} AS available_stock,
    (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) AS variant_count,
    (SELECT COUNT(*) FROM order_items all_items WHERE all_items.product_id=p.id) AS order_item_count,
    CASE WHEN EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id)
      THEN (SELECT COALESCE(SUM(pv.reserved_stock),0) FROM product_variants pv WHERE pv.product_id=p.id)
      ELSE COALESCE(p.reserved_stock,0) END AS reserved_inventory_total,
    (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.status='completed' AND (o.payment_provider<>'cash_on_delivery' OR o.payment_reference LIKE 'cash_received:%')) AS sold_quantity
    FROM products p WHERE id=?`,[id]);
}
export async function listProductVariants(productId) {
  return getRows(`SELECT id,product_id,option_name,option_value,option_name_2,option_value_2,sku,stock,reserved_stock,image_url,sort_order,active,
    MAX(stock-reserved_stock,0) AS available_stock
    FROM product_variants WHERE product_id=? AND active=1 ORDER BY sort_order,id`,[Number(productId)]);
}
export async function getProductVariantById(id) {
  return getRow(`SELECT id,product_id,option_name,option_value,option_name_2,option_value_2,sku,stock,reserved_stock,image_url,sort_order,active,
    MAX(stock-reserved_stock,0) AS available_stock FROM product_variants WHERE id=? AND active=1`,[Number(id)]);
}
export async function listProductImages(productId) {
  return getRows(`SELECT id,product_id,image_url,alt_text,sort_order,is_primary,created_at FROM product_images WHERE product_id=? ORDER BY is_primary DESC,sort_order,id`,[Number(productId)]);
}

/** Remove a gallery image atomically, promote a replacement when removing the cover,
 * and never permit a product to lose its final remaining image through this endpoint. */
export async function deleteProductImage(productId, imageId) {
  const pid=Number(productId), iid=Number(imageId);
  if(!Number.isSafeInteger(pid)||pid<1||!Number.isSafeInteger(iid)||iid<1) throw new Error('INVALID_PRODUCT_IMAGE');
  const tx=await db.transaction('write');
  try {
    const product=await getRow('SELECT id,image_url FROM products WHERE id=?',[pid],tx);
    if(!product) throw new Error('PRODUCT_NOT_FOUND');
    const image=await getRow('SELECT id,product_id,image_url,alt_text,sort_order,is_primary FROM product_images WHERE id=? AND product_id=?',[iid,pid],tx);
    if(!image) throw new Error('PRODUCT_IMAGE_NOT_FOUND');
    const current=await getRows('SELECT id,product_id,image_url,alt_text,sort_order,is_primary FROM product_images WHERE product_id=? ORDER BY is_primary DESC,sort_order,id',[pid],tx);
    if(current.length<=1) throw new Error('LAST_PRODUCT_IMAGE');
    const remaining=current.filter(row=>Number(row.id)!==iid);
    const removingCover=Number(image.is_primary)===1 || String(product.image_url||'')===String(image.image_url||'');
    let nextPrimary=remaining.find(row=>Number(row.is_primary)===1)||remaining[0];
    if(removingCover) {
      nextPrimary=remaining[0];
      // Clear first to satisfy the partial unique index on databases that enforce it immediately.
      await run('UPDATE product_images SET is_primary=0 WHERE product_id=?',[pid],tx);
      await run('UPDATE product_images SET is_primary=1,sort_order=0 WHERE id=? AND product_id=?',[nextPrimary.id,pid],tx);
      await run("UPDATE products SET image_url=?,updated_at=datetime('now') WHERE id=?",[nextPrimary.image_url,pid],tx);
    }
    // A variant may have been pointing at this gallery asset. Clear that local
    // reference inside the same transaction so future product edits remain valid;
    // the storefront then falls back to the product's cover for that variant.
    await run("UPDATE product_variants SET image_url='',updated_at=datetime('now') WHERE product_id=? AND image_url=?",[pid,image.image_url],tx);
    await run('UPDATE product_images SET sort_order=0 WHERE id=? AND product_id=?',[nextPrimary.id,pid],tx);
    await run('DELETE FROM product_images WHERE id=? AND product_id=?',[iid,pid],tx);
    const ordered=remaining
      .filter(row=>Number(row.id)!==Number(nextPrimary.id))
      .sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||Number(a.id)-Number(b.id));
    for(let index=0;index<ordered.length;index++) {
      await run('UPDATE product_images SET sort_order=? WHERE id=? AND product_id=?',[index+1,ordered[index].id,pid],tx);
    }
    await tx.commit();
    return { deletedImage:image, productId:pid, replacementImage:removingCover?nextPrimary:null, remainingCount:remaining.length };
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function getActiveStories(limit=24) {
  const safeLimit=Math.min(Math.max(Number(limit)||24,1),100);
  // Join only when the product is active, so a story pointing at an inactive
  // product falls back to its custom link (or /stories) instead of a 404.
  return getRows(`SELECT s.*, p.name AS product_name, p.slug AS product_slug,
    CASE WHEN p.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) THEN MAX(p.stock-p.reserved_stock,0) ELSE 0 END AS product_available_stock,
    CASE WHEN p.id IS NOT NULL THEN (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) ELSE 0 END AS product_variant_count
    FROM stories s
    LEFT JOIN products p ON p.id=s.product_id AND p.active=1
    WHERE s.active=1 AND datetime(s.published_at)<=datetime('now') AND datetime(s.expires_at)>=datetime('now')
    ORDER BY s.published_at DESC LIMIT ?`,[safeLimit]);
}
export async function listStories(limit=100) { return getRows(`SELECT s.*, p.name AS product_name, p.slug AS product_slug, CASE WHEN p.id IS NOT NULL AND p.active=1 AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) THEN MAX(p.stock-p.reserved_stock,0) ELSE 0 END AS product_available_stock, CASE WHEN p.id IS NOT NULL AND p.active=1 THEN (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id=p.id AND pv.active=1) ELSE 0 END AS product_variant_count FROM stories s LEFT JOIN products p ON p.id=s.product_id ORDER BY s.published_at DESC LIMIT ?`,[Math.min(Math.max(Number(limit)||100,1),500)]); }
export async function getStory(id) { return getRow('SELECT * FROM stories WHERE id=?',[id]); }
export async function listCoupons(limit=500) { return getRows('SELECT * FROM coupons ORDER BY active DESC, code LIMIT ?',[Math.min(Math.max(Number(limit)||500,1),1000)]); }
export async function getCoupon(code) { const normalized=String(code??'').trim().toUpperCase(); if(!/^[A-Z0-9_-]{3,40}$/.test(normalized)) return null; return getRow(`SELECT * FROM coupons WHERE code=? AND active=1 AND (expires_at IS NULL OR expires_at>?)`,[normalized, new Date().toISOString()]); }
export async function getCouponById(id) { return getRow('SELECT * FROM coupons WHERE id=?',[id]); }
export async function adminCreateOrUpdateCoupon(data) {
  const values = [data.code.toUpperCase(), data.type, data.value, data.minSubtotalCents, data.expiresAt || null, data.active ? 1 : 0];
  if (data.id) {
    const changed=(await run('UPDATE coupons SET code=?,type=?,value=?,min_subtotal_cents=?,expires_at=?,active=? WHERE id=?',[...values, data.id])).changes;
    if(changed!==1) throw new Error('NOT_FOUND');
    return Number(data.id);
  }
  return Number((await run('INSERT INTO coupons(code,type,value,min_subtotal_cents,expires_at,active) VALUES(?,?,?,?,?,?)',values)).lastInsertRowid);
}
export async function deleteCoupon(id) { return (await run('DELETE FROM coupons WHERE id=?',[id])).changes===1; }
export async function getSetting(key, fallback='') {
  if (isPostgresStaging && typeof key === 'string') return batchedSetting(key,fallback);
  return (await getRow('SELECT value FROM settings WHERE key=?',[key]))?.value ?? fallback;
}
export function getProductDiscountPercent(product) { return normalizeProductDiscountPercent(product?.automatic_discount_percent); }
export async function setSetting(key, value) { await upsertSetting(key, value); }
export async function setSettings(entries) {
  if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !entry[0])) {
    throw new TypeError('Settings must be an array of non-empty keys and values.');
  }
  // Use the client's batch API for one atomic write. This avoids the more fragile
  // manual transaction lifecycle (begin/commit/rollback) across local SQLite,
  // Turso and serverless runtimes while keeping all settings in one write batch.
  const statements = entries.map(([key, value]) => ({
    sql: 'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    args: [key, String(value ?? '')]
  }));
  await db.batch(statements, 'write');
}

// Save store configuration and currency-dependent amounts in one write transaction.
// Existing orders keep their own `currency` snapshot and historical totals untouched.
// Products and monetary coupon fields are adjusted only for minor-unit precision;
// this is NOT exchange-rate conversion. After a change the route must hold checkout
// closed until a manager manually reviews and confirms every affected price/coupon.
export async function saveStoreSettingsWithCurrency(entries,{oldCurrency,newCurrency,allowAmountRescale=false}={}) {
  if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !entry[0])) {
    throw new TypeError('Settings must be an array of non-empty keys and values.');
  }
  const oldCode=String(oldCurrency||'').toUpperCase();
  const newCode=String(newCurrency||'').toUpperCase();
  if(!isValidCurrency(oldCode)||!isValidCurrency(newCode)) throw new Error('INVALID_CURRENCY');
  const tx=await db.transaction('write');
  try {
    const savedCurrency=String((await getRow('SELECT value FROM settings WHERE key=?',['currency'],tx))?.value||oldCode).toUpperCase();
    if(savedCurrency!==oldCode) throw new Error('CURRENCY_CHANGED_CONCURRENTLY');
    let scaledProductCount=0;
    let scaledCouponCount=0;
    if(newCode!==oldCode){
      // Historic order amounts are stored with each order's currency snapshot.
      // Existing aggregates still assume one currency, so allow correction/change only
      // when every historical order already matches the target currency. Enforce this
      // inside the write transaction to close the checkout/order creation race.
      const orderCurrencies=await getRows('SELECT UPPER(currency) AS currency,COUNT(*) AS c FROM orders GROUP BY UPPER(currency) ORDER BY UPPER(currency)',[],tx);
      if(orderCurrencies.some(row=>String(row.currency||'').toUpperCase()!==newCode)) throw new Error('CURRENCY_CHANGE_HAS_ORDERS');
      // Product and coupon money values can be rescaled atomically for the new
      // currency's storage precision and then manually repriced before checkout.
      const products=await getRow('SELECT COUNT(*) AS c FROM products',[],tx);
      const coupons=await getRow(`SELECT COUNT(*) AS c FROM coupons WHERE ${CURRENCY_SENSITIVE_COUPON_WHERE}`,[],tx);
      scaledProductCount=Number(products?.c||0);
      scaledCouponCount=Number(coupons?.c||0);
      if((scaledProductCount>0||scaledCouponCount>0)&&!allowAmountRescale) throw new Error('CURRENCY_CONFIRM_REQUIRED');
      const productRows=scaledProductCount>0
        ? await getRows('SELECT id,price_cents,cost_price_cents,sale_price_cents FROM products ORDER BY id',[],tx)
        : [];
      for(const product of productRows){
        const updated=await run("UPDATE products SET price_cents=?,cost_price_cents=?,sale_price_cents=?,updated_at=datetime('now') WHERE id=?",[
          rescaleMinorUnitAmount(product.price_cents,oldCode,newCode),
          rescaleMinorUnitAmount(product.cost_price_cents,oldCode,newCode),
          rescaleMinorUnitAmount(product.sale_price_cents,oldCode,newCode),
          product.id
        ],tx);
        if(updated.changes!==1) throw new Error('CURRENCY_SCALE_CONFLICT');
      }
      const couponRows=scaledCouponCount>0
        ? await getRows(`SELECT id,type,value,min_subtotal_cents FROM coupons WHERE ${CURRENCY_SENSITIVE_COUPON_WHERE} ORDER BY id`,[],tx)
        : [];
      for(const coupon of couponRows){
        const nextValue=coupon.type==='fixed'
          ? rescaleMinorUnitAmount(coupon.value,oldCode,newCode,{minPositive:true})
          : coupon.value;
        const nextMinimum=rescaleMinorUnitAmount(coupon.min_subtotal_cents,oldCode,newCode);
        const updated=await run('UPDATE coupons SET value=?,min_subtotal_cents=? WHERE id=?',[nextValue,nextMinimum,coupon.id],tx);
        if(updated.changes!==1) throw new Error('CURRENCY_SCALE_CONFLICT');
      }
    }
    const changeNeedsPriceReview=newCode!==oldCode&&(scaledProductCount>0||scaledCouponCount>0);
    for(const [key,value] of entries){
      const safeValue=key==='currency_price_review_required'&&changeNeedsPriceReview?'1':value;
      await run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,String(safeValue??'')],tx);
    }
    await tx.commit();
    return {scaledProductCount,scaledCouponCount};
  }catch(error){
    try{await tx.rollback();}catch{}
    throw error;
  }
}
export async function createAudit(userId, action, targetType, targetId, meta={}) { await run('INSERT INTO audit_logs(user_id,action,target_type,target_id,meta_json) VALUES(?,?,?,?,?)',[userId,action,targetType,targetId ? String(targetId) : null,JSON.stringify(meta)]); }
export async function listAuditLogs(limit=150) { return getRows(`SELECT a.*,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ?`,[limit]); }
export async function listGdprAuditLogs(limit=150) {
  const safeLimit=Math.min(150,Math.max(1,Number.isInteger(Number(limit))?Number(limit):150));
  return getRows(`SELECT a.*,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.action IN ('gdpr_customer_export','gdpr_customer_delete')
    ORDER BY a.created_at DESC,a.id DESC LIMIT ?`,[safeLimit]);
}

function parseGdprJson(value,fallback) {
  try { const parsed=JSON.parse(String(value??'')); return parsed===null?fallback:parsed; }
  catch { return fallback; }
}
function normalizeGdprIdentity({customerId=null,email=''}={}) {
  const id=Number(customerId);
  const normalizedEmail=String(email||'').trim().toLowerCase();
  if (customerId!==null && customerId!=='' && (!Number.isSafeInteger(id)||id<=0)) throw new Error('GDPR_INVALID_CUSTOMER_ID');
  if ((!Number.isSafeInteger(id)||id<=0) && (!normalizedEmail || normalizedEmail.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) throw new Error('GDPR_IDENTITY_REQUIRED');
  return {customerId:Number.isSafeInteger(id)&&id>0?id:null,email:normalizedEmail};
}
async function resolveGdprTarget(identity,connection=db) {
  const input=normalizeGdprIdentity(identity);
  let user;
  if(input.customerId!==null) {
    const anyUser=await getRow('SELECT id,email,role,full_name,terms_accepted_at,created_at FROM users WHERE id=?',[input.customerId],connection);
    if(anyUser && anyUser.role!=='customer') throw new Error('GDPR_NOT_CUSTOMER');
    user=anyUser;
    if(!user) throw new Error('GDPR_CUSTOMER_NOT_FOUND');
  } else {
    const anyUser=await getRow('SELECT id,email,role,full_name,terms_accepted_at,created_at FROM users WHERE lower(email)=lower(?)',[input.email],connection);
    if(anyUser && anyUser.role!=='customer') throw new Error('GDPR_NOT_CUSTOMER');
    user=anyUser;
  }
  const email=user?.email || input.email;
  const orders=user
    ? await getRows(`SELECT id,user_id,email,status,payment_provider,payment_reference,provider_amount_refunded_cents,provider_amount_charged_back_cents,provider_financials_checked_at,subtotal_cents,automatic_discount_cents,bundle_discount_cents,gift_card_id,discount_cents,total_cents,currency,shipping_name,shipping_address,shipping_city,shipping_postal_code,shipping_country,customer_phone,shipping_cents,tax_cents,tax_rate_bps,tax_included,tax_rule_snapshot,shipping_rule_snapshot,customer_note,terms_accepted_at,terms_locale,terms_policy_hash,cancellation_reason,cancellation_actor,cancelled_by_user_id,cancelled_at,cancellation_requested_at,cancellation_request_reason,cancellation_requested_by_user_id,cancellation_request_decided_at,cancellation_request_decision,cancellation_request_decided_by_user_id,reservation_expires_at,confirmation_email_sent_at,last_status_actor_type,last_status_actor_user_id,created_at,updated_at
        FROM orders WHERE user_id=? OR (user_id IS NULL AND lower(email)=lower(?)) ORDER BY created_at,id`,[user.id,email],connection)
    : await getRows(`SELECT id,user_id,email,status,payment_provider,payment_reference,provider_amount_refunded_cents,provider_amount_charged_back_cents,provider_financials_checked_at,subtotal_cents,automatic_discount_cents,bundle_discount_cents,gift_card_id,discount_cents,total_cents,currency,shipping_name,shipping_address,shipping_city,shipping_postal_code,shipping_country,customer_phone,shipping_cents,tax_cents,tax_rate_bps,tax_included,tax_rule_snapshot,shipping_rule_snapshot,customer_note,terms_accepted_at,terms_locale,terms_policy_hash,cancellation_reason,cancellation_actor,cancelled_by_user_id,cancelled_at,cancellation_requested_at,cancellation_request_reason,cancellation_requested_by_user_id,cancellation_request_decided_at,cancellation_request_decision,cancellation_request_decided_by_user_id,reservation_expires_at,confirmation_email_sent_at,last_status_actor_type,last_status_actor_user_id,created_at,updated_at
        FROM orders WHERE user_id IS NULL AND lower(email)=lower(?) ORDER BY created_at,id`,[email],connection);
  // Optional engagement data is personal data even for visitors without an account.
  const newsletterRecord=await getRow('SELECT email,status,created_at FROM newsletter_subscriptions WHERE lower(email)=lower(?)',[email],connection);
  const stockAlertRecords=await getRows('SELECT product_id,status,created_at,notified_at FROM stock_alerts WHERE lower(email)=lower(?)',[email],connection);
  const newsletterDeliveries=await getRows('SELECT campaign_id,status,sent_at FROM newsletter_deliveries WHERE lower(email)=lower(?)',[email],connection);
  const reviewRecords=user?await getRows('SELECT product_id,rating,title,body,status,created_at FROM product_reviews WHERE user_id=?',[user.id],connection):[];
  if(!user && !orders.length && !newsletterRecord && !stockAlertRecords.length && !newsletterDeliveries.length) throw new Error('GDPR_CUSTOMER_NOT_FOUND');
  const orderIds=orders.map(order=>Number(order.id));
  let orderItems=[];
  if(orderIds.length) {
    const rows=await getRows(`SELECT oi.id,oi.order_id,oi.product_id,oi.product_name,oi.sku,oi.variant_id,oi.variant_name,oi.variant_value,oi.variant_name_2,oi.variant_value_2,oi.quantity,oi.unit_price_cents,oi.total_cents
      FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE ${user?'(o.user_id=? OR (o.user_id IS NULL AND lower(o.email)=lower(?)))':'(o.user_id IS NULL AND lower(o.email)=lower(?))'} ORDER BY oi.order_id,oi.id`,user?[user.id,email]:[email],connection);
    orderItems=rows;
  }
  const rawSessions=user?await getRows('SELECT created_at,expires_at,cart_json,wishlist_json,coupon_code,cart_revision,checkout_quote_json FROM sessions WHERE user_id=? ORDER BY created_at',[user.id],connection):[];
  const sessions=rawSessions.map(row=>({
    created_at:row.created_at,
    expires_at:row.expires_at,
    cart:parseGdprJson(row.cart_json,[]),
    wishlist:parseGdprJson(row.wishlist_json,[]),
    coupon_code:row.coupon_code||null,
    cart_revision:row.cart_revision,
    checkout_quote:parseGdprJson(row.checkout_quote_json,null)
  }));
  const wishlist=[...new Set(sessions.flatMap(session=>Array.isArray(session.wishlist)?session.wishlist:[]).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))];
  const returnRequests=orderIds.length?await getRows(`SELECT id,order_id,order_item_id,user_id,request_type,quantity,reason,status,manager_note,refund_amount_cents,refund_method,refund_reference,refund_recorded_at,exchange_tracking_reference,exchange_shipped_at,restocked_at,created_at,updated_at FROM order_returns WHERE order_id IN (${orderIds.map(()=>'?').join(',')}) ORDER BY order_id,id`,orderIds,connection):[];
  const ordersWithItems=orders.map(order=>({...order,items:orderItems.filter(item=>Number(item.order_id)===Number(order.id))}));
  return {
    customer:user?{id:user.id,full_name:user.full_name,email:user.email,role:user.role,terms_accepted_at:user.terms_accepted_at,created_at:user.created_at}:null,
    identity:{email},
    orders:ordersWithItems,
    order_items:orderItems,
    return_requests:returnRequests,
    wishlist,
    newsletter_subscription:newsletterRecord||null,
    stock_alerts:stockAlertRecords,
    newsletter_deliveries:newsletterDeliveries,
    product_reviews:reviewRecords,
    // Current uploaded_assets are shared storefront media owned by the store, not customer uploads.
    // The schema has no customer/uploader ownership relation, so attributing or deleting them would be unsafe.
    uploads:[],
    sessions
  };
}
export async function exportGdprCustomerData(identity) {
  const data=await resolveGdprTarget(identity,db);
  const {customer,...groups}=data;
  return {exported_at:new Date().toISOString(),user:customer,...groups};
}
export async function deleteGdprCustomerData(identity,{actorUserId,mode='delete',retentionAcknowledged=false,retentionPolicyReference=''}={}) {
  const input=normalizeGdprIdentity(identity);
  if(!['delete','minimize-retain-financial'].includes(mode)) throw new Error('GDPR_INVALID_MODE');
  const minimize=mode==='minimize-retain-financial';
  const policyReference=String(retentionPolicyReference||'').trim();
  if(minimize&&retentionAcknowledged!==true) throw new Error('GDPR_RETENTION_ACK_REQUIRED');
  if(minimize&&(!policyReference||policyReference.length>200||/[\u0000-\u001f\u007f]/u.test(policyReference))) throw new Error('GDPR_RETENTION_POLICY_REQUIRED');
  const tx=await db.transaction('write');
  try {
    const actor=Number(actorUserId);
    if(!Number.isSafeInteger(actor)||actor<=0||!(await getRow("SELECT id FROM users WHERE id=? AND role='manager'",[actor],tx))) throw new Error('GDPR_ACTOR_REQUIRED');
    const exportedSelection=await resolveGdprTarget(input,tx);
    const customer=exportedSelection.customer;
    const email=exportedSelection.identity.email;
    const orderIds=exportedSelection.orders.map(order=>Number(order.id));
    if(!minimize) {
      // Financial ledger entries must not be destroyed to make a privacy action
      // appear successful. The Manager must choose an explicit retention policy.
      for(const order of exportedSelection.orders) {
        if(order.gift_card_id!=null||await getRow('SELECT id FROM gift_card_ledger WHERE order_id=? LIMIT 1',[order.id],tx)) throw new Error('GDPR_FINANCIAL_RETENTION_REQUIRED');
      }
    }
    // Both privacy modes must preserve unresolved fulfilment/payment records and
    // their reservations. Privacy deletion is never a stock-release or payment-
    // cancellation path; complete/reconcile the normal order lifecycle first.
    if(exportedSelection.orders.some(order=>!['completed','cancelled'].includes(order.status))) throw new Error('GDPR_OPEN_ORDERS');
    for(const orderId of orderIds) {
      const openReturn=await getRow("SELECT id FROM order_returns WHERE order_id=? AND status NOT IN ('rejected','refund_recorded','completed','cancelled') LIMIT 1",[orderId],tx);
      const openLegacyReturn=await getRow("SELECT id FROM return_requests WHERE order_id=? AND status NOT IN ('rejected','refund_recorded','completed','cancelled') LIMIT 1",[orderId],tx);
      if(openReturn||openLegacyReturn) throw new Error('GDPR_OPEN_RETURNS');
    }
    // Customer privacy deletion must include separate opt-in and email-delivery records.
    await run('DELETE FROM newsletter_deliveries WHERE lower(email)=lower(?)',[email],tx);
    await run('DELETE FROM newsletter_subscriptions WHERE lower(email)=lower(?)',[email],tx);
    await run('DELETE FROM stock_alerts WHERE lower(email)=lower(?)',[email],tx);
    await run('DELETE FROM account_login_limits WHERE email_hash=?',[crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')],tx);
    let deletedSessions=0;
    if(customer) deletedSessions=(await run('DELETE FROM sessions WHERE user_id=?',[customer.id],tx)).changes;
    let deletedOrders=0;
    let minimizedOrders=0;
    for(const orderId of orderIds) {
      // Retain audit event identity, action and timestamps, but erase arbitrary
      // customer-associated metadata in both deletion and minimization modes.
      await run("UPDATE audit_logs SET meta_json=? WHERE target_type='order' AND target_id=?",[JSON.stringify({privacy_minimized:true}),String(orderId)],tx);
      if(!minimize) {
        deletedOrders+=(await run('DELETE FROM orders WHERE id=?',[orderId],tx)).changes;
        continue;
      }
      // This is data minimization, not a claim of anonymous or legally compliant
      // records. Keep amounts, line items, currency/country, references and dates
      // for the operator's chosen policy; revoke customer access and free text.
      const retainedOrder=await getRow('SELECT * FROM orders WHERE id=?',[orderId],tx);
      const retainedItems=await getRows('SELECT id,product_id,quantity,total_cents,unit_cost_cents FROM order_items WHERE order_id=? ORDER BY id',[orderId],tx);
      if(retainedItems.length){
        const {productTaxCents}=allocateOrderAccounting(retainedOrder,retainedItems);
        await run('UPDATE orders SET product_tax_cents=? WHERE id=?',[productTaxCents,orderId],tx);
      }
      const replacementEmail=`redacted-${crypto.randomUUID()}@privacy.invalid`;
      const customerId=customer?.id??null;
      minimizedOrders+=(await run(`UPDATE orders SET user_id=NULL,email=?,shipping_name='',shipping_address='',shipping_city='',shipping_postal_code='',customer_phone='',
        customer_note='',tax_rule_snapshot='',shipping_rule_snapshot='',cancellation_reason='',cancellation_request_reason='',
        payment_instructions_snapshot='',payment_url=NULL,guest_access_token_hash=NULL,client_token=NULL,payment_credential_fingerprint='',
        cancelled_by_user_id=CASE WHEN cancelled_by_user_id=? THEN NULL ELSE cancelled_by_user_id END,
        cancellation_requested_by_user_id=CASE WHEN cancellation_requested_by_user_id=? THEN NULL ELSE cancellation_requested_by_user_id END,
        cancellation_request_decided_by_user_id=CASE WHEN cancellation_request_decided_by_user_id=? THEN NULL ELSE cancellation_request_decided_by_user_id END,
        last_status_actor_user_id=CASE WHEN last_status_actor_user_id=? THEN NULL ELSE last_status_actor_user_id END
        WHERE id=?`,[replacementEmail,customerId,customerId,customerId,customerId,orderId],tx)).changes;
      await run("UPDATE order_returns SET user_id=NULL,reason='Customer data minimized',manager_note='',exchange_tracking_reference='' WHERE order_id=?",[orderId],tx);
      await run("UPDATE return_requests SET user_id=NULL,reason='Customer data minimized',manager_note='' WHERE order_id=?",[orderId],tx);
      await run("UPDATE order_status_history SET note='',actor_user_id=CASE WHEN actor_user_id=? THEN NULL ELSE actor_user_id END WHERE order_id=?",[customerId,orderId],tx);
      await run("UPDATE order_email_deliveries SET recipient_email='',provider_message_id=NULL,error_code='ORDER_EMAIL_PRIVACY_MINIMIZED',payload_json='',provider_fingerprint='',provider_idempotency_key='',claim_token='',lease_expires_at_ms=0,next_attempt_at_ms=0,needs_reconciliation=1 WHERE order_id=?",[orderId],tx);
      await run("UPDATE gift_card_ledger SET note='' WHERE order_id=?",[orderId],tx);
    }
    if(customer) {
      await run("UPDATE audit_logs SET meta_json=? WHERE (target_type='customer' AND target_id=?) OR user_id=?",[JSON.stringify({privacy_minimized:true}),String(customer.id),customer.id],tx);
      const deleted=(await run("DELETE FROM users WHERE id=? AND role='customer'",[customer.id],tx)).changes;
      if(deleted!==1) throw new Error('GDPR_CUSTOMER_CHANGED');
    }
    const targetHash=crypto.createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0,16);
    const auditTargetId=customer?String(customer.id):`guest:${targetHash}`;
    await run("UPDATE audit_logs SET meta_json=? WHERE target_type='customer' AND target_id=?",[JSON.stringify({privacy_minimized:true}),`guest:${targetHash}`],tx);
    await run('INSERT INTO audit_logs(user_id,action,target_type,target_id,meta_json) VALUES(?,?,?,?,?)',[
      actor,'gdpr_customer_delete','customer',auditTargetId,
      JSON.stringify({matched_by:input.customerId!==null?'customer_id':'email',account_deleted:Boolean(customer),orders_deleted:deletedOrders,orders_minimized:minimizedOrders,financial_records_retained:minimize?orderIds.length:0,sessions_deleted:deletedSessions,uploads_deleted:0,mode,...(minimize?{retention_policy_reference:policyReference}:{})})
    ],tx);
    await tx.commit();
    return {customerId:customer?.id??null,email,ordersDeleted:deletedOrders,ordersMinimized:minimizedOrders,financialRecordsRetained:minimize?orderIds.length:0,sessionsDeleted:deletedSessions,accountDeleted:Boolean(customer),uploadsDeleted:0,mode};
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function listOrders({limit=100,offset=0,search='',status=''}={}) {
  const conditions=[]; const params={};
  if(search){conditions.push("(CAST(o.id AS TEXT)=@search OR o.email LIKE @likeSearch ESCAPE '!' OR o.payment_reference LIKE @likeSearch ESCAPE '!')");params.search=search;params.likeSearch=`%${escapeLike(search)}%`;}
  if(status && ['pending','paid','processing','shipped','completed','cancelled'].includes(status)){conditions.push('o.status=@status');params.status=status;}
  const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
  params.limit=Math.min(Math.max(Number(limit)||100,1),200); params.offset=Math.max(Number(offset)||0,0);
  return getRows(`SELECT o.*, u.email AS account_email FROM orders o LEFT JOIN users u ON u.id=o.user_id ${where} ORDER BY o.created_at DESC LIMIT @limit OFFSET @offset`,params);
}
export async function countOrders({search='',status=''}={}) {
  const conditions=[]; const params={};
  if(search){conditions.push("(CAST(o.id AS TEXT)=@search OR o.email LIKE @likeSearch ESCAPE '!' OR o.payment_reference LIKE @likeSearch ESCAPE '!')");params.search=search;params.likeSearch=`%${escapeLike(search)}%`;}
  if(status && ['pending','paid','processing','shipped','completed','cancelled'].includes(status)){conditions.push('o.status=@status');params.status=status;}
  const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
  return Number((await getRow(`SELECT COUNT(*) AS c FROM orders o ${where}`,params)).c||0);
}
export async function getOrderByClientToken(token) { return getRow('SELECT * FROM orders WHERE client_token=?',[token]); }
export async function getOrder(id) { const order = await getRow('SELECT * FROM orders WHERE id=?',[id]); if (!order) return null; order.items = await getRows('SELECT oi.*, p.image_url AS image_url FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? ORDER BY oi.id',[id]); return order; }

export async function findOrderByPaymentReference(provider, reference) {
  const safeProvider=String(provider||'').trim().toLowerCase();
  const safeReference=String(reference||'').trim();
  if(!['mollie'].includes(safeProvider)||!/^tr_[A-Za-z0-9]+$/.test(safeReference)) return null;
  return getRow('SELECT * FROM orders WHERE payment_provider=? AND payment_reference=?',[safeProvider,safeReference]);
}

// Persist a verified Mollie snapshot of money returned/charged back. Provider data
// must already have passed validateMolliePaymentForOrder in the caller; this function
// independently binds the snapshot to the exact order/payment reference and currency.
export async function recordMolliePaymentFinancialSnapshot({orderId, paymentId, currency, refundedCents=null, chargedBackCents=0}={}) {
  const id=Number(orderId), reference=String(paymentId||'').trim(), expectedCurrency=String(currency||'').trim().toUpperCase();
  if(!Number.isSafeInteger(id)||id<1||!/^tr_[A-Za-z0-9]+$/.test(reference)) throw new Error('PAYMENT_PROVIDER_FINANCIAL_REFERENCE_INVALID');
  if(!isValidCurrency(expectedCurrency)) throw new Error('PAYMENT_PROVIDER_FINANCIAL_CURRENCY_MISMATCH');
  if(refundedCents!==null&&(!Number.isSafeInteger(refundedCents)||refundedCents<0)) throw new Error('PAYMENT_PROVIDER_FINANCIAL_AMOUNT_INVALID');
  if(!Number.isSafeInteger(chargedBackCents)||chargedBackCents<0) throw new Error('PAYMENT_PROVIDER_FINANCIAL_AMOUNT_INVALID');
  const tx=await db.transaction('write');
  try {
    const order=await getRow('SELECT id,payment_provider,payment_reference,currency,total_cents,provider_amount_refunded_cents,provider_amount_charged_back_cents FROM orders WHERE id=?',[id],tx);
    if(!order||order.payment_provider!=='mollie'||order.payment_reference!==reference) throw new Error('PAYMENT_PROVIDER_FINANCIAL_REFERENCE_MISMATCH');
    if(String(order.currency||'').trim().toUpperCase()!==expectedCurrency) throw new Error('PAYMENT_PROVIDER_FINANCIAL_CURRENCY_MISMATCH');
    const total=Number(order.total_cents);
    if(!Number.isSafeInteger(total)||total<0||chargedBackCents>total) throw new Error('PAYMENT_PROVIDER_FINANCIAL_AMOUNT_EXCEEDS_ORDER');
    // Mollie explicitly allows amountRefunded to exceed the original payment when
    // refunding costs such as return shipping. Validate a safe integer but do not
    // apply an order-total ceiling to this provider-reported aggregate.
    const nextRefunded=refundedCents===null?Number(order.provider_amount_refunded_cents||0):refundedCents;
    const nextChargedBack=chargedBackCents;
    const changed=nextRefunded!==Number(order.provider_amount_refunded_cents||0)||nextChargedBack!==Number(order.provider_amount_charged_back_cents||0);
    await run(`UPDATE orders SET provider_amount_refunded_cents=?,provider_amount_charged_back_cents=?,provider_financials_checked_at=datetime('now'),updated_at=datetime('now') WHERE id=? AND payment_provider='mollie' AND payment_reference=?`,[nextRefunded,nextChargedBack,id,reference],tx);
    await tx.commit();
    return {changed,orderId:id,currency:String(order.currency||'').toUpperCase(),refundedCents:nextRefunded,chargedBackCents:nextChargedBack,previousRefundedCents:Number(order.provider_amount_refunded_cents||0),previousChargedBackCents:Number(order.provider_amount_charged_back_cents||0)};
  } catch(error) { try{await tx.rollback();}catch{} throw error; }
}

export async function updatePendingOrderPaymentDetails(id, provider, reference, checkoutUrl) {
  const safeProvider=String(provider||'').trim().toLowerCase();
  const safeReference=String(reference||'').trim();
  let parsedUrl;
  try { parsedUrl=new URL(String(checkoutUrl||'')); } catch { return false; }
  if(safeProvider!=='mollie'||!/^tr_[A-Za-z0-9]+$/.test(safeReference)||parsedUrl.protocol!=='https:'||parsedUrl.username||parsedUrl.password||parsedUrl.port||!(parsedUrl.hostname==='mollie.com'||parsedUrl.hostname.endsWith('.mollie.com'))) return false;
  const orderId=Number(id);
  if(!Number.isSafeInteger(orderId)||orderId<1) return false;
  // The webhook may safely attach this same provider reference before the
  // original checkout request has saved the hosted URL. Allow filling only empty
  // fields or re-saving the identical reference/URL; never replace another attempt.
  const trustedUrl=parsedUrl.toString();
  const changed=await run("UPDATE orders SET payment_reference=?,payment_url=?,updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider=? AND (payment_reference IS NULL OR payment_reference='' OR payment_reference=?) AND (payment_url IS NULL OR payment_url='' OR payment_url=?)",[safeReference,trustedUrl,orderId,safeProvider,safeReference,trustedUrl]);
  if(changed.changes===1) return true;
  const existing=await getRow('SELECT status,payment_provider,payment_reference,payment_url FROM orders WHERE id=?',[orderId]);
  return Boolean(existing&&existing.status==='pending'&&existing.payment_provider===safeProvider&&existing.payment_reference===safeReference&&existing.payment_url===parsedUrl.toString());
}

// Manager recovery path for a card attempt whose POST may have succeeded at Mollie
// while ShopEasy timed out before saving the provider reference. Call only after the
// server has fetched and validated that exact payment against this order's metadata,
// amount and currency. This never releases stock or marks an order paid by itself.
export async function attachReconciledMolliePaymentReference(id, reference, checkoutUrl=null) {
  const orderId=Number(id),safeReference=String(reference||'').trim();
  if(!Number.isSafeInteger(orderId)||orderId<1||!/^tr_[A-Za-z0-9]+$/.test(safeReference)) return false;
  let safeUrl=null;
  if(checkoutUrl!=null&&String(checkoutUrl).trim()!=='') {
    let parsedUrl;
    try { parsedUrl=new URL(String(checkoutUrl)); } catch { return false; }
    if(parsedUrl.protocol!=='https:'||parsedUrl.username||parsedUrl.password||parsedUrl.port||!(parsedUrl.hostname==='mollie.com'||parsedUrl.hostname.endsWith('.mollie.com'))) return false;
    safeUrl=parsedUrl.toString();
  }
  const changed=await run("UPDATE orders SET payment_reference=?,payment_url=COALESCE(NULLIF(payment_url,''),?),updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider='mollie' AND (payment_reference IS NULL OR payment_reference='' OR payment_reference=?) AND (payment_url IS NULL OR payment_url='' OR ? IS NULL OR payment_url=?)",[safeReference,safeUrl,orderId,safeReference,safeUrl,safeUrl]);
  if(changed.changes===1) return true;
  const existing=await getRow('SELECT status,payment_provider,payment_reference,payment_url FROM orders WHERE id=?',[orderId]);
  return Boolean(existing&&existing.status==='pending'&&existing.payment_provider==='mollie'&&existing.payment_reference===safeReference&&(!safeUrl||existing.payment_url===safeUrl));
}

function minorUnitsToProviderValue(minorUnits, currency) {
  const factor=currencyMinorUnitFactor(currency);
  const digits=currencyMinorUnitDigits(currency);
  const amount=Number(minorUnits);
  if(!Number.isSafeInteger(amount)||amount<0||!isValidCurrency(currency)) throw new Error('PAYMENT_AMOUNT_INVALID');
  const whole=Math.floor(amount/factor);
  const fraction=String(amount%factor).padStart(digits,'0');
  return digits?`${whole}.${fraction}`:String(whole);
}

// The status trigger owns creation of history rows. Enrich only the newest
// transition in the same transaction; never insert a second history event.
async function annotateOrderStatusTransition(orderId, fromStatus, toStatus, note, tx) {
  const changed=await run(`UPDATE order_status_history SET note=? WHERE id=(
    SELECT id FROM order_status_history WHERE order_id=? ORDER BY id DESC LIMIT 1
  ) AND from_status=? AND to_status=?`,[note,orderId,fromStatus,toStatus],tx);
  if(changed.changes!==1) throw new Error('ORDER_HISTORY_TRANSITION_MISSING');
}

export async function markProviderOrderPaid(id, provider, reference, receivedAmountMinor, receivedCurrency) {
  const orderId=Number(id),safeProvider=String(provider||'').trim().toLowerCase(),safeReference=String(reference||'').trim(),currency=String(receivedCurrency||'').trim().toUpperCase();
  const amount=Number(receivedAmountMinor);
  if(!Number.isSafeInteger(orderId)||orderId<1||safeProvider!=='mollie'||!/^tr_[A-Za-z0-9]+$/.test(safeReference)||!Number.isSafeInteger(amount)||amount<0||!isValidCurrency(currency)) return false;
  const tx=await db.transaction('write');
  try {
    const order=await getRow('SELECT id,status,payment_provider,payment_reference,total_cents,currency FROM orders WHERE id=?',[orderId],tx);
    if(!order||order.payment_provider!==safeProvider||order.payment_reference!==safeReference||String(order.currency||'').toUpperCase()!==currency||Number(order.total_cents)!==amount){await tx.rollback();return false;}
    if(order.status==='paid') { await tx.rollback(); return true; }
    if(order.status!=='pending') { await tx.rollback(); return false; }
    const reservations=await getRows(`SELECT oi.product_id,oi.variant_id,SUM(oi.quantity) AS quantity,
      CASE WHEN oi.variant_id IS NULL THEN p.reserved_stock ELSE pv.reserved_stock END AS reserved_stock
      FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_variants pv ON pv.id=oi.variant_id AND pv.product_id=oi.product_id
      WHERE oi.order_id=? GROUP BY oi.product_id,oi.variant_id,p.reserved_stock,pv.reserved_stock`,[orderId],tx);
    if(!reservations.length||reservations.some(item=>!item.product_id||!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<1||!Number.isSafeInteger(Number(item.reserved_stock))||Number(item.reserved_stock)<Number(item.quantity))) {
      await tx.rollback(); return false;
    }
    const changed=await run("UPDATE orders SET status='paid',last_status_actor_type='system',last_status_actor_user_id=NULL,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider=? AND payment_reference=? AND total_cents=? AND currency=?",[orderId,safeProvider,safeReference,amount,currency],tx);
    if(changed.changes!==1){await tx.rollback();return false;}
    await annotateOrderStatusTransition(orderId,'pending','paid','Payment confirmed by Mollie API',tx);
    await tx.commit();
    return true;
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}

export async function confirmBankTransferOrderPaid(id, receivedAmountMinor, receivedCurrency, bankReference, managerUserId) {
  const orderId=Number(id),amount=Number(receivedAmountMinor),currency=String(receivedCurrency||'').trim().toUpperCase();
  const reference=normalizeBankTransactionReference(bankReference);
  const actorId=Number(managerUserId);
  if(!Number.isSafeInteger(orderId)||orderId<1||!Number.isSafeInteger(amount)||amount<1||!isValidCurrency(currency)||
      !/^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,99}$/.test(reference)||!Number.isSafeInteger(actorId)||actorId<1) return false;
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT id,status,payment_provider,total_cents,currency,payment_instructions_snapshot FROM orders WHERE id=?",[orderId],tx);
    if(!order||order.status!=='pending'||order.payment_provider!=='bank_transfer'||Number(order.total_cents)!==amount||String(order.currency||'').toUpperCase()!==currency) {
      await tx.rollback(); return false;
    }
    const snapshot=parseBankTransferSnapshot(order.payment_instructions_snapshot);
    if(!snapshot||snapshot.reference!==`SHOP-${orderId}`) { await tx.rollback(); return false; }
    const paymentReference=`bank_transfer:${reference}`;
    if(await getRow('SELECT id FROM orders WHERE payment_reference=? AND id<>?',[paymentReference,orderId],tx)) { await tx.rollback(); return false; }
    const reservations=await getRows(`SELECT oi.product_id,oi.variant_id,SUM(oi.quantity) AS quantity,
      CASE WHEN oi.variant_id IS NULL THEN p.reserved_stock ELSE pv.reserved_stock END AS reserved_stock
      FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_variants pv ON pv.id=oi.variant_id AND pv.product_id=oi.product_id
      WHERE oi.order_id=? GROUP BY oi.product_id,oi.variant_id,p.reserved_stock,pv.reserved_stock`,[orderId],tx);
    if(!reservations.length||reservations.some(item=>!item.product_id||!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<1||!Number.isSafeInteger(Number(item.reserved_stock))||Number(item.reserved_stock)<Number(item.quantity))) {
      await tx.rollback(); return false;
    }
    const changed=await run("UPDATE orders SET status='paid',payment_reference=?,last_status_actor_type='manager',last_status_actor_user_id=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider='bank_transfer' AND total_cents=? AND currency=?",[paymentReference,actorId,orderId,amount,currency],tx);
    if(changed.changes!==1) { await tx.rollback(); return false; }
    await annotateOrderStatusTransition(orderId,'pending','paid','Bank transfer manually verified against the store bank statement by the Manager',tx);
    await tx.commit();
    return true;
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}

export async function cancelProviderPendingOrder(id, provider, reference, reason='Provider confirmed that payment did not complete') {
  const orderId=Number(id),safeProvider=String(provider||'').trim().toLowerCase(),safeReference=String(reference||'').trim();
  if(!Number.isSafeInteger(orderId)||orderId<1||safeProvider!=='mollie'||!/^tr_[A-Za-z0-9]+$/.test(safeReference)) return false;
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT id,status,payment_provider,payment_reference FROM orders WHERE id=? AND status='pending' AND payment_provider=? AND payment_reference=?",[orderId,safeProvider,safeReference],tx);
    if(!order){await tx.rollback();return false;}
    const safeReason=String(reason||'Provider confirmed that payment did not complete').trim().slice(0,500);
    const changed=await run("UPDATE orders SET status='cancelled',last_status_actor_type='system',last_status_actor_user_id=NULL,cancellation_reason=?,cancellation_actor='system',cancelled_at=datetime('now'),reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider=? AND payment_reference=?",[safeReason,orderId,safeProvider,safeReference],tx);
    if(changed.changes!==1){await tx.rollback();return false;}
    const items=await getRows('SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=?',[orderId],tx);
    if(!items.length) throw new Error('STOCK_INTEGRITY');
    for(const item of items){
      if(item.product_id==null) throw new Error('STOCK_INTEGRITY');
      const released=item.variant_id
        ? await run("UPDATE product_variants SET reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND reserved_stock>=?",[item.quantity,item.variant_id,item.product_id,item.quantity],tx)
        : await run("UPDATE products SET reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND reserved_stock>=?",[item.quantity,item.product_id,item.quantity],tx);
      if(released.changes!==1) throw new Error('STOCK_INTEGRITY');
    }
    await annotateOrderStatusTransition(orderId,'pending','cancelled',`Provider payment not completed: ${safeReason}`,tx);
    await tx.commit();
    return true;
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
export async function listOrderStatusHistory(orderId) { return getRows('SELECT h.*,u.email AS actor_email FROM order_status_history h LEFT JOIN users u ON u.id=h.actor_user_id WHERE h.order_id=? ORDER BY h.created_at,h.id',[orderId]); }
export async function listOrderReturns(orderId) { return getRows(`SELECT r.*,oi.product_name,oi.sku,oi.variant_name,oi.variant_value,oi.variant_name_2,oi.variant_value_2,oi.unit_price_cents,oi.quantity AS purchased_quantity FROM order_returns r JOIN order_items oi ON oi.id=r.order_item_id WHERE r.order_id=? ORDER BY r.created_at DESC,r.id DESC`,[orderId]); }
export async function getOrderReturn(id) { return getRow(`SELECT r.*,o.email AS customer_email,o.currency,o.total_cents,o.status AS order_status,oi.product_name,oi.sku,oi.variant_name,oi.variant_value,oi.variant_name_2,oi.variant_value_2,oi.product_id,oi.variant_id,oi.unit_price_cents,oi.total_cents AS item_total_cents,oi.quantity AS purchased_quantity FROM order_returns r JOIN orders o ON o.id=r.order_id JOIN order_items oi ON oi.id=r.order_item_id WHERE r.id=?`,[id]); }
export async function countOrderReturnRequests({status=''}={}) {
  const valid=['requested','approved','rejected','item_received','exchange_sent','refund_recorded','completed','cancelled'].includes(status);
  return Number((await getRow(`SELECT COUNT(*) AS count FROM order_returns r JOIN orders o ON o.id=r.order_id JOIN order_items oi ON oi.id=r.order_item_id${valid?' WHERE r.status=?':''}`,valid?[status]:[]))?.count||0);
}
export async function listOrderReturnRequests({status='',limit=50,offset=0}={}) {
  const params={limit:Math.min(Math.max(Number(limit)||50,1),100),offset:Math.max(0,Math.floor(Number(offset)||0))};
  const where=[];
  if(['requested','approved','rejected','item_received','exchange_sent','refund_recorded','completed','cancelled'].includes(status)){where.push('r.status=@status');params.status=status;}
  const requests=await getRows(`SELECT r.*,o.email AS customer_email,o.currency,o.total_cents,o.discount_cents,o.bundle_discount_cents,o.status AS order_status,oi.product_name,oi.sku,oi.variant_name,oi.variant_value,oi.variant_name_2,oi.variant_value_2,oi.unit_price_cents,oi.total_cents AS item_total_cents,oi.quantity AS purchased_quantity FROM order_returns r JOIN orders o ON o.id=r.order_id JOIN order_items oi ON oi.id=r.order_item_id ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY CASE r.status WHEN 'requested' THEN 0 WHEN 'approved' THEN 1 WHEN 'item_received' THEN 2 ELSE 3 END,r.created_at DESC,r.id DESC LIMIT @limit OFFSET @offset`,params);
  if(!requests.length) return requests;

  // Show the Manager the same coupon-adjusted per-quantity ceiling that the write
  // transaction will enforce. Batch by the at-most-100 orders in this page rather
  // than issuing one query per return card.
  const orderIds=[...new Set(requests.map(row=>Number(row.order_id)).filter(id=>Number.isSafeInteger(id)&&id>0))];
  const placeholders=orderIds.map(()=>'?').join(',');
  const [orderRows,lines,refundRows,tenderRefundRows]=await Promise.all([
    getRows(`SELECT id,discount_cents,bundle_discount_cents,total_cents FROM orders WHERE id IN (${placeholders})`,orderIds),
    getRows(`SELECT order_id,id,total_cents FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id,id`,orderIds),
    getRows(`SELECT order_id,order_item_id,COALESCE(SUM(refund_amount_cents),0) AS refunded_cents FROM order_returns WHERE order_id IN (${placeholders}) AND refund_recorded_at IS NOT NULL GROUP BY order_id,order_item_id`,orderIds),
    getRows(`SELECT order_id,COALESCE(SUM(amount_cents),0) AS refunded_cents FROM gift_card_ledger WHERE event='refund' AND order_id IN (${placeholders}) GROUP BY order_id`,orderIds)
  ]);
  const discountByOrder=new Map(orderRows.map(row=>[Number(row.id),Number(row.discount_cents||0)+Number(row.bundle_discount_cents||0)]));
  const orderTotalById=new Map(orderRows.map(row=>[Number(row.id),Number(row.total_cents)]));
  const linesByOrder=new Map();
  for(const line of lines){const key=Number(line.order_id);if(!linesByOrder.has(key))linesByOrder.set(key,[]);linesByOrder.get(key).push({id:Number(line.id),totalCents:Number(line.total_cents)});}
  const tenderRefundedByOrder=new Map(tenderRefundRows.map(row=>{const amount=Number(row.refunded_cents);return [Number(row.order_id),Number.isSafeInteger(amount)&&amount>=0?amount:Number.MAX_SAFE_INTEGER];}));
  const refundedByOrderItem=new Map();
  const refundedByOrder=new Map();
  for(const row of refundRows){
    const orderId=Number(row.order_id),itemId=Number(row.order_item_id),amount=Number(row.refunded_cents);
    if(!Number.isSafeInteger(orderId)||!Number.isSafeInteger(itemId)||!Number.isSafeInteger(amount)||amount<0) continue;
    refundedByOrderItem.set(`${orderId}:${itemId}`,amount);
    const previous=refundedByOrder.get(orderId)||0;
    refundedByOrder.set(orderId,Number.isSafeInteger(previous+amount)?previous+amount:Number.MAX_SAFE_INTEGER);
  }
  const netByOrderItem=new Map();
  for(const orderId of orderIds){
    const netLines=allocateCouponDiscountAcrossItems({items:linesByOrder.get(orderId)||[],discountCents:discountByOrder.get(orderId)??0});
    if(!netLines) continue;
    for(const line of netLines) netByOrderItem.set(`${orderId}:${line.id}`,line.netCents);
  }
  return requests.map(row=>{
    const net=netByOrderItem.get(`${Number(row.order_id)}:${Number(row.order_item_id)}`);
    row.item_net_total_cents=Number.isSafeInteger(net)?net:null;
    const requestMaximum=Number.isSafeInteger(net)?maxRefundForRequestCents({itemTotalCents:net,purchasedQuantity:Number(row.purchased_quantity),requestedQuantity:Number(row.quantity)}):0;
    row.refund_max_cents=availableRefundMaximumCents({
      requestMaximumCents:requestMaximum,
      itemNetTotalCents:Number.isSafeInteger(net)?net:0,
      itemRefundedCents:refundedByOrderItem.get(`${Number(row.order_id)}:${Number(row.order_item_id)}`)||0,
      orderTotalCents:orderTotalById.get(Number(row.order_id)),
      orderRefundedCents:refundedByOrder.get(Number(row.order_id))||0,
      tenderRefundedCents:tenderRefundedByOrder.get(Number(row.order_id))||0
    });
    return row;
  });
}
export async function claimOrderEmailDelivery(orderId,eventKey,eventType,recipientEmail,dailyLimit=10,{payload='',providerFingerprint=''}={}) {
  const recipient=String(recipientEmail||'').trim().toLowerCase();
  const key=String(eventKey||'');
  const validEvent=eventType==='confirmation'?key==='confirmation':eventType==='status'&&/^status:(pending|paid|processing|shipped|completed|cancelled)$/.test(key);
  if(!validEvent||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||recipient.length>254||
      !/^[a-f0-9]{64}$/.test(providerFingerprint)||!validOrderEmailPayload(payload,recipient)) return {claimed:false,reason:'invalid'};
  const limit=Math.min(Math.max(Math.floor(Number(dailyLimit)||10),1),100);
  const tx=await db.transaction('write');
  try {
    const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
    const order=await getRow('SELECT id FROM orders WHERE id=?',[orderId],tx);
    if(!order){await tx.rollback();return {claimed:false,reason:'order-not-found'};}
    const existing=await getRow('SELECT * FROM order_email_deliveries WHERE order_id=? AND event_key=?',[orderId,key],tx);
    if(existing?.status==='sent'){await tx.rollback();return {claimed:false,reason:'already-sent',status:'sent'};}
    if(existing?.status==='sending'&&Number(existing.lease_expires_at_ms)>now){await tx.rollback();return {claimed:false,reason:'in-progress',leaseExpiresAtMs:Number(existing.lease_expires_at_ms)};}
    const previousAttempts=Number(existing?.attempt_count||0);
    const priorGeneration=existing&&previousAttempts>0;
    let reconciliationReason='';
    if(existing?.needs_reconciliation) reconciliationReason=existing.error_code||'ORDER_EMAIL_RECONCILIATION_REQUIRED';
    else if(priorGeneration&&(!existing.payload_json||!existing.provider_idempotency_key||!existing.provider_fingerprint||!Number(existing.first_attempt_at_ms))) reconciliationReason='ORDER_EMAIL_LEGACY_RECONCILIATION';
    else if(priorGeneration&&existing.provider_fingerprint!==providerFingerprint) reconciliationReason='ORDER_EMAIL_PROVIDER_CHANGED';
    else if(priorGeneration&&(now<Number(existing.first_attempt_at_ms)||now-Number(existing.first_attempt_at_ms)>=ORDER_EMAIL_RETRY_WINDOW_MS)) reconciliationReason='ORDER_EMAIL_RETRY_WINDOW_EXPIRED';
    else if(previousAttempts>=ORDER_EMAIL_MAX_ATTEMPTS) reconciliationReason='ORDER_EMAIL_ATTEMPTS_EXHAUSTED';
    if(reconciliationReason){
      await run("UPDATE order_email_deliveries SET status='failed',needs_reconciliation=1,error_code=?,claim_token='',lease_expires_at_ms=0,next_attempt_at_ms=0 WHERE id=?",[reconciliationReason,existing.id],tx);
      await tx.commit();
      return {claimed:false,reason:'reconciliation-required',status:'failed',reconciliationReason};
    }
    if(existing&&Number(existing.next_attempt_at_ms)>now){await tx.rollback();return {claimed:false,reason:'retry-later',nextAttemptAtMs:Number(existing.next_attempt_at_ms)};}
    // Count attempts, including retries, rather than just unique order/event rows.
    // Legacy rows without a day represent their original single attempt.
    const count=Number((await getRow("SELECT COALESCE(SUM(CASE WHEN attempt_day=? THEN attempts_today WHEN attempt_day='' AND date(created_at)=? THEN 1 ELSE 0 END),0) AS count FROM order_email_deliveries",[day,day],tx))?.count||0);
    if(!Number.isSafeInteger(count)||count>=limit){await tx.rollback();return {claimed:false,reason:'daily-limit'};}
    const claimToken=crypto.randomBytes(24).toString('base64url');
    const idempotencyKey=priorGeneration?existing.provider_idempotency_key:`shopeasy-order-${crypto.randomBytes(24).toString('base64url')}`;
    const exactPayload=priorGeneration?existing.payload_json:payload;
    const fingerprint=priorGeneration?existing.provider_fingerprint:providerFingerprint;
    const deliveryRecipient=priorGeneration?existing.recipient_email:recipient;
    const firstAttempt=priorGeneration?Number(existing.first_attempt_at_ms):now;
    const attempts=previousAttempts+1;
    const attemptsToday=existing?.attempt_day===day?Number(existing.attempts_today)+1:existing?.attempt_day===''&&String(existing.created_at).slice(0,10)===day?2:1;
    if(existing){
      await run("UPDATE order_email_deliveries SET status='sending',recipient_email=?,payload_json=?,provider_fingerprint=?,provider_idempotency_key=?,claim_token=?,attempt_count=?,first_attempt_at_ms=?,lease_expires_at_ms=?,next_attempt_at_ms=0,attempt_day=?,attempts_today=?,needs_reconciliation=0,error_code='' WHERE id=?",[deliveryRecipient,exactPayload,fingerprint,idempotencyKey,claimToken,attempts,firstAttempt,now+ORDER_EMAIL_LEASE_MS,day,attemptsToday,existing.id],tx);
    } else {
      await run("INSERT INTO order_email_deliveries(order_id,event_key,event_type,status,recipient_email,payload_json,provider_fingerprint,provider_idempotency_key,claim_token,attempt_count,first_attempt_at_ms,lease_expires_at_ms,attempt_day,attempts_today) VALUES(?,?,?,'sending',?,?,?,?,?,?,?,?,?,?)",[orderId,key,eventType,recipient,exactPayload,fingerprint,idempotencyKey,claimToken,attempts,firstAttempt,now+ORDER_EMAIL_LEASE_MS,day,1],tx);
    }
    await tx.commit();
    return {claimed:true,claimToken,payload:exactPayload,providerFingerprint:fingerprint,idempotencyKey,attempt:attempts,leaseExpiresAtMs:now+ORDER_EMAIL_LEASE_MS};
  } catch(error) {try{await tx.rollback();}catch{} throw error;}
}
export async function finishOrderEmailDelivery(orderId,eventKey,{claimToken='',sent=false,providerMessageId=null,errorCode='EMAIL_SEND_FAILED'}={}) {
  if(typeof claimToken!=='string'||!claimToken) return false;
  const tx=await db.transaction('write');
  try {
    const row=await getRow("SELECT * FROM order_email_deliveries WHERE order_id=? AND event_key=? AND status='sending' AND claim_token=?",[orderId,eventKey,claimToken],tx);
    if(!row){await tx.rollback();return false;}
    const now=Date.now(),status=sent?'sent':'failed';
    const needsReconciliation=!sent&&(Number(row.attempt_count)>=ORDER_EMAIL_MAX_ATTEMPTS||now-Number(row.first_attempt_at_ms)>=ORDER_EMAIL_RETRY_WINDOW_MS||errorCode==='ORDER_EMAIL_PROVIDER_CHANGED');
    const nextAttempt=sent||needsReconciliation?0:now+5000*(2**Math.max(0,Number(row.attempt_count)-1));
    const changed=await run("UPDATE order_email_deliveries SET status=?,provider_message_id=?,error_code=?,sent_at=CASE WHEN ?='sent' THEN datetime('now') ELSE NULL END,claim_token='',lease_expires_at_ms=0,next_attempt_at_ms=?,needs_reconciliation=? WHERE id=? AND status='sending' AND claim_token=?",[status,providerMessageId?String(providerMessageId).slice(0,200):null,sent?'':String(errorCode||'EMAIL_SEND_FAILED').slice(0,80),status,nextAttempt,needsReconciliation?1:0,row.id,claimToken],tx);
    if(sent&&eventKey==='confirmation'&&changed.changes===1) await run("UPDATE orders SET confirmation_email_sent_at=datetime('now') WHERE id=? AND confirmation_email_sent_at IS NULL",[orderId],tx);
    await tx.commit();
    return changed.changes===1;
  } catch(error) {try{await tx.rollback();}catch{} throw error;}
}
export async function getOrderEmailDeliveries(orderId) {
  return getRows('SELECT id,order_id,event_key,event_type,status,recipient_email,provider_message_id,error_code,attempt_count,first_attempt_at_ms,lease_expires_at_ms,next_attempt_at_ms,needs_reconciliation,generation,created_at,sent_at FROM order_email_deliveries WHERE order_id=? ORDER BY id',[orderId]);
}
export async function reconcileOrderEmailDelivery(orderId,eventKey,{managerUserId,outcome,providerMessageId=null,expectedGeneration,expectedAttemptCount}={}) {
  if(!['sent','not-sent'].includes(outcome)) return false;
  const actor=Number(managerUserId);
  if(!Number.isSafeInteger(actor)||actor<1||!Number.isSafeInteger(expectedGeneration)||expectedGeneration<1||!Number.isSafeInteger(expectedAttemptCount)||expectedAttemptCount<0) return false;
  const tx=await db.transaction('write');
  try {
    if(!await getRow("SELECT id FROM users WHERE id=? AND role='manager'",[actor],tx)){await tx.rollback();return false;}
    const row=await getRow('SELECT * FROM order_email_deliveries WHERE order_id=? AND event_key=?',[orderId,eventKey],tx);
    if(!row||Number(row.generation)!==expectedGeneration||Number(row.attempt_count)!==expectedAttemptCount||row.status==='sent'||(row.status==='sending'&&Number(row.lease_expires_at_ms)>Date.now())){await tx.rollback();return false;}
    // A Manager's confirmation applies only to the attempt displayed on their
    // form. Another retry/generation may have reached the provider since then.
    let changed;
    if(outcome==='sent'){
      changed=await run("UPDATE order_email_deliveries SET status='sent',provider_message_id=?,sent_at=datetime('now'),error_code='',claim_token='',lease_expires_at_ms=0,next_attempt_at_ms=0,needs_reconciliation=0 WHERE id=? AND generation=? AND attempt_count=?",[providerMessageId?String(providerMessageId).slice(0,200):null,row.id,expectedGeneration,expectedAttemptCount],tx);
      if(changed.changes===1&&eventKey==='confirmation') await run("UPDATE orders SET confirmation_email_sent_at=COALESCE(confirmation_email_sent_at,datetime('now')) WHERE id=?",[orderId],tx);
    } else {
      // Only an explicit Manager confirmation that the provider did NOT send may
      // start a new payload/key generation. Never reset the daily attempt quota.
      changed=await run("UPDATE order_email_deliveries SET status='failed',payload_json='',provider_fingerprint='',provider_idempotency_key='',provider_message_id=NULL,claim_token='',attempt_count=0,first_attempt_at_ms=0,lease_expires_at_ms=0,next_attempt_at_ms=0,needs_reconciliation=0,error_code='',generation=generation+1 WHERE id=? AND generation=? AND attempt_count=?",[row.id,expectedGeneration,expectedAttemptCount],tx);
    }
    if(changed.changes!==1){await tx.rollback();return false;}
    await run("INSERT INTO audit_logs(user_id,action,target_type,target_id,meta_json) VALUES(?,'order_email_reconciled','order',?,?)",[actor,String(orderId),JSON.stringify({event_key:String(eventKey),outcome,generation:Number(row.generation)+(outcome==='not-sent'?1:0)})],tx);
    await tx.commit();return true;
  } catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function createOrderReturnRequest({orderId,userId,orderItemId,quantity,requestType,reason,returnWindowDays=0}) {
  const qty=Number(quantity), itemId=Number(orderItemId), days=Math.max(0,Math.min(3650,Math.floor(Number(returnWindowDays)||0)));
  const type=String(requestType||''); const cleaned=String(reason||'').trim().slice(0,1000);
  const validUserId=userId==null||(Number.isSafeInteger(Number(userId))&&Number(userId)>0);
  if(!Number.isSafeInteger(Number(orderId))||Number(orderId)<1||!validUserId||!Number.isSafeInteger(itemId)||itemId<1||!Number.isSafeInteger(qty)||qty<1||!['return','exchange','refund'].includes(type)||cleaned.length<5) throw new Error('RETURN_VALIDATION');
  const tx=await db.transaction('write');
  try {
    // Guest-order ownership is checked by the HTTP route with the HttpOnly token cookie;
    // this query additionally makes sure a guest request can never target an account order.
    const order=userId==null
      ? await getRow("SELECT id,status,user_id,total_cents,updated_at FROM orders WHERE id=? AND user_id IS NULL",[orderId],tx)
      : await getRow("SELECT id,status,user_id,total_cents,updated_at FROM orders WHERE id=? AND user_id=?",[orderId,userId],tx);
    if(!order){await tx.rollback();throw new Error('RETURN_ORDER_NOT_FOUND');}
    if(order.status!=='completed'){await tx.rollback();throw new Error('RETURN_ORDER_NOT_DELIVERED');}
    const item=await getRow('SELECT id,quantity FROM order_items WHERE id=? AND order_id=?',[itemId,orderId],tx);
    if(!item){await tx.rollback();throw new Error('RETURN_ITEM_NOT_FOUND');}
    if(days>0){
      const completedAt=(await getRow("SELECT created_at FROM order_status_history WHERE order_id=? AND to_status='completed' ORDER BY id DESC LIMIT 1",[orderId],tx))?.created_at||order.updated_at;
      const normalized=String(completedAt||'').includes('T')?String(completedAt):`${String(completedAt||'').replace(' ','T')}Z`;
      const completedMs=Date.parse(normalized);
      if(Number.isFinite(completedMs)&&Date.now()>completedMs+days*86400000){await tx.rollback();throw new Error('RETURN_WINDOW_CLOSED');}
    }
    const used=Number((await getRow("SELECT COALESCE(SUM(quantity),0) AS qty FROM order_returns WHERE order_item_id=? AND request_type IN ('return','refund','exchange') AND status NOT IN ('rejected','cancelled')",[itemId],tx))?.qty||0);
    if(used+qty>Number(item.quantity)){await tx.rollback();throw new Error('RETURN_QUANTITY_EXCEEDED');}
    const id=Number((await run("INSERT INTO order_returns(order_id,order_item_id,user_id,request_type,quantity,reason) VALUES(?,?,?,?,?,?)",[orderId,itemId,userId==null?null:Number(userId),type,qty,cleaned],tx)).lastInsertRowid);
    await run("INSERT INTO return_requests(id,order_id,order_item_id,user_id,request_type,quantity,reason,status,created_at,updated_at) SELECT id,order_id,order_item_id,user_id,request_type,quantity,reason,status,created_at,updated_at FROM order_returns WHERE id=?",[id],tx);
    await tx.commit();return id;
  } catch(error){try{await tx.rollback();}catch{}throw error;}
}
export async function processOrderReturn({returnId,action,managerUserId,note='',refundAmountCents=0,refundMethod='',refundReference='',restock=false}) {
  const allowedActions=['approve','reject','receive','record_refund','dispatch_exchange','complete_exchange'];
  if(!allowedActions.includes(action)) return {changed:false,reason:'invalid-action'};
  const cleanedNote=String(note||'').trim().slice(0,500), reference=String(refundReference||'').trim().slice(0,100);
  const amount=Number(refundAmountCents), method=String(refundMethod||'');
  const tx=await db.transaction('write');
  try {
    const row=await getRow(`SELECT r.*,o.total_cents,o.discount_cents,o.bundle_discount_cents,o.currency,o.status AS order_status,oi.product_id,oi.variant_id,oi.total_cents AS item_total_cents,oi.quantity AS purchased_quantity FROM order_returns r JOIN orders o ON o.id=r.order_id JOIN order_items oi ON oi.id=r.order_item_id WHERE r.id=?`,[returnId],tx);
    if(!row){await tx.rollback();return {changed:false,reason:'not-found'};}
    let changed=false;
    if(action==='approve'&&row.status==='requested'){
      changed=(await run("UPDATE order_returns SET status='approved',manager_note=?,processed_by_user_id=?,updated_at=datetime('now') WHERE id=? AND status='requested'",[cleanedNote,managerUserId,returnId],tx)).changes===1;
    } else if(action==='reject'&&row.status==='requested'){
      changed=(await run("UPDATE order_returns SET status='rejected',manager_note=?,processed_by_user_id=?,updated_at=datetime('now') WHERE id=? AND status='requested'",[cleanedNote,managerUserId,returnId],tx)).changes===1;
    } else if(action==='receive'&&row.status==='approved'&&['return','exchange'].includes(row.request_type)){
      if(restock){
        if(!row.product_id) {await tx.rollback();return {changed:false,reason:'product-missing'};}
        const quantity=Number(row.quantity);
        if(!Number.isSafeInteger(quantity)||quantity<1){await tx.rollback();return {changed:false,reason:'inventory-invalid'};}
        const stockChange=row.variant_id
          ? await run("UPDATE product_variants SET stock=stock+?,updated_at=datetime('now') WHERE id=? AND product_id=? AND stock<=?",[quantity,row.variant_id,row.product_id,Number.MAX_SAFE_INTEGER-quantity],tx)
          : await run("UPDATE products SET stock=stock+?,updated_at=datetime('now') WHERE id=? AND stock<=?",[quantity,row.product_id,Number.MAX_SAFE_INTEGER-quantity],tx);
        if(stockChange.changes!==1){await tx.rollback();return {changed:false,reason:'inventory-missing'};}
      }
      changed=(await run("UPDATE order_returns SET status='item_received',restocked_at=CASE WHEN ?=1 THEN datetime('now') ELSE restocked_at END,manager_note=?,processed_by_user_id=?,updated_at=datetime('now') WHERE id=? AND status='approved'",[restock?1:0,cleanedNote,managerUserId,returnId],tx)).changes===1;
    } else if(action==='record_refund'&&row.request_type!=='exchange'&&Number.isSafeInteger(amount)&&amount>0&&['cash','bank_transfer','other'].includes(method)){
      const allowedStatus=row.request_type==='refund'?['approved','item_received']:['item_received'];
      if(allowedStatus.includes(row.status)){
        const already=Number((await getRow('SELECT COALESCE(SUM(refund_amount_cents),0) AS amount FROM order_returns WHERE order_id=? AND refund_recorded_at IS NOT NULL',[row.order_id],tx))?.amount||0);
        const tenderRefunded=Number((await getRow("SELECT COALESCE(SUM(amount_cents),0) AS amount FROM gift_card_ledger WHERE order_id=? AND event='refund'",[row.order_id],tx))?.amount||0);
        const alreadyForItem=Number((await getRow('SELECT COALESCE(SUM(refund_amount_cents),0) AS amount FROM order_returns WHERE order_item_id=? AND refund_recorded_at IS NOT NULL',[row.order_item_id],tx))?.amount||0);
        // Refund ceilings must use the amount actually charged for this item after
        // the order-level coupon and bundle promotion, not the pre-coupon item line total. Allocate the
        // promotions deterministically so item shares sum to the actual charged product total.
        const orderLines=await getRows('SELECT id,total_cents FROM order_items WHERE order_id=? ORDER BY id',[row.order_id],tx);
        const netLines=allocateCouponDiscountAcrossItems({
          items:orderLines.map(line=>({id:Number(line.id),totalCents:Number(line.total_cents)})),
          discountCents:Number(row.discount_cents||0)+Number(row.bundle_discount_cents||0)
        });
        const netItemTotalCents=netLines?.find(line=>line.id===Number(row.order_item_id))?.netCents;
        if(!Number.isSafeInteger(netItemTotalCents)||netItemTotalCents<0){await tx.rollback();return {changed:false,reason:'refund-item-total-unavailable'};}
        const maximumForThisRequest=maxRefundForRequestCents({itemTotalCents:netItemTotalCents,purchasedQuantity:Number(row.purchased_quantity||0),requestedQuantity:Number(row.quantity||0)});
        if(maximumForThisRequest<=0||amount>maximumForThisRequest){await tx.rollback();return {changed:false,reason:'refund-over-request-total'};}
        if(alreadyForItem+amount>netItemTotalCents){await tx.rollback();return {changed:false,reason:'refund-over-item-total'};}
        if(!Number.isSafeInteger(tenderRefunded)||tenderRefunded<0||amount>Number(row.total_cents)-already-tenderRefunded){await tx.rollback();return {changed:false,reason:'refund-over-order-total'};}
        changed=(await run("UPDATE order_returns SET status='refund_recorded',refund_amount_cents=?,refund_method=?,refund_reference=?,refund_recorded_at=datetime('now'),manager_note=?,processed_by_user_id=?,updated_at=datetime('now') WHERE id=? AND status=? AND refund_recorded_at IS NULL",[amount,method,reference,cleanedNote,managerUserId,returnId,row.status],tx)).changes===1;
      }
    } else if(action==='dispatch_exchange'&&row.request_type==='exchange'&&row.status==='item_received'){
      const exchangeReference=String(refundReference||'').trim().slice(0,100);
      if(exchangeReference.length<3){await tx.rollback();return {changed:false,reason:'exchange-reference-required'};}
      // This workflow sends a like-for-like replacement of the original line's
      // SKU/variant and return quantity. It must not consume another order's
      // reservation, and a duplicate dispatch must never deduct stock twice.
      if(!row.product_id){await tx.rollback();return {changed:false,reason:'product-missing'};}
      const quantity=Number(row.quantity);
      if(!Number.isSafeInteger(quantity)||quantity<1){await tx.rollback();return {changed:false,reason:'inventory-invalid'};}
      const inventory=row.variant_id
        ? await run("UPDATE product_variants SET stock=stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND stock-reserved_stock>=?",[quantity,row.variant_id,row.product_id,quantity],tx)
        : await run("UPDATE products SET stock=stock-?,updated_at=datetime('now') WHERE id=? AND stock-reserved_stock>=?",[quantity,row.product_id,quantity],tx);
      if(inventory.changes!==1){await tx.rollback();return {changed:false,reason:'insufficient-stock'};}
      changed=(await run("UPDATE order_returns SET status='exchange_sent',exchange_tracking_reference=?,exchange_shipped_at=datetime('now'),manager_note=?,processed_by_user_id=?,updated_at=datetime('now') WHERE id=? AND status='item_received'",[exchangeReference,cleanedNote,managerUserId,returnId],tx)).changes===1;
    } else if(action==='complete_exchange'&&row.request_type==='exchange'&&row.status==='exchange_sent'){
      changed=(await run("UPDATE order_returns SET status='completed',manager_note=?,processed_by_user_id=?,updated_at=datetime('now') WHERE id=? AND status='exchange_sent'",[cleanedNote,managerUserId,returnId],tx)).changes===1;
    }
    if(!changed){await tx.rollback();return {changed:false,reason:'invalid-transition'};}
    const nextStatus=action==='approve'?'approved':action==='reject'?'rejected':action==='receive'?'item_received':action==='record_refund'?'refund_recorded':action==='dispatch_exchange'?'exchange_sent':'completed';
    await run("UPDATE return_requests SET status=?,manager_note=?,updated_at=datetime('now') WHERE id=?",[nextStatus,cleanedNote,returnId],tx);
    await tx.commit();return {changed:true,returnId:Number(returnId),orderId:Number(row.order_id),status:nextStatus};
  }catch(error){try{await tx.rollback();}catch{}throw error;}
}

export async function listUserOrders(userId, limit=20, offset=0) { return getRows('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?',[userId, Math.min(Math.max(Number(limit)||20,1),50), Math.max(0,Math.floor(Number(offset)||0))]); }
export async function countUserOrders(userId) { return Number((await getRow('SELECT COUNT(*) AS c FROM orders WHERE user_id=?',[userId])).c||0); }

export function baseEffectivePrice(product, now = new Date()) {
  const nowMs = now.getTime();
  // Legacy SQLite timestamps without an offset are UTC, matching julianday().
  const timestamp=value=>Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(String(value))?String(value).replace(' ','T')+'Z':value);
  const inWindow = Number.isFinite(nowMs) && (!product.sale_start || timestamp(product.sale_start) <= nowMs) && (!product.sale_end || timestamp(product.sale_end) >= nowMs);
  if (inWindow && product.sale_price_cents != null && product.sale_price_cents < product.price_cents) return product.sale_price_cents;
  return product.price_cents;
}

export function effectivePrice(product, now = new Date()) {
  const base = baseEffectivePrice(product, now);
  return applyPercentDiscountCents(base, getProductDiscountPercent(product));
}

export async function createOrderAtomic({userId, email, guestAccessTokenHash=null, customerPhone='', items, shipping, shippingCents=0, taxCents=0, taxRateBps=null, taxIncluded=false, taxRuleSnapshot='', shippingRuleSnapshot='', pricingConfiguration=null, expectedPricing=null, customerNote='', currency='EUR', coupon=null, paymentProvider='cash_on_delivery', paymentCredentialFingerprint='', bankTransferDetails=null, clientToken, termsAcceptedAt, termsLocale='en', termsPolicyHash='', giftCardCode=''}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('EMPTY_CART');
  if (!/^[A-Za-z0-9_-]{24,100}$/.test(clientToken || '')) throw new Error('INVALID_IDEMPOTENCY');
  const paymentCredentialFingerprintValue=paymentProvider==='mollie'?String(paymentCredentialFingerprint||''):'';
  if(paymentProvider==='gift_card'&&!validGiftCardCode(giftCardCode))throw new Error('GIFT_CARD_INVALID');
  if(paymentProvider!=='gift_card'&&giftCardCode)throw new Error('GIFT_CARD_UNEXPECTED');
  if(paymentProvider==='mollie'&&!/^[a-f0-9]{64}$/.test(paymentCredentialFingerprintValue)) throw new Error('PAYMENT_CREDENTIAL_FINGERPRINT_REQUIRED');
  if(paymentProvider!=='mollie'&&paymentCredentialFingerprint) throw new Error('PAYMENT_CREDENTIAL_FINGERPRINT_UNEXPECTED');
  let bankTransferConfig=null;
  if(paymentProvider==='bank_transfer') {
    bankTransferConfig=normalizeBankTransferConfig({ ...(bankTransferDetails||{}), enabled:true });
    if(!bankTransferConfig.ready) throw new Error('BANK_TRANSFER_NOT_CONFIGURED');
  } else if(bankTransferDetails!=null) {
    throw new Error('BANK_TRANSFER_DETAILS_UNEXPECTED');
  }
  const grouped = new Map();
  for (const input of items) {
    const productId = Number(input?.productId);
    const variantId = input?.variantId == null || input?.variantId === '' ? null : Number(input.variantId);
    const quantity = Number(input?.quantity);
    if (!Number.isInteger(productId) || productId < 1 || (variantId!==null&&(!Number.isInteger(variantId)||variantId<1)) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error('INVALID_QUANTITY');
    const key=`${productId}:${variantId??0}`;
    const existing=grouped.get(key);
    grouped.set(key,{productId,variantId,quantity:(existing?.quantity||0)+quantity});
  }
  if ([...grouped.values()].some(q => q.quantity > 99)) throw new Error('INVALID_QUANTITY');
  const tx = await db.transaction('write');
  try {
    if (await getRow('SELECT id FROM orders WHERE client_token=?',[clientToken],tx)) throw new Error('IDEMPOTENCY_EXISTS');
    if (pricingConfiguration && typeof pricingConfiguration === 'object') {
      const expectedSettings = [
        ['currency', String(pricingConfiguration.currency || DEFAULT_STORE_CURRENCY)],
        ['shipping_fee_cents', String(pricingConfiguration.shippingFeeSetting ?? '0')],
        ['shipping_zone_rules', String(pricingConfiguration.shippingZoneRulesText ?? '')],
        ['tax_rules', String(pricingConfiguration.taxRulesText ?? '')],
        ['prices_include_tax', String(pricingConfiguration.pricesIncludeTaxSetting ?? '0')],
        ['feature_bundle_enabled', String(pricingConfiguration.bundleEnabledSetting ?? '0')],
        ['bundle_rules_json', String(pricingConfiguration.bundleRulesText ?? '[]')],
        ['delivery_countries', String(pricingConfiguration.deliveryCountriesText ?? '')]
      ];
      for (const [key, expectedValue] of expectedSettings) {
        const current = await getRow('SELECT value FROM settings WHERE key=?', [key], tx);
        const fallback = key === 'currency' ? DEFAULT_STORE_CURRENCY : (key === 'shipping_fee_cents' || key === 'prices_include_tax' || key === 'feature_bundle_enabled' ? '0' : key === 'bundle_rules_json' ? '[]' : '');
        if (String(current?.value ?? fallback) !== expectedValue) throw new Error('PRICING_RULES_CHANGED');
      }
    }
    if (!Number.isSafeInteger(taxCents) || taxCents < 0 || (taxRateBps !== null && (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000)) || typeof taxIncluded !== 'boolean') throw new Error('INVALID_TAX_AMOUNT');
    if (taxRateBps === null && taxCents !== 0) throw new Error('INVALID_TAX_AMOUNT');
    const normalized = [];
    for (const input of grouped.values()) {
      const product = await getRow('SELECT p.*, MAX(p.stock-p.reserved_stock,0) AS base_available_stock FROM products p WHERE id=?',[input.productId],tx);
      if (!product || !product.active) throw new Error('PRODUCT_UNAVAILABLE');
      const activeVariants=await getRow('SELECT COUNT(*) AS c FROM product_variants WHERE product_id=? AND active=1',[input.productId],tx);
      let variant=null;
      if(Number(activeVariants?.c||0)>0){
        if(!input.variantId) throw new Error('VARIANT_REQUIRED');
        variant=await getRow('SELECT *,MAX(stock-reserved_stock,0) AS available_stock FROM product_variants WHERE id=? AND product_id=? AND active=1',[input.variantId,input.productId],tx);
        if(!variant) throw new Error('VARIANT_UNAVAILABLE');
        if(Number(variant.available_stock)<input.quantity) throw new Error('INSUFFICIENT_STOCK');
      } else {
        if(input.variantId) throw new Error('VARIANT_UNAVAILABLE');
        if(Number(product.base_available_stock)<input.quantity) throw new Error('INSUFFICIENT_STOCK');
      }
      const baseUnit = baseEffectivePrice(product);
      const unit = effectivePrice(product);
      normalized.push({product,variant,variantId:variant?Number(variant.id):null,quantity:input.quantity,baseUnit,unit,total:safeMinorUnitsMultiply(unit,input.quantity)});
    }
    if (expectedPricing && typeof expectedPricing === 'object') {
      const expectedLines=Array.isArray(expectedPricing.items)?expectedPricing.items:[];
      const expectedByKey=new Map();
      for(const item of expectedLines){
        const productId=Number(item?.productId),variantId=item?.variantId==null||item.variantId===''?0:Number(item.variantId),quantity=Number(item?.quantity);
        const baseUnit=Number(item?.baseUnit),unit=Number(item?.unit),total=Number(item?.total);
        if(!Number.isSafeInteger(productId)||productId<1||!Number.isSafeInteger(variantId)||variantId<0||!Number.isInteger(quantity)||quantity<1||!Number.isSafeInteger(baseUnit)||baseUnit<0||!Number.isSafeInteger(unit)||unit<0||!Number.isSafeInteger(total)||total<0) throw new Error('PRICING_CHANGED');
        const key=`${productId}:${variantId}`;
        const prior=expectedByKey.get(key);
        if(prior&&(prior.baseUnit!==baseUnit||prior.unit!==unit)) throw new Error('PRICING_CHANGED');
        expectedByKey.set(key,{productId,variantId,quantity:(prior?.quantity||0)+quantity,baseUnit,unit,total:safeMinorUnitsAdd(prior?.total||0,total)});
      }
      const actualByKey=new Map(normalized.map(line=>[`${line.product.id}:${line.variantId||0}`,{productId:Number(line.product.id),variantId:Number(line.variantId||0),quantity:line.quantity,baseUnit:line.baseUnit,unit:line.unit,total:line.total}]));
      if(actualByKey.size!==expectedByKey.size) throw new Error('PRICING_CHANGED');
      for(const [key,expected] of expectedByKey){
        const actual=actualByKey.get(key);
        if(!actual||actual.productId!==expected.productId||actual.variantId!==expected.variantId||actual.quantity!==expected.quantity||actual.baseUnit!==expected.baseUnit||actual.unit!==expected.unit||actual.total!==expected.total) throw new Error('PRICING_CHANGED');
      }
    }
    const subtotalBeforeAutomaticDiscount = normalized.reduce((sum, line) => safeMinorUnitsAdd(sum, safeMinorUnitsMultiply(line.baseUnit,line.quantity)), 0);
    const automaticDiscount = Math.max(0, subtotalBeforeAutomaticDiscount - normalized.reduce((sum, line) => safeMinorUnitsAdd(sum, line.total), 0));
    const subtotal = subtotalBeforeAutomaticDiscount;
    const configuredBundle=await getRow("SELECT value FROM settings WHERE key='feature_bundle_enabled'",[],tx);
    const bundleRulesSetting=await getRow("SELECT value FROM settings WHERE key='bundle_rules_json'",[],tx);
    const bundleRules=configuredBundle?.value==='1'?normalizeBundleRules(bundleRulesSetting?.value||'[]'):[];
    const bundleDiscount=calculateBundleDiscount(normalized.map(line=>({productId:line.product.id,quantity:line.quantity,price:line.unit})),bundleRules).discountCents;
    let couponDiscount = 0;
    if (coupon) {
      const couponRow = await getRow(`SELECT * FROM coupons WHERE code=? AND active=1 AND (expires_at IS NULL OR expires_at>?)`,[coupon.trim().toUpperCase(), new Date().toISOString()],tx);
      if (!couponRow) throw new Error('INVALID_COUPON');
      const couponBase = subtotalBeforeAutomaticDiscount - automaticDiscount - bundleDiscount;
      if (couponBase < couponRow.min_subtotal_cents) throw new Error('COUPON_MINIMUM');
      couponDiscount = couponRow.type === 'percent' ? safePercentOfMinorUnits(couponBase, couponRow.value) : couponRow.value;
      couponDiscount = Math.min(couponDiscount, couponBase);
    }
    if (!Number.isSafeInteger(shippingCents) || shippingCents < 0) throw new Error('INVALID_SHIPPING_AMOUNT');
    const safeShippingCents = shippingCents;
    const itemsAfterDiscount = subtotal - automaticDiscount - bundleDiscount - couponDiscount;
    const totalBeforeTax = safeMinorUnitsAdd(itemsAfterDiscount, safeShippingCents);
    const total = taxIncluded ? totalBeforeTax : safeMinorUnitsAdd(totalBeforeTax, taxCents);
    const discount = couponDiscount;
    if (expectedPricing && typeof expectedPricing === 'object') {
      const checks=[['subtotalBeforeAutomaticDiscount',subtotalBeforeAutomaticDiscount],['automaticDiscount',automaticDiscount],['bundleDiscount',bundleDiscount],['discount',discount],['shippingCents',safeShippingCents],['taxCents',taxCents],['total',total]];
      for(const [key,actual] of checks){
        if(expectedPricing[key]!==undefined&&(!Number.isSafeInteger(Number(expectedPricing[key]))||Number(expectedPricing[key])!==actual)) throw new Error('PRICING_CHANGED');
      }
      if(expectedPricing.taxRateBps!==undefined&&expectedPricing.taxRateBps!==taxRateBps) throw new Error('PRICING_CHANGED');
      if(expectedPricing.taxIncluded!==undefined&&Boolean(expectedPricing.taxIncluded)!==taxIncluded) throw new Error('PRICING_CHANGED');
    }
    if (total <= 0) throw new Error('ZERO_TOTAL');
    let payingGiftCard=null;
    if(paymentProvider==='gift_card') {
      const enabled=await getRow("SELECT value FROM settings WHERE key='feature_gift_cards_enabled'",[],tx);
      if(enabled?.value!=='1')throw new Error('GIFT_CARD_DISABLED');
      payingGiftCard=await getRow('SELECT * FROM gift_cards WHERE code_hash=?',[giftCardHash(giftCardCode),],tx);
      if(!giftCardCanCover(payingGiftCard,{amount:total,currency}))throw new Error('GIFT_CARD_BALANCE');
    }
    const note=String(customerNote||'').slice(0,500);
    const phone=String(customerPhone||'').trim().slice(0,32);
    if(!isValidPhone(phone)) throw new Error('INVALID_PHONE');
    const info = await run(`INSERT INTO orders(user_id,email,customer_phone,status,payment_provider,payment_credential_fingerprint,client_token,guest_access_token_hash,subtotal_cents,automatic_discount_cents,bundle_discount_cents,gift_card_id,discount_cents,total_cents,currency,shipping_name,shipping_address,shipping_city,shipping_postal_code,shipping_country,shipping_cents,tax_cents,tax_rate_bps,tax_included,tax_rule_snapshot,shipping_rule_snapshot,customer_note,terms_accepted_at,terms_locale,terms_policy_hash,reservation_expires_at,payment_url,payment_instructions_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[userId,email,phone,'pending',paymentProvider,paymentCredentialFingerprintValue,clientToken,guestAccessTokenHash,subtotal,automaticDiscount,bundleDiscount,payingGiftCard?.id||null,discount,total,currency,shipping.name,shipping.address,shipping.city,shipping.postalCode,shipping.country,safeShippingCents,taxCents,taxRateBps,taxIncluded?1:0,String(taxRuleSnapshot||'').slice(0,300),String(shippingRuleSnapshot||'').slice(0,300),note,termsAcceptedAt,termsLocale,termsPolicyHash||null,null,null,''],tx);
    const orderId = Number(info.lastInsertRowid);
    const accountingSnapshot=allocateOrderAccounting({discount_cents:discount,bundle_discount_cents:bundleDiscount,tax_cents:taxCents,tax_included:taxIncluded?1:0,tax_rate_bps:taxRateBps,tax_rule_snapshot:taxRuleSnapshot,shipping_cents:safeShippingCents},
      normalized.map((line,index)=>({id:index+1,product_id:line.product.id,quantity:line.quantity,total_cents:line.total,unit_cost_cents:line.product.cost_price_cents})));
    await run('UPDATE orders SET product_tax_cents=? WHERE id=?',[accountingSnapshot.productTaxCents,orderId],tx);
    if(paymentProvider==='bank_transfer') {
      const snapshot=buildBankTransferSnapshot(bankTransferConfig,orderId);
      const snapshotWrite=await run("UPDATE orders SET payment_instructions_snapshot=? WHERE id=? AND payment_provider='bank_transfer' AND status='pending'",[JSON.stringify(snapshot),orderId],tx);
      if(snapshotWrite.changes!==1) throw new Error('BANK_TRANSFER_SNAPSHOT_SAVE_FAILED');
    }
    for (const line of normalized) {
      const reserved = line.variant
        ? await run("UPDATE product_variants SET reserved_stock=reserved_stock+?,updated_at=datetime('now') WHERE id=? AND product_id=? AND active=1 AND stock-reserved_stock>=?",[line.quantity,line.variant.id,line.product.id,line.quantity],tx)
        : await run("UPDATE products SET reserved_stock=reserved_stock+?,updated_at=datetime('now') WHERE id=? AND active=1 AND stock-reserved_stock>=? AND NOT EXISTS(SELECT 1 FROM product_variants WHERE product_id=? AND active=1)",[line.quantity,line.product.id,line.quantity,line.product.id],tx);
      if(reserved.changes!==1) throw new Error('INSUFFICIENT_STOCK');
      await run('INSERT INTO order_items(order_id,product_id,product_name,sku,variant_id,variant_name,variant_value,variant_name_2,variant_value_2,quantity,unit_price_cents,unit_cost_cents,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[
        orderId,line.product.id,line.product.name,line.variant?.sku||line.product.sku,line.variant?.id||null,line.variant?.option_name||'',line.variant?.option_value||'',line.variant?.option_name_2||'',line.variant?.option_value_2||'',line.quantity,line.unit,
        (line.product.cost_price_cents===null||line.product.cost_price_cents===undefined)?null:Number(line.product.cost_price_cents),line.total
      ],tx);
    }
    if(payingGiftCard) {
      const debited=await run('UPDATE gift_cards SET balance_cents=balance_cents-? WHERE id=? AND active=1 AND currency=? AND balance_cents>=?',
        [total,payingGiftCard.id,currency,total],tx);
      if(debited.changes!==1)throw new Error('GIFT_CARD_BALANCE');
      await run("INSERT INTO gift_card_ledger(gift_card_id,order_id,event,amount_cents,note) VALUES(?,?,'redeem',?,'Full gift-card tender for order')",[payingGiftCard.id,orderId,total],tx);
      const paid=await run("UPDATE orders SET status='paid',payment_reference=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider='gift_card'",[`gift_card:${orderId}`,orderId],tx);
      if(paid.changes!==1)throw new Error('GIFT_CARD_ORDER_STATE');
      await annotateOrderStatusTransition(orderId,'pending','paid','Gift-card balance debited inside order transaction',tx);
    }
    await tx.commit();
    return {orderId,subtotal,automaticDiscount,bundleDiscount,discount,shipping:safeShippingCents,taxCents,taxRateBps,taxIncluded,total,items:normalized};
  } catch (error) {
    // The local SQLite transaction queue has already attempted rollback/close
    // after exhausting COMMIT retries. Avoid issuing a second rollback on that
    // finalized transaction; injected/BEGIN/statement failures still roll back here.
    if (error?.localSqliteTransactionCleanupAttempted !== true) {
      try { await tx.rollback(); } catch {}
    }
    throw error;
  }
}
async function cancelOpenOrder(id, { reason='', actor='customer', actorUserId=null, allowedStatuses=['pending'], provider=null, paymentReference=null } = {}) {
  const statuses=allowedStatuses.filter(value=>['pending','processing'].includes(value));
  if(!statuses.length) return false;
  const placeholders=statuses.map(()=>'?').join(',');
  const tx = await db.transaction('write');
  try {
    const order = await getRow(`SELECT * FROM orders WHERE id=? AND status IN (${placeholders})`,[id,...statuses],tx);
    if (!order) { await tx.rollback(); return false; }
    if (!provider && actor==='customer' && !canCancelOpenOrder(order)) { await tx.rollback(); return false; }
    // A Mollie payment-creation request may still be in flight before the payment
    // reference/checkout URL is persisted. Never let a customer or Manager cancel
    // a pending Mollie order from the browser: the provider may have created a
    // payment despite a timeout, and releasing stock here could sell the same stock
    // twice. Only a provider-confirmed terminal status may close it automatically.
    if (!provider && order.status==='pending' && order.payment_provider==='mollie') { await tx.rollback(); return false; }
    // A customer must not directly cancel a pending bank-transfer order: the
    // transfer may already be in flight but not yet visible on the statement.
    // Use a cancellation request so the Manager can reconcile the bank first.
    if (!provider && actor==='customer' && order.status==='pending' && order.payment_provider==='bank_transfer') { await tx.rollback(); return false; }
    // Keep other non-COD integrations fail-closed whenever provider details exist.
    if (!provider && order.payment_provider!=='cash_on_delivery' && (String(order.payment_reference||'').trim()||String(order.payment_url||'').trim())) { await tx.rollback(); return false; }
    if (provider && (order.payment_provider!==provider || order.payment_reference!==paymentReference)) { await tx.rollback(); return false; }
    // Claim the transition before releasing stock. If a manager/expiry worker won
    // the race, this conditional update fails and no reservation is released twice.
    const changed=await run(`UPDATE orders SET status='cancelled',last_status_actor_type=?,last_status_actor_user_id=?,cancellation_reason=?,cancellation_actor=?,cancelled_by_user_id=?,cancelled_at=datetime('now'),reservation_expires_at=NULL,cancellation_request_decision=CASE WHEN cancellation_requested_at IS NOT NULL THEN 'approved' ELSE cancellation_request_decision END,cancellation_request_decided_at=CASE WHEN cancellation_requested_at IS NOT NULL THEN datetime('now') ELSE cancellation_request_decided_at END,cancellation_request_decided_by_user_id=CASE WHEN cancellation_requested_at IS NOT NULL THEN ? ELSE cancellation_request_decided_by_user_id END,updated_at=datetime('now') WHERE id=? AND status IN (${placeholders})`,[['customer','manager','system'].includes(actor)?actor:'system',Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,String(reason||'').trim().slice(0,500),actor,Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,id,...statuses],tx);
    if(changed.changes!==1) { await tx.rollback(); return false; }
    const items = await getRows('SELECT product_id,variant_id,quantity FROM order_items WHERE order_id=?',[id],tx);
    for (const item of items) {
      if(item.product_id==null) continue;
      const released = item.variant_id
        ? await run("UPDATE product_variants SET reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND reserved_stock>=?",[item.quantity,item.variant_id,item.product_id,item.quantity],tx)
        : await run("UPDATE products SET reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND reserved_stock>=?",[item.quantity,item.product_id,item.quantity],tx);
      if(released.changes!==1) throw new Error('STOCK_INTEGRITY');
    }
    await tx.commit();
    return true;
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}

// Unknown callers must fail safe to system attribution. Customer-initiated
// cancellation routes explicitly pass actor='customer' and the authenticated ID.
export async function cancelPendingOrder(id, reason='', actor='system', actorUserId=null) {
  return cancelOpenOrder(id,{reason,actor,actorUserId,allowedStatuses:['pending']});
}

export async function cancelOrderBeforeShipping(id, reason='', actorUserId=null) {
  return cancelOpenOrder(id,{reason,actor:'manager',actorUserId,allowedStatuses:['pending','processing']});
}

export async function requestOrderCancellation(id, reason='', actorUserId=null) {
  const cleaned=String(reason||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,500);
  if(!cleaned) return false;
  // A processing COD order has not been paid, so a Manager can safely approve
  // cancellation and release its reservation. A processing Mollie/bank-transfer
  // order is already paid; this project has no pre-shipment provider refund flow.
  // Do not accept a cancellation request that ShopEasy cannot safely complete.
  // Pending bank transfers remain request-only until a Manager checks the bank.
  const tx=await db.transaction('write');
  try {
    const order=await getRow('SELECT * FROM orders WHERE id=?',[id],tx);
    if(!canRequestOrderCancellation(order)){await tx.rollback();return false;}
    const result=await run("UPDATE orders SET cancellation_requested_at=datetime('now'),cancellation_request_reason=?,cancellation_requested_by_user_id=?,cancellation_request_decision='pending',cancellation_request_decided_at=NULL,cancellation_request_decided_by_user_id=NULL WHERE id=? AND ((status='processing' AND payment_provider='cash_on_delivery') OR (status='pending' AND payment_provider='bank_transfer')) AND (cancellation_requested_at IS NULL OR cancellation_request_decision='rejected')",[cleaned,actorUserId,id],tx);
    await tx.commit();
    return result.changes===1;
  } catch(error) { try { await tx.rollback(); } catch {} throw error; }
}

export async function decideOrderCancellationRequest(id, decision, managerUserId) {
  if(!['rejected'].includes(decision)) return false;
  const result=await run("UPDATE orders SET cancellation_request_decision='rejected',cancellation_request_decided_at=datetime('now'),cancellation_request_decided_by_user_id=?,updated_at=datetime('now') WHERE id=? AND (status='processing' OR (status='pending' AND payment_provider='bank_transfer')) AND cancellation_requested_at IS NOT NULL AND cancellation_request_decision='pending'",[managerUserId,id]);
  return result.changes===1;
}

async function acceptPendingCashOnDeliveryOrder(id, actorUserId=null) {
  // A COD order has no time limit, but it must still hold the inventory it asks
  // to fulfil. Re-check every base/variant reservation in the same write
  // transaction as the status change so damaged/legacy rows cannot be accepted
  // after their inventory reservation has gone missing.
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT id,status,payment_provider FROM orders WHERE id=?",[id],tx);
    if(!order||order.status!=='pending'||order.payment_provider!=='cash_on_delivery') {
      await tx.rollback();
      return false;
    }
    const items=await getRows(`SELECT oi.product_id,oi.variant_id,SUM(oi.quantity) AS quantity,
      CASE WHEN oi.variant_id IS NULL THEN p.reserved_stock ELSE pv.reserved_stock END AS reserved_stock
      FROM order_items oi
      LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_variants pv ON pv.id=oi.variant_id AND pv.product_id=oi.product_id
      WHERE oi.order_id=?
      GROUP BY oi.product_id,oi.variant_id,p.reserved_stock,pv.reserved_stock`,[id],tx);
    if(!items.length||items.some(item=>!item.product_id||!Number.isSafeInteger(Number(item.quantity))||Number(item.quantity)<1||!Number.isSafeInteger(Number(item.reserved_stock))||Number(item.reserved_stock)<Number(item.quantity))) {
      await tx.rollback();
      return false;
    }
    const changed=(await run("UPDATE orders SET status='processing',last_status_actor_type='manager',last_status_actor_user_id=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='pending' AND payment_provider='cash_on_delivery'",[Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,id],tx)).changes;
    if(changed!==1) {
      await tx.rollback();
      return false;
    }
    await tx.commit();
    return true;
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}

async function completeCashOnDeliveryOrder(id, actorUserId=null) {
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT * FROM orders WHERE id=? AND status='shipped' AND payment_provider='cash_on_delivery'",[id],tx);
    if(!order){await tx.rollback();return false;}
    const items=await getRows('SELECT * FROM order_items WHERE order_id=?',[id],tx);
    for(const item of items){
      const changed = item.variant_id
        ? await run("UPDATE product_variants SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.variant_id,item.product_id,item.quantity,item.quantity],tx)
        : await run("UPDATE products SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.product_id,item.quantity,item.quantity],tx);
      if(changed.changes!==1) throw new Error('STOCK_INTEGRITY');
    }
    const paymentReference=`cash_received:${id}`;
    if((await run("UPDATE orders SET status='completed',last_status_actor_type='manager',last_status_actor_user_id=?,payment_reference=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='shipped'",[Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,paymentReference,id],tx)).changes!==1) throw new Error('ORDER_STATUS_CHANGED');
    await tx.commit();
    return true;
  } catch(error) { await tx.rollback(); throw error; }
}

// A manager may explicitly verify an older pending order as COD, but only when
// it has no online-payment URL/reference and every item still has its stock reserved.
// This avoids silently converting an unknown payment into cash-on-delivery.
export async function confirmLegacyPendingOrderAsCod(id, expectedProvider, managerUserId=null) {
  const tx=await db.transaction('write');
  try {
    const order=await getRow('SELECT id,status,payment_provider,payment_reference,payment_url FROM orders WHERE id=?',[id],tx);
    if(!order || order.status!=='pending' || order.payment_provider==='cash_on_delivery' || String(order.payment_provider||'')!==String(expectedProvider||'')) throw new Error('LEGACY_ORDER_NOT_CONFIRMABLE');
    if(String(order.payment_reference||'').trim() || String(order.payment_url||'').trim()) throw new Error('LEGACY_ORDER_HAS_PAYMENT_DETAILS');
    const items=await getRows(`SELECT oi.product_id,oi.variant_id,SUM(oi.quantity) AS quantity,
      CASE WHEN oi.variant_id IS NULL THEN p.reserved_stock ELSE pv.reserved_stock END AS reserved_stock
      FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_variants pv ON pv.id=oi.variant_id AND pv.product_id=oi.product_id
      WHERE oi.order_id=?
      GROUP BY oi.product_id,oi.variant_id,p.reserved_stock,pv.reserved_stock`,[id],tx);
    if(!items.length || items.some(item=>!item.product_id || !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity)<1 || !Number.isSafeInteger(Number(item.reserved_stock)) || Number(item.reserved_stock)<Number(item.quantity))) throw new Error('LEGACY_ORDER_RESERVATION_UNSAFE');
    const changed=await run(`UPDATE orders SET payment_provider='cash_on_delivery',status='processing',last_status_actor_type='manager',last_status_actor_user_id=?,reservation_expires_at=NULL,updated_at=datetime('now')
      WHERE id=? AND status='pending' AND payment_provider=? AND (payment_reference IS NULL OR payment_reference='') AND (payment_url IS NULL OR payment_url='')`,[Number.isInteger(Number(managerUserId))&&Number(managerUserId)>0?Number(managerUserId):null,id,order.payment_provider],tx);
    if(changed.changes!==1) throw new Error('LEGACY_ORDER_NOT_CONFIRMABLE');
    await tx.commit();
    return {changed:true,previousProvider:order.payment_provider};
  } catch(error) {
    try{await tx.rollback();}catch{}
    if(['LEGACY_ORDER_NOT_CONFIRMABLE','LEGACY_ORDER_HAS_PAYMENT_DETAILS','LEGACY_ORDER_RESERVATION_UNSAFE'].includes(error?.message)) return {changed:false,reason:error.message};
    throw error;
  }
}


async function completePaidOnlineOrder(id, actorUserId=null) {
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT * FROM orders WHERE id=? AND status='shipped' AND payment_provider='mollie' AND substr(payment_reference,1,3)='tr_'",[id],tx);
    if(!order){await tx.rollback();return false;}
    const items=await getRows('SELECT * FROM order_items WHERE order_id=?',[id],tx);
    if(!items.length) throw new Error('STOCK_INTEGRITY');
    for(const item of items){
      const changed=item.variant_id
        ? await run("UPDATE product_variants SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.variant_id,item.product_id,item.quantity,item.quantity],tx)
        : await run("UPDATE products SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.product_id,item.quantity,item.quantity],tx);
      if(changed.changes!==1) throw new Error('STOCK_INTEGRITY');
    }
    const changed=await run("UPDATE orders SET status='completed',last_status_actor_type='manager',last_status_actor_user_id=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='shipped' AND payment_provider='mollie' AND payment_reference=?",[Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,id,order.payment_reference],tx);
    if(changed.changes!==1) throw new Error('ORDER_STATUS_CHANGED');
    await tx.commit();
    return true;
  } catch(error) { try{await tx.rollback();}catch{} throw error; }
}

async function completePaidBankTransferOrder(id, actorUserId=null) {
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT * FROM orders WHERE id=? AND status='shipped' AND payment_provider='bank_transfer' AND substr(payment_reference,1,14)='bank_transfer:'",[id],tx);
    if(!order){await tx.rollback();return false;}
    const items=await getRows('SELECT * FROM order_items WHERE order_id=?',[id],tx);
    if(!items.length) throw new Error('STOCK_INTEGRITY');
    for(const item of items){
      const changed=item.variant_id
        ? await run("UPDATE product_variants SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.variant_id,item.product_id,item.quantity,item.quantity],tx)
        : await run("UPDATE products SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.product_id,item.quantity,item.quantity],tx);
      if(changed.changes!==1) throw new Error('STOCK_INTEGRITY');
    }
    const changed=await run("UPDATE orders SET status='completed',last_status_actor_type='manager',last_status_actor_user_id=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='shipped' AND payment_provider='bank_transfer' AND payment_reference=?",[Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,id,order.payment_reference],tx);
    if(changed.changes!==1) throw new Error('ORDER_STATUS_CHANGED');
    await tx.commit();
    return true;
  } catch(error) { try{await tx.rollback();}catch{} throw error; }
}

async function completePaidGiftCardOrder(id, actorUserId=null) {
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT * FROM orders WHERE id=? AND status='shipped' AND payment_provider='gift_card'",[id],tx);
    if(!order){await tx.rollback();return false;}
    if(order.payment_reference!==`gift_card:${order.id}`){await tx.rollback();return false;}
    const redeemed=await getRow("SELECT gift_card_id,amount_cents FROM gift_card_ledger WHERE order_id=? AND event='redeem'",[id],tx);
    if(!redeemed||Number(redeemed.gift_card_id)!==Number(order.gift_card_id)||!Number.isSafeInteger(Number(redeemed.amount_cents))||Number(redeemed.amount_cents)<=0||Number(redeemed.amount_cents)!==Number(order.total_cents)){await tx.rollback();return false;}
    const items=await getRows('SELECT * FROM order_items WHERE order_id=?',[id],tx);
    if(!items.length) throw new Error('STOCK_INTEGRITY');
    for(const item of items){
      const changed=item.variant_id
        ? await run("UPDATE product_variants SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND product_id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.variant_id,item.product_id,item.quantity,item.quantity],tx)
        : await run("UPDATE products SET stock=stock-?,reserved_stock=reserved_stock-?,updated_at=datetime('now') WHERE id=? AND stock>=? AND reserved_stock>=?",[item.quantity,item.quantity,item.product_id,item.quantity,item.quantity],tx);
      if(changed.changes!==1) throw new Error('STOCK_INTEGRITY');
    }
    const changed=await run("UPDATE orders SET status='completed',last_status_actor_type='manager',last_status_actor_user_id=?,reservation_expires_at=NULL,updated_at=datetime('now') WHERE id=? AND status='shipped' AND payment_provider='gift_card' AND payment_reference=?",[Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,id,order.payment_reference],tx);
    if(changed.changes!==1) throw new Error('ORDER_STATUS_CHANGED');
    await tx.commit();
    return true;
  } catch(error) { try{await tx.rollback();}catch{} throw error; }
}


export async function setOrderStatus(id,status,actorUserId=null) {
  const order=await getRow('SELECT status,payment_provider,cancellation_request_reason FROM orders WHERE id=?',[id]);
  const current=order?.status;
  const allowed = {
    paid: new Set(['processing']),
    processing: new Set(['shipped','cancelled']),
    shipped: new Set(['completed']),
    completed: new Set(),
    cancelled: new Set(),
    pending: new Set(['cancelled'])
  };
  if (!current) return false;
  if(current==='pending'&&status==='processing') {
    if(order.payment_provider!=='cash_on_delivery') return false;
    return acceptPendingCashOnDeliveryOrder(id,actorUserId);
  }
  if (!allowed[current]?.has(status)) return false;
  if (status === 'cancelled' && ['pending','processing'].includes(current)) {
    const requestReason=String(order.cancellation_request_reason||'').trim();
    const reason=requestReason?`Manager accepted customer cancellation request: ${requestReason}`:'Cancelled by manager';
    return cancelOrderBeforeShipping(id,reason,actorUserId);
  }
  if(current==='shipped'&&status==='completed'&&order.payment_provider==='cash_on_delivery') return completeCashOnDeliveryOrder(id,actorUserId);
  if(current==='shipped'&&status==='completed'&&order.payment_provider==='mollie') return completePaidOnlineOrder(id,actorUserId);
  if(current==='shipped'&&status==='completed'&&order.payment_provider==='bank_transfer') return completePaidBankTransferOrder(id,actorUserId);
  if(current==='shipped'&&status==='completed'&&order.payment_provider==='gift_card') return completePaidGiftCardOrder(id,actorUserId);
  if(current==='shipped'&&status==='completed') return false;
  const changed = (await run("UPDATE orders SET status=?,last_status_actor_type='manager',last_status_actor_user_id=?,updated_at=datetime('now') WHERE id=? AND status=?",[status,Number.isInteger(Number(actorUserId))&&Number(actorUserId)>0?Number(actorUserId):null,id,current]));
  return changed.changes === 1;
}

export async function adminCreateOrUpdateProduct(data) {
  const discountPercent = normalizeProductDiscountPercent(data.automaticDiscountPercent);
  const costPriceCents = requirePurchaseCostCents(data.costPriceCents);
  const hasVariants=Array.isArray(data.variants)&&data.variants.length>0;
  const stock=hasVariants?0:Number(data.stock);
  if(!Number.isInteger(stock)||stock<0) throw new Error('STOCK');
  const values = [data.name,data.slug,data.shortDescription,data.description,data.imageUrl,data.priceCents,costPriceCents,data.salePriceCents ?? null,data.saleStart || null,data.saleEnd || null,discountPercent,data.sku,stock,Math.max(0,Number(data.reorderLevel??5)||0),data.categoryId || null,data.tags,data.featured?1:0,data.active?1:0];
  if (await getRow('SELECT id FROM product_variants WHERE LOWER(sku)=LOWER(?)',[data.sku])) throw new Error('SKU_TAKEN');
  const galleryInput=Array.isArray(data.galleryImages)?data.galleryImages:[data.imageUrl];
  const galleryImages=normalizeProductGallery(data.imageUrl,galleryInput);
  const tx=await db.transaction('write');
  try {
    let savedId=Number(data.id)||0;
    let current=null;
    if(savedId){
      current=await getRow('SELECT id,reserved_stock FROM products WHERE id=?',[savedId],tx);
      if(!current) throw new Error('NOT_FOUND');
      const activeVariantRows=await getRows('SELECT id,option_value,option_value_2,stock,reserved_stock,active FROM product_variants WHERE product_id=?',[savedId],tx);
      if(Number(current.reserved_stock||0)>0 && hasVariants) throw new Error('RESERVED_STOCK_MODE_CHANGE');
      if(!hasVariants && activeVariantRows.some(v=>v.active && Number(v.reserved_stock||0)>0)) throw new Error('RESERVED_VARIANT_STOCK');
      if(stock<Number(current.reserved_stock||0)) throw new Error('RESERVED_STOCK');
      const changed=(await run(`UPDATE products SET name=?,slug=?,short_description=?,description=?,image_url=?,price_cents=?,cost_price_cents=?,sale_price_cents=?,sale_start=?,sale_end=?,automatic_discount_percent=?,sku=?,stock=?,reorder_level=?,category_id=?,tags=?,featured=?,active=?,updated_at=datetime('now') WHERE id=? AND reserved_stock<=?`,[...values,savedId,stock],tx)).changes;
      if(changed!==1) throw new Error('RESERVED_STOCK');
    } else {
      savedId=Number((await run(`INSERT INTO products(name,slug,short_description,description,image_url,price_cents,cost_price_cents,sale_price_cents,sale_start,sale_end,automatic_discount_percent,sku,stock,reorder_level,category_id,tags,featured,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,values,tx)).lastInsertRowid);
    }

    const previousVariants=await getRows('SELECT * FROM product_variants WHERE product_id=?', [savedId], tx);
    if(hasVariants){
      const optionName=String(data.variantOptionName||'Size').trim().slice(0,40)||'Size';
      const optionName2=String(data.variantOptionName2||'').trim().slice(0,40);
      const submittedKeys=new Set();
      const claimedSkus=new Set();
      for(let index=0;index<data.variants.length;index++){
        const submitted=data.variants[index]||{};
        const value=String(submitted.value||'').normalize('NFKC').trim();
        const value2=String(submitted.value2||'').normalize('NFKC').trim();
        const variantStock=Number(submitted.stock);
        const key=value.toLocaleLowerCase('en')+'\u0000'+value2.toLocaleLowerCase('en');
        if(!value||value.length>80||value2.length>80||submittedKeys.has(key)||!Number.isInteger(variantStock)||variantStock<0||variantStock>100000000) throw new Error('VARIANT_VALIDATION');
        if(optionName2 && !value2) throw new Error('VARIANT_VALIDATION');
        if(value2 && !optionName2) throw new Error('VARIANT_VALIDATION');
        submittedKeys.add(key);
        const existing=previousVariants.find(v=>String(v.option_value).normalize('NFKC').trim().toLocaleLowerCase('en')===value.toLocaleLowerCase('en') && String(v.option_value_2||'').normalize('NFKC').trim().toLocaleLowerCase('en')===value2.toLocaleLowerCase('en'));
        if(existing && Number(existing.reserved_stock||0)>variantStock) throw new Error('RESERVED_VARIANT_STOCK');
        // Keep the existing SKU stable unless the manager deliberately enters a replacement.
        let variantSku=String(submitted.sku||'').trim().toUpperCase();
        if(!variantSku) variantSku=existing?String(existing.sku):`VAR-${savedId}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
        if(variantSku.length>60||!/[A-Z0-9]/.test(variantSku)||/[^A-Z0-9._-]/.test(variantSku)||claimedSkus.has(variantSku.toLocaleLowerCase('en'))) throw new Error('VARIANT_SKU_CONFLICT');
        claimedSkus.add(variantSku.toLocaleLowerCase('en'));
        if(await getRow('SELECT id FROM products WHERE LOWER(sku)=LOWER(?)',[variantSku],tx)) throw new Error('VARIANT_SKU_CONFLICT');
        const duplicateSku=await getRow('SELECT id FROM product_variants WHERE LOWER(sku)=LOWER(?) AND id<>?',[variantSku,existing?.id||0],tx);
        if(duplicateSku) throw new Error('VARIANT_SKU_CONFLICT');
        const variantImage=String(submitted.imageUrl||'').trim().slice(0,500);
        const variantImageAllowed=galleryImages.includes(variantImage) || variantImage==='' || /^https:\/\//i.test(variantImage);
        if(!variantImageAllowed || /[\r\n]/.test(variantImage) || variantImage.startsWith('//')) throw new Error('VARIANT_IMAGE_URL');
        if(existing){
          const changed=(await run(`UPDATE product_variants SET option_name=?,option_value=?,option_name_2=?,option_value_2=?,sku=?,stock=?,image_url=?,sort_order=?,active=1,updated_at=datetime('now') WHERE id=? AND product_id=? AND reserved_stock<=?`,[optionName,value,optionName2,value2,variantSku,variantStock,variantImage,index,existing.id,savedId,variantStock],tx)).changes;
          if(changed!==1) throw new Error('RESERVED_VARIANT_STOCK');
        } else {
          await run(`INSERT INTO product_variants(product_id,option_name,option_value,option_name_2,option_value_2,sku,stock,reserved_stock,image_url,sort_order,active) VALUES(?,?,?,?,?,?,?,0,?,?,1)`,[savedId,optionName,value,optionName2,value2,variantSku,variantStock,variantImage,index],tx);
        }
      }
      for(const old of previousVariants){
        const key=String(old.option_value).normalize('NFKC').trim().toLocaleLowerCase('en')+'\u0000'+String(old.option_value_2||'').normalize('NFKC').trim().toLocaleLowerCase('en');
        if(old.active && !submittedKeys.has(key)){
          if(Number(old.reserved_stock||0)>0) throw new Error('RESERVED_VARIANT_STOCK');
          await run("UPDATE product_variants SET active=0,updated_at=datetime('now') WHERE id=? AND product_id=? AND reserved_stock=0",[old.id,savedId],tx);
        }
      }
    } else {
      // Variants referenced by historic order items are retained as inactive rows; never hard-delete order history.
      for(const old of previousVariants){
        if(old.active && Number(old.reserved_stock||0)>0) throw new Error('RESERVED_VARIANT_STOCK');
        if(old.active) await run("UPDATE product_variants SET active=0,updated_at=datetime('now') WHERE id=? AND product_id=? AND reserved_stock=0",[old.id,savedId],tx);
      }
    }

    await run('DELETE FROM product_images WHERE product_id=?',[savedId],tx);
    for(let index=0;index<galleryImages.length;index++){
      const imageUrl=galleryImages[index];
      await run('INSERT INTO product_images(product_id,image_url,alt_text,sort_order,is_primary) VALUES(?,?,?,?,?)',[savedId,imageUrl,String(data.name||'Product').slice(0,120),index,index===0?1:0],tx);
    }
    await tx.commit();
    return Number(savedId);
  } catch(error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
// Atomic, non-destructive archive. Keep the row and image so historic order items
// remain traceable; refuse while checkout has stock reserved for this product.
export async function restockProduct(id, quantity) {
  const amount = Number(quantity);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) throw new Error('INVALID_RESTOCK');
  const result = await run(`UPDATE products
    SET stock=stock+?, updated_at=datetime('now')
    WHERE id=? AND stock<=100000000-?
      AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=products.id AND pv.active=1)`, [amount, id, amount]);
  if (result.changes !== 1) throw new Error('RESTOCK_FAILED');
  return getProductById(Number(id));
}

export async function restockProductVariant(variantId, quantity) {
  const amount = Number(quantity);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) throw new Error('INVALID_RESTOCK');
  const result = await run(`UPDATE product_variants
    SET stock=stock+?, updated_at=datetime('now')
    WHERE id=? AND stock<=100000000-? AND active=1`, [amount, variantId, amount]);
  if (result.changes !== 1) throw new Error('RESTOCK_FAILED');
  return getProductVariantById(Number(variantId));
}

export async function archiveProduct(id) {
  const result = await run(`UPDATE products SET active=0,featured=0,updated_at=datetime('now')
    WHERE id=? AND reserved_stock=0
      AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=products.id AND pv.reserved_stock>0)`,[id]);
  return result.changes === 1;
}

// Restore an archived product without implicitly featuring it again. The item remains
// hidden unless the manager explicitly restores it, and reserved inventory must be clear.
export async function restoreProduct(id) {
  const result = await run(`UPDATE products SET active=1,updated_at=datetime('now')
    WHERE id=? AND active=0 AND reserved_stock=0
      AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=products.id AND pv.reserved_stock>0)`,[id]);
  return result.changes === 1;
}

// Permanent deletion is available for active or archived products only when no
// order-item history or stock reservation exists. This lets managers remove a newly
// added mistake in one explicit step while preserving every historical order link.
// All checks and DELETE run in one write transaction to close races with checkout.
export async function permanentlyDeleteProduct(id) {
  const tx = await db.transaction('write');
  try {
    const product = await getRow('SELECT * FROM products WHERE id=?',[id],tx);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');
    if (Number(product.reserved_stock||0) > 0) throw new Error('PRODUCT_HAS_RESERVED_STOCK');
    const reserved = await getRow('SELECT COUNT(*) AS c FROM product_variants WHERE product_id=? AND reserved_stock>0',[id],tx);
    if (Number(reserved?.c||0) > 0) throw new Error('PRODUCT_HAS_RESERVED_STOCK');
    const history = await getRow('SELECT COUNT(*) AS c FROM order_items WHERE product_id=?',[id],tx);
    if (Number(history?.c||0) > 0) throw new Error('PRODUCT_HAS_ORDER_HISTORY');
    // Sessions persist carts and wishlists as JSON. Remove references in the same
    // transaction so customers never keep a stale cart line or dead wishlist ID.
    const sessions = await getRows('SELECT id,cart_json,wishlist_json FROM sessions',[],tx);
    for (const session of sessions) {
      let cart = [];
      let wishlist = [];
      try { const parsed = JSON.parse(session.cart_json || '[]'); if (Array.isArray(parsed)) cart = parsed; } catch {}
      try { const parsed = JSON.parse(session.wishlist_json || '[]'); if (Array.isArray(parsed)) wishlist = parsed; } catch {}
      const nextCart = cart.filter(item => Number(item?.productId) !== Number(id));
      const nextWishlist = wishlist.filter(item => Number(item) !== Number(id));
      if (nextCart.length !== cart.length || nextWishlist.length !== wishlist.length) {
        await run('UPDATE sessions SET cart_json=?,wishlist_json=? WHERE id=?',[JSON.stringify(nextCart),JSON.stringify(nextWishlist),session.id],tx);
      }
    }
    const result = await run(`DELETE FROM products WHERE id=? AND reserved_stock=0
      AND NOT EXISTS(SELECT 1 FROM product_variants pv WHERE pv.product_id=products.id AND pv.reserved_stock>0)
      AND NOT EXISTS(SELECT 1 FROM order_items oi WHERE oi.product_id=products.id)`,[id],tx);
    if (result.changes !== 1) throw new Error('PRODUCT_DELETE_BLOCKED');
    await tx.commit();
    return product;
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  }
}
// Backward-compatible export for integrations that used the old archived-only name.
export async function permanentlyDeleteArchivedProduct(id) {
  return permanentlyDeleteProduct(id);
}
export async function adminCreateOrUpdateStory(data) {
  const values = [data.title,data.body,data.imageUrl,data.linkUrl || '',data.productId || null,data.publishedAt,data.expiresAt,data.active?1:0];
  if (data.id) { const changed=(await run(`UPDATE stories SET title=?,body=?,image_url=?,link_url=?,product_id=?,published_at=?,expires_at=?,active=? WHERE id=?`,[...values,data.id])).changes; if(changed!==1) throw new Error('NOT_FOUND'); return Number(data.id); }
  return Number((await run(`INSERT INTO stories(title,body,image_url,link_url,product_id,published_at,expires_at,active) VALUES(?,?,?,?,?,?,?,?)`,values)).lastInsertRowid);
}
export async function deleteStory(id) { return (await run('DELETE FROM stories WHERE id=?',[id])).changes===1; }


export async function issueGiftCard({amountCents,currency,managerId,expiresAt=null}={}) {
  if(!Number.isSafeInteger(amountCents)||amountCents<100||amountCents>100000000||!isValidCurrency(currency)||!Number.isSafeInteger(managerId)||managerId<1)throw new Error('INVALID_GIFT_CARD_ISSUE');
  const code=generateGiftCardCode(),hash=giftCardHash(code);
  const tx=await db.transaction('write');
  try {
    const info=await run('INSERT INTO gift_cards(code_hash,currency,original_amount_cents,balance_cents,expires_at,issued_by_user_id) VALUES(?,?,?,?,?,?)',[hash,currency,amountCents,amountCents,expiresAt,managerId],tx);
    await run("INSERT INTO gift_card_ledger(gift_card_id,event,amount_cents,actor_user_id,note) VALUES(?,'issue',?,?,'Manager-issued credit')",[info.lastInsertRowid,amountCents,managerId],tx);
    await tx.commit(); return {id:info.lastInsertRowid,code};
  } catch(error){try{await tx.rollback();}catch{} throw error;}
}
export async function listGiftCards(limit=100){ return getRows('SELECT id,currency,original_amount_cents,balance_cents,active,expires_at,created_at FROM gift_cards ORDER BY id DESC LIMIT ?',[Math.max(1,Math.min(100,limit))]); }
export async function getGiftCardLedger(cardId){return getRows('SELECT id,order_id,event,amount_cents,created_at,note FROM gift_card_ledger WHERE gift_card_id=? ORDER BY id DESC',[cardId]);}
export async function refundGiftCardOrderCredit({orderId,managerId,reason}={}) {
  if(!Number.isSafeInteger(orderId)||orderId<1||!Number.isSafeInteger(managerId)||managerId<1||typeof reason!=='string'||reason.trim().length<10)throw new Error('INVALID_GIFT_CARD_REFUND');
  const tx=await db.transaction('write');
  try {
    const order=await getRow("SELECT id,gift_card_id,payment_provider,total_cents,status FROM orders WHERE id=?",[orderId],tx);
    if(!order||order.payment_provider!=='gift_card'||!order.gift_card_id||!['cancelled','completed'].includes(order.status))throw new Error('REFUND_REQUIRES_CANCELLED_OR_COMPLETED_ORDER');
    const redeemed=await getRow("SELECT amount_cents FROM gift_card_ledger WHERE order_id=? AND event='redeem'",[orderId],tx);
    if(!redeemed)throw new Error('GIFT_CARD_REDEMPTION_NOT_FOUND');
    const prior=await getRow("SELECT id FROM gift_card_ledger WHERE order_id=? AND event='refund'",[orderId],tx);
    if(prior){await tx.rollback();return {refunded:false,alreadyRefunded:true};}
    const amount=Number(redeemed.amount_cents);
    const recorded=Number((await getRow('SELECT COALESCE(SUM(refund_amount_cents),0) AS amount FROM order_returns WHERE order_id=? AND refund_recorded_at IS NOT NULL',[orderId],tx))?.amount||0);
    if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(recorded)||recorded<0||!Number.isSafeInteger(Number(order.total_cents))||amount>Number(order.total_cents)-recorded)throw new Error('REFUND_OVER_ORDER_TOTAL');
    const updated=await run('UPDATE gift_cards SET balance_cents=balance_cents+? WHERE id=? AND balance_cents+?<=original_amount_cents',[amount,order.gift_card_id,amount],tx);
    if(updated.changes!==1)throw new Error('GIFT_CARD_REFUND_BALANCE_CONFLICT');
    await run("INSERT INTO gift_card_ledger(gift_card_id,order_id,event,amount_cents,actor_user_id,note) VALUES(?,?,'refund',?,?,?)",[order.gift_card_id,orderId,amount,managerId,reason.trim().slice(0,200)],tx);
    await tx.commit();return {refunded:true,amountCents:amount};
  }catch(error){try{await tx.rollback();}catch{}throw error;}
}

export async function claimPeppolSubmission({invoiceNumber,recipient,payloadHash,managerId}) {
 if(!/^INV-[A-Za-z0-9][A-Za-z0-9-]{2,44}$/.test(invoiceNumber)||!/^0208:[01]\d{9}$/.test(recipient)||!/^[0-9a-f]{64}$/.test(payloadHash)||!Number.isSafeInteger(managerId)||managerId<1)throw new Error('INVALID_PEPPOL_CLAIM');
 try{const row=await run("INSERT INTO peppol_submissions(invoice_number,recipient,payload_hash,status,created_by_user_id) VALUES(?,?,?,'preparing',?)",[invoiceNumber,recipient,payloadHash,managerId]);return {claimed:row.changes===1,id:row.lastInsertRowid};}
 catch(error){if(/UNIQUE|CONSTRAINT/i.test(String(error.message)))return {claimed:false};throw error;}
}
export async function finishPeppolSubmission(id,status,reference='') {
 if(!['submitted','reconciliation_required','rejected'].includes(status))throw new Error('INVALID_PEPPOL_STATUS');
 return run("UPDATE peppol_submissions SET status=?,provider_reference=?,updated_at=datetime('now') WHERE id=? AND status='preparing'",[status,String(reference||'').slice(0,160),id]);
}
export async function listPeppolSubmissions(){return getRows('SELECT id,invoice_number,recipient,status,provider_reference,created_at FROM peppol_submissions ORDER BY id DESC LIMIT 50');}

export default db;
