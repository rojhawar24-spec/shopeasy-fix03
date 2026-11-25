# ShopEasy 2.8.95 — Staging QA Runbook

**Purpose:** finish the checks that cannot be certified from static source/build artifacts. This runbook assumes the operator owns the ShopEasy deployment and has explicit permission to test it.

**Hard rule:** `PASS` requires recorded evidence from the exact running build. If a step cannot run, mark it `BLOCKED` or `NOT TESTED`; never convert a missing dependency, a timeout, or a skipped request into `PASS`.

**Never use production customer data for QA.** Create a disposable staging database, test accounts, test products, test email addresses, and a separate persistent Node.js staging instance. Do not put secrets in source files, this report, screenshots, terminal transcripts, or chat.

## A. Test environment and safety gate

Record these before the run:

- Release ZIP filename and SHA-256.
- Git commit/release identifier, if available.
- Node.js and npm versions.
- Staging Node.js host URL and deployment/release ID (Cloudflare Workers deployment is blocked for this release).
- Staging database identifier (not its auth token).
- Email provider test-domain/sandbox status.
- Tester, date/time/time zone, and allowed test window.
- Expected traffic profile and an emergency stop contact.

Do not load-test the production store. Do not use real customer/order data. Keep test email delivery confined to controlled inboxes. Take a pre-test staging backup and verify there is a restore route before destructive tests.

## B. Clean install and static/build gates

Run from a fresh extraction of the release ZIP, with a supported Node version declared by `package.json`:

```sh
node --version
npm --version
npm ci
npm run check
npm run audit:static
node scripts/template-audit.mjs
npm run build:cloudflare
npm run preflight:release
npm test
npm audit --json > npm-audit.json
```

Save every command's full stdout/stderr and exit code. Review `npm-audit.json`; do not just look at the process exit code. For every advisory, record package, affected range, severity, fixed version, exploitability in this app, and remediation. Upgrade and retest; do not use blanket `npm audit fix --force` without reviewing breaking changes.

Required gate: install succeeds on a clean environment; all applicable tests execute; no tests are missing because a dependency failed to install; all release/security advisories are reviewed. A green syntax check alone is not this gate.

## C. Configure an isolated persistent Node.js staging deployment

**Do not deploy this release to Cloudflare Workers.** The production Workers runtime rejects PBKDF2 operations above 100,000 iterations; ShopEasy uses 600,000. The release's Cloudflare deploy and dry-run commands intentionally fail closed. See `CLOUDFLARE-DEPLOYMENT.md`.

1. Deploy the app to a private staging environment using Node.js 24.x on one persistent instance. Set `NODE_ENV=production` and `RATE_LIMIT_BACKEND=memory-single-instance`. Do not run multiple replicas or a serverless/autoscaling deployment with this limiter.
2. Use a separate disposable staging database and credentials. If using local SQLite, mount the database directory to persistent storage and verify it survives restart; if using Turso, set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. Set a test-only `MANAGER_NAME`, `MANAGER_EMAIL` and strong random `MANAGER_PASSWORD` only for initial bootstrap. Add `RESEND_API_KEY` only when a verified test email sender is configured. Never place secrets in source files, logs, screenshots, reports or chat.
4. Record the actual staging URL, Node version, process manager/container version and database identifier. Confirm `RATE_LIMIT_BACKEND=memory-single-instance` is set and that exactly one app process/instance is serving traffic.
5. Verify the schema/migrations complete. On a clean staging database, verify the first Manager bootstrap and create restricted Admin accounts only from the authenticated Manager interface.
6. Test restart persistence for products, customers, sessions, inventory, orders and uploaded images. Verify backup and restore to a separate staging database before using any real customer/order data.

If a persistent Node.js staging host is unavailable, mark live validation `BLOCKED`; source-only checks are not deployment certification.

## D. Live HTTP readiness and certification smoke

From a machine that can reach staging:

```sh
curl -i https://YOUR-STAGING-ORIGIN/health
curl -i https://YOUR-STAGING-ORIGIN/ready
```

Both must return HTTP 200 and valid JSON (`/health`: `ok:true`; `/ready`: `ok:true, ready:true`). A rate-limit response, HTML error page, 503, or malformed response is not a pass.

