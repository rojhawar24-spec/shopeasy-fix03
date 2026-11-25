import fs from 'node:fs';
await import('./scripts/start-production.mjs');
fs.writeFileSync(process.argv[2],JSON.stringify({nodeEnv:process.env.NODE_ENV,node:process.version,rateLimitBackend:process.env.RATE_LIMIT_BACKEND}));
