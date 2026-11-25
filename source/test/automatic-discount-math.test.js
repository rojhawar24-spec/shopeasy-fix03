import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductDiscountPercent, applyPercentDiscountCents, safeMinorUnitsAdd, safeMinorUnitsMultiply, safePercentOfMinorUnits } from '../src/pricing.js';

test('per-product automatic discount examples are correct', () => {
  assert.equal(applyPercentDiscountCents(10000, 20), 8000);
  assert.equal(applyPercentDiscountCents(999, 10), 899);
  assert.equal(applyPercentDiscountCents(1, 90), 1);
  assert.equal(applyPercentDiscountCents(10000, 0), 10000);
});

test('invalid product discount values are safely normalized', () => {
  assert.equal(normalizeProductDiscountPercent(-1), 0);
  assert.equal(normalizeProductDiscountPercent(91), 0);
  assert.equal(normalizeProductDiscountPercent(10.5), 0);
  assert.equal(normalizeProductDiscountPercent('20.5'), 0);
  assert.equal(normalizeProductDiscountPercent(20), 20);
});

 test('product discount never produces a zero or negative price', () => {
  assert.equal(applyPercentDiscountCents(0, 90), 0);
  assert.equal(applyPercentDiscountCents(1, 90), 1);
  assert.equal(applyPercentDiscountCents(999, 90), 99);
});


test('large safe monetary values use exact integer percentage arithmetic', () => {
  const base = Number.MAX_SAFE_INTEGER;
  assert.equal(safePercentOfMinorUnits(base, 50), 4503599627370495);
  assert.equal(applyPercentDiscountCents(base, 50), 4503599627370495);
});

test('minor-unit multiplication and addition reject unsafe totals', () => {
  assert.equal(safeMinorUnitsMultiply(999999, 9), 8999991);
  assert.equal(safeMinorUnitsAdd(1000, 2500), 3500);
  assert.throws(() => safeMinorUnitsMultiply(Math.floor(Number.MAX_SAFE_INTEGER / 2), 3), /MONEY_OVERFLOW/);
  assert.throws(() => safeMinorUnitsAdd(Number.MAX_SAFE_INTEGER, 1), /MONEY_OVERFLOW/);
});

test('percentage calculations are bounded to integer percentages', () => {
  assert.equal(safePercentOfMinorUnits(1000, 0), 0);
  assert.equal(safePercentOfMinorUnits(1000, 100), 1000);
  assert.throws(() => safePercentOfMinorUnits(1000, 101), /INVALID_PERCENT/);
});
