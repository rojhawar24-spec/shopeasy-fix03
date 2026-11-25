# ShopEasy 2.8.93 R22 — FIX8 independent source review

**Date:** 8 November 2026  
**Baseline:** `ShopEasy-R22-PROFESSIONAL-CLEAN-FIX7-2026-11-08.zip` (469 files, as received).  
**Decision:** FIX8 source candidate passes the checks listed below; **NOT certified for commercial deployment or resale.**

## Scope and actual evidence

Read the distributed source of the local Node/Express/SQLite webshop, including the main server, authentication and MFA guards, browser language packs, checkout and Mollie payment paths, manager settings and product templates, CSS system, release scripts, package metadata, license and compliance files. An offline control set covered: JavaScript/module syntax, static security audit, release preflight, template parsing, Cloudflare source generation and focused execution tests. This is a **source-level** review, not an exhaustive manual or penetration test. Prior Windows FIX7 log showed 954 tests total: 953 passed, zero failed, one skipped because the Windows account lacked symlink privileges; that result **predates these FIX8 changes**.

The local runtime has Node.js 22.16.0, while ShopEasy requires Node.js `>=24.22.2 <25`. The npm dependencies needed for a real local app instance are not installed here. The complete `npm test`, `npm audit`, real browser interactions against a running app, actual Mollie sandbox callbacks, real email delivery, online deployment, accessibility/contrast automation and data restore on production storage therefore **have not been demonstrated after FIX8**. A local Chromium preview attempt was blocked by the execution environment, so screenshots and interaction of the actual dynamic current site remain unverified.

## Findings by domain

| Area | Confirmed result | Remaining risk |
|---|---|---|
| Auth / customer login | Password verification, login-session rotation, logged-in account switching guards, verified-account checks and safe next-path handling are present. Relevant Windows regression tests passed for FIX7. | Re-run full end-to-end flows with a real Manager, recovery, MFA and customer. |
| Manager / MFA | Role guards restrict full management to Manager; incomplete TOTP challenge blocks unrelated routes. The language form was unintentionally blocked by the challenge and was repaired in FIX8. Global CSRF validation still applies to language POST. | Real authenticator enrollment/recovery and idle-session behavior need browser verification. |
| Security | Helmet CSP, Secure/HttpOnly/SameSite session options for production, global CSRF, rate limiters, bounded multipart uploads, image signature/dimension checks, input validation, parameterized SQLite calls and limited AI endpoint host list are present. | These measures do not prove absence of zero-days, dependency CVEs or configuration flaws. Run `npm audit`, authorized staging security tests, load tests and TLS configuration checks. |
| Checkout / payments | COD default, atomic stock/reservation logic, idempotency, payment amount/order validation and provider-controlled card checkout are represented in source and covered by prior regression tests. | No live sandbox/Mollie webhook, refund or payment-provider production test in this review. Do not enable card payments before reconciling these flows. |
| Database / uploads | Persistent file-SQLite is supported on a suitable Node host, with WAL, backups, safety guards and image/media handling. | Verify persistent disks, encrypted **off-server** backups and full restore after a simulated failure; free host persistence is not assumed. |
| UI / accessibility | Desktop and responsive CSS include 44px target sizing, `focus-visible`, RTL styles, semantic forms and many accessible labels. 59 EJS templates passed parser audit. | Source check is not a current rendered-browser accessibility, visual regression, contrast or keyboard QA certification. |
| Debugs / source | No remaining production `console.log`, `console.debug`, `console.trace`, `debugger;` or `FIXME` string was found in the scanned source/browser JS. Deliberate warning and safe diagnostic logging exists. | Real console/network failures remain unverified on deployment. Do not remove operational diagnostics. |
| 4-language translations | EN/CKB/AR/NL each provide 1,829 keys; very few values remain identical to the source English, and key structure is consistent. | Human quality review is not established by dictionary counts alone; especially RTL layouts, currency and checkout wording need native-speaker checks. |
| **French (FR)** | 1,829 source keys are mapped, but **1,665 (~91.0%) French values are identical to English** (many are untranslated; some identical literals are harmless). In FIX8, the cookie-policy page, legal-policy notices, cash/card/transfer announcement, browser title and optional AI search language were improved. | **Not fully localized.** Do not present French as a finished, professionally translated interface or use the language for legal customer deployment without reviewing the text. |
| Legal / business | Standard setup checks identity, policies and tax declaration; checkout has express payment-obligation wording. The code also allows simplified COD with much lighter checks, which is not automatically sufficient for Belgian B2C operations. | Business/consumer law, privacy, VAT, return rights, cookie disclosures and final store policies need market-specific validation. |
| Commercial resale | `LICENSE.txt` remains a draft; `package.json` is `UNLICENSED`/private; rights and asset provenance are OPEN. | **NOT CLEARED FOR COMMERCIAL RESALE.** Obtain rights clearance before selling copies, licensing, white-labelling or transferring code. |