Then run the existing HTTP certification gate against the actual persistent Node.js staging host. Linux/macOS example:

```sh
export STAGING_BASE_URL=https://YOUR-STAGING-ORIGIN
export STAGING_MANAGER_EMAIL=qa-manager@example.invalid
read -s STAGING_MANAGER_PASSWORD; export STAGING_MANAGER_PASSWORD
# Enter the current 6-digit authenticator code (or an unused recovery code) just before running.
# Do not put it in .env, source files or long-lived CI secrets.
read -s STAGING_MANAGER_MFA_CODE; export STAGING_MANAGER_MFA_CODE
npm run certify:staging
unset STAGING_MANAGER_PASSWORD STAGING_MANAGER_MFA_CODE
```

PowerShell example:

```powershell
$env:STAGING_BASE_URL = 'https://YOUR-STAGING-ORIGIN'
$env:STAGING_MANAGER_EMAIL = 'qa-manager@example.invalid'
$secure = Read-Host 'Staging Manager password' -AsSecureString
$env:STAGING_MANAGER_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
$mfaSecure = Read-Host 'Current staging Manager authenticator code' -AsSecureString
$env:STAGING_MANAGER_MFA_CODE = [System.Net.NetworkCredential]::new('', $mfaSecure).Password
npm run certify:staging
Remove-Item Env:STAGING_MANAGER_PASSWORD, Env:STAGING_MANAGER_MFA_CODE
```

The certification gate now requires Manager password **and** the MFA challenge. If the Manager has not enrolled MFA, complete that manually first. Missing credentials/MFA yield an incomplete non-zero result; no MFA bypass is permitted. Save sanitized output. Do not save the password, MFA code, cookie, reset code, session token, or auth headers in evidence. This gate checks the routes written in `scripts/production-certification.mjs`; **it is not a full browser E2E suite or penetration test**.

## E. Customer browser E2E matrix

Use current Chrome and Firefox on desktop plus Safari on a real iPhone and Chrome on Android. Use only staging accounts. Record a screen capture or screenshot for each failure and include the URL, browser/version, time, and test account label (never its password).

1. New customer registration → email verification (if enabled) → login → logout → login again.
2. Forgot password: valid, invalid, expired, and already-used six-digit code; verify old password stops working after a successful reset; verify repeated attempts are throttled.
3. Browse categories and nested categories; search exact/partial/no-match terms; filter/sort/paginate; direct-open an absent product URL.
4. Product without variants and product with several variants; stock at 0, 1, and more than 1; ensure selected variant changes price/stock correctly.
5. Add/remove product; change quantities; refresh/back/reopen tabs; validate server-side recalculation of prices and discounts.
6. Valid, malformed, expired, usage-limited, and already-used coupon.
7. Cash on Delivery checkout: valid order, field validation, duplicate-click/double-submit, refresh/retry after response loss; verify exactly one order is created.
8. Customer order history/details and cancel/return/refund only if the product's actual workflow supports those actions. If refunds are not supported, verify they are not falsely advertised.
9. Test empty/error/loading/success states, browser back/forward, network disconnect, slow connection, and unexpected API errors.
10. Switch English ↔ Sorani ↔ Arabic mid-session; confirm cart, selected variant, and prices stay consistent; verify real RTL alignment and Sorani/Arabic punctuation/digits.

For each test case record: ID, exact steps, expected, actual, status (`PASS`/`FAIL`/`BLOCKED`/`NOT TESTED`), severity, evidence path, and retest result.

## F. Admin/Manager runtime and permissions

Create separate Customer, Manager, and Admin accounts. Define a written role-permission matrix before testing. Test every permission both through the UI and by direct API request; hiding a button is not authorization.

- Product/category/story/coupon CRUD; nested categories; variant sizes; stock; purchase cost/profit; image upload; store name/logo/branding/settings in all three languages.
- Order list/detail/status transitions; cancellation; stock reconciliation; exports and audit logs if implemented.
- Confirm a Manager cannot access an Admin-only operation and a Customer cannot access either staff area/API.
- Test disabled/deleted staff account, session expiry, logout invalidation, and role removal while a session is open.
- Verify failed database saves produce an actionable error and do not display a false success banner.
- Check two managers editing the same stock/item concurrently. Confirm conflict/transaction behavior is correct.

