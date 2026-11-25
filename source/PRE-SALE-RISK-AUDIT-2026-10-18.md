# ShopEasy 2.8.70 — pre-sale risk register

**Decision: NO-GO for live customer orders pending runtime and staging verification.** This report replaces the conflicting older version-by-version snapshots; historical changes remain in `CHANGELOG.md`.

## Blockers before sale/deployment

1. Four dependency-backed tests cannot load in this authoring environment because npm registry DNS resolution fails and runtime dependencies are unavailable. These tests are blocked, not passed: manager dashboard integration, product variant integration, EJS template compilation, and upload quota integration. A clean `npm ci` plus a full test run is mandatory.
2. No live authenticated manager session, database read-after-write, real checkout, real upload, or real browser visual test was performed here. Source inspection and source-oriented tests do not stand in for those flows.
3. The included commercial license is marked draft-only and contains identity placeholders. Ownership, sublicensing, rebranding and redistribution rights remain unconfirmed.
4. This is a cash-on-delivery-only starter. Card/wallet gateway support, automated transactional emails, courier/tracking integration, tax calculation, store-specific delivery-zone fees, cookie consent and data-subject workflows are not automatically provided merely because templates or policy text exist.

## Currency and settings risk

- A Settings draft must save before any products or stock exist. Missing products, delivery countries, or launch policy content should keep checkout closed, not prevent saving the draft.
- Before order history exists, store currency can change even if products/coupons exist. Values are adjusted for currency precision only, never by foreign-exchange rates. Checkout pauses for a manual price review.
- If orders exist, currency changes are only accepted when all historical order currency snapshots already match the selected currency. Historical monetary values are never converted. Mixed-currency analytics are unsupported.
- Shipping fee is reset when currency changes because a prior-currency amount cannot safely be reused.
- Switching Standard/Simplified only changes the software launch gate. It does not remove local legal, tax, privacy or consumer-protection duties.

## Catalog and order risk

- Archive hides products while retaining their records; Restore is available for archived items. Permanent deletion is only appropriate with no order-item history and no reserved stock. The database must repeat that guard inside a transaction, not rely solely on disabled buttons.
- Historical order lines preserve their purchased option/price. Reserved stock may only be released by a valid status/cancellation transition, once.
- The delivery country UI is not a carrier integration or a local-area delivery/pricing model. The server allow-list remains authoritative; forged countries must be rejected.
- COD acceptance for legacy pending records is gated by explicit manager verification, no online payment reference, and existing reserved stock. Any mismatch should block acceptance and allow safe cancellation.

## Production release gates

1. Install dependencies cleanly and pass every test without module-load failures. Run `npm audit` and assess advisories.
2. Run the exact settings/currency/product/order/checkout/security workflows on a disposable database with valid tokens and invalid-token negative cases.
3. Test desktop and mobile in real browsers, EN/CKB/AR and RTL, using keyboard and touch; verify visual layout, accessibility targets and error recovery.
4. Test backup/restore, hosting limits, log redaction, error reporting, rate limits, upload type/size checks and real session cookie flags on staging.
5. Validate all legal text, policy wording, data-handling practices, commercial rights and licences for the precise launch market.

## External benchmark sample

This was not an exhaustive review of every webshop or private social-media post. Representative official/storefront and specialist UX references used: Zara size help <https://www.zara.com/be/nl/help-center/MySize>; Nike size guide <https://www.nike.com/be/en/help/a/size-charts> and returns <https://www.nike.com/be/help/a/retourbeleid/app>; Zalando <https://www.zalando.be/>; adidas <https://www.adidas.be/>; Albert Heijn <https://www.ah.nl/>; Baymard product-page UX <https://baymard.com/research-articles/current-state-ecommerce-product-page-ux> and checkout <https://baymard.com/research/checkout-usability>; WCAG 2.2 <https://www.w3.org/TR/wcag/>; OWASP CSRF <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>; Google merchant-listing structured data <https://developers.google.com/search/docs/appearance/structured-data/merchant-listing>.

**Status:** QA candidate only. No guarantee of zero defects or production certification is made.
