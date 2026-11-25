export const ORDER_EMAIL_LEASE_MS = 60_000;
// Resend retains idempotency keys for 24 hours. Keep a one-hour safety margin.
export const ORDER_EMAIL_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export const ORDER_EMAIL_MAX_ATTEMPTS = 3;

export function validOrderEmailPayload(payload, recipientEmail) {
  if (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > 262144) return false;
  try {
    const value = JSON.parse(payload);
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
      ['from', 'subject', 'html', 'text'].every(key => typeof value[key] === 'string' && value[key].length > 0) &&
      Array.isArray(value.to) && value.to.length === 1 && typeof value.to[0] === 'string' &&
      value.to[0].trim().toLowerCase() === recipientEmail;
  } catch { return false; }
}
