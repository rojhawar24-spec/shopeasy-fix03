# ShopEasy changelog — 2.8.95 R28 FIX03

## 2.8.95 R28 FIX03 — current remediation candidate

- Implement code remediations for all **31/31 tracked audit items** across security, commerce/data integrity, frontend behavior, operations and performance. Item-level changes, evidence and limits are recorded in [REMEDIATION-FIX03.md](REMEDIATION-FIX03.md) and [docs/qa/fix03](docs/qa/fix03/).
- Keep public registrations pending; require an explicit verification POST with the mail token and original registration password, or trusted Manager ownership approval with a different fresh password. An unsolicited verification-link GET does not activate the account.
- Add bounded order-email delivery claims, immutable retry payload/key handling and Manager reconciliation tied to the reviewed attempt/generation. Reconciliation does not send automatically; uncertain provider outcomes require review.
- Align cancellation actions with the shared provider/state policy, protect same-SKU exchange stock and preserve complete variant identity in purchase/return/restock interfaces. Repair asynchronous UI races, currency display precision, merchant-text translation protection, safe Back links, paging and keyboard/semantic controls.
- Update operational documentation and retain the original audit and prior candidate evidence. Current release entry points now distinguish FIX03 results from historical R28/FIX01/FIX02 claims.
- **Final local suite: 1,420 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo.** This is **177 net new tests** over the 1,243-test repair baseline. The template audit passed **62 EJS templates**. See [current QA](QA-REPORT-2.8.95.md); the exact fresh clean-package result is recorded separately in [FINAL-VERIFICATION-REPORT.json](FINAL-VERIFICATION-REPORT.json), without assuming its outcome here.
- **Browser checks BLOCKED before startup:** the pinned browser executable was unavailable; the system-browser launch failed with `socket() Operation not permitted`. No current browser/axe/Lighthouse certificate or production certification is asserted. Live providers, real assistive technology, Windows and legal/commercial clearance remain separate validation work.

## Historical release notes — retained unchanged below

The entries below describe earlier source revisions and their original environments. Their test counts, browser scores, pending checks and candidate labels are historical, not results for FIX03. In particular, FIX01/FIX02 native-execution limitations and the older R28 browser observations must not be presented as current findings or current passes.

# ShopEasy R22 FIX11 — Belgian checkout and French server fallback (8 November 2026)

## 2.8.95 / remediation candidate FIX02-B — 24 November 2026

- ES-004: annotate trigger-created status history without duplicate inserts.
- ES-008: minimize associated audit metadata in both privacy deletion modes.
- ES-009: reject incomplete snapshot media backups before publication.
- 18 new regression tests; native libSQL and HTTP verification remain open. See REMEDIATION-FIX02-B.md.

## 2.8.95 / remediation candidate FIX02-A — 24 November 2026

- ES-001/002: validate canonicalized local redirect destinations with shared helper.
- ES-003: consume highest eligible matching TOTP step within verification window.
- ES-006: atomically bind MFA activation to the verified encrypted enrollment secret.
- Seven new regression tests; update activation fixtures; native and HTTP verification still incomplete. Seven P2 findings remain. See REMEDIATION-FIX02-A.md.

## 2.8.95 / remediation candidate FIX01 — 24 November 2026

- ES-005: bind authenticated session issuance and MFA challenge issuance to the verified password hash, email and role in a conditional SQL write. Guard password-authenticated MFA enrollment mutations as well. Preserve anonymous cart, wishlist and coupon on successful login; fail closed on stale credentials. No database schema change.
- Add a regression suite for both reset/issuance orderings, Manager challenge and enrollment paths, missing proof and successful sign-in. Native driver and HTTP verification remain blocked. Historical R28 verification is not evidence for this derivative.

## 2.8.95 — R28 remediation, 22 November 2026

- Serialize cart intents and use compare-and-swap normalization; retain checkout quotes on unchanged reads and preserve concurrent adds/update/remove.
- Make password/email changes and session revocation atomic; serialize verification cooldown issuance, retain confirmed stock-alert consent, and correct the French branding label.
- Roll back failed restore schema/rows/media changes; fail closed on integrity/FK errors; refuse backup output over source/sidecar/unrelated files and preserve recognized backup rotation.
- Fix cookie-dialog and mobile-drawer focus restoration, initial narrow-shop heading hierarchy, table semantics, symbolic control naming and dark/contact/order/badge contrast.
- Compile five unchanged-cascade CSS authoring layers to two minified files, use bounded queued gzip/Brotli, and report complete-body load timing. No selector purging.
- Update dotenv/EJS/rate limiter and the reviewed pure-JS TypeScript line, keep environment loading quiet, collect exact notices and retain nine native legal UNKNOWN gates.
- Localize static metadata, preserve merchant names, provide a bounded read-only complete sitemap crawl, and retain honest public/Windows/legal/manual limits.
- Final integrated validation and final archive contents/hash are recorded separately after execution; no zero-bug or effective commercial grant is asserted.


- Belgian delivery countries now enforce full Standard launch readiness even if Simplified COD is selected; Manager can still save drafts, and simplified non-Belgian stores remain supported. Backend and Manager preview agree.
- Added French first-paint HTML for the shop/category header, filtering, notices, customer navigation, contact information and footer/consent fragments; client translation remains available for other dynamic elements.
- Hardened optional policy parsing against `null` input. New adversarial/regression tests and a four-module scoped TypeScript check cover these changes.
- Regenerated Cloudflare EJS source and updated multilingual source-based tests. Independently executable **892/892 tests passed**; full Node 24 dependency-backed HTTP/MFA/checkout tests have not been executed in this environment.
- **NO-GO for production/commercial resale:** third-party rights, legal identity, provider integration, actual server/browser security tests and commercial license approval remain external gates.
- See [FIX11 QA evidence](docs/qa/FIX11-CHECKOUT-AND-FRENCH-SERVER-REMEDIATION-2026-11-08.md).

---

# ShopEasy FIX10 — confirmed FIX9 audit findings repaired (8 November 2026)

- **French search indexing:** removed unconditional French `noindex` from the EJS header and included enabled French pages in canonical/alternate language URLs and sitemaps. Added regression checks for French-only and multilingual stores, private paths and pagination.
- **Preview navigation:** repaired 16 dead relative preview links, targeting existing supplied HTML preview files. These are static fixtures and do not assert live checkout.
- **Bank transfer:** non-IBAN local account numbers must now have a credible account-number shape and at least six numeric digits; five-letter placeholders such as `ABCDE` no longer activate bank transfer. Real account ownership/existence still requires independent Manager verification.
- **Security dependency:** pinned `express-rate-limit@8.7.3` with its published npm tarball SHA-512 integrity, matching `package-lock.json`; upstream 8.7.2 fixed GHSA-j3cq-92fq-qg5f. Do not claim runtime compatibility without a full `npm ci` and Node 24 integration test.
- **French fallback:** added French branches for server-rendered search, language selector, navigation, Manager logout and optional AI privacy disclosures in the header and Manager settings. Human translation review still needed.
- **QA tooling:** added dependency-free `npm run lint` for source hygiene / static import paths and `npm run typecheck:core` on three security-relevant JS modules, with TypeScript 5.8.3 in the lockfile and CI gates. These do NOT constitute full-project semantic lint or type coverage.
- **Evidence:** targeted new FIX10 regression tests, independent 885-test subset, source preflight/security checks, SQLite DDL and concurrent balance tests, and 14 in-memory browser static fixture checks. Full Node 24 HTTP/MFA/database/checkout integration remains unexecuted here.
- **Legal status unchanged:** `private: true`, `license: UNLICENSED`, `NOT CLEARED FOR COMMERCIAL RESALE`. No automatic legal clearance.

---

# ShopEasy 2.8.93 R22 FIX9 — French copy, locale and financial-validation remediation (8 November 2026)

- Source-reviewed repair of `src/security.js` French `fr`/`fr-BE` date formatting without changing non-French locale behavior.
- Reject malformed Belgian 0208 Peppol participant numbers and `BE` VAT identifiers unless the enterprise checksum MOD-97 is correct; require matching participant and customer enterprise numbers. Validate invoice payment IBAN with the existing full ISO MOD-97 validator, including length, country, normalization and checksum.
- Translated the French browser runtime dictionary from 1,665 English-identical values to 36 genuine shared words, identifiers and numeric placeholders; retained all 1,829 source keys and all dynamic replacement placeholders.
- Added independent tests for French localization, numeric checksum validity and Peppol malformed input. Updated the one legacy test expecting the old locale whitelist.
- **Executed here:** 865 dependency-light Node tests passed; syntax 274 JS/MJS passed; static security audit 122 source/config files passed; production preflight 117 files passed; 10 offline Chromium static-preview checks (desktop/mobile) showed no console/page errors, missing images or viewport overflow. The 99 POST forms each contain a CSRF field in static source; 137 HTTP route definitions inventoried.
- **Not completed:** `npm ci` cannot resolve offline packages; installed Node v22.16.0 is below the required Node >=24.22.2 <25. Therefore **full `npm test`, HTTP/database/MFA/checkout/payment tests and production deploy are NOT VERIFIED**. French legal and marketing copy needs native-speaking review and server-side localization review before making SEO/public compliance claims. Rights status remains **NOT CLEARED FOR COMMERCIAL RESALE**. Do not treat these changes as certification.

## 2.8.94 — R27 pre-sale technical cleanup (2026-11-14)

- Require account ownership or guest bearer proof for order lookup/returns; apply private/no-store before early dynamic errors; strengthen new-password policy while preserving existing-password sign-in.
- Serialize category reparenting, terminate legacy cyclic listings, align SQL/display sale instants, and surface failed startup migrations.
- Add explicit customer-data minimization with operator policy reference while preserving financial ledgers; retain clear default-deletion refusals and open-order/return protections.
- Correct accessible names, seller-text translation protection, history-submit recovery, narrow-screen layouts, contrast and content section semantics.
- Isolate test workers and quota fixtures from source/real data; preserve actual libSQL ArrayBuffer BLOBs in encrypted backup/restore.
- Add byte-preserving direct-Node public asset gzip, safe staged packaging/deployment, portable production startup, complete env reference and repeatable buyer browser QA.
- Capture exact-version dependency notices and replace the uncollected external promise-limit with a new local first-party limiter; native legal review and source/asset ownership remain open.
- Refresh architecture/schema/admin/release documentation. Test results and limits are in QA-REPORT-2.8.94.md and R27-CLEANUP-REPORT.md. This is NOT production-certified or rights-cleared.

## 2026-11-08 — FIX8 source review (still NOT production or resale certified)

- Fixed Manager MFA language picker being blocked by the incomplete-challenge route guard, without exempting it from CSRF.
- Forwarded French locale to optional AI catalog search; added French cookie-policy and legal-policy fallback text and cash/card-transfer banner translations.
- Regenerated Cloudflare EJS view bundle; added offline regression tests and [FIX8 audit report](docs/qa/AUDIT-FIX8-FULL-REVIEW-2026-11-08.md).
- Remaining: French dictionary is largely English; full Node 24 and deployed-browser/checkout/security/regulatory checks are not certified; rights are NOT CLEARED FOR COMMERCIAL RESALE.

# 2.8.93 R12.11 E2 REPAIR13 — manual bank transfer and AI-assisted catalog search (3 November 2026)

- Added an optional manual bank-transfer checkout method. The Manager must configure a validated bank identifier/account holder; the order stores an immutable bank-instruction snapshot and a unique `SHOP-<order>` reference. A pending transfer remains unpaid until a Manager verifies the actual bank statement, exact amount and currency, and records the bank transaction reference. No automatic bank feed, Open Banking or screenshot-based proof is implemented.
- Added Manager-only, CSRF-protected bank-transfer confirmation and Manager-reviewed customer cancellation requests while a bank transfer may be in flight. Confirmation validates the pending provider, exact order amount/currency, unique transaction reference and stock reservation inside a write transaction.
- Added optional AI-assisted full-page catalog search. A configured OpenAI-compatible provider receives only the customer's search phrase and UI locale and can return at most three bounded alternatives. Parameterized SQL searches ShopEasy's active catalog; AI cannot invent products, prices or inventory. The provider is optional; failures fall back to ordinary SQL search.
- Kept Mollie hosted checkout as the only implemented card-provider transaction integration. FIB, PayTabs, iyzico, ZainCash and Stripe remain onboarding/contact references only. No live card, external AI-provider or real bank settlement was exercised in the authoring environment.
- Added focused bank-transfer and AI-search unit tests; advanced all active CSS/JS cache keys and corresponding regression expectations to `2.8.93-r12.11-e2-repair13-hardcheck-2026-11-04`.
- Validation in this authoring environment (Node.js 22.16.0): syntax 206/206; static audit 90 files / 1,829 aligned EN/CKB/AR/NL keys; EJS static audit 47/47; release preflight 89 production files; Cloudflare source build passed; focused relevant tests 153/153 passed across payment/order and UI/cache groups. The repository requires Node.js 24.x. `npm ci` did not complete here, so the full `npm test` suite, live EJS/HTTP/database/browser flow, Mollie sandbox, external AI provider, real bank reconciliation and production deployment are **not verified**.
- **Status: REPAIR13 QA candidate only — NO-GO for production.** Preserve local `.env`, database, uploads and MFA key during upgrade. Use the included Windows installer only after stopping the local server; it creates a pre-install backup and checks Node.js 24.

---

# 2.8.93 R12.11 E2 Repair 12 — startup environment and MFA recovery (2 November 2026)

- Added `src/bootstrap.js` as the Node.js entrypoint. It loads `.env` before dynamically importing `src/server.js`, `src/db.js` and `src/database.js`, preventing the database client and startup seed/default settings from being initialized before configured environment variables are available. `npm start`, `npm run dev`, the production start script and the systemd unit now use this entrypoint. The Cloudflare-generated worker continues importing `server.js` directly with its injected environment and does not load dotenv.
- Improved expired Manager MFA handling: expired GET/POST challenge flows return to `/login?mfa=expired`, where the login page explains that the five-minute challenge must be restarted. The five-minute security lifetime and five-attempt rate limit are unchanged. This prevents a stale MFA form from ending on a dead-end error page; it does not bypass MFA.
- Expanded the local read-only database diagnostic to inspect required Manager MFA/user/challenge/rate-limit columns as well as checkout/session/catalogue schema. It still never selects or prints secret/hash values.
- Added dependency-free regression tests for environment bootstrap ordering, expired MFA recovery, and the expanded safe diagnostic.
- Validation on Node.js 22.16.0: syntax, static audit, 47 EJS template audit, release preflight and Cloudflare source build rerun after changes. Focused dependency-light tests are run and listed in the Repair 12 report. Full application integration and full test suite remain blocked here because npm registry DNS is unavailable and the project requires Node.js 24.x.
- **Status: QA candidate only — NO-GO for production pending full Node.js 24 dependency-backed tests and live Manager/MFA/checkout staging tests.**

