# FIX9 — remediation and from-scratch recheck (8 November 2026)

**Project:** ShopEasy 2.8.93 R22, based on the original FIX8 ZIP. The original FIX8 archive was not edited. FIX9 is a separate full handover candidate.

**Decision: TECHNICAL QA CANDIDATE — NOT CLEARED FOR COMMERCIAL RESALE OR PRODUCTION.** Not all user-requested actions can be certified without Node.js 24, dependency installation, real browser/HTTP/SQLite operations and a licensed seller.

## Repaired issues from the FIX8 read-only audit

| ID | Severity originally | Path | Repair | Verification |
|---|---|---|---|---|
| F01 French untranslated | High | `public/js/i18n-fr.js` | Manually translated English source-identical UI texts, from 1,665/1,829 to 36/1,829. The 36 unchanged strings are shared French/English terms or technical/numeric labels. All 1,829 source keys and dynamic placeholders retained. | `node --test test/fix9-french-completeness.test.js` (4/4 pass), `node scripts/check-syntax.mjs` (274 pass). Native copyediting and accessibility review still required. |
| F02 date locale | Medium | `src/security.js` | Add `fr-BE` and `fr` to explicitly supported date formatting locales. | `node --test test/fix9-regression.test.js` and updated `test/market-defaults-and-readiness.test.js`. |
| F03 fake Belgian VAT/IBAN | Medium | `src/services/peppol-recommand.js` | Validate Belgian enterprise check digits (MOD-97), require valid `0208:` and `BE` IDs to match; validate IBAN with full existing validator, not format only. | Regression tests reject `0208:0123456789`, `BE0123456789`, `BE00000000000000`, malformed values; accept checksum-valid test fixtures. |
| F04 ownership/licence | High | `package.json`, `RIGHTS-CLEARANCE-REGISTER.md`, `LICENSE.txt` | **OPEN — cannot lawfully claim ownership or grant a license without evidence.** Remains `private: true`, `license: UNLICENSED`, `NOT CLEARED FOR COMMERCIAL RESALE`. | Manual legal/rightsholder confirmation required; code cannot create ownership rights. |

Note: Peppol number checksum validation is necessary but **does not verify that an entity exists, that its VAT is currently active, that a customer is correctly onboarded, or that an invoice complies with EN 16931.** External provider testing is still necessary.

## Executed commands and actual summary output

All commands executed from the extracted FIX9 working copy; raw logs are included in a separate evidence ZIP.

```
node --test $(cat /tmp/shopeasy-audit-standalone-only-files.txt) test/fix9-regression.test.js test/fix9-french-completeness.test.js
# tests 865
# pass 865
# fail 0
# skipped 0

node scripts/check-syntax.mjs
Syntax check passed: all 274 JS/MJS files (root entrypoints plus src, scripts, public/js, test, generated).

node scripts/static-audit.mjs
Static audit passed: 122 source/config files inspected; 1829 aligned dictionary keys (EN/CKB/AR/NL), COD default, hosted Mollie card eligibility, password-recovery-code-email, archive and baseline security rules verified.

node scripts/preflight-release.mjs
Release preflight passed: 2.8.93; 117 production files scanned.

python /mnt/data/shopeasy_fix9_structural_audit.py
FILES 474 TEXT_LINES 60876 TOTAL_BYTES 6828645
JSON 5 PYTHON 8 SVG 13 CSS 17 EJS 59
RELATIVE_IMPORTS_CHECKED 176 HTTP_ROUTES_DECLARED 137 POST_ROUTES_DECLARED 68
HTML_FORMS 109 POST_FORMS 99 POST_FORMS_WITHOUT_STATIC_CSRF_NEARBY []
SHIPPED_SECRETS_OR_DATABASE_CANDIDATES []
PARSING_OR_IMPORT_ERRORS 0
```

The 176 import and 99 form checks are **static structural checks**, not proof of correct runtime authorization/CSRF handling, data persistence, or role access. All bundled source files were traversed and byte-read for inventory; code-execution coverage is narrower.

### Offline visual fixture checks

Used `python /mnt/data/shopeasy_fix9_preview_browser.py` with installed headless Chromium. The preview HTML was supplied through `page.set_content` with local CSS and images inlined because the sandbox blocks browser access to both `file:` URLs and local HTTP. Five static fixture pages × desktop 1365px/mobile 390px = ten screens; all had zero page exceptions, zero console errors, zero broken inline images and no document-level horizontal overflow. These pages are **static sample content**, not the actual EJS/SQLite/Manager/checkout HTTP application. Verified preview names: `PREVIEW.html`, `PREVIEW-MANAGER.html`, `PREVIEW-CART-R7.html`, `PREVIEW-CHECKOUT-R7.html`, `PREVIEW-PRODUCT-R6.html`.

## Blocked / not executed — do not infer success

```
node -v
v22.16.0

npm test
Test preflight failed: @libsql/client, cookie-parser, dotenv, ejs, express, express-rate-limit, helmet, multer, qrcode-generator are declared in package.json but not installed or resolvable.

npm ci --offline --no-audit --no-fund
npm warn EBADENGINE Unsupported engine
required: node >=24.22.2 <25
current: node v22.16.0
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz failed: cache mode is 'only-if-cached' but no cached response is available.
```

No successful full install/start, actual EJS rendering with project dependencies, live guest/customer/Manager/Admin role flow, password-reset emails, authenticated HTTP route fuzzing, SQLite migrations under contention, checkout/payments, provider webhooks, real uploads, backup+restore on disk, accessibility screen-reader audit, sustained load or network-fault simulation was run in this environment. No production security certification is claimed.

## What to run on Windows with Node.js 24 (fresh FIX9 folder)

```powershell
node -v
npm run verify:package     # before npm ci and before creating .env or data
npm ci
npm run check
npm test
npm run audit
npm audit --omit=dev --audit-level=high
```

Then configure **test-only credentials and a test-only SQLite database**, run a staging server, and explicitly test login, Manager MFA, checkout, real uploads, inventory reservations, backup/restore, payment sandbox and role access. Do **not** overwrite or move a production `.env`, SQLite file, MFA encryption key or uploaded images without a verified backup and migration plan.

## User-visible conclusion

Technical findings F01–F03 have targeted code corrections and passing offline regression checks. F04 remains legally open; full Node 24 and browser/real server validation remain open. Therefore the release must not be described as absolutely defect-free, 100/100, production-certified or legally cleared for resale.
