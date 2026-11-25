/**
 * Calculates the proportional maximum refund for one requested order-line quantity.
 * The caller must separately enforce the total refunded amount for the order item
 * and the whole order. BigInt keeps intermediate arithmetic exact for large totals.
 */
export function maxRefundForRequestCents({ itemTotalCents, purchasedQuantity, requestedQuantity }) {
  const total = Number(itemTotalCents);
  const purchased = Number(purchasedQuantity);
  const requested = Number(requestedQuantity);
  if (!Number.isSafeInteger(total) || total < 0) return 0;
  if (!Number.isSafeInteger(purchased) || purchased < 1) return 0;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > purchased) return 0;
  const numerator = BigInt(total) * BigInt(requested);
  const denominator = BigInt(purchased);
  const roundedUp = (numerator + denominator - 1n) / denominator;
  return roundedUp <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(roundedUp) : 0;
}


/**
 * Allocate an order-level coupon discount across its item lines in minor units.
 * Largest-remainder allocation makes the allocated shares add up to the exact
 * order discount, with stable item-ID tie-breaking. Invalid inputs fail closed.
 * Input totals are the line totals after product/automatic discounts and before
 * the order-level coupon discount. Shipping/tax are deliberately not refundable
 * through this per-item refund path.
 */
export function allocateCouponDiscountAcrossItems({ items, discountCents }) {
  if (!Array.isArray(items) || !Number.isSafeInteger(discountCents) || discountCents < 0) return null;
  const normalized = [];
  const seen = new Set();
  let subtotal = 0;
  for (const item of items) {
    const id = Number(item?.id);
    const totalCents = Number(item?.totalCents);
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id) || !Number.isSafeInteger(totalCents) || totalCents < 0) return null;
    seen.add(id);
    if (!Number.isSafeInteger(subtotal + totalCents)) return null;
    subtotal += totalCents;
    normalized.push({ id, totalCents });
  }
  if (!normalized.length || discountCents > subtotal || (subtotal === 0 && discountCents > 0)) return null;
  if (subtotal === 0) return discountCents === 0 ? normalized.map(item => ({ ...item, couponShareCents: 0, netCents: 0 })) : null;

  const denominator = BigInt(subtotal);
  let allocated = 0;
  const shares = normalized.map(item => {
    const numerator = BigInt(discountCents) * BigInt(item.totalCents);
    const share = Number(numerator / denominator);
    const remainder = numerator % denominator;
    allocated += share;
    return { ...item, couponShareCents: share, remainder };
  });
  let remainderCents = discountCents - allocated;
  const byRemainder = [...shares].sort((a, b) => a.remainder === b.remainder ? a.id - b.id : (a.remainder > b.remainder ? -1 : 1));
  if (remainderCents > byRemainder.length) return null;
  for (let index = 0; index < remainderCents; index += 1) byRemainder[index].couponShareCents += 1;
  return shares.map(({ id, totalCents, couponShareCents }) => ({
    id, totalCents, couponShareCents, netCents: totalCents - couponShareCents
  })).sort((a, b) => a.id - b.id);
}


/**
 * Calculate the refund amount that is still available for this request after
 * already-recorded item and order refunds. Any malformed ledger value fails closed.
 */
export function availableRefundMaximumCents({ requestMaximumCents, itemNetTotalCents, itemRefundedCents=0, orderTotalCents, orderRefundedCents=0, tenderRefundedCents=0 }={}) {
  const values = [requestMaximumCents, itemNetTotalCents, itemRefundedCents, orderTotalCents, orderRefundedCents, tenderRefundedCents].map(Number);
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) return 0;
  const [requestMaximum, itemNetTotal, itemRefunded, orderTotal, orderRefunded, tenderRefunded] = values;
  return Math.min(requestMaximum, Math.max(0, itemNetTotal - itemRefunded), Math.max(0, orderTotal - orderRefunded - tenderRefunded));
}
