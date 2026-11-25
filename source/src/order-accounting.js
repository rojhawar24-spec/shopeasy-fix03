import { allocateCouponDiscountAcrossItems } from './order-return-rules.js';
import { calculateConfiguredTax } from './commerce-rules.js';

function amount(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('ORDER_ACCOUNTING_INVALID');
  return result;
}

export function addAccountingAmounts(left, right) {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw new Error('ORDER_ACCOUNTING_INVALID');
  const sum = BigInt(left) + BigInt(right);
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) || sum < -BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MONEY_OVERFLOW');
  return Number(sum);
}

// The tax snapshot is the tax already recorded for this sale. Allocate it rather
// than independently rounding each line, so product + shipping tax remains exact.
function productTax(order, productNetCents) {
  const tax = amount(order.tax_cents ?? 0);
  if (order.product_tax_cents != null) {
    const stored = amount(order.product_tax_cents);
    if (stored > tax || stored > productNetCents) throw new Error('ORDER_ACCOUNTING_INVALID');
    return stored;
  }
  if (tax === 0) return 0;
  const shipping = amount(order.shipping_cents ?? 0);
  const included = Number(order.tax_included) === 1;
  const match = String(order.tax_rule_snapshot || '').match(/shipping taxable:\s*(yes|no)\s*$/i);
  let taxableShipping;
  if (match) taxableShipping = match[1].toLowerCase() === 'yes';
  else if (shipping === 0) taxableShipping = false;
  else {
    // Legacy/minimized records may lack the text snapshot. Infer only when the
    // retained rate and total prove one of the supported shipping-tax policies.
    const rate = amount(order.tax_rate_bps);
    const options = { taxableItemsCents: productNetCents, shippingCents: shipping, rateBps: rate, includesTax: included };
    if (calculateConfiguredTax({ ...options, shippingTaxable: false }) === tax) taxableShipping = false;
    else if (calculateConfiguredTax({ ...options, shippingTaxable: true }) === tax) taxableShipping = true;
    else throw new Error('ORDER_ACCOUNTING_TAX_UNAVAILABLE');
  }
  if (!taxableShipping) {
    if (tax > productNetCents) throw new Error('ORDER_ACCOUNTING_INVALID');
    return tax;
  }
  const shares = allocateCouponDiscountAcrossItems({ items: [{ id: 1, totalCents: productNetCents }, { id: 2, totalCents: shipping }], discountCents: tax });
  if (!shares) throw new Error('ORDER_ACCOUNTING_INVALID');
  return shares[0].couponShareCents;
}

/** Completed-sale product revenue/profit, excluding shipping and tax.
 * Product/automatic discounts are already in line totals. Coupon + bundle shares
 * use the same exact largest-remainder policy as the refund ceiling. Refunds,
 * chargebacks and tender credits remain separate ledgers; this is sale profit.
 * Preserve the dashboard's whole-order exclusion for unknown historical costs.
 */
export function allocateOrderAccounting(order, items) {
  const discount = addAccountingAmounts(amount(order.discount_cents ?? 0), amount(order.bundle_discount_cents ?? 0));
  const discounted = allocateCouponDiscountAcrossItems({ items: items.map(item => ({ id: Number(item.id), totalCents: Number(item.total_cents) })), discountCents: discount });
  if (!discounted) throw new Error('ORDER_ACCOUNTING_INVALID');
  const productNet = discounted.reduce((sum, line) => addAccountingAmounts(sum, line.netCents), 0);
  const productTaxCents = productTax(order, productNet);
  const taxExclusive = allocateCouponDiscountAcrossItems({ items: discounted.map(line => ({ id: line.id, totalCents: line.netCents })), discountCents: Number(order.tax_included) === 1 ? productTaxCents : 0 });
  if (!taxExclusive) throw new Error('ORDER_ACCOUNTING_INVALID');
  const source = new Map(items.map(item => [Number(item.id), item]));
  let missingCost = false;
  const lines = taxExclusive.map(line => {
    const item = source.get(line.id), quantity = amount(item.quantity);
    if (quantity < 1) throw new Error('ORDER_ACCOUNTING_INVALID');
    let costCents = null;
    if (item.unit_cost_cents != null) {
      const cost = BigInt(amount(item.unit_cost_cents)) * BigInt(quantity);
      if (cost > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MONEY_OVERFLOW');
      costCents = Number(cost);
    } else missingCost = true;
    return { id: line.id, productId: item.product_id == null ? null : Number(item.product_id), quantity, netRevenueCents: line.netCents, costCents, grossProfitCents: costCents == null ? null : addAccountingAmounts(line.netCents, -costCents) };
  });
  return { lines, productTaxCents, missingCost };
}