---

# 2.8.93 R12.11 E2 Repair 11 — checkout schema compatibility hotfix (2 November 2026)

- Added the missing idempotent migration for `orders.client_token`. The checkout POST reads this column with `getOrderByClientToken()` before reserving stock or inserting an order. Existing databases created before that column was added can retain an older `orders` table because `CREATE TABLE IF NOT EXISTS` does not add missing columns; the lookup then throws `no such column: client_token`, causing the generic checkout error before an order is created. The migration adds the nullable column without changing existing order rows and creates a filtered unique index for non-empty tokens.
- Added request-stage markers before rate limiting, body parsing, session authentication, Manager MFA challenge checks, CSRF handling, shared storefront settings/navigation and the checkout route. The local development error handler records a short diagnostic reference, failing stage, error name/code/message and stack to `data/checkout-diagnostics.log`; it does not log the submitted form body or customer contact/address fields.
- Added `npm run diagnose:checkout`, a local-only read-only SQLite integrity/schema check. It refuses remote databases and missing database files, does not create a missing database, does not write order rows, and does not change SQLite journal mode.
- Corrected the new diagnostic regression tests to locate the stage-aware route signature and added checks for the read-only/local-only diagnostic behavior.
- Validation in this authoring environment: JavaScript/MJS syntax 201/201; static audit 88 files and 1,829 aligned EN/CKB/AR/NL dictionary keys; EJS template audit 47/47; release preflight 87 production files; focused checkout/schema-migration tests 10/10; archive integrity verified.
- Full `npm test` was blocked by the dependency preflight because this authoring environment has no installed project dependencies and Node.js 22.16.0, while the project requires Node.js 24.x. No live Windows database, browser checkout, Manager order visibility or payment-provider test was performed. The `client_token` migration is a concrete compatibility defect that matches the observed failure pattern, but the exact state of the user's database is not confirmed until the local diagnostic runs after the updated server starts.
- **Status: QA hotfix candidate only — NO-GO for production.** See `R12.11-E2-REPAIR11-CHECKOUT-SCHEMA-HOTFIX-REPORT-2026-11-02.md`.

---

# 2.8.93 R12.11 E2 Repair 10 — checkout diagnostics and release-test corrections (1 November 2026)

- Wrapped the complete `POST /checkout` route, including pre-order cart, store/payment, session, policy, currency, idempotency and pricing operations, in an outer error boundary. Unexpected errors now report the failing checkout stage and stack in the local development terminal. The diagnostic log deliberately excludes customer form values, addresses, emails, session IDs and security/idempotency tokens.
- Added request method/path context to development-only unhandled-error logs.
- Corrected the uncertain-checkout page: it no longer claims the previous submission was not saved while also warning customers not to retry.
- Updated the route reference and release contract from 103 to the actual 105 route declarations, including the two local-only Manager recovery routes.
- Removed the final inline style from `views/local-manager-recovery.ejs` and moved its maximum width to `public/css/app.css`.
- Added checkout error-diagnostic regression tests.
- Validation in the authoring environment: syntax audit (200 JS/MJS files), static audit (88 source/config files), EJS template audit (47 templates), route inventory audit (105/105 documented), and focused checkout/release tests (21/21) passed. The full Node.js 24 suite was not run here because this environment uses Node.js 22.16.0 and does not have the project dependencies installed.
- **Status: diagnostic QA candidate only — NO-GO for production.** The exact exception from the user's original machine is not known until the new stage-aware log captures a single reproduction.

# 2.8.93 R12.11 E2 Repair 8 — full-suite QA follow-up

- Completed the environment example used by local email and staging certification: added blank `EMAIL_LOCALE`, disabled-by-default order email flags, and blank staging Manager credentials. No live credentials were added.
- Added the current ShopEasy build label to Manager Settings so the active release is visible in the interface.
- Gave the shared Manager navigation a stable accessible name and moved the small-screen scrolling hint into its accessible description.
- Updated the Manager integration assertion to accept the existing clear confirmation copy, `Product saved successfully.`, while still requiring the accessible save-confirmation region.
- No checkout calculations, payment behavior, database schema, authentication, permissions, MFA, or customer data were changed.
- Full Node.js 24 suite and live browser verification must be rerun on this exact archive. QA candidate only; not production-certified.

# 2.8.93 R12.11 E2 Repair 7 — Oracle environment template consistency

- Added `CLOUDFLARE_WORKER=0` to `.env.example` so the shipped example matches the Oracle deployment gate in `deploy.sh` and the zero-release audit.
- Clarified the release-hardening test name: Cloudflare + Turso remains an optional legacy/compatibility path; the documented primary persistent deployment remains Oracle Ubuntu + Node.js 24 + local SQLite.
- No checkout, payment, database schema, Manager/Admin permission, MFA or customer-data behavior was changed.
- Focused zero-release audit: 6/6 passed; JavaScript syntax, template audit, static source audit, release preflight and Cloudflare source build are recorded in the Repair 7 report.
- QA candidate only; full Node.js 24 suite and local authenticated browser order flow remain required before production.

# 2.8.93 R12.11 E2 Repair 6 — responsive UI and Manager usability audit

- Corrected the Manager dashboard's tablet-width min-content overflow; the workspace and nested dashboard grids can now shrink without widening the document.
- Converted dashboard and recent-order tables to readable labelled cards at widths up to 899 px, keeping each order action reachable.
- Made Manager data-table scroll regions keyboard reachable and named for assistive technology.
- Reworked Settings validation feedback into a linked summary that jumps to the affected field group; normal Settings page loads are safe when no validation errors exist.
- Restored the safe `.env.example` file expected by the release audit and documented local defaults with empty secrets.
- Updated the static Manager preview to mirror the production workspace wrapper; advanced active cache keys to REPAIR6.
- Browser checks on static Manager/storefront previews: 44 viewport/direction cases across 320–1920 px, no document-level horizontal overflow. Focused dependency-light UI/design/Manager tests: 198/198; syntax: 198/198; templates: 46/46; static audit: 87 files / 1,829 aligned locale keys; release preflight: 86 production files; Cloudflare build: 46 templates.
- Full `npm test`, live authenticated browser click-through, database and MFA integration remain outstanding: the authoring environment is Node.js 22.16.0 (project requires Node.js 24) and has no installed project dependencies. **QA candidate only — not production-certified.**

# 2.8.93 R12.11 E2 Repair 5 — Manager content shell

- Corrected the Manager page structure instead of only changing sidebar styling: the Manager navigation now opens one explicit `.admin-workspace-content` wrapper, and every Manager page section is rendered inside that wrapper. The shared footer closes it only when the Manager template explicitly marks the shell as open.
- Wide screens use a two-column workspace (navigation rail + one continuous content region). At widths up to 1279 px, the navigation becomes a horizontally scrollable row and the content uses the full available width.
- Kept Manager links as normal server-side anchors and preserved Manager/Admin permissions, authentication, MFA, CSRF, account forms and stored data.
- Focused tests: 24/24; syntax: 197/197; static audit: 87 files and 1,829 aligned locale keys; EJS static audit: 46/46; Cloudflare source build completed. Full Node.js 24 tests and real browser verification remain outstanding because this authoring environment runs Node 22.16.0 and lacks the installed runtime dependencies.
- QA candidate only — not production-certified.

# 2.8.93 R12.11 E2 Repair 3 — Manager tablet workspace

- Fixed the Manager navigation layout at tablet widths (640–1023 px): the 224 px fixed sidebar is replaced with a horizontally scrollable, sticky workspace navigation bar. The Manager account content now receives the full available viewport width instead of being compressed beside a fixed rail.
- Kept the desktop persistent sidebar unchanged. Compact Manager language/account/logout controls are retained at all tablet and mobile widths.
- Added `manager-tablet-workspace-layout.test.js` to prevent regression of the tablet workspace and header behavior. No authentication, account roles, MFA secrets, database records or business data were changed.
- Browser-based visual verification and Node.js 24 full-suite verification remain required; this is a targeted source repair, not production certification.

# Changelog

## 2.8.93 — R12.11 E2 Repair 2 (1 November 2026)
- Fixed a shared Manager/Admin header defect: at tablet and mobile breakpoints, generic navigation was hidden while the Manager hamburger was also hidden. Account/Overview and Logout controls therefore disappeared.
- Manager/Admin pages now render a dedicated, always-visible account-action area. Full-access Manager gets `/admin/staff` Account + Logout; restricted Admin gets Overview + Logout only. Existing server authorization remains unchanged.
- Removed customer-store search markup from Manager routes, including the unwanted mobile search row.
- Added a compact CSRF-protected language selector inside the Manager header, so language can be changed without leaving the workspace.
- Added responsive header contract tests. Combined focused Manager/design/regression tests: **68/68 PASS** (Manager-specific subgroup **25/25 PASS**). Syntax: 194/194; static audit: 87 files / 1,829 aligned keys per locale; 46 EJS static templates; CSS build; 46-template Cloudflare source build; 86-file release preflight all pass.
- Full Node.js 24 `npm test`, dependency-backed EJS render, live Manager HTTP/MFA/database integration and `npm audit` remain required. The authoring container has Node.js 22.16.0 and no installed project dependencies. **QA candidate only — NO-GO for production.**

## 2.8.93 — R12.11 E2 Repair 1 (1 November 2026)
- Fixed the active Manager product-gallery CSS selector so the direct child preview image receives the intended responsive image treatment (`.product-gallery-editor-item > img`).
- Added an explicit `:focus-visible` outline for removable active catalogue filter chips, backed by the shared `--color-focus-ring` design token. Keyboard users can now see which chip is focused.
- Corrected the responsive regression contract to match the E2 grid: four product columns on desktop, three on tablet and two on mobile. Replaced stale D1 Manager-navigation selectors in the test with the E2 shared `.admin-nav` structure.
- Kept the existing semantic `<main id="main-content" class="…">` markup and skip link. The source test now verifies that the main element has the target ID while allowing the valid layout class attribute; no duplicate or nested `<main>` element was added.
- Advanced the shared CSS/JS cache key to `2.8.93-r12.11-e2-repair1-2026-11-01` in runtime templates and both static previews.
- Targeted dependency-light regression suite: **55/55 PASS**, including product-gallery, filter-chip keyboard focus, CSS token cleanliness, responsive layouts, RTL/cache rules and release-hardening tests.
- The EJS-dependent `sale-readiness.test.js`, full `npm test` under the required Node.js 24, and `npm audit` could not be executed in this authoring environment because project dependencies are not installed and this container runs Node.js 22.16.0. These remain required on the user's supported Windows environment.
- **Status: QA candidate only — NO-GO for production.** The separate full-code-audit findings are not addressed by this UI regression repair.

## 2.8.93 — R12.11 E2 design-system rebuild (1 November 2026)
- Replaced the active visual system with a new navy, white, blue and coral retail identity.
- Rebuilt responsive storefront, product catalogue, product detail, cart, checkout, account and policy presentation while preserving existing commerce form and route hooks.
- Rebuilt Manager/Admin presentation around a desktop operations sidebar and a compact mobile navigation rail.
- Reworked typography, hierarchy, spacing, panels, controls, tables, statuses, cookie consent, focus states and RTL layouts.
- Replaced the previous stylesheet cascade with one compact `public/css/app.css`; no legacy design layers are loaded at runtime.
- Completed explicit component coverage for account, order, product detail, product editor, gallery, variant controls, payment settings, privacy/cookie dialogs, mobile navigation, stock and price details, and shop filters.
- Audited all 525 static class names found in the 46 EJS templates; every class has a selector in the active E2 stylesheet.
- Added standalone `PREVIEW.html` and `PREVIEW-MANAGER.html` sample pages. They are visual references, not a live server or real shop data.
- Final local verification: 98/98 design/CSS tests and 23/23 language/runtime tests; 193 JS/MJS syntax files; 87-file static audit; 46-template static audit; CSS build; Cloudflare source build; 86-file release preflight.
- Live Chromium screenshots, dynamic EJS rendering, the full Node.js 24 test suite and npm audit are not verified in this environment. Existing security/operations issues in the full audit remain separate from this visual redesign.
- This is a design candidate. It does not certify production, dynamic EJS rendering, payment journeys, or assistive-technology conformance.

- Fixed the exact remaining Windows integration failure reported from `R12.10-REPAIRED2`: the simple-product form rendered the stock input as “Units in stock” while `manager-dashboard-integration.mjs` requires the visible label “Quantity in stock”. The underlying `name="stock"`, required validation, zero default, variant-disable behavior and server stock handling were already present and are preserved.
- The simple-product helper now explicitly says: “You do not need to create a size to track stock.” It also tells the Manager to enter the number of individual units available for sale. This explains that ordinary products do not need a size or variant.
- Added the new stock label and helper copy to English, Belgian Dutch, Sorani and Arabic master/runtime dictionaries. Dictionary parity is now 1,829 keys in each locale.
- Updated the source-level inventory regression to assert the current visible label and helper copy; did not weaken or remove the HTTP integration assertion.
- Validation after the correction: 49/49 dependency-light focused tests PASS; 193 JS/MJS syntax files PASS; static audit PASS (87 files, 1,829 aligned EN/CKB/AR/NL keys); 46-template static EJS audit PASS; design CSS build PASS; 46-template Cloudflare source build PASS; 86-file release preflight PASS.
- **The Windows HTTP integration test has not yet been rerun after this specific copy correction.** The earlier user-provided Windows run was 677 total: 675 pass, 1 fail and 1 skipped. Its single failure was the simple-product stock label assertion described above. The authoring container lacks EJS/libSQL runtime dependencies and uses Node 22, so it cannot independently repeat the user's Node 24 HTTP integration.
- `npm audit`, full `npm test` on Node.js 24, live EJS/database/browser journeys and staging/payment/backup checks remain required. **QA candidate only — NO-GO for production.**