Any capability not present in ShopEasy must be recorded as “not implemented / not advertised,” not silently counted as passing.

## G. Cross-account authorization (IDOR/BOLA)

1. Create Customer A and Customer B, each with a different profile and at least one order. Record their test order IDs.
2. Sign in as A and capture A's order/profile requests. Sign in as B and replay the same request shape using A's ID, both read and mutation methods.
3. Repeat for address/profile, order details, order cancellation, uploads, and any customer-owned resource.
4. Expected result: `403` or indistinguishable `404`; no response may disclose A's private data and the database must remain unchanged. An HTTP redirect by itself is not proof—inspect the response body and final data state.
5. Repeat for Manager-vs-Admin endpoints. Confirm authorization is enforced server-side for direct API calls.

Use only your disposable staging accounts. Save sanitized request/response evidence and before/after database values; never attach active cookies/tokens.

## H. Authorized security tests

Use an agreed OWASP ZAP/Burp test scope on staging only. Prefer passive scan first; obtain explicit approval before active scanning. Keep rate-limited tests bounded and avoid destructive payloads.

- Authentication/session: brute-force throttling, password-reset enumeration, fixation, cookie rotation, logout/session invalidation, CSRF token validation, `HttpOnly`, `Secure` on HTTPS, `SameSite`.
- Authorization: IDOR/BOLA across customer IDs, staff role boundaries, mass assignment of `role`, `price`, `stock`, `discount`, and ownership fields.
- Input handling: benign SQL injection probes in login/search; reflected/stored XSS in product/category/story/settings fields; verify output encoding and SQL parameterization.
- Upload: mismatched extension/MIME, small non-image file named as an image, corrupt image, oversized image, many fields, long field names, path traversal-like filenames. Do not upload real malware or destructive zip bombs; use an approved harmless test file/corpus.
- Web policy: CORS allow-list, CSP, HSTS on HTTPS, `X-Content-Type-Options`, frame protection, cache-control on personalized pages, error-page disclosure, secret leakage in browser bundles/logs.
- Abuse: login, reset/OTP, search, checkout, upload and general API rate limits; verify the Durable Object shared counter is used in staging, and that binding outages fail closed with a safe 503.
- Dependencies: `npm audit --json` online; review the whole tree and reachable advisories. Static text searches are not a substitute for an active security review.

Record request/response and version for each finding. Fix Critical/High issues before any production approval. Retest after a code change.

## I. Shared rate limiter and Cloudflare runtime

The candidate uses a SQLite-backed `ShopEasyRateLimiter` Durable Object for a shared per-actor/per-route counter on Cloudflare. Its unit tests use a fake storage implementation; this is not proof of Cloudflare production runtime.

On staging:

- Check Wrangler deployment succeeded and the `SHOP_RATE_LIMITER` binding resolves.
- Make repeated bounded requests from the same test IP and confirm the configured endpoint returns a documented 429 after the configured threshold, with `Retry-After`/rate limit headers.
- Make requests from a second independent test IP and confirm its bucket is separate.
- Confirm a missing binding/unavailable DO fails closed (503) and does not fall back to per-isolate in-memory counting.
- Verify cleanup/alarms in local Durable Object tests and check storage/alarm behavior in remote logs/metrics where available.
- Check the cost and latency implications of one named Durable Object per actor+route under the agreed load profile. Do not claim globally perfect abuse prevention solely from the unit tests.

Cloudflare's own Rate Limiting binding is per-location and eventually consistent; if evaluating alternatives, compare the consistency/latency/cost model rather than assuming every platform rate limiter is globally atomic. Official docs: https://developers.cloudflare.com/workers/wrangler/configuration/ and https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/.

## J. Load and stress tests

Run only after both readiness endpoints return HTTP 200. Stage the profile gradually and stop on rising 5xx, latency collapse, database saturation, or unexpected resource cost.

Suggested progression:

1. Baseline: 1 client, 10 rounds.
2. Small: 10 concurrent clients.
3. Medium: 25 then 100 concurrent clients.
4. Large: 1,000 virtual clients only after medium passes, with an agreed distributed-source/profile design.
5. Spike: raise and lower concurrency abruptly.
6. Soak: sustained agreed load for a defined interval.

