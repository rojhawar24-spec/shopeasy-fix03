import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

// Without an explicitly configured key, identifiers remain pseudonymous only
// within this process lifetime. Configure SECURITY_LOG_HMAC_KEY to correlate
// them across restarts; the key itself is never emitted.
const processLocalHmacKey = randomBytes(32);
const sourceFailureWindows = new Map();
const MAX_TRACKED_SOURCES = 2000;
const ALLOWED_FAILURE_REASONS = new Set([
  'invalid_credentials',
  'authentication_unavailable',
  'mfa_challenge_creation_failed',
  'session_creation_failed'
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function hmacKey() {
  const configured = String(process.env.SECURITY_LOG_HMAC_KEY || '').trim();
  if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  return processLocalHmacKey;
}

function identifierHash(email, userId) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const identity = normalizedEmail
    ? `email:${normalizedEmail}`
    : (Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? `user:${Number(userId)}` : '');
  if (!identity) return undefined;
  return createHmac('sha256', hmacKey()).update(identity).digest('hex').slice(0, 24);
}

export function privacyLimitedSourcePrefix(value) {
  let ip = String(value || '').trim().replace(/^::ffff:/i, '').split('%')[0];
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (version === 6) {
    ip = ip.toLowerCase();
    const halves = ip.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
    const fill = Math.max(0, 8 - left.length - right.length);
    const groups = [...left, ...Array(fill).fill('0'), ...right];
    const firstFour = groups.slice(0, 4).map(group => (Number.parseInt(group || '0', 16) || 0).toString(16));
    return `${firstFour.join(':')}::/64`;
  }
  return 'unknown';
}

function pruneExpiredWindows(state, now, windowMs) {
  for (const [key, bucket] of state) {
    if (now - bucket.startedAt >= windowMs) state.delete(key);
  }
  while (state.size > MAX_TRACKED_SOURCES) {
    const oldestKey = state.keys().next().value;
    if (oldestKey === undefined) break;
    state.delete(oldestKey);
  }
}

/** Write a credential/session login failure without storing submitted secrets or full IP addresses. */
export function recordLoginFailure({
  email,
  userId,
  ip,
  requestId,
  reason,
  logger = console,
  now = Date.now(),
  threshold: thresholdOverride,
  windowMs: windowOverride,
  state = sourceFailureWindows
} = {}) {
  const timestampMs = Number.isFinite(now) ? now : Date.now();
  const sourcePrefix = privacyLimitedSourcePrefix(ip);
  const safeRequestId = /^[0-9a-f-]{36}$/i.test(String(requestId || ''))
    ? String(requestId)
    : randomUUID();
  const safeReason = ALLOWED_FAILURE_REASONS.has(reason) ? reason : 'invalid_credentials';
  const hashedIdentity = identifierHash(email, userId);
  const event = {
    event: 'auth.login.failure',
    timestamp: new Date(timestampMs).toISOString(),
    requestId: safeRequestId,
    reason: safeReason,
    sourcePrefix,
    ...(hashedIdentity ? { identifierHash: hashedIdentity } : {})
  };
  logger.warn(JSON.stringify(event));

  // The existing login limiter accepts at most 10 requests per 15 minutes,
  // so keep the alert threshold reachable even if configuration is oversized.
  const threshold = boundedInteger(
    thresholdOverride ?? process.env.LOGIN_FAILURE_ALERT_THRESHOLD,
    5,
    1,
    10
  );
  const windowMs = boundedInteger(
    windowOverride ?? process.env.LOGIN_FAILURE_ALERT_WINDOW_MS,
    15 * 60 * 1000,
    60 * 1000,
    24 * 60 * 60 * 1000
  );

  pruneExpiredWindows(state, timestampMs, windowMs);
  if (sourcePrefix === 'unknown') return event;

  let bucket = state.get(sourcePrefix);
  if (!bucket || timestampMs - bucket.startedAt >= windowMs) {
    bucket = { startedAt: timestampMs, count: 0, alerted: false };
    state.set(sourcePrefix, bucket);
  }
  bucket.count += 1;
  if (bucket.count >= threshold && !bucket.alerted) {
    bucket.alerted = true;
    logger.warn(JSON.stringify({
      event: 'auth.login.failure.threshold',
      timestamp: new Date(timestampMs).toISOString(),
      requestId: safeRequestId,
      sourcePrefix,
      count: bucket.count,
      threshold,
      windowMs
    }));
  }
  return event;
}