## 2.8.93 — R12.10 Windows-test corrective follow-up (2026-11-01)

- Reconciled the Manager navigation refactor with its regression tests: all Manager pages include the single shared navigation partial; the active Audit item is rendered from the current route; the read-only Admin role receives no Manager navigation links.
- Restored explicit Settings copy distinguishing draft saving from checkout readiness, and aligned the Save dock's unsaved-state label with the UI contract. The Settings page now states directly that products, delivery coverage or policy gaps close checkout but do not prevent saving a draft.
- Added a Manager inventory regression covering physical stock minus reserved stock, simple-product rows, active variant rows, reorder thresholds and consistent dashboard counts.
- Restored a release lockfile matching `package.json` (lockfile v3) and refreshed the security-sensitive resolved versions: `body-parser@2.4.0`, `qs@6.17.1`, `multer@2.5.0`, `express@5.3.0` and `helmet@8.3.0`. SHA-512 SRI metadata is present for every resolved package entry; the npm registry must still verify the downloads during `npm ci`.
- Verification after this follow-up: 44 dependency-light focused regression tests passed; 192 JS/MJS files passed syntax; static audit passed (87 files, 1,828 aligned EN/CKB/AR/NL keys); static EJS audit passed (46 templates); CSS build, 46-template Cloudflare source bundle and 86-file release preflight passed.
- The full `npm test`, live EJS rendering, clean Node.js 24 installation and `npm audit` have not been run in this authoring container because its Node runtime is 22.16.0 and the npm registry cannot be resolved. These checks must be completed on a supported Node.js 24 machine. The candidate remains **NO-GO for production**.

## 2.8.93 — R12.10 Manager and storefront UX correction (2026-11-01)

- Replaced the duplicated dashboard-only navigation with one shared, grouped Manager navigation. The read-only Admin dashboard remains separate and does not gain management links. Navigation labels are available in English, Belgian Dutch, Sorani and Arabic.
- Simplified the product inventory editor: ordinary products use one stock quantity; option-based products use named choices and separate stock per combination. SKU and optional variant image URL are grouped under advanced details. Existing stock and SKU values are retained when the same combination is regenerated.
- Clarified product-save confirmation and visibility status, and reorganized the Settings readiness checklist with direct links to missing setup sections. Saving a draft does not open checkout.
- Product cards now open product details; they do not add directly to the bag. Removed duplicate image-overlay actions and product-card gallery thumbnails. Add-to-bag remains an explicit action on product details, with a success state and a safe return to the product page.
- Removed the generic “Collection” fallback when a product has no category and shortened featured-section copy for Belgian Dutch. Existing store product names/descriptions remain database content and are not overwritten by this code update.
- Added focused UX regression tests and updated the generated Cloudflare view bundle. Existing CSRF, stock reservation, price validation, checkout idempotency and role protections are preserved by the changed routes/templates.
- Verification in this environment: 16 focused UX/regression tests pass; 190 JS/MJS syntax checks pass; static audit verifies 1,828 aligned translation keys across EN/CKB/AR/NL; 46 EJS templates pass the repository's static template audit; Cloudflare view bundle builds successfully.
- Full `npm test`, real EJS-engine compilation, Node 24 runtime, live database/browser journey and fresh `npm audit` were not verified in this environment. The current worker uses Node 22 and did not have a complete dependency installation. Keep the `package-lock.json` created by the user's successful `npm audit fix`; this UX overlay does not replace it.
- **Status: UX correction candidate — not a production certification.** Run `npm ci`, `npm audit` and the complete `npm test` on the Windows project with Node.js 24 before approving deployment.

## 2.8.93 — R12.10 Dutch UI and design hard-audit candidate (2026-11-01)

- Added the Dutch (`nl-BE`, LTR) customer UI locale alongside English, Sorani and Arabic; connected language preferences, Manager settings, branding, per-language policy fields, storefront metadata, accessibility attributes, checkout locale and transactional email copy. Dutch remains opt-in for existing shops.
- Synchronized all four runtime dictionaries at 1,757 keys and added regression coverage for placeholder parity, dynamic phrases, long/newline placeholders, accessibility labels, cookie storage errors, policy fallback disclosure and localized order/verification/return emails.
- Design fixes from a fresh page-family review: retain two product columns at narrow mobile widths; use legible product title/price sizes and contain product photography; bound checkout and order totals; separate order timeline, delivery and item-price content; prevent Manager dashboard/table min-content overflow; make Manager navigation a single horizontal scroller on narrow screens; improve account order rows and product-table mobile accessibility; align CSS asset cache tokens.
- Browser-fixture QA: 184 Chromium static fixture renders across storefront, product, cart, checkout, account, login, order, success and Manager/Admin page families, LTR/RTL and mobile/tablet/desktop widths. All 184 had zero page-level horizontal overflow and zero broken fixture images. These are static HTML/CSS fixtures, not a live EJS/server/browser journey; synthetic product images are placeholders for layout verification.
- Verification: 189 JS/MJS syntax files, 86-file static source/config audit, 45 EJS template audit, single active stylesheet build, 45-template Cloudflare source bundle and 85-file release preflight pass. Focused design/responsive/RTL/checkout/account/order/Manager tests pass 128/128.
- Full direct test diagnostic: 657 total, 642 pass, 15 blocked at dependency import/integration startup because required packages are absent (`@libsql/client`, `ejs`, `qrcode-generator`, `jsqr` and integration dependencies). The standard `npm test` preflight correctly fails closed. Runtime is Node.js 22.16.0; project requires Node.js >=24 <25.
- **Status: R12.10 audit candidate only — NO-GO for production.** Clean Node 24 install/full suite, `npm audit`, live EJS/browser/database tests, live Mollie sandbox, backup/restore rehearsal, native Belgian Dutch proofreading and legal/commercial-rights clearance remain open. See `DESIGN-HARD-AUDIT-2026-11-01.md` and `R12.10-FROM-SCRATCH-AUDIT-2026-11-01.md`.

## 2.8.93 — R12.6 storefront, Manager, checkout and payment audit (2026-10-30)

- Re-ran 89 focused regression tests across language preferences, storefront translations, Manager/Admin permissions, staff management, settings validation, XSS/upload safeguards, Mollie hosted checkout, checkout idempotency, order/cart safety and payment reconciliation: 89/89 PASS.
- Revalidated 180 JS/MJS syntax files, 84 source/config files, 1,365 aligned EN/CKB/AR dictionary keys, 45 EJS templates, release preflight and the single active stylesheet. Shell syntax checks for `deploy.sh` and `backup.sh` pass.
- Audit-only checkpoint: no source behavior changed. Dutch remains unavailable as a storefront language until its full localization is complete.
- Full suite remains blocked by missing runtime dependencies and Node.js 22.16.0 (project requires Node.js 24). No live browser, database, restore or Mollie transaction test is claimed. **Status: WIP / NO-GO.**

## 2.8.93 — R12.4 restore-path canonicalization hardening (2026-10-30)

- Hardened the restore-target safety guard against local SQLite paths that reach the same database through a symbolic-link directory. Existing files resolve through `realpath`; not-yet-created restore targets resolve their nearest existing parent before identity comparison.
- Added regression coverage for both an existing database reached through a symlink and a future target below a symlinked directory. This closes a path-alias gap in the existing configured-source protection; it does not prove that two unrelated remote-provider URLs cannot alias the same remote database.
- Focused backup/restore test file: 12/12 PASS. Full `npm test` remains blocked pending a clean install under Node.js 24.
- **Status: WIP / NO-GO.** No production restore or hosting action was performed.

## 2.8.93 — R12.1 Oracle SQLite path consistency correction (2026-10-30)

- Corrected the Oracle deployment preflight and deployment guide to use the same `file:./data/shop.db` database path as `.env.example`, the local database adapter, staff-account tooling and restore tooling.
- Added a regression test that compares the example environment, deployment script, deployment guide and runtime default so a future filename drift is caught.
- Verification in this environment: syntax check, static audit and EJS template audit pass; focused release/deployment regression tests pass 5/5. Full `npm test` is blocked because the required runtime packages are not installed. `npm ci` did not complete before the environment timeout; Node here is v22.16.0, not the required Node 24.
- **Status: WIP / NO-GO.** This correction does not certify database restore, checkout, payments, browser behavior or production hosting.

## 2.8.93 — R11 full from-scratch audit and release-pointer alignment (2026-10-29)

- Started from a fresh extraction of the R10 candidate ZIP and reran the available verification steps without a prior `node_modules` directory.
- Revalidated archive integrity/exclusions, 177 JavaScript/MJS syntax files, 84-file static audit, 45 EJS static templates, release preflight, the single active CSS build and Cloudflare source build.
- Full direct test diagnostic: 601 total, 586 pass, 15 blocked at dependency import/integration startup. All 586 tests not requiring the missing packages pass when executed alone. The 15 blocked tests remain unknown, not passed.
- Updated the current release status and deployment/start instructions so they no longer direct users to an R5 ZIP. No production runtime behavior changed in R11; R10's provider currency correction remains the latest code change.
- **Status: R11 audit candidate only — NO-GO for production.** Node 24 clean install, full dependency-backed tests, `npm audit`, real Mollie sandbox/webhook/refund tests, live browser QA, Dutch runtime localization, rights/legal review and backup/restore validation remain open. See `R11-FULL-FROM-SCRATCH-AUDIT-2026-10-29.md`.

## 2.8.93 — R9 deep audit and payment-accounting hardening candidate (2026-10-29)

- Fixed a currency-scale bug in Manager refund recording: entered amounts are parsed using the original order currency, not the store's current setting.
- Fixed coupon-adjusted refund ceilings by deterministically allocating order-level coupon discount across lines; recorded refunds cannot exceed the item net after coupon allocation, per request, line and order. The Manager UI now shows the per-request net refund ceiling.
- Added verified Mollie refund/chargeback financial snapshots to orders with forward-safe schema migrations, currency/amount validation, audit events and a Manager warning. Financial reconciliation is distinct from the local return ledger and does not automatically change order status or move money.
- Added a CSRF-protected Manager action to refresh current Mollie refund/chargeback totals for existing card orders without changing fulfilment state. Added regression tests for amount parsing, zero-decimal currencies, bad currencies/amounts, coupon allocation and API documentation route inventory.
- Focused security/payment/checkout/return/backup/documentation regression group passes **77/77**. Refund UI ceilings now also deduct previously recorded item/order refunds; malformed ledger values fail closed. Syntax passes **177 JS/MJS files**; static audit, 45-template audit, release preflight and Cloudflare source build pass.
- The final direct full diagnostic suite reports **601 total: 586 passed, 15 failed**. All 15 failed test cases are blocked at module-load/integration startup by dependencies absent from this environment; `npm test` correctly stops at `pretest` rather than misreporting a pass.
- **Status: R9 candidate only — NO-GO for production.** Clean Node.js 24 install/full dependency-backed suite/npm audit, Mollie sandbox/webhook/refund/chargeback testing, actual browser visual QA, Dutch runtime locale, legal/rights clearance and production backup/restore drill remain open. Do not accept real card payments.

## 2.8.93 — R8 full audit and payment-race fixes (2026-10-29)

- Restored `.env.example` to the release archive; it is required by the static audit and is distinct from private `.env` secrets.
- Fixed the early Mollie webhook race: if the provider webhook arrives before `payment_reference` is persisted, the handler may recover only through verified provider metadata, exact order amount/currency and the same payment ID.
- Fixed the same-reference URL persistence race and the fast-webhook success path so a verified paid order is shown as success instead of a misleading checkout error; different reference/URL values are never overwritten.
- Added explicit `authorized` reconciliation/display while keeping the order pending until the provider reports `paid`.
- Added the Multer 2.5.0 SHA-512 SRI value from independently indexed public lockfiles; release preflight now passes, but a clean `npm ci` under Node.js 24 must still validate the tarball.
- Focused payment/checkout hardening tests pass 26/26. The latest direct full-suite diagnostic reports 588 total: 573 passed and 15 failed during dependency/module loading. The 408-entry ZIP passes archive integrity and release-policy checks; no full pass or production certification is claimed.
- **Status: R8 candidate only — no real card payments until Node 24 dependency, Mollie sandbox, full-browser, legal/rights and backup/restore gates pass.** See `QA-REPORT-2.8.93.md`.

## 2.8.93 — R7 payment-recovery and checkout-hardening candidate (2026-10-28)

- Added a Manager-only Mollie reconciliation workflow for pending orders whose payment creation may have succeeded but the API response was lost. The server retrieves the payment directly from Mollie and requires matching test/live mode, exact ShopEasy order metadata, amount and currency before it can update the order.
- Reconciliation never trusts the submitted reference alone; the manager form is CSRF-protected, and only provider-confirmed `paid` or terminal states cause the matching state transition. A pending payment cannot be canceled through the generic order control while the provider result is uncertain.
- Hardened checkout idempotency with a deterministic opaque SHA-256-derived Mollie `Idempotency-Key`, strict provider response validation, conflict/transient error classification, session-persisted checkout credentials and a compare-and-swap rotation when an order was confirmed cancelled.
- Improved the Manager order screen so an uncertain Mollie attempt is clearly marked for verification rather than offering an unsafe generic cancel action.
- Added focused regressions for reconciliation, provider mode/amount/currency/metadata matching, transient responses and retry safety. The full npm suite still cannot complete in this authoring environment: `node_modules` is absent and the npm registry is unreachable; Node.js 24, clean install, `npm audit` and live sandbox transaction/webhook tests remain required.
- Visual review remains source/fixture based in this environment because the browser screenshot engine was blocked; do not treat it as full live browser certification.
- **Status: R7 candidate only — not production-certified or commercially license-cleared.**

## 2.8.93 — R6 follow-up verification and cookie-layout refinements (2026-10-28)

