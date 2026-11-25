import { currencyMinorUnitFactor, isValidCurrency } from './security.js';

// Convert an amount between currencies' storage precisions only. This is NOT
// foreign-exchange conversion. Example: EUR 89.00 (8900 minor units) becomes
// IQD 89.000 (89,000 minor units). The caller keeps checkout disabled for review.
export function rescaleMinorUnitAmount(value, fromCurrency, toCurrency, { minPositive = false } = {}) {
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  if (!isValidCurrency(from) || !isValidCurrency(to)) throw new Error('INVALID_CURRENCY');
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('CURRENCY_SCALE_OVERFLOW');
  let amount;
  try { amount = typeof value === 'bigint' ? value : BigInt(String(value)); }
  catch { throw new Error('CURRENCY_SCALE_OVERFLOW'); }
  if (amount < 0n) throw new Error('CURRENCY_SCALE_OVERFLOW');
  const fromFactor = BigInt(currencyMinorUnitFactor(from));
  const toFactor = BigInt(currencyMinorUnitFactor(to));
  let scaled = (amount * toFactor + (fromFactor / 2n)) / fromFactor;
  if (minPositive && amount > 0n && scaled === 0n) scaled = 1n;
  const safe = Number(scaled);
  if (!Number.isSafeInteger(safe) || safe < 0) throw new Error('CURRENCY_SCALE_OVERFLOW');
  return safe;
}
