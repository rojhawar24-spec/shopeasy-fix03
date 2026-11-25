/**
 * Compare a previously persisted order with the immutable checkout intent.
 * Used both for the ordinary retry path and when a unique-token race is caught.
 * A token match alone is never enough to redirect the customer to a payment page.
 */
export function checkoutIntentMatchesOrder(existing, {
  summary,
  paymentProvider,
  email,
  customerPhone,
  shipping,
  customerNote,
  currency
} = {}) {
  if (!existing || !summary || !Array.isArray(summary.items) || !Array.isArray(existing.items) || !shipping) return false;

  // A matching grand total does not prove that the individual items still
  // have their recorded prices. Two line prices can change in opposite directions
  // while the order total stays identical. Never resume a payment for that altered
  // intent, even when its client token, quantities and shipping still match.
  const normalizeLines = (lines, fromOrder) => {
    const nonNegativeInteger = value => {
      // Explicitly reject null, arrays and scientific notation; Number(null)
      // would otherwise turn a missing persisted price into zero.
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
      if (typeof value === 'string' && /^\d{1,16}$/.test(value)) {
        const number = Number(value);
        return Number.isSafeInteger(number) ? number : Number.NaN;
      }
      return Number.NaN;
    };
    const normalized = [];
    const seen = new Set();
    for (const item of lines) {
      const productId = nonNegativeInteger(fromOrder ? item?.product_id : item?.productId);
      const rawVariant = fromOrder ? item?.variant_id : item?.variantId;
      const variantId = rawVariant == null ? 0 : nonNegativeInteger(rawVariant);
      const quantity = nonNegativeInteger(item?.quantity);
      const unit = nonNegativeInteger(fromOrder ? item?.unit_price_cents : item?.price);
      const lineTotal = nonNegativeInteger(fromOrder ? item?.total_cents : item?.total);
      if (![productId, variantId, quantity, unit, lineTotal].every(Number.isSafeInteger) ||
          productId < 1 || variantId < 0 || quantity < 1 || unit < 0 || lineTotal < 0 ||
          BigInt(unit) * BigInt(quantity) !== BigInt(lineTotal)) return null;
      const key = `${productId}:${variantId}`;
      if (seen.has(key)) return null;
      seen.add(key);
      normalized.push(`${key}:${quantity}:${unit}:${lineTotal}`);
    }
    return normalized.sort();
  };
  const desired = normalizeLines(summary.items, false);
  const recorded = normalizeLines(existing.items, true);
  const sameItems = desired !== null && recorded !== null &&
    desired.length === recorded.length && desired.every((value, index) => value === recorded[index]);

  return sameItems &&
    existing.payment_provider === paymentProvider &&
    String(existing.email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase() &&
    String(existing.customer_phone || '') === String(customerPhone || '') &&
    String(existing.shipping_name || '') === String(shipping.name || '') &&
    String(existing.shipping_address || '') === String(shipping.address || '') &&
    String(existing.shipping_city || '') === String(shipping.city || '') &&
    String(existing.shipping_postal_code || '') === String(shipping.postalCode || '') &&
    String(existing.shipping_country || '') === String(shipping.country || '') &&
    String(existing.customer_note || '') === String(customerNote || '') &&
    String(existing.currency || '').toUpperCase() === String(currency || '').toUpperCase() &&
    Number(existing.total_cents) === Number(summary.total) &&
    Number(existing.subtotal_cents) === Number(summary.subtotalBeforeAutomaticDiscount) &&
    Number(existing.automatic_discount_cents) === Number(summary.automaticDiscount) &&
    Number(existing.bundle_discount_cents||0) === Number(summary.bundleDiscount||0) &&
    Number(existing.discount_cents) === Number(summary.discount) &&
    Number(existing.shipping_cents) === Number(summary.shipping) &&
    Number(existing.tax_cents) === Number(summary.taxCents) &&
    (existing.tax_rate_bps == null ? null : Number(existing.tax_rate_bps)) === (summary.taxRateBps == null ? null : Number(summary.taxRateBps)) &&
    Boolean(Number(existing.tax_included)) === Boolean(summary.taxIncluded) &&
    String(existing.shipping_rule_snapshot || '') === String(summary.shippingRuleSnapshot || '') &&
    String(existing.tax_rule_snapshot || '') === String(summary.taxRuleSnapshot || '');
}