- Moved default safe-area variables into the canonical first `:root` design-token block, fixing the CSS custom-property cleanliness audit; retained logical RTL inset swapping.
- Refined the compact consent banner: privacy-policy/customize links sit outside the two equal decision actions, and the mobile eyebrow is removed to conserve vertical space.
- Fixed a tablet-only overlap found by a fresh browser fixture run: at 640–1023px, the cookie banner now clears the fixed bottom navigation using the design-system navigation-height and safe-area tokens. The updated fixture uses real app breakpoint behavior rather than forcing mobile navigation on desktop.
- Ran a 14-point CSS/DOM fixture matrix across seven viewport dimensions in both LTR and RTL. No horizontal overflow or bottom-navigation overlap was measured in the fixture; this is not full-live-app visual certification.
- Updated active asset cache keys and stale source-contract assertions to `2.8.93-r6-2026-10-28`, and aligned cookie/category tests with current localized template markup.
- Regenerated `generated/cloudflare-views.js` from the latest 45 EJS templates, then reran the Cloudflare source-build generator successfully; no Cloudflare deployment/runtime certification is implied.
- Restored the known published SRI for `jsqr@1.4.0`; Multer 2.5.0 remains correctly pinned but its SHA-512 integrity is still unset because the npm registry is unreachable here. The release gate stays closed, and no digest is fabricated.
- Diagnostic suite: 576 total, 561 pass, 15 fail at module load because packages are missing in the authoring environment. Runtime here is Node.js 22.16.0, while the project requires Node.js >=24 <25. Full test pass, npm audit, real payment staging, complete site browser QA, Dutch locale and legal/rights clearance remain open.
- **Status: R6 candidate only; not production-certified or commercially license-cleared.** See `QA-REPORT-2.8.93.md`.

## 2.8.93 — R5 security and storefront correction candidate (2026-10-28, superseded by R6)

- Updated the exact Multer dependency target to `2.5.0` following the 22 October 2026 upstream advisory; the Windows finalizer must generate and verify the official npm SHA-512 lock integrity before a final verified ZIP can be made.
- Fixed homepage and shop category cards so the fixed image ratio/overflow applies to the media wrapper, not the entire link card; category cards now display a neutral fallback image when no custom category image exists.
- Reduced the mobile cookie banner height, moved it clear of the bottom navigation, and kept reject/accept controls adjacent and equally visible.
- Corrected separate left/right mobile safe-area insets for the cookie panel and added regression assertions for both sides.
- Reorganized 29 dated/obsolete root reports into `history/` without deleting release history; retained the legacy CSS snapshots as test fixtures rather than treating them as active application styles.
- Updated active release documentation and QA snapshots. Legacy CSS under `test/fixtures/legacy-css` is regression-test fixture data, not a production stylesheet; it is intentionally retained.
- This is a candidate only: runtime installation/full tests on Node.js 24, npm audit, browser screenshot QA, a real Mollie staging transaction, legal review and commercial-rights clearance remain gates. No production certification is claimed.

## 2026-10-27 — R4 design, EU card checkout gates and cookie controls (candidate)

- Consolidated the active storefront styling into `public/css/app.css`; legacy design layers remain historical/test fixtures only. Added responsive cookie-consent/dialog styling, payment method choices, visible keyboard focus, RTL-safe layout tokens, and a generic-retail static preview using original neutral vector product illustrations.
- Added the dedicated `/cookies` policy page with English, Sorani and Arabic copy. The consent UI offers equally weighted accept-all, reject-optional and customize actions; necessary session/security cookies remain required. Optional analytics/marketing are not bundled or activated by this release. Consent storage errors remain visible rather than being represented as a successful save.
- Hardened EU card checkout around the Mollie hosted-page model. COD stays the default and can remain the only method. Production card checkout fails closed unless the merchant country, currency, public HTTPS origin, server-side live key and explicit `MOLLIE_LIVE_CHECKOUT_APPROVED=true` gate all pass. Customer country/card origin never substitutes for merchant eligibility. Other provider entries remain onboarding/contact references only.
- Added official provider/bank contact links in Manager settings, with the Manager's private contact notes separated from public storefront content. Added/updated API reference entries for `/cookies` and the Mollie webhook; route inventory is checked against the Express source.
- Updated cache keys and stale CSS/locale/redirect regressions to the active R4 source; corrected the CKB disclosure to refer to the provider's secure payment page. Added European payment/cookie/preview regression coverage.
- Validation: focused design/payment/cookie/locale/release regression group **115/115 passed**; JS/MJS syntax **172 files passed**; CSS build passed; static audit passed (**83 files; 1,365 EN/CKB/AR keys aligned**); EJS template audit passed (**45/45**); Cloudflare template bundle build passed (**45 templates generated**).
- Full suite: **574 tests, 559 passed, 15 failed at module load** because a clean dependency install did not complete in this authoring environment and `node_modules` contains empty/incomplete package directories (`@libsql/client`, `ejs`, `qrcode-generator`, `jsqr`). This runtime is Node.js 22.16.0 but the package requires Node.js 24.x. The full suite is therefore **not green and not certified**. A real Mollie sandbox/live transaction and browser visual QA were not completed; headless Chromium timed out.
- Release status: QA candidate only, not production-certified, not a legal/privacy compliance certification, and not commercially license-cleared. See `ShopEasy-R4-DESIGN-EU-PAYMENT-COOKIE-VERIFICATION-2026-10-27.md`.

## 2026-10-26 — Payment provider contacts and safer hosted-card setup (candidate)

- Follow-up hardening: added the official Mollie card payment currency UAH to the allow-list (payment-currency availability is separate from payout currency/merchant-country eligibility), added three mocked Mollie API tests for hosted session creation, redirect-domain validation and payment status lookup, and brought Sorani card-checkout copy into alignment with the CKB terminology checks.
- Removed unused `src/payment-config.js`; the canonical service is `src/services/payment-providers.js`. Updated the CSS build regression to the actual `2.8.92-payment-settings-2026-10-26-v2` asset key.
- Follow-up focused regressions across payment, security, sale readiness, i18n, workflow, CSS, release and settings: **134/134 passed**; JS/MJS syntax 171/171, static audit 82 files, EJS template audit 44/44 and Cloudflare bundle build passed. Full `npm test`, live/sandbox provider transaction and browser visual QA remain explicitly uncertified in this Node 22 / missing-dependency environment.

- Added Manager-selectable COD-only (default) or COD + card mode. Only the implemented Mollie hosted card adapter may enable card checkout, and only when a real supported merchant country, supported currency, public HTTPS origin, server-side API key and appropriate test/live environment checks pass. Card details are never collected by ShopEasy.
- Added a clear Manager-only provider directory with official onboarding/support/documentation links for Mollie, PayTabs, First Iraqi Bank, iyzico, ZainCash and Stripe. Public FIB email/within-Iraq short code and iyzico telephone contact are now click-to-email/call links, with accessible wrapping for small/RTL screens.
- PayTabs’ official onboarding material lists Iraq as supported but requires KYC/merchant approval; this build does not yet integrate PayTabs, FIB, iyzico or ZainCash transactions. They remain contact/onboarding references only. No provider is represented as active merely because it appears in the directory.
- Mollie payment flow uses hosted redirect, webhook/API status fetch and order/amount/currency validation. Merchant location in Syria is not accepted for Mollie; do not choose a false country to bypass eligibility. Keep COD until a provider approves the actual business and settlement setup.
- Follow-up CSS cache key bumped to `2.8.92-payment-settings-2026-10-26-v2` for direct-contact UI styles. Full release certification/live provider transaction and browser visual test remain unverified in this environment; see the payment implementation report.

## 2026-10-26 — Follow-up repair: align integration and currency-review tests (candidate)

- Fixed the stale product-save assertion in `scripts/manager-dashboard-integration.mjs`: the current route intentionally redirects to `/admin/products/:id/edit?saved=1` so the Manager sees the save confirmation. The integration now verifies the real product ID, follows the redirect, and checks the accessible confirmation text rather than requiring the older `/admin/products` redirect.
- Fixed the stale workflow regression assertion for the product form's guarded local `currencyPriceReviewRequiredSafe`. The test now checks both the guard declaration and its use; the safe-local behavior remains in production code, preventing an omitted EJS local from crashing error renders.
- Latest user-provided run was 560/562 before this follow-up and showed these two assertion mismatches. Focused source/regression tests after updating the expectations: **17/17 passed**. Syntax check: **169 JavaScript/MJS files passed**. Static audit: **81 files inspected; 1,350 EN/CKB/AR dictionary keys aligned**. CSS design build: passed.
- The HTTP integration and full test suite cannot be certified in this authoring environment: `npm ci` timed out while contacting the registry, leaving `@libsql/client` unavailable here, and the installed runtime is Node.js 22.16.0 while the project requires Node.js 24.x. No claim is made that the complete suite now passes; run it under Node.js 24 with `npm ci` completed before release.

## 2026-10-26 — Repair of three observed test failures (candidate)

- Fixed the invalid product-save response: the route now supplies explicit non-success defaults, and the EJS template safely handles omitted `saved`, `restocked`, `restockError`, `currencyPriceReviewRequired`, and `error` locals. Invalid product entries can return the intended HTTP 400 validation page instead of crashing with `ReferenceError: saved is not defined`.
- Corrected the SQLite queue test fixture: it now simulates a persistent COMMIT failure on the first transaction, verifies the initial attempt plus three bounded retries, confirms rollback/close and slot release, and then confirms that a subsequent write can commit. Runtime retry behavior was not weakened.
- Kept the documented homepage decision intact: the Stories carousel remains removed from the homepage and stories are opened on `/stories`. Updated the stale test to validate that flow and removed the now-unused homepage `getActiveStories()` database query instead of reintroducing the removed carousel.
- Verified after these edits: focused regression tests **11/11 passed**; JavaScript/MJS syntax check passed for **169 files**; CSS build check passed; static audit passed (**81 files**, **1,350 aligned locale keys**); template audit passed (**44 EJS templates**); Cloudflare template build passed.
- Full `npm test` and HTTP integration suite remain to be rerun under required Node.js 24.x. This build environment has Node.js 22.16.0 and npm registry access failed (`EAI_AGAIN`), so the full integration results are not certified here. See `REPAIR-VALIDATION-REPORT-2026-10-26.md`.

## 2026-10-26 — CSS source refactor Phase 3 (candidate)

- Split the authored V17 overrides from the copied legacy layers and added a deterministic build script for the single runtime CSS bundle. This establishes a clearer source of truth without changing the CSS cascade.
- Added a regression test that verifies the generated bundle is byte-for-byte reproducible from the maintained layer sources and V17 overrides.
- The focused design/homepage/sale-readiness suite now passes 92/92. Full dependency-backed tests and browser visual QA remain outstanding; the stylesheet architecture is not yet fully consolidated and the release is not production-ready.

## 2026-10-26 — Homepage UX Phase 2 (candidate)

- The primary homepage catalogue now requests up to eight active featured products, with the latest active products as fallback; recent non-duplicate arrivals remain available in a separate row.
- Removed the Stories carousel from the homepage flow; Stories remain reachable through their dedicated page/navigation.
- Added four localized shopping-information items (easy discovery, clear pricing, cash on delivery, and shipping/returns policies) before new arrivals.
- Adjusted the responsive homepage so the product spotlight appears before the copy on tablet/mobile, category cards use three columns at tablet widths and two on small phones, and primary product actions keep a 48px minimum height.
- Added four focused homepage regression tests and bumped asset cache keys to `2.8.92-design-v17-2026-10-26-r3`.
- Candidate verification: 90 selected regression tests passed; syntax, static audit, template audit and release preflight passed. Full dependency-backed `npm test`, Node.js 24 runtime and browser end-to-end checks remain outstanding.
## 2.8.92 — Design V17: catalogue-first redesign and design-token correction (2026-10-25)

- Consolidated runtime styling into the base stylesheet plus one cache-versioned V17 bundle. V17 now overrides shared legacy tokens for a consistent ivory/forest-green palette and harmonizes text/background/border, status, radius and shadow tokens across storefront and Manager pages.
- Restored the language-specific Inter, Sorani and Arabic font stacks after the late design layer; raised inherited micro-labels to a 12px minimum and retained responsive, keyboard-focus, reduced-motion, forced-colors and RTL behavior.
- Bumped runtime and preview asset cache keys to `2.8.92-design-v17-2026-10-25-r2` so previously cached V16/V17-r1 assets are not silently reused.
- Refined homepage behavior: an old stored hero image no longer overrides product photography unless a custom hero was explicitly selected in Manager → Storefront. When there is no custom hero, the homepage uses a real catalog image or a neutral product placeholder, plus a separate row for newly added products.
- Aligned the static preview and image-fallback defaults with the product-first design; the generic editorial still-life image is no longer used as a product or default homepage fallback.
- Added V17 consistency assertions for common theme tokens and the Sorani/Arabic type stacks. Focused image/design/commerce regression group: 86/86 passed; JS/MJS syntax check, 91-file static audit, 44-template audit and Cloudflare template-generation check passed.
- Candidate only: full dependency-backed tests, real upload/HTTP/SQLite integration and browser screenshot QA remain unverified here (Node 22.16.0 is available rather than required Node 24.x; `npm ci` timed out on registry access; headless Chromium did not complete a screenshot). See `DESIGN-V17-CATALOG-FIRST-REDESIGN-REPORT-2026-10-25.md`.

## 2.8.92 — Design V16: catalogue-first images and product upload feedback (2026-10-25)

- The homepage no longer treats a legacy `/assets/...` placeholder as a custom hero override and no longer uses the stock editorial photo as its normal fallback. An uploaded product photo or trusted HTTPS product image populates the hero when no real custom hero is selected; if there is no usable product photo, a neutral product placeholder appears instead.
- Added a “New in the shop” row so recent non-featured products remain visible even when the store already has featured items.
- New products default to featured and active, with a live local preview for supported JPG, PNG and WebP cover photos (2 MiB limit).
- Introduced a unified V16 design layer for clearer store navigation, catalog cards, image areas, forms, Manager views, mobile layouts and right-to-left languages.
- Static/source checks are being rerun; this change is not a claim that every full integration test was executed in this environment.

## Unreleased — design V15 phase 2 (candidate only, 2026-10-25)

