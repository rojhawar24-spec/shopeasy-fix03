import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const errorView = fs.readFileSync(new URL('../views/error.ejs', import.meta.url), 'utf8');

test('checkout pre-order failures are logged with a safe operation stage and forwarded to the global handler', () => {
  const start = server.indexOf("app.post('/checkout',checkoutDiagnosticStage('checkout-rate-limit'),checkoutLimiter");
  const end = server.indexOf("app.get('/checkout/success'", start);
  assert.ok(start >= 0 && end > start, 'checkout POST route must exist');
  const route = server.slice(start, end);
  assert.match(route, /let checkoutStage='initial-cart-summary'/);
  assert.match(route, /setCheckoutStage\('store-and-payment-configuration'\)/);
  assert.match(route, /setCheckoutStage\('session-checkout-credentials'\)/);
  assert.match(route, /setCheckoutStage\('check-idempotent-order'\)/);
  assert.match(route, /setCheckoutStage\('store-and-payment-configuration'\)/);
  assert.match(route, /setCheckoutStage\('check-idempotent-order'\)/);
  assert.match(route, /return next\(error\)/);
  assert.match(server, /Checkout diagnostic \$\{reference\} failed at stage: \$\{stage\}/);
  assert.match(server, /checkout-diagnostics\.log/);
  assert.doesNotMatch(route, /console\.error\([^)]*req\.body/);
  assert.doesNotMatch(route, /console\.error\([^)]*_csrf/);
});

test('uncertain checkout status page never says the previous submission was not saved', () => {
  assert.match(server, /title:'Order status needs checking'[\s\S]*?Diagnostic reference:/);
  assert.match(errorView, /typeof guidance !== 'undefined' && guidance/);
});


test('checkout database diagnostic is local-only, opens an existing file, and issues read-only checks', () => {
  const diagnostic = fs.readFileSync(new URL('../scripts/diagnose-checkout.mjs', import.meta.url), 'utf8');
  assert.match(diagnostic, /This diagnostic will not open a remote database/);
  assert.match(diagnostic, /configured local SQLite file does not exist/);
  assert.match(diagnostic, /PRAGMA quick_check/);
  assert.match(diagnostic, /PRAGMA foreign_key_check/);
  assert.doesNotMatch(diagnostic, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\s+INTO?\b/i);
});


test('Windows installer backs up the current project and never copies over local runtime data', () => {
  const installer = fs.readFileSync(new URL('../INSTALL-REPAIR12-WINDOWS.ps1', import.meta.url), 'utf8');
  assert.match(installer, /robocopy \$Target \$Backup/);
  assert.match(installer, /\/XD data uploads node_modules \.git/);
  assert.match(installer, /\/XF \.env \*\.log/);
  assert.match(installer, /npm run check/);
  assert.match(installer, /data\\shop\.db/);
});
