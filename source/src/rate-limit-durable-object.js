// Shared, durable per-actor rate-limit counters for Cloudflare Workers.
// Each actor+route bucket maps to its own named Durable Object, so the counter
// is serialized across Worker isolates and regions. This is abuse throttling,
// not a billing/accounting ledger; each hashed actor+route is kept in one DO.
const MAX_REQUEST_BYTES = 1024;
const MAX_LIMIT = 100_000;
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

export class ShopEasyRateLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/consume') {
      return new Response('Not found', { status: 404 });
    }
    const declaredLength = Number(request.headers.get('content-length') || 0);
    if (declaredLength > MAX_REQUEST_BYTES) {
      return new Response('Request too large', { status: 413 });
    }

    let payload;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
        return new Response('Request too large', { status: 413 });
      }
      payload = JSON.parse(raw);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const limit = Number(payload?.limit);
    const windowMs = Number(payload?.windowMs);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT ||
        !Number.isSafeInteger(windowMs) || windowMs < 1000 || windowMs > MAX_WINDOW_MS) {
      return new Response('Invalid rate limit configuration', { status: 400 });
    }

    let needsAlarm = false;
    let alarmAt = 0;
    const result = await this.state.storage.transaction(async transaction => {
      // Calculate the window only after the transaction lock is acquired. Otherwise
      // a request that waits across a window boundary can overwrite a newer counter
      // with a stale window computed before it was serialized.
      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const previous = await transaction.get('counter');
      let count;
      if (!previous || previous.windowStart !== windowStart || previous.windowMs !== windowMs) {
        count = 0;
        needsAlarm = true;
        alarmAt = windowStart + windowMs + 1000;
      } else {
        count = previous.count;
      }
      const allowed = count < limit;
      if (allowed) {
        count += 1;
        await transaction.put('counter', { windowStart, windowMs, count });
      }
      return {
        allowed,
        remaining: Math.max(0, limit - count),
        resetAt: Math.ceil((windowStart + windowMs) / 1000)
      };
    });

    // Expire idle counters. The alarm verifies the current window before deletion
    // so an alarm racing a newer request cannot erase a live counter.
    if (needsAlarm) await this.state.storage.setAlarm(alarmAt);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  }

  async alarm() {
    const now = Date.now();
    const nextExpiry = await this.state.storage.transaction(async transaction => {
      const record = await transaction.get('counter');
      if (!record) return null;
      const expiry = record.windowStart + record.windowMs + 1000;
      if (expiry <= now) {
        await transaction.delete('counter');
        return null;
      }
      return expiry;
    });
    if (nextExpiry !== null) await this.state.storage.setAlarm(nextExpiry);
  }
}