## FIX8 code corrections and tests

1. `src/server.js`: permitted **only `/language`** during an incomplete Manager MFA challenge, so the displayed language picker can work. Full Manager routes still redirect to MFA; standard global CSRF validation is retained on `/language`.
2. `src/services/ai.js`: optional product-search expansion now forwards locale `fr` instead of silently telling the provider `en`.
3. `views/cookies.ejs`: added French explanatory text for the cookie-policy page without changing how cookies or consent work.
4. `views/policy.ejs`: added French introductory, fallback-warning and empty-state copy. This does **not** generate missing seller-provided French terms/privacy policies.
5. `views/partials/header.ejs`: translated the card/COD and bank-transfer availability announcement into French.
6. `src/server.js`: the `/cookies` route now uses the French page title when `locale=fr`.
7. Added or expanded focused executable tests: `test/fix8-mfa-language-switch.test.js`, `test/fix8-french-legal-copy.test.js`, `test/ai-search-expansion.test.js`.
8. Regenerated `generated/cloudflare-views.js` using the existing source generation script so the bundled templates match local EJS changes; no new Cloudflare deployment is implied.

## Regulatory checks, not a legal certificate

- Belgian FOD Economie: consumer webshops are subject to distance-selling information and payment-obligation requirements: <https://economie.fgov.be/nl/themas/verkoop/vormen-van-verkoop/verkoop-internet-e-commerce>.
- Belgian government: consumers generally have a 14-day withdrawal right for goods sold at a distance, with statutory exceptions: <https://business.belgium.be/15>.
- Belgian mandatory structured B2B e-invoicing applies to transactions within scope starting **1 January 2026**. A PDF is not a substitute; the obligation is B2B, not a general B2C mandate. ShopEasy's optional Recommand integration is **not** evidence of production approval or successful e-invoicing: <https://efactuur.belgium.be/nl/FAQ/algemene-vragen-b2b>.
- For any store using third-party product images or AI features, check personal-data disclosures and any cross-border data handling; this code review cannot establish GDPR compliance by itself.

## Required steps before customer sale

1. On Windows Node `>=24.22.2 <25`, extract FIX8 into a **new folder**; run `npm run verify:package` before installing packages. Then `npm ci`, `npm run check`, `npm run audit:static`, `npm test`, `npm audit --omit=dev --audit-level=high` and `npm run audit`.
2. Use a **disposable** staging database (not real customers) and test guest/customer registration, login/logout, Manager MFA/recovery, language changes at MFA, checkout, order cancellation/returns, image upload and failed requests in a browser.
3. Validate HTTPS, hosted-domain configuration, production Secure cookies, persistent SQLite and media, real backup **restore**, offline backup retention, simultaneous orders and monitoring after restart.
4. For Belgium, review full business identity and consumer policy disclosure and ensure B2B invoice obligations are met where relevant. Do not treat simplified COD as a legal exemption.
5. Finish the French dictionary by verified translation or disable French in Manager locale selection until ready; native-speaker review all customer-facing languages.
6. Resolve asset provenance, rights register, third-party notices and buyer licensing agreements before selling ShopEasy as software.

**Release decision:** these narrowly scoped fixes improve the candidate. **No claim of zero errors, 100% security, full French translation, 24/7 hosting, live payment readiness, legal compliance or commercial redistribution rights is made.**
