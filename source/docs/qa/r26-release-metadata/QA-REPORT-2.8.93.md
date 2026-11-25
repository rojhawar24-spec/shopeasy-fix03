> Historical R26 evidence, preserved for comparison. NOT TESTED — this report does not establish R27 results.

> **Historical 2.8.93 QA record only:** these R9/R12 notes are superseded. For current test status see [FIX6 QA report](../AUDIT-R22-FIX6-WINDOWS-TEST-REPAIRS-2026-11-08.md).

> **Supersession note (29 October 2026):** this document records the earlier R9 QA pass and is retained for its change-specific history. The current from-scratch status is `R12.10-FROM-SCRATCH-AUDIT-2026-11-01.md`, and the current summary is `VERIFICATION-SUMMARY-2.8.93.txt`. The R12.10 candidate is still NO-GO for production.

# ShopEasy 2.8.93 R9 — Full audit and financial-accounting hardening QA report

**Release decision: NO-GO for production.** This is an audit candidate only — **NOT production-certified** and not commercially license-cleared.

Date: 29 October 2026  
Baseline: R8 payment-recovery candidate  
Package version: `2.8.93` (R9 is a candidate revision, not a certified public release)  
Active CSS cache revision: `2.8.93-r7-2026-10-28` (CSS asset source was not changed in R9; the order EJS template and backend source were changed)

## Defects found and corrected in R9

1. **Refund currency could use current store configuration.** The Manager refund action now reads and parses the entered amount using the original order's stored currency. Changing store currency after an order can no longer silently change the minor-unit interpretation of its refund.
2. **Coupon discounts were not reflected in per-item refund ceilings.** The return processor now allocates order-level coupon discount deterministically across order lines with an exact largest-remainder method. It refuses to record refunds over the net value of the requested item/quantity, the accumulated net item value, or the order total. The Manager UI displays the maximum for the current refund request after deducting previously recorded refunds against that item and order; if ledger values are malformed, the displayed ceiling fails closed to zero.
3. **A Mollie `paid` state could obscure later refunds/chargebacks.** Orders now persist provider-reported refund and chargeback totals, with forward-compatible schema migrations, exact currency/minor-unit checks in both the provider parser and DB write path, and a checked timestamp. Currency mismatches, malformed money and charged-back totals above the original order amount fail closed. Provider-reported refunds are validated as safe monetary values but are not capped at the order total, because Mollie can include additional reimbursement such as return-shipping costs.
4. **No manual refresh for a previously-paid card payment.** Added a Manager-only, CSRF-protected `POST /admin/orders/refresh-mollie-financials` route. It fetches the stored payment ID from Mollie, revalidates the payment against the exact order metadata/reference/amount/currency/mode, and refreshes the financial snapshot without changing fulfilment status or issuing any money movement.
5. **Manager visibility and audit trail.** The order page now warns on provider-reported refunds/chargebacks and distinguishes those snapshots from ShopEasy's local returns ledger. Changes are audit logged. API reference and route-inventory assertions now include the new route.

## R9 validation results

- JavaScript/MJS syntax: **PASS — 177 files**.
- Static source/config audit: **PASS — 84 files; 1,365 aligned dictionary keys across English, Sorani and Arabic**. The application still does not have a complete runtime Dutch locale.
- EJS template audit: **PASS — 45 templates**. This static/template contract check is not a full browser render.
- Release preflight: **PASS — package version `2.8.93`, 83 production files scanned**.
- Cloudflare source build: **PASS — 45 templates bundled**. This is a source build only; Cloudflare is not the requested primary Node.js + local SQLite deployment baseline and no Worker deploy/runtime certification is implied.
- Focused regression suite: **PASS — 77/77**, covering Mollie provider behavior and financial parsing, checkout idempotency/cart safety, order returns/refund limits, account security, backups, order hardening, release documentation, and release metadata.
- Final direct full-suite diagnostic: **601 tests total, 586 passed, 15 failed**. After fixing the API route-count assertion and rerunning, the remaining 15 failures are all dependency/module-load or integration-startup failures because `@libsql/client`, `ejs`, `qrcode-generator`, `jsqr`, and other declared runtime dependencies are absent. They are not passes. The standard `npm test` command correctly stops at `pretest` and lists the missing packages, so it does not run the suite or misreport success.
- Runtime here: Node.js `v22.16.0`; project requires Node.js `>=24 <25`. No clean `npm ci` or `npm audit` completed because the runtime registry connection is unavailable.
- R8 archive baseline had 408 entries. The final R9 archive contains 410 entries and passed an independent ZIP integrity/policy check; `.env.example` is included, secrets/local databases/dependencies/caches are excluded, and the exact archive SHA-256 is recorded in the accompanying verification/checksum files. The extracted R9 ZIP also passed syntax, static, template and release-preflight checks plus the 77/77 focused regression suite.

