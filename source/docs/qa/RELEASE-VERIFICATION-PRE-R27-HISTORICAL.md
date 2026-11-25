# Historical release verification notes — before R27

The following text is preserved from the pre-R27 `RELEASE-VERIFICATION.md`. Its “current”, “pending”, test counts and environment statements describe those earlier records only; they are not fresh evidence or instructions for R27. Use [the current release workflow](../../RELEASE-VERIFICATION.md) and the final report/hash for the exact archive being assessed.

---

# Current status — FIX11 (8 November 2026)

Source hardening for Belgian customer checkout disclosure and French first-paint HTML completed. Dependency-independent tests **892 passed, zero failed**, while full Node 24 application/server tests and commercial-rights clearance are still open. The relevant files and concrete commands are in [FIX11 evidence](FIX11-CHECKOUT-AND-FRENCH-SERVER-REMEDIATION-2026-11-08.md). The scoped `typecheck:core` now checks four modules; it is not a full project typecheck. **NO-GO for production or resale certification.**

---

> Current QA candidate: **2.8.93 R12.11 E2 REPAIR13 hard recheck** (4 November 2026). New hardening: best-effort PII redaction for AI search and the homepage assistant (email/phone/IBAN-like/address patterns, including product text), strict 64 KiB provider response caps, more accurate AI data disclosure in EN/CKB/AR/NL, SWIFT Release 103 IBAN country-length checks with explicit limits, a new real-SQLite bank-transfer integration test file, and Windows installer detection of the target `.env`'s configured port. Fresh results in the current environment: 13/13 selected AI/bank-helper/installer tests, 208/208 syntax, static audit 90 files / 1,829 locale keys, 47 EJS templates, 89-file release preflight and Cloudflare source build. Authoring runtime is Node.js 22.16.0 but the package requires Node.js 24; `node_modules` is absent. The new SQLite integration tests, full suite, PowerShell install, Mollie sandbox, actual bank receipt and external AI provider are **not verified**. **QA candidate only — NO-GO for production.** See `R12.11-E2-REPAIR13-HARD-RECHECK-REPORT-2026-11-04.md`.


> Superseded previous QA candidate: **2.8.93 R12.11 E2 Repair 11** (2 November 2026). Adds the missing backward-compatible `orders.client_token` migration, broad checkout-stage diagnostics, and a strictly read-only local SQLite schema diagnostic. See `R12.11-E2-REPAIR11-CHECKOUT-SCHEMA-HOTFIX-REPORT-2026-11-02.md`. Full Node.js 24 tests and live browser checkout/order verification remain outstanding; this is not production certification.

# Current R12.11 E2 Repair 7 — verification status (2026-11-01)

- Fixed the release-gate mismatch by adding `CLOUDFLARE_WORKER=0` to `.env.example`; this matches the Oracle deployment script and the zero-release audit.
- Clarified test wording so Cloudflare + Turso is described as optional legacy compatibility; the primary persistent deployment in `DEPLOYMENT.md` is Oracle + Node.js 24 + local SQLite.
- Focused zero-release audit: 6/6 passed after the change.
- Full Node.js 24 `npm test`, live authenticated browser checkout, order visibility in Manager → Orders, production credential review, `npm audit` remediation and staging certification remain outstanding. **QA candidate only — NO-GO for production.** See `R12.11-E2-REPAIR7-VALIDATION-REPORT-2026-11-01.md`.

---

# Current R12.11 E2 Repair 2 — verification status (2026-11-01)

The responsive Manager/Admin header defect is repaired. Combined focused Manager/design/regression checks pass **68/68**; Manager-specific subgroup **25/25**. Syntax 194/194, static source audit 87 files / 1,829 language keys, 46 EJS static templates, CSS build, Cloudflare source build and 86-file release preflight pass. The authoring runtime is Node.js 22.16.0 (project requires 24.x) and dependencies are not installed, so the complete Node.js 24 test suite, real EJS/HTTP/database/MFA integration, `npm audit` and browser QA remain unverified. Preserve the user's `.env` and database during upgrade; the app does not reset the Manager password or silently promote an Admin. **QA candidate only — NO-GO for production.** See `R12.11-E2-REPAIR2-VALIDATION-REPORT-2026-11-01.md`.

