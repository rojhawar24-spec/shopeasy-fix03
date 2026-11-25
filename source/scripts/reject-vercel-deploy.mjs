#!/usr/bin/env node
console.error([
  'ShopEasy does not support Vercel/AWS Lambda serverless deployment in this release.',
  'The intended Cloudflare Workers + Turso architecture is currently blocked because the required PBKDF2-SHA256 work factor (600,000 iterations) exceeds the production Workers compatibility limit.',
  'Vercel/AWS Lambda are also unsupported because in-memory rate-limit counters are not shared between serverless instances. Use one persistent Node.js instance with RATE_LIMIT_BACKEND=memory-single-instance; see CLOUDFLARE-DEPLOYMENT.md for current platform constraints.',
  'Free plans have hard usage limits and are not unlimited. Complete the staging CPU, database, and integration tests before selling.'
].join('\n'));
process.exitCode = 1;