Example shell commands against staging:

```sh
BASE_URL=https://YOUR-STAGING-ORIGIN LOAD_CLIENTS=1 LOAD_ROUNDS=10 npm run load:local
BASE_URL=https://YOUR-STAGING-ORIGIN LOAD_CLIENTS=10 LOAD_ROUNDS=10 npm run load:local
BASE_URL=https://YOUR-STAGING-ORIGIN LOAD_CLIENTS=100 LOAD_ROUNDS=10 npm run load:local
```

The bundled simple loader reports p50/p95/p99, request rate, HTTP status distribution, 429s, server errors and network errors. **It does not measure CPU, memory, database connection saturation, full business flows, or truly independent 1,000-user clients.** A single load-generator IP will naturally hit the per-IP rate limit; a 429 is a rate-limit result, not proof the server is too slow. To test server capacity, agree on a distributed source profile or a carefully controlled staging-only threshold, and separately test production security settings. Capture Cloudflare Workers Observability/Analytics and database metrics alongside the load log. Never raise production thresholds just to make a load test pass.

## K. Email, OTP, and notifications

Use a sandbox/test inbox domain. Verify delivery and provider events for registration/verification, password reset, order confirmation, status/shipping notification, and cancellation/refund notices only if those workflows exist.

- Test valid and invalid sender addresses, bounce, delayed delivery, provider timeout, retry, duplicate sends, and provider outage.
- Test OTP expiry, single-use, wrong-code throttling, replay rejection, resend limits, and account enumeration resistance.
- Ensure messages contain the right store name/language/order summary, links point to the staging domain, and no secret/token is logged.
- Inspect SPF/DKIM/DMARC using the email provider's domain verification tools; do not mark these PASS based on code review.

## L. Backup, restore and migration rollback

Using the database provider's supported backup/export method:

1. Create a pre-test backup of the disposable staging DB and record the backup ID/time.
2. Ensure the backup covers products, variants, inventory, categories, orders, settings, user/account records required for restore, uploaded image BLOBs, and upload quota counters.
3. Restore into a **different isolated staging database**; never overwrite production for the test.
4. Verify row counts and representative records, image bytes/content types, referential integrity, login, product browsing, and order details.
5. Test the documented migration rollback/recovery path on a disposable DB copy. Never assume a migration is reversible unless that reversal was tested.
6. Record restore duration and any data loss/differences. A successful backup command alone is not a restore pass.

## M. Password-hashing CPU benchmark and deployment checks

- Do not run 600,000-iteration PBKDF2 on Cloudflare Workers in this release: production Workers rejects iterations above 100,000. The deployment guard must remain active.
- Deploy the app to the actual intended persistent Node.js staging host with one instance only; set `RATE_LIMIT_BACKEND=memory-single-instance`.
- Run `npm run benchmark:password-hashing` on that host. It reports the hash format/work factor, correct/wrong-password verification, wall latency and process CPU. Save the JSON output with the exact Node version and release ZIP SHA-256.
- Exercise actual registration/login/password-reset HTTP flows on staging and capture latency, CPU, error counts and successful verification. Repeat warm/cold conditions where possible.
- If the host cannot handle the workload, do not lower iterations; choose a more capable host or a reviewed managed-auth design and rerun the benchmark. Confirm rollback to the prior staging deployment works.

## N. Accessibility, SEO, real devices and RTL

- Keyboard-only: tab order, skip link, visible focus, dialogs/menus, no keyboard traps.
- Screen reader: form labels, error associations, live announcements, heading order, image alt text.
- Contrast and zoom/reflow against WCAG 2.2 AA expectations; automated tooling is a supplement, not a certification.
- Real Chrome, Firefox, Edge and Safari; real iOS Safari and Android Chrome.
- English, Sorani, Arabic and Dutch (Belgium): all page templates, manager/admin forms, validation/errors, emails and RTL; test long strings, Kurdish characters, mixed digits, email/URL alignment, cart/checkout state after switching locales.
- SEO: status codes, canonical HTTPS URLs, robots, sitemap, language/hreflang strategy, metadata/social cards, structured data matching actual product/price/availability; no private account/admin pages indexed.
- Attach device/browser versions, screenshots, axe/Lighthouse reports if used, and exact URL/viewport.