---

## ShopEasy 2.8.93 R12.11 E2 Repair 2 — Manager workspace correction (2026-11-01)
- Repaired the shared Manager/Admin header: tablet/mobile nav no longer hides Account/Overview and Logout behind a disabled hamburger.
- Added dedicated header actions and a CSRF-protected language selector; removed storefront search markup from Manager pages.
- Full Manager gets Account (`/admin/staff`) and Logout. Restricted Admin gets Overview and Logout only; server-side roles and route guards are unchanged.
- PASS: 25/25 Manager-focused tests; 194 JS/MJS syntax files; 87-file static audit with 1,829 aligned locale keys; 46-template static audit; CSS build; 46-template Cloudflare source build; 86-file release preflight.
- Full Node.js 24 test suite, real EJS render, Manager HTTP/MFA integration and `npm audit` remain pending because the authoring container has Node.js 22.16.0 and no installed project dependencies. **QA candidate only — NO-GO for production.** See `R12.11-E2-REPAIR2-VALIDATION-REPORT-2026-11-01.md`.

---

## ShopEasy 2.8.93 R12.11 E2 Repair 1 — Windows regression correction (2026-11-01)
- Fixed the reported missing Manager gallery image selector and added explicit keyboard-focus styling for active catalogue filter chips.
- Updated the stale responsive/navigation regression expectations to the actual E2 structure: four desktop product columns, three tablet columns, two mobile columns, and the shared `.admin-nav` navigation.
- Preserved the correct semantic main target. `header.ejs` already renders `<main id="main-content" class="…">`; the skip-link test was corrected to accept layout classes on that element rather than requiring an attribute-free opening tag.
- Bumped all runtime CSS/JS cache references to `2.8.93-r12.11-e2-repair1-2026-11-01`.
- PASS: 55/55 focused dependency-light regression tests, including product gallery, active-filter keyboard focus, CSS cleanliness, mobile/tablet/RTL behavior, cache consistency and release-hardening checks.
- The EJS-dependent `sale-readiness.test.js`, full Node.js 24 suite, `npm audit`, and real browser rendering remain unverified here. This container runs Node.js 22.16.0 and has no installed project dependencies. Run `npm ci` and `npm test` on the required Node.js 24 Windows environment.
- This is a QA correction, not a production certification. The separate full-code-audit issues concerning mail retries, privacy/accounting retention and AI destination restrictions remain open. **NO-GO for production.**

---

## ShopEasy 2.8.93 R12.10 — REPAIRED3 simple-stock integration correction (2026-11-01)
- Corrected the exact Windows failure from REPAIRED2: simple products now visibly show “Quantity in stock *” and explain that a size is not needed to track stock. The existing `name="stock"` input and server stock handling are preserved; the HTTP integration assertion remains active.
- New stock copy is translated in English, Sorani, Arabic and Dutch. Dictionary parity: 1,829 keys in each locale.
- PASS after this source correction: 49/49 dependency-light focused tests (26 Manager/inventory/settings + 23 locale/runtime); 193 JS/MJS syntax files; 87-file static source/config audit; 46-template static EJS audit; design CSS build; 46-template Cloudflare source bundle; 86-file release preflight.
- The user's prior Windows run was 677 total: 675 pass, one fail, one skipped. Its single failure was the exact product stock-label/helper assertion now corrected. **The user's Windows HTTP integration and full `npm test` have not yet been rerun against REPAIRED3.**
- This authoring container lacks the complete EJS/libSQL/QR dependencies and uses Node.js 22.16.0, not the project's required Node.js 24.x. A fresh `npm ci`, `npm audit`, dynamic EJS/database/browser tests, staging payment, backup/restore and legal/commercial clearance remain outstanding.
- **Status: QA candidate only — NO-GO for production.**

---

