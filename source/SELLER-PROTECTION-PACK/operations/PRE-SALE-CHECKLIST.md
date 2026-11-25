# Seller pre-sale / pre-release checklist

## Ownership and rights
- [ ] Identify the actual rights holder and collect evidence of authorship/assignment; record it in `RIGHTS-CLEARANCE-REGISTER.md`.
- [ ] Review `THIRD-PARTY-NOTICES.md` and `ASSET-PROVENANCE-REGISTER.md`; resolve every unverified item.
- [ ] After `npm ci`, run `npm run licenses:generate` and review `THIRD-PARTY-NOTICES.generated.txt`; resolve every required missing license/NOTICE and check each shipped target platform.
- [ ] Do not say “all code/design/logo belongs to seller” until evidence supports it.
- [ ] Replace all placeholders only after authority verification and legal review. Do not remove draft-only warnings or change `UNLICENSED` metadata until an authorized rights holder approves the final terms.
- [ ] Have a qualified lawyer review the license, purchase agreement, liability and governing-law clause for seller/customer jurisdictions.

## Commercial transaction
- [ ] Confirm buyer identity, business/consumer status, exact deliverables and acceptance criteria.
- [ ] Quote price and tax/VAT treatment, deposit/balance dates, refund/cancellation rights and secure delivery.
- [ ] Confirm support scope and 30-day start event in writing; do not imply 24/7 or phone support.
- [ ] Compute SHA-256 from the exact delivered ZIP and store it with the signed documents.
- [ ] Send only the intended files; never send `.env`, secrets, test customer data or local database.

## Technical
- [ ] Install dependencies cleanly with supported Node version; preserve lockfile.
- [ ] Run `npm ci`, `npm run build:cloudflare`, `npm run preflight:release`, `npm run check`, `npm test`, `npm run audit:static`, and `node scripts/template-audit.mjs`.
- [ ] Ensure no test suite is failed or blocked; report exact results.
- [ ] Test login/signup/password reset, session/cookie/CSRF, admin authorization, products, inventory, coupons, checkout, order confirmation and emails in a browser.
- [ ] Test RTL and mobile layouts in supported browsers; keyboard/accessibility check.
- [ ] Deploy to isolated staging with test database and provider sandbox; test backup/restore, rollback and monitoring.
- [ ] Run a security review/penetration test and fix high/critical findings before production.
- [ ] Set unique production secrets, HTTPS, least-privilege accounts, database backup and recovery plan.

## Privacy and legal
- [ ] Map data collected and all processors/subprocessors and countries.
- [ ] Decide lawful basis, retention, rights-request workflow and breach response.
- [ ] Do not load non-essential analytics/marketing before consent where required.
- [ ] Add real export/delete/correct/opt-out mechanisms if promised; test each.
- [ ] Confirm tax, invoices, product safety, consumer withdrawal/returns, delivery and import rules for each country served.
- [ ] Do not label GDPR/CCPA compliance unless reviewed and evidenced.

## Release
- [ ] ZIP contains no `.env`, credentials, local database, `node_modules`, `.cloudflare-build`, caches, logs or debug artifacts.
- [ ] README, package version, lockfile, license status and changelog match.
- [ ] Record all passed, failed, skipped and blocked tests without rounding blocked tests into passes.
- [ ] Keep customer evidence private and access-limited.
