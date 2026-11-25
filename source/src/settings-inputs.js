import { cleanText, isValidCurrency, normalizeDeliveryCountries } from './security.js';

// Settings can be submitted by an older tab, a disabled field, or a form that
// intentionally omits a field. Missing configuration should not make an
// otherwise-valid draft unsaveable; preserve the persisted value for omitted
// fields. A submitted but malformed value remains invalid and is never silently
// accepted as a new configuration.
export function resolveSettingsCurrency(body, storedCurrency, defaultCurrency = 'EUR') {
  const source = body && typeof body === 'object' ? body : {};
  if (!Object.prototype.hasOwnProperty.call(source, 'currency')) {
    const fallback = String(storedCurrency || defaultCurrency).toUpperCase();
    return { value: fallback, valid: isValidCurrency(fallback), supplied: false };
  }
  if (typeof source.currency !== 'string') return { value: '', valid: false, supplied: true };
  const value = cleanText(source.currency, 3).toUpperCase();
  if (!value) {
    const fallback = String(storedCurrency || defaultCurrency).toUpperCase();
    return { value: fallback, valid: isValidCurrency(fallback), supplied: true, blank: true };
  }
  return { value, valid: isValidCurrency(value), supplied: true };
}

export function resolveDeliveryCountries(body, storedValue = '') {
  const source = body && typeof body === 'object' ? body : {};
  const supplied = Object.prototype.hasOwnProperty.call(source, 'deliveryCountries');
  if (supplied && typeof source.deliveryCountries !== 'string') {
    return { value: '', normalized: [], valid: false, supplied: true };
  }
  const value = supplied ? cleanText(source.deliveryCountries, 5000) : cleanText(storedValue, 5000);
  // An empty list is a valid draft. It keeps checkout closed in the launch gate,
  // but must not prevent a manager saving other business details and policy drafts.
  const normalized = normalizeDeliveryCountries(value);
  const valid = !value || (Array.isArray(normalized) && normalized.length > 0);
  return { value, normalized: valid && Array.isArray(normalized) ? normalized : [], valid, supplied };
}

export function readSettingsStringField(body, key, storedValue, maxLength) {
  const source = body && typeof body === 'object' ? body : {};
  if (!Object.prototype.hasOwnProperty.call(source, key)) {
    return { value: cleanText(storedValue, maxLength), valid: true, supplied: false };
  }
  if (typeof source[key] !== 'string') return { value: '', valid: false, supplied: true };
  return { value: cleanText(source[key], maxLength), valid: true, supplied: true };
}

// A coupon has currency-denominated amounts when its discount is a fixed amount
// or its minimum basket threshold is denominated in the store currency. Percentage-
// only coupons with a zero minimum need no amount rescale. Keep this predicate
// centralized so the settings UI and transaction stay consistent.
export const CURRENCY_SENSITIVE_COUPON_WHERE = "type = 'fixed' OR min_subtotal_cents > 0";

export function isCurrencySensitiveCoupon(coupon) {
  const type = String(coupon?.type ?? '');
  const minimum = Number(coupon?.min_subtotal_cents ?? coupon?.minSubtotalCents ?? 0);
  return type === 'fixed' || (Number.isFinite(minimum) && minimum > 0);
}