- Added `design-v15.css` as the final sitewide design layer while preserving existing CSS layers to avoid deleting legacy behavior before full visual/runtime validation. Covers storefront, catalog, product gallery, cart/checkout, account/orders, Stories and Manager/Admin surfaces with shared interaction states, mobile breakpoints, RTL/LTR rules, reduced-motion and forced-colors handling.
- Added a generated and optimized generic editorial hero image (`hero-editorial.webp`) for the default homepage and Manager preview; it is explicitly not product photography. The existing SVG illustration is retained as a secondary fallback, and custom hero upload remains available.
- Added a bounded local image-fallback chain across product, category, cart, checkout, order and Story imagery. Failed URLs are recorded per element so broken fallback assets do not create an endless error loop. Replaced the former vertical-specific product placeholder with a retail-neutral placeholder.
- Added V15 design/image-resilience regression tests and updated the layer-order test. V15 image-resilience suite: 9/9 passed; focused V12–V15/source-hardening group: 39/39 passed in Node 22.16.0.
- Follow-up mobile UX fix: product-image “View” affordance now remains visible on touch/coarse-pointer devices rather than depending on hover; a source-contract regression test covers this behavior. Focused current design tests: 14/14 passed.
- This is a **phase candidate**, not full redesign, payment rollout, browser visual certification, production certification, or cleared commercial distribution. Full suite remains blocked by missing dependencies and the environment's Node 22 runtime versus the project's Node 24 requirement; npm registry connectivity also failed. See `DESIGN-REDESIGN-PHASE-2-2026-10-25.md`.

## Unreleased — design V14 phase 1 (candidate only, 2026-10-25)

- Added a shared V14 visual refinement layer across storefront, product, checkout, auth, Stories and Manager/Admin surfaces while retaining older CSS layers for safe migration; full cascade consolidation and screenshot review remain pending.
- Made homepage hero media independent from product query ordering and added a Manager-configurable image upload with a designed SVG fallback.
- Replaced the MFA QR-download alert with an inline accessible status and dictionary-backed dynamic messages.
- Added a provisional page-by-page design/behavior spec mapping all 44 EJS templates, including responsive/RTL states, to guide the next redesign phase; it is not a substitute for approved wireframes or browser verification.
- Updated source-contract tests and route documentation. This phase is not the complete redesign, card-payment implementation, runtime certification or production release; see `DESIGN-REDESIGN-PHASE-1-2026-10-25.md`.

## 2.8.92 — post-audit regression fixes (2026-10-23)

- Fixed the Manager/MFA integration helper to select the newest `sid` Set-Cookie value when the same response emits more than one session cookie; corrected stale assertions to the current two-hour idle-cookie policy. This changes test correctness, not production authentication rules.
- Enabled WAL for file-backed local SQLite before schema initialization and serialized the lifetime of local write/deferred transactions. Failed commits now attempt rollback/close before releasing the queue slot, preventing a failed native transaction from leaving the local client locked. Hosted Turso/Cloudflare clients keep their service-managed concurrency. The backup snapshot now uses an explicit read-only transaction so it does not occupy the local write queue.
- Fixed the SQLite concurrency test to query through the actual exported client API and retry Windows file cleanup instead of producing unrelated follow-on failures. A final pass also added the missing local transaction-queue import to `src/database.js` and a source-contract regression test.
- Added six isolated transaction-queue/import-wiring regression tests for write serialization, failed begin, failed commit, failed rollback/close, concurrent read transactions and adapter import wiring, plus three cookie-helper tests for duplicated session cookies and older Set-Cookie header parsing. All nine tests pass in the available runtime; the real libSQL integration must still be rerun on supported Node 24.
- Current authoring environment cannot complete `npm ci` (Node 22.16.0; project requires Node >=24 <25, and npm registry connectivity is unavailable), so the full suite after these changes has not been certified. See `QA-REPORT-2.8.92.md`.



## P1-2 MFA integration-test correction — 2026-10-22

- Fixed a deterministic test flaw in `scripts/manager-dashboard-integration.mjs`: the login check immediately after MFA enrollment generated the current 30-second TOTP step without checking `mfa_last_totp_step`. Enrollment had already consumed that step, so the application correctly rejected it as a replay with HTTP 400.
- Added `freshTotpCode()` for test use only. It reads the recorded last-used step and chooses an unused step inside the server's current ±1 window; it waits for the next window only when every currently valid step has already been consumed.
- Reused the helper for MFA login, the login after a rejected/reused recovery code, and MFA disable. Production replay protection remains enabled; no authentication rule was weakened.
- Verified with `node --check scripts/manager-dashboard-integration.mjs`, a direct TOTP/replay timing simulation, and 73 focused tests across MFA, API-documentation and strict-CSP/readiness test files.
- Full HTTP/SQLite integration and the full `npm test` were not run in this authoring environment: installing the project's dependencies timed out on registry connectivity. Run `npm ci` and `npm test` on Node.js 24.19.0 before treating this candidate as verified.

## P1-2 MFA targeted corrections — 2026-10-22

- Invalid, expired, replayed, or otherwise invalid Manager MFA verification submissions now return HTTP 400 instead of rendering the error view with HTTP 200; the TOTP verifier still enforces the current 30-second step ± one step and replay protection.
- Updated `API-REFERENCE.md` and its regression test for the current 89 Express route declarations, including all six MFA routes.
- Removed all six inline style attributes from MFA EJS views and moved presentation into `public/css/style.css`; rebuilt the generated view source so it matches the EJS files.
- Removed `qr@0.7.2` whose lock entry lacked integrity metadata. Pinned `qrcode-generator@2.0.4` to its exact registry tarball and a SHA-512 value corroborated by a public lockfile for the same tarball. Corrected the Node ESM named import and added an installed-package SVG smoke test.
- Focused checks run in the authoring environment: 88 tests passed across MFA, route-documentation, strict-CSP readiness and release-hardening tests; syntax, static and 42-template audits passed. The QR runtime smoke test and full dependency-backed suite have not been run here. Candidate only; no production certification is claimed.

## P1-4 candidate — Express 5.3.0 / Helmet 8.3.0 (2026-10-20)

- Upgraded the two requested direct web-security/runtime dependencies only; Multer 2.4.0, express-rate-limit 8.7.0 and body-parser 2.4.0 are retained.
- Kept explicit request-body limits and current route syntax; added regression checks for Express response APIs, redirects, multipart setup and Helmet CSP configuration.
- The candidate needs the documented one-time registry lockfile refresh on a machine with npm connectivity so npm, not a guessed hash, writes the Express 5.3.0 tarball SRI. The P1-4 version/integrity test intentionally blocks until that is done.
- Candidate only: do not deploy unless lockfile refresh succeeds, `npm audit --omit=dev` is clean and the full test suite is green.

## 2.8.91 — Sorani/Arabic staff translations and regional pricing validation (2026-10-20)

- Completed the Sorani translation for the Manager role and improved the staff/account page's headings, access descriptions, password labels and session-security messages in Sorani; verified the corresponding staff text in both Sorani and Arabic packs.
- Fixed a critical regional-tax parser defect: the shared destination selector validator incorrectly required a fourth field, so otherwise valid five-field tax rules were rejected. Tax rules now validate the three destination fields correctly before rate/shipping-tax validation.
- Added regression tests for explicit seller-entered regional tax rules, city/postal-prefix delivery-fee matching, most-specific rule selection, tax-inclusive/exclusive arithmetic, invalid rates, duplicate selectors and unapproved delivery countries.
- Updated public setup/README language to describe manual regional delivery/tax rules accurately and explicitly disclaim legal-rate lookup, full jurisdiction-specific tax handling and compliance certification.
- Focused translation/commerce tests: 20/20 passed. Full `npm test` remains blocked by incomplete installed dependencies; no live database, checkout browser, legal tax review or production hosting certification is claimed.

## 2.8.90 — customer order lifecycle, returns and encrypted recovery (2026-10-20)

- Added customer-visible order-status history and optional Resend order confirmation/status notices. All order emails default to off, order/event attempts are deduplicated, and a configurable daily cap limits attempts. Signed-in and guest buyers can revisit a protected order-status receipt; the guest view is guarded by an HttpOnly per-order cookie, not the order number alone.
- Added manager-reviewed return/exchange/refund workflow for signed-in and guest orders, with guarded state transitions, optional one-time stock restock after physical receipt, replacement dispatch reference, and manual refund records. Refund amounts are bounded per request quantity and aggregate item/order totals. Refunds do not trigger payment-provider calls or move money automatically.
- Added low-stock dashboard warnings and manual, streamed AES-256-GCM encrypted database/media backup plus restore tools with SHA-256 sidecar, explicit empty-target restore confirmation and restore-integrity checks. This consumes free-tier database reads/egress and is not an automatic backup scheduler.
- Tightened return quantity reservation across return/refund/exchange requests and fixed refund caps to use the individual request quantity plus item/order aggregate limits. Restore now rejects source database URL aliases with trailing-slash/query differences. Added regression coverage for these protections.
- Source/syntax/static/template checks and focused backup/email tests passed in this environment. The full dependency-backed test suite, real database migrations, HTTP/browser integration, free-tier usage benchmarking, and live staging restore remain unverified. Not production-certified or commercially license-cleared.

## 2.8.89 — product variant matrix and gallery (2026-10-20)

- Added up to 50 product combinations with two option dimensions (for example Colour × Size), unique per-combination SKU, independent stock and optional variant image.
- Migrated the legacy variant uniqueness constraint in a write transaction while preserving existing variant IDs, SKUs, reservations, stock and order references.
- Added persistent product image gallery metadata, cover-image backfill, multiple uploads/HTTPS image URLs, storefront gallery thumbnails, and per-variant photo switching.
- Added a second option name/value snapshot to historical order items and display support across cart/order confirmation and manager order views.
- Updated static and regression contracts for the matrix and image-gallery features. QA is candidate-only until dependency-backed tests, database migration against a real legacy DB, HTTP/browser tests and staging checks pass.

# ShopEasy Changelog

## 2.8.88 — P0 Cloudflare PBKDF2 compatibility block (2026-10-20)

- Added a fail-closed preflight that blocks Cloudflare Worker dev/deploy/dry-run commands while the production runtime rejects PBKDF2 operations above 100,000 iterations.
- Kept PBKDF2-SHA256 at 600,000 iterations; no password-hash weakening was introduced.
- Updated deployment docs and runbook to use a persistent single-instance Node.js host pending actual staging validation.
- Docker now explicitly sets `RATE_LIMIT_BACKEND=memory-single-instance`; horizontal scaling remains unsupported until a shared durable limiter is implemented and tested.
- Added focused regression tests for the deployment guard and deployment script wiring.
- Added `npm run benchmark:password-hashing` to capture password-hash correctness, latency and process CPU on the actual Node.js staging host.
- This closes the known-incompatible Cloudflare deployment path, but does not claim live staging benchmark or production certification.

---

## 2.8.87 — commercial-rights inventory (2026-10-20)

- Added exact lockfile dependency inventory, seven-asset provenance register and open commercial-rights register.
- Added `npm run licenses:generate` to collect license/NOTICE text from installed dependencies and fail on missing required notice files.
- Kept `LICENSE.txt` draft-only and root package metadata private/UNLICENSED because actual ownership/authority and asset provenance have not been verified.
- No runtime ecommerce behavior changed; not commercially license-cleared or production-certified. See `history/release-artifacts/QA-REPORT-2.8.87.md`.

## 2.8.86 — test harness path corrections (2026-10-20)

- Fixed two release/static-audit tests that still traversed the intentionally removed `api/` directory after Vercel/AWS Lambda support was disabled.
- Added a fail-fast `pretest` dependency check and a focused `npm run test:integration` command for the Manager, variants, EJS templates and image quota tests. Missing packages now produce an explicit setup error rather than four misleading test failures; nothing is skipped.
- Added an explicit record of the dependency-backed integration limitation: authoring-container DNS access to npm registry failed (`EAI_AGAIN`), so EJS/libSQL-dependent test files could not load. This is not counted as a pass.
- No production application behavior or dependencies were changed; package.json/package-lock release versions and active QA references were aligned to 2.8.86.
- QA candidate only. Run `npm ci`, `npm test`, and real database/browser/staging tests on a network-enabled Windows environment before production. See `history/QA-REPORT-2.8.86-HISTORICAL.md`.

## 2.8.85 — deployment/bootstrap documentation alignment (2026-10-19)

- Rechecked the shipped source and docs: `src/server.js`, `.env.example`, `CLOUDFLARE-DEPLOYMENT.md` and staging provisioning use `MANAGER_NAME`, `MANAGER_EMAIL` and `MANAGER_PASSWORD` for the initial full-access Manager. The old `ADMIN_EMAIL`/`ADMIN_PASSWORD` names remain only in clearly-labelled legacy upgrade instructions.
- Updated stale active release headings and labels in the staging runbook, Manager guide, Staff accounts guide, API reference and Manager Settings screen. Historical entries in this changelog remain historical.
- Replaced misleading “first Admin bootstrap” language with the actual workflow: bootstrap Manager first, then create restricted Admin accounts from the signed-in Manager interface.
- Added regression tests for bootstrap variable and active-version consistency. No application authorization, database or rate-limiter behavior changes in this documentation/metadata release.
- QA candidate only. A complete dependency-backed test suite and live Cloudflare/Turso staging run are still required; see `history/QA-REPORT-2.8.86-HISTORICAL.md`.

## 2.8.84 — 2026-10-19

- Removed Vercel/AWS Lambda serverless support instead of allowing global rate limiting to return HTTP 503 on every dynamic request. Vercel builds now fail fast with an explicit host requirement; the Vercel API adapter is removed.
- Standardized the documented free-first production path on Cloudflare Workers + Turso; database bootstrap documentation now uses the single Manager's `MANAGER_*` variables.
- Preserved shared Cloudflare Durable Object rate limiting and fail-closed behavior. No in-memory fallback is allowed for serverless production.
- Important limits remain: Cloudflare Workers/ Durable Objects free quotas are finite, Turso Free has a 5 GB storage cap, and live Worker CPU, DB concurrency, and browser integration must be verified before any sale. This release is not production-certified.
- Verification in the authoring environment: 62 targeted release/security/Cloudflare contract tests pass; syntax, Cloudflare source build, preflight and static audit pass. Full dependency-backed integration is still blocked because the environment could not complete `npm ci`.

## 2.8.83 — pre-sale audit patch: product detail wrapping and Manager staging credentials (2026-10-19)

