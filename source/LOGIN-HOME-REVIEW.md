# Login and Home review — updated 10 November 2026

Source: `ShopEasy-R22-FIX11-BELGIUM-FRENCH-QA-2026-11-08.zip`.
Scope: Login and Home, plus the shared header/footer assets needed to render them correctly. Existing currency, supported languages, store branding, catalogue selection, checkout and authentication policy are retained.

## Changes

- Login labels, headings, placeholders, notices and available error translations now render on the server for English, Dutch, French, Arabic and Sorani. Core account-access copy remains available when JavaScript is disabled.
- Added an explicitly labelled Show/Hide password button with pressed state, keyboard support and a hidden fallback when JavaScript is disabled. Password visibility resets when leaving the page.
- Sign-in errors receive keyboard focus. Submitted passwords are never repopulated. Email fields disable automatic capitalization and spelling correction; the sign-in field supports username autofill.
- Kept checkout/account return destinations across sign-in, account creation and recovery links. Added a direct route back to shopping.
- Replaced merchant setup instructions in the Home hero with customer copy. An empty store has a visible collection notice and contact link. A populated store without an eligible hero photograph has discovery copy rather than a misleading “coming soon” message.
- Home fallback UI and information copy use server translations where available; product names and seller-authored hero branding remain seller content.
- Corrected literal `&amp;` text in footer links and an unreadable white-on-white language badge. Improved narrow-screen footer columns and link targets, and allowed product category/stock labels to wrap onto separate lines.
- Updated the CSS cache version and synchronized existing preview references. Rebuilt the Cloudflare template bundle. Updated existing source assertions to cover translated alerts and the new password handler.

## Verification

- Full Node suite: see `qa/automated-test-summary.txt` for the final result.
- Syntax, lint hygiene, core TypeScript checks, static security audit, release preflight, template compilation and Cloudflare source build passed.
- Chromium: Home and Login at 320, 390, 768 and 1440 pixels in five languages; no horizontal document overflow or browser JavaScript errors in those checks.
- Verified RTL document direction, one H1, Login noindex, Home canonical metadata with an explicitly configured QA base URL, and active Login navigation state.
- Verified translated Login headings without JavaScript and progressive enhancement of the password toggle.
- Verified generic failed-login response, error focus, cleared/masked password, preserved checkout destination, rejection of a missing CSRF token, and escaped HTML in the email query parameter.
- Verified customer registration, logout and successful sign-in with a preserved local return URL using disposable local QA data.
- Verified Home with an empty database and a separate fixture catalogue: eight featured products, four new arrivals, one category, an unavailable item, and four viewport widths. Dark-theme Login was also inspected.
- Existing automated integration tests cover Manager MFA and session/authentication behaviour. No production credentials were used.

Screenshots and machine-readable browser results are in `qa/`. Browser checks require Python Playwright and Chromium; the populated-store script requires the isolated local fixture database described in its source. Screenshots containing “QA product” are test fixtures, not additions to your store.


## Second pass — R24, 10 November 2026

- Added missing server translations for Home actions, headings, hero captions and accessible labels. Corrected French/Dutch policy wording that incorrectly suggested deleting policies.
- Populated product cards now translate actions, availability, option counts and accessible names before browser JavaScript runs. Seller names, descriptions and category labels are protected from browser interface translation. Placeholder substitution is single-pass, own-property checked, and escaped by EJS.
- A Login submission with a stale nonempty CSRF token is rejected before authentication and redirected to a fresh form. Only a bounded email and a safe local return path are retained; passwords and persistent-login choices are never replayed. Missing/malformed tokens remain HTTP 403. Recovery guidance is localized and receives keyboard focus.
- Corrected literal escaped punctuation in the no-JavaScript Login view. Added semantic group roles to labelled Home sections, price/badge groups and consent actions. Category captions use an opaque dark backing so their contrast does not depend on the photograph.
- Final verification: **1,016 automated tests passed**, 18 expanded browser acceptance groups passed, and 12 axe scenarios reported no automated violations. The expanded browser review covers stale Login recovery in five languages, populated Home without JavaScript in four translated languages, preservation of seller text that resembles interface labels, keyboard focus after closing mobile navigation/search, consent-visible pages, and photo-based Home layouts in light/dark mode.
- Axe-core 4.11.0 reports no automated WCAG violations in the tested scenarios. Its incomplete checks are retained in `qa/second-pass/axe-results.json`; decorative symbols and image/background-dependent checks require interpretation. This is not a claim of WCAG certification. For audit injection only, the test browser bypassed CSP; the application retains its strict CSP.
- See `qa/second-pass/acceptance-results.json`, screenshots, and `qa/automated-test-summary.txt` for final results. Temporary fixture databases and the axe dependency are excluded from the handover.

## Deployment requirements and limits

This is an updated source archive, not a production deployment or a claim of perfection. The live domain, production database, traffic, email delivery and real customer sessions were not available for inspection.

Configure the real HTTPS `BASE_URL` to enable production canonical and alternate-language URLs. The isolated QA store used `https://shop.example.test` only through a process environment variable; that value is not shipped as store configuration. Existing Belgian locale/currency defaults were preserved because the archive does not establish a replacement UK market configuration.

Live password-reset and verification email delivery require the existing email-provider configuration and reset secret. Real Manager access requires a configured Manager account and MFA encryption key. These deployment-dependent paths must be checked on your environment. No secrets, customer database, uploads, node_modules or generated build cache are included in the delivery.

Browser results are functional and visual checks, not an external penetration test, a full WCAG certification, or a measured production Core Web Vitals report. Run with the Node version required by package.json in deployment; this environment used Node 24.22.1 while the archive declares >=24.22.2 <25.
