#!/usr/bin/env node
// ShopEasy intentionally uses PBKDF2-SHA256 with 600,000 iterations.
// Cloudflare's production Workers runtime currently rejects any single PBKDF2
// deriveBits call above 100,000 iterations. Local workerd tests do not enforce
// that production ceiling. Never weaken password hashing to make this deploy work.
console.error([
  'BLOCKED: ShopEasy cannot be deployed to Cloudflare Workers with the current password-hashing design.',
  'The production Workers runtime rejects PBKDF2 iteration counts above 100,000; ShopEasy requires 600,000.',
  'This can break registration/password reset (and any verification using a 600,000-iteration hash).',
  'Local tests or wrangler dev do not prove this production limit is absent.',
  'Use a persistent Node.js host instead, with RATE_LIMIT_BACKEND=memory-single-instance and one app instance only.',
  'Do not lower the password-hash work factor. Revisit Workers only after the runtime limit is officially raised and live staging passes.'
].join('\n'));
process.exitCode = 1;
