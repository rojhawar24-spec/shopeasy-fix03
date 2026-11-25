// Node entry point: load .env before importing server.js and its database modules.
// Cloudflare Workers inject their environment and must not bundle/load dotenv.
if (process.env.CLOUDFLARE_WORKER !== '1') await import('./load-environment.js');
await import('./server.js');