## ShopEasy 2.8.93 R12.10 — design hard-audit verification (2026-11-01)
- Rechecked the current R12.10 source after responsive and page-family design corrections; regenerated the design CSS and Cloudflare source bundle.
- PASS: 189 JS/MJS syntax files; 86-file static source/config audit; 45 EJS template audit; one-active-stylesheet build; 45-template Cloudflare source bundle; 85-file release preflight; 128/128 focused design/responsive/RTL/checkout/account/order/Manager tests.
- Browser fixture result: 184 static Chromium renders; 0 page-level horizontal overflow; 0 broken fixture images. These fixtures do not dynamically render EJS or boot the live application. Internal horizontal scrolling is intentionally used for wide Manager tables and navigation.
- Full direct diagnostic: 642/657 pass; 15 tests cannot start because runtime dependencies are absent (`@libsql/client` blocks Manager/product-variant/upload-quota/SQLite tests; `qrcode-generator` / `jsqr` block MFA QR tests; `ejs` blocks dynamic template syntax). Standard `npm test` correctly stops at its dependency preflight.
- Environment: Node.js 22.16.0, while `package.json` requires `>=24 <25`; no clean install or full supported-Node execution occurred. `npm audit`, live EJS/browser/database integration, Mollie sandbox, backup/restore, legal review and commercial-rights clearance remain unverified.
- Dutch UI: `nl-BE` / LTR with 1,757 aligned keys across EN/CKB/AR/NL; native Belgian Dutch proofreading and merchant legal-policy review remain required.
- **Status: R12.10 design-audit candidate only — NO-GO for production and no real card payments.** See `DESIGN-HARD-AUDIT-2026-11-01.md`.

---

## ShopEasy 2.8.93 R11 — full from-scratch audit (2026-10-29)

- Fresh extraction of the R10 input ZIP verified: 413 entries, no CRC faults, duplicate paths, secrets, `node_modules` or local database files.
- Syntax 177/177, static audit 84 files / 1,365 aligned EN/CKB/AR keys, 45-template static audit, release preflight, CSS build and Cloudflare source build all passed.
- Full direct Node diagnostic: 586/601 passed, 15 dependency-backed/integration tests blocked by absent declared packages. All 586 tests not requiring those missing packages passed when rerun alone.
- The correct Node.js 24 install and full `npm test` are still outstanding: this environment has only Node 22.16.0 and cannot resolve `registry.npmjs.org`. `npm audit`, live DB/HTTP tests, live provider transactions and full browser QA remain unverified.
- Updated active setup/deployment instructions so they no longer point to the old R5 ZIP. No application runtime code changed in R11.
- **Status: R11 audit candidate only — NO-GO for production, no live card payments.** See `R11-FULL-FROM-SCRATCH-AUDIT-2026-10-29.md`.

---

## ShopEasy 2.8.93 R9 — deep audit and payment-accounting hardening (2026-10-29)

- Fixed refund currency handling and coupon-adjusted per-item refund ceilings.
- Added provider-verified Mollie refund/chargeback snapshot persistence, Manager visibility and a CSRF-protected refresh endpoint that does not change order fulfilment status.
- Focused regression suite: 77/77; syntax: 177 JS/MJS files; static and 45-template checks, release preflight and Cloudflare source build passed.
- Final direct diagnostic: 601 tests, 586 passed, 15 failed at missing dependency/integration startup. The standard `npm test` gate halts in `pretest` because packages are not installed. No full-suite pass is claimed; clean `npm ci`/`npm audit` on Node.js 24 remain blocked.
- **Status: candidate only; NOT production-certified or commercially license-cleared. No real card payments.** See [QA-REPORT-2.8.93.md](r26-release-metadata/QA-REPORT-2.8.93.md).

---

# Current R6 candidate — verification status (2026-10-28)

Read `QA-REPORT-2.8.93.md` first for the authoritative status of this candidate. The source checks are green (syntax 173 files, one active CSS bundle, 83-file static audit and 45-template static audit). The focused regression group passed **57/57**. The full direct diagnostic suite is **561/576**, with 15 failures at missing dependency module-load time because `node_modules` is absent; this is not a full pass. A refreshed CSS/DOM fixture passed 14 LTR/RTL viewport checks, including the tablet cookie-banner clearance fix, but does not certify the full app.

