# ShopEasy 2.8.95 R28 FIX03

> **Current remediation candidate: 2.8.95 R28 FIX03. NOT production-certified.** All 31 tracked audit items have code remediations. The final local suite passed **1,420 tests, 0 failed and 0 skipped**, a net increase of **177 tests** over the 1,243-test repair baseline; **62 EJS templates** passed the template audit. See [REMEDIATION-FIX03.md](REMEDIATION-FIX03.md), [current QA](QA-REPORT-2.8.95.md) and [FIX03 evidence](docs/qa/fix03/).

Current browser execution was **BLOCKED before startup**: the pinned browser executable was unavailable, and the system-browser attempt failed with `socket() Operation not permitted`. No current browser, axe or Lighthouse result certifies FIX03. Live providers, real assistive technology, Windows execution and legal/commercial clearance remain separate validation work. The exact clean-copy package outcome must be read from the FIX03 [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json); local suite counts do not establish that later packaging result.


ShopEasy is an editable online-store starter with a server-rendered storefront, customer accounts and a Manager workspace. It includes catalogue and category management, image galleries, stock by option combination, COD orders, manual bank transfers, a Mollie hosted-card adapter, returns, discounts, gift cards and optional customer email features. The interface supports English, Sorani Kurdish, Arabic, Dutch and French.

**Technical release candidate; commercial rights remain open.** The seller has supplied no documentary source/asset ownership evidence. Buyer editing and rebranding intent is recorded, but the effective grant and chain of title remain **UNKNOWN**. [LICENSE.txt](LICENSE.txt) is draft-only; [the rights register](RIGHTS-CLEARANCE-REGISTER.md) and nine native dependency review gates remain open. A passing test run or collected notices do not establish sale readiness, legal compliance or complete security/accessibility coverage.

Start with the [buyer Admin guide](ADMIN-GUIDE.md). Developers should read [Architecture](ARCHITECTURE.md), the generated [Database schema](SCHEMA.md), [Features and limitations](FEATURES-AND-LIMITATIONS.md), and the [API reference](API-REFERENCE.md). The [Manager guide](MANAGER-GUIDE.md) contains day-to-day shop instructions.

## Fresh-copy setup

Use **Node.js >=24.22.2 <25** and npm. Run from a freshly extracted release before adding private files:

```sh
npm run verify:package
npm ci
npm run build:cloudflare
npm run check
npm run lint
npm run typecheck:core
npm test
```

`typecheck:core` checks four selected modules, not the entire application. `npm test` uses a temporary database per worker and does not load the shop's `.env`. Follow [QA setup](qa/README.md) for the separate Python 3.13 / Playwright 1.62.0 browser workflow and its pinned dependencies. Its fixture uses synthetic accounts, real computed TOTP and COD; optional intercepted email is **SIMULATED**, not inbox-delivery evidence.

After checks, follow [Quick start and environment](QUICK-START-AND-ENV.md), copy `.env.example` to a private `.env`, configure the intended store and run:

```sh
npm start
```

Open `http://localhost:3000`. `MANAGER_NAME`, `MANAGER_EMAIL` and `MANAGER_PASSWORD` bootstrap the first Manager only; `.env` does not reset an existing account. New/set/reset passwords require at least 15 Unicode characters and reject a small offline list of obvious examples/repetitions. Existing-account password verification remains compatible. Complete Manager MFA and secure recovery codes; see [Staff accounts](STAFF-ACCOUNTS.md). Demo seeding is off by default; `SEED_DEMO_DATA=true` is for a fresh disposable store only.

## Operating and releasing

The supported production route is **one persistent Node.js instance**, normally Linux with Caddy/systemd and persistent local SQLite. Set `RATE_LIMIT_BACKEND=memory-single-instance` and a public HTTPS `BASE_URL`; configure the real identity, currency, time zone, countries, prices and policies before checkout. See [Deployment](DEPLOYMENT.md), [Backup and restore](DATABASE-BACKUP-RESTORE.md), [Security](SECURITY.md) and the [Staging QA runbook](STAGING-QA-RUNBOOK.md). `npm run start:prod` uses a platform-independent Node wrapper; actual Windows execution still needs buyer validation.

Cloudflare build tooling is retained, but Workers authentication/deployment is blocked because its PBKDF2 limit conflicts with this application's 600,000 iterations. Vercel/AWS Lambda and horizontal scaling with the memory limiter are unsupported. The libSQL client API and remote database configuration remain present; that does not establish remote production equivalence.

