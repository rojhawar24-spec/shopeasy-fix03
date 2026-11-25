// Private parent/child protocol. Never invoke this directly or redirect stdout.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const [runtimeRoot, dependencyRoot, privateDir, mode, drawerMode] = process.argv.slice(2);
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
// Application/library diagnostics may include request data. Keep them out of evidence.
console.log = console.info = console.warn = console.error = () => {};
const parent = pathToFileURL(path.join(dependencyRoot, 'package.json')).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) throw error;
    return nextResolve(specifier, {...context, parentURL: parent});
  }
}});

let server;
let store;
let stage = 'guards';
try {
  if (!runtimeRoot || !dependencyRoot || !privateDir || process.env.NODE_ENV !== 'test') throw Error('GUARD');
  if (path.dirname(runtimeRoot) !== privateDir || !fs.existsSync(path.join(privateDir, '.qa-owner'))) throw Error('GUARD');
  const random = () => crypto.randomBytes(24).toString('base64url');
  const suffix = crypto.randomBytes(8).toString('hex');
  Object.assign(process.env, {
    NODE_ENV: 'test', CLOUDFLARE_WORKER: '0', PORT: '0', TRUST_PROXY: '0',
    BASE_URL: 'https://fixture.example.test', DATABASE_URL: pathToFileURL(path.join(privateDir, 'fixture.db')).href,
    SEED_DEMO_DATA: 'false', MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    RESET_CODE_SECRET: random(), RATE_LIMIT_BACKEND: 'memory-single-instance', TEST_IMAGE_STORAGE_IN_DATABASE: '1'
  });
  const mailbox = [];
  // The local adapter intercepts provider fetch. No actual provider/inbox is contacted.
  globalThis.fetch = async (input, options = {}) => {
    if (mode !== 'simulated-email' || String(input) !== 'https://api.resend.com/emails' || options.method !== 'POST') throw Error('QA_EXTERNAL_NETWORK_DISABLED');
    const message = JSON.parse(options.body);
    const text = String(message.text || '');
    const link = text.match(/https:\/\/fixture\.example\.test\/verify-email\?token=([A-Za-z0-9_-]+)/);
    const code = String(message.html || '').match(/>\s*(\d{6})\s*</);
    mailbox.push({recipient: message.to?.[0], ...(link ? {kind: 'verify', token: link[1]} : {}), ...(code ? {kind: 'reset', code: code[1]} : {})});
    return new Response(JSON.stringify({id: `simulated-${random()}`}), {status: 200, headers: {'content-type': 'application/json'}});
  };
  if (mode === 'simulated-email') Object.assign(process.env, {RESEND_API_KEY: `simulated-${random()}`, EMAIL_FROM: 'fixture@example.test'});
  process.chdir(runtimeRoot);
  stage = 'database-import';
  store = await import(pathToFileURL(path.join(runtimeRoot, 'src/db.js')));
  const {hashPassword} = await import(pathToFileURL(path.join(runtimeRoot, 'src/password-hashing.js')));
  const settings = {store_name: 'Disposable QA Store', support_email: 'support@example.test', business_phone: '+442079460000', enterprise_number: 'SYNTHETIC-QA-ONLY', legal_name: 'Disposable QA Business', business_address: '1 Test Street, London, United Kingdom', delivery_countries: 'United Kingdom', prices_include_tax: '1', shipping_fee_cents: '350', currency: 'GBP', currency_price_review_required: '0', feature_gift_cards_enabled: '1', ui_default_locale: 'en', ui_enabled_locales: '["en","ckb","fr","nl","ar"]'};
  if (drawerMode === 'enabled-cart-drawer') settings.appearance_cartDrawer = '1';
  for (const key of ['privacy_policy', 'terms_policy', 'shipping_policy', 'returns_policy']) settings[key] = 'Synthetic test policy only. This disposable content does not describe actual business practices and has not received legal review.';
  for (const [key, value] of Object.entries(settings)) await store.setSetting(key, value);
  const categoryId = await store.createCategory('QA collection', 'qa-collection');
  stage = 'catalogue-seeding';
  const products = [];
  for (let number = 1; number <= 11; number++) products.push(await store.adminCreateOrUpdateProduct({
    name: number === 2 ? 'Featured' : `QA product ${number}`, slug: `qa-product-${number}`, sku: `QA-${suffix}-${number}`,
    shortDescription: 'Synthetic browser test product.', description: 'Disposable synthetic catalogue content.',
    imageUrl: '/assets/preview-lamp.svg', galleryImages: [], priceCents: 2500, costPriceCents: 1000, salePriceCents: null,
    automaticDiscountPercent: 0, stock: number === 11 ? 0 : 12, reorderLevel: 2, categoryId, tags: '', featured: number < 5, active: true,
    variants: number === 11 ? [{value: 'Small', stock: 12, sku: `QA-${suffix}-S`}, {value: 'Large', stock: 12, sku: `QA-${suffix}-L`}] : [], variantOptionName: 'Size', variantOptionName2: ''
  }));
  const manager = {email: `manager-${suffix}@example.test`, password: random()};
  stage = 'user-seeding';
  await store.createUser(manager.email, await hashPassword(manager.password), 'manager', 'Synthetic QA Manager');
  const other = {email: `other-${suffix}@example.test`, password: random()};
  await store.createUser(other.email, await hashPassword(other.password), 'customer', 'Other QA Customer', new Date().toISOString(), true);
  await store.adminCreateOrUpdateStory({title: 'QA story', body: 'Synthetic story content.', imageUrl: '/assets/story.svg', linkUrl: '/shop', productId: products[0], publishedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), active: true});
  stage = 'application-import';
  const {default: app} = await import(pathToFileURL(path.join(runtimeRoot, 'src/server.js')));
  stage = 'loopback-listen';
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  send({event: 'ready', port: server.address().port, manager, other, products});
  const lines = readline.createInterface({input: process.stdin});
  lines.on('line', line => {
    try {
      const request = JSON.parse(line);
      if (request.command === 'mail') {
        const index = mailbox.findIndex(item => item.recipient === request.recipient && item.kind === request.kind);
        send({event: 'mail', message: index >= 0 ? mailbox.splice(index, 1)[0] : null});
      } else if (request.command === 'stop') shutdown();
    } catch { send({event: 'protocol-error'}); }
  });
  const shutdown = async () => {
    lines.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await store.default.close();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  process.stdin.once('end', shutdown);
} catch (error) {
  send({event: 'startup-failed', stage, kind: /^[A-Z_0-9]+$/.test(String(error.code)) ? error.code : error.name});
  process.exitCode = 1;
  if (server) server.close();
  if (store) { try { await store.default.close(); } catch {} }
}
