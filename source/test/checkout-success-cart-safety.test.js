import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('order-success GET is read-only and cannot clear a later cart', () => {
  const server = read('src/server.js');
  const start = server.indexOf("app.get('/checkout/success'");
  const end = server.indexOf("app.post('/checkout/success/cancel'", start);
  assert.ok(start >= 0 && end > start, 'checkout success route should be present');
  const successRoute = server.slice(start, end);
  assert.match(successRoute, /intentionally read-only/);
  assert.doesNotMatch(successRoute, /saveSessionCart|saveSessionCoupon|req\.session\.cart\s*=|req\.session\.coupon\s*=/,
    'a bookmarked GET success page must not mutate the active cart or coupon');
});

test('cart cleanup happens after order commit using an atomic persisted-cart snapshot check', () => {
  const server = read('src/server.js');
  const db = read('src/db.js');
  assert.match(server, /clearCheckoutCartIfUnchanged\(req, created\.items\|\|\[\]\)/,
    'a successful order POST should clear the just-purchased cart');
  assert.match(server, /cartLinesFingerprint\(cartSnapshot\).*cartLinesFingerprint\(purchasedItems\)/,
    'do not clear when the checkout items are not the same cart');
  assert.match(db, /export async function clearSessionCartAfterOrder\(sessionId, expectedCart, expectedCoupon = null, expectedRevision = null\)/);
  assert.match(db, /cart_revision INTEGER NOT NULL DEFAULT 0 CHECK\(cart_revision >= 0\)/);
  assert.match(db, /UPDATE sessions SET cart_json=\?,\s*cart_revision=cart_revision\+1/);
  assert.match(db, /UPDATE sessions SET coupon_code=\?,\s*cart_revision=cart_revision\+1/);
  assert.match(db, /WHERE id=\? AND cart_revision=\?/);
  assert.match(db, /Number\(session\.cart_revision\) !== expectedRevision/);
  assert.match(server, /cartRevisionSnapshot = Number\(req\.session\?\.cart_revision\)/);
  assert.match(db, /db\.transaction\('write'\)/);
  assert.match(db, /JSON\.stringify\(sessionCartFingerprint\(persistedCart\)\) !== expectedCartSignature/);
  assert.match(db, /normalizeCoupon\(session\.coupon_code\) !== couponSnapshot/);
  assert.match(db, /UPDATE sessions SET cart_json='\[\]',coupon_code=NULL/);
});

test('idempotent checkout retry compares full intent and safely reuses existing orders', () => {
  const server = read('src/server.js');
  const start = server.indexOf('if(prior&&ownsPrior){');
  const end = server.indexOf('  if(summary.pricingRulesActive&&!resumedExistingOrder)', start);
  assert.ok(start >= 0 && end > start);
  const retry = server.slice(start, end);
  assert.match(retry, /const sameIntent=/);
  assert.match(retry, /checkoutIntentMatchesOrder\(existing,\{summary,paymentProvider:selectedPaymentProvider,email,customerPhone,shipping,customerNote,currency:intentCurrency\}\)/);
  const intentHelper = read('src/services/checkout-intent.js');
  assert.match(intentHelper, /existing\.payment_provider === paymentProvider/);
  assert.match(intentHelper, /Number\(existing\.total_cents\) === Number\(summary\.total\)/);
  assert.match(retry, /clearCheckoutCartIfUnchanged\(req,existing\.items\|\|\[\]\)/);
  assert.match(retry, /isTrustedMollieCheckoutUrl\(existing\.payment_url\)/);
  assert.match(retry, /orderAge>50\*60\*1000/);
});