- Added `overflow-wrap:anywhere`, bounded width and `min-width:0` safeguards to product-detail descriptions, covering long strings without spaces. Added a regression contract.
- Updated the cache-busting token for the final storefront-theme stylesheet in the live page shell and static preview.
- Staging certification now prefers `STAGING_MANAGER_EMAIL` / `STAGING_MANAGER_PASSWORD` because the authenticated gate checks Manager-only Settings. Legacy `STAGING_ADMIN_*` aliases remain accepted to avoid breaking older local environments.
- Rebuilt the Cloudflare view bundle and added source-contract coverage for certification configuration.
- QA remains candidate-only: the authoring environment's npm install timed out and 4 dependency-backed test files cannot load (`ejs` / `@libsql/client`); 381 runnable tests pass after updating one stale CSS version expectation. Commercial license/IP rights and the other pre-sale gates remain unresolved. See the current `history/QA-REPORT-2.8.86-HISTORICAL.md` and `ShopEasy-PRE-SALE-AUDIT-AND-REMEDIATION-PLAN-2026-10-19.md`.

## 2.8.82 — make missing-account integration assertions implementation-neutral (2026-10-19)

- Fixed the remaining Windows integration failure in the Manager email-change flow. The 2.8.81 test still expected `null` after the old Manager email was removed, while `getUserAuthByEmail()` can return `undefined` when a query has no row.
- Both the Admin-deletion and old-Manager-email assertions now normalize `undefined`/`null` to `null` before asserting absence. A real returned account row still fails the assertion; the deletion/authentication checks are not skipped or weakened.
- Retains the homepage/product-card long-description wrapping, Manager-only Admin deletion, current-password verification, session revocation, CSRF, and separate rate limits.
- QA remains pending until a clean Windows `npm ci` + full `npm test` and browser/database integration run completes with zero unexplained failures. Not production-certified; see the current `history/QA-REPORT-2.8.86-HISTORICAL.md`.

## 2.8.81 — correct Admin deletion integration assertion (2026-10-19)

- The 2.8.80 HTTP integration flow already received the expected `303 /admin/staff?adminDeleted=1` after the Manager deleted a test Admin. The subsequent assertion was wrong: `getUserAuthByEmail()` returns `undefined` when `getRow()` finds no match, not `null`. The test now checks the actual documented no-row value; it does not weaken the deletion verification.
- Version bump and active release metadata are aligned.
- Re-run `npm ci` and `npm test` on a dependency-enabled Windows machine; this release must not be considered production-certified until the full suite passes.

## 2.8.80 — clamp long product descriptions and add safe Admin removal (2026-10-19)

- Fixed homepage featured-product and product-card copy overflow. Descriptions now break even when entered as a long string without spaces, are clipped to a small number of lines, and cannot stretch the card horizontally.
- Added a Manager-only `POST /admin/staff/delete-admin` route and a Remove account action for each restricted Admin account.
- Deletion requires the current Manager password, is rate-limited, validates the ID, and the database helper only deletes rows with `role='admin'`; attempting to submit a Manager ID cannot delete the Manager.
- Removing an Admin revokes its sessions and password-reset data through foreign-key cascades. Historical order snapshots are retained. An audit event records the action.
- Added focused regression tests and an HTTP integration scenario for missing/wrong password, attempts to delete a Manager, successful Admin deletion, and session invalidation.
- QA is pending until the full test suite and HTTP/database integration pass. Not production-certified; see the current `history/QA-REPORT-2.8.86-HISTORICAL.md` for consolidated QA status.

## 2.8.79 — isolate Manager account-change rate limiting (2026-10-19)

- Fixed a real integration regression where Manager email/password changes returned HTTP 429 because the credential-change routes shared the sign-in attempt limiter.
- Added a separate bounded `manager-account` rate-limit bucket for Admin creation and Manager email/password changes. Login brute-force protection remains unchanged and separate.
- Added regression assertions that all Manager staff mutations use the dedicated limiter.
- Release status depends on the refreshed full-test result in `history/QA-REPORT-2.8.86-HISTORICAL.md`; this is not a production certification.

## 2.8.78 — Manager-owned staff and credential management (2026-10-19)

- Moved first-run bootstrap credentials from `ADMIN_EMAIL` / `ADMIN_PASSWORD` to `MANAGER_NAME`, `MANAGER_EMAIL` and `MANAGER_PASSWORD`. Bootstrap creates only the full-access Manager when no Manager exists. For upgrades, the legacy `.env` bootstrap Admin is promoted only after matching `MANAGER_EMAIL` and verifying `MANAGER_PASSWORD` against its existing hash; the password is not reset and no other account is promoted.
- Added Manager-only `/admin/staff` for creating restricted Admin accounts and listing Admin names/emails without exposing password data. Admin creation is removed from `.env` bootstrap and the staff CLI.
- Added Manager-only email and password change forms that require the current password, verify new input, revoke other sessions, and invalidate outstanding password-reset tokens.
- Added DB helpers that restrict email changes to the Manager role, route-level role authorization, audit events and HTTP integration assertions for Admin-denied GET/POST requests.
- Added the staff screen to Manager navigation, regenerated the Cloudflare view bundle and updated setup/release documents.
- QA note: syntax/static/source-contract checks are run for this package. Full HTTP/database integration still requires `npm ci` to install `ejs` and `@libsql/client`; this release is not production-certified until the full suite and staging checks pass.

## 2.8.77 — explicit local Manager/Admin provisioning (2026-10-19)

- Clarified that `.env` `ADMIN_EMAIL` / `ADMIN_PASSWORD` bootstrap only the initial restricted Admin; they are not a Manager-account creation mechanism.
- Added `npm run staff:create -- manager --local` for explicit creation of a staff role in this extracted project folder's existing local `data/shop.db`.
- Local provisioning fails closed when the database file is missing/empty, asks for exact database-path and role confirmation, hides password entry, validates both passwords before database imports, and removes inherited Turso/SHOP_DATABASE_URL/hosting-mode overrides before opening the local DB.
- Kept remote provisioning on the explicit `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` path unless `--local` is supplied. Updated setup docs and regression/static tests.
- QA status: candidate only. Source syntax, focused tests and release audits must pass; database-backed local account creation and full HTTP integration still require a real machine with dependencies installed.

## 2.8.76 — separate registration rate limit from sign-in attempts (2026-10-19)

- Fixed the integration failure where several prior sign-in checks exhausted the same limiter used by registration, causing the terms-consent assertion to receive HTTP 429 instead of its validation message.
- `POST /register` now uses its own `register` bucket (10 requests per 15 minutes); `POST /login` retains the existing `login` bucket and threshold. This does not weaken sign-in brute-force protection.
- Added a regression test for route-to-bucket separation. Full post-fix test suite still needs to be rerun on a machine with all npm dependencies installed; this release is not production-certified.

## 2.8.75 — checkout cart safety and Manager/Admin UX repair (2026-10-19)

- Fixed Manager navigation guards that hid Settings, Audit, and License links on Manager pages. Manager is now consistently shown as the full-access store operator; the restricted Admin overview remains separate.
- Fixed product-detail permission presentation: only Manager sees private lifecycle/management actions and associated private product fields. Admin is not shown controls the server would reject.
- Fixed checkout cart lifecycle: the order-success GET route is read-only, so opening an old bookmarked success page cannot clear a later cart. The successful checkout POST attempts a transactional cart clear only when the stored cart and coupon still match the purchased-cart snapshot; cleanup errors never turn a committed order into a reported checkout failure.
- Added dependency-free regression tests for Manager navigation, Admin product-action visibility, checkout-success read-only behavior, transactional cart snapshot guarding, and idempotent retry behavior.
- Validation: focused permission/cart regressions 14/14 pass. Syntax (108 JS/MJS files), static audit, 36-template audit/build, and release preflight pass. Full test run: 368 passed, 4 test files could not load because `ejs` / `@libsql/client` were not installed after `npm ci` timed out with registry access errors. Database-backed HTTP integration and browser E2E are not verified; this release is **not production-certified**.

## 2.8.74 — single full-access Manager role (2026-10-19)

- Made `manager` the only role allowed to access or mutate store-management routes, including Products, Categories, Stories, Orders, Coupons, Customers, Storefront, Settings, Audit and License.
- Limited `admin` to a separate overview-only page with no store metrics or management links; management routes return 403.
- Added distinct guards for Manager management, Admin overview and strict Admin-only future operations.
- Updated account copy, navigation, role documentation and release metadata.
- Added HTTP integration assertions for Manager access, Admin denials and no database mutation from a forbidden Admin Settings POST.
- Source/static checks pass; dependency-backed HTTP integration could not run because `npm ci` timed out and `@libsql/client` / `ejs` are unavailable in this environment. This remains a QA candidate, not production-certified.

## 2.8.73 — full manager/admin data-integrity follow-up (2026-10-19)

- Fail-closed manager/admin IDs, inventory and delete safety; malformed category/product/story/coupon IDs no longer silently become create actions.
- Blocked base-product restock whenever active variants own inventory and made category deletion transactional with a no-child delete condition.
- Pending/legacy COD acceptance aggregates duplicate order-item quantities by product/variant before verifying reserved stock and verifies variant ownership.
- Added branding read-after-write verification, rejected unsupported coupon types, checked real row deletion for coupons/stories, and surfaced failed order-status/cancellation-request transitions.
- Validation: 36/36 focused manager/admin/security tests and 69/69 data-integrity/sale-readiness tests. Full suite: 360 pass and 4 dependency-blocked imports (364 total). This remains a QA candidate, not production-certified; real HTTP/database/browser verification still must pass.

## 2.8.72 — staff-account provisioning and manager role audit (2026-10-19)

- Fixed a confirmed staff provisioning defect: `scripts/create-staff.mjs` imported `hashPassword` from `src/auth.js`, which does not export the helper. It now imports the helper from `src/password-hashing.js`.
- Added dependency-free regression tests for the import/export contract and staff CLI safeguards. The CLI now confirms the credential-free database target and privilege level, validates all entered data before loading schema-initializing DB modules, normalizes the connection values, and queues sequential text input safely.
- Corrected the manager HTTP integration gap: the prior smoke path bootstrapped an admin despite the manager-oriented test name. The script now separately creates and signs in a real `manager` role, checks manager-enabled pages, denies Audit/License/Settings with 403, and verifies a direct Settings POST cannot mutate data. A source-contract test checks every declared `/admin` route for an explicit role guard.
- Validation: 12/12 focused manager/staff/password tests, 104-file syntax check, static audit, 35-template audit/build, and release preflight pass. The full suite reports 355 pass plus 4 test processes blocked by unavailable `ejs` / `@libsql/client`; `npm ci` received `EAI_AGAIN` from `registry.npmjs.org`. Database-backed HTTP assertions remain unexecuted. This is a QA candidate, not production-certified.

## 2.8.71 — Settings save UX repair (2026-10-18)

- Reworked the Store Settings form into clearer, spaced sections with stronger input focus states and responsive mobile layout.
- Added a sticky Save settings bar so the primary action remains reachable on long forms.
- Added unsaved-change feedback, a double-submit guard, a saving state, and a browser warning before leaving with unsaved edits.
- The Settings POST now reads every committed setting back before redirecting with a success state; a mismatch returns an explicit error instead of falsely claiming the save worked.
- Clarified that launch checklist items control checkout readiness, not whether a draft can be saved.
- Added a dedicated page-only UX script and versioned stylesheet cache key.
- Validation note: source syntax checks pass; a complete dependency-backed test and live database/browser verification remain required before production use.

## 2.8.70 — Full workflow audit and release hygiene (2026-10-18)

- Rechecked the release from a fresh extraction against customer, manager, inventory, currency, checkout, accessibility and release-documentation workflows.
- Fixed the Market Setup profile preview so the prominent launch checklist updates immediately when Standard / full setup and Simplified local cash-on-delivery are switched; the checklist remains a preview and saving still remains separate from launch readiness.
- Cleaned stale QA reports, old per-release manifests and old verification summaries out of the distributable ZIP; historical change notes remain in this changelog.
- Refreshed current release metadata and frontend cache keys to 2.8.70.
- Corrective rebuild after a Windows end-to-end run found `ReferenceError: getRows is not defined` in the manager Settings page. The server now imports `getRows` from `src/database.js`; the same missing import also affected the currency/history check on Settings POST.
- Added `test/server-database-helper-imports.test.js` to guard the required direct database-helper imports. The focused regression test passes.
- Follow-up from Windows HTTP testing: the manager smoke test still contained an old success-redirect expectation after permanent deletion. The delete form now sends only its current allow-listed catalog filter (`active`, `archived`, or safe default `all`), and the server preserves that filter on success/error without accepting arbitrary redirect paths. The HTTP integration test now follows the returned redirect and verifies the permanent-delete confirmation banner.
- Settings Save repair after the latest browser report: the delivery-country maximum is now 250 rather than 50, allowing a global country allow-list. If the submitted country list still has malformed entries, the server preserves the previous valid country list and saves the other valid settings instead of discarding the entire draft; a visible warning explains that country coverage was not changed. No invalid country list is activated, and the launch gate continues to block checkout when no valid delivery country is configured. Added unit and HTTP-integration regression coverage.
- Added a regression test for redirect allow-listing, both delete forms, and the success banner check. The current QA report must be updated only after the complete Windows test run; this package remains a QA candidate until that run passes.

## 2.8.69 — manager workflow clarity and date/currency review repair

- Added a permanent-delete action alongside Archive in active and archived product management, with transaction-level history/reservation guards and cart/wishlist cleanup.
- Improved customer product-option cards, per-variant stock selection, and related-product discovery below product details.
- Made setup sequence explicit in the manager dashboard: save settings draft first, choose currency/delivery countries, then add products and stock.
- Show currency-price-review warnings inside product editing after a currency change.
- Added a clear empty-country message at checkout; server-side delivery-country allow-list remains authoritative.
- Added a guarded manual acceptance path for older pending orders: manager verification is required, payment URL/reference must be absent, and each order line must still have reserved stock; otherwise the manager can cancel and release stock.
- Added absolute store-local date/time alongside relative time on COD order details and recent dashboard orders. SQLite unzoned timestamps are parsed as UTC.
- QA status remains candidate-only: runtime database/browser tests are blocked by incomplete dependencies in this authoring environment.

# Changelog

## 2.8.68 — historical currency alignment and translation regression repair

