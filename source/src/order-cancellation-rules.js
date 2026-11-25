// Customer-facing cancellation policy. Provider callbacks and Manager decisions
// retain their additional identity/payment checks in the transactional writer.
export function canCancelOpenOrder(order) {
  return Boolean(order && order.status === 'pending' && order.payment_provider === 'cash_on_delivery');
}

export function hasPendingCancellationRequest(order) {
  return Boolean(order && (order.cancel_request_status === 'pending' ||
    (order.cancellation_requested_at != null && order.cancellation_request_decision === 'pending')));
}

export function canRequestOrderCancellation(order) {
  if (!order || hasPendingCancellationRequest(order)) return false;
  const eligible = (order.status === 'processing' && order.payment_provider === 'cash_on_delivery') ||
    (order.status === 'pending' && order.payment_provider === 'bank_transfer');
  return eligible && (order.cancellation_requested_at == null || order.cancellation_request_decision === 'rejected');
}
