import { cleanText, currencyMinorUnitDigits, currencyMinorUnitFactor } from './security.js';
import { DEFAULT_STORE_CURRENCY } from './store-config.js';

/**
 * Parse public storefront filters once so product queries, result counts and
 * pagination use exactly the same validated values. Invalid ranges fail closed:
 * neither half of a broken price range is applied.
 */
export function readShopFilters(query = {}, currency = DEFAULT_STORE_CURRENCY) {
  const source = query && typeof query === 'object' && !Array.isArray(query) ? query : {};
  // Duplicate query parameters arrive as arrays. Never convert them to a
  // comma-separated string: ['1','25'] would be mistaken for price 1.25.
  const hasInvalidPriceType = key => Object.hasOwn(source, key) &&
    source[key] !== null && typeof source[key] !== 'string';
  const digits = currencyMinorUnitDigits(currency || DEFAULT_STORE_CURRENCY);
  const factor = currencyMinorUnitFactor(currency || DEFAULT_STORE_CURRENCY);
  const parseAmount = value => {
    const raw = cleanText(value, 24).replace(',', '.');
    if (!raw) return null;
    const pattern = digits === 0 ? /^\d{1,9}$/ : new RegExp(`^\\d{1,9}(?:\\.\\d{1,${digits}})?$`);
    if (!pattern.test(raw)) return null;
    const [whole, fraction = ''] = raw.split('.');
    if (Number(whole) > 100000000) return null;
    // Exact integer arithmetic: never silently round a price filter to a
    // different monetary threshold (e.g. EUR 0.009 -> EUR 0.01).
    const minor = Number(whole) * factor + Number(fraction.padEnd(digits, '0') || '0');
    return Number.isSafeInteger(minor) ? minor : null;
  };

  const minPrice = typeof source.minPrice === 'string' ? cleanText(source.minPrice, 24).replace(',', '.') : '';
  const maxPrice = typeof source.maxPrice === 'string' ? cleanText(source.maxPrice, 24).replace(',', '.') : '';
  const minPriceCents = parseAmount(minPrice);
  const maxPriceCents = parseAmount(maxPrice);
  const minPriceInvalid = Boolean(minPrice) && minPriceCents === null;
  const maxPriceInvalid = Boolean(maxPrice) && maxPriceCents === null;
  const priceRangeInvalid = minPriceCents !== null && maxPriceCents !== null && maxPriceCents < minPriceCents;
  const priceFilterInvalid = hasInvalidPriceType('minPrice') || hasInvalidPriceType('maxPrice') ||
    minPriceInvalid || maxPriceInvalid || priceRangeInvalid;

  return {
    minPrice,
    maxPrice,
    minPriceCents: priceFilterInvalid ? null : minPriceCents,
    maxPriceCents: priceFilterInvalid ? null : maxPriceCents,
    priceRangeInvalid: priceFilterInvalid,
    inStockOnly: source.stock === '1'
  };
}
