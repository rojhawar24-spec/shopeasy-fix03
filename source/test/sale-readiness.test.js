import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';
import { emailEnabled } from '../src/services/email.js';
import { assertDesignDelivery } from './helpers/design-delivery-contract.mjs';

const root = path.resolve(process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const packageVersion = JSON.parse(read('package.json')).version;

test('checkout collects contact and delivery location and manager can see it', () => {
  const checkout = read('views/checkout.ejs');
  const order = read('views/admin/order.ejs');
  assert.match(checkout, /name="customerPhone"/);
  assert.match(checkout, /type="email"/);
  assert.match(checkout, /name="shippingAddress"/);
  assert.match(checkout, /name="shippingCity"/);
  assert.match(checkout, /name="shippingCountry"/);
  assert.match(order, /order\.customer_phone/);
  assert.match(order, /order\.shipping_address/);
  assert.match(order, /order\.shipping_city/);
  assert.match(order, /order\.shipping_country/);
});

test('AI is independently switchable from the manager UI', () => {
  const settings = read('views/admin/settings.ejs');
  const server = read('src/server.js');
  assert.match(settings, /name="aiEnabled"/);
  assert.match(server, /getSetting\('ai_enabled','0'\)/);
  assert.match(server, /saveStoreSettingsWithCurrency\(settingsEntries/);
  assert.match(server, /ai_enabled:aiToggle\?'1':'0'/);
  assert.match(server, /services\/ai\.js/);
});

test('layout has one main region and no inline styles under the strict CSP', () => {
  const allViews = [];
  const walk = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full); else if (item.name.endsWith('.ejs')) allViews.push(read(path.relative(root, full)));
    }
  };
  walk(path.join(root, 'views'));
  const joined = allViews.join('\n');
  assert.equal((joined.match(/<main\b[^>]*>/g)||[]).length, (joined.match(/<\/main>/g)||[]).length);
  assert.equal((joined.match(/\sstyle\s*=/g)||[]).length, 0);
});

test('database schema block contains only SQL and customer_phone migration runs outside it', () => {
  const source = read('src/db.js');
  const start = source.indexOf('executeMultiple(`');
  const end = source.indexOf('`);', start);
  assert.ok(start >= 0 && end > start);
  const schema = source.slice(start + 9, end);
  assert.equal(/(^|\n)\s*(const|if)\s+orderColumns\b/.test(schema), false);
  assert.equal(schema.includes('// Backward-compatible migration'), false);
  assert.match(source.slice(end), /await ensureColumn\('orders','customer_phone'/);
});

test('preview page uses a self-contained relative stylesheet path', () => {
  const preview = read('PREVIEW.html');
  assert.doesNotMatch(preview, /file:\/\/\/mnt\/data\//);
  assertDesignDelivery(['PREVIEW.html']);
});

test('order status page escapes dynamic COD status and totals', () => {
  const success = read('views/success.ejs');
  for (const m of success.matchAll(/<%=([\s\S]*?)%>/g)) assert.doesNotMatch(m[1], /<strong>/);
  assert.match(success, /<%= order\.status==='pending'\?/);
  assert.match(success, /<%= formatPrice\(order\.total_cents,order\.currency\) %>/);
  assert.doesNotMatch(success, /<%-[^%]*order\.status/);
});

test('product archive/restore preserves history and permanent deletion is guarded', () => {
  const server = read('src/server.js');
  const db = read('src/db.js');
  const products = read('views/admin/products.ejs');
  assert.match(server, /app\.post\('\/admin\/products\/archive'/);
  assert.match(db, /export async function archiveProduct\(id\)/);
  assert.match(db, /UPDATE products SET active=0,featured=0/);
  assert.match(server, /app\.post\('\/admin\/products\/restore'/);
  assert.match(server, /app\.post\('\/admin\/products\/delete'/);
  assert.match(db, /export async function restoreProduct\(id\)/);
  assert.match(db, /export async function permanentlyDeleteArchivedProduct\(id\)/);
  assert.match(db, /PRODUCT_HAS_ORDER_HISTORY/);
  assert.match(db, /NOT EXISTS\(SELECT 1 FROM order_items oi WHERE oi.product_id=products.id\)/);
  assert.match(products, /action="\/admin\/products\/restore"/);
  assert.match(products, /action="\/admin\/products\/delete"/);
  assert.match(products, /name="status"/);
  assert.match(products, /action="\/admin\/products\/archive"/);
  assert.match(products, /Archive this product\? It will be hidden from the shop but kept for historic orders\./);
});

test('English, Sorani, Arabic and Dutch dictionaries have matching coverage with the correct text directions', () => {
  const i18n = read('public/js/i18n.js');
  const html = read('views/partials/header.ejs');
  const match = i18n.match(/const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/);
  assert.ok(match, 'language dictionary should be machine-readable JSON');
  const dictionaries = JSON.parse(match[1]);
  assert.ok(Object.keys(dictionaries.en).length >= 400);
  assert.equal(Object.hasOwn(dictionaries,'nl'), true, 'Dutch storefront language is included');
  assert.equal(Object.keys(dictionaries.nl).length, Object.keys(dictionaries.en).length, 'Dutch uses complete dictionary key coverage');
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.ckb).sort());
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.ar).sort());
  assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.nl).sort());
  assert.notEqual(dictionaries.ckb['Complete your order.'], 'Complete your order.');
  for (const key of [
    'Some items in your cart are no longer available in the requested quantity. Review the stock message under each item before continuing.',
    'Stock changed since you added these items. Your requested quantities were kept; update or remove the affected items before checkout.',
    'Only <%= i.availableStock %> available. Change the quantity to <%= i.availableStock %> or less, then update.',
    'Fix stock issues to continue'
  ]) {
    assert.notEqual(dictionaries.ckb[key], key, `Missing Sorani translation: ${key}`);
    assert.notEqual(dictionaries.ar[key], key, `Missing Arabic translation: ${key}`);
  }
  assert.match(html, /dir="<%= \['ckb','ar'\]\.includes\(locale\)\?'rtl':'ltr' %>"/);
});