Do not deploy this candidate. Multer 2.5.0 is targeted to address GHSA-q7qp-rjg7-q26m, but the official npm SHA-512 integrity remains intentionally absent until `FINALIZE-AND-VERIFY-WINDOWS.ps1` runs in a clean Node.js 24.x environment with registry access and passes clean install, full tests and `npm audit`. Live Mollie staging, all-page browser QA, Dutch locale, asset/legal rights and production backup/restore validation are outstanding.

---

## ShopEasy 2.8.93 R5 — security and category/cookie corrections (2026-10-28)

- Corrected homepage/shop category cards so fixed aspect ratio and image clipping apply only to the media wrapper; all categories receive a neutral image fallback when no custom image is set.
- Reduced the mobile consent banner height and positioned it above the fixed bottom navigation while preserving visible reject/accept choices.
- Pinned the Multer target to 2.5.0 and strengthened release preflight to require the official npm-generated SHA-512 integrity value. The current offline candidate intentionally fails this gate until finalization on Node.js 24 with npm registry access.
- Moved superseded dated design/security/payment reports and manifests to `history/` while preserving them and updating Markdown links. Broken local Markdown links: 0 in the candidate tree.
- Candidate checks actually run: syntax 173/173; selected focused regression group 31/31; static audit 83 source/config files and 1,365 EN/CKB/AR dictionary keys; active CSS check passed; Cloudflare bundle generation passed. Full `npm test` is blocked by the missing dependency installation; live browser, real Mollie, rights and legal reviews remain open.
- **Status: candidate only; not production-certified or commercially license-cleared.** See [QA-REPORT-2.8.93.md](r26-release-metadata/QA-REPORT-2.8.93.md) and [current FIX6 QA status](AUDIT-R22-FIX6-WINDOWS-TEST-REPAIRS-2026-11-08.md).

---

## ShopEasy 2.8.92 — zero-from-scratch audit fixes (2026-10-20)

- Removed three inline styles from EJS templates and replaced them with CSP-compatible CSS classes.
- Refreshed cache-busting keys for active styles/scripts.
- Updated stale source-contract tests to match current implementations.
- Full dependency-backed tests remain blocked until `npm ci` completes from a working npm registry.
- Candidate only; no production certification or commercial license clearance is claimed.

Current QA report: [QA-REPORT-2.8.93.md](r26-release-metadata/QA-REPORT-2.8.93.md).

## ShopEasy 2.8.91 — staff translation and regional pricing validation (2026-10-20)

- Completed key Sorani staff/account labels and explanatory copy; the actual Sorani and Arabic packs are checked by regression tests.
- Fixed regional tax rule parsing: the common selector validator now accepts the three destination fields (country, city, postal prefix) used by tax rules. Added tests for fee/tax specificity, arithmetic, invalid rates and disallowed destinations.
- Public docs now state that regional rates are manually entered by the seller and do not amount to statutory rate discovery or compliance certification.
- Focused translation/international-commerce tests: 20/20 passed. Full dependency-backed `npm test`, database/browser integration, legal tax review and staging verification remain unverified because the test preflight cannot resolve declared dependencies in this environment.
- Inherited blockers remain: Cloudflare PBKDF2 CPU compatibility, real-host rate-limit verification, and commercial rights/license clearance.

Current QA report: [QA-REPORT-2.8.93.md](r26-release-metadata/QA-REPORT-2.8.93.md).

---

## ShopEasy 2.8.90 — order lifecycle, after-sales and encrypted recovery (2026-10-20)

