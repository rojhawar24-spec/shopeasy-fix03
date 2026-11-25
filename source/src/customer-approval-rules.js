import { DUMMY_PASSWORD_HASH } from './password-hashing.js';

// Only a fresh hash produced server-side by the current PBKDF2 implementation
// may replace an untrusted pre-registration password during Manager approval.
export function validCustomerApprovalPasswordHash(passwordHash, previousHash = null) {
  if (typeof passwordHash !== 'string' || passwordHash === DUMMY_PASSWORD_HASH || passwordHash === previousHash) return false;
  const fields = passwordHash.split('$');
  if (fields.length !== 5) return false;
  const [algorithm, iterationsText, digest, salt, derived] = fields;
  if (algorithm !== 'pbkdf2' || digest !== 'sha256' || !/^\d{6,7}$/.test(iterationsText)) return false;
  const iterations = Number(iterationsText);
  if (!Number.isSafeInteger(iterations) || iterations < 600_000 || iterations > 1_000_000 || String(iterations) !== iterationsText) return false;
  if (!/^[A-Za-z0-9_-]{22}$/.test(salt) || !/^[A-Za-z0-9_-]{43}$/.test(derived)) return false;
  return Buffer.from(salt, 'base64url').length === 16 && Buffer.from(salt, 'base64url').toString('base64url') === salt &&
    Buffer.from(derived, 'base64url').length === 32 && Buffer.from(derived, 'base64url').toString('base64url') === derived;
}
