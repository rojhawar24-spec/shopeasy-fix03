# ShopEasy FIX10 — repaired audit findings and verification (2026-11-08)

**Starting archive:** `ShopEasy-R22-FIX9-FULL-REPAIR-2026-11-08.zip`, original SHA-256 `50d130a7b9d2fd737baa8dc8b8ac217dbb46484023d8d2bf72b40a98c5dfdae0`; original not changed. New FIX10 archive is a separate candidate.

**Release decision:** **NOT PRODUCTION CERTIFIED; NOT CLEARED FOR COMMERCIAL RESALE.** Verified offline regressions are not a substitute for live Node.js 24/Windows/hosting/financial tests, license ownership, provider certification or regulatory review.

## Responses to FIX9 audit findings

| Finding | Changed source | Result / limits |
|---|---|---|
| F01 French public pages incorrectly `noindex` and omitted from SEO | `src/seo-locales.js`, `views/partials/header.ejs` | Removed unconditional French exclusion; French-only and multilingual sitemap/canonical/hreflang regression tests pass. Faceted searches/private routes remain non-indexable. Needs a live crawler/HTTPS smoke check. |
| F02 16 broken preview links | Five `PREVIEW-*.html` fixture files | All relative fixture href/src targets now resolve. This does not prove the live Express routes. |
| F03 fake bank account `ABCDE` activated checkout | `src/services/bank-transfer.js` | Reject purely alphabetic identifiers and too-short/non-numeric local identifiers; keep tested non-IBAN formats for international markets. Formatting **never** establishes real existence, matching beneficiary or receipt; Manager must verify. Existing saved invalid accounts fail readiness until corrected. |
| F04 vulnerable/outdated rate limiter | `package.json`, `package-lock.json`, `THIRD-PARTY-NOTICES.md`, tests | Exact `express-rate-limit@8.7.3` pinned with published SHA-512. Not runtime verified due missing packages here. |
| F05 French server-rendered English fallback | `views/partials/header.ejs`, `views/admin/settings.ejs` | Added French search/nav/accessibility and AI privacy-copy fallbacks. Other server templates and legally binding policies still require native-speaker review. |
| F06 commercial rights pending | `RIGHTS-CLEARANCE-REGISTER.md`, `LICENSE.txt` unchanged | **OPEN**: no technical patch can establish a legal right to sell or sublicense. Must gather contributor/asset/dependency rights and obtain legal review first. |
| F07 missing source lint/typecheck | `scripts/lint-project.mjs`, `tsconfig.typecheck-core.json`, `package.json`, CI | Added no-dependencies source-hygiene/relative-import lint plus pinned TypeScript and **three-module-scoped** JS typecheck. Full codebase type coverage and ESLint-level rules still not available. |

## Executed offline checks (source checkout)

```text
node --test [175 dependency-independent FIX9 test files] test/fix10-recovery-regressions.test.js
# tests 885
# pass 885
# fail 0
# skipped 0

npm run lint
PASS: lint hygiene on 276 JS/MJS/CJS source files; 178 static relative imports resolved; no conflict markers or forbidden runtime debug primitives.

npm run typecheck:core
[type-check exit 0; only src/store-config.js, src/seo-locales.js, src/services/bank-transfer.js]

npm run check
Syntax check passed: all 276 JS/MJS files

npm run audit:static
Static audit passed: 122 source/config files inspected

npm run preflight:release
Release preflight passed: 2.8.93; 117 production files scanned.

node scripts/template-audit.mjs
Template audit passed: 59 EJS templates inspected.

python scripts/r8-audit-sqlite.py
SQL DDL PASS: 3 DDL blocks x2; 33 tables, 59 indexes, integrity_check ok; 6 constraint probes passed

python scripts/verify-financial-sqlite.py
Concurrent balance withdrawal CAS PASS — 16 attempts, 1 debit, final €20.00
Gift redemption uniqueness PASS

Chromium: 7 in-memory static preview pages x 2 viewport sizes
IN_MEMORY_PREVIEW_TOTALS {'completed': 14, 'errors': 0, 'overflow': 0, 'brokenImages': 0, 'duplicateIds': 0}
```

**Verification scope:** npm-based dependencies were unavailable in this runtime (Node `v22.16.0`, required `>=24.22.2 <25`, offline npm registry). Full `npm test`, `npm run audit`, end-to-end role/CSRF/IDOR/auth/MFA/security, database migrations using live `@libsql/client`, real upload and checkout, payment/webhook and provider outage simulations, load/stress tests, mobile screen reader and production HTTPS checks were **not performed successfully here**. The headless Chromium screenshots are static design previews only; they do not render the actual server application.

## Required Windows/production follow-up

1. In a **fresh FIX10 folder**, run `node -v` and confirm Node `>=24.22.2 <25`.
2. **Before** installing packages, creating `.env` or generating any build output, run `npm run verify:package`.
3. Run `npm ci`, `npm run check`, `npm run lint`, `npm run typecheck:core`, `npm test`, `npm run audit`, `npm audit --omit=dev --audit-level=high`. Capture exact outputs; do not declare a test passed if blocked.
4. With an isolated test database and known test credentials, run full Manager+Admin+customer login/MFA, add/replace/remove/restore product, stock and images, account registration/recovery, guest/account checkout, COD, manually verified bank transfer, Mollie sandbox, refunds, backup/restore, network/database/provider failure injection and rate-limit tests.
5. Confirm french-only public page, sitemap and canonical in a running HTTPS deployment; perform WCAG/mobile/RTL keyboard, screen reader, performance/load and cache checks.
6. Obtain contributor/third-party/asset/marketing rights evidence, actual merchant identity/terms, GDPR/DPA, buyer agreement, local consumer regulations, tax and Peppol/accountant review before commercialization.

**Security note:** validation of an account number, IBAN or VAT checksum never proves existence, ownership, business validity, payment settlement or legal compliance. No secrets, production databases or real customer records are in the ZIP.