- Added customer-visible order history and opt-in Resend confirmation/status messages. Both order-email switches default to off; event deduplication and a daily cap constrain sends. No carrier or manager notification integration is claimed.
- Added account- and guest-order return/exchange/refund requests and manager workflow; guest orders require their HttpOnly per-order cookie, not an order ID alone. Refunds are recorded only after the manager issues them externally; no automatic money transfer exists. Exchange shipping uses an operator-entered reference; returned stock must be physically received and inspected before optional restock.
- Added manager-dashboard low-stock warnings and manual encrypted streaming database/media backup + restore. Restore is limited to a separate empty target; the key must be stored separately. Backup is not scheduled and can consume a free database plan's read/egress quota.
- Fixed refund validation to cap each request by its own quantity and cap combined refund records against the item/order totals; overlapping active return/exchange/refund requests reserve purchased quantities. Restore also normalizes source/target database identities before allowing a target.
- Verification in this environment: focused email/backup tests 10/10 and selected dependency-light suite 41/41; source/syntax/static/template checks are recorded in the current QA report. Dependency-backed `npm test`, HTTP/EJS/database integration, real-host benchmark, real e-mail delivery and staging restore are unverified because npm dependency installation did not complete. This release remains a QA candidate, not production-certified.
- Open inherited gates: Cloudflare PBKDF2 runtime compatibility, persistent single-instance rate limiter, source/asset rights clearance and effective commercial licence.

Current QA report: [QA-REPORT-2.8.93.md](r26-release-metadata/QA-REPORT-2.8.93.md). Backup instructions: [DATABASE-BACKUP-RESTORE.md](../../DATABASE-BACKUP-RESTORE.md).

---

## ShopEasy 2.8.87 — commercial-rights inventory candidate (2026-10-20)

- Added lockfile dependency inventory, asset provenance register, rights clearance register and installed-package license/NOTICE collector.
- Package stays `private: true` / `UNLICENSED`; `LICENSE.txt` remains draft-only. No ownership or resale authorization is inferred.
- No runtime ecommerce behavior changed. Not commercially license-cleared and not production-certified. See `history/release-artifacts/QA-REPORT-2.8.87.md`.

---

## 2.8.86 — test harness path corrections (2026-10-20)

- Corrected two static source-audit tests so they do not traverse the deliberately removed Vercel `api/` directory.
- Runtime behavior unchanged. `ejs` and `@libsql/client` are declared and pinned in package.json/package-lock.json; the authoring environment could not resolve registry.npmjs.org (`EAI_AGAIN`), so four dependent test files remain unverified here. They were not skipped or weakened.
- **QA candidate only, not production-certified.** See `history/QA-REPORT-2.8.86-HISTORICAL.md`.

## 2.8.85 — deployment and Manager bootstrap documentation alignment (2026-10-19)

- Verified the runtime bootstrap in `src/server.js` reads `MANAGER_NAME`, `MANAGER_EMAIL` and `MANAGER_PASSWORD`. `.env.example` and both deployment runbooks now describe that same flow. `ADMIN_EMAIL` / `ADMIN_PASSWORD` are documented only as legacy migration variables for existing local installs.
- Corrected stale current-release headings and labels, including the staging runbook, Manager/Staff guides, API reference, and Settings build indicator.
- Added regression tests for deployment env names, the Manager-first workflow and active version references. Runtime behavior has not changed in this documentation-only patch.
- QA candidate only; no claim of production certification. See `history/QA-REPORT-2.8.86-HISTORICAL.md`. Full dependency-backed tests and live Cloudflare/Turso deployment validation remain required.

## 2.8.84 — Vercel serverless rejection and Cloudflare + Turso profile (2026-10-19)

- Vercel/AWS Lambda serverless deployment is no longer supported. The Vercel build config fails explicitly; the old API adapter is removed.
- The supported free-first serverless target is Cloudflare Workers + Turso. Shared rate limiting uses the Cloudflare Durable Object binding `SHOP_RATE_LIMITER`; missing binding remains fail-closed.
- Free tiers have hard quotas; this does not promise unlimited customers/orders. Turso Free currently lists 5 GB, 500 million monthly row reads and 10 million monthly row writes. Cloudflare Workers Free currently lists 100,000 requests/day and a 10 ms CPU limit, and Durable Objects Free lists 100,000 requests/day. See the provider’s current terms before launch.
- **Not production-certified:** full test suite and real Worker CPU/database/browser staging still required. See `history/QA-REPORT-2.8.86-HISTORICAL.md`.
- At the time of 2.8.84, 62 targeted release/security/regression/Cloudflare contract tests were reported as passing. The full suite was not proven because dependency installation timed out and EJS/libSQL-dependent integration tests could not load. An older 381-pass/4-blocked result belongs to the preceding candidate and is not current full-suite proof.

