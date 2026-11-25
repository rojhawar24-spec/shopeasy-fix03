import { validId } from './security.js';

// HTML form bodies must be validated before numeric coercion. Number(['12']),
// Number('1e1') and Number('') otherwise turn malformed input into valid IDs.
export function parseCartProductId(value) {
  return validId(value) ? Number(value) : null;
}

// The existing forms use an empty value (or '0') for a product without options.
// NaN deliberately distinguishes an invalid supplied option from no option.
export function parseCartVariantId(value) {
  if (value === undefined || value === null || value === '' || value === '0' || value === 0) return null;
  return validId(value) ? Number(value) : Number.NaN;
}

// Parse only plain non-negative integers. Route handlers enforce the 1–99
// purchase limit or allow zero for removal, preserving specific error messages.
export function parseCartQuantity(value) {
  if (!(typeof value === 'string' && /^\d{1,10}$/.test(value)) &&
      !(typeof value === 'number' && Number.isSafeInteger(value))) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}