Release packaging operates in a disposable copy and writes to a new output directory:

```sh
npm run release:verify -- --output ../ShopEasy-release-output-NEW
```

Windows users can use [FINALIZE-AND-VERIFY-WINDOWS.ps1](FINALIZE-AND-VERIFY-WINDOWS.ps1). Read [Release verification](RELEASE-VERIFICATION.md) before running either workflow. Do not package `.env`, databases, backups, uploads, private QA artifacts or a virtual environment. The staged deployment prepares and checks a new release before switching `current`; code rollback does not restore database state. Back up and rehearse recovery into a separate empty target.

## Capabilities and boundaries

- Manager has full management access; Admin is a restricted read-only overview role. Customer order access requires the authenticated owner or a valid guest bearer (protected cookie or explicit private-code POST field); email plus order number alone is insufficient.
- One store currency is supported. Precision rescaling before the first order is not exchange-rate conversion. Optional city/postal-prefix delivery-fee overrides and regional percentage-tax rules use values supplied by the operator; these are not legal-rate discovery or tax compliance. There is no statutory-rate lookup, filing or carrier integration.
- COD is the default. Bank transfers require actual statement review and manual confirmation. Mollie is the only card transaction adapter; PayTabs, FIB, iyzico, ZainCash and Stripe entries are contact/onboarding references. Card details stay on the provider's hosted checkout. Live settlement, refunds, inbox delivery and Peppol acceptance require separate provider/host tests.
- Privacy tools export data, delete eligible records or explicitly minimize contact data while retaining financial records and references under an operator-selected documented policy. Retained records are pseudonymous; this does not certify legal erasure or anonymity.
- Automated accessibility checks retain violations and incomplete items. Complete WCAG 2.2 AA, ASVS, physical-device/screen-reader coverage and Windows operation are not established by the bundled tests.

See [Features and limitations](FEATURES-AND-LIMITATIONS.md) for the full scope, [AI integration](AI-INTEGRATION.md) for optional bounded catalogue search, [Third-party notices](THIRD-PARTY-NOTICES.md) for exact dependency obligations and [Asset provenance](ASSET-PROVENANCE-REGISTER.md) for unresolved asset rights. The local `promise-limit` alias is first-party `@shopeasy/task-limit`, private/UNLICENSED; it is not the external ISC package. The notice inventory has 107 `node_modules` rows: 106 external and one first-party. npm advisory totals may count 108 components because the local vendor workspace is also counted; that is a different inventory, not another cleared third-party package.

## Evidence and history

[CHANGELOG.md](CHANGELOG.md) records release changes. Current remediation evidence is [REMEDIATION-FIX03.md](REMEDIATION-FIX03.md) and [docs/qa/fix03](docs/qa/fix03/). Use the exact candidate identity in `FINAL-VERIFICATION-REPORT.json` and the delivered ZIP SHA-256 to assess a packaged release; a report still naming an earlier candidate is historical. [FIX02-B](REMEDIATION-FIX02-B.md), [FIX02-A](REMEDIATION-FIX02-A.md), [FIX01](REMEDIATION-FIX01.md), earlier R28 reports, reports for older versions/R22 fixes, [R26 recheck](RECHECK-R26.md), [October pre-sale audit](PRE-SALE-RISK-AUDIT-2026-10-18.md), and older `docs/qa/` subdirectories remain **historical evidence with their own scope**. Their pass counts, browser scores and limitations are not current FIX03 observations. `PREVIEW*.html` files use sample content and do not process orders.

The [Seller Protection Pack](SELLER-PROTECTION-PACK/README.md) contains incomplete drafting/operating templates, including a draft proprietary commercial-license template, not yet effective. Complete actual identities, provenance, grants, retention, consumer/tax terms, processor arrangements and acceptance with qualified reviewers before offering a licensed copy. [Buyer use intent](SELLER-PROTECTION-PACK/BUYER-USE-INTENT.md) records the requested editing/rebranding scope without creating an effective grant.

Current FIX03 results: [remediation](REMEDIATION-FIX03.md), [QA](QA-REPORT-2.8.95.md) and [evidence](docs/qa/fix03/). The earlier [R28 audit](AUDIT-REPORT.md), [R28 cleanup](R28-CLEANUP-REPORT.md) and [R28 buyer checklist](docs/qa/r28/BUYER-RERUN-CHECKLIST.txt) are retained as historical baseline records. Use the actual FIX03 package report, ZIP digest and matching validation records for this delivery.