## 2.8.83 — product detail overflow and Manager staging certification naming (2026-10-19)

- The Windows integration run exposed an additional stale assertion after Manager email change: the lookup for the old email returned `undefined`, but the test expected `null`. Both account-absence assertions now normalize `undefined`/`null` to `null` before asserting absence. A returned account row still fails the test; deletion, session invalidation and old-session redirect checks remain in place.

## 2.8.80 — product-description overflow and safe Admin deletion (2026-10-19)

- Fixes long or unbroken text in homepage featured-product descriptions and product cards with bounded line clamps, overflow wrapping and hidden overflow.
- Adds Manager-only `POST /admin/staff/delete-admin`, requiring a current Manager password. The database mutation is restricted to `role='admin'`; Manager/customer IDs fail closed. Admin sessions and reset data are revoked, and historical orders are retained.
- Adds regression contracts and integration coverage for wrong password, attempted Manager deletion, successful deletion and old-session revocation.
- Current test results and open limitations are in `history/QA-REPORT-2.8.86-HISTORICAL.md`. This package remains a QA candidate until full tests and browser/database checks pass; it is not production-certified.


Date: 19 October 2026.

## Historical verification record — pre-2.8.79 baseline

**Decision: QA candidate only — not production-certified.**

## 2.8.76 — registration/login rate-limit isolation hotfix

- Fixed the Windows integration failure caused by `/register` sharing the `login` rate-limit bucket. Registration now has its own 10-per-15-minute bucket; login remains at 10 per 15 minutes. Neither protection is disabled or weakened.
- Preserves the existing role boundary: only `manager` can access or mutate store-management routes; `admin` can view only the restricted overview and account security.
- Preserves Manager navigation, Admin product-action privacy, and read-only checkout-success behavior from 2.8.75.
- Historical note: the post-fix full test suite was not fully runnable in that authoring environment because dependency installation was blocked. Current provisioning changes and test limitations are in history/QA-REPORT-2.8.86-HISTORICAL.md.


Date: 19 October 2026.

## 2.8.73 — manager/admin data integrity and account access

### Confirmed source defects and data-integrity fixes

- Category/product/story/coupon edit IDs and optional category/product/variant relation IDs now fail closed when malformed instead of silently creating records, clearing relationships or treating an invalid variant as a base-stock operation.
- Manager action IDs and order/product/story detail IDs are validated before numeric conversion.
- Base-product restock is rejected by the database write whenever active variants control inventory.
- Pending COD and legacy COD acceptance aggregate duplicate order rows by product/variant, validate that variants belong to their line product and ensure reserved stock covers the aggregated quantity.
- Branding Save reads every submitted value back before showing success; coupon type values must be explicit; failed status changes and cancellation-request decisions display a manager-visible error; stale coupon/story deletes do not proceed as success.
- Category deletion now performs the existence/child checks and delete within one write transaction with a SQL no-child guard.
- Invalid/stale category, coupon and story deletes return visible errors rather than silent redirects.

### Confirmed source defect fixed

`scripts/create-staff.mjs` imported `hashPassword` from `src/auth.js`, which does not export it. The CLI now imports the function from `src/password-hashing.js`, the module that actually exports it. This 2.8.72 repair is retained in 2.8.73.

### Additional safety improvements

- Before creating a privileged account, the CLI displays a database target label with credentials omitted and requires the operator to type the exact target label and intended role (`MANAGER` or `ADMIN`).
- Name, email, role, password length and password confirmation are checked before any DB module is imported. This ordering matters because `src/db.js` performs schema initialization at import time.
- The validated, trimmed database URL and token are copied into the environment read by the DB module. No local-database fallback is allowed for this command.
- Sequential text input is queued safely. The password still requires an interactive terminal and is entered without echoing.
- The HTTP smoke test now creates and signs in a real `manager` user separately from the bootstrap admin. It asserts manager-allowed routes, admin-only 403 responses and that a direct Settings POST cannot mutate data. A separate source-contract test inventories every declared `/admin` route for an explicit role guard.

