# Whole-website review — R25, 11 November 2026

This continues the delivered R24 Login/Home work and expands the source review to the customer storefront, commerce database, Manager UI, authentication/authorization, outbound integrations, SEO and packaging. The uploaded project is the source of truth. No production account or deployment was accessed.

## Changes

- Coupon minimums now use the amount after bundle savings. An unsuccessful replacement leaves an existing valid coupon in place.
- Gift-card order completion now consumes base-product and variant stock/reservations atomically, verifies its order payment reference and redemption ledger, and rolls back every item if any inventory update is unsafe. Repeating completion does not consume stock twice.
- Manual-return refunds and gift-card credits share an order-wide reimbursement ceiling. Both transaction orderings and concurrent attempts are covered. The Manager's displayed remaining refund limit includes both ledgers.
- Peppol invoice requests reject redirects and enforce a 200,000-byte streaming response limit, with cancellation and strict UTF-8 handling. MFA challenge-creation failures retain the correct diagnostic category without recording credentials or session/MFA secrets.
- Variant product pages omit unusable structured markup instead of crashing when the public base URL is unavailable. Listing canonicals/alternates use the actual bounded page. Case-insensitive private aliases such as `/LOGIN` remain noindex at HTTP and HTML levels.
- Docker context exclusions now cover secret-file variants, Git metadata, runtime databases, backups and uploads. Dependencies were not changed.
- Added curated server-rendered customer interface translations across Shop, Product, Cart, Checkout, Account, order/recovery/MFA, contact/help/policy and engagement templates. Seller-authored names, descriptions and story content remain unchanged. Policy bodies remain merchant content or explicit existing-language fallback.
- Fixed account HTML balance, password-recovery Back navigation, country-name autofill, password-change status announcement, and truthful paid-order fulfilment guidance.
- Settings Save/dirty-state controls recover after Back/Forward cache restoration. Manager financial tables are keyboard reachable. Corrected escaped attribute construction on product/image controls and labelled the order-status selector.
- Early request rejection has a safe default translator, so missing-CSRF registration requests return the intended rejection rather than a template error.

## Verification

- **1,052 automated tests passed; zero failed or skipped.** Includes existing Manager MFA/staff/customer integration and new real SQLite gift-card stock, rollback, combined-ledger refund, retry and concurrency cases.
- **136 customer-site acceptance groups**: one registration/variant checkout/owned-order flow plus 27 route cases in five languages, at 390 and 1440 pixels. Logged-in Login/Register redirects were included as their intended outcomes.
- **52 Manager groups**: 26 routes in English and Sorani, at 390 pixels.
- **20 filled Cart/Checkout groups**: five languages, with and without JavaScript, both responsive widths; checked CSRF/idempotency fields and enabled checkout. No live payment was attempted.
- **116 axe-core scenarios**, no automated WCAG violations. These are automated checks rather than a WCAG certification; they do not replace all manual assistive-technology checks.
- The browser crawl respected the existing rate limits and retried after rejection instead of weakening request protection. No production customer data, provider keys, email sends or payment transactions were used.
- Syntax, lint, core typecheck, static audit, release preflight, all 59 EJS template checks and Cloudflare source generation passed.
- Official read-only `npm audit --omit=dev`: **zero reported advisories**, refreshed on 11 November 2026.
- Security source review inventoried 137 routes, including 61 admin routes and 36 admin mutations. See `qa/full-site/security-review.md` for reviewed controls, negative findings and scope.

Evidence and reproducible browser scripts are under `qa/full-site/`. Fixture cookies and credentials remain in private temporary files and are excluded. Browser scripts require Chromium, Python Playwright, an official axe-core bundle and disposable fixture databases as described by each script.

## Deployment boundaries

This is a tested source handover, not a production deployment or a guarantee that every possible production state is defect-free. Real payment-provider onboarding, email delivery, Peppol account access, live domain/canonical configuration, merchant policies and production infrastructure require verification in the owner's configured environment. The existing Cloudflare authentication-runtime deployment guard remains in force. No legal or rights-clearance status was changed.

The QA runtime was Node 24.22.1; production should satisfy the existing package engine requirement, >=24.22.2 <25. Existing market/currency configuration was preserved. Secret files, databases, node_modules, local uploads and build caches are excluded from the ZIP. The archive has refreshed SHA-256 checksums and is checked separately for integrity and privacy.
