import crypto from 'node:crypto';

// PBKDF2 via Web Crypto avoids synchronous CPU-heavy scrypt on edge runtimes.
// Keep the iteration count and format versioned; never lower stored iteration counts.
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH_BYTES = 32;
export const DUMMY_PASSWORD_HASH = 'pbkdf2$600000$sha256$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const encoder = new TextEncoder();

function constantTimeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function pbkdf2Hash(password, salt, iterations) {
  const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, PBKDF2_HASH_BYTES * 8);
  return Buffer.from(bits);
}

export async function hashPassword(password) {
  const value = String(password ?? '');
  if (value.length < 8 || value.length > 200) throw new Error('Password must contain 8–200 characters.');
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2Hash(value, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$sha256$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function verifyLegacyScryptOnNode(password, stored) {
  // Compatibility for local Node deployments only. Synchronous scrypt is intentionally
  // disabled on Workers Free because expensive CPU can exceed its 10 ms budget.
  if (process.env.CLOUDFLARE_WORKER === '1') return false;
  try {
    const [algo, n, r, p, saltB64, hashB64] = String(stored || '').split('$');
    const N = Number(n), R = Number(r), P = Number(p);
    if (algo !== 'scrypt' || ![16384, 32768].includes(N) || R !== 8 || P !== 1 || !saltB64 || !hashB64) return false;
    const derived = crypto.scryptSync(String(password || ''), Buffer.from(saltB64, 'base64url'), 64, { N, r: R, p: P });
    const expected = Buffer.from(hashB64, 'base64url');
    return constantTimeEqual(derived, expected);
  } catch { return false; }
}

export async function verifyPassword(password, stored) {
  const value = String(password ?? '');
  const encoded = String(stored || '');
  if (encoded.startsWith('scrypt$')) {
    if (process.env.CLOUDFLARE_WORKER === '1') {
      // Equalize work for legacy hashes rather than leaking account/hash state via timing.
      const dummySalt = Buffer.from('0123456789abcdef');
      await pbkdf2Hash(value, dummySalt, PBKDF2_ITERATIONS);
      return false;
    }
    return verifyLegacyScryptOnNode(value, encoded);
  }
  try {
    const [algo, iterationText, digest, saltB64, hashB64] = encoded.split('$');
    const iterations = Number(iterationText);
    const salt = Buffer.from(saltB64 || '', 'base64url');
    const expected = Buffer.from(hashB64 || '', 'base64url');
    if (algo !== 'pbkdf2' || digest !== 'sha256' || !Number.isInteger(iterations) || iterations < 600_000 || iterations > 1_000_000 || salt.length !== 16 || expected.length !== PBKDF2_HASH_BYTES) return false;
    const derived = await pbkdf2Hash(value, salt, iterations);
    return constantTimeEqual(derived, expected);
  } catch { return false; }
}