- Keep the Store currency selector enabled so a manager can correct a legacy store/order currency mismatch instead of being trapped by a disabled field.
- With historical orders, allow a target currency only when every saved order snapshot already uses it; mixed or mismatched histories are rejected because financial aggregate reports currently assume one currency. Historical order totals are never converted.
- Show the currency breakdown for existing order history in Settings and explain how to align a legacy mismatch.
- Keep EN/CKB/AR master and locale-only translation dictionaries aligned, and keep Arabic/Sorani payloads under their enforced size budgets.
- Verification: 330 of 334 tests pass. Four database/EJS integration entries remain blocked at dependency loading (`@libsql/client` / `ejs`) because npm registry access fails with `EAI_AGAIN`; no production certification is claimed.

## 2.8.67 — product lifecycle controls, workflow clarity and timestamp repair

- Added safe manager-only product lifecycle controls on both the Products list and the product detail page, including explicit Archive and permanent Delete actions; ordinary customers never see manager controls.
- Keep Delete permanently visible with a clear disabled reason if order history or reserved stock protects the record. Deleting never silently archives as a side effect.
- Add a visible deletion danger zone to the product editor.
- Display size/color options as accessible option cards, with availability per option and synchronized quantity limits.
- Add related products below the product detail to support discovery while scrolling.
- Fix parsing of unzoned SQLite UTC timestamps so created orders show the correct local date and relative time.
- Make order management links explicit and add a safe cancel action for pending legacy orders where automatic COD acceptance is not allowed.
- Improve manager dashboard readiness guidance and clarify checkout-country restriction; preselect the only configured delivery country when there is exactly one.
- Keep draft settings savable independently of catalog readiness; launch gate remains responsible for keeping checkout closed until configured.
- Keep the currency selector usable to fix a legacy mismatch when every stored order already uses the selected target currency; never convert historical totals. Mixed or mismatched order currencies are rejected because the current sales/customer/profit reports assume one currency.

## 2.8.66 — Full workflow audit: settings profiles, currency, product deletion and manager UI

- Saving configuration as a draft remains independent of checkout readiness: missing products, policies and delivery countries keep checkout closed but do not block draft saves.
- Added an immediate explanation preview for Standard / full setup vs Simplified local cash-on-delivery.
- Store currency can be changed before the first order even if products/currency-sensitive coupons exist; persisted prices are precision-scaled only, not exchange-converted, and checkout remains paused for manual repricing. Historical orders may only be aligned to a target currency already used by every order snapshot; mismatched or mixed-currency histories block currency changes.
- Products with no order history and no reserved stock can be permanently deleted directly; historical products remain archived for record retention.
- Uploaded-image cleanup now checks remaining product/story/category references before deletion, so removing one record does not break a shared image used by another record. Cloud storage checks and deletion run in one write transaction.
- Aligned launch checklist registration-number display with the actual backend rule and expanded Sorani/Arabic settings/product messages.
- Verification status: QA candidate, not production-certified; clean npm ci plus database-backed HTTP checks remain blocked by registry network failure in this environment.

## 2.8.65 — Draft save + currency changes + IQD precision repair

- Keeps Settings draft saving independent from Launch Check so managers can save before creating products or defining delivery countries.
- Allows changing store currency after creating products and monetary coupons, before any order exists. Associated stored money is adjusted transactionally for precision only (not FX); checkout pauses for manual market-price review. Historical orders continue to lock currency changes so aggregate reports never sum currencies together.
- Corrected IQD minor-unit precision to three digits, pinned explicitly in server and browser parsing/formatting rather than relying on environment-specific Intl/CLDR defaults.
- Focused settings/currency/security tests are rerun for this candidate; full suite remains incomplete because four test files cannot load the `ejs` and `@libsql/client` packages in the authoring environment. Live authenticated database/browser save remains unverified. Not production-certified.

## 2.8.64 — Draft save and currency changes with existing product data

- Saving Settings drafts is independent from Launch Check: zero products or zero delivery countries does not prevent saving valid business/settings/policy drafts. Checkout stays closed until launch requirements are satisfied.
- Product presence and money-based coupons no longer block changing currency. The selection can be saved in the same request; product price, purchase cost, sale price, fixed coupon value and monetary minimums are adjusted atomically for storage precision only, without FX conversion.
- A currency change that affects money data automatically puts checkout behind a mandatory price-review gate. The manager must enter real prices for the new market and confirm the separate review checkbox before checkout can reopen.
- Historical orders lock the store currency because current aggregate sales/customer/profit reporting assumes one currency. The lock is enforced in the UI, POST route, and write transaction to prevent an order/currency race.
- Added regression coverage for no-product draft saves, product/coupon currency changes, price-review gating, and historical-order currency protection.
- Verification: 35/35 targeted settings/currency/security tests pass. The full suite is 317 passing, with 4 integration/template test files unable to load due missing `@libsql/client` and `ejs`; clean `npm ci` was blocked by unavailable npm package download. Live authenticated HTTP/database/browser tests are not claimed. This build remains a QA candidate.

## 2.8.62 — 2026-10-18 — settings draft-save field fallback repair

- Fixed Settings POST handling when a browser or older open tab omits the currency selector: keep the persisted store currency instead of incorrectly failing the draft-save validation.
- Permit the delivery-country list to remain empty while saving setup drafts; checkout remains blocked until delivery coverage is configured. If a stale form omits this field, preserve the persisted country list.
- Preserve the existing delivery fee if an older form omits that input; an explicit zero remains supported, and a real currency change still resets the fee safely to zero.
- Reject duplicate/array-shaped malformed field values instead of silently coercing them, and added dedicated functional regression tests for these cases.
- This is a QA candidate, not a production certification; a live database/browser save must still be verified on the target machine.

## 2.8.61 — 2026-10-18 — settings save and market currency workflow repair

- Added SYP (Syrian pound) to the store currency selector, using the runtime ISO currency precision. Store currency remains one currency per storefront; it does not perform live FX or customer-specific multi-currency conversion.
- Fixed the catalog-only currency workflow: product presence no longer disables the currency selector when no orders or fixed-value coupons exist. A clear acknowledgement is required, product price/cost/sale values are rescaled atomically to the new currency's minor-unit precision (preserving the numeric major-unit amount, not FX value), and delivery fee input resets to a valid zero for the selected currency.
- Added a persistent price-review gate. After a catalog-only currency change, checkout remains disabled until the manager reviews the product prices and explicitly confirms the review on Settings. Orders and coupons still lock currency changes to protect history.
- Settings validation now identifies the invalid field category instead of showing only a generic list. Settings and product price-scale changes are saved in one write transaction to avoid half-updated currency state.
- Added regressions for currency precision, catalog-only change acknowledgement, protected order/coupon history and checkout gating. Focused tests pass. Full `npm ci` could not finish in this environment because the npm registry dependency was unavailable; full suite and live HTTP/database/browser save behavior remain unverified. Not production-certified.

## 2.8.60 — 2026-10-18 — fix early CSRF error-page crash

- Fixed a confirmed runtime bug: when an invalid/missing CSRF token was rejected before database-backed storefront locals loaded, the shared error page referenced an undefined `locale` and returned HTTP 500 instead of the intended HTTP 403.
- Added safe fallback view locals before authentication and the global CSRF guard. Once a request passes these checks, the existing request middleware still replaces the defaults with the live store, locale, session counts and navigation data.
- Added a regression check for middleware placement and fallback locals; kept the existing narrow multipart exception and route-level CSRF checks for product/story uploads.
- No customer-facing features were added. This candidate still requires the full test suite plus browser/database staging verification; it is not production-certified.

## 2.8.59 — 2026-10-18 — remove duplicate CSRF middleware

- Removed an obsolete second global CSRF middleware that redundantly verified most non-multipart requests and used a broad multipart bypass. The earlier global guard remains the single default check; product/story multipart forms still use route-level validation after Multer parses the form.
- Added regression assertions preventing the duplicate guard and broad multipart bypass from returning. No storefront features or manager workflows were added or made more complex.
- This cleanup does not resolve the environment's dependency-download problem: the full test suite still has four files that cannot load because `npm ci` cannot fetch packages in this network environment. Do not treat this candidate as production-certified.

## 2.8.58 — 2026-10-18 — global CSRF protection audit

- Added a global CSRF verification middleware after session/token initialization, protecting state-changing URL-encoded and JSON routes by default, including customer account/cart actions and manager/admin mutations.
- Kept multipart product/story submissions on their existing route-level CSRF check after Multer parses the form; this avoids rejecting valid uploads before the hidden token is available.
- Added regression coverage that the global guard runs before mutation routes and preserves the multipart validation path.
- This is a security hardening candidate, not a penetration-test result. Full dependency-backed integration tests and live browser/staging verification remain required.

## 2.8.57 — 2026-10-18 — repair obsolete currency regression assertion

- Corrected `test/international-commerce.test.js` so it verifies the actual safety behavior rather than requiring a specific explanatory comment string that the source no longer uses.
- The regression test now checks that products/orders/coupons lock currency changes, the saved currency is retained, the delivery fee is parsed in that effective currency, and the Settings page confirms that existing/historical amounts were not converted.
- No pricing or currency behavior was weakened to make the test pass. The 2.8.56 application behavior is retained.
- This is a QA/test-contract correction, not proof of production certification.

## 2.8.56 — 2026-10-18 — currency-locked settings save repair

- Fixed Store Settings so a currency change cannot silently reinterpret existing product, coupon or order amounts, while also no longer discarding unrelated business/policy settings just because a submitted currency differs from the locked store currency.
- When products, orders or coupons exist, the currency control is visibly locked to the saved currency. The server independently enforces the same rule and safely retains the existing currency if a crafted/stale form requests another one.
- Parses and saves the delivery fee using the effective stored currency when the currency is locked; displays a clear notice after the other settings are saved. No automatic currency conversion is performed.
- Added regression coverage for the UI lock, server guard and save-other-settings behavior. Focused settings tests pass. This release remains a QA candidate; the live database/browser save has not been verified in this authoring environment.

## 2.8.55 — 2026-10-18 — product lifecycle and manager catalog repair

- Added an explicit manager status filter for all, live and archived products, retaining the current search/category filters and pagination state.
- Added a restore action for archived products with a status-specific confirmation and result message. After archiving, the manager is taken straight to the archived filter, where Restore is immediately available. Restoring does not automatically feature a product on the homepage.
- Added guarded permanent deletion for already-archived products only when there is no order-item history and no reserved stock. Product variants are removed with the product; linked stories are detached through the database foreign key; uploaded product images are cleaned up after the database commit.
- Preserved any product that appears in historical order items. Such products can be archived and restored, but not permanently deleted, so old order lines, SKU/name snapshots and accounting traceability are protected.
- Added database-backed lifecycle tests and real HTTP tests for manager archive → archived filter → restore → archive → permanent delete. The manager inventory summary now includes variant-level reservations and disables archiving when a variant is reserved. Added Sorani/Arabic UI translations for all new lifecycle copy.
- Re-versioned active static asset cache keys and updated route/release metadata for 2.8.55.
- QA remains a candidate, not production-certified. The current report separates checks run here from live browser/database validation required on the target machine.

## 2.8.54 — 2026-10-18 — draft-save integration regression fix

- Corrected the real-HTTP manager integration test to match the documented draft-save contract: incomplete policy text can be stored while the launch checklist keeps checkout closed.
- Added an end-to-end check proving a short privacy-policy draft persists for later editing but is not rendered on the public privacy page.
- Kept required-policy completeness in the launch gate rather than forcing completed policy copy before settings can be saved.
- Re-versioned frontend asset cache keys and release metadata to 2.8.54. This release remains **not production-certified**; see `the per-release QA snapshot (not shipped); see the current QA report for current status`.

## 2.8.53 — 2026-10-17 — settings draft-save correction

- Fixed a client-side validation mismatch: store settings explicitly support draft saves, but several fields needed only for launch (including delivery countries and English policy text) still carried HTML `required`/`minlength` constraints and blocked submission before the server could save a draft.
- Draft persistence now permits incomplete launch details and partial policy text while preserving bounded lengths, email/phone syntax checks, CSRF, admin authorization, request limits and currency-change protection.
- Unfinished policy drafts are not shown on public policy pages; launch readiness still requires complete policy text, delivery coverage and an in-stock product before checkout can open.
- Live save against the target database remains environment-specific and is not claimed production-certified; see `the per-release QA snapshot (not shipped); see the current QA report for current status`.

## 2.8.52 — 2026-10-17 — multilingual settings-save audit

- Raised the bounded URL-encoded request-body limit to 2 MiB so long Privacy, Terms, Shipping and Returns fields in English, Sorani and Arabic fit after UTF-8 percent-encoding expansion. The general request limiter remains ahead of body parsing.
- Normalized trailing slashes in the final error boundary so unexpected GET/POST failures for `/admin/settings` receive the settings-specific error page rather than the generic storefront error page.
- Re-versioned static asset cache keys and corrected stale test assertions which still expected the 2.8.50 cache token.
- Added regression assertions for the form-body size bound, error-boundary path normalization and current release metadata.
- Local end-to-end database/browser verification still must be run on the target machine. This release is **not production-certified**; see `the per-release QA snapshot (not shipped); see the current QA report for current status`.

## 2.8.51 — Settings-save failure handling

- Wrapped the full settings POST flow in phase-aware error handling, including reads, currency guards, validation feedback, database writes, and settings-form recovery. Unexpected errors no longer fall straight to the generic storefront error page when the settings handler can recover.
- Preserve the submitted privacy, terms, shipping and returns text when rendering a recoverable save error; log the failure stage using the existing operational logger without exposing internal errors in customer-facing HTML.
- Extended the real HTTP manager integration scenario to cover short-policy validation plus Sorani/Arabic privacy-policy persistence.
- Added settings-route handling for errors during form normalization and settings reads, preserved bounded raw policy drafts before validation, and added a GET/POST-specific error boundary for errors thrown by middleware before the route. Local terminal output records the failing stage without showing raw exception details in customer-facing HTML.
- Added source-level regression tests for the new error boundaries. The exact original exception cannot be conclusively identified from the copied browser page alone; full HTTP/database integration must still be run on the target environment. This release is not production-certified.

## 2.8.50 — 2026-10-17 — pending orders have no automatic time limit
- Removed the reservation-hours setting and automatic pending-order expiry/cancellation. Pending orders remain pending until a manager acts; reserved stock remains held.
- Added relative order-age labels to customer and manager order views, with the exact timestamp retained in a tooltip.
- QA correction: the manager integration test now follows the actual restock redirect (`?restocked=1`) and expects the current stock-success banner, including confirmation that product identity, SKU, price and order history were preserved. Existing assertions also require current sale-price validation copy and a NULL expiry timestamp for new pending orders. These are test-only changes; production behavior was not changed.
- This release is not production-certified; see `the per-release QA snapshot (not shipped); see the current QA report for current status` for current limitations.

