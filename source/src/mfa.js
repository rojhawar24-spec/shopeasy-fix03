import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_ALLOWED_DRIFT_STEPS = 1;

// MFA_ENCRYPTION_KEY must be a dedicated, random 32-byte key encoded as 64 hex characters.
// Do not silently fall back to plaintext storage or derive it from an unrelated credential.
export function getMfaEncryptionKey() {
  const value = String(process.env.MFA_ENCRYPTION_KEY || '').trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    const error = new Error('MFA_ENCRYPTION_KEY_NOT_CONFIGURED');
    error.code = 'MFA_ENCRYPTION_KEY_NOT_CONFIGURED';
    throw error;
  }
  return Buffer.from(value, 'hex');
}

export function encryptTotpSecret(secret) {
  const key = getMfaEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decodeCanonicalBase64Url(value) {
  // Buffer.from(..., 'base64url') is deliberately permissive and can ignore
  // invalid characters or unused trailing bits. Reject non-canonical encodings
  // so malformed ciphertext is never accepted as an alternate representation.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('INVALID_ENCRYPTED_MFA_SECRET');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('INVALID_ENCRYPTED_MFA_SECRET');
  }
  return decoded;
}

export function decryptTotpSecret(value) {
  const key = getMfaEncryptionKey();
  const parts = String(value || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('INVALID_ENCRYPTED_MFA_SECRET');
  try {
    const iv = decodeCanonicalBase64Url(parts[1]);
    const tag = decodeCanonicalBase64Url(parts[2]);
    const ciphertext = decodeCanonicalBase64Url(parts[3]);
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error('INVALID_ENCRYPTED_MFA_SECRET');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('MFA_SECRET_DECRYPTION_FAILED');
  }
}

export function encodeBase32(buffer) {
  const input = Buffer.from(buffer);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(text) {
  const source = String(text || '').replace(/=+$/g, '').toUpperCase();
  if (!source || !/^[A-Z2-7]+$/.test(source)) throw new Error('INVALID_TOTP_SECRET');
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of source) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  if (!output.length) throw new Error('INVALID_TOTP_SECRET');
  return Buffer.from(output);
}

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

export function totpAtStep(secret, step) {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error('INVALID_TOTP_STEP');
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, '0');
}

export function totpAtTime(secret, timeMs = Date.now()) {
  return totpAtStep(secret, Math.floor(Number(timeMs) / 1000 / TOTP_PERIOD_SECONDS));
}

function constantTimeTextEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Returns the accepted time step, or null. A last-used step blocks replay of the same TOTP.
export function verifyTotpCode(secret, submittedCode, nowMs = Date.now(), lastAcceptedStep = null) {
  const code = String(submittedCode || '').trim();
  if (!/^\d{6}$/.test(code) || !Number.isFinite(Number(nowMs))) return null;
  const currentStep = Math.floor(Number(nowMs) / 1000 / TOTP_PERIOD_SECONDS);
  // Consume the latest matching step, so a collision within the window
  // cannot leave a second eligible step for the same submitted code.
  for (let drift = TOTP_ALLOWED_DRIFT_STEPS; drift >= -TOTP_ALLOWED_DRIFT_STEPS; drift--) {
    const step = currentStep + drift;
    if (step < 0 || (lastAcceptedStep !== null && lastAcceptedStep !== undefined && step <= Number(lastAcceptedStep))) continue;
    if (constantTimeTextEqual(totpAtStep(secret, step), code)) return step;
  }
  return null;
}

export function formatRecoveryCode(hexCode) {
  const normalized = String(hexCode || '').toUpperCase();
  if (!/^[A-F0-9]{24}$/.test(normalized)) throw new Error('INVALID_RECOVERY_CODE');
  return normalized.match(/.{4}/g).join('-');
}

export function normalizeRecoveryCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[\s-]/g, '');
  return /^[A-F0-9]{24}$/.test(normalized) ? normalized : null;
}

export function hashRecoveryCode(code) {
  const normalized = normalizeRecoveryCode(code);
  return normalized ? crypto.createHash('sha256').update(normalized, 'utf8').digest('hex') : null;
}

export function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => formatRecoveryCode(crypto.randomBytes(12).toString('hex')));
}

export function hashRecoveryCodes(codes) {
  if (!Array.isArray(codes) || codes.length !== 8) throw new Error('EXPECTED_EIGHT_RECOVERY_CODES');
  return JSON.stringify(codes.map(code => {
    const hash = hashRecoveryCode(code);
    if (!hash) throw new Error('INVALID_RECOVERY_CODE');
    return hash;
  }));
}

export function parseRecoveryCodeHashes(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    if (!Array.isArray(parsed) || parsed.length > 8 || parsed.some(item => !/^[a-f0-9]{64}$/.test(String(item)))) return [];
    return parsed;
  } catch {
    return [];
  }
}

// Always check every stored hash instead of stopping at the first match.
export function findRecoveryCodeHashIndex(code, storedHashes) {
  const submittedHash = hashRecoveryCode(code);
  if (!submittedHash || !Array.isArray(storedHashes)) return -1;
  let found = -1;
  for (let index = 0; index < storedHashes.length; index++) {
    const candidate = String(storedHashes[index] || '');
    if (/^[a-f0-9]{64}$/.test(candidate) && constantTimeTextEqual(candidate, submittedHash)) found = index;
  }
  return found;
}

export function buildTotpUri(secret, email, issuer = 'ShopEasy') {
  const safeIssuer = String(issuer || 'ShopEasy').trim().slice(0, 64) || 'ShopEasy';
  const safeEmail = String(email || '').trim().slice(0, 254);
  const label = `${encodeURIComponent(safeIssuer)}:${encodeURIComponent(safeEmail)}`;
  const query = new URLSearchParams({
    secret: String(secret),
    issuer: safeIssuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
