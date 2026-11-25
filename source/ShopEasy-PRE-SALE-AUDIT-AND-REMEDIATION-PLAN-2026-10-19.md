# ShopEasy pre-sale audit and remediation plan

**Baseline audited:** `ShopEasy-2.8.82-MANAGER-INTEGRATION-ASSERTION-FIX-2026-10-19.zip`; source-level follow-up patch in `ShopEasy 2.8.83`  
**Audit date:** 19 October 2026  
**Decision:** **NO-GO for commercial resale or live customer orders until the gates below are satisfied.**  
**Scope note:** This is a source/package audit. It is not a penetration test, a completed manual browser run, legal advice, proof of ownership, or production certification.

## Executive summary

ShopEasy has a substantial starter foundation: Manager/Admin separation, CSRF validation, request limits, hashed passwords, server-side price/stock checks, transactional checkout/inventory operations, archived product lifecycle, category hierarchy, EN/CKB/AR UI dictionaries, sitemap/product structured data, and documented QA checks. These should be retained and protected by regression tests.

The project is not ready to sell as a reusable commercial template. The current package explicitly says its commercial license is **draft only**, source/code and asset rights are unconfirmed, and resale/rebranding/sublicensing permissions have not been granted. On the technical side, full integration tests are not completely verified in this audit environment, there has not been a live/disposable-database browser workflow, and several expected retail capabilities are either missing or materially limited.

## Evidence gathered

- Source and file inventory inspected from the 2.8.82 ZIP.
- `node scripts/check-syntax.mjs`: **passed** (110 JS/MJS files).
- `node scripts/preflight-release.mjs`: **passed** (2.8.82, 62 production files scanned).
- `npm run audit:static`: **passed** (67 source/config files; dictionary alignment and selected security/config contracts verified).
- `node scripts/template-audit.mjs`: **passed** (37 EJS templates inspected).
- `npm test` in this audit environment: **379 passed, 4 test files failed to load** because the interrupted dependency installation left `ejs` and `@libsql/client` unavailable. The blocked files include Manager dashboard integration, product-variant integration, EJS template compilation, and upload-quota integration. These are **blocked, not passed**.
- The 2.8.82 integration script now normalizes absent-user lookups to `null` for the old Manager email and deleted Admin checks. The user-provided failure log was from the 2.8.81 directory, so it does not prove that 2.8.82 has passed the same integration test.
- `package-lock.json` lists 105 dependency packages; most declare MIT/ISC/Apache/BSD licenses, but `busboy` and `streamsearch` are missing license metadata in the lock file and need review against their exact distributed package contents and notices.
- `LICENSE.txt` states “DRAFT ONLY — NOT AN EFFECTIVE LICENSE” and says ownership/resale/redistribution/rebranding permissions are unconfirmed. `package.json` uses `UNLICENSED`.

## Follow-up validation for 2.8.83 candidate

- After the CSS cache-busting test expectation was aligned with the new preview URL, the test suite reports **381 passed, 4 blocked at module load** (385 total entries). The four blocked entries require `ejs` and `@libsql/client`, which were unavailable because the authoring environment's `npm ci` attempt timed out. These four integration/template paths remain unverified, not passed.
- Re-ran `npm run build:cloudflare`: **PASS**, 37 EJS templates bundled.
- Re-ran `npm run check`: **PASS**, 111 JavaScript/MJS files.
- Re-ran `npm run preflight:release`: **PASS**, 62 production files.
- Re-ran `npm run audit:static`: **PASS**, 67 source/config files and 1,198 aligned EN/CKB/AR dictionary keys.
- Re-ran `node scripts/template-audit.mjs`: **PASS**, 37 EJS templates.
- Focused CSS/release/staging-config test group: **15/15 PASS**.

## Follow-up patch status (2.8.83 candidate)

The 2.8.83 source patch closes two source-level gaps identified during the baseline audit: product-detail description overflow now has regression-tested width/word-wrapping safeguards and a new cache-busting URL, and the staging certification script/runbook now name the authenticated account as Manager while accepting older `STAGING_ADMIN_*` aliases. These changes do **not** close the P0 commercial/license or full integration/browser gates below.

## Findings by priority

### P0 — Must be resolved before selling or taking live orders

