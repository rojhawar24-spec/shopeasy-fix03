/** Staging-only Manager MFA gate. Never accepts a post-password /admin redirect. */
export function classifyManagerLoginRedirect(value) {
  if (typeof value !== 'string') return 'invalid';
  const normalized = value.trim();
  if (normalized === '/mfa/setup') return 'setup';
  if (normalized === '/mfa/verify') return 'verify';
  return 'invalid';
}

/** Accept only authenticator codes or the same recovery-code shape as src/mfa.js. */
export function validStagingMfaCode(value) {
  return typeof value === 'string' && (/^\d{6}$/.test(value) || /^(?:[A-Fa-f0-9]{4}-){5}[A-Fa-f0-9]{4}$/.test(value) || /^[A-Fa-f0-9]{24}$/.test(value));
}
