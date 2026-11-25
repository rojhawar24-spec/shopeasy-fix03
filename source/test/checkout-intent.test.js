import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkoutIntentMatchesOrder } from '../src/services/checkout-intent.js';

const summary = {
  items: [{ productId: 11, variantId: 3, quantity: 2, price: 2500, total: 5000 }],
  subtotalBeforeAutomaticDiscount: 5000,
  automaticDiscount: 0,
  discount: 500,
  total: 4700,
  shipping: 200,
  taxCents: 0,
  taxRateBps: 0,
  taxIncluded: false,
  shippingRuleSnapshot: 'zone-1',
  taxRuleSnapshot: 'tax-0'
};
const shipping = { name: 'Roj Tahsin', address: 'Main Street 1', city: 'Hasselt', postalCode: '3500', country: 'BE' };
const order = {
  id: 91,
  payment_provider: 'mollie',
  email: 'shopper@example.com',
  customer_phone: '+32470123456',
  shipping_name: shipping.name,
  shipping_address: shipping.address,
  shipping_city: shipping.city,
  shipping_postal_code: shipping.postalCode,
  shipping_country: shipping.country,
  customer_note: 'Call on arrival',
  currency: 'EUR',
  total_cents: 4700,
  subtotal_cents: 5000,
  automatic_discount_cents: 0,
  discount_cents: 500,
  shipping_cents: 200,
  tax_cents: 0,
  tax_rate_bps: 0,
  tax_included: 0,
  shipping_rule_snapshot: 'zone-1',
  tax_rule_snapshot: 'tax-0',
  items: [{ product_id: 11, variant_id: 3, quantity: 2, unit_price_cents: 2500, total_cents: 5000 }]
};
const intent = {
  summary,
  paymentProvider: 'mollie',
  email: 'SHOPPER@example.com',
  customerPhone: '+32470123456',
  shipping,
  customerNote: 'Call on arrival',
  currency: 'eur'
};

test('same checkout token can only resume an exactly matching stored order intent', () => {
  assert.equal(checkoutIntentMatchesOrder(order, intent), true);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, paymentProvider: 'cash_on_delivery' }), false);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, email: 'other@example.com' }), false);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, shipping: { ...shipping, address: 'Other Street 2' } }), false);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, summary: { ...summary, total: 4701 } }), false);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, summary: { ...summary, items: [{ productId: 12, variantId: 3, quantity: 2 }] } }), false);
});

test('the simultaneous duplicate-token path rechecks the full intent before returning any Mollie checkout URL', () => {
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.match(server, /const duplicateIntentMatches=checkoutIntentMatchesOrder\(duplicateOrder,/);
  assert.match(server, /if\(!duplicateIntentMatches\) return res\.status\(409\)/);
  assert.ok(server.indexOf('if(!duplicateIntentMatches)') < server.indexOf('if(duplicateOrder.payment_provider===\'mollie\'&&duplicateOrder.status===\'pending\')'));
});


test('a same-total checkout with redistributed line prices cannot reuse an existing payment', () => {
  const old = {
    ...order,
    subtotal_cents: 300,
    discount_cents: 0,
    shipping_cents: 0,
    total_cents: 300,
    items: [
      { product_id: 11, variant_id: 3, quantity: 1, unit_price_cents: 150, total_cents: 150 },
      { product_id: 12, variant_id: null, quantity: 1, unit_price_cents: 150, total_cents: 150 }
    ]
  };
  const changed = {
    ...intent,
    summary: {
      ...summary,
      subtotalBeforeAutomaticDiscount: 300,
      discount: 0,
      shipping: 0,
      total: 300,
      items: [
        { productId: 11, variantId: 3, quantity: 1, price: 100, total: 100 },
        { productId: 12, variantId: null, quantity: 1, price: 200, total: 200 }
      ]
    }
  };
  assert.equal(checkoutIntentMatchesOrder(old, changed), false);
  assert.equal(checkoutIntentMatchesOrder(old, {
    ...changed, summary: { ...changed.summary, items: [
      { productId: 11, variantId: 3, quantity: 1, price: 150, total: 150 },
      { productId: 12, variantId: null, quantity: 1, price: 150, total: 150 }
    ] }
  }), true);
});

test('checkout payment retries reject missing or malformed line price snapshots', () => {
  const malformedOrder = { ...order, items: [{ product_id: 11, variant_id: 3, quantity: 2 }] };
  assert.equal(checkoutIntentMatchesOrder(malformedOrder, intent), false);
  assert.equal(checkoutIntentMatchesOrder({ ...order, items: [{ ...order.items[0], unit_price_cents: null, total_cents: 0 }] }, intent), false);
  assert.equal(checkoutIntentMatchesOrder({ ...order, items: [{ ...order.items[0], unit_price_cents: ['2500'] }] }, intent), false);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, summary: { ...summary, items: [
    { productId: 11, variantId: 3, quantity: 2, price: 2500, total: 4900 }
  ] } }), false);
  assert.equal(checkoutIntentMatchesOrder(order, { ...intent, summary: { ...summary, items: [
    summary.items[0], summary.items[0]
  ] } }), false);
});