1. **Commercial rights and license are not cleared.** The package does not include an effective ShopEasy customer license. Verify authorship/ownership or written permission for all included code and assets; identify third-party license obligations; decide whether the intended product is a single-store installation, multi-client white-label template, or reseller/SaaS license; then have the commercial terms completed and reviewed. The current draft is not evidence that resale rights exist.
2. **Full test suite must run cleanly in a complete environment.** Run a clean install and all tests with no module-load failures, then resolve any actual failing assertions. Do not weaken security assertions simply to get green tests.
3. **Real database and browser integration is not yet certified.** On a disposable copy of the database, exercise sign-in, Manager-only page access, Admin denial of every management write, create/delete Admin, Manager email/password changes, product create/edit/archive/restore/delete, image upload, category hierarchy, coupons, COD checkout, stock reservation, duplicate checkout, cancellation, and all settings save paths. Verify database read-after-write and that failed actions do not mutate data.
4. **Backup/restore and operational recovery.** No end-to-end Manager-facing backup/restore workflow was found in the route inventory. Provide documented, tested backup/restore procedures for the database and uploaded assets, run a restore rehearsal, and document recovery time/point expectations. Do not claim recoverability until restore has been tested.
5. **Launch-market legal configuration.** Keep checkout blocked until the store owner supplies correct identity/contact details, total pricing/tax handling, delivery and returns policies, complaint process, and other disclosures for the chosen market. Default/sample policy text is not a substitute for legal review.

### P1 — Core retail capabilities to fix/add before positioning this as a broad multi-category template

1. **Product description overflow on the detail page — source-level fix applied in 2.8.83, browser proof still required.** `.detail-description` now has `overflow-wrap:anywhere`, bounded width and `min-width:0` safeguards plus a regression contract. Verify actual desktop, narrow mobile and RTL rendering in a real browser.
2. **Only one option dimension per product variant.** The `product_variants` model has a single `option_name` and `option_value` and uniqueness is based on `(product_id, option_value)`. This is not a complete color × size matrix. To support fashion/sport reliably, design variant groups and combinations (for example Size and Color), each with a unique SKU/barcode if required, stock/reservations, price override if supported, image mapping and order snapshot. Migrate old single-option records without losing stock or order history.
3. **Single primary image per product.** Products have one `image_url`; a proper retail product gallery with multiple images, ordering, alt text, primary image selection, safe removal and upload-quota cleanup was not found. Add a product image table and manager UI or explicitly narrow the product scope before sale.
4. **Order/customer emails are not implemented beyond password recovery.** `src/server.js` imports `sendPasswordResetCodeEmail`; no order-confirmation/status email send flow was found, although an order column tracks `confirmation_email_sent_at`. Add idempotent confirmation notifications and Manager-controlled provider configuration, or clearly document this as unsupported. Test retry behavior and avoid duplicate sends.
5. **Returns/refunds workflow is incomplete.** Cancellation requests exist, but a full post-delivery return/exchange/refund state machine and audit trail were not found. This can be handled manually initially, but the product must say so accurately and the store owner needs a safe process that preserves orders and inventory history.
6. **Delivery model is basic.** The current design uses a country allow-list and a configured shipping fee; no carrier integration, per-zone/city fees, label generation, or tracking integration was found. Treat these as future add-ons or specify them as out of scope instead of implying that delivery is automated.
7. **Customer privacy requests.** No full user-facing personal-data export/erasure request workflow was found. Add a controlled process for handling access/export/deletion requests while preserving records the business must lawfully retain; document retention, backups, access control and data breach procedures.
8. **Staging certification naming — corrected in 2.8.83.** The script now uses `STAGING_MANAGER_EMAIL/PASSWORD` and retains `STAGING_ADMIN_*` as backwards-compatible aliases; verify the authenticated gate against staging with a real Manager account.
9. **Catalog discovery is basic.** Search and category navigation exist, but configurable category-specific facets (brand, size, color, condition, material/specification), availability and price filters, active-filter chips and robust empty results are not yet a complete marketplace-level system. Implement reusable attribute definitions per store profile rather than hard-coding fashion fields into every shop.
10. **Product data import/export.** A Manager CSV import/export path for products/variants/stock was not found. Add validation-preview, error-row reporting, idempotent update policy, backups before bulk changes and export tests.

### P2 — Important quality and maintainability improvements

1. **Visual browser testing.** The source tests do not replace Playwright/manual testing at common desktop/mobile widths, keyboard-only navigation, touch interactions, screen readers, and EN/CKB/AR including RTL. Introduce automated screenshots plus functional end-to-end journeys.
2. **Performance baseline.** `src/server.js` is about 155 KB / 2,025 lines, `public/css/style.css` about 298 KB, and the language dictionaries total hundreds of KB. This is not an automatic failure, but it increases maintenance and delivery costs. Measure compressed transfer size, cache behavior, LCP/INP/CLS, database query counts, and representative catalog scale before optimizing.
3. **Localization/content separation.** EN/CKB/AR UI dictionaries align, but key storefront/product copy is authored in templates and product data is not automatically translated. Make this limitation clear and add per-locale product/category content only if it is a real product requirement.
4. **Accessibility review.** Static checks cover some alt text, buttons and forms; they do not certify WCAG conformance. Test keyboard focus, focus order, validation announcements, contrast, zoom/reflow, error recovery and RTL layout manually and with appropriate automated tools.
5. **Production observability.** Confirm operational logs never expose passwords, reset codes, tokens, customer addresses or raw exception data. Add tested database-error alerts and rate-limit/backup status checks without leaking personal data.
6. **Trademark/name check.** Check availability/conflicts for the ShopEasy product name and domain before investing in marketing or signing customer agreements.

