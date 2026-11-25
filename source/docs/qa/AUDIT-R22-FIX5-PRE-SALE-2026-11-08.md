# ShopEasy 2.8.93 R22 — FIX5 pre-sale technical and commercial release audit

**Date:** 8 November 2026. **Base archive:** `ShopEasy-2.8.93-R22-CHECKOUT-VARIANTS-FIX4-2026-11-07.zip`.  
**Release decision: NO-GO for commercial handoff as a ready-to-sell, 100%-tested product; NO-GO for receiving customer orders without separate live verification.**  
**What FIX5 changes:** the staging Manager certification procedure, its runbook and regression coverage. It does **not** change live storefront/payment/order code or represent a completed penetration test.

## 1. What was actually run

| Check | Measured result | What it does not establish |
|---|---|---|
| ZIP integrity | original FIX4 ZIP passed Python `zipfile.testzip()`; 1,246 entries extracted | Runtime and content rights |
| JS syntax | `npm run check`: **267 JS/MJS** source, build and test files passed after FIX5 | Module resolution or execution |
| EJS audit | **59** templates passed | Visual correctness in a browser |
| Static code and config checks | **122** files, **1,829** matching EN/CKB/AR/NL keys passed | Accurate/legal quality of every translation |
| Navigation inventory | **137** declared routes, **150** fixed links, **93** forms, **0** unresolved static paths; **32** dynamic links/forms outside scan | Actual HTTP routing, permissions, button clicks |
| Release preflight | **117** production files passed | External dependency security |
| Cloudflare build | Passed | Worker auth/MFA runtime compatibility |
| Full Node built-in test set | **878 total, 858 passed, 20 failed, 0 skipped** | 100% coverage; 20 failing tests are not green |
| Focused FIX5 MFA tests + existing configuration test | **4/4 passed** | Real network login |
| Node.js environment | **22.16.0** here; project requires **>=24.22.2 <25** | Correctly supported Node runtime |
| npm dependency availability | `npm view` returned `EAI_AGAIN`; `node_modules` missing; pretest confirms missing packages | Package install on target server |
| Real SQLite commerce audit | `NEEDS_ACTION`, exit code 1; production rows and backup/restore not tested | Validity and recoverability of user data |
| Checkout database diagnostic | Blocked: missing `@libsql/client` | COD/card/bank order creation |
| Uploaded product photo check | `NO_LOCAL_UPLOADS`; **0** files; this is NOT a production-gallery pass | Product-image gallery correctness |
| Google Ads static audit | Static route checks passed; public HTTPS, crawl/feed, checkout not tested | Merchant Center eligibility |
| Actual HTTPS staging certification | Exit code **2**: no supplied staging HTTPS URL | Real Manager MFA/login, security headers, pages |
| Third-party notices generation | Nonzero exit; **104** lockfile package entries; **95** not resolved in this offline environment; **9** optional packages missing | License compliance or infringement status |

The 20 test failures occur under the unsupported Node 22, dependency-less environment and show missing module imports (e.g. `@libsql/client`, `ejs`, `qrcode-generator`, `jsqr`). It would be incorrect to count them as passes or to attribute all twenty to application logic without running the tests in the supported runtime.

## 2. Specific issue repaired in FIX5

The older `scripts/production-certification.mjs` assumed a Manager password submission redirects directly to `/admin`. The actual ShopEasy login logic **requires a second-factor challenge** and redirects to `/mfa/verify` or `/mfa/setup`. Thus the old certification either rejected correct MFA-enforced sign-in or failed to verify the intended login flow.

**Implemented:**
- Explicitly require `/mfa/verify` after the Manager password; a direct `/admin` redirect is not accepted as proof of proper MFA.
- Stop with exit status 2 when enrolment (`/mfa/setup`) is still necessary.
- Accept a current **one-time staging** authenticator code or unused recovery code via ephemeral `STAGING_MANAGER_MFA_CODE`, read the CSRF token from the MFA screen and submit the second factor.
- Confirm that a successful verification redirects to `/admin`, and verify both authenticated Manager dashboard and Settings HTTP pages.
- Prevent the command from returning a fully successful exit when no authenticated Manager gate was run. Clearly distinguish basic route checks from production certification.
- Update `STAGING-QA-RUNBOOK.md` with safe PowerShell/shell invocation; do not store the code in `.env` or log it.
- Add 3 regression tests. All 4 targeted tests, including the previously existing config test, pass.