## Payment-accounting meaning and limitations

- The recorded `provider_amount_refunded_cents` and `provider_amount_charged_back_cents` are the current totals returned by the Mollie payment API, not a local transaction journal and not proof of bank settlement.
- Missing `amountRefunded` is preserved rather than blindly zeroed; absent `amountChargedBack` is normalized to zero according to the provider's conditional field semantics. A malformed field or currency mismatch aborts the refresh.
- The new action does not create/refund money and does not automatically cancel, complete or otherwise reclassify an order. Managers must compare provider snapshots with local return/refund entries and the Mollie Dashboard before fulfilment or accounting.
- Provider webhooks may be retried or delivered more than once; snapshots are idempotent and read from the provider API. Live webhook retry/refund/chargeback behavior has not been tested with an authenticated merchant sandbox here.

## External reference checks

- Mollie Get Payment API: https://docs.mollie.com/reference/get-payment — `amountRefunded` can exceed the original payment amount where return-shipping costs are reimbursed; `amountChargedBack` is returned when the charged-back total is non-zero. R9 preserves that provider-reported semantics rather than treating the refund amount as an order-value ceiling.
- Multer upstream advisory: https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m — identifies versions before 2.5.0 as affected by the October 2026 DoS issue. The project pins 2.5.0, but this does not replace a complete `npm audit`.
- Node.js 24.22.2 LTS release (28 October 2026): https://nodejs.org/en/blog/release/v24.22.2 — appropriate current patch target for this project’s `>=24 <25` engine range. The current authoring runtime is still 22.16.0.

## Remaining release blockers — do not accept real card payments

1. Clean `npm ci` under Node.js 24.x with registry access, verify the Multer tarball against lockfile integrity, then run `npm test` and `npm audit`.
2. Re-run the complete direct suite after the route-count fix and resolve all genuine failures; do not count missing-dependency failures as passes.
3. Mollie sandbox end-to-end: create/redirect; repeated and early webhooks; paid/authorized/canceled/expired/failed; refunds (partial/full), refund failures, chargebacks, webhook retries and manual financial refresh.
4. Actual browser visual, keyboard, touch and responsive QA of storefront, checkout, account, MFA, Manager/Admin and RTL/LTR layouts. Playwright Chromium navigation to both `file://` preview and a loopback HTTP preview was explicitly blocked with `ERR_BLOCKED_BY_ADMINISTRATOR`; no live browser screenshot/visual certification is claimed.
5. Runtime deployment verification for the intended single persistent Node.js 24 + local SQLite target, including persistent storage, restart/recovery, session behavior, backup restore, file uploads and rate limiter configuration. The repository still retains a Cloudflare/Turso build path; do not confuse a source build with a production deployment.
6. Finish the Dutch runtime locale (in addition to English/Sorani/Arabic), human/legal review of privacy/cookie/terms/shipping/returns/tax text, asset/font rights clearance, effective commercial license, real mail-provider delivery and a documented backup/restore drill. `LICENSE.txt` remains draft-only.

**Final decision: candidate only; NO-GO for production.** Use cash on delivery as the safe default until all applicable gates are independently closed.