## Required acceptance gates for the next release

### Gate A — Reproducible clean build

1. Use Node.js 24.x; `package.json` requires `>=24 <25`.
2. `npm ci` exits 0.
3. `npm run check` exits 0.
4. `npm run build:cloudflare` exits 0.
5. `npm run preflight:release` exits 0.
6. `npm run audit:static` exits 0.
7. `node scripts/template-audit.mjs` exits 0.
8. `npm test` exits 0 with no module-load failures, skipped critical integrations, or unexplained failures.
9. `npm audit` is reviewed against the actual deployed dependency tree; record the date and outcome.

### Gate B — Functional database/browser checklist

- [ ] Fresh install bootstraps one Manager and no default Admin.
- [ ] Existing database migration is tested from a copy and preserves users, products, images, orders, stock and settings.
- [ ] Admin can view only the restricted overview; direct URLs and POST requests to all protected operations return 403 and do not mutate data.
- [ ] Manager can create, delete and safely reset credentials for Admin accounts; sessions and reset records are invalidated correctly.
- [ ] Manager create/edit/delete/archive/restore works for products, categories, stories and coupons, including malformed input, stale forms and duplicate submissions.
- [ ] Long descriptions without spaces do not overflow homepage, card, product detail, cart, checkout, manager tables or RTL layouts.
- [ ] Images pass MIME/signature, size, quota, shared-reference and deletion tests; product images do not break after deployment/restart.
- [ ] Order totals/coupons/shipping/tax display match server calculations exactly; invalid country/currency/terms fail safely.
- [ ] Stock cannot oversell under concurrent checkout; duplicate/retried checkout produces one order; cancellation releases reservations exactly once.
- [ ] Customer order access is correctly authorized for account and guest token paths.
- [ ] Backup can be restored successfully to a clean test environment.
- [ ] All pages are exercised in a real browser, all supported languages and RTL, narrow mobile, keyboard-only and zoom/reflow.

### Gate C — Commercial and launch package

- [ ] Effective seller license/terms state the exact rights granted (one store vs multiple clients, white-label, modifications, source distribution, support, updates, hosting and payment terms).
- [ ] Dependency and asset attribution/notices are reviewed; resolve missing license metadata for `busboy` and `streamsearch` from exact package contents/upstream sources.
- [ ] Rights to the code, fonts, images, logos, sample content, and name are confirmed.
- [ ] Install guide, update/backup/restore guide, Manager guide, known limitations, hosting costs, data responsibilities and support scope are complete.
- [ ] A clean customer demo store is included without personal customer data, real credentials, `.env`, database, uploaded private images, or `node_modules`.
- [ ] Staging deployment and a disposable test store have passed certification before a production sale/deployment.

## Suggested implementation order

1. **Freeze the release and close P0s:** clean dependency install, full tests, resolve runtime failures, database/browser certification, and license/IP review.
2. **Fix baseline usability regressions:** long product description on all surfaces, then cross-browser/RTL screenshot checks.
3. **Strengthen core catalog:** multiple images and true multi-attribute variant combinations with a lossless migration.
4. **Strengthen order operations:** confirmations/status notifications, documented return workflow, exports, and tested backup/restore.
5. **Complete commercial onboarding:** store profile setup, market-specific delivery/tax settings, accessibility/SEO review, customer docs, effective license and versioned install/update steps.
6. **Run Gate A, B and C again on a clean release candidate.** Make no production-ready claim before every applicable gate passes.

## External official references for launch review

- EU distance/e-commerce selling disclosures and withdrawal information: https://europa.eu/youreurope/business/selling-in-eu/selling-goods-services/ecommerce-distance-selling/index_en.htm
- Belgian business start and registration overview: https://business.belgium.be/nl/uw-bedrijf-oprichten
- EU contract information for buyers: https://europa.eu/youreurope/citizens/consumers/shopping/contract-information/index_en.htm
- GitHub's overview of what happens when a repository has no license: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository
- Google product structured data: https://developers.google.com/search/docs/appearance/structured-data/merchant-listing
- Web Content Accessibility Guidelines (WCAG) 2.2: https://www.w3.org/TR/WCAG22/

These references are starting points; they do not certify compliance or replace market-specific professional advice.