**Not done:** real MFA challenge submission to a live deployment. No buyer/customer passwords, secrets, accounts, `.env` or databases are included in this ZIP.

## 3. Mandatory technical exit criteria (currently incomplete)

1. Install supported **Node 24.22.2+ / <25** on an isolated staging server and run `npm ci`, `npm run audit`, `npm run licenses:generate`, `npm run diagnose:checkout` successfully. Require **all** tests to pass; investigate any new failures rather than suppressing them.
2. Configure a **separate staging `.env` and disposable SQLite database**, Manager account, MFA key and recoverable backup key. Do not copy a customer's secrets to a developer or AI environment.
3. Prove **registration → email verification → login/logout → password reset**, Manager **password → MFA → dashboard**, role segregation, CSRF and session expiration under real browser sessions.
4. Prove product creation and editing with **actual licensed photos**, no-option stock and size×colour variants, SKU uniqueness, photos and stock preservation across edits.
5. Prove COD and bank checkout and **Mollie sandbox** (where eligible) with webhooks, duplicate submission, 409 recovery, stale prices, concurrently ordered last item, cancellation, reconciliation and refunds. Never perform destructive tests against real customer orders.
6. Verify full order data integrity, receipt messages, backup **and restore**, secure storage, log retention, server patching, proxy HTTPS and rate limits.
7. Test desktop/mobile browsers, keyboard accessibility, Sorani/Arabic right-to-left layout, Dutch and English pages, broken images, performance and actual request errors.
8. Run a staged external security and dependency vulnerability review plus remediation; no network dependency audit or independent penetration test was possible here.
9. Run live `npm run certify:staging`, with an enrolled **staging** Manager, valid one-time MFA code, and then a **separate** complete storefront/payment E2E matrix. A successful base route test is not sufficient to certify sales.

## 4. Mandatory commercial/legal exit criteria (also incomplete)

### If selling ShopEasy itself to a buyer (source/software license)

`RIGHTS-CLEARANCE-REGISTER.md` explicitly says **OPEN / NOT CLEARED FOR COMMERCIAL RESALE**. `LICENSE.txt` is **DRAFT ONLY — NOT AN EFFECTIVE LICENSE**. The project lists `license: UNLICENSED` and seven SVG asset rights have no provenance established by the included metadata; font notices are bundled but overall clearance is incomplete. Before accepting a buyer's payment, document the actual rightsholder, code/assets permission and licenses, third-party notice review, customer contract/support/warranty scope, and legal identity. This is not evidence that the user lacks ownership; it is evidence that commercial authority has **not yet been proven** by the package.

### If using ShopEasy to sell physical goods to Belgian consumers

A configured real merchant must provide the correct registered identity/contact details, consumer-facing product/price/tax/fees/delivery/payment information, lawful withdrawal/returns and guarantee information, and appropriate privacy/cookie practices. The final **Order with obligation to pay** button appears in the checkout EJS template, but its legal adequacy and real runtime state have not been browser-verified. The built-in `simplified_cod` launch setting can return `true` with missing enterprise number/registered address; therefore a green software launch gate **must not** be interpreted as Belgian legal compliance.

Official guidance:
- https://economie.fgov.be/nl/e-commerce/opzet-van-je/verplicht-te-vermelden
- https://economie.fgov.be/nl/themas/verkoop/vormen-van-verkoop/verkoop-internet-e-commerce
- https://business.belgium.be/nl/4
- https://economie.fgov.be/nl/themas/verkoop/vormen-van-verkoop/verkoop-op-afstand/verkoop-op-afstand

## 5. Verdict

**NOT CERTIFIED / DO NOT MARKET AS '100% BUG-FREE' / DO NOT SIGN OFF FOR LIVE SALES.**

The static checks have meaning and FIX5 corrects the Manager staging validation defect. However it is not possible to responsibly assert 100% reliability or permission to commercialize this particular ZIP while the above technical and rights gates are still open. Even with all automated tests passing, software cannot be guaranteed to have zero undiscovered bugs; release should follow a documented risk-based acceptance process.

This audit does not modify client data, turn on live payments, or confer legal rights.
