# ShopEasy 2.8.95 — Cloudflare deployment BLOCKED (P0)

**Do not deploy this release to Cloudflare Workers.** The production Workers runtime currently rejects a single Web Crypto PBKDF2 operation above 100,000 iterations. ShopEasy deliberately uses PBKDF2-SHA256 with 600,000 iterations. Therefore, registration/password reset can fail, and password verification using hashes at this work factor is not compatible with the current Workers production limit. The limit is not reliably reproduced by local `wrangler dev`; green local tests are not proof of production compatibility. See the Cloudflare runtime discussion: https://github.com/cloudflare/workerd/issues/1346 and current CPU limits: https://developers.cloudflare.com/workers/platform/limits/.

The deployment scripts now fail closed before a Cloudflare deploy or dry run. `npm run build:cloudflare` remains available only for compile inspection; it is not deployment certification. Do not bypass `scripts/preflight-cloudflare-auth.mjs` and do not lower the password-hash work factor to fit Workers.

## Current deployment path: persistent Node.js, single instance

Use a persistent Node.js >=24.22.2 <25 host/container that supports Node's Web Crypto implementation and persistent storage. The included Dockerfile sets `RATE_LIMIT_BACKEND=memory-single-instance`, which is supported **only for one persistent app instance**. Do not run multiple replicas, autoscale horizontally, or put this behind serverless functions: the in-memory rate-limit counters are process-local and would not be shared. If you need multiple instances, implement and test a shared durable rate-limit backend before scaling out.

1. Install Node.js >=24.22.2 <25 and run `npm ci` (the package engine requires Node.js `>=24 <25`).
2. Configure `NODE_ENV=production` and `RATE_LIMIT_BACKEND=memory-single-instance` for exactly one persistent process. Keep `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` if using Turso; otherwise ensure the local SQLite database directory is on a persistent volume and backed up.
3. Set a strong unique `MANAGER_PASSWORD` and the required `MANAGER_NAME` / `MANAGER_EMAIL` bootstrap values only for the clean initial database. Keep secrets out of the ZIP, source control and chat.
4. Run `npm run check`, `npm run audit:static`, `node scripts/template-audit.mjs`, and `npm test` after `npm ci`. Do not deploy if any required test is skipped or fails.
5. Deploy to a private staging environment on the actual intended Node host. Exercise registration, login with correct and incorrect passwords, password reset, password change, Manager/Admin flows, checkout, stock concurrency, uploads, and restart persistence. Capture real request latency, Node version, CPU use, errors and logs. Confirm `hashPassword()` generates a `pbkdf2$600000$sha256$...` record and `verifyPassword()` accepts the correct password and rejects an incorrect one.
6. Verify backups and restore them into a separate staging database before using real customer/order data. Configure TLS, secure secrets, log retention, monitoring and a recovery plan at the host.
7. Keep the app at one instance until a shared rate limiter and cross-instance session/database behavior are implemented and tested. A single-instance memory limiter resets when the process restarts and is not a distributed abuse-control system.

## What is and is not fixed

- Fixed in this release: Cloudflare deploy and dry-run commands stop before deployment with an actionable error, preventing a known-incompatible authentication design from being shipped accidentally.
- Not claimed: a real staging deployment, latency benchmark, production certification, or proof that a particular Node host has sufficient capacity. Those require access to the chosen host and a live staging deployment.
- Security invariant: keep PBKDF2-SHA256 at 600,000 iterations; do not lower it to bypass a platform limit.
- Commercial status: **NOT production-certified and NOT commercially license-cleared**. Resolve the separate license audit and all staging QA gates before resale or production use. Current release implementation and verification limits are documented in [QA-REPORT-2.8.95.md](QA-REPORT-2.8.95.md).

## Order communication and database recovery notes

The 2.8.95 order confirmation/status email, return workflow and database backup scripts target the persistent Node.js path and require real staging checks. The backup tool runs from a Node.js environment with the same database configuration as the app; it does not run as a Worker cron job. See `DATABASE-BACKUP-RESTORE.md`. Do not assume the free database provider automatically includes point-in-time recovery, adequate retention, or unlimited export/egress. Cloudflare Worker deployment remains blocked by the separate P0 password-hashing runtime gate; do not use this note as a deploy certification.