## O. Legal, tax, privacy and business approval

This is a business-owner/legal review, not something source tests can certify. Confirm with the actual operator/legal adviser:

- Correct legal entity/contact/address, privacy notice, terms, delivery, returns/cancellations, complaint handling, and cookie/tracking consent requirements.
- Data minimization, retention/deletion/export requests, processor agreements and international transfers where applicable.
- Real VAT/tax/invoice requirements for the selling country and target markets; prices including/excluding tax are clear and correctly calculated.
- Refund/payment language matches the actual system. This version is COD-only unless verified code/config says otherwise; do not advertise card payments/refunds if not implemented.
- PCI obligations only if any card/payment credentials or payment-provider checkout is actually integrated; do not collect card data directly without an independently reviewed compliant architecture.

Obtain documented sign-off from the business/legal owner for the real jurisdiction and model.

## P. Final release gate

Production remains **NOT CERTIFIED** while any Critical/High finding is open; any required test is failed/blocked/not tested; a dependency advisory is unreviewed; a backup restore is unverified; shared rate limiting is not live; deployment/rollback is not demonstrated; or the legal/business owner has not signed off.

Final evidence bundle must contain sanitized logs, test result files, deployment IDs, browser/device screenshots, load metrics, security finding/remediation records, backup/restore record, dependency audit report, and explicit signatures/approvals. Redact secrets, cookies, tokens, personal data, and customer/order data before packaging.


## Supported deployment target (current release)

Cloudflare Workers deployment is blocked for this release because its production PBKDF2 cap conflicts with the required hash work factor. Vercel/AWS Lambda serverless deployment is also unsupported. Use one persistent Node.js instance with `RATE_LIMIT_BACKEND=memory-single-instance`; do not scale horizontally until a shared durable limiter is implemented and tested.


## N. Order status history and opt-in email

- Confirm a customer checkout creates a visible on-page receipt and status history without requiring any transactional email.
- With defaults, both `ORDER_CONFIRMATION_EMAILS=0` and `ORDER_STATUS_EMAILS=0`: assert Resend is not called.
- In isolated staging only, configure a verified Resend sender and set confirmation email to `1`; place one test order, verify one message, retry the success URL and confirm it is not resent. Change order state to processing/shipped/completed and confirm status emails remain disabled unless the status toggle is enabled. Test daily cap and a provider failure. Inspect `order_email_deliveries`; never send test mail to a real customer's address.
- Verify customer account shows every history entry after manager status changes and cancellation; verify it updates after refresh without email.

## O. Returns/exchanges/refunds and inventory alerts

- Use a disposable customer/order. Verify requests are blocked for another customer's order, undelivered orders, invalid quantity, too-short reason and quantity over the purchased line.
- Verify requested → approved/rejected; received return can be recorded only after approval; restock is optional and happens once only after physical inspection. Verify refund cannot exceed the relevant line/order cap and is only recorded with a valid amount/method after the store actually sends money. Verify exchange progresses through received → sent with a reference → delivered/closed. Confirm no payment-provider call is made.
- Test every manager action as an Admin; it must be denied. Confirm customer CSRF and manager CSRF guards apply. Verify the low-stock dashboard uses `stock - reserved_stock`, includes base inventory and variants, and does not send email.

## P. Backup and restore with real data-shaped staging

- Use a non-production database containing test users, orders/order-items/history, product variants/gallery, DB BLOBs and local upload files. Configure a non-public 32-byte `BACKUP_ENCRYPTION_KEY`, run `npm run backup:database`, verify encrypted magic/header and sidecar checksum, and retain both backup and key separately. Check that the backup file is not readable as plaintext.
- Restore into a newly created empty database and empty uploads directory; use `npm run restore:database -- --backup <file> --confirm-restore`. Verify row counts, `PRAGMA foreign_key_check`, `PRAGMA integrity_check`, blob/media bytes, manager login in private staging, product images, orders, return/refund/exchange and settings.
- Confirm restore refuses a nonempty target, wrong encryption key, altered/missing checksum and missing media directory when files exist. Simulate a failed backup and ensure it does not replace the previous known-good backup. Record query/egress usage and runtime for the free DB tier. This is manual tooling, not an automatic scheduled backup service.