### Verification actually completed in this authoring environment

- `npm run build:cloudflare`: **PASS** — 35 EJS templates bundled.
- `npm run check`: **PASS** — 105 JavaScript/MJS files checked.
- `npm run audit:static`: **PASS** — 65 source/config files inspected; 1,196 EN/CKB/AR dictionary keys aligned; baseline checks passed.
- `node scripts/template-audit.mjs`: **PASS** — 35 templates inspected.
- `npm run preflight:release`: **PASS** — 60 production files scanned.
- Focused manager/admin/security group: **36/36 PASS** (including malformed IDs, optional relationship IDs, variant restock guard, category delete transaction contract, role/access control, password hashing, staff CLI, and order/branding/coupon guards).
- Data-integrity and sale-readiness group: **69/69 PASS**, including in-memory SQLite reservation aggregation and parent-category deletion guard.
- All tests that ran to completion passed: **360/360**; four test processes could not start, so the complete suite is not green.
- Full `npm test`: **360 PASS, 4 dependency-blocked imports, 364 total**. The four processes fail during import, before assertions: `ejs` is unavailable to `test/template-syntax.test.js`; `@libsql/client` is unavailable to `test/manager-dashboard.integration.test.js`, `test/product-variants.integration.test.js` and `test/upload-quota.integration.test.js`.
- `npm ci`: **NOT COMPLETED** — the environment's npm registry request failed with `EAI_AGAIN` for `registry.npmjs.org` and the install attempt timed out.

These results do not prove that the four blocked paths work; their runtime behavior is unknown in this environment. The manager HTTP/database integration and real staff account creation against Turso have **not** been executed here.

## Historical workflow defects fixed in previous 2.8.70/2.8.71 revisions

- Settings previously produced an HTTP 503 due to a missing `getRows` import. The source import and regression test were added.
- The settings smoke test expected obsolete success copy. The assertions now match the current launch-check and email-capability messages.
- Permanent deletion from the Archived products filter previously dropped the filter on redirect. The source, both forms and success-banner integration assertions were updated.
- Settings Save now reads the committed settings back before showing success; a mismatch produces an explicit error. The delivery-country allow-list accepts up to 250 entries and invalid submitted countries do not replace the prior valid allow-list.

Earlier Windows test counts are historical and are not the current suite result. The current release report and summary are `history/QA-REPORT-2.8.86-HISTORICAL.md` and `history/VERIFICATION-SUMMARY-2.8.86-HISTORICAL.txt`.

## Required before production

1. On a network-enabled clean machine, run `npm ci`, `npm run check`, `npm run build:cloudflare`, `npm run preflight:release`, `npm run audit:static`, `node scripts/template-audit.mjs` and `npm test`. Require zero failures and investigate any advisory result; do not apply blind major upgrades.
2. Against a disposable database, execute the HTTP integration test and verify the actual manager allow/deny matrix, valid-CSRF Settings POST rejection and no data mutation.
3. Run `npm run staff:create -- manager` against the intended Turso target in a real terminal, confirm the displayed target/role, create a test manager account, sign in and test permissions. Never put a password or DB token in chat, source control, a ZIP or a report.
4. Verify password change, invalid current password, confirmation mismatch and invalidation of other sessions through a real HTTP/database path.
5. Keep real customer orders disabled until checkout, product/variant stock, order cancellation, uploads, currency, delivery-country rules and desktop/mobile browser flows pass against staging data.

**Final decision: NO-GO for live customer orders until all dependency-backed and staging gates pass.**


## Supported deployment target (current release)

Vercel/AWS Lambda serverless deployment is unsupported because per-instance memory cannot enforce a shared rate limit. Use Cloudflare Workers + Turso only after staging validation; the provider free tiers have finite quotas and are not unlimited.