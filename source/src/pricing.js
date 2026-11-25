const MAX_PRODUCT_DISCOUNT_PERCENT = 90;
const MAX_SAFE_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

function assertSafeMinorUnits(value, code = 'MONEY_OVERFLOW') {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return BigInt(value);
}

export function safeMinorUnitsAdd(left, right) {
  const result = assertSafeMinorUnits(left) + assertSafeMinorUnits(right);
  if (result > MAX_SAFE_MINOR_UNITS) throw new Error('MONEY_OVERFLOW');
  return Number(result);
}

export function safeMinorUnitsMultiply(left, right) {
  const result = assertSafeMinorUnits(left) * assertSafeMinorUnits(right);
  if (result > MAX_SAFE_MINOR_UNITS) throw new Error('MONEY_OVERFLOW');
  return Number(result);
}

export function safePercentOfMinorUnits(baseMinorUnits, percent) {
  const base = assertSafeMinorUnits(baseMinorUnits);
  const pct = Number(percent);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw new Error('INVALID_PERCENT');
  const result = (base * BigInt(pct)) / 100n;
  if (result > MAX_SAFE_MINOR_UNITS) throw new Error('MONEY_OVERFLOW');
  return Number(result);
}

export function normalizeProductDiscountPercent(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PRODUCT_DISCOUNT_PERCENT ? n : 0;
}

export function applyPercentDiscountCents(baseCents, percent) {
  const base = Number(baseCents);
  const pct = normalizeProductDiscountPercent(percent);
  if (!Number.isSafeInteger(base) || base < 0 || pct <= 0 || base === 0) return base;
  const discounted = (BigInt(base) * BigInt(100 - pct)) / 100n;
  if (discounted > MAX_SAFE_MINOR_UNITS) throw new Error('MONEY_OVERFLOW');
  return Math.max(1, Number(discounted));
}

// Purchase cost is required by the manager form. Never coerce missing/invalid
// cost data to zero, because that would overstate product gross profit.
export function requirePurchaseCostCents(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error('COST_REQUIRED');
  }
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('COST_REQUIRED');
  return cents;
}