## 2.8.49 — 2026-10-17 — full website audit and reservation-window backend fix

- Earlier release note: a configurable stock-reservation window was introduced and later removed in 2.8.50.
- Centralized reservation-hour normalization so settings display and checkout use the same allowed choices and a safe 72-hour default.
- Added dependency-free regression tests for every offered reservation duration and the backend maximum.
- Re-versioned changed CSS/JS cache keys, package metadata, current guides, seller templates, release manifest and QA documentation.
- Repeated source, template, static, release and archive checks from a fresh extraction. Four dependency-backed integration/template tests remain blocked in the authoring environment because a clean `npm ci` could not finish; they are not counted as passes.
- This build is not declared fully end-to-end tested, security-certified, legally compliant or production-certified. A clean dependency installation, database-backed tests and browser-based staging smoke test are still required.
- Current carried-forward QA caveats and this hotfix verification scope are summarized in `the per-release QA snapshot (not shipped); see the current QA report for current status`.

## 2.8.48 — 2026-10-17 — from-zero UX, inventory and cart audit

- Rechecked the previous UX/inventory changes and added regression coverage for cart limits, coupon preservation, status-message behavior, restock isolation and category form guidance.
- Improved customer account overview, cart empty-state and order-summary hierarchy; clarified coupon errors and made removal explicit.
- Prevented invalid coupon replacement attempts from silently replacing/removing a current valid code; empty-cart state does not display a stale discount summary.
- Preserved existing over-limit cart lines for correction instead of silently dropping them; checkout remains blocked until inventory/quantity issues are fixed.
- Improved product price preview parsing for common decimal/group separators and invalid sale-price combinations.
- Added Sorani and Arabic translations for new copy and invalid-quantity feedback; bumped static-asset cache keys.
- Full clean-install/integration suite remains BLOCKED in this authoring environment because npm dependencies could not be installed. This release is not declared fully tested or production-certified.
- See `the per-release QA snapshot (not shipped); see the current QA report for current status` for executed checks and limitations.

## 2.8.47 — 2026-10-17 — checkout, pricing and inventory UX repair

- Accept currency-consistent decimal comma/dot and properly grouped amounts, including the selected currency code/symbol, without silently converting currencies.
- Make invalid sale-price validation explain that Sale price is optional and must remain below Regular price; explain the difference between sale price and automatic discount.
- Keep restocking as a stock-only action that never requires resubmitting prices, SKU, imagery or product details; improve the success notice.
- After Add to cart, return to the safe same-origin page and show a success banner with View bag and Continue shopping links.
- Clarify coupon savings and order-total labels; reject malformed legacy coupon codes before database lookup.
- Improve category field guidance, customer account layout and separate footer contact/business details.
- Earlier release note: pending-order reservation deadlines were removed in 2.8.50; pending orders no longer expire automatically.
- This earlier release was not production-certified. Its source and test status is superseded by the from-zero audit in `the per-release QA snapshot (not shipped); see the current QA report for current status`; that report does not claim the full integration suite passed.

# Changelog

## 2.8.46 — 2026-10-16 — generic configurable starter

- Replaced country/industry-specific launch defaults with a neutral store name, English default UI language, UTC time zone and configurable store currency.
- Centralized the default store name, currency, time zone and UI-locale handling in `src/store-config.js`.
- Changed date/time helper defaults to UTC while preserving explicit IANA time zones, including country-specific zones when a seller configures them.
- Renamed and neutralized the accent/theme layer; refreshed the static preview with generic retail sample content and clear example-price notice.
- Generalized category, search and postal-code helper copy and removed the test's country-specific example delivery list.
- Updated manager-dashboard smoke-test expectations to the current CSRF recovery copy, current dashboard heading, current product-form labels and current add-to-cart confirmation redirect; no security checks were disabled.
- Removed superseded version-specific QA reports from the release archive so the root documentation has one current setup and QA source.
- Kept checkout cash-on-delivery only. No payment gateways, exchange-rate conversion, local tax/courier integrations or automatic order notifications were added.

## Previous 2.8.45 baseline

The baseline included the seller-protection documentation supplement and license metadata UI. Its license remains a draft, and the manager-dashboard integration test had stale expectations for legacy copy; this release updates those expectations to the current rendered copy. Treat earlier archived QA notes as historical rather than evidence for this package.


## 2.8.88 — P0 Cloudflare PBKDF2 compatibility block (2026-10-20)

- Added a fail-closed preflight that blocks Cloudflare Worker deploy and dry-run commands while the production runtime rejects PBKDF2 operations above 100,000 iterations.
- Kept PBKDF2-SHA256 at 600,000 iterations; no password-hash weakening was introduced.
- Updated deployment guidance to use a persistent single-instance Node.js host pending actual staging validation.
- Docker now explicitly sets `RATE_LIMIT_BACKEND=memory-single-instance`; horizontal scaling remains unsupported until a shared durable limiter is implemented.
- Added focused regression tests for the deployment guard and deployment script wiring.
- Added `npm run benchmark:password-hashing` to capture password-hash correctness, latency and process CPU on the actual Node.js staging host.
- This closes the known-incompatible Cloudflare deployment path, but does not claim live staging benchmark or production certification.

## 2.8.92 candidate — V15 follow-up (2026-10-25)

- Hardened long-content wrapping for table values, order/customer identifiers and shared action labels.
- Added scroll offsets for anchor/focus targets under the shared sticky header.
- Improved mobile Manager settings save dock safe-area handling and narrow form action wrapping.
- Added regression coverage for these presentation contracts.
- Verification: focused design suite 21/21; syntax/static/template/preflight pass. Full test discovery remains blocked by seven missing-dependency module loads; browser visual QA is incomplete. This is not a production release.

### 2.8.92 — V15 Phase 6 RTL resilience (2026-10-25)
- Added an explicit Sorani/Arabic RTL alignment pass for shared page headings, navigation, forms, product cards, cart/order rows and mobile settings controls.
- Kept email, phone, URL, password and numeric entry content in a readable natural direction while aligning surrounding form labels and text to the active layout direction.
- Added a reduced-motion safeguard for hover transforms and updated the V15 stylesheet cache token in both the app header and static preview.
- Added regression tests for RTL layout contracts and cache-token consistency.
- This is an incremental UX hardening candidate; visual browser QA and full dependency-backed integration testing remain required.

## 2.8.93 — R12.2 database safety follow-up (2026-10-30)
- Hardened restore target protection to compare `RESTORE_DATABASE_URL` against the primary `DATABASE_URL` as well as the legacy Node/Turso source URL settings. This closes a gap for custom Oracle/local SQLite paths.
- Replaced the legacy Oracle `backup.sh` plaintext SQLite dump path and stale `data/shopeasy.db` reference with a wrapper around the encrypted AES-256-GCM logical backup command, including its SHA-256 sidecar and 30-day local retention.
- Updated Oracle deployment and backup/restore runbooks so the documented scheduled backup matches the encrypted application backup implementation.
- Added regression tests for the restore-source guard and encrypted Oracle backup wrapper. Full dependency-backed test suite and real restore drill remain pending; this is still a WIP, not production-certified.


## R12.3 WIP — 30 October 2026
- Hardened the Oracle deployment preflight: `deploy.sh` now requires the active Node.js major version to be exactly 24 before creating a rollback snapshot or changing application files. This prevents an unsupported runtime from proceeding into deployment.
- Added a regression test that verifies the Node.js version gate occurs before the first deployment mutation.

## R12.5 WIP — 30 October 2026
- Rechecked Mollie's published card currencies and currency transition guidance. Added RUB to the Mollie card-currency allowlist, matching Mollie's current published card-currency list and existing ISO currency support in ShopEasy.
- Explicitly kept BGN excluded: Mollie states that BGN payment creation stopped on 1 January 2026 after Bulgaria adopted EUR. The general card-currency marketing page contains a legacy BGN entry, so the provider-specific migration notice takes precedence.
- Updated payment regression tests to verify RUB formatting/acceptance and continued rejection of BGN and UAH.
- Focused payment-provider and EU payment/cookie tests: 25/25 PASS. This does not verify live Mollie merchant eligibility, credentials, payment methods, settlement, refunds or chargebacks.

## R12.7 QA checkpoint — 30 October 2026
- No runtime behavior changed in this checkpoint; it records a fresh focused QA pass across Manager/Admin authorization, session-cookie rotation, settings validation/error handling, checkout idempotency and cart safety, payment-provider validation, staff provisioning and accessibility/SEO contracts.
- Focused cross-area tests: 70/70 PASS. Separate language-preference and translation regression tests: 19/19 PASS.
- Fresh verification: EJS template audit 45/45 PASS; JavaScript/MJS syntax 180 files PASS; static audit 84 source/config files PASS (1,365 aligned EN/CKB/AR keys); release preflight PASS (2.8.93; 83 production files).
- Full `npm test` remains blocked at pretest because nine declared runtime dependencies are unavailable in this environment. Runtime is Node v22.16.0 while the package requires Node >=24 <25. No full-suite, browser, live database, Mollie transaction, or production certification is claimed.


## R12.8 WIP — Oracle database isolation hardening (30 October 2026)
- Oracle deployment now requires `CLOUDFLARE_WORKER=0` explicitly and rejects any `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, or legacy `SHOP_DATABASE_URL` entry in `.env` before taking a rollback snapshot or syncing release files.
- Deployment guide clarifies that Cloudflare/Turso remains a separate optional legacy route and is not part of the Oracle VM runtime configuration.
- Added regression assertions for Oracle-only database configuration.
- This does not remove the optional Cloudflare build/source code, change the local SQLite adapter, or certify a production deployment.

## 2.8.93 — R12.11 E2 REPAIR13 hard recheck (2026-11-04)
- Rechecked AI data sent by both the search expander and homepage shopping assistant. Added best-effort redaction for recognizable street addresses as well as email, phone and IBAN-like values; redacts those patterns in public product text too; strengthened all-locale privacy notices; retained a strict 64 KiB streamed provider-response ceiling for both AI paths.
- Homepage assistant context now explicitly contains the public effective selling price in store currency and available stock after reservations, never purchase cost or internal reserved-stock totals.
- Added a real-SQLite bank-transfer integration test file for atomic order snapshot/reservations, exact Manager reconciliation, amount/currency mismatch, duplicate bank statement references, cancellation requests and stock release. The new database integration tests are included but were not executable in this authoring environment because `@libsql/client` is unavailable.
- IBAN lengths are keyed to SWIFT IBAN Registry Release 103 (17 September 2026); Manager guidance now explicitly states that MOD-97/country length do not verify BBAN structure, account existence or ownership.
- Windows installer now checks the `PORT` configured in the preserved target `.env`, rejects an invalid port value and checks that listener before copying.
- Recheck: focused AI/bank-helper/installer tests 13/13; syntax 208/208; static audit 90 files / 1,829 aligned EN/CKB/AR/NL keys; 47 EJS templates; 89-file release preflight; Cloudflare source build pass.
- This environment is Node.js 22.16.0, the project requires Node.js 24, and `node_modules` is absent. Full `npm test`, the new database integration test, PowerShell execution, Mollie sandbox, live bank settlement and external AI-provider tests are not claimed. **QA candidate only — NO-GO for production.** See `R12.11-E2-REPAIR13-HARD-RECHECK-REPORT-2026-11-04.md`.

## 2.8.93 R12.11-E2 REPAIR13 — hard recheck follow-up (2026-11-04)

- Localized the pending bank-transfer unpaid warning in transactional plain-text email for Dutch, English, Sorani and Arabic.
- Added regression coverage for bank-transfer email instructions and HTML escaping of bank display values.
- Expanded the isolated SQLite bank-transfer integration test to cover generic-status bypass rejection and paid fulfilment stock consumption; execution remains pending on Node.js 24 with `@libsql/client` installed.
- Wider selected regression run: 75/75 passed. Syntax, static audit, EJS audit, release preflight and Cloudflare source build passed. This remains a QA candidate, not production certification.


## 2.8.93 R12.11-E2 REPAIR13 — final hard-recheck record (2026-11-04)
- Fixed a CSS reference to an undefined `--font-11` token by using the existing `--font-12` token, documented the Manager bank-transfer confirmation route, and aligned the mobile audit's cache-key expectation with the current active CSS/JS key.
- Final selected test set: 105/105 PASS. Syntax 208/208, static audit 90 files / 1,829 aligned EN/CKB/AR/NL keys, template audit 47/47, release preflight 89 production files and Cloudflare source build all pass.
- Full scan in unsupported Node 22.16.0 environment: 653 discovered, 633 passed, 20 could not import missing declared packages (`@libsql/client`, `ejs`, `jsqr`, `qrcode-generator`). No Node 24 full suite, SQLite database integration, Windows PowerShell run, live Mollie, real bank or live AI provider verification is claimed. QA only — NO-GO for production.

## 2.8.93 R12.11-E2 REPAIR13 — hardcheck2 follow-up (2026-11-04)
- Redesigned the shared Back button with localized English, Dutch, Sorani and Arabic labels, an RTL-aware chevron, keyboard focus styling and reduced-motion support.
- Limited AI assistant requests to 3 per client IP per 15 minutes and AI-assisted product search to 3 per client IP per 15 minutes. Reaching the optional AI search limit now falls back to normal SQL search instead of blocking customers from browsing the shop.
- Hardened production AI provider configuration against non-HTTPS, URL credentials, literal IP addresses, local/internal hostnames and nonstandard ports; outbound AI requests now reject redirects.
- Added focused regression tests. QA-only / NO-GO remains until the complete supported Node.js 24 test suite and payment/browser/database staging certification are completed.

- Final direct scan after the follow-up fixes: **657 tests discovered; 637 passed; 20 could not import declared dependencies absent from this offline environment** (`@libsql/client` 15, `ejs` 3, `jsqr` 1, `qrcode-generator` 1). The 28 focused Back/AI/CSS/rate-limit tests all pass. Static checks: 209 JS/MJS, 90 source/config files, 47 EJS templates and 89 release files passed. Still QA-only / NO-GO until Node.js 24 dependency-installed tests and live staging certifications pass.