test('Arabic locale has RTL metadata and the footer labels the selected language correctly', () => {
  const header = read('views/partials/header.ejs');
  const footer = read('views/partials/footer.ejs');
  assert.match(header, /option value="ar"/);
  assert.match(header, /\['ckb','ar'\]\.includes\(locale\)/);
  assert.match(footer, /locale==='ar'\?'العربية'/);
});

test('manager email settings describe recovery codes, not newly sent reset links', () => {
  const settings = read('views/admin/settings.ejs');
  assert.match(settings, /six-digit password recovery codes/);
  assert.match(settings, /Password recovery codes will not be sent/);
});

test('manager account has a direct manager and security entry point', () => {
  const account = read('views/account.ejs');
  assert.match(account, /user\.role==='admin'\|\|user\.role==='manager'/);
  assert.match(account, /href="\/admin"/);
  assert.match(account, /href="\/account\/security"/);
});


test('coupon expiry uses the configured store timezone instead of the Node host timezone', () => {
  const server = read('src/server.js');
  assert.ok(server.includes('expiresAt=expiresRaw?dateTimeLocalToISOString(expiresRaw,storeTimeZone):null'));
  assert.ok(server.includes('expiresRaw&&!expiresAt'));
  assert.doesNotMatch(server, /expiresAt=safeDateOrNull\(req\.body\.expiresAt\)/);
});

test('mobile navigation has both the JS toggle and the CSS open-state', () => {
  const js = read('public/js/app.js');
  const css = read('public/css/app.css');
  assert.match(js, /nav\.classList\.toggle\('is-open'/);
  const openRules = [...css.matchAll(/\.nav-links\.is-open\s*\{([^}]+)\}/g)];
  assert.equal(openRules.length, 2, 'both current mobile and tablet breakpoints need the live open state');
  for (const [, rule] of openRules) assert.match(rule, /display:\s*flex/);
});

