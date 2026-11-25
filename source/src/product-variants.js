import { cleanText } from './security.js';
import { parseCartQuantity } from './cart-form-inputs.js';

/**
 * Resolve a storefront option from an untrusted query parameter.
 * Sold-out variants remain visible in the catalog, but must never be preselected
 * as a purchasable option. The cart/order APIs still revalidate stock server-side.
 */
export function selectedAvailableVariantId(variants, candidate) {
  if (!Array.isArray(variants)) return null;
  // Express query values may be arrays when a parameter is repeated. Reject
  // non-scalar values instead of letting Number(['12']) select variant 12.
  if (typeof candidate !== 'string' && typeof candidate !== 'number') return null;
  const rawId = String(candidate).trim();
  if (!/^[1-9]\d*$/.test(rawId)) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id)) return null;

  const selected = variants.find((variant) => Number(variant?.id) === id);
  if (!selected) return null;

  const stock = Number(selected.available_stock);
  if (!Number.isSafeInteger(stock) || stock <= 0) return null;

  return id;
}


/** Backward-compatible Size | Stock rows must obey the same inventory rules
 * as the modern matrix editor. Never use Number() on a submitted quantity:
 * exponential notation, blank values and repeated form fields are invalid. */
export function parseLegacyVariantRows(value) {
  if (typeof value !== 'string') throw new Error('VARIANT_VALIDATION');
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 50) throw new Error('VARIANT_VALIDATION');
  return lines.map(line => {
    const parts = line.split('|');
    if (parts.length !== 2) throw new Error('VARIANT_VALIDATION');
    const rawValue = parts[0].trim();
    const valueText = cleanText(rawValue, 80);
    const stock = parseCartQuantity(parts[1].trim());
    if (!valueText || rawValue.length > 80 || stock === null || stock > 100000000)
      throw new Error('VARIANT_VALIDATION');
    return { value: valueText, value2: '', stock, sku: '', imageUrl: '' };
  });
}
