import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShippingZoneRules,
  parseTaxRules,
  selectCommerceRule,
  calculateConfiguredTax,
  pricingRulesHaveErrors,
  normalizeCommerceRuleText
} from '../src/commerce-rules.js';

const countries = ['Belgium', 'France'];

test('shipping rules validate money, delivery allow-list and reject duplicate selectors', () => {
  const valid = parseShippingZoneRules('Belgium | * | * | 5.00\nBelgium | Brussels | 10 | 3.50', 'EUR', countries);
  assert.equal(valid.valid, true, valid.errors.join('; '));
  assert.equal(valid.rules.length, 2);
  assert.equal(valid.rules[0].feeCents, 500);
  assert.equal(parseShippingZoneRules('Belgium | * | * | -1', 'EUR', countries).valid, false);
  assert.equal(parseShippingZoneRules('Germany | * | * | 5.00', 'EUR', countries).valid, false);
  assert.equal(parseShippingZoneRules('Belgium | * | * | 5.00\n belgium | * | * | 6.00', 'EUR', countries).valid, false);
  assert.equal(parseShippingZoneRules(Array.from({length: 251}, () => 'Belgium | * | * | 1').join('\n'), 'EUR', countries).valid, false);
});

test('tax rules support explicit zero rates and validate all input fields', () => {
  const valid = parseTaxRules('Belgium | * | * | 21 | yes\nFrance | * | * | 0 | no', countries);
  assert.equal(valid.valid, true, valid.errors.join('; '));
  assert.equal(valid.rules[0].rateBps, 2100);
  assert.equal(valid.rules[0].shippingTaxable, true);
  assert.equal(valid.rules[1].rateBps, 0);
  assert.equal(valid.rules[1].shippingTaxable, false);
  assert.equal(parseTaxRules('Belgium | * | * | 101 | no', countries).valid, false);
  assert.equal(parseTaxRules('Belgium | * | * | 20.999 | yes', countries).valid, false);
  assert.equal(parseTaxRules('Belgium | * | * | 21 | maybe', countries).valid, false);
  assert.equal(parseTaxRules('Belgium | * | * | 21 | no\nBelgium | * | * | 0 | no', countries).valid, false);
});

test('regional selector chooses the most specific country/city/postal-prefix rule', () => {
  const shipping = parseShippingZoneRules([
    'Belgium | * | * | 5.00',
    'Belgium | Brussels | * | 4.00',
    'Belgium | Brussels | 10 | 3.00',
    'Belgium | * | 1000 | 2.00'
  ].join('\n'), 'EUR', countries);
  assert.equal(shipping.valid, true, shipping.errors.join('; '));
  assert.equal(selectCommerceRule(shipping.rules, {country:'Belgium',city:'Brussels',postalCode:'1000'}).feeCents, 300);
  assert.equal(selectCommerceRule(shipping.rules, {country:'Belgium',city:'Ghent',postalCode:'1000'}).feeCents, 200);
  assert.equal(selectCommerceRule(shipping.rules, {country:'Belgium',city:'Ghent',postalCode:'9000'}).feeCents, 500);
  assert.equal(selectCommerceRule(shipping.rules, {country:'France',city:'Paris',postalCode:'75001'}), null);
});

test('tax uses integer-minor-unit rounded totals in tax-exclusive and tax-inclusive modes', () => {
  assert.equal(calculateConfiguredTax({taxableItemsCents:10000,shippingCents:0,rateBps:2100,includesTax:false,shippingTaxable:false}), 2100);
  assert.equal(calculateConfiguredTax({taxableItemsCents:10000,shippingCents:0,rateBps:2100,includesTax:true,shippingTaxable:false}), 1736);
  assert.equal(calculateConfiguredTax({taxableItemsCents:10000,shippingCents:1000,rateBps:2100,includesTax:false,shippingTaxable:true}), 2310);
  assert.equal(calculateConfiguredTax({taxableItemsCents:10000,shippingCents:1000,rateBps:2100,includesTax:false,shippingTaxable:false}), 2100);
  assert.equal(calculateConfiguredTax({taxableItemsCents:10000,shippingCents:1000,rateBps:0,includesTax:false,shippingTaxable:true}), 0);
  assert.throws(() => calculateConfiguredTax({taxableItemsCents:-1,shippingCents:0,rateBps:2100,includesTax:false,shippingTaxable:false}), /INVALID_TAX_BASE/);
  assert.throws(() => calculateConfiguredTax({taxableItemsCents:10000,shippingCents:0,rateBps:10001,includesTax:false,shippingTaxable:false}), /INVALID_TAX_RATE/);
});

test('rule normalization preserves separate lines and malformed configuration never appears valid', () => {
  assert.equal(normalizeCommerceRuleText('A | * | * | 1\r\nB | * | * | 2'), 'A | * | * | 1\nB | * | * | 2');
  assert.equal(pricingRulesHaveErrors(parseShippingZoneRules('Belgium | * | * | 1','EUR',countries), parseTaxRules('broken',countries)), true);
  assert.equal(pricingRulesHaveErrors(parseShippingZoneRules('Belgium | * | * | 1','EUR',countries), parseTaxRules('Belgium | * | * | 0 | no',countries)), false);
});