test('legacy checkout cancellation URL is read-only and never changes order state', () => {
  const server = read('src/server.js');
  assert.match(server, /app\.get\('\/checkout\/cancel',[^\n]*res\.redirect\(303,req\.user\?'\/account':'\/cart'\)/);
  assert.doesNotMatch(server.slice(server.indexOf("app.get('/checkout/cancel'")), /cancelPendingOrder/);
});

test('dynamic mobile bottom navigation is excluded from checkout', () => {
  const footer = read('views/partials/footer.ejs');
  assert.match(footer, /!isAdminRoute && !isCheckoutRoute/);
});

test('frontend asset versions are consistent across the main shell and preview', () => {
  const footer = read('views/partials/footer.ejs');
  const appVersion = footer.match(/app\.js\?v=([^"&]+)/)?.[1];
  assert.ok(appVersion, 'the runtime application script must be cache-versioned');
  assert.match(appVersion, /^[A-Za-z0-9._-]+$/);
  assertDesignDelivery(['PREVIEW.html']);
});

test('all storefront date displays use the configured store timezone helper', () => {
  const stories = read('views/stories.ejs');
  assert.match(stories, /formatDateTimeDisplay\(s\.expires_at,storeTimeZone\)/);
  assert.doesNotMatch(stories, /toLocaleDateString/);
});

test('main shell provides a keyboard skip link and a stable main content target', () => {
  const header = read('views/partials/header.ejs');
  assert.match(header, /class="skip-link" href="#main-content"/);
  assert.match(header, /<main\b(?=[^>]*\bid="main-content")[^>]*>/, 'main content target must be on a semantic main element');
});

test('Manager pages use one semantic shared navigation and the active Audit link is correct', () => {
  const pages = ['dashboard','products','product-form','categories','orders','order','stories','story-form','coupons','customers','audit','settings','branding'];
  const navSource = read('views/partials/admin-nav.ejs');
  assert.match(navSource, /aria-label="Store manager navigation"/);
  assert.match(navSource, /navActive\('\/admin\/audit'\)/);
  for (const page of pages) {
    const source = read(`views/admin/${page}.ejs`);
    assert.match(source, /include\(['"]\.\.\/partials\/admin-nav['"]\)/, `${page} uses shared Manager navigation`);
  }
  const renderNav = pathname => ejs.render(navSource, { path: pathname, user: { role: 'manager' } });
  const auditNav = renderNav('/admin/audit');
  assert.match(auditNav, /<a href="\/admin\/audit" class="active" aria-current="page">Audit trail<\/a>/);
  assert.doesNotMatch(auditNav, /<a href="\/admin\/stories" class="active"/);
  const storyNav = renderNav('/admin/stories');
  assert.match(storyNav, /<a href="\/admin\/stories" class="active" aria-current="page">Stories<\/a>/);
  assert.doesNotMatch(storyNav, /<a href="\/admin\/audit" class="active"/);
  assert.doesNotMatch(ejs.render(navSource, { path: '/admin', user: { role: 'admin' } }), /href="\/admin\/branding"/);
});

test('product pages expose a breadcrumb trail for navigation context', () => {
  const product = read('views/product.ejs');
  assert.match(product, /class="breadcrumbs" aria-label="<%= customerText\("Breadcrumb"\) %>"/);
  assert.match(product, /aria-current="page"/);
});

test('production audit uses store timezone-aware date helpers and positive product pricing', () => {
  const server = read('src/server.js');
  const security = read('src/security.js');
  const form = read('views/admin/product-form.ejs');
  assert.ok(server.includes('saleStart=saleStartRaw?dateTimeLocalToISOString(saleStartRaw,storeTimeZone):null'));
  assert.ok(server.includes('saleEnd=saleEndRaw?dateTimeLocalToISOString(saleEndRaw,storeTimeZone):null'));
  assert.ok(server.includes('saleStartRaw&&!saleStart'));
  assert.match(server, /price<=0/);
  assert.match(security, /export function dateTimeLocalToISOString/);
  assert.match(form, /min="<%= formatMoneyInput\(1,currency\) %>"/);
  assert.match(form, /step="<%= formatMoneyInput\(1,currency\) %>"/);
  assert.match(security, /currencyMinorUnitDigits/);
});


test('automatic discount is persisted and controlled per product', () => {
  const db = read('src/db.js');
  const server = read('src/server.js');
  const form = read('views/admin/product-form.ejs');
  assert.match(db, /automatic_discount_percent INTEGER NOT NULL DEFAULT 0 CHECK\(automatic_discount_percent >= 0 AND automatic_discount_percent <= 90\)/);
  assert.match(db, /normalizeProductDiscountPercent/);
  assert.match(db, /applyPercentDiscountCents/);
  // Strict input validation replaced Number(...): never accept arrays,
  // scientific notation, floats or other coerced discount values.
  assert.match(server, /automaticDiscountPercent=parseCartQuantity\(req\.body\.automaticDiscountPercent\)/);
  assert.match(server, /automaticDiscountPercent===null\|\|automaticDiscountPercent>90/);
  assert.match(server, /automaticDiscountPercent:data\.automaticDiscountPercent/);
  assert.match(form, /name="automaticDiscountPercent"/);
  assert.match(form, /min="0" max="90" step="1" required/);
});

test('automatic item discounts are recorded separately and coupons never discount above the already reduced item subtotal', () => {
  const db = read('src/db.js');
  const order = read('views/admin/order.ejs');
  assert.match(db, /automatic_discount_cents/);
  assert.match(db, /const discount = couponDiscount/);
  // Bundles are an additional discount, and coupons must be capped *after* bundles.
  assert.match(db, /const couponBase = subtotalBeforeAutomaticDiscount - automaticDiscount - bundleDiscount;/);
  assert.match(db, /couponDiscount = Math\.min\(couponDiscount, couponBase\);/);
  assert.match(db, /const itemsAfterDiscount = subtotal - automaticDiscount - bundleDiscount - couponDiscount;/);
  assert.match(db, /discount_cents/);
  assert.match(order, /order\.automatic_discount_cents/);
  assert.match(order, /order\.discount_cents/);
  assert.match(order, /Automatic product discounts/);
});

test('cart and checkout expose per-product automatic discounts transparently', () => {
  const cart = read('views/cart.ejs');
  const checkout = read('views/checkout.ejs');
  assert.match(cart, /automaticDiscountPercent/);
  assert.match(cart, /Automatic product discounts/);
  assert.match(checkout, /automaticDiscountPercent/);
  assert.match(checkout, /Automatic item discounts/);
});

test('automatic discount keeps product price ordering monotonic and uses the same server helper', () => {
  const db = read('src/db.js');
  assert.match(db, /available_price/);
  assert.match(db, /ORDER BY \$?\{order\}/);
  assert.match(db, /export function effectivePrice/);
  assert.match(db, /baseEffectivePrice\(product\)/);
});


test('canonical orders schema contains the automatic discount column and products contain the per-item discount control', () => {
  const db = read('src/db.js');
  const form = read('views/admin/product-form.ejs');
  assert.match(db, /automatic_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK\(automatic_discount_cents >= 0\)/);
  assert.match(db, /ALTER TABLE orders ADD COLUMN automatic_discount_cents INTEGER NOT NULL DEFAULT 0/);
  assert.match(db, /automatic_discount_percent INTEGER NOT NULL DEFAULT 0/);
  assert.match(form, /this discount applies only to this product/);
});


test('store settings no longer expose a storewide discount and product prices sort using the final per-item price', () => {
  const settings = read('views/admin/settings.ejs');
  const db = read('src/db.js');
  const header = read('views/partials/header.ejs');
  assert.doesNotMatch(settings, /STOREWIDE DISCOUNT|automaticDiscountPercent/);
  assert.doesNotMatch(header, /off every product/);
  assert.match(db, /availablePriceSql/);
  assert.match(db, /p\.automatic_discount_percent/);
});

test('product discount migration preserves the old storewide setting only once while moving future control to products', () => {
  const db = read('src/db.js');
  assert.match(db, /legacy_storewide_discount_migrated/);
  assert.match(db, /UPDATE products SET automatic_discount_percent/);
});

test('per-product discount is isolated: setting one product never creates a store-wide control', () => {
  const form = read('views/admin/product-form.ejs');
  const db = read('src/db.js');
  const server = read('src/server.js');
  const settings = read('views/admin/settings.ejs');
  assert.match(form, /name="automaticDiscountPercent"/);
  assert.match(db, /automatic_discount_percent/);
  assert.match(server, /automaticDiscountPercent:data\.automaticDiscountPercent/);
  assert.doesNotMatch(settings, /name="automaticDiscountPercent"/);
  assert.doesNotMatch(server, /getAutomaticDiscountPercent/);
});

test('cash-only checkout supports a strict standard profile and a lighter simplified profile without online payments', () => {
  const server = read('src/server.js');
  const settings = read('views/admin/settings.ejs');
  const checkout = read('views/checkout.ejs');
  assert.match(server, /supportEmail/);
  assert.match(server, /businessPhone/);
  assert.match(server, /enterpriseNumber/);
  assert.match(server, /privacy_policy/);
  assert.match(server, /terms_policy/);
  assert.match(server, /shipping_policy/);
  assert.match(server, /returns_policy/);
  assert.match(read('src/db.js'), /payment_mode','cash_on_delivery'/);
  assert.doesNotMatch(server, /stripeEnabled|webhooks\/stripe/);
  assert.match(settings, /name="businessPhone"/);
  assert.match(settings, /name="enterpriseNumber"/);
  assert.match(checkout, /Order with obligation to pay/);
  assert.match(checkout, /Bestelling met betalingsverplichting/);
  assert.match(checkout, /Commande avec obligation de paiement/);
  assert.doesNotMatch(checkout, /Stripe|Place order — pay online/);
});



test('production launch gate requires business policies, tax-inclusive prices and a sellable product; only reset email is supported', () => {
  const server = read('src/server.js');
  const email = read('src/services/email.js');
  assert.match(server, /emailEnabled\(\)/);
  assert.match(server, /sendPasswordResetCodeEmail/);
  assert.doesNotMatch(server, /sendPasswordResetEmail\s*\(/, 'new password recovery must not send legacy reset links');
  assert.match(server, /pricesIncludeTax/);
  assert.match(server, /sellableProductCount/);
  assert.match(server, /marketSetupMode/);
  assert.match(server, /evaluateLaunchReadiness/);
  assert.doesNotMatch(server, /sendOrderConfirmationEmail|sendManagerNotificationEmail/);
  assert.match(email, /api\.resend\.com\/emails/);
});

test('legacy checkout cancellation URL is read-only and cannot mutate an order', () => {
  const server = read('src/server.js');
  assert.match(server, /app\.get\('\/checkout\/cancel',[^\n]*res\.redirect\(303,req\.user\?'\/account':'\/cart'\)/);
});

test('pending checkout idempotency does not expire orders by elapsed time', () => {
  const server = read('src/server.js');
  assert.doesNotMatch(server, /Expired checkout reservation|const expired=prior\.reservation_expires_at/);
  assert.match(server, /outside the safe automatic retry window/);
  assert.doesNotMatch(server, /cancelPendingOrder\(prior\.id,'Checkout cart changed before retry'/, 'uncertain card attempts must not be auto-canceled on retry');
});

test('checkout defaults to COD; hosted card checkout is capability-gated and does not expose Stripe handlers', () => {
  const server = read('src/server.js');
  const providers = read('src/services/payment-providers.js');
  const checkout = read('views/checkout.ejs');
  assert.match(read('src/db.js'), /payment_mode','cash_on_delivery'/);
  assert.match(server, /paymentMethod:'cash_on_delivery'/);
  assert.match(server, /requestedPaymentMethod==='card'&&!payments\.status\.checkoutCardEnabled/);
  assert.match(server, /createMollieCardPayment/);
  assert.match(server, /markProviderOrderPaid/);
  assert.match(server, /app\.post\('\/payments\/mollie\/webhook'/);
  assert.match(providers, /method:\s*'creditcard'/);
  assert.doesNotMatch(server, /webhooks\/stripe|createStripeCheckout|saveCheckoutSession/);
  assert.doesNotMatch(checkout, /name="cardNumber"|name="cvv"|name="cvc"/i);
});

test('shared Manager navigation marks Audit active and keeps Stories inactive on the audit page', () => {
  const auditPage = read('views/admin/audit.ejs');
  const nav = read('views/partials/admin-nav.ejs');
  assert.match(auditPage, /include\(['"]\.\.\/partials\/admin-nav['"]\)/);
  const rendered = ejs.render(nav, { path: '/admin/audit', user: { role: 'manager' } });
  assert.match(rendered, /<a href="\/admin\/audit" class="active" aria-current="page">Audit trail<\/a>/);
  assert.doesNotMatch(rendered, /<a href="\/admin\/stories" class="active"/);
});

test('product preview currency is not hard-coded to euro', () => {
  const form = read('views/admin/product-form.ejs');
  const js = read('public/js/app.js');
  assert.match(form, /data-shop-currency="<%= currency %>"/);
  assert.doesNotMatch(js, /Final customer price preview: €/);
  assert.match(js, /new Intl\.NumberFormat\(formatLocale, \{ style:'currency', currency, minimumFractionDigits:digits, maximumFractionDigits:digits \}\)/);
  assert.match(js, /rootLocale\.startsWith\('ar'\) \? 'ar'/);
});

test('product and story images reserve layout space for lower CLS', () => {
  const product = read('views/product.ejs');
  const stories = read('views/stories.ejs');
  const home = read('views/home.ejs');
  assert.match(product, /width="800" height="1000"/);
  assert.match(stories, /width="800" height="600"/);
  assert.match(home, /fetchpriority="high"/);
});

test('order detail names automatic product discounts explicitly', () => {
  const order = read('views/order.ejs');
  assert.match(order, /Automatic product discounts/);
  assert.doesNotMatch(order, /Automatic store discount/);
});

test('database startup declares the settings upsert before any migration can use it', () => {
  const db = read('src/db.js');
  const declaration = db.indexOf("const upsertSetting = (key,value) => run('INSERT INTO settings");
  assert.ok(declaration > 0);
  assert.ok(db.indexOf('await upsertSetting', declaration + 1) > declaration);
  const migrationUse = db.indexOf("await upsertSetting('prices_include_tax'", 0);
  assert.ok(migrationUse > declaration);
});

test('homepage uses a real catalogue image by default while preserving custom storefront hero uploads', () => {
  const home = read('views/home.ejs');
  const server = read('src/server.js');
  assert.match(home, /safeImageUrl\(heroProduct\.image_url\)/);
  assert.doesNotMatch(home, /hero-editorial\.webp|hero-studio\.svg/);
  assert.match(server, /getSetting\('hero_image',''\)/);
  assert.match(server, /const heroProduct=latestProducts\.find/);
  assert.match(home, /heroProduct\.name/);
  assert.match(home, /heroProduct\.image_url/);
  assert.match(home, /products\.forEach\(p=>\{/);
  assert.match(home, /include\('partials\/product-card',\{p:p\}\)/);
  assert.doesNotMatch(home, /src="\/assets\/product-1\.svg" alt="Featured product"/);
});

test('manager currency is selected from the server allow-list', () => {
  const settings = read('views/admin/settings.ejs');
  const server = read('src/server.js');
  assert.match(settings, /name="currency"/);
  assert.match(settings, /availableCurrencies/);
  assert.match(server, /availableCurrencies:SUPPORTED_CURRENCIES/);
  assert.doesNotMatch(settings, /pattern="\[A-Za-z\]\{3\}"/);
});

test('product forms always receive the configured display currency', () => {
  const server = read('src/server.js');
  assert.match(server, /admin\/product-form'.*currency:await getSetting\('currency',DEFAULT_STORE_CURRENCY\)/);
});

test('email sender validation rejects malformed mailbox syntax', async () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM};
  process.env.RESEND_API_KEY='re_test';
  process.env.EMAIL_FROM='Shop <bad>';
  assert.equal(emailEnabled(),false);
  process.env.EMAIL_FROM='Shop <orders@example.com>';
  assert.equal(emailEnabled(),true);
  if(prev.key===undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY=prev.key;
  if(prev.from===undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM=prev.from;
});

test('currency allow-list is independent of online payment providers', () => {
  const security = read('src/security.js');
  assert.match(security, /export const SUPPORTED_CURRENCIES/);
  assert.doesNotMatch(security, /STRIPE_/);
  assert.doesNotMatch(read('src/server.js'), /STRIPE_|stripe/i);
});

test('homepage shows a catalog fallback when nothing is featured and keeps newer products visible', () => {
  const server = read('src/server.js');
  assert.match(server, /listProducts\(\{onlyActive:true,featured:true,sort:'featured',limit:8,offset:0\}\)/);
  assert.match(server, /listProducts\(\{onlyActive:true,sort:'newest',limit:32,offset:0\}\)/);
  assert.match(server, /const products=featuredProducts\.length \? featuredProducts : latestProducts\.slice\(0,8\)/);
  assert.match(server, /const newProducts=latestProducts\.filter/);
});


test('stock edits and checkout reservation have atomic SQL guards against races', () => {
  const db = read('src/db.js');
  assert.match(db, /WHERE id=\? AND reserved_stock<=\?`/);
  assert.match(db, /WHERE id=\? AND active=1 AND stock-reserved_stock>=\?/);
  assert.match(db, /throw new Error\('RESERVED_STOCK'\)/);
});

test('legacy order management does not expose old provider names or claim old orders are cash-on-delivery', () => {
  const legacy = read('views/admin/order.ejs');
  assert.doesNotMatch(legacy, /order\.payment_provider\s*%>/);
  assert.match(legacy, /Payment method: <%= order\.payment_provider/);
  assert.match(legacy, /Card payment needs provider verification/);
  assert.match(legacy, /reconcile-mollie-payment/);
  assert.match(legacy, /Pending order — previous checkout/);
});


test('serverless runtimes periodically clean expired sessions and stock reservations', () => {
  const server = read('src/server.js');
  assert.match(server, /process\.env\.CLOUDFLARE_WORKER!=='1' \|\| Date\.now\(\)-lastRequestMaintenanceAt<5\*60\*1000/);
  assert.match(server, /await cleanupSessions\(\);/);
  assert.doesNotMatch(server, /releaseExpiredReservations|Expired reservation cleanup/);
});

test('manager can accept a pending COD order regardless of how old it is', () => {
  const db = read('src/db.js');
  assert.match(db, /async function acceptPendingCashOnDeliveryOrder\(id, actorUserId=null\)/);
  assert.match(db, /LEFT JOIN product_variants pv ON pv\.id=oi\.variant_id AND pv\.product_id=oi\.product_id/);
  assert.match(db, /Number\(item\.reserved_stock\)<Number\(item\.quantity\)/);
  assert.match(db, /UPDATE orders SET status='processing'/);
  assert.match(db, /WHERE id=\? AND status='pending' AND payment_provider='cash_on_delivery'/);
  assert.doesNotMatch(db, /reservation_expires_at IS NOT NULL AND reservation_expires_at>=\?/);
  assert.match(read('views/admin/order-cash.ejs'), /There is no automatic time limit/);
});


test('database column migrations tolerate only a proven concurrent schema update', () => {
  const db = read('src/db.js');
  assert.match(db, /async function ensureColumn\(table,column,sql\)/);
  assert.match(db, /const refreshed=await getRows\(`PRAGMA table_info\(\$\{table\}\)`\)/);
  assert.match(db, /if\(!refreshed\.some\(item=>item\.name===column\)\) throw error/);
  assert.match(db, /for \(const migration of forwardMigrations\) await ensureColumn/);
});

test('first Manager bootstrap handles a concurrent unique-email race without masking database failure', () => {
  const server = read('src/server.js');
  assert.match(server, /Simultaneous first serverless cold starts may race on the unique staff email|Simultaneous first serverless cold starts can race on the unique staff email/);
  assert.match(server, /const managerAfterRace=await getRow/);
  assert.match(server, /if\(managerAfterRace\) return;\s*throw error/);
});

test('password recovery uses short-lived six-digit codes with bounded attempts and password reset revokes sessions', () => {
  const server = read('src/server.js');
  const db = read('src/db.js');
  const email = read('src/services/email.js');
  const template = read('views/forgot-password.ejs');
  assert.match(server, /crypto\.randomInt\(0,1000000\)/);
  assert.match(server, /Date\.now\(\)\+10\*60\*1000/);
  assert.match(server, /createHmac\('sha256'/);
  assert.match(db, /attempts>=5/);
  assert.match(db, /DELETE FROM sessions WHERE user_id/);
  assert.match(email, /sendPasswordResetCodeEmail/);
  assert.match(template, /name="code"/);
  assert.match(template, /name="action" value="reset"/);
});

test('per-account password-code requests have a database-backed cooldown', () => {
  const db = read('src/db.js');
  const server = read('src/server.js');
  assert.match(db, /CREATE TABLE IF NOT EXISTS password_reset_cooldowns/);
  assert.match(db, /now-Number\(previous\.last_requested_at_ms\)<60_000/);
  assert.match(server, /const issued=await createPasswordResetToken/);
  assert.match(server, /if\(issued\) \{ void \(async\(\)=>[\s\S]*?sendPasswordResetCodeEmail/);
});

test('manager catalog stores purchase cost and reorder threshold without exposing cost on storefront', () => {
  const db = read('src/db.js');
  const server = read('src/server.js');
  const form = read('views/admin/product-form.ejs');
  const list = read('views/admin/products.ejs');
  assert.match(db, /cost_price_cents/);
  assert.match(db, /unit_cost_cents/);
  assert.match(db, /reorder_level/);
  assert.match(server, /costPriceCents/);
  assert.match(form, /name="costPrice"/);
  assert.match(form, /name="reorderLevel"/);
  assert.match(list, /sold_quantity/);
  assert.match(list, /suggest ordering/);
  assert.doesNotMatch(read('views/product.ejs'), /cost_price_cents|costPriceCents/);
});


test('catalog and manager pagination are bounded by actual result counts, not arbitrary record caps', () => {
  const server = read('src/server.js');
  assert.match(server, /function boundedPage\(value,total,pageSize\)/);
  assert.match(server, /Number\.isSafeInteger\(parsed\)&&parsed>0/);
  assert.match(server, /const pages=Math\.max\(1,Math\.ceil\(Math\.max\(0,Number\(total\)\|\|0\)\/pageSize\)\)/);
  const shopRoute = server.match(/app\.get\('\/shop',[\s\S]*?\n\}\);/);
  assert.ok(shopRoute, 'shop route should be present');
  assert.match(shopRoute[0], /const resultCount=await countProducts/);
  assert.match(shopRoute[0], /page=boundedPage\(req\.query\.page,resultCount,pageSize\)/);
  for (const route of ['/admin/products', '/admin/orders', '/admin/customers']) {
    const start = server.indexOf(`app.get('${route}'`);
    assert.notEqual(start, -1, `${route} route should exist`);
    const section = server.slice(start, start + 1400);
    assert.match(section, /boundedPage\(req\.query\.page,total,pageSize\)/, `${route} should bound pages using its actual record count`);
    assert.doesNotMatch(section, /Math\.min\(Number\(req\.query\.page\)\|\|1,(?:200|1000|1000000)\)/);
  }
});

test('failed search and wishlist actions give accessible user feedback and the mobile menu can scroll', () => {
  const app = read('public/js/app.js');
  const css = read('test/fixtures/legacy-css/style.css');
  const translations = read('public/js/i18n.js');
  assert.match(app, /Could not update wishlist\. Please try again\./);
  assert.match(app, /Search is temporarily unavailable\. Please try again\./);
  assert.match(app, /aria-live/);
  assert.match(css, /\.nav-links\.open[\s\S]*?overflow-y:\s*auto/);
  assert.match(translations, /Could not update wishlist\. Please try again\./);
  assert.match(translations, /Search is temporarily unavailable\. Please try again\./);
});


test('customer order history is paginated instead of silently stopping after 200 orders', () => {
  const db = read('src/db.js');
  const server = read('src/server.js');
  const account = read('views/account.ejs');
  assert.match(db, /export async function countUserOrders\(userId\)/);
  assert.match(db, /export async function listUserOrders\(userId, limit=20, offset=0\)/);
  assert.match(server, /const total=await countUserOrders\(req\.user\.id\),pageSize=20,page=boundedPage\(req\.query\.page,total,pageSize\)/);
  assert.match(account, /href="\/account\?page=<%= page\+1 %>"/);
  assert.match(account, /href="\/account\?page=<%= page-1 %>"/);
});

test('sitemap uses an index and product shards instead of indexing only the first 500 products', () => {
  const server = read('src/server.js');
  assert.match(server, /app\.get\('\/sitemap\.xml'/);
  assert.match(server, /sitemap-products-\$\{index\+1\}\.xml/);
  assert.match(server, /app\.get\('\/sitemap-static\.xml'/);
  assert.match(server, /app\.get\('\/sitemap-products-:page\.xml'/);
  assert.match(server, /pageSize=5000/);
  assert.match(server, /for\(let offset=0;offset<remaining;offset\+=500\)/);
  assert.doesNotMatch(server, /listProducts\(\{onlyActive:true,limit:500,offset:0\}\)/);
});


test('simplified local COD keeps the 20-character English terms threshold consistent across settings and checkout', async () => {
  const gate=read('src/launch-gate.js');
  const server=read('src/server.js');
  assert.match(gate,/export function minimumCustomerTermsLength/);
  assert.match(gate,/SIMPLIFIED_COD_MODE \? 20 : 40/);
  assert.match(server,/minimumCustomerTermsLength\(launch\.marketSetupMode\)/);
  assert.match(server,/Policy completeness belongs to the launch gate, not draft persistence/);
  assert.doesNotMatch(server,/field==='terms'\s*&&\s*locale==='en'/,'draft persistence must not block incomplete terms text');
  const launchGate=await import('../src/launch-gate.js');
  assert.equal(launchGate.minimumCustomerTermsLength('simplified_cod'),20);
  assert.equal(launchGate.minimumCustomerTermsLength('standard'),40);
  assert.equal(launchGate.evaluateLaunchReadiness({mode:'simplified_cod',storeName:'Shop',businessPhone:'+9647500000000',policies:{terms:'1234567890123456789'},deliveryCountriesConfigured:true,sellableProductCount:1}),false);
  assert.equal(launchGate.evaluateLaunchReadiness({mode:'simplified_cod',storeName:'Shop',businessPhone:'+9647500000000',policies:{terms:'12345678901234567890'},deliveryCountriesConfigured:true,sellableProductCount:1}),true);
});

test('simplified local COD setup keeps checkout usable without forcing full legal or tax fields', async () => {
  const gate=await import('../src/launch-gate.js');
  assert.equal(gate.normalizeMarketSetupMode('simplified_cod'),'simplified_cod');
  assert.equal(gate.evaluateLaunchReadiness({mode:'simplified_cod',storeName:'My Shop',supportEmail:'',businessPhone:'+9647500000000',policies:{terms:'Simple order terms for this store.'},pricesIncludeTax:false,shippingConfigured:true,deliveryCountriesConfigured:true,sellableProductCount:1}),true);
  assert.equal(gate.evaluateLaunchReadiness({mode:'simplified_cod',storeName:'My Shop',supportEmail:'',businessPhone:'',policies:{terms:'Simple order terms for this store.'},pricesIncludeTax:false,shippingConfigured:true,deliveryCountriesConfigured:true,sellableProductCount:1}),false);
  assert.equal(gate.launchGateMessage('simplified_cod').includes('basic store contact'),true);
});

test('standard launch setup still requires full identity, tax and four English policies', async () => {
  const gate=await import('../src/launch-gate.js');
  assert.equal(gate.evaluateLaunchReadiness({mode:'standard',storeName:'My Shop',supportEmail:'shop@example.com',businessPhone:'+3212345678',enterpriseNumber:'123',legalName:'My Shop SRL',businessAddress:'Main Street',policies:true,pricesIncludeTax:true,shippingConfigured:true,deliveryCountriesConfigured:true,sellableProductCount:1}),true);
  assert.equal(gate.evaluateLaunchReadiness({mode:'standard',storeName:'My Shop',supportEmail:'shop@example.com',businessPhone:'+3212345678',enterpriseNumber:'123',legalName:'',businessAddress:'Main Street',policies:true,pricesIncludeTax:true,shippingConfigured:true,deliveryCountriesConfigured:true,sellableProductCount:1}),false);
});

test('manager settings expose an explicit setup profile and make simplified fields optional in the browser', () => {
  const settings=read('views/admin/settings.ejs');
  const server=read('src/server.js');
  const checkout=read('views/checkout.ejs');
  assert.match(settings,/name=\"marketSetupMode\"/);
  assert.match(settings,/simplified_cod/);
  assert.match(server,/market_setup_mode:marketSetupMode/);
  assert.match(server,/normalizeMarketSetupMode\(body\.marketSetupMode\)/);
  assert.match(server,/minimumCustomerTermsLength\(launch\.marketSetupMode\)/);
});

test('checkout uses the selected market setup mode instead of one global compliance gate', () => {
  const server=read('src/server.js');
  const checkout=read('views/checkout.ejs');
  assert.match(server,/marketSetupMode:launch\.marketSetupMode/);
  assert.match(server,/pricesIncludeTax:launch\.pricesIncludeTax/);
  assert.match(server,/error:\(recoveryOrder\?launch\.configurationReady:launch\.ready\)\?null:launch\.gateMessage/);
  assert.match(server,/if\(!launch\.configurationReady\) return render/);
  assert.match(server,/if\(!launch\.ready&&!resumedExistingOrder\)return render/);
  assert.match(server,/marketSetupMode:launch\.marketSetupMode/);
  assert.match(server,/minimumCustomerTermsLength\(launch\.marketSetupMode\)/);
  assert.match(checkout,/summary\.taxIncluded/);
  assert.match(checkout,/Tax is added to the order total/);
});



test('manager product list reports variant reservations and uses them to guard archiving', () => {
  const dbSource=read('src/db.js');
  const template=read('views/admin/products.ejs');
  assert.match(dbSource,/AS reserved_inventory_total/);
  assert.match(dbSource,/SUM\(pv\.reserved_stock\)[\s\S]*?ELSE COALESCE\(p\.reserved_stock,0\) END AS reserved_inventory_total/);
  assert.match(template,/p\.reserved_inventory_total/);
  assert.match(template,/Finish or cancel the reserved checkout before archiving this product/);
});
