import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { requirePurchaseCostCents } from '../src/pricing.js';
import { formatDateTimeDisplay } from '../src/security.js';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
test('login render has safe defaults and Cloudflare database guard remains valid source', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const cloudflareBuild = fs.readFileSync(new URL('../scripts/build-cloudflare.mjs', import.meta.url), 'utf8');
  assert.match(server, /passwordReset:false/);
  assert.match(server, /function render\(res,view,data=\{\}\)/);
  const loginView = fs.readFileSync(new URL('../views/login.ejs', import.meta.url), 'utf8');
  assert.match(loginView, /typeof passwordReset !== 'undefined'/);
  execFileSync(process.execPath, ['scripts/build-cloudflare.mjs'], { cwd: root, stdio: 'ignore' });
  execFileSync(process.execPath, ['--check', '.cloudflare-build/src/database.js'], { cwd: root, stdio: 'ignore' });
});




test('optional legacy Cloudflare + Turso compatibility remains explicit and Vercel fails explicitly', () => {
  const db = read('src/database.js');
  assert.match(db, /const isCloudflareWorker = process\.env\.CLOUDFLARE_WORKER === '1'/);
  assert.match(db, /const isRemoteProduction = isCloudflareWorker/);
  assert.match(db, /isRemoteProduction && \(!process\.env\.TURSO_DATABASE_URL \|\| !process\.env\.TURSO_AUTH_TOKEN\)/);
  assert.match(db, /does not support Vercel\/AWS Lambda serverless deployment/);
  assert.match(db, /Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN/);
  const vercelConfig = JSON.parse(read('vercel.json'));
  assert.match(vercelConfig.buildCommand, /scripts\/reject-vercel-deploy\.mjs/);
  const rejectedBuild = spawnSync(process.execPath, ['scripts/reject-vercel-deploy.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(rejectedBuild.status, 1, 'the Vercel build guard must exit non-zero');
  assert.match(rejectedBuild.stderr, /does not support Vercel\/AWS Lambda serverless deployment/);
  assert.match(rejectedBuild.stderr, /Cloudflare Workers \+ Turso/);
  assert.equal(fs.existsSync(path.join(root, 'api', 'index.js')), false, 'the broken Vercel function adapter must not ship');
});
test('purchase cost rejects missing or malformed inputs instead of silently recording zero', () => {
  assert.equal(requirePurchaseCostCents(0), 0);
  assert.equal(requirePurchaseCostCents('125'), 125);
  for (const value of [null, undefined, '', ' ', -1, 1.5, 'not-money', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => requirePurchaseCostCents(value), /COST_REQUIRED/);
  }
  const db = read('src/db.js');
  assert.match(db, /requirePurchaseCostCents\(data\.costPriceCents\)/);
  assert.doesNotMatch(db, /Math\.max\(0,Number\(data\.costPriceCents\)\|\|0\)/);
});

test('same-origin referer redirects preserve the referring storefront page', () => {
  const server = read('src/server.js');
  assert.match(server, /const ref=req\.get\('referer'\)/);
  assert.match(server, /\$\{req\.protocol\}:.*u\.protocol/);
  assert.doesNotMatch(server, /u\.protocol===req\.protocol/);
});

test('display dates use the selected English, Sorani or Arabic locale', () => {
  const value = '2026-10-04T12:30:00.000Z';
  const en = formatDateTimeDisplay(value, 'Europe/Brussels', 'en-GB');
  const ckb = formatDateTimeDisplay(value, 'Europe/Brussels', 'ckb-IQ');
  const ar = formatDateTimeDisplay(value, 'Europe/Brussels', 'ar');
  assert.ok(en.length > 0 && ckb.length > 0 && ar.length > 0);
  assert.notEqual(en, ckb);
  assert.notEqual(en, ar);
  assert.equal(formatDateTimeDisplay(value, 'Europe/Brussels', 'unsupported-locale'), en);
});

test('manager legal/settings form persists all settings atomically and does not claim save on failure', () => {
  const server = read('src/server.js');
  const start = server.indexOf("app.post('/admin/settings'");
  const end = server.indexOf('\n\napp.use((req,res)=>', start);
  assert.ok(start >= 0 && end > start, 'settings route block should be found');
  const block = server.slice(start, end);
  assert.match(block, /await saveStoreSettingsWithCurrency\(settingsEntries/);
  assert.match(read('src/db.js'), /await db\.batch\(statements, 'write'\)/);
  const db = read('src/db.js');
  const settingsStart = db.indexOf('export async function setSettings');
  const settingsEnd = db.indexOf('export async function createAudit', settingsStart);
  const settingsBlock = db.slice(settingsStart, settingsEnd);
  assert.match(settingsBlock, /await db\.batch\(statements, 'write'\)/, 'the generic setSettings helper still uses the client batch API');
  const currencySaveStart = db.indexOf('export async function saveStoreSettingsWithCurrency');
  const currencySaveEnd = db.indexOf('export async function createAudit', currencySaveStart);
  const currencySaveBlock = db.slice(currencySaveStart, currencySaveEnd);
  assert.match(currencySaveBlock, /const tx=await db\.transaction\('write'\)/);
  assert.match(currencySaveBlock, /await tx\.commit\(\)/);
  assert.match(currencySaveBlock, /await tx\.rollback\(\)/);
  assert.doesNotMatch(block, /await setSetting\(key,value\)/);
  assert.match(block, /Store settings could not be saved\. No successful save was confirmed/);
  assert.match(block, /await safeAudit\(req\.user\.id,'settings_updated'/);
  const failureBranch = block.slice(block.indexOf('} catch(error) {'));
  assert.ok(failureBranch.length > 0);
  assert.doesNotMatch(failureBranch, /sellableProductCount:\(await storeLaunchConfig\(\)\)\.sellableProductCount/);
});


test('manager settings can be saved as a draft without satisfying the launch gate', () => {
  const server = read('src/server.js');
  const start = server.indexOf("app.post('/admin/settings'");
  const end = server.indexOf('\n\napp.use((req,res)=>', start);
  const block = server.slice(start, end);
  assert.match(block, /Settings are editable configuration, not the launch gate/);
  assert.match(block, /const inputIsValid=Boolean\(/);
  assert.match(block, /supportEmailValid/);
  assert.match(block, /businessPhoneValid/);
  assert.match(block, /policyVersionsValid/);
  assert.doesNotMatch(block, /englishPolicies\.every\(value=>value\.trim\(\)\.length>=40\)/);
  assert.doesNotMatch(block, /enterpriseNumber\.length>=2/);
  assert.match(block, /await saveStoreSettingsWithCurrency\(settingsEntries/);
  assert.match(block, /return res\.redirect\(303,`\/admin\/settings\?saved=1/);
});

test('completed manager mutations do not become false failures when secondary audit logging is unavailable', () => {
  const server = read('src/server.js');
  const awaitedCreateAudit = (server.match(/await createAudit\(/g) || []).length;
  assert.equal(awaitedCreateAudit, 2, 'safeAudit is non-blocking for ordinary mutations; the sensitive GDPR export intentionally fails closed if its audit record cannot be persisted');
  const exportStart = server.indexOf("app.post('/admin/gdpr/export'");
  const exportEnd = server.indexOf("app.post('/admin/gdpr/delete'", exportStart);
  const exportBlock = server.slice(exportStart, exportEnd);
  assert.ok(exportBlock.indexOf('await createAudit(') < exportBlock.indexOf('.attachment('), 'GDPR export audit must succeed before customer data is sent');
  assert.match(server, /async function safeAudit\(userId, action, targetType, targetId, meta=\{\}\)/);
  assert.match(server, /async function safeAudit[\s\S]*?try \{[\s\S]*?await createAudit\(userId, action, targetType, targetId, meta\);[\s\S]*?catch \(error\) \{[\s\S]*?logOperationalFailure\(`/);
  assert.ok((server.match(/await safeAudit\(/g) || []).length >= 15, 'manager/customer mutations should use the non-blocking audit helper');
});

test('manager business phone uses the same real international phone validation as checkout', () => {
  const server = read('src/server.js');
  const start = server.indexOf("app.post('/admin/settings'");
  const end = server.indexOf('\n\napp.use((req,res)=>', start);
  const block = server.slice(start, end);
  assert.match(block, /isValidPhone\(businessPhone\)/);
  assert.doesNotMatch(block, /businessPhone\.length>=7/);
});


test('optional manager sale and coupon dates reject malformed submitted values instead of becoming silently unset', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /saleStartRaw=String\(req\.body\.saleStart\|\|''\)\.trim\(\)/);
  assert.ok(server.includes("throw new Error('SALE_DATE')"));
  assert.match(server, /saleStartRaw.*dateTimeLocalToISOString/);
  assert.match(server, /saleEndRaw.*dateTimeLocalToISOString/);
  assert.match(server, /expiresRaw=String\(req\.body\.expiresAt\|\|''\)\.trim\(\)/);
  assert.match(server, /expiresRaw.*dateTimeLocalToISOString/);
  assert.match(server, /expiresRaw&&!expiresAt/);
});

test('storefront loads only the selected RTL translation pack before app behavior', () => {
  const footer = fs.readFileSync(new URL('../views/partials/footer.ejs', import.meta.url), 'utf8');
  const arabic = footer.indexOf('/js/i18n-ar.js?v=2.8.95-r28');
  const sorani = footer.indexOf('/js/i18n-ckb.js?v=2.8.95-r28');
  const dutch = footer.indexOf('/js/i18n-nl.js?v=2.8.95-r28');
  const app = footer.search(/\/js\/app\.js\?v=2027-r\d+/);
  assert.ok(arabic >= 0 && sorani >= 0 && dutch >= 0, 'Arabic, Sorani and Dutch translation packs must be available');
  assert.ok(app >= 0, 'app.js must be loaded by the rendered storefront');
  assert.ok(arabic < app && sorani < app && dutch < app, 'translation packs must be queued before app.js');
  assert.doesNotMatch(footer, /<script src="\/js\/i18n\.js/, 'the full multi-language dictionary must not load for each visitor');
});

test('checkout line totals render the server-calculated exact total instead of multiplying in the template', () => {
  const source = fs.readFileSync(new URL('../views/checkout.ejs', import.meta.url), 'utf8');
  assert.match(source, /formatPrice\(i\.total,currency\)/);
  assert.doesNotMatch(source, /app\.locals\.effectivePrice\(i\.product\)\*i\.quantity/);
});

test('product-list discount sorting uses exact integer arithmetic instead of floating-point money math', () => {
  const db = read('src/db.js');
  assert.match(db, /CAST\(\(\$\{basePriceSql\}\) AS INTEGER\) \* \(100-p\.automatic_discount_percent\)\) \/ 100/);
  assert.doesNotMatch(db, /\$\{basePriceSql\}\) \* \(100-p\.automatic_discount_percent\) \/ 100 AS INTEGER/);
});


test('health and database-backed upload endpoints have lightweight abuse limits', () => {
  const server = read('src/server.js');
  assert.match(server, /const healthLimiter=makeRateLimiter\('health',\{windowMs:60\*1000,max:30/);
  assert.match(server, /const uploadAssetLimiter=makeRateLimiter\('upload-assets',\{windowMs:60\*1000,max:120/);
  assert.match(server, /app\.get\('\/uploads\/:filename',uploadAssetLimiter,/);
  assert.match(server, /app\.get\('\/health',healthLimiter,/);
  assert.match(server, /const readyLimiter=makeRateLimiter\('ready',\{windowMs:60\*1000,max:30/);
  assert.match(server, /app\.get\('\/ready',readyLimiter,[\s\S]*db\.execute\('SELECT 1'\)/);
});


test('shared Cloudflare rate-limit binding fails closed instead of using isolate memory',()=>{
  const limiter=read('src/shared-rate-limiter.js');
  const worker=read('src/rate-limit-durable-object.js');
  const wrangler=JSON.parse(read('wrangler.jsonc'));
  const stagingWrangler=JSON.parse(read('wrangler.staging.jsonc'));
  assert.equal(stagingWrangler.name,'shopeasy-store-starter-staging');
  assert.notEqual(stagingWrangler.name,wrangler.name);
  assert.match(limiter,/SHOP_RATE_LIMITER/);
  assert.match(limiter,/Request protection is temporarily unavailable/);
  assert.match(limiter,/RATE_LIMIT_BACKEND === 'memory-single-instance'/);
  assert.match(worker,/storage\.transaction/);
  assert.match(worker,/async alarm\(\)/);
  assert.deepEqual(wrangler.durable_objects.bindings,[{name:'SHOP_RATE_LIMITER',class_name:'ShopEasyRateLimiter'}]);
  assert.deepEqual(wrangler.exports.ShopEasyRateLimiter,{type:'durable-object',storage:'sqlite'});
});
